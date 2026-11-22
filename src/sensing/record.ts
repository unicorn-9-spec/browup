// Numbers-only recorder (PLAN F12, privacy §4). A recording is JSON lines:
// one header, then sense events in arrival order. It holds the 19 kept
// landmark points per frame (brows, eyelids, eye corners, nose tip), blink
// flags, validation codes and — only while the expression agreement test is
// pending — two expression scores. No frames, no images, no full mesh, no
// audio. Recording is opt-in.

import type { FacePoints, FaceSample, Point } from '../types';
import type { ReplayClip, ReplayHeader, SenseEvent } from './types';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Fixed order of the kept points in a compact face record. */
export function flattenPoints(p: FacePoints): number[] {
  const pts: Point[] = [...p.browR, ...p.browL, p.lidUpperR, p.lidLowerR, p.lidUpperL, p.lidLowerL,
    p.eyeOuterR, p.eyeInnerR, p.eyeOuterL, p.eyeInnerL, p.nose];
  return pts.flatMap((q) => [r2(q.x), r2(q.y)]);
}

export function unflattenPoints(a: readonly number[]): FacePoints {
  const pt = (i: number): Point => ({ x: a[2 * i]!, y: a[2 * i + 1]! });
  const range = (from: number, n: number) => Array.from({ length: n }, (_, k) => pt(from + k));
  return {
    browR: range(0, 5),
    browL: range(5, 5),
    lidUpperR: pt(10),
    lidLowerR: pt(11),
    lidUpperL: pt(12),
    lidLowerL: pt(13),
    eyeOuterR: pt(14),
    eyeInnerR: pt(15),
    eyeOuterL: pt(16),
    eyeInnerL: pt(17),
    nose: pt(18),
  };
}

/** Compact one event for a JSONL line. */
export function compactEvent(e: SenseEvent): unknown {
  switch (e.kind) {
    case 'face': {
      const s: FaceSample = e.sample;
      return { k: 'f', r: e.recvUs, t: s.t, s: s.stable ? 1 : 0, x: s.reset ? 1 : 0, p: flattenPoints(s.points) };
    }
    case 'blink':
      return { k: 'b', r: e.recvUs, t: e.sample.t, d: e.sample.detected ? 1 : 0 };
    case 'expr':
      return { k: 'e', r: e.recvUs, t: e.sample.t, su: Math.round(e.sample.surprise), an: Math.round(e.sample.anger) };
    case 'validation':
      return { k: 'v', r: e.recvUs, t: e.tsUs, c: e.code, h: e.hint };
    case 'error':
      return { k: 'x', r: e.recvUs, c: e.code, m: e.message, y: e.retryable ? 1 : 0 };
    case 'status':
      return { k: 's', r: e.recvUs, c: e.status };
  }
}

export function expandEvent(o: Record<string, unknown>): SenseEvent | null {
  const r = o.r as number;
  switch (o.k) {
    case 'f':
      return { kind: 'face', recvUs: r, sample: { t: o.t as number, stable: o.s === 1, reset: o.x === 1, points: unflattenPoints(o.p as number[]) } };
    case 'b':
      return { kind: 'blink', recvUs: r, sample: { t: o.t as number, detected: o.d === 1 } };
    case 'e':
      return { kind: 'expr', recvUs: r, sample: { t: o.t as number, surprise: o.su as number, anger: o.an as number } };
    case 'v':
      return { kind: 'validation', recvUs: r, tsUs: o.t as number, code: o.c as number, hint: (o.h as string) ?? '' };
    case 'x':
      return { kind: 'error', recvUs: r, code: o.c as number, message: (o.m as string) ?? '', retryable: o.y === 1 };
    case 's':
      return { kind: 'status', recvUs: r, status: o.c as number };
    default:
      return null;
  }
}

export class Recorder {
  private readonly lines: string[] = [];
  private readonly clips: ReplayClip[] = [];
  private active = false;
  private keepExpressions = false;

  constructor(private header: Omit<ReplayHeader, 'clips'>) {}

  start(opts: { keepExpressions?: boolean } = {}): void {
    this.lines.length = 0;
    this.clips.length = 0;
    this.keepExpressions = opts.keepExpressions ?? false;
    this.active = true;
  }

  get recording(): boolean {
    return this.active;
  }

  push(e: SenseEvent): void {
    if (!this.active) return;
    if (e.kind === 'expr' && !this.keepExpressions) return;
    this.lines.push(JSON.stringify(compactEvent(e)));
  }

  addClip(c: ReplayClip): void {
    if (this.active) this.clips.push(c);
  }

  stop(extra: Partial<ReplayHeader> = {}): string {
    this.active = false;
    const header: ReplayHeader = { ...this.header, ...extra, clips: [...this.clips] } as ReplayHeader;
    const body = [JSON.stringify(header), ...this.lines].join('\n') + '\n';
    this.lines.length = 0;
    this.clips.length = 0;
    return body;
  }
}
