// Capture controller (PLAN F4): Start → 3-2-1 countdown → capture window
// (3–7 s, Space ends it early) → judge → verdict. Plain class with an
// injectable clock so the timing can be unit-tested with fake timers.

import { CAPTURE } from '../../config/thresholds';
import type { Us } from '../types';

export type CapturePhase = 'idle' | 'countdown' | 'capturing' | 'judging' | 'done';

export interface CaptureHooks {
  /** Called when the countdown starts; returns the capture window in the
   *  session's time base (replay maps a clip onto it). */
  begin(goAtUs: Us, windowS: number): { startUs: Us; endUs: Us };
  /** Countdown number changed (3, 2, 1) or 0 at "Go". */
  tick?(n: number): void;
  /** The capture window opened. */
  go?(): void;
  /** The window closed (on time or early); judge it. */
  finish(startUs: Us, endUs: Us): void;
  now(): Us;
}

/** Late frames still arriving after the window closes (SDK delivery delay
 *  is ~40–100 ms; Legible measured it). */
export const SETTLE_MS = 250;

export class CaptureController {
  phase: CapturePhase = 'idle';
  countdown = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private window: { startUs: Us; endUs: Us } | null = null;

  constructor(private readonly hooks: CaptureHooks) {}

  get active(): boolean {
    return this.phase === 'countdown' || this.phase === 'capturing' || this.phase === 'judging';
  }

  get windowUs(): { startUs: Us; endUs: Us } | null {
    return this.window;
  }

  start(windowS: number): void {
    if (this.active) return;
    this.cancel();
    const cd = CAPTURE.COUNTDOWN_S;
    const goAt = this.hooks.now() + cd * 1e6;
    this.window = this.hooks.begin(goAt, windowS);
    this.phase = 'countdown';
    this.countdown = cd;
    this.hooks.tick?.(cd);
    for (let i = 1; i <= cd; i++) {
      this.timers.push(setTimeout(() => {
        this.countdown = cd - i;
        this.hooks.tick?.(cd - i);
        if (i === cd) {
          this.phase = 'capturing';
          this.hooks.go?.();
        }
      }, i * 1000));
    }
    const lenMs = (this.window.endUs - this.window.startUs) / 1000;
    this.timers.push(setTimeout(() => this.close(this.window!.endUs), cd * 1000 + lenMs));
  }

  /** Space during capture: end the window now. */
  endEarly(): void {
    if (this.phase !== 'capturing' || !this.window) return;
    const now = this.hooks.now();
    // Never shorter than 1.5 s: below that there is nothing to judge.
    if (now - this.window.startUs < 1.5e6) return;
    this.close(Math.min(now, this.window.endUs));
  }

  private close(endUs: Us): void {
    if (this.phase !== 'capturing' && this.phase !== 'countdown') return;
    this.clearTimers();
    this.phase = 'judging';
    const startUs = this.window!.startUs;
    this.window = { startUs, endUs };
    this.timers.push(setTimeout(() => {
      this.phase = 'done';
      this.hooks.finish(startUs, endUs);
    }, SETTLE_MS));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  /** Camera lost / Stop: cancel without a verdict. */
  cancel(): void {
    this.clearTimers();
    this.phase = 'idle';
    this.countdown = 0;
    this.window = null;
  }

  reset(): void {
    this.cancel();
  }
}
