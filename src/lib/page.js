import { ATTRIBUTION, CONTACT } from './agentdocs.js';
import { VERSION } from './validate.js';

export const FAVICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0f766e"/><text x="16" y="22" font-family="monospace" font-size="14" fill="#fff" text-anchor="middle">hl</text></svg>';
const SAMPLE = '<link rel="canonical" href="https://example.com/en/">\n<link rel="alternate" hreflang="en" href="https://example.com/en/">\n<link rel="alternate" hreflang="en-UK" href="https://example.com/uk/">\n<link rel="alternate" hreflang="de" href="/de/">\n<link rel="alternate" hreflang="jp" href="https://example.com/ja/">';
export const CANONICAL = 'https://hrefgate.mike-tusa.workers.dev/';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const homepage = (L) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>HrefGate: free hreflang checker and linter</title>
<meta name="description" content="Paste page HTML, a sitemap or a JSON set and check hreflang codes, x-default, self-reference, canonical conflicts and return links. Free, no sign-up, nothing stored. JSON API and MCP server for AI agents.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${CANONICAL}">
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
<link rel="service-desc" type="application/json" href="/openapi.json" title="OpenAPI 3.1">
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#111;background:#f8fafc}.wrap{max-width:860px;margin:0 auto;padding:16px}
h1{font-size:1.6rem;margin:.4em 0}textarea{width:100%;box-sizing:border-box;min-height:260px;font:13px/1.4 ui-monospace,monospace;padding:8px;border:1px solid #cbd5e1;border-radius:6px}
button{background:#0f766e;color:#fff;border:0;border-radius:6px;padding:10px 18px;font-size:1rem;cursor:pointer}
.small{font-size:.85rem;color:#475569}pre{background:#0f172a;color:#e2e8f0;padding:10px;border-radius:6px;overflow-x:auto}
.iss{border-left:4px solid #94a3b8;padding:4px 8px;margin:6px 0;background:#fff}.error{border-color:#dc2626}.warning{border-color:#d97706}.info{border-color:#2563eb}
code{font-family:ui-monospace,monospace;word-break:break-word}footer{border-top:1px solid #e2e8f0;margin-top:24px}
@media (max-width:560px){#mcp-config{white-space:pre-wrap;word-break:break-all}}
</style></head><body>
<main class="wrap">
<h1>HrefGate</h1>
<p>Paste the HTML of a page (its <code>&lt;link rel="alternate" hreflang&gt;</code> tags), an XML sitemap with <code>xhtml:link</code> alternates, or a JSON set of pages, and HrefGate checks: language, script and region codes (<code>en-UK</code>, <code>en_US</code>, <code>jp</code> and other common mistakes, with fixes), absolute hrefs, duplicate and conflicting codes, <code>x-default</code>, self-reference, <code>rel="canonical"</code> conflicts, and reciprocal return links. HrefGate never fetches URLs, and nothing you paste is stored or logged.</p>
<form id="f"><label for="in" class="small">Page HTML, sitemap XML or JSON set (max ${Math.round(L.maxBytes / 1024)} KB)</label>
<textarea id="in" spellcheck="false">${esc(SAMPLE)}</textarea>
<p><label for="pu" class="small">Page URL of pasted HTML (optional, enables self-reference and canonical checks; never fetched)</label><br><input id="pu" type="url" maxlength="2048" value="https://example.com/en/" style="width:100%;box-sizing:border-box;padding:6px;border:1px solid #cbd5e1;border-radius:6px"></p>
<p><button type="submit">Check hreflang</button> <span id="st" class="small" role="status"></span></p></form>
<div id="out" aria-live="polite"></div>

<section id="api"><h2>JSON API</h2>
<pre><code>curl -s -X POST 'https://hrefgate.mike-tusa.workers.dev/api/lint?page_url=https://example.com/en/' \\
  -H 'content-type: text/html' --data-binary @page.html</code></pre>
<p class="small">Also accepts a sitemap or <code>{"pages":[{"url","canonical","alternates":[{"hreflang","href"}]}]}</code> to check return links across pages. Free, no key: about ${L.anonPerMin} checks per minute per IP. <a href="/openapi.json">OpenAPI 3.1 spec</a></p></section>

<section id="agents"><h2>For AI agents (MCP)</h2>
<p>HrefGate is also a remote <a href="https://modelcontextprotocol.io/" target="_blank" rel="noopener noreferrer">Model Context Protocol</a> (MCP) server. Most MCP clients accept this config; some use a different format (for example, VS Code uses a <code>servers</code> key). Clients with a settings screen just need the URL <code>https://hrefgate.mike-tusa.workers.dev/mcp</code>.</p>
<pre><code id="mcp-config">{ "mcpServers": { "hrefgate": { "type": "http", "url": "https://hrefgate.mike-tusa.workers.dev/mcp" } } }</code></pre>
<p class="small">Machine-readable docs: <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">OpenAPI 3.1 spec</a></p></section>

<section id="privacy"><h2>Privacy</h2>
<p class="small">Submitted content is checked in memory and discarded. It is never written to storage or logs, and HrefGate never fetches URLs (including page_url). For rate limits and an anonymous daily visitor count we use a one-way hash of your network address and the date; the address itself is not stored and the hash expires after 9 days.</p></section>
</main>
<footer class="wrap small"><p>${esc(ATTRIBUTION)}</p>
<p>HrefGate v${VERSION} · <a href="/terms">Terms</a> · <a href="/#privacy">Privacy</a> · Contact: ${CONTACT}</p></footer>
<script>
document.getElementById('mcp-config').textContent = JSON.stringify({ mcpServers: { hrefgate: { type: 'http', url: location.origin + '/mcp' } } }, null, 2);
const f = document.getElementById('f'), out = document.getElementById('out'), st = document.getElementById('st');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; };
f.addEventListener('submit', async (ev) => {
  ev.preventDefault(); st.textContent = 'Checking…'; out.replaceChildren();
  try {
    const r = await fetch('/api/lint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ input: document.getElementById('in').value }, document.getElementById('pu').value.trim() ? { page_url: document.getElementById('pu').value.trim() } : {})) });
    const j = await r.json();
    if (!r.ok) { st.textContent = ''; out.append(el('p', 'iss error', (j.error && j.error.message) || 'Error')); return; }
    const s = j.summary; st.textContent = '';
    out.append(el('h2', '', (j.valid ? 'Valid' : 'Invalid') + ': ' + s.errors + ' error(s), ' + s.warnings + ' warning(s), ' + s.infos + ' info'));
    out.append(el('p', 'small', 'Codes: ' + (s.codes.join(', ') || 'none') + ' · pages: ' + s.pages + ' · alternates: ' + s.alternates));
    for (const i of j.issues) { const d = el('div', 'iss ' + i.level, ''); d.append(el('strong', '', i.level.toUpperCase() + ' '), el('code', '', i.path), el('div', '', i.message)); if (i.suggestion) d.append(el('div', 'small', 'Suggested: ' + i.suggestion)); out.append(d); }
  } catch { st.textContent = 'Request failed.'; }
});
</script></body></html>`;

export const termsPage = () => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Terms of use · HrefGate</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="canonical" href="${CANONICAL}terms">
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#111;background:#f8fafc}.wrap{max-width:760px;margin:0 auto;padding:16px}</style></head><body>
<main class="wrap"><h1>Terms of use</h1>
<p>HrefGate is a free tool provided as is, without warranty of any kind. Results are automated suggestions about hreflang markup; check them before relying on them. HrefGate is not affiliated with or endorsed by Google or any search engine, and does not guarantee indexing or ranking outcomes.</p>
<p>Fair use: free use is rate-limited (per minute per IP and a shared daily pool). Don't attempt to bypass limits or overload the service. Access may be limited or withdrawn at any time.</p>
<p>Privacy: content you submit is checked in memory and never stored or logged, and HrefGate never fetches URLs. See <a href="/#privacy">Privacy</a>.</p>
<p>These terms may change; the current version is always at this page. Contact: ${CONTACT}</p>
<p><a href="/">Back to HrefGate</a> · v${VERSION}</p></main></body></html>`;
