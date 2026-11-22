// Normalised sense events shared by the live SDK client, the recorder, the
// replay player, the synthetic generator and the probe. Numbers (and the
// SDK's short hint strings) only — never images.

import type { BlinkSample, ExpressionSample, FaceSample, MarkerType, Profile, Us } from '../types';

export type SenseEvent =
  | { readonly kind: 'face'; readonly recvUs: Us; readonly sample: FaceSample }
  | { readonly kind: 'blink'; readonly recvUs: Us; readonly sample: BlinkSample }
  | { readonly kind: 'expr'; readonly recvUs: Us; readonly sample: ExpressionSample }
  | { readonly kind: 'validation'; readonly recvUs: Us; readonly tsUs: Us; readonly code: number; readonly hint: string }
  | { readonly kind: 'error'; readonly recvUs: Us; readonly code: number; readonly message: string; readonly retryable: boolean }
  | { readonly kind: 'status'; readonly recvUs: Us; readonly status: number };

/** A capture window inside a recording, playable on its own in replay. */
export interface ReplayClip {
  readonly id: string;
  readonly marker: MarkerType;
  /** The prompt it was signed for, if any (free practice: none). */
  readonly promptId?: string;
  /** What the producer intended, e.g. "flat brows" — shown in replay so a
   *  judge knows what they are watching. */
  readonly label: string;
  /** Clip span (includes the countdown pre-roll). */
  readonly startUs: Us;
  readonly endUs: Us;
  /** The capture window itself. */
  readonly windowStartUs: Us;
  readonly windowEndUs: Us;
  /** Topic / conditional split as a share of the judged window. */
  readonly split?: number;
}

export interface ReplayHeader {
  readonly kind: 'header';
  readonly format: 'browup-replay';
  readonly version: 1;
  readonly createdAt: string;
  /** true for generated demo data; false for a real recorded session. */
  readonly synthetic: boolean;
  readonly description: string;
  readonly frameSize: { readonly w: number; readonly h: number };
  readonly profile: Profile | null;
  readonly clips: readonly ReplayClip[];
  /** Span of neutral, idle face to loop between captures. */
  readonly idle?: { readonly startUs: Us; readonly endUs: Us };
}
