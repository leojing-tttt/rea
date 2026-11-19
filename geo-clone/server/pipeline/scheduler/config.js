/** Default scheduler config (design §4.1). */

const DEFAULT_SCHEDULER_CONFIG = {
  max_inflight_jobs: 8,
  per_platform_inflight: 2,
  per_user_inflight: 3,
  max_attempts: 3,
  base_backoff_ms: 40,
  max_backoff_ms: 500,
  /** Token bucket stub per platform */
  rate_limit: {
    capacity: 20,
    refill_per_sec: 10,
  },
  /** priority: realtime search default */
  default_priority: 100,
  task_deadline_ms: 120000,
};

function mergeConfig(overrides = {}) {
  return {
    ...DEFAULT_SCHEDULER_CONFIG,
    ...overrides,
    rate_limit: {
      ...DEFAULT_SCHEDULER_CONFIG.rate_limit,
      ...(overrides.rate_limit || {}),
    },
  };
}

module.exports = { DEFAULT_SCHEDULER_CONFIG, mergeConfig };
