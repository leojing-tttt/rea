import axios from 'axios';
import store from '@/store';

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

http.interceptors.request.use((config) => {
  const token = store.state.token;
  if (token) {
    config.headers.Authorization = token;
  }
  return config;
});

http.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body.code === 'number' && body.code !== 200) {
      return Promise.reject(new Error(body.msg || '请求失败'));
    }
    return body;
  },
  (err) => Promise.reject(err)
);

export default http;
