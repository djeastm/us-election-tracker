// Downloads a freely licensed portrait from Wikipedia for every candidate and pundit
// whose `portrait` is null and who has a `wikipedia` page title, and records
// file, credit, license and source in the JSON.
//
// Usage:
//   node scripts/portraits.mjs              only people with portrait: null
//   node scripts/portraits.mjs --force      refresh everyone
//   node scripts/portraits.mjs --only <id>  just this person (refreshes even if set)

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORTRAIT_DIR = join(ROOT, 'assets', 'portraits');
const API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'election-tracker/1.0 (static site build script)';
const DELAY_MS = 1000;
const MAX_CREDIT = 80;

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
if (onlyIdx >= 0 && (!only || only.startsWith('--'))) {
  console.error('portraits: --only needs a person id, e.g. --only jd-vance');
  process.exit(2);
}
const unknown = args.filter((a, i) => !['--force', '--only'].includes(a) && !(onlyIdx >= 0 && i === onlyIdx + 1));
if (unknown.length) {
  console.error(`portraits: unknown argument(s): ${unknown.join(' ')}`);
  process.exit(2);
}

// ---------- JSON io that keeps the file's formatting ----------

function readJson(path) {
  const text = readFileSync(path, 'utf8');
  return { data: JSON.parse(text.replace(/^\uFEFF/, '')), eol: text.includes('\r\n') ? '\r\n' : '\n' };
}
function writeJson(path, data, eol) {
  let out = JSON.stringify(data, null, 2) + '\n';
  if (eol !== '\n') out = out.replace(/\n/g, eol);
  writeFileSync(path, out);
}

// ---------- http ----------

let lastRequest = 0;
async function politeFetch(url, opts = {}) {
  const wait = lastRequest + DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  for (let attempt = 1; ; attempt++) {
    lastRequest = Date.now();
    const res = await fetch(url, { ...opts, headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT, ...(opts.headers || {}) } });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const retryAfter = Number(res.headers.get('retry-after')) || attempt * 5;
      console.log(`  ${res.status} from ${new URL(url).host}, retrying in ${retryAfter}s`);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  }
}
async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const res = await politeFetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`API error: ${json.error.info || json.error.code}`);
  return json;
}

// ---------- metadata cleanup ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
function cleanText(html) {
  if (typeof html !== 'string') return '';
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();
}
function trimCredit(s) {
  // Drop common boilerplate, then cut at a word boundary.
  let t = s.replace(/^(photo(graph)?|image)\s+(by|credit:?)\s+/i, '').trim();
  if (t.length <= MAX_CREDIT) return t;
  const cut = t.slice(0, MAX_CREDIT - 1);
  const atSpace = cut.lastIndexOf(' ');
  return (atSpace > 40 ? cut.slice(0, atSpace) : cut).replace(/[\s,;:.(\u2013-]+$/, '') + '\u2026';
}

function extFrom(url, contentType) {
  const fromType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }[(contentType || '').split(';')[0].trim()];
  if (fromType) return fromType;
  const m = /\.([a-z0-9]+)$/i.exec(new URL(url).pathname);
  const e = m ? m[1].toLowerCase() : 'jpg';
  return e === 'jpeg' ? 'jpg' : e;
}

// ---------- one person ----------

async function fetchPortrait(person) {
  const q = await api({
    action: 'query', prop: 'pageimages', piprop: 'thumbnail|name', pithumbsize: '400', pilicense: 'free', redirects: '1', titles: person.wikipedia,
  });
  const page = q.query?.pages?.[0];
  if (!page || page.missing) throw new Error(`Wikipedia page "${person.wikipedia}" not found`);
  if (!page.thumbnail?.source || !page.pageimage) throw new Error(`no free lead image on "${page.title}"`);

  const img = await politeFetch(page.thumbnail.source);
  const bytes = Buffer.from(await img.arrayBuffer());
  const ext = extFrom(page.thumbnail.source, img.headers.get('content-type'));
  const file = `${person.id}.${ext}`;

  const info = await api({ action: 'query', prop: 'imageinfo', iiprop: 'extmetadata|url', titles: `File:${page.pageimage}` });
  const ii = info.query?.pages?.[0]?.imageinfo?.[0];
  if (!ii) throw new Error(`no imageinfo for File:${page.pageimage}`);
  const meta = ii.extmetadata || {};
  const credit = trimCredit(cleanText(meta.Artist?.value) || cleanText(meta.Credit?.value)) || 'Wikimedia Commons';
  const license = cleanText(meta.LicenseShortName?.value) || cleanText(meta.License?.value);
  if (!license) throw new Error(`no license name in metadata for File:${page.pageimage}`);
  let source = ii.descriptionurl || `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(page.pageimage.replace(/ /g, '_'))}`;
  if (source.startsWith('//')) source = `https:${source}`;
  source = source.replace(/^http:/, 'https:');

  return { bytes, file, portrait: { file, credit, license, source }, width: page.thumbnail.width, height: page.thumbnail.height };
}

// ---------- main ----------

const files = ['candidates', 'pundits'].map((name) => ({ name, path: join(ROOT, 'data', `${name}.json`), ...readJson(join(ROOT, 'data', `${name}.json`)) }));
const people = files.flatMap((f) => f.data.map((person) => ({ f, person })));

if (only && !people.some(({ person }) => person.id === only)) {
  console.error(`portraits: no candidate or pundit with id "${only}"`);
  process.exit(2);
}

const todo = people.filter(({ person }) => {
  if (only) return person.id === only;
  if (!person.wikipedia) { console.log(`skip ${person.id}: no wikipedia title`); return false; }
  return force || person.portrait == null;
});

if (!todo.length) {
  console.log('portraits: nothing to do (everyone has a portrait; use --force to refresh)');
  process.exit(0);
}

mkdirSync(PORTRAIT_DIR, { recursive: true });
let ok = 0;
const failures = [];
for (const { f, person } of todo) {
  process.stdout.write(`${person.id} (${person.wikipedia}) ... `);
  try {
    if (!person.wikipedia) throw new Error('no wikipedia title');
    const r = await fetchPortrait(person);
    const old = person.portrait?.file;
    writeFileSync(join(PORTRAIT_DIR, r.file), r.bytes);
    if (old && old !== r.file && /^[^\\/]+$/.test(old) && existsSync(join(PORTRAIT_DIR, old))) unlinkSync(join(PORTRAIT_DIR, old));
    person.portrait = r.portrait;
    writeJson(f.path, f.data, f.eol);
    ok++;
    console.log(`${r.file} ${(r.bytes.length / 1024).toFixed(1)} KB ${r.width}x${r.height}, ${r.portrait.license}, "${r.portrait.credit}"`);
    if (r.bytes.length < 5000) console.log(`  warning: ${r.file} is only ${r.bytes.length} bytes, check it is a real photo`);
  } catch (e) {
    failures.push(`${person.id}: ${e.message}`);
    console.log(`FAILED: ${e.message}`);
  }
}

console.log(`\nportraits: ${ok} downloaded, ${failures.length} failed`);
for (const line of failures) console.log(`  ${line}`);
process.exit(failures.length ? 1 : 0);
