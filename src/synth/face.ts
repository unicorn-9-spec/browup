// Synthetic face generator for unit tests, fixtures and the bundled replay
// demo. It produces the same landmark subset the decoder keeps, from a small
// 3-D template (units: outer-eye distance = 1) that can raise / furrow the
// brows, blink, and turn the head, plus pixel jitter, dropped frames and
// validation codes. Everything it makes is labelled synthetic wherever it is
// shown (REPLAY banner: "synthetic demo data").
//
// Template coordinates are approximate MediaPipe canonical-face positions;
// x grows to the image right (the signer's left side), y grows down, z
// towards the camera.

import type { BlinkSample, ExpressionSample, FacePoints, FaceSample, Point, Us } from '../types';

type P3 = readonly [number, number, number];

// Brow points sit well in front of the eye corners (brow ridge). The depth
// is set so head pitch changes the measured brow height by ~1.5–2% per
// degree, as measured on a real face in the face check (23 Nov 2026).
const BROW_R: P3[] = [[-0.56, -0.2, 0.2], [-0.46, -0.27, 0.25], [-0.35, -0.3, 0.28], [-0.24, -0.29, 0.3], [-0.12, -0.24, 0.31]];
const mirror = (p: P3): P3 => [-p[0], p[1], p[2]];
const T = {
  browR: BROW_R,
  browL: BROW_R.map(mirror),
  lidUpperR: [-0.33, -0.055, 0.05] as P3,
  lidLowerR: [-0.33, 0.045, 0.05] as P3,
  lidUpperL: [0.33, -0.055, 0.05] as P3,
  lidLowerL: [0.33, 0.045, 0.05] as P3,
  eyeOuterR: [-0.5, 0, 0] as P3,
  eyeInnerR: [-0.17, 0.01, 0.03] as P3,
  eyeOuterL: [0.5, 0, 0] as P3,
  eyeInnerL: [0.17, 0.01, 0.03] as P3,
  nose: [0, 0.5, 0.42] as P3,
};
/** Brow height above the eye-corner line in the template (face units). */
const BROW_H = 0.28;

export interface FaceState {
  /** Brow raise as a fraction of the neutral brow height (0.15 = 15%). */
  raise: number;
  /** Brow lowering as a fraction (0.1 = 10% lower). */
  lower: number;
  /** Inner brows drawn together, as a fraction of the inner gap. */
  pull: number;
  /** 0 = open, 1 = closed. */
  blink: number;
  /** Degrees. +yaw = nose towards image right; +pitch = chin up. */
  yaw: number;
  pitch: number;
  roll: number;
  /** false = no landmarks this frame (hands over the face, out of view). */
  visible: boolean;
  /** Validation code in effect (0 = OK). */
  code: number;
}

export const NEUTRAL: FaceState = { raise: 0, lower: 0, pull: 0, blink: 0, yaw: 0, pitch: 0, roll: 0, visible: true, code: 0 };

/** Deterministic PRNG (mulberry32) + Gaussian. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    const u = Math.max(1e-9, next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, gauss };
}

export interface SynthOptions {
  /** Pixels per face unit (≈ outer-eye distance in px). 160 ≈ sitting at a laptop. */
  scale?: number;
  cx?: number;
  cy?: number;
  /** Landmark jitter, pixels (1 σ). */
  jitterPx?: number;
  seed?: number;
  /** Brow movement that the mesh adds during a blink (fraction of brow
   *  height). Positive = brows appear to rise — the false raise the blink
   *  mask exists to stop. */
  blinkBrowArtifact?: number;
}

function rotate(p: P3, yaw: number, pitch: number, roll: number): P3 {
  // Rotate about a head centre behind the eyes.
  const c: P3 = [0, 0.25, -0.75];
  let x = p[0] - c[0];
  let y = p[1] - c[1];
  let z = p[2] - c[2];
  const ry = (yaw * Math.PI) / 180;
  const rp = (pitch * Math.PI) / 180;
  const rr = (roll * Math.PI) / 180;
  // yaw about y: +yaw moves the nose (z>0) to +x.
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  // pitch about x: chin up moves the nose tip (z>0) up the image (−y).
  [y, z] = [y * Math.cos(rp) - z * Math.sin(rp), y * Math.sin(rp) + z * Math.cos(rp)];
  // roll in the image plane.
  [x, y] = [x * Math.cos(rr) - y * Math.sin(rr), x * Math.sin(rr) + y * Math.cos(rr)];
  return [x + c[0], y + c[1], z + c[2]];
}

export class SynthFace {
  private readonly r: ReturnType<typeof rng>;
  private readonly o: Required<SynthOptions>;

  constructor(o: SynthOptions = {}) {
    this.o = { scale: 160, cx: 640, cy: 330, jitterPx: 0.35, seed: 1, blinkBrowArtifact: 0.12, ...o };
    this.r = rng(this.o.seed);
  }

