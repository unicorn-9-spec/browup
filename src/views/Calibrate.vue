<script setup lang="ts">
// Calibration (PLAN F2, §3.2 step 5): five illustrated steps — neutral face,
// raise brows ×3, furrow ×3, shake head ×2, nod ×2 — with a check mark per
// repetition. Stores baselines and the learner's own ranges so thresholds
// adapt to faces that move more or less. Redo any time.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import ChunkyButton from '../components/ChunkyButton.vue';
import FaceDiagram from '../components/FaceDiagram.vue';
import type { Pose } from '../components/pose';
import Mirror from '../components/Mirror.vue';
import { CALIBRATION } from '../../config/thresholds';
import { buildProfile, CAL_REPS, CAL_STEPS, furrowInner, measureStep, neutralBaseline, pitchSlope, thresholdsFor, type CalStep, type NeutralResult, type StepMeasure } from '../face/calibration';
import { faceSession } from '../sensing/session';
import { useApp } from '../stores/app';
import { useProfile } from '../stores/profile';
import { useSession } from '../stores/session';
import { useSettings } from '../stores/settings';
import type { FeatureFrame, Profile } from '../types';

const app = useApp();
const profile = useProfile();
const session = useSession();
const settings = useSettings();

const STEP_INFO: Record<CalStep, { title: string; text: string; pose: Pose }> = {
  neutral: { title: 'Neutral face', text: 'Look at the camera with a relaxed face for 5 seconds. Blinking is fine.', pose: 'neutral' },
  raise: { title: 'Raise your brows ×3', text: 'Lift your eyebrows high, hold for a moment, relax. Three times.', pose: 'raise' },
  furrow: { title: 'Furrow your brows ×3', text: 'Pull your brows down and together, hold, relax. Three times.', pose: 'furrow' },
  shake: { title: 'Shake your head ×2', text: 'A clear side-to-side head shake, as for "no". Twice.', pose: 'shake' },
  nod: { title: 'Nod ×2', text: 'A clear up-and-down nod, as for "yes". Twice.', pose: 'nod' },
};

const stepIdx = ref(0);
const running = ref(false);
const remaining = ref(0);
const reps = ref(0);
const done = ref<Record<string, boolean>>({});
const message = ref('');
const neutral = shallowRef<NeutralResult | null>(null);
const measures = ref<Partial<Record<Exclude<CalStep, 'neutral'>, StepMeasure>>>({});
const innerPull = ref(0);
const slope = ref<number | null>(null);
const result = shallowRef<Profile | null>(null);
let frames: FeatureFrame[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let endsAt = 0;

const step = computed<CalStep>(() => CAL_STEPS[stepIdx.value] ?? 'nod');
const info = computed(() => STEP_INFO[step.value]);
const finished = computed(() => result.value !== null);

const unsub = faceSession.on({
  frame(f) {
    if (!running.value) return;
    frames.push(f);
    if (step.value !== 'neutral' && neutral.value?.baseline && frames.length % 3 === 0) {
      const m = measureStep(step.value, frames, neutral.value.baseline, neutral.value.mad!);
      reps.value = Math.min(CAL_REPS[step.value], m.reps);
      // Enough repetitions seen: finish the step shortly after.
      if (reps.value >= CAL_REPS[step.value] && endsAt - Date.now() > 1200) endsAt = Date.now() + 1200;
    }
  },
});

async function startStep(): Promise<void> {
  if (running.value) return;
  if (!(await session.ensureLive())) return;
  message.value = '';
  frames = [];
  reps.value = 0;
  running.value = true;
  const dur = step.value === 'neutral' ? CALIBRATION.NEUTRAL_S : CALIBRATION.STEP_S;
  endsAt = Date.now() + dur * 1000;
  timer = setInterval(() => {
    remaining.value = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    if (Date.now() >= endsAt) finishStep();
  }, 100);
  app.announce(`${info.value.title}. ${info.value.text}`);
}

function finishStep(): void {
  if (timer) clearInterval(timer);
  timer = null;
  running.value = false;
  const s = step.value;
  if (s === 'neutral') {
    const n = neutralBaseline(frames);
    if (!n.ok) {
      message.value = `I could only see your face clearly for ${Math.round(n.validShare * 100)}% of that. Face the camera with light in front of you and try again.`;
      app.announce(message.value);
      return;
    }
    neutral.value = n;
  } else {
    const m = measureStep(s, frames, neutral.value!.baseline!, neutral.value!.mad!);
    measures.value = { ...measures.value, [s]: m };
    if (s === 'furrow') innerPull.value = furrowInner(frames, neutral.value!.baseline!);
    if (s === 'nod') slope.value = pitchSlope(frames, neutral.value!.baseline!);
    if (m.weak) message.value = 'That movement was small or hidden. You can redo it, or carry on — BrowUp will use standard thresholds for it.';
  }
  done.value = { ...done.value, [s]: true };
  if (stepIdx.value < CAL_STEPS.length - 1) {
    stepIdx.value++;
    app.announce(`Step done. Next: ${info.value.title}.`);
  } else {
    result.value = buildProfile(neutral.value!, measures.value, innerPull.value, new Date(), slope.value);
    app.announce('Calibration finished. Check your results and save.');
  }
}

function redo(i: number): void {
  if (running.value) return;
  result.value = null;
  stepIdx.value = i;
  message.value = '';
}

async function save(): Promise<void> {
  if (!result.value) return;
  await profile.save(result.value);
  app.go('home');
}

const th = computed(() => (result.value ? thresholdsFor(result.value, settings.s.sensitivity) : null));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const deg = (x: number) => `${Math.round(x)}°`;

function onKey(e: KeyboardEvent): void {
  if (e.code === 'Space' && !finished.value && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void startStep(); }
}
onMounted(() => { window.addEventListener('keydown', onKey); void session.ensureLive(); });
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); if (timer) clearInterval(timer); unsub(); });
</script>

