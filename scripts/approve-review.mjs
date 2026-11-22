// Records a completed content review in content/asl/pack.json.
// Run ONLY after the reviewer has gone through docs/CONTENT-REVIEW.md and
// their corrections have been applied to the pack.
//
//   npm run review:approve -- --name "Full Name" --role "Deaf ASL instructor" [--credit "How to credit"] [--only yn-01,yn-02]

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const name = get('name');
const role = get('role');
const credit = get('credit');
const only = get('only')?.split(',').map((s) => s.trim()).filter(Boolean);
if (!name || !role) {
  console.error('Usage: npm run review:approve -- --name "Full Name" --role "Deaf ASL instructor" [--credit "..."] [--only id1,id2]');
  process.exit(1);
}

const path = 'content/asl/pack.json';
const pack = JSON.parse(readFileSync(path, 'utf8'));
let n = 0;
for (const p of pack.prompts) {
  if (only && !only.includes(p.id)) continue;
  p.reviewed = true;
  if (typeof p.notes === 'string') p.notes = p.notes.replace(/UNREVIEWED draft\.?\s*/g, '').trim() || undefined;
  if (p.notes === undefined) delete p.notes;
  n++;
}
const today = new Date().toISOString().slice(0, 10);
pack.reviewer = { name, role, date: today, ...(credit ? { credit } : {}) };
const left = pack.prompts.filter((p) => p.reviewed !== true).length;
if (left === 0) pack.notice = `Reviewed by ${name} (${role}) on ${today}.`;
writeFileSync(path, JSON.stringify(pack, null, 2) + '\n');
console.log(`Marked ${n} prompt(s) reviewed by ${name} (${role}). Prompts still unreviewed: ${left}.`);
console.log(left === 0 ? 'The pack now loads without the developer flag (npm run demo). Update the README credits.' : 'The pack stays UNREVIEWED until every prompt is reviewed.');
