/* 2028 Watch: renders the tracker from window.TRACKER_DATA (built) or ../data/*.json (dev). */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ data */

  var DATA = null;
  var BUILT = false;
  var IDX = {};
  var state = { field: 'R', punditFilter: 'all', feedLimit: 12 };

  function loadData() {
    if (window.TRACKER_DATA) {
      BUILT = true;
      return Promise.resolve(window.TRACKER_DATA);
    }
    var names = ['meta', 'issues', 'candidates', 'outlets', 'pundits'];
    return Promise.all(names.map(function (n) {
      return fetch('../data/' + n + '.json', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(n + '.json: HTTP ' + r.status);
        return r.json();
      });
    })).then(function (parts) {
      var d = { portraits: {} };
      names.forEach(function (n, i) { d[n] = parts[i]; });
      return d;
    });
  }

  function index() {
    IDX.candidate = byId(DATA.candidates);
    IDX.pundit = byId(DATA.pundits);
    IDX.outlet = byId(DATA.outlets);
    IDX.issue = byId(DATA.issues);
    IDX.current = {};
    DATA.pundits.forEach(function (p) {
      var cur = {};
      sortDesc(p.stances || []).forEach(function (s) {
        if (s.candidate && !cur[s.candidate]) cur[s.candidate] = s;
      });
      IDX.current[p.id] = cur;
    });
    var m = DATA.meta;
    IDX.newFrom = m.previousUpdate ? dateKey(m.previousUpdate) : shiftDays(dateKey(m.lastUpdated), -14);
  }

  function byId(list) {
    var o = {};
    (list || []).forEach(function (x) { o[x.id] = x; });
    return o;
  }

  /* ----------------------------------------------------------------- dates */

  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  var MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function parts(d) {
    var m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || ''));
    if (!m) return null;
    return { y: +m[1], m: m[2] ? +m[2] : null, d: m[3] ? +m[3] : null };
  }
  function dateKey(d) {
    var p = parts(d);
    if (!p) return '0000-00-00';
    return p.y + '-' + pad(p.m || 1) + '-' + pad(p.d || 1);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function shiftDays(key, n) {
    var p = parts(key);
    var t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate());
  }
  function fmtDate(d) {
    var p = parts(d);
    if (!p) return String(d || '');
    if (p.d) return MONTH_SHORT[p.m - 1] + ' ' + p.d + ', ' + p.y;
    if (p.m) return MONTH_LONG[p.m - 1] + ' ' + p.y;
    return String(p.y);
  }
  function isNew(d) { return !!d && dateKey(d) >= IDX.newFrom; }
  // A position's asOf on a "record" entry is a review date, not an event, so only
  // statements and positions that changed count as news.
  function posIsNew(pos) { return !!pos && isNew(pos.asOf) && (pos.basis === 'statement' || (pos.history || []).length > 0); }
  function sortDesc(list, getDate) {
    getDate = getDate || function (x) { return x.date; };
    return list.map(function (x, i) { return { x: x, i: i, k: dateKey(getDate(x)) }; })
      .sort(function (a, b) { return a.k < b.k ? 1 : a.k > b.k ? -1 : a.i - b.i; })
      .map(function (o) { return o.x; });
  }
  function ageAt(born, onDate) {
    var b = parts(born), t = parts(onDate);
    if (!b || !t || !b.m || !b.d) return null;
    var tm = t.m || 12, td = t.d || 28;
    var a = t.y - b.y;
    if (tm < b.m || (tm === b.m && td < b.d)) a -= 1;
    return a;
  }
  function daysToElection() {
    var e = parts(DATA.meta.electionDate);
    var now = new Date();
    var today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((Date.UTC(e.y, e.m - 1, e.d) - today) / 864e5);
  }

  /* ------------------------------------------------------------------- dom */

  var SVGNS = 'http://www.w3.org/2000/svg';

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, kid) {
    if (kid === null || kid === undefined || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { append(el, k); }); return; }
    el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }
  function s(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function ext(href, text, cls) {
    return h('a', { href: safeUrl(href), target: '_blank', rel: 'noopener noreferrer', class: cls }, text);
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || '')) ? u : '#'; }
  function dateEl(d, cls) {
    return h('time', { datetime: dateKey(d), class: cls || 'date' }, fmtDate(d));
  }

  /* --------------------------------------------------------------- glyphs */

  var POS = {
    support:   { word: 'Backs',        verb: 'backs',        one: 'backs',  many: 'back' },
    leaning:   { word: 'Leans toward', verb: 'leans toward', one: 'leans',  many: 'lean' },
    neutral:   { word: 'No pick',      verb: null,           one: 'no pick', many: 'no pick' },
    skeptical: { word: 'Doubts',       verb: 'doubts',       one: 'doubts', many: 'doubt' },
    oppose:    { word: 'Opposes',      verb: 'opposes',      one: 'opposes', many: 'oppose' }
  };
  var POS_ORDER = ['support', 'leaning', 'neutral', 'skeptical', 'oppose'];

  function glyph(pos, opts) {
    opts = opts || {};
    var svg = s('svg', { viewBox: '0 0 30 20', width: opts.size ? 30 * opts.size : 30, height: opts.size ? 20 * opts.size : 20, class: 'glyph glyph-' + pos, focusable: 'false' });
    if (opts.label === false) svg.setAttribute('aria-hidden', 'true');
    else { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', opts.label || (POS[pos] ? POS[pos].word : 'No stance')); }
    var common = { stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', fill: 'none' };
    var ell = s('ellipse', Object.assign({ cx: 15, cy: 10, rx: 11.5, ry: 7 }, common));
    if (pos === 'support') ell.setAttribute('fill', 'currentColor');
    svg.appendChild(ell);
    if (pos === 'leaning') svg.appendChild(s('path', { d: 'M15 3 A11.5 7 0 0 0 15 17 Z', fill: 'currentColor' }));
    if (pos === 'skeptical') svg.appendChild(s('line', Object.assign({ x1: 7.5, y1: 18, x2: 22.5, y2: 2 }, common)));
    if (pos === 'oppose') {
      svg.appendChild(s('line', Object.assign({ x1: 2.5, y1: 2, x2: 27.5, y2: 18 }, common)));
      svg.appendChild(s('line', Object.assign({ x1: 2.5, y1: 18, x2: 27.5, y2: 2 }, common)));
    }
    return svg;
  }

  function leanText(lean, issue) {
    if (lean === null || lean === undefined) return null;
    return ({ '-2': 'At the "' + issue.low + '" end', '-1': 'Toward "' + issue.low + '"', '0': 'In the middle',
      '1': 'Toward "' + issue.high + '"', '2': 'At the "' + issue.high + '" end' })[String(lean)];
  }

  function strip(lean, issue, opts) {
    opts = opts || {};
    var empty = lean === null || lean === undefined;
    var svg = s('svg', { viewBox: '0 0 60 10', width: opts.wide ? 90 : 60, height: opts.wide ? 15 : 10, class: 'strip' + (opts.blank ? ' strip-blank' : ''), focusable: 'false' });
    if (empty || opts.blank) svg.setAttribute('aria-hidden', 'true');
    else { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', leanText(lean, issue) + ', on a scale from "' + issue.low + '" to "' + issue.high + '"'); }
    for (var i = 0; i < 5; i++) {
      var on = !empty && !opts.blank && lean + 2 === i;
      svg.appendChild(s('ellipse', { cx: 6 + i * 12, cy: 5, rx: 4.6, ry: 3.4, fill: on ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': on ? 1.2 : 1, class: on ? 'on' : 'off' }));
    }
    return svg;
  }

  function scale(issue, lean) {
    return h('div', { class: 'scale' },
      h('span', { class: 'scale-end' }, issue.low),
      strip(lean, issue, { wide: true }),
      h('span', { class: 'scale-end' }, issue.high));
  }

  /* ------------------------------------------------------------- portraits */

  function portraitSrc(person) {
    var p = person && person.portrait;
    if (!p || !p.file) return null;
    if (BUILT) return (DATA.portraits || {})[p.file] || null;
    return '../assets/portraits/' + encodeURIComponent(p.file);
  }
  function initials(name) {
    var w = String(name).split(/\s+/).filter(function (x) { return !/^(jr|sr|ii|iii)\.?$/i.test(x); });
    return (w[0] ? w[0][0] : '') + (w.length > 1 ? w[w.length - 1][0] : '');
  }
  function portrait(person, size, alt) {
    var wrap = h('span', { class: 'ph ph-' + size, 'aria-hidden': alt ? null : 'true' });
    var src = portraitSrc(person);
    var fallback = function () { wrap.textContent = ''; wrap.appendChild(h('span', { class: 'ph-initials' }, initials(person.name))); wrap.classList.add('ph-none'); };
    if (src) {
      var img = h('img', { src: src, alt: alt ? person.name : '', decoding: 'async' });
      img.addEventListener('error', fallback);
      wrap.appendChild(img);
    } else fallback();
    return wrap;
  }
  function portraitFigure(person) {
    var p = person.portrait;
    return h('figure', { class: 'profile-photo' },
      portrait(person, 'lg', !!portraitSrc(person)),
      p && p.credit ? h('figcaption', null, 'Photo: ' + p.credit + ', ', p.source ? ext(p.source, p.license || 'source') : (p.license || '')) :
        h('figcaption', null, 'No freely licensed portrait on file yet.'));
  }

  /* ------------------------------------------------------------ shared bits */

  var STATUS = { declared: 'Running', exploring: 'Exploring', interested: 'Considering', undecided: 'Undecided', speculated: 'Speculated', declined: 'Says no' };
  var BASIS = { statement: 'Said it', record: 'Voting or governing record', reported: 'Reported by others' };
  var PARTY = { R: 'Republican', D: 'Democratic', I: 'Independent' };

  function partyTag(p) {
    return h('span', { class: 'party-tag party-' + p, title: PARTY[p] }, h('span', { class: 'sr-only' }, PARTY[p] + ' '), h('span', { 'aria-hidden': 'true' }, p));
  }
  function surname(name) {
    var w = String(name).split(/\s+/);
    return w.length > 1 ? w.slice(1).join(' ') : name;
  }
  function lcSubject(subj) {
    return /^(A|An|The|His|Her|Their)\s/.test(subj) ? subj[0].toLowerCase() + subj.slice(1) : subj;
  }
  function quote(q, cls) {
    return q ? h('blockquote', { class: cls || 'quote' }, '“' + q + '”') : null;
  }
  function sourceLine(src, venue) {
    if (!src) return null;
    return h('p', { class: 'src' },
      venue ? h('span', { class: 'venue' }, venue + '. ') : null,
      h('span', { class: 'pub' }, src.publisher + ': '),
      ext(src.url, src.title));
  }
  function sourceList(list) {
    if (!list || !list.length) return null;
    return h('ul', { class: 'sources' }, list.map(function (src) {
      return h('li', null, h('span', { class: 'pub' }, src.publisher + ': '), ext(src.url, src.title),
        src.date ? h('span', { class: 'src-date' }, ' ' + fmtDate(src.date)) : null);
    }));
  }
  function newMark() { return h('span', { class: 'new-flag' }, 'New'); }
  function newLabel() {
    var m = DATA.meta;
    return m.previousUpdate ? 'New since the ' + fmtDate(m.previousUpdate) + ' update' : 'New in the two weeks to ' + fmtDate(m.lastUpdated);
  }
  function stanceSentence(st, p, opts) {
    opts = opts || {};
    var who = opts.noWho ? null : h('a', { href: '#/pundits/' + p.id }, p.name);
    var target;
    if (st.candidate) {
      var c = IDX.candidate[st.candidate];
      target = c ? h('a', { href: '#/candidates/' + c.id }, c.name) : st.candidate;
    } else target = lcSubject(st.subject || 'an unnamed subject');
    var verb = POS[st.position] ? POS[st.position].verb : null;
    var now = opts.changed ? 'now ' : '';
    // "No pick", and doubts or opposition to something that is not a candidate
    // ("his own candidacy"), read badly as a verb. Name the topic and let the glyph carry the position.
    var plain = !verb || (!st.candidate && st.position !== 'support' && st.position !== 'leaning');
    if (plain) {
      var tail = st.candidate && !verb ? ', no pick' : '';
      return opts.noWho ? ['On ', target, tail] : [who, ' on ', target, tail];
    }
    if (opts.noWho) return [cap(now + verb) + ' ', target];
    return [who, ' ' + now + verb + ' ', target];
  }
  function cap(t) { return t[0].toUpperCase() + t.slice(1); }

  /* ---------------------------------------------------------------- drawer */

  var drawer, drawerBody, drawerOpener = null;

  function openDrawer(build, opener) {
    drawerOpener = opener || document.activeElement;
    drawerBody.textContent = '';
    append(drawerBody, build());
    if (typeof drawer.showModal === 'function') { if (!drawer.open) drawer.showModal(); }
    else drawer.setAttribute('open', '');
    drawerBody.scrollTop = 0;
    var t = document.getElementById('drawer-title');
    if (t) { t.setAttribute('tabindex', '-1'); t.focus(); }
  }
  function closeDrawer() {
    if (!drawer.open) return;
    if (typeof drawer.close === 'function') drawer.close(); else drawer.removeAttribute('open');
  }
  function initDrawer() {
    drawer = document.getElementById('drawer');
    drawerBody = document.getElementById('drawer-body');
    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    drawer.addEventListener('close', function () {
      if (drawerOpener && document.contains(drawerOpener)) drawerOpener.focus();
      drawerOpener = null;
    });
    drawer.addEventListener('click', function (e) { if (e.target === drawer) closeDrawer(); });
    drawer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(drawer.querySelectorAll('a[href], button, [tabindex="0"]'), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement.id === 'drawer-title')) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function stanceDrawer(p, c) {
    var list = sortDesc((p.stances || []).filter(function (x) { return x.candidate === c.id; }));
    var cur = list[0];
    return [
      h('div', { class: 'drawer-glyph' }, glyph(cur.position, { size: 1.6, label: false }), h('span', null, POS[cur.position].word)),
      h('h2', { id: 'drawer-title', class: 'drawer-title' }, p.name + ' on ' + c.name),
      h('p', { class: 'drawer-sub' }, list.length === 1 ? 'One stance on record.' : list.length + ' stances on record, newest first.'),
      h('ol', { class: 'entries' }, list.map(function (st) {
        return h('li', { class: 'entry' + (isNew(st.date) ? ' is-new' : '') },
          h('p', { class: 'entry-head' }, dateEl(st.date), ' ', glyph(st.position, { label: false }), ' ', h('strong', null, POS[st.position].word), isNew(st.date) ? newMark() : null),
          quote(st.quote),
          h('p', { class: 'context' }, st.context),
          sourceLine(st.source, st.venue));
      })),
      h('p', { class: 'drawer-links' }, h('a', { href: '#/pundits/' + p.id }, p.name + '’s page'), h('a', { href: '#/candidates/' + c.id }, c.name + '’s page'))
    ];
  }

  function positionDrawer(c, issue) {
    var pos = c.positions[issue.id];
    return [
      h('p', { class: 'drawer-kicker' }, issue.question),
      h('h2', { id: 'drawer-title', class: 'drawer-title' }, c.name + ' on ' + issue.name.charAt(0).toLowerCase() + issue.name.slice(1)),
      positionBlock(c, issue, pos, true),
      h('p', { class: 'drawer-links' }, h('a', { href: '#/candidates/' + c.id }, 'All of ' + c.name + '’s positions'))
    ];
  }

  function positionBlock(c, issue, pos, inDrawer) {
    if (!pos) return h('p', { class: 'nothing' }, 'Nothing on record yet.');
    var hist = pos.history || [];
    var fresh = posIsNew(pos);
    return h('div', { class: 'position' + (fresh ? ' is-new' : '') },
      h('p', { class: 'pos-label' }, pos.label),
      pos.lean === null || pos.lean === undefined ? h('p', { class: 'meta' }, 'Not placed on the scale.') : scale(issue, pos.lean),
      h('p', { class: 'summary' }, pos.summary),
      h('p', { class: 'meta' }, 'As of ', dateEl(pos.asOf), '. ', BASIS[pos.basis] || pos.basis, '.', fresh ? newMark() : null),
      sourceList(pos.sources),
      hist.length ? h('div', { class: 'history' },
        h('h3', { class: inDrawer ? 'h-small' : 'h-small' }, 'Earlier'),
        h('ol', { class: 'timeline' }, hist.map(function (e) {
          return h('li', null,
            h('p', { class: 'entry-head' }, dateEl(e.date), ' ', h('strong', null, e.label), ' ', e.lean !== null && e.lean !== undefined ? strip(e.lean, issue) : null),
            e.note ? h('p', { class: 'context' }, e.note) : null,
            sourceList(e.sources));
        }))) : null);
  }

  /* -------------------------------------------------------------- overview */

  function viewOverview() {
    var m = DATA.meta, rs = m.raceSummary || {};
    var boardHost = h('div', { class: 'board-host' });
    var el = h('div', { class: 'view view-overview' },
      h('section', { class: 'lede' },
        h('h1', { class: 'headline', tabindex: '-1' }, rs.headline || m.title),
        h('div', { class: 'lede-text' },
          (rs.paragraphs || []).map(function (p) { return h('p', null, p); })),
        rs.sources && rs.sources.length ? h('div', { class: 'lede-sources' },
          h('h2', { class: 'h-small' }, 'Sources for this summary, as of ' + fmtDate(rs.asOf || m.lastUpdated)),
          sourceList(rs.sources)) : null),
      h('section', { class: 'board-section', 'aria-labelledby': 'board-h' },
        h('div', { class: 'section-head' },
          h('h2', { id: 'board-h', class: 'h2' }, 'Where the pundits stand'),
          h('p', { class: 'dek' }, 'Each oval is a pundit’s latest stance on a candidate. Select one to read what they said and where.')),
        boardHost),
      offBoard(),
      latestMoves());
    renderBoard(boardHost);
    return el;
  }

  function legend() {
    return h('ul', { class: 'legend', 'aria-label': 'Key' },
      POS_ORDER.map(function (k) { return h('li', null, glyph(k, { label: false }), h('span', null, POS[k].word)); }),
      h('li', { class: 'legend-none' }, h('span', { class: 'nodot', 'aria-hidden': 'true' }), h('span', null, 'Nothing on record')),
      h('li', { class: 'legend-new' }, h('span', { class: 'swatch', 'aria-hidden': 'true' }), h('span', null, newLabel())));
  }

  function renderBoard(host) {
    host.textContent = '';
    var field = state.field;
    var cands = DATA.candidates.filter(function (c) { return c.party === field; });
    var ids = {};
    cands.forEach(function (c) { ids[c.id] = true; });
    var rows = DATA.pundits.filter(function (p) {
      return Object.keys(IDX.current[p.id]).some(function (cid) { return ids[cid]; });
    }).sort(function (a, b) {
      var d = field === 'R' ? b.spectrum.score - a.spectrum.score : a.spectrum.score - b.spectrum.score;
      return d || a.spectrum.faction.localeCompare(b.spectrum.faction) || a.name.localeCompare(b.name);
    });

    var switcher = h('div', { class: 'field-switch', role: 'group', 'aria-label': 'Which primary' },
      ['R', 'D'].map(function (f) {
        var n = DATA.candidates.filter(function (c) { return c.party === f; }).length;
        return h('button', { type: 'button', class: 'seg seg-' + f, 'aria-pressed': f === field ? 'true' : 'false',
          onclick: function () { if (state.field !== f) { state.field = f; renderBoard(host); host.querySelector('.seg-' + f).focus(); } } },
          (f === 'R' ? 'Republican field' : 'Democratic field'), h('span', { class: 'seg-n' }, ' ' + n));
      }));

    var table = h('table', { class: 'board board-' + field, style: 'min-width:calc(var(--corner) + ' + cands.length + ' * var(--col))' },
      h('caption', { class: 'sr-only' }, 'Pundits by ' + PARTY[field] + ' candidate. Each cell is the pundit’s latest stance.'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', class: 'corner' }, h('span', { class: 'corner-label' }, rows.length + ' pundits, ' + (field === 'R' ? 'furthest right first' : 'furthest left first'))),
        cands.map(function (c) {
          return h('th', { scope: 'col', class: 'cand-col party-' + c.party },
            h('a', { href: '#/candidates/' + c.id, class: 'cand-head' }, portrait(c, 'sm'), h('span', { class: 'cand-name' }, c.name)),
            h('span', { class: 'cand-status' }, STATUS[c.status] || c.status));
        }))),
      h('tbody', null, rows.map(function (p) {
        return h('tr', null,
          h('th', { scope: 'row', class: 'pundit-cell' },
            h('a', { href: '#/pundits/' + p.id }, p.name),
            h('span', { class: 'faction' }, p.spectrum.faction)),
          cands.map(function (c) {
            var st = IDX.current[p.id][c.id];
            if (!st) return h('td', { class: 'cell cell-empty' }, h('span', { class: 'nodot', 'aria-hidden': 'true' }), h('span', { class: 'sr-only' }, 'Nothing on record'));
            var fresh = isNew(st.date);
            return h('td', { class: 'cell' + (fresh ? ' is-new' : '') },
              h('button', { type: 'button', class: 'cell-btn',
                'aria-label': p.name + ' on ' + c.name + ': ' + POS[st.position].word + (fresh ? ', new' : '') + ', ' + fmtDate(st.date) + '. Show details.',
                onclick: function (e) { openDrawer(function () { return stanceDrawer(p, c); }, e.currentTarget); } },
                glyph(st.position, { label: false }),
                h('span', { class: 'cell-word' }, POS[st.position].word)));
          }));
      })),
      h('tfoot', null, h('tr', null,
        h('th', { scope: 'row' }, 'Tally'),
        cands.map(function (c) { return h('td', null, tally(rows, c)); }))));

    append(host, [
      h('div', { class: 'board-tools' }, switcher, legend()),
      h('div', { class: 'board-scroll', role: 'region', 'aria-label': PARTY[field] + ' board, scrolls sideways', tabindex: '0' }, table),
      cands.length && !rows.length ? h('p', { class: 'nothing' }, 'No pundit stances on this field yet.') : null
    ]);
  }

  function tally(rows, c) {
    var n = {};
    rows.forEach(function (p) { var st = IDX.current[p.id][c.id]; if (st) n[st.position] = (n[st.position] || 0) + 1; });
    var out = POS_ORDER.filter(function (k) { return n[k]; }).map(function (k) { return n[k] + ' ' + (n[k] === 1 ? POS[k].one : POS[k].many); });
    return out.length ? out.join(', ') : h('span', { class: 'muted' }, 'No stances yet');
  }

  function offBoard() {
    var items = [];
    DATA.pundits.forEach(function (p) {
      (p.stances || []).forEach(function (st) { if (!st.candidate) items.push({ p: p, st: st }); });
    });
    if (!items.length) return null;
    items = sortDesc(items, function (o) { return o.st.date; });
    return h('section', { class: 'offboard', 'aria-labelledby': 'off-h' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'off-h', class: 'h2' }, 'Off the board'),
        h('p', { class: 'dek' }, 'Stances on things other than a tracked candidate: third parties, a third Trump term, their own ambitions.')),
      h('ul', { class: 'off-list' }, items.map(function (o) {
        var st = o.st, fresh = isNew(st.date);
        return h('li', { class: 'off-item' + (fresh ? ' is-new' : '') },
          h('div', { class: 'off-glyph' }, glyph(st.position)),
          h('div', null,
            h('p', { class: 'off-head' }, stanceSentence(st, o.p), '. ', dateEl(st.date, 'date muted'), fresh ? newMark() : null),
            quote(st.quote, 'quote quote-sm'),
            h('p', { class: 'context' }, st.context),
            sourceLine(st.source, st.venue)));
      })));
  }

  function feedItems() {
    var items = [];
    DATA.pundits.forEach(function (p) {
      var sorted = sortDesc(p.stances || []);
      sorted.forEach(function (st, i) {
        var prev = null;
        for (var j = i + 1; j < sorted.length; j++) {
          var o = sorted[j];
          if ((st.candidate && o.candidate === st.candidate) || (!st.candidate && !o.candidate && o.subject === st.subject)) { prev = o; break; }
        }
        items.push({ date: st.date, kind: 'stance', p: p, st: st, prev: prev });
      });
    });
    DATA.candidates.forEach(function (c) {
      var moveDates = {};
      (c.moves || []).forEach(function (mv) { moveDates[mv.date] = true; items.push({ date: mv.date, kind: 'move', c: c, mv: mv }); });
      Object.keys(c.positions || {}).forEach(function (iid) {
        var pos = c.positions[iid], issue = IDX.issue[iid];
        if (!issue) return;
        var hist = pos.history || [];
        if ((pos.basis === 'statement' || hist.length) && !moveDates[pos.asOf]) items.push({ date: pos.asOf, kind: 'position', c: c, issue: issue, pos: pos, prev: hist[0] || null });
        hist.forEach(function (e) { if (!moveDates[e.date]) items.push({ date: e.date, kind: 'earlier', c: c, issue: issue, e: e }); });
      });
    });
    return sortDesc(items);
  }

  function latestMoves() {
    var all = feedItems();
    var host = h('ol', { class: 'feed' });
    var more = h('button', { type: 'button', class: 'more' });
    function paint() {
      host.textContent = '';
      all.slice(0, state.feedLimit).forEach(function (it) { host.appendChild(feedItem(it)); });
      var left = all.length - state.feedLimit;
      more.hidden = left <= 0;
      more.textContent = 'Show ' + Math.min(12, left) + ' more of ' + left;
    }
    more.addEventListener('click', function () {
      var firstNew = state.feedLimit;
      state.feedLimit += 12; paint();
      var link = host.children[firstNew] && host.children[firstNew].querySelector('a');
      if (link) link.focus();
    });
    paint();
    return h('section', { class: 'moves', 'aria-labelledby': 'moves-h' },
      h('div', { class: 'section-head' },
        h('h2', { id: 'moves-h', class: 'h2' }, 'Latest moves'),
        h('p', { class: 'dek' }, 'Every dated stance, statement and campaign move on record, newest first. Dates show as precisely as the reporting allows.')),
      host, more);
  }

  function feedItem(it) {
    var fresh = isNew(it.date), head, body = [];
    if (it.kind === 'stance') {
      var changed = it.prev && it.prev.position !== it.st.position;
      head = [glyph(it.st.position), ' ', stanceSentence(it.st, it.p, { changed: changed })];
      if (changed) body.push(h('p', { class: 'meta' }, 'Previously: ' + POS[it.prev.position].word + ', ' + fmtDate(it.prev.date) + '.'));
      body.push(quote(it.st.quote, 'quote quote-sm'), h('p', { class: 'context' }, it.st.context), sourceLine(it.st.source, it.st.venue));
    } else if (it.kind === 'move') {
      head = [h('a', { href: '#/candidates/' + it.c.id }, it.c.name), ' ', partyTag(it.c.party)];
      body.push(h('p', { class: 'context' }, it.mv.text), (it.mv.sources || [])[0] ? sourceLine(it.mv.sources[0]) : null);
    } else if (it.kind === 'position') {
      head = [h('a', { href: '#/candidates/' + it.c.id }, it.c.name), ' ', partyTag(it.c.party), ' ', h('span', { class: 'feed-issue' }, it.issue.name + ': ' + it.pos.label)];
      if (it.prev) body.push(h('p', { class: 'meta' }, 'Previously: ' + it.prev.label + ', ' + fmtDate(it.prev.date) + '.'));
      body.push(h('p', { class: 'context' }, it.pos.summary), (it.pos.sources || [])[0] ? sourceLine(it.pos.sources[0]) : null);
    } else {
      head = [h('a', { href: '#/candidates/' + it.c.id }, it.c.name), ' ', partyTag(it.c.party), ' ', h('span', { class: 'feed-issue' }, it.issue.name + ': ' + it.e.label)];
      body.push(it.e.note ? h('p', { class: 'context' }, it.e.note) : null, (it.e.sources || [])[0] ? sourceLine(it.e.sources[0]) : null);
    }
    return h('li', { class: 'feed-item' + (fresh ? ' is-new' : '') },
      h('div', { class: 'feed-date' }, dateEl(it.date), fresh ? h('span', { class: 'sr-only' }, ', new') : null),
      h('div', { class: 'feed-body' }, h('p', { class: 'feed-head' }, head), body));
  }

  /* ------------------------------------------------------------ candidates */

  function viewCandidates() {
    var issues = DATA.issues;
    var table = h('table', { class: 'grid' },
      h('caption', { class: 'sr-only' }, 'Candidates by issue. Each cell gives the position and where it sits on that issue’s five-point scale.'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', class: 'corner' }, h('span', { class: 'corner-label' }, DATA.candidates.length + ' candidates')),
        issues.map(function (is) {
          return h('th', { scope: 'col', class: 'issue-col', title: is.question },
            h('span', { class: 'issue-name' }, is.name),
            h('span', { class: 'issue-ends' }, h('span', null, is.low), h('span', null, is.high)));
        }))),
      ['R', 'D', 'I'].map(function (party) {
        var cs = DATA.candidates.filter(function (c) { return c.party === party; });
        if (!cs.length) return null;
        return h('tbody', { class: 'party-group party-' + party },
          h('tr', { class: 'group-row' }, h('th', { scope: 'colgroup', colspan: issues.length + 1 }, h('span', null, party === 'R' ? 'Republicans' : party === 'D' ? 'Democrats' : 'Independents'))),
          cs.map(function (c) {
            return h('tr', null,
              h('th', { scope: 'row', class: 'cand-cell party-edge-' + c.party },
                portrait(c, 'md'),
                h('span', { class: 'cand-meta' },
                  h('a', { href: '#/candidates/' + c.id, class: 'cand-link' }, c.name),
                  h('span', { class: 'cand-role' }, c.role),
                  h('span', { class: 'cand-status status-' + c.status }, STATUS[c.status] || c.status))),
              issues.map(function (is) {
                var pos = (c.positions || {})[is.id];
                if (!pos) return h('td', { class: 'pos-cell pos-empty' }, h('span', { class: 'empty-note' }, 'Nothing on record'), strip(null, is, { blank: true, wide: true }));
                var fresh = posIsNew(pos);
                return h('td', { class: 'pos-cell' + (fresh ? ' is-new' : '') },
                  h('button', { type: 'button', class: 'pos-btn', onclick: function (e) { openDrawer(function () { return positionDrawer(c, is); }, e.currentTarget); },
                    'aria-label': c.name + ', ' + is.name + ': ' + pos.label + (pos.lean !== null && pos.lean !== undefined ? '. ' + leanText(pos.lean, is) : '') + '. Show details.' },
                    h('span', { class: 'pos-text' }, pos.label),
                    pos.lean === null || pos.lean === undefined ? h('span', { class: 'unplaced' }, 'Not on the scale') : strip(pos.lean, is, { wide: true })));
              }));
          }));
      }));
    // buttons carry the full accessible name; hide the inner strips from AT to avoid repetition
    Array.prototype.forEach.call(table.querySelectorAll('.pos-btn svg'), function (x) { x.setAttribute('aria-hidden', 'true'); x.removeAttribute('role'); x.removeAttribute('aria-label'); });

    return h('div', { class: 'view view-candidates' },
      h('header', { class: 'page-head' },
        h('h1', { class: 'title', tabindex: '-1' }, 'Candidates'),
        h('p', { class: 'dek' }, 'Where each possible 2028 nominee stands on seven issues. Every issue has its own five-point scale, named at the top of its column; it is not a left-right score. Select a cell for the evidence.')),
      h('div', { class: 'grid-scroll', role: 'region', 'aria-label': 'Candidates by issue, scrolls sideways', tabindex: '0' }, table));
  }

  function viewCandidate(id) {
    var c = IDX.candidate[id];
    if (!c) return viewNotFound('No candidate with that id is on file.', '#/candidates', 'See all candidates');
    var age = ageAt(c.born, DATA.meta.lastUpdated);
    var supporters = [];
    DATA.pundits.forEach(function (p) { var st = IDX.current[p.id][c.id]; if (st) supporters.push({ p: p, st: st }); });
    supporters.sort(function (a, b) { return POS_ORDER.indexOf(a.st.position) - POS_ORDER.indexOf(b.st.position) || dateKey(b.st.date).localeCompare(dateKey(a.st.date)); });

    return h('div', { class: 'view view-profile' },
      h('p', { class: 'crumb' }, h('a', { href: '#/candidates' }, 'Candidates')),
      h('header', { class: 'profile-head party-edge-' + c.party },
        portraitFigure(c),
        h('div', { class: 'profile-id' },
          h('h1', { class: 'title', tabindex: '-1' }, c.name),
          h('p', { class: 'profile-sub' }, partyTag(c.party), ' ', PARTY[c.party] + '. ' + c.role + '.'),
          h('dl', { class: 'facts' },
            fact('Home state', c.home),
            age !== null ? fact('Age', String(age), 'Born ' + fmtDate(c.born)) : null,
            fact('Status', STATUS[c.status] || c.status),
            c.standing ? fact('Standing', c.standing.text, null, c.standing) : null),
          c.statusNote ? h('p', { class: 'status-note' }, c.statusNote) : null,
          h('p', { class: 'bio' }, c.bio))),
      h('section', { class: 'block', 'aria-labelledby': 'stand-h' },
        h('h2', { id: 'stand-h', class: 'h2' }, 'Where they stand'),
        !Object.keys(c.positions || {}).length ? h('p', { class: 'nothing' }, 'Nothing on record yet on any of the ' + DATA.issues.length + ' issues we track. The next update run will look for statements, votes and reporting.') :
        h('ol', { class: 'issue-list' }, DATA.issues.map(function (is) {
          var pos = (c.positions || {})[is.id];
          return h('li', { class: 'issue-item' + (pos ? '' : ' issue-empty') },
            h('div', { class: 'issue-q' }, h('h3', { class: 'h3' }, is.name), h('p', { class: 'meta' }, is.question)),
            positionBlock(c, is, pos, false));
        }))),
      h('section', { class: 'block', 'aria-labelledby': 'moves-h' },
        h('h2', { id: 'moves-h', class: 'h2' }, 'Recent moves'),
        (c.moves || []).length ? h('ol', { class: 'timeline' }, sortDesc(c.moves).map(function (mv) {
          return h('li', { class: isNew(mv.date) ? 'is-new' : null },
            h('p', { class: 'entry-head' }, dateEl(mv.date), isNew(mv.date) ? newMark() : null),
            h('p', { class: 'context' }, mv.text), sourceList(mv.sources));
        })) : h('p', { class: 'nothing' }, 'No moves on record yet.')),
      h('section', { class: 'block', 'aria-labelledby': 'say-h' },
        h('h2', { id: 'say-h', class: 'h2' }, 'What the pundits say'),
        supporters.length ? h('ul', { class: 'says' }, supporters.map(function (o) {
          var st = o.st;
          return h('li', { class: 'say' + (isNew(st.date) ? ' is-new' : '') },
            h('div', { class: 'say-glyph' }, glyph(st.position, { label: false }), h('span', null, POS[st.position].word)),
            h('div', null,
              h('p', { class: 'say-head' }, h('a', { href: '#/pundits/' + o.p.id }, o.p.name), h('span', { class: 'faction' }, o.p.spectrum.faction), dateEl(st.date, 'date muted'), isNew(st.date) ? newMark() : null),
              quote(st.quote, 'quote quote-sm'),
              h('p', { class: 'context' }, st.context),
              sourceLine(st.source, st.venue)));
        })) : h('p', { class: 'nothing' }, 'No tracked pundit has taken a stance on ' + c.name + ' yet.')));
  }

  function fact(k, v, note, standing) {
    return h('div', { class: 'fact' }, h('dt', null, k),
      h('dd', null, v,
        note ? h('span', { class: 'fact-note' }, note) : null,
        standing ? h('span', { class: 'fact-note' }, 'As of ' + fmtDate(standing.asOf) + ', ', ext(standing.source.url, standing.source.publisher)) : null));
  }

  /* --------------------------------------------------------------- pundits */

  function reachFigures(p) {
    var out = [];
    (p.platforms || []).forEach(function (pl) { (pl.reach || []).forEach(function (r) { out.push({ r: r, pl: pl }); }); });
    return out;
  }
  function compact(n) {
    if (n >= 1e6) return (Math.round(n / 1e5) / 10).toString() + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return String(n);
  }
  function metricShort(m) {
    if (/youtube subscribers/i.test(m)) return 'YouTube subscribers';
    if (/viewers/i.test(m)) return 'TV viewers';
    return m;
  }
  function topReach(p) {
    var all = reachFigures(p);
    if (!all.length) return null;
    all.sort(function (a, b) { return b.r.value - a.r.value; });
    var t = all[0];
    var multi = (p.platforms || []).length > 1 && /viewers/i.test(t.r.metric);
    return compact(t.r.value) + ' ' + metricShort(t.r.metric) + (multi ? ', ' + t.pl.show : '');
  }
  function mainShow(p) {
    var pl = (p.platforms || [])[0];
    if (!pl) return '';
    var o = IDX.outlet[pl.outlet];
    if (!o || pl.outlet === 'independent') return pl.show + ', self-published';
    if (o.name === pl.show) return pl.show;
    return pl.show + ' on ' + o.name;
  }
  function picks(p) {
    var cur = IDX.current[p.id];
    var list = DATA.candidates.filter(function (c) { return cur[c.id]; });
    if (!list.length) return null;
    return h('ul', { class: 'chips', 'aria-label': 'Current stances' }, list.map(function (c) {
      var st = cur[c.id];
      return h('li', { class: 'chip' + (isNew(st.date) ? ' is-new' : '') }, glyph(st.position, { label: POS[st.position].word }), h('span', null, ' ' + surname(c.name)));
    }));
  }

  function rail(people, opts) {
    opts = opts || {};
    var host = h('div', { class: 'rail' + (opts.single ? ' rail-single' : '') });
    var track = h('div', { class: 'rail-track' });
    var axis = h('div', { class: 'rail-axis', 'aria-hidden': 'true' });
    for (var t = -5; t <= 5; t++) {
      axis.appendChild(h('span', { class: 'tick' + (t === 0 ? ' tick-zero' : ''), style: 'left:' + ((t + 5) * 10) + '%' }, h('span', null, t > 0 ? '+' + t : t === 0 ? '0' : '−' + -t)));
    }
    var dots = people.map(function (p) {
      var sc = p.spectrum.score;
      var label = p.name + ', ' + p.spectrum.faction + ', placed at ' + (sc > 0 ? '+' : '') + sc;
      var dot = opts.single ? h('span', { class: 'dot dot-here', role: 'img', 'aria-label': label }, portrait(p, 'dot'))
        : h('a', { href: '#/pundits/' + p.id, class: 'dot', 'aria-label': label }, portrait(p, 'dot'), h('span', { class: 'dot-tip', 'aria-hidden': 'true' }, p.name));
      dot._score = sc;
      track.appendChild(dot);
      return dot;
    });
    host.appendChild(track);
    host.appendChild(axis);
    host.appendChild(h('div', { class: 'rail-ends', 'aria-hidden': 'true' }, h('span', null, 'Further left'), h('span', null, 'Further right')));
    function layout() {
      var W = track.clientWidth;
      if (!W) return;
      var D = W < 520 ? 26 : 34, gap = 3;
      var lanes = [];
      var order = dots.slice().sort(function (a, b) { return a._score - b._score; });
      order.forEach(function (d) {
        var x = (d._score + 5) / 10 * W;
        var lane = 0;
        while (lanes[lane] !== undefined && x - lanes[lane] < D + gap) lane++;
        lanes[lane] = x;
        d.style.left = x + 'px';
        d.style.bottom = (lane * (D + gap)) + 'px';
        d.style.width = d.style.height = D + 'px';
      });
      track.style.height = (Math.max(1, lanes.length) * (D + gap)) + 'px';
    }
    host._layout = layout;
    return host;
  }

  var railHosts = [];
  function layoutRails() { railHosts = railHosts.filter(function (r) { return document.contains(r); }); railHosts.forEach(function (r) { r._layout(); }); }

  function viewPundits() {
    var list = DATA.pundits.slice().sort(function (a, b) { return a.spectrum.score - b.spectrum.score || a.name.localeCompare(b.name); });
    var r = rail(list);
    railHosts.push(r);
    var listHost = h('ul', { class: 'pundit-list' });
    var filters = [['all', 'All'], ['right', 'Right'], ['left', 'Left and center']];
    var bar = h('div', { class: 'filter', role: 'group', 'aria-label': 'Filter pundits' });
    function paint() {
      bar.textContent = '';
      filters.forEach(function (f) {
        var n = list.filter(function (p) { return match(p, f[0]); }).length;
        bar.appendChild(h('button', { type: 'button', class: 'seg', 'aria-pressed': state.punditFilter === f[0] ? 'true' : 'false',
          onclick: function () { state.punditFilter = f[0]; paint(); bar.querySelector('[aria-pressed="true"]').focus(); } }, f[1], h('span', { class: 'seg-n' }, ' ' + n)));
      });
      listHost.textContent = '';
      list.filter(function (p) { return match(p, state.punditFilter); }).forEach(function (p) {
        var reach = topReach(p);
        listHost.appendChild(h('li', { class: 'pundit-row' },
          portrait(p, 'md'),
          h('div', { class: 'pr-id' },
            h('a', { href: '#/pundits/' + p.id, class: 'pr-name' }, p.name),
            h('span', { class: 'faction' }, p.spectrum.faction)),
          h('div', { class: 'pr-show' }, h('span', null, mainShow(p)), reach ? h('span', { class: 'reach' }, reach) : null),
          h('div', { class: 'pr-picks' }, picks(p) || h('span', { class: 'muted' }, (p.stances || []).length ? 'Stances on other subjects only' : 'Nothing on record yet'))));
      });
    }
    function match(p, f) { return f === 'all' || (f === 'right' ? p.side === 'right' : p.side !== 'right'); }
    paint();
    var el = h('div', { class: 'view view-pundits' },
      h('header', { class: 'page-head' },
        h('h1', { class: 'title', tabindex: '-1' }, 'Pundits'),
        h('p', { class: 'dek' }, DATA.pundits.length + ' hosts, writers and commentators whose views on the 2028 field reach large audiences.')),
      h('section', { class: 'rail-section', 'aria-labelledby': 'rail-h' },
        h('h2', { id: 'rail-h', class: 'h3' }, 'Where we place them, from −5 to +5'),
        h('p', { class: 'meta' }, 'This placement is our editorial judgment from each person’s record, not a measured score. Each pundit’s page explains it.'),
        r),
      h('section', { class: 'block', 'aria-label': 'All pundits' }, bar, listHost));
    return el;
  }

  function viewPundit(id) {
    var p = IDX.pundit[id];
    if (!p) return viewNotFound('No pundit with that id is on file.', '#/pundits', 'See all pundits');
    var r = rail([p], { single: true });
    railHosts.push(r);
    var sc = p.spectrum.score;
    var stances = sortDesc(p.stances || []);
    return h('div', { class: 'view view-profile' },
      h('p', { class: 'crumb' }, h('a', { href: '#/pundits' }, 'Pundits')),
      h('header', { class: 'profile-head' },
        portraitFigure(p),
        h('div', { class: 'profile-id' },
          h('h1', { class: 'title', tabindex: '-1' }, p.name),
          h('p', { class: 'profile-sub' }, p.spectrum.faction + '. ' + mainShow(p) + '.'),
          h('p', { class: 'bio' }, p.bio))),
      h('section', { class: 'block', 'aria-labelledby': 'place-h' },
        h('h2', { id: 'place-h', class: 'h2' }, 'Where we place them'),
        h('p', { class: 'place-score' }, h('strong', null, (sc > 0 ? '+' : sc < 0 ? '−' : '') + Math.abs(sc)), ' on our scale from −5, far left, to +5, far right.'),
        r,
        h('p', { class: 'rationale' }, p.spectrum.rationale),
        h('p', { class: 'meta' }, 'Editorial judgment by 2028 Watch. It changes only when the evidence does.')),
      h('section', { class: 'block', 'aria-labelledby': 'cast-h' },
        h('h2', { id: 'cast-h', class: 'h2' }, 'Where they broadcast'),
        h('ul', { class: 'platforms' }, (p.platforms || []).map(function (pl) {
          var o = IDX.outlet[pl.outlet];
          return h('li', { class: 'platform' },
            h('h3', { class: 'h3' }, pl.show),
            h('p', { class: 'meta' }, pl.role + (o ? ', ' + o.name : '') + '.'),
            o ? h('p', { class: 'outlet-line' }, o.kind + '. ' + o.lean + '.') : null,
            reachList(pl.reach, null),
            o && (o.reach || []).length ? h('div', { class: 'outlet-reach' }, h('h4', { class: 'h-small' }, o.name + ' overall'), reachList(o.reach)) : null);
        }))),
      h('section', { class: 'block', 'aria-labelledby': 'field-h' },
        h('h2', { id: 'field-h', class: 'h2' }, 'On the 2028 field'),
        stances.length ? h('ol', { class: 'timeline stances' }, stances.map(function (st) {
          var fresh = isNew(st.date);
          return h('li', { class: fresh ? 'is-new' : null },
            h('p', { class: 'entry-head' }, dateEl(st.date), ' ', glyph(st.position, { label: false }), ' ', h('strong', null, stanceSentence(st, p, { noWho: true })), fresh ? newMark() : null),
            quote(st.quote),
            h('p', { class: 'context' }, st.context),
            sourceLine(st.source, st.venue));
        })) : h('p', { class: 'nothing' }, 'Nothing on record yet. ' + p.name + ' has not taken a public, sourced stance on a 2028 candidate that we have found.')));
  }

  function reachList(list) {
    if (!list || !list.length) return null;
    return h('ul', { class: 'reach-list' }, list.map(function (r) {
      return h('li', null, h('span', { class: 'num' }, r.value.toLocaleString('en-US')), ' ' + r.metric + '. As of ', dateEl(r.asOf), '. ', ext(r.source.url, r.source.publisher));
    }));
  }

  /* --------------------------------------------------------- polls, states */

  function viewPolls() {
    var withStanding = DATA.candidates.filter(function (c) { return c.standing; });
    return h('div', { class: 'view view-plain' },
      h('header', { class: 'page-head' },
        h('h1', { class: 'title', tabindex: '-1' }, 'Polls'),
        h('p', { class: 'dek' }, 'This page will track polling averages for each party’s primary and general-election head-to-heads between the leading candidates, with how they have moved over time. That tracking has not started yet.')),
      withStanding.length ? h('section', { class: 'block', 'aria-labelledby': 'st-h' },
        h('h2', { id: 'st-h', class: 'h2' }, 'Latest figures on record'),
        h('p', { class: 'meta' }, 'What we have so far: one recent primary polling figure per candidate, as recorded on their page.'),
        h('div', { class: 'grid-scroll', role: 'region', 'aria-label': 'Polling figures', tabindex: '0' },
          h('table', { class: 'plain-table' },
            h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Candidate'), h('th', { scope: 'col' }, 'Figure'), h('th', { scope: 'col' }, 'As of'), h('th', { scope: 'col' }, 'Source'))),
            h('tbody', null, withStanding.map(function (c) {
              return h('tr', null,
                h('th', { scope: 'row' }, partyTag(c.party), ' ', h('a', { href: '#/candidates/' + c.id }, c.name)),
                h('td', null, c.standing.text),
                h('td', { class: 'num' }, fmtDate(c.standing.asOf)),
                h('td', null, ext(c.standing.source.url, c.standing.source.publisher)));
            }))))) : null);
  }

  function viewStates() {
    return h('div', { class: 'view view-plain' },
      h('header', { class: 'page-head' },
        h('h1', { class: 'title', tabindex: '-1' }, 'States'),
        h('p', { class: 'dek' }, 'Nothing is recorded here yet. This page will track two things.')),
      h('ul', { class: 'plan' },
        h('li', null, h('h2', { class: 'h3' }, 'The primary calendar'), h('p', null, 'The date and order of each state’s 2028 primary or caucus for both parties, as the national committees and the states set them.')),
        h('li', null, h('h2', { class: 'h3' }, 'General-election ratings'), h('p', null, 'How public forecasters rate each state for November 2028, from safe to toss-up, once they begin publishing.'))));
  }

  function viewNotFound(msg, href, label) {
    return h('div', { class: 'view view-plain' },
      h('h1', { class: 'title', tabindex: '-1' }, 'Not found'),
      h('p', { class: 'dek' }, msg || 'There is no page at this address.'),
      h('p', null, h('a', { href: href || '#/' }, label || 'Go to the overview')));
  }

  /* ---------------------------------------------------------------- chrome */

  function chrome() {
    var m = DATA.meta;
    var d = daysToElection();
    document.getElementById('countdown').textContent = d > 1 ? d.toLocaleString('en-US') + ' days to Election Day' : d === 1 ? '1 day to Election Day' : d === 0 ? 'Election Day' : 'Election held ' + fmtDate(m.electionDate);
    document.getElementById('updated').textContent = 'Updated ' + fmtDate(m.lastUpdated);
    var f = document.getElementById('footer');
    f.textContent = '';
    append(f, h('div', { class: 'footer-inner' },
      h('section', { class: 'how' },
        h('h2', { class: 'h3' }, 'How this works'),
        h('p', null, 'Scheduled AI research runs read public reporting and update the data behind this page. Every claim links to its source, and quotes are verbatim.'),
        h('p', null, 'Two things here are editorial judgments, not measurements: where each pundit sits on the left-right scale, and where each candidate’s position falls on an issue’s scale.'),
        h('p', { class: 'meta' }, 'Portraits come from Wikimedia Commons under the license credited beside each one.')),
      h('section', { class: 'log' },
        h('h2', { class: 'h3' }, 'Update log'),
        h('ol', null, (m.updates || []).map(function (u) { return h('li', null, dateEl(u.date), h('span', null, u.summary)); })))));
  }

  /* ----------------------------------------------------------------- theme */

  // No saved choice: follow the system setting, live. A click saves an explicit choice.
  function initTheme() {
    var btn = document.getElementById('theme-toggle');
    var root = document.documentElement;
    var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    function isDark() {
      var t = root.getAttribute('data-theme');
      return t ? t === 'dark' : !!(mq && mq.matches);
    }
    function sync() {
      var dark = isDark();
      if (btn) btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#121821' : '#EEF1EC');   // --paper, both themes
    }
    if (btn) btn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      sync();
    });
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', sync); else if (mq.addListener) mq.addListener(sync);
    }
    sync();
  }

  /* --------------------------------------------------------------- routing */

  function route() {
    var hash = (location.hash || '#/').replace(/^#/, '');
    var seg = hash.split('?')[0].split('/').filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var view, nav = seg[0] || 'overview';
    if (!seg.length) view = viewOverview();
    else if (seg[0] === 'candidates' && seg.length === 1) view = viewCandidates();
    else if (seg[0] === 'candidates' && seg.length === 2) view = viewCandidate(seg[1]);
    else if (seg[0] === 'pundits' && seg.length === 1) view = viewPundits();
    else if (seg[0] === 'pundits' && seg.length === 2) view = viewPundit(seg[1]);
    else if (seg[0] === 'polls' && seg.length === 1) view = viewPolls();
    else if (seg[0] === 'states' && seg.length === 1) view = viewStates();
    else { view = viewNotFound(); nav = null; }
    return { view: view, nav: nav, seg: seg };
  }

  var first = true;
  function render() {
    closeDrawer();
    var r = route();
    var main = document.getElementById('main');
    main.textContent = '';
    main.appendChild(r.view);
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (a) {
      if (a.getAttribute('data-nav') === r.nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    var h1 = main.querySelector('h1');
    var name = h1 ? h1.textContent : '';
    document.title = !r.seg.length ? DATA.meta.title : name + ', ' + DATA.meta.title;
    layoutRails();
    if (!first) {
      window.scrollTo(0, 0);
      if (h1) h1.focus({ preventScroll: true });
    }
    first = false;
  }

  function fail(err) {
    var main = document.getElementById('main');
    main.textContent = '';
    main.appendChild(h('div', { class: 'view view-plain' },
      h('h1', { class: 'title' }, 'The data did not load'),
      h('p', { class: 'dek' }, 'Open the built page, dist/index.html, or serve the repository folder over http and open src/index.html from there.'),
      h('p', { class: 'meta' }, String(err && err.message || err))));
  }

  function start() {
    initTheme();
    initDrawer();
    loadData().then(function (d) {
      DATA = d;
      DATA.portraits = DATA.portraits || {};
      index();
      chrome();
      render();
      window.addEventListener('hashchange', render);
      var t;
      window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(layoutRails, 120); });
    }).catch(fail);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
