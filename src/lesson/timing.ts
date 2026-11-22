// Prompt timing: how long the capture window is, which part of it is the
// marked part (from the gloss span), where a topic/comment split falls, and
// when each gloss token is "due" — the gloss cursor moves across the signs
// during capture so the learner's pace matches the judged parts (PLAN:
// "segments marked by a beat in the prompt timing").

import { CAPTURE } from '../../config/thresholds';
import type { MarkerType } from '../types';

export interface TimedPrompt {
  readonly marker: MarkerType;
  readonly gloss: readonly string[];
  readonly span: readonly [number, number];
  readonly split?: number;
  readonly windowS?: number;
}

export interface PromptTiming {
  readonly windowS: number;
  /** Marked part as shares of the judged window. */
  readonly part: readonly [number, number];
  /** Topic / conditional split as a share of the judged window. */
  readonly split?: number;
  /** Each token's [start, end) as shares of the judged window. */
  readonly tokens: readonly (readonly [number, number])[];
}

export function autoWindowS(tokens: number): number {
  const raw = CAPTURE.BASE_S + CAPTURE.PER_SIGN_S * tokens;
  return Math.round(Math.min(5, Math.max(CAPTURE.MIN_WINDOW_S, raw)) * 2) / 2;
}

export function promptTiming(p: TimedPrompt, setting: number | 'auto' = 'auto'): PromptTiming {
  const n = p.gloss.length;
  const windowS = setting === 'auto'
    ? p.windowS ?? autoWindowS(n)
    : Math.min(CAPTURE.MAX_WINDOW_S, Math.max(CAPTURE.MIN_WINDOW_S, setting));
  const tokens = p.gloss.map((_, i) => [i / n, (i + 1) / n] as const);
  if (p.marker === 'topic' || p.marker === 'cond') {
    return { windowS, part: [0, 1], split: (p.split ?? Math.ceil(n / 2)) / n, tokens };
  }
  return { windowS, part: [p.span[0] / n, (p.span[1] + 1) / n], tokens };
}
