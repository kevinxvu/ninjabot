import axios from 'axios';
import type { AxiosResponse } from 'axios';

const api = axios.create({
  baseURL: '/',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a response interceptor to automatically extract data
api.interceptors.response.use(
  (response: AxiosResponse) => response.data,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;
