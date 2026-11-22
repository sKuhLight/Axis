/**
 * The Add palette API — what the host's palette component (renderRegistry
 * `registerAddPalette`) gets to work with. The workbench owns the catalog
 * (`addCatalog.ts`), what a card does, click-to-place (`placementSession.ts`)
 * and the drag-out (`libraryDrag.ts`); the host only renders cards.
 *
 *   - click / Enter on a card: a fixed target (the context "+" entries) inserts
 *     right there; otherwise the palette closes and every valid spot lights up
 *     until a click places it (Escape cancels);
 *   - press + drag on a card: the palette closes and the normal drag-and-drop
 *     runs (touch / pen: only a sideways pull — a vertical swipe scrolls the grid);
 *   - when it is done (placed, inserted, cancelled, closed) focus goes back to
 *     what opened the palette (the Add button, a "+"), else the edit bar's Add;
 *   - placed panels and built-in widgets MOVE (one instance each), saved
 *     templates create copies (core catalogs).
 */
import {
  buildPanelCatalog,
  buildWidgetCatalog,
  catalogAddCommands,
  createWorkbenchId,
  exportPanelPackage,
  layoutPackageFilename,
  widgetCatalogAddCommands,
  widgetZoneLabel,
  type DockTarget,
  type JsonObject,
  type WidgetInstance,
  type WorkbenchCommand
} from '../core';
import {
  blankPageCommands,
  buildAddCatalog,
  cardUsesFixedTarget,
  navOrderIndexForNeighbours,
  showNavigationEntryCommands,
  type AddCatalogItem,
  type WorkbenchAddPaletteRequest
} from './addCatalog';
import type { WorkbenchMenuItem } from './contextMenu';
import type { WorkbenchController } from './controller.svelte';
import { dockTargetFor, type DockDropTarget } from './dockDropTarget';
import type { WorkbenchPointer } from './drag';
import { sidewaysTouchDragGate } from './dragSession';
import type { WorkbenchEditBarPagesExtension } from './editBarMenus';
import { downloadWorkbenchJson } from './layoutActions';
import { commitPanelDragOut, startPanelDragOut, startWidgetDragOut } from './libraryDrag';
import type { DockDropCommitResult } from './panelDrag';
import { beginPlacement, type PlacementEndReason } from './placementSession';
import type { WorkbenchRenderRegistry } from './renderRegistry';
import { enqueueToast } from './toasts';

export interface WorkbenchAddPaletteApi {
  readonly request: WorkbenchAddPaletteRequest;
  /** Every card. Read inside reactive scope: it follows the document. */
  items(): AddCatalogItem[];
  /** A note for the page cards (e.g. which default pages are already there). */
  pageNote(): string | undefined;
  /** A widget zone's display name. */
  zoneLabel(zone: string): string;
  /**
   * The widget instance a widget card previews: the live one when the type is
   * placed / hidden, a fresh default instance otherwise; a template's first
   * widget. Null for non-widget cards.
   */
  widgetPreview(item: AddCatalogItem): WidgetInstance | null;
  /** Pick a card (click / Enter). `pointer`: where the click was (mouse); absent = keyboard. */
  choose(item: AddCatalogItem, pointer?: WorkbenchPointer | null): void;
  /** Press on a card: dragging it closes the palette and drops like any drag. A tap does nothing here (the click chooses). */
  startDrag(item: AddCatalogItem, event: PointerEvent): void;
  /** A template card's ⋯ menu: Rename…, Export (panel templates), Delete. */
  templateMenu(item: AddCatalogItem): WorkbenchMenuItem[];
  /** Open the Library drawer (management) on a view; closes the palette. */
  manage(view: 'pages' | 'widgets'): void;
  close(): void;
}

export interface CreateAddPaletteApiOptions {
  controller: WorkbenchController;
  registry: WorkbenchRenderRegistry;
  request: WorkbenchAddPaletteRequest;
  /** The host's page contributions (missing default pages, restore all). */
  pages?: WorkbenchEditBarPagesExtension;
  /** Open a Library drawer view. */
  manage: (view: 'pages' | 'widgets') => void;
  /** What opened the palette (focus returns there when it is done); default: the focused element. */
  opener?: HTMLElement | null;
  /** The click-to-place session (injectable for tests). */
  beginPlacement?: typeof beginPlacement;
}

/** Where focus goes when the opener is gone: the edit bar's Add. */
const ADD_BUTTON_SELECTOR = '[data-editbar] [data-eb="add"]';

const PREVIEW_ID = '__aw-palette-preview__';
const DEFAULT_WIDGET_SLOT = { width: 120, height: 38 };