<template>
  <div class="cal">
    <Mirror class="mirror" :capturing="running">
      <template #off><ChunkyButton small variant="secondary" icon="videocam" @click="session.ensureLive()">Turn camera on</ChunkyButton></template>
    </Mirror>
    <section class="panel card" aria-labelledby="cal-title">
      <h1 id="cal-title">Calibrate</h1>
      <ol class="steps" aria-label="Calibration steps">
        <li v-for="(s, i) in CAL_STEPS" :key="s" :class="{ current: i === stepIdx && !finished, done: done[s] }">
          <span class="icon" aria-hidden="true">{{ done[s] ? (measures[s as Exclude<CalStep, 'neutral'>]?.weak ? 'error' : 'check_circle') : 'radio_button_unchecked' }}</span>
          <button type="button" class="step-name" :disabled="running || !done[s]" @click="redo(i)">{{ STEP_INFO[s].title }}</button>
        </li>
      </ol>

      <template v-if="!finished">
        <div class="now">
          <FaceDiagram :pose="info.pose" :size="140" :title="info.title" />
          <div>
            <h2>{{ info.title }}</h2>
            <p>{{ info.text }}</p>
            <p v-if="running" class="live num" aria-live="polite">
              <template v-if="step === 'neutral'">Hold still… {{ remaining }} s</template>
              <template v-else>
                <span v-for="k in CAL_REPS[step]" :key="k" class="icon rep" :class="{ got: k <= reps }" aria-hidden="true">{{ k <= reps ? 'check_circle' : 'circle' }}</span>
                <span class="sr-only">{{ reps }} of {{ CAL_REPS[step] }} seen</span> · {{ remaining }} s
              </template>
            </p>
          </div>
        </div>
        <p v-if="message" class="msg" role="status">{{ message }}</p>
        <div class="actions">
          <ChunkyButton icon="play_arrow" kbd="Space" :disabled="running || session.mode === 'starting'" data-testid="cal-start" @click="startStep">
            {{ running ? 'Recording…' : done[step] ? 'Redo this step' : 'Start this step' }}
          </ChunkyButton>
          <ChunkyButton v-if="running" variant="secondary" @click="finishStep">Done</ChunkyButton>
        </div>
      </template>

      <template v-else-if="result && th">
        <h2>Your face, measured</h2>
        <table class="res num">
          <thead><tr><th>Movement</th><th>Yours</th><th>BrowUp will look for</th></tr></thead>
          <tbody>
            <tr><td>Brow raise</td><td>{{ pct(result.range.raise) }}</td><td>{{ pct(th.raise) }} higher</td></tr>
            <tr><td>Brow furrow</td><td>{{ pct(result.range.lower) }}, {{ pct(result.range.inner) }} closer</td><td>{{ pct(th.lower) }} lower and {{ pct(th.inner) }} closer</td></tr>
            <tr><td>Head shake</td><td>±{{ deg(result.range.shakeDeg) }}</td><td>±{{ deg(th.shakeDeg) }} swings</td></tr>
            <tr><td>Nod</td><td>±{{ deg(result.range.nodDeg) }}</td><td>±{{ deg(th.nodDeg) }} swings</td></tr>
            <tr><td>Head-tilt correction</td><td colspan="2">{{ ((result.browPitchSlope ?? 0) * 100).toFixed(1) }}% brow height per degree {{ slope === null ? '(standard — nod too small to measure)' : '(measured from your nods)' }}</td></tr>
          </tbody>
        </table>
        <p class="help">Percentages are compared with your own neutral face, so they work for any face. Steps that were too small or hidden use standard thresholds: {{ result.weak.length ? result.weak.join(', ') : 'none' }}.</p>
        <div class="actions">
          <ChunkyButton icon="save" data-testid="cal-save" @click="save">Save and start practising</ChunkyButton>
          <ChunkyButton variant="secondary" icon="restart_alt" @click="redo(0)">Start over</ChunkyButton>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.cal { display: grid; grid-template-columns: 3fr 2fr; gap: 24px; height: 100%; min-height: 520px; }
.mirror { height: 100%; }
.panel { padding: 26px 30px; display: flex; flex-direction: column; gap: 18px; overflow: auto; }
.steps { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.steps li { display: flex; align-items: center; gap: 10px; }
.steps li.current .step-name { font-weight: 700; text-decoration: underline; text-decoration-color: var(--tangerine); text-decoration-thickness: 3px; }
.steps li.done .icon { color: var(--mint-text); }
.step-name { background: none; border: none; font: var(--body); color: var(--plum); padding: 2px 4px; cursor: pointer; border-radius: 6px; }
.step-name:disabled { cursor: default; }
.now { display: flex; gap: 20px; align-items: center; background: var(--field-tangerine); border-radius: 18px; padding: 16px; }
.live { margin-top: 8px; font-weight: 600; display: flex; align-items: center; gap: 4px; }
.rep { color: var(--plum-soft); }
.rep.got { color: var(--mint-text); }
.msg { background: var(--field-plum); border-radius: 12px; padding: 10px 14px; }
.actions { display: flex; gap: 12px; flex-wrap: wrap; }
.res { border-collapse: collapse; width: 100%; }
.res th, .res td { text-align: left; padding: 8px 6px; border-bottom: 2px solid var(--field-plum); }
.help { font: var(--small); color: var(--plum-soft); }
</style>
