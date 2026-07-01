// Axis Cloud Remote — CLIENT transport. The browser counterpart to ForgeFX's host agent: RPCs to the
// user's PC over their PRIVATE Supabase Realtime channel `remote:<uid>`. Sends {id,method,path,body} as a
// 'req' broadcast; the host replies with a 'res' broadcast carrying the same id. Correlates by id with a
// timeout; base64 bodies (binary responses) are decoded to ArrayBuffer. Plugs into forgefx.ts via
// setRemoteTransport, so the entire existing UI drives the remote device with no other changes.
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { RemoteResponse, RemoteTransport } from './forgefx';

type ResPayload = { id?: string; status: number; contentType: string; body: string; encoding: 'utf8' | 'base64' };

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Join the authenticated user's private channel and return a RemoteTransport + teardown. `supabase` must
 *  be a signed-in browser client (its session authorizes the Realtime channel via RLS). */
export async function connectRemote(
  supabase: SupabaseClient,
  userId: string,
  opts: { requestTimeoutMs?: number } = {}
): Promise<{ transport: RemoteTransport; channel: RealtimeChannel; close: () => void }> {
  const reqTimeout = opts.requestTimeoutMs ?? 30000;
  const channel = supabase.channel(`remote:${userId}`, { config: { private: true, broadcast: { ack: false } } });
  const pending = new Map<string, (r: RemoteResponse) => void>();

  channel.on('broadcast', { event: 'res' }, (msg: { payload?: unknown }) => {
    const r = msg.payload as ResPayload | undefined;
    if (!r?.id) return;
    const resolve = pending.get(r.id);
    if (!resolve) return;
    pending.delete(r.id);
    resolve({ status: r.status, contentType: r.contentType, body: r.encoding === 'base64' ? b64ToArrayBuffer(r.body) : r.body });
  });

  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('realtime subscribe timed out — is your PC online + remote enabled?')), 12000);
    channel.subscribe((st: string) => {
      if (st === 'SUBSCRIBED') { clearTimeout(t); resolve(); }
      else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { clearTimeout(t); reject(new Error(`realtime ${st}`)); }
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
