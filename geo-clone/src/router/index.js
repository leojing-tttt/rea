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
    name: 'monitor',
    component: () => import('@/views/GateView.vue'),
    meta: { title: '品牌监测', nav: 'monitor', auth: true, gate: 'monitor' },
  },
  {
    path: '/toolbox',
    name: 'toolbox',
    component: () => import('@/views/GateView.vue'),
    meta: { title: '工具箱', nav: 'toolbox', auth: true, gate: 'toolbox' },
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
  if (to.meta.auth && !store.getters.isLoggedIn) {
    store.commit('SET_LOGIN_DIALOG', true);
    next({ path: '/question', query: { redirect: to.fullPath } });
    return;
  }
  next();
});

export default router;
