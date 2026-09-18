// "Narrow" refinement model for the docked Preset Browser.
//
// The query language is a precise but hidden vocabulary: to narrow by amp type you must know to type
// `AMP(TYPE=…)`. This module derives, from the entries in scope, the clickable ways to narrow the
// current search — the distinct amp/drive/cab/… types, tags, and scene buckets, each with a live
// count.
//
// Clicking a value is purely ADDITIVE: it appends the exact clause the typed language would produce
// (`AMP(TYPE=5153 100W Blue)`, `tag:Clean`, `scenes>=5`) to the query. Clicking it again removes that
// same clause. Nothing is hidden: the search field, the FILTERS chips and a saved search all see the
// real query, and the pre-click query is still there because Narrow never rewrote it.
//
// The one non-additive move is within a single-value group (a preset has one amp type and one scene
// count): selecting a different value first drops the group's own earlier clause, so you switch
// rather than pile up impossible ANDs. Ownership is judged from the clause text itself — a clause is
// "Narrow's" when it is exactly one of the group's candidate clauses — which is why no restore state
// is needed and why a hand-typed `AMP(TYPE=5153)` is never touched.
//
// Pure and dependency-free (only the query matcher + the category label table), so it runs in the
// node vitest project alongside the rest of the query engine.

import { axisPbCatLabel } from './presetBrowserWorkbenchRowChips';
import {
  condToText,
  matchConditions,
  matchCond,
  type AxisPbBlockSlug,
  type AxisPbCond,
  type AxisPbMatchEntry
} from './presetBrowserWorkbenchQuery';

export const AXIS_PB_NARROW_BLOCK_FAMILIES = [
  'amp',
  'drive',
  'cab',
  'reverb',
  'delay',
  'comp',
  'chorus',
  'phaser'
] as const;

export const AXIS_PB_NARROW_SCENES = ['1–2', '3–4', '5+'] as const;
export const AXIS_PB_NARROW_MAX_VALUES = 8;

export type AxisPbNarrowKind = 'block' | 'tag' | 'scenes';

export interface AxisPbNarrowDim {
  key: string;
  kind: AxisPbNarrowKind;
}

export interface AxisPbNarrowEntry {
  match: AxisPbMatchEntry;
  hay: string;
}

export interface AxisPbNarrowValue {
  value: string;
  count: number;
  selected: boolean;
}

export interface AxisPbNarrowGroup extends AxisPbNarrowDim {
  label: string;
  values: AxisPbNarrowValue[];
}

const isTypeParam = (name: string): boolean => /^type$/i.test(name);
const sameVal = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

// ── scene bucket <-> condition translation ───────────────────────────────────────────────────────

export function sceneCondsFor(bucket: string): AxisPbCond[] {
  if (bucket === '1–2') return [{ kind: 'scenes', op: '<', val: '3' }];
  if (bucket === '3–4') return [
    { kind: 'scenes', op: '>=', val: '3' },
    { kind: 'scenes', op: '<', val: '5' }
  ];
  return [{ kind: 'scenes', op: '>=', val: '5' }];
}

// The condition(s) a given value stands for, in the real query language.
export function valueConds(dim: AxisPbNarrowDim, value: string): AxisPbCond[] {
  if (dim.kind === 'tag') return [{ kind: 'tag', val: value }];
  if (dim.kind === 'scenes') return sceneCondsFor(value);
  return [{ kind: 'block', block: dim.key as AxisPbBlockSlug, params: [{ name: 'Type', op: '=', val: value }] }];
}

// ── ownership: is a condition exactly one of this group's own clauses? ────────────────────────────

