import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setMemoryToken } from '../lib/api.ts';
import { signInHouseholdWithGoogle, signOutFirebaseClient } from '../lib/firebaseClient.ts';
import type {
  Category,
  FaqItem,
  NotificationItem,
  ScheduleSettings,
  SiteBanner,
  TestimonialItem,
  User,
} from '../shared/types.ts';

export interface BootstrapData {
  categories: Category[];
  settings: ScheduleSettings;
  faqs: FaqItem[];
  testimonials: TestimonialItem[];
  banners: SiteBanner[];
  latestRateUpdate: string | null;
  impact: {
    completedPickups: number;
    totalKgRecycled: number;
    liveDbKgRecycled: number;
    totalPayoutInr: number;
    co2SavedKg: number;
    treesEquivalent: number;
    activeCollectors: number;
    serviceAreasCount: number;
  };
}

interface AppContextValue {
  path: string;
  navigate: (to: string) => void;
  user: User | null;
  authLoading: boolean;
  login: (email: string, password: string, portal: 'household' | 'collector' | 'recycler') => Promise<User>;
  loginWithGoogleHousehold: () => Promise<User>;
  adminLogin: (email: string, passcode: string) => Promise<User>;
  adminClaim: (email: string, passcode: string) => Promise<User>;
  register: (payload: Record<string, unknown>) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  bootstrap: BootstrapData | null;
  refreshBootstrap: () => Promise<void>;
  notifications: NotificationItem[];
  unreadCount: number;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname || '/');
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await apiFetch<BootstrapData>('/api/public/bootstrap');
      setBootstrap(data);
    } catch (err) {
      console.error('Bootstrap fetch error:', err);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(data.notifications);
    } catch {
      setNotifications([]);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ token?: string; user: User | null }>('/api/auth/me');
      if (data.token) setMemoryToken(data.token);
      setUser(data.user);
      if (data.user) {
        const notifData = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
        setNotifications(notifData.notifications);
      } else {
        setNotifications([]);
      }
    } catch {
      setUser(null);
      setNotifications([]);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBootstrap();
    refreshUser();
  }, [refreshBootstrap, refreshUser]);

  const login = useCallback(async (email: string, password: string, portal: 'household' | 'collector' | 'recycler') => {
    const data = await apiFetch<{ token: string; user: User }>(`/api/auth/login/${portal}`, {
      method: 'POST',
      body: JSON.stringify({ email, password, portal }),
    });
    setMemoryToken(data.token);
    setUser(data.user);
    const notifData = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
    setNotifications(notifData.notifications);
    return data.user;
  }, []);

  const loginWithGoogleHousehold = useCallback(async () => {
    const idToken = await signInHouseholdWithGoogle();
    const data = await apiFetch<{ token: string; user: User }>('/api/auth/google-household', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    setMemoryToken(data.token);
    setUser(data.user);
    const notifData = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
    setNotifications(notifData.notifications);
    return data.user;
  }, []);

  const adminLogin = useCallback(async (email: string, passcode: string) => {
    const data = await apiFetch<{ token: string; user: User }>('/api/admin-auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, passcode }),
    });
    setMemoryToken(data.token);
    setUser(data.user);
    const notifData = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
    setNotifications(notifData.notifications);
    return data.user;
  }, []);

  const adminClaim = useCallback(async (email: string, passcode: string) => {
    const data = await apiFetch<{ token: string; user: User }>('/api/admin-auth/claim', {
      method: 'POST',
      body: JSON.stringify({ email, passcode }),
    });
    setMemoryToken(data.token);
    setUser(data.user);
    const notifData = await apiFetch<{ notifications: NotificationItem[] }>('/api/notifications');
    setNotifications(notifData.notifications);
    return data.user;
  }, []);

  const register = useCallback(async (payload: Record<string, unknown>) => {
    const data = await apiFetch<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setMemoryToken(data.token);
    setUser(data.user);
    setNotifications([]);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    await signOutFirebaseClient();
    setMemoryToken(null);
    setUser(null);
    setNotifications([]);
    navigate('/');
  }, [navigate]);

  const markNotificationRead = useCallback(async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <AppContext.Provider
      value={{
        path,
        navigate,
        user,
        authLoading,
        login,
        loginWithGoogleHousehold,
        adminLogin,
        adminClaim,
        register,
        logout,
        refreshUser,
        bootstrap,
        refreshBootstrap,
        notifications,
        unreadCount,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function getHomeRouteForRole(role: User['role']): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'collector':
      return '/collector';
    case 'recycler':
      return '/recycler';
    default:
      return '/dashboard';
  }
}
