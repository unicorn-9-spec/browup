// Decode, features, calibration, recording round trip, replay determinism,
// prompt timing, review scoring and the capture controller.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { decodeMetricsLike } from '../../src/sensing/decode';
import { compactEvent, expandEvent } from '../../src/sensing/record';
import { parseRecording, pickClip, ReplayCursor, eventsIn } from '../../src/sensing/replay';
import { FeatureExtractor, applyBlinkMask, resampleWindow } from '../../src/face/features';
import { thresholdsFor } from '../../src/face/calibration';
import { feedAll } from '../../src/sensing/pipeline';
import { SynthFace, NEUTRAL, synthStream } from '../../src/synth/face';
import { buildReplay } from '../../src/synth/session';
import { promptTiming } from '../../src/lesson/timing';
import { reviewDeck, scoreByMarker, shuffle } from '../../src/lesson/review';
import { CaptureController } from '../../src/lesson/controller';
import { judge } from '../../src/verdict/engine';
import { errorForSdk, validationBanner } from '../../src/sensing/errors';
import { EC, VC } from '../../src/sensing/codes';
import { calibrate, standardProfile, T0 } from './helpers';
import { readFileSync } from 'node:fs';
import { checkPack } from '../../content/validate';

describe('decode', () => {
  test('keeps the 19 points, blink flags and only SURPRISE/ANGRY scores; Long timestamps', () => {
    const pts = Array.from({ length: 478 }, (_, i) => ({ x: i, y: 1000 + i }));
    const d = decodeMetricsLike({
      face: {
        landmarks: [{ value: pts, stable: true, reset: true, timestamp: { toNumber: () => 1000 } }],
        blinking: [{ detected: true, timestamp: 1000 }],
        expression: [{ timestamp: 1000, scores: [{ type: 8, confidence: 61 }, { type: 1, confidence: 3 }, { type: 5, confidence: 30 }] }],
      },
    }, { frameW: 1280, frameH: 720 });
    expect(d.faces).toHaveLength(1);
    expect(d.faces[0]!.reset).toBe(true);
    expect(d.faces[0]!.points.nose).toEqual({ x: 1, y: 1001 });
    expect(d.faces[0]!.points.browR[2]).toEqual({ x: 105, y: 1105 });
    expect(d.faces[0]!.points.browL[4]).toEqual({ x: 336, y: 1336 });
    expect(d.blinks).toEqual([{ t: 1000, detected: true }]);
    expect(d.exprs).toEqual([{ t: 1000, surprise: 61, anger: 3 }]);
  });
  test('normalised coordinates are scaled to pixels; short sets are ignored', () => {
    const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.25 }));
    expect(decodeMetricsLike({ face: { landmarks: [{ value: pts, timestamp: 1 }] } }, { frameW: 1280, frameH: 720 }).faces[0]!.points.nose).toEqual({ x: 640, y: 180 });
    expect(decodeMetricsLike({ face: { landmarks: [{ value: pts.slice(0, 68), timestamp: 1 }] } }, { frameW: 1, frameH: 1 }).faces).toHaveLength(0);
  });
});

describe('features', () => {
  test('brow height is independent of distance from the camera', () => {
    const near = new SynthFace({ scale: 220, jitterPx: 0 });
    const far = new SynthFace({ scale: 110, jitterPx: 0 });
    const x1 = new FeatureExtractor(null);
    const x2 = new FeatureExtractor(null);
    const a = x1.push({ t: 1, points: near.points({ ...NEUTRAL, raise: 0.15 }), stable: true, reset: false }).raw!;
    const b = x2.push({ t: 1, points: far.points({ ...NEUTRAL, raise: 0.15 }), stable: true, reset: false }).raw!;
    expect(a.brow).toBeCloseTo(b.brow, 3);
  });
  test('head roll does not read as a brow raise', () => {
    const f = new SynthFace({ jitterPx: 0 });
    const x = new FeatureExtractor(null);
    const level = x.push({ t: 1, points: f.points(NEUTRAL), stable: true, reset: false }).raw!;
    const rolled = x.push({ t: 2, points: f.points({ ...NEUTRAL, roll: 12 }), stable: true, reset: false }).raw!;
    expect(Math.abs(rolled.brow - level.brow) / level.brow).toBeLessThan(0.02);
  });
  test('resting jitter stays under 2% (T4.1 acceptance)', () => {
    const p = standardProfile();
    const x = new FeatureExtractor(p);
    const frames = feedAll(x, synthStream(() => NEUTRAL, 5, T0));
    const vals = frames.filter((f) => f.validBrow).map((f) => Math.abs(f.browRel));
    expect(Math.max(...vals)).toBeLessThan(0.02);
  });
  test('the blink mask covers ±2 frames', () => {
    const base = feedAll(new FeatureExtractor(standardProfile()), synthStream(() => NEUTRAL, 1, T0));
    const frames = base.map((f, i) => ({ ...f, blink: i === 10, validBrow: true }));
    const m = applyBlinkMask(frames);
    expect(m.slice(8, 13).every((f) => !f.validBrow)).toBe(true);
    expect(m[7]!.validBrow && m[13]!.validBrow).toBe(true);
  });
  test('a covered lens leaves gaps that resampling counts as hidden time', () => {
    const x = new FeatureExtractor(standardProfile());
    const frames = feedAll(x, synthStream((s) => ({ ...NEUTRAL, visible: s < 1 || s > 3 }), 4, T0));
    const grid = resampleWindow(frames, T0, T0 + 4e6);
    const hidden = grid.filter((f) => !f.validBrow).length / grid.length;
    expect(hidden).toBeGreaterThan(0.4);
    expect(hidden).toBeLessThan(0.6);
  });
});