// Narrow only ever emits single-purpose clauses — a type-only block clause, a tag clause, or a scene
// bucket clause. Anything richer (a hand-typed `AMP(GAIN>7, TYPE=…)`) is never matched here, so it is
// always left alone.
function isOwnedByValue(c: AxisPbCond, dim: AxisPbNarrowDim, value: string): boolean {
  if (dim.kind === 'tag') return c.kind === 'tag' && sameVal(c.val, value);
  if (dim.kind !== 'block') return false;
  return (
    c.kind === 'block' &&
    c.block === dim.key &&
    c.params.length === 1 &&
    isTypeParam(c.params[0].name) &&
    sameVal(c.params[0].val, value)
  );
}

function isOwnedScenes(c: AxisPbCond, values: string[]): boolean {
  return c.kind === 'scenes' && values.some((v) => sceneCondsFor(v).some((w) => condToText(w) === condToText(c)));
}

const candidateValues = (group: AxisPbNarrowGroup): string[] => group.values.map((v) => v.value);

// ── selection / activity ─────────────────────────────────────────────────────────────────────────

export function isNarrowValueSelected(conds: AxisPbCond[], dim: AxisPbNarrowDim, value: string): boolean {
  if (dim.kind === 'tag') return conds.some((c) => c.kind === 'tag' && sameVal(c.val, value));
  if (dim.kind === 'scenes') {
    const want = sceneCondsFor(value);
    return want.length > 0 && want.every((w) => conds.some((c) => condToText(c) === condToText(w)));
  }
  return conds.some((c) => isOwnedByValue(c, dim, value));
}

export function isNarrowGroupActive(conds: AxisPbCond[], dim: AxisPbNarrowDim): boolean {
  if (dim.kind === 'tag') return conds.some((c) => c.kind === 'tag');
  if (dim.kind === 'scenes') return conds.some((c) => c.kind === 'scenes');
  return conds.some((c) => c.kind === 'block' && c.block === dim.key);
}

// ── toggle / clear (mutate `conds` in place; `group.values` is the ownership vocabulary) ──────────

function dropOwned(conds: AxisPbCond[], group: AxisPbNarrowGroup): void {
  const values = candidateValues(group);
  for (let i = conds.length - 1; i >= 0; i--) {
    const c = conds[i];
    if (group.kind === 'scenes' ? isOwnedScenes(c, values) : values.some((v) => isOwnedByValue(c, group, v))) {
      conds.splice(i, 1);
    }
  }
}

// Click a value: append its clause, or remove that exact clause if it is already there. Before
// appending, the group's OTHER own clauses are dropped so a single-value group switches instead of
// stacking. Every other condition — including the one the user typed before clicking — is untouched.
export function toggleNarrowValue(conds: AxisPbCond[], group: AxisPbNarrowGroup, value: string): void {
  if (group.kind === 'tag') {
    const i = conds.findIndex((c) => c.kind === 'tag' && sameVal(c.val, value));
    if (i >= 0) conds.splice(i, 1);
    else conds.push({ kind: 'tag', val: value });
    return;
  }
  const wasSelected = isNarrowValueSelected(conds, group, value);
  dropOwned(conds, group);
  if (!wasSelected) conds.push(...valueConds(group, value));
}

// Clear a whole group (its × or the global Clear): remove the clauses Narrow added for it.
export function clearNarrowDim(conds: AxisPbCond[], group: AxisPbNarrowGroup): void {
  dropOwned(conds, group);
}

export function clearAllNarrow(conds: AxisPbCond[], groups: AxisPbNarrowGroup[]): void {
  for (const group of groups) clearNarrowDim(conds, group);
}

// ── value discovery + counting ───────────────────────────────────────────────────────────────────

function isGenericValue(value: string, label: string): boolean {
  return new RegExp(`^${label}\\s*\\d*$`, 'i').test(value.trim());
}

function distinctModels(matches: AxisPbMatchEntry[], slug: string, label: string): string[] {
  const seen = new Map<string, string>();
  for (const m of matches) {
    for (const name of m.models[slug] ?? []) {
      const v = name.trim();
      if (!v || isGenericValue(v, label)) continue;
      const k = v.toLowerCase();
      if (!seen.has(k)) seen.set(k, v);
    }
  }
  return [...seen.values()];
}

