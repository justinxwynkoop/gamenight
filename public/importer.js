// Brings question sets in from the internet or from pasted text: one set, a list of sets, a link to a .json file, or a
// GitHub link to a file or a folder of them. Every set is checked by the game (api.put refuses a bad one) and saved.
const slug = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const MAX = 40;

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
  try { url = new URL(text); } catch { throw new Error('That does not look like a link or a question set.'); }
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
