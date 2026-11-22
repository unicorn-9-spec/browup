<script setup lang="ts">
// Lesson (PLAN §5.4, §5.8): mirror on the left (60%) with the brow line and
// head arc; gloss card on the right (40%) with the notation bar, Start,
// countdown, verdict stamp and one tip; the timeline strip below. Keys:
// Space = Start (or end early while signing), R = Retry, N = Next, Esc = Stop;
// in review, 1–4 choose the marker first.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ChunkyButton from '../components/ChunkyButton.vue';
import GlossCard from '../components/GlossCard.vue';
import Mirror from '../components/Mirror.vue';
import Stamp from '../components/Stamp.vue';
import StepDots from '../components/StepDots.vue';
import Timeline from '../components/Timeline.vue';
import { COVERAGE } from '../../config/thresholds';
import { REVIEW_MARKERS } from '../lesson/review';
import { useApp } from '../stores/app';
import { useLesson } from '../stores/lesson';
import { useSession } from '../stores/session';
import { MARKER_LABEL, MARKER_NAME, type MarkerType } from '../types';

const app = useApp();
const lesson = useLesson();
const session = useSession();

const cursor = ref(-1);
let raf = 0;

const p = computed(() => lesson.prompt);
const busy = computed(() => lesson.phase === 'countdown' || lesson.phase === 'capturing' || lesson.phase === 'judging');
const title = computed(() => {
  if (lesson.mode === 'review') return 'Mixed review';
  if (lesson.mode === 'free') return `Free practice — ${MARKER_NAME[p.value?.marker ?? 'yn']}`;
  return app.pack?.sets.find((s) => s.id === lesson.setId)?.title ?? 'Lesson';
});
const hideMarker = computed(() => lesson.mode === 'review' && !lesson.verdict);
const results = computed(() => lesson.prompts.map((x) => lesson.results[x.id]));

const LIVE_WORD: Record<MarkerType, [string, string]> = {
  yn: ['Brows up', 'Brows not up'],
  wh: ['Brows down and together', 'Brows not furrowed'],
  neg: ['Head shake', 'No head shake yet'],
  aff: ['Nod', 'No nod yet'],
  topic: ['Brows up', 'Brows not up'],
  cond: ['Brows up', 'Brows not up'],
};

function trackCursor(): void {
  raf = requestAnimationFrame(trackCursor);
  const w = lesson.windowUs;
  const t = lesson.timing;
  if (lesson.phase !== 'capturing' || !w || !t) { cursor.value = -1; return; }
  const now = Date.now() * 1000;
  const lead = Math.min(COVERAGE.LEAD_IN_MS * 1000, (w.endUs - w.startUs) * 0.25);
  const share = (now - w.startUs - lead) / (w.endUs - w.startUs - lead);
  cursor.value = share < 0 ? -1 : t.tokens.findIndex(([a, b]) => share >= a && share < b);
}

function onKey(e: KeyboardEvent): void {
  if (app.sheet || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') {
    e.preventDefault();
    if (lesson.phase === 'capturing') lesson.endEarly();
    else if (!busy.value && !lesson.finished) void lesson.start();
  } else if (k === 'r' && !busy.value && lesson.verdict) {
    lesson.retry();
  } else if (k === 'n' && !busy.value && lesson.mode !== 'free') {
    lesson.next();
  } else if (lesson.mode === 'review' && ['1', '2', '3', '4'].includes(k)) {
    lesson.pick(REVIEW_MARKERS[Number(k) - 1]!);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(trackCursor);
  if (session.mode !== 'replay') void session.ensureLive();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  cancelAnimationFrame(raf);
});
</script>

