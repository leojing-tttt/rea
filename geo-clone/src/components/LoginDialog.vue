<template>
  <el-dialog
    :visible.sync="visible"
    width="420px"
    custom-class="login-dialog"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="login-panel">
      <div class="tabs">
        <button type="button" class="tab active">密码登录</button>
        <button type="button" class="tab muted" disabled>短信登录</button>
        <button type="button" class="tab muted" disabled>微信登录</button>
      </div>
      <el-form ref="form" :model="form" :rules="rules" @submit.native.prevent="submit">
        <el-form-item v-if="isUc" prop="email">
          <el-input
            v-model="form.email"
            placeholder="请输入邮箱"
            prefix-icon="el-icon-message"
          />
        </el-form-item>
        <el-form-item v-else prop="phone">
          <el-input
            v-model="form.phone"
            maxlength="11"
            placeholder="请输入手机号"
            prefix-icon="el-icon-mobile-phone"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="isUc ? '请输入密码' : '请输入密码（任意6位以上）'"
            prefix-icon="el-icon-lock"
            @keyup.enter.native="submit"
          />
        </el-form-item>
        <el-button class="submit" type="primary" :loading="loading" round @click="submit">登录</el-button>
      </el-form>
      <p class="agree muted">
        登录即代表同意
        <a href="javascript:;">用户协议</a>
        和
        <a href="javascript:;">隐私政策</a>
      </p>
      <p class="hint muted">{{ hint }}</p>
    </div>
  </el-dialog>
</template>

<script>
export default {
  name: 'LoginDialog',
  data() {
    return {
      loading: false,
      form: { phone: '13800138000', email: '', password: 'demo1234' },
    };
  },
  computed: {
    visible: {
      get() {
        return this.$store.state.loginDialog;
      },
      set(v) {
        this.$store.commit('SET_LOGIN_DIALOG', v);
      },
    },
    isUc() {
      return this.$store.state.authMode === 'uc';
    },
    hint() {
      if (this.isUc) {
        return '用户中心登录：邮箱 + 密码（经本服务代理 UC，积分仍为本地 mock）。';
      }
      return 'MVP mock：任意合法手机号 + 6 位以上密码即可登录，无需验证码。';
    },
    rules() {
      if (this.isUc) {
        return {
          email: [
            { required: true, message: '请输入邮箱', trigger: 'blur' },
            { type: 'email', message: '请输入正确邮箱', trigger: 'blur' },
          ],
          password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
        };
      }
      return {
        phone: [
          { required: true, message: '请输入手机号', trigger: 'blur' },
          { pattern: /^1\d{10}$/, message: '请输入正确手机号', trigger: 'blur' },
        ],
        password: [{ required: true, min: 6, message: '密码至少6位', trigger: 'blur' }],
      };
    },
  },
  methods: {
    submit() {
      this.$refs.form.validate(async (valid) => {
        if (!valid) return;
        this.loading = true;
        try {
          const payload = this.isUc
            ? { email: this.form.email, password: this.form.password }
            : { phone: this.form.phone, password: this.form.password };
          await this.$store.dispatch('login', payload);
          this.$message.success('登录成功');
          const redirect = this.$route.query.redirect;
          if (redirect) this.$router.replace(String(redirect));
        } catch (e) {
          this.$message.error(e.message || '登录失败');
        } finally {
          this.loading = false;
        }
      });
    },
  },
};
</script>

<style lang="scss">
.login-dialog {
  border-radius: 16px;
  overflow: hidden;
  .el-dialog__header {
    padding: 12px 16px 0;
  }
  .el-dialog__body {
    padding: 8px 28px 28px;
  }
}
</style>

<style lang="scss" scoped>
.tabs {
  display: flex;
  gap: 18px;
  margin-bottom: 18px;
}
.tab {
  border: none;
  background: transparent;
  font-size: 16px;
  font-weight: 600;
  color: var(--geo-text);
  padding: 0 0 8px;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  &.active {
    color: var(--geo-primary);
    border-bottom-color: var(--geo-primary);
  }
  &.muted {
    color: #c0c4cc;
    cursor: not-allowed;
    font-weight: 500;
  }
}
.submit {
  width: 100%;
  margin-top: 4px;
  height: 40px;
}
.agree,
.hint {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.5;
  a {
    color: var(--geo-primary);
  }
}
</style>
