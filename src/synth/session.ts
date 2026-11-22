// Builds the bundled synthetic replay (judges can run BrowUp without a
// camera or key) and the synthetic calibration used by tests. Every clip has
// an intended verdict; scripts/make-fixtures.ts checks that the real
// pipeline produces it before writing the file.

import { CAPTURE, COVERAGE } from '../../config/thresholds';
import { buildProfile, furrowInner, measureStep, neutralBaseline, thresholdsFor, type CalStep } from '../face/calibration';
import { FeatureExtractor } from '../face/features';
import { promptTiming } from '../lesson/timing';
import { feedAll } from '../sensing/pipeline';
import type { ReplayClip, ReplayHeader, SenseEvent } from '../sensing/types';
import type { MarkerType, Profile, VerdictKind } from '../types';
import { judge } from '../verdict/engine';
import { blinkAt, hold, NEUTRAL, synthStream, type FaceState, type StreamOptions } from './face';

export const SYNTH_T0 = 1_795_000_000_000_000;

const face = (p: Partial<FaceState> = {}): FaceState => ({ ...NEUTRAL, ...p });

/** Calibrates a synthetic learner through the real calibration code. */
export function calibrateSynthetic(o: StreamOptions = {}, t0 = SYNTH_T0 - 120e6): Profile {
  const x = new FeatureExtractor(null);
  const run = (script: (s: number) => FaceState, dur: number, at: number) => feedAll(x, synthStream(script, dur, at, o));
  const neutral = neutralBaseline(run(() => face(), 5, t0));
  const b = neutral.baseline!;
  const bump = (s: number) => Math.max(0, Math.sin((Math.PI * s) / 1.5));
  const steps: Partial<Record<Exclude<CalStep, 'neutral'>, ReturnType<typeof measureStep>>> = {};
  steps.raise = measureStep('raise', run((s) => face({ raise: 0.2 * bump(s) }), 4.5, t0 + 10e6), b, neutral.mad!);
  const furrowFrames = run((s) => face({ lower: 0.12 * bump(s), pull: 0.1 * bump(s) }), 4.5, t0 + 20e6);
  steps.furrow = measureStep('furrow', furrowFrames, b, neutral.mad!);
  steps.shake = measureStep('shake', run((s) => face({ yaw: 14 * Math.sin(2 * Math.PI * s) }), 3, t0 + 30e6), b, neutral.mad!);
  steps.nod = measureStep('nod', run((s) => face({ pitch: 10 * Math.sin(2 * Math.PI * s) }), 3, t0 + 40e6), b, neutral.mad!);
  return buildProfile(neutral, steps, furrowInner(furrowFrames, b), new Date('2026-11-22T12:00:00Z'))!;
}

export interface PromptLike {
  readonly id: string;
  readonly marker: MarkerType;
  readonly gloss: readonly string[];
  readonly span: readonly [number, number];
  readonly split?: number;
  readonly windowS?: number;
}

interface Variant {
  readonly label: string;
  readonly expect: VerdictKind;
  readonly script: (s: number) => Partial<FaceState>;
}

const PRE_S = 3.4;
const POST_S = 0.6;

/** Natural extras: blinks every ~2.6 s and a slow, small head sway. */
const natural = (s: number, seed: number): Partial<FaceState> => ({
  blink: blinkAt(s, [0.9 + (seed % 5) * 0.3, 3.5 + (seed % 3) * 0.4, 6.1]),
  yaw: 1.2 * Math.sin(2 * Math.PI * 0.25 * s + seed),
  pitch: 0.8 * Math.sin(2 * Math.PI * 0.2 * s + seed * 2),
});

