/**
 * Optional live UC smoke. Requires env password — never prints it.
 *
 *   GEO_AUTH_MODE=uc \
 *   USER_CENTER_BASE_URL=https://test-api.a3database.cn \
 *   USER_CENTER_TEST_EMAIL=lei.jing@a3group.cn \
 *   USER_CENTER_TEST_PASSWORD=*** \
 *   node server/auth/uc-smoke.js
 *
 * Exit 0 on success; skip (exit 0) if password unset.
 */

const { UcClient, redact } = require('./uc-client');

async function main() {
  const baseUrl = process.env.USER_CENTER_BASE_URL || 'https://test-api.a3database.cn';
  const email = process.env.USER_CENTER_TEST_EMAIL || 'lei.jing@a3group.cn';
  const password = process.env.USER_CENTER_TEST_PASSWORD;

  if (!password) {
    console.log('uc-smoke SKIP: USER_CENTER_TEST_PASSWORD not set');
    return;
  }

  const client = new UcClient({ baseUrl });
  console.log('uc-smoke: login', { baseUrl, email: redact(email) });
  const { token } = await client.userLogin({ email, password });
  console.log('uc-smoke: got token', { token: redact(token) });

  const info = await client.info(token);
  console.log('uc-smoke: info', {
    userId: info && (info.userId || info.id),
    email: info && info.email,
    name: (info && (info.nickname || info.realName || info.username)) || null,
  });

  const verified = await client.dspLogin(token);
  console.log('uc-smoke: dspLogin ok', {
    userId: verified && (verified.userId || verified.id),
  });

  console.log('uc-smoke OK');
}

main().catch((err) => {
  console.error('uc-smoke FAIL', err.message || err);
  process.exit(1);
});
