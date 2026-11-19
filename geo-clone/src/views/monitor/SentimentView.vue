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
        <div class="chart-head"><h3>情感得分趋势</h3></div>
        <div ref="trend" class="chart"></div>
      </div>
      <div class="card chart-card">
        <div class="chart-head"><h3>正/中/负结构</h3></div>
        <div ref="stack" class="chart"></div>
      </div>
    </div>

    <div class="card table-card">
      <div class="chart-head"><h3>分平台舆情</h3></div>
      <el-table :data="platforms" size="small" stripe>
        <el-table-column prop="platform" label="平台" width="120" />
        <el-table-column prop="sentiment_count" label="情感对话数" />
        <el-table-column prop="sentiment_score" label="好感度" />
        <el-table-column prop="positive_count" label="正面" />
        <el-table-column prop="neutral_count" label="中性" />
        <el-table-column prop="negative_count" label="负面" />
      </el-table>
    </div>

    <el-alert
      class="unknown-alert"
      type="info"
      :closable="false"
      title="口径说明"
      description="overview 字段对齐线上 sentiment_count / positive_count / sentiment_score 等；sentiment_score 算法与负面提及率分母仍为 unknown（字典 U-02 / SE-05）。正负计数由 mock 按比例派生。"
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
      charts: {},
    };
  },
  computed: {
    statCards() {
      const o = this.overview;
      const negRate = o.negative_mention_rate != null ? (100 * o.negative_mention_rate).toFixed(0) : '—';
      return [
        {
          key: 'score',
          label: '提及好感度',
          value: o.sentiment_score || '--',
          tip: METRIC_TIPS.sentimentScore,
          provisional: true,
        },
        {
          key: 'count',
          label: '情感对话数',
          value: o.sentiment_count || 0,
          suffix: '次',
          tip: METRIC_TIPS.sentimentCount,
        },
        {
          key: 'pos',
          label: '正面对话',
          value: o.positive_count || 0,
          tip: METRIC_TIPS.polarityCounts,
        },
        {
          key: 'neu',
          label: '中性对话',
          value: o.neutral_count || 0,
          tip: METRIC_TIPS.polarityCounts,
        },
        {
          key: 'neg',
          label: '负面对话',
          value: o.negative_count || 0,
          tip: METRIC_TIPS.polarityCounts,
        },
        {
          key: 'negRate',
          label: '负面提及率',
          value: negRate,
          suffix: '%',
          tip: METRIC_TIPS.negativeMentionRate,
          provisional: true,
        },
        {
          key: 'resPos',
          label: '正面引用文章',
          value: o.res_positive_count || 0,
          tip: 'res_positive_count（线上 overview 字段）',
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
      const [ov, trend, plats] = await Promise.all([
        http.post('/geo/sentiment/overview', body),
        http.post('/geo/sentiment/trend', body),
        http.post('/geo/sentiment/platforms', body),
      ]);
      this.overview = ov.data || {};
      this.trend = (trend.data && trend.data.series) || [];
      this.platforms = (plats.data && plats.data.list) || [];
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
    renderTrend() {
      const chart = this.ensureChart('trend', this.$refs.trend);
      if (!chart) return;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 16, top: 24, bottom: 32 },
        xAxis: { type: 'category', data: this.trend.map((x) => x.date) },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [
          {
            name: '好感度',
            type: 'line',
            smooth: true,
            itemStyle: { color: '#c9677d' },
            areaStyle: { color: 'rgba(201,103,125,0.12)' },
            data: this.trend.map((x) => x.sentiment_score),
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
