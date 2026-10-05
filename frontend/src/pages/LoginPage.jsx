import React, { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import { toast } from 'react-toastify';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // Forgot-password flow (spec section 3): request -> (dev token) -> reset.
  const [view, setView] = useState('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Already signed in (e.g. after a browser Back to /login). Hand the decision
  // to the router with <Navigate> instead of calling navigate() during render,
  // which is a side effect in the render phase and can loop.
  if (isAuthenticated) {
    return <Navigate to={user?.role === 'SUPER_ADMIN' ? '/admin/dashboard' : '/dashboard'} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      toast.success('Login successful!');
      
      if (result.user.role === 'SUPER_ADMIN') {
        navigate('/admin/dashboard');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please check your credentials.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: forgotEmail });
      setResetToken(data.resetToken || '');
      setView('reset-sent');
      toast.success(data.message || 'Reset instructions generated');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Request failed');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setResetLoading(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token: resetToken, newPassword });
      toast.success(data.message || 'Password reset successfully');
      setView('login');
      setPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Reset failed');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <div className="w-20 h-20 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-600/20">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">CivilSiteMitra</h1>
          <p className="text-sm text-gray-500 mt-1">Build Better | Manage Smarter</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-xl shadow-xl shadow-gray-200/50 p-6">
          {view === 'login' && (
          <React.Fragment>
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Sign in to your account</h2>
            <p className="text-sm text-gray-500 mt-1">Enter your credentials to access the system</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="input"
                required
              />
            </div>

            <div className="text-right">
              <button
                type="button"
                onClick={() => { setView('forgot'); setError(''); }}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Forgot password?
              </button>
            </div>

            {error && (
              <div className="alert alert-danger">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-3"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0112 16c-2.211 0-4.003-.604-5.464-1.78l-.9-1.2C4.967 13.768 4.38 13.5 4 13.5c-.38 0-.702.268-.864.646-.162.378-.213.74-.213 1.113h.013M12 22a10 10 0 100-20 10 10 0 000 20z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
          </React.Fragment>
          )}

          {view === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Forgot your password?</h2>
                <p className="text-sm text-gray-500 mt-1">Enter your registered email to generate a reset link</p>
              </div>
              <div>
                <label className="label">Email Address</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="input"
                  required
                />
              </div>
              <button type="submit" disabled={forgotLoading} className="btn btn-primary w-full py-3">
                {forgotLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => setView('login')} className="btn btn-secondary w-full">
                Back to Sign In
              </button>
            </form>
          )}

          {view === 'reset-sent' && (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Reset your password</h2>
                <p className="text-sm text-gray-500 mt-1">
                  If email delivery is not configured, use the reset token below (development mode only)
                </p>
              </div>
              {resetToken ? (
                <div>
                  <label className="label">Reset Token</label>
                  <textarea
                    readOnly
                    value={resetToken}
                    className="input h-20 text-xs"
                    onClick={(e) => e.target.select()}
                  />
                </div>
              ) : (
                <div className="alert alert-danger text-sm">
                  No reset token available in this environment. Ask your Super Admin to reset your password.
                </div>
              )}
              <div>
                <label className="label">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="label">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  required
                  minLength={6}
                />
              </div>
              <button type="submit" disabled={resetLoading || !resetToken} className="btn btn-primary w-full py-3">
                {resetLoading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button type="button" onClick={() => setView('login')} className="btn btn-secondary w-full">
                Back to Sign In
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          &copy; {new Date().getFullYear()} CivilSiteMitra by TechMitra Technology
        </p>
        <p className="mt-2 text-center text-xs text-gray-500">
          <Link
            to="/terms-and-conditions"
            className="rounded underline underline-offset-2 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
          >
            Terms &amp; Conditions
          </Link>
        </p>
      </div>
    </div>
  );
};
