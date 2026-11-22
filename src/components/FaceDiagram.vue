<script setup lang="ts">
// Flat cartoon face diagrams (PLAN §5.7): plum line, tangerine fill; brows
// up, brows furrowed, head-shake arrows, nod arrows. No hands, no photos of
// real signers.
import { computed } from 'vue';

import type { Pose } from './pose';
const props = defineProps<{ pose: Pose; size?: number; title?: string }>();

const brows = computed(() => {
  switch (props.pose) {
    case 'raise':
    case 'topic':
    case 'cond':
      return { l: 'M30 34 Q42 22 54 30', r: 'M66 30 Q78 22 90 34' };
    case 'furrow':
      return { l: 'M30 38 Q44 36 56 44', r: 'M64 44 Q76 36 90 38' };
    default:
      return { l: 'M30 40 Q42 34 54 38', r: 'M66 38 Q78 34 90 40' };
  }
});
const tilt = computed(() => (props.pose === 'topic' ? 'rotate(-8 60 64)' : ''));
</script>

<template>
  <svg class="face" :width="size ?? 120" :height="size ?? 120" viewBox="0 0 120 120" role="img" :aria-label="title ?? pose">
    <g :transform="tilt">
      <ellipse cx="60" cy="64" rx="38" ry="46" fill="var(--tangerine)" stroke="var(--plum)" stroke-width="4" />
      <path :d="brows.l" fill="none" stroke="var(--plum)" stroke-width="6" stroke-linecap="round" />
      <path :d="brows.r" fill="none" stroke="var(--plum)" stroke-width="6" stroke-linecap="round" />
      <ellipse cx="43" cy="52" rx="7" :ry="pose === 'raise' || pose === 'topic' || pose === 'cond' ? 7 : pose === 'furrow' ? 4 : 5.5" fill="var(--white)" stroke="var(--plum)" stroke-width="3" />
      <ellipse cx="77" cy="52" rx="7" :ry="pose === 'raise' || pose === 'topic' || pose === 'cond' ? 7 : pose === 'furrow' ? 4 : 5.5" fill="var(--white)" stroke="var(--plum)" stroke-width="3" />
      <circle cx="43" cy="52" r="3" fill="var(--plum)" />
      <circle cx="77" cy="52" r="3" fill="var(--plum)" />
      <path d="M60 58 L56 74 L63 74" fill="none" stroke="var(--plum)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M48 88 Q60 92 72 88" fill="none" stroke="var(--plum)" stroke-width="4" stroke-linecap="round" />
    </g>
    <g v-if="pose === 'shake'" fill="none" stroke="var(--plum)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 64 L18 56 M8 64 L18 72 M8 64 H20" />
      <path d="M112 64 L102 56 M112 64 L102 72 M112 64 H100" />
    </g>
    <g v-if="pose === 'nod'" fill="none" stroke="var(--plum)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M108 20 L100 28 M108 20 L116 28 M108 20 V40" />
      <path d="M108 108 L100 100 M108 108 L116 100 M108 108 V88" />
    </g>
  </svg>
</template>

<style scoped>
.face { flex: none; }
</style>
