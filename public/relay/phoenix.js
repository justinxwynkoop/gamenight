// A small Supabase Realtime client (Phoenix channels over a WebSocket, protocol 1.0.0): just enough for broadcast
// messages, which is all Game Night uses. It runs in a browser or in Node (pass `WebSocket` from the `ws` package).
// This is the same protocol the Apple TV's RealtimeClient.swift speaks.
export class Realtime {
  /**
   * url      the project URL, https://<ref>.supabase.co
   * key      the publishable (anon) key. It is meant to be public.
   * onBroadcast(topic, event, payload)   a broadcast arrived on a channel we joined
   * onStatus(up)                         the link to Supabase went up or down
   * onJoined(topic)                      a channel was (re)joined, so messages on it will now arrive
   */
  constructor({ url, key, WebSocketImpl = globalThis.WebSocket, onBroadcast = () => {}, onStatus = () => {}, onJoined = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.url = url.replace(/\/+$/, '').replace(/^http/, 'ws');
    this.key = key;
    this.WS = WebSocketImpl;
    this.onBroadcast = onBroadcast;
    this.onStatus = onStatus;
    this.onJoined = onJoined;
    this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.channels = new Map(); // name -> { joinRef, joined, queue: [] }
    this.ref = 0;
    this.retry = 0;
    this.up = false;
    this.socket = null;
    this.heartbeatTimer = null; this.pendingHeartbeat = null; this.reconnectTimer = null;
    this.closed = false;
  }

  #nextRef() { return String(++this.ref); }
  #write(obj) { try { this.socket?.send(JSON.stringify(obj)); } catch { this.#dropped(); } }

  connect() {
    this.closed = false;
    this.clearTimer(this.reconnectTimer);
    try { this.socket?.close(); } catch { /* already closed */ }
    const socket = new this.WS(`${this.url}/realtime/v1/websocket?apikey=${encodeURIComponent(this.key)}&vsn=1.0.0`);
    this.socket = socket;
    this.pendingHeartbeat = null;
    for (const ch of this.channels.values()) { ch.joined = false; ch.joinRef = null; }
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.retry = 0;
      for (const [name, ch] of this.channels) this.#sendJoin(name, ch);
      this.#startHeartbeat();
    };
    socket.onmessage = (ev) => { if (this.socket === socket) this.#handle(typeof ev.data === 'string' ? ev.data : String(ev.data)); };
    socket.onclose = () => { if (this.socket === socket) this.#dropped(); };
    socket.onerror = () => {};
  }

  close() {
    this.closed = true;
    this.clearTimer(this.reconnectTimer); this.clearTimer(this.heartbeatTimer);
    const socket = this.socket; this.socket = null;
    try { socket?.close(); } catch { /* already closed */ }
    this.#setUp(false);
  }

  #setUp(up) { if (this.up !== up) { this.up = up; this.onStatus(up); } }

  #dropped() {
    if (this.closed) return;
    const socket = this.socket; this.socket = null;
    try { socket?.close(); } catch { /* already closed */ }
    this.clearTimer(this.heartbeatTimer);
    for (const ch of this.channels.values()) { ch.joined = false; ch.joinRef = null; }
    this.#setUp(false);
    const delay = Math.min(10, 2 ** this.retry * 0.5) * 1000;
    this.retry++;
    this.reconnectTimer = this.setTimer(() => this.connect(), delay);
  }

  #startHeartbeat() {
    this.clearTimer(this.heartbeatTimer);
    const beat = () => {
      if (this.pendingHeartbeat) { this.#dropped(); return; }   // no answer to the last one
      this.pendingHeartbeat = this.#nextRef();
      this.#write({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: this.pendingHeartbeat });
      this.heartbeatTimer = this.setTimer(beat, 25_000);
    };
    this.heartbeatTimer = this.setTimer(beat, 25_000);
  }

  #sendJoin(name, ch) {
    if (!this.socket || this.socket.readyState !== 1) return;
    const ref = this.#nextRef();
    ch.joinRef = ref; ch.joined = false;
    this.#write({
      topic: `realtime:${name}`, event: 'phx_join', ref, join_ref: ref,
      payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [], private: false }, access_token: this.key },
    });
  }

  /** Start listening on a channel (safe to call more than once). */
  join(name) {
    if (this.channels.has(name)) return;
    const ch = { joinRef: null, joined: false, queue: [] };
    this.channels.set(name, ch);
    this.#sendJoin(name, ch);
  }

  leave(name) {
    const ch = this.channels.get(name);
    if (!ch) return;
    this.channels.delete(name);
    if (ch.joinRef) this.#write({ topic: `realtime:${name}`, event: 'phx_leave', payload: {}, ref: this.#nextRef(), join_ref: ch.joinRef });
  }

  /** Send a broadcast. It waits for the channel to be joined (newest 40 kept). */
  send(name, event, payload) {
    this.join(name);
    const ch = this.channels.get(name);
    if (ch.joined) {
      this.#write({ topic: `realtime:${name}`, event: 'broadcast', payload: { type: 'broadcast', event, payload }, ref: this.#nextRef(), join_ref: ch.joinRef });
    } else {
      ch.queue.push({ event, payload });
      if (ch.queue.length > 40) ch.queue.splice(0, ch.queue.length - 40);
    }
  }

  #handle(text) {
    let msg; try { msg = JSON.parse(text); } catch { return; }
    const { topic, event, payload = {}, ref } = msg;
    if (topic === 'phoenix') { if (event === 'phx_reply' && ref === this.pendingHeartbeat) this.pendingHeartbeat = null; return; }
    const name = typeof topic === 'string' && topic.startsWith('realtime:') ? topic.slice(9) : null;
    const ch = name && this.channels.get(name);
    if (!ch) return;
    if (event === 'phx_reply') {
      if (ref && ref === ch.joinRef) {
        if (payload.status === 'ok') {
          ch.joined = true; this.#setUp(true);
          const queued = ch.queue.splice(0);
          for (const q of queued) this.send(name, q.event, q.payload);
          this.onJoined(name);
        } else this.#rejoinLater(name, ch, payload);
      }
    } else if (event === 'phx_error' || event === 'phx_close') this.#rejoinLater(name, ch);
    else if (event === 'broadcast' && payload.event) this.onBroadcast(name, payload.event, payload.payload ?? {});
  }

  #rejoinLater(name, ch, why) {
    ch.joined = false;
    if (why) console.warn?.(`Realtime: join refused for ${name}`, JSON.stringify(why));
    this.setTimer(() => { if (this.channels.get(name) === ch && !ch.joined) this.#sendJoin(name, ch); }, 2000);
  }
}
