// Marker rules on synthetic fixtures (AGENT_PROMPT §12: "100% correct
// verdicts on marker fixtures"): correct, late start, early drop, missing,
// hidden, blink storm — per marker.

import { describe, expect, test } from 'vitest';
import { blinkAt, hold, shake } from '../../src/synth/face';
import { attempt, calibrate } from './helpers';
import { VC } from '../../src/sensing/codes';

const W = 4; // window seconds

describe('yes/no question (raised brows)', () => {
  test('raised and held → HELD', () => {
    const v = attempt('yn', (s) => ({ raise: 0.18 * hold(s, 0.1, W + 1) }));
    expect(v.kind).toBe('HELD');
    expect(v.coverage).toBeGreaterThan(0.9);
    expect(v.tip).toMatch(/clear yes\/no/);
  });
  test('flat brows → MISSING', () => {
    const v = attempt('yn', () => ({}));
    expect(v.kind).toBe('MISSING');
    expect(v.coverage).toBeLessThan(0.05);
  });
  test('raised only after 45% → STARTED LATE', () => {
    expect(attempt('yn', (s) => ({ raise: 0.18 * hold(s, W * 0.45, W + 1) })).kind).toBe('STARTED_LATE');
  });
  test('dropped at 65% → DROPPED AT END', () => {
    const v = attempt('yn', (s) => ({ raise: 0.18 * hold(s, 0.1, W * 0.65) }));
    expect(v.kind).toBe('DROPPED_AT_END');
    expect(v.tip).toMatch(/until the last sign/);
  });
  test('dip in the middle → NOT HELD', () => {
    const v = attempt('yn', (s) => ({ raise: 0.18 * (hold(s, 0.1, W * 0.35) + hold(s, W * 0.75, W + 1)) }));
    expect(v.kind).toBe('NOT_HELD');
  });
  test('furrowed on a yes/no prompt → MISSING, and the tip names the wh-marker', () => {
    const v = attempt('yn', () => ({ lower: 0.12, pull: 0.1 }));
    expect(v.kind).toBe('MISSING');
    expect(v.instead).toBe('wh');
    expect(v.tip).toMatch(/wh-question/);
  });
  test('hands over the face half the time → NOT SEEN (no verdict)', () => {
    const v = attempt('yn', (s) => ({ raise: 0.18, visible: Math.floor(s / 0.5) % 2 === 0 }));
    expect(v.kind).toBe('NOT_SEEN');
    expect(v.validFraction).toBeLessThan(0.6);
    expect(v.tip).toMatch(/hands below your eyebrows/);
  });
  test('blink storm with still brows never produces a raise', () => {
    const blinks = Array.from({ length: 12 }, (_, i) => 0.2 + i * 0.33);
    const v = attempt('yn', (s) => ({ blink: blinkAt(s, blinks) }), { blinkBrowArtifact: 0.4 });
    expect(['MISSING', 'NOT_SEEN']).toContain(v.kind);
    expect(v.series.points.filter((p) => p.present)).toHaveLength(0);
  });
  test('occasional blinks during a held raise still give HELD', () => {
    const v = attempt('yn', (s) => ({ raise: 0.18 * hold(s, 0.1, W + 1), blink: blinkAt(s, [1.2, 2.9]) }));
    expect(v.kind).toBe('HELD');
  });
  test('a low camera frame rate (18 fps) does not change the verdict', () => {
    expect(attempt('yn', (s) => ({ raise: 0.18 * hold(s, 0.1, W + 1) }), { fps: 18 }).kind).toBe('HELD');
  });
  test('FRAME_RATE_TOO_LOW does not hide frames; TOO_DARK does', () => {
    expect(attempt('yn', (s) => ({ raise: 0.18 * hold(s, 0.1, W + 1), code: VC.kFrameRateTooLow })).kind).toBe('HELD');
    expect(attempt('yn', (s) => ({ raise: 0.18, code: VC.kTooDark })).kind).toBe('NOT_SEEN');
  });
});

describe('wh-question (furrowed brows)', () => {
  const furrow = (k: number) => ({ lower: 0.12 * k, pull: 0.1 * k });
  test('furrowed and held → HELD', () => {
    expect(attempt('wh', (s) => furrow(hold(s, 0.1, W + 1))).kind).toBe('HELD');
  });
  test('neutral → MISSING', () => {
    expect(attempt('wh', () => ({})).kind).toBe('MISSING');
  });
  test('a squint during the furrow is not mistaken for a blink', () => {
    expect(attempt('wh', (s) => ({ ...furrow(hold(s, 0.1, W + 1)), blink: 0.6 * hold(s, 0.1, W + 1) }), { blinkBrowArtifact: 0 }).kind).toBe('HELD');
  });
  test('lowered without drawing together → MISSING (both parts are required)', () => {
    expect(attempt('wh', () => ({ lower: 0.12 })).kind).toBe('MISSING');
  });
  test('late → STARTED LATE; early drop → DROPPED AT END', () => {
    expect(attempt('wh', (s) => furrow(hold(s, W * 0.45, W + 1))).kind).toBe('STARTED_LATE');
    expect(attempt('wh', (s) => furrow(hold(s, 0.1, W * 0.65))).kind).toBe('DROPPED_AT_END');
  });
  test('raised on a wh prompt → tip names the yes/no marker', () => {
    const v = attempt('wh', () => ({ raise: 0.18 }));
    expect(v.instead).toBe('yn');
  });
});

