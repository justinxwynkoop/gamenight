// Bits the phone, host and TV pages of Spy Night share: the stylesheet, the mission track, and names.
import { h } from '../../common.js';

/** Loads the Spy Night stylesheet once. */
export function loadStyles() {
  if (document.getElementById('sn-css')) return;
  document.head.append(h('link', { id: 'sn-css', rel: 'stylesheet', href: '/games/spynight/spynight.css' }));
}

export const nameOf = (v, id) => v.players?.find((p) => p.id === id)?.name ?? 'Someone';
export const playerOf = (v, id) => v.players?.find((p) => p.id === id) ?? null;

/**
 * The five missions: how many go, and how each one ended, with the names of who went on it underneath. When the game is
 * over each name also says whether they played Success (✓) or Fail (✗).
 */
export function track(v) {
  const over = v.phase === 'gameover';
  return h('div', { class: 'sn-track', role: 'list', 'aria-label': 'Missions' }, v.track.map((m) => h('div', { class: 'sn-col', role: 'listitem' },
    h('div', {
      class: `sn-m ${m.result ?? ''} ${m.current ? 'now' : ''}`,
      'aria-label': `Mission ${m.mission}: ${m.result ? (m.result === 'success' ? 'succeeded' : 'failed') : 'not played yet'}, ${m.size ?? '?'} players${m.needed > 1 ? `, needs ${m.needed} Fail cards` : ''}`,
    }, h('b', {}, m.result === 'success' ? '✓' : m.result === 'fail' ? '✗' : String(m.size ?? '')),
    h('small', {}, m.needed > 1 ? '2 fails' : `Mission ${m.mission}`)),
    m.team?.length ? h('ul', { class: 'sn-who', 'aria-label': `Went on mission ${m.mission}` }, m.team.map((id) => {
      const card = over ? m.cards?.[id] : null;
      return h('li', { class: card ?? '' }, nameOf(v, id), card ? h('b', {}, card === 'fail' ? ' ✗' : ' ✓') : null);
    })) : null)));
}

/** A little line saying how close the rejected-team counter is to ending the game. */
export function rejectsLine(v) {
  if (v.phase === 'lobby' || v.phase === 'gameover') return null;
  const dots = Array.from({ length: v.maxRejects }, (_, i) => h('i', { class: i < v.rejects ? 'on' : '' }));
  return h('div', { class: 'sn-rej', title: 'Teams rejected in a row' }, h('span', {}, 'Rejected teams in a row'), h('div', {}, dots));
}
