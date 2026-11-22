// Launches the built app with demo-friendly options (works the same on
// Windows, macOS and Linux — no shell-specific env syntax).
//
//   node scripts/launch.mjs                 normal start
//   node scripts/launch.mjs --unreviewed    load the UNREVIEWED draft pack (banner shown)
//   node scripts/launch.mjs --fresh         fresh profile in a temp folder: shows
//                                           Welcome → Consent → Setup → Calibrate,
//                                           like a first install (key still read from .env)
//   node scripts/launch.mjs --probe         Stage 1 face check

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const electron = require('electron');
const args = process.argv.slice(2);
const env = { ...process.env };
const appArgs = ['.'];

if (args.includes('--unreviewed')) appArgs.push('--dev-unreviewed');
if (args.includes('--probe')) appArgs.push('--probe', '--dev-unreviewed');
if (args.includes('--fresh')) {
  env.BROWUP_USER_DATA = mkdtempSync(join(tmpdir(), 'browup-demo-'));
  console.log(`Fresh profile: ${env.BROWUP_USER_DATA}`);
}

const child = spawn(electron, appArgs, { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
