// Content pack loader and validator (PLAN F8). Runs in the main process
// (Node) — Ajv compiles validators with `new Function`, which the renderer's
// Content-Security-Policy rightly forbids.
//
// A pack is:
//   'reviewed'   — valid, has a reviewer, every prompt marked reviewed;
//   'unreviewed' — valid but not (fully) reviewed: refused, unless the
//                  developer flag --dev-unreviewed is set, in which case it
//                  loads with a visible UNREVIEWED banner;
//   'invalid'    — fails the schema or the semantic checks: never loads.

import Ajv from 'ajv';
import schema from './schema.json';

export type MarkerType = 'yn' | 'wh' | 'neg' | 'aff' | 'topic' | 'cond';

export interface PackPrompt {
  id: string;
  marker: MarkerType;
  meaning: string;
  gloss: string[];
  span: [number, number];
  split?: number;
  windowS?: number;
  notes?: string;
  sources?: string[];
  reviewed?: boolean;
}

export interface Pack {
  packId: string;
  language: string;
  languageName: string;
  version: string;
  reviewer?: { name: string; role: string; date: string; credit?: string };
  notice?: string;
  sources: { id: string; title: string; url?: string }[];
  sets: { id: string; title: string; description?: string; prompts: string[] }[];
  prompts: PackPrompt[];
}

export type PackStatus = 'reviewed' | 'unreviewed' | 'invalid';

export interface PackCheck {
  status: PackStatus;
  errors: string[];
  pack: Pack | null;
  /** Prompts not marked reviewed (shown to the reviewer). */
  unreviewedPrompts: string[];
}

const ajv = new Ajv({ allErrors: true });
const validateSchema = ajv.compile(schema);

export function checkPack(data: unknown): PackCheck {
  if (!validateSchema(data)) {
    const errors = (validateSchema.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
    return { status: 'invalid', errors, pack: null, unreviewedPrompts: [] };
  }
  const pack = data as unknown as Pack;
  const errors: string[] = [];
  const ids = new Set<string>();
  const sourceIds = new Set(pack.sources.map((s) => s.id));
  for (const p of pack.prompts) {
    if (ids.has(p.id)) errors.push(`prompt ${p.id}: duplicate id`);
    ids.add(p.id);
    const [a, b] = p.span;
    if (a > b || b >= p.gloss.length) errors.push(`prompt ${p.id}: span [${a}, ${b}] is outside the ${p.gloss.length} gloss tokens`);
    if (p.marker === 'topic' || p.marker === 'cond') {
      if (p.split === undefined) errors.push(`prompt ${p.id}: ${p.marker} prompts need "split" (first sign of the second part)`);
      else if (p.split <= b || p.split >= p.gloss.length) errors.push(`prompt ${p.id}: split must come after the marked part and before the end`);
    } else if (p.split !== undefined) errors.push(`prompt ${p.id}: "split" is only for topic and conditional prompts`);
    for (const s of p.sources ?? []) if (!sourceIds.has(s)) errors.push(`prompt ${p.id}: unknown source "${s}"`);
  }
  for (const set of pack.sets) {
    for (const id of set.prompts) if (!ids.has(id)) errors.push(`set ${set.id}: unknown prompt "${id}"`);
  }
  if (errors.length) return { status: 'invalid', errors, pack: null, unreviewedPrompts: [] };
  const unreviewedPrompts = pack.prompts.filter((p) => p.reviewed !== true).map((p) => p.id);
  const status: PackStatus = pack.reviewer && unreviewedPrompts.length === 0 ? 'reviewed' : 'unreviewed';
  if (status === 'unreviewed') {
    if (!pack.reviewer) errors.push('No reviewer recorded: a Deaf signer or qualified teacher must review this pack before it is presented as correct.');
    if (unreviewedPrompts.length) errors.push(`${unreviewedPrompts.length} prompt(s) not yet marked reviewed.`);
  }
  return { status, errors, pack, unreviewedPrompts };
}

/** Whether a pack may be loaded for practice. */
export function loadable(c: PackCheck, devUnreviewed: boolean): boolean {
  return c.status === 'reviewed' || (c.status === 'unreviewed' && devUnreviewed);
}
