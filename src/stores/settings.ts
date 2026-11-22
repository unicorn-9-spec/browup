// Settings (PLAN F14): window length 3–7 s, mirror flip, sensitivity,
// reduced motion, content pack, camera; plus whether consent was given.
// Stored as a small JSON file by the main process.

import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { Settings } from '../types';

export interface StoredSettings extends Settings {
  consentAt: string | null;
  recordReplays: boolean;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  windowS: 'auto',
  mirrorFlip: true,
  sensitivity: 'standard',
  reducedMotion: 'system',
  pack: 'asl',
  cameraId: '',
  consentAt: null,
  recordReplays: false,
};

export const useSettings = defineStore('settings', () => {
  const s = ref<StoredSettings>({ ...DEFAULT_SETTINGS });
  const loaded = ref(false);
  const systemReduced = ref(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { systemReduced.value = e.matches; });
  }

  const reducedMotion = computed(() => (s.value.reducedMotion === 'system' ? systemReduced.value : s.value.reducedMotion === 'on'));

  async function load(): Promise<void> {
    const stored = await window.browup?.store.read<Partial<StoredSettings>>('settings');
    s.value = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
    loaded.value = true;
  }

  watch(s, (v) => {
    if (loaded.value) void window.browup?.store.write('settings', JSON.parse(JSON.stringify(v)));
  }, { deep: true });

  watch(reducedMotion, (r) => {
    document.documentElement.dataset.reducedMotion = r ? 'on' : 'off';
  }, { immediate: true });

  return { s, loaded, reducedMotion, load };
});
