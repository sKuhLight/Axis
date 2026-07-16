// Pure helpers for the cross-device converter's ".syx export" flow (META-24 · AXIS-47/48).
//
// The actual authoring runs server-side in ForgeFX (POST /preset/convert/export → the FM3-calibrated
// codec `authorGen3PresetFromIRFull`, which SYNTHESIZES the whole FM3 body onto a bundled scaffold — no
// base needed). Axis only calls the endpoint (one-click) and downloads the returned bytes; an FM3 base is
// an OPTIONAL scaffold override. So there is no IR→author mapping on this side — the non-trivial-but-pure
// bits are the eligibility gate, the FM3 model match (for filtering optional base candidates), the download
// filename sanitizer, and the toast copy. They live here (node-testable) so the Svelte panel stays thin.
//
// HONESTY: export supports the gen-3 devices (FM3/FM9/Axe-Fx III); AM4/VP4 are not yet authorable. A
// file-level-valid `.syx` is NOT proof of device acceptance — a hardware load test on the real target is
// still required. The panel surfaces the same caveat to the user.

/** The converter targets `.syx` export supports today — the three gen-3 devices that share the
 *  catalog/defs-driven synthesis model. AM4/VP4 have no harvested block templates yet. */
const EXPORTABLE_TARGETS = new Set(['fm3', 'fm9', 'axe-fx-iii']);

export function canExportTarget(targetDeviceId: string | undefined | null): boolean {
  return typeof targetDeviceId === 'string' && EXPORTABLE_TARGETS.has(targetDeviceId);
}

/** Human name of an export target, for toast/label copy. */
export function exportTargetName(targetDeviceId: string | undefined | null): string {
  switch (targetDeviceId) {
    case 'fm3':
      return 'FM3';
    case 'fm9':
      return 'FM9';
    case 'axe-fx-iii':
      return 'Axe-Fx III';
    default:
      return 'the target device';
  }
}

/** True when a preset-summary model string names the same gen-3 device as `targetDeviceId` — an OPTIONAL
 *  base-scaffold override must itself be a preset of the target device. */
export function isModelForTarget(model: string | undefined | null, targetDeviceId: string | undefined | null): boolean {
  if (typeof model !== 'string') return false;
  const m = model.trim().toLowerCase();
  switch (targetDeviceId) {
    case 'fm3':
      return m === 'fm3';
    case 'fm9':
      return m === 'fm9';
    case 'axe-fx-iii':
      return m === 'axe-fx-iii' || m === 'axe-fx iii' || m === 'axefx iii' || m === 'axe3';
    default:
      return false;
  }
}

/** True when a preset-summary model string names the FM3. Retained for the FM3 base-candidate filter. */
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

/** The FIDELITY warning toast when full synthesis could not reproduce every converted block because some
 *  families have no harvested FM3 template yet. Returns null when everything landed (`dropped === 0`), so the
 *  caller falls back to the plain success toast. */
export function exportFidelityToast(fidelity: {
  sourceBlocks: number;
  landedBlocks: number;
  droppedNoTemplate: number;
}): string | null {
  if (fidelity.droppedNoTemplate <= 0) return null;
  const fams = fidelity.droppedNoTemplate;
  return (
    `Exported ${fidelity.landedBlocks} of ${fidelity.sourceBlocks} blocks — ` +
    `${fams} famil${fams === 1 ? 'y has' : 'ies have'} no template on the target device yet`
  );
}

/** The error toast when the server REFUSES an export. A supplied base OVERRIDE that is not a valid FM3 dump
 *  is rejected (400); an authored preset that failed re-decode is refused (422) — both mean "don't download
 *  this". Other failures (network/timeout/5xx) fall back to the raw message. NO file is downloaded on any of
 *  these. */
export function exportErrorToast(status: number | undefined, message?: string | null): string {
  if (status === 422) {
    return 'Export refused: the synthesized preset failed validation';
  }
  if (status === 400) {
    return 'Export failed: base override invalid — remove it or pick a valid FM3 preset';
  }
  const m = message?.trim();
  return m ? `Export failed: ${m}` : 'Export failed';
}
