/**
 * Circuit breaker per (platformId, credential_ref) — design §5.2.
 * Closed → GREEN, Open → RED, Half-open → YELLOW.
 */

const STATES = {
  CLOSED: 'Closed',
  OPEN: 'Open',
  HALF_OPEN: 'Half-open',
};

const HEALTH = {
  GREEN: 'GREEN',
  RED: 'RED',
  YELLOW: 'YELLOW',
};

function keyOf(platformId, credential_ref) {
  return `${platformId}::${credential_ref}`;
}

function healthFromState(state) {
  if (state === STATES.OPEN) return HEALTH.RED;
  if (state === STATES.HALF_OPEN) return HEALTH.YELLOW;
  return HEALTH.GREEN;
}

class CircuitBreakerRegistry {
  /**
   * @param {object} [opts]
   * @param {number} [opts.failureThreshold=3] consecutive failures → Open
   * @param {number} [opts.openMs=30000] cool-down before Half-open
   * @param {number} [opts.halfOpenMax=1] probes allowed in Half-open
   * @param {() => number} [opts.now]
   */
  constructor(opts = {}) {
    this.failureThreshold = opts.failureThreshold != null ? opts.failureThreshold : 3;
    this.openMs = opts.openMs != null ? opts.openMs : 30_000;
    this.halfOpenMax = opts.halfOpenMax != null ? opts.halfOpenMax : 1;
    this.now = opts.now || (() => Date.now());
    /** @type {Map<string, object>} */
    this.circuits = new Map();
  }

  _ensure(platformId, credential_ref) {
    const k = keyOf(platformId, credential_ref);
    if (!this.circuits.has(k)) {
      this.circuits.set(k, {
        platformId,
        credential_ref,
        state: STATES.CLOSED,
        consecutiveFailures: 0,
        openedAt: null,
        halfOpenInflight: 0,
        lastError: null,
        lastSuccessAt: null,
        lastFailureAt: null,
      });
    }
    return this.circuits.get(k);
  }

  get(platformId, credential_ref) {
    const c = this._ensure(platformId, credential_ref);
    this._maybeTransition(c);
    return { ...c, health: healthFromState(c.state) };
  }

  list() {
    return [...this.circuits.values()].map((c) => {
      this._maybeTransition(c);
      return { ...c, health: healthFromState(c.state) };
    });
  }

  _maybeTransition(c) {
    if (c.state === STATES.OPEN && c.openedAt != null) {
      if (this.now() - c.openedAt >= this.openMs) {
        c.state = STATES.HALF_OPEN;
        c.halfOpenInflight = 0;
      }
    }
  }

  /**
   * @returns {{ allowed: boolean, reason?: string, circuit: object }}
   */
  allow(platformId, credential_ref) {
    const c = this._ensure(platformId, credential_ref);
    this._maybeTransition(c);

    if (c.state === STATES.OPEN) {
      return { allowed: false, reason: 'circuit_open', circuit: { ...c, health: HEALTH.RED } };
    }
    if (c.state === STATES.HALF_OPEN) {
      if (c.halfOpenInflight >= this.halfOpenMax) {
        return {
          allowed: false,
          reason: 'half_open_probe_busy',
          circuit: { ...c, health: HEALTH.YELLOW },
        };
      }
      c.halfOpenInflight += 1;
      return { allowed: true, circuit: { ...c, health: HEALTH.YELLOW } };
    }
    return { allowed: true, circuit: { ...c, health: HEALTH.GREEN } };
  }

  recordSuccess(platformId, credential_ref) {
    const c = this._ensure(platformId, credential_ref);
    c.consecutiveFailures = 0;
    c.lastSuccessAt = this.now();
    c.lastError = null;
    c.state = STATES.CLOSED;
    c.openedAt = null;
    c.halfOpenInflight = 0;
    return { ...c, health: HEALTH.GREEN };
  }

  /**
   * @param {string} platformId
   * @param {string} credential_ref
   * @param {{ kind?: string, message?: string }} [err]
   */
  recordFailure(platformId, credential_ref, err = {}) {
    const c = this._ensure(platformId, credential_ref);
    c.consecutiveFailures += 1;
    c.lastFailureAt = this.now();
    c.lastError = err.kind || err.message || 'failure';

    if (c.state === STATES.HALF_OPEN) {
      c.state = STATES.OPEN;
      c.openedAt = this.now();
      c.halfOpenInflight = 0;
      return { ...c, health: HEALTH.RED };
    }

    if (c.consecutiveFailures >= this.failureThreshold) {
      c.state = STATES.OPEN;
      c.openedAt = this.now();
      return { ...c, health: HEALTH.RED };
    }
    return { ...c, health: healthFromState(c.state) };
  }

  /** Force open (admin / auth hard fail) */
  trip(platformId, credential_ref, reason = 'forced') {
    const c = this._ensure(platformId, credential_ref);
    c.state = STATES.OPEN;
    c.openedAt = this.now();
    c.lastError = reason;
    c.halfOpenInflight = 0;
    return { ...c, health: HEALTH.RED };
  }

  reset(platformId, credential_ref) {
    const c = this._ensure(platformId, credential_ref);
    c.state = STATES.CLOSED;
    c.consecutiveFailures = 0;
    c.openedAt = null;
    c.halfOpenInflight = 0;
    c.lastError = null;
    return { ...c, health: HEALTH.GREEN };
  }

  snapshot() {
    return {
      failureThreshold: this.failureThreshold,
      openMs: this.openMs,
      halfOpenMax: this.halfOpenMax,
      circuits: this.list(),
    };
  }
}

const circuits = new CircuitBreakerRegistry();

module.exports = {
  CircuitBreakerRegistry,
  circuits,
  STATES,
  HEALTH,
  healthFromState,
  keyOf,
};
