<template>
  <div class="report-page">
    <div class="page-head">
      <h1>导出数据与报告</h1>
      <el-button type="danger" size="small" icon="el-icon-document" :loading="generating" @click="generate">
        生成报告
      </el-button>
    </div>

    <div class="filters card">
      <el-select v-model="brandPlanId" size="small" style="min-width: 280px" @change="reload">
        <el-option v-for="b in brands" :key="b.id" :label="b.planLabel" :value="b.id" />
      </el-select>
      <el-select v-model="typeFilter" size="small" style="width: 140px">
        <el-option label="全部类型" value="all" />
        <el-option label="监测报告" value="监测报告" />
        <el-option label="数据导出" value="数据导出" />
        <el-option label="日报" value="日报" />
      </el-select>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="Mock 导出"
      description="可生成历史记录并下载 JSON 摘要。线上 PDF / 分享包与日报配置不在本切片。"
      style="margin-bottom: 12px"
    />

    <div class="card table-card">
      <el-table :data="filtered" size="small" stripe>
        <el-table-column prop="report_name" label="记录名称" min-width="200" show-overflow-tooltip />
        <el-table-column prop="brand_library_name" label="品牌" width="100" />
        <el-table-column prop="platforms" label="平台" min-width="140" show-overflow-tooltip />
        <el-table-column prop="platform" label="类型" width="100" />
        <el-table-column prop="created_at" label="生成时间" width="160" />
        <el-table-column prop="points" label="消耗积分" width="90" />
        <el-table-column label="状态" width="90">
          <template slot-scope="{ row }">
            <el-tag size="mini" type="success">{{ row.status === 'ready' ? '可下载' : row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="download(row)">下载</el-button>
            <el-button v-if="row.share_url" type="text" size="mini">分享</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script>
import http from '@/api/http';

export default {
  name: 'BrandReportView',
  data() {
    return {
      brands: [],
      brandPlanId: '',
      rows: [],
      typeFilter: 'all',
      generating: false,
    };
  },
  computed: {
    filtered() {
      if (this.typeFilter === 'all') return this.rows;
      return this.rows.filter((r) => r.platform === this.typeFilter);
    },
  },
  async created() {
    const brandsRes = await http.get('/geo/brand/list');
    this.brands = (brandsRes.data && brandsRes.data.list) || [];
    this.brandPlanId = (this.brands[0] && this.brands[0].id) || '';
    await this.reload();
  },
  methods: {
    async reload() {
      if (!this.brandPlanId) return;
      const res = await http.post('/geo/report/history', { brand_plan_id: this.brandPlanId });
      this.rows = (res.data && res.data.list) || [];
    },
    async generate() {
      this.generating = true;
      try {
        const res = await http.post('/geo/export/report_gen', {
          brand_plan_id: this.brandPlanId,
          report_name: undefined,
          type: '监测报告',
        });
        if (res.data) this.rows = [res.data, ...this.rows];
        this.$message.success('已生成报告记录');
      } finally {
        this.generating = false;
      }
    },
    download(row) {
      const payload = {
        ...row,
        note: '本地 JSON 摘要，不是线上 PDF',
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${row.report_name || 'report'}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px;
  margin-bottom: 12px;
}
.table-card {
  padding: 12px;
}
</style>
