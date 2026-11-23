# BrowUp face check — 2026-11-23 06:36

Log: probe log from the face check on 23 Nov 2026 (numbers only, kept locally).

## Landmarks

- Points per set: **478** (BrowUp needs the 478-point MediaPipe mesh)
- Frame size: {"w":1280,"h":720}
- Landmark sets per second (neutral phase): **24.3**
- Expression samples logged: 8154 (mode at the time: pending)

## Resting jitter (T4.1: < 2%)

- Brow height MAD at rest: **1%**; 95th percentile |deviation| 4%; max 5%
- Inner-brow gap MAD at rest: 1%

## Brow reference (eye corners vs upper eyelid)

| Separation (d′) | Eye corners | Upper eyelid |
| --- | --: | --: |
| Raise vs neutral | 1.86 | 1.83 |
| Neutral vs furrow | 0.93 | 0.80 |

Recommendation: `FEATURES.BROW_REFERENCE = 'eyeCorners'` (larger total separation).

## Your movements, by cue

| Cue | Trials | Landmarks agree | Brow height (median) | Inner-brow gap (median) |
| --- | --: | --: | --: | --: |
| raise | 20 | 20 | 34.6% | -0.2% |
| furrow | 20 | 15 | -14.7% | -6.0% |
| neutral | 20 | 17 | -1.7% | -2.0% |

Raise trials, 25th percentile brow height: 29.4%. Furrow trials, 75th percentile brow height: -13.8% and inner gap -4.4%. Neutral trials, 90th percentile |brow|: 7.6%.

## Expression agreement (decides EXPRESSIONS)

- Trials: 60; landmarks saw the asked-for state in 52 (87%).
- Agreement at the configured scores (SURPRISE ≥ 21, ANGRY ≥ 55): **90%** over 52 trials (raise 75%, furrow 100%, neutral 100%).
- Midpoint scores for this face: SURPRISE 21, ANGRY 55 → 90%. (Single shared score: best 30 → 90%.)
- Median peak SURPRISE: raise 42, neutral 0; median peak ANGRY: furrow 98, neutral 11.

**Recommendation: keep EXPRESSIONS** as a second vote — `EXPRESSIONS.MODE = 'on'`, `SURPRISE_SCORE = 21`, `ANGER_SCORE = 55`.

## Signing near the face (occlusion spike)

| # | Valid brow frames | Readable (≥ 60%) |
| --: | --: | --- |
| 1 | 93% | yes |
| 2 | 100% | yes |
| 3 | 100% | yes |
| 4 | 75% | yes |
| 5 | 72% | yes |
| 6 | 97% | yes |
| 7 | 86% | yes |
| 8 | 87% | yes |
| 9 | 89% | yes |
| 10 | 89% | yes |

All sentences stayed readable: no prompt restriction needed.

## Blink test (still brows, rapid blinks)

- Blink samples flagged by the SDK: 6
- Frames that would read as a raise without the blink mask: 0 of 447
- After the ±2-frame mask: **0** (must be 0) — 58% of frames masked

## Head pitch and brow height

- Rest periods spanned pitch -20.7° to -0.0°; uncorrected brow height changes **1.78% per degree** (through-origin fit).
- The app corrects for this (`FEATURES.PITCH_BROW_SLOPE` = 1.5%/°, measured per learner in calibration's nod step). Figures above already include the correction.

## Thresholds to review

Current defaults: raise 8%, lower 5%, inner 4%, MAD × 2.5. Resting MAD × 2.5 = 3%.
