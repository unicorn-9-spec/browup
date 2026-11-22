// Stage 1 report (AGENT_PROMPT §11): reads a face-check log written by the
// probe screen and reports landmark shape and rate, resting jitter, which brow
// reference separates raises better, the expression agreement test (keep or
// drop EXPRESSIONS), valid-frame rates while signing near the face, and the
// blink test. Writes <log>.report.md next to the log.
//
//   npm run probe:analyze                 (newest log in the app's data folder)
//   npm run probe:analyze -- path/to/log.jsonl

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS, EXPRESSIONS } from '../config/thresholds';
import { neutralBaseline } from '../src/face/calibration';
import { applyBlinkMask, FeatureExtractor, resampleWindow } from '../src/face/features';
import { browBothReferences } from '../src/face/geometry';
import { mad, median, quantile } from '../src/face/stats';
import { feed } from '../src/sensing/pipeline';
import { expandEvent } from '../src/sensing/record';
import type { SenseEvent } from '../src/sensing/types';
import type { ExpressionSample, FeatureFrame, Profile } from '../src/types';
import { agreement, type AgreementTrial } from '../src/verdict/expressionVote';

function findLog(): string {
  const arg = process.argv[2];
  if (arg) return arg;
  const base = process.env.APPDATA ?? (process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : join(homedir(), '.config'));
  const dir = join(base, 'browup', 'probe');
  if (!existsSync(dir)) throw new Error(`No probe folder at ${dir}. Run "npm run probe" first, or pass a log path.`);
  const logs = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!logs[0]) throw new Error(`No logs in ${dir}.`);
  return logs[0];
}

interface Phase { r: number; phase: string; label: string; trial: number; seconds: number }

const path = findLog();
const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
const header = lines.find((l) => l.k === 'probe-header') ?? {};
const phases: Phase[] = lines.filter((l) => l.k === 'phase') as unknown as Phase[];
const events: SenseEvent[] = lines.map((l) => expandEvent(l)).filter((e): e is SenseEvent => e !== null).sort((a, b) => a.recvUs - b.recvUs);
const exprs: ExpressionSample[] = events.filter((e): e is Extract<SenseEvent, { kind: 'expr' }> => e.kind === 'expr').map((e) => e.sample);

/** The phase a capture time belongs to (phase marks are taken at render
 *  time, ~80 ms after the frame was captured). */
function phaseAt(t: number): (Phase & { start: number; end: number }) | null {
  for (let i = phases.length - 1; i >= 0; i--) {
    const p = phases[i]!;
    if (t + 80_000 >= p.r) return { ...p, start: p.r, end: p.r + p.seconds * 1e6 };
  }
  return null;
}

// Pass 1: raw features (no baseline) to find the neutral baseline.
const x0 = new FeatureExtractor(null);
const raw: FeatureFrame[] = [];
for (const e of events) { const f = feed(x0, e); if (f) raw.push(f); }
const neutralFrames = raw.filter((f) => phaseAt(f.t)?.phase === 'neutral');
const neutral = neutralBaseline(neutralFrames);
if (!neutral.ok) {
  console.error(`The neutral phase had too few clear frames (${Math.round(neutral.validShare * 100)}% valid). Re-run the face check facing the camera.`);
  process.exit(1);
}
const profile: Profile = {
  version: 1, createdAt: new Date().toISOString(), baseline: neutral.baseline!, mad: neutral.mad!,
  range: { raise: DEFAULTS.RAISE_FRACTION * 2, lower: DEFAULTS.LOWER_FRACTION * 2, inner: DEFAULTS.INNER_FRACTION * 2, shakeDeg: 12, nodDeg: 10 }, weak: [],
};

// Pass 2: features against the neutral baseline.
const x = new FeatureExtractor(profile);
const frames: FeatureFrame[] = [];
const pointsAt = new Map<number, ReturnType<typeof browBothReferences>>();
for (const e of events) {
  const f = feed(x, e);
  if (!f) continue;
  frames.push(f);
  if (e.kind === 'face') pointsAt.set(f.t, browBothReferences(e.sample.points));
}
const masked = applyBlinkMask(frames);

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fx = (v: number | null, d = 3) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const out: string[] = [];
out.push(`# BrowUp face check — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '', `Log: \`${path}\``, '');

// ── Shape and rate ─────────────────────────────────────────────────────
const nT = neutralFrames.map((f) => f.t);
const rate = nT.length > 1 ? (nT.length - 1) / ((nT[nT.length - 1]! - nT[0]!) / 1e6) : NaN;
out.push('## Landmarks', '', `- Points per set: **${header.landmarkCount ?? '?'}** (BrowUp needs the 478-point MediaPipe mesh)`);
out.push(`- Frame size: ${JSON.stringify(header.frame ?? {})}`);
out.push(`- Landmark sets per second (neutral phase): **${fx(rate, 1)}**`);
out.push(`- Expression samples logged: ${exprs.length} (mode at the time: ${header.exprMode ?? '?'})`, '');

