// Per-frame geometry from the kept landmarks. Pure functions.
//
// Everything is divided by the outer-eye distance (33–263), so the numbers
// do not depend on how far the learner sits (PLAN §2). Vertical distances
// are measured along the face's own "down" axis (perpendicular to the eye
// line), so tilting the head sideways does not read as a brow movement.

import { FEATURES } from '../../config/thresholds';
import type { FacePoints, Point, RawFeatures } from '../types';
import { BROW_MEASURE_SLOTS } from './landmarkIndex';

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Unit vectors of the face frame: `across` from the signer's right eye to
 *  the left eye, `down` towards the chin. */
export function faceAxes(p: FacePoints): { across: Point; down: Point; e: number } | null {
  const ex = p.eyeOuterL.x - p.eyeOuterR.x;
  const ey = p.eyeOuterL.y - p.eyeOuterR.y;
  const e = Math.hypot(ex, ey);
  if (!(e > 4)) return null;
  const across = { x: ex / e, y: ey / e };
  // Perpendicular, oriented so it points down the image (towards the chin).
  let down = { x: -across.y, y: across.x };
  if (down.y < 0) down = { x: -down.x, y: -down.y };
  return { across, down, e };
}

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

/** Height of one brow above its reference, in pixels along the face's
 *  vertical axis (positive = brow above the reference). */
function sideBrowHeight(brow: readonly Point[], ref: Point, down: Point): number {
  let sum = 0;
  for (const slot of BROW_MEASURE_SLOTS) sum += dot(sub(ref, brow[slot]!), down);
  return sum / BROW_MEASURE_SLOTS.length;
}

export function rawFeatures(p: FacePoints, reference = FEATURES.BROW_REFERENCE): RawFeatures | null {
  const ax = faceAxes(p);
  if (!ax) return null;
  const { across, down, e } = ax;
  const refR = reference === 'eyelid' ? p.lidUpperR : mid(p.eyeOuterR, p.eyeInnerR);
  const refL = reference === 'eyelid' ? p.lidUpperL : mid(p.eyeOuterL, p.eyeInnerL);
  const brow = (sideBrowHeight(p.browR, refR, down) + sideBrowHeight(p.browL, refL, down)) / 2 / e;
  const inner = dist(p.browR[4]!, p.browL[4]!) / e;
  const aperture = (Math.abs(dot(sub(p.lidLowerR, p.lidUpperR), down)) +
    Math.abs(dot(sub(p.lidLowerL, p.lidUpperL), down))) / 2 / e;
  const eyeMid = mid(p.eyeOuterR, p.eyeOuterL);
  const off = sub(p.nose, eyeMid);
  const yawRatio = dot(off, across) / e;
  const pitchRatio = dot(off, down) / e;
  const rollDeg = (Math.atan2(across.y, across.x) * 180) / Math.PI;
  if (![brow, inner, aperture, yawRatio, pitchRatio, rollDeg].every(Number.isFinite)) return null;
  return { brow, inner, aperture, yawRatio, pitchRatio, rollDeg, eyeDist: e };
}

/** Both brow references at once (the probe compares them). */
export function browBothReferences(p: FacePoints): { eyeCorners: number; eyelid: number } | null {
  const a = rawFeatures(p, 'eyeCorners');
  const b = rawFeatures(p, 'eyelid');
  return a && b ? { eyeCorners: a.brow, eyelid: b.brow } : null;
}
