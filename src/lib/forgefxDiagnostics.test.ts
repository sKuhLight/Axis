import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forgefx, ForgeError } from './forgefx';
import { errorInfo, startErrorMessage, uploadErrorMessage } from './diagnostics';

// Minimal Response stand-in for the forgefx `req()` helper (ok/status + headers.get + json()).
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
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => fetchMock.mock.calls.at(-1) as [string, RequestInit];

describe('forgefx device-diagnostics client', () => {
  it('reads the status', async () => {
    const st = { state: 'running', id: 'r1', resultAvailable: false };
    fetchMock.mockResolvedValueOnce(res(200, st));
    await expect(forgefx.diagnosticCaptureStatus()).resolves.toEqual(st);
    expect(lastCall()[0]).toBe('/api/diagnostics/capture');
    expect(lastCall()[1].method).toBeUndefined(); // GET
  });

  it('starts with the acknowledged request body, POST to the capture route', async () => {
    fetchMock.mockResolvedValueOnce(res(202, { started: true, id: 'r1' }));
    await expect(forgefx.startDiagnosticCapture({ acknowledged: true, includeFullWalk: true })).resolves.toEqual({ started: true, id: 'r1' });
    const [url, init] = lastCall();
    expect(url).toBe('/api/diagnostics/capture');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ acknowledged: true, includeFullWalk: true });
  });

  it('cancels with a bodyless POST', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { ok: true }));
    await expect(forgefx.cancelDiagnosticCapture()).resolves.toEqual({ ok: true });
    expect(lastCall()[0]).toBe('/api/diagnostics/capture/cancel');
    expect(lastCall()[1].method).toBe('POST');
    expect(lastCall()[1].body).toBeUndefined();
  });

  it('fetches the result with a long ceiling (the bundle carries a full wire log)', async () => {
    const bundle = { schema: 1, id: 'r1' };
    fetchMock.mockResolvedValueOnce(res(200, bundle));
    await expect(forgefx.diagnosticCaptureResult()).resolves.toEqual(bundle);
    expect(lastCall()[0]).toBe('/api/diagnostics/capture/result');
    expect(lastCall()[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('uploads with {consent:true} to the upload route', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { ok: true, captureId: 'c1', bytes: 1234 }));
    await expect(forgefx.uploadDiagnosticCapture(true)).resolves.toEqual({ ok: true, captureId: 'c1', bytes: 1234 });
    const [url, init] = lastCall();
    expect(url).toBe('/api/diagnostics/capture/upload');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ consent: true });
  });

  it('keeps the JSON error body on ForgeError so the wording can use it (409 busy)', async () => {
    fetchMock.mockResolvedValueOnce(res(409, { error: 'busy', what: 'cache-build' }));
    const e = await forgefx.startDiagnosticCapture({ acknowledged: true }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ForgeError);
    expect((e as ForgeError).status).toBe(409);
    expect((e as ForgeError).body).toEqual({ error: 'busy', what: 'cache-build' });
    const { status, body } = errorInfo(e);
    expect(startErrorMessage(status, body)).toMatch(/reading the device definitions/i);
  });

  it('413 carries bytes and limit through to the message; 401 maps to the sign-in hint', async () => {
    fetchMock.mockResolvedValueOnce(res(413, { error: 'too-large', bytes: 40 * 1024 * 1024, limit: 25 * 1024 * 1024 }));
    const e413 = await forgefx.uploadDiagnosticCapture(true).catch((x: unknown) => x);
    expect(uploadErrorMessage(errorInfo(e413).status, errorInfo(e413).body)).toContain('40.0 MB');
    fetchMock.mockResolvedValueOnce(res(401, { error: 'not-signed-in' }));
    const e401 = await forgefx.uploadDiagnosticCapture(true).catch((x: unknown) => x);
    expect(errorInfo(e401).status).toBe(401);
    expect(uploadErrorMessage(401)).toMatch(/sign in/i);
  });

  it('leaves the body undefined for a non-JSON or unreadable error body (no throw while reading it)', async () => {
    fetchMock.mockResolvedValueOnce(res(502, '<html>bad gateway</html>', 'text/html'));
    const e = await forgefx.diagnosticCaptureStatus().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ForgeError);
    expect((e as ForgeError).body).toBeUndefined();
    fetchMock.mockResolvedValueOnce({ ...res(500, null), json: async () => { throw new Error('bad json'); } });
    const e2 = await forgefx.diagnosticCaptureStatus().catch((x: unknown) => x);
    expect((e2 as ForgeError).status).toBe(500);
    expect((e2 as ForgeError).body).toBeUndefined();
  });

  it('a network failure surfaces as a non-HTTP error (status 0 in the wording)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const e = await forgefx.diagnosticCaptureStatus().catch((x: unknown) => x);
    expect(errorInfo(e).status).toBe(0);
  });
});
