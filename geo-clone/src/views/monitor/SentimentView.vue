<template>
  <div class="sentiment-page">
    <div class="page-head">
      <h1>品牌舆情追踪</h1>
      <div class="progress">
        <span class="muted">今日任务进度：</span>
        <el-tag type="danger" effect="dark" size="mini">{{ progress.label || '—' }}</el-tag>
      </div>
    </div>

    <div class="filters card">
      <el-select v-model="brandPlanId" size="small" style="min-width: 280px" @change="reload">
        <el-option v-for="b in brands" :key="b.id" :label="b.planLabel" :value="b.id" />
      </el-select>
    </div>

    <div class="section-title">舆情概览</div>
    <div class="stats-grid">
      <div v-for="card in statCards" :key="card.key" class="stat card">
        <div class="stat-value">
          {{ card.value }}<small v-if="card.suffix">{{ card.suffix }}</small>
        </div>
        <div class="stat-label">
          {{ card.label }}
          <el-tooltip :content="card.tip" placement="top">
            <i class="el-icon-question"></i>
          </el-tooltip>
          <el-tag v-if="card.provisional" size="mini" type="warning" effect="plain">口径待确认</el-tag>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="card chart-card">
        <div class="chart-head"><h3>情感倾向趋势</h3></div>
        <div ref="trend" class="chart"></div>
      </div>
      <div class="card chart-card">
        <div class="chart-head"><h3>正/中/负结构</h3></div>
        <div ref="stack" class="chart"></div>
      </div>
    </div>

    <div class="card table-card">
      <div class="chart-head"><h3>平台舆情表现</h3></div>
      <el-table :data="platforms" size="small" stripe>
        <el-table-column prop="platform" label="平台" width="120" />
        <el-table-column prop="sentiment_count" label="情感对话数" />
        <el-table-column label="好感度" width="90">
          <template slot-scope="{ row }">{{ row.sentiment_score == null ? '—' : row.sentiment_score }}</template>
        </el-table-column>
        <el-table-column prop="positive_count" label="正面" />
        <el-table-column prop="neutral_count" label="中性" />
        <el-table-column prop="negative_count" label="负面" />
        <el-table-column label="正面情感" width="100">
          <template slot-scope="{ row }">{{ rateText(row.positive_rate) }}</template>
        </el-table-column>
      </el-table>
    </div>

    <div class="card table-card">
      <div class="chart-head"><h3>对话舆情记录</h3></div>
      <el-table :data="records" size="small" stripe max-height="360">
        <el-table-column prop="prompt" label="AI问题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="created_at" label="对话时间" width="160" />
        <el-table-column prop="platform" label="对话平台" width="110" />
        <el-table-column label="情感倾向" width="100">
          <template slot-scope="{ row }">{{ sentimentLabel(row.sentiment) }}</template>
        </el-table-column>
        <el-table-column label="好感度" width="80">
          <template slot-scope="{ row }">{{ row.sentiment_score == null ? '—' : row.sentiment_score }}</template>
        </el-table-column>
        <el-table-column prop="positive_word_hits" label="正面词" width="80" />
        <el-table-column prop="negative_word_hits" label="负面词" width="80" />
        <el-table-column prop="source_count" label="引用来源" width="90" />
      </el-table>
      <el-empty v-if="!records.length" description="暂无情感倾向记录" :image-size="80" />
    </div>

    <el-alert
      class="unknown-alert"
      type="info"
      :closable="false"
      title="口径说明"
      description="正面/中性/负面情感 = 对应对话数 ÷ 情感对话数（线上 calcSentimentRate）。好感度打分模型与负面提及率分母仍未知，不生成分数。正负词次数来自本地词表或种子标注。"
      show-icon
    />
  </div>
</template>

<script>
import * as echarts from 'echarts';
import http from '@/api/http';
import { METRIC_TIPS } from '@/utils/metricsDisplay';

