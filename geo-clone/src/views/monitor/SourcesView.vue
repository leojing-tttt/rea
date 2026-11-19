<template>
  <div class="sources-page">
    <div class="page-head">
      <h1>AI引用来源</h1>
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

    <div class="section-title">引用概览</div>
    <div class="stats-grid">
      <div v-for="card in statCards" :key="card.key" class="stat card">
        <div class="stat-value">{{ card.value }}</div>
        <div class="stat-label">
          {{ card.label }}
          <el-tooltip :content="card.tip" placement="top">
            <i class="el-icon-question"></i>
          </el-tooltip>
        </div>
      </div>
    </div>

    <div class="charts-row">
      <div class="card chart-card">
        <div class="chart-head"><h3>站点类型占比</h3></div>
        <div ref="pie" class="chart"></div>
      </div>
      <div class="card chart-card">
        <div class="chart-head"><h3>引用站点排行</h3></div>
        <div ref="bar" class="chart"></div>
      </div>
    </div>

    <div class="card table-card">
      <div class="chart-head"><h3>引用文章列表</h3></div>
      <el-table :data="articles" size="small" stripe max-height="360">
        <el-table-column prop="title" label="文章标题" min-width="220" show-overflow-tooltip />
        <el-table-column prop="site" label="站点" width="110" />
        <el-table-column prop="site_type" label="站点类型" width="140" show-overflow-tooltip />
        <el-table-column prop="platform" label="AI平台" width="90" />
        <el-table-column prop="log_count" label="引用次数" width="90" sortable />
        <el-table-column prop="date" label="日期" width="110" />
      </el-table>
    </div>

    <el-alert
      class="unknown-alert"
      type="info"
      :closable="false"
      title="口径说明"
      description="resource_count / total_log_count / site_count 对齐线上 statistics 字段；站点类型 rate 为 mock 内 log_count/合计（SRC-04 分母范围仍为 unknown）。"
      show-icon
    />
  </div>
</template>

<script>
import * as echarts from 'echarts';
import http from '@/api/http';
import { METRIC_TIPS } from '@/utils/metricsDisplay';

export default {
  name: 'SourcesView',
  data() {
    return {
      brands: [],
      brandPlanId: '',
      progress: {},
      stats: { total_log_count: 0, resource_count: 0, site_count: 0 },
      categories: [],
      sites: [],
      articles: [],
      charts: {},
    };
  },
  computed: {
    statCards() {
      return [
        {
          key: 'resource',
          label: '引用文章数',
          value: this.stats.resource_count,
          tip: METRIC_TIPS.resourceCount,
        },
        {
          key: 'logs',
          label: '引用次数',
          value: this.stats.total_log_count,
          tip: METRIC_TIPS.totalLogCount,
        },
        {
          key: 'sites',
          label: '引用站点数',
          value: this.stats.site_count,
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
      const [stats, cats, sites, list] = await Promise.all([
        http.post('/geo/resource/statistics', body),
        http.post('/geo/resource/statistics/site_category', body),
        http.post('/geo/resource/statistics/platform_site', body),
        http.post('/geo/resource/list', body),
      ]);
      this.stats = stats.data || this.stats;
      this.categories = (cats.data && cats.data.list) || [];
      this.sites = (sites.data && sites.data.list) || [];
      this.articles = (list.data && list.data.list) || [];
      this.$nextTick(() => {
        this.renderPie();
        this.renderBar();
      });
    },
    ensureChart(key, el) {
      if (!el) return null;
      if (!this.charts[key]) this.charts[key] = echarts.init(el);
      return this.charts[key];
    },
    renderPie() {
      const chart = this.ensureChart('pie', this.$refs.pie);
      if (!chart) return;
      chart.setOption({
        tooltip: {
          trigger: 'item',
          formatter: (p) => `${p.name}<br/>占比 ${(100 * p.value).toFixed(2)}%`,
        },
        legend: { bottom: 0, type: 'scroll' },
        series: [
          {
            type: 'pie',
            radius: ['36%', '62%'],
            data: this.categories.map((c) => ({ name: c.name, value: c.rate })),
            label: { formatter: (p) => `${p.name}\n${(100 * p.value).toFixed(1)}%` },
            color: ['#c9677d', '#3b82f6', '#2da87e', '#f59e0b', '#8b5cf6', '#64748b', '#ec4899'],
          },
        ],
      });
    },
    renderBar() {
      const chart = this.ensureChart('bar', this.$refs.bar);
      if (!chart) return;
      const top = this.sites.slice(0, 8).reverse();
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 88, right: 24, top: 16, bottom: 24 },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: top.map((s) => s.site) },
        series: [
          {
            type: 'bar',
            data: top.map((s) => s.log_count),
            itemStyle: { color: '#c9677d' },
            label: { show: true, position: 'right' },
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}
.stat {
  padding: 14px 12px;
  text-align: center;
}
.stat-value {
  font-size: 26px;
  font-weight: 700;
}
.stat-label {
  margin-top: 6px;
  font-size: 12px;
  color: #5c6069;
  display: flex;
  gap: 4px;
  justify-content: center;
  align-items: center;
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
.chart-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  h3 {
    margin: 0;
    font-size: 14px;
  }
}
.chart {
  height: 280px;
}
.unknown-alert {
  margin-top: 12px;
}
@media (max-width: 1000px) {
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
