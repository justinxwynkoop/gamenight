// Small helpers shared by the room and every game.

export const MAX_PLAYERS = 30;
/** Up to this many players play as individuals; with more than this, the room splits them into teams. */
export const INDIVIDUAL_MAX = 5;
/** Players per team. More players than two teams hold (2 × this) bring in the third and fourth team. */
export const TEAM_SIZE = 5;
/** The teams, in the order they appear. Red and Blue are always there in team play; Green and Yellow join for four teams. */
export const TEAM_DEFS = [
  { key: 'red', name: 'Red', color: '#ef4444' },
  { key: 'blue', name: 'Blue', color: '#3b82f6' },
  { key: 'green', name: 'Green', color: '#22c55e' },
  { key: 'yellow', name: 'Yellow', color: '#eab308' },
];
export const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899', '#a3e635', '#f8fafc',
];

/** An error whose message is safe to show to the host or a player. */
export class GameError extends Error {}

export const fail = (msg) => { throw new GameError(msg); };
export const cleanName = (s, max = 20) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const int = (n) => (Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : NaN);

export function newToken() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Pick the address phones should use to reach this machine, from os.networkInterfaces().
 * Skips loopback, IPv6 and virtual interfaces (Docker and friends), and prefers a real address over
 * a 169.254.x.x "no DHCP answer" one. Returns 'localhost' when there is no network at all.
 */
export function pickAddress(interfaces) {
  const found = [];
  for (const [name, list] of Object.entries(interfaces ?? {})) {
    if (/^(lo|docker|veth|br-|virbr|tun|tap)/.test(name)) continue;
    for (const i of list ?? []) if ((i.family === 'IPv4' || i.family === 4) && !i.internal) found.push(i.address);
  }
  return found.find((a) => !a.startsWith('169.254.')) ?? found[0] ?? 'localhost';
}
