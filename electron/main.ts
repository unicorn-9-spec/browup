// BrowUp — main process (adapted from the sibling project Upbeat).
//
// Owns: the window, the SmartSpectra IPC binding, the API key (encrypted with
// safeStorage, never logged, never written to renderer storage), the on-demand
// device readiness check, content-pack loading and validation, and the small
// JSON files (settings, calibration profile, progress, optional numbers-only
// recordings). No video is ever written anywhere.

import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, session } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkPack, loadable, type PackCheck } from '../content/validate';
import { redact } from './redact';

const DEBUG = process.env.BROWUP_DEBUG === '1';
const DEV_URL = process.env.ELECTRON_RENDERER_URL;
const APP_ORIGIN = 'app://browup';
const FLAGS = {
  probe: process.argv.includes('--probe'),
  e2e: process.env.BROWUP_E2E === '1',
  devUnreviewed: process.argv.includes('--dev-unreviewed') || process.env.BROWUP_DEV_UNREVIEWED === '1',
};

if (process.env.BROWUP_USER_DATA) app.setPath('userData', process.env.BROWUP_USER_DATA);

// ── Logging: event names and timings only; the key is always redacted. ──
let sessionKey: string | null = null;
function log(level: 'info' | 'warn' | 'error', msg: string): void {
  if (level === 'info' && !DEBUG) return;
  const line = `[browup/main] ${redact(msg, currentKeySafe())}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

// ── Paths ───────────────────────────────────────────────────────────────
const dataDir = () => app.getPath('userData');
const file = (name: string) => join(dataDir(), name);
const recDir = () => join(dataDir(), 'recordings');
const probeDir = () => join(dataDir(), 'probe');
const appRoot = () => app.getAppPath();
const STORES = new Set(['settings', 'profile', 'progress']);

function readJson(name: string): unknown {
  try {
    return JSON.parse(readFileSync(file(`${name}.json`), 'utf8'));
  } catch {
    return null;
  }
}
function writeJson(name: string, data: unknown): void {
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(file(`${name}.json`), JSON.stringify(data, null, 2));
}

// ── API key: encrypted file (safeStorage) → session memory → .env (dev) ──
function envKey(): string | null {
  if (FLAGS.e2e) return null;
  if (process.env.SMARTSPECTRA_API_KEY) return process.env.SMARTSPECTRA_API_KEY;
  if (app.isPackaged) return null;
  try {
    const env = readFileSync(resolve(appRoot(), '.env'), 'utf8');
    const v = /^SMARTSPECTRA_API_KEY=(.*)$/m.exec(env)?.[1]?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}
function storedKey(): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(readFileSync(file('key.bin')));
  } catch {
    return null;
  }
}
function currentKey(): { key: string | null; source: 'safeStorage' | 'session' | 'env' | 'none' } {
  const s = storedKey();
  if (s) return { key: s, source: 'safeStorage' };
  if (sessionKey) return { key: sessionKey, source: 'session' };
  const e = envKey();
  if (e) return { key: e, source: 'env' };
  return { key: null, source: 'none' };
}
function currentKeySafe(): string | null {
  try { return currentKey().key; } catch { return sessionKey; }
}

// ── app://browup/… serves the built renderer (CSP 'self' well defined). ──
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);
function registerAppProtocol(): void {
  const root = resolve(__dirname, '../renderer');
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    if (url.host !== 'browup') return new Response('not found', { status: 404 });
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const target = normalize(join(root, rel));
    if (target !== root && !target.startsWith(root + sep)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
}

// ── Permissions: camera only, only for our own page. Never the microphone.
function allowedOrigin(url: string): boolean {
  return url.startsWith(`${APP_ORIGIN}/`) || (!!DEV_URL && url.startsWith(DEV_URL));
}
function installPermissions(): void {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = (details && 'requestingUrl' in details && details.requestingUrl) || wc?.getURL() || '';
    const types = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    const videoOnly = permission === 'media' && types.length > 0 && types.every((t) => t === 'video');
    callback(videoOnly && allowedOrigin(url));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin, details) => {
    if (permission !== 'media') return false;
    return allowedOrigin(origin) && (details as { mediaType?: string }).mediaType !== 'audio';
  });
}

// ── Window ──────────────────────────────────────────────────────────────
let win: BrowserWindow | null = null;
let shutdownDone = false;
let sdkAvailable = false;
let sdkLoadError = '';

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#FFF4EA',
    title: 'BrowUp',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!allowedOrigin(url)) e.preventDefault();
  });
  // The SDK's main-process bridge, loaded lazily so an unsupported platform
  // still opens the app (the replay keeps working).
  try {
    const { bindSmartSpectraIpc } = await import('@smartspectra/node-sdk/main');
    bindSmartSpectraIpc(win, { logger: (level, msg) => log(level, `sdk: ${msg}`) });
    sdkAvailable = true;
  } catch (err) {
    sdkAvailable = false;
    sdkLoadError = (err as Error).message;
    log('warn', `SmartSpectra runtime unavailable: ${sdkLoadError}`);
  }
  if (DEV_URL) await win.loadURL(DEV_URL);
  else await win.loadURL(`${APP_ORIGIN}/index.html`);
  win.on('closed', () => { win = null; });
}

// ── Content packs ───────────────────────────────────────────────────────
interface PackEntry { dir: string; check: PackCheck; loadable: boolean }
function listPacks(): PackEntry[] {
  const root = join(appRoot(), 'content');
  if (!existsSync(root)) return [];
  const out: PackEntry[] = [];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const p = join(root, dir.name, 'pack.json');
    if (!existsSync(p)) continue;
    let check: PackCheck;
    try {
      check = checkPack(JSON.parse(readFileSync(p, 'utf8')));
    } catch (err) {
      check = { status: 'invalid', errors: [`pack.json is not valid JSON: ${(err as Error).message}`], pack: null, unreviewedPrompts: [] };
    }
    out.push({ dir: dir.name, check, loadable: loadable(check, FLAGS.devUnreviewed) });
  }
  return out;
}

// ── IPC ─────────────────────────────────────────────────────────────────
function fromOurWindow(e: Electron.IpcMainInvokeEvent): boolean {
  return !!win && e.sender === win.webContents && allowedOrigin(e.senderFrame?.url ?? '');
}
function handle(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!fromOurWindow(e)) throw new Error('refused');
    return fn(e, ...args);
  });
}

let readinessBusy = false;

function installIpc(): void {
  handle('sdk:info', () => ({ available: sdkAvailable, error: sdkLoadError, platform: `${process.platform}-${process.arch}` }));

  handle('key:status', () => {
    const { source } = currentKey();
    return { present: source !== 'none', source, encryptionAvailable: safeStorage.isEncryptionAvailable() };
  });
  handle('key:save', (_e, key) => {
    if (typeof key !== 'string' || key.trim().length < 8 || key.length > 1024) throw new Error('invalid key');
    const k = key.trim();
    if (safeStorage.isEncryptionAvailable()) {
      mkdirSync(dataDir(), { recursive: true });
      writeFileSync(file('key.bin'), safeStorage.encryptString(k));
      sessionKey = null;
      return { persisted: true };
    }
    sessionKey = k; // no OS keychain: this session only, never plain text on disk
    return { persisted: false };
  });
  handle('key:clear', () => {
    sessionKey = null;
    rmSync(file('key.bin'), { force: true });
    return true;
  });
  // The renderer helper's constructor needs the key (it forwards it to this
  // process over the SDK's MessagePort). Handed over in memory only.
  handle('key:forSdk', () => currentKey().key);

  // On demand only (Setup → "Check this computer"); takes ~24 s and opens
  // the camera natively, so it runs while no session holds the camera.
  handle('readiness:check', async () => {
    if (!sdkAvailable) return { verdict: 'blocked', reason: `SmartSpectra runtime unavailable on this platform (${sdkLoadError}).` };
    const { key } = currentKey();
    if (!key) return { verdict: 'inconclusive', reason: 'No API key yet.' };
    if (readinessBusy) return { verdict: 'inconclusive', reason: 'A check is already running.' };
    readinessBusy = true;
    try {
      const sdkMod = await import('@smartspectra/node-sdk');
      const sdk = new sdkMod.SmartSpectraSDK({
        apiKey: key,
        enableTelemetry: false,
        requestedMetrics: [sdkMod.MetricType.FACE_LANDMARKS, sdkMod.MetricType.BLINKING],
      });
      try {
        sdk.useCamera(sdkMod.CameraSelection.default, { width: 1280, height: 720, fps: 30 });
        const r = await sdk.checkDeviceReadiness();
        log('info', `readiness verdict=${r.verdict}`);
        return { verdict: String(r.verdict).toLowerCase(), reason: redact(r.reason, key) };
      } finally {
        await sdk.destroy();
      }
    } catch (err) {
      return { verdict: 'inconclusive', reason: redact((err as Error).message, key) };
    } finally {
      readinessBusy = false;
    }
  });

  handle('packs:list', () => listPacks().map((p) => ({
    dir: p.dir,
    status: p.check.status,
    errors: p.check.errors,
    loadable: p.loadable,
    language: p.check.pack?.language ?? p.dir.toUpperCase(),
    languageName: p.check.pack?.languageName ?? p.dir,
    reviewer: p.check.pack?.reviewer ?? null,
    unreviewedPrompts: p.check.unreviewedPrompts.length,
  })));
  handle('packs:get', (_e, dir) => {
    const hit = listPacks().find((p) => p.dir === dir);
    if (!hit || !hit.loadable) return null;
    return { pack: hit.check.pack, status: hit.check.status };
  });

  handle('store:read', (_e, name) => (typeof name === 'string' && STORES.has(name) ? readJson(name) : null));
  handle('store:write', (_e, name, data) => {
    if (typeof name !== 'string' || !STORES.has(name)) throw new Error('unknown store');
    writeJson(name, data);
    return true;
  });
  handle('store:deleteProgress', () => {
    rmSync(file('progress.json'), { force: true });
    rmSync(recDir(), { recursive: true, force: true });
    rmSync(probeDir(), { recursive: true, force: true });
    return true;
  });
  handle('store:resetCalibration', () => {
    rmSync(file('profile.json'), { force: true });
    return true;
  });

  const safeName = (n: unknown) => typeof n === 'string' && /^[\w.-]+\.jsonl$/.test(n);
  handle('rec:save', (_e, text) => {
    if (typeof text !== 'string' || text.length > 100 * 1024 * 1024) throw new Error('bad recording');
    mkdirSync(recDir(), { recursive: true });
    const name = `browup-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    writeFileSync(join(recDir(), name), text);
    return name;
  });
  handle('rec:list', () => (existsSync(recDir()) ? readdirSync(recDir()).filter((n) => n.endsWith('.jsonl')).sort().reverse() : []));
  handle('rec:read', (_e, name) => (safeName(name) ? readFileSync(join(recDir(), name as string), 'utf8') : null));
  handle('rec:delete', (_e, name) => {
    if (safeName(name)) rmSync(join(recDir(), name as string), { force: true });
    return true;
  });
  handle('replay:bundled', () => {
    try {
      return readFileSync(join(appRoot(), 'fixtures', 'replay', 'demo.jsonl'), 'utf8');
    } catch {
      return null;
    }
  });

  handle('probe:append', (_e, name, lines) => {
    if (typeof name !== 'string' || !/^[\w.-]+$/.test(name) || !Array.isArray(lines)) throw new Error('bad probe');
    mkdirSync(probeDir(), { recursive: true });
    writeFileSync(join(probeDir(), `${name}.jsonl`), lines.map(String).join('\n') + '\n', { flag: 'a' });
    return join(probeDir(), `${name}.jsonl`);
  });

  handle('export:markdown', async (_e, text, suggested) => {
    if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error('bad export');
    if (FLAGS.e2e) {
      mkdirSync(dataDir(), { recursive: true });
      const p = join(dataDir(), 'export-e2e.md');
      writeFileSync(p, text);
      return p;
    }
    const r = await dialog.showSaveDialog(win!, {
      title: 'Save teacher summary',
      defaultPath: typeof suggested === 'string' ? suggested : 'browup-summary.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, text);
    return r.filePath;
  });

  handle('app:paths', () => ({
    dataDir: dataDir(),
    files: ['settings.json', 'profile.json', 'progress.json', 'key.bin', 'recordings/', 'probe/'].map((f) => join(dataDir(), f)),
  }));
  handle('app:flags', () => ({ ...FLAGS }));
  ipcMain.on('app:shutdown-done', (e) => {
    if (win && e.sender === win.webContents) finishShutdown();
  });
}

// ── Lifecycle: on close or quit, the renderer stops camera tracks and the
// SDK (stop → stopAsync here → destroy); close when it confirms, or after
// 1.2 s regardless. ─────────────────────────────────────────────────────
let shutdownTimer: NodeJS.Timeout | null = null;
function requestShutdown(): void {
  if (!win || win.isDestroyed() || shutdownTimer) return;
  win.webContents.send('app:shutdown');
  shutdownTimer = setTimeout(finishShutdown, 1200);
}
function finishShutdown(): void {
  shutdownDone = true;
  if (shutdownTimer) clearTimeout(shutdownTimer);
  if (win && !win.isDestroyed()) win.close();
  else app.quit();
}
app.on('browser-window-created', (_e, w) => {
  w.on('close', (e) => {
    if (shutdownDone) return;
    e.preventDefault();
    requestShutdown();
  });
});
app.on('before-quit', (e) => {
  if (shutdownDone || !win || win.isDestroyed()) return;
  e.preventDefault();
  requestShutdown();
});
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  registerAppProtocol();
  installPermissions();
  installIpc();
  await createWindow();
});
