// MediaPipe Face Mesh indices (478-point model with irises) for the points
// BrowUp measures. Sides are the signer's sides: 33 is the signer's right
// eye outer corner (image left in an unmirrored frame).
//
// PLAN.md lists brows 105/66/107 and 334/296/336, upper eyelids 159/386,
// outer corners 33/263, inner brows 107/336 and nose tip 1. The outer brow
// points (70, 63 / 300, 293) are kept only to draw a full brow line; the
// inner eye corners (133/362) and lower lids (145/374) give the eye-corner
// brow reference and the eye-opening blink fallback. 1/33/263 were confirmed
// on this SDK by Legible; the probe draws every index so the rest can be
// checked by eye (docs/SDK-NOTES.md).

export const LM = {
  BROW_R: [70, 63, 105, 66, 107] as const,
  BROW_L: [300, 293, 334, 296, 336] as const,
  /** The three brow points per side that the brow-height feature uses
   *  (PLAN: 105/66/107 and 334/296/336). */
  BROW_R_MEASURE: [105, 66, 107] as const,
  BROW_L_MEASURE: [334, 296, 336] as const,
  INNER_BROW_R: 107,
  INNER_BROW_L: 336,
  LID_UPPER_R: 159,
  LID_LOWER_R: 145,
  LID_UPPER_L: 386,
  LID_LOWER_L: 374,
  EYE_OUTER_R: 33,
  EYE_INNER_R: 133,
  EYE_OUTER_L: 263,
  EYE_INNER_L: 362,
  NOSE: 1,
} as const;

/** Every index BrowUp keeps (for decode bounds checks and the probe). */
export const KEPT_INDICES: readonly number[] = [
  ...LM.BROW_R, ...LM.BROW_L,
  LM.LID_UPPER_R, LM.LID_LOWER_R, LM.LID_UPPER_L, LM.LID_LOWER_L,
  LM.EYE_OUTER_R, LM.EYE_INNER_R, LM.EYE_OUTER_L, LM.EYE_INNER_L, LM.NOSE,
];

/** Index of a brow measuring point inside the kept 5-point brow arrays. */
export const BROW_MEASURE_SLOTS = [2, 3, 4] as const;
