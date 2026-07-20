import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forgefx, ForgeError } from './forgefx';

// Minimal Response stand-in for the forgefx `req()` / raw-fetch helpers (they read ok/status + either
// json() or headers.get('content-type')). No DOM/undici needed — this is a plain node unit test.
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

describe('forgefx.deviceCache — capability-absent handling', () => {
  it('returns the parsed status on a 200 (happy path)', async () => {
    const status = { key: 'fm3-1p7', exists: false, building: false };
    fetchMock.mockResolvedValueOnce(res(200, status));
    await expect(forgefx.deviceCache()).resolves.toEqual(status);
    expect(fetchMock).toHaveBeenCalledWith('/api/device/cache', expect.objectContaining({ headers: expect.any(Object) }));
  });

  it('degrades to null on a 501 (device-gated / unsupported)', async () => {
    fetchMock.mockResolvedValueOnce(res(501, { error: 'unsupported' }));
    await expect(forgefx.deviceCache()).resolves.toBeNull();
  });

  it('degrades to null on a 404 (old server without the route)', async () => {
    fetchMock.mockResolvedValueOnce(res(404, {}));
    await expect(forgefx.deviceCache()).resolves.toBeNull();
  });

  it('cacheSources + cloudCacheCheck also degrade to null when absent', async () => {
    fetchMock.mockResolvedValue(res(404, {}));
    await expect(forgefx.cacheSources()).resolves.toBeNull();
    await expect(forgefx.cloudCacheCheck()).resolves.toBeNull();
  });
});

describe('forgefx.buildDeviceCache', () => {
  it('resolves with the key on 202', async () => {
    fetchMock.mockResolvedValueOnce(res(202, { key: 'fm3-1p7' }));
    await expect(forgefx.buildDeviceCache()).resolves.toEqual({ key: 'fm3-1p7' });
  });

  it('sends NO body by default — the read-only one-click stays byte-for-byte as before', async () => {
    fetchMock.mockResolvedValueOnce(res(202, { key: 'fm3-1p7' }));
    await forgefx.buildDeviceCache();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/device/cache/build');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBeUndefined();
  });

  it("carries mode:'full' in the POST body when the taper capture is requested", async () => {
    fetchMock.mockResolvedValueOnce(res(202, { key: 'fm3-1p7' }));
    await forgefx.buildDeviceCache({ mode: 'full' });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as { body: string }).body)).toEqual({ mode: 'full' });
  });

  it("carries mode:'read-only' when explicitly requested", async () => {
    fetchMock.mockResolvedValueOnce(res(202, { key: 'fm3-1p7' }));
    await forgefx.buildDeviceCache({ mode: 'read-only' });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as { body: string }).body)).toEqual({ mode: 'read-only' });
  });

  it('throws ForgeError(409) when a build is already running (caller handles, not swallowed)', async () => {
    fetchMock.mockResolvedValueOnce(res(409, { error: 'building' }));
    await expect(forgefx.buildDeviceCache()).rejects.toMatchObject({ status: 409 });
  });

  it('throws ForgeError(501) when the capability is absent', async () => {
    fetchMock.mockResolvedValueOnce(res(501, {}));
    await expect(forgefx.buildDeviceCache()).rejects.toBeInstanceOf(ForgeError);
  });

  it("throws ForgeError(501) {capability:'fullCapture'} when full mode is unsupported (mode still sent)", async () => {
    fetchMock.mockResolvedValueOnce(res(501, { error: 'unsupported', capability: 'fullCapture' }));
    await expect(forgefx.buildDeviceCache({ mode: 'full' })).rejects.toMatchObject({ status: 501 });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as { body: string }).body)).toEqual({ mode: 'full' });
  });
});

describe('forgefx.importEditorCache', () => {
  it('uploads bytes as octet-stream with name + force in the query', async () => {
    const status = { key: 'fm3-1p7', exists: true, building: false };
    fetchMock.mockResolvedValueOnce(res(200, status));
    const bytes = new Uint8Array([1, 2, 3]);
    await expect(forgefx.importEditorCache({ bytes, name: 'effectDefinitions_15_1p7.cache' }, { force: true })).resolves.toEqual(status);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/device/cache/import?name=effectDefinitions_15_1p7.cache&force=1');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as { headers: Record<string, string> }).headers['content-type']).toBe('application/octet-stream');
  });

  it('throws ForgeError(409) on a firmware/model mismatch', async () => {
    fetchMock.mockResolvedValueOnce(res(409, { error: 'firmware mismatch' }));
    const bytes = new Uint8Array([1]);
    await expect(forgefx.importEditorCache({ bytes, name: 'x.cache' })).rejects.toMatchObject({ status: 409 });
  });

  it('imports a discovered candidate by path via a JSON body (no query string)', async () => {
    const status = { key: 'fm3-1p7', exists: true, building: false };
    fetchMock.mockResolvedValueOnce(res(200, status));
    await expect(forgefx.importEditorCache({ path: '/disk/effectDefinitions_15_1p7.cache' })).resolves.toEqual(status);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/device/cache/import');
    expect(JSON.parse((init as { body: string }).body)).toEqual({ path: '/disk/effectDefinitions_15_1p7.cache' });
  });
});

describe('forgefx.cloudCachePublish', () => {
  it('throws ForgeError(401) when not signed in', async () => {
    fetchMock.mockResolvedValueOnce(res(401, { error: 'auth' }));
    await expect(forgefx.cloudCachePublish()).rejects.toMatchObject({ status: 401 });
  });

  it('resolves on success', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { ok: true, deduped: false }));
    await expect(forgefx.cloudCachePublish()).resolves.toEqual({ ok: true, deduped: false });
  });
});
