# Demo recording runbook

The challenge rule: show **live, unedited attempts**, including the **same prompt signed with a wrong and then a correct marker** (PLAN §7.3). You may trim calibration and the screen changes, but never cut inside an attempt.

The target length is about 2½–3 minutes. Everything below runs from the `browup/` folder.

## 0. The night before (done)

- [x] Build, 74 unit tests, 11 replay end-to-end tests: all passing (`npm run preflight`).
- [x] The live SDK was checked on this laptop: key accepted; landmarks, blinking and expressions allowed; the HP webcam is picked automatically instead of the virtual "TranScreen Camera"; Esc turns the camera off in ~45 ms.

## 1. Set the room (5 min)

- **Light in front of you** (a lamp or window facing you), none behind you. In last night's dark-room test the SDK said "Increase light on face". That is the most likely thing to spoil a take.
- Sit so your head and shoulders fill the frame and your **eyebrows are clearly visible**: no fringe over the brows, and glasses are fine if there's no glare.
- Close Camo, OBS virtual camera, Zoom, Teams and other video apps.
- Phone on silent. (BrowUp has no sound, so mute nothing.)

## 2. Pre-flight (2 min)

```bash
npm run preflight
```

It should end with "Ready to record". Two warnings are expected until steps 3 and 4 are done.

## 3. Face check — tune to your face (6 min, recommended)

```bash
npm run probe          # follow the on-screen cues for ~5 minutes
npm run probe:analyze  # writes the report next to the log
```

1. Glance at the overlay first. The tangerine numbered dots must sit **on your eyebrows** (70, 63, 105, 66, 107 and 300, 293, 334, 296, 336), your **eyelids** (159, 145, 386, 374), the **eye corners** (33, 133, 263, 362) and the **nose tip** (1). If they don't, stop and tell me.
2. Send me the report (or paste its summary). I will then:
   - set `EXPRESSIONS.MODE` (keep at ≥ 80% agreement, else drop);
   - set the brow reference;
   - adjust thresholds if your resting jitter is high;
   - fill in `docs/RESULTS.md` §2.

If time is short, skip this step: the defaults work and calibration still personalises the thresholds.

## 4. Content review status

- **If your reviewer has signed off:** apply their corrections to `content/asl/pack.json`, then run
  `npm run review:approve -- --name "Their Name" --role "Deaf ASL instructor" --credit "How they'd like to be credited"`
  and record with `npm run demo`. The UNREVIEWED banner disappears; credit them in the README.
- **If not yet:** record with `npm run demo:unreviewed`. The UNREVIEWED banner stays on screen, which is honest and is what the rules ask for. Say "content pending review by a Deaf signer" in the voice-over or captions.

## 5. Launch with the built-in recorder

```bash
npm run demo:record:fresh   # clean first-run profile + recorder: Welcome → Consent → Setup → Calibrate
# or
npm run demo:record         # keeps your saved calibration and progress, + recorder
```

The key comes from `.env`, so Setup already shows "A key is saved".

**Recording:** press **Ctrl+Shift+R**, or click **● Record demo** in the top bar. The button turns red and shows **REC 00:00**. Press Ctrl+Shift+R again to stop. The video is saved as an **MP4** in `Videos\BrowUp demos\`, and a note under the button gives the file name with **Show in folder**.

- It records **only the BrowUp window**, the mirror and all, with no other windows, no sound and nothing uploaded. Keep the window at 1440×900 or larger, or maximise it.
- You can record several takes; each one is a separate file.
- The recorder exists only with these `demo:record` commands. Learners never see it, and BrowUp's "never recorded" promise stays true for them.
- Prefer OBS or Xbox Game Bar (Win+Alt+R)? They still work with `npm run demo:unreviewed`.

## 6. Storyboard

| # | Time | Show | Do / say (captions) |
| --: | --- | --- | --- |
| 1 | 0:00–0:12 | Welcome screen | "Sign languages carry grammar on the face — raised brows for yes/no questions, furrowed brows for wh-questions, a head shake for negation. Learners can't see their own face while signing." |
| 2 | 0:12–0:25 | **Start → Consent** | Pause on the consent card: the camera stays local, nothing is recorded, no emotion reading. Click *I agree*. |
| 3 | 0:25–0:35 | Setup (framing oval) | Show the live mirror and oval. Click *Next: calibrate*. |
| 4 | 0:35–0:55 | **Calibrate** (trim in the edit) | Neutral 5 s, 3 raises, 3 furrows, 2 shakes, 2 nods; check marks appear. Show the "Your face, measured" table → *Save*. |
| 5 | 0:55–1:25 | **Lessons → Yes/no → "Are you hungry?"** | Press <kbd>Space</kbd>. Sign YOU HUNGRY with **flat brows** → **MISSING**, with the timeline flat under the lemon band. Press <kbd>R</kbd>, sign it again with **brows raised and held** → **HELD ✓**: the brow line turns mint while signing, and the timeline sits in the band from start to end. *This is the key shot — keep both attempts unedited.* |
| 6 | 1:25–1:45 | Same prompt, a third time | Raise your brows, then **drop them before the last sign** → **DROPPED AT END**, with the tip "keep your brows up until the last sign". |
| 7 | 1:45–2:05 | **Negation → "I'm not hungry."** | Sign ME NOT HUNGRY with a **clear side-to-side head shake** across the sentence → **HELD ✓**. The head arc turns mint; the timeline shows the swings. |
| 8 | 2:05–2:20 | Robustness | (a) Press Start, keep your brows still and **blink rapidly** → MISSING, never a false HELD. (b) Press Start and **hold a hand over your eyebrows** → NOT SEEN, "keep your hands below your eyebrows". |
| 9 | 2:20–2:35 | **Mixed review** | Press <kbd>2</kbd> (wh) for a wh-sentence, then <kbd>Space</kbd>: the learner chooses the marker first. |
| 10 | 2:35–2:45 | **Progress** | Bars per marker; *Teacher summary (Markdown)*. |
| 11 | 2:45–2:55 | Privacy | Press <kbd>Esc</kbd>: the camera goes off at once and the mirror is blank. Open Settings → Privacy (telemetry off, delete). |
| 12 | 2:55–3:00 | End card | "BrowUp — practise the grammar on your face. Content reviewed by … / pending review." Show the repo URL. |

### Signing tips for clean takes

- **Hold the marker before your first sign and after your last one.** The first 0.4 s after "Go" is not judged, and the tangerine highlight moving across the gloss shows your pace.
- Make the raises clear, roughly like the calibration raises. The **Sensitivity** setting (Gentle/Standard/Strict) is in Settings if a take keeps missing.
- Keep your hands below the eyebrows. Signs near the forehead hide the brows, and BrowUp will honestly say NOT SEEN.
- For negation, shake visibly side to side (about ±10° or more) for the whole sentence.

## 7. Backup: the replay (no camera)

If the camera or the network fails on the day, use **Watch a replay** on the Welcome screen. It is clearly labelled as synthetic demo data. The flow is the same: <kbd>Space</kbd> → MISSING, <kbd>R</kbd> → HELD, <kbd>R</kbd> → NOT SEEN. This is also how judges can run BrowUp without a key.

## 8. After recording

- Upload the video and link it in the README and the DEV post.
- Optional: in Settings, turn on "Save numbers-only replays of my practice" during a take. The real attempts are then saved as a replay file (numbers only) that judges can open.
- Commit and push (ask Claude, or see the push command in the conversation notes).
