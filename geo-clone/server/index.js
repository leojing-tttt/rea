const path = require('path');
const express = require('express');
const cors = require('cors');
const {
  platforms,
  seedHistory,
  ecommerceRanking,
  referenceSources,
  monitorBrands,
  monitorDialogs,
  monitorProgress,
  mentionHeatmap,
  referTrend,
} = require('./mock-data');
const { computeOverview } = require('./metrics');
const monitorPages = require('./monitor-pages');
const monitorRemain = require('./monitor-remain');
const pipeline = require('./pipeline');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

/** @type {Map<string, { token: string, phone: string, name: string, points: number }>} */
const sessions = new Map();
/** @type {Array<object>} */
let history = [...seedHistory];

/** Seed + pipeline-produced dialogs for monitor metric endpoints */
function dialogPool() {
  return pipeline.mergedDialogs(monitorDialogs);
}

function ok(data, msg = 'ok') {
  return { code: 200, msg, data };
}

function fail(code, msg) {
  return { code, msg, data: null };
}

function auth(req, res, next) {
  const token = req.headers.authorization || '';
  const session = sessions.get(token);
  if (!session) {
    return res.json(fail(401, '请先登录'));
  }
  req.user = session;
  next();
}

app.get('/api/health', (_req, res) => {
  res.json(ok({ service: 'a3geo-clone-pipeline', ts: Date.now() }));
});

app.get('/api/platforms', (_req, res) => {
  res.json(ok(platforms));
});

app.post('/api/user/login', (req, res) => {
  const { phone, password } = req.body || {};
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
    name: String(phone).slice(-4),
    points: 13321,
  };
  sessions.set(token, session);
  res.json(
    ok({
      token,
      uid: `uid_${phone}`,
      user: { name: session.name, phone: session.phone, points: session.points, vip: '企业版' },
    })
  );
});

app.get('/api/user/info', auth, (req, res) => {
  res.json(
    ok({
      name: req.user.name,
      phone: req.user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
      points: req.user.points,
      vip: '企业版',
    })
  );
});

app.get('/api/geo/history', (req, res) => {
  const token = req.headers.authorization || '';
  const loggedIn = sessions.has(token);
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
  if (req.user.points < cost) {
    return res.json(fail(402, '积分不足'));
  }
  req.user.points -= cost;

  const task = pipeline.createTask({
    prompt,
    brand,
    platforms: selected,
    points_cost: cost,
  });

  // Async worker (light in-process queue)
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
          ...history,
        ].slice(0, 50);
      })
      .catch((err) => {
        const failed = pipeline.store.getTask(task.task_id) || task;
        failed.status = 'failed';
        failed.error = String(err && err.message ? err.message : err);
        pipeline.store.saveTask(failed);
      });
  }, 100);

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
 * Aligns with live POST /dso/api/geo/rf/overview shape (0–1 rates).
 * Body: { brand_plan_id }
 */
app.post('/api/geo/rf/overview', auth, (req, res) => {
  const brandPlanId = (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
  const brand = monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
  const overview = computeOverview({
    dialogs: dialogPool(),
    brandId: brand.id,
    brandName: brand.name,
    competitorBrandIds: brand.competitors || [],
  });
  overview._meta = overview._meta || {};
  overview._meta.dialog_sources = ['seed', 'pipeline'];
  res.json(ok(overview));
});

app.post('/api/geo/rf/refer_rate_heatmap', auth, (req, res) => {
  const brandPlanId = (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
  const brand = monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
  res.json(ok(mentionHeatmap({ brandName: brand.name, dialogs: dialogPool(), brandPlanId: brand.id })));
});

app.post('/api/geo/rf/refer_trend', auth, (req, res) => {
  const brandPlanId = (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
  const brand = monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
  res.json(ok({ series: referTrend({ brandName: brand.name, dialogs: dialogPool(), brandPlanId: brand.id }) }));
});

app.post('/api/geo/rf/sov_trend', auth, (req, res) => {
  const brandPlanId = (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
  const brand = monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
  const pool = dialogPool().filter((d) => d.brand_plan_id === brand.id);
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
  res.json(ok({ series }));
});

app.post('/api/geo/rf/avg_refer_rank', auth, (req, res) => {
  const brandPlanId = (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
  const brand = monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
  const pool = dialogPool().filter((d) => d.brand_plan_id === brand.id);
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
  res.json(ok({ series }));
});

function brandPlanIdFrom(req) {
  return (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
}

/** AI 引用来源 — live: POST /dso/api/geo/resource/statistics */
app.post('/api/geo/resource/statistics', auth, (req, res) => {
  res.json(ok(monitorPages.resourceStatistics(brandPlanIdFrom(req))));
});

app.post('/api/geo/resource/statistics/site_category', auth, (req, res) => {
  res.json(ok(monitorPages.resourceSiteCategory(brandPlanIdFrom(req))));
});

app.post('/api/geo/resource/statistics/platform_site', auth, (req, res) => {
  res.json(ok(monitorPages.resourceSiteRanking(brandPlanIdFrom(req))));
});

app.post('/api/geo/resource/list', auth, (req, res) => {
  res.json(ok(monitorPages.resourceArticleList(brandPlanIdFrom(req))));
});

/** 舆情 — live: POST /dso/api/geo/sentiment/overview */
app.post('/api/geo/sentiment/overview', auth, (req, res) => {
  res.json(ok(monitorPages.sentimentOverview(brandPlanIdFrom(req))));
});

app.post('/api/geo/sentiment/trend', auth, (req, res) => {
  res.json(ok(monitorPages.sentimentTrend(brandPlanIdFrom(req))));
});

app.post('/api/geo/sentiment/platforms', auth, (req, res) => {
  res.json(ok(monitorPages.sentimentPlatforms(brandPlanIdFrom(req))));
});

/** 数据大盘 — brand_score + platform cards */
app.post('/api/geo/dashboard/overview', auth, (req, res) => {
  res.json(ok(monitorPages.dashboardOverview(brandPlanIdFrom(req))));
});

app.post('/api/geo/dashboard/platforms', auth, (req, res) => {
  res.json(ok(monitorPages.dashboardPlatforms(brandPlanIdFrom(req))));
});

/** AI 对话记录 — live: /geo/monitor/monitor_record */
app.post('/api/geo/monitor/monitor_record', auth, (req, res) => {
  res.json(ok(monitorRemain.dialogRecords(brandPlanIdFrom(req))));
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
