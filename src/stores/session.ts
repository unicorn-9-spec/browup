// Live sensing state for the UI: camera on/off, the latest feature frame,
// validation banners (debounced 1 s, PLAN signal table), SDK errors, the
// live "target state holds" flag for the overlays, and replay loading.

import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { VALIDITY } from '../../config/thresholds';
import { VC } from '../sensing/codes';
import { errorForCamera, errorForSdk, validationBanner, type AppError } from '../sensing/errors';
import { parseRecording } from '../sensing/replay';
import { faceSession, nowUs } from '../sensing/session';
import { NoKeyError } from '../sensing/sdk';
import { Recorder } from '../sensing/record';
import { EXPRESSIONS } from '../../config/thresholds';
import type { FeatureFrame, MarkerType } from '../types';
import { episodes } from '../verdict/markers/oscillation';
import { furrowed, raised } from '../verdict/markers/brow';
import { useApp } from './app';
import { useProfile } from './profile';
import { useSettings } from './settings';

const BANNER_DEBOUNCE_MS = 1000;
const LIVE_OSC_S = 1.6;

export const useSession = defineStore('session', () => {
  const app = useApp();
  const profile = useProfile();
  const settings = useSettings();

  const mode = ref<'off' | 'live' | 'replay' | 'starting'>('off');
  const frame = shallowRef<FeatureFrame | null>(null);
  const code = ref<number>(VC.kOk);
  const hint = ref('');
  const codeSince = ref(0);
  const error = shallowRef<AppError | null>(null);
  const liveMarker = ref<MarkerType | null>(null);
  const fps = ref(0);
  const recent: FeatureFrame[] = [];
  const liveOsc = ref<{ shake: boolean; nod: boolean }>({ shake: false, nod: false });
  let frameTimes: number[] = [];

  /** Setup's framing preview (camera on, no measurement). */
  const previewOn = ref(false);
  const cameraOn = computed(() => mode.value === 'live' || mode.value === 'starting' || previewOn.value);

  // Re-evaluate the debounce on a steady clock — when the face is lost no
  // frames arrive, and that is exactly when the hint matters most.
  const tick = ref(0);
  setInterval(() => { if (code.value !== VC.kOk) tick.value++; }, 250);

  /** Banner text once the code has lasted the debounce time (Date.now() is
   *  not reactive, so this reads `tick` to be re-evaluated). */
  const bannerNow = computed(() => {
    void tick.value;
    const title = validationBanner(code.value);
    if (!title) return null;
    const need = code.value === VC.kMultipleFacesFound ? VALIDITY.MULTI_FACE_DEBOUNCE_MS : BANNER_DEBOUNCE_MS;
    if (Date.now() - codeSince.value < need) return null;
    return { title, hint: hint.value };
  });

  /** Whether the current marker's target state holds right now (overlay
   *  turns mint). */
  const livePresent = computed(() => {
    const f = frame.value;
    const m = liveMarker.value;
    if (!f || !m) return false;
    const th = profile.thresholds;
    switch (m) {
      case 'yn':
      case 'topic':
      case 'cond':
        return f.validBrow && raised(f, th);
      case 'wh':
        return f.validBrow && furrowed(f, th);
      case 'neg':
        return liveOsc.value.shake;
      case 'aff':
        return liveOsc.value.nod;
    }
  });

  faceSession.on({
    frame(f) {
      frame.value = f;
      tick.value++;
      const now = performance.now();
      frameTimes.push(now);
      frameTimes = frameTimes.filter((t) => now - t < 1000);
      fps.value = frameTimes.length;
      recent.push(f);
      while (recent.length && recent[0]!.t < f.t - LIVE_OSC_S * 1e6) recent.shift();
      if (liveMarker.value === 'neg' || liveMarker.value === 'aff') {
        const t0 = recent[0]?.t ?? f.t;
        const th = profile.thresholds;
        const samples = (pick: (x: FeatureFrame) => number) => recent.map((x) => ({ s: (x.t - t0) / 1e6, v: pick(x), valid: x.validHead }));
        liveOsc.value = {
          shake: episodes(samples((x) => x.yawDeg), th.shakeDeg, LIVE_OSC_S).length > 0,
          nod: episodes(samples((x) => x.pitchDeg), th.nodDeg, LIVE_OSC_S).length > 0,
        };
      }
    },
    validation(c, h) {
      if (c !== code.value) codeSince.value = Date.now();
      code.value = c;
      hint.value = h;
    },
    error(c, _m, retryable) {
      error.value = errorForSdk(c, retryable);
      if (!retryable) void stop();
    },
  });

  async function ensureLive(): Promise<boolean> {
    if (mode.value === 'replay' || faceSession.mode === 'replay') return true;
    if (faceSession.mode === 'live') { mode.value = 'live'; return true; }
    error.value = null;
    mode.value = 'starting';
    try {
      await faceSession.startLive(settings.s.cameraId || undefined);
      mode.value = 'live';
      startRecorder();
      codeSince.value = Date.now();
      return true;
    } catch (err) {
      mode.value = 'off';
      if (err instanceof NoKeyError) error.value = { title: 'No API key yet', body: 'Add your SmartSpectra API key in Setup to practise with the camera. The replay works without one.', actions: ['setup', 'replay'] };
      else if (err instanceof DOMException) error.value = errorForCamera(err.name);
      else error.value = { title: 'Face tracking could not start', body: (err as Error).message.slice(0, 200), actions: ['retry', 'setup'] };
      return false;
    }
  }

  /** Opt-in numbers-only recorder (Settings → "Save numbers-only replays"). */
  function startRecorder(): void {
    if (!settings.s.recordReplays || faceSession.recorder?.recording) return;
    const { w, h } = faceSession.frameSize;
    faceSession.recorder = new Recorder({
      kind: 'header', format: 'browup-replay', version: 1, createdAt: new Date().toISOString(),
      synthetic: false, description: 'Recorded BrowUp practice (numbers only).', frameSize: { w, h }, profile: profile.active,
    });
    // Expression scores are kept only while the agreement test is pending.
    faceSession.recorder.start({ keepExpressions: EXPRESSIONS.MODE === 'pending' });
  }

  async function saveRecording(): Promise<void> {
    const r = faceSession.recorder;
    faceSession.recorder = null;
    if (!r?.recording) return;
    const text = r.stop({ profile: profile.active });
    if (text.length > 4000) await window.browup?.rec.save(text);
  }

  /** Camera off within 1 s (PLAN F7): tracks first, then the SDK. */
  async function stop(): Promise<void> {
    if (mode.value === 'replay') return;
    previewOn.value = false;
    mode.value = 'off';
    frame.value = null;
    await faceSession.stop();
    await saveRecording();
  }

  async function startReplay(text?: string): Promise<boolean> {
    const raw = text ?? (await window.browup?.replayBundled());
    if (!raw) {
      error.value = { title: 'Replay not found', body: 'The bundled replay file is missing (fixtures/replay/demo.jsonl). Run "npm run fixtures".', actions: ['welcome'] };
      return false;
    }
    await faceSession.stop();
    const rec = parseRecording(raw);
    faceSession.loadReplay(rec);
    profile.useReplayProfile(rec.header.profile);
    app.replay = true;
    app.replaySynthetic = rec.header.synthetic;
    mode.value = 'replay';
    error.value = null;
    return true;
  }

  async function endReplay(): Promise<void> {
    faceSession.stopReplay();
    profile.useReplayProfile(null);
    app.replay = false;
    mode.value = 'off';
    frame.value = null;
  }

  return { mode, previewOn, frame, code, hint, error, liveMarker, livePresent, liveOsc, fps, cameraOn, banner: bannerNow, ensureLive, stop, startReplay, endReplay, nowUs };
});
