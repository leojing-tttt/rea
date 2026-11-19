<template>
  <div class="monitor-layout">
    <aside class="monitor-sider card">
      <template v-for="item in menu">
        <div v-if="item.children" :key="item.path + '-group'" class="sider-group">
          <div
            class="sider-item group-head"
            :class="{ active: isGroupActive(item) }"
            @click="item.open = !item.open"
          >
            <i :class="item.icon"></i>
            <span>{{ item.label }}</span>
            <i class="el-icon-arrow-down chevron" :class="{ open: item.open }"></i>
          </div>
          <div v-show="item.open" class="sider-sub">
            <router-link
              v-for="child in item.children"
              :key="child.path"
              :to="child.path"
              class="sider-item sub"
              :class="{ active: isActive(child) }"
            >
              <span>{{ child.label }}</span>
            </router-link>
          </div>
        </div>
        <router-link
          v-else
          :key="item.path"
          :to="item.path"
          class="sider-item"
          :class="{ active: isActive(item) }"
        >
          <i :class="item.icon"></i>
          <span>{{ item.label }}</span>
        </router-link>
      </template>
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
        { path: '/monitor/tasks', label: 'AI对话记录', icon: 'el-icon-document' },
        { path: '/monitor/contentOptimization', label: '作品引用追踪', icon: 'el-icon-files' },
        {
          path: '/monitor/brandManagement',
          label: '品牌监测设置',
          icon: 'el-icon-setting',
          open: true,
          children: [
            { path: '/monitor/brandManagement', label: '监测计划' },
            { path: '/monitor/aiQuestionLibrary', label: 'AI问题库' },
            { path: '/monitor/BrandReport', label: '导出数据与报告' },
          ],
        },
      ],
    };
  },
  computed: {
    ...mapGetters(['points']),
  },
  watch: {
    $route: {
      immediate: true,
      handler(to) {
        const group = this.menu.find((m) => m.children);
        if (!group) return;
        if (
          to.path.startsWith('/monitor/brandManagement') ||
          to.path.startsWith('/monitor/aiQuestionLibrary') ||
          to.path.startsWith('/monitor/BrandReport')
        ) {
          group.open = true;
        }
      },
    },
  },
  methods: {
    isActive(item) {
      return this.$route.path === item.path;
    },
    isGroupActive(item) {
      return (item.children || []).some((c) => this.$route.path === c.path);
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
  cursor: pointer;
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
  &.sub {
    padding-left: 36px;
    font-size: 12px;
  }
  &.group-head .chevron {
    margin-left: auto;
    transition: transform 0.15s ease;
    &.open {
      transform: rotate(180deg);
    }
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
