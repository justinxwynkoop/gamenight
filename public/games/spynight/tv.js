// Spy Night on the browser TV (the Apple TV app draws its own). The TV shows what everyone may see: the missions, who leads,
// who is on the team, who has voted (and, once everyone has, how), never a role and never a card.
import { h, ink } from '../../common.js';
import { loadStyles, nameOf, track, rejectsLine } from './shared.js';

const seat = (p, v, cls = '', tick = '') => h('div', { class: `sn-seat ${cls} ${p.connected ? '' : 'off'}`, style: {} },
  h('span', { class: 'sn-dot', style: { background: p.color, width: '3vmin', height: '3vmin' } }), p.name, tick && h('span', { class: 'tick' }, tick));

export function lobby(v, ctx) {
  loadStyles();
  const g = v.game;
  const n = g.players.length;
  return h('div', { class: 'sn-tv' },
    h('div', {}, h('h1', {}, 'Spy Night')),
    h('div', { class: 'sn-stage' },
      h('div', { class: 'sn-lobby' },
        h('div', { class: 'sn-stage' },
          h('div', { class: 'sn-say' }, n < g.minPlayers ? `Waiting for ${g.minPlayers - n} more` : 'Ready to deal'),
          h('div', { class: 'sn-next' }, `Scan the code to join · ${g.minPlayers} to ${g.maxPlayers} players`),
          ctx.info?.code
            ? h('div', { class: 'sn-next' }, 'or open ', h('b', {}, ctx.info.site), ' and type ', h('b', { class: 'roomcode', style: { color: '#ffd24a', letterSpacing: '.12em' } }, ctx.info.code))
            : ctx.info?.joinUrl ? h('div', { class: 'sn-next' }, `or open ${ctx.info.joinUrl.replace(/^https?:\/\//, '')}`) : null,
          h('div', { class: 'sn-seats' }, g.players.map((p) => seat(p, g))),
          g.hosted ? h('div', { class: 'sn-next' }, 'The host presses Deal.') : h('div', { class: 'sn-next' }, 'The first player to join presses Deal on their phone.')),
        h('div', { class: 'qr-big' }, ctx.qr()))),
    h('div', { class: 'sn-foot' }, h('span', {}, 'Most of you are the Resistance. A few are Spies. Your phone knows which.')));
}

export function render(v, ctx) {
  loadStyles();
  const g = v.game;
  const id = g.leaderId;
  let stage;
  switch (g.phase) {
    case 'roles':
      stage = [h('div', { class: 'sn-say' }, 'Look at your phone'), h('div', { class: 'sn-next' }, 'You have a secret role. Tap it, read it, then press “Got it”.'),
        h('div', { class: 'sn-seats' }, g.players.map((p) => seat(p, g, g.readyIds.includes(p.id) ? 'done' : '', g.readyIds.includes(p.id) ? '✓' : '')))];
      break;
    case 'team':
      stage = [h('div', { class: 'sn-say' }, `${nameOf(g, id)} is picking ${g.teamSize} players`), h('div', { class: 'sn-next' }, `Mission ${g.mission + 1}${g.track[g.mission]?.needed > 1 ? ' · needs two Fail cards to fail' : ''}`),
        h('div', { class: 'sn-seats' }, g.players.map((p) => seat(p, g, `${p.id === id ? 'leader' : ''} ${g.team.includes(p.id) ? 'team' : ''}`, p.id === id ? '👑' : g.team.includes(p.id) ? '✓' : '')))];
      break;
    case 'vote':
      stage = [h('div', { class: 'sn-say' }, 'Approve or reject this team?'),
        h('div', { class: 'sn-seats' }, g.players.filter((p) => g.team.includes(p.id)).map((p) => seat(p, g, 'team'))),
        h('div', { class: 'sn-next' }, 'Everyone votes on their phone. Votes show together.'),
        h('div', { class: 'sn-seats' }, g.players.map((p) => seat(p, g, g.votedIds.includes(p.id) ? 'done' : '', g.votedIds.includes(p.id) ? '✓' : '')))];
      break;
    case 'vote-result':
      stage = [h('div', { class: `sn-banner ${g.approved ? 'good' : 'bad'}` }, g.approved ? 'TEAM APPROVED' : 'TEAM REJECTED'),
        h('div', { class: 'sn-seats' }, g.players.map((p) => seat(p, g, g.votes[p.id] ? 'yes' : 'no', g.votes[p.id] ? '👍' : '👎'))),
        h('div', { class: 'sn-next' }, g.line.next)];
      break;
    case 'mission':
      stage = [h('div', { class: 'sn-say' }, 'The team is on the mission'),
        h('div', { class: 'sn-seats' }, g.players.filter((p) => g.team.includes(p.id)).map((p) => seat(p, g, g.playedIds.includes(p.id) ? 'done' : 'team', g.playedIds.includes(p.id) ? '✓' : '…'))),
        h('div', { class: 'sn-next' }, 'Each member plays Success or Fail in secret.')];
      break;
    case 'mission-result': {
      const r = g.result;
      stage = [h('div', { class: `sn-banner ${r.success ? 'good' : 'bad'}` }, r.success ? 'MISSION SUCCEEDED' : 'MISSION FAILED'),
        h('div', { class: 'sn-say' }, r.fails === 0 ? 'No Fail cards' : `${r.fails} Fail ${r.fails === 1 ? 'card' : 'cards'}`)];
      break;
    }
    case 'gameover':
      stage = [h('div', { class: `sn-banner ${g.winner === 'spies' ? 'bad' : 'good'}` }, g.winner === 'spies' ? 'THE SPIES WIN' : 'THE RESISTANCE WINS'),
        h('div', { class: 'sn-next' }, g.why),
        h('div', { class: 'sn-reveal' }, g.players.map((p) => h('div', { class: `sn-seat ${g.roles[p.id]}` }, p.name, h('span', { class: 'tick' }, g.roles[p.id] === 'spy' ? '🕶️ Spy' : '🛡️ Resistance'))))];
      break;
    default:
      stage = [h('div', { class: 'sn-say' }, g.line.text)];
  }
  return h('div', { class: 'sn-tv' },
    h('div', {}, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.6vmin' } }, h('h1', {}, 'Spy Night'), rejectsLine(g)), track(g)),
    h('div', { class: 'sn-stage' }, stage),
    h('div', { class: 'sn-foot' }, h('span', {}, g.phase === 'gameover' ? 'The host starts another game.' : `${g.spyCount} Spies among ${g.players.length} players`),
      h('span', {}, g.phase === 'team' || g.phase === 'vote' ? `Rejected teams in a row: ${g.rejects} of ${g.maxRejects}` : '')));
}

/** Sound cues, from what changed since the last view. The names are the shared ones (see engine/sounds.js for what each means here). */
export function onChange(prev, view, sound) {
  const p = prev.game; const g = view.game;
  if (!p || !g) return;
  if (g.phase === 'lobby' && p.phase === 'lobby' && g.players.length > p.players.length) sound.play('join');
  if (g.phase === p.phase) return;
  switch (g.phase) {
    case 'roles': sound.play('roundstart'); break;                          // the roles are dealt
    case 'team': sound.play('pick'); break;                                 // a leader starts picking
    case 'vote': sound.play('open'); break;
    case 'vote-result': sound.play(g.approved ? 'correct' : 'wrong'); break;
    case 'mission': sound.play('lock'); break;
    case 'mission-result': sound.play(g.result?.success ? 'ding' : 'strike'); break;
    case 'gameover': sound.play(g.winner === 'spies' ? 'winner' : 'fanfare'); break;
    default: break;
  }
}
