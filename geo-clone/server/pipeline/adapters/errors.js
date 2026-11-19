/**
 * Adapter error taxonomy (design §4.2).
 * Retryable: RATE_LIMITED, TRANSIENT, UNKNOWN (once).
 */

const KINDS = {
  RATE_LIMITED: 'RATE_LIMITED',
  TRANSIENT: 'TRANSIENT',
  AUTH: 'AUTH',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  PARSE_IRRELEVANT: 'PARSE_IRRELEVANT',
  UNKNOWN: 'UNKNOWN',
};

class AdapterError extends Error {
  /**
   * @param {string} kind
   * @param {string} message
   * @param {{ retryAfterMs?: number, platformId?: string, cause?: Error }} [meta]
   */
  constructor(kind, message, meta = {}) {
    super(message);
    this.name = 'AdapterError';
    this.kind = kind;
    this.retryAfterMs = meta.retryAfterMs;
    this.platformId = meta.platformId;
    this.cause = meta.cause;
  }

  get retryable() {
    if (this.kind === KINDS.AUTH || this.kind === KINDS.QUOTA_EXHAUSTED || this.kind === KINDS.PARSE_IRRELEVANT) {
      return false;
    }
    return true;
  }
}

function isAdapterError(err) {
  return err instanceof AdapterError || (err && err.name === 'AdapterError' && err.kind);
}

module.exports = { AdapterError, KINDS, isAdapterError };
