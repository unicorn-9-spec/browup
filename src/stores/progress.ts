// Progress (PLAN F9): per attempt — prompt id, marker, verdict, coverage %.
// Numbers only; deletable from Privacy. Replay attempts are never saved.

import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { progressByMarker } from '../lesson/progress';
import type { Attempt } from '../types';

export const useProgress = defineStore('progress', () => {
  const attempts = ref<Attempt[]>([]);
  const byMarker = computed(() => progressByMarker(attempts.value));

  async function load(): Promise<void> {
    const a = await window.browup?.store.read<Attempt[]>('progress');
    attempts.value = Array.isArray(a) ? a : [];
  }

  async function add(a: Attempt, save: boolean): Promise<void> {
    attempts.value = [...attempts.value, a];
    if (save) await window.browup?.store.write('progress', JSON.parse(JSON.stringify(attempts.value)));
  }

  async function clear(): Promise<void> {
    attempts.value = [];
    await window.browup?.store.deleteProgress();
  }

  return { attempts, byMarker, load, add, clear };
});
