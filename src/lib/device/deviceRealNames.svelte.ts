// Real-world device name lookup, cached per block family (GET /blocks/:slug/types). Preset Browser
// search folds this into its free-text haystack so a real gear name (manufacturer + the unit a model
// is based on, e.g. "Hiwatt Custom 100") also matches presets built on the internal decoded model name
// (e.g. "HIPOWER"). Independent module, not on `editor`: it's a passive read-through cache with no
// persistence lifecycle, shared by both the monolith PresetBrowser and its axis-workbench mirror — the
// lookup itself isn't part of either shell's query grammar, just data plumbing keyed by slug + name.
//
// It keeps the FULL `BlockTypeOption[]` per slug as well (`typesFor`), so callers that need every
// model a family offers — not just the ones with a real-world lineage — share this one fetch (the
// Insights model rows). `typesFor` also surfaces the 'loading'/'error' states the fetch already tracks.
//
// Modeled on the per-family type-catalog cache in convertScratch.svelte.ts (`#types`/`typesFor`/
// `loadTypes`), which wraps the same `forgefx.blockTypes(slug)` endpoint CommandPalette.svelte already
// uses for its "real names" retype toggle.

import { forgefx } from '$lib/api/forgefx';
import type { BlockTypeOption } from '$lib/api/types';

function toRealNameMap(list: BlockTypeOption[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of list) {
    const text = `${t.manufacturer ?? ''} ${t.basedOn ?? ''}`.trim();
    if (text) m.set(t.name.toLowerCase(), text);
  }
  return m;
}

class DeviceRealNamesStore {
  // per-family slug → decoded-name→real-name lookup. A Map (built once per resolved fetch) avoids a
  // linear scan per haystack build. 'loading' while in flight, 'error' on failure — mirrors convertScratch.
  #byFamily = $state<Record<string, Map<string, string> | 'loading' | 'error'>>({});
  // The full option list per resolved family, so callers needing every selectable model (not just the
  // ones with a real-world lineage) reuse the same fetch instead of hitting the endpoint again.
  #options = $state<Record<string, BlockTypeOption[]>>({});

  /** Idempotent: kick off a fetch for any slug not yet cached/in-flight. Cheap to call with every slug
   *  a haystack build needs — already-cached/in-flight/errored-and-retried slugs are skipped. */
  loadTypes = (slug: string): void => {
    if (!slug || (this.#byFamily[slug] && this.#byFamily[slug] !== 'error')) return;
    this.#byFamily = { ...this.#byFamily, [slug]: 'loading' };
    forgefx
      .blockTypes(slug)
      .then((list) => {
        this.#options = { ...this.#options, [slug]: list };
        this.#byFamily = { ...this.#byFamily, [slug]: toRealNameMap(list) };
      })
      .catch(() => {
        this.#byFamily = { ...this.#byFamily, [slug]: 'error' };
      });
  };

  /** Prime many slugs at once (see {@link loadTypes}). */
  prime = (slugs: Iterable<string>): void => {
    for (const slug of slugs) this.loadTypes(slug);
  };

  /** Every selectable model a family offers, or the fetch's 'loading'/'error' state / undefined if
   *  never primed. Shares the fetch (and cache) with {@link realNameFor}. */
  typesFor = (slug: string): BlockTypeOption[] | 'loading' | 'error' | undefined => {
    const state = this.#byFamily[slug];
    if (state === 'loading' || state === 'error') return state;
    return this.#options[slug];
  };

  /** Real-world name text ("Fender 59 Bassman LTD") for a decoded model name within a family, or "" if
   *  unknown / not loaded yet / no lineage for that model — callers fold this into a haystack
   *  unconditionally, an empty string is simply a no-op addition. */
  realNameFor = (slug: string, modelName: string): string => {
    const m = this.#byFamily[slug];
    return m && m !== 'loading' && m !== 'error' ? (m.get(modelName.toLowerCase()) ?? '') : '';
  };
}

export const deviceRealNames = new DeviceRealNamesStore();
