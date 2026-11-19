<template>
  <div class="page-shell rank-page">
    <div class="title-block">
      <div>
        <h1>{{ data.title || 'GEO电商品牌榜' }}</h1>
        <p class="muted">{{ data.description }}</p>
      </div>
      <div class="switches">
        <button type="button" class="sw" disabled>品牌榜</button>
        <button type="button" class="sw active">电商品牌榜</button>
      </div>
    </div>

    <div class="industry-tabs">
      <button
        v-for="item in data.industries || []"
        :key="item"
        type="button"
        class="ind"
        :class="{ active: industry === item }"
        @click="changeIndustry(item)"
      >
        {{ item }}
      </button>
    </div>

    <div class="card panel">
      <div class="sub-tabs">
        <button
          v-for="s in data.subCategories || []"
          :key="s"
          type="button"
          class="sub"
          :class="{ active: sub === s }"
          @click="sub = s"
        >
          {{ s }}
        </button>
      </div>
      <div class="tags">
        <span v-for="t in data.tags || []" :key="t" class="tag">{{ t }}</span>
        <span class="week">周榜 · {{ data.week }}</span>
      </div>
      <div class="platforms">
        <button
          v-for="p in data.platforms || []"
          :key="p"
          type="button"
          class="p"
          :class="{ active: platform === p }"
          @click="changePlatform(p)"
        >
          {{ p }}
        </button>
      </div>

      <el-table :data="data.list || []" stripe style="width: 100%">
        <el-table-column prop="rank" label="排名" width="80">
          <template slot-scope="{ row }">
            <span class="medal" :class="'m' + row.rank">{{ row.rank }}</span>
          </template>
        </el-table-column>
        <el-table-column label="品牌" min-width="160">
          <template slot-scope="{ row }">
            <div class="brand-cell">
              <span class="b-avatar">{{ row.brand.slice(0, 1) }}</span>
              <div>
                <div class="b-name">{{ row.brand }}</div>
                <div class="muted">{{ row.cards }}张商品卡</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="mentionRate" label="商品卡提及率" width="120">
          <template slot-scope="{ row }">{{ row.mentionRate }}%</template>
        </el-table-column>
        <el-table-column label="平均提及排名" width="140">
          <template slot-scope="{ row }">
            <div>{{ row.avgRank }}</div>
            <div class="muted">Top1率 {{ row.top1 }}%</div>
          </template>
        </el-table-column>
        <el-table-column label="平台分布" min-width="180">
          <template slot-scope="{ row }">
            <div class="bar">
              <span v-for="(v, k) in row.dist" :key="k" :style="{ width: v + '%', background: colorOf(k) }" :title="k + ' ' + v + '%'"></span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="product" label="代表商品卡" min-width="220" />
        <el-table-column label="操作" width="90">
          <template>
            <a class="link" href="javascript:;">详情</a>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script>
import http from '@/api/http';

export default {
  name: 'EcommerceRankingView',
  data() {
    return {
      industry: '服装',
      platform: '全部平台',
      sub: '综合榜',
      data: {},
    };
  },
  created() {
    this.load();
  },
  methods: {
    colorOf(name) {
      return { 豆包: '#4e6ef2', 元宝: '#2da87e', 千问: '#7c5cfc' }[name] || '#c0c4cc';
    },
    async load() {
      const res = await http.get('/rank/ecommerce', { params: { industry: this.industry, platform: this.platform } });
      this.data = res.data || {};
      if (this.data.subCategories && this.data.subCategories.length) this.sub = this.data.subCategories[0];
    },
    changeIndustry(item) {
      this.industry = item;
      this.load();
    },
    changePlatform(p) {
      this.platform = p;
      this.load();
    },
  },
};
</script>

<style lang="scss" scoped>
.title-block {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 12px;
  h1 {
    margin: 0 0 6px;
    font-size: 28px;
  }
}
.switches {
  display: flex;
  gap: 8px;
}
.sw {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  &.active {
    background: var(--geo-primary);
    border-color: var(--geo-primary);
    color: #fff;
  }
}
.industry-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.ind {
  border: none;
  background: #ebe7f5;
  color: #5c6069;
  border-radius: 10px 10px 0 0;
  padding: 10px 14px;
  transform: skewX(-8deg);
  span,
  & {
    font-weight: 600;
  }
  &.active {
    background: var(--geo-primary);
    color: #fff;
  }
}
.panel {
  padding: 16px;
}
.sub-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.sub {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  &.active {
    border-color: var(--geo-primary);
    color: var(--geo-primary);
    background: var(--geo-primary-soft);
  }
}
.tags {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
}
.tag {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}
.week {
  margin-left: auto;
  color: #909399;
  font-size: 12px;
}
.platforms {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.p {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  &.active {
    background: #303133;
    color: #fff;
    border-color: #303133;
  }
}
.brand-cell {
  display: flex;
  gap: 10px;
  align-items: center;
}
.b-avatar {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #f3e6ea;
  color: var(--geo-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.b-name {
  font-weight: 600;
}
.medal {
  display: inline-flex;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  background: #ebeef5;
  &.m1 {
    background: #f6c945;
    color: #fff;
  }
  &.m2 {
    background: #c0c4cc;
    color: #fff;
  }
  &.m3 {
    background: #d4a373;
    color: #fff;
  }
}
.bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: #f2f3f5;
}
.link {
  color: var(--geo-primary);
}
</style>
