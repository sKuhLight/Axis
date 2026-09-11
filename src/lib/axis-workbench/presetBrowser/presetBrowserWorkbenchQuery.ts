import type { AxisPresetBrowserEntrySummary } from './presetBrowserWorkbenchData';

// Preset Browser query language — ported from src/lib/PresetBrowser.svelte (§2.3 of
// docs/workbench-dc-parity/06-preset-browser.md). It operates on the entry summaries the workbench
// parts carry (name, tags, model list, block categories, scene count, CPU estimate) AND, when the
// host feeds decoded blocks in (library.paramsOf via preparePresetBrowserIndex), on full per-block
// parameter conditions — `matchParamCond` is the same deep matcher the monolith uses, ported here
// verbatim. With no hydrated params a non-TYPE condition EXCLUDES the entry (mirroring the
// monolith's `matchParamCond` fall-through); a TYPE-only condition still resolves against the
// summary model list (the monolith's `typeOnly` fallback).
//
// This module stays pure and dependency-free — it runs in the `node` vitest project, which never
// compiles rune stores. Anything store-shaped (real-name lookup, decoded blocks) is injected.

// Canonical block-slug vocabulary the parser accepts. MUST stay in step with the category map in
// presetBrowserWorkbenchRowChips.ts (`CAT`) — that map's keys are the source of truth for every real
// block slug in this app; every key there must appear here too, or the parser silently drops
// conditions the autocomplete (which suggests off the library's own slugs, presetBrowserWorkbenchSpecs.ts
// `filterableSlugs`) just offered. Not imported directly (rowChips already imports `estimateCpu` from
// this module, so importing back would be circular) — keep this list a literal, mirrored by hand.
export const AXIS_PB_FILTERABLE_BLOCKS = [
  'input',
  'output',
  'amp',
  'cab',
  'drive',
  'comp',
  'geq',
  'peq',
  'chorus',
  'flanger',
  'phaser',
  'filter',
  'enhancer',
  'wah',
  'delay',
  'reverb',
  'pitch',
  'synth',
  'gate',
  'ringmod',
  'tremolo',
  'rotary',
  'volume',
  'formant',
  'multitap',
  'megatap'
] as const;

export type AxisPbBlockSlug = (typeof AXIS_PB_FILTERABLE_BLOCKS)[number];

// Seed saved filters for empty libraries (§3.3).
export const AXIS_PB_SEED_SAVED_FILTERS: { name: string; query: string }[] = [
  { name: 'Hendrix Tones', query: 'tag:Hendrix' },
  { name: 'All 5153 Rigs', query: 'AMP(TYPE=5153)' },
  { name: 'Big Ambient Verbs', query: 'REVERB(TYPE=Large Hall, MIX>30)' },
  { name: 'High-Gain Leads', query: 'AMP(GAIN>7)  +  tag:Lead' },
  { name: 'Low-CPU Live Set', query: 'cpu<55  +  tag:Live' },
  { name: 'TS-Boosted Blues', query: 'DRIVE(TYPE=TS808)  +  tag:Blues' }
];

export interface AxisPbParamCond {
  name: string;
  op: string;
  val: string;
}

export type AxisPbCond =
  | { kind: 'block'; block: AxisPbBlockSlug; params: AxisPbParamCond[] }
  | { kind: 'tag'; val: string }
  | { kind: 'name'; val: string }
  | { kind: 'author'; val: string }
  | { kind: 'scenes'; op: string; val: string }
  | { kind: 'cpu'; op: string; val: string };

const OP = '(>=|<=|!=|=|>|<)';

// paren-aware split on a top-level char (verbatim from monolith `splitOn`).
export function splitTop(str: string, ch: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ch && depth === 0) {
      out.push({ text: str.slice(start, i), start, end: i });
      start = i + 1;
    }
  }
  out.push({ text: str.slice(start), start, end: str.length });
  return out;
}

function blockSlug(tok: string): AxisPbBlockSlug | null {
  const t = (tok || '').trim().toLowerCase();
  return (AXIS_PB_FILTERABLE_BLOCKS as readonly string[]).includes(t) ? (t as AxisPbBlockSlug) : null;
}

