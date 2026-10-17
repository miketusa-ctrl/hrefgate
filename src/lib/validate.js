/**
 * HrefGate hreflang linter. Pure function: no I/O, never fetches URLs. Input is pasted text:
 *  - HTML of one page (<link rel="alternate" hreflang> + <link rel="canonical">), optionally with page_url, or
 *  - an XML sitemap with <xhtml:link rel="alternate" hreflang> entries (each <url><loc> is a page), or
 *  - a JSON set: {"pages":[{"url":"https://…/en/","canonical":"…","alternates":[{"hreflang":"en","href":"…"}]}]}.
 * Checks: code validity (ISO 639 language, ISO 15924 script, ISO 3166 region, x-default), absolute URLs, duplicates,
 * conflicting codes, self-reference, x-default, canonical conflicts, reciprocal return links within the set.
 */
import { LANG2, LANG3, REGIONS, REGION_FIXES, LANG_FIXES, SCRIPTS } from './codes.js';

export const VERSION = '0.1.2';
export const MAX_INPUT_BYTES = 64 * 1024;
export const MAX_NESTING = 32;
export const MAX_PAGES = 200;
export const MAX_ALTERNATES = 2000;
export const MAX_ISSUES = 200;

const clip = (s, n = 160) => { s = String(s); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** Max bracket depth outside JSON strings (cheap pre-check before JSON.parse). */
export function maxNesting(text) {
  let d = 0, max = 0, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inStr) { if (esc) esc = false; else if (c === 92) esc = true; else if (c === 34) inStr = false; continue; }
    if (c === 34) inStr = true; else if (c === 123 || c === 91) { if (++d > max) max = d; } else if (c === 125 || c === 93) d--;
  }
  return max;
}

/** Validate one hreflang value. Returns { ok, level?, code?, message?, suggestion? }. */
export function checkCode(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return { ok: false, level: 'error', code: 'empty_hreflang', message: 'hreflang is empty.' };
  if (v.toLowerCase() === 'x-default') return { ok: true, norm: 'x-default' };
  if (v.includes('_')) {
    const s = v.replace(/_/g, '-');
    return { ok: false, level: 'error', code: 'underscore', message: `"${clip(v, 40)}" uses "_"; hreflang uses "-".`, suggestion: checkCode(s).ok ? s : undefined };
  }
  const parts = v.split('-');
  const lang = parts[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) return { ok: false, level: 'error', code: 'invalid_language', message: `"${clip(v, 40)}" does not start with an ISO 639 language code.` };
  if (lang.length === 2 && !LANG2.has(lang)) {
    const fix = LANG_FIXES[lang];
    if (REGIONS.has(lang.toUpperCase()) && parts.length === 1) return { ok: false, level: 'error', code: 'region_only', message: `"${v}" looks like a region on its own; hreflang must start with a language (for example "${fix || 'en'}-${lang.toUpperCase()}").`, suggestion: fix ? `${fix}-${lang.toUpperCase()}` : undefined };
    return { ok: false, level: 'error', code: 'invalid_language', message: `"${clip(v, 40)}": "${lang}" is not an ISO 639-1 language code.`, suggestion: fix ? [fix, ...parts.slice(1)].join('-') : undefined };
  }
  let i = 1, script, region;
  if (parts[i] && /^[A-Za-z]{4}$/.test(parts[i])) { script = parts[i][0].toUpperCase() + parts[i].slice(1).toLowerCase(); i++; }
  if (parts[i] !== undefined) { region = parts[i]; i++; }
  if (parts.length > i) return { ok: false, level: 'error', code: 'invalid_hreflang', message: `"${clip(v, 40)}" has too many subtags; use language, optional script, optional region (e.g. "zh-Hant-TW").` };
  const warnings = [];
  if (script && !SCRIPTS.has(script)) warnings.push({ level: 'warning', code: 'unknown_script', message: `"${script}" is not a common ISO 15924 script code.` });
  if (region !== undefined) {
    if (/^\d{3}$/.test(region)) return { ok: false, level: 'error', code: 'numeric_region', message: `"${v}": numeric UN M.49 regions (e.g. 419) are not supported by Google for hreflang. Use country codes.` };
    const R = region.toUpperCase();
    if (!/^[A-Z]{2}$/.test(R)) return { ok: false, level: 'error', code: 'invalid_region', message: `"${clip(v, 40)}": "${clip(region, 20)}" is not a 2-letter ISO 3166-1 region code.` };
    if (!REGIONS.has(R)) {
      const fix = REGION_FIXES[R];
      return { ok: false, level: 'error', code: 'invalid_region', message: `"${v}": "${R}" is not an ISO 3166-1 alpha-2 region${R === 'UK' ? ' (the United Kingdom is "GB")' : ''}.`, suggestion: fix ? [lang, ...(script ? [script] : []), fix].join('-') : undefined };
    }
  }
  if (lang.length === 3 && !LANG3.has(lang)) warnings.push({ level: 'info', code: 'unverified_language', message: `"${lang}" is a 3-letter code not in HrefGate's list; check it is a valid ISO 639-2/3 code.` });
  const norm = [lang, ...(script ? [script] : []), ...(region ? [region.toUpperCase()] : [])].join('-');
  return { ok: true, norm, warnings };
}

