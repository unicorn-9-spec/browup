<script setup lang="ts">
// The mirror (PLAN §5.4): the local camera picture (never recorded) with
// canvas overlays — a brow line that turns mint while the target state holds,
// a head arc that swings with yaw/pitch, and a grey veil when the face is
// hidden. In replay there is no video: the recorded landmark numbers are
// drawn as a flat cartoon face.
//
// Overlays are drawn on requestAnimationFrame straight from the face session
// (not through Vue reactivity), so they stay well inside the 150 ms budget.

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { faceSession } from '../sensing/session';
import { useSession } from '../stores/session';
import { useSettings } from '../stores/settings';
import type { FacePoints, MarkerType, Point } from '../types';

const props = defineProps<{
  marker?: MarkerType | null;
  capturing?: boolean;
  countdown?: number;
  /** Draw every landmark index (probe). */
  probePoints?: Point[] | null;
  highlight?: number[];
}>();

const session = useSession();
const settings = useSettings();
const box = ref<HTMLDivElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const hidden = ref(false);
const hiddenWhy = ref('');
let raf = 0;
let lastFrameAt = 0;
let lastValid = true;

const replay = computed(() => session.mode === 'replay');
const on = computed(() => session.mode === 'live' || session.mode === 'replay');

const unsub = faceSession.on({
  frame(f) {
    lastFrameAt = performance.now();
    lastValid = f.validBrow || f.validHead;
    if (!lastValid) {
      hiddenWhy.value = f.invalid === 'blink' ? '' : f.invalid === 'faceTurned' ? 'Face the camera' : 'Can’t see your brows';
    }
  },
});

watch(() => [session.mode, faceSession.stream] as const, () => attachStream(), { flush: 'post' });

function attachStream(): void {
  const v = video.value;
  if (!v) return;
  const s = session.mode === 'live' ? faceSession.stream : null;
  if (v.srcObject !== s) {
    v.srcObject = s;
    if (s) void v.play().catch(() => {});
  }
}

const PLUM = '#3A1D4D';
const MINT = '#18A88F';
const GREY = '#8B7F91';

function draw(): void {
  raf = requestAnimationFrame(draw);
  const c = canvas.value;
  const b = box.value;
  if (!c || !b) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = b.clientWidth;
  const ch = b.clientHeight;
  if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
  }
  const g = c.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, cw, ch);
  if (!on.value) { hidden.value = false; return; }

  const { w: fw, h: fh } = faceSession.frameSize;
  const scale = Math.max(cw / fw, ch / fh);
  const ox = (cw - fw * scale) / 2;
  const oy = (ch - fh * scale) / 2;
  const P = (p: Point) => ({ x: ox + p.x * scale, y: oy + p.y * scale });

  if (props.probePoints) {
    drawProbe(g, props.probePoints.map(P), props.highlight ?? []);
    return;
  }

  const pts = faceSession.points;
  const stale = performance.now() - lastFrameAt > 400;
  hidden.value = stale || !lastValid;
  if (stale) hiddenWhy.value = 'Can’t see your face';
  if (!pts) return;
  if (replay.value) drawCartoon(g, pts, P, scale);

  const present = session.livePresent;
  const browMarker = !props.marker || ['yn', 'wh', 'topic', 'cond'].includes(props.marker);
  const browColour = stale || !lastValid ? GREY : present && browMarker ? MINT : PLUM;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const brow of [pts.browR, pts.browL]) {
    g.beginPath();
    brow.map(P).forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
    g.strokeStyle = '#FFFFFF';
    g.lineWidth = 11;
    g.setLineDash([]);
    g.stroke();
    g.strokeStyle = browColour;
    g.lineWidth = 7;
    if (browColour === GREY) g.setLineDash([6, 8]);
    g.stroke();
    g.setLineDash([]);
  }
  drawHeadArc(g, pts, P, !browMarker && present);
}