const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, '$1');

export function parseParamCond(s: string): AxisPbParamCond | null {
  const m = s.match(new RegExp(`^\\s*([A-Za-z][\\w ]*?)\\s*${OP}\\s*(.+?)\\s*$`));
  return m ? { name: m[1].trim(), op: m[2], val: unquote(m[3]) } : null;
}

export function parseTerm(t: string): AxisPbCond | null {
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^tag:\s*"?([^"]*)"?$/i))) {
    const v = m[1].trim();
    return v ? { kind: 'tag', val: v } : null;
  }
  if ((m = t.match(/^name:\s*"?([^"]*)"?$/i))) {
    const v = m[1].trim();
    return v ? { kind: 'name', val: v } : null;
  }
  if ((m = t.match(/^author:\s*"?([^"]*)"?$/i))) {
    const v = m[1].trim();
    return v ? { kind: 'author', val: v } : null;
  }
  if ((m = t.match(new RegExp(`^scenes\\s*${OP}\\s*(\\d+)$`, 'i')))) return { kind: 'scenes', op: m[1], val: m[2] };
  if ((m = t.match(new RegExp(`^cpu\\s*${OP}\\s*(\\d+)$`, 'i')))) return { kind: 'cpu', op: m[1], val: m[2] };

  const pi = t.indexOf('(');
  if (pi >= 0) {
    const id = blockSlug(t.slice(0, pi));
    if (!id) return null;
    let inner = t.slice(pi + 1);
    if (inner.endsWith(')')) inner = inner.slice(0, -1);
    const params = splitTop(inner, ',')
      .map((s) => parseParamCond(s.text))
      .filter(Boolean) as AxisPbParamCond[];
    return { kind: 'block', block: id, params };
  }
  const id = blockSlug(t);
  return id ? { kind: 'block', block: id, params: [] } : null;
}

export function parseQuery(text: string): AxisPbCond[] {
  return splitTop(text, '+')
    .map((s) => parseTerm(s.text.trim()))
    .filter(Boolean) as AxisPbCond[];
}

const qv = (v: string) => (/[\s,()]/.test(v) ? `"${v}"` : v);

export function condToText(c: AxisPbCond): string {
  if (c.kind === 'block') {
    const tok = c.block.toUpperCase();
    return c.params.length ? `${tok}(${c.params.map((p) => p.name + p.op + p.val).join(', ')})` : tok;
  }
  if (c.kind === 'tag') return 'tag:' + qv(c.val);
  if (c.kind === 'name') return 'name:' + qv(c.val);
  if (c.kind === 'author') return 'author:' + qv(c.val);
  if (c.kind === 'scenes') return 'scenes' + c.op + c.val;
  if (c.kind === 'cpu') return 'cpu' + c.op + c.val;
  return '';
}

export function condsToQuery(conds: AxisPbCond[]): string {
  return conds.map(condToText).filter(Boolean).join('  +  ');
}

// Two condition lists are equal when they serialize identically (order-insensitive), used for the
// saved-filter "active" highlight (§3.3).
export function condsEqual(a: AxisPbCond[], b: AxisPbCond[]): boolean {
  const norm = (list: AxisPbCond[]) =>
    list
      .map(condToText)
      .filter(Boolean)
      .sort()
      .join('\u0000');
  return norm(a) === norm(b);
}

// ===================== matching =====================

export const cmp = (a: number, op: string, b: number): boolean =>
  op === '>'
    ? a > b
    : op === '<'
      ? a < b
      : op === '>='
        ? a >= b
        : op === '<='
          ? a <= b
          : op === '!='
            ? Math.abs(a - b) > 1e-9
            : Math.abs(a - b) < 1e-9;

