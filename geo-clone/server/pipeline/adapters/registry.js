const { createMockAdapter } = require('./mock-adapter');
const { createHttpAdapter } = require('./http-adapter');
const { createPerPlatformAdapter } = require('./per-platform-adapter');

/**
 * Adapter registry (design §5.4).
 * per-platform: HTTP when that platform has relay/baseUrl + a real secret, else mock.
 */
function createRegistry({ platformCatalog, mode = 'per-platform' } = {}) {
  const mock = createMockAdapter({ platformCatalog, delayMs: 0 });
  const http = createHttpAdapter({ platformCatalog });
  const perPlatform = createPerPlatformAdapter({
    platformCatalog,
    mockAdapter: mock,
    httpAdapter: http,
  });
  const map = {
    mock,
    http,
    'per-platform': perPlatform,
  };

  return {
    mode,
    get(id) {
      if (mode === 'mock') return map.mock;
      if (mode === 'real' || mode === 'http') return map.http;
      if (mode === 'per-platform') return map['per-platform'];
      return map[id] || map['per-platform'];
    },
    list() {
      return Object.keys(map);
    },
  };
}

module.exports = { createRegistry };
