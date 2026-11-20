// Real-show clue boards, built from one season of the fan-maintained public dataset
// (github.com/jwolle1/jeopardy_clue_dataset), ported from the Buzzworthy game (github.com/JasonWynkoop1/buzzworthy).
// Nothing from the dataset is stored in this repository: the Apple TV downloads one random season when a room
// starts (about 1 to 2.5 MB of tab-separated text), and parseArchive() turns it into topic packs the lobby can
// switch on and off. This file only parses; it never touches the network.
const SEASONS = 42;
const PER_TOPIC = 40;
const MAX_FINALS = 30;

export const TOPICS = {
  'History':/\b(histor\w*|wars?|kings?|queens?|presidents?|presidential|empires?|revolution\w*|ancient|centur\w+|civil war|dynast\w*|battles?|colonial|pharaohs?|treaty|emperors?|medieval|founding|generals?|congress|senat\w+|vice president|first lad\w+|napoleon|lincoln|washington)\b/gi,
  'Geography':/\b(geograph\w*|countr\w+|capitals?|cit(y|ies)|rivers?|lakes?|islands?|mountains?|oceans?|continents?|nations?|africa\w*|asia\w*|europe\w*|canad\w+|mexic\w+|border\w*|desert|population|u\.s\. states?|state capital)\b/gi,
  'Science & Nature':/\b(scien\w+|chemi\w+|physic\w*|biolog\w*|elements?|anatom\w*|astronom\w*|planets?|space|animals?|nature|medic\w+|math\w*|plants?|weather|body|bones?|dinosaurs?|birds?|fish|insects?|mammals?|disease|atoms?|molecul\w+|cells?|tech\w*|computers?|invent\w+|trees?|flowers?|dogs?|cats?)\b/gi,
  'Words & Books':/\b(literat\w+|books?|authors?|novels?|novelists?|poe(t|m|try)\w*|words?|vocabulary|shakespeare\w*|language|spell\w*|letters?|fiction|quotations?|rhym\w*|playwrights?|bible\w*|biblical|myth\w*|wrote|written|synonyms?|abbrev\w*|latin|french word|greek)\b/gi,
  'Movies & TV':/\b(movies?|films?|tv|television|oscars?|hollywood|actors?|actress\w*|sitcoms?|cinema|cartoons?|director|starred|stars|show|series|character|disney|emmy)\b/gi,
  'Music':/\b(music\w*|songs?|singers?|bands?|rock|opera\w*|composers?|jazz|albums?|hits?|tunes?|broadway|musicals?|pop|lyrics?|grammy|symphon\w+|guitar|piano|rapper)\b/gi,
  'Sports & Games':/\b(sports?|olympi\w+|baseball|football|basketball|hockey|golf\w*|tennis|nfl|nba|mlb|athlet\w+|games?|teams?|champion\w*|super bowl|world series|boxing|soccer|racing|coach)\b/gi,
  'Food & Drink':/\b(food\w*|cook\w*|cuisine|drinks?|wines?|beers?|fruits?|vegetables?|desserts?|chees\w+|eat\w*|kitchen|recipes?|candy|snacks?|sauces?|bread|cocktails?|meat|restaurant\w*|dish(es)?|chef)\b/gi,
  'Art & Culture':/\b(art|artists?|painters?|paintings?|sculpt\w+|museums?|architect\w*|fashion|religio\w+|philosoph\w+|holidays?|danc\w+|ballet|gods?|goddess\w*|saints?)\b/gi,
};
const ANY = 'Anything Goes';

export function topicOf(name, text) {
  let best = ANY, bs = 0;
  for (const [t, re] of Object.entries(TOPICS)) {
    const sc = (name.match(re) || []).length * 3 + (text.match(re) || []).length;
    if (sc > bs) { bs = sc; best = t; }
  }
  return bs >= 3 ? best : ANY;
}

const clean = (s) => String(s || '').replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\s+/g, ' ').trim();

function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// "(John) Cusack" shows as "John Cusack" and also accepts "Cusack".
// "Quasimodo (the Hunchback of Notre Dame)" keeps its note on screen and accepts "Quasimodo".
export function response(raw) {
  const r = clean(raw).replace(/^"(.*)"$/, '$1');
  const without = r.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const leadingOptional = /^\(/.test(r) || /\)\s*\S/.test(r);
  const a = leadingOptional ? r.replace(/[()]/g, '').replace(/\s+/g, ' ').trim() : r;
  const alt = new Set();
  if (without && without !== a) alt.add(without);
  if (a !== r) alt.add(r.replace(/[()]/g, ''));
  for (const part of without.split(/\s+(?:or|\/)\s+|\s*\/\s*/)) if (part && part !== without) alt.add(part.trim());
  alt.delete(a);
  return { a, alt: [...alt].filter(Boolean).slice(0, 6) };
}

