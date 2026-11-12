// Refreshes YouTube subscriber counts for every reach entry (outlets.json and
// pundits.json platforms) that has a `youtube` handle.
//
// Usage:
//   node scripts/reach.mjs            fetch and write
//   node scripts/reach.mjs --dry-run  fetch and print, write nothing

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DELAY_MS = 1500;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function readJson(path) {
  const text = readFileSync(path, 'utf8');
  return { data: JSON.parse(text.replace(/^\uFEFF/, '')), eol: text.includes('\r\n') ? '\r\n' : '\n' };
}
function writeJson(path, data, eol) {
  let out = JSON.stringify(data, null, 2) + '\n';
  if (eol !== '\n') out = out.replace(/\n/g, eol);
  writeFileSync(path, out);
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "5.79M" -> 5790000, "604K" -> 604000, "1,234" -> 1234 */
export function parseCount(s) {
  const m = /^([\d.,]+)\s*([KMB])?$/i.exec(s.trim());
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] ?? 1;
  const num = parseFloat(m[1].replace(/,/g, '')); // pages are requested in en-US, so ',' is a thousands separator
  return Number.isFinite(num) ? Math.round(num * mult) : null;
}

const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Extract the channel's own subscriber count from its page HTML. Returns { value, raw, via } or null. */
export function extractSubscribers(html, handle) {
  const h = html.replace(BIDI, '');
  const a = /"metadataParts":\[\{"text":\{"content":"([\d.,]+\s*[KMB]?) subscribers?"/i.exec(h);
  if (a) return { value: parseCount(a[1]), raw: a[1], via: 'a' };
  const b = new RegExp(`@${escapeRe(handle)}\\s*(?:\u2022|\\\\u2022)\\s*([\\d.,]+\\s*[KMB]?) subscribers?`, 'i').exec(h);
  if (b) return { value: parseCount(b[1]), raw: b[1], via: 'b' };
  return null;
}

async function fetchChannel(handle) {
  const url = `https://www.youtube.com/@${encodeURIComponent(handle)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US', Cookie: 'SOCS=CAI' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const unknown = args.filter((a) => a !== '--dry-run');
  if (unknown.length) {
    console.error(`reach: unknown argument(s): ${unknown.join(' ')}`);
    process.exit(2);
  }

  // Collect every reach entry with a youtube handle.
  const files = ['outlets', 'pundits'].map((name) => ({ name, path: join(ROOT, 'data', `${name}.json`), ...readJson(join(ROOT, 'data', `${name}.json`)), changed: false }));
  const entries = [];
  for (const f of files) {
    for (const item of f.data) {
      const lists = f.name === 'outlets' ? [item.reach] : (item.platforms || []).map((p) => p.reach);
      for (const reach of lists) {
        for (const entry of reach || []) {
          if (entry && typeof entry.youtube === 'string' && entry.youtube) entries.push({ f, owner: item.id, entry });
        }
      }
    }
  }

  if (!entries.length) {
    console.log('reach: no reach entries with a youtube handle');
    return;
  }

  const date = today();
  const cache = new Map();
  const rows = [];
  const failures = [];
  let first = true;
  for (const { f, owner, entry } of entries) {
    const handle = entry.youtube;
    let result = cache.get(handle.toLowerCase());
    if (result === undefined) {
      if (!first) await sleep(DELAY_MS);
      first = false;
      try {
        const html = await fetchChannel(handle);
        result = extractSubscribers(html, handle);
        if (!result || result.value == null) result = { error: 'no subscriber count found on the page' };
      } catch (e) {
        result = { error: e.message };
      }
      cache.set(handle.toLowerCase(), result);
    }
    const before = entry.value;
    if (result.error) {
      failures.push(`${f.name}/${owner} @${handle}: ${result.error}`);
      rows.push({ file: f.name, owner, handle, before, after: null, change: 'FAILED', via: '' });
      continue;
    }
    const after = result.value;
    const pct = typeof before === 'number' && before > 0 ? ((after - before) / before) * 100 : null;
    rows.push({ file: f.name, owner, handle, before, after, change: pct == null ? 'new' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, via: result.via });
    if (!dryRun) {
      entry.value = after;
      entry.asOf = date;
      if (entry.source && typeof entry.source === 'object') entry.source.date = date;
      f.changed = true;
    }
  }

  // Table.
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : n == null ? '-' : String(n));
  const header = ['file', 'id', 'handle', 'before', 'after', 'change', 'pattern'];
  const table = rows.map((r) => [r.file, r.owner, `@${r.handle}`, fmt(r.before), fmt(r.after), r.change, r.via]);
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => (i >= 3 && i <= 5 ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ');
  console.log(line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of table) console.log(line(row));

  for (const f of files) if (f.changed) writeJson(f.path, f.data, f.eol);

  console.log(`\nreach: ${rows.length - failures.length} of ${rows.length} entries parsed${dryRun ? ' (dry run, nothing written)' : `, asOf set to ${date}`}`);
  for (const msg of failures) console.warn(`WARNING ${msg} (left unchanged)`);
  const bigMoves = rows.filter((r) => typeof r.before === 'number' && typeof r.after === 'number' && r.before > 0 && Math.abs(r.after - r.before) / r.before > 0.25);
  for (const r of bigMoves) console.warn(`WARNING ${r.file}/${r.owner} @${r.handle} changed by ${r.change}; check the handle points at the right channel`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
