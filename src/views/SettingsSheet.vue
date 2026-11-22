<script setup lang="ts">
// Settings (PLAN F14) and Privacy (§3.2 step 11, §6) in one bottom sheet:
// window length, mirror flip, sensitivity, reduced motion; camera off,
// delete progress, reset calibration, telemetry status, where files live.
import { onMounted, ref } from 'vue';
import BottomSheet from '../components/BottomSheet.vue';
import ChunkyButton from '../components/ChunkyButton.vue';
import { CAPTURE } from '../../config/thresholds';
import { useApp } from '../stores/app';
import { useProfile } from '../stores/profile';
import { useProgress } from '../stores/progress';
import { useSession } from '../stores/session';
import { useSettings } from '../stores/settings';

const app = useApp();
const settings = useSettings();
const profile = useProfile();
const progress = useProgress();
const session = useSession();
const paths = ref<string[]>([]);
const done = ref('');
const confirmDelete = ref(false);

onMounted(async () => {
  paths.value = (await window.browup?.paths())?.files ?? [];
});

const windows = Array.from({ length: (CAPTURE.MAX_WINDOW_S - CAPTURE.MIN_WINDOW_S) * 2 + 1 }, (_, i) => CAPTURE.MIN_WINDOW_S + i / 2);

async function deleteProgress(): Promise<void> {
  await progress.clear();
  confirmDelete.value = false;
  done.value = 'Your progress was deleted.';
  app.announce(done.value);
}
async function resetCalibration(): Promise<void> {
  await profile.reset();
  done.value = 'Calibration reset. BrowUp uses standard thresholds until you calibrate again.';
  app.announce(done.value);
}
async function forgetKey(): Promise<void> {
  await window.browup?.key.clear();
  done.value = 'The saved API key was removed from this computer.';
  app.announce(done.value);
}
</script>

<template>
  <BottomSheet :title="app.sheet === 'privacy' ? 'Privacy' : 'Settings and privacy'" @close="app.sheet = null">
    <section v-if="app.sheet === 'settings'" class="group" aria-labelledby="s-practice">
      <h3 id="s-practice">Practice</h3>
      <div class="row">
        <label for="win">Capture window</label>
        <select id="win" :value="String(settings.s.windowS)" @change="settings.s.windowS = ($event.target as HTMLSelectElement).value === 'auto' ? 'auto' : Number(($event.target as HTMLSelectElement).value)">
          <option value="auto">Automatic (3–5 s, by sentence length)</option>
          <option v-for="w in windows" :key="w" :value="String(w)">{{ w }} seconds</option>
        </select>
      </div>
      <div class="row">
        <label for="sens">Sensitivity</label>
        <select id="sens" v-model="settings.s.sensitivity">
          <option value="gentle">Gentle — smaller movements count</option>
          <option value="standard">Standard</option>
          <option value="strict">Strict — bigger movements needed</option>
        </select>
      </div>
      <div class="row">
        <label for="flip">Mirror the picture</label>
        <input id="flip" v-model="settings.s.mirrorFlip" type="checkbox" class="check" />
      </div>
      <div class="row">
        <label for="motion">Reduced motion</label>
        <select id="motion" v-model="settings.s.reducedMotion">
          <option value="system">Follow my computer</option>
          <option value="on">On — no springs or rotation</option>
          <option value="off">Off</option>
        </select>
      </div>
      <div class="row">
        <label for="rec">Save numbers-only replays of my practice</label>
        <input id="rec" v-model="settings.s.recordReplays" type="checkbox" class="check" />
      </div>
      <p class="help">A replay holds landmark numbers for your brows, eyelids and nose tip — never pictures. Off by default.</p>
    </section>

    <section class="group" aria-labelledby="s-privacy">
      <h3 id="s-privacy">Privacy</h3>
      <ul class="facts">
        <li><span class="icon" aria-hidden="true">computer</span><span>The camera picture is shown only on this computer. It is never recorded, saved or sent.</span></li>
        <li><span class="icon" aria-hidden="true">cloud_off</span><span>Telemetry is <strong>off</strong>. SmartSpectra still contacts Presage to check its licence while the camera is on.</span></li>
        <li><span class="icon" aria-hidden="true">block</span><span>No emotion reading, no identity, no ability scores.</span></li>
      </ul>
      <div class="buttons">
        <ChunkyButton small variant="secondary" icon="videocam_off" :disabled="!session.cameraOn" @click="session.stop()">Turn camera off</ChunkyButton>
        <ChunkyButton small variant="secondary" icon="restart_alt" :disabled="!profile.saved" @click="resetCalibration">Reset calibration</ChunkyButton>
        <ChunkyButton small variant="secondary" icon="key_off" @click="forgetKey">Remove API key</ChunkyButton>
        <ChunkyButton v-if="!confirmDelete" small variant="danger" icon="delete" data-testid="delete-progress" @click="confirmDelete = true">Delete my progress</ChunkyButton>
        <template v-else>
          <span class="confirm">Delete all results and saved replays?</span>
          <ChunkyButton small variant="danger" icon="delete_forever" data-testid="delete-confirm" @click="deleteProgress">Yes, delete</ChunkyButton>
          <ChunkyButton small variant="secondary" @click="confirmDelete = false">Keep</ChunkyButton>
        </template>
      </div>
      <p v-if="done" class="done" role="status">{{ done }}</p>
      <details>
        <summary>Where BrowUp keeps its files</summary>
        <ul class="paths"><li v-for="p in paths" :key="p"><code>{{ p }}</code></li></ul>
      </details>
    </section>
  </BottomSheet>
</template>

<style scoped>
.group { display: flex; flex-direction: column; gap: 12px; }
.row { display: grid; grid-template-columns: 1fr 1.3fr; gap: 16px; align-items: center; }
.check { width: 28px; height: 28px; min-height: 0; accent-color: var(--plum); justify-self: start; }
.help { font: var(--small); color: var(--plum-soft); }
.facts { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.facts li { display: flex; gap: 10px; align-items: flex-start; }
.buttons { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.confirm { font-weight: 600; }
.done { background: var(--field-mint); border-radius: 10px; padding: 8px 12px; }
.paths { font: var(--small); }
code { word-break: break-all; }
summary { cursor: pointer; font-weight: 600; }
</style>
