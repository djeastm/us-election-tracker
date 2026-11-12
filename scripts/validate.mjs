// Checks every file in data/ against the contract in CLAUDE.md.
// Usage: node scripts/validate.mjs        (exits 1 if there are errors)
// Import: import { validate } from './validate.mjs'

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PARTIES = ['R', 'D', 'I'];
const STATUSES = ['declared', 'exploring', 'interested', 'undecided', 'speculated', 'declined'];
const SIDES = ['right', 'left', 'center'];
const POSITIONS = ['support', 'leaning', 'neutral', 'skeptical', 'oppose'];
const BASES = ['statement', 'record', 'reported'];
const LEANS = [-2, -1, 0, 1, 2, null];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

// ---------- date helpers ----------

/** Returns [startMs, endMs] for a YYYY, YYYY-MM or YYYY-MM-DD string, or null if invalid. */
export function dateRange(s) {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = +m[1];
  if (m[2] === undefined) return [Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1) - 1];
  const mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  if (m[3] === undefined) return [Date.UTC(y, mo - 1, 1), Date.UTC(y, mo, 1) - 1];
  const d = +m[3];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return [t, t + 86400000 - 1];
}

// ---------- reporter ----------

function makeReporter() {
  const errors = [];
  const warnings = [];
  const add = (list) => (file, id, field, msg) => list.push({ file, id: id ?? '-', field: field || '-', msg });
  return { errors, warnings, error: add(errors), warn: add(warnings) };
}

export function formatProblem(p) {
  return `${p.file}  ${p.id}  ${p.field}: ${p.msg}`;
}

// ---------- validate ----------

/**
 * Validate the data directory.
 * @param {{ root?: string }} [opts]
 * @returns {{ ok: boolean, errors: object[], warnings: object[], data: object }}
 */
