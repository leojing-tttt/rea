/**
 * Per-platform router: HTTP when the platform has a callable relay/baseUrl
 * and a real vault secret; otherwise the mock adapter.
 * The secret is resolved here and passed only into fetchRaw memory.
 */

const { vault } = require('../api-mgmt/vault');
const { createMockAdapter } = require('./mock-adapter');
const { createHttpAdapter, shouldUseLiveHttp } = require('./http-adapter');

function createPerPlatformAdapter(opts = {}) {
  const mock =
    opts.mockAdapter ||
    createMockAdapter({
      platformCatalog: opts.platformCatalog,
      delayMs: opts.delayMs,
      failKinds: opts.failKinds,
      failRemaining: opts.failRemaining,
    });
  const http =
    opts.httpAdapter ||
    createHttpAdapter({
      platformCatalog: opts.platformCatalog,
      fetchImpl: opts.fetchImpl,
      timeoutMs: opts.timeoutMs,
    });

  function resolve(credentialRef) {
    if (!credentialRef) return null;
    try {
      if (typeof opts.resolveCredentials === 'function') return opts.resolveCredentials(credentialRef);
      return vault.resolveCredentials(credentialRef);
    } catch (_) {
      return null;
    }
  }

  return {
    id: 'per-platform',
    async fetchRaw(ctx) {
      const resolved = resolve(ctx.credential_ref);
      const apiKey = ctx.apiKey || (resolved && resolved.apiKey) || null;
      const baseUrl = ctx.baseUrl || (resolved && resolved.baseUrl) || null;
      const relay = ctx.relay || (resolved && resolved.relay) || null;
      const model = ctx.model || (resolved && resolved.model) || null;
      if (shouldUseLiveHttp({ baseUrl, relay, apiKey })) {
        return http.fetchRaw({
          ...ctx,
          apiKey,
          baseUrl,
          relay,
          model,
        });
      }
      return mock.fetchRaw(ctx);
    },
  };
}

module.exports = { createPerPlatformAdapter };
