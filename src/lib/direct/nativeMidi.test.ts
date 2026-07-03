import { describe, it, expect, vi, beforeEach } from 'vitest';

// Controllable fake of the AxisMidi native plugin. Defined via vi.hoisted so it exists before the
// hoisted vi.mock factory runs. `state.listener` is the 'sysex' callback the transport registers in
// open(); tests emit frames through it to simulate inbound SysEx. `state.sends` records outbound.
const h = vi.hoisted(() => {
  const state: { listener: ((e: { frame: number[] }) => void) | null; sends: number[][] } = {
    listener: null,
    sends: []
  };
  const fake = {
    listEndpoints: async () => ({ endpoints: [] }),
    connect: async () => {},
    disconnect: async () => {},
    send: async (o: { data: number[] }) => {
      state.sends.push(o.data);
    },
    presentBluetoothSetup: async () => {},
    addListener: async (_e: string, fn: (e: { frame: number[] }) => void) => {
      state.listener = fn;
      return {
        remove: async () => {
          state.listener = null;
        }
      };
    },
    removeAllListeners: async () => {}
  };
  return { state, fake };
});

vi.mock('@capacitor/core', () => ({ registerPlugin: () => h.fake }));

import { NativeMidiTransport, type AxisMidiEndpoint } from './nativeMidi';

const usbFractal: AxisMidiEndpoint = {
  id: 'ep1',
  name: 'Axe-Fx III',
  hasInput: true,
  hasOutput: true,
  fractal: true,
  link: 'usb'
};
const bleAdapter: AxisMidiEndpoint = {
  id: 'ep2',
  name: 'WIDI Master',
  hasInput: true,
  hasOutput: true,
  fractal: false,
  link: 'ble'
};

const F = (n: number) => [0xf0, n, 0xf7];

beforeEach(() => {
  h.state.listener = null;
  h.state.sends = [];
  vi.useFakeTimers();
});

describe('NativeMidiTransport.slow', () => {
  it('is fast only for USB into a Fractal unit; BLE/DIN are slow', () => {
    expect(new NativeMidiTransport(usbFractal).slow).toBe(false);
    expect(new NativeMidiTransport(bleAdapter).slow).toBe(true);
  });
});

describe('NativeMidiTransport.request', () => {
  it('collects reply frames until the quiet window elapses', async () => {
    const t = new NativeMidiTransport(usbFractal);
    await t.open();
    const p = t.request(F(0x01), { quietMs: 90, timeoutMs: 1500 });
    await vi.advanceTimersByTimeAsync(0); // flush the send + subscription in the chain microtask
    h.state.listener!({ frame: F(0x10) });
    h.state.listener!({ frame: F(0x11) });
    await vi.advanceTimersByTimeAsync(90); // quiet window closes
    await expect(p).resolves.toEqual([F(0x10), F(0x11)]);
    expect(h.state.sends).toEqual([F(0x01)]); // request sent its bytes once
  });

  it('resolves early when match() is satisfied', async () => {
    const t = new NativeMidiTransport(usbFractal);
    await t.open();
    const p = t.request(F(0x01), { match: (frames) => frames.length === 1 });
    await vi.advanceTimersByTimeAsync(0);
    h.state.listener!({ frame: F(0x10) });
    await expect(p).resolves.toEqual([F(0x10)]);
  });

  it('rejects on timeout when no frames arrive', async () => {
    const t = new NativeMidiTransport(usbFractal);
    await t.open();
    const p = t.request(F(0x01), { timeoutMs: 100 });
    const assertion = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('serializes: the second request does not send until the first resolves', async () => {
    const t = new NativeMidiTransport(usbFractal);
    await t.open();
    const p1 = t.request(F(0x01), { quietMs: 50 });
    const p2 = t.request(F(0x02), { quietMs: 50 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.state.sends).toEqual([F(0x01)]); // only the first is in flight

    h.state.listener!({ frame: F(0x10) });
    await vi.advanceTimersByTimeAsync(50);
    await p1;
    await vi.advanceTimersByTimeAsync(0);
    expect(h.state.sends).toEqual([F(0x01), F(0x02)]); // now the second sends

    h.state.listener!({ frame: F(0x20) });
    await vi.advanceTimersByTimeAsync(50);
    await expect(p2).resolves.toEqual([F(0x20)]);
  });
});

describe('NativeMidiTransport.onFrame', () => {
  it('stops delivering after unsubscribe', async () => {
    const t = new NativeMidiTransport(usbFractal);
    await t.open();
    const seen: number[][] = [];
    const off = t.onFrame((f) => seen.push(f));
    h.state.listener!({ frame: F(0x10) });
    expect(seen).toEqual([F(0x10)]);
    off();
    h.state.listener!({ frame: F(0x11) });
    expect(seen).toEqual([F(0x10)]); // no new delivery
  });
});
