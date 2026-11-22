<script setup lang="ts">
// Chunky button (PLAN §5.5): 56 px tall, 16 px radius, tangerine fill, plum
// 600 text, 3 px plum "ledge" shadow; pressed moves down 2 px.
defineProps<{
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: string;
  kbd?: string;
  small?: boolean;
  disabled?: boolean;
}>();
defineEmits<{ click: [MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="chunky"
    :class="[variant ?? 'primary', { small }]"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <span v-if="icon" class="icon" aria-hidden="true">{{ icon }}</span>
    <span class="label"><slot /></span>
    <kbd v-if="kbd" aria-hidden="true">{{ kbd }}</kbd>
  </button>
</template>

<style scoped>
.chunky {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 56px;
  padding: 0 24px;
  border-radius: var(--radius-btn);
  border: 2px solid var(--plum);
  background: var(--tangerine);
  color: var(--plum);
  font: 600 18px/1 var(--font);
  box-shadow: var(--ledge);
  cursor: pointer;
  transition: transform 80ms ease, box-shadow 80ms ease;
  margin-bottom: 3px;
}
.chunky:active:not(:disabled) {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--plum);
}
.chunky.secondary { background: var(--white); }
.chunky.quiet { background: transparent; box-shadow: none; border-color: transparent; text-decoration: underline; text-underline-offset: 4px; }
.chunky.danger { background: var(--red); color: var(--white); }
.chunky.small { min-height: 44px; padding: 0 16px; font-size: 16px; }
.chunky:disabled { opacity: 0.45; cursor: not-allowed; }
.chunky kbd { margin-left: 4px; }
.chunky.danger kbd { color: var(--plum); }
</style>
