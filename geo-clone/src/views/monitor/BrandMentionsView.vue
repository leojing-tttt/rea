<template>
  <div class="mentions-page">
    <div class="page-head">
      <h1>品牌提及率和排名</h1>
      <div class="progress">
        <span class="muted">今日任务进度：</span>
        <el-tag type="danger" effect="dark" size="mini">{{ progress.label || '—' }}</el-tag>
        <span v-if="progress.total" class="muted">
          {{ progress.done }}/{{ progress.total }} ({{ progress.percent }}%)
        </span>
        <el-button size="mini" plain type="danger">额外执行N次任务</el-button>
      </div>
    </div>

    <div class="filters card">
      <el-select v-model="brandPlanId" size="small" style="min-width: 280px" @change="reload">
        <el-option v-for="b in brands" :key="b.id" :label="b.planLabel" :value="b.id" />
      </el-select>
      <el-select v-model="platformFilter" size="small" style="width: 140px">
        <el-option :label="`全部${progress.platform_count || 7}个平台`" value="all" />
      </el-select>
      <el-select v-model="questionFilter" size="small" style="width: 140px">
        <el-option label="全部问题" value="all" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        size="small"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
      />
    </div>

    <div class="section-title">数据概览</div>
    <div class="stats-grid">
      <div v-for="card in statCards" :key="card.key" class="stat card">
        <div class="stat-value">
          {{ card.value }}<small v-if="card.suffix">{{ card.suffix }}</small>
        </div>
        <div v-if="card.extra" class="stat-extra">{{ card.extra }}</div>
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
        <div class="chart-head">
          <h3>提及率热力图(问题 × 平台)</h3>
        </div>
        <div ref="heat" class="chart heat"></div>
      </div>
      <div class="card chart-card">
        <div class="chart-head">
          <h3>提及率趋势</h3>
          <el-button type="text" class="link">查看全部</el-button>
        </div>
        <div ref="trend" class="chart"></div>
      </div>
    </div>

    <div class="charts-row">
      <div class="card chart-card">
        <div class="chart-head"><h3>平均提及排名趋势</h3></div>
        <div ref="rankTrend" class="chart"></div>
      </div>
      <div class="card chart-card">
        <div class="chart-head"><h3>SOV 趋势</h3></div>
        <div ref="sovTrend" class="chart"></div>
      </div>
    </div>

    <el-alert
      class="unknown-alert"
      type="info"
      :closable="false"
      title="指标口径说明"
      description="提及率 / SOV / 平均排名 / 提及次数按产品 tip 计算。Top1/Top3 的「提及次数」按首位/首屏文案从排名派生；提及率分母与好感度打分模型仍未知，百分数标为口径待确认，好感度无上游分数时显示 —。"
      show-icon
    />
  </div>
</template>

<script>
import * as echarts from 'echarts';
import http from '@/api/http';
import { mapOverviewToStats, METRIC_TIPS } from '@/utils/metricsDisplay';

