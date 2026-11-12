// Brings question sets in from the internet or from pasted text: one set, a list of sets, a link to a .json file, or a
// GitHub link to a file or a folder of them. Every set is checked by the game (api.put refuses a bad one) and saved.
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const MAX = 40;

// ---------- a plain-text format, so a question set can be written in any text editor ----------
export const TEXT_HELP = {
  feud: `title: Grandma's House

? Name something you find in a kitchen
Spoon - 30
Fork - 25 | forks, silverware
Plate - 20
Cup - 15
Knife - 10

? Name a fruit you can eat on the go
Apple - 34
Banana - 30
Grapes - 16

(3 to 8 rounds. Each question has 3 to 8 answers, most popular first, each followed by " - " and its points.
After " | " you can list other words to accept. For Fast Money, write a line "fast money" and then exactly 5 more questions.)`,
  jeopardy: `title: Holiday Trivia

# Christmas
200 | This tree is often decorated in December | What is a fir?
400 | Reindeer pull this | What is a sleigh?
600* | Gift-giver in a red suit | Who is Santa Claus?
800 | ... | ...
1000 | ... | ...

# Next category
200 | ... | ...

final | Category | The final clue | The answer

(6 categories of 5 clues each. Put * after a value to make it a Daily Double.)`,
};

const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

function parseFeud(lines) {
  const doc = { title: '', rounds: [] };
  let list = doc.rounds; let q = null;
  lines.forEach(({ text, n }) => {
    let m;
    if ((m = text.match(/^title\s*:\s*(.+)$/i))) { doc.title = clean(m[1]); return; }
    if (/^fast\s*money\s*:?$/i.test(text)) { doc.fastMoney = []; list = doc.fastMoney; q = null; return; }
    if ((m = text.match(/^\?\s*(.+)$/))) { q = { question: clean(m[1]), answers: [] }; list.push(q); return; }
    if ((m = text.match(/^(.*?)\s*[-–—:]\s*(\d+)\s*(?:\|\s*(.*))?$/)) && q && clean(m[1])) {
      const aliases = (m[3] ?? '').split(',').map(clean).filter(Boolean);
      q.answers.push({ text: clean(m[1]), points: Number(m[2]), ...(aliases.length ? { aliases } : {}) });
      return;
    }
    throw new Error(q ? `Line ${n}: I did not understand “${text}”. An answer looks like: Spoon - 30` : `Line ${n}: I did not understand “${text}”. Start a question with a line beginning with ?`);
  });
  return doc;
}

function parseJeopardy(lines) {
  const doc = { title: '', categories: [] };
  let cat = null;
  lines.forEach(({ text, n }) => {
    let m;
    if ((m = text.match(/^title\s*:\s*(.+)$/i))) { doc.title = clean(m[1]); return; }
    if ((m = text.match(/^#\s*(.+)$/))) { cat = { name: clean(m[1]), clues: [] }; doc.categories.push(cat); return; }
    if ((m = text.match(/^final\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/i))) { doc.final = { category: clean(m[1]), clue: clean(m[2]), answer: clean(m[3]) }; return; }
    if ((m = text.match(/^(\d+)(\*)?\s*\|\s*(.+?)\s*\|\s*(.+)$/)) && cat) {
      cat.clues.push({ value: Number(m[1]), clue: clean(m[3]), answer: clean(m[4]), ...(m[2] ? { dailyDouble: true } : {}) });
      return;
    }
    throw new Error(cat ? `Line ${n}: I did not understand “${text}”. A clue looks like: 200 | the clue | the answer` : `Line ${n}: I did not understand “${text}”. Start a category with a line beginning with #`);
  });
  return doc;
}

/** Reads the plain-text format for a game. Throws an Error that names the line it could not read. */
export function parseText(text, gameId) {
  const parser = { feud: parseFeud, jeopardy: parseJeopardy }[gameId];
  if (!parser) throw new Error('Plain-text sets are not supported for this game. Use a .json file.');
  const lines = String(text).split(/\r?\n/).map((l, i) => ({ text: l.trim(), n: i + 1 })).filter((l) => l.text && !l.text.startsWith('//'));
  if (!lines.length) throw new Error('That file is empty.');
  return parser(lines);
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not read ${url} (${r.status})`);
  return r.json();
}

/** Turns what the person typed into a list of { name, doc } to try, or throws a readable error. */
export async function collect(input, gameId) {
  const text = String(input ?? '').trim();
  if (!text) throw new Error('Paste a link or the text of a question set.');
  if (text.startsWith('{') || text.startsWith('[')) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error('That is not valid JSON. Check that you copied all of it.'); }
    return (Array.isArray(parsed) ? parsed : [parsed]).map((doc, i) => ({ name: `pasted ${i + 1}`, doc }));
  }
  let url;
  try { url = /^https?:\/\/\S+$/i.test(text) ? new URL(text) : null; } catch { url = null; }
  if (!url) return [{ name: 'text', doc: parseText(text, gameId) }];   // not JSON and not a link: the plain-text format
  if (url.hostname === 'github.com') {
    const [, owner, repo, kind, branch, ...rest] = url.pathname.split('/');
    if (!owner || !repo) throw new Error('That GitHub link is missing the repository.');
    const path = rest.join('/');
    if (kind === 'blob') return [{ name: path, doc: await getJson(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`) }];
    // A folder (or the repository itself): list its .json files. For a whole repository, a data/<game> folder is tried first.
    const ref = kind === 'tree' ? `?ref=${encodeURIComponent(branch)}` : '';
    const folders = kind === 'tree' ? [path] : [`data/${gameId}`, ''];
    for (const folder of folders) {
      let list;
      try { list = await getJson(`https://api.github.com/repos/${owner}/${repo}/contents/${folder}${ref}`); } catch { continue; }
      const files = (Array.isArray(list) ? list : []).filter((f) => f.type === 'file' && /\.json$/i.test(f.name)).slice(0, MAX);
      if (files.length) return Promise.all(files.map(async (f) => ({ name: f.name, doc: await getJson(f.download_url) })));
    }
    throw new Error('No .json files found at that GitHub link.');
  }
  const data = await getJson(url.href);
  return (Array.isArray(data) ? data : [data]).map((doc, i) => ({ name: url.pathname.split('/').pop() || `set ${i + 1}`, doc }));
}

/** Saves what `collect` found through api.put. Returns { saved: [titles], failed: ["name: why"] }. */
export async function importSets(input, api, gameId) {
  const found = (await collect(input, gameId)).slice(0, MAX);
  const saved = []; const failed = [];
  for (const { name, doc } of found) {
    try {
      const id = slug(doc?.title) || slug(name.replace(/\.json$/i, ''));
      if (!id) throw new Error('the set has no title');
      await api.put(id, doc);
      saved.push(String(doc.title ?? id));
    } catch (e) { failed.push(`${name}: ${e.message}`); }
  }
  return { saved, failed };
}
