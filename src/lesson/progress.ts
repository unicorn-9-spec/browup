// Progress (PLAN F9) and the teacher export (F11). Numbers only: prompt
// ids, markers, verdicts and coverage percentages — never images, never
// landmark streams, never expression scores.

import { MARKER_NAME, STAMP_TEXT, type Attempt, type MarkerType } from '../types';

export interface MarkerProgress {
  readonly marker: MarkerType;
  readonly attempts: number;
  readonly held: number;
  /** HELD ÷ judged attempts (NOT SEEN excluded), 0–1; null if none. */
  readonly rate: number | null;
}

export const PROGRESS_MARKERS: readonly MarkerType[] = ['yn', 'wh', 'neg', 'aff', 'topic', 'cond'];

export function progressByMarker(attempts: readonly Attempt[]): MarkerProgress[] {
  return PROGRESS_MARKERS.map((marker) => {
    const judged = attempts.filter((a) => a.marker === marker && a.verdict !== 'NOT_SEEN');
    const held = judged.filter((a) => a.verdict === 'HELD').length;
    return { marker, attempts: judged.length, held, rate: judged.length ? held / judged.length : null };
  });
}

export function teacherExport(attempts: readonly Attempt[], opts: { language: string; packVersion: string; reviewed: boolean; now?: Date }): string {
  const now = opts.now ?? new Date();
  const lines: string[] = [];
  lines.push('# BrowUp practice summary', '');
  lines.push(`Created ${now.toISOString().slice(0, 16).replace('T', ' ')} · ${opts.language} content pack ${opts.packVersion}${opts.reviewed ? '' : ' (UNREVIEWED draft content)'}`, '');
  lines.push('BrowUp checks one facial grammar marker per sentence (raised brows, furrowed brows, head shake, nod) against the learner\'s own calibrated face. It does not judge hand signs, fluency or ability. NOT SEEN means the face was hidden and no verdict was given.', '');
  lines.push('## By marker', '', '| Marker | Judged attempts | Held | Held % |', '| --- | --: | --: | --: |');
  for (const p of progressByMarker(attempts)) {
    if (p.attempts === 0) continue;
    lines.push(`| ${MARKER_NAME[p.marker]} | ${p.attempts} | ${p.held} | ${Math.round((p.rate ?? 0) * 100)}% |`);
  }
  lines.push('', '## Attempts', '', '| Time | Mode | Prompt | Marker | Verdict | Coverage | Visible |', '| --- | --- | --- | --- | --- | --: | --: |');
  for (const a of attempts) {
    lines.push(`| ${a.at.slice(0, 16).replace('T', ' ')} | ${a.mode}${a.pickedRight === undefined ? '' : a.pickedRight ? ' (picked right)' : ' (picked wrong)'} | ${a.promptId} | ${MARKER_NAME[a.marker]} | ${STAMP_TEXT[a.verdict]} | ${a.coveragePct}% | ${a.validPct}% |`);
  }
  lines.push('');
  return lines.join('\n');
}
