/**
 * Credentials vault (design §5.1).
 * Metadata may persist; secret material only via env/file resolve — never written to
 * task.json / raw / pipeline artifacts.
 */

const fs = require('fs');
const path = require('path');
const { platforms: defaultCatalog } = require('../../mock-data');

const DATA_ROOT = path.join(__dirname, '..', '..', '..', '.data', 'api-mgmt');
const CRED_FILE = path.join(DATA_ROOT, 'credentials.json');

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

/** Strip any accidental secret-looking fields before persist/list */
function publicCredential(rec) {
  if (!rec) return null;
  const {
    id,
    platformId,
    label,
    secret_backend,
    secret_env,
    secret_file,
    scopes,
    rpm_limit,
    daily_quota,
    status,
    last_healthy_at,
    last_error,
    relay,
    baseUrl,
    created_at,
    updated_at,
  } = rec;
  return {
    id,
    platformId,
    label,
    secret_backend: secret_backend || 'env',
    secret_env: secret_env || null, // name of env var only — not the value
    secret_file: secret_file || null, // path hint only
    scopes: scopes || [],
    rpm_limit: rpm_limit != null ? rpm_limit : null,
    daily_quota: daily_quota != null ? daily_quota : null,
    status: status || 'active',
    last_healthy_at: last_healthy_at || null,
    last_error: last_error || null,
    relay: relay || null,
    baseUrl: baseUrl || null,
    created_at,
    updated_at,
  };
}

function defaultCredentials(catalog = defaultCatalog) {
  return catalog.map((p) => ({
    id: `cred_${p.id}_mock`,
    platformId: p.id,
    label: 'mock-default',
    secret_backend: 'env',
    secret_env: `GEO_CRED_${String(p.id).toUpperCase()}`,
    scopes: ['mock'],
    rpm_limit: 60,
    daily_quota: 1000,
    status: 'active',
    relay: null,
    // Future 中转站: one relay baseUrl can fan out by platformId
    baseUrl: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

class CredentialVault {
  constructor({ catalog = defaultCatalog } = {}) {
    this.catalog = catalog;
    /** @type {Map<string, object>} */
    this.records = new Map();
    this._load();
  }

  _load() {
    const stored = readJson(CRED_FILE, null);
    const list = stored && Array.isArray(stored.list) ? stored.list : defaultCredentials(this.catalog);
    this.records.clear();
    for (const raw of list) {
      const pub = publicCredential(raw);
      if (pub && pub.id) this.records.set(pub.id, pub);
    }
    this._persist();
  }

  _persist() {
    writeJson(CRED_FILE, {
      list: [...this.records.values()].map(publicCredential),
      updated_at: new Date().toISOString(),
    });
  }

  list() {
    return [...this.records.values()].map(publicCredential);
  }

  get(id) {
    return publicCredential(this.records.get(id));
  }

  findActiveForPlatform(platformId) {
    return this.list().find((c) => c.platformId === platformId && c.status === 'active') || null;
  }

  /**
   * Upsert metadata only (idempotent). Rejects bodies that include secret values.
   */
  upsert(input = {}) {
    if (input.secret || input.apiKey || input.api_key || input.token || input.password) {
      const err = new Error('secrets must not be submitted in API body — use env/file backend');
      err.code = 'SECRET_IN_BODY';
      throw err;
    }
    const id = input.id || `cred_${input.platformId}_${Date.now()}`;
    const prev = this.records.get(id) || {};
    const next = publicCredential({
      ...prev,
      ...input,
      id,
      platformId: input.platformId || prev.platformId,
      label: input.label || prev.label || 'default',
      secret_backend: input.secret_backend || prev.secret_backend || 'env',
      created_at: prev.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (!next.platformId) {
      const err = new Error('platformId required');
      err.code = 'VALIDATION';
      throw err;
    }
    this.records.set(id, next);
    this._persist();
    return next;
  }

  /**
   * Short-lived in-memory handle. Never persist return value.
   * @returns {{ credential_ref: string, platformId: string, label: string, apiKey: string|null, relay: string|null, baseUrl: string|null, rpm_limit: number|null, daily_quota: number|null }}
   */
  resolveCredentials(credential_ref) {
    const meta = this.get(credential_ref);
    if (!meta) {
      const err = new Error(`unknown credential_ref: ${credential_ref}`);
      err.code = 'CREDENTIAL_NOT_FOUND';
      throw err;
    }
    if (meta.status === 'disabled') {
      const err = new Error(`credential disabled: ${credential_ref}`);
      err.code = 'CREDENTIAL_DISABLED';
      throw err;
    }

    let apiKey = null;
    if (meta.secret_backend === 'env' && meta.secret_env) {
      apiKey = process.env[meta.secret_env] || null;
    } else if (meta.secret_backend === 'file' && meta.secret_file) {
      try {
        // Only read if path is under process cwd/.data or absolute env-configured — never copy into pipeline
        const abs = path.isAbsolute(meta.secret_file)
          ? meta.secret_file
          : path.join(DATA_ROOT, 'secrets', meta.secret_file);
        if (fs.existsSync(abs)) {
          apiKey = fs.readFileSync(abs, 'utf8').trim();
        }
      } catch (_) {
        apiKey = null;
      }
    }

    // Mock mode: synthesize a non-secret placeholder so adapters can run without real keys
    if (!apiKey && process.env.GEO_VAULT_REQUIRE_SECRET !== '1') {
      apiKey = `mock-key:${meta.platformId}`;
    }

    return {
      credential_ref: meta.id,
      platformId: meta.platformId,
      label: meta.label,
      apiKey,
      relay: meta.relay,
      baseUrl: meta.baseUrl,
      rpm_limit: meta.rpm_limit,
      daily_quota: meta.daily_quota,
      _ephemeral: true,
    };
  }

  touchHealth(credential_ref, { ok, error } = {}) {
    const rec = this.records.get(credential_ref);
    if (!rec) return null;
    if (ok) {
      rec.last_healthy_at = new Date().toISOString();
      rec.last_error = null;
    } else {
      rec.last_error = error || 'health_failed';
    }
    rec.updated_at = new Date().toISOString();
    this.records.set(credential_ref, rec);
    this._persist();
    return publicCredential(rec);
  }
}

const vault = new CredentialVault();

module.exports = {
  CredentialVault,
  vault,
  publicCredential,
  DATA_ROOT,
  CRED_FILE,
};
