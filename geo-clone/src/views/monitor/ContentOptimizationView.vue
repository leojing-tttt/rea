<template>
  <div class="content-page">
    <div class="page-head">
      <h1>
        作品引用追踪
        <el-tooltip content="追踪已收录作品在 AI 回答中的引用表现（CO-01~05）">
          <i class="el-icon-question"></i>
        </el-tooltip>
      </h1>
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
    </div>

    <div class="section-title">数据概览</div>
    <div class="stats-grid">
      <div v-for="card in statCards" :key="card.key" class="stat card">
        <div class="stat-value">
          {{ card.value }}<small>{{ card.unit }}</small>
        </div>
        <div class="stat-label">{{ card.label }}</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="card table-card">
        <div class="chart-head">
          <h3>追踪热点引用 Top10</h3>
          <el-button type="text" class="link">查看更多</el-button>
        </div>
        <el-table :data="hotSites" size="small" stripe>
          <el-table-column prop="site_name" label="站点名称" />
          <el-table-column prop="domain" label="站点域名" min-width="140" show-overflow-tooltip />
          <el-table-column prop="site_type" label="站点类型" min-width="120" show-overflow-tooltip />
          <el-table-column prop="track_count" label="追踪文章" width="90" />
          <el-table-column prop="quote_count" label="引用文章" width="90" />
          <el-table-column label="引用率" width="90">
            <template slot-scope="{ row }">{{ pct(row.rate) }}%</template>
          </el-table-column>
        </el-table>
      </div>
      <div class="card table-card">
        <div class="chart-head">
          <h3>文章标签引用 Top10</h3>
          <el-button type="text" class="link">查看更多</el-button>
        </div>
        <el-table :data="hotTags" size="small" stripe>
          <el-table-column prop="tag_name" label="标签名称" />
          <el-table-column prop="track_count" label="追踪文章" width="90" />
          <el-table-column prop="quote_count" label="引用文章" width="90" />
          <el-table-column label="引用率" width="90">
            <template slot-scope="{ row }">{{ pct(row.rate) }}%</template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div class="card table-card">
      <div class="chart-head"><h3>追踪信息</h3></div>
      <el-table :data="works" size="small" stripe max-height="360">
        <el-table-column prop="article_title" label="作品标题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="site" label="站点" width="100" />
        <el-table-column prop="category" label="站点类型" width="140" show-overflow-tooltip />
        <el-table-column label="标签" min-width="120">
          <template slot-scope="{ row }">
            <el-tag v-for="t in row.tags" :key="t" size="mini" style="margin-right: 4px">{{ t }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="publish_time" label="发布时间" width="110" />
        <el-table-column prop="first_quote_time" label="首次引用" width="110" />
        <el-table-column prop="question_count" label="引用AI问题" width="100" />
        <el-table-column prop="article_quote_count" label="引用次数" width="90" />
      </el-table>
    </div>
  </div>
</template>

<script>
import http from '@/api/http';

export default {
  name: 'ContentOptimizationView',
  data() {
    return {
      brands: [],
      brandPlanId: '',
      progress: {},
      stats: { track_count: 0, quote_count: 0, question_count: 0, total_count: 0 },
      works: [],
      hotSites: [],
      hotTags: [],
    };
  },
  computed: {
    statCards() {
      const s = this.stats;
      return [
        { key: 'track', label: '追踪作品数', value: s.track_count, unit: '个' },
        { key: 'quote', label: '引用作品数', value: s.quote_count, unit: '个' },
        { key: 'q', label: '引用AI问题数', value: s.question_count, unit: '个' },
        { key: 'total', label: '引用次数', value: s.total_count, unit: '次' },
      ];
    },
  },
  async created() {
    await this.bootstrap();
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
      const [stats, list] = await Promise.all([
        http.post('/geo/article_monitor/statistics', body),
        http.post('/geo/article_monitor/list', body),
      ]);
      this.stats = stats.data || this.stats;
      this.works = (list.data && list.data.list) || [];
      this.hotSites = (list.data && list.data.hotSites) || [];
      this.hotTags = (list.data && list.data.hotTags) || [];
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
    i {
      color: #c0c4cc;
      font-size: 16px;
    }
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}
.stat {
  padding: 14px;
  text-align: center;
}
.stat-value {
  font-size: 24px;
  font-weight: 700;
  small {
    font-size: 12px;
    margin-left: 4px;
    color: #909399;
    font-weight: 500;
  }
}
.stat-label {
  margin-top: 6px;
  font-size: 12px;
  color: #5c6069;
}
.charts-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
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
.link {
  color: var(--geo-primary) !important;
}
@media (max-width: 1100px) {
  .stats-grid,
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
