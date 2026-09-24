import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('token');

        if (token) {
          // Always re-validate against the backend on boot. The auth middleware
          // re-reads the account status from the database, so a Super Admin
          // suspend/block takes effect the moment the engineer refreshes.
          const { data } = await api.get('/auth/me');
          const profile = data.data.user;
          setUser(profile);
          setMustChangePassword(Boolean(data.data.mustChangePassword));
          localStorage.setItem('user', JSON.stringify(profile));
        }
      } catch (error) {
        // Covers expired tokens, suspended/blocked/inactive accounts and deleted users.
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const profile = data.data.user;

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(profile));
    setUser(profile);
    setMustChangePassword(Boolean(data.data.mustChangePassword));

    return { user: profile, mustChangePassword: Boolean(data.data.mustChangePassword) };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Logout must succeed locally even if the network call fails.
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setMustChangePassword(false);
    navigate('/login');
  }, [navigate]);

  const updateProfile = useCallback(async (payload) => {
    // FormData is used when a profile photo is attached so multer can read it.
    // The explicit header overrides the instance's JSON default - otherwise
    // axios would convert the FormData (and the file) into a JSON string.
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    const { data } = await api.put(
      '/auth/profile',
      payload,
      isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined
    );
    const profile = data.data;
    localStorage.setItem('user', JSON.stringify(profile));
    setUser(profile);
    return profile;
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
    setMustChangePassword(false);
    return data;
  }, []);

  /** Refresh the cached profile (used after login and after admin-side edits) */
  const refreshProfile = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setUser(data.data.user);
    setMustChangePassword(Boolean(data.data.mustChangePassword));
    return data.data.user;
  }, []);

  const value = {
    user,
    loading,
    mustChangePassword,
    login,
    logout,
    updateProfile,
    changePassword,
    refreshProfile,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'SUPER_ADMIN',
    isEngineer: user?.role === 'ENGINEER',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


export { api };
export default AuthContext;
