<template>
  <div class="question-page">
    <aside class="sidebar card">
      <el-button type="primary" class="new-btn" icon="el-icon-search" round @click="resetComposer">
        开启新搜索
      </el-button>
      <div class="filters">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          size="mini"
          style="width: 100%"
        />
        <el-input v-model="historyQuery" size="mini" clearable prefix-icon="el-icon-search" placeholder="AI问题或品牌" />
      </div>
      <div class="history-title">
        <i class="el-icon-time"></i>
        搜索历史
      </div>
      <div class="history-list">
        <button
          v-for="item in filteredHistory"
          :key="item.task_id"
          type="button"
          class="history-item"
          :class="{ active: activeTask && activeTask.task_id === item.task_id }"
          @click="openHistory(item)"
        >
          <div class="row">
            <span v-if="item.isExample" class="tag-example">示例</span>
            <span class="prompt">{{ item.prompt }}</span>
          </div>
          <div class="meta">
            <span v-if="item.word" class="brand-chip">{{ item.word }}</span>
            <span class="time">{{ item.created_at }}</span>
          </div>
        </button>
        <div v-if="!filteredHistory.length" class="empty muted">暂无搜索历史</div>
        <div class="end muted">—没有更多了—</div>
      </div>
    </aside>

    <section class="main">
      <template v-if="!activeTask || activeTask.status === 'running' || showComposer">
        <h1 class="hero-title">输入你想验证的问题，看看AI引用了谁</h1>
        <div class="composer card">
          <div class="field-row">
            <span class="label"><span class="a3">A<sup>3</sup></span> AI问题：</span>
            <input v-model="form.prompt" class="main-input" placeholder="向AI咨询的问题，如：白酒品牌推荐？" />
            <button class="send-btn" type="button" :disabled="submitting" @click="submit">
              <i class="el-icon-top"></i>
            </button>
          </div>
          <div class="field-row brand-row">
            <span class="label">品牌名称：</span>
            <input v-model="form.brand" class="main-input" placeholder="品牌名称，如：A3GEO" />
          </div>

          <div class="platform-grid">
            <div v-for="p in platforms" :key="p.id" class="platform-card">
              <div class="platform-head">
                <span class="dot" :style="{ background: p.color }">{{ p.name.slice(0, 1) }}</span>
                <span class="name">{{ p.name }}</span>
              </div>
              <div class="modes">
                <label v-for="m in p.modes" :key="p.id + m.id" class="mode">
                  <input v-model="selectedKeys" type="checkbox" :value="keyOf(p.id, m.id)" />
                  <span class="mode-label">{{ m.label }}</span>
                  <span v-if="m.ecommerce" class="pill eco">电商</span>
                  <span class="pill" :class="m.tagType">{{ m.tag }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="bulk">
            <el-checkbox v-model="selectAll" :indeterminate="isIndeterminate" @change="onSelectAll">全选</el-checkbox>
            <el-checkbox v-model="fastOnly" @change="applyFastMode">快速模式</el-checkbox>
            <el-checkbox v-model="deepMode" @change="applyDeepMode">深度思考</el-checkbox>
          </div>
        </div>
        <div v-if="activeTask && activeTask.status === 'running'" class="running card">
          <i class="el-icon-loading"></i>
          流水线进行中（{{ pipelineStageLabel }}）· mock 平台原文 → 解析 → 聚合…
        </div>
      </template>

      <template v-else>
        <div class="result-head">
          <div>
            <h2>{{ activeTask.prompt }}</h2>
            <p class="muted">
              <span v-if="activeTask.word">品牌：{{ activeTask.word }} · </span>
              状态：已完成 · 消耗积分 {{ activeTask.points_cost || '-' }}
              <span v-if="activeTask.pipeline"> · 流水线 {{ activeTask.pipeline.stage }}</span>
            </p>
          </div>
          <el-button type="primary" plain round @click="resetComposer">开启新搜索</el-button>
        </div>
        <div v-if="activeTask.overview" class="pipeline-overview card">
          <div class="ov-title">聚合指标（来自流水线 parse→aggregate）</div>
          <div class="ov-grid">
            <div><strong>{{ activeTask.overview.ai_count }}</strong><span>对话次数</span></div>
            <div><strong>{{ pct(activeTask.overview.refer_rate) }}%</strong><span>品牌提及率</span></div>
            <div><strong>{{ pct(activeTask.overview.sov) }}%</strong><span>SOV</span></div>
            <div><strong>{{ activeTask.overview.avg_rank || '—' }}</strong><span>平均排名</span></div>
            <div><strong>{{ activeTask.overview.mention_count }}</strong><span>提及次数</span></div>
            <div><strong>{{ (activeTask.resources && activeTask.resources.site_count) || 0 }}</strong><span>引用站点</span></div>
          </div>
        </div>
        <div class="result-grid">
          <article v-for="(r, idx) in activeTask.results || []" :key="idx" class="result-card card">
            <header>
              <strong>{{ platformName(r.platform) }}</strong>
              <span class="muted">{{ r.mode }}</span>
              <el-tag v-if="r.mentioned" size="mini" type="danger" effect="plain">提及品牌 · 排名 {{ r.mention_rank }}</el-tag>
              <el-tag v-else size="mini" type="info" effect="plain">未提及</el-tag>
              <el-tag
                v-if="r.sentiment"
                size="mini"
                :type="r.sentiment.label === 'positive' ? 'success' : r.sentiment.label === 'negative' ? 'danger' : 'info'"
                effect="plain"
              >
                {{ r.sentiment.label }}
              </el-tag>
            </header>
            <p class="answer">{{ r.answer }}</p>
            <div class="cites">
              <div class="cites-title">引用来源</div>
              <a v-for="(c, i) in r.citations" :key="i" class="cite" :href="c.url" target="_blank" rel="noreferrer">
                <span class="site">{{ c.site }}</span>
                <span>{{ c.title }}</span>
              </a>
            </div>
          </article>
        </div>
      </template>
    </section>
  </div>
</template>

<script>
import { mapState } from 'vuex';

export default {
  name: 'QuestionView',
  data() {
    return {
      dateRange: null,
      historyQuery: '',
      form: { prompt: '', brand: '' },
      selectedKeys: [],
      selectAll: true,
      fastOnly: true,
      deepMode: false,
      submitting: false,
      showComposer: true,
    };
  },
  computed: {
    ...mapState(['platforms', 'history', 'activeTask']),
    allKeys() {
      const keys = [];
      this.platforms.forEach((p) => p.modes.forEach((m) => keys.push(this.keyOf(p.id, m.id))));
      return keys;
    },
    fastKeys() {
      const keys = [];
      this.platforms.forEach((p) =>
        p.modes.forEach((m) => {
          if (m.tagType === 'fast') keys.push(this.keyOf(p.id, m.id));
        })
      );
      return keys;
    },
    deepKeys() {
      const keys = [];
      this.platforms.forEach((p) =>
        p.modes.forEach((m) => {
          if (m.tagType === 'deep') keys.push(this.keyOf(p.id, m.id));
        })
      );
      return keys;
    },
    isIndeterminate() {
      const n = this.selectedKeys.length;
      return n > 0 && n < this.allKeys.length;
    },
    filteredHistory() {
      const q = this.historyQuery.trim();
      if (!q) return this.history;
      return this.history.filter((h) => `${h.prompt} ${h.word || ''}`.includes(q));
    },
    pipelineStageLabel() {
      const stage = (this.activeTask && this.activeTask.pipeline && this.activeTask.pipeline.stage) || 'created';
      const map = {
        created: '创建任务',
        fetch_raw: '存原文',
        parse: '解析',
        aggregate: '聚合',
        done: '完成',
      };
      return map[stage] || stage;
    },
  },
  watch: {
    platforms: {
      immediate: true,
      handler(list) {
        if (list && list.length && !this.selectedKeys.length) {
          this.applyFastMode(true);
          this.selectAll = this.selectedKeys.length === this.allKeys.length;
        }
      },
    },
  },
  created() {
    if (this.$route.query.prompt) this.form.prompt = String(this.$route.query.prompt);
    if (this.$route.query.brand) this.form.brand = String(this.$route.query.brand);
  },
  methods: {
    keyOf(platformId, modeId) {
      return `${platformId}::${modeId}`;
    },
    parseKey(key) {
      const [platformId, modeId] = key.split('::');
      return { platformId, modeId };
    },
    platformName(id) {
      const p = this.platforms.find((x) => x.id === id);
      return (p && p.name) || id;
    },
    pct(x) {
      return (100 * (x || 0)).toFixed(0);
    },
    onSelectAll(v) {
      this.selectedKeys = v ? [...this.allKeys] : [];
    },
    applyFastMode(v) {
      if (v) {
        this.deepMode = false;
        this.selectedKeys = [...this.fastKeys];
      }
      this.selectAll = this.selectedKeys.length === this.allKeys.length;
    },
    applyDeepMode(v) {
      if (v) {
        this.fastOnly = false;
        this.selectedKeys = [...new Set([...this.fastKeys, ...this.deepKeys])];
      }
      this.selectAll = this.selectedKeys.length === this.allKeys.length;
    },
    resetComposer() {
      this.showComposer = true;
      this.$store.commit('SET_ACTIVE_TASK', null);
      this.form = { prompt: '', brand: '' };
    },
    async openHistory(item) {
      if (item.isExample && !this.$store.getters.isLoggedIn) {
        this.form.prompt = item.prompt;
        this.form.brand = item.word || '';
        this.showComposer = true;
        this.$store.commit('SET_ACTIVE_TASK', null);
        return;
      }
      if (!this.$store.getters.isLoggedIn) {
        this.$store.dispatch('openLogin');
        return;
      }
      try {
        const http = (await import('@/api/http')).default;
        const res = await http.get(`/geo/task/${item.task_id}`);
        this.showComposer = false;
        this.$store.commit('SET_ACTIVE_TASK', res.data);
      } catch (_) {
        this.form.prompt = item.prompt;
        this.form.brand = item.word || '';
        this.showComposer = true;
      }
    },
    async submit() {
      if (!this.form.prompt.trim()) {
        this.$message.warning('请输入AI问题');
        return;
      }
      if (!this.selectedKeys.length) {
        this.$message.warning('至少选择一个平台');
        return;
      }
      if (!this.$store.getters.isLoggedIn) {
        this.$store.dispatch('openLogin');
        return;
      }
      this.submitting = true;
      this.showComposer = true;
      try {
        await this.$store.dispatch('beginSearch', {
          prompt: this.form.prompt.trim(),
          brand: this.form.brand.trim(),
          platforms: this.selectedKeys.map((k) => this.parseKey(k)),
        });
        this.showComposer = false;
        this.$message.success('检索完成（mock）');
      } catch (e) {
        if (e.message !== '请先登录') this.$message.error(e.message || '提交失败');
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.question-page {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px 20px 40px;
  min-height: calc(100vh - var(--geo-header-h));
}
.sidebar {
  padding: 14px;
  align-self: start;
  position: sticky;
  top: calc(var(--geo-header-h) + 16px);
  max-height: calc(100vh - var(--geo-header-h) - 32px);
  overflow: auto;
}
.new-btn {
  width: 100%;
  margin-bottom: 12px;
}
.filters {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}
.history-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #5c6069;
}
.history-item {
  width: 100%;
  text-align: left;
  border: 1px solid transparent;
  background: #f8f8fb;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  &.active,
  &:hover {
    border-color: rgba(201, 103, 125, 0.35);
    background: #fff;
  }
}
.row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.tag-example {
  background: var(--geo-primary);
  color: #fff;
  font-size: 11px;
  border-radius: 4px;
  padding: 1px 6px;
}
.prompt {
  font-size: 13px;
  font-weight: 600;
}
.meta {
  margin-top: 6px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #909399;
}
.brand-chip {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 0 8px;
}
.end,
.empty {
  text-align: center;
  font-size: 12px;
  margin-top: 8px;
}
.main {
  min-width: 0;
}
.hero-title {
  text-align: center;
  font-size: 28px;
  margin: 28px 0 18px;
  font-weight: 700;
}
.composer {
  padding: 22px 22px 16px;
  position: relative;
}
.field-row {
  display: grid;
  grid-template-columns: 120px 1fr 48px;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.brand-row {
  grid-template-columns: 120px 1fr;
  padding-right: 58px;
}
.label {
  font-weight: 600;
  font-size: 14px;
}
.a3 {
  color: var(--geo-primary);
  margin-right: 2px;
}
.main-input {
  border: none;
  outline: none;
  font-size: 15px;
  padding: 10px 0;
  border-bottom: 1px solid #eef0f4;
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
  font-size: 18px;
  justify-self: end;
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.platform-grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.platform-card {
  border: 1px solid #eef0f4;
  border-radius: 12px;
  padding: 8px 6px;
  background: #fafafc;
}
.platform-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}
.dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}
.name {
  font-size: 12px;
  font-weight: 600;
}
.modes {
  display: grid;
  gap: 4px;
}
.mode {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
  font-size: 11px;
  cursor: pointer;
}
.mode-label {
  color: #5c6069;
}
.pill {
  border-radius: 4px;
  padding: 0 4px;
  font-size: 10px;
  &.fast {
    background: #fff4d6;
    color: #cf9236;
  }
  &.deep {
    background: #eef4ff;
    color: #3b82f6;
  }
  &.eco {
    background: #fff0e8;
    color: #e67e22;
  }
}
.bulk {
  display: flex;
  gap: 16px;
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed #eef0f4;
}
.running {
  margin-top: 16px;
  padding: 16px;
  text-align: center;
  color: var(--geo-primary);
}
.result-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin: 12px 0 16px;
  h2 {
    margin: 0 0 6px;
  }
}
.pipeline-overview {
  padding: 14px 16px;
  margin-bottom: 14px;
}
.ov-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #5c6069;
}
.ov-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  text-align: center;
  div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  strong {
    font-size: 20px;
  }
  span {
    font-size: 12px;
    color: #909399;
  }
}
.result-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.result-card {
  padding: 14px;
  header {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
  }
}
.answer {
  font-size: 13px;
  line-height: 1.7;
  color: #303133;
}
.cites-title {
  font-size: 12px;
  color: #909399;
  margin: 10px 0 6px;
}
.cite {
  display: flex;
  gap: 8px;
  font-size: 12px;
  padding: 6px 0;
  border-top: 1px solid #f2f3f5;
  color: #5c6069;
  .site {
    color: var(--geo-primary);
    min-width: 48px;
  }
}
@media (max-width: 1100px) {
  .platform-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .question-page {
    grid-template-columns: 1fr;
  }
  .sidebar {
    position: static;
    max-height: none;
  }
}
</style>
