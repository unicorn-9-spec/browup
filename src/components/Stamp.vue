<script setup lang="ts">
// Verdict stamp (PLAN §5.5): rubber-stamp shape rotated −4°, word + icon —
// colour is never the only signal. Lands with a 200 ms spring; reduced
// motion: appears instantly, no rotation animation.
import { computed } from 'vue';
import { STAMP_TEXT, type VerdictKind } from '../types';

const props = defineProps<{ kind: VerdictKind; confidence?: 'confident' | 'likely' | null }>();

const look = computed(() => {
  switch (props.kind) {
    case 'HELD': return { cls: 'good', icon: 'check_circle' };
    case 'NOT_SEEN': return { cls: 'unseen', icon: 'visibility_off' };
    case 'STARTED_LATE': return { cls: 'again', icon: 'schedule' };
    case 'DROPPED_AT_END': return { cls: 'again', icon: 'trending_down' };
    case 'KEPT_UP': return { cls: 'again', icon: 'arrow_upward' };
    case 'NOT_HELD': return { cls: 'again', icon: 'timelapse' };
    default: return { cls: 'again', icon: 'replay' };
  }
});
</script>

<template>
  <div class="stamp" :class="look.cls" data-testid="stamp" :data-kind="kind">
    <span class="icon" aria-hidden="true">{{ look.icon }}</span>
    <span class="word">{{ STAMP_TEXT[kind] }}<template v-if="kind === 'HELD'"> ✓</template></span>
    <span v-if="confidence" class="conf">{{ confidence }}</span>
  </div>
</template>

<style scoped>
.stamp {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 8px 16px;
  border: 4px double currentColor;
  border-radius: 14px;
  font: 700 22px/1 var(--font);
  letter-spacing: 0.06em;
  transform: rotate(-4deg);
  animation: land 200ms var(--spring) both;
  box-shadow: 0 0 0 3px var(--white) inset;
}
.stamp .icon { font-size: 30px; }
.good { background: var(--mint); color: var(--plum); }
.again { background: var(--red); color: var(--white); }
.unseen { background: var(--white); color: var(--plum); border-style: dashed; border-width: 3px; }
.conf { font: 600 14px/1 var(--font); letter-spacing: 0; text-transform: uppercase; padding: 4px 8px; border-radius: 8px; background: var(--white); color: var(--plum); }
@keyframes land {
  from { transform: rotate(-12deg) scale(1.6); opacity: 0; }
  to { transform: rotate(-4deg) scale(1); opacity: 1; }
}
/* Reduced motion (PLAN §5.6): no spring, no rotation, appears instantly. */
[data-reduced-motion='on'] .stamp { animation: none; transform: none; }
</style>
