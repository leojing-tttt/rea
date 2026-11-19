import Vue from 'vue';
import Vuex from 'vuex';
import http from '@/api/http';

Vue.use(Vuex);

const TOKEN_KEY = 'a3geo_mvp_token';
const USER_KEY = 'a3geo_mvp_user';

function readStoredAuth() {
  if (typeof localStorage === 'undefined') return { token: '', user: null };
  const token = localStorage.getItem(TOKEN_KEY) || '';
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch (_) {
    user = null;
  }
  return { token, user };
}

const storedAuth = readStoredAuth();

export default new Vuex.Store({
  state: {
    token: storedAuth.token,
    user: storedAuth.user,
    loginDialog: false,
    platforms: [],
    history: [],
    activeTask: null,
  },
  getters: {
    isLoggedIn: (s) => Boolean(s.token),
    points: (s) => (s.user && s.user.points) || 0,
  },
  mutations: {
    SET_LOGIN_DIALOG(state, v) {
      state.loginDialog = v;
    },
    SET_AUTH(state, { token, user }) {
      state.token = token || '';
      state.user = user || null;
    },
    SET_PLATFORMS(state, list) {
      state.platforms = list || [];
    },
    SET_HISTORY(state, list) {
      state.history = list || [];
    },
    SET_ACTIVE_TASK(state, task) {
      state.activeTask = task;
    },
    SET_POINTS(state, points) {
      if (state.user) state.user.points = points;
    },
  },
  actions: {
    hydrate({ commit, dispatch }) {
      const token = localStorage.getItem(TOKEN_KEY) || '';
      let user = null;
      try {
        user = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      } catch (_) {
        user = null;
      }
      if (token) commit('SET_AUTH', { token, user });
      return Promise.all([dispatch('loadPlatforms'), dispatch('loadHistory')]);
    },
    openLogin({ commit }) {
      commit('SET_LOGIN_DIALOG', true);
    },
    async login({ commit, dispatch }, payload) {
      const res = await http.post('/user/login', payload);
      const { token, user } = res.data;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      commit('SET_AUTH', { token, user });
      commit('SET_LOGIN_DIALOG', false);
      await dispatch('loadHistory');
      return user;
    },
    logout({ commit, dispatch }) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      commit('SET_AUTH', { token: '', user: null });
      commit('SET_ACTIVE_TASK', null);
      return dispatch('loadHistory');
    },
    async loadPlatforms({ commit }) {
      const res = await http.get('/platforms');
      commit('SET_PLATFORMS', res.data);
    },
    async loadHistory({ commit }) {
      const res = await http.get('/geo/history');
      commit('SET_HISTORY', (res.data && res.data.result) || []);
    },
    async beginSearch({ commit, dispatch, getters }, payload) {
      if (!getters.isLoggedIn) {
        commit('SET_LOGIN_DIALOG', true);
        throw new Error('请先登录');
      }
      const res = await http.post('/geo/begin', payload);
      commit('SET_POINTS', res.data.points);
      if (this.state.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(this.state.user));
      }
      const taskId = res.data.task_id;
      commit('SET_ACTIVE_TASK', { task_id: taskId, status: 'running', prompt: payload.prompt, word: payload.brand || '' });
      await dispatch('pollTask', taskId);
      await dispatch('loadHistory');
      return taskId;
    },
    async pollTask({ commit }, taskId) {
      for (let i = 0; i < 20; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500));
        // eslint-disable-next-line no-await-in-loop
        const res = await http.get(`/geo/task/${taskId}`);
        commit('SET_ACTIVE_TASK', res.data);
        if (res.data.status === 'done') return res.data;
      }
      throw new Error('任务超时');
    },
  },
});
