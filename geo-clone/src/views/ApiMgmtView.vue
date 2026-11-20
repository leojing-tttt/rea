<template>
  <div class="page-shell api-mgmt">
    <div class="head">
      <div>
        <h1>API 管理</h1>
        <p class="muted">
          多平台模型 API 配置与凭证元数据（密钥仅通过环境变量 / 本地文件，表单不提交 secret）
        </p>
      </div>
      <div class="head-actions">
        <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="reload">刷新</el-button>
        <el-button size="small" type="primary" icon="el-icon-plus" @click="openCredCreate">新建凭证</el-button>
      </div>
    </div>

    <section class="card block">
      <div class="block-title">
        <h2>平台健康与配置</h2>
        <span class="muted">{{ platforms.length }} 个平台</span>
      </div>
      <el-table v-loading="loading" :data="platforms" size="small" stripe>
        <el-table-column label="健康" width="88" align="center">
          <template slot-scope="{ row }">
            <span class="health-pill" :class="row.state || 'GREEN'">
              <span class="health-dot" :class="row.state || 'GREEN'" />
              {{ row.state || 'GREEN' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="平台" min-width="110">
          <template slot-scope="{ row }">
            <div class="plat-name">{{ row.name }}</div>
            <div class="muted tiny">{{ row.platformId }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template slot-scope="{ row }">
            <el-tag size="mini" :type="statusTagType(row.status)" effect="plain">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="rpm_limit" label="RPM" width="80" />
        <el-table-column prop="daily_quota" label="日配额" width="90" />
        <el-table-column prop="credential_ref" label="credential_ref" min-width="150" show-overflow-tooltip />
        <el-table-column prop="circuit" label="断路器" width="100">
          <template slot-scope="{ row }">
            <span class="muted">{{ row.circuit || 'Closed' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="relay" label="中转 / baseUrl" min-width="160" show-overflow-tooltip>
          <template slot-scope="{ row }">
            <div v-if="row.relay || row.baseUrl">
              <div v-if="row.relay" class="tiny">{{ row.relay }}</div>
              <div v-if="row.baseUrl" class="muted tiny">{{ row.baseUrl }}</div>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="168" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="openPlatformEdit(row)">编辑</el-button>
            <el-button type="text" size="mini" :disabled="!row.credential_ref" @click="resetCircuit(row)">
              重置断路器
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <p v-if="statusHint" class="hint muted">{{ statusHint }}</p>
    </section>

    <section class="card block">
      <div class="block-title">
        <h2>凭证元数据</h2>
        <span class="muted">{{ credentials.length }} 条 · 不含密钥值</span>
      </div>
      <el-table v-loading="loading" :data="credentials" size="small" stripe>
        <el-table-column prop="id" label="id" min-width="150" show-overflow-tooltip />
        <el-table-column prop="platformId" label="平台" width="110" />
        <el-table-column prop="label" label="标签" width="120" />
        <el-table-column prop="secret_backend" label="后端" width="90" />
        <el-table-column prop="secret_env" label="secret_env" min-width="160" show-overflow-tooltip>
          <template slot-scope="{ row }">
            <code v-if="row.secret_env">{{ row.secret_env }}</code>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template slot-scope="{ row }">
            <el-tag size="mini" :type="statusTagType(row.status)" effect="plain">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_healthy_at" label="最近健康" width="170" show-overflow-tooltip>
          <template slot-scope="{ row }">
            {{ row.last_healthy_at || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template slot-scope="{ row }">
            <el-button type="text" size="mini" @click="openCredEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog
      :title="platformDialogTitle"
      :visible.sync="platformDialogVisible"
      width="520px"
      append-to-body
      @closed="platformForm = emptyPlatformForm()"
    >
      <el-form v-if="platformForm" ref="platformForm" :model="platformForm" label-width="120px" size="small">
        <el-form-item label="平台">
          <span>{{ platformForm.name }} ({{ platformForm.platformId }})</span>
        </el-form-item>
        <el-form-item label="status">
          <el-select v-model="platformForm.status" style="width: 100%">
            <el-option label="active" value="active" />
            <el-option label="disabled" value="disabled" />
            <el-option label="maintenance" value="maintenance" />
          </el-select>
        </el-form-item>
        <el-form-item label="rpm_limit">
          <el-input-number v-model="platformForm.rpm_limit" :min="1" :max="100000" controls-position="right" />
        </el-form-item>
        <el-form-item label="daily_quota">
          <el-input-number v-model="platformForm.daily_quota" :min="1" :max="10000000" controls-position="right" />
        </el-form-item>
        <el-form-item label="credential_ref">
          <el-select v-model="platformForm.credential_ref" filterable allow-create default-first-option style="width: 100%">
            <el-option v-for="c in credentials" :key="c.id" :label="c.id" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="relay">
          <el-input v-model="platformForm.relay" placeholder="可选中转标识 / URL" clearable />
        </el-form-item>
        <el-form-item label="baseUrl">
          <el-input v-model="platformForm.baseUrl" placeholder="可选中转站 base URL" clearable />
        </el-form-item>
        <el-form-item label="adapter_mode">
          <el-select v-model="platformForm.adapter_mode" style="width: 100%">
            <el-option label="mock" value="mock" />
            <el-option label="real" value="real" />
            <el-option label="per-platform" value="per-platform" />
          </el-select>
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button size="small" @click="platformDialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="savePlatform">保存</el-button>
      </span>
    </el-dialog>

    <el-dialog
      :title="credDialogTitle"
      :visible.sync="credDialogVisible"
      width="520px"
      append-to-body
      @closed="credForm = emptyCredForm()"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="不要在此填写 API Key / token。只登记 env 变量名或文件路径提示。"
        style="margin-bottom: 14px"
      />
      <el-form v-if="credForm" :model="credForm" label-width="120px" size="small">
        <el-form-item v-if="!credForm.isCreate" label="id">
          <span>{{ credForm.id }}</span>
        </el-form-item>
        <el-form-item label="platformId" required>
          <el-select
            v-model="credForm.platformId"
            filterable
            allow-create
            default-first-option
            :disabled="!credForm.isCreate"
            style="width: 100%"
          >
            <el-option
              v-for="p in platforms"
              :key="p.platformId"
              :label="`${p.name} (${p.platformId})`"
              :value="p.platformId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="label">
          <el-input v-model="credForm.label" placeholder="如 prod-a / mock-default" />
        </el-form-item>
        <el-form-item label="secret_backend">
          <el-select v-model="credForm.secret_backend" style="width: 100%">
            <el-option label="env" value="env" />
            <el-option label="file" value="file" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="credForm.secret_backend === 'env'" label="secret_env">
          <el-input v-model="credForm.secret_env" placeholder="环境变量名，如 GEO_CRED_DOUBAO" />
        </el-form-item>
        <el-form-item v-else label="secret_file">
          <el-input v-model="credForm.secret_file" placeholder="相对 .data/api-mgmt/secrets/ 的文件名" />
        </el-form-item>
        <el-form-item label="status">
          <el-select v-model="credForm.status" style="width: 100%">
            <el-option label="active" value="active" />
            <el-option label="disabled" value="disabled" />
            <el-option label="rotated" value="rotated" />
          </el-select>
        </el-form-item>
        <el-form-item label="rpm_limit">
          <el-input-number v-model="credForm.rpm_limit" :min="0" :max="100000" controls-position="right" />
        </el-form-item>
        <el-form-item label="daily_quota">
          <el-input-number v-model="credForm.daily_quota" :min="0" :max="10000000" controls-position="right" />
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button size="small" @click="credDialogVisible = false">取消</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="saveCredential">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import http from '@/api/http';

function emptyPlatformForm() {
  return {
    platformId: '',
    name: '',
    status: 'active',
    rpm_limit: 60,
    daily_quota: 1000,
    credential_ref: '',
    relay: '',
    baseUrl: '',
    adapter_mode: 'mock',
  };
}

function emptyCredForm() {
  return {
    isCreate: true,
    id: '',
    platformId: '',
    label: 'default',
    secret_backend: 'env',
    secret_env: '',
    secret_file: '',
    status: 'active',
    rpm_limit: 60,
    daily_quota: 1000,
  };
}

export default {
  name: 'ApiMgmtView',
  data() {
    return {
      loading: false,
      saving: false,
      platforms: [],
      credentials: [],
      statusHint: '',
      platformDialogVisible: false,
      platformForm: emptyPlatformForm(),
      credDialogVisible: false,
      credForm: emptyCredForm(),
    };
  },
  computed: {
    platformDialogTitle() {
      return this.platformForm && this.platformForm.platformId
        ? `编辑平台 · ${this.platformForm.name || this.platformForm.platformId}`
        : '编辑平台';
    },
    credDialogTitle() {
      return this.credForm && this.credForm.isCreate ? '新建凭证元数据' : '编辑凭证元数据';
    },
  },
  created() {
    this.reload();
  },
  methods: {
    emptyPlatformForm,
    emptyCredForm,
    statusTagType(status) {
      if (status === 'active') return 'success';
      if (status === 'disabled' || status === 'maintenance') return 'danger';
      if (status === 'rotated') return 'warning';
      return 'info';
    },
    async reload() {
      this.loading = true;
      this.statusHint = '';
      try {
        const [statusRes, configRes, credRes] = await Promise.all([
          http.get('/geo/platform_status'),
          http.get('/geo/platform_config'),
          http.get('/geo/credentials'),
        ]);
        const statusList = (statusRes.data && statusRes.data.list) || [];
        const configList = (configRes.data && configRes.data.list) || [];
        const configById = {};
        configList.forEach((c) => {
          configById[c.platformId] = c;
        });
        this.platforms = statusList.map((s) => {
          const cfg = configById[s.platformId] || {};
          return {
            ...cfg,
            ...s,
            status: cfg.status || 'active',
            rpm_limit: cfg.rpm_limit != null ? cfg.rpm_limit : s.rpm_limit,
            daily_quota: cfg.daily_quota != null ? cfg.daily_quota : s.daily_quota,
            credential_ref: s.credential_ref || cfg.credential_ref,
            relay: s.relay || cfg.relay || null,
            baseUrl: s.baseUrl || cfg.baseUrl || null,
            adapter_mode: cfg.adapter_mode || s.adapter || 'mock',
          };
        });
        this.credentials = (credRes.data && credRes.data.list) || [];
        const red = this.platforms.filter((p) => p.state === 'RED').length;
        const yellow = this.platforms.filter((p) => p.state === 'YELLOW').length;
        if (red || yellow) {
          this.statusHint = `当前 ${red} 红 / ${yellow} 黄；断路器 Open 时调度会跳过该平台（任务可能 partial）。`;
        }
      } catch (err) {
        this.$message.error((err && err.message) || '加载失败');
      } finally {
        this.loading = false;
      }
    },
    openPlatformEdit(row) {
      this.platformForm = {
        platformId: row.platformId,
        name: row.name,
        status: row.status || 'active',
        rpm_limit: row.rpm_limit != null ? row.rpm_limit : 60,
        daily_quota: row.daily_quota != null ? row.daily_quota : 1000,
        credential_ref: row.credential_ref || '',
        relay: row.relay || '',
        baseUrl: row.baseUrl || '',
        adapter_mode: row.adapter_mode || 'mock',
      };
      this.platformDialogVisible = true;
    },
    async savePlatform() {
      const f = this.platformForm;
      if (!f.platformId) return;
      this.saving = true;
      try {
        await http.put(`/geo/platform_config/${encodeURIComponent(f.platformId)}`, {
          status: f.status,
          rpm_limit: f.rpm_limit,
          daily_quota: f.daily_quota,
          credential_ref: f.credential_ref || null,
          relay: f.relay || null,
          baseUrl: f.baseUrl || null,
          adapter_mode: f.adapter_mode || 'mock',
        });
        this.$message.success('平台配置已保存');
        this.platformDialogVisible = false;
        await this.reload();
      } catch (err) {
        this.$message.error((err && err.message) || '保存失败');
      } finally {
        this.saving = false;
      }
    },
    openCredCreate() {
      this.credForm = {
        ...emptyCredForm(),
        isCreate: true,
        platformId: (this.platforms[0] && this.platforms[0].platformId) || '',
      };
      this.credDialogVisible = true;
    },
    openCredEdit(row) {
      this.credForm = {
        isCreate: false,
        id: row.id,
        platformId: row.platformId,
        label: row.label || 'default',
        secret_backend: row.secret_backend || 'env',
        secret_env: row.secret_env || '',
        secret_file: row.secret_file || '',
        status: row.status || 'active',
        rpm_limit: row.rpm_limit != null ? row.rpm_limit : 60,
        daily_quota: row.daily_quota != null ? row.daily_quota : 1000,
      };
      this.credDialogVisible = true;
    },
    async saveCredential() {
      const f = this.credForm;
      if (!f.platformId) {
        this.$message.warning('请选择 platformId');
        return;
      }
      const payload = {
        platformId: f.platformId,
        label: f.label || 'default',
        secret_backend: f.secret_backend || 'env',
        secret_env: f.secret_backend === 'env' ? f.secret_env || null : null,
        secret_file: f.secret_backend === 'file' ? f.secret_file || null : null,
        status: f.status || 'active',
        rpm_limit: f.rpm_limit,
        daily_quota: f.daily_quota,
      };
      this.saving = true;
      try {
        if (f.isCreate) {
          await http.post('/geo/credentials', payload);
        } else {
          await http.put(`/geo/credentials/${encodeURIComponent(f.id)}`, payload);
        }
        this.$message.success('凭证元数据已保存');
        this.credDialogVisible = false;
        await this.reload();
      } catch (err) {
        this.$message.error((err && err.message) || '保存失败');
      } finally {
        this.saving = false;
      }
    },
    async resetCircuit(row) {
      if (!row.platformId || !row.credential_ref) return;
      try {
        await this.$confirm(
          `重置 ${row.name || row.platformId} / ${row.credential_ref} 的断路器？`,
          '重置断路器',
          { type: 'warning', confirmButtonText: '重置', cancelButtonText: '取消' }
        );
      } catch (_) {
        return;
      }
      try {
        await http.post('/geo/circuit/reset', {
          platformId: row.platformId,
          credential_ref: row.credential_ref,
        });
        this.$message.success('断路器已重置');
        await this.reload();
      } catch (err) {
        this.$message.error((err && err.message) || '重置失败');
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.api-mgmt {
  h1 {
    margin: 0 0 4px;
    font-size: 22px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.block {
  padding: 16px 18px 12px;
  margin-bottom: 16px;
}
.block-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.plat-name {
  font-weight: 600;
}
.tiny {
  font-size: 12px;
  line-height: 1.3;
}
.health-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}
.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  background: #67c23a;
}
.health-dot.GREEN,
.health-pill.GREEN .health-dot {
  background: #67c23a;
}
.health-dot.YELLOW,
.health-pill.YELLOW .health-dot {
  background: #e6a23c;
}
.health-dot.RED,
.health-pill.RED .health-dot {
  background: #f56c6c;
}
.health-pill.GREEN {
  color: #67c23a;
}
.health-pill.YELLOW {
  color: #e6a23c;
}
.health-pill.RED {
  color: #f56c6c;
}
.hint {
  margin: 10px 0 4px;
  font-size: 12px;
}
code {
  font-size: 12px;
  background: #f5f7fa;
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
