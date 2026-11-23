// Stacking bands of the Block Editor's floating parts. Everything that floats over the app (⋯ menu,
// "Find a control…" popover, select popover, value bubble, modifier flyout, pin menu) lives in ONE fixed
// layer in the OVERLAY band; the hold-to-drag pin chip in the DRAG band. In the workbench the layer is
// moved to the shell's outermost element, so it stacks with the shell's own chrome and is not trapped in
// a panel's stacking context (a maximized tab stack is a fixed z-50 context, under the dock openers):
//
//   dock openers 170 · dock drawers 180 · nav sheet 230  <  OVERLAY 240  <  toasts 300 · modals 360–400  <  DRAG 1000
//
// OVERLAY matches the workbench ContextMenu's overlay band (scrim 239 / menu 240); DRAG matches the
// workbench DragLayer. Inside a layer the parts order themselves with small local z-indexes. The editor
// itself keeps its own stacking context (its in-panel z-indexes never meet the dock chrome). In the
// monolith shell there is no workbench shell element: the layer stays inside the editor.

export const Z_OVERLAY = 240;
export const Z_DRAG = 1000;
export type LayerBand = 'overlay' | 'drag';

/** The workbench shell's outermost element (`WorkbenchHost`'s `.aw-viewport`, which also carries the
 *  `--aw-*` tokens): the layer's home inside the workbench. */
export const SHELL_ROOT_SELECTOR = '.aw-viewport';

interface LayerNode {
  style: { zIndex: string };
  closest(selector: string): { appendChild(node: unknown): unknown } | null;
  remove(): void;
}

/** Svelte action: give a fixed layer its band and move it to the workbench shell root when there is one.
 *  The node must not be a block boundary (wrap it in an element); it is removed on destroy. */
export function beLayer(node: LayerNode, band: LayerBand) {
  node.style.zIndex = String(band === 'drag' ? Z_DRAG : Z_OVERLAY);
  const host = node.closest(SHELL_ROOT_SELECTOR);
  if (host) host.appendChild(node);
  return {
    update(next: LayerBand) {
      node.style.zIndex = String(next === 'drag' ? Z_DRAG : Z_OVERLAY);
    },
    destroy() {
      node.remove();
    }
  };
}
