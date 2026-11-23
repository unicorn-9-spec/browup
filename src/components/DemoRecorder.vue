<script setup lang="ts">
// Top-bar control for the demo recorder (developer flag only — App.vue
// renders this component only when the app was started with
// --demo-recorder). Ctrl+Shift+R starts and stops; a red ● REC timer shows
// while recording; when saved, a banner gives the file and "Show in folder".
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { DemoRecorder, type RecorderState } from '../demo/recorder';
import { useApp } from '../stores/app';

const app = useApp();
const state = ref<RecorderState>('idle');
const elapsed = ref(0);
const saved = ref<{ path: string; bytes: number } | null>(null);
const error = ref('');
const bytes = ref(0);
const rec = new DemoRecorder((r) => { state.value = r.state; bytes.value = r.bytes; });
let timer: ReturnType<typeof setInterval> | null = null;

const clock = computed(() => {
  const s = Math.floor(elapsed.value / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
});

async function toggle(): Promise<void> {
  error.value = '';
  if (state.value === 'idle') {
    saved.value = null;
    try {
      await rec.start();
      timer = setInterval(() => { elapsed.value = Date.now() - rec.startedAt; }, 250);
      app.announce('Demo recording started.');
    } catch (e) {
      error.value = `Could not start recording: ${(e as Error).message}`;
    }
  } else if (state.value === 'recording') {
    if (timer) clearInterval(timer);
    const r = await rec.stop();
    elapsed.value = 0;
    if (r && r.bytes > 0) {
      saved.value = r;
      app.announce('Demo recording saved.');
    } else {
      error.value = 'Nothing was captured, so no file was saved. Keep the BrowUp window visible (not minimised or covered) while recording, then try again — or use Win+Alt+R.';
      app.announce(error.value);
    }
  }
}

function showInFolder(): void {
  if (saved.value) void window.browup?.demo.show(saved.value.path);
}

function onKey(e: KeyboardEvent): void {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    void toggle();
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.browup?.onShutdown(async () => { await rec.stop(); });
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  if (timer) clearInterval(timer);
  void rec.stop();
});
</script>

<template>
  <div class="demo-rec">
    <button
      type="button"
      class="rec"
      :class="state"
      :disabled="state === 'starting' || state === 'saving'"
      :aria-label="state === 'recording' ? `Stop demo recording (${clock})` : 'Start demo recording'"
      data-testid="demo-rec"
      @click="toggle"
    >
      <span class="dot" aria-hidden="true" />
      <template v-if="state === 'recording'"><span class="num">REC {{ clock }} · {{ (bytes / 1e6).toFixed(1) }} MB</span></template>
      <template v-else-if="state === 'saving'">Saving…</template>
      <template v-else-if="state === 'starting'">Starting…</template>
      <template v-else>Record demo</template>
      <kbd aria-hidden="true">Ctrl+Shift+R</kbd>
    </button>
    <div v-if="saved || error" class="toast" role="status" data-testid="demo-saved">
      <template v-if="saved">
        <span class="icon" aria-hidden="true">movie</span>
        Saved {{ (saved.bytes / 1e6).toFixed(1) }} MB:
        <code>{{ saved.path }}</code>
        <button type="button" class="link" @click="showInFolder">Show in folder</button>
      </template>
      <template v-else>{{ error }}</template>
      <button type="button" class="link" aria-label="Dismiss" @click="saved = null; error = ''">✕</button>
    </div>
  </div>
</template>

<style scoped>
.demo-rec { position: relative; }
.rec {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 14px; border-radius: 999px;
  border: 2px solid var(--plum); background: var(--white); color: var(--plum);
  font: 600 15px/1 var(--font); cursor: pointer;
}
.rec .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--red); }
.rec.recording { background: var(--red); color: var(--white); border-color: var(--red); }
.rec.recording .dot { background: var(--white); animation: blink 1s steps(2) infinite; }
.rec kbd { font-size: 11px; }
.rec.recording kbd { color: var(--plum); }
@keyframes blink { 50% { opacity: 0.2; } }
.toast {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 40;
  width: min(560px, 80vw); display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  background: var(--white); border: 2px solid var(--plum); border-left: 8px solid var(--mint);
  border-radius: 12px; padding: 10px 14px; font: var(--small);
}
code { word-break: break-all; }
.link { background: none; border: none; color: var(--tangerine-text); font: 600 15px/1 var(--font); cursor: pointer; text-decoration: underline; padding: 4px; }
</style>
