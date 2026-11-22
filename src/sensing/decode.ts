// Decoded SmartSpectra Metrics → BrowUp sense events.
//
// Verified against @smartspectra/node-sdk 3.5.0 js/messages/generated.d.ts:
//   face.landmarks[]  { value: {x,y}[], stable, reset, timestamp }
//   face.blinking[]   DetectionStatus { detected, stable, timestamp }
//   face.expression[] { stable, timestamp, scores: { type, confidence }[] }
//                     ExpressionType ANGRY = 1, SURPRISE = 8; confidence 0–100
// Fields are camelCase; timestamps are epoch µs typed number | Long. Each
// array can hold several samples per packet, each with its own timestamp.
//
// Only the 19 landmark points BrowUp measures are kept (no full mesh), and
// of the expression scores only SURPRISE and ANGRY (for the agreement test).

import type { BlinkSample, ExpressionSample, FacePoints, FaceSample, Point } from '../types';
import { LM, KEPT_INDICES } from '../face/landmarkIndex';
import { LANDMARKS } from '../../config/thresholds';

type LongLike = number | { toNumber(): number } | null | undefined;

/** The structural subset of presage.smartspectra.IMetrics we read. */
export interface MetricsLike {
  face?: {
    landmarks?: Array<{ value?: Array<{ x?: number | null; y?: number | null }> | null; stable?: boolean | null; reset?: boolean | null; timestamp?: LongLike }> | null;
    blinking?: Array<{ detected?: boolean | null; stable?: boolean | null; timestamp?: LongLike }> | null;
    expression?: Array<{ stable?: boolean | null; timestamp?: LongLike; scores?: Array<{ type?: number | null; confidence?: number | null }> | null }> | null;
  } | null;
}

export const EXPRESSION_TYPE = { ANGRY: 1, SURPRISE: 8 } as const;

export function toNum(t: LongLike): number {
  if (t === null || t === undefined) return NaN;
  if (typeof t === 'number') return t;
  return t.toNumber();
}

export interface Decoded {
  readonly faces: FaceSample[];
  readonly blinks: BlinkSample[];
  readonly exprs: ExpressionSample[];
  /** Point count of the newest landmark set (layout check). */
  readonly landmarkCount: number;
  /** Full newest set — probe only (index drawing), never recorded. */
  readonly allLandmarks?: Point[];
}

export interface DecodeOptions {
  /** Capture frame size, used if landmarks ever arrive normalised to 0..1
   *  (they arrive in pixels on 3.5.0 — confirmed by Legible). */
  frameW: number;
  frameH: number;
  keepAll?: boolean;
}

export function pickPoints(pts: ReadonlyArray<{ x?: number | null; y?: number | null }>, sx: number, sy: number): FacePoints | null {
  const P = (i: number): Point | null => {
    const p = pts[i];
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x * sx, y: p.y * sy };
  };
  const brow = (idx: readonly number[]) => idx.map(P);
  const browR = brow(LM.BROW_R);
  const browL = brow(LM.BROW_L);
  const rest = [LM.LID_UPPER_R, LM.LID_LOWER_R, LM.LID_UPPER_L, LM.LID_LOWER_L, LM.EYE_OUTER_R, LM.EYE_INNER_R, LM.EYE_OUTER_L, LM.EYE_INNER_L, LM.NOSE].map(P);
  if (browR.some((p) => !p) || browL.some((p) => !p) || rest.some((p) => !p)) return null;
  const [lidUpperR, lidLowerR, lidUpperL, lidLowerL, eyeOuterR, eyeInnerR, eyeOuterL, eyeInnerL, nose] = rest as Point[];
  return {
    browR: browR as Point[], browL: browL as Point[],
    lidUpperR: lidUpperR!, lidLowerR: lidLowerR!, lidUpperL: lidUpperL!, lidLowerL: lidLowerL!,
    eyeOuterR: eyeOuterR!, eyeInnerR: eyeInnerR!, eyeOuterL: eyeOuterL!, eyeInnerL: eyeInnerL!, nose: nose!,
  };
}

const MAX_INDEX = Math.max(...KEPT_INDICES);

export function decodeMetricsLike(m: MetricsLike, o: DecodeOptions): Decoded {
  const faces: FaceSample[] = [];
  let landmarkCount = 0;
  let allLandmarks: Point[] | undefined;
  for (const lm of m.face?.landmarks ?? []) {
    const pts = lm.value ?? [];
    landmarkCount = pts.length;
    const t = toNum(lm.timestamp);
    if (!Number.isFinite(t) || pts.length < Math.min(LANDMARKS.COUNT, MAX_INDEX + 1)) continue;
    const probe = pts[LM.NOSE];
    const normalised = !!probe && Math.abs(probe.x ?? 0) <= 1.5 && Math.abs(probe.y ?? 0) <= 1.5;
    const sx = normalised ? o.frameW : 1;
    const sy = normalised ? o.frameH : 1;
    if (o.keepAll) allLandmarks = pts.map((p) => ({ x: (p.x ?? NaN) * sx, y: (p.y ?? NaN) * sy }));
    const points = pickPoints(pts, sx, sy);
    if (!points) continue;
    faces.push({ t, points, stable: lm.stable !== false, reset: lm.reset === true });
  }
  const blinks: BlinkSample[] = [];
  for (const b of m.face?.blinking ?? []) {
    const t = toNum(b.timestamp);
    if (Number.isFinite(t)) blinks.push({ t, detected: b.detected === true });
  }
  const exprs: ExpressionSample[] = [];
  for (const e of m.face?.expression ?? []) {
    const t = toNum(e.timestamp);
    if (!Number.isFinite(t)) continue;
    let surprise = NaN;
    let anger = NaN;
    for (const s of e.scores ?? []) {
      if (s.type === EXPRESSION_TYPE.SURPRISE && typeof s.confidence === 'number') surprise = s.confidence;
      if (s.type === EXPRESSION_TYPE.ANGRY && typeof s.confidence === 'number') anger = s.confidence;
    }
    if (Number.isFinite(surprise) && Number.isFinite(anger)) exprs.push({ t, surprise, anger });
  }
  return { faces, blinks, exprs, landmarkCount, ...(allLandmarks ? { allLandmarks } : {}) };
}
