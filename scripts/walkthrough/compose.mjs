// Walkthrough, step 2: narration + burned-in captions over the capture.
//
//   node scripts/walkthrough/compose.mjs <capture-dir> <out.mp4> [kokoro-model-dir] [voice] [python]
//
// Narration lines are anchored to the moments logged by capture.mjs and
// burned in as captions, so the video works with the sound off (BrowUp itself
// has no sound). The voice is Kokoro-82M, an open-source model run offline
// through kokoro-onnx (narrate.py; default male voice am_michael). Without a
// model dir it falls back to a built-in Windows voice (tts.ps1). Nothing is
// sent anywhere. Needs ffmpeg and ffprobe.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cap = resolve(process.argv[2] ?? 'walkthrough-capture');
const out = resolve(process.argv[3] ?? 'walkthrough.mp4');
const modelDir = process.argv[4] ? resolve(process.argv[4]) : null;
const voiceName = process.argv[5] ?? 'am_michael';
const python = process.argv[6] ?? 'python';
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 }).toString();
const dur = (f) => Number(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]).trim());

const events = JSON.parse(readFileSync(join(cap, 'events.json'), 'utf8'));
const at = (text, n = 1, shift = 0) => {
  const e = events.filter((x) => x.text === text)[n - 1];
  if (!e) throw new Error(`no event ${text} #${n}`);
  return Math.max(0, e.t + shift);
};

// Honest about what is on screen: a replay of synthetic numbers.
const LINES = [
  { id: 'n01', t: at('#welcome', 1, 0.3), text: 'BrowUp: practise the grammar on your face. In sign languages, raised brows make a yes-no question, furrowed brows a wh-question, and a head shake negates, held across the whole sentence.' },
  { id: 'n02', t: at('#consent', 1, 0.3), text: 'The camera stays off until you agree. The mirror never leaves your computer, nothing is recorded, and your face is never read as emotion.' },
  { id: 'n03', t: at('#replay', 1, 0.3), text: 'This walkthrough plays the built-in replay: synthetic face data, through the same engine as the live camera.' },
  { id: 'n04', t: at('#lesson-yn', 1, 0.3), text: 'Read the meaning and the gloss, with the marker bar over its signs. Press Space, wait for the count, and sign.' },
  { id: 'n05', t: at('stamp:MISSING', 1, -0.2), text: 'Flat brows: missing. The timeline shows the brows staying below the yellow target band, and one tip says what to change.' },
  { id: 'n06', t: at('stamp:HELD', 1, -0.2), text: 'Retry, with the brows raised before the first sign and held to the last: held. The brow line stays in the band all the way.' },
  { id: 'n07', t: at('stamp:NOT_SEEN', 1, -0.2), text: 'With hands over the face for most of the sentence, there is no verdict at all. BrowUp never guesses from frames it cannot see.' },
  { id: 'n08', t: at('#lesson-neg', 1, 0.3), text: 'Negation is judged from the head: a side-to-side shake, measured from the face landmarks. No shake is missing; a shake across the negated signs is held.' },
  { id: 'n09', t: at('stamp:HELD', 2, 0.2), text: 'The timeline shows each swing of the head.' },
  { id: 'n10', t: at('#lesson-topic', 1, 0.3), text: 'Topics are judged in two parts: brows up on the topic, then relaxed for the comment. Brows kept up too long get their own stamp.' },
  { id: 'n11', t: at('#review', 1, 0.3), text: 'Mixed review shuffles sentences. You choose the marker first, then sign it, and the score counts both.' },
  { id: 'n12', t: at('#progress', 1, 0.3), text: 'Progress keeps numbers only: one bar per marker, and a summary you can share with a teacher.' },
  { id: 'n13', t: at('#privacy', 1, 0.3), text: 'Telemetry is off, everything can be deleted, and there is no sound anywhere. BrowUp is built on Presage SmartSpectra: face landmarks, blink detection and expression scores, on device.' },
  { id: 'n14', t: at('#end', 1, 0.3), text: 'The sign-language content is waiting for review by a Deaf signer. The code and setup are linked in the post.' },
];

const voiceDir = join(cap, 'voice');
writeFileSync(join(cap, 'lines.json'), JSON.stringify(LINES.map(({ id, text }) => ({ id, text }))));
if (LINES.some((l) => !existsSync(join(voiceDir, `${l.id}.wav`)))) {
  if (modelDir) console.log(sh(python, [join(here, 'narrate.py'), join(cap, 'lines.json'), voiceDir, modelDir, voiceName, '1.05']).trim());
  else console.log(sh('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, 'tts.ps1'), join(cap, 'lines.json'), voiceDir, 'Zira', '1.1']).trim());
}

// Place clips: never overlap — a line starts at its moment or just after the
// previous line, whichever is later.
let cursor = 0;
const placed = LINES.map((l) => {
  const d = dur(join(voiceDir, `${l.id}.wav`));
  const start = Math.max(l.t, cursor + 0.3);
  cursor = start + d;
  return { ...l, start, end: start + d };
});
const capture = ['mp4', 'webm'].map((e) => join(cap, `capture.${e}`)).find(existsSync);
const total = dur(capture);
const pad = Math.max(0, cursor + 1.5 - total);
const length = total + pad;

// Captions (SRT), burned in.
const ts = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const wrap = (t) => {
  const rows = [''];
  for (const w of t.split(' ')) {
    if ((rows[rows.length - 1] + ' ' + w).trim().length > 84) rows.push(w);
    else rows[rows.length - 1] = (rows[rows.length - 1] + ' ' + w).trim();
  }
  return rows.join('\n');
};
writeFileSync(join(cap, 'narration.srt'), placed.map((l, i) => `${i + 1}\n${ts(l.start)} --> ${ts(l.end + 0.3)}\n${wrap(l.text)}\n`).join('\n'));

// Audio: narration clips over silence (the app is silent by design).
const inputs = ['-i', capture, '-f', 'lavfi', '-t', length.toFixed(2), '-i', 'anullsrc=r=48000:cl=stereo',
  ...placed.flatMap((l) => ['-i', join(voiceDir, `${l.id}.wav`)])];
const delays = placed.map((l, i) => `[${i + 2}:a]aresample=48000,adelay=${Math.round(l.start * 1000)}:all=1[v${i}]`).join(';');
const mix = `${delays};[1:a]${placed.map((_, i) => `[v${i}]`).join('')}amix=inputs=${placed.length + 1}:duration=first:normalize=0,alimiter=limit=0.89[a]`;
const srt = join(cap, 'narration.srt').replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1\\:');
// BrowUp palette: white text on a plum box (ASS colours are &HAABBGGRR).
const style = 'FontName=Segoe UI,FontSize=10,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H004D1D3A,BackColour=&H004D1D3A,BorderStyle=3,Outline=2,Shadow=0,MarginV=6';
// The app picture sits in the top 1664×936; captions get their own band below
// it, so they never cover the timeline.
const video = `[0:v]scale=1664:936:flags=lanczos,fps=30,pad=1920:1080:128:6:color=0xFFF4EA${pad ? `,tpad=stop_mode=clone:stop_duration=${pad.toFixed(2)}` : ''},subtitles='${srt}':force_style='${style}'[v]`;
sh('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `${video};${mix}`, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out]);
for (const l of placed) console.log(`${l.id} moment ${l.t.toFixed(1)} s → spoken ${l.start.toFixed(1)}–${l.end.toFixed(1)} s${l.start - l.t > 1 ? `  (late ${(l.start - l.t).toFixed(1)} s)` : ''}`);
console.log(`wrote ${out} (${dur(out).toFixed(1)} s)`);