function variants(p: PromptLike, index: number, windowS: number): Variant[] {
  const t = promptTiming(p, 'auto');
  const lead = Math.min(COVERAGE.LEAD_IN_MS / 1000, windowS * 0.25);
  const len = windowS - lead;
  const a = lead + t.part[0] * len; // marked part start (window seconds)
  const b = lead + t.part[1] * len; // marked part end
  const L = b - a;
  const raise = (from: number, to: number) => (s: number) => ({ raise: 0.17 * hold(s, from, to) });
  const furrow = (from: number, to: number) => (s: number) => { const k = hold(s, from, to); return { lower: 0.12 * k, pull: 0.1 * k }; };
  const shakeIn = (from: number, to: number, A: number, f: number, axis: 'yaw' | 'pitch') => (s: number) => {
    const k = hold(s, from, to, 0.1);
    return { [axis]: k * A * Math.sin(2 * Math.PI * f * (s - from)) } as Partial<FaceState>;
  };
  switch (p.marker) {
    case 'yn': {
      const mistakes: Variant[] = [
        { label: 'flat brows — the marker is missing', expect: 'MISSING', script: () => ({}) },
        { label: 'brows dropped before the last sign', expect: 'DROPPED_AT_END', script: raise(a - 0.25, a + 0.6 * L) },
        { label: 'brows raised after the first sign', expect: 'STARTED_LATE', script: raise(a + 0.45 * L, b + 0.3) },
      ];
      const out = [mistakes[index % 3]!, { label: 'brows raised and held to the end', expect: 'HELD' as const, script: raise(a - 0.25, b + 0.2) }];
      if (index === 0) out.push({ label: 'hands over the face for much of the sentence', expect: 'NOT_SEEN', script: (s) => ({ raise: 0.17, visible: !(s > a + 0.2 && s < a + 0.2 + 0.6 * L) }) });
      return out;
    }
    case 'wh': {
      const mistakes: Variant[] = [
        { label: 'brows raised — the yes/no marker by mistake', expect: 'MISSING', script: raise(a - 0.25, b + 0.2) },
        { label: 'brows relaxed before the last sign', expect: 'DROPPED_AT_END', script: furrow(a - 0.25, a + 0.6 * L) },
      ];
      return [mistakes[index % 2]!, { label: 'brows down and together, held', expect: 'HELD', script: furrow(a - 0.25, b + 0.2) }];
    }
    case 'neg': {
      const mistakes: Variant[] = [
        { label: 'no head shake', expect: 'MISSING', script: () => ({}) },
        { label: 'a short shake only at the start', expect: 'DROPPED_AT_END', script: shakeIn(a, a + 0.3 * L, 11, 2.2, 'yaw') },
      ];
      return [mistakes[index % 2]!, { label: 'head shake across the negated signs', expect: 'HELD', script: shakeIn(a - 0.1, b + 0.2, 11, 2.2, 'yaw') }];
    }
    case 'aff':
      return [
        { label: 'no nod', expect: 'MISSING', script: () => ({}) },
        { label: 'nodding across the sentence', expect: 'HELD', script: shakeIn(a - 0.1, b + 0.2, 8, 1.8, 'pitch') },
      ];
    case 'topic':
    case 'cond': {
      const split = lead + (t.split ?? 0.5) * len;
      return [
        { label: 'brows kept up through the comment', expect: 'KEPT_UP', script: raise(lead - 0.25, windowS + 0.2) },
        { label: 'brows up on the topic, relaxed for the comment', expect: 'HELD', script: raise(lead - 0.25, split - 0.15) },
      ];
    }
  }
}

export interface BuiltReplay {
  readonly header: ReplayHeader;
  readonly events: SenseEvent[];
  readonly checks: { clip: string; label: string; expect: VerdictKind; got: VerdictKind }[];
}

export function buildReplay(prompts: readonly PromptLike[], o: StreamOptions = {}): BuiltReplay {
  const profile = calibrateSynthetic(o);
  const th = thresholdsFor(profile, 'standard');
  const events: SenseEvent[] = [];
  const clips: ReplayClip[] = [];
  const checks: BuiltReplay['checks'] = [];
  let t = SYNTH_T0;
  // Idle: 12 s of a relaxed face between captures.
  const idleEv = synthStream((s) => face(natural(s, 0)), 12, t, { ...o, seed: 99 }) as SenseEvent[];
  events.push(...idleEv);
  const idle = { startUs: t, endUs: t + 12e6 };
  t += 13e6;
  const byMarker = new Map<MarkerType, number>();
  for (const p of prompts) {
    const k = byMarker.get(p.marker) ?? 0;
    byMarker.set(p.marker, k + 1);
    const windowS = promptTiming(p, 'auto').windowS;
    variants(p, k, windowS).forEach((v, vi) => {
      const dur = PRE_S + windowS + POST_S;
      const seed = 1000 + clips.length;
      const ev = synthStream((s) => {
        const w = s - PRE_S;
        const nat = natural(s, seed);
        const sc = w >= -0.5 ? v.script(w) : {};
        return face({ ...nat, ...sc, yaw: (nat.yaw ?? 0) + (sc.yaw ?? 0), pitch: (nat.pitch ?? 0) + (sc.pitch ?? 0) });
      }, dur, t, { ...o, seed }) as SenseEvent[];
      const clip: ReplayClip = {
        id: `${p.id}-${vi}`,
        marker: p.marker,
        promptId: p.id,
        label: v.label,
        startUs: t,
        endUs: t + dur * 1e6,
        windowStartUs: t + PRE_S * 1e6,
        windowEndUs: t + (PRE_S + windowS) * 1e6,
      };
      // Verify through the same path the app uses in replay.
      const x = new FeatureExtractor(profile);
      const frames = feedAll(x, ev);
      const timing = promptTiming(p, 'auto');
      const verdict = judge({
        frames, startUs: clip.windowStartUs, endUs: clip.windowEndUs, marker: p.marker,
        part: timing.part, ...(timing.split !== undefined ? { split: timing.split } : {}), thresholds: th,
      });
      checks.push({ clip: clip.id, label: v.label, expect: v.expect, got: verdict.kind });
      events.push(...ev);
      clips.push(clip);
      t += (dur + 1) * 1e6;
    });
  }
  const header: ReplayHeader = {
    kind: 'header',
    format: 'browup-replay',
    version: 1,
    createdAt: '2026-11-22T12:00:00.000Z',
    synthetic: true,
    description: 'Synthetic demo session generated from a face model (scripts/make-fixtures.ts): for each prompt, a common mistake and a correct production. Not a real person.',
    frameSize: { w: 1280, h: 720 },
    profile,
    clips,
    idle,
  };
  void CAPTURE;
  return { header, events, checks };
}