describe('calibration', () => {
  test('personal thresholds scale with the learner, within the floors and the PLAN defaults', () => {
    const big = thresholdsFor(calibrate({ raise: 0.3 }));
    const small = thresholdsFor(calibrate({ raise: 0.07 }));
    expect(big.raise).toBeCloseTo(0.08, 2); // capped by the PLAN default
    expect(small.raise).toBeLessThan(0.05);
    expect(small.raise).toBeGreaterThanOrEqual(0.03);
    expect(big.personal).toBe(true);
    expect(thresholdsFor(null).raise).toBe(0.08);
  });
  test('the nod step measures the head-pitch slope (clamped)', () => {
    const p = calibrate();
    expect(p.browPitchSlope).toBeGreaterThan(0.005);
    expect(p.browPitchSlope).toBeLessThanOrEqual(0.025);
  });
  test('a movement too small for the resting noise is flagged weak and falls back to defaults', () => {
    const p = calibrate({ raise: 0.004 });
    expect(p.weak).toContain('raise');
    expect(thresholdsFor(p).raise).toBeCloseTo(0.08, 2);
  });
});

describe('recording and replay', () => {
  test('compact round trip keeps every field', () => {
    const ev = synthStream(() => NEUTRAL, 0.2, T0, { expressions: true });
    for (const e of ev) {
      const back = expandEvent(JSON.parse(JSON.stringify(compactEvent(e))) as Record<string, unknown>)!;
      expect(back.kind).toBe(e.kind);
      expect(back.recvUs).toBe(e.recvUs);
    }
  });
  test('the bundled replay reproduces every intended verdict (F12: same verdicts as the original)', () => {
    const text = readFileSync('fixtures/replay/demo.jsonl', 'utf8');
    const rec = parseRecording(text);
    const pack = checkPack(JSON.parse(readFileSync('content/asl/pack.json', 'utf8'))).pack!;
    expect(rec.header.synthetic).toBe(true);
    expect(rec.header.clips.length).toBeGreaterThanOrEqual(50);
    const th = thresholdsFor(rec.header.profile);
    for (const clip of rec.header.clips) {
      const prompt = pack.prompts.find((p) => p.id === clip.promptId)!;
      // Replay the clip at an arbitrary "now", exactly as the app does.
      const now = 1_900_000_000_000_000;
      const cur = new ReplayCursor(eventsIn(rec, clip.startUs, clip.endUs), clip.startUs, now);
      const shifted = cur.due(Number.MAX_SAFE_INTEGER);
      const x = new FeatureExtractor(rec.header.profile);
      const frames = feedAll(x, shifted);
      const t = promptTiming(prompt, 'auto');
      const v = judge({ frames, startUs: cur.map(clip.windowStartUs), endUs: cur.map(clip.windowEndUs), marker: clip.marker, part: t.part, ...(t.split !== undefined ? { split: t.split } : {}), thresholds: th });
      const expected = /held to the end|held$|across the|nodding across|relaxed for the comment/.test(clip.label) ? 'HELD' : null;
      if (expected) expect(v.kind, clip.id).toBe('HELD');
      else expect(v.kind, clip.id).not.toBe('HELD');
    }
  });
  test('pickClip: prompt match first, cycling variants on retries', () => {
    const { header } = buildReplay([{ id: 'yn-x', marker: 'yn', gloss: ['YOU', 'HUNGRY'], span: [0, 1] }]);
    expect(pickClip(header.clips, 'yn', 'yn-x', 0)!.label).toMatch(/flat brows/);
    expect(pickClip(header.clips, 'yn', 'yn-x', 1)!.label).toMatch(/held/);
    expect(pickClip(header.clips, 'wh', undefined, 0)).toBeNull();
  });
});

