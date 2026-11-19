<template>
  <div class="page-shell setting">
    <aside class="side card">
      <div class="profile">
        <div class="avatar">A<sup>3</sup></div>
        <div class="name">{{ user && user.name }}</div>
        <div class="vip">企业版</div>
      </div>
      <div class="menu" :class="{ active: tab === 'profile' }" @click="tab = 'profile'">基本信息管理</div>
      <div class="menu muted">子账号管理（未实现）</div>
      <div class="menu" :class="{ active: tab === 'points' }" @click="tab = 'points'">
        积分中心 · {{ points }}
      </div>
      <div class="menu" :class="{ active: tab === 'pipeline' }" @click="tab = 'pipeline'">流水线任务</div>
      <div class="menu muted">GEO管理（未实现）</div>
    </aside>
    <section class="content card">
      <template v-if="tab === 'profile'">
        <h2>基本信息管理</h2>
        <div class="row">
          <div class="avatar sm">A<sup>3</sup></div>
          <div>{{ user && user.name }}</div>
          <a class="edit" href="javascript:;">编辑</a>
        </div>
        <div class="row">
          <span class="label">手机绑定</span>
          <span>{{ user && user.phone }}</span>
        </div>
        <div class="row">
          <span class="label">登录密码</span>
          <span>********</span>
        </div>
        <div class="row">
          <span class="label">可用积分</span>
          <strong class="points">{{ points }}</strong>
        </div>
      </template>

      <template v-else-if="tab === 'points'">
        <h2>积分中心</h2>
        <p class="muted">当前可用 <strong class="points">{{ points }}</strong> · mock 流水线按平台数扣费（2 积分/平台）</p>
        <el-table :data="ledger" size="small" stripe>
          <el-table-column prop="at" label="时间" width="170" />
          <el-table-column prop="action" label="事项" min-width="160" />
          <el-table-column prop="delta" label="变动" width="90" />
          <el-table-column prop="balance" label="余额" width="90" />
        </el-table>
      </template>

      <template v-else>
        <h2>流水线任务</h2>
        <p class="muted">
          已完成 {{ summary.done_count || 0 }} / {{ summary.task_count || 0 }} · 解析对话
          {{ summary.dialog_count || 0 }} · 引用 {{ summary.citation_count || 0 }}
        </p>
        <el-table :data="summary.recent || []" size="small" stripe>
          <el-table-column prop="created_at" label="时间" width="170" />
          <el-table-column prop="prompt" label="问题" min-width="160" show-overflow-tooltip />
          <el-table-column prop="word" label="品牌" width="90" />
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column prop="stage" label="阶段" width="100" />
        </el-table>
        <el-button class="mt" type="text" @click="$router.push('/question')">去实时搜索跑任务</el-button>
      </template>
    </section>
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex';
import http from '@/api/http';

export default {
  name: 'SettingView',
  data() {
    return {
      tab: 'profile',
      summary: { recent: [] },
      ledger: [
        { at: '2026-11-19 10:00:00', action: '开通企业版赠送', delta: '+15000', balance: 15000 },
        { at: '2026-11-19 11:20:00', action: 'mock 搜索扣费', delta: '-28', balance: 14972 },
        { at: '2026-11-19 12:05:00', action: '幂等重放（未扣费）', delta: '0', balance: 14972 },
      ],
    };
  },
  computed: {
    ...mapState(['user']),
    ...mapGetters(['points']),
  },
  watch: {
    tab(v) {
      if (v === 'pipeline') this.loadSummary();
    },
  },
  methods: {
    async loadSummary() {
      try {
        const res = await http.get('/geo/pipeline/summary');
        this.summary = res.data || { recent: [] };
      } catch (_) {
        this.summary = { recent: [], task_count: 0, done_count: 0 };
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.setting {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
}
.side {
  padding: 18px;
}
.profile {
  text-align: center;
  margin-bottom: 18px;
}
.avatar {
  width: 64px;
  height: 64px;
  margin: 0 auto 8px;
  border-radius: 50%;
  background: var(--geo-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  &.sm {
    width: 36px;
    height: 36px;
    margin: 0;
    font-size: 12px;
  }
}
.vip {
  display: inline-block;
  margin-top: 6px;
  background: #f5f7fa;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  color: #606266;
}
.menu {
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  &.active {
    background: var(--geo-primary-soft);
    color: var(--geo-primary);
    font-weight: 600;
  }
  &.muted {
    color: #c0c4cc;
    cursor: default;
  }
}
.content {
  padding: 22px;
}
.row {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
}
.label {
  color: #909399;
}
.edit,
.points {
  color: var(--geo-primary);
}
.muted {
  color: #909399;
  margin-bottom: 12px;
}
.mt {
  margin-top: 12px;
}
</style>
