// The verdict engine: one capture window + one target marker → a verdict,
// a timeline and one tip. Pure TypeScript, fully unit-tested.
//
// Order of judgement (brow markers):
//   1. < 60% valid frames                → NOT SEEN (no verdict, PLAN rule)
//   2. coverage < 30%                    → MISSING
//   3. first or last 20% too hidden      → NOT SEEN (we never guess an edge)
//   4. missing in the first 20%          → STARTED LATE
//   5. missing in the last 20%           → DROPPED AT END
//   6. coverage ≥ 70%                    → HELD
//   7. otherwise                         → NOT HELD (dipped in the middle)
// Head markers use the oscillation span instead of frame coverage, and topic
// / conditional prompts judge the two parts of the sentence separately.

import { COVERAGE, OSCILLATION, TOPIC } from '../../config/thresholds';
import { applyBlinkMask, LEAD_IN_US, resampleWindow } from '../face/features';
import { median } from '../face/stats';
import type { FeatureFrame, MarkerType, Thresholds, TimelinePoint, TimelineSeries, Us, Verdict, VerdictKind } from '../types';
import { coverageOf, dominantReason, spans, type CoverageResult } from './coverage';
import { expressionVote, type ExprMode } from './expressionVote';
import { browValid, furrowed, headValid, raised } from './markers/brow';
import { episodes, spanSeconds, type Episode, type OscSample } from './markers/oscillation';
import { tipFor } from './tips';

export interface JudgeInput {
  /** Feature frames captured during the window (any rate, any order-safe). */
  readonly frames: readonly FeatureFrame[];
  readonly startUs: Us;
  readonly endUs: Us;
  readonly marker: MarkerType;
  /** Topic / conditional: where the second part starts, as a share of the
   *  judged window (from the prompt's gloss timing). */
  readonly split?: number;
  /** The marked part of the sentence as shares [from, to] of the judged
   *  window (from the prompt's marker span; default the whole window). */
  readonly part?: readonly [number, number];
  readonly thresholds: Thresholds;
  readonly exprMode?: ExprMode;
  /** Grid rate for resampling (tests may lower it). */
  readonly hz?: number;
}

const HZ = 30;
const pct = (x: number) => Math.round(x * 100);

export function judge(input: JudgeInput): Verdict {
  const hz = input.hz ?? HZ;
  const step = 1 / hz;
  const sorted = [...input.frames].sort((a, b) => a.t - b.t);
  const masked = applyBlinkMask(sorted);
  const leadUs = Math.min(LEAD_IN_US, Math.max(0, (input.endUs - input.startUs) * 0.25));
  const grid = resampleWindow(masked, input.startUs, input.endUs, hz);
  const leadFrames = Math.round((leadUs / 1e6) * hz);
  const n = grid.length - leadFrames;
  const [pa, pb] = input.part ?? [0, 1];
  const from = leadFrames + Math.round(Math.max(0, Math.min(1, pa)) * n);
  const to = Math.max(from + 1, leadFrames + Math.round(Math.max(0, Math.min(1, pb)) * n));
  const judged = grid.slice(from, to);
  const durationS = grid.length * step;
  const leadInS = leadFrames * step;
  const w: Win = { from, to, step, durationS, leadInS };

  switch (input.marker) {
    case 'yn':
    case 'wh':
      return judgeBrow(input, grid, judged, w);
    case 'neg':
    case 'aff':
      return judgeHead(input, grid, judged, w);
    case 'topic':
    case 'cond':
      return judgeTwoPart(input, grid, judged, w);
  }
}

/** The judged slice of the grid: frames [from, to). */
interface Win {
  readonly from: number;
  readonly to: number;
  readonly step: number;
  readonly durationS: number;
  readonly leadInS: number;
}

// ── Brow markers ───────────────────────────────────────────────────────
function judgeBrow(input: JudgeInput, grid: FeatureFrame[], judged: FeatureFrame[], w: Win): Verdict {
  const th = input.thresholds;
  const isYn = input.marker === 'yn';
  const presentFn = (f: FeatureFrame) => (isYn ? raised(f, th) : furrowed(f, th));
  const cov = coverageOf(judged, browValid, presentFn);
  const other = coverageOf(judged, browValid, (f) => (isYn ? furrowed(f, th) : raised(f, th)));
  const kind = browKind(cov);
  const instead: MarkerType | null = kind !== 'HELD' && kind !== 'NOT_SEEN' && other.coverage >= 0.5 ? (isYn ? 'wh' : 'yn') : null;
  const series = browSeries(grid, w, presentFn,
    isYn ? { mode: 'above', at: th.raise * 100 } : { mode: 'below', at: -th.lower * 100 },
    isYn ? 'Brow height compared with your neutral face (%)' : 'Brow height compared with your neutral face (%) — lower is more furrowed');
  const confidence = kind === 'HELD' ? expressionVote(input.marker, judged, cov.present, input.exprMode) : null;
  return {
    marker: input.marker,
    kind,
    validFraction: cov.validFraction,
    coverage: cov.coverage,
    startPresent: cov.startPresent,
    endPresent: cov.endPresent,
    instead,
    confidence,
    tip: tipFor(input.marker, kind, instead, cov.dominantHidden),
    summary: browSummary(isYn ? 'raised' : 'furrowed', kind, cov),
    series,
  };
}

