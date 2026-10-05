import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { API_BASE_URL } from '../utils/format';

// Single source of truth. This used to be a hardcoded '/api', which silently
// ignored VITE_API_URL and sent every call to the frontend's own origin - so a
// deployed build could never reach the backend. Resolve it from the shared
// config instead: '/api' in dev (Vite proxies to :5000), the real API origin in
// production.
const API_BASE = API_BASE_URL;

// Endpoints that legitimately work without a session (sign-in, password
// recovery). Every other call is an authenticated call.
const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/forgot-password', '/auth/reset-password'];
const isPublicRequest = (url = '') => PUBLIC_ENDPOINTS.some((path) => url.includes(path));

// The AuthProvider registers here, so a 401 raised anywhere in the app can sign
// the user out through the router instead of forcing a full page reload.
const authFailureHandlers = new Set();
export const onAuthFailure = (handler) => {
  authFailureHandlers.add(handler);
  return () => authFailureHandlers.delete(handler);
};
const notifyAuthFailure = () => authFailureHandlers.forEach((handler) => handler());

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests. __hadToken snapshots whether the outgoing call
// actually carried a session, so the 401 handler can tell a rejected live
// session apart from expected post-sign-out noise.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.__hadToken = Boolean(token);
  return config;
});

// Handle responses
// Transient backend hiccups (server restarting, Atlas dropping the TLS
// connection, the dev proxy losing its upstream) arrive as errors with NO
// response object, or as a 502/503. Those used to reach the user as a
// confusing "Failed to load ..." toast even though a second attempt succeeds.
// GETs are idempotent, so retry them once after a short pause. Mutations
// (POST/PUT/PATCH/DELETE) are never retried, so a payment can never be
// submitted twice.
//
// Every page in this app surfaces failures as
//   toast.error(err.response?.data?.message || 'Failed to load ...')
// which means a cancellation or a post-sign-out 401 would otherwise flash a
// toast on the login screen. To keep that from happening, errors the user must
// never see carry a `__silent` flag: the individual catch blocks skip the toast
// whenever they see it (falling back to a local error state if they have one).
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};
    const method = (config.method || 'get').toLowerCase();
    const status = error.response?.status;
    // Aborted requests must never be retried: they were cancelled on purpose.
    const canceled = error.code === 'ERR_CANCELED';
    // Covers axios v1 CanceledError, AbortController aborts, and the legacy
    // CancelToken path - all of which simply mean "the component went away".
    const aborted =
      canceled ||
      error.name === 'CanceledError' ||
      error.name === 'AbortError' ||
      axios.isCancel?.(error);
    if (aborted) {
      error.__silent = true;
      return Promise.reject(error);
    }
    const transient = !error.response || status === 502 || status === 503;

    if (method === 'get' && transient && !config.__retried) {
      config.__retried = true;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return api(config);
    }

    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // A 401 alone no longer means "the session died": the backend also 401s
      // calls that legitimately carry no token, e.g. logout()'s best-effort
      // sign-out ping fired after the token was cleared, or a dashboard request
      // that was already in flight when the user signed out. Reword + notify
      // only when the call actually carried a session (a live token the server
      // rejected). Token-less 401s are expected post-sign-out noise and pass
      // through silently - never a toast, never a redirect loop.
      if (config.__hadToken) {
        // The middleware text ("Access denied. No token provided.") is rendered
        // verbatim by the pages that surface err.response.data.message, which
        // reads like a stack trace to a user. For an expired session show
        // something actionable instead; expired tokens reach the server WITH
        // the (old) Authorization header, so they still land in this branch.
        if (!isPublicRequest(config.url) && error.response?.data?.message) {
          error.response.data.message = 'Your session has expired. Please sign in again.';
        }
        // Sign out through the router. A window.location redirect would hard
        // reload the app (re-bootstrapping Vite and React) and lose the SPA state.
        notifyAuthFailure();
      } else {
        // Token-less 401s (sign-out ping, in-flight request landing after
        // logout) must stay silent: the login page is already on screen and a
        // "session expired" toast there would be pure noise.
        error.__silent = true;
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
  const [mustAcceptTerms, setMustAcceptTerms] = useState(false);
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
          setMustAcceptTerms(Boolean(data.data.mustAcceptTerms));
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

  // Sign-out happens through the router, so no hard page reload is needed and
  // the SPA state (toasts, scroll, open dialogs) is not thrown away.
  useEffect(
    () =>
      onAuthFailure(() => {
        setUser(null);
        setMustChangePassword(false);
        setMustAcceptTerms(false);
        navigate('/login', { replace: true });
      }),
    [navigate]
  );

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const profile = data.data.user;

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(profile));
    setUser(profile);
    setMustChangePassword(Boolean(data.data.mustChangePassword));
    setMustAcceptTerms(Boolean(data.data.mustAcceptTerms));

    return {
      user: profile,
      mustChangePassword: Boolean(data.data.mustChangePassword),
      mustAcceptTerms: Boolean(data.data.mustAcceptTerms),
    };
  }, []);

  /**
   * Records acceptance of the Terms & Conditions.
   * The gate is cleared locally as well as server-side so the user is not
   * bounced back to the terms page by the route guard on the next navigation.
   */
  const acceptTerms = useCallback(async () => {
    const { data } = await api.post('/auth/accept-terms', { accepted: true });
    setMustAcceptTerms(false);
    if (user) {
      const updated = { ...user, termsAccepted: true, termsVersion: data.data.termsVersion };
      setUser(updated);
      localStorage.setItem('user', JSON.stringify(updated));
    }
    return data.data;
  }, [user]);

  const logout = useCallback(async () => {
    // Tear the session down synchronously, and only then leave the screen.
    // Clearing token + user before navigating means the protected routes are
    // already unauthenticated in the same commit as the route change. Logging
    // out the other way round navigated to /login while `user` was still set, so
    // /login immediately redirected back into the dashboard, remounted it, and
    // fired token-less API calls that surfaced as
    // "Access denied. No token provided." followed by a hard page reload.
    //
    // The sign-out ping is authenticated on purpose: it carries the token so a
    // cleared/absent token means the ping simply isn't sent at all (there is no
    // server state to invalidate - see the route comment). Skipping the call
    // instead of firing it session-less removes the last source of token-less
    // 401s on the login screen entirely.
    const token = localStorage.getItem('token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setMustChangePassword(false);
    toast.dismiss();
    navigate('/login', { replace: true });

    // Best-effort server sign-out (audit trail). Deliberately not awaited: the
    // user is already signed out locally and must not wait on the network.
    if (token) {
      try {
        await api.post('/auth/logout', undefined, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        // Logout must succeed locally even if the network call fails. The ping
        // carried a token, so a 401 here means the session truly expired and
        // the auth-failure handler signs the user out - which is a no-op given
        // the teardown above - plus a silent flag the login screen respects.
      }
    }
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
    mustAcceptTerms,
    login,
    logout,
    updateProfile,
    changePassword,
    acceptTerms,
    refreshProfile,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'SUPER_ADMIN',
    isEngineer: user?.role === 'ENGINEER',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


export { api };
export default AuthContext;