describe('negation (head shake)', () => {
  test('shake across the sentence → HELD', () => {
    const v = attempt('neg', (s) => ({ yaw: shake(s, 0, W + 1, 12) }));
    expect(v.kind).toBe('HELD');
    expect(v.series.unit).toBe('degrees');
  });
  test('still head → MISSING', () => {
    expect(attempt('neg', () => ({})).kind).toBe('MISSING');
  });
  test('shake only at the start → DROPPED AT END', () => {
    expect(attempt('neg', (s) => ({ yaw: shake(s, 0, W * 0.35, 12) })).kind).toBe('DROPPED_AT_END');
  });
  test('shake only at the end → STARTED LATE', () => {
    expect(attempt('neg', (s) => ({ yaw: shake(s, W * 0.65, W + 1, 12) })).kind).toBe('STARTED_LATE');
  });
  test('a single turn is not a shake', () => {
    expect(attempt('neg', (s) => ({ yaw: 14 * hold(s, 1, 2) })).kind).toBe('MISSING');
  });
  test('tiny head wobble below the amplitude → MISSING', () => {
    expect(attempt('neg', (s) => ({ yaw: shake(s, 0, W + 1, 1.5) })).kind).toBe('MISSING');
  });
  test('FACE_NOT_FORWARD during the shake does not hide head frames', () => {
    expect(attempt('neg', (s) => ({ yaw: shake(s, 0, W + 1, 12), code: VC.kFaceNotForward })).kind).toBe('HELD');
  });
  test('blinks during a shake do not matter', () => {
    const v = attempt('neg', (s) => ({ yaw: shake(s, 0, W + 1, 12), blink: blinkAt(s, [0.5, 1.4, 2.2, 3.1]) }));
    expect(v.kind).toBe('HELD');
  });
  test('a nod on a negation prompt → tip names the nod', () => {
    const v = attempt('neg', (s) => ({ pitch: shake(s, 0, W + 1, 10) }));
    expect(v.kind).toBe('MISSING');
    expect(v.instead).toBe('aff');
  });
});

describe('affirmation (nod)', () => {
  test('nod across the sentence → HELD', () => {
    expect(attempt('aff', (s) => ({ pitch: shake(s, 0, W + 1, 9, 1.8) })).kind).toBe('HELD');
  });
  test('still → MISSING', () => {
    expect(attempt('aff', () => ({})).kind).toBe('MISSING');
  });
});

describe('topic (raised brows on the topic, relaxed on the comment)', () => {
  test('raised for the topic, down for the comment → HELD', () => {
    const v = attempt('topic', (s) => ({ raise: 0.18 * hold(s, 0, W * 0.48) }), { split: 0.5 });
    expect(v.kind).toBe('HELD');
    expect(v.series.splitS).toBeGreaterThan(0);
  });
  test('kept up through the comment → KEPT UP', () => {
    expect(attempt('topic', () => ({ raise: 0.18 }), { split: 0.5 }).kind).toBe('KEPT_UP');
  });
  test('never raised → MISSING', () => {
    expect(attempt('topic', () => ({}), { split: 0.5 }).kind).toBe('MISSING');
  });
});

describe('personal thresholds', () => {
  test('a learner with small brow movement can still get HELD after calibration', () => {
    const small = calibrate({ raise: 0.07 });
    const sign = (s: number) => ({ raise: 0.06 * hold(s, 0.1, W + 1) });
    expect(attempt('yn', sign, { profile: small }).kind).toBe('HELD');
    // With the population default (8%), the same face is MISSING.
    expect(attempt('yn', sign, { profile: null }).kind).not.toBe('HELD');
  });
});

describe('timeline', () => {
  test('summary is plain text and spans are inside the window', () => {
    const v = attempt('yn', (s) => ({ raise: 0.18 * hold(s, 0.1, W * 0.6) }));
    expect(v.summary).toMatch(/Brows raised for \d+% of the sentence/);
    for (const [a, b] of v.series.presentSpans) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(v.series.durationS + 1e-9);
    }
  });
});
