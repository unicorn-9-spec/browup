// Mixed review (PLAN F6): shuffled prompts across markers; the learner
// picks the marker before signing. Scores are reproducible: the shuffle is
// seeded, and a replayed attempt gets the same verdict.

import type { Attempt, MarkerType } from '../types';

export const REVIEW_MARKERS: readonly MarkerType[] = ['yn', 'wh', 'neg', 'aff'];

/** Seeded Fisher–Yates shuffle. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const a = [...items];
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Picks up to `perMarker` prompts of each review marker and shuffles them. */
export function reviewDeck<P extends { id: string; marker: MarkerType }>(prompts: readonly P[], seed: number, perMarker = 3): P[] {
  const picked: P[] = [];
  for (const m of REVIEW_MARKERS) picked.push(...shuffle(prompts.filter((p) => p.marker === m), seed + m.length).slice(0, perMarker));
  return shuffle(picked, seed);
}

export interface MarkerScore {
  readonly marker: MarkerType;
  readonly attempts: number;
  /** Picked the right marker. */
  readonly picked: number;
  /** Picked the right marker AND produced it (HELD). */
  readonly correct: number;
}

export function scoreByMarker(attempts: readonly Attempt[]): MarkerScore[] {
  return REVIEW_MARKERS.map((marker) => {
    const a = attempts.filter((x) => x.marker === marker && x.verdict !== 'NOT_SEEN');
    return {
      marker,
      attempts: a.length,
      picked: a.filter((x) => x.pickedRight).length,
      correct: a.filter((x) => x.pickedRight && x.verdict === 'HELD').length,
    };
  });
}
