// Builds web/, the phone and host pages for Vercel: a copy of public/ without the TV page (the TV is the
// Apple TV app), plus config.js pointing the pages at the Supabase relay. The publishable key is meant to be public.
//   node scripts/build-web.mjs
import { cpSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'web');
const relay = JSON.parse(readFileSync(path.join(root, 'relay.config.json'), 'utf8'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const skip = new Set(['tv.html', 'tv.js', 'check.html', 'audio.js']);
cpSync(path.join(root, 'public'), out, {
  recursive: true,
  filter: (src) => !skip.has(path.basename(src)) && !/[\\/]games[\\/][^\\/]+[\\/]tv\.js$/.test(src),
});
writeFileSync(path.join(out, 'config.js'), `globalThis.GN_RELAY = ${JSON.stringify(relay)};\n`);
writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({
  cleanUrls: false,
  rewrites: [
    { source: '/', destination: '/play.html' },
    { source: '/play', destination: '/play.html' },
    { source: '/host', destination: '/host.html' },
    { source: '/editor', destination: '/editor.html' },
  ],
  headers: [{ source: '/(.*)', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }],
}, null, 2) + '\n');
console.log(`Wrote ${out}`);