// On the show some clues lean on something we cannot show: a picture on the monitor, a Clue Crew demonstration, a
// map, a sound. The dataset only has the words, so those clues are dropped (and with them their column, as only full
// columns are played). The stage direction in front of a clue that reads fine without it ("Kelly of the Clue Crew
// presents from Edison Labs.", "Gene Simmons presents the clue.") is taken off, and the clue is kept.
const STAGE = /^\(([^)]*)\)\s*/;
const SHOWS = /\b(monitor|shows?|showing|holds?|holding|points?|pointing|demonstrat\w*|plays?|playing|sings?|singing|hums?|draws?|drawing|video|audio|maps?|images?|pictures?|photos?|diagrams?|charts?|models?|display\w*|is shown|are shown|reads? (?:from|a|an|the)|performs?|wear\w*|uses?|using|tastes?|pours?|mix\w*|walks|stands next)\b/i;
const NEEDS_MEDIA = /\b(seen here|shown here|pictured here|heard here|you see here|you hear here|this clip|in this video|on the monitor|seen in this|shown in this|here is|here are|the following)\b|\[/i;

/** The clue as players can read it, or null when it needs a picture or sound we do not have. */
export function playable(q) {
  const m = q.match(STAGE);
  if ((m && SHOWS.test(m[1])) || NEEDS_MEDIA.test(q)) return null;
  const text = m ? q.slice(m[0].length).trim() : q;
  return text || null;
}

export function parseArchive(tsv, season, rng = Math.random) {
  const lines = tsv.split('\n');
  const head = lines.shift().split('\t');
  const col = (n) => head.indexOf(n);
  const iR = col('round'), iV = col('clue_value'), iC = col('category'), iM = col('comments');
  const iQ = col('answer'), iA = col('question'), iD = col('air_date');
  const groups = new Map();
  const finals = [];
  for (const line of lines) {
    if (!line) continue;
    const f = line.split('\t');
    const round = f[iR], resp = f[iA], cat = clean(f[iC]);
    const raw = clean(f[iQ]);
    const clue = raw && playable(raw);
    if (raw && !clue && (round === '1' || round === '2')) {
      // A clue we cannot play spoils its whole column.
      const key = `${f[iD]}|${round}|${cat}`;
      if (!groups.has(key)) groups.set(key, { name: cat, round, clues: [] });
      groups.get(key).bad = true;
      continue;
    }
    if (!clue || !resp || !cat) continue;
    if (round === '3') {
      finals.push({ category: cat, q: clue, ...response(resp), date: f[iD] });
      continue;
    }
    if (round !== '1' && round !== '2') continue;
    // Categories with host comments often depend on them ("quotes indicate..."), so skip those.
    if (clean(f[iM])) continue;
    const key = `${f[iD]}|${round}|${cat}`;
    if (!groups.has(key)) groups.set(key, { name: cat, round, clues: [] });
    groups.get(key).clues.push({ v: Number(f[iV]) || 0, q: clue, ...response(resp) });
  }
  const categories = [];
  for (const g of groups.values()) {
    // Only full columns: five clues with five different dollar values.
    if (g.bad || g.clues.length !== 5 || new Set(g.clues.map((c) => c.v)).size !== 5) continue;
    g.clues.sort((x, y) => x.v - y.v);
    categories.push({ name: g.name, clues: g.clues.map(({ q, a, alt }) => ({ q, a, alt })) });
  }
  const seen = new Set();
  const byTopic = new Map([...Object.keys(TOPICS), ANY].map((t) => [t, []]));
  for (const c of shuffle(categories, rng)) {
    const k = c.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    byTopic.get(topicOf(c.name, c.clues.map((x) => `${x.q} ${x.a}`).join(' '))).push(c);
  }
  const finalsBy = new Map();
  for (const f of shuffle(finals, rng)) {
    const t = topicOf(f.category, `${f.q} ${f.a}`);
    if (!finalsBy.has(t)) finalsBy.set(t, []);
    finalsBy.get(t).push({ category: f.category, q: f.q, a: f.a, alt: f.alt });
  }
  const year = lines.length ? `${lines[0].split('\t')[iD] || ''}`.slice(0, 4) : '';
  const packs = [];
  for (const [t, cats] of byTopic) {
    if (cats.length < 12) continue;
    packs.push({
      id: `archive-${t.toLowerCase().replace(/[^a-z]+/g, '-')}`,
      title: t,
      description: `Real ${t} boards from season ${season}${year ? ` (${year})` : ''}. A new random season every room.`,
      selected: true,
      categories: cats.slice(0, PER_TOPIC),
      finals: (finalsBy.get(t) || []).slice(0, MAX_FINALS),
    });
  }
  return packs;
}

// Seasons 1 and 2 are spotty in the archive, so start from 3. Season N first aired
// in the fall of 1983 + N, so season 3 is 1986-87 and season 42 is 2025-26.
export const ERAS = {
  any: [3, SEASONS],
  classic: [3, 16],   // 1986-87 to 1999-2000
  '2000s': [17, 26],  // 2000-01 to 2009-10
  recent: [27, SEASONS], // 2010-11 on
};

export function pickSeason(era, rng = Math.random) {
  const [lo, hi] = ERAS[era] || ERAS.any;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

