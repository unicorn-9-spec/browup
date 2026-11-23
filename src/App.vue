<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import Logo from './components/Logo.vue';
import ChunkyButton from './components/ChunkyButton.vue';
import DemoRecorder from './components/DemoRecorder.vue';
import SettingsSheet from './views/SettingsSheet.vue';
import Welcome from './views/Welcome.vue';
import Consent from './views/Consent.vue';
import Setup from './views/Setup.vue';
import Calibrate from './views/Calibrate.vue';
import Home from './views/Home.vue';
import Lesson from './views/Lesson.vue';
import Progress from './views/Progress.vue';
import Probe from './views/Probe.vue';
import { CAMERA_VIEWS, useApp } from './stores/app';
import { useSession } from './stores/session';
import { useSettings } from './stores/settings';
import { useProfile } from './stores/profile';
import { useProgress } from './stores/progress';
import { useLesson } from './stores/lesson';
import type { ErrorAction } from './sensing/errors';
import { faceSession } from './sensing/session';

const app = useApp();
const session = useSession();
const settings = useSettings();
const profile = useProfile();
const progress = useProgress();
const lesson = useLesson();

const onboarding = computed(() => ['welcome', 'consent'].includes(app.view));

// Camera only on Setup, Calibrate, Lesson/Review and the probe (PLAN §6).
watch(() => app.view, (v, old) => {
  if (old === 'lesson' && v !== 'lesson') lesson.leave();
  if (!CAMERA_VIEWS.has(v) && session.mode !== 'replay') void session.stop();
  if (old === 'setup' && v !== 'setup') faceSession.closePreview();
});

async function stopCamera(): Promise<void> {
  lesson.cancel(null);
  await session.stop();
  app.announce('Camera off.');
}

async function exitReplay(): Promise<void> {
  lesson.leave();
  await session.endReplay();
  app.go('welcome');
}

async function act(a: ErrorAction): Promise<void> {
  const err = session.error;
  session.error = null;
  switch (a) {
    case 'retry': await session.ensureLive(); break;
    case 'setup': app.go('setup'); break;
    case 'settings': app.sheet = 'settings'; break;
    case 'replay': if (await session.startReplay()) app.go('home'); break;
    case 'welcome': app.go('welcome'); break;
    default: void err;
  }
}

