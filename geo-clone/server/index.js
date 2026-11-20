const path = require('path');
const express = require('express');
const cors = require('cors');
const {
  platforms,
  seedHistory,
  ecommerceRanking,
  referenceSources,
  monitorBrands,
  monitorProgress,
} = require('./mock-data');
const { computeOverview } = require('./metrics');
const monitorPages = require('./monitor-pages');
const monitorRemain = require('./monitor-remain');
const pipeline = require('./pipeline');
const monitorBridge = require('./pipeline/monitor-bridge');
const apiMgmt = require('./pipeline/api-mgmt');
const {
  authMode,
  UcClient,
  mapUcUser,
  createAuthMiddleware,
  stripBearer,
  mockCredits,
} = require('./auth');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

/** @type {Map<string, { token: string, phone?: string, email?: string, name: string, points: number, uid?: string }>} */
const sessions = new Map();
/** @type {Array<object>} */
let history = [...seedHistory];

const ucClient = new UcClient({
  baseUrl: process.env.USER_CENTER_BASE_URL,
});

function brandPlanIdFrom(req) {
  return (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
}

function ok(data, msg = 'ok') {
  return { code: 200, msg, data };
}

function fail(code, msg) {
  return { code, msg, data: null };
}

const auth = createAuthMiddleware({ sessions, ucClient, fail });

function publicUser(session) {
  const phone = session.phone
    ? String(session.phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
    : null;
  return {
    name: session.name,
    phone,
    email: session.email || null,
    points: mockCredits.get(session),
    vip: session.vip || '企业版',
    source: session.source || (authMode() === 'uc' ? 'uc' : 'mock'),
  };
}

app.get('/api/health', (_req, res) => {
  res.json(
    ok({
      service: 'a3geo-clone-pipeline',
      ts: Date.now(),
      auth_mode: authMode(),
    })
  );
});

app.get('/api/auth/config', (_req, res) => {
  res.json(
    ok({
      mode: authMode(),
      user_center_configured: Boolean(process.env.USER_CENTER_BASE_URL),
      login_fields: authMode() === 'uc' ? ['email', 'password'] : ['phone', 'password'],
    })
  );
});

app.get('/api/platforms', (_req, res) => {
  // Extended with health/quota metadata (additive; original fields preserved)
  res.json(ok(apiMgmt.getPlatformsExtended(platforms)));
});

app.post('/api/user/login', async (req, res) => {
  const mode = authMode();
  const body = req.body || {};

  if (mode === 'uc') {
    const email = body.email || body.username || body.phone;
    const password = body.password;
    if (!email || !String(email).includes('@')) {
      return res.json(fail(400, '请输入邮箱'));
    }
    if (!password || String(password).length < 1) {
      return res.json(fail(400, '请输入密码'));
    }
    try {
      const { token } = await ucClient.userLogin({ email, password });
      let profile = null;
      try {
        profile = await ucClient.info(token);
      } catch (_) {
        profile = await ucClient.dspLogin(token);
      }
      const session = mapUcUser(profile || { email, username: String(email).split('@')[0] }, {
        token,
      });
      mockCredits.ensure(session);
      session.points = mockCredits.get(session);
      sessions.set(token, session);
      return res.json(
        ok({
          token,
          uid: session.uid,
          user: publicUser(session),
        })
      );
    } catch (err) {
      const code = err.code === 'UC_CONFIG' || err.code === 'UC_NETWORK' ? 502 : 401;
      return res.json(fail(code, err.message || '登录失败'));
    }
  }

  // mock mode — phone login
  const { phone, password } = body;
  if (!phone || !/^1\d{10}$/.test(String(phone))) {
    return res.json(fail(400, '请输入正确手机号'));
  }
  if (!password || String(password).length < 6) {
    return res.json(fail(400, '密码需要至少6位'));
  }
  const token = `mock_${phone}_${Date.now()}`;
  const session = {
    token,
    phone: String(phone),
    uid: `uid_${phone}`,
    name: String(phone).slice(-4),
    points: mockCredits.defaultBalance,
    source: 'mock',
    vip: '企业版',
  };
  mockCredits.set(session, mockCredits.defaultBalance);
  sessions.set(token, session);
  res.json(
    ok({
      token,
      uid: session.uid,
      user: publicUser(session),
    })
  );
});

app.get('/api/user/info', auth, (req, res) => {
  res.json(ok(publicUser(req.user)));
});

app.post('/api/user/logout', async (req, res) => {
  const token = stripBearer(req.headers.authorization || '');
  if (token) {
    sessions.delete(token);
    if (authMode() === 'uc') {
      ucClient.clearVerifyCache(token);
      await ucClient.logout(token);
    }
  }
  res.json(ok({ logged_out: true }));
});

app.get('/api/geo/history', (req, res) => {
  const token = stripBearer(req.headers.authorization || '');
  const loggedIn = token && sessions.has(token);
  const list = loggedIn ? history : seedHistory.filter((h) => h.isExample);
  res.json(ok({ result: list }));
});

/**
 * Search task → mock pipeline: 存原文 → 解析 → 聚合
 * (replaces one-shot createMockTaskResult)
 */
app.post('/api/geo/begin', auth, (req, res) => {
  const { prompt, brand, platforms: selected = [] } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.json(fail(400, '请输入AI问题'));
  }
  if (!Array.isArray(selected) || selected.length === 0) {
    return res.json(fail(400, '至少选择一个平台'));
  }

  const cost = Math.max(1, selected.length) * 2;
  const idempotent = req.body && req.body.idempotent !== false;

  // Idempotent replay: same prompt+brand+platforms → reuse done task (no re-charge)
  const existingKey = pipeline.idempotencyKey({ prompt, brand, platforms: selected });
  const prior = idempotent ? pipeline.store.findByIdempotency(existingKey) : null;
  if (prior && prior.status === 'done') {
    return res.json(
      ok({
        task_id: prior.task_id,
        points: req.user.points,
        points_cost: 0,
        idempotent_hit: true,
      })
    );
  }

  // Points stay mock (not UC RBAC points)
  const deducted = mockCredits.ensureAndDeduct(req.user, cost);
  if (!deducted.ok) {
    return res.json(fail(402, '积分不足'));
  }
  req.user.points = deducted.points;

  const task = pipeline.createTask({
    prompt,
    brand,
    platforms: selected,
    points_cost: cost,
    idempotent,
  });

  if (task._idempotent_hit && task.status === 'done') {
    mockCredits.set(req.user, deducted.points + cost);
    req.user.points = mockCredits.get(req.user);
    return res.json(
      ok({
        task_id: task.task_id,
        points: req.user.points,
        points_cost: 0,
        idempotent_hit: true,
      })
    );
  }

  // Async worker (light in-process queue); resume-safe
  if (!task._in_flight) {
    setTimeout(() => {
      pipeline
        .runPipeline(task, { stepDelayMs: 250 })
        .then((done) => {
          history = [
            {
              task_id: done.task_id,
              prompt: done.prompt,
              word: done.word,
              created_at: done.created_at,
              isExample: false,
              status: 'done',
              platform_count: done.platforms.length,
              pipeline_stage: 'done',
            },
            ...history.filter((h) => h.task_id !== done.task_id),
          ].slice(0, 50);
        })
        .catch((err) => {
          const failed = pipeline.store.getTask(task.task_id) || task;
          failed.status = 'failed';
          failed.error = String(err && err.message ? err.message : err);
          pipeline.store.saveTask(failed);
        });
    }, 100);
  }

  res.json(ok({ task_id: task.task_id, points: req.user.points, points_cost: cost }));
});

app.get('/api/geo/task/:id', auth, (req, res) => {
  const task = pipeline.store.getTask(req.params.id);
  if (!task) return res.json(fail(404, '任务不存在'));
  res.json(ok(task));
});

/** Inspect pipeline artifacts (task / raw / parsed / aggregate) */
app.get('/api/geo/pipeline/task/:id', auth, (req, res) => {
  const snap = pipeline.getPipelineSnapshot(req.params.id);
  if (!snap) return res.json(fail(404, '任务不存在'));
  res.json(ok(snap));
});

app.get('/api/geo/pipeline/tasks', auth, (_req, res) => {
  res.json(ok({ list: pipeline.store.listTasks() }));
});

app.get('/api/rank/ecommerce', (_req, res) => {
  const { industry = '服装', platform = '全部平台' } = _req.query;
  res.json(ok(ecommerceRanking({ industry, platform })));
});

app.get('/api/rank/reference-sources', (_req, res) => {
  res.json(ok(referenceSources()));
});

/** Brand monitor — list plans */
app.get('/api/geo/brand/list', auth, (_req, res) => {
  res.json(ok({ list: monitorBrands }));
});

app.get('/api/geo/monitor/progress_today', auth, (_req, res) => {
  res.json(ok(monitorProgress()));
});

/**
 * Brand mentions — pipeline-primary dialog pool via monitor-bridge.
 * Body: { brand_plan_id }
 */
app.post('/api/geo/rf/overview', auth, (req, res) => {
  res.json(ok(monitorBridge.brandMentionsOverview(brandPlanIdFrom(req))));
});

app.post('/api/geo/rf/refer_rate_heatmap', auth, (req, res) => {
  res.json(ok(monitorBridge.brandMentionsHeatmap(brandPlanIdFrom(req))));
});

app.post('/api/geo/rf/refer_trend', auth, (req, res) => {
  res.json(ok(monitorBridge.brandMentionsReferTrend(brandPlanIdFrom(req))));
});

app.post('/api/geo/rf/sov_trend', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const brand = monitorBrands.find((b) => b.id === id) || monitorBrands[0];
  const { dialogs, _pipeline } = monitorBridge.combinedDialogs(brand);
  const pool = dialogs.filter((d) => d.brand_plan_id === brand.id);
  const dates = [...new Set(pool.map((d) => d.date))].sort();
  const series = dates.map((date) => {
    const day = pool.filter((d) => d.date === date);
    const overview = computeOverview({
      dialogs: day,
      brandId: brand.id,
      brandName: brand.name,
      competitorBrandIds: brand.competitors || [],
    });
    return { date, sov: overview.sov, valid_rank_count: overview.valid_rank_count };
  });
  res.json(ok({ series, _pipeline }));
});

