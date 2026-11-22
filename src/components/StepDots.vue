<script setup lang="ts">
// Lesson step dots (PLAN §5.4): fill tangerine as prompts are done; the
// current one has a plum ring. Each dot is a button (jump to a prompt).
import type { VerdictKind } from '../types';

const props = defineProps<{ count: number; current: number; results: (VerdictKind | undefined)[]; disabled?: boolean }>();
defineEmits<{ go: [number] }>();

function label(i: number): string {
  const r = props.results[i];
  return `Prompt ${i + 1} of ${props.count}${r ? `, last result ${r.replace(/_/g, ' ').toLowerCase()}` : ''}${i === props.current ? ', current' : ''}`;
}
</script>

<template>
  <ol class="dots" aria-label="Lesson progress">
    <li v-for="i in count" :key="i">
      <button
        type="button"
        class="dot"
        :class="{ done: !!results[i - 1], held: results[i - 1] === 'HELD', current: i - 1 === current }"
        :aria-label="label(i - 1)"
        :aria-current="i - 1 === current ? 'step' : undefined"
        :disabled="disabled"
        @click="$emit('go', i - 1)"
      >
        <span v-if="results[i - 1] === 'HELD'" class="icon" aria-hidden="true">check</span>
      </button>
    </li>
  </ol>
</template>

<style scoped>
.dots { display: flex; gap: 10px; list-style: none; margin: 0; padding: 0; flex-wrap: wrap; }
.dot {
  width: 26px; height: 26px; border-radius: 50%;
  border: 2px solid var(--plum); background: var(--white);
  display: grid; place-items: center; padding: 0; cursor: pointer;
  transition: background 300ms ease;
}
.dot.done { background: var(--field-tangerine); }
.dot.held { background: var(--tangerine); }
.dot.current { box-shadow: 0 0 0 3px var(--peach), 0 0 0 6px var(--plum); }
.dot .icon { font-size: 16px; color: var(--plum); }
.dot:disabled { cursor: default; }
</style>
