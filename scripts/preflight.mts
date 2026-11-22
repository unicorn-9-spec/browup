// Demo pre-flight: checks everything that can be checked without a person
// in front of the camera. Run: npm run preflight
//
// Never prints the API key — only whether one is present.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { checkPack } from '../content/validate.ts';

let failed = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ! ${msg}`);
const bad = (msg: string) => { failed++; console.log(`  ✗ ${msg}`); };

console.log('\nBrowUp pre-flight\n');

// Node
const [major, minor] = process.versions.node.split('.').map(Number) as [number, number];
if (major > 20 || (major === 20 && minor >= 19)) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} — need 20.19+`);

// SDK + native runtime
try {
  const sdk = await import('@smartspectra/node-sdk');
  const pkg = JSON.parse(readFileSync('node_modules/@smartspectra/node-sdk/package.json', 'utf8')) as { version: string };
  ok(`SmartSpectra SDK ${pkg.version} installed`);
  try {
    const cams = sdk.SmartSpectraSDK.availableCameras() as { name?: string }[];
    const names = cams.map((c) => c.name ?? '?');
    ok(`Native runtime loads; cameras: ${names.join(', ') || 'none found'}`);
    if (names.length && names.every((n) => /virtual|obs|transcreen|screen/i.test(n))) bad('Only virtual cameras found — plug in or enable a real webcam');
  } catch (e) {
    warn(`Native camera listing unavailable here (${(e as Error).message.slice(0, 80)}) — the app lists cameras itself`);
  }
} catch (e) {
  bad(`SmartSpectra SDK not loadable: ${(e as Error).message.slice(0, 120)} — run npm install`);
}

// API key (presence only)
const envKey = existsSync('.env') && /^SMARTSPECTRA_API_KEY=\S{8,}/m.test(readFileSync('.env', 'utf8'));
if (envKey) ok('API key present in .env (development)');
else warn('No key in .env — paste one in Setup, or the live demo cannot start (replay still works)');

// Content pack
const check = checkPack(JSON.parse(readFileSync('content/asl/pack.json', 'utf8')));
if (check.status === 'reviewed') ok(`ASL pack reviewed by ${check.pack?.reviewer?.name} — use: npm run demo`);
else if (check.status === 'unreviewed') warn(`ASL pack is UNREVIEWED (${check.unreviewedPrompts.length} prompts) — use: npm run demo:unreviewed (banner shown). After sign-off: npm run review:approve`);
else bad(`ASL pack invalid: ${check.errors.slice(0, 3).join('; ')}`);

// Replay fixture
if (existsSync('fixtures/replay/demo.jsonl')) ok(`Replay fixture present (${(statSync('fixtures/replay/demo.jsonl').size / 1e6).toFixed(1)} MB)`);
else bad('Replay fixture missing — run npm run fixtures');

// Build
try {
  execSync('npx electron-vite build', { stdio: 'pipe' });
  ok('Fresh build (out/)');
} catch (e) {
  bad(`Build failed: ${String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 200)}`);
}

// Unit tests
try {
  const out = execSync('npx vitest run', { stdio: 'pipe' }).toString();
  const m = /Tests\s+(\d+) passed/.exec(out);
  ok(`Unit tests: ${m ? m[1] : '?'} passed`);
} catch (e) {
  bad(`Unit tests failed:\n${String((e as { stdout?: Buffer }).stdout ?? '').slice(-600)}`);
}

// Probe report (face check)
const thresholds = readFileSync('config/thresholds.ts', 'utf8');
const mode = /MODE: '(\w+)'/.exec(thresholds)?.[1];
if (mode === 'pending') warn('Face check not applied yet (EXPRESSIONS.MODE is pending): run npm run probe, then npm run probe:analyze');
else ok(`Expressions decided: ${mode}`);

console.log(failed ? `\n${failed} problem(s) to fix before recording.\n` : '\nReady to record. See docs/DEMO.md.\n');
process.exit(failed ? 1 : 0);
