<script setup lang="ts">
// Stage 1 probe (`npm run probe`): draws every landmark index over the mirror
// (BrowUp's points highlighted) to confirm the MediaPipe mapping, then runs
// the self-guided face check — expression agreement (20 raises, 20 furrows,
// 20 neutral), the occlusion spike (10 sentences signed near the face) and a
// blink storm — logging numbers only. `npm run probe:analyze` writes the
// report (valid-frame rates, agreement, jitter, recommendations).
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import ChunkyButton from '../components/ChunkyButton.vue';
import Mirror from '../components/Mirror.vue';
import { EXPRESSIONS } from '../../config/thresholds';
import { KEPT_INDICES } from '../face/landmarkIndex';
import { probeScript, scriptSeconds, type ProbeStep } from '../lesson/probeScript';
import { compactEvent } from '../sensing/record';
import { faceSession, nowUs } from '../sensing/session';
import type { ProbeFrame } from '../sensing/sdk';
import { useSession } from '../stores/session';
import { useSettings } from '../stores/settings';
import { SenseClient } from '../sensing/sdk';
import { errorForCamera } from '../sensing/errors';
import type { Point } from '../types';

const session = useSession();
const settings = useSettings();
const cameras = ref<MediaDeviceInfo[]>([]);
const diag = ref('');
const sdkStatus = ref<number | null>(null);
const lastError = ref('');
let diagTimer: ReturnType<typeof setInterval> | null = null;
const unsubDiag = faceSession.on({
  event(e) {
    if (e.kind === 'status') sdkStatus.value = e.status;
    if (e.kind === 'error') lastError.value = `SDK error ${e.code}: ${e.message}`;
  },
});
const all = shallowRef<Point[] | null>(null);
const count = ref(0);
const blinks = ref(0);
const exprSeen = ref(0);
const steps = probeScript();
const i = ref(-1);
const left = ref(0);
const logName = ref('');
const savedTo = ref('');
const showIndices = ref(true);
let buffer: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let stepTimer: ReturnType<typeof setTimeout> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let stepEnds = 0;

const step = computed<ProbeStep | null>(() => steps[i.value] ?? null);
const total = Math.round(scriptSeconds(steps) / 60);

function line(o: unknown): void {
  if (logName.value) buffer.push(JSON.stringify(o));
}

async function flush(): Promise<void> {
  if (!buffer.length || !logName.value) return;
  const lines = buffer;
  buffer = [];
  savedTo.value = (await window.browup?.probe.append(logName.value, lines)) ?? '';
}

async function startCamera(): Promise<void> {
  await faceSession.stop();
  session.mode = 'starting';
  lastError.value = '';
  try {
    await faceSession.startLive(settings.s.cameraId || undefined, (f: ProbeFrame) => { all.value = f.all; count.value = f.count; });
    session.mode = 'live';
    cameras.value = await SenseClient.cameras();
  } catch (err) {
    session.mode = 'off';
    lastError.value = err instanceof DOMException ? errorForCamera(err.name).body : `Could not start: ${(err as Error).message}`;
  }
}

async function changeCamera(id: string): Promise<void> {
  settings.s.cameraId = id;
  await startCamera();
}

function updateDiag(): void {
  const c = faceSession.cameraInfo;
  diag.value = c
    ? `Camera: ${c.label || 'unnamed'} · ${c.width ?? '?'}×${c.height ?? '?'} @ ${Math.round(c.frameRate ?? 0)} fps · validation ${session.code}${session.hint ? ` (${session.hint})` : ''} · SDK status ${sdkStatus.value ?? '—'}`
    : 'Camera not open';
}

function runStep(k: number): void {
  i.value = k;
  const s = steps[k];
  if (!s) { void finish(); return; }
  line({ k: 'phase', r: nowUs(), phase: s.phase, label: s.label, trial: s.trial, seconds: s.seconds });
  stepEnds = Date.now() + s.seconds * 1000;
  stepTimer = setTimeout(() => runStep(k + 1), s.seconds * 1000);
}

