# SmartSpectra SDK notes

Checked against the installed `@smartspectra/node-sdk` **3.5.0** (`js/index.d.ts`, `js/renderer/index.d.ts`, `js/messages/generated.d.ts`) on 22 Nov 2026. These notes reuse the findings of the sibling projects Upbeat and Legible, which were checked against the same version on the same laptop. The Presage agent skill was not installed; everything here comes from the package itself and the sibling projects' live sessions.

All renderer SDK calls are in [`src/sensing/sdk.ts`](../src/sensing/sdk.ts). The IPC binding and readiness check are in [`electron/main.ts`](../electron/main.ts).

## What BrowUp calls

| Where | API | Notes |
| --- | --- | --- |
| main | `bindSmartSpectraIpc(window, { logger })` from `@smartspectra/node-sdk/main` | Loaded lazily, so an unsupported platform still opens the app and the replay still works. |
| preload | `import '@smartspectra/node-sdk/preload'` | Bundled into the sandboxed preload. |
| renderer | `new SmartSpectraSDK(sdkOptions(key))` from `@smartspectra/node-sdk/renderer` | `requestedMetrics = [FACE_LANDMARKS (11), BLINKING (12)]`, plus `EXPRESSIONS (14)` unless the agreement test drops it. Also `enableTelemetry: false`, `enableAccumulatedOutput: false`, `sendTimeoutMs: 15000`. |
| renderer | `sdk.useMediaStream(stream)` | One `getUserMedia` stream (1280×720, 30 fps, `audio: false`) is shared with the mirror `<video>`. |
| renderer | `sdk.on('metrics' \| 'validationStatus' \| 'error' \| 'processingStatus')` | `metrics(buf, tsUs)`, `validationStatus(code, tsUs, hint)`, `error(code, message, retryable)`. |
| renderer | `await sdk.start()`, `await sdk.stop()`, `sdk.destroy()` | |
| renderer | `decodeMetrics(buf)` from `@smartspectra/node-sdk/messages` | |
| main | `checkDeviceReadiness()` after `useCamera(CameraSelection.default)` | Runs only on demand from Setup. The verdict is compared in lowercase. |

Never called: `requestInsight`, `useFile`, `useCustomInput`. `tests/unit/privacy.test.ts` fails if `requestInsight` appears, if any `SmartSpectraSDK` is built without telemetry off, or if the microphone is requested.

## Differences from the plan

1. **The renderer has no `stopAsync()`.** Shutdown order: stop the camera tracks (the light goes off at once), then `await sdk.stop()` raced against 900 ms (the main process runs `stopAsync`), then `sdk.destroy()`.
2. **`checkDeviceReadiness()` is main-process only** and needs a native camera. It takes about 24 s and judges the conditions of that moment (Legible measured this). BrowUp therefore runs it on demand and never uses it to gate a session.
3. **Decoded field names are camelCase arrays.** The fields are `face.landmarks[].value`, `face.blinking[]` (`{detected, stable, timestamp}`) and **`face.expression[]`** (singular). Each expression entry is `{ stable, timestamp, scores: [{ type, confidence }] }`, where `ExpressionType` ANGRY = 1 and SURPRISE = 8, and confidence runs 0–100. One packet can hold several samples, each with its own timestamp.
4. **Timestamps are epoch microseconds** (`number | Long`). The renderer anchors frame times to `Date.now()`, so BrowUp's capture windows use `Date.now()` µs as well.
5. **Validation codes** are `k`-prefixed integers. BrowUp's handling of each is in [`src/sensing/codes.ts`](../src/sensing/codes.ts):
   - `FRAME_RATE_TOO_LOW` is reported for most sessions on this laptop camera (Legible), so it does **not** invalidate frames.
   - `FACE_NOT_FORWARD` and `EXCESSIVE_MOTION` are expected during a head shake. They never invalidate head frames.
   - `FACE_NOT_FORWARD` does invalidate brow frames.
   - `MULTIPLE_FACES_FOUND` glitches for single frames, so it is debounced by 250 ms.
6. **Error codes** beyond the plan's list (`kInvalidState`, `kConfigurationFailed`, `kServerError`, `kProcessingFailed`, `kMetricNotAuthorized`, `kSustainedLowFrameRate`, …) each map to a friendly message with a way forward ([`src/sensing/errors.ts`](../src/sensing/errors.ts), tested).
7. **`kSustainedLowFrameRate`**: the next start drops to 960×540 (as Upbeat does). It never restarts automatically.
8. **Virtual default camera.** On this laptop the system's default camera is "TranScreen Camera", a virtual device that never shows a face. If the learner has not chosen a camera, BrowUp switches to the first physical one (`isVirtualCamera`, tested).

## Live checks so far (22 Nov 2026, HP laptop, Windows 11)

Run with `npm run probe`, nobody seated, room lights low:

| Check | Result |
| --- | --- |
| Key authentication (online) | ✅ accepted |
| `FACE_LANDMARKS + BLINKING + EXPRESSIONS` configuration | ✅ accepted. No `kConfigurationFailed` or `kMetricNotAuthorized`. |
| Processing status | reached 3 within ~4 s |
| Validation events | arrive: `NO_FACE_FOUND` on the virtual camera; `TOO_DARK` ("Increase light on face.") on the HP camera in a dark room |
| Camera choice | default = TranScreen (virtual) → BrowUp now picks the HP Wide Vision HD Camera automatically |
| Landmark content, blink flags, expression scores | **pending the face check** (needs a person in good light) |

## Still to verify with the face check (`npm run probe`, about 5 minutes)

The probe draws every landmark index over the mirror and runs the Stage 1 scripts. `npm run probe:analyze` then writes the report.

Face check done on 23 Nov 2026; the results are in [RESULTS.md §2](RESULTS.md) and [FACE-CHECK-2026-11-23.md](FACE-CHECK-2026-11-23.md).

- [x] 478 points in pixel coordinates; the index overlay tracked the face ("detects good on screen").
- [x] Landmark rate: 24.3 per second.
- [x] Brow reference: eye corners (d′ 1.86 / 0.93 against 1.83 / 0.80 for the eyelid).
- [x] Expression agreement 90%, so `EXPRESSIONS.MODE = 'on'` (SURPRISE 21, ANGRY 55).
- [x] Occlusion spike: 10 of 10 sentences readable.
- [x] Blink storm: 0 raises after the mask.

**Blink signal:** the SDK's `blinking.detected` fired only 6 times in 15 s of rapid blinking. BrowUp therefore relies on its own eyelid-opening fallback (eye opening below 30% of neutral), which masked 58% of the blink-phase frames.

`npm run probe:synthetic` runs the analyser on a synthetic log, as a dry run of the plumbing.

## Eligibility question for Presage

> BrowUp's live behaviour is driven by FACE_LANDMARKS (brow height, inner-brow gap, head yaw and pitch) and BLINKING (frame validity). Does that meet the "at least one live Presage signal" rule if EXPRESSIONS is dropped?
