import Vue from 'vue';
import VueRouter from 'vue-router';
import store from '@/store';

Vue.use(VueRouter);

const routes = [
  { path: '/', redirect: '/question' },
  {
    path: '/question',
    name: 'question',
    component: () => import('@/views/QuestionView.vue'),
    meta: { title: '快速搜索', nav: 'question' },
  },
  {
    path: '/completeAnalysis',
    name: 'completeAnalysis',
    component: () => import('@/views/InsightView.vue'),
    meta: { title: '品牌洞察', nav: 'insight' },
  },
  {
    path: '/monitor',
    component: () => import('@/layouts/MonitorLayout.vue'),
    meta: { title: '品牌监测', nav: 'monitor', auth: true },
    children: [
      { path: '', redirect: 'brandMentions' },
      {
        path: 'dashboard',
        name: 'monitorDashboard',
        component: () => import('@/views/monitor/DashboardView.vue'),
        meta: { title: '数据大盘', nav: 'monitor', auth: true },
      },
      {
        path: 'brandMentions',
        name: 'brandMentions',
        component: () => import('@/views/monitor/BrandMentionsView.vue'),
        meta: { title: '品牌提及率', nav: 'monitor', auth: true },
      },
      {
        path: 'sentiment',
        name: 'monitorSentiment',
        component: () => import('@/views/monitor/SentimentView.vue'),
        meta: { title: '品牌舆情追踪', nav: 'monitor', auth: true },
      },
      {
        path: 'sources',
        name: 'monitorSources',
        component: () => import('@/views/monitor/SourcesView.vue'),
        meta: { title: 'AI引用来源', nav: 'monitor', auth: true },
      },
      {
        path: 'tasks',
        name: 'monitorTasks',
        component: () => import('@/views/monitor/TasksView.vue'),
        meta: { title: 'AI对话记录', nav: 'monitor', auth: true },
      },
      {
        path: 'contentOptimization',
        name: 'contentOptimization',
        component: () => import('@/views/monitor/ContentOptimizationView.vue'),
        meta: { title: '作品引用追踪', nav: 'monitor', auth: true },
      },
      {
        path: 'brandManagement',
        name: 'brandManagement',
        component: () => import('@/views/monitor/BrandManagementView.vue'),
        meta: { title: '品牌监测设置', nav: 'monitor', auth: true },
      },
      {
        path: 'BrandReport',
        name: 'BrandReport',
        component: () => import('@/views/monitor/BrandReportView.vue'),
        meta: { title: '导出数据与报告', nav: 'monitor', auth: true },
      },
      {
        path: 'aiQuestionLibrary',
        name: 'aiQuestionLibrary',
        component: () => import('@/views/monitor/AiQuestionLibraryView.vue'),
        meta: { title: 'AI问题库', nav: 'monitor', auth: true },
      },
    ],
  },
  {
    path: '/toolbox',
    name: 'toolbox',
    component: () => import('@/views/ToolboxView.vue'),
    meta: { title: '工具箱', nav: 'toolbox', auth: true },
  },
  {
    path: '/ecommerceBrandRanking',
    name: 'ecommerceBrandRanking',
    component: () => import('@/views/EcommerceRankingView.vue'),
    meta: { title: '电商品牌排行榜', nav: null },
  },
  {
    path: '/referenceSourceRanking',
    name: 'referenceSourceRanking',
    component: () => import('@/views/ReferenceRankingView.vue'),
    meta: { title: 'GEO引用站点排行', nav: null },
  },
  {
    path: '/setting',
    name: 'setting',
    component: () => import('@/views/SettingView.vue'),
    meta: { title: '我的', auth: true },
  },
  { path: '*', redirect: '/question' },
];

const router = new VueRouter({
  mode: 'history',
  routes,
});

router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || 'A3GEO'}-A3GEO-GEO搜索排名优化平台`;
  if (to.matched.some((r) => r.meta.auth) && !store.getters.isLoggedIn) {
    store.commit('SET_LOGIN_DIALOG', true);
    next({ path: '/question', query: { redirect: to.fullPath } });
    return;
  }
  next();
});

export default router;
