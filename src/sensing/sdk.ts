// ═══════════════════════════════════════════════════════════════════════
//  SmartSpectra integration — the one file that talks to the SDK.
//
//  Verified against @smartspectra/node-sdk 3.5.0 typings (js/renderer/
//  index.d.ts, js/index.d.ts, js/messages/generated.d.ts); differences from
//  the plan are recorded in docs/SDK-NOTES.md. Adapted from the sibling
//  project Upbeat (src/sense/sdk.ts).
//
//  • Renderer helper: SmartSpectraSDK from '@smartspectra/node-sdk/renderer'
//    with ONE host-owned MediaStream from getUserMedia (1280×720 / 30 fps,
//    video only), shared by the SDK (useMediaStream) and the mirror <video>.
//  • requestedMetrics = FACE_LANDMARKS (11) + BLINKING (12), plus
//    EXPRESSIONS (14) while the Stage 1 agreement test is pending or if it
//    passed (config EXPRESSIONS.MODE).
//  • enableTelemetry: false. requestInsight is never called. No audio.
//  • Shutdown: stop our camera tracks (camera light off at once), then
//    `await sdk.stop()` (raced against 900 ms), then `sdk.destroy()`. The
//    renderer class has no stopAsync(); the main process runs it for us.
// ═══════════════════════════════════════════════════════════════════════

import { SmartSpectraSDK, MetricType } from '@smartspectra/node-sdk/renderer';
import type { RendererSmartSpectraOptions } from '@smartspectra/node-sdk/renderer';
import { decodeMetrics } from '@smartspectra/node-sdk/messages';
import { EXPRESSIONS } from '../../config/thresholds';
import { decodeMetricsLike, type MetricsLike } from './decode';
import type { SenseEvent } from './types';
import type { Point } from '../types';

export function requestedMetrics(exprMode: 'pending' | 'on' | 'off' = EXPRESSIONS.MODE): number[] {
  const m: number[] = [MetricType.FACE_LANDMARKS, MetricType.BLINKING];
  if (exprMode !== 'off') m.push(MetricType.EXPRESSIONS);
  return m;
}

/** Constructor options, built in one place so a unit test can assert them. */
export function sdkOptions(apiKey: string, exprMode: 'pending' | 'on' | 'off' = EXPRESSIONS.MODE): RendererSmartSpectraOptions {
  return {
    apiKey,
    requestedMetrics: requestedMetrics(exprMode),
    enableTelemetry: false,
    enableAccumulatedOutput: false,
    // logLevel stays at its default (kWarning): SmartSpectraLogLevel exists
    // at runtime but is not declared by the renderer typings (SDK-NOTES).
    sendTimeoutMs: 15_000,
  };
}

export interface CaptureSettings {
  deviceId?: string;
  width: number;
  height: number;
  fps: number;
}

export const DEFAULT_CAPTURE: CaptureSettings = { width: 1280, height: 720, fps: 30 };
/** Fallback after kSustainedLowFrameRate (as Upbeat). */
export const LOW_CAPTURE: CaptureSettings = { width: 960, height: 540, fps: 30 };

/** Virtual / screen-capture cameras that never show the learner's face. */
export function isVirtualCamera(label: string): boolean {
  return /virtual|obs|transcreen|manycam|xsplit|snap camera|nvidia broadcast|screen|camo/i.test(label);
}

export class NoKeyError extends Error {
  constructor() {
    super('No SmartSpectra API key');
  }
}

export interface ProbeFrame {
  readonly all: Point[];
  readonly count: number;
}

export class SenseClient {
  private sdk: SmartSpectraSDK | null = null;
  private stream: MediaStream | null = null;
  private frameW = 1280;
  private frameH = 720;
  private stopping: Promise<void> | null = null;
  /** Stage 1 probe: keep the full newest landmark set for the index view. */
  keepAllLandmarks = false;
  onProbeFrame: ((f: ProbeFrame) => void) | null = null;

  constructor(private readonly emit: (e: SenseEvent) => void) {}

  get running(): boolean {
    return this.sdk !== null;
  }

  get mediaStream(): MediaStream | null {
    return this.stream;
  }

  get frameSize(): { w: number; h: number } {
    return { w: this.frameW, h: this.frameH };
  }

