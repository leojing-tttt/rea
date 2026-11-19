<template>
  <div class="card placeholder">
    <h2>{{ title }}</h2>
    <p class="muted">本页为监测壳占位。当前切片已实现「提及率和排名」概览与字典公式；本模块将在后续 MVP 继续对齐。</p>
    <el-button type="primary" round @click="$router.push('/monitor/brandMentions')">前往提及率和排名</el-button>
  </div>
</template>

<script>
const TITLES = {
  dashboard: '数据大盘',
  sentiment: '品牌舆情追踪',
  sources: 'AI引用来源',
  tasks: 'AI对话记录',
  contentOptimization: '作品引用追踪',
  brandManagement: '品牌监测设置',
  BrandReport: '导出数据与报告',
  aiQuestionLibrary: 'AI问题库',
};

export default {
  name: 'MonitorPlaceholderView',
  computed: {
    title() {
      const key = this.$route.path.split('/').pop();
      return TITLES[key] || '品牌监测';
    },
  },
};
</script>

<style scoped>
.placeholder {
  padding: 28px;
}
</style>
