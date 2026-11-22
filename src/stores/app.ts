// App-level state: which screen is showing, flags, the loaded content pack,
// consent, bottom sheets and screen-reader announcements.

import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { Pack } from '../../content/validate';
import type { AppFlags, PackListing } from '../env';

export type View = 'welcome' | 'consent' | 'setup' | 'calibrate' | 'home' | 'lesson' | 'progress' | 'probe';

/** Screens that may use the camera (PLAN §6 row 2). */
export const CAMERA_VIEWS: ReadonlySet<View> = new Set(['setup', 'calibrate', 'lesson', 'probe']);

export const useApp = defineStore('app', () => {
  const view = ref<View>('welcome');
  const flags = ref<AppFlags>({ probe: false, e2e: false, devUnreviewed: false });
  const packs = ref<PackListing[]>([]);
  const pack = shallowRef<Pack | null>(null);
  const packStatus = ref<'reviewed' | 'unreviewed' | null>(null);
  const replay = ref(false);
  const replaySynthetic = ref(false);
  const sheet = ref<null | 'settings' | 'privacy'>(null);
  const announcement = ref('');
  const sdkAvailable = ref(true);

  function go(v: View): void {
    view.value = v;
    sheet.value = null;
  }

  function announce(text: string): void {
    // Re-set so screen readers repeat identical messages.
    announcement.value = '';
    queueMicrotask(() => { announcement.value = text; });
  }

  async function loadPacks(): Promise<void> {
    packs.value = (await window.browup?.packs.list()) ?? [];
  }

  async function choosePack(dir: string): Promise<boolean> {
    const r = await window.browup?.packs.get(dir);
    if (!r) return false;
    pack.value = r.pack;
    packStatus.value = r.status === 'reviewed' ? 'reviewed' : 'unreviewed';
    return true;
  }

  return { view, flags, packs, pack, packStatus, replay, replaySynthetic, sheet, announcement, sdkAvailable, go, announce, loadPacks, choosePack };
});
