// The learner's calibration profile (baselines, noise, ranges) and the
// thresholds derived from it. In replay, the recording's own profile is used
// and never saved.

import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import { thresholdsFor } from '../face/calibration';
import type { Profile } from '../types';
import { faceSession } from '../sensing/session';
import { useSettings } from './settings';

export const useProfile = defineStore('profile', () => {
  const saved = shallowRef<Profile | null>(null);
  const replayProfile = shallowRef<Profile | null>(null);
  const settings = useSettings();

  const active = computed(() => replayProfile.value ?? saved.value);
  const thresholds = computed(() => thresholdsFor(active.value, settings.s.sensitivity));

  async function load(): Promise<void> {
    const p = await window.browup?.store.read<Profile>('profile');
    saved.value = p && p.version === 1 ? p : null;
    faceSession.setProfile(active.value);
  }

  async function save(p: Profile): Promise<void> {
    saved.value = p;
    faceSession.setProfile(active.value);
    await window.browup?.store.write('profile', JSON.parse(JSON.stringify(p)));
  }

  async function reset(): Promise<void> {
    saved.value = null;
    faceSession.setProfile(active.value);
    await window.browup?.store.resetCalibration();
  }

  function useReplayProfile(p: Profile | null): void {
    replayProfile.value = p;
    faceSession.setProfile(active.value);
  }

  return { saved, active, thresholds, load, save, reset, useReplayProfile };
});
