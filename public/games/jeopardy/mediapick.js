// A clue's picture, sound or video in the Jeopardy editor: paste a link, or search free media (Wikimedia Commons for
// pictures and sounds, NASA's library for videos) and pick one. Stored on the clue as
// media: { url, kind?, start?, end?, credit? } (games/jeopardy/game.js, cleanMedia, checks it when the set is saved).
import { h, setKids } from '../../common.js';

const KINDS = { image: '🖼️ Picture', audio: '🔊 Sound', video: '🎬 Video' };
const strip = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** The kind a link looks like, from its file ending (what cleanMedia does too). */
export function kindOf(url) {
  const path = String(url ?? '').split(/[?#]/)[0];
  if (/\.(jpe?g|png|gif|webp)$/i.test(path)) return 'image';
  if (/\.(mp3|m4a|aac|wav)$/i.test(path)) return 'audio';
  if (/\.(mp4|m4v|mov)$/i.test(path)) return 'video';
  return '';
}

/**
 * The link the Apple TV can play for a Commons file: pictures as a sized copy, Ogg and WebM sounds as Commons' own MP3
 * copy. Videos on Commons are WebM only, which the Apple TV cannot play, so they are left out.
 */
export function commonsLink(info) {
  const url = info?.url ?? '';
  const type = info?.mediatype ?? '';
  if (type === 'BITMAP' || type === 'DRAWING') return { kind: 'image', url: info.thumburl || url };
  if (type === 'AUDIO') {
    if (/\.(mp3|m4a|wav)$/i.test(url)) return { kind: 'audio', url };
    const m = url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/);
    if (m) return { kind: 'audio', url: `https://upload.wikimedia.org/wikipedia/commons/transcoded/${m[1]}/${m[2]}/${m[3]}/${m[3]}.mp3` };
  }
  return null;
}

async function searchCommons(q, kind) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6', gsrlimit: '12',
    gsrsearch: `${q} ${kind === 'audio' ? 'filetype:audio' : 'filetype:bitmap|drawing'}`,
    prop: 'imageinfo', iiprop: 'url|mediatype|extmetadata', iiurlwidth: '1280',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!res.ok) throw new Error('Wikimedia Commons did not answer');
  const pages = Object.values((await res.json()).query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.map((p) => {
    const info = p.imageinfo?.[0];
    const link = commonsLink(info);
    if (!link) return null;
    const meta = info.extmetadata ?? {};
    const licence = strip(meta.LicenseShortName?.value);
    const artist = strip(meta.Artist?.value).slice(0, 60);
    return {
      ...link,
      title: String(p.title ?? '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' '),
      credit: ['Wikimedia Commons', licence, artist].filter(Boolean).join(', '),
      page: info.descriptionurl,
    };
  }).filter(Boolean);
}

async function searchNasa(q) {
  const res = await fetch(`https://images-api.nasa.gov/search?${new URLSearchParams({ q, media_type: 'video' })}`);
  if (!res.ok) throw new Error('NASA\'s library did not answer');
  const items = (await res.json()).collection?.items ?? [];
  return items.slice(0, 12).map((it) => {
    const d = it.data?.[0];
    if (!d?.nasa_id) return null;
    const id = encodeURIComponent(d.nasa_id);
    return {
      kind: 'video', url: `https://images-assets.nasa.gov/video/${id}/${id}~medium.mp4`,
      title: d.title ?? d.nasa_id, credit: 'NASA (public domain)', page: `https://images.nasa.gov/details/${id}`,
      thumb: it.links?.find((l) => l.rel === 'preview')?.href,
    };
  }).filter(Boolean);
}

/** The picture, sound or video for one clue. `touch` marks the set as changed. */
export function mediaField(cl, touch) {
  const box = h('div', { class: 'media' });
  let searching = false;

  const set = (m) => {
    if (m && m.url) cl.media = m; else delete cl.media;
    touch();
    render();
  };
  const preview = (m) => {
    if (!m?.url) return null;
    const kind = m.kind || kindOf(m.url);
    if (kind === 'image') return h('img', { class: 'media-prev', src: m.url, alt: '' });
    if (kind === 'audio') return h('audio', { class: 'media-prev', src: m.url, controls: true, preload: 'none' });
    if (kind === 'video') return h('video', { class: 'media-prev', src: m.url, controls: true, preload: 'none', playsInline: true });
    return h('div', { class: 'media-warn' }, 'Link straight to a picture (.jpg, .png), a sound (.mp3, .m4a) or a video (.mp4).');
  };
  const num = (key, label) => {
    const el = h('input', { type: 'number', min: 0, step: 1, inputMode: 'numeric', value: cl.media?.[key] ?? '', placeholder: label, 'aria-label': label });
    el.addEventListener('input', () => {
      if (!cl.media) return;
      if (el.value === '') delete cl.media[key]; else cl.media[key] = Number(el.value);
      touch();
    });
    return el;
  };

  function searchPanel() {
    const q = h('input', { placeholder: 'Search free media, e.g. "lion roar" or "Saturn"', autocomplete: 'off', 'aria-label': 'Search free media' });
    const kind = h('select', { 'aria-label': 'Kind' }, ...Object.entries(KINDS).map(([k, label]) => h('option', { value: k }, label)));
    const results = h('div', { class: 'media-results' });
    const go = async () => {
      const text = q.value.trim();
      if (!text) return;
      setKids(results, h('div', { class: 'media-note' }, 'Searching…'));
      try {
        const found = kind.value === 'video' ? await searchNasa(text) : await searchCommons(text, kind.value);
        setKids(results, found.length ? found.map((m) => h('div', { class: 'media-hit' },
          m.kind === 'image' ? h('img', { src: m.url, alt: '', loading: 'lazy' })
            : m.thumb ? h('img', { src: m.thumb, alt: '', loading: 'lazy' }) : h('div', { class: 'media-icon' }, m.kind === 'audio' ? '🔊' : '🎬'),
          h('div', { class: 'grow' }, h('div', { class: 't' }, m.title), h('div', { class: 's' }, m.credit),
            m.kind === 'audio' ? h('audio', { src: m.url, controls: true, preload: 'none' }) : null),
          h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => {
            searching = false;
            set({ kind: m.kind, url: m.url, credit: m.credit.slice(0, 160), ...(m.kind === 'video' ? { start: 0, end: 20 } : {}) });
          } }, 'Use')))
          : h('div', { class: 'media-note' }, 'Nothing found. Try other words.'));
      } catch (e) {
        setKids(results, h('div', { class: 'media-warn' }, `${e.message}. Check your connection and try again.`));
      }
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    return h('div', { class: 'media-search' },
      h('div', { class: 'media-row' }, kind, q, h('button', { type: 'button', class: 'btn btn-sm', onclick: go }, 'Search')),
      h('div', { class: 'media-note' }, 'Pictures and sounds come from Wikimedia Commons, videos from NASA. All are free to use; the credit is saved with the clue.'),
      results);
  }

  function render() {
    const m = cl.media;
    if (!m && !searching) {
      setKids(box, h('div', { class: 'media-row' },
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { searching = true; render(); } }, '🖼️ Add a picture, sound or video'),
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { cl.media = { url: '' }; touch(); render(); } }, 'Paste a link')));
      return;
    }
    if (!m) {
      setKids(box, searchPanel(), h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { searching = false; render(); } }, 'Cancel'));
      return;
    }
    const url = h('input', { value: m.url, placeholder: 'https://… link to a .jpg, .png, .mp3 or .mp4', autocomplete: 'off', 'aria-label': 'Media link' });
    const prev = h('div', {}, preview(m));
    url.addEventListener('input', () => {
      cl.media.url = url.value.trim();
      cl.media.kind = kindOf(cl.media.url) || cl.media.kind;
      touch();
      setKids(prev, preview(cl.media));
    });
    const credit = h('input', { value: m.credit ?? '', maxLength: 160, placeholder: 'Credit (who made it, and its licence)', autocomplete: 'off', 'aria-label': 'Credit' });
    credit.addEventListener('input', () => { if (credit.value.trim()) cl.media.credit = credit.value; else delete cl.media.credit; touch(); });
    const kind = m.kind || kindOf(m.url);
    setKids(box,
      h('div', { class: 'media-row' }, h('span', { class: 'media-kind' }, KINDS[kind] ?? 'Media'), url,
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Remove the media', onclick: () => set(null) }, 'Remove')),
      kind === 'audio' || kind === 'video'
        ? h('div', { class: 'media-row' }, h('span', { class: 'media-note' }, 'Play from (seconds)'), num('start', 'Start'), h('span', { class: 'media-note' }, 'to'), num('end', 'End'), h('span', { class: 'media-note' }, 'at most 30 seconds'))
        : null,
      credit, prev);
  }
  render();
  return box;
}