function absUrl(href, base) {
  try { const u = new URL(href); if (u.protocol === 'http:' || u.protocol === 'https:') return { abs: true, url: normUrl(u) }; return { abs: false }; } catch { /* relative */ }
  if (base) { try { return { abs: false, url: normUrl(new URL(href, base)) }; } catch { /* bad */ } }
  return { abs: false };
}
function normUrl(u) { u.hash = ''; return u.href; }

export const MAX_TAG_LEN = 4096;
const ATTR_RE = {};
const attr = (tag, name) => {
  const re = ATTR_RE[name] ??= new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = re.exec(tag); // tag is at most MAX_TAG_LEN chars, so this stays bounded
  return m ? (m[1] ?? m[2] ?? m[3]).replace(/&amp;/g, '&').trim() : null;
};

/**
 *  Linear scan for tags named one of `names` (lowercase) in text[from, to). Calls fn(tagText) for each; fn returning
 * false stops. Each '>' lookup is cached, so total work is O(n) even for 64 KB of unclosed "<link " openers.
 */
export function scanTags(text, names, fn, from = 0, to = text.length) {
  let pos = from, gt = -2;
  while (pos < to) {
    const lt = text.indexOf('<', pos);
    if (lt < 0 || lt >= to) return;
    let name = null;
    for (const n of names) {
      if (text.substr(lt + 1, n.length).toLowerCase() === n) {
        const c = text.charCodeAt(lt + 1 + n.length);
        if (Number.isNaN(c) || c === 62 || c === 47 || c === 32 || c === 9 || c === 10 || c === 13 || c === 12) { name = n; break; }
      }
    }
    if (!name) { pos = lt + 1; continue; }
    if (gt !== -1 && gt < lt) gt = text.indexOf('>', lt);
    if (gt === -1 || gt >= to) return; // no closing '>' anywhere after: no later tag can close either
    if (gt - lt > MAX_TAG_LEN) { pos = lt + 1; continue; } // oversized tag: skip opener; cached gt keeps this linear
    if (fn(text.slice(lt, gt + 1)) === false) return;
    pos = gt + 1;
  }
}

function parseHtml(text, pageUrl) {
  const alternates = []; let canonical = null, canonicalCount = 0; let base = null;
  scanTags(text, ['base'], (tag) => { base = attr(tag, 'href'); return false; });
  scanTags(text, ['link'], (tag) => {
    const rel = (attr(tag, 'rel') || '').toLowerCase().split(/\s+/);
    if (rel.includes('canonical')) { canonicalCount++; canonical ??= attr(tag, 'href'); }
    if (rel.includes('alternate')) { const h = attr(tag, 'hreflang'); if (h !== null) alternates.push({ hreflang: h, href: attr(tag, 'href') || '' }); }
    return alternates.length <= MAX_ALTERNATES;
  });
  return [{ url: pageUrl || null, canonical, canonicalCount, alternates, base }];
}

/** Sitemap: linear indexOf scan for <url>…</url> blocks. */
function parseSitemap(text) {
  const pages = []; const low = text.toLowerCase();
  let pos = 0, close = -2, alts = 0;
  while (pages.length <= MAX_PAGES) {
    const o = low.indexOf('<url', pos); if (o < 0) break;
    const c = low.charCodeAt(o + 4);
    if (!(c === 62 || c === 32 || c === 9 || c === 10 || c === 13)) { pos = o + 4; continue; } // <urlset> etc.
    if (close !== -1 && close < o) close = low.indexOf('</url>', o);
    if (close === -1) break;
    const start = low.indexOf('>', o); if (start < 0 || start > close) { pos = o + 4; continue; }
    const ls = low.indexOf('<loc>', start), le = ls >= 0 && ls < close ? low.indexOf('</loc>', ls) : -1;
    const loc = le >= 0 && le < close ? text.slice(ls + 5, le).trim().replace(/&amp;/g, '&') : null;
    const alternates = [];
    scanTags(text, ['xhtml:link', 'link'], (tag) => { const h = attr(tag, 'hreflang'); if (h !== null) { alternates.push({ hreflang: h, href: attr(tag, 'href') || '' }); alts++; } return alts <= MAX_ALTERNATES; }, start + 1, close);
    pages.push({ url: loc, canonical: null, canonicalCount: 0, alternates, sitemap: true });
    pos = close + 6;
  }
  return pages;
}

