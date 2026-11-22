// Content pack format (PLAN F8): schema validation, semantic checks and the
// reviewer rule ("the app refuses packs without a reviewer field").

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { checkPack, loadable } from '../../content/validate';

const pack = () => JSON.parse(readFileSync('content/asl/pack.json', 'utf8'));

describe('the bundled ASL pack', () => {
  test('is valid, has the PLAN prompt counts, and is marked unreviewed', () => {
    const c = checkPack(pack());
    expect(c.pack).not.toBeNull();
    const count = (m: string) => c.pack!.prompts.filter((p) => p.marker === m).length;
    expect([count('yn'), count('wh'), count('neg'), count('aff')]).toEqual([8, 8, 5, 3]);
    expect(c.status).toBe('unreviewed');
    expect(c.unreviewedPrompts).toHaveLength(c.pack!.prompts.length);
  });
  test('every prompt cites a source and says it is unreviewed', () => {
    for (const p of checkPack(pack()).pack!.prompts) {
      expect(p.sources?.length, p.id).toBeGreaterThan(0);
      expect(p.notes, p.id).toMatch(/UNREVIEWED/);
    }
  });
});

describe('reviewer rule', () => {
  test('an unreviewed pack is refused unless the developer flag is set', () => {
    const c = checkPack(pack());
    expect(loadable(c, false)).toBe(false);
    expect(loadable(c, true)).toBe(true);
    expect(c.errors.join(' ')).toMatch(/No reviewer recorded/);
  });
  test('a reviewer plus every prompt marked reviewed → reviewed', () => {
    const p = pack();
    p.reviewer = { name: 'A. Reviewer', role: 'Deaf ASL instructor', date: '2026-11-22' };
    for (const x of p.prompts) x.reviewed = true;
    const c = checkPack(p);
    expect(c.status).toBe('reviewed');
    expect(loadable(c, false)).toBe(true);
  });
  test('a reviewer with some prompts not yet reviewed is still unreviewed', () => {
    const p = pack();
    p.reviewer = { name: 'A. Reviewer', role: 'Deaf ASL instructor', date: '2026-11-22' };
    p.prompts[0].reviewed = true;
    expect(checkPack(p).status).toBe('unreviewed');
  });
  test('a reviewer without a date fails the schema', () => {
    const p = pack();
    p.reviewer = { name: 'A. Reviewer', role: 'Deaf ASL instructor' };
    expect(checkPack(p).status).toBe('invalid');
  });
});

describe('malformed packs never load', () => {
  test('span outside the gloss', () => {
    const p = pack();
    p.prompts[0].span = [0, 9];
    const c = checkPack(p);
    expect(c.status).toBe('invalid');
    expect(loadable(c, true)).toBe(false);
  });
  test('topic without a split', () => {
    const p = pack();
    delete p.prompts.find((x: { marker: string }) => x.marker === 'topic').split;
    expect(checkPack(p).status).toBe('invalid');
  });
  test('unknown marker, lowercase gloss, duplicate id, unknown set prompt', () => {
    const a = pack(); a.prompts[0].marker = 'shrug';
    const b = pack(); b.prompts[0].gloss = ['you', 'hungry'];
    const c = pack(); c.prompts[1].id = c.prompts[0].id;
    const d = pack(); d.sets[0].prompts.push('nope');
    for (const x of [a, b, c, d]) expect(checkPack(x).status).toBe('invalid');
  });
  test('not even an object', () => {
    expect(checkPack('hello').status).toBe('invalid');
  });
});
