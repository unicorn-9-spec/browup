// Optional second vote from the SDK's expression scores (PLAN adjustment 2).
// Used only if the Stage 1 agreement test passes (config EXPRESSIONS.MODE
// === 'on'). SURPRISE is checked against raised-brow frames and ANGRY
// against furrowed frames; the result only labels a landmark verdict
// "confident" (both agree) or "likely" (landmarks only). Never used alone,
// never shown as a feeling, never stored.

import { EXPRESSIONS } from '../../config/thresholds';
import type { FeatureFrame, MarkerType } from '../types';

export type ExprMode = 'pending' | 'on' | 'off';

export function expressionVote(
  marker: MarkerType,
  frames: readonly FeatureFrame[],
  present: readonly boolean[],
  mode: ExprMode = EXPRESSIONS.MODE,
): 'confident' | 'likely' | null {
  if (mode !== 'on') return null;
  if (marker !== 'yn' && marker !== 'wh') return null;
  let n = 0;
  let agree = 0;
  frames.forEach((f, i) => {
    if (!present[i] || !f.expr) return;
    n++;
    const score = marker === 'yn' ? f.expr.surprise : f.expr.anger;
    if (score >= EXPRESSIONS.AGREE_SCORE) agree++;
  });
  if (n < 5) return null;
  return agree / n >= EXPRESSIONS.CONFIDENT_SHARE ? 'confident' : 'likely';
}

/** Stage 1 agreement: share of trials where the expression score agrees
 *  with the landmark state (raise ↔ surprise, furrow ↔ anger, neutral ↔
 *  neither). Each trial is one labelled movement. */
export interface AgreementTrial {
  readonly label: 'raise' | 'furrow' | 'neutral';
  /** Landmarks saw the movement (raise/furrow) or stillness (neutral). */
  readonly landmarkAgrees: boolean;
  /** Peak SURPRISE and ANGRY scores during the trial. */
  readonly surprise: number;
  readonly anger: number;
}

export function agreement(trials: readonly AgreementTrial[], score: number = EXPRESSIONS.AGREE_SCORE): { share: number; n: number; byLabel: Record<string, number> } {
  const counted = trials.filter((t) => t.landmarkAgrees);
  const ok = (t: AgreementTrial) =>
    t.label === 'raise' ? t.surprise >= score
      : t.label === 'furrow' ? t.anger >= score
        : t.surprise < score && t.anger < score;
  const byLabel: Record<string, number> = {};
  for (const l of ['raise', 'furrow', 'neutral'] as const) {
    const g = counted.filter((t) => t.label === l);
    byLabel[l] = g.length ? g.filter(ok).length / g.length : NaN;
  }
  return { share: counted.length ? counted.filter(ok).length / counted.length : 0, n: counted.length, byLabel };
}
