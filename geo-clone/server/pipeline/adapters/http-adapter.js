/**
 * OpenAI-compatible HTTP PlatformAdapter.
 * POST {baseUrl}/v1/chat/completions, or the configured relay URL as-is.
 * Bearer token is taken from the ephemeral credential handle and never logged.
 */

const { platforms: defaultCatalog } = require('../../mock-data');
const { AdapterError, KINDS } = require('./errors');

const DEFAULT_TIMEOUT_MS = 30_000;

function isRealSecret(apiKey) {
  if (apiKey == null) return false;
  const value = String(apiKey).trim();
  if (!value) return false;
  if (value.startsWith('mock-key:')) return false;
  return true;
}

function stripTrailingSlash(url) {
  return String(url).replace(/\/+$/, '');
}

function asHttpUrl(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch (_) {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/**
 * Relay (absolute http URL) wins and is posted exactly.
 * baseUrl gets /v1/chat/completions, unless it already ends in /v1 or the full path.
 */
function resolveHttpEndpoint({ baseUrl, relay } = {}) {
  const relayUrl = asHttpUrl(relay);
  if (relayUrl) return stripTrailingSlash(relayUrl);
  const base = asHttpUrl(baseUrl);
  if (!base) return null;
  const trimmed = stripTrailingSlash(base);
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function shouldUseLiveHttp({ baseUrl, relay, apiKey } = {}) {
  return Boolean(resolveHttpEndpoint({ baseUrl, relay }) && isRealSecret(apiKey));
}

function classifyTransport(input) {
  return shouldUseLiveHttp(input) ? 'live' : 'mock';
}

function redact(text, secret) {
  let out = text == null ? '' : String(text);
  if (secret) out = out.split(String(secret)).join('[redacted]');
  out = out.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  return out;
}

function httpError(kind, message, meta, secret) {
  const err = new AdapterError(kind, redact(message, secret).slice(0, 240), meta);
  err.adapterId = 'http';
  return err;
}

function kindForStatus(status) {
  if (status === 401 || status === 403) return KINDS.AUTH;
  if (status === 429) return KINDS.RATE_LIMITED;
  if (status >= 500 && status <= 599) return KINDS.TRANSIENT;
  return KINDS.UNKNOWN;
}

function retryAfterMs(header) {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return undefined;
}

function extractText(data) {
  if (!data || typeof data !== 'object') return '';
  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  if (choice) {
    const content = choice.message && choice.message.content;
    if (typeof content === 'string' && content.trim()) return content;
    if (Array.isArray(content)) {
      const joined = content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part.text === 'string') return part.text;
          return '';
        })
        .join('');
      if (joined.trim()) return joined;
    }
    if (typeof choice.text === 'string' && choice.text.trim()) return choice.text;
  }
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  if (typeof data.content === 'string' && data.content.trim()) return data.content;
  return '';
}

function errorText(data, raw, status) {
  const nested = data && data.error;
  if (nested && typeof nested.message === 'string' && nested.message.trim()) return nested.message;
  if (typeof nested === 'string' && nested.trim()) return nested;
  if (typeof raw === 'string' && raw.trim()) return raw.slice(0, 240);
  return `HTTP ${status}`;
}

function createHttpAdapter(opts = {}) {
  const catalog = opts.platformCatalog || defaultCatalog;
  const nameById = new Map(catalog.map((p) => [p.id, p.name]));
  const fetchImpl = opts.fetchImpl || globalThis.fetch.bind(globalThis);
  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;

  return {
    id: 'http',
    async fetchRaw(ctx) {
      const platformId = ctx.platformId;
      const apiKey = ctx.apiKey == null ? ctx.apiKey : String(ctx.apiKey).trim();
      const endpoint = resolveHttpEndpoint({ baseUrl: ctx.baseUrl, relay: ctx.relay });
      if (!endpoint) {
        throw httpError(KINDS.AUTH, 'missing http endpoint', { platformId }, apiKey);
      }
      if (!isRealSecret(apiKey)) {
        throw httpError(KINDS.AUTH, 'credential secret is not resolvable', { platformId }, apiKey);
      }
      if (endpoint.includes(String(apiKey))) {
        throw httpError(KINDS.AUTH, 'endpoint must not contain the credential', { platformId }, apiKey);
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      if (ctx.signal) {
        if (ctx.signal.aborted) controller.abort();
        else ctx.signal.addEventListener('abort', onAbort, { once: true });
      }

      const started = Date.now();
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'geo-clone-http-adapter',
          },
          body: JSON.stringify({
            model: ctx.model || platformId,
            messages: [{ role: 'user', content: String(ctx.prompt || '') }],
            stream: false,
          }),
        });
      } catch (err) {
        const aborted = controller.signal.aborted || (err && (err.name === 'AbortError' || err.name === 'TimeoutError'));
        const message = aborted ? 'http timeout' : (err && err.message) || 'http request failed';
        throw httpError(KINDS.TRANSIENT, message, { platformId }, apiKey);
      } finally {
        clearTimeout(timer);
        if (ctx.signal) ctx.signal.removeEventListener('abort', onAbort);
      }

      const status = response.status;
      if (status >= 300 && status < 400) {
        throw httpError(KINDS.TRANSIENT, `HTTP ${status} redirect not followed`, { platformId }, apiKey);
      }

      const rawBody = await response.text();
      let data = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch (_) {
        data = null;
      }

      if (status < 200 || status >= 300) {
        const kind = kindForStatus(status);
        throw httpError(kind, errorText(data, rawBody, status), {
          platformId,
          retryAfterMs: kind === KINDS.RATE_LIMITED ? retryAfterMs(response.headers.get('retry-after')) : undefined,
        }, apiKey);
      }

      const text = data ? extractText(data) : String(rawBody || '').trim();
      if (!text) {
        throw httpError(KINDS.PARSE_IRRELEVANT, 'empty completion', { platformId }, apiKey);
      }

      const requestIdHeader = response.headers.get('x-request-id');
      const requestId = requestIdHeader || (data && data.id) || null;

      return {
        platform: nameById.get(platformId) || String(platformId),
        platform_id: platformId,
        mode: ctx.modeId || 'web_fast',
        fetched_at: new Date().toISOString(),
        adapter: 'http',
        raw_text: redact(text, apiKey),
        latency_ms: Date.now() - started,
        http_status: status,
        request_id: requestId ? redact(String(requestId), apiKey) : null,
        task_id: ctx.task_id,
      };
    },
  };
}

module.exports = {
  isRealSecret,
  resolveHttpEndpoint,
  shouldUseLiveHttp,
  classifyTransport,
  createHttpAdapter,
  redact,
};
