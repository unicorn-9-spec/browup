// Core data types shared by sensing, face features, the verdict engine,
// lessons, the UI, tests and the probe. Numbers only — no images.

/** Microseconds (SDK timestamps are epoch µs). */
export type Us = number;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The landmark subset BrowUp keeps from each 478-point set (pixel
 * coordinates of the capture frame). Sides are the *signer's* sides
 * (MediaPipe convention: index 33 is the signer's right eye outer corner,
 * which appears on the image left of an unmirrored camera frame).
 */
export interface FacePoints {
  /** Right brow, outer → inner (70, 63, 105, 66, 107). */
  readonly browR: readonly Point[];
  /** Left brow, outer → inner (300, 293, 334, 296, 336). */
  readonly browL: readonly Point[];
  /** Upper / lower eyelid midpoints. */
  readonly lidUpperR: Point;
  readonly lidLowerR: Point;
  readonly lidUpperL: Point;
  readonly lidLowerL: Point;
  /** Eye corners. */
  readonly eyeOuterR: Point;
  readonly eyeInnerR: Point;
  readonly eyeOuterL: Point;
  readonly eyeInnerL: Point;
  readonly nose: Point;
}

/** One decoded landmark set. */
export interface FaceSample {
  readonly t: Us;
  readonly points: FacePoints;
  readonly stable: boolean;
  /** true: cannot be linked to the previous set (SDK `reset`). */
  readonly reset: boolean;
}

export interface BlinkSample {
  readonly t: Us;
  readonly detected: boolean;
}

/** Expression scores 0–100. Only the two the agreement test needs are kept;
 *  they are never shown as feelings and never stored in progress. */
export interface ExpressionSample {
  readonly t: Us;
  readonly surprise: number;
  readonly anger: number;
}

/** Why a frame cannot be used. */
export type InvalidReason =
  | 'noFace'
  | 'reset'
  | 'blink'
  | 'tooDark'
  | 'tooBright'
  | 'multipleFaces'
  | 'faceTurned'
  | 'faceOutOfFrame';

/** Per-frame measurements, before baseline normalisation. */
export interface RawFeatures {
  /** Brow height ÷ outer-eye distance (larger = brows higher). */
  readonly brow: number;
  /** Inner-brow distance (107–336) ÷ outer-eye distance. */
  readonly inner: number;
  /** Mean eye opening ÷ outer-eye distance (blink fallback). */
  readonly aperture: number;
  /** Nose offset along the eye line ÷ eye distance (yaw source). */
  readonly yawRatio: number;
  /** Nose offset down the face ÷ eye distance (pitch source). */
  readonly pitchRatio: number;
  /** Head roll in degrees (eye-line angle). */
  readonly rollDeg: number;
  /** Outer-eye distance in pixels (face size). */
  readonly eyeDist: number;
}

/** A feature frame: what the verdict engine and the overlays consume. */
export interface FeatureFrame {
  readonly t: Us;
  readonly raw: RawFeatures | null;
  /** Brow height relative to the neutral baseline: 0.10 = 10% higher. */
  readonly browRel: number;
  /** Inner-brow gap relative to baseline: −0.05 = 5% closer. */
  readonly innerRel: number;
  /** Degrees relative to the neutral pose. +yaw = nose towards the signer's
   *  left; +pitch = chin up. */
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
  /** Usable for brow features. */
  readonly validBrow: boolean;
  /** Usable for head-movement features (blinks don't matter there; a turned
   *  face is expected during a head shake). */
  readonly validHead: boolean;
  readonly invalid: InvalidReason | null;
  readonly blink: boolean;
  readonly expr: ExpressionSample | null;
}

export type MarkerType = 'yn' | 'wh' | 'neg' | 'aff' | 'topic' | 'cond';

export const MARKER_LABEL: Record<MarkerType, string> = {
  yn: 'y/n',
  wh: 'wh',
  neg: 'neg',
  aff: 'aff',
  topic: 't',
  cond: 'cond',
};

export const MARKER_NAME: Record<MarkerType, string> = {
  yn: 'Yes/no question',
  wh: 'Wh-question',
  neg: 'Negation',
  aff: 'Affirmation',
  topic: 'Topic',
  cond: 'Conditional',
};

export type VerdictKind =
  | 'HELD'
  | 'STARTED_LATE'
  | 'DROPPED_AT_END'
  | 'NOT_HELD'
  | 'KEPT_UP'
  | 'MISSING'
  | 'NOT_SEEN';

