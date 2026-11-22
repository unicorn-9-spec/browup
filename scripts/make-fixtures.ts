// Writes the bundled synthetic replay (fixtures/replay/demo.jsonl) from the
// content pack's prompts, after checking that every clip gets its intended
// verdict through the real pipeline. Run: npm run fixtures

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkPack } from '../content/validate';
import { compactEvent } from '../src/sensing/record';
import { buildReplay } from '../src/synth/session';

const packPath = join('content', 'asl', 'pack.json');
const check = checkPack(JSON.parse(readFileSync(packPath, 'utf8')));
if (!check.pack) {
  console.error('Pack is invalid:', check.errors.join('\n'));
  process.exit(1);
}

const { header, events, checks } = buildReplay(check.pack.prompts, { fps: 24 });
const bad = checks.filter((c) => c.expect !== c.got);
for (const c of checks) console.log(`${c.expect === c.got ? 'ok  ' : 'FAIL'} ${c.clip.padEnd(10)} ${c.expect.padEnd(15)} ${c.got.padEnd(15)} ${c.label}`);
if (bad.length) {
  console.error(`\n${bad.length} clip(s) did not produce their intended verdict.`);
  process.exit(1);
}

mkdirSync(join('fixtures', 'replay'), { recursive: true });
const lines = [JSON.stringify(header), ...events.map((e) => JSON.stringify(compactEvent(e)))];
const out = join('fixtures', 'replay', 'demo.jsonl');
writeFileSync(out, lines.join('\n') + '\n');
console.log(`\nWrote ${out}: ${header.clips.length} clips, ${events.length} events, ${(lines.join('\n').length / 1024 / 1024).toFixed(1)} MB`);
