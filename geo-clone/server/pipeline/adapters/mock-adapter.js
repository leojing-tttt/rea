/**
 * Mock PlatformAdapter — design §2.2 / §5.4.
 * No network / no AI keys. Deterministic raw text.
 */

const { buildRawText, hashSeed } = require('../mock-adapters-core');
const { AdapterError, KINDS } = require('./errors');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {{ platformCatalog?: Array, delayMs?: number, failKinds?: Record<string, string> }} [opts]
 */
function createMockAdapter(opts = {}) {
  const catalog = opts.platformCatalog || [];
  const nameById = new Map(catalog.map((p) => [p.id, p.name]));
  const delayMs = opts.delayMs != null ? opts.delayMs : 0;
  /** platformId → AdapterError.kind for test injection */
  const failKinds = opts.failKinds || {};
  /** how many times to fail before succeeding (per platformId) */
  const failRemaining = { ...opts.failRemaining };

  return {
    id: 'mock',
    /**
     * @param {{ task_id: string, prompt: string, brand?: string, platformId: string, modeId: string, platformIndex?: number }} ctx
     */
    async fetchRaw(ctx) {
      const platformId = ctx.platformId;
      const mode = ctx.modeId || 'web_fast';
      const platformName = nameById.get(platformId) || String(platformId);

      if (failRemaining[platformId] > 0) {
        failRemaining[platformId] -= 1;
        const kind = failKinds[platformId] || KINDS.TRANSIENT;
        throw new AdapterError(kind, `mock injected ${kind} for ${platformId}`, {
          platformId,
          retryAfterMs: kind === KINDS.RATE_LIMITED ? 30 : undefined,
        });
      }
      if (failKinds[platformId] && failRemaining[platformId] == null) {
        // permanent fail when failKinds set without remaining counter
        throw new AdapterError(failKinds[platformId], `mock permanent ${failKinds[platformId]}`, {
          platformId,
        });
      }

      if (delayMs > 0) await sleep(delayMs);

      const seed = hashSeed(`${ctx.prompt}|${ctx.brand || ''}|${platformId}|${mode}`);
      const raw = buildRawText({
        prompt: ctx.prompt,
        brand: ctx.brand || '',
        platformName,
        mode,
        seed,
        platformIndex: ctx.platformIndex || 0,
      });
      raw.platform_id = platformId;
      raw.latency_ms = delayMs;
      raw.task_id = ctx.task_id;
      return raw;
    },
    async healthcheck() {
      return { state: 'GREEN', at: new Date().toISOString(), adapter: 'mock' };
    },
  };
}

module.exports = { createMockAdapter };
