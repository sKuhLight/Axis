// Axis Cloud Remote — CLIENT transport. The browser counterpart to ForgeFX's host agent: RPCs to the
// user's PC over their PRIVATE Supabase Realtime channel `remote:<uid>`. Sends {id,method,path,body} as a
// 'req' broadcast; the host replies with a 'res' broadcast carrying the same id. Correlates by id with a
// timeout; base64 bodies (binary responses) are decoded to ArrayBuffer. Plugs into forgefx.ts via
// setRemoteTransport, so the entire existing UI drives the remote device with no other changes.
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { RemoteResponse, RemoteTransport } from './forgefx';

type ResPayload = { id?: string; status: number; contentType: string; body: string; encoding: 'utf8' | 'base64' | 'gzip' };

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Decode one relay response body into what req() expects: a string for text/JSON, an ArrayBuffer for binary.
 *  Handles the host's three framings — utf8 (small text), base64 (small binary), gzip (anything > 2KB). */
async function decodeBody(r: ResPayload): Promise<string | ArrayBuffer> {
  const texty = /json|text|javascript|xml|svg/i.test(r.contentType);
  if (r.encoding === 'utf8') return r.body;
  if (r.encoding === 'base64') return b64ToBytes(r.body).buffer;
  // gzip: inflate the base64'd gzip stream, then hand back a string (text) or ArrayBuffer (binary)
  const inflated = await new Response(new Blob([b64ToBytes(r.body)]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return texty ? new TextDecoder().decode(inflated) : inflated;
}

/** Join the authenticated user's private channel and return a RemoteTransport + teardown. `supabase` must
 *  be a signed-in browser client (its session authorizes the Realtime channel via RLS). */
export async function connectRemote(
  supabase: SupabaseClient,
  userId: string,
  opts: { requestTimeoutMs?: number; onEvent?: (e: unknown) => void } = {}
): Promise<{ transport: RemoteTransport; channel: RealtimeChannel; close: () => void }> {
  const reqTimeout = opts.requestTimeoutMs ?? 30000;
  const channel = supabase.channel(`remote:${userId}`, { config: { private: true, broadcast: { ack: false } } });
  const pending = new Map<string, (r: RemoteResponse) => void>();

  // Live change events pushed by the host (param edits, grid/preset/scene changes) → keep the remote UI in sync.
  if (opts.onEvent) channel.on('broadcast', { event: 'evt' }, (msg: { payload?: unknown }) => opts.onEvent!(msg.payload));

  channel.on('broadcast', { event: 'res' }, (msg: { payload?: unknown }) => {
    const r = msg.payload as ResPayload | undefined;
    if (!r?.id) return;
    const resolve = pending.get(r.id);
    if (!resolve) return;
    pending.delete(r.id);
    decodeBody(r)
      .then((body) => resolve({ status: r.status, contentType: r.contentType, body }))
      .catch(() => resolve({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'decode failed' }) }));
  });

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('realtime subscribe timed out — is your PC online + remote enabled?')), 12000);
    channel.subscribe((st: string) => {
      if (st === 'SUBSCRIBED') {
        clearTimeout(t);
        // Announce presence so the host only broadcasts live device events while a remote is actually
        // watching (otherwise local editing would spam the channel for no one).
        channel.track({ role: 'remote' }).catch(() => {});
        resolve();
      } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(t); reject(new Error(`realtime ${st}`)); }
    });
  });

  let seq = 0;
  const transport: RemoteTransport = (rq) =>
    new Promise<RemoteResponse>((resolve, reject) => {
      const id = `${Date.now().toString(36)}-${seq++}`;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('remote request timed out')); }, reqTimeout);
      pending.set(id, (r) => { clearTimeout(timeout); resolve(r); });
      channel
        .send({ type: 'broadcast', event: 'req', payload: { id, method: rq.method, path: rq.path, body: rq.body } })
        .catch((e: unknown) => { clearTimeout(timeout); pending.delete(id); reject(e instanceof Error ? e : new Error('relay send failed')); });
    });

  return {
    transport,
    channel,
    close: () => { pending.clear(); void supabase.removeChannel(channel); }
  };
}
