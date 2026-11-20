<template>
  <div class="dashboard-page">
    <div class="page-head">
      <h1>数据大盘</h1>
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

    <div class="section-title">数据概览</div>
    <div class="stats-grid">
      <div
        v-for="card in statCards"
        :key="card.key"
        class="stat card"
        :class="{ primary: card.primary }"
      >
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

    <div class="section-title">平台表现</div>
    <div class="card table-card">
      <el-table :data="platforms" size="small" stripe>
        <el-table-column prop="platform" label="平台" width="120" />
        <el-table-column prop="brand_score" label="品牌得分" width="100" />
        <el-table-column label="提及率" width="100">
          <template slot-scope="{ row }">{{ pct(row.refer_rate) }}%</template>
        </el-table-column>
        <el-table-column label="SOV" width="90">
          <template slot-scope="{ row }">{{ pct(row.sov) }}%</template>
        </el-table-column>
        <el-table-column prop="avg_rank" label="平均排名" width="100" />
        <el-table-column prop="mention_count" label="提及次数" />
        <el-table-column prop="ai_count" label="对话次数" />
        <el-table-column prop="valid_rank_count" label="提及品牌对话" />
      </el-table>
    </div>

    <div class="charts-row">
      <div class="card chart-card">
        <div class="chart-head"><h3>分平台品牌得分</h3></div>
        <div ref="scoreBar" class="chart"></div>
      </div>
      <div class="card chart-card">
        <div class="chart-head"><h3>分平台提及率 vs SOV</h3></div>
        <div ref="rateBar" class="chart"></div>
      </div>
    </div>

    <el-alert
      class="unknown-alert"
      type="info"
      :closable="false"
      title="品牌得分口径"
      :description="scoreNote"
      show-icon
    />
  </div>
</template>

<script>
import * as echarts from 'echarts';
import http from '@/api/http';
import { METRIC_TIPS } from '@/utils/metricsDisplay';

export default {
  name: 'DashboardView',
  data() {
    return {
      brands: [],
      brandPlanId: '',
      progress: {},
      overview: {},
      platforms: [],
      charts: {},
    };
  },
  computed: {
    scoreNote() {
      const meta = (this.overview && this.overview._meta) || {};
      return `品牌得分 = 提及率×0.75 + 提及次数得分×0.1 + 平均排名项×0.1 + 情感项×0.05（产品 tip）。排名/情感归一仍为 provisional（${(meta.provisional || []).join(', ') || '见字典 U-03'}）。`;
    },
    statCards() {
      const o = this.overview;
      return [
        {
          key: 'bs',
          label: '品牌得分',
          value: o.brand_score != null ? o.brand_score : '--',
          tip: METRIC_TIPS.brandScore,
          primary: true,
          provisional: true,
        },
        {
          key: 'refer',
          label: '品牌提及率',
          value: this.pct(o.refer_rate),
          suffix: '%',
          tip: METRIC_TIPS.referRate,
        },
        {
          key: 'sov',
          label: 'SOV',
          value: this.pct(o.sov),
          suffix: '%',
          tip: METRIC_TIPS.sov,
        },
        {
          key: 'avg',
          label: '平均提及排名',
          value: o.avg_rank || 0,
          tip: METRIC_TIPS.avgRank,
        },
        {
          key: 'mc',
          label: '品牌提及次数',
          value: o.mention_count || 0,
          tip: METRIC_TIPS.mentionCount,
        },
        {
          key: 'sent',
          label: '提及好感度',
          value: o.sentiment_score == null ? '—' : o.sentiment_score,
          tip: METRIC_TIPS.sentimentScore,
          provisional: true,
        },
        {
          key: 'res',
          label: '引用文章数',
          value: o.resource_count || 0,
          tip: METRIC_TIPS.resourceCount,
        },
        {
          key: 'sites',
          label: '引用站点数',
          value: o.site_count || 0,
          tip: METRIC_TIPS.siteCount,
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
    pct(x) {
      return (100 * (x || 0)).toFixed(0);
    },
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
      const [ov, plats] = await Promise.all([
        http.post('/geo/dashboard/overview', body),
        http.post('/geo/dashboard/platforms', body),
      ]);
      this.overview = ov.data || {};
      this.platforms = (plats.data && plats.data.list) || [];
      this.$nextTick(() => {
        this.renderScore();
        this.renderRates();
      });
    },
    ensureChart(key, el) {
      if (!el) return null;
      if (!this.charts[key]) this.charts[key] = echarts.init(el);
      return this.charts[key];
    },
    renderScore() {
      const chart = this.ensureChart('score', this.$refs.scoreBar);
      if (!chart) return;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 48, right: 16, top: 24, bottom: 40 },
        xAxis: { type: 'category', data: this.platforms.map((p) => p.platform) },
        yAxis: { type: 'value', max: 100 },
        series: [
          {
            type: 'bar',
            data: this.platforms.map((p) => p.brand_score),
            itemStyle: { color: '#c9677d' },
            label: { show: true, position: 'top' },
          },
        ],
      });
    },
    renderRates() {
      const chart = this.ensureChart('rates', this.$refs.rateBar);
      if (!chart) return;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { top: 0 },
        grid: { left: 48, right: 16, top: 36, bottom: 40 },
        xAxis: { type: 'category', data: this.platforms.map((p) => p.platform) },
        yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
        series: [
          {
            name: '提及率',
            type: 'bar',
            data: this.platforms.map((p) => Number((100 * p.refer_rate).toFixed(1))),
            itemStyle: { color: '#c9677d' },
          },
          {
            name: 'SOV',
            type: 'bar',
            data: this.platforms.map((p) => Number((100 * p.sov).toFixed(1))),
            itemStyle: { color: '#2da87e' },
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
  padding: 14px 12px;
  text-align: center;
  &.primary {
    background: linear-gradient(180deg, #fdf6f8 0%, #fff 100%);
    border: 1px solid #f0d0d8;
  }
}
.stat-value {
  font-size: 24px;
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
.table-card {
  padding: 12px;
  margin-bottom: 12px;
}
.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.chart-card {
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
  margin-top: 4px;
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
