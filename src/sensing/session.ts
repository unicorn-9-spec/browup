// The face session: one place that turns either the live SDK or a replay
// into feature frames, keeps a short history for capture windows, and tells
// listeners what is happening. Non-reactive (plain class); the Pinia store
// mirrors the bits the UI needs.

import { EXPRESSIONS } from '../../config/thresholds';
import { FeatureExtractor } from '../face/features';
import type { FacePoints, FeatureFrame, Profile, Us } from '../types';
import { feed } from './pipeline';
import { Recorder } from './record';
import { eventsIn, ReplayCursor, type ParsedRecording } from './replay';
import { DEFAULT_CAPTURE, LOW_CAPTURE, SenseClient, type CaptureSettings, type ProbeFrame } from './sdk';
import { EC } from './codes';
import type { ReplayClip, SenseEvent } from './types';

export type SessionMode = 'off' | 'live' | 'replay';

export interface SessionListener {
  frame?(f: FeatureFrame, points: FacePoints | null): void;
  validation?(code: number, hint: string): void;
  error?(code: number, message: string, retryable: boolean): void;
  event?(e: SenseEvent): void;
}

const HISTORY_US = 20e6;
export const nowUs = (): Us => Date.now() * 1000;

export class FaceSession {
  mode: SessionMode = 'off';
  readonly extractor = new FeatureExtractor(null);
  private client: SenseClient | null = null;
  private history: FeatureFrame[] = [];
  private listeners = new Set<SessionListener>();
  private lastPoints: FacePoints | null = null;
  private lowCapture = false;
  // Replay
  private rec: ParsedRecording | null = null;
  private cursor: ReplayCursor | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private idleCursor: ReplayCursor | null = null;
  // Optional numbers-only recorder (opt-in) and probe log.
  recorder: Recorder | null = null;
  probeSink: ((e: SenseEvent) => void) | null = null;

  on(l: SessionListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  setProfile(p: Profile | null): void {
    this.extractor.setProfile(p);
  }

  get stream(): MediaStream | null {
    return this.client?.mediaStream ?? null;
  }

  get frameSize(): { w: number; h: number } {
    if (this.mode === 'replay' && this.rec) return this.rec.header.frameSize;
    return this.client?.frameSize ?? { w: 1280, h: 720 };
  }

  /** Camera label and delivered settings (probe diagnostics). */
  get cameraInfo(): { label: string; width?: number; height?: number; frameRate?: number } | null {
    const t = this.client?.mediaStream?.getVideoTracks()[0];
    if (!t) return null;
    const s = t.getSettings();
    return { label: t.label, width: s.width, height: s.height, frameRate: s.frameRate };
  }

  get points(): FacePoints | null {
    return this.lastPoints;
  }

  get recording(): ParsedRecording | null {
    return this.rec;
  }

  private handle = (e: SenseEvent): void => {
    this.recorder?.push(e);
    this.probeSink?.(e);
    for (const l of this.listeners) l.event?.(e);
    if (e.kind === 'validation') {
      feed(this.extractor, e);
      for (const l of this.listeners) l.validation?.(e.code, e.hint);
      return;
    }
    if (e.kind === 'error') {
      if (e.code === EC.kSustainedLowFrameRate) this.lowCapture = true;
      for (const l of this.listeners) l.error?.(e.code, e.message, e.retryable);
      return;
    }
    const f = feed(this.extractor, e);
    if (!f) return;
    if (e.kind === 'face') this.lastPoints = e.sample.points;
    this.history.push(f);
    const cut = f.t - HISTORY_US;
    while (this.history.length && this.history[0]!.t < cut) this.history.shift();
    for (const l of this.listeners) l.frame?.(f, this.lastPoints);
  };

  /** Starts the live SDK session (camera on). */
  async startLive(cameraId: string | undefined, probe?: (f: ProbeFrame) => void): Promise<void> {
    if (this.mode === 'replay') this.stopReplay();
    if (this.client?.running) return;
    this.mode = 'live';
    this.client ??= new SenseClient(this.handle);
    this.client.keepAllLandmarks = !!probe;
    this.client.onProbeFrame = probe ?? null;
    const c: CaptureSettings = { ...(this.lowCapture ? LOW_CAPTURE : DEFAULT_CAPTURE), ...(cameraId ? { deviceId: cameraId } : {}) };
    this.extractor.pushValidation(0, nowUs());
    try {
      await this.client.start(c, EXPRESSIONS.MODE);
    } catch (err) {
      this.mode = 'off';
      throw err;
    }
  }

  /** Camera preview only (Setup framing) — no SDK, no measurement. */
  async preview(cameraId: string | undefined): Promise<MediaStream> {
    this.client ??= new SenseClient(this.handle);
    return this.client.openPreview({ ...DEFAULT_CAPTURE, ...(cameraId ? { deviceId: cameraId } : {}) });
  }

  closePreview(): void {
    this.client?.closePreview();
  }

  // ── Replay ────────────────────────────────────────────────────────────
  loadReplay(rec: ParsedRecording): void {
    this.stop();
    this.rec = rec;
    this.mode = 'replay';
    this.extractor.setProfile(rec.header.profile);
    this.history = [];
    this.startIdle();
    this.timer = setInterval(() => this.tick(), 15);
  }

  private startIdle(): void {
    const rec = this.rec;
    if (!rec?.header.idle) { this.idleCursor = null; return; }
    const { startUs, endUs } = rec.header.idle;
    this.idleCursor = new ReplayCursor(eventsIn(rec, startUs, endUs), startUs, nowUs());
  }

  private tick(): void {
    const now = nowUs();
    if (this.cursor) {
      for (const e of this.cursor.due(now)) this.handle(e);
      if (this.cursor.done) { this.cursor = null; this.startIdle(); }
      return;
    }
    if (this.idleCursor) {
      for (const e of this.idleCursor.due(now)) this.handle(e);
      if (this.idleCursor.done) this.startIdle();
    }
  }

  /** Plays a clip so that its capture window starts at `goAtUs`. Returns the
   *  window in the live time base. */
  playClip(clip: ReplayClip, goAtUs: Us): { startUs: Us; endUs: Us } {
    if (!this.rec) throw new Error('no replay loaded');
    this.idleCursor = null;
    const at = goAtUs - (clip.windowStartUs - clip.startUs);
    this.cursor = new ReplayCursor(eventsIn(this.rec, clip.startUs, clip.endUs), clip.startUs, at);
    // Fresh time base, smoothing and validation state for the clip.
    this.extractor.resetClock();
    this.history = [];
    return { startUs: this.cursor.map(clip.windowStartUs), endUs: this.cursor.map(clip.windowEndUs) };
  }

  stopReplay(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.cursor = null;
    this.idleCursor = null;
    this.rec = null;
    if (this.mode === 'replay') this.mode = 'off';
  }

  /** Frames whose capture time falls in [startUs, endUs). */
  framesBetween(startUs: Us, endUs: Us): FeatureFrame[] {
    return this.history.filter((f) => f.t >= startUs - 100_000 && f.t < endUs + 100_000);
  }

  /** Stops everything: camera tracks first (light off at once), then SDK. */
  async stop(): Promise<void> {
    this.lastPoints = null;
    if (this.mode === 'replay') {
      this.stopReplay();
      return;
    }
    this.mode = 'off';
    this.history = [];
    await this.client?.stop();
  }
}

export const faceSession = new FaceSession();
