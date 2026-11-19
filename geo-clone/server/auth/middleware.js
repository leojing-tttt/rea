/**
 * Auth middleware: mock sessions OR UC JWT via dspLogin.
 */

const { authMode, mapUcUser } = require('./uc-client');
const { mockCredits } = require('./mock-credits');

function stripBearer(raw) {
  return String(raw || '').replace(/^Bearer\s+/i, '').trim();
}

/**
 * @param {{ sessions: Map, ucClient: object, fail: Function }} deps
 */
function createAuthMiddleware(deps) {
  const { sessions, ucClient, fail } = deps;

  return async function auth(req, res, next) {
    const token = stripBearer(req.headers.authorization || '');
    if (!token) {
      return res.json(fail(401, '请先登录'));
    }

    const mode = authMode();

    if (mode === 'mock') {
      const session = sessions.get(token);
      if (!session) {
        return res.json(fail(401, '请先登录'));
      }
      session.points = mockCredits.get(session);
      req.user = session;
      return next();
    }

    // uc mode
    try {
      let session = sessions.get(token);
      const ucUser = await ucClient.verify(token);
      if (!ucUser) {
        sessions.delete(token);
        return res.json(fail(401, '登录已失效'));
      }
      if (!session) {
        session = mapUcUser(ucUser, { token });
        sessions.set(token, session);
      } else {
        // refresh profile fields; keep local mock points
        const mapped = mapUcUser(ucUser, { token, points: session.points });
        Object.assign(session, mapped);
      }
      session.points = mockCredits.get(session);
      req.user = session;
      return next();
    } catch (err) {
      if (err.code === 'UC_CONFIG') {
        return res.json(fail(500, err.message));
      }
      return res.json(fail(401, err.message || '登录已失效'));
    }
  };
}

module.exports = { createAuthMiddleware, stripBearer };
