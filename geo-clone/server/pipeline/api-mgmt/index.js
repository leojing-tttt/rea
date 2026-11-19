/**
 * Multi-platform AI/API management facade (design P3).
 */

const { vault } = require('./vault');
const { circuits, HEALTH, STATES } = require('./circuit');
const { platformConfig } = require('./platform-config');
const { AdapterError, KINDS } = require('../adapters/errors');

/**
 * Resolve credential_ref for a platform (config override → vault default).
 */
function credentialRefFor(platformId) {
  const cfg = platformConfig.get(platformId);
  if (cfg && cfg.credential_ref) return cfg.credential_ref;
  const found = vault.findActiveForPlatform(platformId);
  return found ? found.id : `cred_${platformId}_mock`;
}

/**
 * Pre-dispatch gate: platform status + circuit + vault resolve.
 * @returns {{ ok: boolean, skip?: boolean, credential_ref?: string, resolved?: object, reason?: string, health?: string, error?: AdapterError }}
 */
function beforeDispatch(platformId) {
  const cfg = platformConfig.get(platformId);
  if (cfg && (cfg.status === 'disabled' || cfg.status === 'maintenance')) {
    return {
      ok: false,
      skip: true,
      reason: `platform_${cfg.status}`,
      health: HEALTH.RED,
      error: new AdapterError(KINDS.QUOTA_EXHAUSTED, `platform ${platformId} is ${cfg.status}`, {
        platformId,
      }),
    };
  }

  const credential_ref = credentialRefFor(platformId);
  const gate = circuits.allow(platformId, credential_ref);
  if (!gate.allowed) {
    return {
      ok: false,
      skip: true,
      credential_ref,
      reason: gate.reason,
      health: gate.circuit.health,
      error: new AdapterError(KINDS.CIRCUIT_OPEN, `circuit blocked: ${gate.reason}`, {
        platformId,
        retryAfterMs: circuits.openMs,
      }),
    };
  }

  try {
    const resolved = vault.resolveCredentials(credential_ref);
    // Attach platform relay/baseUrl from config if vault record lacks them
    if (!resolved.relay && cfg && cfg.relay) resolved.relay = cfg.relay;
    if (!resolved.baseUrl && cfg && cfg.baseUrl) resolved.baseUrl = cfg.baseUrl;
    return {
      ok: true,
      credential_ref,
      resolved,
      health: gate.circuit.health,
    };
  } catch (err) {
    circuits.recordFailure(platformId, credential_ref, { kind: 'AUTH', message: err.message });
    vault.touchHealth(credential_ref, { ok: false, error: err.message });
    return {
      ok: false,
      skip: true,
      credential_ref,
      reason: err.code || 'credential_resolve_failed',
      health: HEALTH.RED,
      error: new AdapterError(KINDS.AUTH, err.message, { platformId }),
    };
  }
}

/**
 * Record adapter outcome into circuit + vault health metadata.
 */
function afterDispatch(platformId, credential_ref, { ok, error } = {}) {
  if (!credential_ref) return null;
  if (ok) {
    circuits.recordSuccess(platformId, credential_ref);
    vault.touchHealth(credential_ref, { ok: true });
    return circuits.get(platformId, credential_ref);
  }
  const kind = error && error.kind;
  // AUTH / QUOTA → trip open immediately
  if (kind === KINDS.AUTH || kind === KINDS.QUOTA_EXHAUSTED) {
    circuits.trip(platformId, credential_ref, kind);
  } else {
    circuits.recordFailure(platformId, credential_ref, {
      kind: kind || 'UNKNOWN',
      message: error && error.message,
    });
  }
  vault.touchHealth(credential_ref, {
    ok: false,
    error: (error && (error.kind || error.message)) || 'failure',
  });
  return circuits.get(platformId, credential_ref);
}

/**
 * Aggregate status for GET /api/geo/platform_status
 */
function getPlatformStatusList(catalogPlatforms) {
  const list = (catalogPlatforms || []).map((p) => {
    const platformId = p.id || p.platformId;
    const cfg = platformConfig.get(platformId) || {};
    const credential_ref = credentialRefFor(platformId);
    const circuit = circuits.get(platformId, credential_ref);
    let state = circuit.health;
    let reason = circuit.lastError || null;

    if (cfg.status === 'disabled' || cfg.status === 'maintenance') {
      state = HEALTH.RED;
      reason = `platform_${cfg.status}`;
    }

    const cred = vault.get(credential_ref);
    return {
      platformId,
      name: cfg.name || p.name || platformId,
      state,
      circuit: circuit.state,
      adapter: cfg.adapter_mode || 'mock',
      credential_ref,
      rpm_limit: cfg.rpm_limit,
      daily_quota: cfg.daily_quota,
      relay: cfg.relay || (cred && cred.relay) || null,
      baseUrl: cfg.baseUrl || (cred && cred.baseUrl) || null,
      last_healthy_at: cred && cred.last_healthy_at,
      reason,
    };
  });
  return { list, circuits: circuits.snapshot() };
}

function getPlatformsExtended(catalogPlatforms) {
  return (catalogPlatforms || []).map((p) => {
    const cfg = platformConfig.get(p.id) || {};
    const credential_ref = credentialRefFor(p.id);
    const circuit = circuits.get(p.id, credential_ref);
    return {
      ...p,
      api: {
        status: cfg.status || 'active',
        rpm_limit: cfg.rpm_limit,
        daily_quota: cfg.daily_quota,
        credential_ref,
        adapter_mode: cfg.adapter_mode || 'mock',
        relay: cfg.relay || null,
        baseUrl: cfg.baseUrl || null,
        health: circuit.health,
        circuit: circuit.state,
      },
    };
  });
}

module.exports = {
  vault,
  circuits,
  platformConfig,
  beforeDispatch,
  afterDispatch,
  credentialRefFor,
  getPlatformStatusList,
  getPlatformsExtended,
  HEALTH,
  STATES,
};
