import { TOOLS, SUPPORTED_VERSIONS, DISCOVERY_PER_MIN, MAX_BODY_BYTES, SERVER_INFO, instructions } from './mcp.js';
import { VERSION, MAX_NESTING } from './validate.js';

// Glama connector ownership claim, served at /.well-known/glama.json. Set your own glama.ai claim token as the GLAMA_CLAIM Worker secret (or replace the placeholder, if present).
export const GLAMA_CLAIM = '<GLAMA_CLAIM_TOKEN>';
export const glamaJson = () => JSON.stringify({ $schema: 'https://glama.ai/mcp/schemas/connector.json', claim: GLAMA_CLAIM });
export const CONTACT = 'digitalpromohub.support@gmail.com';
export const ATTRIBUTION = 'Language, script and region codes follow the public ISO 639, ISO 15924 and ISO 3166-1 standards. HrefGate is not affiliated with or endorsed by Google or any search engine.';
export const mcpClientConfig = (origin) => ({ mcpServers: { hrefgate: { type: 'http', url: `${origin}/mcp` } } });

export const llmsTxt = (origin, L) => `# HrefGate

> Lint hreflang annotations for international SEO: language/script/region codes, x-default, self-reference, canonical conflicts, duplicates and reciprocal return links across a set of pages. Paste page HTML, a sitemap or a JSON set, never a URL (HrefGate never fetches URLs). Free paste tool, JSON API and a remote MCP server for AI agents.

## For AI agents

- [MCP server](${origin}/mcp): remote MCP over Streamable HTTP (POST only, stateless, JSON responses). Protocol versions: ${SUPPORTED_VERSIONS.join(', ')}. Tool \`${TOOLS[0].name}\` (input: page HTML, sitemap XML or JSON set; optional page_url, include_raw). Read-only. Client config (most MCP clients accept this; some use a different format, for example VS Code uses a \`servers\` key): \`${JSON.stringify(mcpClientConfig(origin))}\`
- [OpenAPI 3.1 spec](${origin}/openapi.json): machine-readable description of the JSON API
- [MCP server card](${origin}/.well-known/mcp/server-card.json): static description of the MCP server and its tool

## JSON API

- \`POST ${origin}/api/lint\`: body is raw page HTML, sitemap XML or a JSON set \`{"pages":[{"url","canonical"?,"alternates":[{"hreflang","href"}]}]}\` (any content type), or the wrapper \`{"input": "<text>", "page_url"?: "<url>"}\`. Optional query \`?page_url=\` (absolute URL of pasted HTML; never fetched). Max ${MAX_BODY_BYTES} bytes. Response: { valid, summary { errors, warnings, infos, pages, alternates, codes, source }, issues [ { level, code, path, message, suggestion? } ], truncated, meta }. Errors: { "error": { "code", "message" } } with 400 invalid_input (empty input, bad page_url, or brackets nested deeper than ${MAX_NESTING} levels; rejected before any quota is used), 404 not_found, 405 method_not_allowed, 413 too_large, 429 rate_limited / daily_limit.
- \`GET ${origin}/api/health\`: { ok, version, day }.

## Limits, keys and pricing

- Free, no key. About ${L.anonPerMin} checks/min per IP and a shared pool of about ${L.dailyPool} checks per UTC day. The MCP endpoint uses the same counters: each \`tools/call\` is one check. Non-check MCP messages don't count as checks, but are capped at about ${DISCOVERY_PER_MIN}/min per IP (HTTP 429 + Retry-After).
- Submitted content is processed in memory only and never stored or logged.

## Optional

- [Privacy](${origin}/#privacy)
- [Terms](${origin}/terms)
- Attribution: ${ATTRIBUTION}
- Contact: ${CONTACT}
`;

