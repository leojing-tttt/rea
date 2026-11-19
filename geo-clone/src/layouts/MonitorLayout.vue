<template>
  <div class="monitor-layout">
    <aside class="monitor-sider card">
      <router-link
        v-for="item in menu"
        :key="item.path"
        :to="item.path"
        class="sider-item"
        :class="{ active: isActive(item), disabled: item.disabled }"
        @click.native="onClick(item, $event)"
      >
        <i :class="item.icon"></i>
        <span>{{ item.label }}</span>
        <el-tag v-if="item.soon" size="mini" type="info" effect="plain">后续</el-tag>
      </router-link>
      <div class="sider-foot">
        <div class="points-chip" @click="$router.push('/setting')">
          <span class="avatar">A<sup>3</sup></span>
          <strong>{{ points }}</strong>
        </div>
      </div>
    </aside>
    <section class="monitor-content">
      <router-view />
    </section>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';

export default {
  name: 'MonitorLayout',
  data() {
    return {
      menu: [
        { path: '/monitor/dashboard', label: '数据大盘', icon: 'el-icon-data-board' },
        { path: '/monitor/brandMentions', label: '提及率和排名', icon: 'el-icon-s-data' },
        { path: '/monitor/sentiment', label: '品牌舆情追踪', icon: 'el-icon-chat-dot-round' },
        { path: '/monitor/sources', label: 'AI引用来源', icon: 'el-icon-link' },
        { path: '/monitor/tasks', label: 'AI对话记录', icon: 'el-icon-document', soon: true },
        { path: '/monitor/contentOptimization', label: '作品引用追踪', icon: 'el-icon-files', soon: true },
        { path: '/monitor/brandManagement', label: '品牌监测设置', icon: 'el-icon-setting', soon: true },
      ],
    };
  },
  computed: {
    ...mapGetters(['points']),
  },
  methods: {
    isActive(item) {
      return this.$route.path === item.path || this.$route.path.startsWith(item.path + '/');
    },
    onClick(item, e) {
      if (item.soon && item.path !== '/monitor/brandMentions') {
        // allow navigation to placeholder
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.monitor-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 12px;
  max-width: 1440px;
  margin: 0 auto;
  padding: 12px 16px 32px;
  min-height: calc(100vh - var(--geo-header-h));
}
.monitor-sider {
  padding: 10px 8px;
  align-self: start;
  position: sticky;
  top: calc(var(--geo-header-h) + 12px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 520px;
}
.sider-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  color: #5c6069;
  font-size: 13px;
  border-left: 3px solid transparent;
  i {
    font-size: 16px;
  }
  &:hover {
    background: #f7f5f9;
    color: var(--geo-primary);
  }
  &.active {
    background: var(--geo-primary-soft);
    color: var(--geo-primary);
    border-left-color: var(--geo-primary);
    font-weight: 600;
  }
}
.sider-foot {
  margin-top: auto;
  padding-top: 16px;
}
.points-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 10px;
  background: #f8f8fb;
  cursor: pointer;
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--geo-primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
}
.monitor-content {
  min-width: 0;
}
@media (max-width: 900px) {
  .monitor-layout {
    grid-template-columns: 1fr;
  }
  .monitor-sider {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    min-height: 0;
  }
}
</style>
