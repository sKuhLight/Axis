/**
 * Page-layout actions shared by the edit bar's LAYOUT menu and the Layouts
 * drawer: save the active page as a layout, apply a saved one, export / import
 * packages, and restore host backups. Each action returns a status the caller
 * shows inline (bar status / drawer status line). Everything here is pure over
 * the controller + document except the two thin DOM helpers at the bottom
 * (`downloadWorkbenchJson`, `importLayoutFile` reading a File).
 */
import {
  exportPageLayoutPackage,
  importLayoutPackage,
  importPageLayoutPackage,
  importPanelPackage,
  layoutPackageFilename,
  selectActivePage,
  type PanelTemplate,
  type WorkbenchDocument,
  type WorkbenchLayout,
  type WorkbenchPageLayout
} from '../core';
import type { WorkbenchController } from './controller.svelte';
import { createPageLayoutSnapshot } from './layouts';

/** Inline feedback for a layout action (toast candidate). */
export interface WorkbenchLayoutActionStatus {
  tone: 'ok' | 'error';
  message: string;
}

const ok = (message: string): WorkbenchLayoutActionStatus => ({ tone: 'ok', message });
const fail = (message: string): WorkbenchLayoutActionStatus => ({ tone: 'error', message });

// ── Backups (app-provided seam) ─────────────────────────────────────────────

/**
 * App-provided backup seam. The generic layer cannot know where (or whether) the
 * host keeps document backups. A host that has them registers a provider here
 * (module singleton, the same seam shape as toasts.ts); the edit bar's LAYOUT
 * menu and the Layouts drawer then grow a "Backups" section. Chosen over
 * threading a prop because the consumers are instantiated deep inside the
 * generic renderer for one optional integration.
 */
export interface WorkbenchBackupEntry {
  /** 1-based generation slot (1 = newest). */
  slot: number;
  /** Host revision counter carried by the backup (0 when unknown). */
  rev: number;
  /** ISO timestamp of the backup's last change, when known. */
  updatedAt: string | null;
  /** Number of layouts inside the backup. */
  layoutCount: number;
}

export interface WorkbenchBackupProvider {
  list(): WorkbenchBackupEntry[];
  /** Restore a generation; returns false when the slot is empty/unreadable. */
  restore(slot: number): boolean;
}

let workbenchBackupProvider: WorkbenchBackupProvider | null = null;

export function registerWorkbenchBackupProvider(provider: WorkbenchBackupProvider | null): void {
  workbenchBackupProvider = provider;
}

export function getWorkbenchBackupProvider(): WorkbenchBackupProvider | null {
  return workbenchBackupProvider;
}

/** The host's backups (newest first), or [] without a provider / on a read failure. */
export function listWorkbenchBackups(): WorkbenchBackupEntry[] {
  const provider = workbenchBackupProvider;
  if (!provider) return [];
  try {
    return provider.list();
  } catch {
    return [];
  }
}

/** Restore one backup generation through the provider. */
export function restoreWorkbenchBackup(entry: WorkbenchBackupEntry): WorkbenchLayoutActionStatus {
  const provider = workbenchBackupProvider;
  let restored = false;
  try {
    restored = provider ? provider.restore(entry.slot) : false;
  } catch {
    restored = false;
  }
  return restored ? ok(`Restored backup ${entry.slot}.`) : fail(`Backup ${entry.slot} could not be restored.`);
}

/** Human timestamp for a backup row ("Unknown time" when absent / unparsable). */
export function workbenchBackupTimestamp(entry: WorkbenchBackupEntry): string {
  if (!entry.updatedAt) return 'Unknown time';
  const parsed = new Date(entry.updatedAt);
  return Number.isNaN(parsed.getTime()) ? 'Unknown time' : parsed.toLocaleString();
}

// ── Save / apply ────────────────────────────────────────────────────────────

/** Snapshot the ACTIVE page's dock into the shared page-layout store. */
export function savePageAsLayout(controller: WorkbenchController): WorkbenchLayoutActionStatus {
  const activePage = selectActivePage(controller.document);
  const index = controller.pageLayouts.length + 1;
  const pageLayout = createPageLayoutSnapshot(controller.document, {
    label: activePage ? `${activePage.label} Layout ${index}` : `Page Layout ${index}`
  });
  if (!pageLayout) return fail('No active page to save.');
  const result = controller.savePageLayout(pageLayout);
  return result.success
    ? ok(`Saved “${pageLayout.label}”.`)
    : fail(result.error?.message ?? 'Could not save the page layout.');
}

/**
 * Apply a stored page layout ONTO the active page. Nothing is deleted: panels
 * the layout does not use are parked, and a single-instance panel that lives on
 * another page stays there — the notice says how many.
 */
export function applySavedPageLayout(controller: WorkbenchController, pageLayoutId: string): WorkbenchLayoutActionStatus {
  const entry = controller.document.pageLayouts?.[pageLayoutId];
  const activePage = selectActivePage(controller.document);
  const result = controller.applyPageLayout(pageLayoutId);
  if (!result.success) return fail(result.error?.message ?? 'Could not apply layout.');
  const applied = `Applied “${entry?.label ?? 'layout'}” to ${activePage?.label ?? 'this page'}.`;
  return ok(result.warnings?.length ? `${applied} ${result.warnings.join(' · ')}.` : applied);
}

