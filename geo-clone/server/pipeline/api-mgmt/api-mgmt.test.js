/**
 * P3: vault resolve, circuit transitions, platform_status shape, no secrets in .data/pipeline
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { CredentialVault } = require('./vault');
const { CircuitBreakerRegistry, STATES, HEALTH } = require('./circuit');
const { PlatformConfigStore } = require('./platform-config');
const { AdapterError, KINDS } = require('../adapters/errors');
const { fetchRawBatch } = require('../scheduler/fetch-raw-batch');
const { platforms } = require('../../mock-data');
const { store } = require('../store');

const tinyCatalog = [
  { id: 'doubao', name: '豆包', modes: [{ id: 'web_fast', label: '快速' }] },
  { id: 'yuanbao', name: '元宝', modes: [{ id: 'web_fast', label: '快速' }] },
];

async function main() {
  // --- vault: metadata only, resolve from env ---
  process.env.GEO_CRED_DOUBAO = 'super-secret-key-never-persist';
  const vault = new CredentialVault({ catalog: tinyCatalog });
  const listed = vault.list();
  assert.ok(listed.length >= 2);
  const doubaoCred = listed.find((c) => c.platformId === 'doubao');
  assert.ok(doubaoCred);
  assert.ok(!JSON.stringify(doubaoCred).includes('super-secret'));
  assert.strictEqual(doubaoCred.secret_env, 'GEO_CRED_DOUBAO');

  const resolved = vault.resolveCredentials(doubaoCred.id);
  assert.strictEqual(resolved.apiKey, 'super-secret-key-never-persist');
  assert.strictEqual(resolved.credential_ref, doubaoCred.id);
  assert.ok(resolved._ephemeral);

  // Reject secret in upsert body
  let threw = false;
  try {
    vault.upsert({ id: doubaoCred.id, platformId: 'doubao', apiKey: 'leak' });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'SECRET_IN_BODY');
  }
  assert.ok(threw, 'must reject secret in body');

  // Persist file must not contain secret value
  const credFile = path.join(__dirname, '..', '..', '..', '.data', 'api-mgmt', 'credentials.json');
  if (fs.existsSync(credFile)) {
    const disk = fs.readFileSync(credFile, 'utf8');
    assert.ok(!disk.includes('super-secret-key-never-persist'), 'secret must not be on disk');
  }

  // --- circuit: Closed → Open → Half-open → Closed ---
  let now = 1_000_000;
  const cb = new CircuitBreakerRegistry({
    failureThreshold: 2,
    openMs: 100,
    halfOpenMax: 1,
    now: () => now,
  });
  assert.strictEqual(cb.get('doubao', 'cred_a').state, STATES.CLOSED);
  assert.strictEqual(cb.get('doubao', 'cred_a').health, HEALTH.GREEN);

  cb.recordFailure('doubao', 'cred_a', { kind: 'TRANSIENT' });
  assert.strictEqual(cb.get('doubao', 'cred_a').state, STATES.CLOSED);
  cb.recordFailure('doubao', 'cred_a', { kind: 'TRANSIENT' });
  assert.strictEqual(cb.get('doubao', 'cred_a').state, STATES.OPEN);
  assert.strictEqual(cb.get('doubao', 'cred_a').health, HEALTH.RED);

  let gate = cb.allow('doubao', 'cred_a');
  assert.strictEqual(gate.allowed, false);
  assert.strictEqual(gate.reason, 'circuit_open');

  now += 150; // cool-down → Half-open
  gate = cb.allow('doubao', 'cred_a');
  assert.strictEqual(gate.allowed, true);
  assert.strictEqual(cb.get('doubao', 'cred_a').state, STATES.HALF_OPEN);
  assert.strictEqual(cb.get('doubao', 'cred_a').health, HEALTH.YELLOW);

  // second probe blocked while first inflight
  const gate2 = cb.allow('doubao', 'cred_a');
  assert.strictEqual(gate2.allowed, false);

  cb.recordSuccess('doubao', 'cred_a');
  assert.strictEqual(cb.get('doubao', 'cred_a').state, STATES.CLOSED);
  assert.strictEqual(cb.get('doubao', 'cred_a').health, HEALTH.GREEN);

  // Half-open failure → Open again
  cb.trip('yuanbao', 'cred_b', 'AUTH');
  now += 200;
  cb.allow('yuanbao', 'cred_b'); // enter half-open + take probe
  cb.recordFailure('yuanbao', 'cred_b', { kind: 'AUTH' });
  assert.strictEqual(cb.get('yuanbao', 'cred_b').state, STATES.OPEN);

  // --- platform config: relay/baseUrl for 中转站, no secrets ---
  const cfg = new PlatformConfigStore({ catalog: tinyCatalog });
  const updated = cfg.upsert('doubao', {
    rpm_limit: 30,
    daily_quota: 500,
    relay: 'https://relay.example/v1/chat',
    baseUrl: 'https://relay.example',
  });
  assert.strictEqual(updated.relay, 'https://relay.example/v1/chat');
  assert.strictEqual(updated.rpm_limit, 30);
  threw = false;
  try {
    cfg.upsert('doubao', { token: 'x' });
  } catch (e) {
    threw = e.code === 'SECRET_IN_BODY';
  }
  assert.ok(threw);

  // --- platform_status shape via facade (uses process singletons — reset first) ---
  const apiMgmt = require('./index');
  for (const p of tinyCatalog) {
    const ref = apiMgmt.credentialRefFor(p.id);
    apiMgmt.circuits.reset(p.id, ref);
  }
  const status = apiMgmt.getPlatformStatusList(tinyCatalog);
  assert.ok(Array.isArray(status.list));
  assert.ok(status.list.every((row) => ['GREEN', 'YELLOW', 'RED'].includes(row.state)));
  assert.ok(status.list.every((row) => row.credential_ref && !row.apiKey));

  // Trip one → RED
  const refD = apiMgmt.credentialRefFor('doubao');
  apiMgmt.circuits.trip('doubao', refD, 'test');
  const status2 = apiMgmt.getPlatformStatusList(tinyCatalog);
  const doubaoRow = status2.list.find((r) => r.platformId === 'doubao');
  assert.strictEqual(doubaoRow.state, 'RED');
  assert.strictEqual(doubaoRow.circuit, STATES.OPEN);

  // --- fetchRawBatch skips open circuit → partial; no secrets in pipeline dirs ---
  apiMgmt.circuits.reset('yuanbao', apiMgmt.credentialRefFor('yuanbao'));
  // doubao still open
  const batch = await fetchRawBatch({
    task_id: `api_mgmt_${Date.now()}`,
    prompt: '熔断跳过测试',
    brand: '君乐宝',
    platforms: [
      { platformId: 'doubao', modeId: 'web_fast' },
      { platformId: 'yuanbao', modeId: 'web_fast' },
    ],
    platformCatalog: platforms,
    schedulerConfig: {
      max_attempts: 1,
      rate_limit: { capacity: 50, refill_per_sec: 100 },
    },
  });
  assert.ok(batch.partial || batch.stats.skipped >= 1);
  assert.ok(batch.errors.some((e) => e.error.kind === KINDS.CIRCUIT_OPEN || e.skipped));
  assert.ok(batch.rawList.some((r) => r.platform_id === 'yuanbao' && !r._failed));
  // Job / raw must not carry secret
  const dumped = JSON.stringify(batch);
  assert.ok(!dumped.includes('super-secret-key-never-persist'));
  assert.ok(!dumped.includes('"apiKey"'));

  // Persist raw via store and scan .data/pipeline for secret leakage
  store.saveRaw(batch.rawList[0] && batch.task_id ? batch.task_id : `scan_${Date.now()}`, batch.rawList);
  // Explicit write under known task id
  const taskId = `vault_scan_${Date.now()}`;
  store.saveRaw(taskId, batch.rawList.map((r) => ({ ...r, task_id: taskId })));
  const pipelineRoot = path.join(__dirname, '..', '..', '..', '.data', 'pipeline');
  if (fs.existsSync(pipelineRoot)) {
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full);
        else if (name.endsWith('.json')) {
          const body = fs.readFileSync(full, 'utf8');
          assert.ok(
            !body.includes('super-secret-key-never-persist'),
            `secret leaked into ${full}`
          );
          assert.ok(!/"apiKey"\s*:\s*"super-secret/.test(body), `apiKey in ${full}`);
        }
      }
    };
    walk(pipelineRoot);
  }

  // CIRCUIT_OPEN not retryable
  const cErr = new AdapterError(KINDS.CIRCUIT_OPEN, 'open');
  assert.ok(!cErr.retryable);

  // Cleanup env
  delete process.env.GEO_CRED_DOUBAO;
  apiMgmt.circuits.reset('doubao', refD);

  console.log('api-mgmt.test.js OK', {
    vault_records: vault.list().length,
    status_count: status.list.length,
    skipped: batch.stats.skipped,
    partial: batch.partial,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
