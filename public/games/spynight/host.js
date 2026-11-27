// Spy Night on the host page. The host sees the same as the TV: roles stay secret even here, because the host is usually
// playing too. What the host does is start the game and move it along if someone has wandered off.
import { h } from '../../common.js';
import { button, card, eyebrow, dot } from '../../ui.js';
import { loadStyles, nameOf, track, rejectsLine } from './shared.js';

const SUB = {
  lobby: 'Waiting for players', roles: 'Everyone is looking at their role', team: 'The leader is picking a team', vote: 'Everyone is voting',
  'vote-result': 'The votes are in', mission: 'The team is on the mission', 'mission-result': 'Mission result', gameover: 'Game over',
};

export function render(raw, ctx) {
  loadStyles();
  const g = raw.game;
  const { act } = ctx;
  const n = raw.room.players.length;
  const body = [];
  const dock = [];
  const waitingFor = () => {
    if (g.phase === 'roles') return g.players.filter((p) => !g.readyIds.includes(p.id)).map((p) => p.name);
    if (g.phase === 'vote') return g.players.filter((p) => !g.votedIds.includes(p.id)).map((p) => p.name);
    if (g.phase === 'mission') return g.team.filter((id) => !g.playedIds.includes(id)).map((id) => nameOf(g, id));
    return [];
  };

  if (g.phase !== 'lobby') {
    body.push(card(eyebrow('Missions'), h('div', { class: 'sn' }, track(g), rejectsLine(g)),
      h('p', { class: 'dim' }, `${g.spyCount} Spies and ${g.resistanceCount} Resistance in this game.`)));
  }
  if (g.phase === 'lobby') {
    body.push(card(eyebrow('How it works'), h('p', { class: 'dim' }, `Spy Night takes ${g.minPlayers} to ${g.maxPlayers} players, each on their own phone. Press Deal when everyone is in: every phone shows a secret role. You will see the same as the TV, never anyone’s role, so you can play too.`),
      n < g.minPlayers ? h('p', {}, `Waiting for ${g.minPlayers - n} more ${g.minPlayers - n === 1 ? 'player' : 'players'}.`) : h('p', {}, `${n} players: ${g.spyCount ?? '?'} will be Spies.`)));
    dock.push(button({ label: 'Deal the roles', icon: 'play', kind: 'primary', size: 'lg', block: true, disabled: n < g.minPlayers, onclick: () => act('start') }));
  } else if (g.phase === 'gameover') {
    body.push(card(eyebrow('Result'), h('div', { class: 'card-title' }, g.winner === 'spies' ? 'The Spies win' : 'The Resistance wins'), h('p', { class: 'dim' }, g.why),
      h('div', { class: 'list' }, g.players.map((p) => h('div', { class: 'rowi' }, dot(p.color, 18), h('div', { class: 'grow t' }, p.name), h('span', { class: 'tag' }, g.roles[p.id] === 'spy' ? 'Spy' : 'Resistance'))))));
    dock.push(button({ label: 'Play again', icon: 'refresh', kind: 'primary', size: 'lg', block: true, onclick: () => act('playAgain') }));
  } else {
    body.push(card(eyebrow('Now'), h('div', { class: 'card-title' }, g.line.text), h('p', { class: 'dim' }, g.line.next),
      g.phase === 'team' ? h('p', {}, `Leader: ${nameOf(g, g.leaderId)} · picking ${g.teamSize}`) : null,
      waitingFor().length ? h('p', { class: 'dim' }, `Waiting for: ${waitingFor().join(', ')}`) : null));
    if (['roles', 'team', 'vote', 'mission', 'vote-result', 'mission-result'].includes(g.phase)) {
      // Moving on in a vote or a mission counts whoever has not answered as Reject (a vote) or Success (a card): ask first.
      const missing = ['vote', 'mission'].includes(g.phase) ? waitingFor() : [];
      dock.push(button({ label: g.phase === 'team' ? 'Skip the leader' : 'Move on without waiting', icon: 'chevron', kind: 'primary', size: 'lg', block: true,
        onclick: missing.length ? () => ctx.confirm({ title: 'Move on without them?', message: `${missing.join(', ')} ${missing.length === 1 ? 'has' : 'have'} not ${g.phase === 'vote' ? 'voted' : 'played a card'}. ${g.phase === 'vote' ? 'A missing vote counts as Reject.' : 'A missing card counts as Success.'}`, confirmLabel: 'Move on', kind: 'primary', onConfirm: () => act('advance') }) : () => act('advance') }));
    }
  }
  return {
    title: 'Spy Night', sub: SUB[g.phase] ?? '', body, dock: dock.length ? h('div', { class: 'dock-row' }, dock) : null, settings: [],
    danger: g.phase === 'lobby' ? [] : [button({
      label: 'End game', icon: 'x', kind: 'bad', block: true,
      onclick: () => ctx.confirm({ title: 'End the game?', message: 'Everyone goes back to the lobby and the roles are dealt again next time.', confirmLabel: 'End game', onConfirm: () => act('endGame') }),
    })],
  };
}
