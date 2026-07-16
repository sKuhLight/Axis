import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forgefx, ForgeError } from './forgefx';

// Minimal Response stand-in (mirrors forgefxDeviceCache.test.ts): req() reads ok/status + json().
function res(status: number, body: unknown, ct = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? ct : null) },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0)
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const OK = {
  source: { device: 'FM3', name: 'My Preset', decodeDepth: 'full' },
  target: { sourceDevice: 'fm9', name: 'My Preset', sceneCount: 4, blocks: [], routing: { seriesChains: [] }, decodeDepth: 'full' },
  events: [],
  summary: { total: 0, info: 0, warn: 0, loss: 0 }
};

describe('forgefx.convertPreset — request shape', () => {
  it('POSTs to /api/preset/convert with just the target when no source (current preset)', async () => {
    fetchMock.mockResolvedValueOnce(res(200, OK));
    await expect(forgefx.convertPreset('fm9')).resolves.toEqual(OK);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/preset/convert');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as { body: string }).body)).toEqual({ targetDevice: 'fm9' });
  });

  it('includes source.syx (base64) when converting from a file', async () => {
    fetchMock.mockResolvedValueOnce(res(200, OK));
    await forgefx.convertPreset('am4', 'QkFTRTY0');
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as { body: string }).body)).toEqual({ targetDevice: 'am4', source: { syx: 'QkFTRTY0' } });
  });
});

describe('forgefx.convertPreset — error surfacing', () => {
  it('surfaces 501 (active device cannot provide a source) as ForgeError', async () => {
    fetchMock.mockResolvedValue(res(501, { error: 'no source' }));
    await expect(forgefx.convertPreset('fm3')).rejects.toMatchObject({ status: 501 });
    await expect(forgefx.convertPreset('fm3')).rejects.toBeInstanceOf(ForgeError);
  });

  it('surfaces 400 (invalid request) as ForgeError', async () => {
    fetchMock.mockResolvedValueOnce(res(400, { error: 'bad target' }));
    await expect(forgefx.convertPreset('fm3')).rejects.toMatchObject({ status: 400 });
  });
});
