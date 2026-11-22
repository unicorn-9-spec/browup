// Feature pipeline: landmark sets + blink flags + validation codes →
// FeatureFrames. Pure TypeScript (no DOM), used live, in replay, in tests
// and by the probe analyser.
//
// Validity (PLAN §2, AGENT_PROMPT §6): a frame is invalid if landmarks are
// missing, `reset` is set, validation is not OK (see codeEffect), or a blink
// is detected within ±2 frames — eyelids move during blinks and the mesh
// drags the brows with them, which would fake a brow movement.

import { COVERAGE, FEATURES, VALIDITY } from '../../config/thresholds';
import { codeEffect, VC } from '../sensing/codes';
import type { BlinkSample, ExpressionSample, FaceSample, FeatureFrame, InvalidReason, Profile, RawFeatures, Us } from '../types';
import { rawFeatures } from './geometry';
import { pitchDeg, yawDeg } from './headPose';
import { median, RunningMedian } from './stats';

type Baseline = Profile['baseline'];

/** Tracks the current validation code with the multiple-faces debounce. */
export class ValidationTracker {
  private code: number = VC.kOk;
  private since: Us = -Infinity;

  push(code: number, t: Us): void {
    if (code !== this.code) {
      this.code = code;
      this.since = t;
    }
  }

  /** The code in effect at time t (debounced). */
  at(t: Us): number {
    if (this.code === VC.kMultipleFacesFound && t - this.since < VALIDITY.MULTI_FACE_DEBOUNCE_MS * 1000) return VC.kOk;
    return this.code;
  }

  get current(): number {
    return this.code;
  }

  reset(): void {
    this.code = VC.kOk;
    this.since = -Infinity;
  }
}

export class FeatureExtractor {
  private baseline: Baseline | null;
  private readonly validation = new ValidationTracker();
  private blinks: BlinkSample[] = [];
  private exprs: ExpressionSample[] = [];
  private readonly mBrow = new RunningMedian(FEATURES.MEDIAN_FRAMES);
  private readonly mInner = new RunningMedian(FEATURES.MEDIAN_FRAMES);
  private readonly mYaw = new RunningMedian(FEATURES.MEDIAN_FRAMES);
  private readonly mPitch = new RunningMedian(FEATURES.MEDIAN_FRAMES);
  /** Recent raw values for the provisional baseline (before calibration). */
  private readonly recent: RawFeatures[] = [];
  private lastT: Us = -Infinity;
  /** Frames since the last blink (live, causal half of the ±2 mask). */
  private sinceBlink = Infinity;

  constructor(profile: Profile | null = null) {
    this.baseline = profile?.baseline ?? null;
  }

  setProfile(p: Profile | null): void {
    this.baseline = p?.baseline ?? null;
    this.resetSmoothing();
  }

  get calibrated(): boolean {
    return this.baseline !== null;
  }

  pushValidation(code: number, t: Us): void {
    this.validation.push(code, t);
  }

  get validationCode(): number {
    return this.validation.current;
  }

  pushBlink(b: BlinkSample): void {
    this.blinks.push(b);
    if (this.blinks.length > 64) this.blinks.splice(0, this.blinks.length - 64);
  }

  pushExpression(e: ExpressionSample): void {
    this.exprs.push(e);
    if (this.exprs.length > 64) this.exprs.splice(0, this.exprs.length - 64);
  }

  private resetSmoothing(): void {
    this.mBrow.reset();
    this.mInner.reset();
    this.mYaw.reset();
    this.mPitch.reset();
  }

  private blinkAt(t: Us): boolean {
    const w = VALIDITY.BLINK_MATCH_MS * 1000;
    return this.blinks.some((b) => b.detected && Math.abs(b.t - t) <= w);
  }

  private exprAt(t: Us): ExpressionSample | null {
    let best: ExpressionSample | null = null;
    let bd = 60_000;
    for (const e of this.exprs) {
      const d = Math.abs(e.t - t);
      if (d <= bd) { bd = d; best = e; }
    }
    return best;
  }

  /** The baseline in use: calibrated, else a provisional median of the last
   *  few seconds (so the Setup mirror can still show movement). */
  private base(): Baseline | null {
    if (this.baseline) return this.baseline;
    if (this.recent.length < 10) return null;
    return {
      brow: median(this.recent.map((r) => r.brow))!,
      inner: median(this.recent.map((r) => r.inner))!,
      aperture: median(this.recent.map((r) => r.aperture))!,
      yawRatio: median(this.recent.map((r) => r.yawRatio))!,
      pitchRatio: median(this.recent.map((r) => r.pitchRatio))!,
    };
  }

  /** Forget the time base (replay jumps to a new clip). */
  resetClock(): void {
    this.lastT = -Infinity;
    this.sinceBlink = Infinity;
    this.validation.reset();
    this.resetSmoothing();
  }

