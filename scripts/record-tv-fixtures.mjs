// Plays a scripted Jeopardy game on the real engine and saves what the TV receives at each step, as JSON, for the
// Apple TV app's tests (tv-app/Tests/GameNightCoreTests/Fixtures/jp-*.json).
//   node scripts/record-tv-fixtures.mjs tv-app/Tests/GameNightCoreTests/Fixtures
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room } from '../room.js';
import { GAMES } from '../games/index.js';
import { T, readingTime } from '../games/jeopardy/game.js';

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

room.chooseGame('jeopardy');
const g = room.game;
const ps = ['Leo', 'Maya', 'Dad'].map((n) => room.join({ name: n }));
ps.forEach((p) => room.setConnected(p.id, true));
g.takeArchiveRequest();
save('lobby');

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
advance(readingTime(first.cl.q) + 10);
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
advance(readingTime(second.cl.q) + 10);
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
      advance(readingTime(spot.cl.q) + 10);
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