// numeric literal match with range-literal (`a-b`, inclusive, either order) support, §2.3.
export function matchNumeric(value: number, op: string, raw: string): boolean {
  const range = raw.match(/^\s*(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)\s*$/);
  if (range) {
    const a = +range[1];
    const b = +range[2];
    return value >= Math.min(a, b) && value <= Math.max(a, b);
  }
  const t = parseFloat(raw);
  if (isNaN(t)) return false;
  return cmp(value, op, t);
}

// Minimal structural shape of one decoded param the deep matcher needs. `DetailParam`
// (presetBrowserWorkbenchParams.ts) and `types.ts` `DecodedParam` are both structurally assignable.
export interface AxisPbDecodedParam {
  label: string;
  name: string;
  kind?: string;
  value: number | null;
  enumLabel?: string | null;
}

// Minimal structural shape of one decoded block. `DetailBlock` stays structurally assignable.
export interface AxisPbDecodedBlock {
  slug: string;
  params: AxisPbDecodedParam[];
}

// Single param-cond match against one decoded block's param set (verbatim from monolith
// `matchParamCond`, PresetBrowser.svelte). Deep match — needs hydrated params; a condition naming a
// param that isn't decoded (including an unhydrated block) falls through to `false`, which is what
// makes a non-TYPE condition EXCLUDE an unhydrated entry rather than silently include it.
export function matchParamCond(b: AxisPbDecodedBlock, pc: AxisPbParamCond): boolean {
  const isType = /^type$/i.test(pc.name);
  for (const p of b.params) {
    const labelHit = p.label.toLowerCase() === pc.name.toLowerCase() || (isType && p.name.toLowerCase().endsWith('_type'));
    if (!labelHit) continue;
    if (p.kind === 'enum' || p.enumLabel != null) {
      const sv = (p.enumLabel ?? '').toLowerCase();
      const q = pc.val.toLowerCase();
      return pc.op === '!=' ? !sv.includes(q) : sv.includes(q);
    }
    if (p.value == null) continue;
    const range = pc.val.match(/^\s*(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)\s*$/);
    if (range) {
      const a = +range[1];
      const bb = +range[2];
      return p.value >= Math.min(a, bb) && p.value <= Math.max(a, bb);
    }
    const t = parseFloat(pc.val);
    if (isNaN(t)) return false;
    // `=` is tolerant to display rounding: compare at the query value's decimal precision (else a
    // dragged "Threshold=-37" never matches a stored -36.98).
    if (pc.op === '=') {
      const dec = (pc.val.split('.')[1] ?? '').length;
      const f = Math.pow(10, Math.min(dec, 2));
      return Math.round(p.value * f) === Math.round(t * f);
    }
    return cmp(p.value, pc.op, t);
  }
  return false;
}

export interface AxisPbMatchEntry {
  name: string;
  tags: string[];
  author?: string | null;
  sceneCount: number;
  cpu: number;
  models: Partial<Record<string, string[]>>;
  blockSlugs: string[];
  /** Decoded blocks when the host hydrated params (fed in by `matchEntryFromSummary`), else
   *  type-only blocks (slug + empty params) synthesized from the summary — mirrors the monolith's
   *  `blocksOf` fallback so TYPE conditions keep working with no hydration. Stored by reference. */
  blocks: AxisPbDecodedBlock[];
}

// Real-world device name lookup (manufacturer + the unit a model is based on), injected rather than
// imported so this module stays a pure, dependency-free `.ts` unit (it's exercised by plain node-project
// vitest, which never compiles the `deviceRealNames.svelte.ts` rune store). The live implementation is
// `deviceRealNames.realNameFor` (src/lib/deviceRealNames.svelte.ts), wired in by the panel component.
export type AxisPbRealNameLookup = (slug: string, modelName: string) => string;

