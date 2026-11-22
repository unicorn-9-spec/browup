// Replay of a numbers-only recording. Clips (capture windows) can be played
// on demand, re-timed so they appear to happen now: every receipt time and
// SDK timestamp is shifted by the same amount, preserving the recorded
// timing exactly, so a replayed attempt gets the same verdict as the
// original (PLAN F12 acceptance).

import type { Us } from '../types';
import { expandEvent } from './record';
import type { ReplayClip, ReplayHeader, SenseEvent } from './types';

export interface ParsedRecording {
  readonly header: ReplayHeader;
  readonly events: readonly SenseEvent[];
}

export function parseRecording(text: string): ParsedRecording {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error('empty recording');
  const header = JSON.parse(lines[0]!) as ReplayHeader;
  if (header.kind !== 'header' || header.format !== 'browup-replay') throw new Error('not a BrowUp recording');
  const events: SenseEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const e = expandEvent(JSON.parse(lines[i]!) as Record<string, unknown>);
    if (e) events.push(e);
  }
  events.sort((a, b) => a.recvUs - b.recvUs);
  return { header, events };
}

export function shiftEvent(e: SenseEvent, d: number): SenseEvent {
  switch (e.kind) {
    case 'face': return { ...e, recvUs: e.recvUs + d, sample: { ...e.sample, t: e.sample.t + d } };
    case 'blink': return { ...e, recvUs: e.recvUs + d, sample: { ...e.sample, t: e.sample.t + d } };
    case 'expr': return { ...e, recvUs: e.recvUs + d, sample: { ...e.sample, t: e.sample.t + d } };
    case 'validation': return { ...e, recvUs: e.recvUs + d, tsUs: e.tsUs + d };
    default: return { ...e, recvUs: e.recvUs + d };
  }
}

/** Events of a time span, in order. */
export function eventsIn(rec: ParsedRecording, startUs: Us, endUs: Us): SenseEvent[] {
  return rec.events.filter((e) => e.recvUs >= startUs && e.recvUs < endUs);
}

/**
 * Pull-based cursor over a list of events shifted to start at `at`.
 * `due(now)` returns every event whose shifted receipt time has arrived.
 */
export class ReplayCursor {
  private i = 0;
  private readonly shift: number;

  constructor(private readonly events: readonly SenseEvent[], spanStartUs: Us, at: Us) {
    this.shift = at - spanStartUs;
  }

  get done(): boolean {
    return this.i >= this.events.length;
  }

  /** Converts a recording time into the shifted (now) time base. */
  map(t: Us): Us {
    return t + this.shift;
  }

  due(now: Us): SenseEvent[] {
    const out: SenseEvent[] = [];
    while (this.i < this.events.length && this.events[this.i]!.recvUs + this.shift <= now) {
      out.push(shiftEvent(this.events[this.i]!, this.shift));
      this.i++;
    }
    return out;
  }
}

/** Picks the clip to play for a marker / prompt: prompt match first, then
 *  any clip for that marker, cycling through variants on retries. */
export function pickClip(clips: readonly ReplayClip[], marker: string, promptId: string | undefined, attempt: number): ReplayClip | null {
  const byPrompt = promptId ? clips.filter((c) => c.promptId === promptId) : [];
  const pool = byPrompt.length ? byPrompt : clips.filter((c) => c.marker === marker);
  if (pool.length === 0) return null;
  return pool[attempt % pool.length]!;
}
