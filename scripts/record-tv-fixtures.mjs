// Plays a scripted Jeopardy game on the real engine and saves what the TV receives at each step, as JSON, for the
// Apple TV app's tests (tv-app/Tests/GameNightCoreTests/Fixtures/jp-*.json).
//   node scripts/record-tv-fixtures.mjs tv-app/Tests/GameNightCoreTests/Fixtures
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { T, readingTime, speakingTime } from '../games/jeopardy/game.js';
import { T as PT } from '../games/piechase/game.js';
import { HUB, hqOf } from '../games/piechase/board.js';
import { T as GT } from '../games/guysvsgals/game.js';

const out = path.resolve(process.argv[2] ?? 'fixtures-out');
mkdirSync(out, { recursive: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const own = JSON.parse(readFileSync(path.join(root, 'data/jeopardy/family-night.json'), 'utf8'));

let t = 1000;
let seed = 7;
const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };   // repeatable
const room = new Room({ games: GAMES, now: () => t, random, loadContent: () => own, listContent: () => [{ id: 'family-night', title: own.title }] });
const advance = (ms) => { t += ms; room.tick(); };
const save = (name) => { writeFileSync(path.join(out, `jp-${name}.json`), JSON.stringify(room.publicView(), null, 2)); console.log('recorded', name); };

// Pie Chase: what the Apple TV reads at each step of a game (pc-*.json), with a loaded die. The answer to a question
// only reaches the TV once it has been judged. Recorded first, with its own clock and dice, so it does not depend on the
// Jeopardy game below.
{
  let t = 1000;
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const set = JSON.parse(readFileSync(path.join(root, 'data/piechase/family-classic.json'), 'utf8'));
  const proom = new Room({
    games: GAMES, now: () => t, random,
    loadContent: (game, id) => (game === 'piechase' && id === 'family-classic' ? set : null),
    listContent: (game) => (game === 'piechase' ? [{ id: 'family-classic', title: set.title }] : []),
  });
  proom.chooseGame('piechase');
  const pg = proom.game;
  const dice = [5, 2, 5, 3, 6, 6, 4];
  pg.rollDie = () => dice.shift() ?? 1;
  const pp = ['Leo', 'Maya', 'Dad'].map((n) => proom.join({ name: n }));
  pp.forEach((p) => proom.setConnected(p.id, true));
  const savePc = (name) => { writeFileSync(path.join(out, `pc-${name}.json`), JSON.stringify(proom.publicView(), null, 2)); console.log('recorded pc', name); };
  const tickBy = (ms) => { t += ms; proom.tick(); };
  const msg = (p, m) => proom.playerMessage(p.id, m);
  const byUnit = (id) => pp.find((p) => proom.unitOf(p).id === id);
  savePc('lobby');
  msg(pp[0], { t: 'start' });
  savePc('rolloff');
  // Leo and Dad tie on 5 and roll again; Dad wins it with a 6.
  for (const p of pp) msg(p, { t: 'roll' });
  savePc('rolloff-tie');
  msg(pp[0], { t: 'roll' }); msg(pp[2], { t: 'roll' });
  savePc('rolloff-done');
  tickBy(PT.rolloffDone);
  savePc('roll');
  // Dad rolls a 6 from the hub: six headquarters to pick from.
  msg(byUnit(pg.turn), { t: 'roll' });
  savePc('move');
  const mv0 = proom.publicView().game;
  msg(byUnit(pg.turn), { t: 'move', to: mv0.options.find((id) => mv0.board.find((x) => x.id === id).cat === 2) });
  savePc('question-hq');
  msg(byUnit(pg.readerId ?? proom.publicView().game.readerId), { t: 'judge', correct: true });
  savePc('result-wedge');
  tickBy(PT.wedge);
  savePc('roll-again');
  // Dad rolls a 4 and lands on a category space, and gets it wrong.
  msg(byUnit(pg.turn), { t: 'roll' });
  const v = proom.publicView().game;
  if (v.phase === 'move') msg(byUnit(pg.turn), { t: 'move', to: v.options.find((id) => v.board.find((x) => x.id === id).kind === 'cat') ?? v.options[0] });
  savePc('question');
  msg(byUnit(proom.publicView().game.readerId), { t: 'judge', correct: false });
  savePc('result-wrong');
  tickBy(PT.result);
  // The end game: Dad has every wedge and is a roll away from the hub; the others pick his category.
  const dad = proom.unitOf(pp[2]).id;
  pg.wedges[dad] = [2, 0, 1, 3, 4, 5];
  pg.pos[dad] = hqOf(0);
  pg.turn = dad; pg.phase = 'roll'; pg.again = null;
  dice.unshift(6);
  msg(pp[2], { t: 'roll' });
  const mv = proom.publicView().game;
  if (mv.phase === 'move') msg(pp[2], { t: 'move', to: HUB });
  savePc('choose-final');
  msg(pp[0], { t: 'choose', cat: 5 });
  savePc('question-final');
  msg(byUnit(proom.publicView().game.readerId), { t: 'judge', correct: true });
  savePc('result-win');
  tickBy(PT.wedge + PT.result);
  savePc('gameover');
}

// Guys vs Gals: what the Apple TV reads at each step (gvg-*.json), by the trophy tug-of-war rules. The Gals go first;
// a Guy reads, they get one right and miss one; the Guys throw a challenge; the path deals Our Pics, Our Lives and Our
// Moves cards; the Gals win a trophy on their green space, and then the game (played to one trophy at the end).
{
  let t = 1000;
  const set = JSON.parse(readFileSync(path.join(root, 'data/guysvsgals/family.json'), 'utf8'));
  const groom = new Room({
    games: GAMES, now: () => t, random: () => 0,
    loadContent: (game, id) => (game === 'guysvsgals' && id === 'family' ? set : null),
    listContent: (game) => (game === 'guysvsgals' ? [{ id: 'family', title: set.title }] : []),
  });
  groom.chooseGame('guysvsgals');
  const gg = groom.game;
  const join = (name, side) => { const p = groom.join({ name }); groom.setConnected(p.id, true); groom.playerMessage(p.id, { t: 'side', side }); return p; };
  const guys = [join('Dad', 'guys'), join('Leo', 'guys')];
  const gals = [join('Mom', 'gals'), join('Maya', 'gals')];
  const everyone = [...guys, ...gals];
  const saveG = (name) => { writeFileSync(path.join(out, `gvg-${name}.json`), JSON.stringify(groom.publicView(), null, 2)); console.log('recorded gvg', name); };
  const tickBy = (ms) => { t += ms; groom.tick(); };
  const msg = (p, m) => groom.playerMessage(p.id, m);
  const reader = () => everyone.find((p) => p.id === gg.card.reader);
  const judge = (right) => msg(reader(), { t: 'judge', right });
  const at = (pos) => { gg.pos = pos; groom.act('newCard'); };
  saveG('lobby');
  msg(guys[0], { t: 'start' });
  saveG('card');                       // Our Facts for the Gals, read by Dad
  judge(true);
  saveG('result-right');
  tickBy(GT.result);
  judge(false);
  saveG('result-wrong');
  tickBy(GT.result);                    // the Guys' turn, the trophy one space toward the Gals
  msg(guys[0], { t: 'challenge' });
  saveG('card-challenged');
  msg(guys[1], { t: 'judge', right: false });   // the Gals miss their own question: the trophy comes to the Guys
  tickBy(GT.result);
  at(-2);
  saveG('pics');
  judge(true); tickBy(GT.result);       // to -3: Our Lives
  saveG('lives-secret');
  msg(reader(), { t: 'secret', choice: 1 });
  msg(guys[0], { t: 'vote', choice: 1 });
  saveG('lives-guess');
  msg(guys[1], { t: 'vote', choice: 1 });
  tickBy(GT.result);                    // to -4: Our Moves
  saveG('moves-pick');
  msg(reader(), { t: 'actor', pid: guys[1].id });
  saveG('moves-act');
  msg(reader(), { t: 'moves', side: 'gals' });   // the Gals shout it first: stolen
  saveG('moves-stolen');
  tickBy(GT.result);
  at(5);                                // the Gals on their green space
  judge(true);
  saveG('result-trophy');
  tickBy(GT.result);
  saveG('trophy');
  tickBy(GT.trophy);
  saveG('new-trophy');
  gg.settings.target = 2;
  at(-5); judge(false); tickBy(GT.result);
  at(5); judge(true); tickBy(GT.result);
  tickBy(GT.trophy);
  saveG('gameover');
}

room.chooseGame('jeopardy');
const g = room.game;
g.act('setReadAloud', { on: true });   // the product has the voice off; the Apple TV's tests still cover what it does when on
// The buzzers open after the reading time, or with the TV reading clues aloud and never saying it is done, the longer one.
const waitFor = (q) => (g.readsAloud() ? speakingTime(q) : readingTime(q));
const ps = ['Leo', 'Maya', 'Dad'].map((n) => room.join({ name: n }));
ps.forEach((p) => room.setConnected(p.id, true));
g.takeArchiveRequest();
save('lobby');
room.setHosts(1);        // a host page connects: no captain, and the TV lobby shows only who has joined
save('lobby-hosted');
room.setHosts(0);

// A season arrives: topic packs for the lobby.
const header = 'round\tclue_value\tdaily_double_value\tcategory\tcomments\tanswer\tquestion\tair_date\tnotes';
const rows = [];
for (let c = 0; c < 14; c++) for (let r = 0; r < 5; r++) rows.push(['1', String((r + 1) * 200), '0', `Mixed bag ${c}`, '', `Clue ${c}-${r}`, `Answer ${c}-${r}`, '2005-01-01', ''].join('\t'));
g.setEra('classic');
const req = g.takeArchiveRequest();
save('lobby-loading');
g.archiveLoaded([header, ...rows].join('\n'), req.season, req.id);
save('lobby-archive');
g.previewBoard();
save('lobby-draft');
g.clearPreview();
g.toggleEasy();
save('lobby-easy');
g.toggleEasy();
for (const p of g.publicView().packs) if (p.selected) g.togglePack(p.id);
g.togglePack('house-classic'); g.togglePack('house-general');

g.start();
save('round-intro');
advance(T.roundIntro + 10);
save('board');
const first = g.board().flatMap((c, ci) => c.clues.map((cl, ri) => ({ ci, ri, cl }))).find((x) => !x.cl.dd);
g.pick(first.ci, first.ri);
save('reading');
advance(waitFor(first.cl.q) + 10);
save('open');
advance(300); g.buzz(ps[1].id); advance(80); g.buzz(ps[0].id);
save('answering');
g.answer(ps[1].id, 'definitely wrong');
save('ruling-wrong');
advance(T.ruling + 10);
save('open-after-wrong');
advance(250); g.buzz(ps[2].id);
g.answer(ps[2].id, first.cl.a);
save('ruling-right');
advance(T.ruling + 10);
save('reveal-correct');
g.react(ps[0].id, 3);
save('reaction');
advance(T.reveal + 10);

// Nobody buzzes.
const second = g.board().flatMap((c, ci) => c.clues.map((cl, ri) => ({ ci, ri, cl }))).find((x) => !x.cl.dd && !x.cl.used);
g.pick(second.ci, second.ri);
advance(waitFor(second.cl.q) + 10);
advance(T.buzzWindow + 10);
save('reveal-nobody');
advance(T.reveal + 10);

// A Daily Double.
const dd = g.board().flatMap((c, ci) => c.clues.map((cl, ri) => ({ ci, ri, cl }))).find((x) => x.cl.dd);
g.pick(dd.ci, dd.ri);
save('dd-wager');
g.ddWager(g.controllerId, 300);
save('dd-answer');
g.answer(g.controllerId, dd.cl.a);
advance(T.ruling + 10);
save('dd-reveal');
advance(T.reveal + 10);

// The rest of round 1 and all of round 2, quickly, to reach the final.
const playOut = () => {
  while (g.phase === 'board') {
    const spot = g.board().flatMap((c, ci) => c.clues.map((cl, ri) => ({ ci, ri, cl }))).find((x) => !x.cl.used);
    g.pick(spot.ci, spot.ri);
    if (spot.cl.dd) { g.ddWager(g.controllerId, 5); g.answer(g.controllerId, spot.cl.a); } else {
      advance(waitFor(spot.cl.q) + 10);
      g.buzz(ps[0].id); g.answer(ps[0].id, spot.cl.a);
    }
    advance(T.ruling + 10);
    advance(T.reveal + 10);
  }
};
playOut();
save('round-end');
g.advance();
save('round-intro-2');
advance(T.roundIntro + 10);
save('board-round-2');
playOut();
// The Apple TV tests expect the show's rule here (only players with money play); everyone-plays is tested in Node.
g.setFinalForAll(false);
g.advance();
save('final-wager');
const eligible = g.final.eligible;
for (const id of eligible) g.finalWager(id, 100);
save('final-answer');
for (const id of eligible) g.finalAnswer(id, id === eligible[0] ? g.finalClue.a : 'no idea');
// One player at a time: their response, then right or wrong with the wager. The correct answer comes last.
advance(1600);
save('final-reveal-answer');
advance(T.finalBeat + 10);
save('final-reveal-first');
advance(T.finalStep + 10);
advance(T.finalBeat + 10);
save('final-reveal-more');
advance(T.finalStep + 10);
save('final-reveal-done');
for (let i = 0; i < 20 && g.phase !== 'gameover'; i++) advance(T.finalAnswerShow + 10);
save('gameover');
g.playAgain();

// Host judging out loud, with the answer clock.
g.setHostJudges(true); g.setAnswerTime(10);
g.start();
advance(T.roundIntro + 10);
const spot = g.board().flatMap((c, ci) => c.clues.map((cl, ri) => ({ ci, ri, cl }))).find((x) => !x.cl.dd);
g.pick(spot.ci, spot.ri);
save('host-reading');
g.openNow(); advance(200); g.buzz(ps[0].id);
save('host-answering');

// Singo Night's phone cards: what the Apple TV reads (singo-*.json).
{
  const sroom = new Room({ games: GAMES, now: () => t, random });
  sroom.chooseGame('singo');
  const sg = sroom.game;
  const [leo, maya] = ['Leo', 'Maya'].map((n) => sroom.join({ name: n }));
  sroom.setConnected(leo.id, true);
  const songs = Array.from({ length: 30 }, (_, i) => ({ id: `song${i}`, title: `Song ${i}`, artist: `Band ${i % 5}` }));
  const saveSingo = (name) => { writeFileSync(path.join(out, `singo-${name}.json`), JSON.stringify(sroom.publicView(), null, 2)); console.log('recorded singo', name); };
  saveSingo('waiting');
  sg.deal(songs, 'Road Trip');
  const card = sroom.playerView(leo.id).game.card;
  sroom.playerMessage(maya.id, { t: 'mark', i: 0 });
  sroom.playerMessage(maya.id, { t: 'singo' });
  for (const i of [0, 1, 2, 3, 4]) { sroom.playerMessage(leo.id, { t: 'mark', i }); sg.call(card[i].id); }
  sroom.playerMessage(leo.id, { t: 'singo' });
  saveSingo('claim');
}

// Spy Night: what the Apple TV reads at each step of a game (spy-*.json). The TV is never sent a role until the end.
{
  const pnames = ['Leo', 'Maya', 'Dad', 'Mom', 'Sam'];
  const sroom = new Room({ games: GAMES, now: () => t, random });
  sroom.chooseGame('spynight');
  const sg = sroom.game;
  const ps5 = pnames.map((n) => sroom.join({ name: n }));
  ps5.forEach((p) => sroom.setConnected(p.id, true));
  const saveSpy = (name) => { writeFileSync(path.join(out, `spy-${name}.json`), JSON.stringify(sroom.publicView(), null, 2)); console.log('recorded spy', name); };
  const tickBy = (ms) => { t += ms; sroom.tick(); };
  const idOf = (name) => ps5.find((p) => p.name === name).id;
  saveSpy('lobby');
  sg.start();
  saveSpy('roles');
  for (const p of ps5.slice(0, 3)) sroom.playerMessage(p.id, { t: 'got-it' });
  saveSpy('roles-partial');
  for (const p of ps5.slice(3)) sroom.playerMessage(p.id, { t: 'got-it' });
  saveSpy('team');
  const lead = () => ps5.find((p) => p.id === sg.leaderId);
  const spies = ps5.filter((p) => sg.roles[p.id] === 'spy');
  for (const id of [spies[0].id, ps5.find((p) => sg.roles[p.id] === 'resistance').id]) sroom.playerMessage(lead().id, { t: 'pick', pid: id });
  saveSpy('team-picked');
  sroom.playerMessage(lead().id, { t: 'propose' });
  for (const p of ps5.slice(0, 3)) sroom.playerMessage(p.id, { t: 'vote', approve: true });
  saveSpy('vote');
  for (const p of ps5.slice(3)) sroom.playerMessage(p.id, { t: 'vote', approve: p.name === 'Sam' });
  saveSpy('vote-result');
  tickBy(8000);
  saveSpy('mission');
  for (const id of sg.team) sroom.playerMessage(id, { t: 'card', card: sg.roles[id] === 'spy' ? 'fail' : 'success' });
  saveSpy('mission-result');
  tickBy(8000);
  // Play it out: every mission is sent with a Spy on it, all approve, and the Spies play Fail.
  while (sg.phase !== 'gameover') {
    const l = lead();
    const spy = ps5.find((p) => sg.roles[p.id] === 'spy');
    const rest = ps5.filter((p) => p !== spy);
    for (const p of [spy, ...rest].slice(0, sg.teamSize())) sroom.playerMessage(l.id, { t: 'pick', pid: p.id });
    sroom.playerMessage(l.id, { t: 'propose' });
    for (const p of ps5) sroom.playerMessage(p.id, { t: 'vote', approve: true });
    tickBy(8000);
    for (const id of sg.team) sroom.playerMessage(id, { t: 'card', card: sg.roles[id] === 'spy' ? 'fail' : 'success' });
    tickBy(8000);
  }
  saveSpy('gameover');
}
