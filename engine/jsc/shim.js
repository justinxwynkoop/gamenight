// What the engine expects from a JavaScript host that is not a browser or Node. JavaScriptCore (the engine inside the
// Apple TV app) is plain JavaScript: no console, no performance, no crypto, no structuredClone.
// The host (GameHost.swift) defines a global `__native` with: send(clientId, json), save(json), now() -> milliseconds,
// random() -> a secure random number in [0, 1), log(level, text).
(function (g) {
  const native = g.__native || {};
  const text = (a) => a.map((x) => (typeof x === 'string' ? x : (() => { try { return x instanceof Error ? x.stack || x.message : JSON.stringify(x); } catch { return String(x); } })())).join(' ');
  if (typeof g.console === 'undefined') {
    const log = (level) => (...a) => { if (native.log) native.log(level, text(a)); };
    g.console = { log: log('log'), info: log('log'), warn: log('warn'), error: log('error'), debug: log('log') };
  }
  if (typeof g.performance === 'undefined') g.performance = { now: () => (native.now ? native.now() : Date.now()) };
  if (typeof g.crypto === 'undefined') {
    g.crypto = {
      getRandomValues(bytes) {
        const r = native.random || Math.random;
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(r() * 256);
        return bytes;
      },
    };
  }
  if (typeof g.structuredClone === 'undefined') g.structuredClone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
})(globalThis);
