<template>
  <div class="ql-page">
    <div class="page-head">
      <h1>AI问题库</h1>
      <div class="actions">
        <el-button size="small" plain :disabled="!selection.length" @click="batchFav(false)">批量取消收藏</el-button>
        <el-button size="small" plain :disabled="!selection.length" @click="batchFav(true)">批量收藏</el-button>
        <el-button size="small" type="danger" plain :disabled="!selection.length" @click="batchMonitor">批量监测</el-button>
      </div>
    </div>

    <div class="filters card">
      <el-select v-model="brandPlanId" size="small" style="min-width: 280px" @change="reload">
        <el-option v-for="b in brands" :key="b.id" :label="b.planLabel" :value="b.id" />
      </el-select>
      <el-select v-model="typeFilter" size="small" style="width: 140px">
        <el-option label="全部类型" value="all" />
        <el-option v-for="t in types" :key="t" :label="t" :value="t" />
      </el-select>
      <el-select v-model="favFilter" size="small" style="width: 120px">
        <el-option label="全部" value="all" />
        <el-option label="已收藏" value="fav" />
        <el-option label="未收藏" value="unfav" />
      </el-select>
      <el-input
        v-model="keyword"
        size="small"
        clearable
        placeholder="搜索问题"
        style="width: 200px"
      />
    </div>

    <div class="card table-card">
      <el-table
        :data="filtered"
        size="small"
        stripe
        @selection-change="(rows) => (selection = rows)"
      >
        <el-table-column type="selection" width="44" />
        <el-table-column prop="prompt" label="AI问题" min-width="220" show-overflow-tooltip />
        <el-table-column prop="type" label="问题类型" width="110" />
        <el-table-column prop="hot_value" label="热度值" width="90" sortable />
        <el-table-column label="收藏" width="80">
          <template slot-scope="{ row }">
            <i :class="row.favorite ? 'el-icon-star-on fav' : 'el-icon-star-off'"></i>
          </template>
        </el-table-column>
        <el-table-column label="监测" width="90">
          <template slot-scope="{ row }">
            <el-tag size="mini" :type="row.in_monitor ? 'success' : 'info'">
              {{ row.in_monitor ? '已监测' : '未监测' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="platform_count" label="平台数" width="80" />
        <el-table-column prop="created_at" label="收录时间" width="160" />
        <el-table-column label="操作" width="160" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="toggleFav(row)">{{ row.favorite ? '取消收藏' : '收藏' }}</el-button>
            <el-button type="text" size="mini" @click="toggleMonitor(row)">{{ row.in_monitor ? '移出监测' : '加入监测' }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!filtered.length" description="暂无AI问题" :image-size="80" />
    </div>
  </div>
</template>

<script>
import http from '@/api/http';

export default {
  name: 'AiQuestionLibraryView',
  data() {
    return {
      brands: [],
      brandPlanId: '',
      rows: [],
      selection: [],
      typeFilter: 'all',
      favFilter: 'all',
      keyword: '',
    };
  },
  computed: {
    types() {
      return [...new Set(this.rows.map((r) => r.type))];
    },
    filtered() {
      let list = this.rows;
      if (this.typeFilter !== 'all') list = list.filter((r) => r.type === this.typeFilter);
      if (this.favFilter === 'fav') list = list.filter((r) => r.favorite);
      if (this.favFilter === 'unfav') list = list.filter((r) => !r.favorite);
      if (this.keyword.trim()) {
        const k = this.keyword.trim();
        list = list.filter((r) => r.prompt && r.prompt.includes(k));
      }
      return list;
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
      const res = await http.post('/geo/question/library/list', { brand_plan_id: this.brandPlanId });
      this.rows = (res.data && res.data.list) || [];
      this.selection = [];
    },
    toggleFav(row) {
      row.favorite = !row.favorite;
    },
    toggleMonitor(row) {
      row.in_monitor = !row.in_monitor;
    },
    batchFav(on) {
      this.selection.forEach((row) => {
        row.favorite = on;
      });
    },
    batchMonitor() {
      this.selection.forEach((row) => {
        row.in_monitor = true;
      });
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
.actions {
  display: flex;
  gap: 8px;
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
.fav {
  color: #e6a23c;
  font-size: 16px;
}
</style>
