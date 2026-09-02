// FM3-Edit preset-color import store (replicated-purring-bachman plan). The automatic check runs
// ONCE, EVER, on the very first app start — gated by a persisted flag, never re-checked on later
// launches and never re-applied as the library grows. Manual re-import is a separate, explicit
// entry point (menu-triggered), not implemented here yet.
//
// Provenance (plan revision #1): the naive "skip ids that already carry the tag" idiom is NOT the
// same as respecting a user's deletion or rename — it would recreate a removed tag, or re-tag every
// preset under a rename, on the very next launch. So every (FM3 tag name → preset id) pair this store
// has ever offered a tag is persisted; a pair already offered is never re-offered, even if the tag is
// gone from that preset now. A NEW preset that later picks up an already-seen FM3 color still gets
// tagged, because provenance is per-id, not per-tag-name (see library.applyColorLabelGroups's
// `skipIds` doc comment).
import { forgefx } from './forgefx';
import { library } from './library.svelte';
import { editor } from './editor.svelte';
import type { ColorLabelGroup } from './types';

const OFFERED_KEY = 'axs.colorLabels.offered'; // FM3 tag name -> preset ids already offered that tag
const AUTO_CHECKED_KEY = 'axs.colorLabels.autoChecked'; // '1' once the one-time-ever auto-check has run

function loadOffered(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFERED_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof k === 'string' && Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return {};
  }
}
function persistOffered(v: Record<string, string[]>): void {
  try { localStorage.setItem(OFFERED_KEY, JSON.stringify(v)); } catch { /* best-effort */ }
}
function loadAutoChecked(): boolean {
  try { return localStorage.getItem(AUTO_CHECKED_KEY) === '1'; } catch { return false; }
}
function persistAutoChecked(): void {
  try { localStorage.setItem(AUTO_CHECKED_KEY, '1'); } catch { /* best-effort */ }
}

/** What ColorLabelsPrompt.svelte shows: how many presets FM3-Edit assigned a color to. */
export interface ColorLabelsOffer {
  presetCount: number;
}

class ColorLabelsStore {
  #offered: Record<string, string[]> = loadOffered();
  #autoChecked = loadAutoChecked();
  /** Cached from the last successful import — accept() applies this against the entry list, with no
   *  extra network call. */
  #groups: ColorLabelGroup[] = [];
  /** Non-null → ColorLabelsPrompt.svelte shows the opt-in offer. Set by refresh() when a candidate is
   *  found; cleared by accept() or dismiss(). */
  offer = $state<ColorLabelsOffer | null>(null);

  /** One-time-ever auto-check: discover FM3-Edit's color-assignments file (if any) and parse it —
   *  read-only, no tags touched. Call once from startApp(). No-op on every launch after the first,
   *  regardless of outcome (found/not found/accepted/dismissed) — the persisted `autoChecked` flag is
   *  set immediately after the first attempt so this never runs again. No error surfaced on: a
   *  remote/browser session, no candidates found (FM3-Edit not installed), or an import failure (422
   *  parse failure / 404 older ForgeFX). */
  async refresh(): Promise<void> {
    if (this.#autoChecked) return; // already ran its one-and-only check on a prior launch
    const sources = await forgefx.colorLabelSources().catch(() => null);
    if (!sources?.candidates.length) return; // FM3-Edit not installed (yet) — don't consume the one-shot either
    const newest = [...sources.candidates].sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())[0]!;
    let imported: { groups: ColorLabelGroup[] };
    try {
      imported = await forgefx.importColorLabels({ path: newest.path });
    } catch {
      return; // parse failure or capability-absent — silent no-op, don't consume the one-shot
    }
    this.#autoChecked = true;
    persistAutoChecked();
    this.#groups = imported.groups;
    const presetCount = imported.groups.reduce((n, g) => n + g.names.length, 0);
    if (presetCount > 0) this.offer = { presetCount };
  }

  /** User accepted the one-time prompt: apply the cached groups now. */
  accept(): void {
    this.offer = null;
    this.#apply();
  }

  /** User dismissed the one-time prompt. Since the auto-check never runs again, this is final —
   *  not asked again on a later launch. */
  dismiss(): void {
    this.offer = null;
  }

  #apply(): void {
    const { tagged, matchedIds } = library.applyColorLabelGroups(this.#groups, { skipIds: this.#offered });
    let offeredChanged = false;
    const nextOffered = { ...this.#offered };
    for (const [name, ids] of Object.entries(matchedIds)) {
      const cur = new Set(nextOffered[name] ?? []);
      for (const id of ids) if (!cur.has(id)) { cur.add(id); offeredChanged = true; }
      nextOffered[name] = [...cur];
    }
    if (offeredChanged) { this.#offered = nextOffered; persistOffered(this.#offered); }
    if (tagged > 0) editor.showToast(`Imported ${tagged} preset color${tagged === 1 ? '' : 's'} from FM3-Edit`);
  }
}

export const colorLabels = new ColorLabelsStore();
