<template>
  <div class="tasks-page">
    <div class="page-head">
      <h1>AI对话记录</h1>
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
      <el-select v-model="platformFilter" size="small" style="width: 140px" @change="applyFilter">
        <el-option label="全部平台" value="all" />
        <el-option v-for="p in platformOptions" :key="p" :label="p" :value="p" />
      </el-select>
      <el-select v-model="dialogFilter" size="small" style="width: 130px" @change="applyFilter">
        <el-option label="全部对话" value="all" />
        <el-option label="有品牌提及" value="mentioned" />
        <el-option label="无品牌提及" value="none" />
      </el-select>
      <el-select v-model="sentimentFilter" size="small" style="width: 140px" @change="applyFilter">
        <el-option label="全部情感倾向" value="all" />
        <el-option label="正面" value="positive" />
        <el-option label="中性" value="neutral" />
        <el-option label="负面" value="negative" />
      </el-select>
      <el-input
        v-model="keyword"
        size="small"
        clearable
        placeholder="搜索品牌、竞品、其他品牌关键词"
        style="width: 240px"
        @input="applyFilter"
      />
    </div>

    <div class="card table-card">
      <div class="chart-head">
        <h3>对话记录</h3>
        <div>
          <el-button type="text" icon="el-icon-setting">列表配置</el-button>
          <el-button type="text" icon="el-icon-download">导出</el-button>
        </div>
      </div>
      <el-table :data="filtered" size="small" stripe max-height="520">
        <el-table-column prop="prompt" label="AI问题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="created_at" label="对话时间" width="160" sortable />
        <el-table-column prop="platform" label="对话平台" width="100" sortable />
        <el-table-column prop="category" label="问题类型" width="100" sortable />
        <el-table-column prop="hot_value" label="热度值" width="90" sortable />
        <el-table-column prop="mention_brands" label="提及品牌" min-width="140" show-overflow-tooltip />
        <el-table-column prop="brand_words_count" label="提及次数" width="90" sortable />
        <el-table-column label="排名" width="80" sortable>
          <template slot-scope="{ row }">{{ row.min_rank != null ? row.min_rank : '—' }}</template>
        </el-table-column>
        <el-table-column prop="source_count" label="引用来源" width="90" />
        <el-table-column label="操作" width="80" fixed="right">
          <template>
            <el-button type="text" size="mini">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script>
import http from '@/api/http';

export default {
  name: 'TasksView',
  data() {
    return {
      brands: [],
      brandPlanId: '',
      progress: {},
      rows: [],
      filtered: [],
      platformFilter: 'all',
      dialogFilter: 'all',
      sentimentFilter: 'all',
      keyword: '',
    };
  },
  computed: {
    platformOptions() {
      return [...new Set(this.rows.map((r) => r.platform))];
    },
  },
  async created() {
    await this.bootstrap();
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
      const res = await http.post('/geo/monitor/monitor_record', { brand_plan_id: this.brandPlanId });
      this.rows = (res.data && res.data.list) || [];
      this.applyFilter();
    },
    applyFilter() {
      let list = this.rows.slice();
      if (this.platformFilter !== 'all') {
        list = list.filter((r) => r.platform === this.platformFilter);
      }
      if (this.dialogFilter === 'mentioned') list = list.filter((r) => r.min_rank != null);
      if (this.dialogFilter === 'none') list = list.filter((r) => r.min_rank == null);
      if (this.sentimentFilter !== 'all') {
        list = list.filter((r) => r.sentiment === this.sentimentFilter);
      }
      if (this.keyword.trim()) {
        const k = this.keyword.trim();
        list = list.filter(
          (r) =>
            (r.mention_brands && r.mention_brands.includes(k)) ||
            (r.prompt && r.prompt.includes(k))
        );
      }
      this.filtered = list;
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
</style>
