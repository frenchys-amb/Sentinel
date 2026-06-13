import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL;
if (!API_URL) {
  console.error('REACT_APP_API_URL is not set. API calls will fail.');
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Token management ─────────────────────────────────────────

export const setTokens = (access, refresh) => {
  if (access) {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
  } else {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    delete api.defaults.headers.common['Authorization'];
  }
};

// Legacy compatibility: setAuthToken still works
export const setAuthToken = (token) => {
  // If called with null, clear tokens
  if (!token) {
    setTokens(null, null);
  }
  // If called with a JWT access token directly (from login flow)
  // This is handled by setTokens now
};

// Initialize from stored tokens on load
const storedAccess = localStorage.getItem('access_token');
if (storedAccess) {
  api.defaults.headers.common['Authorization'] = `Bearer ${storedAccess}`;
}

// ─── Auto-refresh interceptor ─────────────────────────────────

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and we haven't retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry refresh or login requests
      if (originalRequest.url?.includes('/token/refresh') || originalRequest.url?.includes('/login')) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        isRefreshing = false;
        // No refresh token — force logout
        setTokens(null, null);
        window.location.href = '/';
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${API_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });
        const newAccess = res.data.access;
        const newRefresh = res.data.refresh || refreshToken;
        setTokens(newAccess, newRefresh);

        processQueue(null, newAccess);
        originalRequest.headers['Authorization'] = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Refresh failed — force logout
        setTokens(null, null);
        window.location.href = '/';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // License check
    if (error.response?.status === 403 && error.response?.data?.code === 'LICENSE_INVALID') {
      // Will be handled by Toast in the calling component
    }

    return Promise.reject(error);
  }
);

// ─── Offline interceptor ──────────────────────────────────────

api.interceptors.request.use(
  async (config) => {
    if (!navigator.onLine && config.method !== 'get') {
      const offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
      offlineQueue.push({
        url: config.url,
        method: config.method,
        data: config.data,
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
      throw new axios.Cancel('Offline: Request queued');
    }
    return config;
  },
  (error) => Promise.reject(error)
);