export default {
  name: 'BrandMentionsView',
  data() {
    return {
      brands: [],
      brandPlanId: '',
      platformFilter: 'all',
      questionFilter: 'all',
      dateRange: null,
      progress: {},
      apiOverview: {},
      stats: mapOverviewToStats({}),
      heatmap: { questions: [], platforms: [], cells: [] },
      referSeries: [],
      rankSeries: [],
      sovSeries: [],
      charts: {},
    };
  },
  computed: {
    statCards() {
      const s = this.stats;
      return [
        { key: 'ai', label: '对话次数', value: s.aiCount, suffix: '次', tip: METRIC_TIPS.aiCount },
        { key: 'valid', label: '提及品牌对话', value: s.validRankCount, suffix: '次', tip: METRIC_TIPS.validRankCount },
        { key: 'refer', label: '品牌提及率', value: s.referRate, suffix: '%', tip: METRIC_TIPS.referRate },
        { key: 'mc', label: '品牌提及次数', value: s.mentionCount, suffix: '次', tip: METRIC_TIPS.mentionCount },
        { key: 'sov', label: 'SOV', value: s.sov, suffix: '%', tip: METRIC_TIPS.sov },
        {
          key: 't1',
          label: 'Top1(首位)提及率',
          value: s.top1ReferRate,
          suffix: '%',
          tip: METRIC_TIPS.top1ReferRate,
          provisional: true,
          extra: `首位提及 ${s.top1MentionCount} 次`,
        },
        {
          key: 't3',
          label: 'Top3(首屏)提及率',
          value: s.top3ReferRate,
          suffix: '%',
          tip: METRIC_TIPS.top3ReferRate,
          provisional: true,
          extra: `首屏提及 ${s.top3MentionCount} 次`,
        },
        { key: 'avg', label: '平均提及排名', value: s.avgRank, suffix: '名', tip: METRIC_TIPS.avgRank },
        {
          key: 'sent',
          label: '品牌提及好感度',
          value: s.sentimentScore == null ? '—' : s.sentimentScore,
          tip: METRIC_TIPS.sentimentScore,
          provisional: true,
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
      const [overview, heat, trend, rank, sov] = await Promise.all([
        http.post('/geo/rf/overview', body),
        http.post('/geo/rf/refer_rate_heatmap', body),
        http.post('/geo/rf/refer_trend', body),
        http.post('/geo/rf/avg_refer_rank', body),
        http.post('/geo/rf/sov_trend', body),
      ]);
      this.apiOverview = overview.data || {};
      this.stats = mapOverviewToStats(this.apiOverview);
      this.heatmap = heat.data || { questions: [], platforms: [], cells: [] };
      this.referSeries = (trend.data && trend.data.series) || [];
      this.rankSeries = (rank.data && rank.data.series) || [];
      this.sovSeries = (sov.data && sov.data.series) || [];
      this.$nextTick(() => {
        this.renderHeat();
        this.renderTrend();
        this.renderRank();
        this.renderSov();
      });
    },
    ensureChart(key, el) {
      if (!el) return null;
      if (!this.charts[key]) this.charts[key] = echarts.init(el);
      return this.charts[key];
    },
    renderHeat() {
      const chart = this.ensureChart('heat', this.$refs.heat);
      if (!chart) return;
      const { questions = [], platforms = [], cells = [] } = this.heatmap;
      const data = cells.map((c) => [
        platforms.indexOf(c.platform),
        questions.indexOf(c.question),
        Number((100 * (c.refer_rate || 0)).toFixed(1)),
      ]);
      chart.setOption({
        tooltip: { formatter: (p) => `${questions[p.value[1]]} × ${platforms[p.value[0]]}<br/>提及率 ${p.value[2]}%` },
        grid: { left: 120, right: 24, top: 16, bottom: 40 },
        xAxis: { type: 'category', data: platforms, splitArea: { show: true } },
        yAxis: { type: 'category', data: questions, splitArea: { show: true } },
        visualMap: {
          min: 0,
          max: 100,
          calculable: true,
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          inRange: { color: ['#f5f7fa', '#f3c4ce', '#c9677d'] },
        },
        series: [{ type: 'heatmap', data, label: { show: true, formatter: (p) => `${p.value[2]}%` } }],
      });
    },
    renderTrend() {
      const chart = this.ensureChart('trend', this.$refs.trend);
      if (!chart) return;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 16, top: 24, bottom: 32 },
        xAxis: { type: 'category', data: this.referSeries.map((x) => x.date) },
        yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
        series: [
          {
            name: '品牌提及率',
            type: 'line',
            smooth: true,
            itemStyle: { color: '#c9677d' },
            data: this.referSeries.map((x) => Number((100 * x.refer_rate).toFixed(1))),
          },
        ],
      });
    },
    renderRank() {
      const chart = this.ensureChart('rank', this.$refs.rankTrend);
      if (!chart) return;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 16, top: 24, bottom: 32 },
        xAxis: { type: 'category', data: this.rankSeries.map((x) => x.date) },
        yAxis: { type: 'value', inverse: true, min: 1 },
        series: [
          {
            name: '平均提及排名',
            type: 'line',
            smooth: true,
            itemStyle: { color: '#3b82f6' },
            data: this.rankSeries.map((x) => x.avg_rank),
          },
        ],
      });
    },
    renderSov() {
      const chart = this.ensureChart('sov', this.$refs.sovTrend);
      if (!chart) return;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 16, top: 24, bottom: 32 },
        xAxis: { type: 'category', data: this.sovSeries.map((x) => x.date) },
        yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
        series: [
          {
            name: 'SOV',
            type: 'line',
            smooth: true,
            areaStyle: { color: 'rgba(45,168,126,0.15)' },
            itemStyle: { color: '#2da87e' },
            data: this.sovSeries.map((x) => Number((100 * x.sov).toFixed(1))),
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
  flex-wrap: wrap;
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
  grid-template-columns: repeat(9, minmax(0, 1fr));
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
  color: #1f1b22;
  small {
    font-size: 12px;
    margin-left: 2px;
    color: #909399;
    font-weight: 500;
  }
}
.stat-extra {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
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
  grid-template-columns: 1.1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.chart-card {
  padding: 12px;
}
.chart-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  h3 {
    margin: 0;
    font-size: 14px;
  }
}
.chart {
  height: 260px;
}
.link {
  color: var(--geo-primary) !important;
}
.unknown-alert {
  margin-top: 8px;
}
@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
