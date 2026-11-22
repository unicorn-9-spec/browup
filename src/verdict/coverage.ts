// Coverage and timing for a marker across a capture window (PLAN §2:
// present in ≥ 70% of valid frames, including the first and last 20%).
// Works on a resampled window (fixed grid), so every frame is the same
// slice of time. Pure functions.

import { COVERAGE } from '../../config/thresholds';
import type { FeatureFrame, InvalidReason } from '../types';

export interface CoverageResult {
  readonly total: number;
  readonly valid: number;
  readonly validFraction: number;
  /** Present ÷ valid frames. */
  readonly coverage: number;
  readonly startValid: number;
  readonly endValid: number;
  /** null when that edge is too hidden to judge. */
  readonly startPresent: boolean | null;
  readonly endPresent: boolean | null;
  readonly present: readonly boolean[];
  readonly dominantHidden: InvalidReason | null;
}

export function coverageOf(
  frames: readonly FeatureFrame[],
  isValid: (f: FeatureFrame) => boolean,
  isPresent: (f: FeatureFrame) => boolean,
): CoverageResult {
  const total = frames.length;
  const present = frames.map((f) => isValid(f) && isPresent(f));
  const validMask = frames.map(isValid);
  const valid = validMask.filter(Boolean).length;
  const count = present.filter(Boolean).length;
  const edge = Math.max(1, Math.round(total * COVERAGE.EDGE));
  const edgeStats = (from: number, to: number) => {
    let v = 0;
    let p = 0;
    for (let i = from; i < to; i++) {
      if (validMask[i]) v++;
      if (present[i]) p++;
    }
    const share = v / Math.max(1, to - from);
    return { share, present: share < COVERAGE.EDGE_MIN_VALID ? null : p / v >= COVERAGE.EDGE_PRESENT };
  };
  const s = edgeStats(0, Math.min(edge, total));
  const e = edgeStats(Math.max(0, total - edge), total);
  return {
    total,
    valid,
    validFraction: total ? valid / total : 0,
    coverage: valid ? count / valid : 0,
    startValid: s.share,
    endValid: e.share,
    startPresent: s.present,
    endPresent: e.present,
    present,
    dominantHidden: dominantReason(frames.filter((f) => !isValid(f))),
  };
}

export function dominantReason(hidden: readonly FeatureFrame[]): InvalidReason | null {
  const counts = new Map<InvalidReason, number>();
  for (const f of hidden) if (f.invalid) counts.set(f.invalid, (counts.get(f.invalid) ?? 0) + 1);
  let best: InvalidReason | null = null;
  let n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

/** Turn a per-frame boolean mask into [start, end) spans in seconds. */
export function spans(mask: readonly boolean[], stepS: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  mask.forEach((m, i) => {
    if (m && start < 0) start = i;
    if (!m && start >= 0) { out.push([start * stepS, i * stepS]); start = -1; }
  });
  if (start >= 0) out.push([start * stepS, mask.length * stepS]);
  return out;
}
