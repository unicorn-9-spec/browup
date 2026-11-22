<script setup lang="ts">
// Dialog as a white rounded sheet rising from the bottom (PLAN §5.5).
// Esc closes it; focus moves into it on open and back on close.
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
const sheet = ref<HTMLElement | null>(null);
let previous: Element | null = null;

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { e.stopPropagation(); emit('close'); }
}
onMounted(async () => {
  previous = document.activeElement;
  await nextTick();
  sheet.value?.querySelector<HTMLElement>('button, input, select')?.focus();
  window.addEventListener('keydown', onKey, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true);
  (previous as HTMLElement | null)?.focus?.();
});
void props;
</script>

<template>
  <div class="scrim" @click.self="$emit('close')">
    <section ref="sheet" class="sheet" role="dialog" aria-modal="true" :aria-label="title">
      <header>
        <h2>{{ title }}</h2>
        <button type="button" class="close" aria-label="Close" @click="$emit('close')"><span class="icon" aria-hidden="true">close</span></button>
      </header>
      <div class="body"><slot /></div>
    </section>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(58, 29, 77, 0.35); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
.sheet {
  width: min(880px, 100%); max-height: 86vh; overflow: auto;
  background: var(--white); border: 2px solid var(--plum); border-bottom: none;
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  padding: 24px 32px 32px;
  animation: rise 220ms var(--spring) both;
}
@keyframes rise { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.close { width: 48px; height: 48px; border-radius: 50%; border: 2px solid var(--plum); background: var(--white); cursor: pointer; display: grid; place-items: center; color: var(--plum); }
.body { display: flex; flex-direction: column; gap: 22px; }
</style>