<template>
  <div class="lesson">
    <div class="bar">
      <h1 class="title">{{ title }}</h1>
      <StepDots v-if="lesson.prompts.length > 1" :count="lesson.prompts.length" :current="lesson.index" :results="results" :disabled="busy" @go="lesson.goTo" />
      <span v-if="lesson.prompts.length > 1 && !lesson.finished" class="count num">{{ lesson.index + 1 }} / {{ lesson.prompts.length }}</span>
    </div>

    <template v-if="p && !lesson.finished">
      <div class="split">
        <Mirror class="mirror" :marker="session.liveMarker" :capturing="lesson.phase === 'capturing'" :countdown="lesson.phase === 'countdown' ? lesson.countdown : 0">
          <template #off>
            <ChunkyButton small variant="secondary" icon="videocam" @click="session.ensureLive()">Turn camera on</ChunkyButton>
          </template>
          <div v-if="session.banner" class="mirror-banner" role="status">
            <strong>{{ session.banner.title }}</strong><span v-if="session.banner.hint"> — {{ session.banner.hint }}</span>
          </div>
          <div v-if="(session.mode === 'live' || session.mode === 'replay') && session.liveMarker" class="live-chip" :class="{ on: session.livePresent }" aria-hidden="true">
            <span class="icon">{{ session.livePresent ? 'check_circle' : 'radio_button_unchecked' }}</span>
            {{ LIVE_WORD[session.liveMarker][session.livePresent ? 0 : 1] }}
          </div>
          <div v-if="lesson.phase === 'capturing'" class="go-chip" aria-hidden="true">Sign now<template v-if="!app.replay"> · <kbd>Space</kbd> to finish</template></div>
          <div v-if="session.mode === 'starting'" class="starting" role="status">Starting face tracking…</div>
        </Mirror>

        <div class="side">
          <GlossCard :meaning="p.meaning" :gloss="p.gloss" :marker="p.marker" :span="p.span" :split="p.split" :cursor="cursor" :hide-marker="hideMarker">
            <div v-if="lesson.mode === 'review' && !lesson.verdict" class="pick" role="group" aria-label="Which marker does this sentence need?">
              <p class="q">Which marker does this sentence need?</p>
              <div class="chips">
                <button
                  v-for="(m, i) in REVIEW_MARKERS" :key="m" type="button" class="chip"
                  :class="{ on: lesson.picked === m }" :aria-pressed="lesson.picked === m" :disabled="busy"
                  :data-testid="`pick-${m}`" @click="lesson.pick(m)"
                >
                  <kbd>{{ i + 1 }}</kbd> {{ MARKER_LABEL[m] }} <span class="sr-only">{{ MARKER_NAME[m] }}</span>
                </button>
              </div>
            </div>
            <p v-if="lesson.mode === 'review' && lesson.verdict" class="picked" :class="{ right: lesson.picked === p.marker }">
              <span class="icon" aria-hidden="true">{{ lesson.picked === p.marker ? 'check' : 'close' }}</span>
              You chose {{ MARKER_NAME[lesson.picked ?? 'yn'] }} — this sentence needs {{ MARKER_NAME[p.marker] }}.
            </p>
          </GlossCard>

          <section class="feedback card" aria-label="Result">
            <div v-if="lesson.verdict" class="verdict">
              <Stamp :kind="lesson.verdict.kind" :confidence="lesson.verdict.confidence" />
              <p class="tip" data-testid="tip">{{ lesson.verdict.tip }}</p>
            </div>
            <p v-else-if="lesson.cancelled" class="tip" role="status">{{ lesson.cancelled }}</p>
            <p v-else-if="lesson.phase === 'countdown'" class="tip">Get ready… {{ lesson.countdown }}</p>
            <p v-else-if="lesson.phase === 'capturing'" class="tip">Sign the sentence now — follow the highlighted sign.</p>
            <p v-else-if="lesson.phase === 'judging'" class="tip">Checking…</p>
            <p v-else-if="hideMarker" class="tip">Read the sentence, choose its marker, then press Start and sign it with that marker.</p>
            <p v-else class="tip">Read the sentence, then press Start and sign it with the
              <strong>{{ MARKER_NAME[p.marker].toLowerCase() }}</strong> marker.</p>
            <p v-if="app.replay && lesson.replayLabel && (lesson.phase !== 'idle' || lesson.verdict)" class="replay-note">Replay clip: {{ lesson.replayLabel }}</p>
            <div class="actions">
              <ChunkyButton
                v-if="!lesson.verdict" icon="play_arrow" kbd="Space" data-testid="start-capture"
                :disabled="busy || session.mode === 'starting' || (lesson.mode === 'review' && !lesson.picked)"
                @click="lesson.start()"
              >Start</ChunkyButton>
              <template v-else>
                <ChunkyButton icon="replay" kbd="R" variant="secondary" data-testid="retry" @click="lesson.retry()">Retry</ChunkyButton>
                <ChunkyButton v-if="lesson.mode !== 'free'" icon="arrow_forward" kbd="N" data-testid="next" @click="lesson.next()">Next</ChunkyButton>
              </template>
            </div>
          </section>
        </div>
      </div>
      <Timeline class="timeline" :series="lesson.verdict?.series ?? null" :summary="lesson.verdict?.summary" />
    </template>

    <section v-else class="done card">
      <h2>Set finished</h2>
      <template v-if="lesson.mode === 'review'">
        <p>Score per marker — chose the right marker <em>and</em> held it:</p>
        <ul class="scores">
          <li v-for="s in lesson.reviewScores" :key="s.marker">
            <span class="name">{{ MARKER_NAME[s.marker] }}</span>
            <span class="bar"><span :style="{ width: s.attempts ? `${(s.correct / s.attempts) * 100}%` : '0%' }" /></span>
            <span class="num">{{ s.correct }}/{{ s.attempts }}</span>
          </li>
        </ul>
      </template>
      <ul v-else class="list">
        <li v-for="x in lesson.prompts" :key="x.id"><span class="gl">{{ x.gloss.join(' ') }}</span> <Stamp v-if="lesson.results[x.id]" :kind="lesson.results[x.id]!" class="mini" /></li>
      </ul>
      <div class="actions">
        <ChunkyButton icon="restart_alt" variant="secondary" @click="lesson.goTo(0)">Practise again</ChunkyButton>
        <ChunkyButton icon="school" @click="app.go('home')">Back to lessons</ChunkyButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lesson { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 600px; }
