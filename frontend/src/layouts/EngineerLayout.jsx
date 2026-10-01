import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/Avatar';

// Grouped navigation. Every entry maps to an EXISTING route in App.jsx - no
// routes were added or removed. The same icon paths as before are reused.
const NAV_GROUPS = [
  {
    title: 'MAIN',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10' },
      { to: '/sites', label: 'My Sites', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
      { to: '/sites/create', label: 'Add Site', icon: 'M12 4v16m8-8H4' },
    ],
  },
  {
    title: 'PROJECT MANAGEMENT',
    items: [
      { to: '/workers', label: 'Workers', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z' },
      { to: '/materials', label: 'Materials', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
      { to: '/vendors', label: 'Vendors', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z' },
      { to: '/expenses', label: 'Expenses', icon: 'M12 8c-1.7 0-3 .9-3 2s1.3 2 3 2 3 .9 3 2-1.3 2-3 2m0-8c1.1 0 2.1.4 2.6 1M12 8V7m0 9v1m0-1c-1.1 0-2.1-.4-2.6-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { to: '/activities', label: 'Activities', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    ],
  },
  {
    title: 'ANALYTICS',
    items: [
      { to: '/reports', label: 'Reports', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.6a1 1 0 01.7.3l5.4 5.4a1 1 0 01.3.7V19a2 2 0 01-2 2z' },
      { to: '/documents', label: 'Documents', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { to: '/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      { to: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
      // Logout lives in the visible nav, not only inside the profile dropdown.
      // A dropdown-only logout was effectively invisible on short viewports,
      // where the ACCOUNT group is scrolled/clipped below the fold.
      { logout: true, label: 'Logout', icon: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1' },
    ],
  },
];

export const EngineerLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('csm-sidebar') === 'collapsed'; } catch { return false; }
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useAuth();

  // logout() clears the session and routes to /login itself.
  const handleLogout = () => logout();

  const toggleCollapsed = () => setCollapsed((v) => {
    const next = !v;
    try { localStorage.setItem('csm-sidebar', next ? 'collapsed' : 'expanded'); } catch { /* private mode */ }
    return next;
  });

  // mini = icons-only rail (desktop, collapsed). The mobile drawer always
  // renders full labels and closes itself on every navigation.
  const NavList = ({ mini = false, onNavigate }) => (
    <div>
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="mb-5">
          {!mini ? (
            <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {group.title}
            </p>
          ) : (
            <div className="h-px bg-gray-200 mx-1 mb-3" />
          )}
          <nav className="space-y-1">
            {group.items.map((item) => {
              // An action item (currently Logout) renders as a button, not a link.
              if (item.logout) {
                return (
                  <button
                    key="logout"
                    type="button"
                    onClick={() => { onNavigate?.(); handleLogout(); }}
                    title={mini ? item.label : undefined}
                    aria-label="Log out"
                    className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-danger-600 hover:bg-danger-50 transition-colors whitespace-nowrap ${
                      mini ? 'justify-center' : ''
                    }`}
                  >
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    {!mini && <span>{item.label}</span>}
                  </button>
                );
              }
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  title={mini ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      mini ? 'justify-center' : ''
                    } ${
                      isActive
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  {!mini && <span>{item.label}</span>}
                </NavLink>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile top bar */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <button type="button"  onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100">
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="font-bold text-gray-900">CivilSiteMitra</span>
        <div className="w-9" />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-gray-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-white h-full shadow-xl p-4">
            <div className="flex items-center justify-between mb-6">
              <span className="font-bold text-gray-900">Menu</span>
              <button type="button"  onClick={() => setSidebarOpen(false)} className="p-1 rounded hover:bg-gray-100">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <NavList onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar (collapsible: w-64 <-> w-20 icon rail) */}
      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 ${collapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 flex-col z-30 transition-[width] duration-200 overflow-hidden`}
      >
        <div className={`flex items-center justify-between gap-2 border-b border-gray-200 ${collapsed ? 'px-3 py-4' : 'px-4 py-4'}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 shrink-0 rounded-lg bg-primary-600 text-white font-bold flex items-center justify-center text-sm" aria-hidden="true">
              C
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-base font-bold text-gray-900 truncate">CivilSiteMitra</h1>
                <p className="text-[11px] text-gray-500 truncate">Build Better | Manage Smarter</p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors shrink-0"
          >
            <svg className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <NavList mini={collapsed} />
        </div>
        {/* Profile area: avatar + name/company + Profile/Settings/Logout menu.
            shrink-0 keeps it pinned; without it a long nav squeezes this row and
            the controls below the fold disappear entirely. */}
        <div className="relative shrink-0 p-3 border-t border-gray-200">
          <button
            type="button"
            onClick={() => setProfileOpen((v) => !v)}
            aria-expanded={profileOpen}
            aria-label="Open profile menu"
            title={collapsed ? `${user?.name || 'Engineer'} - profile menu` : undefined}
            className={`flex items-center gap-3 w-full rounded-lg hover:bg-gray-50 transition-colors ${collapsed ? 'justify-center p-1' : 'p-2'}`}
          >
            <Avatar user={user} size="sm" className={collapsed ? '' : ''} />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-medium text-gray-900 truncate">{user?.name || 'Engineer'}</span>
                  <span className="block text-xs text-gray-500 truncate">{user?.company || user?.email || ''}</span>
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </>
            )}
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} aria-hidden="true" />
              <div
                className="fixed z-50 w-44 bg-white border border-gray-200 rounded-xl shadow-lg p-1"
                style={{ left: collapsed ? '5rem' : '16rem', bottom: '1rem' }}
                role="menu"
              >
                <NavLink to="/profile" onClick={() => setProfileOpen(false)} role="menuitem" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Profile
                </NavLink>
                <NavLink to="/settings" onClick={() => setProfileOpen(false)} role="menuitem" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  </svg>
                  Settings
                </NavLink>
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); handleLogout(); }}
                  role="menuitem"
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-danger-600 hover:bg-danger-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 0 01-3 3H6a3 0 01-3-3V7a3 0 013-3h4a3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className={`${collapsed ? 'lg:ml-20' : 'lg:ml-64'} p-4 sm:p-6 lg:p-8 transition-[margin] duration-200`}>
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default EngineerLayout;