// ── Jitter at rest ─────────────────────────────────────────────────────
const restBrow = masked.filter((f) => phaseAt(f.t)?.phase === 'neutral' && f.validBrow).map((f) => f.browRel);
const maxAbs = Math.max(...restBrow.map(Math.abs));
out.push('## Resting jitter (T4.1: < 2%)', '', `- Brow height MAD at rest: **${pct(neutral.mad!.brow)}**; 95th percentile |deviation| ${pct(quantile(restBrow.map(Math.abs), 0.95) ?? NaN)}; max ${pct(maxAbs)}`);
out.push(`- Inner-brow gap MAD at rest: ${pct(neutral.mad!.inner)}`, '');

// ── Agreement trials ───────────────────────────────────────────────────
const trials: AgreementTrial[] = [];
const sep: Record<'raise' | 'neutral' | 'furrow', { ec: number[]; el: number[] }> = { raise: { ec: [], el: [] }, neutral: { ec: [], el: [] }, furrow: { ec: [], el: [] } };
const base = neutral.baseline!;
const elBase = median(neutralFrames.map((f) => pointsAt.get(f.t)?.eyelid ?? NaN))!;
const ecBase = median(neutralFrames.map((f) => pointsAt.get(f.t)?.eyeCorners ?? NaN))!;
for (const p of phases.filter((q) => q.phase === 'agree' && q.label !== 'rest')) {
  const from = p.r + 500_000; // reaction time
  const to = p.r + p.seconds * 1e6;
  const fs = masked.filter((f) => f.t >= from && f.t < to && f.validBrow);
  if (fs.length < 5) continue;
  const label = p.label as 'raise' | 'furrow' | 'neutral';
  const brow = quantile(fs.map((f) => f.browRel), label === 'furrow' ? 0.2 : 0.8)!;
  const inner = quantile(fs.map((f) => f.innerRel), 0.2)!;
  const landmarkAgrees = label === 'raise' ? brow >= DEFAULTS.RAISE_FRACTION
    : label === 'furrow' ? brow <= -DEFAULTS.LOWER_FRACTION && inner <= -DEFAULTS.INNER_FRACTION
      : Math.abs(brow) < DEFAULTS.RAISE_FRACTION;
  const ex = exprs.filter((e) => e.t >= from && e.t < to);
  trials.push({ label, landmarkAgrees, surprise: Math.max(0, ...ex.map((e) => e.surprise)), anger: Math.max(0, ...ex.map((e) => e.anger)) });
  for (const f of fs) {
    const b = pointsAt.get(f.t);
    if (!b) continue;
    sep[label].ec.push((b.eyeCorners - ecBase) / Math.abs(ecBase));
    sep[label].el.push((b.eyelid - elBase) / Math.abs(elBase));
  }
}
const dprime = (a: number[], b: number[]) => {
  const m = (v: number[]) => v.reduce((s, y) => s + y, 0) / v.length;
  const sd = (v: number[]) => Math.sqrt(v.reduce((s, y) => s + (y - m(v)) ** 2, 0) / Math.max(1, v.length - 1));
  return (m(a) - m(b)) / Math.sqrt((sd(a) ** 2 + sd(b) ** 2) / 2);
};
out.push('## Brow reference (eye corners vs upper eyelid)', '');
if (sep.raise.ec.length && sep.neutral.ec.length) {
  const rc = dprime(sep.raise.ec, sep.neutral.ec);
  const rl = dprime(sep.raise.el, sep.neutral.el);
  const fc = dprime(sep.neutral.ec, sep.furrow.ec);
  const fl = dprime(sep.neutral.el, sep.furrow.el);
  out.push('| Separation (d′) | Eye corners | Upper eyelid |', '| --- | --: | --: |');
  out.push(`| Raise vs neutral | ${fx(rc, 2)} | ${fx(rl, 2)} |`, `| Neutral vs furrow | ${fx(fc, 2)} | ${fx(fl, 2)} |`, '');
  out.push(`Recommendation: \`FEATURES.BROW_REFERENCE = '${rc + fc >= rl + fl ? 'eyeCorners' : 'eyelid'}'\` (larger total separation).`, '');
} else out.push('Not enough agreement trials to compare.', '');