// Adapt an entry summary to the matchable shape. `decodedBlocks` (library.paramsOf output) enables
// full per-parameter matching; omitted/empty, block conditions synthesize type-only blocks from the
// summary and non-TYPE param conditions exclude the entry, mirroring the monolith.
export function matchEntryFromSummary(
  entry: AxisPresetBrowserEntrySummary,
  decodedBlocks?: AxisPbDecodedBlock[] | null
): AxisPbMatchEntry {
  // Generic roster instance labels ("Amp 1") are a fallback only — the decoded `entry.models`
  // (real amp/block type names, e.g. "5153 100W Blue") is the source of truth per slug when present.
  const models: Record<string, string[]> = {};
  for (const block of entry.blocks) {
    const slug = (block.slug ?? '').toLowerCase();
    if (!slug) continue;
    const name = block.name ?? '';
    (models[slug] ??= []).push(name);
  }
  for (const [slug, names] of Object.entries(entry.models)) {
    if (names.length) models[slug] = names;
  }
  const blocks: AxisPbDecodedBlock[] =
    decodedBlocks && decodedBlocks.length
      ? decodedBlocks
      : entry.blocks
          .filter((b) => b.slug)
          .map((b) => ({ slug: (b.slug ?? '').toLowerCase(), params: [] as AxisPbDecodedParam[] }));
  return {
    name: entry.name,
    tags: entry.tags,
    author: null,
    sceneCount: entry.sceneCount,
    cpu: estimateCpu(entry),
    models,
    blockSlugs: entry.blocks.map((b) => (b.slug ?? '').toLowerCase()).filter(Boolean),
    blocks
  };
}

// Per-block relative DSP weight (verbatim from the monolith's decoded CPU cost table,
// PresetBrowser.svelte `CPU_WEIGHT`/`CPU_BASE`): amp/cab/reverb/pitch dominate, EQ/drive/utility are
// cheap, summed over placed blocks + a fixed overhead, clamped 20..99. A complexity indicator, not
// the device's live meter (which isn't stored in a preset), hence the "~" prefix where it renders.
const CPU_BASE = 8;
const CPU_WEIGHT: Record<string, number> = {
  amp: 28, cab: 12, reverb: 12, pitch: 14, multitap: 10, megatap: 10, synth: 9, delay: 8,
  flanger: 5, phaser: 5, chorus: 5, rotary: 5, formant: 5, tremolo: 4, filter: 4, drive: 4,
  enhancer: 3, comp: 3, wah: 3, ringmod: 3, geq: 2, peq: 2, gate: 2, volume: 1, input: 0, output: 0
};

export function estimateCpu(entry: { blocks: { slug?: string | null }[] }): number {
  let sum = CPU_BASE;
  for (const b of entry.blocks) sum += CPU_WEIGHT[b.slug ?? ''] ?? 4;
  return Math.max(20, Math.min(99, Math.round(sum)));
}

function matchBlockCond(entry: AxisPbMatchEntry, cond: Extract<AxisPbCond, { kind: 'block' }>): boolean {
  // Mirrors the monolith's `matchCond` block branch (PresetBrowser.svelte).
  const bs = entry.blocks.filter((b) => b.slug === cond.block);
  if (!bs.length) return false;
  if (!cond.params.length) return true;
  // TYPE-only conditions resolve against the summary model list even without hydrated params.
  const typeOnly = cond.params.every((pc) => /^type$/i.test(pc.name));
  if (typeOnly && bs.every((b) => !b.params.length)) {
    const models = (entry.models[cond.block] ?? []).map((m) => m.toLowerCase());
    return cond.params.every((pc) => {
      const hit = models.some((m) => m.includes(pc.val.toLowerCase()));
      return pc.op === '!=' ? !hit : hit;
    });
  }
  // Otherwise: some instance of this block satisfies every param cond (deep match; a non-TYPE cond
  // against an unhydrated block falls through to false in matchParamCond and excludes the entry).
  return bs.some((b) => cond.params.every((pc) => matchParamCond(b, pc)));
}

export function matchCond(entry: AxisPbMatchEntry, cond: AxisPbCond): boolean {
  switch (cond.kind) {
    case 'tag':
      return entry.tags.some((t) => t.toLowerCase().includes(cond.val.toLowerCase()));
    case 'name':
      return entry.name.toLowerCase().includes(cond.val.toLowerCase());
    case 'author':
      return (entry.author ?? '').toLowerCase().includes(cond.val.toLowerCase());
    case 'scenes':
      return matchNumeric(entry.sceneCount, cond.op, cond.val);
    case 'cpu':
      return matchNumeric(entry.cpu, cond.op, cond.val);
    case 'block':
      return matchBlockCond(entry, cond);
  }
}

