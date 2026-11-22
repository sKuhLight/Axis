import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginPointerDrag } from '../dragSession';

// The session core only needs `window` as an event bus, so a bare EventTarget stands in for it (node
// environment, no DOM).
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const down = (x = 0, y = 0): PointerEvent =>
  ({ button: 0, clientX: x, clientY: y, preventDefault: vi.fn() }) as unknown as PointerEvent;

const fire = (type: 'pointermove' | 'pointerup' | 'pointercancel', x = 0, y = 0) =>
  window.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y }));

function session() {
  const handlers = { onActivate: vi.fn(), onMove: vi.fn(), onDrop: vi.fn(), onTap: vi.fn(), onCancel: vi.fn() };
  beginPointerDrag({ event: down(), ...handlers });
  return handlers;
}

describe('beginPointerDrag', () => {
  it('drops on pointerup after the pointer crossed the threshold', () => {
    const h = session();
    fire('pointermove', 60, 60);
    fire('pointerup', 60, 60);
    expect(h.onActivate).toHaveBeenCalledTimes(1);
    expect(h.onDrop).toHaveBeenCalledTimes(1);
    expect(h.onCancel).not.toHaveBeenCalled();
  });

  it('taps on pointerup when the pointer never crossed the threshold', () => {
    const h = session();
    fire('pointerup');
    expect(h.onTap).toHaveBeenCalledTimes(1);
    expect(h.onDrop).not.toHaveBeenCalled();
  });

  it('cancels a drag in progress without dropping, and tears the listeners down', () => {
    const h = session();
    fire('pointermove', 60, 60);
    h.onMove.mockClear();
    fire('pointercancel');
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(h.onDrop).not.toHaveBeenCalled();
    // nothing is listening any more: a later move or unrelated pointerup must not act on the dead gesture
    fire('pointermove', 200, 200);
    fire('pointerup', 200, 200);
    expect(h.onMove).not.toHaveBeenCalled();
    expect(h.onDrop).not.toHaveBeenCalled();
    expect(h.onTap).not.toHaveBeenCalled();
  });

  it('cancels a press that never became a drag without firing the tap', () => {
    const h = session();
    fire('pointercancel');
    fire('pointerup');
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(h.onTap).not.toHaveBeenCalled();
    expect(h.onDrop).not.toHaveBeenCalled();
  });

  it('tolerates a session that registered no onCancel', () => {
    const onDrop = vi.fn();
    beginPointerDrag({ event: down(), onMove: vi.fn(), onDrop });
    expect(() => fire('pointercancel')).not.toThrow();
    fire('pointerup');
    expect(onDrop).not.toHaveBeenCalled();
  });
});
