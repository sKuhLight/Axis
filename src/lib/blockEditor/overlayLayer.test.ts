import { describe, expect, it } from 'vitest';
import { beLayer, SHELL_ROOT_SELECTOR, Z_DRAG, Z_OVERLAY } from './overlayLayer';

const fakeNode = (host: { appendChild: (n: unknown) => unknown } | null) => {
  const n = {
    style: { zIndex: '' },
    asked: '' as string,
    removed: false,
    closest(sel: string) {
      n.asked = sel;
      return host;
    },
    remove() {
      n.removed = true;
    }
  };
  return n;
};

describe('beLayer', () => {
  it('bands: overlay above the dock chrome and below toasts / modals, drag with the drag layer', () => {
    expect(Z_OVERLAY).toBeGreaterThan(230); // nav sheet
    expect(Z_OVERLAY).toBeLessThan(300); // toasts
    expect(Z_DRAG).toBe(1000);
  });
  it('moves the layer to the workbench shell root and sets its band', () => {
    const moved: unknown[] = [];
    const node = fakeNode({ appendChild: (x) => moved.push(x) });
    const a = beLayer(node, 'overlay');
    expect(node.asked).toBe(SHELL_ROOT_SELECTOR);
    expect(moved).toEqual([node]);
    expect(node.style.zIndex).toBe(String(Z_OVERLAY));
    a.update('drag');
    expect(node.style.zIndex).toBe(String(Z_DRAG));
    a.destroy();
    expect(node.removed).toBe(true);
  });
  it('outside the workbench (monolith) the layer stays where it is', () => {
    const node = fakeNode(null);
    beLayer(node, 'drag');
    expect(node.style.zIndex).toBe(String(Z_DRAG));
  });
});
