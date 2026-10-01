import { createClient } from '@supabase/supabase-js';

// The bundled game already contains its WebRTC multiplayer engine. This
// supplies the small room/signaling service it expects, using the same
// Supabase Realtime project on both Grade Analytics domains.
const nativeFetch = window.fetch.bind(window);
const NativeWebSocket = window.WebSocket;
const client = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const admissions = new Map();
const waitingChannels = new Map();

function id() {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function roomChannel(roomId) {
  return client.channel(`car-soccer-room:${roomId}`, {
    config: { broadcast: { ack: true } },
  });
}

function subscribe(channel, signal) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => finish(new Error('Room connection timed out.')), 10000);
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    }
    signal?.addEventListener('abort', abort, { once: true });
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') finish();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') finish(new Error('Room service unavailable.'));
    });
  });
}

async function join(roomId, signal) {
  if (!/^[a-f0-9]{32}$/.test(roomId)) return response({ error: 'Invalid room code.' }, 400);
  const channel = roomChannel(roomId);
  const requestId = id();
  const connection = id();
  let timeout;
  let abort;
  const accepted = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Room not found or the host is offline.')), 10000);
    abort = () => reject(new DOMException('Cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    channel.on('broadcast', { event: 'join-accepted' }, ({ payload }) => {
      if (payload.requestId === requestId) resolve(payload);
    });
    channel.on('broadcast', { event: 'join-rejected' }, ({ payload }) => {
      if (payload.requestId === requestId) reject(new Error(payload.error || 'Room is full.'));
    });
  });
  try {
    await subscribe(channel, signal);
    await channel.send({
      type: 'broadcast',
      event: 'join-request',
      payload: { requestId, connection },
    });
    const result = await accepted;
    const ticket = id();
    const admission = {
      id: roomId, ticket, connection, host: false, slot: 1,
      room: result.room,
    };
    admissions.set(ticket, admission);
    waitingChannels.set(ticket, channel);
    return response(admission);
  } catch (error) {
    void client.removeChannel(channel);
    return response({ error: error instanceof Error ? error.message : 'Could not join room.' }, 404);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

window.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/multiplayer/')) {
    return nativeFetch(input, init);
  }
  const action = url.pathname.split('/').pop();
  const body = (() => {
    try { return JSON.parse(init?.body || '{}'); } catch { return {}; }
  })();
  if (action === 'session') return Promise.resolve(response({ publicRoomsEnabled: false }));
  if (action === 'rooms') return Promise.resolve(response({
    rooms: [], countries: [], next: '', total: 0, publicRoomsEnabled: false,
  }));
  if (action === 'allocate') {
    if (body.teamSize !== 1) {
      return Promise.resolve(response({ error: 'Private 1v1 rooms are available. Choose 1v1.' }, 400));
    }
    const roomId = id();
    const ticket = id();
    const admission = {
      id: roomId, ticket, connection: id(), host: true, slot: 0,
      room: { id: roomId, name: body.name || 'My room', public: false, teamSize: 1 },
    };
    admissions.set(ticket, admission);
    return Promise.resolve(response(admission));
  }
  if (action === 'join') return join(body.id, init?.signal);
  if (action === 'cancel' || action === 'release') return Promise.resolve(response({ ok: true }));
  if (action === 'probe') return Promise.resolve(response({ error: 'Ping checks are unavailable for private rooms.' }, 400));
  return Promise.resolve(response({ error: 'Unknown room operation.' }, 404));
};

class RoomSocket {
  constructor(url) {
    const parsed = new URL(url);
    this.admission = admissions.get(parsed.searchParams.get('ticket'));
    this.readyState = NativeWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    this.linkId = null;
    this.peer = null;
    this.pending = null;
    this.closed = false;
    if (!this.admission) {
      queueMicrotask(() => this.fail('Room admission expired.'));
      return;
    }
    admissions.delete(this.admission.ticket);
    this.channel = waitingChannels.get(this.admission.ticket) || roomChannel(this.admission.id);
    waitingChannels.delete(this.admission.ticket);
    this.listen();
    void this.connect();
  }

  emit(message) {
    if (this.readyState === NativeWebSocket.OPEN) {
      this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
    }
  }