function parseJson(obj) {
  const list = Array.isArray(obj) ? obj : obj && Array.isArray(obj.pages) ? obj.pages : null;
  if (!list) return { error: 'JSON input must be {"pages":[…]} or an array of pages ({url, canonical?, alternates:[{hreflang, href}]}).' };
  const pages = [];
  for (const p of list.slice(0, MAX_PAGES + 1)) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: 'Each page must be an object {url, canonical?, alternates}.' };
    const alts = Array.isArray(p.alternates) ? p.alternates : [];
    pages.push({ url: typeof p.url === 'string' ? p.url : null, canonical: typeof p.canonical === 'string' ? p.canonical : null, canonicalCount: typeof p.canonical === 'string' ? 1 : 0,
      alternates: alts.slice(0, MAX_ALTERNATES).map((a) => ({ hreflang: String(a?.hreflang ?? ''), href: String(a?.href ?? '') })) });
  }
  return { pages };
}

/** Lint pasted input. opts.pageUrl = the URL of the pasted HTML page (optional, enables self/canonical checks). */
export function validate(input, opts = {}) {
  const issues = []; let total = { error: 0, warning: 0, info: 0 }; let truncated = false;
  const add = (level, code, path, message, suggestion) => {
    total[level]++;
    if (issues.length >= MAX_ISSUES) { truncated = true; return; }
    issues.push({ level, code, path, message: clip(message, 300), ...(suggestion ? { suggestion: clip(suggestion, 120) } : {}) });
  };
  const t = input.trim();
  let pages, source;
  if (t.startsWith('{') || t.startsWith('[')) {
    let obj; try { obj = JSON.parse(t); } catch { obj = undefined; }
    if (obj === undefined) { add('error', 'invalid_json', '$', 'Input looks like JSON but does not parse.'); return report([], issues, total, truncated, 'json'); }
    const r = parseJson(obj); if (r.error) { add('error', 'invalid_input', '$', r.error); return report([], issues, total, truncated, 'json'); }
    pages = r.pages; source = 'json';
  } else if (/<urlset[\s>]/i.test(t)) { pages = parseSitemap(t); source = 'sitemap'; }
  else { pages = parseHtml(t, opts.pageUrl); source = 'html'; }
  if (pages.length > MAX_PAGES) { pages = pages.slice(0, MAX_PAGES); add('warning', 'too_many_pages', '$', `Only the first ${MAX_PAGES} pages were checked.`); }

  const urlIndex = new Map(); // normalized page URL → page index
  pages.forEach((p, i) => {
    if (p.url) { const a = absUrl(p.url); if (a.abs) { p.norm = a.url; if (urlIndex.has(a.url)) add('warning', 'duplicate_page', `pages[${i}]`, `Page ${clip(p.url)} appears more than once.`); else urlIndex.set(a.url, i); } else add('error', 'relative_page_url', `pages[${i}].url`, `Page URL must be absolute http(s): ${clip(p.url)}`); }
  });

  let altCount = 0; const codesSeen = new Set();
  pages.forEach((p, i) => {
    const pp = source === 'html' ? 'page' : `pages[${i}]`;
    p.targets = new Map(); // normalized href → set of codes
    if (!p.alternates.length) { add(source === 'html' ? 'error' : 'warning', 'no_hreflang', pp, 'No hreflang annotations found.'); return; }
    const byCode = new Map(); const validCodes = new Set();
    p.alternates.forEach((a, j) => {
      altCount++;
      const ap = `${pp}.alternates[${j}]`;
      const c = checkCode(a.hreflang);
      if (!c.ok) add(c.level, c.code, ap, c.message, c.suggestion);
      else for (const w of c.warnings || []) add(w.level, w.code, ap, w.message);
      if (c.ok && c.norm !== a.hreflang.trim() && c.norm.toLowerCase() === a.hreflang.trim().toLowerCase()) { /* case-only difference: fine */ }
      const code = c.ok ? c.norm.toLowerCase() : a.hreflang.trim().toLowerCase();
      if (c.ok) { codesSeen.add(c.norm); validCodes.add(code); }
      if (!a.href) { add('error', 'missing_href', ap, `hreflang="${clip(a.hreflang, 40)}" has no href.`); return; }
      const u = absUrl(a.href, p.base || p.norm);
      if (!u.abs) add('error', 'relative_href', ap, `href must be an absolute URL including https://: ${clip(a.href)}`, u.url);
      const href = u.url || a.href;
      if (byCode.has(code)) {
        if (byCode.get(code) !== href) add('error', 'conflicting_hreflang', ap, `hreflang="${clip(a.hreflang, 40)}" points to two different URLs (${clip(byCode.get(code), 100)} and ${clip(href, 100)}).`);
        else add('warning', 'duplicate_hreflang', ap, `hreflang="${clip(a.hreflang, 40)}" is listed twice for the same URL.`);
      } else byCode.set(code, href);
      if (!p.targets.has(href)) p.targets.set(href, new Set());
      p.targets.get(href).add(code);
    });
    // language-only fallback hint: has en-GB/en-US but no "en"
    const langsWithRegion = new Set([...validCodes].filter((k) => k.includes('-') && k !== 'x-default').map((k) => k.split('-')[0]));
    for (const l of langsWithRegion) if (!byCode.has(l)) add('info', 'no_language_fallback', pp, `Regional "${l}-…" variants exist but no plain "${l}" fallback; users of "${l}" in other regions get no match.`);
    if (!byCode.has('x-default')) add('warning', 'missing_x_default', pp, 'No x-default alternate. Add one for users whose language/region matches none of the listed versions.');
    if (p.norm) {
      if (!p.targets.has(p.norm)) add('error', 'missing_self_reference', pp, `The page (${clip(p.norm)}) does not list itself as an alternate. Each page must include a self-referencing hreflang.`);
    } else if (source === 'html') add('info', 'self_reference_unchecked', pp, 'Pass page_url to check the self-reference, canonical and return links for this page.');
    if (p.canonicalCount > 1) add('error', 'multiple_canonicals', pp, `${p.canonicalCount} rel="canonical" tags found; keep exactly one.`);
    if (p.canonical) {
      const cu = absUrl(p.canonical, p.base || p.norm);
      if (!cu.abs) add('warning', 'relative_canonical', pp, `Canonical should be an absolute URL: ${clip(p.canonical)}`);
      const c = cu.url;
      if (c && p.norm && c !== p.norm) add('error', 'canonical_conflict', pp, `Canonical points to ${clip(c)}, not this page. Google ignores hreflang on non-canonical pages; hreflang should sit on (and point to) canonical URLs.`);
      if (c) for (const [i2, q] of pages.entries()) if (q !== p && q.norm === c && p.norm) add('warning', 'canonical_to_alternate', pp, `Canonical points to another language version (pages[${i2}]). Each language version should be self-canonical.`);
    }
  });

  // Reciprocity: for each page A → target B that is in the set, B must list A.
  if (pages.length > 1 || source !== 'html') {
    pages.forEach((p, i) => {
      if (!p.norm) return;
      for (const href of p.targets.keys()) {
        if (href === p.norm || !urlIndex.has(href)) continue;
        const j = urlIndex.get(href), q = pages[j];
        if (!q.alternates.length) continue;
        const back = q.targets.get(p.norm);
        if (!back || ![...back].some((c) => c !== 'x-default')) add('error', 'missing_return_link', `pages[${i}]`, `${clip(p.norm, 100)} links to ${clip(href, 100)}, but that page does not link back with a language code (no return tag; an x-default alone does not count). Google ignores unconfirmed pairs.`);
        else {
          const mine = [...p.targets.get(href)].filter((c) => c !== 'x-default'), theirs = [...(q.targets.get(href) || [])].filter((c) => c !== 'x-default');
          if (theirs.length && mine.length && !mine.some((c) => theirs.includes(c))) add('warning', 'inconsistent_code', `pages[${i}]`, `${clip(href, 100)} is labelled ${mine.join('/')} here but ${theirs.join('/')} on its own page.`);
        }
      }
    });
    pages.forEach((p, i) => { if (p.norm && p.alternates.length) for (const h of p.targets.keys()) if (!urlIndex.has(h) && pages.length > 1) { add('info', 'target_not_in_set', `pages[${i}]`, `${clip(h, 100)} is not in the submitted set, so its return links were not checked.`); break; } });
  }
  return report(pages, issues, total, truncated, source, altCount, [...codesSeen]);
}

function report(pages, issues, total, truncated, source, alternates = 0, codes = []) {
  return {
    valid: total.error === 0 && pages.length > 0,
    summary: { errors: total.error, warnings: total.warning, infos: total.info, pages: pages.length, alternates, codes: codes.slice(0, 200).sort(), source },
    issues, truncated,
    meta: { version: VERSION, fetchesUrls: false },
  };
}
