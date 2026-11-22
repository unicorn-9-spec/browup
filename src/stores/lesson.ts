// The lesson loop (PLAN §3.2 steps 8–9): read the prompt, Start (Space),
// countdown, sign within the window, verdict stamp + timeline + one tip,
// Retry (R) or Next (N). Also mixed review (F6) and free practice (F13).

import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import type { PackPrompt } from '../../content/validate';
import { CaptureController, type CapturePhase } from '../lesson/controller';
import { reviewDeck, scoreByMarker } from '../lesson/review';
import { promptTiming, type PromptTiming } from '../lesson/timing';
import { pausesCapture } from '../sensing/codes';
import { pickClip } from '../sensing/replay';
import { faceSession, nowUs } from '../sensing/session';
import { MARKER_NAME, STAMP_TEXT, type Attempt, type MarkerType, type Verdict } from '../types';
import { judge } from '../verdict/engine';
import { EXPRESSIONS } from '../../config/thresholds';
import { useApp } from './app';
import { useProfile } from './profile';
import { useProgress } from './progress';
import { useSession } from './session';
import { useSettings } from './settings';

export type LessonMode = 'lesson' | 'review' | 'free';

/** Free practice uses a synthetic prompt so the same engine applies. */
function freePrompt(marker: MarkerType): PackPrompt {
  return { id: `free-${marker}`, marker, meaning: 'Sign any sentence of your own.', gloss: ['YOUR', 'OWN', 'SENTENCE'], span: [0, 2], ...(marker === 'topic' || marker === 'cond' ? { span: [0, 0] as [number, number], split: 1 } : {}) };
}