out.push('## Expression agreement (decides EXPRESSIONS)', '');
const landmarkOk = trials.filter((t) => t.landmarkAgrees).length;
out.push(`- Trials: ${trials.length}; landmarks saw the asked-for state in ${landmarkOk} (${pct(landmarkOk / Math.max(1, trials.length))}).`);
if (exprs.length === 0) {
  out.push('- No expression samples were logged, so the test cannot run. **Recommendation: drop EXPRESSIONS** (`EXPRESSIONS.MODE = \'off\'`) and confirm eligibility with Presage (landmarks + blinking drive the app).', '');
} else {
  let best: { score: number; share: number } = { score: EXPRESSIONS.AGREE_SCORE, share: agreement(trials).share };
  for (let s = 5; s <= 95; s += 5) {
    const a = agreement(trials, s);
    if (a.share > best.share) best = { score: s, share: a.share };
  }
  const now = agreement(trials);
  out.push(`- Agreement at the configured score (${EXPRESSIONS.AGREE_SCORE}): **${pct(now.share)}** over ${now.n} trials (raise ${pct(now.byLabel.raise ?? NaN)}, furrow ${pct(now.byLabel.furrow ?? NaN)}, neutral ${pct(now.byLabel.neutral ?? NaN)}).`);
  out.push(`- Best score threshold: ${best.score} → ${pct(best.share)}.`);
  const med = (l: string, k: 'surprise' | 'anger') => fx(median(trials.filter((t) => t.label === l).map((t) => t[k])), 0);
  out.push(`- Median peak SURPRISE: raise ${med('raise', 'surprise')}, neutral ${med('neutral', 'surprise')}; median peak ANGRY: furrow ${med('furrow', 'anger')}, neutral ${med('neutral', 'anger')}.`);
  const keep = best.share >= EXPRESSIONS.KEEP_IF_AGREEMENT;
  out.push('', keep
    ? `**Recommendation: keep EXPRESSIONS** as a second vote — set \`EXPRESSIONS.MODE = 'on'\` and \`AGREE_SCORE = ${best.score}\`.`
    : `**Recommendation: drop EXPRESSIONS** (${pct(best.share)} < ${pct(EXPRESSIONS.KEEP_IF_AGREEMENT)}) — set \`EXPRESSIONS.MODE = 'off'\` and confirm eligibility with Presage.`, '');
}

// ── Occlusion ──────────────────────────────────────────────────────────
out.push('## Signing near the face (occlusion spike)', '', '| # | Valid brow frames | Readable (≥ 60%) |', '| --: | --: | --- |');
const occ: number[] = [];
for (const p of phases.filter((q) => q.phase === 'occlusion' && q.label === 'sentence')) {
  // Same measure as the verdict engine: share of time with a valid frame
  // (frames can be missing entirely while hands cover the face).
  const grid = resampleWindow(masked, p.r, p.r + p.seconds * 1e6);
  const v = grid.filter((f) => f.validBrow).length / Math.max(1, grid.length);
  occ.push(v);
  out.push(`| ${p.trial} | ${pct(v)} | ${v >= 0.6 ? 'yes' : '**no**'} |`);
}
if (occ.length) {
  const low = occ.filter((v) => v < 0.6).length;
  out.push('', low === 0
    ? 'All sentences stayed readable: no prompt restriction needed.'
    : `${low} of ${occ.length} sentences fell below 60% valid frames. **Decision point 1:** prefer prompts whose signs stay below the face, and state the limit in the README.`, '');
}

// ── Blink test ─────────────────────────────────────────────────────────
const bp = phases.find((q) => q.phase === 'blink');
if (bp) {
  const inB = (f: FeatureFrame) => f.t >= bp.r && f.t < bp.r + bp.seconds * 1e6;
  const blinkEvents = events.filter((e) => e.kind === 'blink' && e.sample.detected && e.sample.t >= bp.r && e.sample.t < bp.r + bp.seconds * 1e6).length;
  const unmaskedRaise = frames.filter((f) => inB(f) && f.raw && f.browRel >= DEFAULTS.RAISE_FRACTION).length;
  const maskedRaise = masked.filter((f) => inB(f) && f.validBrow && f.browRel >= DEFAULTS.RAISE_FRACTION).length;
  const total = frames.filter(inB).length;
  out.push('## Blink test (still brows, rapid blinks)', '', `- Blink samples flagged by the SDK: ${blinkEvents}`);
  out.push(`- Frames that would read as a raise without the blink mask: ${unmaskedRaise} of ${total}`);
  out.push(`- After the ±2-frame mask: **${maskedRaise}** (must be 0) — ${pct(masked.filter((f) => inB(f) && !f.validBrow).length / Math.max(1, total))} of frames masked`, '');
}

out.push('## Thresholds to review', '', `Current defaults: raise ${pct(DEFAULTS.RAISE_FRACTION)}, lower ${pct(DEFAULTS.LOWER_FRACTION)}, inner ${pct(DEFAULTS.INNER_FRACTION)}, MAD × ${DEFAULTS.MAD_MULTIPLIER}. Resting MAD × 2.5 = ${pct(neutral.mad!.brow * 2.5)}.`, '');
void base;

const report = out.join('\n');
const target = path.replace(/\.jsonl$/, '.report.md');
writeFileSync(target, report);
console.log(report);
console.log(`\nWrote ${target}`);
