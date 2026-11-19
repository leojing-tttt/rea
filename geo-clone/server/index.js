const path = require('path');
const express = require('express');
const cors = require('cors');
const {
  platforms,
  seedHistory,
  ecommerceRanking,
  referenceSources,
  createMockTaskResult,
  monitorBrands,
  monitorDialogs,
  monitorProgress,
  mentionHeatmap,
  referTrend,
} = require('./mock-data');
const { computeOverview } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

/** @type {Map<string, { token: string, phone: string, name: string, points: number }>} */
const sessions = new Map();
/** @type {Array<object>} */
let history = [...seedHistory];
/** @type {Map<string, object>} */
const tasks = new Map();

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
  res.json(ok({ service: 'a3geo-clone-mvp-monitor', ts: Date.now() }));
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

  const taskId = `task_${Date.now()}`;
  const createdAt = formatNow();
  const task = {
    task_id: taskId,
    prompt: String(prompt).trim(),
    word: brand ? String(brand).trim() : '',
    created_at: createdAt,
    status: 'running',
    platforms: selected,
    results: [],
    points_cost: cost,
  };
  tasks.set(taskId, task);

  // Async mock completion
  setTimeout(() => {
    const done = createMockTaskResult(task);
    tasks.set(taskId, done);
    history = [
      {
        task_id: done.task_id,
        prompt: done.prompt,
        word: done.word,
        created_at: done.created_at,
        isExample: false,
        status: 'done',
        platform_count: done.platforms.length,
      },
      ...history,
    ].slice(0, 50);
  }, 1600);

  res.json(ok({ task_id: taskId, points: req.user.points, points_cost: cost }));
});

app.get('/api/geo/task/:id', auth, (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.json(fail(404, '任务不存在'));
  res.json(ok(task));
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
    dialogs: monitorDialogs,
    brandId: brand.id,
    brandName: brand.name,
    competitorBrandIds: brand.competitors || [],
  });
  res.json(ok(overview));
});

app.post('/api/geo/rf/refer_rate_heatmap', auth, (req, res) => {
  const brandPlanId = (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
  const brand = monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
  res.json(ok(mentionHeatmap({ brandName: brand.name, dialogs: monitorDialogs, brandPlanId: brand.id })));
});

app.post('/api/geo/rf/refer_trend', auth, (req, res) => {
  const brandPlanId = (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
  const brand = monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
  res.json(ok({ series: referTrend({ brandName: brand.name, dialogs: monitorDialogs, brandPlanId: brand.id }) }));
});

app.post('/api/geo/rf/sov_trend', auth, (req, res) => {
  const brandPlanId = (req.body && req.body.brand_plan_id) || monitorBrands[0].id;
  const brand = monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
  const pool = monitorDialogs.filter((d) => d.brand_plan_id === brand.id);
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
  const pool = monitorDialogs.filter((d) => d.brand_plan_id === brand.id);
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

function formatNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
