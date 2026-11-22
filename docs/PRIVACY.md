# Privacy, consent and data handling

BrowUp shows a live mirror but never records it. It keeps a calibration profile and verdict counts, and it never interprets the learner's face as emotion.

| # | Topic | What BrowUp does | Where |
| --: | --- | --- | --- |
| 1 | Camera consent | A consent card comes before any camera access. It says what is measured (brows, eyelids, head direction, to check grammar markers), that the mirror stays on this computer, that nothing is recorded, and that there is no emotion or identity analysis. | `src/views/Consent.vue` |
| 2 | Camera duration | Only on Setup (framing preview, no measurement), Calibrate, Lesson/Review/Free practice, and the developer probe. The camera is off on Welcome, Lessons, Progress and Settings, and a plum **Camera on** pill shows whenever it is on. | `src/App.vue` (view watcher), `CAMERA_VIEWS` |
| 3 | SDK processing | On-device. The licence is checked online; there is no offline mode. The replay needs neither a key nor a network. | `src/sensing/sdk.ts` |
| 4 | Local storage | `settings.json`, `profile.json` (baselines, noise, ranges), `progress.json` (per attempt: time, prompt id, marker, verdict, coverage %, visible %, mode), `key.bin` (encrypted). Optional: `recordings/*.jsonl` (numbers-only replays, off by default) and `probe/*.jsonl` (developer face check). | `electron/main.ts` |
| 5 | External requests | SmartSpectra authentication and usage only. Content packs are bundled; fonts and icons are local; the CSP blocks remote content. | `src/index.html` |
| 6 | Telemetry | `enableTelemetry: false` everywhere (unit-tested). The SDK still contacts Presage for the licence, and Settings says so. | `tests/unit/privacy.test.ts` |
| 7 | Optional AI | None. | — |
| 8 | Retention | Until the learner deletes it. | — |
| 9 | Deletion | Settings → Privacy: **Delete my progress** (progress, recordings, probe logs), **Reset calibration**, **Remove API key**. The file paths are listed in that sheet. | `src/views/SettingsSheet.vue` |
| 10 | API key | Held in the main process with `safeStorage`. It is handed to the renderer only for the SDK constructor (the SDK forwards it to main), never written to renderer storage, and never logged (`redact`, tested). | `electron/main.ts` |
| 11 | Logging | Event names only, with the key always redacted. | `electron/main.ts` |
| 12 | Shutdown | Stop, Esc, leaving a camera screen, closing the window or quitting all do the same: stop the camera tracks first (light off at once), then `sdk.stop()` (main runs `stopAsync()`), then `destroy()`. The mirror goes blank. | `src/sensing/sdk.ts`, `electron/main.ts` |

## What a recording contains (opt-in replays and the probe log)

A recording contains only numbers:

- 19 landmark points per frame: both brows, upper and lower eyelids, the eye corners and the nose tip;
- blink flags;
- validation codes;
- capture-window markers.

There are no frames, no pictures and no full face mesh. Expression scores (SURPRISE and ANGRY only) are written only while the expression agreement test is pending. A unit test checks that a recording line holds exactly 19 points and no mesh.

## Expressions

If the expression signal is enabled after the Stage 1 test, its scores serve only as a second check on brow position ("confident" against "likely"). They are never shown as feelings and never stored in progress.

## Teacher export

The export holds prompt ids, markers, verdicts and coverage percentages only. The learner creates and shares it themselves.

## Draft disclosure for the DEV post

> BrowUp uses your camera as a mirror and measures brow height and head movement to check sign-language grammar markers. The video never leaves your computer and is never recorded; progress is saved as numbers you can delete. SmartSpectra runs locally, checks its licence online, and telemetry is off.
