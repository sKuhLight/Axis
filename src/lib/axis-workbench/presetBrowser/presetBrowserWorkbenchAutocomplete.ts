// Advanced-query autocomplete engine for the docked Preset Browser (V13e).
//
// Ported from src/lib/PresetBrowser.svelte (`suggest`, `sgBlock`, `sgParam`, `sgValue`, `sgList`, `mk`,
// `acceptAc`). Pure logic: given the query text + caret position + the derived filter specs + the tag
// list, it produces the caret-aware suggestion list (block/token → param → value, plus `tag:` values),
// and `applyAcceptance` computes the new text + caret after inserting a chosen item. The Svelte panel
// only owns the DOM input + keyboard wiring; all context detection lives here so it is unit tested.

import { splitTop } from './presetBrowserWorkbenchQuery';
import {
  filterableSlugs,
  specFor,
  usableSpecs,
  type AxisPbFilterSpec,
  type SpecLibEntry
} from './presetBrowserWorkbenchSpecs';
import { axisPbCatColor, axisPbCatLabel } from './presetBrowserWorkbenchRowChips';

export type AxisPbAcKind = 'value' | 'close' | 'done';

export interface AxisPbAcItem {
  label: string;
  /** Text spliced in over the typed fragment. */
  insert: string;
  /** How many chars of the current fragment the insert replaces. */
  fragLen: number;
  hint: string;
  color: string;
  /** Filled square (block/tag/enum value) vs outline circle (param/snippet) — mirrors the design dot. */
  dot: boolean;
  kind?: AxisPbAcKind;
}

export interface AxisPbAcResult {
  items: AxisPbAcItem[];
  /** Context caption shown above the list (e.g. "value · GAIN", "Amp parameter"). */
  label: string;
}

// Snippet tokens offered in block/token context (verbatim from monolith `sgBlock`).
const SNIPPETS: [string, string][] = [
  ['tag:', 'filter by tag'],
  ['name:', 'name contains'],
  ['scenes>', 'scene count'],
  ['cpu<', 'est. CPU load']
];

const qv = (v: string) => (/[\s,()]/.test(v) ? `"${v}"` : v);
const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function mk(label: string, insert: string, fragLen: number, hint = '', color = '#6e6e78', dot = true): AxisPbAcItem {
  return { label, insert, fragLen, hint, color, dot };
}

// Resolve a token to a filterable slug given the current library-derived slug set.
function slugId(slugs: string[], tok: string): string | null {
  const t = (tok || '').trim().toLowerCase();
  return slugs.includes(t) ? t : null;
}

export interface AutocompleteContext {
  slugs: string[];
  specs: Record<string, Map<string, AxisPbFilterSpec>>;
  tags: string[];
}

// Build the autocomplete context from library data — call once per render, pass to `suggest`.
export function buildAutocompleteContext(entries: SpecLibEntry[], specs: Record<string, Map<string, AxisPbFilterSpec>>, tags: string[]): AutocompleteContext {
  return { slugs: filterableSlugs(entries), specs, tags };
}

function sgBlock(ctx: AutocompleteContext, frag: string): AxisPbAcItem[] {
  const f = frag.toLowerCase();
  const out: AxisPbAcItem[] = [];
  for (const id of ctx.slugs) {
    const lbl = id.toUpperCase();
    if (lbl.toLowerCase().includes(f) || axisPbCatLabel(id).toLowerCase().includes(f)) {
      out.push(mk(lbl, lbl + '(', frag.length, 'block · ' + axisPbCatLabel(id), axisPbCatColor(id)));
    }
  }
  for (const [tok, hint] of SNIPPETS) {
    if (tok.toLowerCase().startsWith(f) || f === '') out.push(mk(tok, tok, frag.length, hint, '#56565e', false));
  }
  return out;
}

function sgParam(ctx: AutocompleteContext, id: string, frag: string): AxisPbAcItem[] {
  const f = frag.toLowerCase();
  return usableSpecs(ctx.specs, id)
    .filter((s) => s.label.toLowerCase().includes(f))
    .map((s) => {
      const hint = s.kind === 'enum' ? 'type' : isFinite(s.min) ? `${fmtNum(s.min)}–${fmtNum(s.max)}` : 'num';
      return mk(s.label, s.label + (s.kind === 'num' ? '>' : '='), frag.length, hint, '#7a7a84', false);
    });
}

