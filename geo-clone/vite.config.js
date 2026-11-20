import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue2';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      vue: 'vue/dist/vue.esm.js',
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Trailing slash so SPA route /api-mgmt is not proxied to the API
      '/api/': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
});
