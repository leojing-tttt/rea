<template>
  <div class="page-shell setting">
    <aside class="side card">
      <div class="profile">
        <div class="avatar">A<sup>3</sup></div>
        <div class="name">{{ user && user.name }}</div>
        <div class="vip">企业版</div>
      </div>
      <div class="menu active">基本信息管理</div>
      <div class="menu muted">子账号管理（未实现）</div>
      <div class="menu">积分中心 · {{ points }}</div>
      <div class="menu muted">GEO管理（未实现）</div>
    </aside>
    <section class="content card">
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
    </section>
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex';

export default {
  name: 'SettingView',
  computed: {
    ...mapState(['user']),
    ...mapGetters(['points']),
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
  &.active {
    background: var(--geo-primary-soft);
    color: var(--geo-primary);
    font-weight: 600;
  }
  &.muted {
    color: #c0c4cc;
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
</style>