app.post('/api/geo/rf/avg_refer_rank', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const brand = monitorBrands.find((b) => b.id === id) || monitorBrands[0];
  const { dialogs, _pipeline } = monitorBridge.combinedDialogs(brand);
  const pool = dialogs.filter((d) => d.brand_plan_id === brand.id);
  const dates = [...new Set(pool.map((d) => d.date))].sort();
  const series = dates.map((date) => {
    const day = pool.filter((d) => d.date === date);
    const ranks = [];
    for (const d of day) {
      const hits = (d.mentions || []).filter((m) => m.brand === brand.name);
      if (hits.length) ranks.push(Math.min(...hits.map((m) => m.rank)));
    }
    const avg = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0;
    return { date, avg_rank: Number(avg.toFixed(2)), valid_rank_count: ranks.length };
  });
  res.json(ok({ series, _pipeline }));
});

/** AI 引用来源 — pipeline-merged citations */
app.post('/api/geo/resource/statistics', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorPages.resourceStatistics(id);
  const articles = (monitorPages.resourceArticleList(id).list || []);
  res.json(ok(monitorBridge.mergeResourceStatistics(seed, id, articles)));
});

app.post('/api/geo/resource/statistics/site_category', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorPages.resourceSiteCategory(id);
  const articles = (monitorPages.resourceArticleList(id).list || []);
  res.json(ok(monitorBridge.mergeSiteCategory(seed, id, articles)));
});