export const useLesson = defineStore('lesson', () => {
  const app = useApp();
  const session = useSession();
  const profile = useProfile();
  const progress = useProgress();
  const settings = useSettings();

  const mode = ref<LessonMode>('lesson');
  const setId = ref<string>('');
  const prompts = shallowRef<PackPrompt[]>([]);
  const index = ref(0);
  const phase = ref<CapturePhase>('idle');
  const countdown = ref(0);
  const verdict = shallowRef<Verdict | null>(null);
  const results = ref<Record<string, Verdict['kind']>>({});
  const attemptNo = ref(0);
  const goAt = ref(0);
  const windowUs = ref<{ startUs: number; endUs: number } | null>(null);
  const cancelled = ref<string | null>(null);
  // Review mode
  const picked = ref<MarkerType | null>(null);
  const reviewAttempts = ref<Attempt[]>([]);
  const replayLabel = ref<string | null>(null);

  const prompt = computed(() => prompts.value[index.value] ?? null);
  const timing = computed<PromptTiming | null>(() => (prompt.value ? promptTiming(prompt.value, settings.s.windowS) : null));
  const reviewScores = computed(() => scoreByMarker(reviewAttempts.value));
  const finished = computed(() => index.value >= prompts.value.length);

  const controller = new CaptureController({
    now: nowUs,
    begin(goAtUs, windowS) {
      goAt.value = goAtUs;
      const p = prompt.value!;
      if (app.replay && faceSession.recording) {
        const clip = pickClip(faceSession.recording.header.clips, p.marker, mode.value === 'free' ? undefined : p.id, attemptNo.value);
        if (clip) {
          replayLabel.value = clip.label;
          const w = faceSession.playClip(clip, goAtUs);
          windowUs.value = w;
          return w;
        }
      }
      replayLabel.value = null;
      const w = { startUs: goAtUs, endUs: goAtUs + windowS * 1e6 };
      windowUs.value = w;
      return w;
    },
    tick(n) {
      countdown.value = n;
      phase.value = controller.phase;
    },
    go() {
      phase.value = 'capturing';
      app.announce('Go — sign now.');
    },
    finish(startUs, endUs) {
      phase.value = 'judging';
      const p = prompt.value!;
      const t = timing.value!;
      const v = judge({
        frames: faceSession.framesBetween(startUs, endUs),
        startUs,
        endUs,
        marker: p.marker,
        part: t.part,
        ...(t.split !== undefined ? { split: t.split } : {}),
        thresholds: profile.thresholds,
        exprMode: EXPRESSIONS.MODE,
      });
      verdict.value = v;
      phase.value = 'done';
      faceSession.recorder?.addClip({
        id: `${p.id}-${Date.now()}`, marker: p.marker, promptId: p.id, label: `recorded attempt (${STAMP_TEXT[v.kind]})`,
        startUs: startUs - 3.5e6, endUs: endUs + 0.5e6, windowStartUs: startUs, windowEndUs: endUs,
        ...(t.split !== undefined ? { split: t.split } : {}),
      });
      results.value = { ...results.value, [p.id]: v.kind };
      const attempt: Attempt = {
        at: new Date().toISOString(),
        promptId: p.id,
        marker: p.marker,
        verdict: v.kind,
        coveragePct: Math.round(v.coverage * 100),
        validPct: Math.round(v.validFraction * 100),
        mode: mode.value,
        ...(mode.value === 'review' ? { pickedRight: picked.value === p.marker } : {}),
      };
      if (mode.value === 'review') reviewAttempts.value = [...reviewAttempts.value, attempt];
      void progress.add(attempt, !app.replay);
      app.announce(`${STAMP_TEXT[v.kind]}. ${v.tip} ${v.summary}`);
    },
  });

  // Covered lens / camera loss mid-capture: cancel, no verdict (PLAN §2).
  let unwatch: (() => void) | null = null;
  function watchForLoss(): void {
    unwatch?.();
    unwatch = faceSession.on({
      validation(code) {
        if (!controller.active || !pausesCapture(code)) return;
        setTimeout(() => {
          if (controller.active && pausesCapture(session.code)) cancel('We lost sight of your face, so that attempt was not judged. The prompt is ready when you are.');
        }, 1000);
      },
      error() {
        if (controller.active) cancel('The camera stopped, so that attempt was not judged.');
      },
    });
  }

  function begin(m: LessonMode, list: PackPrompt[], id: string): void {
    controller.cancel();
    mode.value = m;
    setId.value = id;
    prompts.value = list;
    index.value = 0;
    results.value = {};
    verdict.value = null;
    phase.value = 'idle';
    picked.value = null;
    reviewAttempts.value = [];
    attemptNo.value = 0;
    cancelled.value = null;
    session.liveMarker = m === 'review' ? null : list[0]?.marker ?? null;
    watchForLoss();
    app.go('lesson');
  }

  function startSet(id: string): void {
    const pack = app.pack;
    if (!pack) return;
    const set = pack.sets.find((s) => s.id === id);
    if (!set) return;
    const list = set.prompts.map((pid) => pack.prompts.find((p) => p.id === pid)).filter((p): p is PackPrompt => !!p);
    begin('lesson', list, id);
  }

  function startReview(seed = Date.now()): void {
    const pack = app.pack;
    if (!pack) return;
    begin('review', reviewDeck(pack.prompts, app.replay ? 7 : seed), 'review');
  }

  function startFree(marker: MarkerType): void {
    begin('free', [freePrompt(marker)], `free-${marker}`);
  }

  async function start(): Promise<void> {
    if (!prompt.value || controller.active) return;
    if (mode.value === 'review' && !picked.value) {
      app.announce('First choose which marker this sentence needs.');
      return;
    }
    if (!(await session.ensureLive())) return;
    cancelled.value = null;
    verdict.value = null;
    session.liveMarker = mode.value === 'review' ? picked.value : prompt.value.marker;
    controller.start(timing.value!.windowS);
    phase.value = controller.phase;
  }

  function endEarly(): void {
    controller.endEarly();
    phase.value = controller.phase;
  }

  function cancel(reason: string | null = null): void {
    controller.cancel();
    phase.value = 'idle';
    countdown.value = 0;
    cancelled.value = reason;
    if (reason) app.announce(reason);
  }

  function retry(): void {
    if (controller.active) return;
    attemptNo.value++;
    verdict.value = null;
    phase.value = 'idle';
    void start();
  }

  function next(): void {
    if (controller.active) return;
    controller.cancel();
    verdict.value = null;
    phase.value = 'idle';
    picked.value = null;
    attemptNo.value = 0;
    cancelled.value = null;
    index.value = Math.min(index.value + 1, prompts.value.length);
    session.liveMarker = mode.value === 'review' ? null : prompt.value?.marker ?? null;
    if (prompt.value) app.announce(`Next: ${prompt.value.meaning}`);
  }

  function goTo(i: number): void {
    if (controller.active) return;
    index.value = Math.max(0, Math.min(i, prompts.value.length - 1));
    verdict.value = null;
    phase.value = 'idle';
    picked.value = null;
    attemptNo.value = 0;
    session.liveMarker = mode.value === 'review' ? null : prompt.value?.marker ?? null;
  }

  function pick(m: MarkerType): void {
    if (controller.active || verdict.value) return;
    picked.value = m;
    session.liveMarker = m;
    app.announce(`You chose ${MARKER_NAME[m]}.`);
  }

  function leave(): void {
    controller.cancel();
    unwatch?.();
    unwatch = null;
    phase.value = 'idle';
    session.liveMarker = null;
  }

  return {
    mode, setId, prompts, index, prompt, timing, phase, countdown, verdict, results, attemptNo, goAt, windowUs,
    cancelled, picked, reviewAttempts, reviewScores, finished, replayLabel,
    startSet, startReview, startFree, start, endEarly, cancel, retry, next, goTo, pick, leave,
  };
});
