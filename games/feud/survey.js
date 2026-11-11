// Builds Family Feud question sets from the ProtoQA data (https://github.com/iesl/protoqa-data, CC BY 4.0),
// a collection of survey questions with ranked answers and counts. Its "scraped" files come from Family Feud
// fan sites. The data is NOT part of this repository: scripts/get-feud-sets.sh downloads it into data/surveys/
// (git-ignored) and builds sets into data/feud/ (also git-ignored for the generated ones).
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSet } from './game.js';

// A modest "not for the little ones" filter. The host also sees every question before reading it out.
const ADULT = /\b(sex|sexy|sexual|sexually|porn\w*|nude|nudity|naked|strippers?|strip club|erotic\w*|prostitut\w*|orgasm\w*|condoms?|genitals?|rape[sd]?|raping|cocaine|heroin|marijuana|weed|meth|suicide|lynch\w*|genocide|aroused|lust\w*|booze|drunk|hooker|virgin\w*|boobs?|breasts?|penis|vagina|butt|underwear|panties|bra|lingerie|kiss\w*|affair|cheat\w*|divorce\w*|toilet|pee|poop|fart\w*|pregnan\w*|dating|bedroom|honeymoon|hot tub|bikini|alcohol\w*|beer|wine|liquor|vodka|whiskey|cigarette\w*|smok\w*|gambl\w*|casino|stripper|fired|jail|prison|arrest\w*|police|date|dates|bachelor\w*|bride|groom|tattoo\w*|nightcap|bars?|drink\w*|drunk\w*|party|parties|ex|ex's|husband\w*|wife|wives|boyfriend\w*|girlfriend\w*|married|marry|spouse|lover\w*|romantic|romance|mistress|stripper\w*|burlesque|diet\w*|weight|fat|ugly|stupid|dumb|idiot|hate|kill\w*|die|dead|death|murder\w*|gun\w*|weapon\w*|war|drug\w*|pill\w*|medicine|doctor visit|hospital|surgery|cancer|sick|disease|jerry springer|oprah|trump|obama|politic\w*|president|church|religio\w*|men|man|women|woman|guys?|girls?|ladies|lady|gentlemen|sexist|blonde\w*|naughty|dirty|crime\w*|steal\w*|rob\w*|thief|lie|lies|lying|bribe|cheat\w*|bad words?|swear\w*|curse\w*|salary|rich|poor|broke|tax(es)?|loan\w*|debt|bills?|fired|quit)\b/i;

const PROPER = ['Christmas', 'Halloween', 'Thanksgiving', 'Easter', 'Santa Claus', 'Santa', 'Disney', 'Disneyland', 'Disney World', 'America', 'American', 'God',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'April', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  "McDonald's", 'Walmart', 'Hawaii', 'Florida', 'California', 'Texas', 'New York', 'Las Vegas', 'Europe', 'Paris', 'London', 'Mexico', 'Canada', 'Facebook', 'Google', 'Netflix', 'Disney', 'Barbie', 'Batman', 'Superman', 'Mickey Mouse', 'Valentine\'s Day', 'Mother\'s Day', 'Father\'s Day', 'Fourth of July', 'New Year\'s Eve', 'New Year\'s'];

/** "At The Beach, Name Something That Might Protect You From Sun. " -> "At the beach, name something that might protect you from sun." */
export function tidyQuestion(raw) {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const words = s.split(' ');
  const capped = words.filter((w) => /^[A-Z]/.test(w)).length;
  if (capped / words.length > 0.5) s = s.toLowerCase();   // Title Case (or all caps) becomes a normal sentence
  s = s.replace(/\bi\b/g, 'I').replace(/\bi'(m|ll|d|ve)\b/g, "I'$1");
  for (const word of ['USA', 'TV', 'DVD', 'CD', 'ATM', 'DMV', 'NFL', 'NBA', 'MTV', 'CEO', 'FBI', 'CIA', 'NASA', 'PTA', 'DJ', 'UFO']) s = s.replace(new RegExp(`\\b${word}\\b`, 'gi'), word);
  s = s.replace(/\bu\.s\.?(?=\s|$|\W)/gi, 'U.S.').replace(/\bus(?= (cities|city|states?|presidents?|capitals?|holidays?|teams?|citizens?|coins?|currency|presidential)\b)/gi, 'US');
  for (const name of PROPER) s = s.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), name);
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

/** "sun hat" -> "Sun hat" */
export const tidyAnswer = (a) => {
  const s = String(a ?? '').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** One ProtoQA line as a Family Feud question { question, answers: [{ text, points }] }, or null if it will not do. */
export function toQuestion(line, { minAnswers = 3, maxQuestionLength = 120, family = true } = {}) {
  const clusters = Object.values(line?.answers?.clusters ?? {});
  const question = tidyQuestion(line?.question?.original ?? line?.question?.normalized);
  if (!question || question.length > maxQuestionLength || (family && ADULT.test(question))) return null;
  // Only real questions: not fill-in-the-blank sentences, and not scraps like "Movie studio."
  if (!/^(name|tell me|what|which|who|where|when|how|many|if|at|on|in|after|before|during)\b/i.test(question) || /_{2,}|finish this/i.test(question)) return null;
  const seen = new Set();
  const answers = [];
  for (const c of clusters.sort((a, b) => b.count - a.count)) {
    const text = tidyAnswer(c.answers?.[0]);
    const key = text.toLowerCase();
    const points = Math.min(100, Math.trunc(c.count));
    if (!text || text.length > 40 || !(points >= 1) || seen.has(key) || (family && ADULT.test(text))) continue;
    seen.add(key);
    answers.push({ text, points });
    if (answers.length === 8) break;
  }
  if (answers.length < minAnswers) return null;
  return { question, answers };
}

function seededRandom(seed) {
  let n = seed >>> 0;
  return () => { n = (n * 1664525 + 1013904223) % 4294967296; return n / 4294967296; };
}

/**
 * Turn ProtoQA lines into sets of `rounds` survey rounds and five Fast Money questions each.
 *   lines   parsed ProtoQA objects
 *   sets    how many sets to make
 *   seed    makes the choice repeatable
 */
export function makeSets(lines, { sets = 20, seed = 1, rounds = 5, family = true, prefix = 'protoqa', titlePrefix = 'Survey Mix' } = {}) {
  const rng = seededRandom(seed);
  const seenQuestions = new Set();
  const rich = []; const ok = [];
  for (const line of lines) {
    const q = toQuestion(line, { minAnswers: 4, family });
    if (!q) continue;
    const key = q.question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seenQuestions.has(key)) continue;
    seenQuestions.add(key);
    (q.answers.length >= 5 ? rich : ok).push(q);
  }
  const shuffle = (list) => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
  shuffle(rich); shuffle(ok);
  const pool = [...rich, ...ok];
  const need = rounds + 5;
  const made = [];
  for (let n = 0; n < sets && rich.length >= rounds && pool.length >= need; n++) {
    const roundQs = rich.splice(0, rounds);
    const fmQs = shuffle(ok.length >= 5 ? ok : rich).splice(0, 5);
    if (fmQs.length < 5) break;
    const set = { title: `${titlePrefix} ${n + 1}`, rounds: roundQs, fastMoney: fmQs };
    validateSet(set);
    made.push({ id: `${prefix}-${String(n + 1).padStart(3, '0')}`, set });
  }
  return made;
}

// ---------- a random board on demand, from the survey files in data/surveys/ ----------
const surveyFiles = (dataDir) => {
  const dir = path.join(dataDir, 'surveys');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(dir, f)) : [];
};

