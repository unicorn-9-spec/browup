<script setup lang="ts">
// Consent card (PLAN §6 row 1) — before any camera access: brows, eyelids
// and head direction are measured to check grammar markers; the mirror stays
// on this computer; nothing is recorded; no emotion or identity analysis.
import ChunkyButton from '../components/ChunkyButton.vue';
import FaceDiagram from '../components/FaceDiagram.vue';
import { useApp } from '../stores/app';
import { useSettings } from '../stores/settings';

const app = useApp();
const settings = useSettings();

async function agree(): Promise<void> {
  settings.s.consentAt = new Date().toISOString();
  const key = await window.browup?.key.status();
  app.go(key?.present ? 'calibrate' : 'setup');
}
</script>

<template>
  <div class="split">
    <section class="diagram card" aria-hidden="true">
      <FaceDiagram pose="raise" :size="200" />
      <ul class="measured">
        <li><span class="dot" /> brows</li>
        <li><span class="dot" /> eyelids</li>
        <li><span class="dot" /> head direction</li>
      </ul>
    </section>
    <section class="text card" aria-labelledby="consent-title">
      <h1 id="consent-title">Before the camera turns on</h1>
      <ul class="points">
        <li><span class="icon" aria-hidden="true">visibility</span><span><strong>What is measured:</strong> the position of your brows and eyelids and the direction of your head, to check the grammar marker on your face. Hands are not tracked.</span></li>
        <li><span class="icon" aria-hidden="true">computer</span><span><strong>The mirror stays here.</strong> Your camera picture is shown only on this computer. It is never recorded, saved or sent.</span></li>
        <li><span class="icon" aria-hidden="true">block</span><span><strong>No emotion or identity analysis.</strong> BrowUp never reads your face as feelings, never identifies you and never scores your ability — only one marker in one sentence.</span></li>
        <li><span class="icon" aria-hidden="true">cloud</span><span><strong>Online licence check.</strong> SmartSpectra, the face-tracking engine, runs on this computer but checks its licence with Presage online. Telemetry is switched off.</span></li>
        <li><span class="icon" aria-hidden="true">delete</span><span><strong>What is kept:</strong> your calibration (a few numbers) and your results (prompt, marker, verdict, percentage). Delete them any time in Privacy.</span></li>
        <li><span class="icon" aria-hidden="true">videocam_off</span><span><strong>You are in control:</strong> the camera is on only during setup, calibration and practice. Press <kbd>Esc</kbd> or Stop to turn it off at once.</span></li>
      </ul>
      <div class="actions">
        <ChunkyButton icon="check" data-testid="agree" @click="agree">I agree — continue</ChunkyButton>
        <ChunkyButton variant="secondary" icon="arrow_back" @click="app.go('welcome')">Leave</ChunkyButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.split { display: grid; grid-template-columns: 2fr 3fr; gap: 24px; min-height: 100%; }
.diagram { background: var(--field-tangerine); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
.measured { list-style: none; padding: 0; margin: 0; display: flex; gap: 18px; font: 600 18px/1 var(--font); }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: var(--plum); margin-right: 6px; }
.text { padding: 32px 40px; display: flex; flex-direction: column; gap: 20px; }
.points { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px; }
.points li { display: flex; gap: 14px; align-items: flex-start; }
.points .icon { color: var(--tangerine-text); margin-top: 2px; }
.actions { display: flex; gap: 14px; margin-top: auto; }
</style>
