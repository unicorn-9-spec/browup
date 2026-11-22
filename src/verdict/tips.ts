// One short, encouraging sentence per verdict and marker (PLAN §5.10:
// "Almost — keep your brows up until the last sign", never "wrong").
// About one marker in one sentence — never about the learner's ability.

import type { InvalidReason, MarkerType, VerdictKind } from '../types';

type TipTable = Partial<Record<VerdictKind, string>>;

const TIPS: Record<MarkerType, TipTable> = {
  yn: {
    HELD: 'Brows up from the first sign to the last — a clear yes/no question.',
    STARTED_LATE: 'Lift your brows as your first sign starts, not after it.',
    DROPPED_AT_END: 'Almost — keep your brows up until the last sign.',
    NOT_HELD: 'Your brows came down in the middle — keep them up for the whole question.',
    MISSING: 'Try again with your brows raised the whole time you sign the question.',
  },
  wh: {
    HELD: 'Brows down and drawn together for the whole question — nicely done.',
    STARTED_LATE: 'Bring your brows down as your first sign starts.',
    DROPPED_AT_END: 'Almost — keep your brows down until the last sign.',
    NOT_HELD: 'Your brows relaxed in the middle — keep them furrowed for the whole question.',
    MISSING: 'Try again with your brows drawn down and together the whole time.',
  },
  neg: {
    HELD: 'A steady head shake across the sentence — clear negation.',
    STARTED_LATE: 'Start the head shake with the first sign of the negated part.',
    DROPPED_AT_END: 'Almost — keep the head shake going until the last sign.',
    NOT_HELD: 'The shake was brief — keep it going through the whole negated part.',
    MISSING: 'Try again with a side-to-side head shake while you sign.',
  },
  aff: {
    HELD: 'A steady nod across the sentence — clear affirmation.',
    STARTED_LATE: 'Start nodding with your first sign.',
    DROPPED_AT_END: 'Almost — keep nodding until the last sign.',
    NOT_HELD: 'The nod was brief — keep it going through the sentence.',
    MISSING: 'Try again with a gentle up-and-down nod while you sign.',
  },
  topic: {
    HELD: 'Brows up on the topic, then relaxed for the comment — clear topic marking.',
    STARTED_LATE: 'Raise your brows as the topic starts.',
    DROPPED_AT_END: 'Keep your brows up until the topic ends.',
    NOT_HELD: 'Keep your brows up for the whole topic.',
    KEPT_UP: 'Nearly — let your brows come down when you move on to the comment.',
    MISSING: 'Raise your brows while you sign the topic.',
  },
  cond: {
    HELD: 'Brows up on the "if" part, then a clear change for the result.',
    STARTED_LATE: 'Raise your brows as the "if" part starts.',
    DROPPED_AT_END: 'Keep your brows up until the "if" part ends.',
    NOT_HELD: 'Keep your brows up for the whole "if" part.',
    KEPT_UP: 'Nearly — change your face when you move on to the result.',
    MISSING: 'Raise your brows while you sign the "if" part.',
  },
};

const INSTEAD: Partial<Record<MarkerType, Partial<Record<MarkerType, string>>>> = {
  yn: { wh: 'Your brows went down, which marks a wh-question — for yes/no, lift them.' },
  wh: { yn: 'Your brows went up, which marks a yes/no question — for a wh-question, bring them down and together.' },
  neg: { aff: 'That was a nod — for negation, shake your head side to side.' },
  aff: { neg: 'That was a head shake — for affirmation, nod up and down.' },
};

const HIDDEN: Record<InvalidReason, string> = {
  noFace: 'Your face left the camera view for much of that — stay in frame and try again.',
  reset: 'Tracking restarted during that attempt — try again.',
  blink: 'Lots of blinks hid your brows that time — try again (blinking is fine, just not constantly).',
  tooDark: 'It is too dark to see your brows — add light in front of you and try again.',
  tooBright: 'Too much light is washing out your face — turn away from the bright light and try again.',
  multipleFaces: 'Another face came into view — make sure only you are in the frame.',
  faceTurned: 'Your face turned away for much of that — keep facing the camera and try again.',
  faceOutOfFrame: 'Your forehead went out of frame — move back a little so your brows are in view.',
};

const HANDS = "I couldn't see your brows for much of that — keep your hands below your eyebrows and try again.";

export function tipFor(marker: MarkerType, kind: VerdictKind, instead: MarkerType | null, hidden: InvalidReason | null): string {
  if (kind === 'NOT_SEEN') {
    // Hands over the face usually show up as lost landmarks or a reset.
    if (!hidden || hidden === 'noFace' || hidden === 'reset') return HANDS;
    return HIDDEN[hidden];
  }
  if (kind !== 'HELD' && instead) {
    const t = INSTEAD[marker]?.[instead];
    if (t) return t;
  }
  return TIPS[marker][kind] ?? TIPS[marker].MISSING!;
}
