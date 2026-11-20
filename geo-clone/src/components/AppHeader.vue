<template>
  <header class="geo-header">
    <div class="geo-header__inner">
      <router-link class="logo" to="/question">
        <span class="logo-a3">A<sup>3</sup></span>
        <span class="logo-geo">GEO</span>
      </router-link>

      <nav class="nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: activeNav === item.key }"
          @click.native="onNav(item)"
        >
          {{ item.label }}
          <i v-if="item.dropdown" class="el-icon-arrow-down"></i>
        </router-link>
      </nav>

      <div class="header-right">
        <template v-if="isLoggedIn">
          <span class="points" @click="$router.push('/setting')">
            <i class="el-icon-coin"></i>
            {{ points }}
          </span>
          <el-dropdown trigger="hover" @command="onUserCmd">
            <button class="avatar-btn" type="button">
              <span class="avatar">A<sup>3</sup></span>
            </button>
            <el-dropdown-menu slot="dropdown">
              <el-dropdown-item command="setting">个人设置</el-dropdown-item>
              <el-dropdown-item command="rank-eco">电商品牌榜</el-dropdown-item>
              <el-dropdown-item command="rank-ref">引用来源分布</el-dropdown-item>
              <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
        </template>
        <el-button v-else class="login_btn" type="primary" round @click="openLogin">
          登录/注册
        </el-button>
      </div>
    </div>
  </header>
</template>

<script>
import { mapGetters } from 'vuex';

export default {
  name: 'AppHeader',
  data() {
    return {
      navItems: [
        { key: 'question', label: '实时搜索', path: '/question' },
        { key: 'insight', label: '品牌洞察/报告', path: '/completeAnalysis' },
        { key: 'monitor', label: '品牌监测', path: '/monitor' },
        { key: 'api-mgmt', label: 'API 管理', path: '/api-mgmt' },
        { key: 'toolbox', label: '工具箱', path: '/toolbox', dropdown: true },
      ],
    };
  },
  computed: {
    ...mapGetters(['isLoggedIn', 'points']),
    activeNav() {
      return this.$route.meta.nav || null;
    },
  },
  methods: {
    openLogin() {
      this.$store.dispatch('openLogin');
    },
    onNav(item) {
      if (item.key === 'monitor' || item.key === 'toolbox' || item.key === 'api-mgmt') {
        if (!this.isLoggedIn) this.openLogin();
      }
    },
    async onUserCmd(cmd) {
      if (cmd === 'logout') {
        await this.$store.dispatch('logout');
        this.$message.success('已退出');
        this.$router.push('/question');
        return;
      }
      if (cmd === 'setting') this.$router.push('/setting');
      if (cmd === 'rank-eco') this.$router.push('/ecommerceBrandRanking');
      if (cmd === 'rank-ref') this.$router.push('/referenceSourceRanking');
    },
  },
};
</script>

<style lang="scss" scoped>
.geo-header {
  position: fixed;
  inset: 0 0 auto 0;
  height: var(--geo-header-h);
  z-index: 50;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(229, 231, 235, 0.8);
}
.geo-header__inner {
  max-width: 1400px;
  margin: 0 auto;
  height: 100%;
  padding: 0 20px;
  display: grid;
  grid-template-columns: 140px 1fr auto;
  align-items: center;
  gap: 16px;
}
.logo {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-weight: 700;
}
.logo-a3 {
  color: var(--geo-primary);
  font-size: 22px;
  letter-spacing: -0.5px;
  sup {
    font-size: 12px;
    top: -0.6em;
  }
}
.logo-geo {
  color: #1f1b22;
  font-size: 20px;
}
.nav {
  display: flex;
  justify-content: center;
  gap: 8px;
}
.nav-item {
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 14px;
  color: #5c6069;
  transition: all 0.15s ease;
  i {
    margin-left: 2px;
    font-size: 12px;
  }
  &:hover {
    color: var(--geo-primary);
  }
  &.active {
    background: var(--geo-primary);
    color: #fff;
  }
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.points {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--geo-primary-soft);
  color: var(--geo-primary);
  font-weight: 600;
  cursor: pointer;
}
.avatar-btn {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}
.avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--geo-primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  sup {
    font-size: 8px;
  }
}
.login_btn {
  padding: 8px 18px !important;
}
</style>
