<template>
  <div class="page-shell ref-page">
    <div class="hero">
      <h1>{{ data.title || 'GEO引用来源分布' }}</h1>
      <p class="muted">{{ data.description }}</p>
    </div>

    <div class="filters">
      <el-button size="mini" type="primary">全部行业</el-button>
      <el-button size="mini" type="primary">全部时间</el-button>
      <el-button size="mini" type="primary">全部平台</el-button>
      <span v-for="p in platformChips" :key="p" class="chip">{{ p }}</span>
    </div>

    <div class="grid">
      <div class="card chart-card">
        <h3>引用站点类型占比</h3>
        <div ref="pie" class="chart"></div>
      </div>
      <div class="card table-card">
        <h3>引用站点类型排行</h3>
        <el-table :data="data.siteTypes || []" size="mini" height="320">
          <el-table-column type="index" label="排名" width="60" />
          <el-table-column prop="name" label="站点类型" min-width="140" />
          <el-table-column prop="sites" label="站点数量" width="90" />
          <el-table-column prop="articles" label="引用文章数" width="100" />
          <el-table-column prop="cites" label="引用次数" width="90" />
          <el-table-column label="引用率" width="90">
            <template slot-scope="{ row }">
              <span class="rate">{{ row.rate }}%</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <div class="card top-card">
      <h3>引用站点排行Top40</h3>
      <div class="top-grid">
        <div v-for="item in data.topSites || []" :key="item.rank" class="top-item">
          <span class="rank" :class="{ gold: item.rank === 1 }">{{ item.rank }}</span>
          <span class="name">{{ item.name }}</span>
          <span class="rate">{{ item.rate }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import * as echarts from 'echarts';
import http from '@/api/http';

export default {
  name: 'ReferenceRankingView',
  data() {
    return {
      data: {},
      chart: null,
      platformChips: [
        '豆包·网页',
        '豆包·手机',
        'DeepSeek·网页',
        '元宝·网页',
        '千问·网页',
        '百度AI·网页',
        '文心·网页',
        'Kimi·网页',
        'AI抖音·网页',
      ],
    };
  },
  async mounted() {
    await this.load();
    window.addEventListener('resize', this.resize);
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resize);
    if (this.chart) this.chart.dispose();
  },
  methods: {
    async load() {
      const res = await http.get('/rank/reference-sources');
      this.data = res.data || {};
      this.$nextTick(() => this.renderChart());
    },
    renderChart() {
      if (!this.$refs.pie) return;
      if (!this.chart) this.chart = echarts.init(this.$refs.pie);
      const list = this.data.siteTypes || [];
      this.chart.setOption({
        tooltip: { trigger: 'item' },
        series: [
          {
            type: 'pie',
            radius: ['42%', '68%'],
            label: { formatter: '{d}%' },
            data: list.map((x) => ({ name: x.name, value: x.rate })),
          },
        ],
      });
    },
    resize() {
      if (this.chart) this.chart.resize();
    },
  },
};
</script>

<style lang="scss" scoped>
.hero {
  text-align: center;
  margin: 8px 0 18px;
  h1 {
    margin: 0 0 8px;
    font-size: 30px;
  }
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 14px;
}
.chip {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: #5c6069;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
  margin-bottom: 12px;
}
.chart-card,
.table-card,
.top-card {
  padding: 14px;
}
.chart {
  height: 300px;
}
.rate {
  color: #cf9236;
  font-weight: 600;
}
.top-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px 16px;
}
.top-item {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid #f5f5f7;
  font-size: 13px;
}
.rank {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ebeef5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  &.gold {
    background: #f6c945;
    color: #fff;
  }
}
@media (max-width: 1100px) {
  .grid,
  .top-grid {
    grid-template-columns: 1fr;
  }
}
</style>