export const STAMP_TEXT: Record<VerdictKind, string> = {
  HELD: 'HELD',
  STARTED_LATE: 'STARTED LATE',
  DROPPED_AT_END: 'DROPPED AT END',
  NOT_HELD: 'NOT HELD',
  KEPT_UP: 'KEPT UP TOO LONG',
  MISSING: 'MISSING',
  NOT_SEEN: 'NOT SEEN',
};

/** The thresholds one verdict is judged against (personal or default). */
export interface Thresholds {
  readonly raise: number;
  readonly lower: number;
  readonly inner: number;
  readonly shakeDeg: number;
  readonly nodDeg: number;
  readonly personal: boolean;
}

/** A point on the verdict timeline. */
export interface TimelinePoint {
  /** Seconds from the start of the window. */
  readonly s: number;
  /** Plotted value: brow % for brow markers, degrees for head markers. */
  readonly v: number | null;
  readonly valid: boolean;
  readonly present: boolean;
}

export interface TimelineSeries {
  readonly unit: 'percent' | 'degrees';
  readonly label: string;
  readonly points: readonly TimelinePoint[];
  /** The target zone in the same units (lemon band): above / below a
   *  threshold (brows), or outside ±threshold (head swings). */
  readonly target: { readonly mode: 'above' | 'below' | 'outside'; readonly at: number };
  /** Spans (seconds) where the marker counted as present. */
  readonly presentSpans: readonly (readonly [number, number])[];
  /** Spans (seconds) where frames were hidden. */
  readonly hiddenSpans: readonly (readonly [number, number])[];
  readonly durationS: number;
  readonly leadInS: number;
  /** Topic/comment boundary (seconds), for topic prompts. */
  readonly splitS?: number;
  /** The judged part of the window (seconds): after the lead-in, limited
   *  to the prompt's marked signs. */
  readonly judgedS?: readonly [number, number];
}

export interface Verdict {
  readonly marker: MarkerType;
  readonly kind: VerdictKind;
  /** Valid frames ÷ all frames in the judged window. */
  readonly validFraction: number;
  /** Marker frames ÷ valid frames (brow) or oscillation span ÷ window (head). */
  readonly coverage: number;
  readonly startPresent: boolean | null;
  readonly endPresent: boolean | null;
  /** Another marker the face showed instead (e.g. furrow on a y/n prompt). */
  readonly instead: MarkerType | null;
  /** Expression second vote; null when the vote is off or does not apply. */
  readonly confidence: 'confident' | 'likely' | null;
  readonly tip: string;
  /** Plain-language description of the timeline (screen readers, export). */
  readonly summary: string;
  readonly series: TimelineSeries;
  /** Topic prompts: share of the comment part with raised brows. */
  readonly commentCoverage?: number;
  readonly tiltSeen?: boolean;
}

/** Calibration result: the learner's baselines, noise and ranges. */
export interface Profile {
  readonly version: 1;
  readonly createdAt: string;
  readonly baseline: {
    readonly brow: number;
    readonly inner: number;
    readonly aperture: number;
    readonly yawRatio: number;
    readonly pitchRatio: number;
  };
  /** MAD of the neutral recording, in the same relative units as browRel /
   *  innerRel. */
  readonly mad: { readonly brow: number; readonly inner: number };
  /** The learner's deliberate movements (medians of the repetitions). */
  readonly range: {
    readonly raise: number;
    readonly lower: number;
    readonly inner: number;
    readonly shakeDeg: number;
    readonly nodDeg: number;
  };
  /** Steps that were too small or too hidden to measure (defaults used). */
  readonly weak: readonly string[];
  /** Brow-height change per degree of head pitch, measured in the nod step
   *  (fraction per degree). Absent in older profiles → config default. */
  readonly browPitchSlope?: number;
}

export type Sensitivity = 'gentle' | 'standard' | 'strict';

export interface Settings {
  windowS: number | 'auto';
  mirrorFlip: boolean;
  sensitivity: Sensitivity;
  reducedMotion: 'system' | 'on' | 'off';
  pack: string;
  cameraId: string;
}

/** One stored attempt (numbers only). */
export interface Attempt {
  readonly at: string;
  readonly promptId: string;
  readonly marker: MarkerType;
  readonly verdict: VerdictKind;
  readonly coveragePct: number;
  readonly validPct: number;
  readonly mode: 'lesson' | 'review' | 'free';
  /** Review mode: whether the learner picked the right marker first. */
  readonly pickedRight?: boolean;
}
