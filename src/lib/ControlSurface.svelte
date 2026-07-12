<script lang="ts">
  // Reusable widget-grid control surface (ported from design/Control Surface (Widget Grid).dc.html).
  // Pages instead of tabs (still a tab strip), per-control view types (knob/fader/slider/number,
  // button/switch, select, eq, action), an Arrange mode (move/resize/retype/remove/add/tidy), and
  // a square responsive grid. Driven by the live editor params; layouts persist per block family.
  import { editor } from './editor.svelte';
  import EQGraph, { type EQBand } from './EQGraph.svelte';
  import ModifierFlyout from './ModifierFlyout.svelte';
  import { fmtCompact, normFromValue, paramValue, paramUnit } from './format';
  import { idealIds } from './layouts';
  import { surfGet, surfSet, surfRemove, surfRev } from './surfaceStore.svelte';
  import { paramHelp, helpSlugForPack } from './help';
  import type { NamedParam, EnumParam } from './types';
  import { AXIS_PIN_SELECTED_PARAMETERS_ACTION } from './axis-workbench/axisParameterActions';
  import { axisParameterSourceFromEditorParamId } from './axis-workbench/axisParameterSources';
  import {
    WORKBENCH_PARAMETER_SOURCE_MIME,
    getOptionalWorkbenchContext,
    menuPositionFromPointer,
    serializeWorkbenchParameterSource,
    type WorkbenchMenuItem,
    type WorkbenchMenuPosition,
    type WorkbenchParameterSource
  } from './workbench';
  import ContextMenu from './workbench/svelte/ContextMenu.svelte';
  import { longPress } from './axis-workbench/longPress';
  import { buildAxisPinMenuItems } from './axis-workbench/pinMenu';
  import type { AxisPinTarget } from './axis-workbench/pinTargets';
  import { axisBlockEditorModifierController } from './axis-workbench/blockEditor/blockEditorModifierController';

  let {
    slug = '',
    accent = '#35c9d6',
    eqBands = [] as EQBand[],
    eqGainRange = 20,
    eqTitle = 'EQ',
    hideIds = [] as number[]
  }: { slug?: string; accent?: string; eqBands?: EQBand[]; eqGainRange?: number; eqTitle?: string; hideIds?: number[] } = $props();

  const GAP = 8;
  const CONT_VIEWS = ['knob', 'fader', 'slider', 'number'] as const;
  const TOG_VIEWS = ['button', 'switch'] as const;
  const VIEW_ICON: Record<string, string> = { knob: '◉', fader: '⇕', slider: '⇔', number: '#', button: '⏻', switch: '⊙', select: '▾', eq: '∿', action: '⏼', meter: '▊', wave: '⌇' };
  const workbench = getOptionalWorkbenchContext();
  const workbenchCanPin = $derived(!!workbench?.registry.hasAction(AXIS_PIN_SELECTED_PARAMETERS_ACTION));

  type Kind = 'cont' | 'toggle' | 'select' | 'eq' | 'action' | 'meter' | 'wave';
  type Ctl = { key: string; kind: Kind; label: string; id: number; w: number; h: number; view: string; views: readonly string[] };
  type Widget = { id: string; key: string; x: number; y: number; w: number; h: number; view: string };
  type Board = { pageOrder: string[]; page: string; boards: Record<string, Widget[]> };

  // ── live control catalog (rebuilt from the device params; widgets reference these by key) ──
  const knobById = $derived(new Map(editor.params.filter((p) => p.id != null).map((p) => [p.id as number, p])));
  const enumById = $derived(new Map(editor.enums.map((e) => [e.id, e])));
  // live audio meter(s) for the block this surface edits — a block can report several (OUTPUT VU L+R,
  // M-Comp 3 bands, cab gain+VU); `mon` is the primary (first) for the label/dB text, `mons` is all bars.
  const mons = $derived(editor.monitorsFor(editor.selected?.effectId ?? -1));
  const mon = $derived(mons[0] ?? null);
  const meterDbText = $derived(mon?.db != null ? `${mon.db >= 0 ? '+' : ''}${mon.db.toFixed(1)} dB` : mon ? `${Math.round(mon.norm * 100)}%` : '—');
  // short per-bar tag when a block has several monitors (L/R for VU, band number for M-Comp, else role)
  const meterTag = (m: import('./types').LiveMonitor): string =>
    /VUL$/.test(m.paramName) ? 'L' : /VUR$/.test(m.paramName) ? 'R'
      : (m.paramName.match(/GAINMON(\d)$/)?.[1] ?? (m.role === 'gainReduction' ? 'GR' : m.role === 'vu' ? 'VU' : '·'));
  // bar fill 0..1. Gain-reduction meters read INVERTED on the wire (norm 1.0 = 0 dB = no reduction at
  // idle); show them growing from empty as reduction increases. Level/VU/detector fill with signal.
  const meterFill = (m: import('./types').LiveMonitor | null): number =>
    !m ? 0 : m.role === 'gainReduction' ? 1 - m.norm : m.norm;
  // ── looper waveform (Looper block only) ── downsample the ~595-sample envelope to ~110 bars for the SVG.
  const NWAVE = 110;
  const waveBars = $derived.by<number[]>(() => {
    const w = editor.looperWave?.wave;
    if (!w || !w.length) return [];
    const out: number[] = [];
    for (let i = 0; i < NWAVE; i++) {
      const a = Math.floor((i * w.length) / NWAVE), b = Math.max(a + 1, Math.floor(((i + 1) * w.length) / NWAVE));
      let peak = 0; for (let j = a; j < b && j < w.length; j++) peak = Math.max(peak, w[j] ?? 0);
      out.push(peak);
    }
    return out;
  });
  const wavePos = $derived(Math.max(0, Math.min(1, editor.looperWave?.position ?? 0)));
  const hasWave = $derived(waveBars.length > 0);
  // looper transport buttons. record/play/overdub/reverse/half/once latch (toggle on/off); stop/undo are
  // momentary (write on=true, don't latch). Local latch state — the device's own transport state isn't
  // decoded yet, so this tracks what we've sent.
  const LOOP_BTNS: readonly [string, string][] = [['record', 'REC'], ['play', '▶'], ['stop', '■'], ['overdub', 'DUB'], ['undo', '↺'], ['reverse', 'REV'], ['half', '½']];
  const LOOP_MOMENTARY = new Set(['stop', 'undo']);
  let loopLatch = $state<Record<string, boolean>>({});
  function pressLoop(action: string) {
    if (editMode) return;
    if (LOOP_MOMENTARY.has(action)) { editor.looperControl(action, true); return; }
    const next = !loopLatch[action];
    loopLatch = { ...loopLatch, [action]: next };
    editor.looperControl(action, next);
  }
  const catalog = $derived.by<Ctl[]>(() => {
    const hidden = new Set(hideIds);
    const out: Ctl[] = [];
    if (eqBands.length) out.push({ key: 'eq', kind: 'eq', label: eqTitle, id: -1, w: 4, h: 2, view: 'eq', views: ['eq'] });
    for (const p of editor.params) {
      if (p.id == null || hidden.has(p.id)) continue;
      out.push({ key: `k${p.id}`, kind: 'cont', label: p.name, id: p.id, w: 1, h: 1, view: 'knob', views: CONT_VIEWS });
    }
    for (const e of editor.enums) {
      if (hidden.has(e.id)) continue;
      const tog = e.options.length <= 2;
      out.push({ key: `e${e.id}`, kind: tog ? 'toggle' : 'select', label: e.name, id: e.id, w: tog ? 1 : 2, h: 1, view: tog ? 'button' : 'select', views: tog ? TOG_VIEWS : ['select'] });
    }
    out.push({ key: 'bypass', kind: 'action', label: 'Bypass', id: -2, w: 2, h: 1, view: 'action', views: ['action'] });
    // Live audio meter — offered only when this block actually reports a monitor level (INPUT/OUTPUT/
    // COMP/GATE/CAB/DRIVE/FILTER…). Draggable/scalable like any widget; value from editor.monitorFor.
    if (mon) out.push({ key: 'meter', kind: 'meter', label: mon.role === 'gainReduction' ? 'Gain Reduction' : mon.role === 'vu' ? 'VU' : 'Meter', id: -3, w: 1, h: 2, view: 'meter', views: ['meter'] });
    // Looper waveform — offered only for the Looper block (when live waveform data is present).
    if (hasWave) out.push({ key: 'wave', kind: 'wave', label: 'Loop', id: -4, w: 4, h: 2, view: 'wave', views: ['wave'] });
    return out;
  });
  const catByKey = $derived(new Map(catalog.map((c) => [c.key, c])));

  // ── grid + board state ──
  let containerEl = $state<HTMLElement | null>(null);
  let boardEl = $state<HTMLElement | null>(null);
  let containerW = $state(900);
  let vw = $state(typeof window !== 'undefined' ? window.innerWidth : 1100);
  let cols = $state(12);
  let rows = $state(4);
  let compact = $state(false);
  let editMode = $state(false);
  let bySlug = $state<Record<string, Board>>({}); // the ACTIVE profile's board, per slug
  let profileMeta = $state<Record<string, { active: string; names: string[] }>>({});
  let profMenuOpen = $state(false);
  let profMenuPos = $state<{ top: number; right: number } | null>(null); // fixed-position (escapes tab-row clip)
  // ── modifier flyout (∿ badge) ── opens the modifier editor for the clicked control. The target
  // binding (block eid + paramId) is now decoded, so the flyout can assign a modifier to THIS control.
  let modOpen = $state(false);
  let modLabel = $state('');
  let modTargetEid = $state<number | null>(null);
  let modTargetParam = $state<number | null>(null);
  function openMod(c: Ctl) {
    if (editMode) return;
    const targetEid = editor.selected?.effectId ?? null;
    const blockName = editor.selected?.display ?? 'Block';
    // Modifier-ownership rule (design §1, 05-block-editor.md): when a docked `be-part="modifier"`
    // panel is mounted, the ∿ badge targets THAT panel via the shared controller instead of opening
    // the in-editor flyout. Only fall back to the overlay flyout when no docked panel exists.
    if (axisBlockEditorModifierController.modPartMounted) {
      axisBlockEditorModifierController.targetParameter({
        label: c.label,
        block: blockName,
        targetEffectId: targetEid,
        targetParam: c.id,
        slot: 1
      });
      editor.showToast(`∿ ${c.label} → Modifier panel`, '#f5a623');
      return;
    }
    modLabel = c.label;
    modTargetParam = c.id;
    modTargetEid = targetEid;
    modOpen = true;
  }
  let editingKey = $state<string | null>(null);
  let editBuf = $state('');
  let openSelect = $state<string | null>(null);
  let renamingPage = $state<string | null>(null);
  // value bubble: a single fixed-position tooltip (escapes the editor's scroll clipping + stays on top)
  let tip = $state<{ id: number; cx: number; cy: number; edit: boolean } | null>(null);

  // ── parameter help on hover (shown in the app's bottom status bar, left slot) ──
  let pHelpToken = 0;
  async function showParamHelp(id: number, label: string) {
    const token = ++pHelpToken;
    editor.setHint(label); // show the name immediately while the blurb loads
    const h = await paramHelp(helpSlugForPack(slug), id);
    if (token !== pHelpToken) return; // a newer hover won
    editor.setHint(h ? `${label} — ${h.blurb}${h.tip ? '  ·  Tip: ' + h.tip : ''}` : label);
  }
  function clearParamHelp() {
    pHelpToken++;
    editor.clearHint();
  }
  let dragging = $state(false);
  let drag = $state<{ id: string; x: number; y: number; w: number; h: number; valid: boolean } | null>(null);
  let q = $state(''); // live control-search query
  let resSel = $state<{ id: number; left: number; top: number; width: number } | null>(null); // results select popover

  // ── live control search: flat list of every matching control, ignoring tabs/groupings ──
  const searching = $derived(q.trim().length > 0);
  const matches = $derived.by(() => {
    const s = q.trim().toLowerCase();
    return s ? catalog.filter((c) => c.kind !== 'eq' && c.label.toLowerCase().includes(s)) : [];
  });
  // honor each control's configured view (knob/fader/slider/number · button/switch) in the results,
  // falling back to the catalog default when the control isn't placed on any page yet
  const viewByKey = $derived.by(() => {
    const m = new Map<string, string>();
    const b = bySlug[slug];
    if (b) for (const pg of b.pageOrder) for (const w of b.boards[pg] ?? []) if (!m.has(w.key)) m.set(w.key, w.view);
    return m;
  });
  const viewOf = (c: Ctl) => viewByKey.get(c.key) ?? c.view;
  function resKnobDown(e: PointerEvent, id: number) {
    vd = { id, sy: e.clientY, sn: knob(id)?.norm ?? 0 };
    dragging = true;
    showTip(e.currentTarget as HTMLElement, id, false);
  }
  function openResSel(e: MouseEvent, id: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    resSel = resSel?.id === id ? null : { id, left: r.left, top: r.bottom + 4, width: Math.max(r.width, 180) };
  }

  const isMobile = $derived(vw < 760);
  const board = $derived(bySlug[slug]);
  const widgets = $derived(board ? (board.boards[board.page] ?? []) : []);
  const onPage = $derived(new Set(widgets.map((w) => w.key)));
  const tray = $derived(catalog.filter((c) => !onPage.has(c.key)));

  // Display grid: `cols` is the user's PREFERRED column count (their zoom on a wide monitor, e.g. 18/19
  // on 32:9). But the board must fit whatever width it's actually in, so in USE mode we cap the shown
  // columns to what fits legibly (fitCols) and re-pack the layout — ultrawide shows the full cols, a
  // narrow window or phone scales down to 3–4. Arrange (editMode) keeps the full `cols` you're editing.
  const fitCols = $derived(Math.max(isMobile ? 2 : 3, Math.floor((containerW + GAP) / ((isMobile ? 84 : 104) + GAP))));
  const displayCols = $derived(
    editMode ? cols : isMobile ? Math.min(cols, Math.max(2, Math.min(6, fitCols))) : Math.min(cols, fitCols)
  );
  // cell = exactly the width split across the shown columns, so the board ALWAYS fills the width
  // (fewer cols = bigger tiles). Min keeps tiles legible; the col count drops before tiles get tiny.
  const cell = $derived(Math.max(isMobile ? 60 : 48, Math.floor((containerW - (displayCols - 1) * GAP) / displayCols)));
  // re-pack the arranged widgets into the shown columns whenever we're showing fewer than the layout uses
  const viewWidgets = $derived(!editMode && displayCols < cols ? packInto(widgets, displayCols, 256) : widgets);
  // board height = content extent, with `rows` as a minimum in arrange — grows downward, never sideways
  const viewRows = $derived(Math.max(editMode ? rows : 1, 1, ...viewWidgets.map((w) => w.y + w.h)));
  const effCompact = $derived(compact || isMobile);

  // persisted global grid prefs
  const GKEY = 'axs.surface2.grid';
  function loadGrid() {
    try {
      const j = JSON.parse(surfGet(GKEY) || 'null');
      if (j) {
        cols = clamp(j.cols ?? cols, 4, 24);
        rows = clamp(j.rows ?? rows, 4, 8);
        compact = !!j.compact;
      } else {
        cols = vw < 760 ? clamp(Math.round((vw - 32) / 84), 4, 8) : clamp(Math.round((vw - 32) / 150), 6, 20);
      }
    } catch {
      /* */
    }
  }
  function saveGrid() {
    surfSet(GKEY, JSON.stringify({ cols, rows, compact }));
  }
  // ── Axis-Layouts: named layout profiles per context (slug). "Default" = device-authentic (seeded
  // from the served layout), "Blank" = empty canvas, plus user-created copies. The ACTIVE profile's
  // board is bySlug[slug] (so every mutator below is unchanged); switching just swaps it + repoints
  // persistence. Boards persist at axs.surface3.<slug>.<profile>; meta (active + names) at the meta key.
  const LEGACY_KEY = (s: string) => `axs.surface2.${s}`; // pre-profile single board → migrated into Default
  const PMKEY = (s: string) => `axs.surface3meta.${s}`;
  const bKey = (s: string, prof: string) => `axs.surface3.${s}.${prof}`;
  const activeProfile = $derived(profileMeta[slug]?.active ?? 'Default');
  const profileNames = $derived(profileMeta[slug]?.names ?? ['Default', 'Blank']);
  function emptyBoard(): Board {
    return { pageOrder: ['Page 1'], page: 'Page 1', boards: { 'Page 1': [] } };
  }
  function seedFor(prof: string): Board {
    return prof === 'Blank' ? emptyBoard() : defaultBoard();
  }
  function loadProfileBoard(s: string, prof: string): Board {
    try {
      const raw = surfGet(bKey(s, prof));
      if (raw) return reconcile(JSON.parse(raw));
      if (prof === 'Default') {
        const legacy = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_KEY(s)) : null; // carry a pre-profile board into Default
        if (legacy) return reconcile(JSON.parse(legacy));
      }
    } catch {
      /* */
    }
    return seedFor(prof);
  }
  function saveMeta(s: string) {
    if (profileMeta[s]) surfSet(PMKEY(s), JSON.stringify(profileMeta[s]));
  }
  function saveBoard(s: string) {
    if (!s || !bySlug[s]) return;
    surfSet(bKey(s, profileMeta[s]?.active ?? 'Default'), JSON.stringify(bySlug[s]));
  }
  // switch the active profile (saving the current one first); reseeds Default/Blank or loads a custom copy
  function setProfile(name: string) {
    if (!slug) return;
    profMenuOpen = false;
    if (name === activeProfile) return;
    saveBoard(slug); // persist the current profile before leaving it
    const meta = profileMeta[slug] ?? { active: 'Default', names: ['Default', 'Blank'] };
    const names = meta.names.includes(name) ? meta.names : [...meta.names, name];
    profileMeta = { ...profileMeta, [slug]: { active: name, names } };
    saveMeta(slug);
    bySlug = { ...bySlug, [slug]: loadProfileBoard(slug, name) };
  }
  // create a new profile as a copy of the current board, and switch to it
  function addProfile() {
    if (!slug) return;
    profMenuOpen = false;
    saveBoard(slug);
    const meta = profileMeta[slug] ?? { active: 'Default', names: ['Default', 'Blank'] };
    let i = 1;
    let name = `Layout ${i}`;
    while (meta.names.includes(name)) name = `Layout ${++i}`;
    const copy: Board = JSON.parse(JSON.stringify(bySlug[slug] ?? defaultBoard()));
    profileMeta = { ...profileMeta, [slug]: { active: name, names: [...meta.names, name] } };
    saveMeta(slug);
    surfSet(bKey(slug, name), JSON.stringify(copy));
    bySlug = { ...bySlug, [slug]: copy };
  }
  // remove a custom profile (built-ins stay); fall back to Default
  function deleteProfile(name: string) {
    if (!slug || name === 'Default' || name === 'Blank') return;
    const meta = profileMeta[slug];
    if (!meta) return;
    const names = meta.names.filter((n) => n !== name);
    const active = meta.active === name ? 'Default' : meta.active;
    profileMeta = { ...profileMeta, [slug]: { active, names } };
    saveMeta(slug);
    surfRemove(bKey(slug, name));
    bySlug = { ...bySlug, [slug]: loadProfileBoard(slug, active) };
  }
  function toggleProfMenu(e: MouseEvent) {
    if (profMenuOpen) {
      profMenuOpen = false;
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    profMenuPos = { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) };
    profMenuOpen = true;
  }
  // re-seed the active profile from the device-authentic layout (discard customization)
  function resetActiveToDevice() {
    if (!slug) return;
    profMenuOpen = false;
    bySlug = { ...bySlug, [slug]: defaultBoard() };
    saveBoard(slug);
  }

  function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
  }

  const mk = (c: Ctl): Widget => ({ id: 'w' + c.key, key: c.key, x: 0, y: 0, w: c.w, h: c.h, view: c.view });
  // catalog key for a layout control's paramId (cont → k<id>, enum → e<id>); null if not on this device
  function keyForParam(pid: number | null): string | null {
    if (pid == null) return null;
    if (knobById.has(pid)) return `k${pid}`;
    if (enumById.has(pid)) return `e${pid}`;
    return null;
  }
  // Device-authentic Default layout: one page per editor page, controls in the editor's order with the
  // editor's labels. Positions are gravity-packed into the grid (NOT the editor's absolute columns —
  // those assume a far wider canvas and read as sparse/overlapping here). Anything the layout doesn't
  // reference gets swept onto a trailing "More" page so nothing is lost.
  function layoutBoard(): Board | null {
    const lay = editor.blockLayout;
    if (!lay?.pages?.length) return null;
    const boards: Record<string, Widget[]> = {};
    const pageOrder: string[] = [];
    // Page names are the keys of the `{#each pageOrder (pg)}` block, so they MUST be unique — a device
    // layout can repeat a name (e.g. Delay ships its own "More" page, which also collides with the
    // catch-all below) and a duplicate key is a fatal `each_key_duplicate`. Suffix any repeat.
    const usedNames = new Set<string>();
    const uniqName = (n: string): string => {
      const base = n || 'Page';
      let name = base;
      for (let i = 2; usedNames.has(name); i++) name = `${base} ${i}`;
      usedNames.add(name);
      return name;
    };
    for (const pg of lay.pages) {
      const ws: Widget[] = [];
      const seen = new Set<string>();
      for (const ctl of pg.controls) {
        const key = keyForParam(ctl.paramId);
        const cat = key ? catByKey.get(key) : undefined;
        if (!cat || seen.has(key!)) continue; // skip unknown params + dupes (a param listed twice)
        seen.add(key!);
        ws.push(mk(cat));
      }
      if (!ws.length) continue;
      const name = uniqName(pg.name?.trim() || `Page ${pageOrder.length + 1}`);
      boards[name] = packList(ws); // tidy left→right, top→bottom in editor order
      pageOrder.push(name);
    }
    if (!pageOrder.length) return null;
    const placed = new Set(pageOrder.flatMap((p) => boards[p]!.map((w) => w.key)));
    const rest = catalog.filter((c) => !placed.has(c.key));
    if (rest.length) {
      const name = uniqName('More');
      boards[name] = packList(rest.map(mk));
      pageOrder.push(name);
    }
    return { pageOrder, page: pageOrder[0]!, boards };
  }
  // Default board: device-authentic editor pages when the server supplies a layout; otherwise a curated
  // "Main" page (EQ + the ~8 musician-facing knobs + bypass) and an "Advanced" page with everything else.
  function defaultBoard(): Board {
    const lay = layoutBoard();
    if (lay) return lay;
    const ideal = new Set(idealIds(editor.params));
    const main = catalog.filter((c) => c.key === 'eq' || c.key === 'bypass' || (c.kind === 'cont' && ideal.has(c.id)));
    const rest = catalog.filter((c) => !main.includes(c));
    const boards: Record<string, Widget[]> = { Main: packList(main.map(mk)) };
    const pageOrder = ['Main'];
    if (rest.length) {
      boards.Advanced = packList(rest.map(mk));
      pageOrder.push('Advanced');
    }
    return { pageOrder, page: 'Main', boards };
  }
  // reconcile a saved board against the current catalog (drop vanished controls, clamp sizes)
  function reconcile(b: Board): Board {
    const valid = new Set(catalog.map((c) => c.key));
    const boards: Record<string, Widget[]> = {};
    for (const pg of b.pageOrder) {
      let ws = (b.boards[pg] ?? []).filter((w) => valid.has(w.key)).map((w) => ({ ...w, w: clamp(w.w, 1, cols), h: clamp(w.h, 1, rows) }));
      // a board saved at a wider column count would put widgets at x beyond the current `cols`, which
      // overflows/clips on the right. If anything sticks out, re-pack the page so it wraps onto new
      // rows instead (never clip right) — keeps positions otherwise untouched.
      if (ws.some((w) => w.x < 0 || w.x + w.w > cols)) ws = packInto(ws, cols, MAX_ROWS);
      boards[pg] = ws;
    }
    const page = b.pageOrder.includes(b.page) ? b.page : b.pageOrder[0] ?? 'Main';
    return { pageOrder: b.pageOrder.length ? b.pageOrder : ['Main'], page, boards };
  }

  // load a slug's board (storage → reconcile, else default) when it first appears, the catalog changes, OR a
  // live config push from another UI bumps surfRev() (host↔remote arrange sync).
  let loadedSig = '';
  $effect(() => {
    const sig = slug + '|' + catalog.map((c) => c.key).join(',') + '|' + surfRev();
    if (!slug || catalog.length <= 1 || sig === loadedSig) return;
    const revChanged = loadedSig.split('|').pop() !== String(surfRev());
    loadedSig = sig;
    // restore (or initialise) this context's profile set, then load the active profile's board. Re-read the
    // meta from the store when a remote push lands (revChanged) so page renames/profiles sync too.
    let meta = profileMeta[slug];
    if (!meta || revChanged) {
      try {
        const raw = surfGet(PMKEY(slug));
        if (raw) meta = JSON.parse(raw);
      } catch {
        /* */
      }
      if (!meta) meta = { active: 'Default', names: ['Default', 'Blank'] };
      profileMeta = { ...profileMeta, [slug]: meta };
    }
    bySlug = { ...bySlug, [slug]: loadProfileBoard(slug, meta.active) };
  });

  // arrange is a desktop affordance — never leave it on when we drop to the phone layout
  $effect(() => {
    if (isMobile && editMode) editMode = false;
  });
  // searching shows a flat, live results list — leave arrange mode so results stay interactive
  $effect(() => {
    if (searching && editMode) editMode = false;
  });

  // viewport + container measurement
  $effect(() => {
    loadGrid();
    const onResize = () => (vw = window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
  $effect(() => {
    if (!containerEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = (containerEl?.clientWidth ?? 0) - 32;
      if (w > 0 && Math.abs(w - containerW) > 1) containerW = w;
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  // ── board mutation helpers ──
  function setWidgets(list: Widget[]) {
    if (!board) return;
    bySlug = { ...bySlug, [slug]: { ...board, boards: { ...board.boards, [board.page]: list } } };
    saveBoard(slug);
  }
  function setPage(pg: string) {
    if (!board) return;
    bySlug = { ...bySlug, [slug]: { ...board, page: pg } };
    openSelect = null;
    editingKey = null;
  }
  function find(id: string) {
    return widgets.find((w) => w.id === id);
  }
  // rename a page (double-click its tab in arrange mode)
  function renamePage(oldName: string, raw: string) {
    renamingPage = null;
    const name = raw.trim();
    if (!board || !name || name === oldName || board.pageOrder.includes(name)) return;
    const pageOrder = board.pageOrder.map((p) => (p === oldName ? name : p));
    const boards: Record<string, Widget[]> = {};
    for (const p of board.pageOrder) boards[p === oldName ? name : p] = board.boards[p] ?? [];
    bySlug = { ...bySlug, [slug]: { pageOrder, page: board.page === oldName ? name : board.page, boards } };
    saveBoard(slug);
  }
  // focus + select an input as soon as it mounts (page rename field)
  function focusEl(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function occupancy(except?: string) {
    const m = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (const w of widgets) {
      if (w.id === except) continue;
      for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) if (y < rows && x < cols) m[y][x] = true;
    }
    return m;
  }
  function fits(m: boolean[][], x: number, y: number, w: number, h: number) {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (m[j][i]) return false;
    return true;
  }
  function firstFit(m: boolean[][], w: number, h: number) {
    for (let y = 0; y <= rows - h; y++) for (let x = 0; x <= cols - w; x++) if (fits(m, x, y, w, h)) return { x, y };
    return null;
  }
  // gravity-pack a list into a c×r grid (used for the arrange board AND the mobile reflow)
  function packInto(list: Widget[], c: number, r: number) {
    const m = Array.from({ length: r }, () => new Array(c).fill(false));
    const fit = (x: number, y: number, w: number, h: number) => {
      if (x < 0 || y < 0 || x + w > c || y + h > r) return false;
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (m[j][i]) return false;
      return true;
    };
    const out: Widget[] = [];
    for (const w of list.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
      const pw = Math.min(w.w, c),
        ph = Math.min(w.h, r);
      let pos: { x: number; y: number } | null = null;
      for (let y = 0; y <= r - ph && !pos; y++) for (let x = 0; x <= c - pw && !pos; x++) if (fit(x, y, pw, ph)) pos = { x, y };
      if (!pos) pos = { x: 0, y: 0 };
      for (let j = pos.y; j < pos.y + ph; j++) for (let i = pos.x; i < pos.x + pw; i++) if (m[j]) m[j][i] = true;
      out.push({ ...w, x: pos.x, y: pos.y, w: pw, h: ph });
    }
    return out;
  }
  const MAX_ROWS = 512; // rows grow as needed — packing never caps vertically (only horizontally, by cols)
  const packList = (list: Widget[]) => packInto(list, cols, MAX_ROWS);

  // ── arrange-mode actions ──
  const toggleEdit = () => {
    editMode = !editMode;
    drag = null;
    editingKey = null;
    openSelect = null;
  };
  function toggleCompact() {
    compact = !compact;
    saveGrid();
    if (compact) setWidgets(packList(widgets));
  }
  function gridResize(dim: 'cols' | 'rows', d: number) {
    const v = clamp((dim === 'cols' ? cols : rows) + d, 4, dim === 'cols' ? 24 : 8);
    if (dim === 'cols') cols = v;
    else rows = v;
    saveGrid();
    // cols is a ZOOM level: re-pack every page into the new column count so tiles resize and wrap onto
    // new rows — never overflow sideways. (rows is just a minimum canvas height; content grows past it.)
    const next: Record<string, Board> = {};
    for (const s of Object.keys(bySlug)) {
      const b = bySlug[s];
      const boards: Record<string, Widget[]> = {};
      for (const pg of b.pageOrder) boards[pg] = packInto((b.boards[pg] ?? []).map((w) => ({ ...w, w: Math.min(w.w, cols), h: Math.min(w.h, rows) })), cols, MAX_ROWS);
      next[s] = { ...b, boards };
    }
    bySlug = next;
    if (effCompact) setTimeout(() => setWidgets(packList(widgets)), 0);
    saveBoard(slug);
  }
  function tidyUp() {
    setWidgets(packList(widgets));
    editor.showToast('Board tidied', accent);
  }
  function addPage() {
    if (!board) return;
    const n = 'Page ' + (board.pageOrder.length + 1);
    bySlug = { ...bySlug, [slug]: { pageOrder: [...board.pageOrder, n], page: n, boards: { ...board.boards, [n]: [] } } };
    saveBoard(slug);
  }
  function trayAdd(key: string) {
    const c = catByKey.get(key);
    if (!c) return;
    const m = occupancy();
    const pos = firstFit(m, c.w, c.h) || firstFit(m, 1, 1);
    if (!pos) {
      editor.showToast('No room — enlarge the grid', '#d6543f');
      return;
    }
    const w = Math.min(c.w, cols - pos.x),
      h = Math.min(c.h, rows - pos.y);
    setWidgets([...widgets, { id: 'w' + key + Date.now().toString(36), key, x: pos.x, y: pos.y, w, h, view: c.view }]);
  }
  function removeWidget(id: string) {
    setWidgets(widgets.filter((w) => w.id !== id));
  }
  function cycleView(id: string) {
    const w = find(id);
    const c = w && catByKey.get(w.key);
    if (!w || !c) return;
    const i = c.views.indexOf(w.view);
    setWidgets(widgets.map((x) => (x.id === id ? { ...x, view: c.views[(i + 1) % c.views.length] } : x)));
  }

  // ── value plumbing (live refs resolved by id each call) ──
  const knob = (id: number) => knobById.get(id);
  const enm = (id: number) => enumById.get(id);
  const pct = (id: number) => Math.round((knob(id)?.norm ?? 0) * 100);
  const valText = (id: number) => {
    const p = knob(id);
    return p ? fmtCompact(p) : '–';
  };
  function setNorm(id: number, n: number) {
    const p = knob(id);
    if (p) editor.setParam(p, clamp(n, 0, 1));
  }
  function togOn(id: number) {
    const e = enm(id);
    return e ? e.value === (e.options[1]?.value ?? 1) : false;
  }
  function togLabel(id: number) {
    const e = enm(id);
    if (!e) return '';
    return e.options.find((o) => o.value === e.value)?.label ?? (togOn(id) ? 'On' : 'Off');
  }
  function toggleEnum(id: number) {
    const e = enm(id);
    if (!e) return;
    const off = e.options[0]?.value ?? 0,
      on = e.options[1]?.value ?? 1;
    editor.setEnum(e, e.value === on ? off : on);
  }

  // a widget's pixel footprint + the knob dial size that fits it (reserves room for the label)
  const pxOf = (n: number) => n * cell + (n - 1) * GAP;
  // the value lives in the hover/tap bubble now, so the dial fills the tile — but leave room for the
  // card padding (16) + gap (5) + the label (~16) so the label never clips.
  const dialFor = (w: Widget) => clamp(Math.min(pxOf(w.w) - 14, pxOf(w.h) - 38), 30, 260);
  // anchor the value bubble above an element (knob/card), in screen coords (fixed-position)
  function showTip(el: HTMLElement, id: number, edit: boolean) {
    const r = el.getBoundingClientRect();
    tip = { id, cx: r.left + r.width / 2, cy: r.top, edit };
    if (edit) {
      editBuf = valText(id);
      setTimeout(() => {
        const i = document.getElementById('cs-input') as HTMLInputElement | null;
        i?.focus();
        i?.select();
      }, 0);
    }
  }
  function commitTip() {
    if (tip) {
      const p = knob(tip.id);
      const n = parseFloat(editBuf);
      if (p && !isNaN(n)) setNorm(tip.id, p.min != null && p.max != null ? normFromValue(n, p) : clamp(n / 100, 0, 1));
    }
    tip = null;
  }
  // full, readable value for the bubble — with units (4.0 dB, 470 Hz, 12 kHz, 63%)
  const fullVal = (id: number): string => {
    const p = knob(id);
    if (!p) return '–';
    const v = paramValue(p);
    if (p.unit === 'Hz' && Math.abs(v) >= 1000) return (v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + ' kHz';
    const u = paramUnit(p);
    const num = Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    return u ? `${num} ${u}` : num;
  };


  // move a widget to an adjacent page (drag to the left/right edge of the board)
  function migrateWidget(id: string, dir: number) {
    if (!board) return false;
    const o = board.pageOrder;
    const ni = o.indexOf(board.page) + dir;
    if (ni < 0 || ni >= o.length) return false;
    const target = o[ni];
    const w = widgets.find((x) => x.id === id);
    if (!w) return false;
    const tgt = board.boards[target] ?? [];
    const m = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (const tw of tgt) for (let y = tw.y; y < tw.y + tw.h; y++) for (let x = tw.x; x < tw.x + tw.w; x++) if (y < rows && x < cols) m[y][x] = true;
    const ww = Math.min(w.w, cols), wh = Math.min(w.h, rows);
    const pos = firstFit(m, ww, wh) || { x: 0, y: 0 };
    const moved = { ...w, x: pos.x, y: pos.y, w: ww, h: wh };
    bySlug = { ...bySlug, [slug]: { ...board, page: target, boards: { ...board.boards, [board.page]: widgets.filter((x) => x.id !== id), [target]: [...tgt, moved] } } };
    saveBoard(slug);
    return true;
  }

  // ── gestures (temp state in plain refs; not reactive) ──
  let vd: { id: number; sy: number; sn: number } | null = null; // cont vertical drag
  let tk: { id: number; rect: DOMRect; vertical: boolean } | null = null; // track drag
  let mv: { id: string; w: number; h: number; grabDX: number; grabDY: number; left: number; top: number; armed: boolean } | null = null; // move (grabDX/Y = px from tile's top-left to the grab point)
  let rz: { id: string; sx: number; sy: number; ow: number; oh: number } | null = null; // resize
  let sw: { sx: number; moved: boolean } | null = null; // page swipe

  function metrics() {
    const r = boardEl?.getBoundingClientRect() ?? ({ left: 0, top: 0 } as DOMRect);
    return { left: r.left, top: r.top, step: cell + GAP };
  }
  function onWidgetDown(e: PointerEvent, id: string, kind: Kind, pid: number, key: string) {
    if (editMode) {
      e.stopPropagation();
      const w = find(id);
      if (!w) return;
      const m = metrics();
      // px offset from the tile's own top-left to the grab point → the grabbed point stays under the cursor
      mv = { id, w: w.w, h: w.h, grabDX: e.clientX - (m.left + w.x * m.step), grabDY: e.clientY - (m.top + w.y * m.step), left: m.left, top: m.top, armed: false };
      drag = { id, x: w.x, y: w.y, w: w.w, h: w.h, valid: true };
      return;
    }
    if (kind === 'cont') {
      vd = { id: pid, sy: e.clientY, sn: knob(pid)?.norm ?? 0 };
      dragging = true; // keep the value bubble alive for the whole adjust, even if the cursor leaves
      showTip(e.currentTarget as HTMLElement, pid, false);
      e.stopPropagation();
    }
  }
  function onTrackDown(e: PointerEvent, id: string, pid: number, vertical: boolean) {
    if (editMode) return;
    e.stopPropagation();
    tk = { id: pid, rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), vertical };
    trackMove(e);
  }
  function trackMove(e: PointerEvent) {
    if (!tk) return;
    const frac = tk.vertical ? clamp(1 - (e.clientY - tk.rect.top) / tk.rect.height, 0, 1) : clamp((e.clientX - tk.rect.left) / tk.rect.width, 0, 1);
    setNorm(tk.id, frac);
  }
  function onResizeDown(e: PointerEvent, id: string) {
    e.stopPropagation();
    const w = find(id);
    if (!w) return;
    rz = { id, sx: e.clientX, sy: e.clientY, ow: w.w, oh: w.h };
  }
  function onBoardDown(e: PointerEvent) {
    if (editMode) return;
    if (!tip?.edit) tip = null; // tapping empty board dismisses the value bubble
    sw = { sx: e.clientX, moved: false };
  }

  $effect(() => {
    const onMove = (e: PointerEvent) => {
      if (mv) {
        e.preventDefault();
        // drag past the left/right edge of the board → carry the widget to the adjacent page
        const br = boardEl?.getBoundingClientRect();
        if (br) {
          const EDGE = 44;
          const dir = e.clientX > br.right - EDGE ? 1 : e.clientX < br.left + EDGE ? -1 : 0;
          if (dir === 0) mv.armed = true;
          else if (mv.armed && migrateWidget(mv.id, dir)) {
            const w = find(mv.id);
            if (w) {
              // re-grab from the tile centre so it sits under the cursor on the new page
              const step = cell + GAP;
              mv = { ...mv, w: w.w, h: w.h, grabDX: (w.w * step) / 2, grabDY: (w.h * step) / 2, armed: false };
              drag = { id: mv.id, x: w.x, y: w.y, w: w.w, h: w.h, valid: true };
            }
            return;
          }
        }
        const step = cell + GAP;
        let nx = Math.round((e.clientX - mv.left - mv.grabDX) / step);
        let ny = Math.round((e.clientY - mv.top - mv.grabDY) / step);
        nx = clamp(nx, 0, cols - mv.w);
        ny = clamp(ny, 0, rows - mv.h);
        const occ = occupancy(mv.id);
        const valid = effCompact ? true : fits(occ, nx, ny, mv.w, mv.h);
        if (!drag || drag.x !== nx || drag.y !== ny || drag.valid !== valid) drag = { id: mv.id, x: nx, y: ny, w: mv.w, h: mv.h, valid };
        return;
      }
      if (rz) {
        e.preventDefault();
        const step = cell + GAP;
        const dw = Math.round((e.clientX - rz.sx) / step),
          dh = Math.round((e.clientY - rz.sy) / step);
        const w = find(rz.id);
        if (!w) return;
        const nw = clamp(rz.ow + dw, 1, cols - w.x),
          nh = clamp(rz.oh + dh, 1, rows - w.y);
        if (nw === w.w && nh === w.h) return;
        if (!effCompact && !fits(occupancy(rz.id), w.x, w.y, nw, nh)) return;
        setWidgets(widgets.map((x) => (x.id === rz!.id ? { ...x, w: nw, h: nh } : x)));
        return;
      }
      if (tk) {
        e.preventDefault();
        trackMove(e);
        return;
      }
      if (vd) {
        e.preventDefault();
        setNorm(vd.id, vd.sn + (vd.sy - e.clientY) * 0.005);
        return;
      }
      if (sw && Math.abs(e.clientX - sw.sx) > 8) sw.moved = true;
    };
    const onUp = (e: PointerEvent) => {
      if (mv) {
        if (drag?.valid) {
          let b = widgets.map((x) => (x.id === mv!.id ? { ...x, x: drag!.x, y: drag!.y } : x));
          if (effCompact) b = packList(b);
          setWidgets(b);
        }
        mv = null;
        drag = null;
      }
      if (rz) {
        rz = null;
        if (effCompact) setWidgets(packList(widgets));
      }
      tk = null;
      if (vd) {
        vd = null;
        dragging = false;
        if (tip && !tip.edit) tip = null; // adjust released → hide the value bubble
      }
      if (sw) {
        const moved = sw.moved,
          dx = e.clientX - sw.sx;
        sw = null;
        if (moved && Math.abs(dx) > 60 && board) {
          const o = board.pageOrder,
            i = o.indexOf(board.page);
          const ni = clamp(i + (dx < 0 ? 1 : -1), 0, o.length - 1);
          if (ni !== i) setPage(o[ni]);
        }
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  });

  // value typing
  function startType(key: string, pid: number) {
    if (editMode) return;
    editingKey = key;
    editBuf = valText(pid);
    setTimeout(() => {
      const el = document.getElementById('cs-input') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    }, 0);
  }
  function commitType(pid: number) {
    const p = knob(pid);
    const n = parseFloat(editBuf);
    if (p && !isNaN(n)) setNorm(pid, p.min != null && p.max != null ? normFromValue(n, p) : clamp(n / 100, 0, 1));
    editingKey = null;
  }
  function nudge(pid: number, dir: number) {
    setNorm(pid, (knob(pid)?.norm ?? 0) + dir * 0.02);
  }

  function pinnable(c: Ctl | undefined): c is Ctl {
    return !!c && c.id >= 0 && (c.kind === 'cont' || c.kind === 'toggle' || c.kind === 'select');
  }

  function parameterSourceForControl(c: Ctl): WorkbenchParameterSource | null {
    if (!pinnable(c)) return null;
    return axisParameterSourceFromEditorParamId(
      {
        selected: editor.selected,
        params: editor.params,
        enums: editor.enums
      },
      c.id
    );
  }

  function onWorkbenchParameterDragStart(event: DragEvent, c: Ctl) {
    if (!workbenchCanPin || !pinnable(c)) return;
    const source = parameterSourceForControl(c);
    if (!source || !event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(WORKBENCH_PARAMETER_SOURCE_MIME, serializeWorkbenchParameterSource(source));
    event.dataTransfer.setData('text/plain', source.label);
    setFullTileDragImage(event);
  }

  // The browser's default drag image is a snapshot of the dragged node clipped to
  // whatever of it is on-screen — inside the scrolling control grid that clipped
  // the ghost to a fraction of the tile (T20 bug #1: "the dotted outline doesn't
  // wrap the whole tile"). Clone the tile off-screen at its full box and hand THAT
  // to setDragImage so the ghost always wraps the complete control being dragged.
  function setFullTileDragImage(event: DragEvent) {
    const tile = event.currentTarget as HTMLElement | null;
    if (!tile || typeof event.dataTransfer?.setDragImage !== 'function') return;
    const rect = tile.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const clone = tile.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.top = '-10000px';
    clone.style.left = '-10000px';
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.opacity = '1';
    document.body.appendChild(clone);
    event.dataTransfer.setDragImage(clone, event.clientX - rect.left, event.clientY - rect.top);
    // The spec snapshots the element synchronously; remove it once the drag has grabbed it.
    setTimeout(() => clone.remove(), 0);
  }

  async function pinControlToWorkbench(c: Ctl, target?: AxisPinTarget) {
    if (!workbenchCanPin || !workbench || !pinnable(c)) return;
    const result = await workbench.registry.runActionResult(AXIS_PIN_SELECTED_PARAMETERS_ACTION, {
      controller: workbench.controller,
      source: 'menu',
      args: {
        paramId: c.id,
        title: c.label,
        ...(target?.panelId ? { panelId: target.panelId } : {})
      }
    });
    if (result.success) {
      const where = target?.panelId ? ` to ${target.label}` : '';
      editor.showToast(`Pinned ${c.label}${where}`, '#35c9d6');
    }
  }

  // ── touch / context-menu pin path (HTML5 drag doesn't work on touch) ──
  let pinMenuOpen = $state(false);
  let pinMenuPos = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  let pinMenuCtl = $state<Ctl | null>(null);

  const pinMenuItems = $derived.by<WorkbenchMenuItem[]>(() => {
    if (!pinMenuOpen || !workbench || !pinMenuCtl) return [];
    const c = pinMenuCtl;
    return buildAxisPinMenuItems(workbench.controller.document, (target) => void pinControlToWorkbench(c, target));
  });

  function openPinMenuAt(c: Ctl, pos: WorkbenchMenuPosition) {
    if (!workbenchCanPin || !pinnable(c)) return;
    pinMenuCtl = c;
    pinMenuPos = pos;
    pinMenuOpen = true;
  }

  function onPinContextMenu(event: MouseEvent, c: Ctl) {
    if (!workbenchCanPin || !pinnable(c)) return;
    event.preventDefault();
    openPinMenuAt(c, menuPositionFromPointer(event));
  }

  function onPinLongPress(c: Ctl, detail: { x: number; y: number }) {
    openPinMenuAt(c, detail);
  }

  function closePinMenu() {
    pinMenuOpen = false;
    pinMenuCtl = null;
  }

  function pagePinIds(): number[] {
    const seen = new Set<number>();
    const ids: number[] = [];
    for (const widget of viewWidgets) {
      const c = catByKey.get(widget.key);
      if (!pinnable(c) || seen.has(c.id)) continue;
      seen.add(c.id);
      ids.push(c.id);
    }
    return ids;
  }

  async function pinPageToWorkbench() {
    if (!workbenchCanPin || !workbench) return;
    const paramIds = pagePinIds();
    if (!paramIds.length) return;
    const block = editor.selected?.display ?? 'Block';
    const result = await workbench.registry.runActionResult(AXIS_PIN_SELECTED_PARAMETERS_ACTION, {
      controller: workbench.controller,
      source: 'host',
      args: {
        paramIds,
        title: `${block} Controls`
      }
    });
    if (result.success) editor.showToast(`Pinned ${paramIds.length} controls`, '#35c9d6');
  }

  // dropdown popover geometry
  const selMenu = $derived.by(() => {
    if (!openSelect) return null;
    const w = find(openSelect);
    const c = w && catByKey.get(w.key);
    const e = c && enm(c.id);
    if (!w || !c || !e) return null;
    const step = cell + GAP;
    return { id: w.id, e, left: w.x * step, top: (w.y + w.h) * step + 2, width: Math.max(w.w * cell + (w.w - 1) * GAP, 160) };
  });

  // svg knob pointer transform
  const knobRot = (p: number) => (-135 + 2.7 * p).toFixed(1);
</script>

<!-- page tabs + live control search (wrapping chip rows — never a horizontal scrollbar) -->
<div class="tabs">
  <div class="csearch" class:active={searching}>
    <svg width="15" height="15" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10.8 10.8 L14.5 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    <input class="csin" placeholder="Find a control…" bind:value={q} />
    {#if searching}<button class="csx" aria-label="Clear search" onclick={() => { q = ''; resSel = null; }}>✕</button>{/if}
  </div>
  {#if !searching}
    {#if board}
      {#each board.pageOrder as pg (pg)}
        {#if renamingPage === pg}
          <input class="tab tabedit" value={pg} use:focusEl onkeydown={(e) => (e.key === 'Enter' ? e.currentTarget.blur() : e.key === 'Escape' ? (renamingPage = null) : null)} onblur={(e) => renamePage(pg, e.currentTarget.value)} />
        {:else}
          <button class="tab" class:on={pg === board.page} onclick={() => setPage(pg)} ondblclick={() => editMode && (renamingPage = pg)} title={editMode ? 'Double-click to rename' : ''}>{pg}</button>
        {/if}
      {/each}
    {/if}
    {#if editMode}
      <button class="tab addp" title="Add page" onclick={addPage}>＋</button>
    {/if}
    <span class="tab-sp"></span>
    <!-- Axis-Layouts: switch between named layout profiles (Default = device-authentic, Blank, custom) -->
    <div class="profwrap">
      <button class="profbtn" class:on={profMenuOpen} onclick={toggleProfMenu} title="Layout profile">
        <span class="prof-ic">▤</span><span class="prof-name">{activeProfile}</span><span class="prof-caret">▾</span>
      </button>
      {#if profMenuOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="profmenu" style="top:{profMenuPos?.top ?? 100}px; right:{profMenuPos?.right ?? 8}px" onpointerleave={() => (profMenuOpen = false)}>
          {#each profileNames as p (p)}
            <button class="profitem" class:on={p === activeProfile} onclick={() => setProfile(p)}>
              <span class="pi-name">{p === 'Default' ? '✦ Default' : p === 'Blank' ? '▢ Blank' : p}</span>
              {#if p === 'Default'}<span class="pi-hint">device</span>{/if}
              {#if p !== 'Default' && p !== 'Blank'}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <span class="pi-del" role="button" tabindex="0" title="Delete layout" onclick={(e) => { e.stopPropagation(); deleteProfile(p); }}>✕</span>
              {/if}
            </button>
          {/each}
          <div class="profsep"></div>
          <button class="profitem act" onclick={addProfile}>＋ New layout (copy)</button>
          <button class="profitem act" onclick={resetActiveToDevice} title="Discard customization, reseed from the device layout">↺ Reset to device</button>
        </div>
      {/if}
    </div>
    {#if !isMobile}
      <button class="arrange" class:on={editMode} onclick={toggleEdit} title="Lock = use · Unlock = arrange">
        <span>{editMode ? '🔓' : '🔒'}</span>{editMode ? 'Arranging' : 'Arrange'}
      </button>
    {/if}
  {/if}
</div>

{#if searching}
  <!-- live search results: every matching control, flat, ignoring tabs -->
  <div class="content scroll">
    <div class="results">
      {#each matches as c (c.key)}
        {@const view = viewOf(c)}
        <div
          class="restile"
          class:wide={c.kind === 'select' || (c.kind === 'cont' && view === 'slider')}
          class:nobg={c.kind === 'action'}
          role="group"
          aria-label={c.label}
          draggable={workbenchCanPin && pinnable(c)}
          ondragstart={(e) => onWorkbenchParameterDragStart(e, c)}
          oncontextmenu={(e) => onPinContextMenu(e, c)}
          use:longPress={{ onLongPress: (d) => onPinLongPress(c, d) }}
        >
          {#if c.kind === 'cont' && view === 'knob'}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="dialwrap" style:width="60px" style:height="60px"
              onpointerdown={(e) => resKnobDown(e, c.id)}
              onmouseenter={(e) => { if (!isMobile) showTip(e.currentTarget, c.id, false); }}
              onmouseleave={() => { if (!dragging && !tip?.edit) tip = null; }}
              ondblclick={(e) => showTip(e.currentTarget, c.id, true)}>
              <svg width="60" height="60" viewBox="0 0 64 64" style="display:block">
                <circle cx="32" cy="32" r="25" fill="none" style="stroke:var(--border2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="117.8 300" transform="rotate(135 32 32)" />
                <circle cx="32" cy="32" r="25" fill="none" stroke={accent} stroke-width="5" stroke-linecap="round" stroke-dasharray="{((pct(c.id) / 100) * 117.8).toFixed(1)} 300" transform="rotate(135 32 32)" />
                <circle cx="32" cy="32" r="15" style="fill:var(--surface2)" stroke="#000" stroke-width="1" />
                <g transform="rotate({knobRot(pct(c.id))} 32 32)"><circle cx="32" cy="20" r="2.8" fill="#f5a623" /></g>
              </svg>
            </div>
            <div class="lbl">{c.label}</div>
          {:else if c.kind === 'cont' && view === 'fader'}
            {#if editingKey === c.key}
              <input id="cs-input" class="kinput rel" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => (e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null)} onblur={() => commitType(c.id)} />
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
              <div class="kval rel" ondblclick={() => startType(c.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
            {/if}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="vtrack" onpointerdown={(e) => onTrackDown(e, c.key, c.id, true)}>
              <div class="vfill" style:height="{pct(c.id)}%"></div>
              <div class="vhandle" style:bottom="calc({pct(c.id)}% - 8px)"></div>
            </div>
            <div class="lbl">{c.label}</div>
          {:else if c.kind === 'cont' && view === 'number'}
            <div class="numrow">
              <button class="step" onclick={() => nudge(c.id, -1)}>−</button>
              {#if editingKey === c.key}
                <input id="cs-input" class="kinput big" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => (e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null)} onblur={() => commitType(c.id)} />
              {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="kval big" ondblclick={() => startType(c.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
              {/if}
              <button class="step" onclick={() => nudge(c.id, 1)}>＋</button>
            </div>
            <div class="lbl">{c.label}</div>
          {:else if c.kind === 'cont'}
            <!-- slider (default for cont) -->
            <div class="srow">
              <span class="slbl">{c.label}</span>
              {#if editingKey === c.key}
                <input id="cs-input" class="kinput" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => (e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null)} onblur={() => commitType(c.id)} />
              {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="kval cy" ondblclick={() => startType(c.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
              {/if}
            </div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="htrack" onpointerdown={(e) => onTrackDown(e, c.key, c.id, false)}>
              <div class="hfill" style:width="{pct(c.id)}%"></div>
              <div class="hhandle" style:left="calc({pct(c.id)}% - 8px)"></div>
            </div>
          {:else if c.kind === 'toggle' && view === 'switch'}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="switch" class:on={togOn(c.id)} onclick={() => toggleEnum(c.id)}><div class="snob"></div></div>
            <div class="lbl">{c.label}</div>
          {:else if c.kind === 'toggle'}
            <!-- button (default for toggle) -->
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="onoff" class:on={togOn(c.id)} onclick={() => toggleEnum(c.id)} title={togLabel(c.id)}>
              <span class="dot"></span><span class="onoff-l">{c.label}</span>
            </div>
          {:else if c.kind === 'select'}
            <div class="seltop">{c.label}</div>
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="selfield" class:open={resSel?.id === c.id} onclick={(e) => openResSel(e, c.id)}>
              <span class="seltxt">{enm(c.id)?.options.find((o) => o.value === enm(c.id)?.value)?.label ?? '–'}</span>
              <span class="caret">▾</span>
            </div>
          {:else if c.kind === 'action'}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="action" class:byp={editor.selected?.bypassed} onclick={() => editor.toggleBypass()}>{editor.selected?.bypassed ? 'Bypassed' : 'Engaged'}</div>
          {/if}
        </div>
      {/each}
      {#if matches.length === 0}<div class="nores">No controls match “{q}”.</div>{/if}
    </div>
  </div>
{:else}
<!-- arrange toolbar -->
{#if editMode}
  <div class="arrbar">
    <span class="ab-tag">ARRANGE</span>
    <div class="stepper"><span class="sl">COLS</span><button onclick={() => gridResize('cols', -1)}>−</button><span class="sv">{cols}</span><button onclick={() => gridResize('cols', 1)}>＋</button></div>
    <div class="stepper"><span class="sl">ROWS</span><button onclick={() => gridResize('rows', -1)}>−</button><span class="sv">{rows}</span><button onclick={() => gridResize('rows', 1)}>＋</button></div>
    <span class="ab-note">applies to every block</span>
    <span class="ab-sp"></span>
    {#if workbenchCanPin}
      <button class="ab-btn" onclick={pinPageToWorkbench} title="Pin this page to a Workbench custom panel">⌖ Pin page</button>
    {/if}
    <button class="ab-btn" class:on={effCompact} onclick={toggleCompact} title="Free = leave gaps · Packed = no holes">{effCompact ? '⊞ Packed' : '⊡ Free'}</button>
    <button class="ab-btn" onclick={tidyUp}>⤢ Tidy up</button>
  </div>
{/if}

<!-- board -->
<div class="content scroll" bind:this={containerEl}>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="boardwrap" bind:this={boardEl} onpointerdown={onBoardDown} style:width="{displayCols * cell + (displayCols - 1) * GAP}px" style:height="{viewRows * cell + (viewRows - 1) * GAP}px">
    {#if editMode}
      <div class="gridlayer" style:grid-template-columns="repeat({cols}, {cell}px)" style:grid-template-rows="repeat({rows}, {cell}px)" style:gap="{GAP}px">
        {#each Array(cols * rows) as _, i (i)}<div class="gcell"></div>{/each}
      </div>
    {/if}

    <div class="gridlayer" style:grid-template-columns="repeat({displayCols}, {cell}px)" style:grid-template-rows="repeat({viewRows}, {cell}px)" style:gap="{GAP}px">
      {#if drag}
        <div class="ghost" class:bad={!drag.valid} style:grid-column="{drag.x + 1} / span {drag.w}" style:grid-row="{drag.y + 1} / span {drag.h}"></div>
      {/if}

      {#each viewWidgets as w (w.id)}
        {@const c = catByKey.get(w.key)}
        {#if c}
          <div style:grid-column="{w.x + 1} / span {w.w}" style:grid-row="{w.y + 1} / span {w.h}" style:min-width="0" style:min-height="0" style:position="relative">
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div
              class="card"
              class:editing={editMode}
              class:nobg={w.view === 'action' || w.view === 'eq'}
              class:dragging={drag?.id === w.id}
              draggable={workbenchCanPin && pinnable(c) && !editMode}
              ondragstart={(e) => onWorkbenchParameterDragStart(e, c)}
              oncontextmenu={(e) => { if (!editMode) onPinContextMenu(e, c); }}
              use:longPress={{ onLongPress: (d) => { if (!editMode) onPinLongPress(c, d); } }}
              onpointerdown={(e) => onWidgetDown(e, w.id, c.kind, c.id, c.key)}
              onmouseenter={() => { if (!isMobile && !editMode && c.id >= 0) showParamHelp(c.id, c.label); }}
              onmouseleave={clearParamHelp}
            >
              {#if !editMode && c.kind === 'cont'}
                <!-- MODIFIER BADGE — opens the modifier editor (active modifier; per-control binding pending decode) -->
                <button class="modbadge" onpointerdown={(e) => e.stopPropagation()} onclick={() => openMod(c)} title="Edit modifier">∿</button>
              {/if}
              {#if c.kind === 'cont' && w.view === 'knob'}
                {@const d = dialFor(w)}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div
                  class="dialwrap"
                  style:width="{d}px"
                  style:height="{d}px"
                  onmouseenter={(e) => { if (!isMobile && !editMode) showTip(e.currentTarget, c.id, false); }}
                  onmouseleave={() => { if (!dragging && !tip?.edit) tip = null; }}
                  ondblclick={(e) => { if (!editMode) showTip(e.currentTarget, c.id, true); }}
                >
                  <svg width={d} height={d} viewBox="0 0 64 64" style="display:block">
                    <circle cx="32" cy="32" r="25" fill="none" style="stroke:var(--border2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="117.8 300" transform="rotate(135 32 32)" />
                    <circle cx="32" cy="32" r="25" fill="none" stroke={accent} stroke-width="5" stroke-linecap="round" stroke-dasharray="{((pct(c.id) / 100) * 117.8).toFixed(1)} 300" transform="rotate(135 32 32)" />
                    <circle cx="32" cy="32" r="15" style="fill:var(--surface2)" stroke="#000" stroke-width="1" />
                    <g transform="rotate({knobRot(pct(c.id))} 32 32)"><circle cx="32" cy="20" r="2.8" fill="#f5a623" /></g>
                  </svg>
                </div>
                <div class="lbl">{c.label}</div>
              {:else if c.kind === 'cont' && w.view === 'fader'}
                {#if editingKey === w.key}
                  <input id="cs-input" class="kinput rel" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null} onblur={() => commitType(c.id)} onpointerdown={(e) => e.stopPropagation()} />
                {:else}
                  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                  <div class="kval rel" ondblclick={() => startType(w.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
                {/if}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="vtrack" onpointerdown={(e) => onTrackDown(e, w.id, c.id, true)}>
                  <div class="vfill" style:height="{pct(c.id)}%"></div>
                  <div class="vhandle" style:bottom="calc({pct(c.id)}% - 8px)"></div>
                </div>
                <div class="lbl">{c.label}</div>
              {:else if c.kind === 'cont' && w.view === 'slider'}
                <div class="srow">
                  <span class="slbl">{c.label}</span>
                  {#if editingKey === w.key}
                    <input id="cs-input" class="kinput" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null} onblur={() => commitType(c.id)} onpointerdown={(e) => e.stopPropagation()} />
                  {:else}
                    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                    <div class="kval cy" ondblclick={() => startType(w.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
                  {/if}
                </div>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="htrack" onpointerdown={(e) => onTrackDown(e, w.id, c.id, false)}>
                  <div class="hfill" style:width="{pct(c.id)}%"></div>
                  <div class="hhandle" style:left="calc({pct(c.id)}% - 8px)"></div>
                </div>
              {:else if c.kind === 'cont' && w.view === 'number'}
                <div class="numrow">
                  <button class="step" onpointerdown={(e) => e.stopPropagation()} onclick={() => nudge(c.id, -1)}>−</button>
                  {#if editingKey === w.key}
                    <input id="cs-input" class="kinput big" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null} onblur={() => commitType(c.id)} onpointerdown={(e) => e.stopPropagation()} />
                  {:else}
                    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                    <div class="kval big" ondblclick={() => startType(w.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
                  {/if}
                  <button class="step" onpointerdown={(e) => e.stopPropagation()} onclick={() => nudge(c.id, 1)}>＋</button>
                </div>
                <div class="lbl">{c.label}</div>
              {:else if c.kind === 'toggle' && w.view === 'button'}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="onoff" class:on={togOn(c.id)} onpointerdown={(e) => e.stopPropagation()} onclick={() => !editMode && toggleEnum(c.id)} title={togLabel(c.id)}>
                  <span class="dot"></span><span class="onoff-l">{c.label}</span>
                </div>
              {:else if c.kind === 'toggle' && w.view === 'switch'}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="switch" class:on={togOn(c.id)} onpointerdown={(e) => e.stopPropagation()} onclick={() => !editMode && toggleEnum(c.id)}><div class="snob"></div></div>
                <div class="lbl">{c.label}</div>
              {:else if c.kind === 'select'}
                <div class="seltop">{c.label}</div>
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="selfield" class:open={openSelect === w.id} onpointerdown={(e) => e.stopPropagation()} onclick={() => !editMode && (openSelect = openSelect === w.id ? null : w.id)}>
                  <span class="seltxt">{enm(c.id)?.options.find((o) => o.value === enm(c.id)?.value)?.label ?? '–'}</span>
                  <span class="caret">▾</span>
                </div>
              {:else if c.kind === 'eq'}
                <div class="eqtitle" style:left="{editMode ? 34 : 12}px">{c.label}</div>
                <div class="eqbox" style:pointer-events={editMode ? 'none' : 'auto'}>
                  <EQGraph bands={eqBands} gainRange={eqGainRange} {accent} onSet={(p, n) => editor.setParam(p, n)} />
                </div>
              {:else if c.kind === 'action'}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="action" class:byp={editor.selected?.bypassed} onpointerdown={(e) => e.stopPropagation()} onclick={() => !editMode && editor.toggleBypass()}>{editor.selected?.bypassed ? 'Bypassed' : 'Engaged'}</div>
              {:else if c.kind === 'meter'}
                <div class="kval rel">{meterDbText}</div>
                <div class="mrow" title="Live level ({c.label})">
                  {#each (mons.length ? mons : [null]) as m}
                    <div class="mcol">
                      <div class="mtrack">
                        <div class="mfill" style:height="{Math.round(meterFill(m) * 100)}%" style:background={meterFill(m) >= 0.92 ? '#d6543f' : meterFill(m) >= 0.75 ? '#f5a623' : accent}></div>
                      </div>
                      {#if mons.length > 1 && m}<div class="mtag">{meterTag(m)}</div>{/if}
                    </div>
                  {/each}
                </div>
                <div class="lbl">{c.label}</div>
              {:else if c.kind === 'wave'}
                <!-- looper waveform: envelope bars around the centre + a live playhead line -->
                <div class="wavebox" title="Looper waveform">
                  <svg class="wavesvg" viewBox="0 0 {NWAVE} 40" preserveAspectRatio="none">
                    {#each waveBars as mag, i}
                      <rect x={i + 0.15} y={20 - mag * 19} width="0.7" height={Math.max(0.5, mag * 38)} fill={accent} opacity="0.85" />
                    {/each}
                    <line class="playhead" x1={wavePos * NWAVE} y1="0" x2={wavePos * NWAVE} y2="40" />
                  </svg>
                  {#if editor.looperWave?.level != null}
                    <div class="wavelvl"><div class="mfill" style:width="{Math.round((editor.looperWave.level ?? 0) * 100)}%" style:background={accent}></div></div>
                  {/if}
                  <div class="loopbtns">
                    {#each LOOP_BTNS as [act, sym]}
                      <button class="loopbtn" class:on={loopLatch[act]} class:rec={act === 'record'}
                        onpointerdown={(e) => e.stopPropagation()} onclick={() => pressLoop(act)}>{sym}</button>
                    {/each}
                  </div>
                </div>
                <div class="lbl">{c.label}</div>
              {/if}

              {#if editMode}
                <div class="chrome"></div>
                <div class="dims">{w.w}×{w.h}</div>
                <button class="wx" onpointerdown={(e) => e.stopPropagation()} onclick={() => removeWidget(w.id)}>✕</button>
                {#if c.views.length > 1}
                  <button class="vcyc" onpointerdown={(e) => e.stopPropagation()} onclick={() => cycleView(w.id)} title="Change control type"><span>{VIEW_ICON[w.view]}</span>{w.view}</button>
                {/if}
                {#if c.kind === 'cont'}
                  {@const sp = knob(c.id)}
                  <button class="qbadge" class:on={editor.isSwipeControl(c.id)} onpointerdown={(e) => e.stopPropagation()} onclick={() => sp && editor.toggleSwipeControl(sp)} title="Map to grid swipe control (adjust from the Signal Grid tile)">⚡</button>
                {/if}
                {#if workbenchCanPin && pinnable(c)}
                  <button class="pinbadge" onpointerdown={(e) => e.stopPropagation()} onclick={() => pinControlToWorkbench(c)} title="Pin to a Workbench custom panel">⌖</button>
                {/if}
                <button class="rsz" onpointerdown={(e) => onResizeDown(e, w.id)} aria-label="Resize">
                  <svg width="13" height="13" viewBox="0 0 13 13"><path d="M12 5 L5 12 M12 9 L9 12 M12 1 L1 12" stroke={accent} stroke-width="1.6" stroke-linecap="round" /></svg>
                </button>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>

    {#if selMenu}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="selbg" onpointerdown={() => (openSelect = null)}></div>
      <div class="selmenu" style:left="{selMenu.left}px" style:top="{selMenu.top}px" style:width="{selMenu.width}px">
        {#each selMenu.e.options as o (o.value)}
          <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
          <div class="selopt" class:on={o.value === selMenu.e.value} onpointerdown={(e) => e.stopPropagation()} onclick={() => { editor.setEnum(selMenu!.e, o.value); openSelect = null; }}>{o.label}</div>
        {/each}
      </div>
    {/if}
  </div>

  {#if widgets.length === 0}
    <div class="boardempty">{editMode ? 'Empty page — add controls below' : 'Empty page — unlock to arrange'}</div>
  {/if}
</div>

<!-- widget tray -->
{#if editMode}
  <div class="tray">
    <div class="tray-h"><span class="th-tag">ADD CONTROL</span><span class="th-note">tap to drop into the first free slot</span></div>
    <div class="tray-row ws-scroll">
      {#each tray as t (t.key)}
        <button class="traychip" onclick={() => trayAdd(t.key)}>
          <span class="tc-ic">{VIEW_ICON[t.view]}</span>
          <span class="tc-txt"><span class="tc-name">{t.label}</span><span class="tc-meta">{t.kind} · {t.w}×{t.h}</span></span>
          <span class="tc-plus">＋</span>
        </button>
      {/each}
      {#if tray.length === 0}<div class="tray-empty">All controls are on the board.</div>{/if}
    </div>
  </div>
{/if}
{/if}

<!-- value bubble: one fixed-position tooltip, above everything, never clipped -->
{#if tip}
  <div class="tip" style:left="{tip.cx}px" style:top="{tip.cy}px">
    {#if tip.edit}
      <input id="cs-input" class="tipinput" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => (e.key === 'Enter' ? commitTip() : e.key === 'Escape' ? (tip = null) : null)} onblur={commitTip} onpointerdown={(e) => e.stopPropagation()} />
    {:else}
      {fullVal(tip.id)}
    {/if}
  </div>
{/if}

<!-- results select popover: fixed-position, anchored to the field (escapes the scroll container) -->
{#if resSel}
  {@const re = enm(resSel.id)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="respop-bg" onpointerdown={() => (resSel = null)}></div>
  {#if re}
    <div class="respop" style:left="{resSel.left}px" style:top="{resSel.top}px" style:width="{resSel.width}px">
      {#each re.options as o (o.value)}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="selopt" class:on={o.value === re.value} onpointerdown={(e) => e.stopPropagation()} onclick={() => { editor.setEnum(re, o.value); resSel = null; }}>{o.label}</div>
      {/each}
    </div>
  {/if}
{/if}

<!-- modifier editor flyout (opened from a control's ∿ badge) -->
<ModifierFlyout open={modOpen} label={modLabel} targetEffectId={modTargetEid} targetParam={modTargetParam} onClose={() => (modOpen = false)} />

<!-- pin-to-panel menu: touch (long-press) + mouse (right-click) alternative to HTML5 drag -->
{#if workbenchCanPin}
  <ContextMenu open={pinMenuOpen} position={pinMenuPos} items={pinMenuItems} label="Pin to custom panel" onClose={closePinMenu} />
{/if}

<style>
  .modbadge {
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 7;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--border);
    color: var(--textmuted);
    transition: all 0.12s;
  }
  .modbadge:hover {
    border-color: #a06bed;
    color: #c9a6ff;
    background: rgba(160, 107, 237, 0.14);
  }
  .tabs {
    display: flex;
    align-items: center;
    flex-wrap: wrap; /* same chip-row pattern as the preset browser's filter chips — wrap, don't scroll */
    gap: 8px;
    padding: 10px 14px 6px;
    flex: none;
  }
  /* phones: the search takes the first line, the page tabs wrap as chips below it */
  @media (max-width: 759px) {
    .tabs .csearch {
      flex-basis: 100%;
    }
  }
  .tab {
    flex: none;
    padding: 8px 14px;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--textdim);
  }
  .tab.on {
    background: rgba(245, 166, 35, 0.12);
    border-color: var(--amber-border);
    color: var(--amber);
  }
  .tab.addp {
    border-style: dashed;
    color: var(--textfaint);
  }
  .tabedit {
    width: 110px;
    background: var(--bg2);
    border-color: var(--accent);
    color: var(--amber);
    outline: none;
    font-family: inherit;
  }
  .tab-sp {
    flex: 1;
  }
  /* ── layout-profile switcher ── */
  .profwrap {
    position: relative;
    flex: none;
  }
  .profbtn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 11px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
  }
  .profbtn.on,
  .profbtn:hover {
    border-color: var(--blue);
    color: #cdd6ff;
  }
  .prof-ic {
    opacity: 0.7;
  }
  .prof-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .prof-caret {
    font-size: 9px;
    opacity: 0.7;
  }
  .profmenu {
    position: fixed;
    z-index: 80;
    min-width: 200px;
    padding: 5px;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 12px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
  }
  .profitem {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text2);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .profitem:hover {
    background: var(--surface2);
  }
  .profitem.on {
    color: #cdd6ff;
    background: rgba(79, 107, 237, 0.14);
  }
  .profitem.act {
    color: var(--textdim);
    font-weight: 500;
  }
  .pi-name {
    flex: 1;
  }
  .pi-hint {
    font-size: 10px;
    color: var(--textfaint);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .pi-del {
    color: var(--textfaint);
    font-size: 11px;
    padding: 2px 5px;
    border-radius: 6px;
  }
  .pi-del:hover {
    color: var(--danger);
    background: rgba(255, 107, 107, 0.12);
  }
  .profsep {
    height: 1px;
    margin: 5px 2px;
    background: var(--border2);
  }
  .arrange {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 36px;
    padding: 0 13px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--textdim);
  }
  .arrange.on {
    background: linear-gradient(180deg, var(--accent-tint), var(--accent-tint));
    border-color: var(--accent);
    color: var(--accentbright);
  }
  .arrbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 9px 14px;
    flex: none;
    background: rgba(53, 201, 214, 0.05);
    border-top: 1px solid rgba(53, 201, 214, 0.14);
    border-bottom: 1px solid rgba(53, 201, 214, 0.14);
  }
  .ab-tag {
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--accentbright);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 7px 0 11px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .stepper .sl {
    font: 600 9px/1 var(--font-mono);
    color: var(--textfaint);
    letter-spacing: 0.06em;
  }
  .stepper .sv {
    font: 700 13px/1 var(--font-mono);
    color: var(--text);
    width: 16px;
    text-align: center;
  }
  .stepper button {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: 0;
    cursor: pointer;
    font-size: 15px;
    color: var(--text2);
    background: var(--surface2);
  }
  .ab-note {
    font: 500 10px/1 var(--font-mono);
    color: var(--textmuted);
  }
  .ab-sp {
    flex: 1;
  }
  .ab-btn {
    height: 34px;
    padding: 0 13px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
  }
  .ab-btn.on {
    background: var(--accent-tint);
    border-color: var(--accent);
    color: var(--accentbright);
  }
  .content {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow-x: hidden; /* board is a zoom grid — it wraps to new rows, never scrolls sideways */
    overflow-y: auto;
    /* Reserve the scrollbar gutter so clientWidth stays constant whether or not the vertical scrollbar is
       showing. Without this, the board's cell size (derived from clientWidth) and its height (rows × cell)
       form a feedback loop: the scrollbar appears → width drops → height drops → scrollbar hides → repeat,
       which shows up as the whole board jittering left/right a few px in arrange mode. */
    scrollbar-gutter: stable;
    padding: 16px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  /* styled scrollbars (vertical) across the surface's scroll areas */
  .content::-webkit-scrollbar,
  .tray-row::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  .content::-webkit-scrollbar-thumb,
  .tray-row::-webkit-scrollbar-thumb {
    background: var(--border2);
    border: 2px solid transparent;
    background-clip: content-box;
    border-radius: 8px;
  }
  .content::-webkit-scrollbar-thumb:hover,
  .tray-row::-webkit-scrollbar-thumb:hover {
    background: var(--border3);
    background-clip: content-box;
  }
  .content::-webkit-scrollbar-track,
  .tray-row::-webkit-scrollbar-track {
    background: transparent;
  }
  .content,
  .tray-row {
    scrollbar-width: thin;
    scrollbar-color: var(--border2) transparent;
  }
  .boardwrap {
    position: relative;
    flex: none;
    touch-action: none;
  }
  .gridlayer {
    position: absolute;
    inset: 0;
    display: grid;
  }
  .gcell {
    border-radius: 8px;
    border: 1px dashed var(--surface2);
    background: rgba(255, 255, 255, 0.012);
  }
  .ghost {
    border-radius: 11px;
    z-index: 5;
    border: 2px dashed var(--accent);
    background: rgba(53, 201, 214, 0.12);
  }
  .ghost.bad {
    border-color: var(--danger);
    background: rgba(214, 84, 63, 0.12);
  }
  .card {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 11px;
    box-sizing: border-box;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
    border: 1px solid var(--surface2);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 8px;
    overflow: visible; /* let the value bubble pop above the tile */
    user-select: none;
    touch-action: none;
    cursor: ns-resize;
  }
  .card.nobg {
    background: transparent;
    border-color: transparent;
    padding: 0;
  }
  .card.editing {
    cursor: grab;
    border-color: var(--border2);
    /* reserve the top + bottom bands so the ✕ / type-chip / ⚡ / resize don't sit on the label */
    padding-top: 22px;
    padding-bottom: 26px;
  }
  /* in arrange mode the whole tile is grabbable — the controls don't intercept the pointer,
     only the chrome buttons (remove / retype / resize) stay interactive */
  .card.editing > :not(.wx):not(.vcyc):not(.rsz):not(.qbadge):not(.pinbadge) {
    pointer-events: none;
  }
  .card.dragging {
    opacity: 0.28;
  }
  .dialwrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* value speech-bubble — fixed-position so it floats above everything and is never clipped */
  .tip {
    position: fixed;
    transform: translate(-50%, calc(-100% - 11px));
    z-index: 9999;
    padding: 8px 14px;
    border-radius: 10px;
    background: var(--input);
    border: 1px solid color-mix(in srgb, var(--accent, var(--accent)) 55%, var(--border2));
    color: var(--text);
    font: 700 17px/1 var(--font-mono);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  }
  .tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--input);
  }
  .tipinput {
    width: 90px;
    text-align: center;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--text);
    font: 700 17px/1 var(--font-mono);
    pointer-events: auto;
  }
  .kval {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 600 15px/1 var(--font-mono);
    color: var(--text);
    cursor: text;
  }
  .kval.rel,
  .kinput.rel {
    position: relative;
    inset: auto;
  }
  .kval.cy {
    color: var(--accentbright);
  }
  .kval.big {
    font-size: 28px;
    font-weight: 700;
    min-width: 44px;
  }
  .kinput {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 70%;
    text-align: center;
    background: var(--input);
    border: 1px solid var(--accent);
    border-radius: 6px;
    color: var(--text);
    font: 600 15px/1 var(--font-mono);
    outline: none;
    padding: 3px 0;
  }
  .kinput.rel {
    position: relative;
    left: auto;
    top: auto;
    transform: none;
    width: 70%;
  }
  .kinput.big {
    position: relative;
    left: auto;
    top: auto;
    transform: none;
    width: 64px;
    font-size: 24px;
    font-weight: 700;
  }
  .lbl {
    font-weight: 600;
    font-size: 12px;
    color: var(--text2);
    text-align: center;
    line-height: 1.1;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vtrack {
    position: relative;
    width: 14px;
    flex: 1;
    min-height: 18px;
    margin: 7px 0;
    border-radius: 8px;
    background: var(--track);
    border: 1px solid var(--border);
    cursor: ns-resize;
  }
  .vfill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, var(--accentbright), var(--accent));
    border-radius: 8px;
  }
  /* looper waveform widget — envelope + live playhead + level bar */
  .wavebox {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 4px;
    min-height: 40px;
    padding: 4px 0;
  }
  .wavesvg {
    flex: 1;
    width: 100%;
    min-height: 28px;
    border-radius: 6px;
    background: var(--track);
    border: 1px solid var(--border);
  }
  .wavesvg .playhead {
    stroke: #f5a623;
    stroke-width: 0.6;
    vector-effect: non-scaling-stroke;
  }
  .wavelvl {
    position: relative;
    height: 4px;
    border-radius: 3px;
    background: var(--track);
    overflow: hidden;
  }
  .wavelvl .mfill {
    position: absolute;
    left: 0;
    right: auto;
    top: 0;
    bottom: 0;
    border-radius: 3px;
  }
  .loopbtns {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .loopbtn {
    flex: 1;
    min-width: 34px;
    padding: 5px 2px;
    font-size: 11px;
    font-weight: 600;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--track);
    color: var(--fg, #ddd);
    cursor: pointer;
  }
  .loopbtn:hover { border-color: var(--accent, #35c9d6); }
  .loopbtn.on { background: var(--accent, #35c9d6); color: #04121a; border-color: transparent; }
  .loopbtn.rec.on { background: #d6543f; color: #fff; }
  /* live audio meter widget — read-only vertical level bar(s); a block may report several (VU L/R, M-Comp bands) */
  .mrow {
    display: flex;
    flex: 1;
    gap: 6px;
    justify-content: center;
    align-items: stretch;
    min-height: 24px;
  }
  .mcol {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .mtag {
    font-size: 9px;
    line-height: 1;
    opacity: 0.65;
  }
  .mtrack {
    position: relative;
    width: 16px;
    flex: 1;
    min-height: 24px;
    margin: 7px 0;
    border-radius: 8px;
    background: var(--track);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .mfill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 0 0 8px 8px;
    transition: height 90ms linear;
  }
  .vhandle {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 28px;
    height: 14px;
    border-radius: 5px;
    background: var(--amber);
    border: 3px solid var(--bg2);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
  }
  .srow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    width: 100%;
    gap: 8px;
    margin-bottom: auto;
    padding: 2px 2px 0;
  }
  .slbl {
    font-weight: 600;
    font-size: 12px;
    color: var(--text2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .htrack {
    position: relative;
    width: 100%;
    height: 10px;
    margin: auto 0;
    border-radius: 6px;
    background: var(--track);
    border: 1px solid var(--border);
    cursor: ew-resize;
  }
  .hfill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, var(--accent), var(--accentbright));
    border-radius: 6px;
  }
  .hhandle {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--amber);
    border: 3px solid var(--bg2);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
  }
  .numrow {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .step {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface2);
    border: 1px solid var(--border3);
    color: var(--text2);
    cursor: pointer;
    font-size: 16px;
    flex: none;
  }
  .onoff {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    min-height: 30px;
    padding: 0 10px;
    border-radius: 9px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    background: var(--track);
    border: 1px solid var(--border2);
    color: var(--textfaint);
  }
  .onoff.on {
    background: var(--ok-tint);
    border-color: var(--ok-border);
    color: var(--ok);
  }
  .onoff-l {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .onoff .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
    background: var(--textmuted);
  }
  .onoff.on .dot {
    background: var(--ok);
    box-shadow: 0 0 7px rgba(70, 209, 127, 0.8);
  }
  .switch {
    position: relative;
    width: 54px;
    height: 30px;
    border-radius: 15px;
    cursor: pointer;
    background: var(--track);
    border: 1px solid var(--border2);
  }
  .switch.on {
    background: var(--ok-tint);
    border-color: var(--ok-border);
  }
  .snob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--textmuted);
    transition: left 0.16s, background 0.15s;
  }
  .switch.on .snob {
    left: 27px;
    background: var(--ok);
    box-shadow: 0 0 8px rgba(70, 209, 127, 0.7);
  }
  .seltop {
    font-weight: 600;
    font-size: 11px;
    color: var(--textdim);
    align-self: flex-start;
    margin-bottom: 6px;
  }
  .selfield {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 36px;
    padding: 0 11px;
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: 9px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .selfield.open {
    border-color: var(--accent);
  }
  .seltxt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret {
    font-size: 10px;
    color: var(--textfaint);
    flex: none;
    margin-left: 8px;
  }
  .eqtitle {
    position: absolute;
    top: 9px;
    left: 12px;
    z-index: 2;
    font-weight: 700;
    font-size: 12px;
    color: var(--text2);
  }
  .eqbox {
    width: 100%;
    height: 100%;
    display: flex;
  }
  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 11px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    background: var(--ok-tint);
    border: 1px solid var(--ok-border);
    color: var(--ok);
  }
  .action.byp {
    background: var(--surface2);
    border-color: var(--danger-border);
    color: var(--danger);
  }
  .chrome {
    position: absolute;
    inset: 0;
    z-index: 6;
    border-radius: 11px;
    border: 1px dashed rgba(53, 201, 214, 0.45);
    background: rgba(53, 201, 214, 0.04);
    pointer-events: none;
  }
  .dims {
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 8;
    font: 700 8px/1 var(--font-mono);
    color: var(--textmuted);
    background: rgba(0, 0, 0, 0.4);
    border-radius: 5px;
    padding: 3px 4px;
    pointer-events: none;
  }
  .wx {
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 8;
    width: 21px;
    height: 21px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(214, 84, 63, 0.16);
    border: 1px solid rgba(214, 84, 63, 0.5);
    color: var(--danger);
    cursor: pointer;
    font-size: 12px;
  }
  .qbadge {
    position: absolute;
    bottom: 4px;
    right: 30px;
    z-index: 8;
    width: 21px;
    height: 21px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    cursor: pointer;
    font-size: 11px;
    background: rgba(245, 166, 35, 0.12);
    border: 1px solid rgba(245, 166, 35, 0.4);
    color: var(--textfaint);
  }
  .qbadge.on {
    background: rgba(245, 166, 35, 0.22);
    border-color: var(--amber);
    color: var(--amber);
  }
  .pinbadge {
    position: absolute;
    bottom: 4px;
    right: 56px;
    z-index: 8;
    width: 21px;
    height: 21px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    cursor: pointer;
    font-size: 11px;
    background: rgba(53, 201, 214, 0.14);
    border: 1px solid rgba(53, 201, 214, 0.5);
    color: var(--accentbright);
  }
  .pinbadge:hover {
    background: rgba(53, 201, 214, 0.22);
    border-color: var(--accent);
  }
  .vcyc {
    position: absolute;
    bottom: 4px;
    left: 4px;
    z-index: 8;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 21px;
    padding: 0 8px;
    border-radius: 7px;
    background: rgba(53, 201, 214, 0.14);
    border: 1px solid rgba(53, 201, 214, 0.5);
    color: var(--accentbright);
    cursor: pointer;
    font: 700 9px/1 var(--font-mono);
  }
  .rsz {
    position: absolute;
    bottom: 2px;
    right: 2px;
    z-index: 8;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 4px;
    cursor: nwse-resize;
    background: transparent;
    border: 0;
    touch-action: none;
  }
  .selbg {
    position: absolute;
    inset: 0;
    z-index: 40;
  }
  .selmenu {
    position: absolute;
    z-index: 50;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 11px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.6);
    padding: 6px;
    max-height: 230px;
    overflow-y: auto;
  }
  .selopt {
    display: flex;
    align-items: center;
    padding: 9px 11px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: var(--text2);
  }
  .selopt.on {
    color: var(--accentbright);
    background: rgba(53, 201, 214, 0.12);
  }
  .boardempty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--border3);
    font-size: 13px;
    pointer-events: none;
  }
  .tray {
    flex: none;
    padding: 11px 14px 13px;
    border-top: 1px solid var(--surface2);
    background: linear-gradient(180deg, var(--bg2), var(--bg));
  }
  .tray-h {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 9px;
  }
  .th-tag {
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--textfaint);
  }
  .th-note {
    font: 500 10px/1 var(--font-mono);
    color: var(--border3);
  }
  .tray-row {
    display: flex;
    flex-wrap: wrap; /* available controls wrap onto new lines — never a sideways scroll */
    gap: 9px;
    max-height: 132px;
    overflow-y: auto;
    padding-bottom: 3px;
  }
  .traychip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 9px;
    height: 46px;
    padding: 0 13px;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 11px;
    cursor: pointer;
  }
  .traychip:hover {
    border-color: var(--accent);
  }
  .tc-ic {
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: var(--accentbright);
    background: var(--surface);
    border: 1px solid var(--accent-border);
  }
  .tc-txt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    line-height: 1.2;
    text-align: left;
  }
  .tc-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
  }
  .tc-meta {
    font: 500 9px/1 var(--font-mono);
    color: var(--textfaint);
  }
  .tc-plus {
    font-size: 16px;
    color: var(--textmuted);
  }
  .tray-empty {
    display: flex;
    align-items: center;
    height: 46px;
    padding: 0 14px;
    color: var(--border3);
    font-size: 12px;
  }

  /* live control search */
  .csearch {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 11px;
    border-radius: 10px;
    background: var(--bg2);
    border: 1px solid var(--border);
    color: var(--textfaint);
    min-width: 140px;
  }
  .csearch.active {
    flex: 1;
    border-color: var(--accent, var(--accent));
    color: var(--accent, var(--accent));
  }
  .csin {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
  }
  .csx {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 0;
    background: var(--surface2);
    color: var(--text2);
    cursor: pointer;
    font-size: 11px;
  }
  /* results = a flat wrap of control tiles (same look as the board cells), respecting each view */
  .results {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    width: 100%;
    align-content: flex-start;
  }
  .restile {
    flex: none;
    width: 118px;
    min-height: 112px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    border-radius: 11px;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
    border: 1px solid var(--surface2);
    overflow: visible;
  }
  .restile.wide {
    width: 240px;
  }
  .restile.nobg {
    background: transparent;
    border-color: transparent;
  }
  .nores {
    width: 100%;
    padding: 30px 10px;
    text-align: center;
    color: var(--textmuted);
    font-size: 13px;
  }
  .respop-bg {
    position: fixed;
    inset: 0;
    z-index: 9998;
  }
  .respop {
    position: fixed;
    z-index: 9999;
    max-height: 280px;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 11px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.6);
    padding: 6px;
  }
</style>
