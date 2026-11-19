/**
 * a3-user-center HTTP client (design: geo-user-center-integration.md).
 * Auth only — never logs or returns passwords.
 */

const DEFAULT_VERIFY_PATH = '/auth/dspLogin';

function authMode() {
  const m = String(process.env.GEO_AUTH_MODE || 'mock').toLowerCase();
  return m === 'uc' ? 'uc' : 'mock';
}

/**
 * Normalize USER_CENTER_BASE_URL.
 * Accepts `https://test-api.a3database.cn` or `…/uc` — paths always include /uc when needed.
 */
function normalizeBaseUrl(raw) {
  const base = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) return '';
  return base;
}

function ucRoot(baseUrl) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return '';
  return /\/uc$/i.test(base) ? base : `${base}/uc`;
}

function redact(value) {
  if (value == null) return value;
  const s = String(value);
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}…${s.slice(-2)}`;
}

class UcClient {
  /**
   * @param {{ baseUrl?: string, verifyPath?: string, fetchImpl?: typeof fetch }} [opts]
   */
  constructor(opts = {}) {
    this.baseUrl = normalizeBaseUrl(opts.baseUrl || process.env.USER_CENTER_BASE_URL || '');
    this.verifyPath = opts.verifyPath || process.env.GEO_UC_VERIFY_PATH || DEFAULT_VERIFY_PATH;
    this.fetchImpl = opts.fetchImpl || globalThis.fetch;
    /** @type {Map<string, { at: number, user: object }>} */
    this._verifyCache = new Map();
    this.verifyCacheMs = opts.verifyCacheMs != null ? opts.verifyCacheMs : 5_000;
  }

  get root() {
    return ucRoot(this.baseUrl);
  }

  ensureConfigured() {
    if (!this.root) {
      const err = new Error('USER_CENTER_BASE_URL is required when GEO_AUTH_MODE=uc');
      err.code = 'UC_CONFIG';
      throw err;
    }
    if (typeof this.fetchImpl !== 'function') {
      const err = new Error('fetch is not available');
      err.code = 'UC_CONFIG';
      throw err;
    }
  }

  async _request(method, path, { body, token, headers } = {}) {
    this.ensureConfigured();
    const url = `${this.root}${path.startsWith('/') ? path : `/${path}`}`;
    const hdrs = {
      Accept: 'application/json',
      ...(headers || {}),
    };
    if (body !== undefined) {
      hdrs['Content-Type'] = 'application/json';
    }
    if (token) {
      hdrs.Authorization = String(token).startsWith('Bearer ') ? token : `Bearer ${token}`;
    }
    let res;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: hdrs,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      const err = new Error(`UC unreachable: ${cause.message || cause}`);
      err.code = 'UC_NETWORK';
      err.cause = cause;
      throw err;
    }
    let json;
    try {
      json = await res.json();
    } catch (_) {
      const err = new Error(`UC non-JSON response (${res.status})`);
      err.code = 'UC_BAD_RESPONSE';
      err.status = res.status;
      throw err;
    }
    // ApiResult: { code, msg, data }
    if (!res.ok || (json && typeof json.code === 'number' && json.code !== 200 && json.code !== 0)) {
      const err = new Error((json && json.msg) || `UC HTTP ${res.status}`);
      err.code = 'UC_API';
      err.status = res.status;
      err.ucCode = json && json.code;
      throw err;
    }
    return json;
  }

  /**
   * POST /uc/auth/userLogin → JWT string in data
   */
  async userLogin({ email, password }) {
    if (!email || !password) {
      const err = new Error('email and password required');
      err.code = 'VALIDATION';
      throw err;
    }
    const json = await this._request('POST', '/auth/userLogin', {
      body: { email: String(email).trim(), password: String(password) },
    });
    const token = json && json.data;
    if (!token || typeof token !== 'string') {
      const err = new Error('UC login returned empty token');
      err.code = 'UC_BAD_RESPONSE';
      throw err;
    }
    return { token, raw: { code: json.code, msg: json.msg } };
  }

  /**
   * GET /uc/auth/info
   */
  async info(token) {
    const json = await this._request('GET', '/auth/info', { token });
    return json.data || null;
  }

  /**
   * POST /uc/auth/dspLogin { token } — sibling JWT verify
   */
  async dspLogin(token) {
    const bare = String(token || '').replace(/^Bearer\s+/i, '');
    const json = await this._request('POST', this.verifyPath.startsWith('/') ? this.verifyPath : `/${this.verifyPath}`, {
      body: { token: bare },
    });
    return json.data || null;
  }

  /**
   * GET /uc/auth/logout
   */
  async logout(token) {
    try {
      await this._request('GET', '/auth/logout', { token });
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Verify JWT with short in-memory cache (no password material).
   */
  async verify(token) {
    const bare = String(token || '').replace(/^Bearer\s+/i, '');
    if (!bare) return null;
    const cached = this._verifyCache.get(bare);
    const now = Date.now();
    if (cached && now - cached.at < this.verifyCacheMs) {
      return cached.user;
    }
    const user = await this.dspLogin(bare);
    if (user) {
      this._verifyCache.set(bare, { at: now, user });
    }
    return user;
  }

  clearVerifyCache(token) {
    if (!token) {
      this._verifyCache.clear();
      return;
    }
    this._verifyCache.delete(String(token).replace(/^Bearer\s+/i, ''));
  }
}

function mapUcUser(ucUser, { token, points } = {}) {
  if (!ucUser) return null;
  const name =
    ucUser.nickname || ucUser.realName || ucUser.username || (ucUser.email && String(ucUser.email).split('@')[0]) || 'user';
  return {
    token,
    uid: String(ucUser.userId || ucUser.id || ''),
    name,
    email: ucUser.email || null,
    phone: ucUser.phone || null,
    points: points != null ? points : 13321,
    vip: '企业版',
    source: 'uc',
  };
}

module.exports = {
  UcClient,
  authMode,
  normalizeBaseUrl,
  ucRoot,
  redact,
  mapUcUser,
  DEFAULT_VERIFY_PATH,
};
