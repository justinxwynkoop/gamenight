// The TV's main menu: shown before anyone has picked a game. A big card for each game (its art, name, two facts and a
// line about it), the clock, and the QR code and room code so phones can join while the family decides.
// On the website's TV page the cards are buttons (click, or arrow keys and Enter on a TV remote); on a home server the
// host picks the game from their phone, so the cards are only shown.
import { h, ink } from './common.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@700;900&family=Outfit:wght@400;600;800&display=swap';

/** Everything the menu says about a game. The art is the Apple TV app's tile (tv-app/.../Assets.xcassets). */
const CARDS = {
  jeopardy: {
    title: 'Jeopardy', art: '/menu/jeopardy.webp', accent: '#3b73ff',
    tags: [['👥', '2+ players'], ['📱', 'Phone buzzers']],
    blurb: 'Pick a clue, buzz in from your phone. The host runs the board.',
  },
  feud: {
    title: 'Family Feud', art: '/menu/feud.webp', accent: '#ffa829',
    tags: [['👨‍👩‍👧', 'Two teams'], ['⚡', 'Fast Money']],
    blurb: 'Two teams guess the top survey answers. Strikes, steals and Fast Money.',
  },
  spynight: {
    title: 'Spy Night', art: '/menu/spynight.webp', accent: '#ff4d5e',
    tags: [['👥', '5 to 10 players'], ['🕶️', 'Secret roles']],
    blurb: 'Most of you are the Resistance. A few are Spies. Your phone tells you which.',
  },
  piechase: {
    title: 'Pie Chase', art: '/menu/piechase.webp', accent: '#a855f7',
    tags: [['🎲', '2 to 6 players or teams'], ['🥧', 'Six wedges']],
    blurb: 'Roll, move round the wheel and answer to win a wedge in every category. Then race to the hub.',
  },
  guysvsgals: {
    title: 'Guys vs Gals', art: '/menu/guysvsgals.webp', accent: '#ff4fa3',
    tags: [['⚔️', 'Guys against Gals'], ['⚡', 'Lightning Rounds']],
    blurb: 'The Guys answer gal stuff, the Gals answer guy stuff. Vote on your phones and race to the finish.',
  },
};

let selected = 0;   // the highlighted card, kept across redraws (the page redraws on every update)
let keysBound = false;
const seen = new Set();   // players already pictured, so only a newcomer's circle pops in

const greeting = (d) => {
  const hr = d.getHours();
  return hr >= 5 && hr < 12 ? 'Good morning · pick a game' : hr >= 12 && hr < 17 ? 'Good afternoon · pick a game' : "Good evening · pick tonight's game";
};
const timeText = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateText = (d) => d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

function fonts() {
  if (document.querySelector(`link[href="${FONTS}"]`)) return;
  document.head.append(h('link', { rel: 'stylesheet', href: FONTS }));
}

/** Keeps the clock and greeting current while the menu is up. */
setInterval(() => {
  const now = new Date();
  for (const el of document.querySelectorAll('.mn-time')) el.textContent = timeText(now);
  for (const el of document.querySelectorAll('.mn-date')) el.textContent = dateText(now);
  for (const el of document.querySelectorAll('.mn-hello')) el.textContent = greeting(now);
}, 15000);

