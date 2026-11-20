/**
 * Real HTTP adapter (per-platform).
 * Local mock HTTP server only — no live API key.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

const {
  createHttpAdapter,
  isRealSecret,
  resolveHttpEndpoint,
  classifyTransport,
} = require('./http-adapter');
const { createPerPlatformAdapter } = require('./per-platform-adapter');
const { AdapterError, KINDS } = require('./errors');
const { fetchRawBatch } = require('../scheduler/fetch-raw-batch');
const { parseRawList } = require('../parse');
const { platforms } = require('../../mock-data');
const { store } = require('../store');
const apiMgmt = require('../api-mgmt');

const SECRET = 'test-secret-not-real';

function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function chat(content, extra = {}) {
  return JSON.stringify({
    id: 'chatcmpl_test',
    choices: [{ message: { role: 'assistant', content } }],
    ...extra,
  });
}

function originOf(server) {
  const addr = server.address();
  return `http://127.0.0.1:${addr.port}`;
}

async function main() {
  assert.strictEqual(isRealSecret(''), false);
  assert.strictEqual(isRealSecret(null), false);
  assert.strictEqual(isRealSecret('   '), false);
  assert.strictEqual(isRealSecret('mock-key:doubao'), false);
  assert.strictEqual(isRealSecret(SECRET), true);

  assert.strictEqual(
    resolveHttpEndpoint({ baseUrl: 'https://api.example.com' }),
    'https://api.example.com/v1/chat/completions'
  );
  assert.strictEqual(
    resolveHttpEndpoint({ baseUrl: 'https://api.example.com/v1/' }),
    'https://api.example.com/v1/chat/completions'
  );
  assert.strictEqual(
    resolveHttpEndpoint({
      relay: 'https://relay.example/v1/chat/completions',
      baseUrl: 'https://api.example.com',
    }),
    'https://relay.example/v1/chat/completions'
  );
  assert.strictEqual(
    resolveHttpEndpoint({ relay: 'not-a-url', baseUrl: 'https://api.example.com/' }),
    'https://api.example.com/v1/chat/completions'
  );
  assert.strictEqual(resolveHttpEndpoint({ relay: 'label-only' }), null);
  assert.strictEqual(resolveHttpEndpoint({ baseUrl: 'file:///tmp/x' }), null);

  assert.strictEqual(
    classifyTransport({ baseUrl: 'https://api.example.com', apiKey: SECRET }),
    'live'
  );
  assert.strictEqual(
    classifyTransport({ baseUrl: 'https://api.example.com', apiKey: 'mock-key:doubao' }),
    'mock'
  );
  assert.strictEqual(classifyTransport({ apiKey: SECRET }), 'mock');

  // --- success: baseUrl → /v1/chat/completions, text mapped into RawAnswer ---
  const seen = [];
  const okServer = await listen(async (req, res) => {
    const body = await readBody(req);
    seen.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization || '',
      body,
    });
    res.writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'req_ok_1' });
    res.end(
      chat('综合参考：\n1. 君乐宝\n2. 飞鹤\n君乐宝口碑不错，推荐指数较高。')
    );
  });
  const logs = [];
  const originals = ['log', 'info', 'warn', 'error', 'debug'].map((level) => {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      orig(...args);
    };
    return () => {
      console[level] = orig;
    };
  });

  try {
    const base = originOf(okServer);
    const httpAdapter = createHttpAdapter();
    const prompt = '哪款奶粉更适合婴儿';
    const raw = await httpAdapter.fetchRaw({
      task_id: 'http_unit_ok',
      prompt,
      brand: '君乐宝',
      platformId: 'doubao',
      modeId: 'web_fast',
      baseUrl: base,
      credential_ref: 'cred_doubao_mock',
      apiKey: SECRET,
    });
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].method, 'POST');
    assert.strictEqual(seen[0].url, '/v1/chat/completions');
    assert.strictEqual(seen[0].authorization, `Bearer ${SECRET}`);
    const sent = JSON.parse(seen[0].body);
    assert.strictEqual(sent.model, 'doubao');
    assert.strictEqual(sent.stream, false);
    assert.strictEqual(sent.messages[0].role, 'user');
    assert.strictEqual(sent.messages[0].content, prompt);
    assert.strictEqual(raw.adapter, 'http');
    assert.strictEqual(raw.platform_id, 'doubao');
    assert.strictEqual(raw.platform, '豆包');
    assert.strictEqual(raw.mode, 'web_fast');
    assert.strictEqual(raw.http_status, 200);
    assert.strictEqual(raw.request_id, 'req_ok_1');
    assert.ok(raw.raw_text.includes('1. 君乐宝'));
    assert.ok(!JSON.stringify(raw).includes(SECRET));
    assert.ok(!('apiKey' in raw));
    const parsed = parseRawList([raw], {
      prompt,
      brand: '君乐宝',
      task_id: 'http_unit_ok',
      date: '2026-11-20',
    });
    assert.ok(Array.isArray(parsed) && parsed.length >= 1);

    seen.length = 0;
    await httpAdapter.fetchRaw({
      task_id: 'http_unit_relay',
      prompt: 'relay',
      platformId: 'doubao',
      modeId: 'web_fast',
      relay: `${base}/custom/relay`,
      baseUrl: `${base}/ignored`,
      apiKey: SECRET,
      model: 'doubao-pro',
    });
    assert.strictEqual(seen[0].url, '/custom/relay');
    assert.strictEqual(JSON.parse(seen[0].body).model, 'doubao-pro');

    seen.length = 0;
    await httpAdapter.fetchRaw({
      task_id: 'http_unit_v1',
      prompt: 'v1 base',
      platformId: 'doubao',
      modeId: 'web_fast',
      baseUrl: `${base}/v1`,
      apiKey: SECRET,
    });
    assert.strictEqual(seen[0].url, '/v1/chat/completions');

    seen.length = 0;
    await httpAdapter.fetchRaw({
      task_id: 'http_unit_trim',
      prompt: 'trim',
      platformId: 'doubao',
      modeId: 'web_fast',
      baseUrl: base,
      apiKey: `  ${SECRET}\n`,
    });
    assert.strictEqual(seen[0].authorization, `Bearer ${SECRET}`);
  } finally {
    originals.forEach((restore) => restore());
    await close(okServer);
  }
  assert.ok(logs.every((line) => !line.includes(SECRET)), 'secret leaked to console');

  // --- auth / rate limit / 5xx ---
  let mode = 'auth';
  const errServer = await listen(async (req, res) => {
    await readBody(req);
    if (mode === 'auth') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `invalid key ${SECRET}` } }));
      return;
    }
    if (mode === 'forbidden') {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'forbidden' } }));
      return;
    }
    if (mode === 'rate') {
      res.writeHead(429, { 'retry-after': '2' });
      res.end(JSON.stringify({ error: { message: 'slow down' } }));
      return;
    }
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'bad gateway' } }));
  });
  try {
    const base = originOf(errServer);
    const httpAdapter = createHttpAdapter();
    const ctx = {
      task_id: 'http_unit_err',
      prompt: '失败用例',
      platformId: 'doubao',
      modeId: 'web_fast',
      baseUrl: base,
      apiKey: SECRET,
    };
    await assert.rejects(() => httpAdapter.fetchRaw(ctx), (err) => {
      assert.ok(err instanceof AdapterError);
      assert.strictEqual(err.kind, KINDS.AUTH);
      assert.strictEqual(err.retryable, false);
      assert.strictEqual(err.adapterId, 'http');
      assert.ok(!err.message.includes(SECRET));
      return true;
    });
    mode = 'forbidden';
    await assert.rejects(() => httpAdapter.fetchRaw(ctx), (err) => {
      assert.strictEqual(err.kind, KINDS.AUTH);
      assert.strictEqual(err.retryable, false);
      return true;
    });
    mode = 'rate';
    await assert.rejects(() => httpAdapter.fetchRaw(ctx), (err) => {
      assert.strictEqual(err.kind, KINDS.RATE_LIMITED);
      assert.strictEqual(err.retryable, true);
      assert.strictEqual(err.retryAfterMs, 2000);
      assert.ok(!err.message.includes(SECRET));
      return true;
    });
    mode = 'down';
    await assert.rejects(() => httpAdapter.fetchRaw(ctx), (err) => {
      assert.strictEqual(err.kind, KINDS.TRANSIENT);
      assert.strictEqual(err.retryable, true);
      return true;
    });
  } finally {
    await close(errServer);
  }

  // --- placeholder secret never leaves mock, even with a baseUrl ---
  let leakedCall = 0;
  const trap = await listen(async (req, res) => {
    leakedCall += 1;
    await readBody(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(chat('should-not-run'));
  });
  try {
    const router = createPerPlatformAdapter({
      platformCatalog: platforms,
      resolveCredentials: () => ({ apiKey: 'mock-key:doubao', credential_ref: 'cred_doubao_mock' }),
    });
    const raw = await router.fetchRaw({
      task_id: 'stay_mock',
      prompt: '仍走 mock',
      brand: '君乐宝',
      platformId: 'doubao',
      modeId: 'web_fast',
      baseUrl: originOf(trap),
      credential_ref: 'cred_doubao_mock',
    });
    assert.strictEqual(leakedCall, 0);
    assert.strictEqual(raw.adapter, 'mock');
    assert.ok(String(raw.raw_text).includes('mock'));
  } finally {
    await close(trap);
  }

  // --- default fetchRawBatch: one configured platform live, sibling stays mock ---
  const batchHits = [];
  const batchServer = await listen(async (req, res) => {
    const body = await readBody(req);
    batchHits.push({ authorization: req.headers.authorization || '', body, url: req.url });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(chat('1. 君乐宝\n来自本地 mock HTTP，不是 mock 适配器。'));
  });

  const ref = apiMgmt.credentialRefFor('doubao');
  const prevCred = apiMgmt.vault.get(ref);
  const prevPlat = apiMgmt.platformConfig.get('doubao');
  const envName = 'GEO_HTTP_ADAPTER_TEST_KEY';
  const prevEnv = process.env[envName];
  apiMgmt.circuits.reset('doubao', ref);
  apiMgmt.circuits.reset('yuanbao', apiMgmt.credentialRefFor('yuanbao'));

  try {
    apiMgmt.vault.upsert({
      id: ref,
      platformId: 'doubao',
      secret_backend: 'env',
      secret_env: envName,
      status: 'active',
    });
    process.env[envName] = SECRET;
    const base = originOf(batchServer);
    apiMgmt.platformConfig.upsert('doubao', {
      baseUrl: base,
      relay: null,
      status: 'active',
    });

    const status = apiMgmt.getPlatformStatusList(platforms);
    const doubaoStatus = status.list.find((row) => row.platformId === 'doubao');
    const yuanbaoStatus = status.list.find((row) => row.platformId === 'yuanbao');
    assert.strictEqual(doubaoStatus.transport, 'live');
    assert.strictEqual(yuanbaoStatus.transport, 'mock');
    assert.ok(!JSON.stringify(status).includes(SECRET));

    const batch = await fetchRawBatch({
      task_id: `http_batch_${Date.now()}`,
      prompt: '批量里只有豆包打真 HTTP',
      brand: '君乐宝',
      platforms: [
        { platformId: 'doubao', modeId: 'web_fast' },
        { platformId: 'yuanbao', modeId: 'web_fast' },
      ],
      platformCatalog: platforms,
      schedulerConfig: {
        max_attempts: 1,
        base_backoff_ms: 5,
        max_backoff_ms: 20,
        rate_limit: { capacity: 50, refill_per_sec: 100 },
        task_deadline_ms: 10000,
      },
    });

    assert.strictEqual(batchHits.length, 1);
    assert.strictEqual(batchHits[0].url, '/v1/chat/completions');
    assert.strictEqual(batchHits[0].authorization, `Bearer ${SECRET}`);
    const doubaoRaw = batch.rawList.find((r) => r.platform_id === 'doubao');
    const yuanbaoRaw = batch.rawList.find((r) => r.platform_id === 'yuanbao');
    assert.strictEqual(doubaoRaw.adapter, 'http');
    assert.ok(doubaoRaw.raw_text.includes('本地 mock HTTP'));
    assert.ok(!doubaoRaw._failed);
    assert.strictEqual(yuanbaoRaw.adapter, 'mock');
    assert.ok(String(yuanbaoRaw.raw_text).includes('mock'));
    const dumped = JSON.stringify(batch);
    assert.ok(!dumped.includes(SECRET));
    assert.ok(!dumped.includes('"apiKey"'));

    const taskId = `http_scan_${Date.now()}`;
    store.saveRaw(taskId, batch.rawList);
    const rawFile = path.join(
      __dirname,
      '..',
      '..',
      '..',
      '.data',
      'pipeline',
      taskId,
      'raw'
    );
    const files = fs.readdirSync(rawFile).filter((name) => name.endsWith('.json'));
    assert.ok(files.length >= 1);
    for (const name of files) {
      const disk = fs.readFileSync(path.join(rawFile, name), 'utf8');
      assert.ok(!disk.includes(SECRET), `secret leaked into ${name}`);
    }
  } finally {
    await close(batchServer);
    if (prevCred) {
      apiMgmt.vault.upsert({
        id: prevCred.id,
        platformId: prevCred.platformId,
        label: prevCred.label,
        secret_backend: prevCred.secret_backend,
        secret_env: prevCred.secret_env,
        secret_file: prevCred.secret_file,
        status: prevCred.status,
        rpm_limit: prevCred.rpm_limit,
        daily_quota: prevCred.daily_quota,
        relay: prevCred.relay,
        baseUrl: prevCred.baseUrl,
      });
    }
    if (prevPlat) {
      apiMgmt.platformConfig.upsert('doubao', {
        baseUrl: prevPlat.baseUrl,
        relay: prevPlat.relay,
        status: prevPlat.status,
        adapter_mode: prevPlat.adapter_mode,
        credential_ref: prevPlat.credential_ref,
        model: prevPlat.model || null,
      });
    }
    if (prevEnv == null) delete process.env[envName];
    else process.env[envName] = prevEnv;
    apiMgmt.circuits.reset('doubao', ref);
  }

  // --- 401 through the default batch trips the circuit; secret stays off disk ---
  const authHits = [];
  const authServer = await listen(async (req, res) => {
    await readBody(req);
    authHits.push(req.headers.authorization || '');
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `nope ${SECRET}` } }));
  });
  const prevCred2 = apiMgmt.vault.get(ref);
  const prevPlat2 = apiMgmt.platformConfig.get('doubao');
  const prevEnv2 = process.env[envName];
  apiMgmt.circuits.reset('doubao', ref);
  try {
    apiMgmt.vault.upsert({
      id: ref,
      platformId: 'doubao',
      secret_backend: 'env',
      secret_env: envName,
      status: 'active',
    });
    process.env[envName] = SECRET;
    apiMgmt.platformConfig.upsert('doubao', {
      baseUrl: originOf(authServer),
      relay: null,
      status: 'active',
    });
    const batch = await fetchRawBatch({
      task_id: `http_auth_${Date.now()}`,
      prompt: '鉴权失败应熔断',
      brand: '君乐宝',
      platforms: [{ platformId: 'doubao', modeId: 'web_fast' }],
      platformCatalog: platforms,
      schedulerConfig: {
        max_attempts: 3,
        base_backoff_ms: 5,
        max_backoff_ms: 20,
        rate_limit: { capacity: 50, refill_per_sec: 100 },
        task_deadline_ms: 10000,
      },
    });
    assert.strictEqual(authHits.length, 1, 'AUTH must not retry');
    assert.ok(batch.errors.some((e) => e.error.kind === KINDS.AUTH));
    assert.ok(!JSON.stringify(batch).includes(SECRET));
    const failed = batch.rawList.find((r) => r.platform_id === 'doubao');
    assert.strictEqual(failed.adapter, 'http');
    assert.strictEqual(failed._failed, true);
    const circuit = apiMgmt.circuits.get('doubao', ref);
    assert.strictEqual(circuit.state, 'Open');
    const taskId = `http_auth_scan_${Date.now()}`;
    store.saveRaw(taskId, batch.rawList);
    const dir = path.join(__dirname, '..', '..', '..', '.data', 'pipeline', taskId);
    const walk = (folder) => {
      for (const name of fs.readdirSync(folder)) {
        const full = path.join(folder, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.json')) {
          assert.ok(!fs.readFileSync(full, 'utf8').includes(SECRET), full);
        }
      }
    };
    walk(dir);
  } finally {
    await close(authServer);
    if (prevCred2) {
      apiMgmt.vault.upsert({
        id: prevCred2.id,
        platformId: prevCred2.platformId,
        label: prevCred2.label,
        secret_backend: prevCred2.secret_backend,
        secret_env: prevCred2.secret_env,
        secret_file: prevCred2.secret_file,
        status: prevCred2.status,
        rpm_limit: prevCred2.rpm_limit,
        daily_quota: prevCred2.daily_quota,
        relay: prevCred2.relay,
        baseUrl: prevCred2.baseUrl,
      });
    }
    if (prevPlat2) {
      apiMgmt.platformConfig.upsert('doubao', {
        baseUrl: prevPlat2.baseUrl,
        relay: prevPlat2.relay,
        status: prevPlat2.status,
        adapter_mode: prevPlat2.adapter_mode,
        credential_ref: prevPlat2.credential_ref,
        model: prevPlat2.model || null,
      });
    }
    if (prevEnv2 == null) delete process.env[envName];
    else process.env[envName] = prevEnv2;
    apiMgmt.circuits.reset('doubao', ref);
  }

  console.log('http-adapter.test.js OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
