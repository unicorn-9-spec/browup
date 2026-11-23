// Walkthrough, step 1: drive the app through its bundled replay (no camera,
// no API key) and capture the window as video, logging when each moment
// happens so the narration can be placed on it.
//
//   npm run build && node scripts/walkthrough/capture.mjs <out-dir>
//
// Writes <out-dir>/capture.mp4|webm and <out-dir>/events.json.
// Capture permission is granted here, in the harness only.

import { _electron as electron } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'walkthrough-capture');
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await electron.launch({
  args: ['.'],
  env: {
    ...process.env, BROWUP_E2E: '1', BROWUP_DEV_UNREVIEWED: '1', SMARTSPECTRA_API_KEY: '',
    // A neutral data folder so no local user name appears on screen.
    BROWUP_USER_DATA: mkdtempSync(join(process.env.PUBLIC ?? tmpdir(), 'browup-wt-')),
  },
});
const page = await app.firstWindow();
await page.waitForSelector('[data-testid="watch-replay"]');
await app.evaluate(({ BrowserWindow, session }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.setContentSize(1600, 900);
  w.center();
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _p, cb) => cb(true));
  s.setPermissionCheckHandler(() => true);
  s.setDisplayMediaRequestHandler((req, cb) => cb({ video: req.frame }));
});
await sleep(800);

// Start the page capture (needs a trusted click) and an event log.
await page.evaluate(() => {
  const w = window;
  w.__wt = { chunks: [], events: [], t0: 0, rec: null, mime: '' };
  document.addEventListener('click', async () => {
    if (w.__wt.rec) return;
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: 1600, height: 900 }, audio: false });
    const mime = ['video/mp4;codecs=avc1.640028', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) w.__wt.chunks.push(e.data); };
    rec.start(1000);
    w.__wt.rec = rec;
    w.__wt.mime = mime;
    w.__wt.t0 = performance.now();
    // Log every verdict stamp as it lands.
    let last = '';
    setInterval(() => {
      const k = document.querySelector('[data-testid="stamp"]')?.getAttribute('data-kind') ?? '';
      if (k && k !== last) w.__wt.events.push({ t: (performance.now() - w.__wt.t0) / 1000, text: `stamp:${k}` });
      last = k;
    }, 50);
  }, { once: true });
});
await page.mouse.click(1500, 860);
await sleep(600);
const mark = (name) => page.evaluate((n) => window.__wt.events.push({ t: (performance.now() - window.__wt.t0) / 1000, text: `#${n}` }), name);
const stamp = async (kind) => {
  await page.waitForFunction((k) => document.querySelector('[data-testid="stamp"]')?.getAttribute('data-kind') === k, kind, { timeout: 30_000 });
};

await mark('welcome');
await sleep(14500);
await page.getByTestId('start').click();
await mark('consent');
await sleep(9500);
await page.getByRole('button', { name: 'Leave' }).click();
await sleep(800);
await mark('replay');
await page.getByTestId('watch-replay').click();
await sleep(7500);
await mark('lesson-yn');
await page.getByTestId('set-yes-no').click();
await sleep(7500);
await page.keyboard.press('Space');
await stamp('MISSING');
await sleep(7500);
await page.keyboard.press('r');
await stamp('HELD');
await sleep(8000);
await page.keyboard.press('r');
await stamp('NOT_SEEN');
await sleep(6000);
await mark('lesson-neg');
await page.getByRole('button', { name: 'Lessons' }).click();
await sleep(1200);
await page.getByTestId('set-negation').click();
await sleep(5500);
await page.keyboard.press('Space');
await stamp('MISSING');
await sleep(3000);
await page.keyboard.press('r');
await stamp('HELD');
await sleep(6500);
await mark('lesson-topic');
await page.getByRole('button', { name: 'Lessons' }).click();
await sleep(1200);
await page.getByTestId('set-topic').click();
await sleep(2500);
await page.keyboard.press('Space');
await stamp('KEPT_UP');
await sleep(3500);
await page.keyboard.press('r');
await stamp('HELD');
await sleep(5500);
await mark('review');
await page.getByRole('button', { name: 'Lessons' }).click();
await sleep(1200);
await page.getByTestId('set-review').click();
await sleep(3000);
await page.keyboard.press('2');
await sleep(1500);
await page.keyboard.press('Space');
await page.getByTestId('stamp').waitFor({ timeout: 30_000 });
await sleep(5000);
await mark('progress');
await page.getByRole('button', { name: 'Progress' }).click();
await sleep(6500);
await mark('privacy');
await page.getByRole('button', { name: 'Settings and privacy' }).click();
await sleep(1500);
await page.mouse.wheel(0, 500);
await sleep(9000);
await page.keyboard.press('Escape');
await mark('end');
await sleep(9000);

const meta = await page.evaluate(async () => {
  const w = window.__wt;
  await new Promise((r) => { w.rec.onstop = r; w.rec.stop(); });
  w.blob = new Blob(w.chunks, { type: w.mime });
  return { size: w.blob.size, mime: w.mime, events: w.events };
});
const parts = [];
for (let off = 0; off < meta.size; off += 4 << 20) {
  parts.push(await page.evaluate(async ([o, n]) => {
    const buf = new Uint8Array(await window.__wt.blob.slice(o, o + n).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, [off, 4 << 20]));
}
const ext = meta.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
writeFileSync(join(out, `capture.${ext}`), Buffer.concat(parts.map((p) => Buffer.from(p, 'base64'))));
writeFileSync(join(out, 'events.json'), JSON.stringify(meta.events, null, 1));
await app.close();
console.log(`capture done: capture.${ext} (${(meta.size / 1e6).toFixed(1)} MB), ${meta.events.length} events`);
