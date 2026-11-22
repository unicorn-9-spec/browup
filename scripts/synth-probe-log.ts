// Writes a synthetic face-check log that follows the probe script, so the
// analyser (probe/analyze.ts) can be dry-run without a camera. Clearly
// synthetic: it proves the plumbing, not the SDK.
//   npx tsx scripts/synth-probe-log.ts out.jsonl

import { writeFileSync } from 'node:fs';
import { probeScript } from '../src/lesson/probeScript';
import { compactEvent } from '../src/sensing/record';
import { blinkAt, NEUTRAL, synthStream, type FaceState } from '../src/synth/face';

const out = process.argv[2] ?? 'synthetic-probe.jsonl';
const steps = probeScript();
const lines: string[] = [JSON.stringify({ k: 'probe-header', version: 1, createdAt: new Date().toISOString(), exprMode: 'pending', frame: { w: 1280, h: 720 }, landmarkCount: 478, synthetic: true })];
let t = 1_795_000_000_000_000;
let seed = 1;
for (const s of steps) {
  lines.push(JSON.stringify({ k: 'phase', r: t, phase: s.phase, label: s.label, trial: s.trial, seconds: s.seconds }));
  const script = (x: number): FaceState => {
    const k = Math.min(1, Math.max(0, (x - 0.3) / 0.2));
    switch (s.label) {
      case 'raise': return { ...NEUTRAL, raise: 0.18 * k };
      case 'furrow': return { ...NEUTRAL, lower: 0.12 * k, pull: 0.1 * k };
      case 'sentence': return { ...NEUTRAL, visible: !(s.trial % 4 === 0 && x > 1 && x < 3.5) };
      case 'blink': return { ...NEUTRAL, blink: blinkAt(x, Array.from({ length: 40 }, (_, i) => 0.2 + i * 0.35)) };
      default: return NEUTRAL;
    }
  };
  for (const e of synthStream(script, s.seconds, t, { expressions: true, seed: seed++, blinkBrowArtifact: 0.3 })) lines.push(JSON.stringify(compactEvent(e)));
  t += s.seconds * 1e6;
}
lines.push(JSON.stringify({ k: 'end', r: t }));
writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote ${out} (${lines.length} lines)`);
