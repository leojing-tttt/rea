/**
 * UC auth unit tests — mocked HTTP only (no live UC, no secrets on disk).
 */
const assert = require('assert');
const { UcClient, authMode, ucRoot, mapUcUser, redact } = require('./uc-client');
const { createAuthMiddleware } = require('./middleware');
const { MockCredits } = require('./mock-credits');

function mockFetchSequence(handlers) {
  let i = 0;
  return async (url, opts = {}) => {
    const h = handlers[i++];
    if (!h) throw new Error(`unexpected fetch ${opts.method} ${url}`);
    return h(url, opts);
  };
}

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  };
}

async function main() {
  // --- helpers ---
  assert.strictEqual(ucRoot('https://test-api.a3database.cn'), 'https://test-api.a3database.cn/uc');
  assert.strictEqual(ucRoot('https://test-api.a3database.cn/uc'), 'https://test-api.a3database.cn/uc');
  assert.ok(!String(redact('supersecretpassword')).includes('password'));

  const prevMode = process.env.GEO_AUTH_MODE;
  process.env.GEO_AUTH_MODE = 'mock';
  assert.strictEqual(authMode(), 'mock');
  process.env.GEO_AUTH_MODE = 'uc';
  assert.strictEqual(authMode(), 'uc');

  // --- userLogin + info ---
  const fetchLogin = mockFetchSequence([
    (url, opts) => {
      assert.ok(String(url).endsWith('/uc/auth/userLogin'));
      assert.strictEqual(opts.method, 'POST');
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.email, 'lei.jing@a3group.cn');
      assert.ok(body.password);
      // password must not appear in url
      assert.ok(!String(url).includes(body.password));
      return jsonResponse({ code: 200, msg: 'ok', data: 'jwt-test-token' });
    },
    (url, opts) => {
      assert.ok(String(url).endsWith('/uc/auth/info'));
      assert.ok(String(opts.headers.Authorization).includes('jwt-test-token'));
      return jsonResponse({
        code: 200,
        msg: 'ok',
        data: {
          userId: 42,
          email: 'lei.jing@a3group.cn',
          nickname: 'Lei',
          phone: null,
        },
      });
    },
  ]);

  const client = new UcClient({
    baseUrl: 'https://test-api.a3database.cn',
    fetchImpl: fetchLogin,
    verifyCacheMs: 0,
  });
  const { token } = await client.userLogin({
    email: 'lei.jing@a3group.cn',
    password: 'not-a-real-secret-for-unit-test',
  });
  assert.strictEqual(token, 'jwt-test-token');
  const info = await client.info(token);
  assert.strictEqual(info.email, 'lei.jing@a3group.cn');
  const mapped = mapUcUser(info, { token, points: 100 });
  assert.strictEqual(mapped.name, 'Lei');
  assert.strictEqual(mapped.points, 100);
  assert.strictEqual(mapped.source, 'uc');

  // --- dspLogin verify ---
  const fetchVerify = mockFetchSequence([
    (url, opts) => {
      assert.ok(String(url).endsWith('/uc/auth/dspLogin'));
      const body = JSON.parse(opts.body);
      assert.strictEqual(body.token, 'jwt-abc');
      return jsonResponse({
        code: 200,
        data: { userId: 7, email: 'a@b.cn', username: 'ab' },
      });
    },
  ]);
  const client2 = new UcClient({
    baseUrl: 'https://test-api.a3database.cn/uc',
    fetchImpl: fetchVerify,
    verifyCacheMs: 60_000,
  });
  const v1 = await client2.verify('jwt-abc');
  assert.strictEqual(v1.userId, 7);
  // cache hit — no extra fetch
  const v2 = await client2.verify('Bearer jwt-abc');
  assert.strictEqual(v2.userId, 7);

  // --- middleware uc ---
  process.env.GEO_AUTH_MODE = 'uc';
  const sessions = new Map();
  const credits = new MockCredits({ defaultBalance: 500 });
  // patch global mockCredits used by middleware? middleware uses module singleton.
  // Use createAuthMiddleware with our client; points come from mockCredits singleton — fine.
  const mwClient = new UcClient({
    baseUrl: 'https://test-api.a3database.cn',
    fetchImpl: mockFetchSequence([
      () =>
        jsonResponse({
          code: 200,
          data: { userId: 9, email: 'x@y.cn', nickname: 'X' },
        }),
    ]),
    verifyCacheMs: 0,
  });
  const auth = createAuthMiddleware({
    sessions,
    ucClient: mwClient,
    fail: (code, msg) => ({ code, msg, data: null }),
  });

  const req = { headers: { authorization: 'Bearer jwt-mw' }, user: null };
  let statusBody = null;
  const res = {
    json(body) {
      statusBody = body;
    },
  };
  let nextCalled = false;
  await auth(req, res, () => {
    nextCalled = true;
  });
  assert.ok(nextCalled, 'auth should call next');
  assert.ok(req.user);
  assert.strictEqual(req.user.email, 'x@y.cn');
  assert.ok(sessions.has('jwt-mw'));

  // unauthorized
  const req2 = { headers: {}, user: null };
  statusBody = null;
  await auth(req2, res, () => {
    throw new Error('should not next');
  });
  assert.strictEqual(statusBody.code, 401);

  // --- mock credits deduct ---
  const c = new MockCredits({ defaultBalance: 10 });
  const sess = { uid: 'u1' };
  assert.strictEqual(c.get(sess), 10);
  const d = c.ensureAndDeduct(sess, 4);
  assert.ok(d.ok);
  assert.strictEqual(d.points, 6);
  const failDeduct = c.ensureAndDeduct(sess, 100);
  assert.ok(!failDeduct.ok);

  // --- express smoke with mock mode login route via ephemeral server ---
  process.env.GEO_AUTH_MODE = 'mock';
  delete process.env.USER_CENTER_BASE_URL;
  // require index would start listening — instead hit login logic lightly via UcClient API error
  const bad = new UcClient({ baseUrl: '', fetchImpl: async () => jsonResponse({}) });
  let threw = false;
  try {
    await bad.userLogin({ email: 'a@b.cn', password: 'x' });
  } catch (e) {
    threw = e.code === 'UC_CONFIG';
  }
  assert.ok(threw);

  // restore
  if (prevMode === undefined) delete process.env.GEO_AUTH_MODE;
  else process.env.GEO_AUTH_MODE = prevMode;

  console.log('auth.test.js OK', {
    login_token: 'jwt-test-token',
    verify_userId: v1.userId,
    middleware_uid: req.user.uid,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