// The free-text haystack for one matchable entry — name + tags + author + models (each followed by its
// real-world gear name) + block slugs, lowercased. Factored out of `matchSimple` so a host can build it
// ONCE per entry (idle) and reuse it across keystrokes instead of rebuilding it per keystroke (rebuilding
// name+blocks+models for 500 presets each keystroke was the typing lag, same as the monolith).
export function entryHaystack(entry: AxisPbMatchEntry, realNameFor?: AxisPbRealNameLookup): string {
  // Each model name is followed by its real-world gear name (manufacturer + basedOn, when known) so
  // "hiwatt" matches an entry built on the internal "HIPOWER" model.
  const modelHay = Object.entries(entry.models)
    .flatMap(([slug, names]) => (names ?? []).flatMap((n) => [n, realNameFor?.(slug, n) ?? '']))
    .join(' ');
  return [
    entry.name,
    entry.tags.join(' '),
    entry.author ?? '',
    modelHay,
    entry.blockSlugs.join(' ')
  ]
    .join(' ')
    .toLowerCase();
}

// Free-text remainder of the unified query field (everything outside backtick spans, §2.3):
// whitespace tokens, all must appear in the haystack. `realNameFor` is optional — omitted, matching
// stays purely on decoded model names, same as before this lookup existed.
export function matchSimple(entry: AxisPbMatchEntry, simpleQ: string, realNameFor?: AxisPbRealNameLookup): boolean {
  const toks = simpleQ.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  const hay = entryHaystack(entry, realNameFor);
  return toks.every((t) => hay.includes(t));
}

// Full predicate over conditions + simple text.
export function matchPreset(entry: AxisPbMatchEntry, conds: AxisPbCond[], simpleQ: string, realNameFor?: AxisPbRealNameLookup): boolean {
  for (const c of conds) if (!matchCond(entry, c)) return false;
  return matchSimple(entry, simpleQ, realNameFor);
}

// Predicate over conditions + a PRE-BUILT haystack (see entryHaystack): the per-keystroke fast path that
// skips rebuilding the matchable shape + haystack for every entry. `match` must be the `matchEntryFromSummary`
// output for the same entry and `hay` its `entryHaystack` string.
export function matchPrepared(match: AxisPbMatchEntry, hay: string, conds: AxisPbCond[], simpleQ: string): boolean {
  for (const c of conds) if (!matchCond(match, c)) return false;
  const toks = simpleQ.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  return toks.every((t) => hay.includes(t));
}

// ===================== unified query (backtick-scoped filters) =====================

export interface AxisPbParsedQuery {
  conds: AxisPbCond[];
  free: string;
}

// Splits a single query field into structured conditions (parsed only from inside `` `...` ``
// spans) and free text (everything else). Text outside backticks is deliberately never attempted
// as query syntax — the backticks are the only signal that a span should parse, so a bare
// `tag:Lead` typed without them is plain fuzzy text, not a filter. This replaces the old
// Simple/Advanced split: one field, one behavior, no mode to toggle.
export function parseUnifiedQuery(text: string): AxisPbParsedQuery {
  const conds: AxisPbCond[] = [];
  const free = text
    .replace(/`([^`]*)`/g, (_, inner: string) => {
      conds.push(...parseQuery(inner));
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { conds, free };
}

// Re-serializes conditions + free text back into one field: free text first, then a single
// canonical backtick block holding every condition. Builder-driven edits (picker, drag, tag
// toggle) always go through this, so any backtick spans the user typed by hand collapse into one
// authoritative block on the next such edit — conditions never live in more than one place at once.
export function serializeUnifiedQuery(conds: AxisPbCond[], free: string): string {
  const structured = condsToQuery(conds);
  if (!structured) return free;
  return free ? `${free} \`${structured}\`` : `\`${structured}\``;
}
