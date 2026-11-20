<template>
  <div class="brand-mgmt-page">
    <div class="page-head">
      <h1>品牌监测设置 · 监测计划</h1>
      <el-button type="danger" size="small" icon="el-icon-plus">创建计划</el-button>
    </div>

    <div class="summary card">
      <span
        >监测品牌 <em>{{ summary.brandCount || 0 }}</em> 个</span
      >
      <span
        >监测问题 <em>{{ summary.questionCount || 0 }}</em> 个</span
      >
      <span
        >预估积分/轮 <em>{{ summary.totalPoints || 0 }}</em></span
      >
      <span
        >运行中 <em>{{ summary.runningCount || 0 }}</em></span
      >
    </div>

    <div class="filters card">
      <el-input
        v-model="keyword"
        size="small"
        clearable
        placeholder="搜索品牌 / 计划"
        style="width: 240px"
      />
      <el-select v-model="statusFilter" size="small" style="width: 140px">
        <el-option label="全部状态" value="all" />
        <el-option label="监测中" value="running" />
        <el-option label="已暂停" value="paused" />
      </el-select>
    </div>

    <div class="card table-card">
      <el-table :data="filtered" size="small" stripe>
        <el-table-column prop="plan_label" label="监测计划" min-width="220" show-overflow-tooltip />
        <el-table-column prop="name" label="品牌" width="100" />
        <el-table-column prop="monitor_type" label="状态" width="90">
          <template slot-scope="{ row }">
            <el-tag :type="row.monitor_status === 'running' ? 'success' : 'info'" size="mini">
              {{ row.monitor_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="question_count" label="问题数" width="80" />
        <el-table-column prop="platform_count" label="平台数" width="80" />
        <el-table-column prop="frequency" label="频率" width="80" />
        <el-table-column prop="points_per_task" label="积分/任务" width="100" />
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column prop="creator" label="创建人" width="110" />
        <el-table-column label="操作" width="200" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="openDetail(row)">详情</el-button>
            <el-button type="text" size="mini" @click="toggleStatus(row)">{{ row.monitor_status === 'running' ? '暂停' : '开启' }}</el-button>
            <el-button type="text" size="mini">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer :visible.sync="drawer" title="计划详情" size="420px">
      <div v-if="detail" class="detail">
        <p><strong>品牌词：</strong>{{ (detail.words || []).join('、') }}</p>
        <p><strong>竞品：</strong>{{ (detail.competitors || []).join('、') || '—' }}</p>
        <p><strong>平台：</strong>{{ (detail.platforms || []).join('、') }}</p>
        <p><strong>问题：</strong></p>
        <ul>
          <li v-for="q in detail.questions || []" :key="q">{{ q }}</li>
        </ul>
        <h4>变更记录</h4>
        <el-timeline>
          <el-timeline-item
            v-for="(log, i) in detail.change_log || []"
            :key="i"
            :timestamp="log.time"
            placement="top"
          >
            {{ log.action }} · {{ log.modifierName }} ({{ log.modifierRole }})
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import http from '@/api/http';

export default {
  name: 'BrandManagementView',
  data() {
    return {
      plans: [],
      summary: {},
      keyword: '',
      statusFilter: 'all',
      drawer: false,
      detail: null,
    };
  },
  computed: {
    filtered() {
      let list = this.plans;
      if (this.statusFilter !== 'all') {
        list = list.filter((p) => p.monitor_status === this.statusFilter);
      }
      if (this.keyword.trim()) {
        const k = this.keyword.trim();
        list = list.filter((p) => p.name.includes(k) || (p.plan_label && p.plan_label.includes(k)));
      }
      return list;
    },
  },
  async created() {
    const res = await http.get('/geo/brand/management');
    this.plans = (res.data && res.data.list) || [];
    this.summary = (res.data && res.data.monitoringSummary) || {};
  },
  methods: {
    async openDetail(row) {
      const res = await http.get(`/geo/brand/detail/${row.id}`);
      this.detail = res.data || row;
      this.drawer = true;
    },
    toggleStatus(row) {
      const running = row.monitor_status !== 'running';
      row.monitor_status = running ? 'running' : 'paused';
      row.monitor_type = running ? '监测中' : '已暂停';
      this.summary = {
        ...this.summary,
        runningCount: this.plans.filter((p) => p.monitor_status === 'running').length,
      };
    },
  },
};
</script>

<style lang="scss" scoped>
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  h1 {
    margin: 0;
    font-size: 22px;
  }
}
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 12px 16px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #5c6069;
  em {
    font-style: normal;
    font-weight: 700;
    color: var(--geo-primary);
    margin: 0 2px;
  }
}
.filters {
  display: flex;
  gap: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.table-card {
  padding: 12px;
}
.detail {
  padding: 0 16px 24px;
  font-size: 13px;
  line-height: 1.6;
  ul {
    padding-left: 18px;
  }
  h4 {
    margin: 16px 0 8px;
  }
}
</style>