  broadcast(event, payload) {
    if (this.readyState !== NativeWebSocket.OPEN) return Promise.resolve();
    return this.channel.send({ type: 'broadcast', event, payload }).catch(() => this.fail('Room signaling failed.'));
  }

  listen() {
    this.channel.on('broadcast', { event: 'join-request' }, ({ payload }) => {
      if (!this.admission.host) return;
      if (this.peer || this.pending) {
        void this.broadcast('join-rejected', { requestId: payload.requestId, error: 'Room is full.' });
        return;
      }
      this.pending = payload.connection;
      setTimeout(() => {
        if (this.pending === payload.connection) this.pending = null;
      }, 15000);
      void this.broadcast('join-accepted', {
        requestId: payload.requestId, room: this.admission.room,
      });
    });
    this.channel.on('broadcast', { event: 'hello' }, ({ payload }) => {
      if (!this.admission.host || payload.connection !== this.pending) return;
      this.peer = payload.connection;
      this.pending = null;
      this.linkId = id();
      void this.broadcast('peer', {
        to: this.peer, connection: this.linkId, slot: 0,
      });
    });
    this.channel.on('broadcast', { event: 'peer' }, ({ payload }) => {
      if (this.admission.host || payload.to !== this.admission.connection) return;
      this.linkId = payload.connection;
      this.emit({ type: 'peer', slot: 0, connection: this.linkId });
      void this.broadcast('peer-ack', { from: this.admission.connection });
    });
    this.channel.on('broadcast', { event: 'peer-ack' }, ({ payload }) => {
      if (!this.admission.host || payload.from !== this.peer || !this.linkId) return;
      this.emit({ type: 'peer', slot: 1, connection: this.linkId });
    });
    this.channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (payload.from !== this.admission.connection) this.emit(payload.message);
    });
    this.channel.on('broadcast', { event: 'leave' }, ({ payload }) => {
      if (payload.from === this.admission.connection) return;
      if (this.admission.host) {
        if (payload.from !== this.peer) return;
        this.emit({ type: 'peer-left', connection: this.linkId });
        this.peer = null;
        this.linkId = null;
      } else {
        this.emit({ type: 'closed', reason: 'The host left the room.' });
      }
    });
  }

  async connect() {
    try {
      if (this.channel.state !== 'joined') await subscribe(this.channel);
      if (this.closed) return;
      this.readyState = NativeWebSocket.OPEN;
      this.onopen?.(new Event('open'));
      this.emit({ type: 'joined', room: this.admission.room });
      if (!this.admission.host) {
        void this.broadcast('hello', { connection: this.admission.connection });
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Room service unavailable.');
    }
  }

  send(data) {
    if (this.readyState !== NativeWebSocket.OPEN) return;
    if (data === 'ping') {
      queueMicrotask(() => this.emit('pong'));
      return;
    }
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (message.type === 'configure') {
      this.emit({
        type: 'configured', requestId: message.requestId,
        ok: message.teamSize === 1, teamSize: 1,
        error: message.teamSize === 1 ? undefined : 'Only 1v1 rooms are available.',
      });
    } else if (message.type === 'drop-peer') {
      this.peer = null;
      this.linkId = null;
    } else if (this.linkId && ['offer', 'answer', 'ice', 'connected'].includes(message.type)) {
      void this.broadcast('signal', { from: this.admission.connection, message });
    }
  }

  fail(reason) {
    if (this.closed) return;
    this.onerror?.(new Error(reason));
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const leave = this.readyState === NativeWebSocket.OPEN
      ? this.broadcast('leave', { from: this.admission.connection })
      : Promise.resolve();
    this.readyState = NativeWebSocket.CLOSED;
    if (this.channel) void leave.finally(() => client.removeChannel(this.channel));
    this.onclose?.(new Event('close'));
  }
}

function GameWebSocket(url, protocols) {
  const parsed = new URL(url, location.href);
  if (parsed.origin === location.origin.replace(/^http/, 'ws')
    && /^\/api\/multiplayer\/room\/[a-f0-9]{32}$/.test(parsed.pathname)) {
    return new RoomSocket(parsed);
  }
  return new NativeWebSocket(url, protocols);
}
for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) {
  GameWebSocket[key] = NativeWebSocket[key];
}
GameWebSocket.prototype = NativeWebSocket.prototype;
window.WebSocket = GameWebSocket;
