<template>
  <div class="page-shell toolbox">
    <h1>工具箱</h1>
    <p class="muted">轻量入口壳；深度挖掘 / 文章优化仍为后续。公开榜与监测流水线可直达。</p>
    <div class="grid">
      <div v-for="card in cards" :key="card.title" class="card tool-card" @click="go(card)">
        <div class="icon"><i :class="card.icon"></i></div>
        <h3>{{ card.title }}</h3>
        <p>{{ card.desc }}</p>
        <el-tag v-if="card.soon" size="mini" type="info" effect="plain">后续</el-tag>
        <el-tag v-else size="mini" type="danger" effect="plain">可用</el-tag>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ToolboxView',
  data() {
    return {
      cards: [
        {
          title: 'GEO电商品牌榜',
          desc: '只读周榜：商品卡提及率 / SOV 等',
          icon: 'el-icon-s-goods',
          path: '/ecommerceBrandRanking',
        },
        {
          title: 'GEO引用来源分布',
          desc: '站点类型占比与 Top 站点',
          icon: 'el-icon-link',
          path: '/referenceSourceRanking',
        },
        {
          title: '品牌监测',
          desc: '提及率 / 舆情 / 引用来源 / 大盘',
          icon: 'el-icon-data-analysis',
          path: '/monitor/brandMentions',
        },
        {
          title: '实时搜索流水线',
          desc: '任务 → 存原文 → 解析 → 聚合（mock）',
          icon: 'el-icon-search',
          path: '/question',
        },
        {
          title: 'AI 问题挖掘',
          desc: '问题库挖掘与收藏（占位）',
          icon: 'el-icon-magic-stick',
          soon: true,
        },
        {
          title: '文章优化工具',
          desc: '引用优化建议（占位）',
          icon: 'el-icon-edit-outline',
          soon: true,
        },
      ],
    };
  },
  methods: {
    go(card) {
      if (card.soon || !card.path) {
        this.$message.info('该工具为后续模块');
        return;
      }
      this.$router.push(card.path);
    },
  },
};
</script>

<style lang="scss" scoped>
.toolbox {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 40px;
  h1 {
    margin: 0 0 6px;
  }
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.tool-card {
  padding: 18px 16px;
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
  &:hover {
    box-shadow: 0 6px 18px rgba(31, 27, 34, 0.08);
    transform: translateY(-1px);
  }
  h3 {
    margin: 8px 0 6px;
    font-size: 15px;
  }
  p {
    margin: 0 0 10px;
    font-size: 13px;
    color: #5c6069;
    min-height: 36px;
  }
}
.icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--geo-primary-soft, #f7e8ec);
  color: var(--geo-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