function drawHeadArc(g: CanvasRenderingContext2D, pts: FacePoints, P: (p: Point) => Point, active: boolean): void {
  const f = session.frame;
  const eR = P(pts.eyeOuterR);
  const eL = P(pts.eyeOuterL);
  const E = Math.hypot(eL.x - eR.x, eL.y - eR.y);
  const cx = (eR.x + eL.x) / 2;
  const cy = (eR.y + eL.y) / 2 - E * 0.15;
  const r = E * 1.5;
  const colour = active ? MINT : PLUM;
  // Yaw arc over the head (−35°…+35° around the top).
  g.lineWidth = 5;
  g.strokeStyle = colour;
  g.globalAlpha = 0.85;
  g.beginPath();
  g.arc(cx, cy, r, (-90 - 35) * (Math.PI / 180), (-90 + 35) * (Math.PI / 180));
  g.stroke();
  // Pitch arc on the signer's left side of the face (image right).
  g.beginPath();
  g.arc(cx, cy, r, (-25) * (Math.PI / 180), 25 * (Math.PI / 180));
  g.stroke();
  g.globalAlpha = 1;
  if (!f) return;
  const yaw = Math.max(-35, Math.min(35, f.yawDeg * 1.5));
  const pitch = Math.max(-25, Math.min(25, -f.pitchDeg * 1.5));
  for (const a of [-90 + yaw, pitch]) {
    const x = cx + r * Math.cos((a * Math.PI) / 180);
    const y = cy + r * Math.sin((a * Math.PI) / 180);
    g.beginPath();
    g.arc(x, y, 10, 0, Math.PI * 2);
    g.fillStyle = active ? MINT : '#F26A1B';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = PLUM;
    g.stroke();
  }
}

