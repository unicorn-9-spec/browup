// End-to-end in replay mode — no camera, no API key (AGENT_PROMPT §12:
// keyboard-only lesson; unreviewed pack rejected; reduced motion; layout).
// Runs the built app (`npm run test:e2e` builds first). Set BROWUP_SHOTS=dir
// to save screenshots.

import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let app: ElectronApplication;
let page: Page;
let userData: string;
const shots = process.env.BROWUP_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

test.describe.configure({ mode: 'serial' });

async function launch(env: Record<string, string>, dir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const a = await electron.launch({
    args: ['.'],
    env: { ...process.env, BROWUP_E2E: '1', BROWUP_USER_DATA: dir, SMARTSPECTRA_API_KEY: '', ...env },
  });
  const p = await a.firstWindow();
  await p.waitForSelector('[data-testid="watch-replay"]');
  return { app: a, page: p };
}
async function size(a: ElectronApplication, w: number, h: number): Promise<void> {
  await a.evaluate(({ BrowserWindow }, [ww, hh]) => BrowserWindow.getAllWindows()[0]!.setSize(ww!, hh!), [w, h]);
  await new Promise((r) => setTimeout(r, 300));
}
const shot = async (name: string) => {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
};
async function stamp(kind: string): Promise<void> {
  await expect(page.getByTestId('stamp')).toHaveAttribute('data-kind', kind, { timeout: 20_000 });
}

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'browup-e2e-'));
  ({ app, page } = await launch({ BROWUP_DEV_UNREVIEWED: '1' }, userData));
  await size(app, 1440, 900);
});
test.afterAll(async () => {
  await app?.close();
  rmSync(userData, { recursive: true, force: true });
});

test('welcome: language choice, Start and replay; no camera yet', async () => {
  await expect(page.getByText('Practise the grammar on your face.')).toBeVisible();
  await expect(page.getByText('unreviewed draft')).toBeVisible();
  await expect(page.getByTestId('camera-pill')).toHaveCount(0);
  // No recorder in a normal build.
  await expect(page.getByTestId('demo-rec')).toHaveCount(0);
  await shot('01-welcome');
});

test('first Start goes to consent before any camera', async () => {
  await page.getByTestId('start').click();
  await expect(page.getByText('Before the camera turns on')).toBeVisible();
  await expect(page.getByTestId('camera-pill')).toHaveCount(0);
  await shot('02-consent');
  await page.getByRole('button', { name: 'Leave' }).click();
});

test('replay: lesson sets with the REPLAY and UNREVIEWED banners', async () => {
  await page.getByTestId('watch-replay').click();
  await expect(page.getByText('synthetic demo data generated from a face model')).toBeVisible();
  await expect(page.getByTestId('unreviewed-banner')).toBeVisible();
  await expect(page.getByTestId('set-yes-no')).toBeVisible();
  await shot('03-lessons');
});

test('keyboard-only yes/no lesson: MISSING, then HELD on retry, then NOT SEEN', async () => {
  await page.getByTestId('set-yes-no').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Are you hungry?', { exact: true })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('countdown')).toBeVisible();
  await shot('04-countdown');
  await stamp('MISSING');
  await expect(page.getByTestId('tip')).toContainText('brows raised');
  await expect(page.getByTestId('timeline-summary')).toContainText('Brows raised for');
  await shot('05-missing');
  await page.keyboard.press('r');
  await stamp('HELD');
  await expect(page.getByTestId('timeline-summary')).toContainText('Brows raised for');
  await shot('06-held');
  await page.keyboard.press('r');
  await stamp('NOT_SEEN');
  await expect(page.getByTestId('tip')).toContainText('hands below your eyebrows');
  await shot('07-not-seen');
  await page.keyboard.press('n');
  await expect(page.getByText('Are you Deaf?', { exact: true })).toBeVisible();
});

test('negation is judged from a head shake', async () => {
  await page.getByRole('button', { name: 'Lessons' }).click();
  await page.getByTestId('set-negation').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await stamp('MISSING');
  await page.keyboard.press('r');
  await stamp('HELD');
  await expect(page.getByTestId('timeline-summary')).toContainText('Head shake across');
  await shot('08-negation-held');
});

test('topic: brows kept up through the comment, then held correctly', async () => {
  await page.getByRole('button', { name: 'Lessons' }).click();
  await page.getByTestId('set-topic').click();
  await page.keyboard.press('Space');
  await stamp('KEPT_UP');
  await page.keyboard.press('r');
  await stamp('HELD');
  await shot('09-topic-held');
});

