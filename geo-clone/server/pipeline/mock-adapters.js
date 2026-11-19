/**
 * Batch convenience wrapping MockAdapter (backward compatible).
 */

const { platforms: defaultCatalog } = require('../mock-data');
const { buildRawText, hashSeed } = require('./mock-adapters-core');
const { createMockAdapter } = require('./adapters/mock-adapter');

/**
 * Sync-style batch (awaits each mock fetch). Used by tests & fallback.
 * @param {{ prompt: string, brand?: string, platforms: Array, platformCatalog?: Array, task_id?: string }} input
 */
async function fetchMockRawResponsesAsync(input) {
  const catalog = input.platformCatalog || defaultCatalog;
  const adapter = createMockAdapter({ platformCatalog: catalog, delayMs: 0 });
  const selected = input.platforms || [];
  const out = [];
  for (let i = 0; i < selected.length; i += 1) {
    const p = selected[i];
    const platformId = p.platformId || p.id || p;
    const modeId = p.modeId || p.mode || 'web_fast';
    // eslint-disable-next-line no-await-in-loop
    const raw = await adapter.fetchRaw({
      task_id: input.task_id || 'batch',
      prompt: input.prompt,
      brand: input.brand || '',
      platformId,
      modeId,
      platformIndex: i,
    });
    out.push(raw);
  }
  return out;
}

/** Sync wrapper for callers that expect immediate array (legacy). */
function fetchMockRawResponses(input) {
  const catalog = input.platformCatalog || defaultCatalog;
  const nameById = new Map(catalog.map((p) => [p.id, p.name]));
  return (input.platforms || []).map((p, platformIndex) => {
    const platformId = p.platformId || p.id || p;
    const mode = p.modeId || p.mode || 'web_fast';
    const platformName = nameById.get(platformId) || String(platformId);
    const seed = hashSeed(`${input.prompt}|${input.brand || ''}|${platformId}|${mode}`);
    const raw = buildRawText({
      prompt: input.prompt,
      brand: input.brand || '',
      platformName,
      mode,
      seed,
      platformIndex,
    });
    raw.platform_id = platformId;
    return raw;
  });
}

module.exports = {
  fetchMockRawResponses,
  fetchMockRawResponsesAsync,
  buildRawText,
  hashSeed,
  createMockAdapter,
};
