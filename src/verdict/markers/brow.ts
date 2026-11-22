// Brow-marker rules (PLAN §2). Each returns whether one frame shows the
// marker, judged against the learner's thresholds.

import type { FeatureFrame, Thresholds } from '../../types';

/** Yes/no question (and topic, conditional): brows raised. */
export const raised = (f: FeatureFrame, th: Thresholds): boolean => f.browRel >= th.raise;

/** Wh-question: brows lowered AND drawn together (PLAN: brow height ≤
 *  baseline − max(5%, 2.5 MAD) and inner-brow gap ≤ baseline − 4%). */
export const furrowed = (f: FeatureFrame, th: Thresholds): boolean =>
  f.browRel <= -th.lower && f.innerRel <= -th.inner;

export const browValid = (f: FeatureFrame): boolean => f.validBrow;
export const headValid = (f: FeatureFrame): boolean => f.validHead;