/** A source of random Family Feud sets. The parsed files are dropped after a while without use. */
export function createRandomSurvey({ dataDir, keepMs = 10 * 60 * 1000, rng = Math.random } = {}) {
  let loaded = null; // Promise of the parsed lines
  let timer = null;
  const touch = () => { clearTimeout(timer); timer = setTimeout(() => { loaded = null; }, keepMs); timer.unref?.(); };
  return {
    available: () => surveyFiles(dataDir).length > 0,
    status: () => ({ available: surveyFiles(dataDir).length > 0, loaded: !!loaded, help: 'Run ./scripts/get-feud-sets.sh on the Pi to download the survey data (it stays on the Pi).' }),
    async make(options = {}) {
      const files = surveyFiles(dataDir);
      if (!files.length) throw Object.assign(new Error('The survey data is not installed on this Pi yet'), { code: 'no-dataset' });
      loaded ??= Promise.all(files.map((f) => readFile(f, 'utf8'))).then((texts) => texts.flatMap((t) => t.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)))
        .catch((e) => { loaded = null; throw e; });
      const lines = await loaded;
      touch();
      const [made] = makeSets(lines, { sets: 1, seed: Math.floor(rng() * 4294967296), family: options.family !== false, titlePrefix: 'Random survey' });
      if (!made) throw new Error('Not enough questions match those choices');
      const when = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      made.set.title = `Random survey · ${when}`;
      return { set: made.set, date: null };
    },
  };
}
