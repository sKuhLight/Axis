// Pure helpers for the cross-device converter's ".syx export" flow (META-24 · AXIS-47/48).
//
// The actual authoring runs server-side in ForgeFX (POST /preset/convert/export → the FM3-calibrated
// codec `authorGen3PresetFromIR`); Axis only chooses a base template, calls the endpoint, and downloads
// the returned bytes. So there is no IR→author mapping on this side — the non-trivial-but-pure bits are
// the eligibility gate, the FM3 model match (for filtering library base candidates), the download
// filename sanitizer, and the toast copy. They live here (node-testable) so the Svelte panel stays thin.
//
// HONESTY: export is FM3-only for now, and a file-level-valid `.syx` is NOT proof of device acceptance —
// a hardware load test on a real FM3 is still required. The panel surfaces the same caveat to the user.

/** The only converter target `.syx` export supports today. */
export function canExportTarget(targetDeviceId: string | undefined | null): boolean {
  return targetDeviceId === 'fm3';
}

/** True when a preset-summary model string names the FM3 (base templates must themselves be FM3). */
export function isFm3Model(model: string | undefined | null): boolean {
  return typeof model === 'string' && model.trim().toLowerCase() === 'fm3';
}

/** Sanitize a preset name into a safe `.syx` download filename (mirrors PresetBrowser.exportEntry). */
export function syxFilename(name: string | undefined | null): string {
  const base = (name && name.trim()) || 'preset';
  return `${base.replace(/[^\w-]+/g, '_')}.syx`;
}

/** The success toast after an export, e.g. "Exported 8 blocks" or "Exported 8 blocks · 2 skipped". */
export function exportToast(writtenCount: number, skippedCount: number): string {
  const blocks = `Exported ${writtenCount} block${writtenCount === 1 ? '' : 's'}`;
  return skippedCount > 0 ? `${blocks} · ${skippedCount} skipped` : blocks;
}
