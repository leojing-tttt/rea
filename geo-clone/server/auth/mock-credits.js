/**
 * Local mock GEO credits (not UC RBAC points).
 * In-memory balance keyed by uid (or token for mock phone login).
 */

const DEFAULT_BALANCE = 13321;

class MockCredits {
  constructor({ defaultBalance = DEFAULT_BALANCE } = {}) {
    /** @type {Map<string, number>} */
    this.balances = new Map();
    this.defaultBalance = defaultBalance;
  }

  keyOf(session) {
    return String((session && (session.uid || session.phone || session.email || session.token)) || 'anon');
  }

  ensure(session) {
    const key = this.keyOf(session);
    if (!this.balances.has(key)) {
      this.balances.set(key, this.defaultBalance);
    }
    return this.balances.get(key);
  }

  get(session) {
    return this.ensure(session);
  }

  set(session, points) {
    this.balances.set(this.keyOf(session), Number(points));
    return this.get(session);
  }

  /**
   * @returns {{ ok: boolean, points: number, cost: number, reason?: string }}
   */
  ensureAndDeduct(session, cost) {
    const bal = this.ensure(session);
    const c = Math.max(0, Number(cost) || 0);
    if (bal < c) {
      return { ok: false, points: bal, cost: c, reason: 'insufficient' };
    }
    const next = bal - c;
    this.balances.set(this.keyOf(session), next);
    return { ok: true, points: next, cost: c };
  }
}

const mockCredits = new MockCredits();

module.exports = { MockCredits, mockCredits, DEFAULT_BALANCE };
