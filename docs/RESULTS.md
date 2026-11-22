# Results

All numbers here are measured. Nothing is estimated, and blanks stay blank until they are measured.

## 1. Automated tests (22 Nov 2026)

| Suite | Result |
| --- | --- |
| Unit (`npm test`) | **73 passed**. Covers marker rules on synthetic fixtures (correct, late start, early drop, dip, missing, hidden, blink storm, wrong marker) for yes/no, wh, negation, affirmation and topic; features; calibration; coverage; content schema and the reviewer rule; decoding; recording round trip; replay determinism; review scoring; capture timing; error mapping; privacy scans. |
| End-to-end in replay (`npm run test:e2e`) | **11 passed**. Covers the keyboard-only lesson (MISSING → HELD on retry → NOT SEEN), negation, topic, mixed review, progress and export, reduced motion, layout at 1280×720 and 1920×1080, and refusal of an unreviewed pack. |
| Replay fixture (`npm run fixtures`) | **59 of 59** synthetic clips give their intended verdict through the app's own pipeline. |

The synthetic fixtures come from a face model, not a person. They prove the rules and the plumbing; they do **not** measure real-world accuracy. That comes from sections 2–4.

## 2. Stage 1 face check (`npm run probe`, then `npm run probe:analyze`)

_Not yet run with a person. Paste the generated `*.report.md` summary here._

| Measure | Result |
| --- | --- |
| Landmarks per set / rate | |
| Resting jitter (target < 2%) | |
| Brow reference chosen (d′ eye corners / eyelid) | |
| Expression agreement (keep if ≥ 80%) | |
| Occlusion: sentences with ≥ 60% valid frames | |
| Blink storm: raises after the mask (target 0) | |

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