  points(s: FaceState): FacePoints {
    const { scale, cx, cy, jitterPx, blinkBrowArtifact } = this.o;
    const browDy = -BROW_H * (s.raise - s.lower + blinkBrowArtifact * s.blink);
    const proj = (p: P3): Point => {
      const q = rotate(p, s.yaw, s.pitch, s.roll);
      return { x: cx + q[0] * scale + this.r.gauss() * jitterPx, y: cy + q[1] * scale + this.r.gauss() * jitterPx };
    };
    const brow = (pts: P3[]) => pts.map((p, i) => {
      // Inner points (index 3, 4) move towards the midline when furrowing.
      const pullK = i === 4 ? 1 : i === 3 ? 0.6 : 0;
      const x = p[0] * (1 - s.pull * pullK * 1.2);
      return proj([x, p[1] + browDy, p[2]]);
    });
    const lidUp = (u: P3, l: P3): P3 => [u[0], u[1] + (l[1] - u[1]) * s.blink - 0.01 * s.raise / 0.15, u[2]];
    return {
      browR: brow(T.browR),
      browL: brow(T.browL),
      lidUpperR: proj(lidUp(T.lidUpperR, T.lidLowerR)),
      lidLowerR: proj(T.lidLowerR),
      lidUpperL: proj(lidUp(T.lidUpperL, T.lidLowerL)),
      lidLowerL: proj(T.lidLowerL),
      eyeOuterR: proj(T.eyeOuterR),
      eyeInnerR: proj(T.eyeInnerR),
      eyeOuterL: proj(T.eyeOuterL),
      eyeInnerL: proj(T.eyeInnerL),
      nose: proj(T.nose),
    };
  }
}

/** One synthetic SDK-like event stream (what the decoder would emit). */
export type SynthEvent =
  | { readonly kind: 'face'; readonly recvUs: Us; readonly sample: FaceSample }
  | { readonly kind: 'blink'; readonly recvUs: Us; readonly sample: BlinkSample }
  | { readonly kind: 'expr'; readonly recvUs: Us; readonly sample: ExpressionSample }
  | { readonly kind: 'validation'; readonly recvUs: Us; readonly tsUs: Us; readonly code: number; readonly hint: string };

export interface StreamOptions extends SynthOptions {
  /** Frames per second delivered (Legible measured 22–25 on this laptop). */
  fps?: number;
  /** Timing jitter, ms (1 σ). */
  timingJitterMs?: number;
  /** Delivery delay, ms. */
  delayMs?: number;
  /** Include expression samples (SURPRISE ~ raise, ANGRY ~ furrow). */
  expressions?: boolean;
}

/** Renders a scripted face over [0, durationS) starting at t0 (µs). */
export function synthStream(script: (s: number) => FaceState, durationS: number, t0: Us, o: StreamOptions = {}): SynthEvent[] {
  const fps = o.fps ?? 24;
  const face = new SynthFace(o);
  const r = rng((o.seed ?? 1) + 7);
  const out: SynthEvent[] = [];
  let lastCode = -1;
  let first = true;
  for (let i = 0; ; i++) {
    const s = i / fps + (r.gauss() * (o.timingJitterMs ?? 3)) / 1000;
    if (s >= durationS) break;
    const st = script(Math.max(0, s));
    const t = Math.round(t0 + Math.max(0, s) * 1e6);
    const recv = t + (o.delayMs ?? 40) * 1000;
    if (st.code !== lastCode) {
      out.push({ kind: 'validation', recvUs: recv, tsUs: t, code: st.code, hint: st.code ? 'synthetic' : '' });
      lastCode = st.code;
    }
    if (!st.visible) { first = true; continue; }
    out.push({ kind: 'blink', recvUs: recv, sample: { t, detected: st.blink > 0.8 } }); // a blink = eye (nearly) closed
    if (o.expressions) {
      const noise = () => Math.abs(r.gauss()) * 4;
      out.push({ kind: 'expr', recvUs: recv, sample: {
        t,
        surprise: Math.min(100, Math.max(0, st.raise * 350 + noise())),
        anger: Math.min(100, Math.max(0, (st.lower + st.pull) * 250 + noise())),
      } });
    }
    out.push({ kind: 'face', recvUs: recv, sample: { t, points: face.points(st), stable: true, reset: first } });
    first = false;
  }
  return out;
}

// ── Script helpers ───────────────────────────────────────────────────────
/** Smooth 0→1 ramp between a and b (seconds). */
export const ramp = (s: number, a: number, b: number) => (s <= a ? 0 : s >= b ? 1 : 0.5 - 0.5 * Math.cos(((s - a) / (b - a)) * Math.PI));
/** 1 inside [a, b] with smooth edges of width e. */
export const hold = (s: number, a: number, b: number, e = 0.15) => ramp(s, a - e, a) * (1 - ramp(s, b, b + e));
/** Blink envelope around each time in `at`: fully closed for ~70 ms, with
 *  ~55 ms closing and opening ramps (a real blink lasts 100–200 ms). */
export const blinkAt = (s: number, at: readonly number[]) =>
  Math.max(0, ...at.map((c) => Math.max(0, Math.min(1, (0.09 - Math.abs(s - c)) / 0.055))));
/** Side-to-side oscillation with amplitude A degrees and f Hz inside [a, b]. */
export const shake = (s: number, a: number, b: number, A: number, f = 2.2) => hold(s, a, b, 0.1) * A * Math.sin(2 * Math.PI * f * (s - a));