async function begin(): Promise<void> {
  logName.value = `probe-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  line({ k: 'probe-header', version: 1, createdAt: new Date().toISOString(), exprMode: EXPRESSIONS.MODE, frame: faceSession.frameSize, landmarkCount: count.value });
  faceSession.probeSink = (e) => {
    if (e.kind === 'blink' && e.sample.detected) blinks.value++;
    if (e.kind === 'expr') exprSeen.value++;
    line(compactEvent(e));
  };
  flushTimer = setInterval(() => void flush(), 1000);
  tickTimer = setInterval(() => { left.value = Math.max(0, Math.ceil((stepEnds - Date.now()) / 1000)); }, 200);
  runStep(0);
}

async function finish(): Promise<void> {
  i.value = steps.length;
  line({ k: 'end', r: nowUs() });
  faceSession.probeSink = null;
  if (flushTimer) clearInterval(flushTimer);
  if (tickTimer) clearInterval(tickTimer);
  await flush();
}

async function abort(): Promise<void> {
  if (stepTimer) clearTimeout(stepTimer);
  line({ k: 'aborted', r: nowUs(), at: i.value });
  await finish();
}

onMounted(() => { void startCamera(); diagTimer = setInterval(updateDiag, 500); });
onBeforeUnmount(() => {
  if (diagTimer) clearInterval(diagTimer);
  unsubDiag();
  if (stepTimer) clearTimeout(stepTimer);
  void finish();
  faceSession.probeSink = null;
});
</script>

<template>
  <div class="probe">
    <Mirror class="mirror" :probe-points="showIndices ? all : null" :highlight="[...KEPT_INDICES]" :capturing="step !== null && step.label !== 'rest'" />
    <section class="panel card">
      <h1>Face check (Stage 1 probe)</h1>
      <p class="num">Landmarks per set: <strong>{{ count }}</strong> · frames/s: <strong>{{ session.fps }}</strong> · blinks seen: <strong>{{ blinks }}</strong> · expression samples: <strong>{{ exprSeen }}</strong></p>
      <p class="help num" data-testid="probe-diag">{{ diag }}</p>
      <p v-if="lastError" class="err" role="alert" data-testid="probe-error">{{ lastError }}</p>
      <div class="row">
        <label for="pcam">Camera</label>
        <select id="pcam" :value="settings.s.cameraId" :disabled="i >= 0 && i < steps.length" @change="changeCamera(($event.target as HTMLSelectElement).value)">
          <option value="">Default camera</option>
          <option v-for="c in cameras" :key="c.deviceId" :value="c.deviceId">{{ c.label || 'Camera' }}</option>
        </select>
      </div>
      <label class="row"><input v-model="showIndices" type="checkbox" /> Show all landmark indices (BrowUp’s points in tangerine, numbered)</label>
      <template v-if="i < 0">
        <p>About {{ total }} minutes, on your own. You will be asked to: hold a neutral face; raise, furrow or relax your brows 60 times in random order; sign 10 short sentences near your face; and blink rapidly with still brows. Only numbers are logged — never pictures.</p>
        <ChunkyButton icon="play_arrow" :disabled="session.mode !== 'live' || count === 0" @click="begin">Begin the face check</ChunkyButton>
        <p v-if="session.mode !== 'live'" class="help">Starting the camera…</p>
      </template>
      <template v-else-if="step">
        <p class="phase">{{ step.phase === 'agree' ? 'Brows and expressions' : step.phase === 'occlusion' ? 'Signing near the face' : step.phase === 'blink' ? 'Blinks' : 'Neutral' }} · {{ i + 1 }}/{{ steps.length }}</p>
        <p class="cue" :class="step.label" aria-live="assertive">{{ step.cue }}</p>
        <p class="num left">{{ left }} s</p>
        <ChunkyButton variant="secondary" icon="stop" @click="abort">Stop the check</ChunkyButton>
      </template>
      <template v-else>
        <h2>Done — thank you.</h2>
        <p>Log saved to:</p>
        <code>{{ savedTo }}</code>
        <p>Now run <kbd>npm run probe:analyze</kbd> to write the report next to it.</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.probe { display: grid; grid-template-columns: 3fr 2fr; gap: 24px; height: 100%; min-height: 560px; }
.mirror { height: 100%; }
.panel { padding: 24px 28px; display: flex; flex-direction: column; gap: 16px; }
.row { display: flex; gap: 10px; align-items: center; font-weight: 400; }
.phase { font-weight: 600; color: var(--plum-soft); }
.cue { font: var(--h1); padding: 20px; border-radius: 18px; background: var(--field-plum); }
.cue.raise { background: var(--lemon); }
.cue.furrow { background: var(--field-tangerine); }
.cue.rest { background: var(--white); border: 2px dashed var(--plum); }
.left { font: var(--h2); }
.help { font: var(--small); color: var(--plum-soft); }
.err { color: var(--red); font-weight: 600; }
code { word-break: break-all; }
</style>
