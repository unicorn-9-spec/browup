// Calibration (PLAN F2): 5 s neutral face, 3 brow raises, 3 furrows,
// 2 head shakes, 2 nods. Produces the learner's baselines, resting noise
// (MAD) and the size of their own deliberate movements, so thresholds scale
// to faces that move more or less. Pure functions.

import { CALIBRATION, DEFAULTS, PERSONAL } from '../../config/thresholds';
import type { FeatureFrame, Profile, Sensitivity, Thresholds } from '../types';
import { pitchDeg, yawDeg } from './headPose';
import { mad, median, quantile } from './stats';

export type CalStep = 'neutral' | 'raise' | 'furrow' | 'shake' | 'nod';
export const CAL_STEPS: readonly CalStep[] = ['neutral', 'raise', 'furrow', 'shake', 'nod'];

export const CAL_REPS: Record<CalStep, number> = {
  neutral: 0,
  raise: CALIBRATION.RAISES,
  furrow: CALIBRATION.FURROWS,
  shake: CALIBRATION.SHAKES,
  nod: CALIBRATION.NODS,
};

/** A frame usable for brow measurements (has landmarks, no blink, no bad
 *  validation code). Independent of any baseline. */
export const browUsable = (f: FeatureFrame): boolean => f.raw !== null && f.invalid === null;
/** A frame usable for head pose (blinks and a turned face are fine). */
export const headUsable = (f: FeatureFrame): boolean =>
  f.raw !== null && (f.invalid === null || f.invalid === 'blink' || f.invalid === 'faceTurned' || f.invalid === 'faceOutOfFrame');

export type Baseline = Profile['baseline'];

export interface NeutralResult {
  readonly ok: boolean;
  readonly baseline: Baseline | null;
  readonly mad: Profile['mad'] | null;
  readonly validShare: number;
}

export function neutralBaseline(frames: readonly FeatureFrame[]): NeutralResult {
  const use = frames.filter(browUsable);
  const validShare = frames.length ? use.length / frames.length : 0;
  if (use.length < 20 || validShare < CALIBRATION.MIN_VALID) return { ok: false, baseline: null, mad: null, validShare };
  const raws = use.map((f) => f.raw!);
  const heads = frames.filter(headUsable).map((f) => f.raw!);
  const baseline: Baseline = {
    brow: median(raws.map((r) => r.brow))!,
    inner: median(raws.map((r) => r.inner))!,
    aperture: median(raws.map((r) => r.aperture))!,
    yawRatio: median(heads.map((r) => r.yawRatio))!,
    pitchRatio: median(heads.map((r) => r.pitchRatio))!,
  };
  const m = {
    brow: (mad(raws.map((r) => r.brow)) ?? 0) / Math.abs(baseline.brow),
    inner: (mad(raws.map((r) => r.inner)) ?? 0) / baseline.inner,
  };
  return { ok: true, baseline, mad: m, validShare };
}

/** Relative series for a step, measured against the neutral baseline. */
export function relSeries(frames: readonly FeatureFrame[], b: Baseline) {
  const brow = frames.filter(browUsable).map((f) => ({ t: f.t, v: (f.raw!.brow - b.brow) / Math.abs(b.brow) }));
  const inner = frames.filter(browUsable).map((f) => ({ t: f.t, v: (f.raw!.inner - b.inner) / b.inner }));
  const yaw = frames.filter(headUsable).map((f) => ({ t: f.t, v: yawDeg(f.raw!.yawRatio, b.yawRatio) }));
  const pitch = frames.filter(headUsable).map((f) => ({ t: f.t, v: pitchDeg(f.raw!.pitchRatio, b.pitchRatio) }));
  return { brow, inner, yaw, pitch };
}

/** Counts excursions that rise above `hi` and come back below `lo`
 *  (hysteresis), e.g. separate brow raises. */
export function countExcursions(values: readonly number[], hi: number, lo: number): number {
  let n = 0;
  let up = false;
  for (const v of values) {
    if (!up && v >= hi) { up = true; n++; }
    else if (up && v <= lo) up = false;
  }
  return n;
}

/** Counts half-swings of at least `swing` (peak to peak) — a head shake
 *  left-right-left has two. */
export function countSwings(values: readonly number[], swing: number): number {
  let n = 0;
  let ext: number | null = null;
  let dir = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (dir === 0) {
      lo = Math.min(lo, v); hi = Math.max(hi, v);
      if (hi - v >= swing) { dir = -1; ext = v; n++; }
      else if (v - lo >= swing) { dir = 1; ext = v; n++; }
      continue;
    }
    if (dir === 1) {
      if (v > ext!) ext = v;
      else if (ext! - v >= swing) { dir = -1; ext = v; n++; }
    } else {
      if (v < ext!) ext = v;
      else if (v - ext! >= swing) { dir = 1; ext = v; n++; }
    }
  }
  return n;
}

export interface StepMeasure {
  /** Size of the deliberate movement (fraction or degrees). */
  readonly size: number;
  /** Repetitions seen (for the check marks). */
  readonly reps: number;
  readonly validShare: number;
  /** Movement too small against resting noise, or too hidden. */
  readonly weak: boolean;
}