  static async cameras(): Promise<MediaDeviceInfo[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'videoinput');
  }

  /** Opens the camera only (Setup framing preview), no SDK. */
  async openPreview(c: CaptureSettings): Promise<MediaStream> {
    if (this.stream) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(c.deviceId ? { deviceId: { exact: c.deviceId } } : {}),
        // Cap size and rate: every frame is copied to SmartSpectra, so an
        // oversized stream starves it below 25 fps (Upbeat's finding).
        width: { ideal: c.width, max: c.width },
        height: { ideal: c.height, max: c.height },
        frameRate: { ideal: c.fps, max: c.fps },
        resizeMode: 'crop-and-scale',
      } as MediaTrackConstraints,
    });
    // No camera chosen and the system default is a virtual camera (seen on
    // this laptop: "TranScreen Camera", which shows no face): switch to the
    // first physical camera. Labels are readable now that access is granted.
    if (!c.deviceId && isVirtualCamera(this.stream.getVideoTracks()[0]?.label ?? '')) {
      const real = (await SenseClient.cameras()).find((d) => d.label && !isVirtualCamera(d.label));
      if (real) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
        return this.openPreview({ ...c, deviceId: real.deviceId });
      }
    }
    const track = this.stream.getVideoTracks()[0];
    const got = track?.getSettings();
    if (track && got && ((got.width ?? 0) > c.width || (got.frameRate ?? 0) > c.fps + 1)) {
      try {
        await track.applyConstraints({ width: c.width, height: c.height, frameRate: c.fps, resizeMode: 'crop-and-scale' } as MediaTrackConstraints);
      } catch { /* keep what the camera gives */ }
    }
    const s = this.stream.getVideoTracks()[0]?.getSettings();
    this.frameW = s?.width ?? c.width;
    this.frameH = s?.height ?? c.height;
    return this.stream;
  }

  async start(c: CaptureSettings, exprMode: 'pending' | 'on' | 'off' = EXPRESSIONS.MODE): Promise<MediaStream> {
    if (this.stopping) await this.stopping;
    if (this.sdk) return this.stream!;
    const bridge = window.browup;
    if (!bridge) throw new Error('App bridge unavailable');
    // The key lives in this scope only for the constructor call.
    let key: string | null = await bridge.key.forSdk();
    if (!key) throw new NoKeyError();
    const stream = await this.openPreview(c);
    const sdk = new SmartSpectraSDK(sdkOptions(key, exprMode));
    key = null;

    sdk.on('metrics', (buf) => {
      const recvUs = Date.now() * 1000;
      const d = decodeMetricsLike(decodeMetrics(buf) as unknown as MetricsLike, {
        frameW: this.frameW, frameH: this.frameH, keepAll: this.keepAllLandmarks,
      });
      // Order inside a packet: blink and expression first, so the landmark
      // frame with the same timestamp can see them.
      for (const s of d.blinks) this.emit({ kind: 'blink', recvUs, sample: s });
      for (const s of d.exprs) this.emit({ kind: 'expr', recvUs, sample: s });
      for (const s of d.faces) this.emit({ kind: 'face', recvUs, sample: s });
      if (d.allLandmarks && this.onProbeFrame) this.onProbeFrame({ all: d.allLandmarks, count: d.landmarkCount });
    });
    sdk.on('validationStatus', (code, tsUs, hint) => {
      this.emit({ kind: 'validation', recvUs: Date.now() * 1000, tsUs: Number(tsUs), code, hint });
    });
    sdk.on('error', (code, message, retryable) => {
      this.emit({ kind: 'error', recvUs: Date.now() * 1000, code, message, retryable });
    });
    sdk.on('processingStatus', (status) => {
      this.emit({ kind: 'status', recvUs: Date.now() * 1000, status });
    });
    sdk.useMediaStream(stream);
    this.sdk = sdk;
    try {
      await sdk.start();
    } catch (err) {
      await this.stop();
      throw err;
    }
    return stream;
  }

  /** Camera off immediately; SDK stopped and destroyed within ~1 s. */
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const sdk = this.sdk;
    const stream = this.stream;
    this.sdk = null;
    this.stream = null;
    stream?.getTracks().forEach((t) => t.stop());
    if (!sdk) return Promise.resolve();
    this.stopping = (async () => {
      try {
        await Promise.race([sdk.stop(), new Promise((r) => setTimeout(r, 900))]);
      } catch {
        /* stopping a failed session can reject; destroy regardless */
      } finally {
        sdk.destroy();
        this.stopping = null;
      }
    })();
    return this.stopping;
  }

  /** Stops only the preview stream (leaving Setup framing). */
  closePreview(): void {
    if (this.sdk) return;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
