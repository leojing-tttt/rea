const { createMockAdapter } = require('./mock-adapter');

/**
 * Adapter registry (design §5.4). Real adapters register later.
 */
function createRegistry({ platformCatalog, mode = 'mock' } = {}) {
  const mock = createMockAdapter({ platformCatalog, delayMs: 0 });
  const map = {
    mock,
  };

  return {
    mode,
    get(id) {
      if (mode === 'mock') return map.mock;
      return map[id] || map.mock;
    },
    list() {
      return Object.keys(map);
    },
  };
}

module.exports = { createRegistry };
