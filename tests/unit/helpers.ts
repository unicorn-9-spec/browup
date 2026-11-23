// Test helpers: synthetic attempts run through the real pipeline
// (synthetic landmarks → FeatureExtractor → judge).

import { buildProfile, furrowInner, measureStep, neutralBaseline, pitchSlope, thresholdsFor, type CalStep } from '../../src/face/calibration';
import { FeatureExtractor } from '../../src/face/features';
import { feedAll } from '../../src/sensing/pipeline';
import { NEUTRAL, synthStream, type FaceState, type StreamOptions } from '../../src/synth/face';
import type { MarkerType, Profile, Sensitivity, Verdict } from '../../src/types';
import { judge } from '../../src/verdict/engine';

export const T0 = 1_795_000_000_000_000;
export const PRE_S = 1.0;

export type Script = (s: number) => Partial<FaceState>;
export const face = (p: Partial<FaceState> = {}): FaceState => ({ ...NEUTRAL, ...p });

/** Calibrates a synthetic learner whose deliberate movements have the given
 *  sizes, through the real calibration code. */
export function calibrate(sizes: { raise?: number; lower?: number; pull?: number; shake?: number; nod?: number } = {}, o: StreamOptions = {}): Profile {
  const { raise = 0.2, lower = 0.12, pull = 0.1, shake = 14, nod = 10 } = sizes;
  const x = new FeatureExtractor(null);
  const run = (script: (s: number) => FaceState, dur: number, t0: number) => feedAll(x, synthStream(script, dur, t0, o));
  const neutral = neutralBaseline(run(() => face(), 5, T0));
  const b = neutral.baseline!;
  const bump = (s: number) => Math.max(0, Math.sin((Math.PI * s) / 1.5)); // 3 bumps in 4.5 s
  const steps: Partial<Record<Exclude<CalStep, 'neutral'>, ReturnType<typeof measureStep>>> = {};
  const raiseFrames = run((s) => face({ raise: raise * bump(s) }), 4.5, T0 + 10e6);
  steps.raise = measureStep('raise', raiseFrames, b, neutral.mad!);
  const furrowFrames = run((s) => face({ lower: lower * bump(s), pull: pull * bump(s) }), 4.5, T0 + 20e6);
  steps.furrow = measureStep('furrow', furrowFrames, b, neutral.mad!);
  steps.shake = measureStep('shake', run((s) => face({ yaw: shake * Math.sin(2 * Math.PI * s) }), 3, T0 + 30e6), b, neutral.mad!);
  const nodFrames = run((s) => face({ pitch: nod * Math.sin(2 * Math.PI * s) }), 3, T0 + 40e6);
  steps.nod = measureStep('nod', nodFrames, b, neutral.mad!);
  return buildProfile(neutral, steps, furrowInner(furrowFrames, b), new Date(), pitchSlope(nodFrames, b))!;
}

let cached: Profile | null = null;
export function standardProfile(): Profile {
  return (cached ??= calibrate());
}

export interface AttemptOptions extends StreamOptions {
  windowS?: number;
  profile?: Profile | null;
  sensitivity?: Sensitivity;
  split?: number;
}

/** Signs one attempt: a neutral pre-roll, then the scripted window
 *  (script time 0 = window start). */
export function attempt(marker: MarkerType, script: Script, o: AttemptOptions = {}): Verdict {
  const windowS = o.windowS ?? 4;
  const profile = o.profile === undefined ? standardProfile() : o.profile;
  const x = new FeatureExtractor(profile);
  const events = synthStream((s) => (s < PRE_S ? face() : face(script(s - PRE_S))), PRE_S + windowS, T0, o);
  const frames = feedAll(x, events);
  return judge({
    frames,
    startUs: T0 + PRE_S * 1e6,
    endUs: T0 + (PRE_S + windowS) * 1e6,
    marker,
    split: o.split,
    thresholds: thresholdsFor(profile, o.sensitivity),
  });
}
