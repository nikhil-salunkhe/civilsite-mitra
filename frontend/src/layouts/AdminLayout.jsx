import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';

export const AdminLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // logout() clears the session and routes to /login itself.
  const handleLogout = () => logout();

  const navItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: 'home' },
    { path: '/admin/engineers', label: 'Engineers', icon: 'users' },
    { path: '/admin/engineers/create', label: 'Add Engineer', icon: 'userPlus' },
    { path: '/admin/sites', label: 'All Sites', icon: 'building' },
    { path: '/admin/reports', label: 'Reports', icon: 'chartBar' },
    { path: '/admin/analytics', label: 'Analytics', icon: 'trendingUp' },
    { path: '/admin/audit-logs', label: 'Audit Logs', icon: 'clipboard' },
    { path: '/admin/profile', label: 'My Profile', icon: 'user' },
    { path: '/admin/settings', label: 'Settings', icon: 'cog' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <Link to="/admin/dashboard" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <span className="text-lg font-bold text-gray-900">CivilSiteMitra</span>
                <span className="text-xs text-gray-500 block">Admin Panel</span>
              </div>
            </Link>
            <button type="button" aria-label="Close menu" onClick={() => setSidebarOpen(false)} className="lg:hidden btn btn-icon btn-secondary rounded-full">
              <Icon name="x" size={18} />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6">
            <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Menu</p>
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon name={item.icon} size={19} className="shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="px-4 py-4 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <Avatar user={user} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
            <button type="button" onClick={handleLogout} className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Icon name="logout" size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4">
            <button type="button" aria-label="Open menu" onClick={() => setSidebarOpen(true)} className="lg:hidden btn btn-secondary btn-icon">
              <Icon name="menu" size={18} />
            </button>
            <div className="hidden lg:block">
              <h2 className="text-lg font-semibold text-gray-900">
                {navItems.find(item => location.pathname.startsWith(item.path))?.label || 'Dashboard'}
              </h2>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
