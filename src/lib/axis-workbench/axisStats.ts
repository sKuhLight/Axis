// Library insights — the pure aggregation behind the Insights page.
//
// Read-only by construction: it folds the already-cached `PresetSummary` data (blocks + per-family
// `models` + tags) into the "most-used model per family" board and the tag histogram. No device I/O,
// no new persistence — the panel only renders what this returns, and a unit test pins the folding.
import type { BlockTypeOption, PresetSummary } from '$lib/api/types';

/** One model within a family: how many presets use it. */
export interface AxisStatsModel {
  name: string;
  count: number;
}

/** One block family (the slug from `PresetSummary.models` / `blocks[].slug`). */
export interface AxisStatsFamily {
  slug: string;
  /** Presets that contain this family at all. */
  used: number;
  /** Every model seen for the family, most-used first (empty when models weren't decoded). */
  models: AxisStatsModel[];
}

/** One tag and how many presets carry it. */
export interface AxisStatsTag {
  tag: string;
  count: number;
}

export interface AxisStats {
  presetCount: number;
  favorites: number;
  /** Distinct `family\u0000model` pairs, case-insensitive. */
  distinctModels: number;
  families: AxisStatsFamily[];
  tags: AxisStatsTag[];
  /** Total tag→preset assignments (a preset with 3 tags contributes 3). */
  tagAssignments: number;
  /** Presets carrying no tags at all — the one actionable number here. */
  untagged: number;
}

/** Minimal entry shape the fold needs (structural so a `LibEntry` satisfies it). */
export interface AxisStatsEntry {
  id: string;
  fav: boolean;
  summary: PresetSummary;
}

/**
 * Families hidden from the board. Input/output always exist and would top it without saying
 * anything (the preset-browser chip strip hides them the same way); PEQ, Send, Return and Looper
 * are utility/routing blocks that read as noise rather than "what do I actually use".
 */
export const AXIS_STATS_HIDDEN_FAMILIES = new Set(['input', 'output', 'in', 'out', 'peq', 'send', 'return', 'looper']);

/** Models per family: prefer the decoded `models` map; fall back to the legacy `amps` list. */
function modelsOf(summary: PresetSummary): Record<string, string[]> {
  const m = summary.models;
  if (m && typeof m === 'object') return m;
  return (summary.amps ?? []).length ? { amp: summary.amps } : {};
}

/** Case-insensitive de-dupe of a preset's tags, preserving the first-seen casing, dropping blanks. */
function dedupeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * Fold a library into per-family model usage and a tag histogram.
 *
 * Family membership counts a preset once, whether the family came from a block slug or a decoded
 * model; model counts are per preset (a preset using a model twice still counts once), so a model
 * spammed in one preset never outranks one that appears across the whole set.
 */