function distinctTags(matches: AxisPbMatchEntry[]): string[] {
  const seen = new Map<string, string>();
  for (const m of matches) {
    for (const t of m.tags) {
      const k = t.toLowerCase();
      if (!seen.has(k)) seen.set(k, t);
    }
  }
  return [...seen.values()];
}

function bucketHasMatches(matches: AxisPbMatchEntry[], bucket: string): boolean {
  const conds = sceneCondsFor(bucket);
  return matches.some((m) => conds.every((c) => matchCond(m, c)));
}

// Counts are measured against the whole query, exactly as typed. Clicking a value therefore narrows
// the OTHER lists too — after `AMP(TYPE=5153)` + a pick, the remaining values are the ones still
// present in the narrowed results, just as they would be if the extra clause had been typed by hand.
// Values with no matches drop out (unless they are the selected one).

function countFor(matches: AxisPbMatchEntry[], base: AxisPbCond[], dim: AxisPbNarrowDim, value: string): number {
  const val = valueConds(dim, value);
  let n = 0;
  for (const m of matches) {
    if (matchConditions(m, base) && val.every((c) => matchCond(m, c))) n++;
  }
  return n;
}

function buildGroup(
  matches: AxisPbMatchEntry[],
  conds: AxisPbCond[],
  dim: Pick<AxisPbNarrowGroup, 'key' | 'kind' | 'label'>,
  candidates: string[]
): AxisPbNarrowGroup | null {
  const values: AxisPbNarrowValue[] = [];
  for (const value of candidates) {
    const selected = isNarrowValueSelected(conds, dim, value);
    const count = countFor(matches, conds, dim, value);
    if (!selected && count === 0) continue;
    values.push({ value, count, selected });
  }
  if (!values.length) return null;
  values.sort((a, b) => Number(b.selected) - Number(a.selected) || b.count - a.count || a.value.localeCompare(b.value));
  const capped = values.length > AXIS_PB_NARROW_MAX_VALUES
    ? values.filter((v, i) => i < AXIS_PB_NARROW_MAX_VALUES || v.selected)
    : values;
  return { ...dim, values: capped };
}

// The full refinement model for the current search. `entries` is the matchable shape + haystack of
// the entries in scope (source/presence filtered, query NOT applied); `conds` + `simpleQuery` are
// the typed query (including any clauses Narrow already appended).
export function buildNarrowGroups(
  entries: AxisPbNarrowEntry[],
  conds: AxisPbCond[],
  simpleQuery: string
): AxisPbNarrowGroup[] {
  const tokens = simpleQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const scoped = tokens.length ? entries.filter((e) => tokens.every((t) => e.hay.includes(t))) : entries;
  const matches = scoped.map((e) => e.match);

  const groups: AxisPbNarrowGroup[] = [];
  for (const key of AXIS_PB_NARROW_BLOCK_FAMILIES) {
    const label = axisPbCatLabel(key);
    const candidates = distinctModels(matches, key, label);
    if (candidates.length < 2) continue;
    const group = buildGroup(matches, conds, { key, kind: 'block', label }, candidates);
    if (group) groups.push(group);
  }
  {
    const candidates = distinctTags(matches);
    if (candidates.length) {
      const group = buildGroup(matches, conds, { key: 'tag', kind: 'tag', label: 'Tags' }, candidates);
      if (group) groups.push(group);
    }
  }
  {
    const candidates = AXIS_PB_NARROW_SCENES.filter((bucket) => bucketHasMatches(matches, bucket)) as string[];
    if (candidates.length > 1) {
      const group = buildGroup(matches, conds, { key: 'scenes', kind: 'scenes', label: 'Scenes' }, candidates);
      if (group) groups.push(group);
    }
  }
  return groups;
}