export function validate(opts = {}) {
  const root = opts.root ?? ROOT;
  const dataDir = join(root, 'data');
  const portraitDir = join(root, 'assets', 'portraits');
  const r = makeReporter();
  const data = {};

  for (const name of ['meta', 'issues', 'candidates', 'outlets', 'pundits']) {
    const file = `data/${name}.json`;
    const path = join(dataDir, `${name}.json`);
    if (!existsSync(path)) { r.error(file, null, null, 'file is missing'); continue; }
    try {
      data[name] = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
      r.error(file, null, null, `JSON does not parse: ${e.message}`);
    }
  }

  // Generic field checkers bound to a file + entity id.
  const ctx = (file, id) => {
    const c = {
      str(obj, key, { optional = false, nullable = false, path = key } = {}) {
        if (!(key in obj)) { if (!optional) r.error(file, id, path, 'missing'); return false; }
        const v = obj[key];
        if (v === null) { if (!nullable) r.error(file, id, path, 'is null, expected a string'); return false; }
        if (typeof v !== 'string') { r.error(file, id, path, `expected a string, got ${typeOf(v)}`); return false; }
        if (!v.trim()) { r.error(file, id, path, 'is empty'); return false; }
        if (v !== v.trim()) r.warn(file, id, path, 'has leading or trailing whitespace');
        return true;
      },
      date(obj, key, { nullable = false, path = key } = {}) {
        if (!(key in obj)) { r.error(file, id, path, 'missing'); return false; }
        const v = obj[key];
        if (v === null) { if (!nullable) r.error(file, id, path, 'is null, expected a date'); return false; }
        if (!dateRange(v)) { r.error(file, id, path, `"${v}" is not a real date in YYYY-MM-DD, YYYY-MM or YYYY form`); return false; }
        return true;
      },
      oneOf(obj, key, allowed, { path = key } = {}) {
        if (!(key in obj)) { r.error(file, id, path, 'missing'); return false; }
        if (!allowed.includes(obj[key])) {
          r.error(file, id, path, `${JSON.stringify(obj[key])} is not one of ${allowed.map((a) => JSON.stringify(a)).join(', ')}`);
          return false;
        }
        return true;
      },
      arr(obj, key, { path = key, nonEmpty = false } = {}) {
        if (!(key in obj)) { r.error(file, id, path, 'missing'); return false; }
        if (!Array.isArray(obj[key])) { r.error(file, id, path, `expected an array, got ${typeOf(obj[key])}`); return false; }
        if (nonEmpty && obj[key].length === 0) { r.error(file, id, path, 'is empty, needs at least one entry'); return false; }
        return true;
      },
      obj(obj, key, { path = key, nullable = false } = {}) {
        if (!(key in obj)) { r.error(file, id, path, 'missing'); return false; }
        if (obj[key] === null) { if (!nullable) r.error(file, id, path, 'is null, expected an object'); return false; }
        if (!isObj(obj[key])) { r.error(file, id, path, `expected an object, got ${typeOf(obj[key])}`); return false; }
        return true;
      },
      known(obj, keys, path) {
        for (const k of Object.keys(obj)) {
          if (!keys.includes(k)) r.warn(file, id, path ? `${path}.${k}` : k, 'unknown field (typo?)');
        }
      },
      source(s, path) {
        if (!isObj(s)) { r.error(file, id, path, `source must be an object, got ${typeOf(s)}`); return; }
        c.str(s, 'title', { path: `${path}.title` });
        c.str(s, 'publisher', { path: `${path}.publisher` });
        if (c.str(s, 'url', { path: `${path}.url` })) checkUrl(s.url, `${path}.url`);
        c.date(s, 'date', { path: `${path}.date` });
        c.known(s, ['title', 'publisher', 'url', 'date'], path);
      },
      sources(obj, key, path = key) {
        if (!c.arr(obj, key, { path, nonEmpty: true })) return;
        obj[key].forEach((s, i) => c.source(s, `${path}[${i}]`));
        const urls = obj[key].map((s) => s && s.url);
        urls.forEach((u, i) => { if (u && urls.indexOf(u) !== i) r.warn(file, id, `${path}[${i}].url`, 'duplicate source url in the same list'); });
      },
      newestFirst(list, path, label = 'entries') {
        // Partial dates are ranges; flag only entries that are certainly newer than something listed above them.
        let minEndAbove = Infinity;
        let minEndDate = null;
        list.forEach((item, i) => {
          const range = item && dateRange(item.date);
          if (!range) return;
          if (range[0] > minEndAbove) {
            r.warn(file, id, `${path}[${i}].date`, `${label} not newest first: ${item.date} is listed after older ${minEndDate}`);
          }
          if (range[1] < minEndAbove) { minEndAbove = range[1]; minEndDate = item.date; }
        });
      },
      portrait(obj) {
        if (!('portrait' in obj)) { r.error(file, id, 'portrait', 'missing (use null when there is none)'); return; }
        const p = obj.portrait;
        if (p === null) return;
        if (!isObj(p)) { r.error(file, id, 'portrait', `expected null or an object, got ${typeOf(p)}`); return; }
        if (c.str(p, 'file', { path: 'portrait.file' })) {
          if (/[\\/]/.test(p.file) || p.file.startsWith('.')) r.error(file, id, 'portrait.file', `"${p.file}" must be a bare file name inside assets/portraits`);
          else if (!existsSync(join(portraitDir, p.file))) r.error(file, id, 'portrait.file', `assets/portraits/${p.file} does not exist`);
          else if (statSync(join(portraitDir, p.file)).size < 2000) r.warn(file, id, 'portrait.file', `assets/portraits/${p.file} is suspiciously small`);
          if (!p.file.startsWith(`${id}.`)) r.warn(file, id, 'portrait.file', `expected the file to be named ${id}.<ext>`);
        }
        c.str(p, 'credit', { path: 'portrait.credit' });
        c.str(p, 'license', { path: 'portrait.license' });
        if (c.str(p, 'source', { path: 'portrait.source' })) checkUrl(p.source, 'portrait.source');
        c.known(p, ['file', 'credit', 'license', 'source'], 'portrait');
      },
      reach(list, path) {
        list.forEach((e, i) => {
          const p = `${path}[${i}]`;
          if (!isObj(e)) { r.error(file, id, p, `expected an object, got ${typeOf(e)}`); return; }
          c.str(e, 'metric', { path: `${p}.metric` });
          if (!('value' in e)) r.error(file, id, `${p}.value`, 'missing');
          else if (typeof e.value !== 'number' || !Number.isFinite(e.value) || e.value < 0) r.error(file, id, `${p}.value`, `expected a non-negative number, got ${JSON.stringify(e.value)}`);
          c.date(e, 'asOf', { path: `${p}.asOf` });
          if ('youtube' in e && c.str(e, 'youtube', { path: `${p}.youtube` }) && !/^[A-Za-z0-9._-]+$/.test(e.youtube)) {
            r.error(file, id, `${p}.youtube`, `"${e.youtube}" should be a bare handle without @ or URL`);
          }
          if (c.obj(e, 'source', { path: `${p}.source` })) c.source(e.source, `${p}.source`);
          c.known(e, ['metric', 'value', 'asOf', 'youtube', 'source'], p);
        });
      },
    };
    function checkUrl(u, path) {
      let parsed;
      try { parsed = new URL(u); } catch { r.error(file, id, path, `"${u}" is not a valid URL`); return; }
      if (parsed.protocol !== 'https:') r.error(file, id, path, `"${u}" must use https`);
    }
    return c;
  };

  // Ids: unique, kebab-case. Returns a Set of the valid ids.
  const checkIds = (file, list) => {
    const seen = new Set();
    list.forEach((item, i) => {
      if (!isObj(item)) { r.error(file, `[${i}]`, null, `expected an object, got ${typeOf(item)}`); return; }
      const id = item.id;
      if (typeof id !== 'string' || !id) { r.error(file, `[${i}]`, 'id', 'missing or not a string'); return; }
      if (!KEBAB.test(id)) r.error(file, id, 'id', 'must be lowercase kebab-case');
      if (seen.has(id)) r.error(file, id, 'id', 'duplicate id');
      seen.add(id);
    });
    return seen;
  };
  const topArray = (name) => {
    const v = data[name];
    if (v === undefined) return null;
    if (!Array.isArray(v)) { r.error(`data/${name}.json`, null, null, 'top level must be an array'); return null; }
    return v;
  };
  const entityId = (item, i) => (isObj(item) && typeof item.id === 'string' && item.id ? item.id : `[${i}]`);

  // ---- meta.json ----
  if (data.meta !== undefined) {
    const file = 'data/meta.json';
    const m = data.meta;
    if (!isObj(m)) r.error(file, null, null, 'top level must be an object');
    else {
      const c = ctx(file, 'meta');
      c.str(m, 'title');
      c.date(m, 'electionDate');
      c.date(m, 'lastUpdated');
      c.date(m, 'previousUpdate', { nullable: true });
      if (dateRange(m.lastUpdated) && dateRange(m.previousUpdate) && dateRange(m.previousUpdate)[0] > dateRange(m.lastUpdated)[1]) {
        r.error(file, 'meta', 'previousUpdate', `${m.previousUpdate} is after lastUpdated ${m.lastUpdated}`);
      }
      if (c.obj(m, 'raceSummary')) {
        const rs = m.raceSummary;
        c.date(rs, 'asOf', { path: 'raceSummary.asOf' });
        c.str(rs, 'headline', { path: 'raceSummary.headline' });
        if (c.arr(rs, 'paragraphs', { path: 'raceSummary.paragraphs', nonEmpty: true })) {
          rs.paragraphs.forEach((p, i) => { if (typeof p !== 'string' || !p.trim()) r.error(file, 'meta', `raceSummary.paragraphs[${i}]`, 'expected a non-empty string'); });
        }
        c.sources(rs, 'sources', 'raceSummary.sources');
        c.known(rs, ['asOf', 'headline', 'paragraphs', 'sources'], 'raceSummary');
      }
      if (c.arr(m, 'updates', { nonEmpty: true })) {
        m.updates.forEach((u, i) => {
          if (!isObj(u)) { r.error(file, 'meta', `updates[${i}]`, 'expected an object'); return; }
          c.date(u, 'date', { path: `updates[${i}].date` });
          c.str(u, 'summary', { path: `updates[${i}].summary` });
          c.known(u, ['date', 'summary'], `updates[${i}]`);
        });
        c.newestFirst(m.updates, 'updates', 'updates');
        if (m.updates[0] && m.lastUpdated && m.updates[0].date !== m.lastUpdated) {
          r.warn(file, 'meta', 'updates[0].date', `newest update is ${m.updates[0].date} but lastUpdated is ${m.lastUpdated}`);
        }
      }
      c.known(m, ['title', 'electionDate', 'lastUpdated', 'previousUpdate', 'raceSummary', 'updates']);
    }
  }

  // ---- issues.json ----
  const issues = topArray('issues');
  const issueIds = issues ? checkIds('data/issues.json', issues) : null;
  issues?.forEach((it, i) => {
    if (!isObj(it)) return;
    const c = ctx('data/issues.json', entityId(it, i));
    for (const k of ['name', 'question', 'low', 'high']) c.str(it, k);
    c.known(it, ['id', 'name', 'question', 'low', 'high']);
  });

  // ---- outlets.json ----
  const outlets = topArray('outlets');
  const outletIds = outlets ? checkIds('data/outlets.json', outlets) : null;
  outlets?.forEach((o, i) => {
    if (!isObj(o)) return;
    const c = ctx('data/outlets.json', entityId(o, i));
    c.str(o, 'name');
    c.str(o, 'kind');
    c.str(o, 'lean');
    if (c.arr(o, 'reach')) c.reach(o.reach, 'reach');
    c.known(o, ['id', 'name', 'kind', 'lean', 'reach']);
  });

  // ---- candidates.json ----
  const candidates = topArray('candidates');
  const candidateIds = candidates ? checkIds('data/candidates.json', candidates) : null;
  candidates?.forEach((cand, i) => {
    if (!isObj(cand)) return;
    const file = 'data/candidates.json';
    const id = entityId(cand, i);
    const c = ctx(file, id);
    c.str(cand, 'name');
    c.oneOf(cand, 'party', PARTIES);
    c.str(cand, 'role');
    c.date(cand, 'born');
    c.str(cand, 'home');
    c.str(cand, 'wikipedia');
    c.portrait(cand);
    c.oneOf(cand, 'status', STATUSES);
    c.str(cand, 'statusNote');
    c.str(cand, 'bio');
    if (c.obj(cand, 'standing', { nullable: true })) {
      const s = cand.standing;
      c.str(s, 'text', { path: 'standing.text' });
      c.date(s, 'asOf', { path: 'standing.asOf' });
      if (c.obj(s, 'source', { path: 'standing.source' })) c.source(s.source, 'standing.source');
      c.known(s, ['text', 'asOf', 'source'], 'standing');
    }
    if (c.obj(cand, 'positions')) {
      for (const [key, pos] of Object.entries(cand.positions)) {
        const p = `positions.${key}`;
        if (issueIds && !issueIds.has(key)) r.error(file, id, p, `"${key}" is not an issue id in issues.json`);
        if (!isObj(pos)) { r.error(file, id, p, `expected an object, got ${typeOf(pos)}`); continue; }
        if (c.str(pos, 'label', { path: `${p}.label` }) && wordCount(pos.label) > 6) r.warn(file, id, `${p}.label`, `"${pos.label}" is longer than six words`);
        c.oneOf(pos, 'lean', LEANS, { path: `${p}.lean` });
        c.str(pos, 'summary', { path: `${p}.summary` });
        c.date(pos, 'asOf', { path: `${p}.asOf` });
        c.oneOf(pos, 'basis', BASES, { path: `${p}.basis` });
        c.sources(pos, 'sources', `${p}.sources`);
        if (c.arr(pos, 'history', { path: `${p}.history` })) {
          pos.history.forEach((h, j) => {
            const hp = `${p}.history[${j}]`;
            if (!isObj(h)) { r.error(file, id, hp, 'expected an object'); return; }
            c.date(h, 'date', { path: `${hp}.date` });
            c.str(h, 'label', { path: `${hp}.label` });
            c.oneOf(h, 'lean', LEANS, { path: `${hp}.lean` });
            c.str(h, 'note', { path: `${hp}.note` });
            c.sources(h, 'sources', `${hp}.sources`);
            c.known(h, ['date', 'label', 'lean', 'note', 'sources'], hp);
          });
          c.newestFirst(pos.history, `${p}.history`, 'history');
          const cur = dateRange(pos.asOf);
          pos.history.forEach((h, j) => {
            const hr = isObj(h) && dateRange(h.date);
            if (cur && hr && hr[0] > cur[1]) r.warn(file, id, `${p}.history[${j}].date`, `history entry ${h.date} is newer than the current position's asOf ${pos.asOf}`);
          });
        }
        c.known(pos, ['label', 'lean', 'summary', 'asOf', 'basis', 'sources', 'history'], p);
      }
    }
    if (c.arr(cand, 'moves')) {
      cand.moves.forEach((mv, j) => {
        const p = `moves[${j}]`;
        if (!isObj(mv)) { r.error(file, id, p, 'expected an object'); return; }
        c.date(mv, 'date', { path: `${p}.date` });
        c.str(mv, 'text', { path: `${p}.text` });
        c.sources(mv, 'sources', `${p}.sources`);
        c.known(mv, ['date', 'text', 'sources'], p);
      });
      c.newestFirst(cand.moves, 'moves', 'moves');
    }
    c.known(cand, ['id', 'name', 'party', 'role', 'born', 'home', 'wikipedia', 'portrait', 'status', 'statusNote', 'bio', 'standing', 'positions', 'moves']);
  });

  // ---- pundits.json ----
  const pundits = topArray('pundits');
  const punditIds = pundits ? checkIds('data/pundits.json', pundits) : null;
  pundits?.forEach((pu, i) => {
    if (!isObj(pu)) return;
    const file = 'data/pundits.json';
    const id = entityId(pu, i);
    const c = ctx(file, id);
    c.str(pu, 'name');
    c.oneOf(pu, 'side', SIDES);
    c.str(pu, 'wikipedia');
    c.portrait(pu);
    c.str(pu, 'bio');
    if (c.obj(pu, 'spectrum')) {
      const s = pu.spectrum;
      if (!('score' in s)) r.error(file, id, 'spectrum.score', 'missing');
      else if (typeof s.score !== 'number' || !Number.isFinite(s.score) || s.score < -5 || s.score > 5) {
        r.error(file, id, 'spectrum.score', `${JSON.stringify(s.score)} must be a number from -5 to 5`);
      } else {
        const expected = s.score < 0 ? 'left' : s.score > 0 ? 'right' : 'center';
        if (Math.abs(s.score) >= 2 && pu.side !== expected) r.warn(file, id, 'spectrum.score', `score ${s.score} looks inconsistent with side "${pu.side}"`);
      }
      c.str(s, 'faction', { path: 'spectrum.faction' });
      c.str(s, 'rationale', { path: 'spectrum.rationale' });
      c.known(s, ['score', 'faction', 'rationale'], 'spectrum');
    }
    if (c.arr(pu, 'platforms')) {
      pu.platforms.forEach((pl, j) => {
        const p = `platforms[${j}]`;
        if (!isObj(pl)) { r.error(file, id, p, 'expected an object'); return; }
        if (c.str(pl, 'outlet', { path: `${p}.outlet` }) && outletIds && !outletIds.has(pl.outlet)) {
          r.error(file, id, `${p}.outlet`, `"${pl.outlet}" is not an outlet id in outlets.json`);
        }
        c.str(pl, 'show', { path: `${p}.show`, nullable: true });
        c.str(pl, 'role', { path: `${p}.role` });
        if (c.arr(pl, 'reach', { path: `${p}.reach` })) c.reach(pl.reach, `${p}.reach`);
        c.known(pl, ['outlet', 'show', 'role', 'reach'], p);
      });
    }
    if (c.arr(pu, 'stances')) {
      pu.stances.forEach((st, j) => {
        const p = `stances[${j}]`;
        if (!isObj(st)) { r.error(file, id, p, 'expected an object'); return; }
        c.date(st, 'date', { path: `${p}.date` });
        if (!('candidate' in st)) r.error(file, id, `${p}.candidate`, 'missing (use null with a subject)');
        else if (st.candidate === null) {
          if (typeof st.subject !== 'string' || !st.subject.trim()) r.error(file, id, `${p}.subject`, 'required (non-empty string) when candidate is null');
        } else if (typeof st.candidate !== 'string') {
          r.error(file, id, `${p}.candidate`, `expected a candidate id or null, got ${typeOf(st.candidate)}`);
        } else {
          if (candidateIds && !candidateIds.has(st.candidate)) r.error(file, id, `${p}.candidate`, `"${st.candidate}" is not a candidate id in candidates.json`);
          if (!('subject' in st)) r.warn(file, id, `${p}.subject`, 'missing (use null when candidate is set)');
          else if (st.subject !== null && typeof st.subject !== 'string') r.error(file, id, `${p}.subject`, `expected a string or null, got ${typeOf(st.subject)}`);
        }
        c.oneOf(st, 'position', POSITIONS, { path: `${p}.position` });
        c.str(st, 'quote', { path: `${p}.quote`, nullable: true });
        c.str(st, 'context', { path: `${p}.context` });
        c.str(st, 'venue', { path: `${p}.venue` });
        if (c.obj(st, 'source', { path: `${p}.source` })) c.source(st.source, `${p}.source`);
        c.known(st, ['date', 'candidate', 'subject', 'position', 'quote', 'context', 'venue', 'source'], p);
      });
      c.newestFirst(pu.stances, 'stances', 'stances');
    }
    c.known(pu, ['id', 'name', 'side', 'wikipedia', 'portrait', 'bio', 'spectrum', 'platforms', 'stances']);
  });

  // Portrait files are named <id>.<ext>, so people ids must not collide across files.
  if (candidateIds && punditIds) {
    for (const pid of punditIds) {
      if (candidateIds.has(pid)) r.error('data/pundits.json', pid, 'id', 'same id as a candidate; portrait files would collide');
    }
  }

  return { ok: r.errors.length === 0, errors: r.errors, warnings: r.warnings, data };
}

/** Print a report. Returns true when there are no errors. */
export function printReport({ errors, warnings }, log = console.log) {
  for (const e of errors) log(`ERROR  ${formatProblem(e)}`);
  for (const w of warnings) log(`WARN   ${formatProblem(w)}`);
  log(`validate: ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
  return errors.length === 0;
}

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function typeOf(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; }
function wordCount(s) { return s.trim().split(/\s+/).length; }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = validate();
  process.exit(printReport(result) ? 0 : 1);
}
