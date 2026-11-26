import React, { useState } from 'react';
import {
  Bell,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { getHomeRouteForRole, useApp } from '../context/AuthContext.tsx';
import { formatISTDateTime } from '../shared/scheduling.ts';

export function PublicHeader() {
  const { path, navigate, user } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: 'How It Works', to: '/how-it-works' },
    { label: 'Rate Card', to: '/rate-card' },
    { label: 'For Collectors', to: '/for-collectors' },
    { label: 'For Recyclers', to: '/for-recyclers' },
    user
      ? { label: 'Sign Out', to: '__logout__' }
      : { label: 'Sign In', to: '/login' },
  ];

  const primaryCtaLabel = user ? 'Open Console' : 'Schedule Pickup';
  const primaryCtaTarget = user
    ? user.role === 'household'
      ? '/dashboard/book'
      : getHomeRouteForRole(user.role)
    : '/book';

  const handleNav = (to: string) => {
    setMobileOpen(false);
    if (to === '__logout__') {
      navigate('/login');
      return;
    }
    navigate(to);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single clean text wordmark */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-xl font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-emerald-700 rounded"
        >
          ScrapEase
        </button>

        {/* Zone 2: 5 single-line nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600" aria-label="Main navigation">
          {navItems.map((item) => {
            if (item.to === '__logout__') {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(getHomeRouteForRole(user!.role))}
                  className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
                >
                  My Account
                </button>
              );
            }
            const active = path === item.to;
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => handleNav(item.to)}
                className={`transition-colors whitespace-nowrap shrink-0 hover:underline underline-offset-4 ${
                  active ? 'text-emerald-800 font-semibold' : 'hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate(primaryCtaTarget)}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {primaryCtaLabel}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-slate-700 hover:bg-slate-100 rounded-lg"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() =>
                item.to === '__logout__' && user
                  ? (() => {
                      setMobileOpen(false);
                      navigate(getHomeRouteForRole(user.role));
                    })()
                  : handleNav(item.to)
              }
              className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              {item.to === '__logout__' ? 'My Account' : item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleNav('/contact')}
            className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            Contact
          </button>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  const { navigate } = useApp();
  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div>
            <div className="text-xl font-bold text-white font-display">ScrapEase</div>
            <p className="text-sm text-slate-400 mt-3 leading-relaxed">
              Doorstep scrap pickup scheduling, verified collection partners, and direct industrial recycling across Bengaluru.
            </p>
            <p className="text-xs font-mono text-slate-400 mt-4">
              Mon–Sat · 8:00 AM – 8:00 PM IST
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Platform</h4>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={() => navigate('/how-it-works')} className="hover:text-white">How It Works</button></li>
              <li><button type="button" onClick={() => navigate('/rate-card')} className="hover:text-white">Services & Rate Card</button></li>
              <li><button type="button" onClick={() => navigate('/for-collectors')} className="hover:text-white">For Collectors</button></li>
              <li><button type="button" onClick={() => navigate('/for-recyclers')} className="hover:text-white">For Recyclers</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={() => navigate('/about')} className="hover:text-white">About ScrapEase</button></li>
              <li><button type="button" onClick={() => navigate('/faq')} className="hover:text-white">FAQ</button></li>
              <li><button type="button" onClick={() => navigate('/contact')} className="hover:text-white">Contact Support</button></li>
              <li><button type="button" onClick={() => navigate('/login')} className="hover:text-white">Sign In</button></li>
              <li><button type="button" onClick={() => navigate('/admin')} className="hover:text-white">Admin Portal</button></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-white mb-3">Legal & Service Hub</h4>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={() => navigate('/privacy')} className="hover:text-white">Privacy Policy</button></li>
              <li><button type="button" onClick={() => navigate('/terms')} className="hover:text-white">Terms of Service</button></li>
              <li className="text-slate-400 pt-2 text-xs">
                100 Feet Road, Indiranagar, Bengaluru 560038 · support@scrapease.in
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} ScrapEase Circular Logistics Pvt. Ltd. All rights reserved.</span>
          <span>All pickup timings displayed in Indian Standard Time (IST).</span>
        </div>
      </div>
    </footer>
  );
}

export interface NavSectionItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

export function DashboardShell({
  title,
  roleLabel,
  navItems,
  children,
}: {
  title: string;
  roleLabel: string;
  navItems: NavSectionItem[];
  children: React.ReactNode;
}) {
  const { path, navigate, user, logout, notifications, unreadCount, markNotificationRead, markAllNotificationsRead } =
    useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-slate-200 shrink-0">
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xl font-bold tracking-tight text-slate-900 font-display whitespace-nowrap"
          >
            ScrapEase
          </button>
          <span className="text-xs font-medium text-slate-500">{roleLabel}</span>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active =
              path === item.to ||
              (item.to !== '/dashboard' &&
                item.to !== '/collector' &&
                item.to !== '/recycler' &&
                item.to !== '/admin' &&
                path.startsWith(item.to));
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => navigate(item.to)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <div className="px-3 py-2">
            <div className="text-sm font-semibold text-slate-900 truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg"
          >
            Public Website
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/40" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 max-w-[80vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
              <span className="text-lg font-bold font-display text-slate-900">ScrapEase · {roleLabel}</span>
              <button type="button" onClick={() => setSidebarOpen(false)} className="p-2 text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const active = path === item.to;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => {
                      setSidebarOpen(false);
                      navigate(item.to);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                      active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200">
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-lg"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline">{roleLabel}</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 relative">
            <button
              type="button"
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-emerald-700 text-white text-[10px] font-mono font-semibold rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Notifications</span>
                  <div className="flex items-center gap-3">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="text-xs font-medium text-emerald-700 hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                    <button type="button" onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-slate-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-sm text-slate-500">No notifications yet.</div>
                  ) : (
                    notifications.slice(0, 12).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={async () => {
                          if (!n.is_read) await markNotificationRead(n.id);
                          setNotifOpen(false);
                          if (n.link) navigate(n.link);
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                          n.is_read ? 'bg-white' : 'bg-emerald-50/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900">{n.title}</span>
                          {!n.is_read && <span className="text-[11px] font-medium text-emerald-700">New</span>}
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                        <p className="text-[11px] font-mono text-slate-400 mt-1">{formatISTDateTime(n.created_at)}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