describe('prompt timing', () => {
  test('window from gloss length (3–5 s) and the marked part from the span', () => {
    expect(promptTiming({ marker: 'yn', gloss: ['YOU', 'HUNGRY'], span: [0, 1] }).windowS).toBe(3);
    expect(promptTiming({ marker: 'wh', gloss: ['A', 'B', 'C', 'D', 'E'], span: [0, 4] }).windowS).toBe(5);
    expect(promptTiming({ marker: 'neg', gloss: ['TOMORROW', 'ME', 'NOT', 'GO', 'SCHOOL'], span: [1, 4] }).part).toEqual([0.2, 1]);
    expect(promptTiming({ marker: 'topic', gloss: ['COFFEE', 'ME', 'LIKE'], span: [0, 0], split: 1 }).split).toBeCloseTo(1 / 3);
    expect(promptTiming({ marker: 'yn', gloss: ['YOU', 'HUNGRY'], span: [0, 1] }, 6.5).windowS).toBe(6.5);
    expect(promptTiming({ marker: 'yn', gloss: ['YOU', 'HUNGRY'], span: [0, 1] }, 12).windowS).toBe(7);
  });
});

describe('review', () => {
  test('the shuffle is seeded (reproducible) and the deck mixes four markers', () => {
    expect(shuffle([1, 2, 3, 4, 5], 7)).toEqual(shuffle([1, 2, 3, 4, 5], 7));
    const pack = checkPack(JSON.parse(readFileSync('content/asl/pack.json', 'utf8'))).pack!;
    const deck = reviewDeck(pack.prompts, 3);
    expect(new Set(deck.map((p) => p.marker))).toEqual(new Set(['yn', 'wh', 'neg', 'aff']));
  });
  test('score counts a right pick AND a HELD verdict; NOT SEEN is not counted', () => {
    const s = scoreByMarker([
      { at: '', promptId: 'a', marker: 'yn', verdict: 'HELD', coveragePct: 90, validPct: 99, mode: 'review', pickedRight: true },
      { at: '', promptId: 'b', marker: 'yn', verdict: 'HELD', coveragePct: 90, validPct: 99, mode: 'review', pickedRight: false },
      { at: '', promptId: 'c', marker: 'yn', verdict: 'NOT_SEEN', coveragePct: 0, validPct: 20, mode: 'review', pickedRight: true },
    ]);
    expect(s.find((x) => x.marker === 'yn')).toEqual({ marker: 'yn', attempts: 2, picked: 1, correct: 1 });
  });
});

describe('capture controller', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  test('3-2-1 countdown, window, then judge after the settle time', () => {
    let now = 0;
    const ticks: number[] = [];
    const finish = vi.fn();
    const c = new CaptureController({ now: () => now, begin: (go, w) => ({ startUs: go, endUs: go + w * 1e6 }), tick: (n) => ticks.push(n), finish });
    c.start(4);
    expect(c.phase).toBe('countdown');
    vi.advanceTimersByTime(3000); now = 3e6;
    expect(ticks).toEqual([3, 2, 1, 0]);
    expect(c.phase).toBe('capturing');
    vi.advanceTimersByTime(4000);
    expect(c.phase).toBe('judging');
    vi.advanceTimersByTime(300);
    expect(finish).toHaveBeenCalledWith(3e6, 7e6);
  });
  test('Space ends early (not before 1.5 s); cancel gives no verdict', () => {
    let now = 0;
    const finish = vi.fn();
    const c = new CaptureController({ now: () => now, begin: (go, w) => ({ startUs: go, endUs: go + w * 1e6 }), finish });
    c.start(5);
    vi.advanceTimersByTime(3000); now = 3e6;
    now = 3.5e6; c.endEarly();
    expect(c.phase).toBe('capturing');
    now = 5e6; c.endEarly();
    vi.advanceTimersByTime(300);
    expect(finish).toHaveBeenCalledWith(3e6, 5e6);
    const c2 = new CaptureController({ now: () => now, begin: (go, w) => ({ startUs: go, endUs: go + w * 1e6 }), finish: vi.fn() });
    c2.start(4); c2.cancel();
    vi.advanceTimersByTime(10_000);
    expect(c2.phase).toBe('idle');
  });
});

describe('errors', () => {
  test('every SDK error code maps to a message with a way on', () => {
    for (const code of Object.values(EC)) {
      const e = errorForSdk(code, true);
      expect(e.title.length).toBeGreaterThan(3);
      expect(e.actions.length).toBeGreaterThan(0);
    }
    expect(errorForSdk(EC.kAuthenticationFailed, false).actions).toContain('setup');
    expect(errorForSdk(EC.kCreditExhausted, false).body).toMatch(/credit/);
  });
  test('validation banners: friendly words; frame rate and motion never shown', () => {
    expect(validationBanner(VC.kNoFaceFound)).toMatch(/face/);
    expect(validationBanner(VC.kFrameRateTooLow)).toBeNull();
    expect(validationBanner(VC.kExcessiveMotion)).toBeNull();
  });
});
