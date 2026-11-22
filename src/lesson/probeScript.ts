// Stage 1 face-check scripts (AGENT_PROMPT §11 Stage 1), run by the learner
// alone from the probe screen (`npm run probe`). Each step is a timed cue;
// the probe logs numbers only and probe/analyze.ts writes the report.

import { shuffle } from './review';

export type ProbePhase = 'neutral' | 'agree' | 'occlusion' | 'blink';

export interface ProbeStep {
  readonly phase: ProbePhase;
  /** What the person is asked to do. */
  readonly cue: string;
  /** Trial label for the analyser. */
  readonly label: 'neutral' | 'raise' | 'furrow' | 'sentence' | 'blink' | 'rest';
  readonly seconds: number;
  readonly trial: number;
}

const AGREE_TRIALS = 20;

/** 10 common sentences for the occlusion spike (signed near the face). */
export const OCCLUSION_SENTENCES: readonly string[] = [
  'YOU HUNGRY (Are you hungry?)',
  'YOUR NAME WHAT (What is your name?)',
  'ME NOT UNDERSTAND (I don’t understand.)',
  'YOU DEAF (Are you Deaf?)',
  'YOU LIVE WHERE (Where do you live?)',
  'THANK-YOU (Thank you.)',
  'ME LIKE COFFEE (I like coffee.)',
  'YOUR TEACHER WHO (Who is your teacher?)',
  'ME TIRED (I’m tired.)',
  'YOU WANT GO MOVIE (Do you want to go to a movie?)',
];

export function probeScript(seed = 20261122): ProbeStep[] {
  const steps: ProbeStep[] = [];
  steps.push({ phase: 'neutral', cue: 'Relaxed, neutral face. Look at the camera.', label: 'neutral', seconds: 10, trial: 0 });
  const labels = shuffle([
    ...Array.from({ length: AGREE_TRIALS }, () => 'raise' as const),
    ...Array.from({ length: AGREE_TRIALS }, () => 'furrow' as const),
    ...Array.from({ length: AGREE_TRIALS }, () => 'neutral' as const),
  ], seed);
  labels.forEach((label, i) => {
    const cue = label === 'raise' ? 'RAISE your brows and hold' : label === 'furrow' ? 'FURROW your brows (down and together) and hold' : 'Stay NEUTRAL';
    steps.push({ phase: 'agree', cue, label, seconds: 2, trial: i + 1 });
    steps.push({ phase: 'agree', cue: 'Relax', label: 'rest', seconds: 1.2, trial: i + 1 });
  });
  OCCLUSION_SENTENCES.forEach((s, i) => {
    steps.push({ phase: 'occlusion', cue: `Sign: ${s}`, label: 'sentence', seconds: 5, trial: i + 1 });
    steps.push({ phase: 'occlusion', cue: 'Hands down, relax', label: 'rest', seconds: 2, trial: i + 1 });
  });
  steps.push({ phase: 'blink', cue: 'Keep your brows still and BLINK rapidly', label: 'blink', seconds: 15, trial: 1 });
  return steps;
}

export function scriptSeconds(steps: readonly ProbeStep[]): number {
  return steps.reduce((s, x) => s + x.seconds, 0);
}
