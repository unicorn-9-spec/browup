// ═══════════════════════════════════════════════════════════════════════
//  BrowUp thresholds — every tunable number in one place.
//
//  Defaults come from PLAN.md §2 ("Features and marker rules") unless a
//  comment says otherwise. Calibration replaces the population defaults with
//  the learner's own baseline, noise (MAD) and range (see
//  src/face/calibration.ts → thresholdsFor). Tune from the Stage 1 face
//  check (probe/analyze.ts writes the numbers these should move to).
// ═══════════════════════════════════════════════════════════════════════

export const LANDMARKS = {
  /** FACE_LANDMARKS sends 478 MediaPipe Face Mesh points (verified by the
   *  sibling project Legible on 22 Nov 2026). Smaller sets are ignored. */
  COUNT: 478,
  /** Nose-tip depth ÷ outer-eye distance, used to turn the nose offset into
   *  degrees. Legible uses 0.45, Upbeat 0.38 (both untested against a
   *  protractor); 0.42 sits between them. Only the *shape* of a head shake
   *  matters for the verdict, and calibration rescales amplitudes, so a few
   *  degrees of absolute error do not change verdicts. */
  NOSE_DEPTH_RATIO: 0.42,
} as const;

export const FEATURES = {
  /** Brow height reference. PLAN.md measures brow → upper eyelid. The upper
   *  eyelid lifts with raised brows and drops when squinting, which shrinks
   *  the signal, and it moves in every blink. The eye corners (33/133,
   *  263/362) stay put, so 'eyeCorners' is the default. The face check reports
   *  the separation for both references (probe/analyze.ts) so this choice is
   *  checked on a real face. */
  BROW_REFERENCE: 'eyeCorners' as 'eyeCorners' | 'eyelid',
  /** Median smoothing length in frames (PLAN: 3-frame median). */
  MEDIAN_FRAMES: 3,
} as const;

export const VALIDITY = {
  /** Frames masked on each side of a blink (PLAN: ±2). */
  BLINK_MASK_FRAMES: 2,
  /** Landmark fallback for blinks: eye opening below this fraction of the
   *  calibrated neutral opening counts as a blink even if the SDK's blink
   *  flag missed it. Kept low (a blink closes the eye almost fully) so the
   *  squint that often comes with a wh-furrow is NOT mistaken for a blink. */
  BLINK_APERTURE_FRACTION: 0.3,
  /** A blink sample is matched to a landmark frame within this distance. */
  BLINK_MATCH_MS: 25,
  /** MULTIPLE_FACES_FOUND flickers for single frames with one person present
   *  (Legible saw 31–78 ms glitches); ignore it for shorter than this. */
  MULTI_FACE_DEBOUNCE_MS: 250,
  /** Landmark gap after which the face counts as lost. */
  LANDMARK_STALE_MS: 400,
} as const;

/** Population defaults (PLAN.md §2), used before calibration and as the
 *  upper bound of what calibration may ask of a learner. Brow numbers are
 *  fractions of the neutral baseline; head numbers are degrees. */
export const DEFAULTS = {
  RAISE_FRACTION: 0.08,
  LOWER_FRACTION: 0.05,
  INNER_FRACTION: 0.04,
  MAD_MULTIPLIER: 2.5,
  SHAKE_AMPLITUDE_DEG: 6,
  NOD_AMPLITUDE_DEG: 5,
} as const;

export const PERSONAL = {
  /** A threshold is this share of the learner's own deliberate movement
   *  (calibration), capped by the defaults above. 'Sensitivity' in Settings
   *  picks one of these. */
  SHARE: { gentle: 0.4, standard: 0.5, strict: 0.6 } as const,
  /** Never go below these, whatever the calibration says: below them,
   *  landmark jitter alone would pass. */
  MIN_RAISE_FRACTION: 0.03,
  MIN_LOWER_FRACTION: 0.02,
  MIN_INNER_FRACTION: 0.015,
  MIN_SHAKE_DEG: 3,
  MIN_NOD_DEG: 2.5,
  /** Calibration asks for a redo when a deliberate movement is smaller than
   *  this multiple of the learner's resting noise. */
  MIN_SIGNAL_TO_NOISE: 3,
} as const;

export const COVERAGE = {
  /** Frames with the marker ÷ valid frames for HELD (PLAN: ≥ 70%). */
  HELD: 0.7,
  /** Below this the marker is MISSING (PLAN: < 30%). */
  MISSING_BELOW: 0.3,
  /** First and last share of the window that must show the marker (PLAN:
   *  20% each). */
  EDGE: 0.2,
  /** "Present in the first/last 20%" = at least this share of that edge's
   *  valid frames. */
  EDGE_PRESENT: 0.5,
  /** An edge needs at least this share of valid frames to be judged; if it
   *  is hidden the verdict is NOT SEEN (we never guess). */
  EDGE_MIN_VALID: 0.4,
  /** No verdict from fewer valid frames (PLAN hard rule: 60%). */
  MIN_VALID: 0.6,
  /** Reaction time after "Go" that is not judged (shaded on the timeline).
   *  Without it nearly every attempt would be STARTED LATE. */
  LEAD_IN_MS: 400,
} as const;

export const OSCILLATION = {
  /** PLAN: ≥ 2 direction changes within any 1.5 s. */
  MIN_REVERSALS: 2,
  WITHIN_MS: 1500,
  /** Oscillation must span ≥ 50% of the window for HELD (PLAN). */
  HELD_SPAN: 0.5,
  /** A swing still counts as part of the shake/nod for this long after its
   *  last reversal (a shake ends mid-swing). */
  TAIL_MS: 350,
} as const;

export const TOPIC = {
  /** Topic part: brows raised for ≥ this share. */
  TOPIC_HELD: 0.7,
  /** Comment part: brows raised for ≤ this share (they come back down). */
  COMMENT_MAX: 0.3,
  /** The slight head tilt that often goes with a topic varies between
   *  signers; it is reported, not required, until a reviewer says otherwise. */
  REQUIRE_TILT: false,
  TILT_DEG: 3,
} as const;

export const EXPRESSIONS = {
  /** Stage 1 decides: 'pending' = requested and logged for the agreement
   *  test, never used in a verdict; 'on' = second vote; 'off' = not
   *  requested. Set from the face-check report (probe/analyze.ts). */
  MODE: 'pending' as 'pending' | 'on' | 'off',
  /** Agreement needed in the face check to switch the vote on (PLAN: 80%). */
  KEEP_IF_AGREEMENT: 0.8,
  /** Score (0–100) that counts as "the expression agrees". Placeholder until
   *  the face check measures the learner's neutral scores. */
  AGREE_SCORE: 30,
  /** Share of marker frames where the expression agrees for "confident". */
  CONFIDENT_SHARE: 0.6,
} as const;

export const CAPTURE = {
  COUNTDOWN_S: 3,
  /** Window length bounds (Settings 3–7 s; PLAN prompts 3–5 s). */
  MIN_WINDOW_S: 3,
  MAX_WINDOW_S: 7,
  /** Default window from gloss length: base + per sign, clamped 3–5 s. */
  BASE_S: 1.5,
  PER_SIGN_S: 0.75,
  /** Live overlay must not lag more than this (PLAN F4). */
  OVERLAY_BUDGET_MS: 150,
} as const;

export const CALIBRATION = {
  NEUTRAL_S: 5,
  /** Seconds allowed per repeated-movement step. */
  STEP_S: 9,
  RAISES: 3,
  FURROWS: 3,
  SHAKES: 2,
  NODS: 2,
  /** A step needs at least this share of valid frames. */
  MIN_VALID: 0.6,
} as const;
