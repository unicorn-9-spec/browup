# Results

All numbers here are measured. Nothing is estimated, and blanks stay blank until they are measured.

## 1. Automated tests (22 Nov 2026)

| Suite | Result |
| --- | --- |
| Unit (`npm test`) | **78 passed**. Covers marker rules on synthetic fixtures (correct, late start, early drop, dip, missing, hidden, blink storm, squint during a furrow, wrong marker) for yes/no, wh, negation, affirmation and topic; features; calibration; coverage; content schema and the reviewer rule; decoding; recording round trip; replay determinism; review scoring; capture timing; error mapping; privacy scans. |
| End-to-end in replay (`npm run test:e2e`) | **12 passed**. Covers the demo recorder writing a real MP4 of the window; the keyboard-only lesson (MISSING → HELD on retry → NOT SEEN), negation, topic, mixed review, progress and export, reduced motion, layout at 1280×720 and 1920×1080, and refusal of an unreviewed pack. |
| Replay fixture (`npm run fixtures`) | **59 of 59** synthetic clips give their intended verdict through the app's own pipeline. |

The synthetic fixtures come from a face model, not a person. They prove the rules and the plumbing; they do **not** measure real-world accuracy. That comes from sections 2–4.

## 1b. Live smoke checks without a person (22 Nov 2026, HP laptop, dark room)

| Check | Result |
| --- | --- |
| Key authentication; FACE_LANDMARKS + BLINKING + EXPRESSIONS accepted | ✅ |
| Default camera is virtual ("TranScreen Camera") → the HP webcam is chosen automatically | ✅ |
| Calibration with no visible face refuses the neutral step with a reason | ✅ "I could only see your face clearly for 0%…" |
| Live capture with no visible face is cancelled, with no verdict | ✅ "We lost sight of your face, so that attempt was not judged." |
| The SDK hint is shown over the mirror | ✅ "Too dark to see your brows — Increase light on face." |
| <kbd>Esc</kbd> → camera off | ✅ 43–57 ms (target ≤ 1 s) |
| Console errors during the live flow | none |

## 2. Stage 1 face check (`npm run probe`, then `npm run probe:analyze`)

Run on 23 Nov 2026 by the developer: HP Wide Vision HD camera, Windows 11, about 5 minutes. The full report is in [FACE-CHECK-2026-11-23.md](FACE-CHECK-2026-11-23.md). One person, so these numbers describe one face and are not a population result.

| Measure | Result |
| --- | --- |
| Landmarks per set / rate | **478** (MediaPipe mesh) at **24.3 per second** |
| Resting jitter (target < 2%) | MAD **1%** of brow height; 95th percentile 4% |
| Brow reference (d′, eye corners / eyelid) | raise 1.86 / 1.83, furrow 0.93 / 0.80 → **eye corners** (kept) |
| Landmarks agree with the cue (60 cued trials, default thresholds) | **52 / 60**: raise 20/20 (median +35%), furrow 15/20 (−15%, inner −6%), neutral 17/20 |
| Expression agreement (keep if ≥ 80%) | **90%** with SURPRISE ≥ 21, ANGRY ≥ 55. Median peaks: SURPRISE 42 on raises vs 0 neutral; ANGRY 98 on furrows vs 11 neutral → **EXPRESSIONS kept** as a second vote |
| Occlusion: sentences with ≥ 60% valid frames | **10 / 10** (72–100%), so no prompt restriction is needed |
| Blink storm: raises after the mask (target 0) | **0**. The SDK flagged only 6 blink samples in 15 s of rapid blinking; the eyelid-opening fallback did most of the masking (58% of frames) |

**What the face check changed:**

1. **Head-pitch correction (new).** With the chin down, neutral brows read low: about 1.8% of brow height per degree, and the learner's chin drifted 5–12° down while reading the cue panel. Uncorrected, this both hides real raises (an ASL yes/no question often comes with a forward head tilt) and makes a relaxed face look slightly furrowed. Brow height is now corrected by a per-learner slope, measured in calibration's nod step (default 1.5%/°, capped at 2.5%/°). A first estimate of 2.2%/° over-corrected large tilts into false raises during the blink test; it was traced to trials straight after a furrow cue and fixed. After the correction, neutral trials read 17/20 neutral (previously 9/20 against a "±8%" rule) with no false raises.
2. **Expression thresholds per emotion** (SURPRISE 21, ANGRY 55) instead of one shared score.
3. **The eyelid-opening blink fallback** was lowered to 30% so the squint that comes with a furrow is not masked.

## 3. Real-camera tests (AGENT_PROMPT §12)

| Test | Pass criterion | Result |
| --- | --- | --- |
| Landmarks + blink within 5 s | yes | |
| Rapid blinking, still brows | no raise | |
| Brow raise → overlay mint | < 150 ms | |
| Signing near the face | hidden frames shaded; NOT SEEN below 60% valid | |
| Covered lens mid-capture | capture cancelled | |
| Esc | camera off ≤ 1 s | |
| Overlay frame rate / UI | 30 fps / ≥ 50 fps | |
| Memory over 30 min | growth < 50 MB | |

## 4. Accuracy against a Deaf signer or qualified teacher (T7.3)

Protocol (PLAN §5.10):

- The reviewer watches **40 productions** live or over a call, with consent: 20 correct and 20 deliberately wrong across the four markers.
- They give their own verdict before seeing BrowUp's.
- Nothing is recorded.

The target is ≥ 85% agreement per marker. Whatever the result, it is published here.

| Marker | n | BrowUp HELD & reviewer correct | BrowUp HELD & reviewer wrong | BrowUp not HELD & reviewer correct | BrowUp not HELD & reviewer wrong | Precision | Recall | Agreement |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| Yes/no | 10 | | | | | | | |
| Wh | 10 | | | | | | | |
| Negation | 10 | | | | | | | |
| Affirmation | 10 | | | | | | | |

Here "positive" means the marker was produced and held, precision = HELD-and-correct ÷ all HELD, and recall = HELD-and-correct ÷ all reviewer-correct. NOT SEEN attempts are listed separately and not counted.

## 5. Learner usability (T7.4)

Five adult learners (beginner to intermediate) complete calibration and the yes/no and wh sets unaided. Record completion, retries, and whether each tip was understood.

| Learner | Level | Completed | Retries | Tips understood | Notes |
| --- | --- | --- | --: | --- | --- |
