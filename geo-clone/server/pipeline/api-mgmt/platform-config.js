/**
 * Per-platform API / quota / relay config (design §5, P3).
 * Metadata only — no secrets. Additive + idempotent upserts.
 *
 * Future 中转站: set `relay` + `baseUrl` once; adapters will POST
 * { platformId, modeId, prompt } to the relay without per-platform fetch here.
 */

const fs = require('fs');
const path = require('path');
const { platforms: defaultCatalog } = require('../../mock-data');
const { DATA_ROOT } = require('./vault');

const CONFIG_FILE = path.join(DATA_ROOT, 'platforms.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function sanitize(rec) {
  if (!rec) return null;
  const {
    platformId,
    name,
    status,
    rpm_limit,
    daily_quota,
    credential_ref,
    adapter_mode,
    relay,
    baseUrl,
    notes,
    updated_at,
  } = rec;
  // Reject secret fields if somehow present
  return {
    platformId,
    name: name || platformId,
    status: status || 'active', // active | disabled | maintenance
    rpm_limit: rpm_limit != null ? rpm_limit : 60,
    daily_quota: daily_quota != null ? daily_quota : 1000,
    credential_ref: credential_ref || null,
    adapter_mode: adapter_mode || 'mock',
    relay: relay || null,
    baseUrl: baseUrl || null,
    notes: notes || null,
    updated_at: updated_at || new Date().toISOString(),
  };
}

function defaultsFromCatalog(catalog = defaultCatalog) {
  return catalog.map((p) =>
    sanitize({
      platformId: p.id,
      name: p.name,
      status: 'active',
      rpm_limit: 60,
      daily_quota: 1000,
      credential_ref: `cred_${p.id}_mock`,
      adapter_mode: 'mock',
      relay: null,
      baseUrl: null,
    })
  );
}

class PlatformConfigStore {
  constructor({ catalog = defaultCatalog } = {}) {
    this.catalog = catalog;
    /** @type {Map<string, object>} */
    this.byId = new Map();
    this._load();
  }

  _load() {
    const stored = readJson(CONFIG_FILE, null);
    const list =
      stored && Array.isArray(stored.list) ? stored.list : defaultsFromCatalog(this.catalog);
    this.byId.clear();
    for (const raw of list) {
      const s = sanitize(raw);
      if (s && s.platformId) this.byId.set(s.platformId, s);
    }
    // Ensure catalog platforms exist (additive)
    for (const d of defaultsFromCatalog(this.catalog)) {
      if (!this.byId.has(d.platformId)) this.byId.set(d.platformId, d);
    }
    this._persist();
  }

  _persist() {
    writeJson(CONFIG_FILE, {
      list: this.list(),
      updated_at: new Date().toISOString(),
    });
  }

  list() {
    return [...this.byId.values()].map(sanitize);
  }

  get(platformId) {
    return sanitize(this.byId.get(platformId));
  }

  /**
   * Idempotent upsert. Rejects secret-bearing bodies.
   */
  upsert(platformId, patch = {}) {
    if (patch.secret || patch.apiKey || patch.api_key || patch.token || patch.password) {
      const err = new Error('secrets must not be submitted in platform config — use vault env/file');
      err.code = 'SECRET_IN_BODY';
      throw err;
    }
    const prev = this.byId.get(platformId) || { platformId };
    const next = sanitize({
      ...prev,
      ...patch,
      platformId,
      updated_at: new Date().toISOString(),
    });
    this.byId.set(platformId, next);
    this._persist();
    return next;
  }
}

const platformConfig = new PlatformConfigStore();

module.exports = {
  PlatformConfigStore,
  platformConfig,
  CONFIG_FILE,
  sanitize,
};
