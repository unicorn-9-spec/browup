<script setup lang="ts">
// Progress (PLAN F9): one thick bar per marker, recent attempts — numbers
// only, deletable. Teacher export (F11): a Markdown summary of attempts and
// verdicts, no images; the learner creates and shares it themselves.
import { computed, ref } from 'vue';
import ChunkyButton from '../components/ChunkyButton.vue';
import { teacherExport } from '../lesson/progress';
import { useApp } from '../stores/app';
import { useProgress } from '../stores/progress';
import { MARKER_NAME, STAMP_TEXT } from '../types';

const app = useApp();
const progress = useProgress();
const exported = ref('');
const recent = computed(() => [...progress.attempts].reverse().slice(0, 25));
const shown = computed(() => progress.byMarker.filter((m) => m.attempts > 0 || ['yn', 'wh', 'neg', 'aff'].includes(m.marker)));

async function exportMd(): Promise<void> {
  const text = teacherExport(progress.attempts, {
    language: app.pack?.language ?? 'ASL',
    packVersion: app.pack?.version ?? '?',
    reviewed: app.packStatus === 'reviewed',
  });
  const p = await window.browup?.exportMarkdown(text, `browup-summary-${new Date().toISOString().slice(0, 10)}.md`);
  exported.value = p ? `Saved to ${p}` : '';
}
</script>

<template>
  <div class="progress">
    <header class="head">
      <h1>Progress</h1>
      <div class="acts">
        <ChunkyButton variant="secondary" icon="description" :disabled="progress.attempts.length === 0" data-testid="export" @click="exportMd">Teacher summary (Markdown)</ChunkyButton>
        <ChunkyButton variant="secondary" icon="delete" @click="app.sheet = 'privacy'">Delete…</ChunkyButton>
      </div>
    </header>
    <p v-if="exported" role="status" class="note">{{ exported }}</p>
    <p v-if="app.replay" class="note">Replay attempts are shown here but never saved.</p>

    <section class="card bars" aria-labelledby="by-marker">
      <h2 id="by-marker">Held, by marker</h2>
      <ul>
        <li v-for="m in shown" :key="m.marker">
          <span class="name">{{ MARKER_NAME[m.marker] }}</span>
          <span class="bar" role="img" :aria-label="m.rate === null ? 'no attempts yet' : `${Math.round(m.rate * 100)} percent held`">
            <span :style="{ width: `${(m.rate ?? 0) * 100}%` }" />
          </span>
          <span class="pct num">{{ m.rate === null ? '—' : `${Math.round(m.rate * 100)}%` }}</span>
          <span class="n num">{{ m.held }}/{{ m.attempts }}</span>
        </li>
      </ul>
      <p class="note">Share of judged attempts stamped HELD. "Not seen" attempts are not counted.</p>
    </section>

    <section class="card recent" aria-labelledby="recent">
      <h2 id="recent">Recent attempts</h2>
      <p v-if="recent.length === 0" class="note">No attempts yet.</p>
      <table v-else class="num">
        <thead><tr><th>When</th><th>Prompt</th><th>Marker</th><th>Verdict</th><th>Coverage</th><th>Visible</th></tr></thead>
        <tbody>
          <tr v-for="(a, i) in recent" :key="i">
            <td>{{ a.at.slice(5, 16).replace('T', ' ') }}</td>
            <td>{{ a.promptId }}</td>
            <td>{{ MARKER_NAME[a.marker] }}</td>
            <td><span class="v" :class="a.verdict === 'HELD' ? 'good' : a.verdict === 'NOT_SEEN' ? 'unseen' : 'again'">{{ STAMP_TEXT[a.verdict] }}</span></td>
            <td>{{ a.coveragePct }}%</td>
            <td>{{ a.validPct }}%</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.progress { display: flex; flex-direction: column; gap: 20px; max-width: 1100px; }
.head { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.acts { margin-left: auto; display: flex; gap: 10px; }
.card { padding: 22px 26px; display: flex; flex-direction: column; gap: 14px; }
.bars ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.bars li { display: grid; grid-template-columns: 180px 1fr 70px 70px; gap: 14px; align-items: center; }
.name { font-weight: 600; }
.bar { height: 28px; border: 2px solid var(--plum); border-radius: 14px; overflow: hidden; background: var(--field-tangerine); }
.bar span { display: block; height: 100%; background: var(--tangerine); transition: width 500ms ease; }
.pct { font: 600 24px/32px var(--font); }
.n { color: var(--plum-soft); }
.note { font: var(--small); color: var(--plum-soft); }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 8px 6px; border-bottom: 2px solid var(--field-plum); }
.v { font: 600 14px/1 var(--font); padding: 4px 8px; border-radius: 8px; }
.v.good { background: var(--mint); }
.v.again { background: var(--red); color: var(--white); }
.v.unseen { border: 2px dashed var(--plum); }
</style>
