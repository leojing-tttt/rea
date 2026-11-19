const {
  UcClient,
  authMode,
  normalizeBaseUrl,
  ucRoot,
  redact,
  mapUcUser,
} = require('./uc-client');
const { createAuthMiddleware, stripBearer } = require('./middleware');
const { MockCredits, mockCredits, DEFAULT_BALANCE } = require('./mock-credits');

function createAuth({ sessions, fetchImpl } = {}) {
  const mode = authMode();
  const ucClient = new UcClient({
    baseUrl: process.env.USER_CENTER_BASE_URL,
    fetchImpl,
  });

  return {
    mode,
    ucClient,
    mockCredits,
    auth: createAuthMiddleware({
      sessions: sessions || new Map(),
      ucClient,
      fail: (code, msg) => ({ code, msg, data: null }),
    }),
    configPublic() {
      return {
        mode: authMode(),
        // Never expose secrets; only whether UC base is configured
        user_center_configured: Boolean(ucRoot(process.env.USER_CENTER_BASE_URL || '')),
        login_fields: authMode() === 'uc' ? ['email', 'password'] : ['phone', 'password'],
      };
    },
  };
}

module.exports = {
  createAuth,
  UcClient,
  authMode,
  normalizeBaseUrl,
  ucRoot,
  redact,
  mapUcUser,
  createAuthMiddleware,
  stripBearer,
  MockCredits,
  mockCredits,
  DEFAULT_BALANCE,
};