const err = (desc) => ({ description: desc, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const rpc = (desc) => ({ description: desc, content: { 'application/json': { schema: { type: 'object', description: 'JSON-RPC 2.0 response (or batch array)' } } } });

export function openApiSpec(origin, L) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'HrefGate', version: VERSION,
      description: `Lint hreflang annotations (codes, x-default, self-reference, canonical, duplicates, return links). Never fetches URLs. Free: about ${L.anonPerMin}/min per IP, shared daily pool about ${L.dailyPool}. ${ATTRIBUTION}`,
      contact: { email: CONTACT },
    },
    servers: [{ url: origin }],
    paths: {
      '/api/lint': {
        post: {
          operationId: 'lintHreflang', summary: 'Lint hreflang annotations in page HTML, a sitemap or a JSON set',
          parameters: [{ name: 'page_url', in: 'query', required: false, description: 'Absolute http(s) URL of the pasted HTML page (never fetched)', schema: { type: 'string', maxLength: 2048, pattern: '^https?://' } }],
          requestBody: { required: true, content: {
            'application/xml': { schema: { type: 'string', maxLength: MAX_BODY_BYTES } },
            'text/html': { schema: { type: 'string', maxLength: MAX_BODY_BYTES } },
            'text/plain': { schema: { type: 'string', maxLength: MAX_BODY_BYTES } },
            'application/json': { schema: { oneOf: [{ type: 'object', properties: { input: { type: 'string', maxLength: MAX_BODY_BYTES }, page_url: { type: 'string', maxLength: 2048 } }, required: ['input'], additionalProperties: false }, { type: 'object', description: 'JSON set {"pages":[{"url","canonical","alternates":[{"hreflang","href"}]}]}' }] } },
          } },
          responses: {
            200: { description: 'Lint report', headers: { 'X-HrefGate-Quota-Remaining': { schema: { type: 'string' }, description: 'Approximate checks left in the shared daily pool' } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/Report' } } } },
            400: err(`invalid_input: empty input, bad page_url, or JSON nested deeper than ${MAX_NESTING} levels (rejected before rate limits or the daily pool are charged)`), 413: err('too_large'),
            429: { ...err('rate_limited or daily_limit'), headers: { 'Retry-After': { schema: { type: 'string' } } } },
            500: err('internal_error'),
          },
        },
        get: { operationId: 'lintGetNotAllowed', summary: 'Not supported (content must not go in URLs)', responses: { 405: err('method_not_allowed') } },
      },
      '/.well-known/mcp/server-card.json': { get: { operationId: 'serverCard', summary: 'Static MCP server card (same tools as tools/list)', responses: { 200: { description: 'Server card', content: { 'application/json': { schema: { type: 'object' } } } } } } },
      '/api/health': { get: { operationId: 'health', summary: 'Health and version', responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, version: { type: 'string' }, day: { type: 'string' } } } } } } } } },
      '/mcp': {
        post: {
          operationId: 'mcp', summary: 'Remote MCP server (JSON-RPC 2.0 over Streamable HTTP, stateless)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: 'JSON-RPC 2.0 request, notification or batch (max 10, at most one tools/call)' } } } },
          responses: { 200: rpc('JSON-RPC result'), 202: { description: 'Notification or client response accepted (empty body)' }, 400: rpc('Parse error, invalid request or protocol/header mismatch'), 403: rpc('Origin not allowed'), 404: rpc('Method not found (2026-07-28 requests)'), 413: rpc('Body too large'), 429: rpc('Too many MCP requests (Retry-After)'), 500: { description: 'Internal error' } },
        },
        get: { operationId: 'mcpGet', summary: 'Not supported (no SSE stream)', responses: { 405: { description: 'Method not allowed', headers: { Allow: { schema: { type: 'string', const: 'POST, OPTIONS' } } } } } },
        delete: { operationId: 'mcpDelete', summary: 'Not supported (no sessions)', responses: { 405: { description: 'Method not allowed', headers: { Allow: { schema: { type: 'string', const: 'POST, OPTIONS' } } } } } },
      },
    },
    components: {
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string', enum: ['invalid_input', 'too_large', 'rate_limited', 'daily_limit', 'method_not_allowed', 'not_found', 'internal_error'] }, message: { type: 'string' } }, required: ['code', 'message'] } }, required: ['error'] },
        Issue: { type: 'object', properties: { level: { type: 'string', enum: ['error', 'warning', 'info'] }, code: { type: 'string' }, path: { type: 'string' }, message: { type: 'string' }, suggestion: { type: 'string' } }, required: ['level', 'code', 'path', 'message'] },
        Report: { type: 'object', properties: {
          valid: { type: 'boolean' },
          summary: { type: 'object', properties: { errors: { type: 'integer' }, warnings: { type: 'integer' }, infos: { type: 'integer' }, pages: { type: 'integer' }, alternates: { type: 'integer' }, codes: { type: 'array', items: { type: 'string' } }, source: { type: 'string', enum: ['json', 'html', 'sitemap'] } } },
          issues: { type: 'array', items: { $ref: '#/components/schemas/Issue' } },
          truncated: { type: 'boolean' },
          meta: { type: 'object', properties: { version: { type: 'string' }, fetchesUrls: { type: 'boolean', const: false } } },
        }, required: ['valid', 'summary', 'issues', 'meta'] },
      },
    },
  };
}

/** Static MCP server card (SEP-1649 shape; Smithery scan fallback). Generated from the same TOOLS as tools/list. */
export function serverCard(origin, L) {
  return {
    serverInfo: SERVER_INFO,
    description: `Lint hreflang annotations: language/region codes, x-default, self-reference, canonical conflicts, duplicates and return links. Paste HTML, a sitemap or a JSON set; never fetches URLs. Free: about ${L.anonPerMin} checks per minute per IP.`,
    homepage: `${origin}/`,
    contact: { email: CONTACT },
    transport: { type: 'streamable-http', url: `${origin}/mcp` },
    protocolVersions: SUPPORTED_VERSIONS,
    capabilities: { tools: { listChanged: false } },
    authentication: { required: false },
    instructions: instructions(L.anonPerMin),
    tools: TOOLS,
  };
}
