<script setup lang="ts">
// Welcome (PLAN §3.2 step 1): "Practise the grammar on your face." Choose a
// sign language (packs not yet reviewed are shown as "coming"), Start, or
// watch the replay (no camera, no key).
import { computed } from 'vue';
import Logo from '../components/Logo.vue';
import ChunkyButton from '../components/ChunkyButton.vue';
import FaceDiagram from '../components/FaceDiagram.vue';
import { useApp } from '../stores/app';
import { useSettings } from '../stores/settings';
import { useSession } from '../stores/session';
import { useProfile } from '../stores/profile';

const app = useApp();
const settings = useSettings();
const session = useSession();
const profile = useProfile();

const chosen = computed(() => app.packs.find((p) => p.dir === settings.s.pack && p.loadable) ?? app.packs.find((p) => p.loadable) ?? null);

async function choose(dir: string): Promise<void> {
  if (await app.choosePack(dir)) settings.s.pack = dir;
}

async function start(): Promise<void> {
  if (!chosen.value) return;
  await app.choosePack(chosen.value.dir);
  if (!settings.s.consentAt) return app.go('consent');
  const key = await window.browup?.key.status();
  if (!key?.present) return app.go('setup');
  if (!profile.saved) return app.go('calibrate');
  app.go('home');
}

async function replay(): Promise<void> {
  if (!chosen.value) return;
  await app.choosePack(chosen.value.dir);
  if (await session.startReplay()) app.go('home');
}
</script>

<template>
  <div class="welcome">
    <section class="hero card">
      <Logo :size="88" />
      <h1>Practise the grammar on your face.</h1>
      <p class="lead">
        Sign languages carry grammar on the face: raised brows for yes/no questions, furrowed brows for wh-questions,
        a head shake for negation — held across the whole sentence. BrowUp shows you what your face did.
      </p>
      <div class="faces" aria-hidden="true">
        <figure><FaceDiagram pose="raise" :size="92" /><figcaption>y/n</figcaption></figure>
        <figure><FaceDiagram pose="furrow" :size="92" /><figcaption>wh</figcaption></figure>
        <figure><FaceDiagram pose="shake" :size="92" /><figcaption>neg</figcaption></figure>
        <figure><FaceDiagram pose="nod" :size="92" /><figcaption>aff</figcaption></figure>
      </div>

      <fieldset class="langs">
        <legend>Sign language</legend>
        <div class="lang-list">
          <label v-for="p in app.packs" :key="p.dir" class="lang" :class="{ off: !p.loadable }">
            <input type="radio" name="pack" :value="p.dir" :checked="chosen?.dir === p.dir" :disabled="!p.loadable" @change="choose(p.dir)" />
            <span class="code">{{ p.language }}</span>
            <span class="name">{{ p.languageName }}</span>
            <span v-if="!p.loadable" class="tag">pack coming — awaiting review</span>
            <span v-else-if="p.status === 'unreviewed'" class="tag warn">unreviewed draft</span>
            <span v-else class="tag ok">reviewed by {{ p.reviewer?.name }}</span>
          </label>
          <p v-if="app.packs.length === 0" class="note">No content packs found.</p>
        </div>
      </fieldset>

      <div class="actions">
        <ChunkyButton icon="play_arrow" :disabled="!chosen" data-testid="start" @click="start">Start</ChunkyButton>
        <ChunkyButton variant="secondary" icon="replay" :disabled="!chosen" data-testid="watch-replay" @click="replay">Watch a replay</ChunkyButton>
      </div>
      <p v-if="!chosen && app.packs.length" class="note">
        No pack is ready yet: content is shown only after a Deaf signer or qualified teacher has reviewed it.
      </p>
      <p class="note">No sound is used anywhere in BrowUp. The camera picture stays on this computer and is never recorded.</p>
    </section>
  </div>
</template>

<style scoped>
.welcome { display: grid; place-items: center; min-height: 100%; }
.hero { max-width: 860px; padding: 40px 48px; display: flex; flex-direction: column; gap: 22px; align-items: flex-start; }
.lead { max-width: 64ch; }
.faces { display: flex; gap: 22px; }
figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; font: 600 16px/1 var(--font); }
.langs { border: none; padding: 0; margin: 0; width: 100%; }
legend { font: var(--h3); margin-bottom: 10px; }
.lang-list { display: flex; flex-direction: column; gap: 8px; }
.lang { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border: 2px solid var(--plum); border-radius: 14px; background: var(--peach); cursor: pointer; }
.lang.off { opacity: 0.7; cursor: not-allowed; }
.lang input { width: 22px; height: 22px; min-height: 0; accent-color: var(--plum); }
.code { font: 700 20px/1 var(--font); }
.tag { margin-left: auto; font: 600 14px/1 var(--font); padding: 6px 10px; border-radius: 999px; background: var(--white); border: 2px solid var(--plum); }
.tag.warn { background: var(--field-tangerine); }
.tag.ok { background: var(--field-mint); }
.actions { display: flex; gap: 14px; flex-wrap: wrap; }
.note { font: var(--small); color: var(--plum-soft); }
</style>
