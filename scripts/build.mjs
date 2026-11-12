// Validates data/, then writes dist/index.html as one self-contained file with
// the CSS, JS, data and portraits inlined.
//
// Usage:
//   node scripts/build.mjs
//   node scripts/build.mjs --src <dir> --out <file>   (alternate front end / output, for testing)
//
// src/index.html must contain each of these on its own line, exactly once:
//   <link rel="stylesheet" href="styles.css">
//   <!--TRACKER_DATA-->
//   <script src="app.js"></script>

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, extname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validate, printReport, ROOT } from './validate.mjs';

const MARKERS = {
  css: '<link rel="stylesheet" href="styles.css">',
  data: '<!--TRACKER_DATA-->',
  js: '<script src="app.js"></script>',
};
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function fail(msg) {
  console.error(`build failed: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { src: join(ROOT, 'src'), out: join(ROOT, 'dist', 'index.html') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--src' || a === '--out') && argv[i + 1]) opts[a.slice(2)] = resolve(argv[++i]);
    else fail(`unknown or incomplete argument "${a}" (supported: --src <dir>, --out <file>)`);
  }
  return opts;
}

/** JSON that is safe to place inside a <script> element. */
export function scriptSafeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Replace each marker line (alone on its line, indentation ignored) with its content.
 * All markers are located in the original template first, so inserted content is never re-scanned.
 * Plain line splicing, no String.prototype.replace, so `$` sequences in the content are left alone.
 */
function fillTemplate(html, replacements) {
  const lines = html.split(/\r?\n/);
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const at = new Map();
  for (const { marker, label, content } of replacements) {
    const hits = lines.map((l, i) => (l.trim() === marker ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 0) {
      fail(`src/index.html: ${label} marker ${marker} ${html.includes(marker) ? 'must be on a line by itself' : 'is missing'}`);
    }
    if (hits.length > 1) fail(`src/index.html: ${label} marker ${marker} appears ${hits.length} times, expected once`);
    at.set(hits[0], content);
  }
  return lines.map((l, i) => (at.has(i) ? at.get(i) : l)).join(eol);
}

function collectPortraits(data, portraitDir) {
  const portraits = {};
  const people = [...(data.candidates || []), ...(data.pundits || [])];
  for (const p of people) {
    const file = p.portrait?.file;
    if (!file || portraits[file]) continue;
    const mime = MIME[extname(file).toLowerCase()];
    if (!mime) fail(`portrait ${file} has an unsupported extension`);
    const bytes = readFileSync(join(portraitDir, file));
    portraits[file] = `data:${mime};base64,${bytes.toString('base64')}`;
  }
  if (existsSync(portraitDir)) {
    const unused = readdirSync(portraitDir).filter((f) => MIME[extname(f).toLowerCase()] && !portraits[f]);
    if (unused.length) console.warn(`note: not referenced by any person, left out: ${unused.join(', ')}`);
  }
  return portraits;
}

function displayPath(p) {
  const rel = relative(ROOT, p);
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : p;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const result = validate();
  if (!result.ok || result.warnings.length) printReport(result);
  if (!result.ok) fail('data does not validate (see errors above)');

  const paths = { html: join(opts.src, 'index.html'), css: join(opts.src, 'styles.css'), js: join(opts.src, 'app.js') };
  const missing = Object.values(paths).filter((p) => !existsSync(p));
  if (missing.length) fail(`front-end file(s) not found: ${missing.map(displayPath).join(', ')}`);

  const html = readFileSync(paths.html, 'utf8');
  const css = readFileSync(paths.css, 'utf8');
  const js = readFileSync(paths.js, 'utf8');

  if (/<\/script/i.test(js)) fail('src/app.js contains "</script", which would end the inlined script early. Split it, e.g. "<\\/script".');
  if (/<\/style/i.test(css)) fail('src/styles.css contains "</style", which would end the inlined stylesheet early.');

  const { meta, issues, candidates, outlets, pundits } = result.data;
  const portraits = collectPortraits(result.data, join(ROOT, 'assets', 'portraits'));
  const payload = scriptSafeJson({ meta, issues, candidates, outlets, pundits, portraits });

  const out = fillTemplate(html, [
    { marker: MARKERS.css, label: 'stylesheet', content: `<style>\n${css.trimEnd()}\n</style>` },
    { marker: MARKERS.data, label: 'data', content: `<script>window.TRACKER_DATA = ${payload};</script>` },
    { marker: MARKERS.js, label: 'script', content: `<script>\n${js.trimEnd()}\n</script>` },
  ]);

  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, out);
  const size = Buffer.byteLength(out);
  console.log(`built ${opts.out} (${(size / 1024).toFixed(1)} KB, ${Object.keys(portraits).length} portraits)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
