<script setup lang="ts">
// Logo (PLAN §5.7): a plum eyebrow arc lifted above a dot — "brow up".
defineProps<{ size?: number; wordmark?: boolean }>();
</script>

<template>
  <span class="logo" :style="{ '--s': `${size ?? 40}px` }">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="var(--tangerine)" />
      <path d="M14 34 Q32 12 50 34" fill="none" stroke="var(--plum)" stroke-width="7" stroke-linecap="round" />
      <circle cx="32" cy="45" r="5" fill="var(--plum)" />
    </svg>
    <span v-if="wordmark" class="word">BrowUp</span>
  </span>
</template>

<style scoped>
.logo { display: inline-flex; align-items: center; gap: 10px; }
svg { width: var(--s); height: var(--s); }
.word { font: 700 calc(var(--s) * 0.6) / 1 var(--font); letter-spacing: -0.01em; }
</style>
