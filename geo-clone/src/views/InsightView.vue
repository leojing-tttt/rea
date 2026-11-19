<template>
  <div class="insight-page">
    <aside class="sidebar card">
      <el-button type="primary" class="new-btn" icon="el-icon-search" round @click="reset">开启新洞察</el-button>
      <el-input v-model="q" size="mini" clearable prefix-icon="el-icon-search" placeholder="搜索..." />
      <div class="history-title">历史记录</div>
      <div class="history-item">
        <span class="tag-example">示例</span>
        <strong>欧莱雅</strong>
        <div class="muted">AI问题：5 · 2026-09-16 09:55</div>
      </div>
      <div class="end muted">—没有更多了—</div>
    </aside>
    <section class="main">
      <h1>立即开启品牌洞察</h1>
      <div class="composer card">
        <div class="row">
          <span class="a3">A<sup>3</sup></span>
          <input v-model="brand" class="main-input" placeholder="品牌名称，如: A3GEO" @keyup.enter="start" />
          <button class="send-btn" type="button" @click="start"><i class="el-icon-top"></i></button>
        </div>
        <p class="hint muted">MVP-1：洞察页为视觉壳。提交将跳转实时搜索并预填品牌，走 mock 检索闭环。</p>
      </div>
    </section>
  </div>
</template>

<script>
export default {
  name: 'InsightView',
  data() {
    return { brand: '', q: '' };
  },
  methods: {
    reset() {
      this.brand = '';
    },
    start() {
      if (!this.brand.trim()) {
        this.$message.warning('请输入品牌名称');
        return;
      }
      this.$router.push({ path: '/question', query: { brand: this.brand.trim(), prompt: `${this.brand.trim()}品牌怎么样` } });
    },
  },
};
</script>

<style lang="scss" scoped>
.insight-page {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px 20px 40px;
}
.sidebar {
  padding: 14px;
}
.new-btn {
  width: 100%;
  margin-bottom: 10px;
}
.history-title {
  margin: 14px 0 8px;
  font-weight: 600;
  color: #5c6069;
}
.history-item {
  background: #f8f8fb;
  border-radius: 10px;
  padding: 10px;
}
.tag-example {
  display: inline-block;
  background: var(--geo-primary);
  color: #fff;
  font-size: 11px;
  border-radius: 4px;
  padding: 1px 6px;
  margin-right: 6px;
}
.end {
  text-align: center;
  margin-top: 10px;
  font-size: 12px;
}
.main h1 {
  text-align: center;
  margin: 48px 0 18px;
}
.composer {
  padding: 22px;
  max-width: 760px;
  margin: 0 auto;
}
.row {
  display: grid;
  grid-template-columns: 36px 1fr 48px;
  gap: 10px;
  align-items: center;
}
.a3 {
  color: var(--geo-primary);
  font-weight: 700;
}
.main-input {
  border: none;
  border-bottom: 1px solid #eef0f4;
  outline: none;
  font-size: 16px;
  padding: 12px 0;
  background: transparent;
}
.send-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: var(--geo-primary);
  color: #fff;
  cursor: pointer;
}
.hint {
  margin-top: 14px;
  font-size: 12px;
}
</style>
