// Spy Night on a phone. This is where the secret lives: your role, and (for Spies) who the other Spies are.
// The role is hidden until you tap it, so nobody can read it over your shoulder, and a "My role" button lets you look again.
import { h, setKids } from '../../common.js';
import { loadStyles, nameOf, track, rejectsLine } from './shared.js';

export function mount(container, { send }) {
  loadStyles();
  let view = null;
  let showRole = false;      // the role card is face up
  let peeking = false;       // the "My role" overlay is open
  let showMates = false;     // a Spy has asked to see the other Spies (they are hidden behind a button)
  let lastPhase = '';
  let confirmEnd = false;    // the first player has tapped End game once

  const btn = (label, cls, onclick, extra = {}) => h('button', { type: 'button', class: `sn-btn ${cls}`, onclick, ...extra }, label);
  const dot = (p) => h('span', { class: 'sn-dot', style: { background: p?.color ?? '#888' } });

  function roleCard(me, interactive) {
    if (!showRole) {
      return h('button', { type: 'button', class: 'sn-role', style: { width: '100%', color: 'inherit' }, onclick: () => { showRole = true; refresh(); } },
        h('div', { class: 'ico' }, '🕵️'), h('div', { class: 'big' }, 'TAP TO SEE'), h('div', { class: 'dim' }, 'Make sure nobody is looking at your screen'));
    }
    const spy = me.role === 'spy';
    return h('div', { class: `sn-role ${me.role}`, onclick: interactive ? () => { showRole = false; showMates = false; refresh(); } : null },
      h('div', { class: 'ico' }, spy ? '🕶️' : '🛡️'),
      h('div', { class: 'big' }, spy ? 'YOU ARE A SPY' : 'YOU ARE RESISTANCE'),
      spy
        ? [matesBlock(me),
          h('p', { class: 'dim' }, 'Get missions to fail without anyone working out who you are. You may play Success or Fail on a mission.')]
        : h('p', { class: 'dim' }, 'You do not know who the Spies are. Work it out, and keep them off your missions. You must always play Success.'),
      interactive && h('p', { class: 'dim' }, 'Tap to hide'));
  }

  /** The other Spies, behind a button so a glance at the screen does not give them away. */
  function matesBlock(me) {
    if (!me.spies.length) return h('p', {}, 'You are the only Spy.');
    return h('div', {},
      h('button', { type: 'button', class: 'sn-btn ghost', onclick: (e) => { e.stopPropagation(); showMates = !showMates; refresh(); } }, showMates ? 'Hide the other Spies' : `Show the other ${me.spies.length === 1 ? 'Spy' : 'Spies'}`),
      showMates && h('div', { class: 'sn-mates' }, me.spies.map((s) => h('span', {}, s.name))));
  }

  const header = (v) => [track(v), rejectsLine(v)];

  function lobby(v) {
    const me = v.me ?? {};
    const n = v.players.length;
    return [
      h('div', { class: 'sn-card' },
        h('h2', {}, 'Spy Night'),
        h('p', {}, 'Most of you are the Resistance. A few of you are Spies, and the Spies know each other. Your phone tells you which you are.'),
        h('p', { class: 'dim' }, `${n} ${n === 1 ? 'player' : 'players'} here · needs ${v.minPlayers} to ${v.maxPlayers}`),
        h('div', { class: 'sn-team' }, v.players.map((p) => h('span', { style: { borderColor: p.color, background: '#10172a', opacity: p.connected ? 1 : .5 } }, p.name)))),
      me.canStart
        ? [btn(n < v.minPlayers ? `Waiting for ${v.minPlayers - n} more` : 'Deal the roles', 'go huge', () => send({ t: 'start' }), { disabled: n < v.minPlayers }),
          h('p', { class: 'dim' }, 'You joined first, so you start the game when everyone is in.')]
        : h('p', { class: 'dim' }, v.hosted ? 'The host starts the game when everyone is in.' : 'The first player starts the game when everyone is in.'),
      rules(),
    ];
  }

  function rules() {
    return h('details', { class: 'sn-card' }, h('summary', {}, 'How to play'),
      h('p', {}, 'Five missions. The Resistance need 3 to succeed; the Spies need 3 to fail.'),
      h('p', {}, 'The leader picks a team. Everyone votes to approve or reject it, all at once. If more than half approve, the team goes. A tie or a majority against passes the lead to the next player.'),
      h('p', {}, 'On the mission each team member plays Success or Fail in secret. The Resistance have to play Success; a Spy may play either. One Fail fails the mission.'),
      h('p', {}, 'Five rejected teams in a row and the Spies win.'),
      h('p', {}, 'You can talk about anything out loud, as much as you like: say who you trust, accuse, defend, bluff. The only rule is to keep your screen to yourself.'));
  }

  function roles(v) {
    const me = v.me;
    if (!me?.role) return h('div', { class: 'sn-card' }, h('p', {}, 'The game is under way without you. You can join the next one.'));
    const waiting = v.players.length - (v.readyIds?.length ?? 0);
    return [
      roleCard(me, true),
      me.ready
        ? h('p', { class: 'dim' }, waiting > 0 ? `Waiting for ${waiting} more to see their role…` : 'Starting…')
        : btn('Got it', 'go huge', () => { showRole = false; send({ t: 'got-it' }); }, { disabled: !showRole }),
      !me.ready && !showRole && h('p', { class: 'dim' }, 'Tap the card to see your role, then press Got it.'),
      me.canStart && btn('Everyone has seen it, carry on', 'ghost', () => send({ t: 'advance' })),
    ];
  }

  function team(v) {
    const me = v.me;
    const lead = nameOf(v, v.leaderId);
    if (!me?.isLeader) {
      return [header(v), h('div', { class: 'sn-card' },
        h('h2', {}, `${lead} is picking a team`),
        h('p', {}, `Mission ${v.mission + 1} takes ${v.teamSize} players.`),
        h('div', { class: 'sn-team' }, v.team.map((id) => h('span', {}, nameOf(v, id)))),
        h('p', { class: 'sn-talk' }, 'Talk it over out loud, as much as you like: accuse, defend, bluff. Just do not show anyone your screen. Then you will all vote.'))];
    }
    const full = v.team.length >= v.teamSize;
    return [header(v), h('div', { class: 'sn-card' },
      h('h2', {}, `You are the leader: pick ${v.teamSize}`),
      h('p', { class: 'dim' }, 'You can pick yourself. Tap a name to add or remove them.'),
      h('div', { class: 'sn-pick' }, v.players.map((p) => h('button', {
        type: 'button', 'aria-pressed': String(v.team.includes(p.id)), onclick: () => send({ t: 'pick', pid: p.id }),
      }, dot(p), p.name, p.id === me.id ? h('small', { class: 'dim' }, '(you)') : null, h('span', { class: 'chk' }, v.team.includes(p.id) ? '✓' : '')))),
      btn(full ? 'Send this team to a vote' : `Pick ${v.teamSize - v.team.length} more`, 'go huge', () => send({ t: 'propose' }), { disabled: !full }))];
  }

  const teamNames = (v) => h('div', { class: 'sn-team' }, v.team.map((id) => h('span', {}, nameOf(v, id))));

  function vote(v) {
    const me = v.me;
    const mine = me?.myVote;
    return [header(v), h('div', { class: 'sn-card' },
      h('h2', {}, `Vote on ${nameOf(v, v.leaderId)}’s team`),
      teamNames(v),
      h('div', { class: 'sn-row' },
        btn(mine === true ? '✓ Approve' : 'Approve', 'yes huge', () => send({ t: 'vote', approve: true }), { 'aria-pressed': String(mine === true) }),
        btn(mine === false ? '✓ Reject' : 'Reject', 'no huge', () => send({ t: 'vote', approve: false }), { 'aria-pressed': String(mine === false) })),
      h('p', { class: 'dim' }, mine == null ? 'Votes stay secret until everyone has voted.' : `Your vote is in. You can change it until the last person votes. ${v.votedIds.length} of ${v.players.length} have voted.`))];
  }

  function voteResult(v) {
    return [header(v), h('div', { class: `sn-banner ${v.approved ? 'good' : 'bad'}` }, v.approved ? 'TEAM APPROVED' : 'TEAM REJECTED'),
      h('div', { class: 'sn-card' }, teamNames(v),
        h('div', { class: 'sn-votes' }, v.players.map((p) => h('div', { class: v.votes[p.id] ? 'yes' : 'no' }, dot(p), p.name, h('b', {}, v.votes[p.id] ? 'Approve' : 'Reject')))))];
  }

  function mission(v) {
    const me = v.me;
    if (!me?.onTeam) {
      return [header(v), h('div', { class: 'sn-card' }, h('h2', {}, 'The team is on the mission'), teamNames(v), h('p', { class: 'dim' }, `${v.playedIds.length} of ${v.team.length} have played a card.`))];
    }
    const spy = me.role === 'spy';
    const played = me.myCard;
    return [header(v), h('div', { class: 'sn-card' },
      h('h2', {}, 'You are on the mission'),
      played ? h('p', {}, `You played ${played === 'fail' ? 'FAIL' : 'SUCCESS'}. Waiting for the rest of the team…`)
        : [h('div', { class: 'sn-row' },
          btn('Success', 'yes huge', () => send({ t: 'card', card: 'success' })),
          btn('Fail', 'no huge', () => send({ t: 'card', card: 'fail' }), { disabled: !spy })),
        h('p', { class: 'dim' }, spy ? 'You are a Spy, so you can play Success or Fail.' : 'You are Resistance, so you have to play Success.')],
      h('p', { class: 'dim' }, 'Nobody will see which card you played, only how many Fail cards there were.'))];
  }

  function missionResult(v) {
    const r = v.result;
    return [header(v), h('div', { class: `sn-banner ${r.success ? 'good' : 'bad'}` }, r.success ? 'MISSION SUCCEEDED' : 'MISSION FAILED'),
      h('div', { class: 'sn-card' }, h('p', {}, r.fails === 0 ? 'No Fail cards.' : `${r.fails} Fail ${r.fails === 1 ? 'card' : 'cards'}${r.needed > 1 ? ` (this mission needed ${r.needed})` : ''}.`),
        h('p', { class: 'dim' }, 'Went on the mission:'), teamNames(v))];
  }

  function gameover(v) {
    const me = v.me;
    const won = me?.role && ((v.winner === 'spies') === (me.role === 'spy'));
    return [h('div', { class: `sn-banner ${v.winner === 'spies' ? 'bad' : 'good'}` }, v.winner === 'spies' ? 'THE SPIES WIN' : 'THE RESISTANCE WINS'),
      // Under the five missions: who played Success (✓) and who played Fail (✗) on each.
      track(v),
      h('div', { class: 'sn-card' },
        me?.role && h('h2', {}, won ? 'You won!' : 'You lost this one'),
        h('p', { class: 'dim' }, v.why),
        h('div', { class: 'sn-votes' }, v.players.map((p) => h('div', { class: v.roles[p.id] === 'spy' ? 'no' : 'yes' }, dot(p), p.name, h('b', {}, v.roles[p.id] === 'spy' ? 'Spy' : v.roles[p.id] ? 'Resistance' : '')))))
      , me?.canStart ? btn('Play again', 'go huge', () => send({ t: 'play-again' })) : h('p', { class: 'dim' }, 'The host can start another game.')];
  }

  /** With no host page the first player moves a stuck game along or ends it (the same buttons the host page has). */
  function starterTools(v) {
    if (!v.me?.canStart || ['lobby', 'gameover'].includes(v.phase)) return null;
    const inTurn = !['roles'].includes(v.phase);
    return h('div', { class: 'sn-card' },
      h('p', { class: 'dim' }, 'You started the game, so you can get it going again if someone has gone quiet.'),
      inTurn && btn(v.phase === 'team' ? 'Skip the leader' : 'Move on without waiting', 'ghost', () => send({ t: 'advance' })),
      btn(confirmEnd ? 'Tap again to end the game for everyone' : 'End the game', 'ghost', () => { if (confirmEnd) { confirmEnd = false; send({ t: 'end-game' }); } else { confirmEnd = true; refresh(); } }));
  }

  function history(v) {
    if (!v.history?.length) return null;
    return h('details', { class: 'sn-card sn-hist' }, h('summary', {}, `Who voted for what (${v.history.length})`),
      v.history.map((x) => h('details', {}, h('summary', {}, `Mission ${x.mission} · ${nameOf(v, x.leaderId)}’s team ${x.approved ? '✓' : '✗'}`),
        h('p', {}, x.team.map((id) => nameOf(v, id)).join(', ')),
        h('p', { class: 'dim' }, `Approved: ${Object.keys(x.votes).filter((id) => x.votes[id]).map((id) => nameOf(v, id)).join(', ') || 'nobody'}`),
        h('p', { class: 'dim' }, `Rejected: ${Object.keys(x.votes).filter((id) => !x.votes[id]).map((id) => nameOf(v, id)).join(', ') || 'nobody'}`))));
  }

  function refresh() {
    const v = view?.game;
    if (!v || !view.room?.me) return;
    if (v.phase !== lastPhase) { confirmEnd = false; if (lastPhase === 'lobby' || v.phase === 'lobby') showRole = false; lastPhase = v.phase; }
    const body = {
      lobby, roles, team, vote, 'vote-result': voteResult, mission, 'mission-result': missionResult, gameover,
    }[v.phase]?.(v) ?? h('p', {}, 'Waiting…');
    const me = v.me;
    const showPeek = me?.role && !['lobby', 'roles', 'gameover'].includes(v.phase);
    setKids(container, h('div', { class: 'sn' }, body, starterTools(v), v.phase !== 'lobby' && v.phase !== 'roles' && history(v), v.phase === 'lobby' ? null : rules()),
      showPeek && h('button', { type: 'button', class: 'sn-peek', onclick: () => { peeking = true; refresh(); } }, '🕵️ My role'),
      showPeek && peeking && h('div', { class: 'sn-peekbox', onclick: () => { peeking = false; showMates = false; refresh(); } },
        h('div', { class: `sn-role ${me.role}` },
          h('div', { class: 'big' }, me.role === 'spy' ? 'SPY' : 'RESISTANCE'),
          me.role === 'spy' && matesBlock(me),
          h('p', { class: 'dim' }, 'Tap anywhere to hide'))));
    if (v.phase !== 'vote' && v.phase !== 'mission') peeking = peeking && showPeek;
  }

  return {
    update(v) { view = v; refresh(); },
    onMessage(m) { if (m.t === 'ack') navigator.vibrate?.(20); },
    destroy() {},
  };
}