export function browKind(cov: CoverageResult): VerdictKind {
  if (cov.validFraction < COVERAGE.MIN_VALID) return 'NOT_SEEN';
  if (cov.coverage < COVERAGE.MISSING_BELOW) return 'MISSING';
  if (cov.startPresent === null || cov.endPresent === null) return 'NOT_SEEN';
  if (!cov.startPresent) return 'STARTED_LATE';
  if (!cov.endPresent) return 'DROPPED_AT_END';
  if (cov.coverage >= COVERAGE.HELD) return 'HELD';
  return 'NOT_HELD';
}

function browSummary(word: 'raised' | 'furrowed', kind: VerdictKind, cov: CoverageResult): string {
  const hidden = 1 - cov.validFraction;
  if (kind === 'NOT_SEEN') {
    if (cov.validFraction < COVERAGE.MIN_VALID) return `Only ${pct(cov.validFraction)}% of the sentence was visible, so there is no verdict.`;
    return `The ${cov.startPresent === null ? 'start' : 'end'} of the sentence was hidden, so there is no verdict.`;
  }
  const parts = [`Brows ${word} for ${pct(cov.coverage)}% of the sentence`];
  if (kind !== 'MISSING' && cov.startPresent === false) parts.push(`not yet ${word} at the first sign`);
  if (kind !== 'MISSING' && cov.endPresent === false) parts.push(`${word === 'raised' ? 'dropped' : 'relaxed'} before the last sign`);
  if (cov.startPresent && cov.endPresent && kind === 'NOT_HELD') parts.push('dipped in the middle');
  if (hidden >= 0.1) parts.push(`${pct(hidden)}% hidden`);
  return parts.join('; ') + '.';
}

function browSeries(grid: FeatureFrame[], w: Win, presentFn: (f: FeatureFrame) => boolean,
  target: TimelineSeries['target'], label: string): TimelineSeries {
  const { step, durationS, leadInS } = w;
  const points: TimelinePoint[] = grid.map((f, i) => ({
    s: i * step,
    v: f.raw ? Math.round(f.browRel * 1000) / 10 : null,
    valid: f.validBrow,
    present: i >= w.from && i < w.to && f.validBrow && presentFn(f),
  }));
  return {
    unit: 'percent',
    label,
    points,
    target,
    presentSpans: spans(points.map((p) => p.present), step),
    hiddenSpans: spans(points.map((p) => !p.valid), step),
    durationS,
    leadInS,
    judgedS: [w.from * step, w.to * step] as const,
  };
}

// ── Head markers ───────────────────────────────────────────────────────
function judgeHead(input: JudgeInput, grid: FeatureFrame[], judged: FeatureFrame[], w: Win): Verdict {
  const { step, durationS, leadInS } = w;
  const th = input.thresholds;
  const isNeg = input.marker === 'neg';
  const amp = isNeg ? th.shakeDeg : th.nodDeg;
  const judgedS = judged.length * step;
  const samples = (pick: (f: FeatureFrame) => number): OscSample[] =>
    judged.map((f, i) => ({ s: i * step, v: pick(f), valid: f.validHead }));
  const eps = episodes(samples((f) => (isNeg ? f.yawDeg : f.pitchDeg)), amp, judgedS);
  const otherEps = episodes(samples((f) => (isNeg ? f.pitchDeg : f.yawDeg)), isNeg ? th.nodDeg : th.shakeDeg, judgedS);
  const valid = judged.filter(headValid).length;
  const validFraction = judged.length ? valid / judged.length : 0;
  const coverage = judgedS > 0 ? spanSeconds(eps) / judgedS : 0;
  const edge = judgedS * COVERAGE.EDGE;
  const startPresent = eps.some((e) => e.start <= edge);
  const endPresent = eps.some((e) => e.end >= judgedS - edge);

  let kind: VerdictKind;
  if (validFraction < COVERAGE.MIN_VALID) kind = 'NOT_SEEN';
  else if (eps.length === 0) kind = 'MISSING';
  else if (coverage >= OSCILLATION.HELD_SPAN) kind = 'HELD';
  else if (!startPresent && endPresent) kind = 'STARTED_LATE';
  else if (startPresent && !endPresent) kind = 'DROPPED_AT_END';
  else kind = 'NOT_HELD';

  const instead: MarkerType | null = kind !== 'HELD' && kind !== 'NOT_SEEN' && otherEps.length > 0 &&
    spanSeconds(otherEps) > spanSeconds(eps) ? (isNeg ? 'aff' : 'neg') : null;

  const lead = w.from * step;
  const inEp = (s: number) => eps.some((e) => s - lead >= e.start && s - lead < e.end);
  const points: TimelinePoint[] = grid.map((f, i) => {
    const s = i * step;
    return {
      s,
      v: f.raw ? Math.round((isNeg ? f.yawDeg : f.pitchDeg) * 10) / 10 : null,
      valid: f.validHead,
      present: i >= w.from && i < w.to && inEp(s),
    };
  });
  const turns = eps.reduce((n, e) => n + e.reversals, 0);
  const word = isNeg ? 'Head shake' : 'Nod';
  const summary = kind === 'NOT_SEEN'
    ? `Only ${pct(validFraction)}% of the sentence was visible, so there is no verdict.`
    : eps.length === 0
      ? `No ${isNeg ? 'head shake' : 'nod'} large enough to count (needs about ${Math.round(amp)}° each way).`
      : `${word} across ${pct(coverage)}% of the sentence, ${turns} turns${startPresent ? '' : '; started after the first sign'}${endPresent ? '' : '; stopped before the last sign'}.`;
  return {
    marker: input.marker,
    kind,
    validFraction,
    coverage,
    startPresent: kind === 'NOT_SEEN' ? null : startPresent,
    endPresent: kind === 'NOT_SEEN' ? null : endPresent,
    instead,
    confidence: null,
    tip: tipFor(input.marker, kind, instead, dominantReason(judged.filter((f) => !f.validHead))),
    summary,
    series: {
      unit: 'degrees',
      label: isNeg ? 'Head turn left/right (degrees)' : 'Head tilt up/down (degrees)',
      points,
      target: { mode: 'outside', at: amp },
      presentSpans: eps.map((e: Episode) => [e.start + lead, e.end + lead] as const),
      hiddenSpans: spans(points.map((p) => !p.valid), step),
      durationS,
      leadInS,
      judgedS: [w.from * step, w.to * step] as const,
    },
  };
}