/** Arrow keys move between the cards (a TV remote in a TV's browser sends them); Enter or Space opens one. */
function bindKeys() {
  if (keysBound) return;
  keysBound = true;
  addEventListener('keydown', (e) => {
    const cards = [...document.querySelectorAll('.mn .gamecard')];
    if (!cards.length || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    select(cards, Math.max(0, Math.min(cards.length - 1, selected + step)));
  });
}

function select(cards, i) {
  selected = i;
  cards.forEach((c, n) => c.classList.toggle('sel', n === i));
  const card = cards[i];
  card?.closest('.mn')?.style.setProperty('--accent', card.style.getPropertyValue('--accent'));
  if (card && card.tagName === 'BUTTON') card.focus({ preventScroll: true });
}

/**
 * The menu screen.
 * @param v       the room's view
 * @param ctx     { info: { joinUrl, code?, site? }, qr: () => <img>, music: is sound on, choose: (gameId) => void | null }
 *                choose is null on a home server, where only the host can pick.
 */
export function menuScreen(v, { info, qr, music, choose }) {
  fonts();
  bindKeys();
  const { room } = v;
  const now = new Date();
  const games = (room.games?.length ? room.games : Object.keys(CARDS).map((id) => ({ id })))
    .filter((g) => CARDS[g.id]);
  if (selected >= games.length) selected = 0;

  const cards = games.map((g, i) => {
    const c = CARDS[g.id];
    const kids = [
      h('div', { class: 'art' }, h('img', { src: c.art, alt: '' })),
      h('div', { class: 'body' },
        h('div', { class: 'top' }, h('span', { class: 'name' }, c.title), choose ? h('span', { class: 'go', 'aria-hidden': 'true' }, '▶') : null),
        h('div', { class: 'tags' }, c.tags.map(([icon, text]) => h('span', { class: 'tag' }, h('i', {}, icon), text))),
        h('p', { class: 'blurb' }, c.blurb)),
    ];
    const props = {
      class: `gamecard${i === selected ? ' sel' : ''}`, style: { '--accent': c.accent },
      onmouseenter: (e) => select([...e.currentTarget.parentNode.children], i),
    };
    return choose
      ? h('button', { ...props, type: 'button', 'aria-label': c.title, onclick: () => choose(g.id), onfocus: (e) => { if (selected !== i) select([...e.currentTarget.parentNode.children], i); } }, ...kids)
      : h('div', props, ...kids);
  });

  const joined = room.units ?? [];
  const join = h('aside', { class: 'mn-join' },
    h('div', { class: 'eyebrow' }, 'Join on your phone'),
    h('div', { class: 'qr-big' }, qr()),
    info.code
      ? h('p', {}, 'Scan, or open ', h('b', {}, info.site), h('br'), 'and type ', h('b', { class: 'roomcode' }, info.code))
      : h('p', {}, 'Scan, or open ', h('b', {}, info.joinUrl.replace(/^https?:\/\//, ''))),
    h('div', { class: 'who' },
      joined.length
        ? [h('div', { class: 'eyebrow' }, `${joined.length} ${joined.length === 1 ? 'player' : 'players'} here`),
          h('div', { class: 'avs' }, joined.slice(0, 12).map((u) => h('span', {
            class: `av${u.connected === false ? ' off' : ''}${seen.has(u.id) ? '' : ' new'}`, title: u.name, style: { background: u.color, color: ink(u.color) },
          }, (u.name ?? '?').trim().charAt(0).toUpperCase() || '?')))]
        : h('div', { class: 'eyebrow dim' }, 'Nobody here yet')),
    h('p', { class: 'music' }, music ? '♪ Theme music on (the host can mute it)' : 'Sound is off'));

  for (const u of joined) seen.add(u.id);
  // The page is redrawn on every update: the cards slide in only when the menu first appears, and the drifting light
  // carries on from where it was instead of starting over.
  const entering = !document.querySelector('.mn');
  const screen = h('div', { class: `mn${entering ? ' enter' : ''}`, style: { '--accent': CARDS[games[selected]?.id]?.accent ?? '#3b73ff' } },
    h('div', { class: 'mn-glow', style: { animationDelay: `-${(Date.now() / 1000) % 28}s` } }),
    h('header', { class: 'mn-head' },
      h('div', {},
        h('div', { class: 'eyebrow sun mn-hello' }, greeting(now)),
        h('h1', { class: 'mn-wm' }, h('span', {}, 'Family'), ' ', h('b', {}, 'Game Night')),
        h('div', { class: 'mn-bar' }, ['#ff5a5f', '#ff9f1c', '#ffd23f', '#3ddc97', '#3abeff', '#b388ff'].map((c) => h('i', { style: { background: c } })))),
      h('div', { class: 'mn-clock' }, h('div', { class: 'mn-time' }, timeText(now)), h('div', { class: 'mn-date' }, dateText(now)))),
    h('main', { class: 'mn-main' },
      h('div', { class: 'gamepick', role: choose ? 'group' : null, 'aria-label': 'Games', style: { '--n': String(cards.length) } }, cards),
      join),
    h('footer', { class: 'mn-hints' },
      choose
        ? [h('span', {}, h('b', {}, '← →'), ' choose'), h('span', {}, h('b', {}, 'Enter'), ' play'), h('span', {}, h('b', {}, 'M'), ' room code and host PIN')]
        : h('span', {}, 'The host picks the game on their phone: open ', h('b', {}, '/host'), ' and type the room code.')));

  // Put the keyboard on the highlighted card once the screen is on the page (it is redrawn on every update).
  if (choose) requestAnimationFrame(() => {
    const el = screen.querySelectorAll('.gamecard')[selected];
    const active = document.activeElement;
    if (el && screen.isConnected && (!active || active === document.body || active.classList.contains('gamecard'))) el.focus({ preventScroll: true });
  });
  return screen;
}
