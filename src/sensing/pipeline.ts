// Feeds sense events into a FeatureExtractor. Pure; shared by the live
// session, replay, the synthetic tests and the probe analyser.

import type { FeatureExtractor } from '../face/features';
import type { FeatureFrame } from '../types';

type FeedEvent =
  | { readonly kind: 'face'; readonly sample: Parameters<FeatureExtractor['push']>[0] }
  | { readonly kind: 'blink'; readonly sample: Parameters<FeatureExtractor['pushBlink']>[0] }
  | { readonly kind: 'expr'; readonly sample: Parameters<FeatureExtractor['pushExpression']>[0] }
  | { readonly kind: 'validation'; readonly tsUs: number; readonly code: number }
  | { readonly kind: string };

/** Returns the feature frame produced by this event, if any. */
export function feed(x: FeatureExtractor, e: FeedEvent): FeatureFrame | null {
  switch (e.kind) {
    case 'face':
      return x.push((e as Extract<FeedEvent, { kind: 'face' }>).sample);
    case 'blink':
      x.pushBlink((e as Extract<FeedEvent, { kind: 'blink' }>).sample);
      return null;
    case 'expr':
      x.pushExpression((e as Extract<FeedEvent, { kind: 'expr' }>).sample);
      return null;
    case 'validation': {
      const v = e as Extract<FeedEvent, { kind: 'validation' }>;
      x.pushValidation(v.code, v.tsUs);
      return null;
    }
    default:
      return null;
  }
}

export function feedAll(x: FeatureExtractor, events: readonly FeedEvent[]): FeatureFrame[] {
  const out: FeatureFrame[] = [];
  for (const e of events) {
    const f = feed(x, e);
    if (f) out.push(f);
  }
  return out;
}