.bar { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.title { font: var(--h2); }
.count { font: 600 18px/1 var(--font); color: var(--plum-soft); }
.split { flex: 1; min-height: 0; display: grid; grid-template-columns: 3fr 2fr; gap: 20px; }
.mirror { min-height: 320px; }
.side { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; }
.feedback { padding: 14px 20px; display: flex; flex-direction: column; gap: 10px; }
.verdict { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.tip { font: var(--body); }
.actions { display: flex; gap: 12px; flex-wrap: wrap; }
.replay-note { font: var(--small); background: var(--lemon); border-radius: 10px; padding: 6px 10px; align-self: flex-start; }
.mirror-banner { position: absolute; left: 16px; right: 16px; top: 16px; background: var(--white); border: 2px solid var(--plum); border-left: 8px solid var(--red); border-radius: 12px; padding: 10px 14px; }
.live-chip { position: absolute; left: 16px; bottom: 16px; display: inline-flex; align-items: center; gap: 6px; background: var(--white); border: 2px solid var(--plum); border-radius: 999px; padding: 6px 14px; font: 600 16px/1 var(--font); }
.live-chip.on { background: var(--mint); }
.go-chip { position: absolute; right: 16px; bottom: 16px; background: var(--tangerine); border: 2px solid var(--plum); border-radius: 999px; padding: 8px 14px; font: 600 16px/1 var(--font); }
.starting { position: absolute; inset: 0; display: grid; place-items: center; font: var(--h3); }
.pick { border-top: 2px dashed var(--field-plum); padding-top: 14px; }
.q { font-weight: 600; margin-bottom: 8px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { min-height: 48px; padding: 0 16px; border-radius: 999px; border: 2px solid var(--plum); background: var(--white); color: var(--plum); font: 600 18px/1 var(--font); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; }
.chip.on { background: var(--tangerine); }
.picked { display: flex; gap: 8px; align-items: center; font-weight: 600; color: var(--red); }
.picked.right { color: var(--mint-text); }
.timeline { flex: none; }
.done { padding: 28px 32px; display: flex; flex-direction: column; gap: 18px; max-width: 900px; }
.list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.list li { display: flex; align-items: center; gap: 16px; }
.gl { font: 600 20px/1.2 var(--font); min-width: 18ch; }
.mini { transform: scale(0.6) rotate(-4deg); transform-origin: left center; }
.scores { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.scores li { display: grid; grid-template-columns: 200px 1fr 60px; gap: 14px; align-items: center; }
.scores .bar { height: 18px; border: 2px solid var(--plum); border-radius: 9px; overflow: hidden; background: var(--field-tangerine); }
.scores .bar span { display: block; height: 100%; background: var(--tangerine); }
</style>
