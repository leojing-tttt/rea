<template>
  <div id="geo-app" class="geo-app">
    <AppHeader />
    <main class="geo-main">
      <router-view />
    </main>
    <aside class="cs-fab" title="客服">
      <i class="el-icon-refresh-right"></i>
      <span>客服</span>
    </aside>
    <LoginDialog />
  </div>
</template>

<script>
import AppHeader from '@/components/AppHeader.vue';
import LoginDialog from '@/components/LoginDialog.vue';

export default {
  name: 'App',
  components: { AppHeader, LoginDialog },
  created() {
    this.$store.dispatch('hydrate');
  },
};
</script>