const ACTION_LABEL: Record<ErrorAction, string> = {
  retry: 'Try again', setup: 'Open Setup', settings: 'Settings', replay: 'Watch the replay', welcome: 'Back to start', dismiss: 'Dismiss',
};

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !app.sheet) {
    if (session.cameraOn) { e.preventDefault(); void stopCamera(); }
    else if (lesson.phase === 'countdown' || lesson.phase === 'capturing') lesson.cancel(null);
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKey);
  window.browup?.onShutdown(async () => { await session.stop(); });
  if (!window.browup) return;
  app.flags = await window.browup.flags();
  const info = await window.browup.sdkInfo();
  app.sdkAvailable = info.available;
  await settings.load();
  await Promise.all([app.loadPacks(), profile.load(), progress.load()]);
  const pick = app.packs.find((p) => p.dir === settings.s.pack && p.loadable) ?? app.packs.find((p) => p.loadable);
  if (pick) await app.choosePack(pick.dir);
  if (app.flags.probe) app.go('probe');
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="shell">
    <header class="top">
      <button type="button" class="brand" aria-label="BrowUp — home" @click="app.go(onboarding ? 'welcome' : 'home')">
        <Logo :size="40" wordmark />
      </button>
      <nav v-if="!onboarding && app.view !== 'probe'" class="nav" aria-label="Main">
        <button type="button" class="chip" :class="{ on: app.view === 'home' || app.view === 'lesson' }" @click="app.go('home')">
          <span class="icon" aria-hidden="true">school</span> Lessons
        </button>
        <button type="button" class="chip" :class="{ on: app.view === 'progress' }" @click="app.go('progress')">
          <span class="icon" aria-hidden="true">bar_chart</span> Progress
        </button>
        <button v-if="!app.replay" type="button" class="chip" :class="{ on: app.view === 'calibrate' }" @click="app.go('calibrate')">
          <span class="icon" aria-hidden="true">tune</span> Calibrate
        </button>
      </nav>
      <div class="right">
        <DemoRecorder v-if="app.flags.demoRecorder" />
        <span v-if="session.cameraOn" class="pill" role="status" data-testid="camera-pill">
          <span class="icon" aria-hidden="true">videocam</span> Camera on
        </span>
        <span v-if="app.replay" class="pill replay" role="status">
          <span class="icon" aria-hidden="true">replay</span> REPLAY
        </span>
        <button type="button" class="round" aria-label="Settings and privacy" @click="app.sheet = 'settings'">
          <span class="icon" aria-hidden="true">settings</span>
        </button>
        <ChunkyButton v-if="session.cameraOn" variant="danger" icon="stop_circle" kbd="Esc" small data-testid="stop" @click="stopCamera">Stop</ChunkyButton>
        <ChunkyButton v-if="app.replay" variant="secondary" icon="logout" small @click="exitReplay">Leave replay</ChunkyButton>
      </div>
    </header>

    <div v-if="app.replay" class="banner info" role="note">
      <span class="icon" aria-hidden="true">replay</span>
      <span><strong>REPLAY</strong> — {{ app.replaySynthetic ? 'synthetic demo data generated from a face model' : 'a recorded session' }}. No camera, no key, nothing is saved.</span>
    </div>
    <div v-if="app.packStatus === 'unreviewed' && !onboarding" class="banner warn" role="note" data-testid="unreviewed-banner">
      <span class="icon" aria-hidden="true">rate_review</span>
      <span><strong>UNREVIEWED content.</strong> These {{ app.pack?.language }} prompts are developer drafts and have not been checked by a Deaf signer or qualified teacher yet. Practise the face, not the glosses.</span>
    </div>
    <div v-if="session.error" class="banner error" role="alert">
      <span class="icon" aria-hidden="true">error</span>
      <div class="msg"><strong>{{ session.error.title }}.</strong> {{ session.error.body }}</div>
      <div class="acts">
        <ChunkyButton v-for="a in session.error.actions" :key="a" small variant="secondary" @click="act(a)">{{ ACTION_LABEL[a] }}</ChunkyButton>
        <button type="button" class="round" aria-label="Dismiss" @click="session.error = null"><span class="icon" aria-hidden="true">close</span></button>
      </div>
    </div>

    <main class="main">
      <Welcome v-if="app.view === 'welcome'" />
      <Consent v-else-if="app.view === 'consent'" />
      <Setup v-else-if="app.view === 'setup'" />
      <Calibrate v-else-if="app.view === 'calibrate'" />
      <Home v-else-if="app.view === 'home'" />
      <Lesson v-else-if="app.view === 'lesson'" />
      <Progress v-else-if="app.view === 'progress'" />
      <Probe v-else-if="app.view === 'probe'" />
    </main>

    <SettingsSheet v-if="app.sheet" />
    <div class="sr-only" aria-live="assertive" data-testid="announcer">{{ app.announcement }}</div>
  </div>
</template>

<style scoped>
.shell { height: 100%; display: flex; flex-direction: column; }
.top { display: flex; align-items: center; gap: 24px; padding: 10px 28px; border-bottom: 2px solid var(--plum); background: var(--peach); }
.brand { background: none; border: none; padding: 4px; cursor: pointer; color: var(--plum); border-radius: 12px; }
.nav { display: flex; gap: 10px; }
.chip { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 16px; border-radius: 999px; border: 2px solid var(--plum); background: var(--white); color: var(--plum); font: 600 16px/1 var(--font); cursor: pointer; }
.chip.on { background: var(--tangerine); }
.right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 999px; background: var(--plum); color: var(--white); font: 600 15px/1 var(--font); }
.pill.replay { background: var(--lemon); color: var(--plum); border: 2px solid var(--plum); }
.round { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--plum); background: var(--white); color: var(--plum); display: grid; place-items: center; cursor: pointer; flex: none; }
.banner { display: flex; align-items: center; gap: 12px; padding: 7px 28px; border-bottom: 2px solid var(--plum); font: var(--small); }
.banner.info { background: var(--lemon); }
.banner.warn { background: var(--field-tangerine); }
.banner.error { background: var(--white); border-left: 8px solid var(--red); }
.banner .msg { flex: 1; }
.banner .acts { display: flex; gap: 8px; align-items: center; }
.main { flex: 1; min-height: 0; overflow: auto; padding: 18px 28px; }
</style>
