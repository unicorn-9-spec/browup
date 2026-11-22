<script setup lang="ts">
// Timeline strip (PLAN §5.5 charts): your brow height (plum line) against
// the lemon target band for the last capture; hatched grey where frames were
// hidden; mint ticks where the marker counted; the lead-in ("get ready") and
// anything outside the marked signs shaded. Head markers plot head angle with
// bands beyond ±the swing needed. A text summary sits underneath for screen
// readers and for anyone who prefers words.
import { computed } from 'vue';
import type { TimelineSeries } from '../types';

const props = defineProps<{ series: TimelineSeries | null; summary?: string; placeholder?: string }>();

const W = 1000;
const H = 180;
const PAD_T = 14;
const PAD_B = 26;

const range = computed(() => {
  const s = props.series;
  if (!s) return { lo: -20, hi: 30 };
  if (s.unit === 'degrees') {
    const m = Math.max(20, s.target.at * 2.5, ...s.points.map((p) => Math.abs(p.v ?? 0)));
    return { lo: -Math.min(m, 45), hi: Math.min(m, 45) };
  }
  const vals = s.points.filter((p) => p.v !== null).map((p) => p.v!);
  return { lo: Math.min(-15, ...vals, s.target.at - 5), hi: Math.max(25, ...vals, s.target.at + 5) };
});

const x = (s: number) => (props.series ? (s / props.series.durationS) * W : 0);
const y = (v: number) => {
  const { lo, hi } = range.value;
  const c = Math.max(lo, Math.min(hi, v));
  return PAD_T + (1 - (c - lo) / (hi - lo)) * (H - PAD_T - PAD_B);
};

const path = computed(() => {
  const s = props.series;
  if (!s) return '';
  let d = '';
  let pen = false;
  for (const p of s.points) {
    if (p.v === null || !p.valid) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${x(p.s).toFixed(1)},${y(p.v).toFixed(1)}`;
    pen = true;
  }
  return d;
});

const bands = computed(() => {
  const s = props.series;
  if (!s) return [];
  const { lo, hi } = range.value;
  const t = s.target;
  if (t.mode === 'above') return [{ y1: y(hi), y2: y(t.at) }];
  if (t.mode === 'below') return [{ y1: y(t.at), y2: y(lo) }];
  return [{ y1: y(hi), y2: y(t.at) }, { y1: y(-t.at), y2: y(lo) }];
});

const zero = computed(() => y(0));
const judged = computed(() => props.series?.judgedS ?? [props.series?.leadInS ?? 0, props.series?.durationS ?? 0]);
const edges = computed(() => {
  const [a, b] = judged.value;
  const e = (b - a) * 0.2;
  return [a + e, b - e];
});
</script>

<template>
  <figure class="timeline" :aria-label="series?.label ?? 'Timeline'">
    <svg v-if="series" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill="#e9e3ec" />
          <line x1="0" y1="0" x2="0" y2="10" stroke="var(--hidden)" stroke-width="4" />
        </pattern>
      </defs>
      <!-- outside the judged part: lead-in and unmarked signs -->
      <rect x="0" :y="0" :width="x(judged[0])" :height="H" fill="#f3e9df" />
      <rect :x="x(judged[1])" y="0" :width="Math.max(0, W - x(judged[1]))" :height="H" fill="#f3e9df" />
      <!-- target band -->
      <rect v-for="(b, i) in bands" :key="'b' + i" :x="x(judged[0])" :y="b.y1" :width="x(judged[1]) - x(judged[0])" :height="Math.max(0, b.y2 - b.y1)" fill="var(--lemon)" />
      <!-- hidden frames -->
      <rect v-for="(h, i) in series.hiddenSpans" :key="'h' + i" :x="x(h[0])" y="0" :width="Math.max(2, x(h[1]) - x(h[0]))" :height="H - PAD_B" fill="url(#hatch)" />
      <!-- neutral line -->
      <line x1="0" :x2="W" :y1="zero" :y2="zero" stroke="var(--plum)" stroke-opacity="0.25" stroke-dasharray="6 6" stroke-width="2" vector-effect="non-scaling-stroke" />
      <!-- first / last 20% -->
      <line v-for="(e, i) in edges" :key="'e' + i" :x1="x(e)" :x2="x(e)" y1="0" :y2="H - PAD_B" stroke="var(--plum)" stroke-opacity="0.3" stroke-width="2" vector-effect="non-scaling-stroke" />
      <!-- topic / comment split -->
      <line v-if="series.splitS !== undefined" :x1="x(series.splitS)" :x2="x(series.splitS)" y1="0" :y2="H - PAD_B" stroke="var(--plum)" stroke-width="3" stroke-dasharray="10 6" vector-effect="non-scaling-stroke" />
      <!-- the measurement -->
      <path :d="path" fill="none" stroke="var(--plum)" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      <!-- where the marker counted -->
      <rect v-for="(p, i) in series.presentSpans" :key="'p' + i" :x="x(p[0])" :y="H - PAD_B + 6" :width="Math.max(2, x(p[1]) - x(p[0]))" height="12" rx="6" fill="var(--mint)" />
    </svg>
    <div v-if="series" class="labels" aria-hidden="true">
      <span :style="{ left: '0%' }">get ready</span>
      <span :style="{ left: `${(judged[0] / series.durationS) * 100}%` }">start</span>
      <span v-if="series.splitS !== undefined" :style="{ left: `${(series.splitS / series.durationS) * 100}%` }">comment →</span>
      <span class="end" :style="{ right: `${100 - (judged[1] / series.durationS) * 100}%` }">end</span>
    </div>
    <div v-if="!series" class="empty">{{ placeholder ?? 'Your last attempt will appear here.' }}</div>
    <figcaption class="caption">
      <span class="legend" aria-hidden="true">
        <i class="sw line" /> {{ series?.unit === 'degrees' ? 'your head' : 'your brows' }}
        <i class="sw band" /> target
        <i class="sw mint" /> counted
        <i class="sw hatch" /> hidden
      </span>
      <span class="summary" data-testid="timeline-summary">{{ summary ?? '' }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.timeline { margin: 0; background: var(--white); border: 2px solid var(--plum); border-radius: var(--radius-card); padding: 10px 18px 8px; display: flex; flex-direction: column; gap: 4px; }
svg { width: 100%; height: 88px; display: block; border-radius: 10px; }
.labels { position: relative; height: 18px; font: 600 13px/18px var(--font); color: var(--plum-soft); }
.labels span { position: absolute; white-space: nowrap; }
.empty { height: 106px; display: grid; place-items: center; color: var(--plum-soft); background: #fbf3ec; border-radius: 10px; }
.caption { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; font: var(--small); }
.legend { display: inline-flex; gap: 6px 10px; align-items: center; flex-wrap: wrap; color: var(--plum-soft); }
.sw { display: inline-block; width: 18px; height: 10px; border-radius: 3px; vertical-align: middle; }
.sw.line { height: 4px; background: var(--plum); }
.sw.band { background: var(--lemon); border: 1px solid #d9b93a; }
.sw.mint { background: var(--mint); }
.sw.hatch { background: repeating-linear-gradient(45deg, var(--hidden) 0 3px, #e9e3ec 3px 7px); }
.summary { font-weight: 600; }
</style>