  /** A moment with no landmarks (face lost / camera covered). */
  missing(t: Us, reason: InvalidReason = 'noFace'): FeatureFrame {
    this.resetSmoothing();
    return invalidFrame(t, reason);
  }

  push(s: FaceSample): FeatureFrame {
    if (s.t <= this.lastT) return invalidFrame(s.t, 'reset');
    const gap = s.t - this.lastT > VALIDITY.LANDMARK_STALE_MS * 1000;
    this.lastT = s.t;
    if (s.reset || gap) this.resetSmoothing();

    const raw = rawFeatures(s.points);
    if (!raw) return invalidFrame(s.t, 'noFace');
    if (!this.baseline) {
      this.recent.push(raw);
      if (this.recent.length > 150) this.recent.shift();
    }

    const b = this.base();
    const effect = codeEffect(this.validation.at(s.t));
    const apertureRef = b?.aperture ?? raw.aperture;
    const lidClosed = apertureRef > 0 && raw.aperture < apertureRef * VALIDITY.BLINK_APERTURE_FRACTION;
    const blink = this.blinkAt(s.t) || lidClosed;
    this.sinceBlink = blink ? 0 : this.sinceBlink + 1;
    const nearBlink = this.sinceBlink <= VALIDITY.BLINK_MASK_FRAMES;

    let invalid: InvalidReason | null = s.reset ? 'reset' : effect.reason;
    if (!invalid && nearBlink) invalid = 'blink';

    const browRel0 = b ? (raw.brow - b.brow) / Math.abs(b.brow) : 0;
    const innerRel0 = b ? (raw.inner - b.inner) / b.inner : 0;
    const yaw0 = b ? yawDeg(raw.yawRatio, b.yawRatio) : 0;
    const pitch0 = b ? pitchDeg(raw.pitchRatio, b.pitchRatio) : 0;

    const validBrow = !s.reset && effect.brow && !nearBlink && b !== null;
    const validHead = !s.reset && effect.head && b !== null;
    // Blink frames are not fed to the brow medians (their values are
    // distorted); the head medians keep running through blinks.
    const browRel = validBrow ? this.mBrow.push(browRel0) : browRel0;
    const innerRel = validBrow ? this.mInner.push(innerRel0) : innerRel0;
    const yaw = validHead ? this.mYaw.push(yaw0) : yaw0;
    const pitch = validHead ? this.mPitch.push(pitch0) : pitch0;

    return {
      t: s.t, raw, browRel, innerRel, yawDeg: yaw, pitchDeg: pitch, rollDeg: raw.rollDeg,
      validBrow, validHead, invalid, blink,
      expr: this.exprAt(s.t),
    };
  }
}

export function invalidFrame(t: Us, reason: InvalidReason): FeatureFrame {
  return {
    t, raw: null, browRel: 0, innerRel: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0,
    validBrow: false, validHead: false, invalid: reason, blink: false, expr: null,
  };
}

/** The symmetric ±N-frame blink mask over a finished window (the live
 *  extractor can only mask the frames *after* a blink). */
export function applyBlinkMask(frames: readonly FeatureFrame[], n: number = VALIDITY.BLINK_MASK_FRAMES): FeatureFrame[] {
  const masked = new Set<number>();
  frames.forEach((f, i) => {
    if (f.blink) for (let k = i - n; k <= i + n; k++) masked.add(k);
  });
  if (masked.size === 0) return [...frames];
  return frames.map((f, i) =>
    masked.has(i) && f.validBrow ? { ...f, validBrow: false, invalid: f.invalid ?? 'blink' } : f);
}

/** Resample a window onto a fixed grid (default 30 Hz). Each slot takes the
 *  nearest frame within half the stale limit; a slot with no frame is hidden
 *  ('noFace'). Coverage then becomes a share of *time*, so a camera that
 *  drops to 20 fps or a covered lens is counted honestly. */
export function resampleWindow(frames: readonly FeatureFrame[], startUs: Us, endUs: Us, hz = 30): FeatureFrame[] {
  const step = 1e6 / hz;
  const out: FeatureFrame[] = [];
  const tol = (VALIDITY.LANDMARK_STALE_MS * 1000) / 2;
  let j = 0;
  for (let t = startUs; t < endUs - 1; t += step) {
    while (j + 1 < frames.length && Math.abs(frames[j + 1]!.t - t) <= Math.abs(frames[j]!.t - t)) j++;
    const f = frames[j];
    if (f && Math.abs(f.t - t) <= tol) out.push({ ...f, t });
    else out.push(invalidFrame(t, 'noFace'));
  }
  return out;
}

/** Lead-in removed from the judged window (reaction time after "Go"). */
export const LEAD_IN_US = COVERAGE.LEAD_IN_MS * 1000;
