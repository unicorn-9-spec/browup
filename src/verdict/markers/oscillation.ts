// Head-shake (yaw) and nod (pitch) detection (PLAN §2): at least 2 direction
// changes of amplitude ≥ A within any 1.5 s; the oscillation must span
// ≥ 50% of the window to be HELD.
//
// "Amplitude" is the half swing: a ±6° shake swings 12° from side to side,
// so a reversal is registered after the head has travelled 2·A from the
// previous extreme. The very first swing (from rest) needs only A — that is
// the head leaving the neutral pose.

import { OSCILLATION } from '../../../config/thresholds';

export interface OscSample {
  /** Seconds from the window start. */
  readonly s: number;
  readonly v: number;
  readonly valid: boolean;
}

export interface Reversal {
  readonly s: number;
  readonly v: number;
}

export interface Episode {
  readonly start: number;
  readonly end: number;
  readonly reversals: number;
}

/** Breaks the series where frames are hidden for longer than this. */
const MAX_GAP_S = 0.3;

export function findReversals(samples: readonly OscSample[], amp: number): Reversal[][] {
  const runs: Reversal[][] = [];
  let cur: Reversal[] = [];
  let dir = 0;
  let ext: Reversal | null = null;
  let lo: Reversal | null = null;
  let hi: Reversal | null = null;
  let lastS = -Infinity;
  const flush = () => {
    if (cur.length) runs.push(cur);
    cur = [];
    dir = 0;
    ext = lo = hi = null;
  };
  for (const p of samples) {
    if (!p.valid) continue;
    if (p.s - lastS > MAX_GAP_S) flush();
    lastS = p.s;
    const r = { s: p.s, v: p.v };
    if (dir === 0) {
      // Leaving rest is not a reversal: it only sets the direction once the
      // head has moved ≥ A from where the run started.
      if (!lo || p.v < lo.v) lo = r;
      if (!hi || p.v > hi.v) hi = r;
      if (p.v - lo.v >= amp) { dir = 1; ext = r; }
      else if (hi.v - p.v >= amp) { dir = -1; ext = r; }
      continue;
    }
    if (dir === 1) {
      if (p.v > ext!.v) ext = r;
      else if (ext!.v - p.v >= 2 * amp) { cur.push(ext!); dir = -1; ext = r; }
    } else {
      if (p.v < ext!.v) ext = r;
      else if (p.v - ext!.v >= 2 * amp) { cur.push(ext!); dir = 1; ext = r; }
    }
  }
  // The last extreme counts as a reversal if the head came back from it by
  // at least A (a shake usually ends by returning to the middle).
  if (dir !== 0 && ext && samples.length) {
    const last = [...samples].reverse().find((p) => p.valid);
    if (last && Math.abs(last.v - ext.v) >= amp && last.s - ext.s > 0.05) cur.push(ext);
  }
  flush();
  return runs;
}

/** Groups reversals into episodes: consecutive reversals ≤ WITHIN apart,
 *  at least MIN_REVERSALS of them. */
export function episodes(samples: readonly OscSample[], amp: number, durationS: number): Episode[] {
  const within = OSCILLATION.WITHIN_MS / 1000;
  const tail = OSCILLATION.TAIL_MS / 1000;
  const out: Episode[] = [];
  for (const run of findReversals(samples, amp)) {
    let group: Reversal[] = [];
    const close = () => {
      if (group.length >= OSCILLATION.MIN_REVERSALS) {
        const first = group[0]!;
        const second = group[1]!;
        const last = group[group.length - 1]!;
        const lead = Math.min(within / 2, second.s - first.s);
        out.push({
          start: Math.max(0, first.s - lead),
          end: Math.min(durationS, last.s + tail),
          reversals: group.length,
        });
      }
      group = [];
    };
    for (const r of run) {
      const prev = group[group.length - 1];
      if (prev && r.s - prev.s > within) close();
      group.push(r);
    }
    close();
  }
  return out;
}

/** Total seconds covered by the union of episodes. */
export function spanSeconds(eps: readonly Episode[]): number {
  const sorted = [...eps].sort((a, b) => a.start - b.start);
  let total = 0;
  let curS = -Infinity;
  let curE = -Infinity;
  for (const e of sorted) {
    if (e.start > curE) {
      if (curE > curS) total += curE - curS;
      curS = e.start;
      curE = e.end;
    } else curE = Math.max(curE, e.end);
  }
  if (curE > curS) total += curE - curS;
  return total;
}