export function createAddPaletteApi(options: CreateAddPaletteApiOptions): WorkbenchAddPaletteApi {
  const { controller, registry, request } = options;
  const place = options.beginPlacement ?? beginPlacement;
  const opener = options.opener !== undefined ? options.opener : focusedElement();
  const close = () => controller.closeAddPalette();
  const zoneLabel = (zone: string) => widgetZoneLabel(controller.activeLayout, zone);

  /**
   * Give focus back to the opener (or the edit bar's Add) once the DOM settled —
   * unless something else took it meanwhile (a menu, a field).
   */
  const restoreFocus = () => {
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      const current = document.activeElement;
      if (current && current !== document.body && current.isConnected) return;
      const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>(ADD_BUTTON_SELECTOR);
      target?.focus({ preventScroll: true });
    }, 0);
  };
  const onPlacementEnd = (reason: PlacementEndReason) => {
    if (reason !== 'pass') restoreFocus();
  };

  /** Find the live version of a card (the catalog may have moved on since it rendered). */
  const live = (item: AddCatalogItem): AddCatalogItem | undefined => api.items().find((candidate) => candidate.key === item.key);

  const panelCommands = (item: AddCatalogItem, to: DockTarget): WorkbenchCommand[] => {
    const current = live(item);
    if (!current || current.kind !== 'panel') return [];
    // The user picked the exact spot: a panel already on this page moves there.
    return catalogAddCommands(controller.document, current.entry, to, { exact: true });
  };

  const widgetCommands = (item: AddCatalogItem, drop: { zone: string; index?: number }): WorkbenchCommand[] => {
    const current = live(item);
    if (!current || current.kind !== 'widget') return [];
    return widgetCatalogAddCommands(controller.document, current.entry, drop);
  };

  const run = (commands: WorkbenchCommand[]): DockDropCommitResult => {
    if (!commands.length) return false;
    return controller.dispatchMany(commands).success ? true : 'refused';
  };

  /**
   * A navigation gap (its on-screen neighbours; null = the end) → the index in
   * `navigation.order` (`movingId`: an entry being re-shown).
   */
  const navIndexForGap = (gap: { before?: string; after?: string } | null, movingId?: string): number | null => {
    const layout = controller.activeLayout;
    if (!layout) return null;
    return navOrderIndexForNeighbours(layout.navigation.order, gap ?? {}, movingId);
  };

  const pageCommands = (item: Extract<AddCatalogItem, { kind: 'page' }>, navIndex: number | null): WorkbenchCommand[] => {
    const layout = controller.activeLayout;
    if (!layout) return [];
    if (item.page.action === 'blank') return blankPageCommands(layout, createWorkbenchId('page'), navIndex);
    if (item.page.action === 'showNav') return showNavigationEntryCommands(item.page.entryId, navIndex);
    return [];
  };

  const widgetSlotSize = (item: AddCatalogItem): { width: number; height: number } => {
    if (item.kind !== 'widget') return DEFAULT_WIDGET_SLOT;
    const types = item.entry.types?.length ? item.entry.types : [item.entry.type];
    const width = types.reduce((total, type) => total + (registry.widgetSizing?.estWidth(type) ?? DEFAULT_WIDGET_SLOT.width), 0);
    return { width: Math.max(44, Math.min(width, 420)), height: DEFAULT_WIDGET_SLOT.height };
  };

  const api: WorkbenchAddPaletteApi = {
    request,

    items() {
      const layout = controller.activeLayout;
      const doc = controller.document;
      const panels = buildPanelCatalog(layout, {
        canonical: registry.canonicalPanels(),
        templates: doc.panelLibrary,
        hiddenTypes: registry.panelCatalogHiddenTypes
      });
      const widgets = buildWidgetCatalog(layout, {
        canonical: registry.canonicalWidgets(),
        templates: doc.widgetLibrary,
        unavailableReason: (type) => registry.widgetUnavailableReason(type)
      });
      return buildAddCatalog({ layout, panels, widgets, pageCards: options.pages?.addPageCards?.() ?? null, zoneLabel });
    },

    pageNote() {
      return options.pages?.addPageCards?.().note;
    },

    zoneLabel,

    widgetPreview(item) {
      if (item.kind !== 'widget') return null;
      const layout = controller.activeLayout;
      const entry = item.entry;
      if (entry.source === 'template') {
        const template = entry.templateId ? controller.document.widgetLibrary[entry.templateId] : undefined;
        const first = template ? Object.values(template.widgets).sort((a, b) => a.order - b.order)[0] : undefined;
        return first ? { ...first, id: `${PREVIEW_ID}${first.id}`, size: 'default', groupId: null } : null;
      }
      const instance = entry.instanceId ? layout?.widgets[entry.instanceId] : undefined;
      if (instance) return { ...instance, size: 'default', groupId: null };
      return {
        id: `${PREVIEW_ID}${entry.type}`,
        type: entry.type,
        zone: 'top.right',
        order: 0,
        size: 'default',
        ...(entry.spec?.state ? { state: JSON.parse(JSON.stringify(entry.spec.state)) as JsonObject } : {})
      };
    },

    choose(item, pointer) {
      if (item.disabled) return;
      const target = request.target;

      if (item.kind === 'page') {
        const movingId = item.page.action === 'showNav' ? item.page.entryId : undefined;
        if (item.page.action === 'host') {
          close();
          item.page.card.run();
          restoreFocus();
          return;
        }
        if (target?.kind === 'page') {
          close();
          // No index on the target = the end of the navigation (a re-shown entry
          // too — not the slot it was hidden from).
          run(pageCommands(item, target.navIndex ?? (movingId ? navIndexForGap(null, movingId) : null)));
          restoreFocus();
          return;
        }
        close();
        place({
          controller,
          kind: 'page',
          label: item.title,
          pointer,
          // No gap (no navigation on screen) = the end, for a re-shown entry too.
          commitPage: (gap) => run(pageCommands(item, gap || movingId ? navIndexForGap(gap, movingId) : null)),
          onEnd: onPlacementEnd
        });
        return;
      }

      if (item.kind === 'panel') {
        if (cardUsesFixedTarget(item, target) && target?.kind === 'panel') {
          close();
          run(panelCommands(item, target.to));
          restoreFocus();
          return;
        }
        close();
        place({
          controller,
          kind: 'panel',
          label: item.title,
          pointer,
          commitPanel: (drop: DockDropTarget) => {
            const to = dockTargetFor(drop);
            return to ? commitPanelDragOut(controller, panelCommands(item, to)) : false;
          },
          onEnd: onPlacementEnd
        });
        return;
      }

      if (cardUsesFixedTarget(item, target) && target?.kind === 'widget') {
        close();
        run(widgetCommands(item, { zone: target.zone, index: target.index }));
        restoreFocus();
        return;
      }
      close();
      place({
        controller,
        kind: 'widget',
        label: item.title,
        pointer,
        size: widgetSlotSize(item),
        commitWidget: (drop) => run(widgetCommands(item, drop)),
        onEnd: onPlacementEnd
      });
    },

    startDrag(item, event) {
      if (item.disabled || event.button !== 0) return;
      // Touch / pen: the grid scrolls vertically (the card is `touch-action: pan-y`);
      // only a sideways pull drags the card out.
      const shouldActivate = sidewaysTouchDragGate(event.pointerType);
      if (item.kind === 'panel') {
        startPanelDragOut({
          controller,
          event,
          label: item.title,
          onActivate: close,
          shouldActivate,
          commit: ({ target }) => {
            const commands = panelCommands(item, target);
            return commands.length ? commands : null;
          }
        });
      } else if (item.kind === 'widget') {
        startWidgetDragOut({
          controller,
          event,
          size: widgetSlotSize(item),
          onActivate: close,
          shouldActivate,
          commit: ({ zone, index }) => {
            const commands = widgetCommands(item, { zone, index });
            return commands.length ? commands : null;
          }
        });
      }
    },

    templateMenu(item) {
      if (!item.template) return [];
      const noop = () => {};
      if (item.kind === 'panel' && item.entry.templateId) {
        const templateId = item.entry.templateId;
        return [
          { id: 'template.header', kind: 'header', label: item.title, run: noop },
          {
            id: 'template.rename',
            kind: 'input',
            label: 'Rename…',
            value: item.title,
            placeholder: 'Template name',
            run: noop,
            onSubmit: (title) => controller.dispatch({ type: 'library.panel.rename', templateId, title }).success
          },
          {
            id: 'template.export',
            label: 'Export',
            hint: '.json',
            run: () => {
              const pkg = exportPanelPackage(controller.document, templateId);
              if (!pkg) {
                enqueueToast({ text: `Could not export “${item.title}”`, tone: 'danger' });
                return;
              }
              downloadWorkbenchJson({ stem: layoutPackageFilename(item.title, 'panel'), data: pkg });
              enqueueToast({ text: `Exported “${item.title}”` });
            }
          },
          {
            id: 'template.delete',
            label: 'Delete template',
            danger: true,
            separatorBefore: true,
            confirm: { prompt: `Delete the template “${item.title}”? Panels already placed stay.`, confirmLabel: 'Delete' },
            run: () => controller.dispatch({ type: 'library.panel.delete', templateId })
          }
        ];
      }
      if (item.kind === 'widget' && item.entry.templateId) {
        const templateId = item.entry.templateId;
        return [
          { id: 'template.header', kind: 'header', label: item.title, run: noop },
          {
            id: 'template.rename',
            kind: 'input',
            label: 'Rename…',
            value: item.title,
            placeholder: 'Template name',
            run: noop,
            onSubmit: (title) => controller.dispatch({ type: 'library.widget.rename', templateId, title }).success
          },
          {
            id: 'template.delete',
            label: 'Delete template',
            danger: true,
            separatorBefore: true,
            confirm: { prompt: `Delete the template “${item.title}”? Widgets already placed stay.`, confirmLabel: 'Delete' },
            run: () => controller.dispatch({ type: 'library.widget.delete', templateId })
          }
        ];
      }
      return [];
    },

    manage(view) {
      close();
      options.manage(view);
    },

    close() {
      close();
      restoreFocus();
    }
  };
  return api;
}

/** The focused element (not the body), outside a DOM: none. */
function focusedElement(): HTMLElement | null {
  if (typeof document === 'undefined' || typeof HTMLElement === 'undefined') return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}