function sgValue(ctx: AutocompleteContext, id: string, pname: string, frag: string): AxisPbAcItem[] {
  const spec = specFor(ctx.specs, id, pname);
  if (!spec) return [];
  const f = frag.trim().replace(/^"+/, '').replace(/"+$/, '').toLowerCase();
  const asValue = (it: AxisPbAcItem): AxisPbAcItem => ({ ...it, kind: 'value' });
  if (spec.kind === 'enum') {
    return [...spec.enums]
      .filter((v) => v.toLowerCase().includes(f))
      .slice(0, 40)
      .map((v) => asValue(mk(v, qv(v), frag.length, '', axisPbCatColor(id))));
  }
  if (!isFinite(spec.min)) return [];
  const lo = spec.min;
  const hi = spec.max;
  const cand = [lo, (lo + hi) / 4 + lo / 2, (lo + hi) / 2, lo / 2 + (3 * hi) / 4, hi].map((x) => Math.round(x * 10) / 10);
  return [...new Set(cand)].map((v) => asValue(mk(String(v), String(v), frag.trim().length, 'value', '#7a7a84', false)));
}

function sgList(arr: string[], frag: string, kind: string): AxisPbAcItem[] {
  const f = (frag || '').toLowerCase();
  return arr
    .filter((v) => v.toLowerCase().includes(f))
    .slice(0, 40)
    .map((v) => mk(v, qv(v), (frag || '').length, kind, '#6e6e78', false));
}

// Caret-aware suggestion (verbatim from monolith `suggest`).
export function suggest(ctx: AutocompleteContext, text: string, caret: number): AxisPbAcResult {
  const segs = splitTop(text, '+');
  let seg = segs[segs.length - 1];
  for (const s of segs) if (caret >= s.start && caret <= s.end) { seg = s; break; }
  const local = text.slice(seg.start, caret);
  const opens = (local.match(/\(/g) || []).length;
  const closes = (local.match(/\)/g) || []).length;
  if (opens > closes) {
    const pi = local.indexOf('(');
    const id = slugId(ctx.slugs, local.slice(0, pi)) ?? '';
    const after = local.slice(pi + 1);
    const parts = splitTop(after, ',');
    const frag = parts[parts.length - 1].text;
    const pm = frag.match(/^\s*([A-Za-z][\w ]*?)\s*(>=|<=|!=|=|>|<)\s*(.*)$/);
    if (pm) return { items: sgValue(ctx, id, pm[1].trim(), pm[3]), label: 'value · ' + pm[1].trim() };
    const pf = (frag.match(/[\w ]*$/) || [''])[0].trimStart();
    const params = sgParam(ctx, id, pf);
    const close: AxisPbAcItem = {
      label: `) — close ${axisPbCatLabel(id)} · add block`,
      insert: ')',
      fragLen: pf.length,
      hint: 'or pick a param',
      color: axisPbCatColor(id),
      dot: false,
      kind: 'close'
    };
    const hasParams = parts.length > 1; // after a comma → ≥1 param already
    return { items: hasParams ? [close, ...params] : [...params, close], label: axisPbCatLabel(id) + ' parameter' };
  }
  let m: RegExpMatchArray | null;
  if ((m = local.match(/tag:\s*"?([\w .-]*)$/i))) return { items: sgList(ctx.tags, m[1], 'tag'), label: 'tag' };
  const tf = (local.match(/[\w]*$/) || [''])[0];
  const blocks = sgBlock(ctx, tf);
  if (seg.start > 0) {
    return {
      items: [{ label: '✓ done', insert: '', fragLen: tf.length, hint: 'finish filter', color: '#33c46b', dot: false, kind: 'done' }, ...blocks],
      label: 'block / token'
    };
  }
  return { items: blocks, label: 'block / token' };
}

export interface AcceptResult {
  text: string;
  caret: number;
  closed: boolean;
}

// Compute the text + caret after accepting an item (verbatim from monolith `acceptAc` splice logic).
// `closed` is true when a 'done' item was accepted (caller just closes the dropdown, no text change).
export function applyAcceptance(item: AxisPbAcItem, text: string, caret: number): AcceptResult {
  if (item.kind === 'done') return { text, caret, closed: true };
  if (item.kind === 'close') {
    const pre = text.slice(0, caret - item.fragLen).replace(/[\s,]+$/, '');
    const ins = ') + ';
    return { text: pre + ins + text.slice(caret), caret: pre.length + ins.length, closed: false };
  }
  const start = Math.max(0, caret - item.fragLen);
  const ins = item.insert + (item.kind === 'value' ? ', ' : ''); // value → auto-advance to the next param
  return { text: text.slice(0, start) + ins + text.slice(caret), caret: start + ins.length, closed: false };
}

// Tidy dangling separators when leaving the box (verbatim from monolith `onQueryBlur`).
export function tidyQuery(text: string): string {
  return text.replace(/\s*\+\s*$/, '').replace(/,\s*$/, '');
}
