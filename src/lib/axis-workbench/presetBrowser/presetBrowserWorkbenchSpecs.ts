// Filter-spec derivation for the docked Preset Browser search (V13e).
//
// Ported from src/lib/PresetBrowser.svelte (`filterableSlugs`, `specsBySlug`, `specFor`, `specUsable`,
// `usableSpecs`). These build the vocabulary the autocomplete + Filters block suggest from: which block
// families you can filter on, and per family which parameters (enum options / numeric ranges) actually
// vary across the library and are therefore worth offering.
//
// The monolith reads this off the live `library` store + its decoded param cache; here it is a pure
// function over the same data (entries + a paramsOf accessor + a per-slug model list), so it is unit
// testable and reused verbatim by the docked panel — the docked runtime reaches the SAME decoded blocks
// through library.paramsOf via the runtime host, so this is full parity, not a summary-only fallback.

export interface SpecDecodedParam {
  label: string;
  kind?: string;
  value: number | null;
  enumLabel?: string | null;
}

export interface SpecDecodedBlock {
  slug: string;
  effectId?: number;
  instance?: number;
  channel?: number | null;
  typeName?: string | null;
  params: SpecDecodedParam[];
}

// A minimal library-entry shape the spec builder needs: a slug list from the summary (always present) and
// a per-slug model-name map (from the summary), plus optional hydrated decoded blocks.
export interface SpecLibEntry {
  /** Summary block slugs (present even before params hydrate). */
  summaryBlockSlugs: string[];
  /** Summary model names per slug (e.g. { amp: ['USA Clean'] }) — seeds the Type enum without a deep scan. */
  models: Record<string, string[]>;
  /** Hydrated decoded blocks, or null when params are not loaded for this entry. */
  blocks: SpecDecodedBlock[] | null;
}

export interface AxisPbFilterSpec {
  label: string;
  kind: 'enum' | 'num';
  enums: Set<string>;
  min: number;
  max: number;
}

// The block families that are always offered even when the library carries none yet (monolith seed set).
const SEED_SLUGS = ['amp', 'drive', 'cab', 'comp', 'reverb', 'delay'] as const;

// The distinct, sorted list of filterable block slugs across the library (verbatim from monolith
// `filterableSlugs`): the seed set plus every slug seen in any entry summary.
export function filterableSlugs(entries: SpecLibEntry[]): string[] {
  const s = new Set<string>(SEED_SLUGS);
  for (const e of entries) for (const slug of e.summaryBlockSlugs) if (slug) s.add(slug);
  return [...s].sort();
}

// Per-slug param specs derived from whatever params are available (verbatim from monolith `specsBySlug`):
// enum params collect their option labels; numeric params track min/max; the Type selector folds the
// summary model names in as enum values under "Type" (always available, no deep scan needed).
export function specsBySlug(entries: SpecLibEntry[]): Record<string, Map<string, AxisPbFilterSpec>> {
  const out: Record<string, Map<string, AxisPbFilterSpec>> = {};
  for (const e of entries) {
    const blocks = e.blocks;
    if (blocks) {
      for (const b of blocks) {
        const m = (out[b.slug] ??= new Map());
        for (const p of b.params) {
          if (p.value == null && p.enumLabel == null) continue;
          const sp =
            m.get(p.label) ??
            ({
              label: p.label,
              kind: (p.kind === 'enum' ? 'enum' : 'num') as 'enum' | 'num',
              enums: new Set<string>(),
              min: Infinity,
              max: -Infinity
            } as AxisPbFilterSpec);
          if (p.enumLabel) {
            sp.kind = 'enum';
            sp.enums.add(p.enumLabel);
          }
          if (p.value != null) {
            sp.min = Math.min(sp.min, p.value);
            sp.max = Math.max(sp.max, p.value);
          }
          m.set(p.label, sp);
        }
        // fold model names in as the "Type" enum for this block's slug
        const models = e.models[b.slug] ?? [];
        if (models.length) {
          const sp = m.get('Type') ?? typeSpec();
          for (const n of models) sp.enums.add(n);
          m.set('Type', sp);
        }
      }
    }
    // Type is ALWAYS available from the summary models (even without hydrated params) — seed it per family.
    for (const [slug, names] of Object.entries(e.models)) {
      if (!names.length) continue;
      const m = (out[slug] ??= new Map());
      const sp = m.get('Type') ?? typeSpec();
      for (const n of names) sp.enums.add(n);
      m.set('Type', sp);
    }
  }
  return out;
}

function typeSpec(): AxisPbFilterSpec {
  return { label: 'Type', kind: 'enum', enums: new Set<string>(), min: Infinity, max: -Infinity };
}

// Case-insensitive spec lookup (verbatim from monolith `specFor`).
export function specFor(
  specs: Record<string, Map<string, AxisPbFilterSpec>>,
  slug: string,
  name: string
): AxisPbFilterSpec | null {
  for (const [k, v] of specs[slug] ?? []) if (k.toLowerCase() === name.toLowerCase()) return v;
  return null;
}

// A param is worth listing only if you can actually filter on it: an enum with options, or a numeric
// param that VARIES (min<max). Constant-everywhere params are dead ends (verbatim from monolith).
export function specUsable(s: AxisPbFilterSpec): boolean {
  return s.kind === 'enum' ? s.enums.size > 0 : isFinite(s.min) && isFinite(s.max) && s.max > s.min;
}

// The usable specs for a slug, Type first then alphabetical (verbatim from monolith `usableSpecs`).
export function usableSpecs(
  specs: Record<string, Map<string, AxisPbFilterSpec>>,
  slug: string
): AxisPbFilterSpec[] {
  return [...(specs[slug]?.values() ?? [])]
    .filter(specUsable)
    .sort(
      (a, b) => Number(b.label === 'Type') - Number(a.label === 'Type') || a.label.localeCompare(b.label)
    );
}