export default {
  name: 'SentimentView',
  data() {
    return {
      brands: [],
      brandPlanId: '',
      progress: {},
      overview: {},
      trend: [],
      platforms: [],
      records: [],
      charts: {},
    };
  },
  computed: {
    statCards() {
      const o = this.overview;
      const pct = (rate) => (rate == null ? '—' : (100 * rate).toFixed(2));
      return [
        {
          key: 'score',
          label: '品牌提及好感度',
          value: o.sentiment_score == null ? '—' : o.sentiment_score,
          suffix: o.sentiment_score == null ? '' : '分',
          tip: METRIC_TIPS.sentimentScore,
          provisional: true,
        },
        {
          key: 'count',
          label: '提及品牌AI对话次数',
          value: o.sentiment_count || 0,
          suffix: '次',
          tip: METRIC_TIPS.sentimentCount,
        },
        {
          key: 'pos',
          label: '正面情感',
          value: pct(o.positive_rate),
          suffix: o.positive_rate == null ? '' : '%',
          tip: METRIC_TIPS.polarityRate,
        },
        {
          key: 'neu',
          label: '中性情感',
          value: pct(o.neutral_rate),
          suffix: o.neutral_rate == null ? '' : '%',
          tip: METRIC_TIPS.polarityRate,
        },
        {
          key: 'neg',
          label: '负面情感',
          value: pct(o.negative_rate),
          suffix: o.negative_rate == null ? '' : '%',
          tip: METRIC_TIPS.polarityRate,
        },
        {
          key: 'posWord',
          label: '对话提及正面词',
          value: o.positive_word_count || 0,
          tip: METRIC_TIPS.wordHits,
        },
        {
          key: 'negWord',
          label: '对话提及负面词',
          value: o.negative_word_count || 0,
          tip: METRIC_TIPS.wordHits,
        },
        {
          key: 'resNeg',
          label: '负面引用文章',
          value: o.res_negative_count || 0,
          tip: 'res_negative_count（线上 overview 字段）',
        },
      ];
    },
  },
  async created() {
    await this.bootstrap();
  },
  mounted() {
    window.addEventListener('resize', this.resize);
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resize);
    Object.values(this.charts).forEach((c) => c && c.dispose());
  },
  methods: {
    async bootstrap() {
      const brandsRes = await http.get('/geo/brand/list');
      this.brands = (brandsRes.data && brandsRes.data.list) || [];
      this.brandPlanId = (this.brands[0] && this.brands[0].id) || '';
      const prog = await http.get('/geo/monitor/progress_today');
      this.progress = prog.data || {};
      await this.reload();
    },
    async reload() {
      if (!this.brandPlanId) return;
      const body = { brand_plan_id: this.brandPlanId };
      const [ov, trend, plats, records] = await Promise.all([
        http.post('/geo/sentiment/overview', body),
        http.post('/geo/sentiment/trend', body),
        http.post('/geo/sentiment/platforms', body),
        http.post('/geo/monitor/monitor_record', body),
      ]);
      this.overview = ov.data || {};
      this.trend = (trend.data && trend.data.series) || [];
      this.platforms = (plats.data && plats.data.list) || [];
      this.records = ((records.data && records.data.list) || []).filter((r) => r.sentiment);
      this.$nextTick(() => {
        this.renderTrend();
        this.renderStack();
      });
    },
    ensureChart(key, el) {
      if (!el) return null;
      if (!this.charts[key]) this.charts[key] = echarts.init(el);
      return this.charts[key];
    },
    rateText(rate) {
      return rate == null ? '—' : `${(100 * rate).toFixed(2)}%`;
    },
    sentimentLabel(label) {
      return { positive: '正面', neutral: '中性', negative: '负面' }[label] || '—';
    },
    renderTrend() {
      const chart = this.ensureChart('trend', this.$refs.trend);
      if (!chart) return;
      const hasScore = this.trend.some((x) => x.sentiment_score != null);
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 16, top: 24, bottom: 32 },
        xAxis: { type: 'category', data: this.trend.map((x) => x.date) },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [
          {
            name: hasScore ? '好感度' : '正面情感',
            type: 'line',
            smooth: true,
            itemStyle: { color: '#c9677d' },
            areaStyle: { color: 'rgba(201,103,125,0.12)' },
            data: this.trend.map((x) =>
              hasScore ? x.sentiment_score : x.positive_rate == null ? null : Number((100 * x.positive_rate).toFixed(2))
            ),
          },
        ],
      });
    },
    renderStack() {
      const chart = this.ensureChart('stack', this.$refs.stack);
      if (!chart) return;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { top: 0 },
        grid: { left: 40, right: 16, top: 36, bottom: 32 },
        xAxis: { type: 'category', data: this.trend.map((x) => x.date) },
        yAxis: { type: 'value' },
        series: [
          {
            name: '正面',
            type: 'bar',
            stack: 'pol',
            data: this.trend.map((x) => x.positive_count),
            itemStyle: { color: '#2da87e' },
          },
          {
            name: '中性',
            type: 'bar',
            stack: 'pol',
            data: this.trend.map((x) => x.neutral_count),
            itemStyle: { color: '#94a3b8' },
          },
          {
            name: '负面',
            type: 'bar',
            stack: 'pol',
            data: this.trend.map((x) => x.negative_count),
            itemStyle: { color: '#c9677d' },
          },
        ],
      });
    },
    resize() {
      Object.values(this.charts).forEach((c) => c && c.resize());
    },
  },
};
</script>

<style lang="scss" scoped>
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  h1 {
    margin: 0;
    font-size: 22px;
  }
}
.progress {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px;
  margin-bottom: 14px;
}
.section-title {
  font-weight: 600;
  margin-bottom: 8px;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}
.stat {
  padding: 12px 10px;
  text-align: center;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  small {
    font-size: 12px;
    margin-left: 2px;
    color: #909399;
    font-weight: 500;
  }
}
.stat-label {
  margin-top: 6px;
  font-size: 12px;
  color: #5c6069;
  display: flex;
  gap: 4px;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  i {
    color: #c0c4cc;
    cursor: help;
  }
}
.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.chart-card,
.table-card {
  padding: 12px;
}
.chart-head h3 {
  margin: 0 0 8px;
  font-size: 14px;
}
.chart {
  height: 260px;
}
.unknown-alert {
  margin-top: 12px;
}
@media (max-width: 1100px) {
  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
