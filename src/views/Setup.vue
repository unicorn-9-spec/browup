<script setup lang="ts">
// Setup (PLAN §3.2 step 2, §5.8): API key, camera, framing tip with a live
// mirror (camera preview only — no measurement, no credits used), and an
// optional "Check this computer" readiness check in words.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ChunkyButton from '../components/ChunkyButton.vue';
import { useApp } from '../stores/app';
import { useSettings } from '../stores/settings';
import { useProfile } from '../stores/profile';
import { faceSession } from '../sensing/session';
import { SenseClient } from '../sensing/sdk';
import { errorForCamera } from '../sensing/errors';
import type { KeyStatus } from '../env';
import { useSession } from '../stores/session';

const app = useApp();
const settings = useSettings();
const profile = useProfile();
const session = useSession();
const keyInput = ref('');
const keyStatus = ref<KeyStatus | null>(null);
const keyMsg = ref('');
const cameras = ref<MediaDeviceInfo[]>([]);
const video = ref<HTMLVideoElement | null>(null);
const camMsg = ref('');
const readiness = ref<{ verdict: string; reason: string } | null>(null);
const checking = ref(false);

async function refreshKey(): Promise<void> {
  keyStatus.value = (await window.browup?.key.status()) ?? null;
}

async function saveKey(): Promise<void> {
  try {
    const r = await window.browup!.key.save(keyInput.value);
    keyInput.value = '';
    keyMsg.value = r.persisted ? 'Saved, encrypted by your operating system.' : 'Kept for this session only (no system keychain available).';
    await refreshKey();
  } catch {
    keyMsg.value = 'That does not look like a key. Paste the whole key from your Presage account.';
  }
}

async function openPreview(): Promise<void> {
  camMsg.value = '';
  try {
    const s = await faceSession.preview(settings.s.cameraId || undefined);
    if (video.value) { video.value.srcObject = s; await video.value.play().catch(() => {}); }
    session.previewOn = true;
    cameras.value = await SenseClient.cameras();
  } catch (err) {
    camMsg.value = errorForCamera((err as DOMException).name).body;
  }
}

async function changeCamera(id: string): Promise<void> {
  settings.s.cameraId = id;
  closePreview();
  await openPreview();
}

async function check(): Promise<void> {
  closePreview(); // the check opens the camera natively
  if (video.value) video.value.srcObject = null;
  checking.value = true;
  readiness.value = null;
  try {
    readiness.value = (await window.browup?.readiness()) ?? null;
  } finally {
    checking.value = false;
    await openPreview();
  }
}

// Stop / Esc in the top bar turns the preview off: blank the mirror.
watch(() => session.previewOn, (on) => { if (!on && video.value) video.value.srcObject = null; });

function closePreview(): void {
  faceSession.closePreview();
  session.previewOn = false;
}

function next(): void {
  closePreview();
  app.go(profile.saved ? 'home' : 'calibrate');
}

onMounted(async () => {
  await refreshKey();
  await openPreview();
});
onBeforeUnmount(() => {
  if (video.value) video.value.srcObject = null;
  closePreview();
});
</script>

<template>
  <div class="split">
    <section class="mirror-col">
      <div class="frame">
        <video v-show="session.previewOn" ref="video" muted playsinline aria-label="Camera preview" :class="{ flip: settings.s.mirrorFlip }" />
        <div v-if="session.previewOn" class="guide" aria-hidden="true"><div class="oval" /></div>
        <div v-else class="off"><span class="icon" aria-hidden="true">videocam_off</span> Camera off <ChunkyButton small variant="secondary" @click="openPreview">Turn camera on</ChunkyButton></div>
      </div>
      <p class="tip"><span class="icon" aria-hidden="true">lightbulb</span> Sit so your face and shoulders fill the oval, with light in front of you. Your hands may enter the frame — keep them below your eyebrows while you sign.</p>
      <p v-if="camMsg" class="err" role="alert">{{ camMsg }}</p>
    </section>
    <section class="form card">
      <h1>Setup</h1>
      <div class="field">
        <label for="key">SmartSpectra API key</label>
        <p class="help" v-if="keyStatus?.present">A key is saved<template v-if="keyStatus.source === 'env'"> (from the development .env file)</template>. Paste a new one to replace it.</p>
        <p class="help" v-else>Get a key from your Presage account. It is stored encrypted on this computer and never shown again.</p>
        <div class="row">
          <input id="key" v-model="keyInput" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key" />
          <ChunkyButton small :disabled="keyInput.trim().length < 8" @click="saveKey">Save key</ChunkyButton>
        </div>
        <p v-if="keyMsg" class="help" role="status">{{ keyMsg }}</p>
      </div>
      <div class="field">
        <label for="cam">Camera</label>
        <select id="cam" :value="settings.s.cameraId" @change="changeCamera(($event.target as HTMLSelectElement).value)">
          <option value="">Default camera</option>
          <option v-for="c in cameras" :key="c.deviceId" :value="c.deviceId">{{ c.label || 'Camera' }}</option>
        </select>
      </div>
      <div class="field">
        <label>Is this computer ready?</label>
        <p class="help">Optional. Takes about 25 seconds and briefly opens the camera itself.</p>
        <div class="row">
          <ChunkyButton small variant="secondary" icon="fact_check" :disabled="checking || !keyStatus?.present" @click="check">{{ checking ? 'Checking…' : 'Check this computer' }}</ChunkyButton>
        </div>
        <p v-if="readiness" class="help" role="status">
          <strong>{{ readiness.verdict === 'ready' ? 'Ready.' : readiness.verdict === 'limited' ? 'Works, with limits.' : readiness.verdict === 'blocked' ? 'Not ready right now.' : 'Could not tell.' }}</strong>
          {{ readiness.reason }}
        </p>
      </div>
      <div class="actions">
        <ChunkyButton icon="arrow_forward" :disabled="!keyStatus?.present" data-testid="setup-next" @click="next">{{ profile.saved ? 'Go to lessons' : 'Next: calibrate' }}</ChunkyButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.split { display: grid; grid-template-columns: 3fr 2fr; gap: 24px; min-height: 100%; }
.mirror-col { display: flex; flex-direction: column; gap: 14px; }
.frame { position: relative; flex: 1; min-height: 360px; border: 4px solid var(--plum); border-radius: var(--radius-card); overflow: hidden; background: var(--field-plum); }
video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
video.flip { transform: scaleX(-1); }
.guide { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.oval { width: 34%; height: 72%; border: 4px dashed var(--white); border-radius: 50%; box-shadow: 0 0 0 4px rgba(58, 29, 77, 0.35); }
.off { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 12px; }
.tip { display: flex; gap: 10px; }
.err { color: var(--red); font-weight: 600; }
.form { padding: 28px 32px; display: flex; flex-direction: column; gap: 24px; }
.field { display: flex; flex-direction: column; gap: 8px; }
.help { font: var(--small); color: var(--plum-soft); }
.row { display: flex; gap: 10px; align-items: center; }
.row input { flex: 1; }
.actions { margin-top: auto; }
</style>