function drawCartoon(g: CanvasRenderingContext2D, pts: FacePoints, P: (p: Point) => Point, _s: number): void {
  const eR = P(pts.eyeOuterR);
  const eL = P(pts.eyeOuterL);
  const nose = P(pts.nose);
  const E = Math.hypot(eL.x - eR.x, eL.y - eR.y);
  const ang = Math.atan2(eL.y - eR.y, eL.x - eR.x);
  const cx = (eR.x + eL.x) / 2 + (nose.x - (eR.x + eL.x) / 2) * 0.35;
  const cy = (eR.y + eL.y) / 2 + E * 0.3;
  g.save();
  g.fillStyle = '#FFD7BA';
  g.strokeStyle = PLUM;
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(cx, cy, E * 0.95, E * 1.25, ang, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Eyes: outer corner → upper lid → inner corner → lower lid.
  for (const [o, u, i, l] of [[pts.eyeOuterR, pts.lidUpperR, pts.eyeInnerR, pts.lidLowerR], [pts.eyeOuterL, pts.lidUpperL, pts.eyeInnerL, pts.lidLowerL]] as const) {
    const O = P(o), U = P(u), I = P(i), L = P(l);
    g.beginPath();
    g.moveTo(O.x, O.y);
    g.quadraticCurveTo(2 * U.x - (O.x + I.x) / 2, 2 * U.y - (O.y + I.y) / 2, I.x, I.y);
    g.quadraticCurveTo(2 * L.x - (O.x + I.x) / 2, 2 * L.y - (O.y + I.y) / 2, O.x, O.y);
    g.fillStyle = '#FFFFFF';
    g.fill();
    g.lineWidth = 3;
    g.stroke();
    const open = Math.hypot(U.x - L.x, U.y - L.y);
    if (open > E * 0.04) {
      g.beginPath();
      g.arc((U.x + L.x) / 2, (U.y + L.y) / 2, Math.min(open * 0.42, E * 0.07), 0, Math.PI * 2);
      g.fillStyle = PLUM;
      g.fill();
    }
  }
  // Nose and mouth.
  g.beginPath();
  g.arc(nose.x, nose.y, E * 0.06, 0, Math.PI * 2);
  g.fillStyle = '#F26A1B';
  g.fill();
  g.stroke();
  g.beginPath();
  const mx = nose.x + Math.cos(ang + Math.PI / 2) * E * 0.35;
  const my = nose.y + Math.sin(ang + Math.PI / 2) * E * 0.35;
  g.moveTo(mx - Math.cos(ang) * E * 0.25, my - Math.sin(ang) * E * 0.25);
  g.lineTo(mx + Math.cos(ang) * E * 0.25, my + Math.sin(ang) * E * 0.25);
  g.lineWidth = 4;
  g.stroke();
  g.restore();
}

function drawProbe(g: CanvasRenderingContext2D, pts: Point[], hi: number[]): void {
  const set = new Set(hi);
  g.font = '600 10px Lexend, sans-serif';
  pts.forEach((p, i) => {
    const h = set.has(i);
    g.fillStyle = h ? '#F26A1B' : 'rgba(58,29,77,0.55)';
    g.beginPath();
    g.arc(p.x, p.y, h ? 3.5 : 1.5, 0, Math.PI * 2);
    g.fill();
    if (h) {
      g.fillStyle = '#3A1D4D';
      g.fillText(String(i), p.x + 4, p.y - 4);
    }
  });
}

onMounted(() => {
  attachStream();
  raf = requestAnimationFrame(draw);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  unsub();
  if (video.value) video.value.srcObject = null;
});
</script>

<template>
  <div class="mirror-wrap" :class="{ capturing, off: !on }" data-testid="mirror">
    <div ref="box" class="mirror-inner" :class="{ flip: settings.s.mirrorFlip && !replay }">
      <video v-show="session.mode === 'live'" ref="video" muted playsinline aria-hidden="true" />
      <div v-if="replay" class="replay-bg" aria-hidden="true" />
      <canvas ref="canvas" aria-hidden="true" />
    </div>
    <div v-if="on && hidden && hiddenWhy" class="veil" role="status">
      <span class="icon" aria-hidden="true">visibility_off</span> {{ hiddenWhy }}
    </div>
    <div v-if="countdown && countdown > 0" class="count" data-testid="countdown" aria-hidden="true">{{ countdown }}</div>
    <div v-if="!on" class="blank">
      <span class="icon big" aria-hidden="true">videocam_off</span>
      <p>Camera off</p>
      <slot name="off" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.mirror-wrap {
  position: relative;
  border: 4px solid var(--plum);
  border-radius: var(--radius-card);
  overflow: hidden;
  background: var(--field-plum);
  min-height: 0;
  transition: box-shadow 300ms ease, border-color 300ms ease;
}
/* Soft border pulse marks the capture window (PLAN §5.6). */
.mirror-wrap.capturing { border-color: var(--tangerine); animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(242, 106, 27, 0.55); }
  50% { box-shadow: 0 0 0 10px rgba(242, 106, 27, 0); }
}
[data-reduced-motion='on'] .mirror-wrap.capturing { animation: none; box-shadow: 0 0 0 6px var(--tangerine); }
.mirror-inner { position: absolute; inset: 0; }
.mirror-inner.flip { transform: scaleX(-1); }
video, canvas, .replay-bg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
video { object-fit: cover; }
.replay-bg { background: var(--field-tangerine); }
.veil {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  background: repeating-linear-gradient(45deg, rgba(139, 127, 145, 0.55) 0 10px, rgba(233, 227, 236, 0.55) 10px 20px);
  font: var(--h3); color: var(--plum);
  text-shadow: 0 0 6px var(--white);
}
.count {
  position: absolute; inset: 0; display: grid; place-items: center;
  font: 700 160px/1 var(--font); color: var(--white);
  -webkit-text-stroke: 4px var(--plum);
}
.blank { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--plum); }
.icon.big { font-size: 56px; }
</style>