export function measureStep(step: Exclude<CalStep, 'neutral'>, frames: readonly FeatureFrame[], b: Baseline, noise: Profile['mad']): StepMeasure {
  const s = relSeries(frames, b);
  const usable = step === 'shake' || step === 'nod' ? frames.filter(headUsable).length : frames.filter(browUsable).length;
  const validShare = frames.length ? usable / frames.length : 0;
  const tooHidden = validShare < CALIBRATION.MIN_VALID;
  switch (step) {
    case 'raise': {
      const v = s.brow.map((p) => p.v);
      const size = Math.max(0, quantile(v, 0.9) ?? 0);
      const reps = countExcursions(v, size * 0.6, size * 0.3);
      return { size, reps, validShare, weak: tooHidden || size < PERSONAL.MIN_SIGNAL_TO_NOISE * Math.max(noise.brow, 0.005) };
    }
    case 'furrow': {
      const v = s.brow.map((p) => -p.v);
      const size = Math.max(0, quantile(v, 0.9) ?? 0);
      const reps = countExcursions(v, size * 0.6, size * 0.3);
      return { size, reps, validShare, weak: tooHidden || size < PERSONAL.MIN_SIGNAL_TO_NOISE * Math.max(noise.brow, 0.005) };
    }
    case 'shake':
    case 'nod': {
      const v = (step === 'shake' ? s.yaw : s.pitch).map((p) => p.v);
      const size = Math.max(0, ((quantile(v, 0.95) ?? 0) - (quantile(v, 0.05) ?? 0)) / 2);
      const reps = Math.floor(countSwings(v, Math.max(size, 1)) / 2);
      return { size, reps, validShare, weak: tooHidden || size < 3 };
    }
  }
}

/** The inner-brow pull during the furrow step (fraction, positive). */
export function furrowInner(frames: readonly FeatureFrame[], b: Baseline): number {
  const v = relSeries(frames, b).inner.map((p) => -p.v);
  return Math.max(0, quantile(v, 0.9) ?? 0);
}

export function buildProfile(
  neutral: NeutralResult,
  steps: Partial<Record<Exclude<CalStep, 'neutral'>, StepMeasure>>,
  innerPull: number,
  now = new Date(),
): Profile | null {
  if (!neutral.ok || !neutral.baseline || !neutral.mad) return null;
  const weak = (Object.entries(steps) as [CalStep, StepMeasure][]).filter(([, m]) => m.weak).map(([k]) => k);
  const pick = (k: Exclude<CalStep, 'neutral'>, fallback: number) => {
    const m = steps[k];
    return m && !m.weak ? m.size : fallback;
  };
  return {
    version: 1,
    createdAt: now.toISOString(),
    baseline: neutral.baseline,
    mad: neutral.mad,
    range: {
      // Fallbacks: twice the default threshold, i.e. the default applies.
      raise: pick('raise', DEFAULTS.RAISE_FRACTION * 2),
      lower: pick('furrow', DEFAULTS.LOWER_FRACTION * 2),
      inner: steps.furrow && !steps.furrow.weak && innerPull > 0 ? innerPull : DEFAULTS.INNER_FRACTION * 2,
      shakeDeg: pick('shake', DEFAULTS.SHAKE_AMPLITUDE_DEG * 2),
      nodDeg: pick('nod', DEFAULTS.NOD_AMPLITUDE_DEG * 2),
    },
    weak,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Thresholds for one learner. PLAN: yes/no = baseline + max(8%, 2.5 MAD).
 * With a profile, the 8% becomes min(8%, share × the learner's own raise) so
 * a small mover can still pass, but never below 2.5 MAD (their resting
 * jitter) nor a fixed floor. Without a profile: the PLAN defaults.
 */
export function thresholdsFor(p: Profile | null, sensitivity: Sensitivity = 'standard'): Thresholds {
  if (!p) {
    return {
      raise: DEFAULTS.RAISE_FRACTION,
      lower: DEFAULTS.LOWER_FRACTION,
      inner: DEFAULTS.INNER_FRACTION,
      shakeDeg: DEFAULTS.SHAKE_AMPLITUDE_DEG,
      nodDeg: DEFAULTS.NOD_AMPLITUDE_DEG,
      personal: false,
    };
  }
  const share = PERSONAL.SHARE[sensitivity];
  const noiseB = DEFAULTS.MAD_MULTIPLIER * p.mad.brow;
  const noiseI = DEFAULTS.MAD_MULTIPLIER * p.mad.inner;
  return {
    raise: Math.max(noiseB, clamp(share * p.range.raise, PERSONAL.MIN_RAISE_FRACTION, DEFAULTS.RAISE_FRACTION)),
    lower: Math.max(noiseB, clamp(share * p.range.lower, PERSONAL.MIN_LOWER_FRACTION, DEFAULTS.LOWER_FRACTION)),
    inner: Math.max(noiseI, clamp(share * p.range.inner, PERSONAL.MIN_INNER_FRACTION, DEFAULTS.INNER_FRACTION)),
    shakeDeg: clamp(share * p.range.shakeDeg, PERSONAL.MIN_SHAKE_DEG, DEFAULTS.SHAKE_AMPLITUDE_DEG),
    nodDeg: clamp(share * p.range.nodDeg, PERSONAL.MIN_NOD_DEG, DEFAULTS.NOD_AMPLITUDE_DEG),
    personal: true,
  };
}