app.post('/api/geo/resource/statistics/platform_site', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorPages.resourceSiteRanking(id);
  const articles = (monitorPages.resourceArticleList(id).list || []);
  res.json(ok(monitorBridge.mergeSiteRanking(seed, id, articles)));
});

app.post('/api/geo/resource/list', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorPages.resourceArticleList(id);
  res.json(ok(monitorBridge.mergeArticleList(seed.list || [], id)));
});

/** 舆情 — pipeline-primary when dialogs exist */
app.post('/api/geo/sentiment/overview', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorPages.sentimentOverview(id);
  res.json(ok(monitorBridge.mergeSentimentOverview(seed, id)));
});

app.post('/api/geo/sentiment/trend', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorPages.sentimentTrend(id);
  res.json(ok(monitorBridge.mergeSentimentTrend(seed, id)));
});

app.post('/api/geo/sentiment/platforms', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorPages.sentimentPlatforms(id);
  res.json(ok(monitorBridge.mergeSentimentPlatforms(seed, id)));
});

/** 数据大盘 — pipeline-primary metrics */
app.post('/api/geo/dashboard/overview', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorPages.dashboardOverview(id);
  res.json(ok(monitorBridge.dashboardFromPipeline(id, seed)));
});

app.post('/api/geo/dashboard/platforms', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorPages.dashboardPlatforms(id);
  res.json(ok(monitorBridge.dashboardPlatformsFromPipeline(id, seed.list || [])));
});

/** AI 对话记录 — pipeline rows first */
app.post('/api/geo/monitor/monitor_record', auth, (req, res) => {
  const id = brandPlanIdFrom(req);
  const seed = monitorRemain.dialogRecords(id);
  res.json(ok(monitorBridge.mergeDialogRecords(seed, id)));
});