// ── Export ──────────────────────────────────────────────────────────────────

/** A JSON file to hand to the browser (`<stem>.json`). */
export interface WorkbenchJsonDownload {
  stem: string;
  data: unknown;
}

export interface WorkbenchExportResult {
  status: WorkbenchLayoutActionStatus;
  /** The file to download, or null when the export failed. */
  download: WorkbenchJsonDownload | null;
}

/** Export one stored page layout as a page-layout package. */
export function exportSavedPageLayout(doc: WorkbenchDocument, pageLayoutId: string, label: string): WorkbenchExportResult {
  const pkg = exportPageLayoutPackage(doc, pageLayoutId);
  if (!pkg) return { status: fail(`Could not export "${label}".`), download: null };
  return {
    status: ok(`Exported "${label}".`),
    download: { stem: layoutPackageFilename(label, 'page-layout'), data: pkg }
  };
}

/** Export the ACTIVE page directly (snapshot without storing it first). */
export function exportActivePageLayout(doc: WorkbenchDocument): WorkbenchExportResult {
  const activePage = selectActivePage(doc);
  const snapshot = createPageLayoutSnapshot(doc, { label: activePage?.label ?? 'Page Layout' });
  if (!snapshot) return { status: fail('No active page to export.'), download: null };
  const pkg = exportPageLayoutPackage({ pageLayouts: { [snapshot.id]: snapshot } }, snapshot.id);
  if (!pkg) return { status: fail('No active page to export.'), download: null };
  return {
    status: ok(`Exported “${snapshot.label}”.`),
    download: { stem: layoutPackageFilename(snapshot.label, 'page-layout'), data: pkg }
  };
}

// ── Import ──────────────────────────────────────────────────────────────────

/**
 * What an imported file turned out to be. A page-layout package is the primary
 * kind; older whole-layout and panel packages still import for compatibility.
 * Every id is re-minted upstream by the package importers.
 */
export type WorkbenchLayoutImport =
  | { kind: 'pageLayout'; payload: WorkbenchPageLayout }
  | { kind: 'layout'; payload: WorkbenchLayout }
  | { kind: 'panel'; payload: PanelTemplate }
  | { kind: 'invalid'; message: string };

/** Classify a parsed JSON value as one of the three package kinds (page layout first). */
export function classifyLayoutImport(parsed: unknown): WorkbenchLayoutImport {
  const asPageLayout = importPageLayoutPackage(parsed);
  if (asPageLayout.success) return { kind: 'pageLayout', payload: asPageLayout.payload };
  const asLayout = importLayoutPackage(parsed);
  if (asLayout.success) return { kind: 'layout', payload: asLayout.payload };
  const asPanel = importPanelPackage(parsed);
  if (asPanel.success) return { kind: 'panel', payload: asPanel.payload };
  // Report the most specific failure (page-layout parse is the primary path).
  return { kind: 'invalid', message: asPageLayout.error.message };
}

/** Parse a file's text and classify it; invalid JSON is an `invalid` import. */
export function parseLayoutImport(text: string): WorkbenchLayoutImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'invalid', message: 'File is not valid JSON.' };
  }
  return classifyLayoutImport(parsed);
}

/**
 * Store a classified import. A page layout is ADDED to the shared store and NOT
 * auto-applied; a layout becomes a profile-selectable layout; a panel lands in
 * the panel library.
 */
export function applyLayoutImport(controller: WorkbenchController, imported: WorkbenchLayoutImport): WorkbenchLayoutActionStatus {
  switch (imported.kind) {
    case 'pageLayout': {
      const result = controller.savePageLayout(imported.payload);
      return result.success
        ? ok(`Imported “${imported.payload.label}” — apply it from Saved layouts.`)
        : fail('Imported page layout could not be saved.');
    }
    case 'layout': {
      const result = controller.dispatch({ type: 'layout.save', layout: imported.payload });
      return result.success
        ? ok(`Imported layout "${imported.payload.label}" — pick it as a profile layout.`)
        : fail('Imported layout could not be saved.');
    }
    case 'panel': {
      const result = controller.dispatch({ type: 'library.panel.save', template: imported.payload });
      return result.success
        ? ok(`Imported panel "${imported.payload.title}" — add it from Add › Add panel…`)
        : fail('Imported panel could not be saved.');
    }
    case 'invalid':
      return fail(imported.message);
  }
}

// ── Thin DOM helpers ────────────────────────────────────────────────────────

/** Read a picked file and import it (see {@link applyLayoutImport}). */
export async function importLayoutFile(
  controller: WorkbenchController,
  file: { text(): Promise<string> }
): Promise<WorkbenchLayoutActionStatus> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return fail('File could not be read.');
  }
  return applyLayoutImport(controller, parseLayoutImport(text));
}

/** Hand a JSON object to the browser as a `<stem>.json` download. */
export function downloadWorkbenchJson(download: WorkbenchJsonDownload): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([JSON.stringify(download.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${download.stem}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Run an export: download its file (when it produced one) and return its status. */
export function runWorkbenchExport(result: WorkbenchExportResult): WorkbenchLayoutActionStatus {
  if (result.download) downloadWorkbenchJson(result.download);
  return result.status;
}
