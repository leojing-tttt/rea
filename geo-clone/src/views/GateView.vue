<template>
  <div class="page-shell">
    <div class="card gate">
      <h2>{{ title }}</h2>
      <p class="muted">
        该模块属于 MVP-2+ 范围（品牌监测分析 / 工具箱完整能力）。MVP-1 仅保留入口与登录门禁，视觉壳对齐顶栏。
      </p>
      <ul>
        <li v-for="item in items" :key="item">{{ item }}</li>
      </ul>
      <div class="actions">
        <el-button type="primary" round @click="$router.push('/question')">回到实时搜索</el-button>
        <el-button round @click="$router.push('/ecommerceBrandRanking')">查看电商品牌榜</el-button>
        <el-button round @click="$router.push('/referenceSourceRanking')">查看引用来源分布</el-button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'GateView',
  computed: {
    title() {
      return this.$route.meta.gate === 'toolbox' ? '工具箱（MVP 占位）' : '品牌监测（MVP 占位）';
    },
    items() {
      if (this.$route.meta.gate === 'toolbox') {
        return ['AI 问题挖掘', '问题收藏', '文章优化工具（后续）'];
      }
      return ['数据大盘', '提及率和排名', '舆情追踪', 'AI 对话记录', '作品引用追踪', '品牌监测设置'];
    },
  },
};
</script>

<style lang="scss" scoped>
.gate {
  padding: 28px;
  max-width: 720px;
  margin: 40px auto;
}
ul {
  line-height: 1.9;
  color: #5c6069;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}
</style>