export function computeAxisStats(
  entries: readonly AxisStatsEntry[],
  tagAssignments: Record<string, string[]> = {}
): AxisStats {
  const familyUsed = new Map<string, number>();
  const modelCounts = new Map<string, Map<string, number>>();
  const distinctModels = new Set<string>();
  let favorites = 0;

  for (const entry of entries) {
    if (entry.fav) favorites++;
    const models = modelsOf(entry.summary);

    const slugs = new Set<string>();
    for (const block of entry.summary.blocks ?? []) {
      const slug = (block.slug ?? '').toLowerCase();
      if (slug) slugs.add(slug);
    }
    for (const [slugRaw, names] of Object.entries(models)) {
      if (names.length) slugs.add(slugRaw.toLowerCase());
    }
    for (const slug of slugs) {
      if (AXIS_STATS_HIDDEN_FAMILIES.has(slug)) continue;
      familyUsed.set(slug, (familyUsed.get(slug) ?? 0) + 1);
    }

    for (const [slugRaw, names] of Object.entries(models)) {
      const slug = slugRaw.toLowerCase();
      if (AXIS_STATS_HIDDEN_FAMILIES.has(slug)) continue;
      let perModel = modelCounts.get(slug);
      if (!perModel) {
        perModel = new Map<string, number>();
        modelCounts.set(slug, perModel);
      }
      for (const raw of names) {
        const name = raw.trim();
        if (!name) continue;
        perModel.set(name, (perModel.get(name) ?? 0) + 1);
        distinctModels.add(`${slug}\u0000${name.toLowerCase()}`);
      }
    }
  }

  const families: AxisStatsFamily[] = [...familyUsed.entries()]
    .map(([slug, used]) => ({
      slug,
      used,
      models: [...(modelCounts.get(slug) ?? new Map<string, number>()).entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    }))
    .sort((a, b) => b.used - a.used || a.slug.localeCompare(b.slug));

  const tagCounts = new Map<string, AxisStatsTag>();
  let tagAssignmentsTotal = 0;
  let untagged = 0;
  for (const entry of entries) {
    const tags = dedupeTags(tagAssignments[entry.id] ?? []);
    if (!tags.length) {
      untagged++;
      continue;
    }
    for (const tag of tags) {
      const key = tag.toLowerCase();
      const current = tagCounts.get(key) ?? { tag, count: 0 };
      current.count++;
      tagCounts.set(key, current);
      tagAssignmentsTotal++;
    }
  }
  const tags = [...tagCounts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return { presetCount: entries.length, favorites, distinctModels: distinctModels.size, families, tags, tagAssignments: tagAssignmentsTotal, untagged };
}

/** A drive model repeatedly used in front of an amp model. */
export interface AxisStatsPairing {
  amp: string;
  drive: string;
  /** Presets carrying both models. */
  count: number;
}

/**
 * Most repeated amp↔drive model pairings across the entries. Only the decoded model lists are
 * needed (no block order), so this is the one rig insight the summary can support — an ordered
 * "signature chain" cannot, because `PresetSummary.blocks` carries no routing.
 */
export function topAmpDrivePairings(entries: readonly AxisStatsEntry[], limit = 3): AxisStatsPairing[] {
  const counts = new Map<string, AxisStatsPairing>();
  for (const entry of entries) {
    const models = modelsOf(entry.summary);
    const amps = models.amp ?? [];
    const drives = models.drive ?? [];
    if (!amps.length || !drives.length) continue;
    for (const amp of amps) {
      for (const drive of drives) {
        const key = `${amp}\u0000${drive}`;
        const current = counts.get(key) ?? { amp, drive, count: 0 };
        current.count++;
        counts.set(key, current);
      }
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.amp.localeCompare(b.amp) || a.drive.localeCompare(b.drive))
    .slice(0, limit);
}

/** The family with this slug, or undefined. Slugs are matched case-insensitively. */
export function familyStats(stats: AxisStats, slug: string): AxisStatsFamily | undefined {
  const key = slug.toLowerCase();
  return stats.families.find((family) => family.slug === key);
}

// ── Library-wide model rows (the two rows under the histogram) ───────────────────────────────────

/** Per-family model usage across ALL library entries (every `source`, not just device slots): slug →
 *  lowercase model name → the first-seen name casing + how many entries use it. */
export type AxisLibraryModels = Map<string, Map<string, { name: string; count: number }>>;

/**
 * Fold every library entry's decoded `models` into {@link AxisLibraryModels}. Model names are folded
 * per entry (a model used twice in one preset counts once), like {@link computeAxisStats}, so the
 * count is "presets using it", not placements.
 */
export function collectLibraryModels(entries: readonly AxisStatsEntry[]): AxisLibraryModels {
  const out: AxisLibraryModels = new Map();
  for (const entry of entries) {
    const models = modelsOf(entry.summary);
    for (const [slugRaw, names] of Object.entries(models)) {
      const slug = slugRaw.toLowerCase();
      let perFamily = out.get(slug);
      if (!perFamily) {
        perFamily = new Map();
        out.set(slug, perFamily);
      }
      const seen = new Set<string>();
      for (const raw of names) {
        const name = raw.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const current = perFamily.get(key);
        if (current) current.count++;
        else perFamily.set(key, { name, count: 1 });
      }
    }
  }
  return out;
}

export interface AxisStatsModelCount {
  name: string;
  count: number;
}

export interface AxisStatsModelOption {
  name: string;
  /** "manufacturer basedOn" from the device catalog, or "" when it has no lineage. */
  realName: string;
}

/** The two rows under a family histogram: `foreign` = library-not-device, `untried` = device-not-used. */
export interface AxisStatsModelRows {
  foreign: AxisStatsModelCount[];
  untried: AxisStatsModelOption[];
}

/** Real-world name text for a device option ("Hiwatt Custom 100"), or "" when it has no lineage. */
export function optionRealName(option: Pick<BlockTypeOption, 'manufacturer' | 'basedOn'>): string {
  return `${option.manufacturer ?? ''} ${option.basedOn ?? ''}`.trim();
}

/**
 * The two rows under a family histogram, from one family's used models (`collectLibraryModels`) and
 * the device's offered models (`GET /blocks/:slug/types`):
 *
 *  - `foreign` (library \ device) — models the library uses that the device has no model for, so
 *    presets referencing them can't play here. Most-used first.
 *  - `untried` (device \ library) — models the device offers that no library preset uses.
 *
 * Matching is case-insensitive; each side's own casing is kept for display. A model that only a
 * device preset uses is still `used` here — device presets are library entries too.
 */
export function modelRowsForFamily(
  used: Map<string, { name: string; count: number }> | undefined,
  options: readonly BlockTypeOption[]
): AxisStatsModelRows {
  const usedMap = used ?? new Map<string, { name: string; count: number }>();
  const offered = new Set(options.map((option) => option.name.trim().toLowerCase()));
  const foreign = [...usedMap.entries()]
    .filter(([key]) => !offered.has(key))
    .map(([, value]) => ({ name: value.name, count: value.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const untried = options
    .filter((option) => {
      const key = option.name.trim().toLowerCase();
      return !!key && !usedMap.has(key);
    })
    .map((option) => ({ name: option.name, realName: optionRealName(option) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.realName.localeCompare(b.realName));
  return { foreign, untried };
}
