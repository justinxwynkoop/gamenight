// Small helpers shared by the room and every game.

export const MAX_PLAYERS = 30;
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
