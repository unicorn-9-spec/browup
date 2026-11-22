<script setup lang="ts">
// Gloss card (PLAN §5.5): white, 24 px radius, 2 px plum border; English
// meaning small on top, the gloss large below, with the notation bar drawn
// above the glosses the marker spans (labelled y/n, wh, neg, t — standard
// gloss convention). During capture a cursor moves across the signs so the
// learner's pace matches the judged parts.
import { computed } from 'vue';
import { MARKER_LABEL, type MarkerType } from '../types';

const props = defineProps<{
  meaning: string;
  gloss: readonly string[];
  marker: MarkerType;
  span: readonly [number, number];
  split?: number;
  /** Index of the sign the cursor is on (capture), or -1. */
  cursor?: number;
  /** Review mode: hide the notation bar until the learner has picked. */
  hideMarker?: boolean;
}>();

const marked = (i: number) => i >= props.span[0] && i <= props.span[1];
const label = computed(() => MARKER_LABEL[props.marker]);
const srText = computed(() => {
  const g = props.gloss.join(' ');
  if (props.hideMarker) return `Gloss: ${g}.`;
  const m = props.gloss.slice(props.span[0], props.span[1] + 1).join(' ');
  return `Gloss: ${g}. The ${label.value} marker covers: ${m}.`;
});
</script>

<template>
  <section class="gloss-card card" aria-label="Prompt">
    <p class="meaning">{{ meaning }}</p>
    <p class="sr-only">{{ srText }}</p>
    <div class="line" aria-hidden="true">
      <div
        v-for="(g, i) in gloss"
        :key="i"
        class="sign"
        :class="{ marked: !hideMarker && marked(i), now: cursor === i, comment: split !== undefined && i >= split }"
      >
        <span class="bar" :class="{ first: i === span[0], last: i === span[1] }">
          <span v-if="!hideMarker && i === span[0]" class="bar-label">{{ label }}</span>
        </span>
        <span class="word">{{ g }}</span>
      </div>
    </div>
    <slot />
  </section>
</template>

<style scoped>
.gloss-card { padding: 16px 22px; display: flex; flex-direction: column; gap: 10px; }
.meaning { font: var(--body); color: var(--plum-soft); }
.line { display: flex; flex-wrap: wrap; gap: 0 14px; padding-top: 20px; }
.sign { display: flex; flex-direction: column; position: relative; }
.bar { height: 4px; margin: 0 -7px 10px; position: relative; }
.marked .bar { background: var(--plum); }
.marked .bar.first { margin-left: 0; }
.marked .bar.last { margin-right: 0; }
.bar-label {
  position: absolute; left: 0; bottom: 8px;
  font: 600 14px/1 var(--font); letter-spacing: 0.02em;
}
.word { font: var(--gloss); text-transform: uppercase; padding: 2px 4px; border-radius: 8px; transition: background 150ms ease; }
.now .word { background: var(--lemon); }
.comment .word { color: var(--plum-soft); }
</style>
