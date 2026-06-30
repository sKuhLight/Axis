<script lang="ts">
  // Full Preset Browser — the advanced library surface. A typed query language
  //   AMP(Type=5153, Gain>7)  +  REVERB(Mix>30)  +  tag:Lead
  // with autocomplete + builder chips + saved filters, over the real decoded library
  // (names/scenes/blocks/models always; full per-block params once hydrated). Ported from the
  // design prototype (design/Preset Browser.dc.html), bound to the `library` store + `editor`.
  import { tick } from 'svelte';
  import { create, insertMultiple, search } from '@orama/orama';
  import { editor } from './editor.svelte';
  import { library } from './library.svelte';
  import { forgefx } from './forgefx';
  import MiniGrid from './MiniGrid.svelte';
  import type { LibEntry } from './library.svelte';
  import type { DecodedBlock, GridCell, PresetGrid, VersionInfo } from './types';

  const ACCENT = '#35c9d6';
  // block family slug → [label, color]. Colors carried from the design; unknown slugs get a fallback.
  const CAT: Record<string, [string, string]> = {
    input: ['Input', '#4f6bed'], output: ['Output', '#2fa15f'],
    amp: ['Amp', '#d98a2b'], cab: ['Cab', '#6b6d76'], drive: ['Drive', '#d6543f'],
    comp: ['Comp', '#b3a52b'], geq: ['GEQ', '#7fae4a'], peq: ['PEQ', '#7fae4a'],
    chorus: ['Chorus', '#2fb0c9'], flanger: ['Flanger', '#c95bc0'], phaser: ['Phaser', '#8a6fd6'],
    filter: ['Filter', '#d65b9e'], enhancer: ['Enhancer', '#9b8cf0'], wah: ['Wah', '#d6a23f'],
    delay: ['Delay', '#4a82e0'], reverb: ['Reverb', '#3fa890'], pitch: ['Pitch', '#6f8fd6'],
    synth: ['Synth', '#c98a3f'], gate: ['Gate', '#9a9aa3'], ringmod: ['RingMod', '#c95b7a'],
    tremolo: ['Tremolo', '#b08fd6'], rotary: ['Rotary', '#3fa890'], volume: ['Volume', '#9a9aa3'],
    formant: ['Formant', '#c95bc0'], multitap: ['MultiTap', '#4a82e0'], megatap: ['MegaTap', '#4a82e0']
  };
  const catLabel = (slug: string) => CAT[slug]?.[0] ?? (slug.charAt(0).toUpperCase() + slug.slice(1));
  const catColor = (slug: string) => CAT[slug]?.[1] ?? '#7a7a84';

  type ParamCond = { name: string; op: string; val: string };
  type Cond =
    | { kind: 'block'; block: string; params: ParamCond[] }
    | { kind: 'tag'; val: string }
    | { kind: 'name'; val: string }
    | { kind: 'scenes'; op: string; val: string }
    | { kind: 'cpu'; op: string; val: string };

  // ── per-entry block view: prefer hydrated params, else summary blocks (+ model names) ──
  function blocksOf(e: LibEntry): DecodedBlock[] {
    const p = library.paramsOf(e);
    if (p) return p;
    // no params hydrated → synthesize type-only blocks from the summary so chips/type filters still work
    return e.summary.blocks
      .filter((b) => b.slug)
      .map((b) => ({
        effectId: b.effectId,
        family: b.slug ?? '',
        slug: b.slug ?? '',
        instance: b.instance ?? 1,
        typeName: (e.summary.models[b.slug ?? ''] ?? [])[0] ?? null,
        params: []
      }));
  }

  // ── filterable block tokens + per-slug param specs (derived from whatever params are available) ──
  const filterableSlugs = $derived.by(() => {
    const s = new Set<string>(['amp', 'drive', 'cab', 'comp', 'reverb', 'delay']);
    for (const e of library.entries) for (const b of e.summary.blocks) if (b.slug) s.add(b.slug);
    return [...s].sort();
  });
  type Spec = { label: string; kind: 'enum' | 'num'; enums: Set<string>; min: number; max: number };
  const specsBySlug = $derived.by(() => {
    const out: Record<string, Map<string, Spec>> = {};
    for (const e of library.entries) {
      const blocks = library.paramsOf(e);
      if (!blocks) continue;
      for (const b of blocks) {
        const m = (out[b.slug] ??= new Map());
        for (const p of b.params) {
          if (p.value == null && p.enumLabel == null) continue;
          const sp = m.get(p.label) ?? { label: p.label, kind: (p.kind === 'enum' ? 'enum' : 'num') as 'enum' | 'num', enums: new Set<string>(), min: Infinity, max: -Infinity };
          if (p.enumLabel) { sp.kind = 'enum'; sp.enums.add(p.enumLabel); }
          if (p.value != null) { sp.min = Math.min(sp.min, p.value); sp.max = Math.max(sp.max, p.value); }
          m.set(p.label, sp);
        }
        // the TYPE selector: fold model names in as enum values under "Type"
        const models = e.summary.models[b.slug] ?? [];
        if (models.length) {
          const sp = m.get('Type') ?? { label: 'Type', kind: 'enum' as const, enums: new Set<string>(), min: Infinity, max: -Infinity };
          for (const n of models) sp.enums.add(n);
          m.set('Type', sp);
        }
      }
    }
    // Type is ALWAYS available from the summary models (no deep scan needed) — seed it for every family
    // so "AMP(Type=…)" autocompletes amp model names straight after a device scan.
    for (const e of library.entries) {
      for (const [slug, names] of Object.entries(e.summary.models)) {
        if (!names.length) continue;
        const m = (out[slug] ??= new Map());
        const sp = m.get('Type') ?? { label: 'Type', kind: 'enum' as const, enums: new Set<string>(), min: Infinity, max: -Infinity };
        for (const n of names) sp.enums.add(n);
        m.set('Type', sp);
      }
    }
    return out;
  });
  const specFor = (slug: string, name: string): Spec | null => {
    for (const [k, v] of specsBySlug[slug] ?? []) if (k.toLowerCase() === name.toLowerCase()) return v;
    return null;
  };
  // A param is worth listing only if you can actually filter on it: an enum with options, or a numeric
  // param that VARIES across the library (min<max). Params that are constant everywhere (e.g. an EQ band
  // at 0 dB in every preset) are dead ends — drop them from the suggestions.
  const specUsable = (s: Spec): boolean => (s.kind === 'enum' ? s.enums.size > 0 : isFinite(s.min) && isFinite(s.max) && s.max > s.min);
  const usableSpecs = (slug: string): Spec[] => [...(specsBySlug[slug]?.values() ?? [])].filter(specUsable).sort((a, b) => Number(b.label === 'Type') - Number(a.label === 'Type') || a.label.localeCompare(b.label));

  // ===================== query parse / format =====================
  function splitOn(str: string, ch: string) {
    const out: { text: string; start: number; end: number }[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (c === ch && depth === 0) { out.push({ text: str.slice(start, i), start, end: i }); start = i + 1; }
    }
    out.push({ text: str.slice(start), start, end: str.length });
    return out;
  }
  const tokId = (tok: string): string | null => {
    const t = (tok || '').trim().toLowerCase();
    return filterableSlugs.includes(t) ? t : null;
  };
  const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, '$1');
  function parseParam(s: string): ParamCond | null {
    const m = s.match(/^\s*([A-Za-z][\w ]*?)\s*(>=|<=|!=|=|>|<)\s*(.+?)\s*$/);
    return m ? { name: m[1].trim(), op: m[2], val: unquote(m[3]) } : null; // strip the quotes the autocomplete adds
  }
  function parseTerm(t: string): Cond | null {
    let m;
    if ((m = t.match(/^tag:\s*"?([^"]*)"?$/i))) { const v = m[1].trim(); return v ? { kind: 'tag', val: v } : null; }
    if ((m = t.match(/^name:\s*"?([^"]*)"?$/i))) { const v = m[1].trim(); return v ? { kind: 'name', val: v } : null; }
    if ((m = t.match(/^scenes\s*(>=|<=|!=|=|>|<)\s*(\d+)$/i))) return { kind: 'scenes', op: m[1], val: m[2] };
    if ((m = t.match(/^cpu\s*(>=|<=|!=|=|>|<)\s*(\d+)$/i))) return { kind: 'cpu', op: m[1], val: m[2] };
    const pi = t.indexOf('(');
    if (pi >= 0) {
      const id = tokId(t.slice(0, pi));
      if (!id) return null;
      let inner = t.slice(pi + 1);
      if (inner.endsWith(')')) inner = inner.slice(0, -1);
      const params = splitOn(inner, ',').map((s) => parseParam(s.text)).filter(Boolean) as ParamCond[];
      return { kind: 'block', block: id, params };
    }
    const id = tokId(t);
    return id ? { kind: 'block', block: id, params: [] } : null;
  }
  const parseQuery = (text: string): Cond[] => splitOn(text, '+').map((s) => parseTerm(s.text.trim())).filter(Boolean) as Cond[];
  const qv = (v: string) => (/[\s,()]/.test(v) ? `"${v}"` : v);
  function condToText(c: Cond): string {
    if (c.kind === 'block') { const tok = c.block.toUpperCase(); return c.params.length ? `${tok}(${c.params.map((p) => p.name + p.op + p.val).join(', ')})` : tok; }
    if (c.kind === 'tag') return 'tag:' + qv(c.val);
    if (c.kind === 'name') return 'name:' + qv(c.val);
    if (c.kind === 'scenes') return 'scenes' + c.op + c.val;
    if (c.kind === 'cpu') return 'cpu' + c.op + c.val;
    return '';
  }
  const condsToQuery = (conds: Cond[]) => conds.map(condToText).filter(Boolean).join('  +  ');

  // ===================== match =====================
  const cmp = (a: number, op: string, b: number) =>
    op === '>' ? a > b : op === '<' ? a < b : op === '>=' ? a >= b : op === '<=' ? a <= b : op === '!=' ? Math.abs(a - b) > 1e-9 : Math.abs(a - b) < 1e-9;
  function matchParamCond(b: DecodedBlock, pc: ParamCond): boolean {
    const isType = /^type$/i.test(pc.name);
    for (const p of b.params) {
      const labelHit = p.label.toLowerCase() === pc.name.toLowerCase() || (isType && p.name.toLowerCase().endsWith('_type'));
      if (!labelHit) continue;
      if (p.kind === 'enum' || p.enumLabel != null) {
        const sv = (p.enumLabel ?? '').toLowerCase(), q = pc.val.toLowerCase();
        return pc.op === '!=' ? !sv.includes(q) : sv.includes(q);
      }
      if (p.value == null) continue;
      const range = pc.val.match(/^\s*(-?\d+\.?\d*)\s*-\s*(-?\d+\.?\d*)\s*$/);
      if (range) { const a = +range[1], bb = +range[2]; return p.value >= Math.min(a, bb) && p.value <= Math.max(a, bb); }
      const t = parseFloat(pc.val);
      if (isNaN(t)) return false;
      // `=` is tolerant to display rounding: the query value carries N decimals, so compare at that
      // precision (else a dragged "Threshold = -37" never matches a stored -36.98).
      if (pc.op === '=') {
        const dec = (pc.val.split('.')[1] ?? '').length;
        const f = Math.pow(10, Math.min(dec, 2));
        return Math.round(p.value * f) === Math.round(t * f);
      }
      return cmp(p.value, pc.op, t);
    }
    // Type condition with no enum param decoded → fall back to the model-name list
    if (isType) return false;
    return false;
  }
  function matchCond(e: LibEntry, c: Cond): boolean {
    if (c.kind === 'tag') return library.tagsOf(e.id).some((t) => t.toLowerCase().includes(c.val.toLowerCase()));
    if (c.kind === 'name') return e.summary.name.toLowerCase().includes(c.val.toLowerCase());
    if (c.kind === 'scenes') return cmp(e.summary.scenes.length, c.op, parseFloat(c.val));
    if (c.kind === 'cpu') return cmp(estCpu(e), c.op, parseFloat(c.val));
    if (c.kind === 'block') {
      const bs = blocksOf(e).filter((b) => b.slug === c.block);
      if (!bs.length) return false;
      if (!c.params.length) return true;
      // Type-only conditions can match via the model list even without hydrated params
      const typeOnly = c.params.every((p) => /^type$/i.test(p.name));
      if (typeOnly && bs.every((b) => !b.params.length)) {
        const models = (e.summary.models[c.block] ?? []).map((m) => m.toLowerCase());
        return c.params.every((pc) => models.some((m) => m.includes(pc.val.toLowerCase())));
      }
      return bs.some((b) => c.params.every((pc) => matchParamCond(b, pc)));
    }
    return true;
  }
  // Free-text search haystack per entry, memoized — rebuilt only when the cache/params/tags change, NOT
  // per keystroke (rebuilding name+blocks+models+every-param-label for 500 presets each keystroke was the lag).
  const haystacks = $derived.by(() => {
    const m = new Map<string, string>();
    for (const e of library.entries) {
      const blocks = library.paramsOf(e);
      const paramHay = blocks ? blocks.flatMap((b) => b.params.map((p) => `${p.label} ${p.enumLabel ?? ''}`)).join(' ') : '';
      m.set(e.id, `${e.summary.name} ${e.summary.scenes.join(' ')} ${e.summary.blocks.map((b) => b.name).join(' ')} ${Object.values(e.summary.models).flat().join(' ')} ${library.tagsOf(e.id).join(' ')} ${paramHay}`.toLowerCase());
    }
    return m;
  });

  // ===================== state =====================
  let advanced = $state(true);
  let query = $state(''); // advanced typed query
  let simpleQ = $state(''); // simple free text
  let conditions = $state<Cond[]>([]); // simple-mode chips
  let sort = $state<'num' | 'name' | 'cpu'>('num');
  let selectedId = $state<string | null>(null);
  let queryEl: HTMLInputElement | undefined = $state();
  let caret = $state(0);

  // Parse the text box in BOTH modes: '+'-separated terms that parse as conditions become filters,
  // anything that doesn't is free-text. So typing/pasting `AMP(Type=5153)` filters whether Advanced is
  // on or off (Advanced just adds autocomplete + the chip builder).
  function parseInput(text: string): { conds: Cond[]; free: string } {
    const conds: Cond[] = [];
    const free: string[] = [];
    for (const seg of splitOn(text, '+')) {
      const t = seg.text.trim();
      if (!t) continue;
      const c = parseTerm(t);
      if (c) conds.push(c);
      else free.push(t);
    }
    return { conds, free: free.join(' ') };
  }
  const parsedInput = $derived(parseInput(advanced ? query : simpleQ));
  const activeConds = $derived(advanced ? parsedInput.conds : [...conditions, ...parsedInput.conds]);
  const simpleText = $derived(parsedInput.free);

  // ── Orama full-text index: typo-tolerant, ranked free-text (rebuilt when the haystack changes) ──
  let oramaDb = $state<unknown>(null);
  $effect(() => {
    const hs = haystacks;
    let alive = true;
    (async () => {
      const db = await create({ schema: { id: 'string', text: 'string' } });
      await insertMultiple(db, [...hs].map(([id, text]) => ({ id, text })));
      if (alive) oramaDb = db;
    })();
    return () => { alive = false; };
  });
  // free-text → ranked id set (async). null = no free-text / index not ready → fall back to substring.
  let ftIds = $state<Set<string> | null>(null);
  let ftRank = $state<Map<string, number>>(new Map());
  $effect(() => {
    const q = simpleText.trim();
    const db = oramaDb;
    if (!q || !db) { ftIds = null; return; }
    let alive = true;
    (async () => {
      const r = await search(db as Parameters<typeof search>[0], { term: q, tolerance: 1, limit: 2000 });
      if (!alive) return;
      const ids = new Set<string>(); const rank = new Map<string, number>();
      r.hits.forEach((h, i) => { ids.add(String(h.document.id)); rank.set(String(h.document.id), i); });
      ftIds = ids; ftRank = rank;
    })();
    return () => { alive = false; };
  });

  const results = $derived.by(() => {
    const conds = activeConds;
    const q = simpleText.trim();
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hs = haystacks;
    const useOrama = !!q && ftIds !== null; // index ready → ranked; else substring fallback
    const list = library.entries.filter((e) => {
      for (const c of conds) if (!matchCond(e, c)) return false;
      if (q) {
        if (useOrama) { if (!ftIds!.has(e.id)) return false; }
        else { const h = hs.get(e.id) ?? ''; if (!toks.every((t) => h.includes(t))) return false; }
      }
      return true;
    });
    return list.sort((a, b) =>
      useOrama ? (ftRank.get(a.id) ?? 1e9) - (ftRank.get(b.id) ?? 1e9) // free-text → relevance order
      : sort === 'name' ? a.summary.name.localeCompare(b.summary.name)
      : sort === 'cpu' ? estCpu(b) - estCpu(a)
      : a.summary.number - b.summary.number
    );
  });
  const selected = $derived(selectedId ? (library.entries.find((e) => e.id === selectedId) ?? null) : null);

  // ── grid preview (bottom panel) + click-to-focus-block ──
  let focusEid = $state<number | null>(null); // block selected in the grid preview → detail shows only it
  let gridCache = $state<Record<string, PresetGrid>>({});
  const selectedGrid = $derived(selected ? (gridCache[selected.id] ?? null) : null);
  $effect(() => {
    const e = selected;
    if (e && e.source === 'device' && e.summary.number >= 0 && !gridCache[e.id]) {
      forgefx.presetGrid(e.summary.number).then((g) => { gridCache = { ...gridCache, [e.id]: g }; }).catch(() => {});
    }
  });
  // tile color from the cell's family (derive slug from "Amp 1" → amp)
  const gridCellColor = (c: GridCell) => catColor(c.name.replace(/\s+\d+$/, '').toLowerCase());

  // ── version history for the selected device preset ──
  let versions = $state<VersionInfo[]>([]);
  $effect(() => {
    const e = selected;
    versions = [];
    if (e && e.source === 'device' && e.summary.number >= 0) {
      forgefx.versions(e.summary.number).then((r) => { if (selected?.summary.number === e.summary.number) versions = r.versions; }).catch(() => {});
    }
  });
  const reloadVersions = (n: number) => forgefx.versions(n).then((r) => { versions = r.versions; }).catch(() => {});
  const fmtTime = (ms: number) => { const d = Math.round((Date.now() - ms) / 1000); return d < 60 ? `${d}s ago` : d < 3600 ? `${Math.round(d / 60)}m ago` : d < 86400 ? `${Math.round(d / 3600)}h ago` : `${Math.round(d / 86400)}d ago`; };
  function pickBlock(eid: number) { focusEid = focusEid === eid ? null : eid; }

  // ── drag a param/block from the detail panel into the search (builds a condition) ──
  let dragOver = $state(false);
  const DND = 'application/x-axis-query';
  function startDrag(e: DragEvent, payload: { slug: string; label?: string; op?: string; val?: string }) {
    e.dataTransfer?.setData(DND, JSON.stringify(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
  }
  // add a block/param condition from a drag payload or a double-click (shared)
  function addCondPayload(p: { slug: string; label?: string; op?: string; val?: string }) {
    if (!p.slug) return;
    editConds((c) => {
      let blk = [...c].reverse().find((x) => x.kind === 'block' && x.block === p.slug) as Extract<Cond, { kind: 'block' }> | undefined;
      if (!blk) { blk = { kind: 'block', block: p.slug, params: [] }; c.push(blk); }
      if (p.label && p.op && p.val != null && !blk.params.some((q) => q.name === p.label && q.val === p.val)) blk.params.push({ name: p.label, op: p.op, val: p.val });
    });
  }
  function onQueryDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const raw = e.dataTransfer?.getData(DND);
    if (!raw) return;
    try { addCondPayload(JSON.parse(raw)); } catch { /* bad payload */ }
  }
  // payload for a dragged detail param: enum → Type/mode = value; numeric → label = value
  const paramDragPayload = (slug: string, p: DecodedBlock['params'][number]) =>
    p.enumLabel != null
      ? { slug, label: p.label, op: '=', val: p.enumLabel }
      : { slug, label: p.label, op: '=', val: String(p.value == null ? '' : Math.round(p.value * 10) / 10) };

  // ── edit conditions (works in both modes; advanced re-serializes to the query text) ──
  function editConds(fn: (c: Cond[]) => void) {
    if (advanced) {
      const c = parseQuery(query);
      fn(c);
      query = condsToQuery(c);
    } else {
      const c = conditions.map((x) => (x.kind === 'block' ? { ...x, params: x.params.map((p) => ({ ...p })) } : { ...x }));
      fn(c);
      conditions = c;
    }
  }
  const clearAll = () => { if (advanced) query = ''; else { conditions = []; simpleQ = ''; } };
  function toggleAdvanced() {
    if (advanced) { conditions = parseQuery(query); simpleQ = ''; advanced = false; }
    else { query = condsToQuery(conditions); advanced = true; }
    closeAc();
  }

  // ===================== autocomplete =====================
  type AcItem = { label: string; insert: string; fragLen: number; hint: string; color: string; dot: boolean; kind?: 'value' | 'close' | 'done' };
  let acOpen = $state(false);
  let acItems = $state<AcItem[]>([]);
  let acIndex = $state(0);
  let acLabel = $state('');
  const mk = (label: string, insert: string, fragLen: number, hint = '', color = '#6e6e78', dot = true): AcItem => ({ label, insert, fragLen, hint, color, dot });

  function suggest(text: string, c: number): { items: AcItem[]; label: string } {
    const segs = splitOn(text, '+');
    let seg = segs[segs.length - 1];
    for (const s of segs) if (c >= s.start && c <= s.end) { seg = s; break; }
    const local = text.slice(seg.start, c);
    const opens = (local.match(/\(/g) || []).length, closes = (local.match(/\)/g) || []).length;
    if (opens > closes) {
      const pi = local.indexOf('(');
      const id = tokId(local.slice(0, pi)) ?? '';
      const after = local.slice(pi + 1);
      const parts = splitOn(after, ',');
      const frag = parts[parts.length - 1].text;
      const pm = frag.match(/^\s*([A-Za-z][\w ]*?)\s*(>=|<=|!=|=|>|<)\s*(.*)$/);
      if (pm) return { items: sgValue(id, pm[1].trim(), pm[3]), label: 'value · ' + pm[1].trim() };
      const pf = (frag.match(/[\w ]*$/) || [''])[0].trimStart();
      const params = sgParam(id, pf);
      // a synthetic "close block" action: ) then continue to the next block. Default (first) once at
      // least one param is set, so "Enter without picking a param" finishes the block, as requested.
      const close: AcItem = { label: `) — close ${catLabel(id)} · add block`, insert: ')', fragLen: pf.length, hint: 'or pick a param', color: catColor(id), dot: false, kind: 'close' };
      const hasParams = parts.length > 1; // we're after a comma → ≥1 param already
      return { items: hasParams ? [close, ...params] : [...params, close], label: catLabel(id) + ' parameter' };
    }
    let m;
    if ((m = local.match(/tag:\s*"?([\w .-]*)$/i))) return { items: sgList(library.allTags, m[1], 'tag'), label: 'tag' };
    const tf = (local.match(/[\w]*$/) || [''])[0];
    const blocks = sgBlock(tf);
    // after a completed block (cursor in a fresh "+ …" segment) Enter on "done" finishes the filter
    if (seg.start > 0) return { items: [{ label: '✓ done', insert: '', fragLen: tf.length, hint: 'finish filter', color: '#33c46b', dot: false, kind: 'done' }, ...blocks], label: 'block / token' };
    return { items: blocks, label: 'block / token' };
  }
  function sgBlock(frag: string): AcItem[] {
    const f = frag.toLowerCase();
    const out: AcItem[] = [];
    for (const id of filterableSlugs) { const lbl = id.toUpperCase(); if (lbl.toLowerCase().includes(f) || catLabel(id).toLowerCase().includes(f)) out.push(mk(lbl, lbl + '(', frag.length, 'block · ' + catLabel(id), catColor(id))); }
    for (const [tok, hint] of [['tag:', 'filter by tag'], ['name:', 'name contains'], ['scenes>', 'scene count'], ['cpu<', 'est. CPU load']] as const)
      if (tok.toLowerCase().startsWith(f) || f === '') out.push(mk(tok, tok, frag.length, hint, '#56565e', false));
    return out;
  }
  function sgParam(id: string, frag: string): AcItem[] {
    const f = frag.toLowerCase();
    // usableSpecs: only params you can filter on (enum, or numeric that varies), Type first.
    return usableSpecs(id).filter((s) => s.label.toLowerCase().includes(f)).map((s) => {
      const hint = s.kind === 'enum' ? 'type' : isFinite(s.min) ? `${fmtNum(s.min)}–${fmtNum(s.max)}` : 'num';
      return mk(s.label, s.label + (s.kind === 'num' ? '>' : '='), frag.length, hint, '#7a7a84', false);
    });
  }
  function sgValue(id: string, pname: string, frag: string): AcItem[] {
    const spec = specFor(id, pname);
    if (!spec) return [];
    const f = frag.trim().replace(/^"+/, '').replace(/"+$/, '').toLowerCase(); // ignore the wrapping quotes
    const asValue = (it: AcItem): AcItem => ({ ...it, kind: 'value' });
    if (spec.kind === 'enum') return [...spec.enums].filter((v) => v.toLowerCase().includes(f)).slice(0, 40).map((v) => asValue(mk(v, qv(v), frag.length, '', catColor(id))));
    if (!isFinite(spec.min)) return [];
    const lo = spec.min, hi = spec.max;
    const cand = [lo, (lo + hi) / 4 + lo / 2, (lo + hi) / 2, lo / 2 + (3 * hi) / 4, hi].map((x) => Math.round(x * 10) / 10);
    return [...new Set(cand)].map((v) => asValue(mk(String(v), String(v), frag.trim().length, 'value', '#7a7a84', false)));
  }
  const sgList = (arr: string[], frag: string, kind: string): AcItem[] => {
    const f = (frag || '').toLowerCase();
    return arr.filter((v) => v.toLowerCase().includes(f)).slice(0, 40).map((v) => mk(v, qv(v), (frag || '').length, kind, '#6e6e78', false));
  };
  function recomputeAc() {
    if (!advanced) { acOpen = false; return; }
    // read the LIVE cursor position (after an insert the DOM caret is the source of truth) so the
    // context (param → value → next param) advances reliably instead of using a stale index
    const c = queryEl?.selectionStart ?? caret;
    const r = suggest(queryEl?.value ?? query, c);
    acItems = r.items; acLabel = r.label; acIndex = 0; acOpen = true;
  }
  const closeAc = () => { acOpen = false; };
  function onQueryInput(e: Event) { const el = e.target as HTMLInputElement; query = el.value; caret = el.selectionStart ?? query.length; recomputeAc(); }
  function onQuerySelect(e: Event) {
    const el = e.target as HTMLInputElement;
    caret = el.selectionStart ?? 0;
    // don't recompute on autocomplete-navigation keys — that would reset the highlighted index to 0
    if ('key' in e && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes((e as KeyboardEvent).key)) return;
    if (advanced && acOpen) recomputeAc();
  }
  function onQueryKey(e: KeyboardEvent) {
    if (!advanced) return;
    if (!acOpen) { if (e.key === 'ArrowDown') recomputeAc(); return; }
    const n = acItems.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = Math.min(n - 1, acIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = Math.max(0, acIndex - 1); }
    else if (e.key === 'Enter' || e.key === 'Tab') { if (n) { e.preventDefault(); acceptAc(acIndex); } }
    else if (e.key === 'Escape') { e.preventDefault(); acOpen = false; }
  }
  async function acceptAc(i: number) {
    const item = acItems[i]; if (!item || !queryEl) return;
    if (item.kind === 'done') { closeAc(); return; }
    const v = queryEl.value, c = caret;
    let nt: string, nc: number;
    if (item.kind === 'close') {
      // drop the trailing ", " (auto-added after a value) + any partial param, close the block, start next
      const pre = v.slice(0, c - item.fragLen).replace(/[\s,]+$/, '');
      const ins = ') + ';
      nt = pre + ins + v.slice(c);
      nc = pre.length + ins.length;
    } else {
      const start = Math.max(0, c - item.fragLen);
      const ins = item.insert + (item.kind === 'value' ? ', ' : ''); // value → auto-advance to the next param
      nt = v.slice(0, start) + ins + v.slice(c);
      nc = start + ins.length;
    }
    query = nt; caret = nc;
    await tick(); // let the controlled value update before moving the caret
    queryEl.focus();
    try { queryEl.setSelectionRange(nc, nc); } catch { /* */ }
    recomputeAc();
  }
  // tidy dangling separators when leaving the box, so the saved/typed query is clean
  function onQueryBlur() {
    setTimeout(() => {
      closeAc();
      query = query.replace(/\s*\+\s*$/, '').replace(/,\s*$/, '');
    }, 130);
  }

  // ===================== add-filter / param picker =====================
  type Picker = { kind: 'addfilter' | 'tag' | 'param' | 'value'; ctx: { block?: string; param?: string; ci?: number }; x: number; y: number };
  let picker = $state<Picker | null>(null);
  let pickerSearch = $state('');
  let pickerHi = $state(0);
  function openPicker(kind: Picker['kind'], ctx: Picker['ctx'], el: HTMLElement) {
    const r = el.getBoundingClientRect();
    picker = { kind, ctx, x: Math.min(Math.max(12, r.left), window.innerWidth - 312), y: r.bottom + 6 };
    pickerSearch = ''; pickerHi = 0;
  }
  const pickerItems = $derived.by((): { v: string; label: string; sub: string; dot: boolean; color: string }[] => {
    if (!picker) return [];
    const f = pickerSearch.toLowerCase();
    if (picker.kind === 'addfilter') {
      const items = filterableSlugs.map((id) => ({ v: id, label: id.toUpperCase(), sub: 'block', dot: true, color: catColor(id) }));
      items.push({ v: 'tag', label: 'tag:', sub: 'by tag', dot: false, color: '#6e6e78' });
      items.push({ v: 'name', label: 'name:', sub: 'name contains', dot: false, color: '#6e6e78' });
      items.push({ v: 'scenes', label: 'scenes', sub: 'scene count', dot: false, color: '#6e6e78' });
      items.push({ v: 'cpu', label: 'cpu', sub: 'est. CPU load', dot: false, color: '#6e6e78' });
      return items.filter((i) => i.label.toLowerCase().includes(f) || i.sub.includes(f));
    }
    if (picker.kind === 'tag') return library.allTags.filter((t) => t.toLowerCase().includes(f)).map((t) => ({ v: t, label: t, sub: '', dot: true, color: '#6e6e78' }));
    if (picker.kind === 'param') { const id = picker.ctx.block!; return usableSpecs(id).filter((s) => s.label.toLowerCase().includes(f)).map((s) => ({ v: s.label, label: s.label, sub: s.kind === 'enum' ? 'type' : 'num', dot: false, color: '#6e6e78' })); }
    if (picker.kind === 'value') {
      const spec = specFor(picker.ctx.block!, picker.ctx.param!);
      if (!spec) return [];
      if (spec.kind === 'enum') return [...spec.enums].filter((v) => v.toLowerCase().includes(f)).map((v) => ({ v, label: v, sub: '', dot: true, color: catColor(picker!.ctx.block!) }));
      const lo = spec.min, hi = spec.max, mids = [lo, (lo + hi) / 2, hi].map((x) => Math.round(x * 10) / 10);
      return [...new Set(mids)].filter((v) => String(v).includes(f)).map((v) => ({ v: String(v), label: String(v), sub: 'value', dot: false, color: '#6e6e78' }));
    }
    return [];
  });
  function pickerPick(v: string) {
    if (!picker) return;
    const { kind, ctx } = picker;
    if (kind === 'addfilter') {
      if (v === 'tag') { openPickerKind('tag', {}); return; }
      if (v === 'name') { editConds((c) => c.push({ kind: 'name', val: '' })); picker = null; return; }
      if (v === 'scenes') { editConds((c) => c.push({ kind: 'scenes', op: '>', val: '4' })); picker = null; return; }
      if (v === 'cpu') { editConds((c) => c.push({ kind: 'cpu', op: '<', val: '60' })); picker = null; return; }
      editConds((c) => c.push({ kind: 'block', block: v, params: [] })); picker = null; return;
    }
    if (kind === 'tag') { editConds((c) => { if (!c.some((x) => x.kind === 'tag' && x.val === v)) c.push({ kind: 'tag', val: v }); }); picker = null; return; }
    if (kind === 'param') { const spec = specFor(ctx.block!, v); if (spec) openPickerKind('value', { block: ctx.block, param: v, ci: ctx.ci }); return; }
    if (kind === 'value') {
      const op = '=';
      editConds((c) => {
        const target = ctx.ci != null && c[ctx.ci]?.kind === 'block' ? (c[ctx.ci] as Extract<Cond, { kind: 'block' }>) : ([...c].reverse().find((x) => x.kind === 'block' && x.block === ctx.block) as Extract<Cond, { kind: 'block' }> | undefined);
        if (target) target.params.push({ name: ctx.param!, op: specFor(ctx.block!, ctx.param!)?.kind === 'num' ? '>' : op, val: v });
      });
      picker = null;
    }
  }
  // keep the last anchor so chained pickers (addfilter→tag, param→value) reuse the position
  let lastAnchor: HTMLElement | null = null;
  function openPickerKind(kind: Picker['kind'], ctx: Picker['ctx']) { if (lastAnchor) openPicker(kind, ctx, lastAnchor); }
  function onAddFilter(e: MouseEvent) { e.stopPropagation(); lastAnchor = e.currentTarget as HTMLElement; openPicker('addfilter', {}, lastAnchor); }
  function onAddParam(e: MouseEvent, ci: number, block: string) { e.stopPropagation(); lastAnchor = e.currentTarget as HTMLElement; openPicker('param', { block, ci }, lastAnchor); }
  function onPickerKey(e: KeyboardEvent) {
    const items = pickerItems;
    if (e.key === 'ArrowDown') { e.preventDefault(); pickerHi = Math.min(items.length - 1, pickerHi + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pickerHi = Math.max(0, pickerHi - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[pickerHi]) pickerPick(items[pickerHi].v); }
    else if (e.key === 'Escape') picker = null;
  }

  // ===================== saved filters =====================
  type Saved = { id: string; name: string; query: string };
  const SAVED_KEY = 'axs.pb.saved';
  let saved = $state<Saved[]>(loadSaved());
  let saving = $state(false);
  let saveName = $state('');
  function loadSaved(): Saved[] { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } }
  function persistSaved() {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved)); } catch { /* */ }
    forgefx.putDoc('config', 'savedFilters', saved).catch(() => {}); // mirror to the unified store (sync-ready)
  }
  function applySaved(f: Saved) { if (!advanced) advanced = true; query = f.query; closeAc(); }
  function delSaved(id: string) { saved = saved.filter((x) => x.id !== id); persistSaved(); }
  function commitSave() {
    const name = saveName.trim();
    if (!name) { saving = false; return; }
    saved = [...saved, { id: 's' + Date.now(), name, query: advanced ? query : condsToQuery(conditions) }];
    persistSaved();
    saving = false; saveName = '';
  }

  // ===================== load preset =====================
  async function loadPreset(e: LibEntry) {
    if (e.source !== 'device' || e.summary.number < 0) { editor.showToast('Imported file — open it on the device to load', '#f5a623'); return; }
    editor.openBuild();
    await editor.selectPreset(e.summary.number);
  }

  // ===================== helpers =====================
  const pad = (n: number) => (n < 0 ? '—' : String(n).padStart(3, '0'));
  function fmtNum(v: number) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }
  function fmtVal(p: { value: number | null; enumLabel?: string; unit?: string }) {
    if (p.enumLabel != null) return p.enumLabel;
    if (p.value == null) return '—';
    return fmtNum(p.value) + (p.unit && p.unit !== 'enum' && p.unit !== 'numeric' ? ' ' + p.unit : '');
  }
  // which params are highlighted in the detail (matched by an active block-param condition)
  function matchedKeys(e: LibEntry): Set<string> {
    const out = new Set<string>();
    const blocks = library.paramsOf(e);
    if (!blocks) return out;
    for (const c of activeConds) {
      if (c.kind !== 'block' || !c.params.length) continue;
      blocks.forEach((b, bi) => { if (b.slug !== c.block) return; for (const pc of c.params) for (const p of b.params) if ((p.label.toLowerCase() === pc.name.toLowerCase() || (/^type$/i.test(pc.name) && p.name.toLowerCase().endsWith('_type'))) && matchParamCond(b, pc)) out.add(bi + ':' + p.paramId); });
    }
    return out;
  }
  // a block's params worth showing in the detail (skip zero/default noise; cap per block)
  function detailParams(b: DecodedBlock) {
    return b.params.filter((p) => p.enumLabel != null || (p.value != null && Math.abs(p.value) > 1e-4)).slice(0, 12);
  }

  const tagColor = (t: string) => { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return `hsl(${h} 55% 60%)`; };
  // friendlier operator glyphs in chips (the typed language still uses >=,<=,!=)
  const opGlyph = (op: string): string => ({ '>=': '≥', '<=': '≤', '!=': '≠' })[op] ?? op;

  // ── estimated CPU load ──────────────────────────────────────────────────────────────────────
  // The device reports real CPU at runtime (an undocumented SysEx) — it is NOT stored in a preset,
  // so we can't read it offline. This is a per-block HEURISTIC: relative DSP weight per family
  // (amp/cab/reverb/pitch dominate; EQ/drive/utility are cheap), summed over placed blocks + a fixed
  // overhead, capped. It's a complexity indicator, not the device's meter — always shown with a ~.
  const CPU_WEIGHT: Record<string, number> = {
    amp: 28, cab: 12, reverb: 12, pitch: 14, multitap: 10, megatap: 10, synth: 9, delay: 8,
    flanger: 5, phaser: 5, chorus: 5, rotary: 5, formant: 5, tremolo: 4, filter: 4, drive: 4,
    enhancer: 3, comp: 3, wah: 3, ringmod: 3, geq: 2, peq: 2, gate: 2, volume: 1, input: 0, output: 0
  };
  const CPU_BASE = 8;
  function estCpu(e: LibEntry): number {
    let sum = CPU_BASE;
    for (const b of e.summary.blocks) sum += CPU_WEIGHT[b.slug ?? ''] ?? 4;
    return Math.max(20, Math.min(99, Math.round(sum)));
  }
  const cpuColor = (c: number) => (c >= 80 ? '#e87b6a' : c >= 62 ? '#f5a623' : '#33c46b');
</script>

<svelte:window onclick={() => { if (picker) picker = null; }} ondragend={() => (dragOver = false)} />

<div class="pb">
  <!-- HEADER -->
  <div class="hdr">
    <div class="title">
      <span class="t1">Preset Browser</span>
      <span class="t2">{activeConds.length || simpleText ? `${results.length} of ${library.entries.length}` : `${library.entries.length} presets`}{library.paramsReady ? '' : ' · params not fully loaded'}</span>
    </div>
    <div class="spacer"></div>
    <button class="ghost" onclick={() => library.buildCache()} disabled={library.scanning} title="Index every preset on the device — names, blocks, models and all params — into the local cache (one pass, persisted)">
      {library.scanning ? `Building cache ${library.scanDone}/${library.scanTotal}…` : library.cacheBuilt ? '↻ Rebuild cache' : '⤓ Build cache'}
    </button>
    <div class="sort">
      <span class="lbl">SORT</span>
      <div class="seg">
        {#each [['num', '#'], ['name', 'A-Z'], ['cpu', 'CPU']] as [id, label]}
          <button class="segb" class:on={sort === id} onclick={() => (sort = id as typeof sort)}>{label}</button>
        {/each}
      </div>
    </div>
    <button class="adv" class:on={advanced} onclick={toggleAdvanced} title="Toggle the typed query language with autocomplete">
      <span class="dot" class:on={advanced}></span> Advanced search
    </button>
  </div>

  <!-- QUERY BAR -->
  <div class="qbar">
    <div class="qwrap" class:focus={acOpen && advanced}>
      <svg width="17" height="17" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="#6e6e78" stroke-width="1.5" /><path d="M10.6 10.6 L14 14" stroke="#6e6e78" stroke-width="1.5" stroke-linecap="round" /></svg>
      {#if advanced}
        <input bind:this={queryEl} value={query} oninput={onQueryInput} onkeydown={onQueryKey} onfocus={recomputeAc} onblur={onQueryBlur} onclick={onQuerySelect} onkeyup={onQuerySelect}
          placeholder="AMP(Type=5153, Gain>7)  +  REVERB(Mix>30)  +  tag:Lead" spellcheck="false" autocomplete="off" />
      {:else}
        <input bind:value={simpleQ} placeholder="Search presets, tags, amps, params…" spellcheck="false" autocomplete="off" />
      {/if}
      {#if (advanced ? query : simpleQ)}
        <button class="clr" onclick={clearAll} title="Clear">×</button>
      {/if}
    </div>
    {#if acOpen && advanced}
      <div class="ac">
        {#if acLabel}<div class="ac-ctx">{acLabel}</div>{/if}
        {#each acItems as a, i}
          <button class="ac-item" class:hi={i === acIndex} onmousedown={(e) => { e.preventDefault(); acceptAc(i); }} onmouseenter={() => (acIndex = i)}>
            <span class="ac-dot" style:background={a.dot ? a.color : 'transparent'} style:border={a.dot ? 'none' : `1px solid ${a.color}`}></span>
            <span class="ac-l">{a.label}</span><span class="spacer"></span><span class="ac-h">{a.hint}</span>
          </button>
        {/each}
        {#if !acItems.length}<div class="ac-empty">No matches — keep typing</div>{/if}
        <div class="ac-foot"><span>↑↓ move</span><span>↵ insert</span><span>esc close</span></div>
      </div>
    {/if}
    <button class="save" onclick={() => (saving = true)} title="Save current filter">☆ Save filter</button>
  </div>

  <!-- BUILDER CHIPS (also a drop target for params/blocks dragged from the detail panel) -->
  <div class="chips" class:dragover={dragOver} role="group" ondragenter={(e) => { e.preventDefault(); dragOver = true; }} ondragover={(e) => { e.preventDefault(); dragOver = true; }} ondragleave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) dragOver = false; }} ondrop={onQueryDrop}>
    <span class="lbl">FILTERS</span>
    {#if dragOver}<span class="drop-hint">drop to add filter</span>{/if}
    {#each activeConds as c, ci}
      <div class="chip">
        {#if c.kind === 'block'}
          <button class="chip-head blk" style:--c={catColor(c.block)} onclick={(e) => onAddParam(e, ci, c.block)} title="Add a parameter condition">
            <span class="cdot" style:background={catColor(c.block)}></span>{catLabel(c.block)}
          </button>
          {#each c.params as p, pi}
            <span class="param">{p.name} {opGlyph(p.op)} {p.val}<button class="px" onclick={() => editConds((cc) => { const t = cc[ci]; if (t.kind === 'block') t.params.splice(pi, 1); })}>×</button></span>
          {/each}
          <button class="addp" onclick={(e) => onAddParam(e, ci, c.block)}>+ param</button>
        {:else}
          <span class="chip-head">
            <span class="cdot" style:background={c.kind === 'tag' ? tagColor(c.val) : c.kind === 'scenes' ? '#4f6bed' : c.kind === 'cpu' ? '#f5a623' : '#9a9aa3'}></span>
            {c.kind === 'tag' ? `Tag: ${c.val}` : c.kind === 'name' ? `Name: ${c.val}` : c.kind === 'scenes' ? `Scenes ${opGlyph(c.op)} ${c.val}` : `~CPU ${opGlyph(c.op)} ${c.val}`}
          </span>
        {/if}
        <button class="cx" onclick={() => editConds((cc) => cc.splice(ci, 1))}>×</button>
      </div>
    {/each}
    <button class="addf" onclick={onAddFilter}><span class="plus">+</span> Add filter</button>
    {#if !activeConds.length}<span class="hint">{advanced ? 'Type a query above, or add filters →' : 'Add block, parameter & tag filters →'}</span>{/if}
    <div class="spacer"></div>
    {#if activeConds.length}<button class="clrall" onclick={clearAll}>Clear all</button>{/if}
  </div>

  <!-- BODY -->
  <div class="body">
    <!-- SAVED SIDEBAR -->
    <div class="side">
      <div class="side-h"><span class="lbl">SAVED FILTERS</span><span class="ct">{saved.length}</span></div>
      {#if saving}
        <div class="save-in"><input bind:value={saveName} onkeydown={(e) => { if (e.key === 'Enter') commitSave(); else if (e.key === 'Escape') saving = false; }} onblur={() => setTimeout(() => (saving = false), 120)} placeholder="Name this filter…" />
        </div>
      {/if}
      <div class="saved-list">
        {#each saved as f}
          <div class="sv">
            <button class="sv-main" onclick={() => applySaved(f)}>
              <span class="sv-dot"></span>
              <span class="sv-txt"><span class="sv-n">{f.name}</span><span class="sv-q">{f.query || '(empty)'}</span></span>
            </button>
            <button class="sv-x" onclick={() => delSaved(f.id)} title="Delete">×</button>
          </div>
        {/each}
        {#if !saved.length}<div class="empty-s">No saved filters yet. Build a query and hit Save filter.</div>{/if}
      </div>
      {#if library.allTags.length}
        <div class="div"></div>
        <div class="lbl pad">QUICK TAGS</div>
        <div class="qtags">
          {#each library.allTags as t}
            {@const on = activeConds.some((c) => c.kind === 'tag' && c.val.toLowerCase() === t.toLowerCase())}
            <button class="qt" class:on style:--c={tagColor(t)} onclick={() => editConds((c) => { const i = c.findIndex((x) => x.kind === 'tag' && x.val.toLowerCase() === t.toLowerCase()); if (i >= 0) c.splice(i, 1); else c.push({ kind: 'tag', val: t }); })}>{t}</button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- RESULTS -->
    <div class="center">
    <div class="results">
      {#each results as e (e.id)}
        {@const sel = e.id === selectedId}
        {@const cpu = estCpu(e)}
        <button class="row" class:sel onclick={() => { selectedId = e.id; focusEid = null; }}>
          <span class="num" class:sel>{e.source === 'file' ? 'FILE' : pad(e.summary.number)}</span>
          <div class="row-mid">
            <div class="row-top">
              <span class="row-n">{e.summary.name}</span>
              {#each library.tagsOf(e.id).slice(0, 3) as tg}<span class="tg" style:--c={tagColor(tg)}>{tg}</span>{/each}
            </div>
            <div class="row-blocks">
              {#each blocksOf(e).filter((b) => b.slug !== 'input' && b.slug !== 'output') as b}
                <span class="bk" style:--c={catColor(b.slug)} title={b.typeName ?? catLabel(b.slug)}>{catLabel(b.slug)}{b.typeName ? ` · ${b.typeName}` : ''}</span>
              {/each}
            </div>
          </div>
          <div class="row-r">
            <span class="r-sub">{e.summary.model} · {e.summary.scenes.length} sc</span>
            <div class="cpu" title="Estimated DSP load from block makeup — not the device's live CPU reading">
              <span class="cpu-l">~CPU</span>
              <div class="cpu-bar"><div class="cpu-fill" style:width={cpu + '%'} style:background={cpuColor(cpu)}></div></div>
              <span class="cpu-t" style:color={cpuColor(cpu)}>{cpu}%</span>
            </div>
          </div>
        </button>
      {/each}
      {#if !results.length}
        <div class="empty">
          <svg width="44" height="44" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="#34343c" stroke-width="1.3" /><path d="M10.6 10.6 L14 14" stroke="#34343c" stroke-width="1.3" stroke-linecap="round" /></svg>
          <span class="e1">{library.entries.length ? 'No presets match this filter' : 'Library is empty'}</span>
          <span class="e2">{library.entries.length ? 'Loosen a parameter range or remove a condition.' : 'Scan the connected device or import .syx files to populate the library.'}</span>
          {#if !library.entries.length}
            <button class="load" style="width:auto; padding:0 18px; background:var(--accent,#35c9d6); color:#06181a;" onclick={() => library.buildCache()} disabled={library.scanning}>
              {library.scanning ? `Building cache ${library.scanDone}/${library.scanTotal}…` : '⤓ Build cache'}
            </button>
          {/if}
        </div>
      {/if}
    </div>
    {#if selected}
      <div class="gridpanel">
        <div class="gp-head">
          <span class="lbl">GRID — {selected.summary.name}</span>
          {#if focusEid != null}<button class="gp-clear" onclick={() => (focusEid = null)}>show all params</button>{:else}<span class="gp-hint">click a block to focus its params →</span>{/if}
        </div>
        {#if selectedGrid}
          <MiniGrid grid={selectedGrid} selectedEid={focusEid} color={gridCellColor} onpick={pickBlock} />
        {:else if selected.source === 'file'}
          <div class="gp-empty">Grid preview is available for device presets.</div>
        {:else}
          <div class="gp-empty">Loading grid…</div>
        {/if}
      </div>
    {/if}
    </div>

    <!-- DETAIL -->
    <div class="detail">
      {#if selected}
        {@const hits = matchedKeys(selected)}
        {@const cpu = estCpu(selected)}
        <div class="d-head">
          <div class="d-title"><span class="d-num">{selected.source === 'file' ? 'FILE' : pad(selected.summary.number)}</span><span class="d-name">{selected.summary.name}</span></div>
          <div class="d-tags">{#each library.tagsOf(selected.id) as tg}<span class="tg" style:--c={tagColor(tg)}>{tg}</span>{/each}</div>
          <div class="d-stats">
            <div class="st"><span class="sk">SOURCE</span><span class="sv2">{selected.source === 'file' ? 'Imported file' : selected.summary.model}</span></div>
            <div class="st"><span class="sk">SCENES</span><span class="sv2">{selected.summary.scenes.length}</span></div>
            <div class="st"><span class="sk">BLOCKS</span><span class="sv2">{selected.summary.blocks.length}</span></div>
            <div class="st"><span class="sk" title="Estimated DSP load — not the device reading">~CPU</span><span class="sv2" style:color={cpuColor(cpu)}>{cpu}%</span></div>
          </div>
          <button class="load" onclick={() => loadPreset(selected!)}>↓ Load preset</button>
        </div>
        {#if selected.source === 'device'}
          <div class="d-sec">
            <div class="vh-head">
              <span class="lbl">VERSION HISTORY</span>
              <button class="vh-snap" onclick={() => editor.backupPreset(selected!.summary.number).then(() => reloadVersions(selected!.summary.number))}>＋ Snapshot</button>
            </div>
            {#if versions.length}
              <div class="vh-list">
                {#each versions as v}
                  <div class="vh">
                    <div class="vh-info"><span class="vh-when">{fmtTime(v.capturedAt)}</span><span class="vh-meta">{v.source} · {(v.stored / 1024).toFixed(1)}KB</span></div>
                    <button class="vh-btn" title="Load into the edit buffer (doesn't touch a slot)" onclick={() => editor.loadVersion(v.id)}>Load</button>
                    <a class="vh-btn dl" href={`/api/version/${v.id}/syx`} download={`${v.name || 'preset'}.syx`} title="Download .syx">↓</a>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="vh-empty">No snapshots yet — hit Snapshot, or it captures on save.</p>
            {/if}
          </div>
        {/if}
        <div class="d-sec">
          <div class="lbl">SIGNAL CHAIN</div>
          <div class="chain">
            {#each blocksOf(selected) as b, i}
              <span class="ch" style:--c={catColor(b.slug)} title={b.typeName ?? catLabel(b.slug)}>{catLabel(b.slug)}</span>
              {#if i < blocksOf(selected).length - 1}<span class="arr">›</span>{/if}
            {/each}
          </div>
        </div>
        <div class="d-blocks">
          <div class="lbl">BLOCK PARAMETERS</div>
          {#if !library.paramsOf(selected)}
            <div class="empty-s">Full params not loaded for this preset. <button class="link" onclick={() => library.hydrateParams(selected!.id)}>Load params</button> (or Deep scan).</div>
          {:else}
            {#each library.paramsOf(selected)!.filter((b) => b.slug !== 'input' && b.slug !== 'output' && detailParams(b).length && (focusEid == null || b.effectId === focusEid)) as b, bi}
              <div class="blk">
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="blk-h" draggable="true" ondragstart={(e) => startDrag(e, { slug: b.slug })} ondblclick={() => addCondPayload({ slug: b.slug })} title="Drag or double-click to filter by this block">
                  <span class="cdot" style:background={catColor(b.slug)}></span><span class="blk-n">{catLabel(b.slug)}{b.typeName ? ` · ${b.typeName}` : ''}</span><span class="spacer"></span><span class="grip">⠿</span><span class="blk-i">{b.channel != null ? `Ch ${'ABCD'[b.channel]}` : `#${b.instance}`}</span>
                </div>
                <div class="blk-grid">
                  {#each detailParams(b) as p}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="pr" class:hit={hits.has(bi + ':' + p.paramId)} draggable="true" ondragstart={(e) => startDrag(e, paramDragPayload(b.slug, p))} ondblclick={() => addCondPayload(paramDragPayload(b.slug, p))} title="Drag or double-click to filter on this param"><span class="pk">{p.label}</span><span class="pv">{fmtVal(p)}</span></div>
                  {/each}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {:else}
        <div class="no-detail"><span class="big">◧</span><span class="e1">Select a preset</span><span class="e2">Its full block + parameter breakdown and signal chain show up here.</span></div>
      {/if}
    </div>
  </div>
</div>

<!-- PICKER -->
{#if picker}
  <div class="pk-pop" style:left={picker.x + 'px'} style:top={picker.y + 'px'} onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1" onkeydown={onPickerKey}>
    <div class="pk-h">
      <div class="lbl">{picker.kind === 'addfilter' ? 'Add a filter' : picker.kind === 'tag' ? 'Pick a tag' : picker.kind === 'param' ? 'Pick a parameter' : 'Pick a value'}</div>
      <div class="pk-search"><svg width="13" height="13" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="#6e6e78" stroke-width="1.6" /><path d="M10.6 10.6 L14 14" stroke="#6e6e78" stroke-width="1.6" stroke-linecap="round" /></svg>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={pickerSearch} onkeydown={onPickerKey} placeholder="Search…" spellcheck="false" autocomplete="off" autofocus /></div>
    </div>
    <div class="pk-list">
      {#each pickerItems as it, i}
        <button class="pk-item" class:hi={i === pickerHi} onclick={() => pickerPick(it.v)} onmouseenter={() => (pickerHi = i)}>
          {#if it.dot}<span class="cdot" style:background={it.color}></span>{/if}
          <span class="pk-l">{it.label}</span><span class="spacer"></span><span class="pk-s">{it.sub}</span>
        </button>
      {/each}
      {#if !pickerItems.length}<div class="ac-empty">No matches</div>{/if}
    </div>
  </div>
{/if}

<style>
  .pb { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #0c0c0e; color: #e9e9ee; overflow: hidden; font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif); }
  .spacer { flex: 1; }
  .lbl { font: 700 9px/1 'JetBrains Mono', monospace; color: #6e6e78; letter-spacing: 0.14em; }
  .lbl.pad { padding: 0 16px 9px; }
  /* header */
  .hdr { display: flex; align-items: center; gap: 14px; padding: 12px 20px; border-bottom: 1px solid #1c1c22; flex: none; }
  .title { display: flex; flex-direction: column; gap: 2px; }
  .t1 { font-size: 17px; font-weight: 800; letter-spacing: -0.01em; }
  .t2 { font: 600 10px/1 'JetBrains Mono', monospace; color: #6e6e78; letter-spacing: 0.04em; }
  .ghost { height: 32px; padding: 0 12px; border-radius: 9px; background: #16161b; border: 1px solid #2e2e36; color: #cfcfd6; font-size: 11.5px; font-weight: 700; cursor: pointer; }
  .ghost:hover:not(:disabled) { border-color: #3f3f48; color: #fff; }
  .ghost:disabled { opacity: 0.6; cursor: default; }
  .sort { display: flex; align-items: center; gap: 7px; }
  .seg { display: flex; gap: 3px; background: #0e0e10; border: 1px solid #26262c; border-radius: 9px; padding: 3px; }
  .segb { padding: 6px 11px; border-radius: 7px; font: 700 11px/1 'JetBrains Mono', monospace; cursor: pointer; color: #9a9aa3; background: transparent; border: none; }
  .segb.on { color: #0c0c0e; background: var(--accent, #35c9d6); }
  .adv { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 13px; border-radius: 9px; cursor: pointer; font-size: 12px; font-weight: 700; color: #cfcfd6; background: #16161b; border: 1px solid #2e2e36; }
  .adv.on { color: #06181a; background: var(--accent, #35c9d6); border-color: var(--accent, #35c9d6); }
  .adv .dot { width: 8px; height: 8px; border-radius: 50%; background: #56565e; }
  .adv .dot.on { background: #06181a; }
  /* query bar */
  .qbar { padding: 13px 20px 12px; border-bottom: 1px solid #1a1a1f; flex: none; position: relative; z-index: 60; background: #0d0d10; display: flex; gap: 9px; align-items: stretch; }
  .qwrap { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 14px; background: #101014; border: 1px solid #2a2a31; border-radius: 12px; transition: border-color 0.12s; }
  .qwrap.focus { border-color: var(--accent, #35c9d6); }
  .qwrap input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: #e9e9ee; font: 500 14px/1 'JetBrains Mono', monospace; }
  .clr { width: 24px; height: 24px; border: none; background: transparent; border-radius: 7px; cursor: pointer; color: #7a7a84; font-size: 15px; }
  .clr:hover { background: #1c1c22; color: #e9e9ee; }
  .save { padding: 0 16px; border-radius: 12px; cursor: pointer; font-size: 12.5px; font-weight: 700; color: #cfcfd6; background: #16161b; border: 1px solid #2e2e36; white-space: nowrap; }
  .save:hover { border-color: #3f3f48; color: #fff; }
  /* autocomplete */
  .ac { position: absolute; top: calc(100% + 2px); left: 20px; right: 130px; max-height: 320px; overflow-y: auto; background: #141417; border: 1px solid #2e2e36; border-radius: 13px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6); z-index: 200; padding: 6px; }
  .ac-ctx { padding: 7px 11px 5px; font: 600 9px/1 'JetBrains Mono', monospace; color: #6e6e78; letter-spacing: 0.1em; text-transform: uppercase; }
  .ac-item { display: flex; width: 100%; align-items: center; gap: 10px; padding: 8px 11px; border-radius: 9px; cursor: pointer; background: transparent; border: none; text-align: left; }
  .ac-item.hi { background: #1f1f27; }
  .ac-dot { flex: none; width: 8px; height: 8px; border-radius: 2px; }
  .ac-l { font: 600 13px/1.2 'JetBrains Mono', monospace; color: #e9e9ee; }
  .ac-h { font: 500 10px/1 'JetBrains Mono', monospace; color: #6e6e78; }
  .ac-empty { padding: 14px 12px; font: 500 12px/1.4 'JetBrains Mono', monospace; color: #6e6e78; }
  .ac-foot { display: flex; gap: 14px; padding: 8px 11px 5px; margin-top: 4px; border-top: 1px solid #232329; font: 600 9px/1 'JetBrains Mono', monospace; color: #56565e; }
  /* chips */
  .chips { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 20px; border-bottom: 1px solid #17171c; flex: none; background: #0c0c0e; transition: background 0.1s; }
  .chips.dragover { background: rgba(53, 201, 214, 0.06); outline: 1px dashed var(--accent, #35c9d6); outline-offset: -3px; }
  .drop-hint { font: 600 10px/1 'JetBrains Mono', monospace; color: var(--accent, #35c9d6); letter-spacing: 0.04em; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 4px; border-radius: 9px; background: #121216; border: 1px solid #26262c; }
  .chip-head { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 7px; font-size: 12px; font-weight: 600; color: #e9e9ee; background: transparent; border: none; cursor: default; }
  .chip-head.blk { color: #fff; font-weight: 700; cursor: pointer; background: color-mix(in srgb, var(--c) 15%, transparent); border: 1px solid color-mix(in srgb, var(--c) 33%, transparent); }
  .cdot { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 7px; }
  .param { display: inline-flex; align-items: center; height: 24px; padding: 0 6px 0 9px; border-radius: 7px; font: 600 11px/1 'JetBrains Mono', monospace; color: #e9e9ee; background: #1f1f25; }
  .px, .cx, .px { margin-left: 5px; cursor: pointer; color: #8a8a94; font-size: 12px; background: none; border: none; }
  .cx { width: 22px; height: 24px; border-left: 1px solid rgba(255, 255, 255, 0.08); font-size: 14px; }
  .px:hover, .cx:hover { color: #fff; }
  .addp { height: 24px; padding: 0 8px; border-radius: 7px; font: 600 11px/1 'JetBrains Mono', monospace; color: #7a7a84; cursor: pointer; border: 1px dashed #34343c; background: none; }
  .addp:hover { color: #35c9d6; border-color: #2a5a5e; }
  .addf { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 9px; background: #16161b; border: 1px solid #2e2e36; cursor: pointer; font-size: 12px; font-weight: 600; color: #cfcfd6; }
  .addf:hover { border-color: #3f3f48; color: #fff; }
  .addf .plus { font-size: 14px; color: #35c9d6; }
  .hint { font: 500 11.5px/1 'JetBrains Mono', monospace; color: #52525b; }
  .clrall { height: 30px; padding: 0 11px; border-radius: 9px; cursor: pointer; font-size: 11.5px; font-weight: 600; color: #8a8a94; background: none; border: none; }
  .clrall:hover { color: #e9e9ee; background: #16161b; }
  /* body */
  .body { flex: 1; min-height: 0; display: flex; }
  .side { width: 248px; flex: none; border-right: 1px solid #17171c; background: #0b0b0d; overflow-y: auto; display: flex; flex-direction: column; }
  .side-h { display: flex; align-items: center; justify-content: space-between; padding: 15px 16px 9px; }
  .ct { font: 600 10px/1 'JetBrains Mono', monospace; color: #4a4a52; }
  .save-in { padding: 0 12px 8px; }
  .save-in input { width: 100%; background: #121216; border: 1px solid #35c9d6; border-radius: 9px; padding: 9px 11px; color: #e9e9ee; font-size: 12.5px; font-weight: 600; outline: none; box-sizing: border-box; }
  .saved-list { display: flex; flex-direction: column; gap: 3px; padding: 0 9px 10px; }
  .sv { display: flex; align-items: stretch; border-radius: 10px; }
  .sv:hover { background: #15151a; }
  .sv-main { flex: 1; min-width: 0; display: flex; align-items: flex-start; gap: 9px; padding: 9px; background: none; border: none; cursor: pointer; text-align: left; }
  .sv-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: #6e6e78; margin-top: 4px; }
  .sv-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .sv-n { font-size: 12.5px; font-weight: 700; color: #e9e9ee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sv-q { font: 500 9.5px/1.2 'JetBrains Mono', monospace; color: #6e6e78; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sv-x { flex: none; width: 22px; border: none; background: none; color: #6e6e78; font-size: 14px; cursor: pointer; border-radius: 6px; }
  .sv-x:hover { background: #3a1f1f; color: #e87b6a; }
  .empty-s { padding: 8px; font: 500 11px/1.5 'JetBrains Mono', monospace; color: #52525b; }
  .link { background: none; border: none; color: #35c9d6; cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }
  .div { height: 1px; background: #17171c; margin: 4px 14px 12px; }
  .qtags { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 18px; }
  .qt { display: inline-flex; align-items: center; padding: 5px 10px; border-radius: 8px; font: 700 11px/1 'JetBrains Mono', monospace; cursor: pointer; color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 33%, transparent); }
  .qt.on { color: #0c0c0e; background: var(--c); }
  /* results */
  .center { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .results { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; background: #0c0c0e; }
  .gridpanel { flex: none; height: 210px; border-top: 1px solid #1c1c22; background: #09090b; display: flex; flex-direction: column; }
  .gp-head { display: flex; align-items: center; gap: 12px; padding: 9px 16px 4px; flex: none; }
  .gp-hint { font: 500 10px/1 'JetBrains Mono', monospace; color: #56565e; }
  .gp-clear { font: 600 10px/1 'JetBrains Mono', monospace; color: var(--accent, #35c9d6); background: none; border: none; cursor: pointer; }
  .gp-empty { padding: 24px 16px; font: 500 12px/1.4 'JetBrains Mono', monospace; color: #56565e; }
  .row { display: flex; width: 100%; align-items: center; gap: 14px; padding: 13px 18px; border-bottom: 1px solid #141418; cursor: pointer; background: transparent; border-left: 2px solid transparent; text-align: left; }
  .row:hover { background: #101014; }
  .row.sel { background: rgba(53, 201, 214, 0.06); border-left-color: var(--accent, #35c9d6); }
  .num { font: 700 13px/1 'JetBrains Mono', monospace; color: #56565e; flex: none; width: 38px; }
  .num.sel { color: #f5a623; }
  .row-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .row-top { display: flex; align-items: center; gap: 9px; }
  .row-n { font-size: 14.5px; font-weight: 700; color: #e9e9ee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tg { padding: 2px 7px; border-radius: 5px; font: 700 9.5px/1 'JetBrains Mono', monospace; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
  .row-blocks { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .bk { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 6px; font: 600 10px/1 'JetBrains Mono', monospace; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); border: 1px solid color-mix(in srgb, var(--c) 33%, transparent); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-r { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
  .r-sub { font: 600 9px/1 'JetBrains Mono', monospace; color: #56565e; }
  .cpu { display: flex; align-items: center; gap: 7px; }
  .cpu-l { font: 600 8px/1 'JetBrains Mono', monospace; color: #56565e; letter-spacing: 0.06em; }
  .cpu-bar { width: 46px; height: 6px; background: #16161b; border: 1px solid #26262c; border-radius: 4px; overflow: hidden; }
  .cpu-fill { height: 100%; }
  .cpu-t { font: 700 10px/1 'JetBrains Mono', monospace; min-width: 30px; text-align: right; }
  .empty, .no-detail { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 30px; gap: 13px; text-align: center; }
  .no-detail { height: 100%; }
  .big { font-size: 30px; opacity: 0.4; }
  .e1 { font-size: 14.5px; font-weight: 700; color: #8a8a94; }
  .e2 { font: 500 11.5px/1.5 'JetBrains Mono', monospace; color: #56565e; max-width: 300px; }
  /* detail */
  .detail { width: 368px; flex: none; border-left: 1px solid #17171c; background: #0b0b0d; overflow-y: auto; }
  .d-head { padding: 20px 20px 16px; border-bottom: 1px solid #17171c; }
  .d-title { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
  .d-num { font: 700 13px/1 'JetBrains Mono', monospace; color: #f5a623; }
  .d-name { font-size: 19px; font-weight: 800; letter-spacing: -0.01em; }
  .d-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
  .d-stats { display: flex; gap: 16px; margin-bottom: 16px; }
  .st { display: flex; flex-direction: column; gap: 3px; }
  .sk { font: 600 8px/1 'JetBrains Mono', monospace; color: #56565e; letter-spacing: 0.1em; }
  .sv2 { font-size: 11.5px; font-weight: 600; color: #cfcfd6; }
  .load { display: flex; width: 100%; align-items: center; justify-content: center; gap: 8px; height: 42px; border-radius: 11px; background: #f5a623; color: #1a1206; font-size: 13px; font-weight: 800; cursor: pointer; border: none; }
  .load:hover { filter: brightness(1.08); }
  .d-sec { padding: 16px 20px; }
  .d-sec .lbl { margin-bottom: 11px; display: block; }
  .vh-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .vh-head .lbl { margin-bottom: 0; }
  .vh-snap { font: 600 10px/1 'JetBrains Mono', monospace; color: var(--accent, #35c9d6); background: none; border: 1px solid #2a5a5e; border-radius: 7px; padding: 5px 9px; cursor: pointer; }
  .vh-snap:hover { background: rgba(53, 201, 214, 0.1); }
  .vh-list { display: flex; flex-direction: column; gap: 5px; }
  .vh { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: #0e0e11; border: 1px solid #1f1f25; border-radius: 9px; }
  .vh-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .vh-when { font-size: 12px; font-weight: 600; color: #e9e9ee; }
  .vh-meta { font: 500 9.5px/1 'JetBrains Mono', monospace; color: #6e6e78; }
  .vh-btn { flex: none; font: 700 11px/1 'JetBrains Mono', monospace; color: #f5a623; background: none; border: 1px solid #3a2f1a; border-radius: 7px; padding: 6px 10px; cursor: pointer; text-decoration: none; }
  .vh-btn:hover { background: rgba(245, 166, 35, 0.12); }
  .vh-btn.dl { color: #8a8a94; border-color: #2e2e36; padding: 6px 8px; }
  .vh-empty { font: 500 11px/1.5 'JetBrains Mono', monospace; color: #52525b; }
  .chain { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .ch { display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 7px; font: 600 10.5px/1 'JetBrains Mono', monospace; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); border: 1px solid color-mix(in srgb, var(--c) 33%, transparent); }
  .arr { color: #3a3a44; font-size: 11px; }
  .d-blocks { padding: 4px 20px 28px; display: flex; flex-direction: column; gap: 11px; }
  .d-blocks .lbl { margin-bottom: 1px; display: block; }
  .blk { border: 1px solid #1f1f25; border-radius: 12px; overflow: hidden; background: #0e0e11; }
  .blk-h { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #1a1a1f; cursor: grab; }
  .blk-h:active { cursor: grabbing; }
  .grip { color: #46464e; font-size: 11px; }
  .pr { cursor: grab; }
  .pr:active { cursor: grabbing; }
  .pr:hover { background: #16161b; }
  .blk-n { font-size: 13px; font-weight: 700; color: #e9e9ee; }
  .blk-i { font: 600 9px/1 'JetBrains Mono', monospace; color: #6e6e78; }
  .blk-grid { display: flex; flex-wrap: wrap; gap: 1px; background: #1a1a1f; }
  .pr { flex: 1 1 calc(50% - 1px); min-width: 0; display: flex; flex-direction: column; gap: 3px; padding: 8px 11px; background: #0e0e11; }
  .pr.hit { background: rgba(53, 201, 214, 0.1); }
  .pk { font: 600 9px/1 'JetBrains Mono', monospace; color: #6e6e78; letter-spacing: 0.04em; }
  .pv { font: 700 12.5px/1 'JetBrains Mono', monospace; color: #e3e3e8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pr.hit .pv { color: var(--accent, #35c9d6); }
  /* picker popup */
  .pk-pop { position: fixed; width: 300px; max-height: 360px; background: #141417; border: 1px solid #2e2e36; border-radius: 13px; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6); display: flex; flex-direction: column; overflow: hidden; z-index: 300; }
  .pk-h { padding: 10px 12px 8px; border-bottom: 1px solid #232329; }
  .pk-h .lbl { margin-bottom: 9px; display: block; }
  .pk-search { display: flex; align-items: center; gap: 8px; background: #0e0e11; border: 1px solid #2e2e36; border-radius: 9px; padding: 8px 10px; }
  .pk-search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: #e9e9ee; font-size: 12.5px; font-weight: 600; }
  .pk-list { max-height: 288px; overflow-y: auto; padding: 6px; }
  .pk-item { display: flex; width: 100%; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 8px; cursor: pointer; background: transparent; border: none; text-align: left; }
  .pk-item.hi { background: #1c1c22; }
  .pk-l { font-size: 12.5px; font-weight: 600; color: #e9e9ee; }
  .pk-s { font: 500 10px/1 'JetBrains Mono', monospace; color: #6e6e78; }
</style>