test('mixed review: choose the marker first (keys 1–4), then sign', async () => {
  await page.getByRole('button', { name: 'Lessons' }).click();
  await page.getByTestId('set-review').click();
  await expect(page.getByText('Which marker does this sentence needs?').or(page.getByText('Which marker does this sentence need?')).first()).toBeVisible();
  await expect(page.getByTestId('start-capture')).toBeDisabled();
  await page.keyboard.press('1');
  await expect(page.getByTestId('start-capture')).toBeEnabled();
  await shot('10-review-pick');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('stamp')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/You chose Yes\/no question/)).toBeVisible();
});

test('progress: bars per marker and a numbers-only teacher export', async () => {
  await page.getByRole('button', { name: 'Progress' }).click();
  await expect(page.getByText('Held, by marker')).toBeVisible();
  await expect(page.getByText('Replay attempts are shown here but never saved.')).toBeVisible();
  await shot('11-progress');
  await page.getByTestId('export').click();
  const p = join(userData, 'export-e2e.md');
  await expect.poll(() => existsSync(p)).toBe(true);
  const md = readFileSync(p, 'utf8');
  expect(md).toContain('| yn-01 | Yes/no question | HELD |');
  expect(md).not.toMatch(/data:image|<img/);
  // Replay attempts are never written to progress.json.
  expect(existsSync(join(userData, 'progress.json'))).toBe(false);
});

test('reduced motion: stamps appear without spring or rotation', async () => {
  await page.getByRole('button', { name: 'Settings and privacy' }).click();
  await page.getByLabel('Reduced motion').selectOption('on');
  await shot('12-settings');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Lessons' }).click();
  await page.getByTestId('set-affirmation').click();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('stamp')).toBeVisible({ timeout: 20_000 });
  const style = await page.getByTestId('stamp').evaluate((el) => {
    const s = getComputedStyle(el);
    return { anim: s.animationName, transform: s.transform };
  });
  expect(style.anim).toBe('none');
  expect(style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
});

test('layout holds from 1280×720 to 1920×1080 (mirror left, card right)', async () => {
  for (const [w, h] of [[1280, 720], [1920, 1080]] as const) {
    await size(app, w, h);
    const m = await page.getByTestId('mirror').boundingBox();
    const g = await page.locator('.gloss-card').boundingBox();
    expect(m && g).toBeTruthy();
    expect(m!.x + m!.width).toBeLessThanOrEqual(g!.x + 1);
    expect(m!.width).toBeGreaterThan(g!.width);
    await shot(`13-layout-${w}x${h}`);
  }
  await size(app, 1440, 900);
});

test('an unreviewed pack is refused without the developer flag', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browup-e2e2-'));
  const b = await launch({ BROWUP_DEV_UNREVIEWED: '' }, dir);
  try {
    await expect(b.page.getByText('pack coming — awaiting review')).toBeVisible();
    await expect(b.page.getByTestId('start')).toBeDisabled();
    await expect(b.page.getByTestId('watch-replay')).toBeDisabled();
  } finally {
    await b.app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// Window capture on Windows only gets frames while the window is actually on
// screen, which automated runs do not always guarantee: allow retries.
test.describe('demo recorder', () => {
  test.describe.configure({ retries: 2 });
test('demo recorder (developer flag): records the BrowUp window to a local video file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browup-e2e3-'));
  const videos = mkdtempSync(join(tmpdir(), 'browup-videos-'));
  const b = await launch({ BROWUP_DEV_UNREVIEWED: '1', BROWUP_DEMO_RECORDER: '1', BROWUP_VIDEOS_DIR: videos }, dir);
  try {
    await b.page.getByTestId('watch-replay').click();
    // Window capture only receives frames while the window is on screen.
    await b.app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]!; w.setAlwaysOnTop(true); w.show(); w.focus(); });
    await b.page.waitForTimeout(500);
    await b.page.keyboard.press('Control+Shift+R');
    await expect(b.page.getByTestId('demo-rec')).toContainText('REC', { timeout: 10_000 });
    await b.page.getByTestId('set-yes-no').click();
    await b.page.waitForTimeout(3000);
    await b.page.getByTestId('demo-rec').click();
    await expect(b.page.getByTestId('demo-saved')).toContainText('Saved', { timeout: 15_000 });
    const files = readdirSync(videos);
    expect(files).toHaveLength(1);
    const f = join(videos, files[0]!);
    expect(statSync(f).size).toBeGreaterThan(20_000);
    const head = readFileSync(f).subarray(0, 12);
    // MP4 ("ftyp" box) or WebM (EBML magic).
    expect(head.includes(Buffer.from('ftyp')) || head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toBe(true);
  } finally {
    await b.app.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(videos, { recursive: true, force: true });
  }
});
});
