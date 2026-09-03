import type { AxisPresetBrowserEntrySummary } from './presetBrowserWorkbenchData';

// Preset Browser query language — ported from src/lib/PresetBrowser.svelte (§2.3 of
// docs/workbench-dc-parity/06-preset-browser.md). This is the pure, summary-level subset of the
// monolith grammar: it operates on the entry summaries the workbench parts already carry (name,
// tags, model list, block categories, scene count, CPU estimate). Deep per-parameter matching
// (matchParamCond over decoded blocks) needs hydrated params and stays in the monolith; block
// conditions here match on presence + TYPE against the summary model list, mirroring the monolith's
// `typeOnly` fallback path.

// Filterable block category ids (picker order, §2.3). Upper-cased tokens map back to these slugs.
export const AXIS_PB_FILTERABLE_BLOCKS = [
  'amp',
  'drive',
  'cab',
  'comp',
  'chorus',
  'flange',
  'phaser',
  'filter',
  'enhance',
  'delay',
  'reverb'
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

export interface AxisPbMatchEntry {
  name: string;
  tags: string[];
  author?: string | null;
  sceneCount: number;
  cpu: number;
  models: Partial<Record<string, string[]>>;
  blockSlugs: string[];
}

// Real-world device name lookup (manufacturer + the unit a model is based on), injected rather than
// imported so this module stays a pure, dependency-free `.ts` unit (it's exercised by plain node-project
// vitest, which never compiles the `deviceRealNames.svelte.ts` rune store). The live implementation is
// `deviceRealNames.realNameFor` (src/lib/deviceRealNames.svelte.ts), wired in by the panel component.
export type AxisPbRealNameLookup = (slug: string, modelName: string) => string;

// Adapt an entry summary to the matchable shape. `cpu` is an estimate (blockCount-derived) when the
// summary carries none.
export function matchEntryFromSummary(entry: AxisPresetBrowserEntrySummary): AxisPbMatchEntry {
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
  return {
    name: entry.name,
    tags: entry.tags,
    author: null,
    sceneCount: entry.sceneCount,
    cpu: estimateCpu(entry),
    models,
    blockSlugs: entry.blocks.map((b) => (b.slug ?? '').toLowerCase()).filter(Boolean)
  };
}

// Coarse CPU estimate for summary-only rows (each non-IO block ≈ 3.5%). The monolith uses the decoded
// CPU cost table; this keeps `cpu` conditions functional at the summary level.
export function estimateCpu(entry: AxisPresetBrowserEntrySummary): number {
  return Math.min(99, Math.round(entry.blockCount * 3.5));
}

function matchBlockCond(entry: AxisPbMatchEntry, cond: Extract<AxisPbCond, { kind: 'block' }>): boolean {
  if (!entry.blockSlugs.includes(cond.block)) return false;
  if (!cond.params.length) return true;
  const models = (entry.models[cond.block] ?? []).map((m) => m.toLowerCase());
  // Summary level only resolves TYPE-style params against the model list; other params are treated as
  // unconstrained (the monolith resolves them once params are hydrated).
  return cond.params.every((pc) => {
    if (!/^type$/i.test(pc.name)) return true;
    const q = pc.val.toLowerCase();
    const hit = models.some((m) => m.includes(q));
    return pc.op === '!=' ? !hit : hit;
  });
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

// Free-text remainder of the unified query field (everything outside backtick spans, §2.3):
// whitespace tokens, all must appear in the haystack. `realNameFor` is optional — omitted, matching
// stays purely on decoded model names, same as before this lookup existed.
export function matchSimple(entry: AxisPbMatchEntry, simpleQ: string, realNameFor?: AxisPbRealNameLookup): boolean {
  const toks = simpleQ.toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  // Each model name is followed by its real-world gear name (manufacturer + basedOn, when known) so
  // "hiwatt" matches an entry built on the internal "HIPOWER" model.
  const modelHay = Object.entries(entry.models)
    .flatMap(([slug, names]) => (names ?? []).flatMap((n) => [n, realNameFor?.(slug, n) ?? '']))
    .join(' ');
  const hay = [
    entry.name,
    entry.tags.join(' '),
    entry.author ?? '',
    modelHay,
    entry.blockSlugs.join(' ')
  ]
    .join(' ')
    .toLowerCase();
  return toks.every((t) => hay.includes(t));
}

// Full predicate over conditions + simple text.
export function matchPreset(entry: AxisPbMatchEntry, conds: AxisPbCond[], simpleQ: string, realNameFor?: AxisPbRealNameLookup): boolean {
  for (const c of conds) if (!matchCond(entry, c)) return false;
  return matchSimple(entry, simpleQ, realNameFor);
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
