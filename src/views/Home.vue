<script setup lang="ts">
// Lessons (PLAN F3): one card per lesson set from the content pack, plus
// mixed review (F6) and free practice (F13).
import { computed } from 'vue';
import ChunkyButton from '../components/ChunkyButton.vue';
import FaceDiagram from '../components/FaceDiagram.vue';
import type { Pose } from '../components/pose';
import { useApp } from '../stores/app';
import { useLesson } from '../stores/lesson';
import { useProfile } from '../stores/profile';
import { useProgress } from '../stores/progress';
import { MARKER_LABEL, MARKER_NAME, type MarkerType } from '../types';

const app = useApp();
const lesson = useLesson();
const profile = useProfile();
const progress = useProgress();

const POSE: Record<MarkerType, Pose> = { yn: 'raise', wh: 'furrow', neg: 'shake', aff: 'nod', topic: 'topic', cond: 'cond' };

const sets = computed(() => {
  const pack = app.pack;
  if (!pack) return [];
  return pack.sets.map((s) => {
    const prompts = s.prompts.map((id) => pack.prompts.find((p) => p.id === id)!).filter(Boolean);
    const marker = prompts[0]?.marker ?? 'yn';
    const held = new Set(progress.attempts.filter((a) => a.verdict === 'HELD' && s.prompts.includes(a.promptId)).map((a) => a.promptId));
    return { ...s, marker, count: prompts.length, held: held.size };
  });
});

const FREE: MarkerType[] = ['yn', 'wh', 'neg', 'aff', 'topic'];
</script>

<template>
  <div class="home">
    <header class="head">
      <h1>Lessons</h1>
      <p v-if="!profile.active && !app.replay" class="cal-note">
        <span class="icon" aria-hidden="true">tune</span>
        You have not calibrated yet, so BrowUp uses standard thresholds.
        <ChunkyButton small variant="secondary" @click="app.go('calibrate')">Calibrate (60 s)</ChunkyButton>
      </p>
    </header>
    <p v-if="!app.pack" class="empty">No reviewed content pack is loaded. Content is only shown after a Deaf signer or qualified teacher has reviewed it.</p>
    <ul v-else class="grid">
      <li v-for="s in sets" :key="s.id">
        <button type="button" class="set card" :data-testid="`set-${s.id}`" @click="lesson.startSet(s.id)">
          <FaceDiagram :pose="POSE[s.marker]" :size="96" :title="MARKER_NAME[s.marker]" />
          <span class="txt">
            <span class="badge">{{ MARKER_LABEL[s.marker] }}</span>
            <span class="title">{{ s.title }}</span>
            <span class="desc">{{ s.description }}</span>
            <span class="meter num" :aria-label="`${s.held} of ${s.count} prompts held at least once`">
              <span class="bar"><span :style="{ width: `${(s.held / Math.max(1, s.count)) * 100}%` }" /></span>
              {{ s.held }}/{{ s.count }}
            </span>
          </span>
        </button>
      </li>
      <li>
        <button type="button" class="set card review" data-testid="set-review" @click="lesson.startReview()">
          <span class="icon big" aria-hidden="true">shuffle</span>
          <span class="txt">
            <span class="badge">mixed</span>
            <span class="title">Mixed review</span>
            <span class="desc">Shuffled sentences. Choose the marker first, then sign it.</span>
          </span>
        </button>
      </li>
      <li>
        <div class="set card free">
          <span class="icon big" aria-hidden="true">edit_note</span>
          <span class="txt">
            <span class="badge">free</span>
            <span class="title">Free practice</span>
            <span class="desc">Pick a marker and sign any sentence of your own.</span>
            <span class="chips">
              <button v-for="m in FREE" :key="m" type="button" class="chip" :data-testid="`free-${m}`" @click="lesson.startFree(m)">{{ MARKER_NAME[m] }}</button>
            </span>
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.home { display: flex; flex-direction: column; gap: 20px; }
.head { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.cal-note { display: flex; align-items: center; gap: 10px; background: var(--field-tangerine); padding: 8px 14px; border-radius: 14px; }
.grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px; }
.set { width: 100%; height: 100%; display: flex; gap: 18px; align-items: center; padding: 18px 20px; text-align: left; color: var(--plum); font: var(--body); cursor: pointer; box-shadow: var(--ledge); transition: transform 80ms ease; }
button.set:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--plum); }
.set.review { background: var(--field-plum); }
.set.free { background: var(--field-mint); cursor: default; }
.txt { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.badge { align-self: flex-start; font: 600 14px/1 var(--font); padding: 4px 8px; border-radius: 8px; background: var(--plum); color: var(--white); }
.title { font: var(--h3); }
.desc { font: var(--small); color: var(--plum-soft); }
.meter { display: flex; align-items: center; gap: 10px; font: 600 16px/1 var(--font); margin-top: 6px; }
.bar { flex: 1; height: 12px; border-radius: 6px; background: var(--field-tangerine); border: 2px solid var(--plum); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--tangerine); transition: width 400ms ease; }
.icon.big { font-size: 64px; width: 96px; text-align: center; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip { min-height: 40px; padding: 0 12px; border-radius: 999px; border: 2px solid var(--plum); background: var(--white); color: var(--plum); font: 600 15px/1 var(--font); cursor: pointer; }
.empty { font: var(--h3); }
</style>
