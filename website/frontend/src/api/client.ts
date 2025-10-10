/**
 * API Client Configuration
 * Axios instance with interceptors for authentication and error handling
 */

import axios, { AxiosError } from 'axios';
import { useAppStore } from '../store/appStore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = useAppStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const { response } = error;

    if (response?.status === 401) {
      // Unauthorized - logout user
      useAppStore.getState().logout();
      window.location.href = '/login';
    }

    if (response?.status === 429) {
      // Rate limited
      useAppStore.getState().addNotification({
        type: 'error',
        message: 'Rate limit exceeded. Please try again later.',
      });
    }

    return Promise.reject(error);
  }
);

export default apiClient;