// ── Topic and conditional: two parts ───────────────────────────────────
function judgeTwoPart(input: JudgeInput, grid: FeatureFrame[], judged: FeatureFrame[], w: Win): Verdict {
  const { step } = w;
  const th = input.thresholds;
  const split = Math.min(0.85, Math.max(0.15, input.split ?? 0.5));
  const splitIdx = Math.round(judged.length * split);
  // The change between the parts takes a moment; that moment is not judged.
  const margin = Math.round(0.25 / step);
  const first = judged.slice(0, Math.max(1, splitIdx - margin));
  const second = judged.slice(Math.min(judged.length, splitIdx + margin));
  const presentFn = (f: FeatureFrame) => raised(f, th);
  const covA = coverageOf(first, browValid, presentFn);
  const covB = coverageOf(second, browValid, presentFn);
  const all = coverageOf(judged, browValid, presentFn);

  let kind: VerdictKind;
  if (all.validFraction < COVERAGE.MIN_VALID || covA.validFraction < COVERAGE.MIN_VALID) kind = 'NOT_SEEN';
  else if (covA.coverage < COVERAGE.MISSING_BELOW) kind = 'MISSING';
  else if (covA.startPresent === false) kind = 'STARTED_LATE';
  else if (covA.coverage < TOPIC.TOPIC_HELD) kind = 'NOT_HELD';
  else if (covB.validFraction >= COVERAGE.MIN_VALID && covB.coverage > TOPIC.COMMENT_MAX) kind = 'KEPT_UP';
  else if (covB.validFraction < COVERAGE.MIN_VALID) kind = 'NOT_SEEN';
  else kind = 'HELD';

  // Head tilt during the first part, relative to the second part.
  const headA = first.filter(headValid);
  const headB = second.filter(headValid);
  const dPitch = (median(headA.map((f) => f.pitchDeg)) ?? 0) - (median(headB.map((f) => f.pitchDeg)) ?? 0);
  const dRoll = (median(headA.map((f) => f.rollDeg)) ?? 0) - (median(headB.map((f) => f.rollDeg)) ?? 0);
  const tiltSeen = Math.abs(dPitch) >= TOPIC.TILT_DEG || Math.abs(dRoll) >= TOPIC.TILT_DEG;
  if (kind === 'HELD' && TOPIC.REQUIRE_TILT && !tiltSeen) kind = 'NOT_HELD';

  const part = input.marker === 'topic' ? 'topic' : '"if" part';
  const rest = input.marker === 'topic' ? 'comment' : 'result';
  const summary = kind === 'NOT_SEEN'
    ? `Not enough of the sentence was visible (${pct(all.validFraction)}%), so there is no verdict.`
    : `Brows raised for ${pct(covA.coverage)}% of the ${part} and ${pct(covB.coverage)}% of the ${rest}${tiltSeen ? '; head tilt seen' : ''}.`;
  const series = browSeries(grid, w, presentFn,
    { mode: 'above', at: th.raise * 100 }, 'Brow height compared with your neutral face (%)');
  return {
    marker: input.marker,
    kind,
    validFraction: all.validFraction,
    coverage: covA.coverage,
    startPresent: covA.startPresent,
    endPresent: covA.endPresent,
    instead: null,
    confidence: null,
    tip: tipFor(input.marker, kind, null, all.dominantHidden),
    summary,
    series: { ...series, splitS: (w.from + splitIdx) * step },
    commentCoverage: covB.coverage,
    tiltSeen,
  };
}