/** Settings / toolbox helpers */
app.get('/api/geo/pipeline/summary', auth, (_req, res) => {
  const tasks = pipeline.store.listTasks();
  res.json(
    ok({
      task_count: tasks.length,
      done_count: tasks.filter((t) => t.status === 'done').length,
      citation_count: pipeline.store.allCitations().length,
      dialog_count: pipeline.store.allParsedDialogs().length,
      recent: tasks.slice(0, 8).map((t) => ({
        task_id: t.task_id,
        prompt: t.prompt,
        word: t.word,
        status: t.status,
        stage: t.pipeline && t.pipeline.stage,
        created_at: t.created_at,
      })),
    })
  );
});

/** Scheduler / platform status (P1–P3: vault + circuit) */
app.get('/api/geo/scheduler/status', auth, (_req, res) => {
  res.json(
    ok({
      implementation: 'in-process',
      adapter_mode: 'per-platform',
      defaults: {
        max_inflight_jobs: 8,
        per_platform_inflight: 2,
        max_attempts: 3,
      },
      circuits: apiMgmt.circuits.snapshot(),
    })
  );
});

app.get('/api/geo/platform_status', auth, (_req, res) => {
  res.json(ok(apiMgmt.getPlatformStatusList(platforms)));
});

/** Admin: platform API config (metadata only — no secrets in body) */
app.get('/api/geo/platform_config', auth, (_req, res) => {
  res.json(ok({ list: apiMgmt.platformConfig.list() }));
});

app.put('/api/geo/platform_config/:platformId', auth, (req, res) => {
  try {
    const updated = apiMgmt.platformConfig.upsert(req.params.platformId, req.body || {});
    res.json(ok(updated));
  } catch (err) {
    const code = err.code === 'SECRET_IN_BODY' ? 400 : 500;
    res.json(fail(code, err.message));
  }
});

/** Admin: credential metadata (env/file vault — never accept secret values) */
app.get('/api/geo/credentials', auth, (_req, res) => {
  res.json(ok({ list: apiMgmt.vault.list() }));
});

app.put('/api/geo/credentials/:id', auth, (req, res) => {
  try {
    const updated = apiMgmt.vault.upsert({ ...(req.body || {}), id: req.params.id });
    res.json(ok(updated));
  } catch (err) {
    const code = err.code === 'SECRET_IN_BODY' || err.code === 'VALIDATION' ? 400 : 500;
    res.json(fail(code, err.message));
  }
});

app.post('/api/geo/credentials', auth, (req, res) => {
  try {
    const updated = apiMgmt.vault.upsert(req.body || {});
    res.json(ok(updated));
  } catch (err) {
    const code = err.code === 'SECRET_IN_BODY' || err.code === 'VALIDATION' ? 400 : 500;
    res.json(fail(code, err.message));
  }
});

/** Admin: reset circuit for a platform credential */
app.post('/api/geo/circuit/reset', auth, (req, res) => {
  const { platformId, credential_ref } = req.body || {};
  if (!platformId || !credential_ref) {
    return res.json(fail(400, 'platformId and credential_ref required'));
  }
  res.json(ok(apiMgmt.circuits.reset(platformId, credential_ref)));
});

/** 作品引用追踪 — live: /geo/article_monitor/statistics + list */
app.post('/api/geo/article_monitor/statistics', auth, (req, res) => {
  const data = monitorRemain.contentOptimization(brandPlanIdFrom(req));
  res.json(ok(data.stats));
});

app.post('/api/geo/article_monitor/list', auth, (req, res) => {
  const data = monitorRemain.contentOptimization(brandPlanIdFrom(req));
  res.json(ok({ list: data.works, hotSites: data.hotSites, hotTags: data.hotTags }));
});

app.post('/api/geo/article_monitor/top', auth, (req, res) => {
  const data = monitorRemain.contentOptimization(brandPlanIdFrom(req));
  res.json(ok({ hotSites: data.hotSites, hotTags: data.hotTags }));
});

/** 品牌监测设置 */
app.get('/api/geo/brand/management', auth, (_req, res) => {
  res.json(ok(monitorRemain.brandManagementList()));
});

app.get('/api/geo/brand/detail/:id', auth, (req, res) => {
  res.json(ok(monitorRemain.brandPlanDetail(req.params.id)));
});

/** 导出数据与报告 */
app.post('/api/geo/report/history', auth, (req, res) => {
  res.json(ok(monitorRemain.reportHistory(brandPlanIdFrom(req))));
});

app.post('/api/geo/export/report_gen', auth, (req, res) => {
  res.json(ok(monitorRemain.reportGenerate(req.body || {})));
});

/** AI 问题库 */
app.post('/api/geo/question/library/list', auth, (req, res) => {
  res.json(ok(monitorRemain.questionLibrary(brandPlanIdFrom(req))));
});

if (isProd) {
  const dist = path.join(__dirname, '..', 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[a3geo-clone] API on http://127.0.0.1:${PORT}`);
});
