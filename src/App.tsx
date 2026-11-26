import React from 'react';
import { AppProvider, getHomeRouteForRole, useApp } from './context/AuthContext.tsx';
import { PublicFooter, PublicHeader } from './components/Layout.tsx';
import {
  AboutPage,
  ContactPage,
  FaqPage,
  ForCollectorsPage,
  ForRecyclersPage,
  HomePage,
  HowItWorksPage,
  PrivacyPage,
  RateCardPage,
  TermsPage,
} from './pages/PublicPages.tsx';
import { AdminGatePage, LoginPage, RegisterPage, RoleLoginPage } from './pages/AuthPages.tsx';
import { HouseholdDashboard } from './pages/HouseholdDashboard.tsx';
import { CollectorDashboard } from './pages/CollectorDashboard.tsx';
import { RecyclerDashboard } from './pages/RecyclerDashboard.tsx';
import { AdminDashboard } from './pages/AdminDashboard.tsx';
import { PublicBookingPage } from './pages/PublicBookingPage.tsx';
import type { UserRole } from './shared/types.ts';

function RoleGuard({
  allowed,
  children,
}: {
  allowed: UserRole[];
  children: React.ReactNode;
}) {
  const { user, authLoading, navigate } = useApp();
  const isAdminRoute = allowed.length === 1 && allowed[0] === 'admin';

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading workspace...
      </div>
    );
  }

  if (!user) {
    if (isAdminRoute) {
      return (
        <div className="min-h-screen flex flex-col bg-slate-50">
          <PublicHeader />
          <main className="flex-1">
            <AdminGatePage />
          </main>
          <PublicFooter />
        </div>
      );
    }

    const expectedRole = allowed[0] as 'household' | 'collector' | 'recycler';
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <PublicHeader />
        <main className="flex-1">
          <RoleLoginPage expectedRole={expectedRole} />
        </main>
        <PublicFooter />
      </div>
    );
  }

  if (!allowed.includes(user.role)) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
            <h2 className="text-xl font-bold text-slate-900">
              {isAdminRoute ? 'Admin Portal Access Restricted' : 'Role Access Restricted'}
            </h2>
            <p className="text-sm text-slate-600">
              {isAdminRoute ? (
                <>
                  You are signed in as a <strong className="capitalize">{user.role}</strong>. Household, collector,
                  and recycler accounts are blocked from accessing the Admin Portal.
                </>
              ) : (
                <>
                  You are signed in as <strong className="capitalize">{user.role}</strong>. This route requires{' '}
                  <strong className="capitalize">{allowed.join(' or ')}</strong> permissions.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => navigate(getHomeRouteForRole(user.role))}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Return to My Dashboard
            </button>
          </div>
        </main>
        <PublicFooter />
      </div>
    );
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { path } = useApp();

  if (path.startsWith('/dashboard')) {
    return (
      <RoleGuard allowed={['household']}>
        <HouseholdDashboard />
      </RoleGuard>
    );
  }
  if (path.startsWith('/collector')) {
    return (
      <RoleGuard allowed={['collector']}>
        <CollectorDashboard />
      </RoleGuard>
    );
  }
  if (path.startsWith('/recycler')) {
    return (
      <RoleGuard allowed={['recycler']}>
        <RecyclerDashboard />
      </RoleGuard>
    );
  }
  if (path.startsWith('/admin')) {
    return (
      <RoleGuard allowed={['admin']}>
        <AdminDashboard />
      </RoleGuard>
    );
  }

  const renderPublicPage = () => {
    switch (path) {
      case '/book':
        return <PublicBookingPage />;
      case '/how-it-works':
        return <HowItWorksPage />;
      case '/rate-card':
        return <RateCardPage />;
      case '/for-collectors':
        return <ForCollectorsPage />;
      case '/for-recyclers':
        return <ForRecyclersPage />;
      case '/about':
        return <AboutPage />;
      case '/faq':
        return <FaqPage />;
      case '/contact':
        return <ContactPage />;
      case '/privacy':
        return <PrivacyPage />;
      case '/terms':
        return <TermsPage />;
      case '/login':
        return <LoginPage />;
      case '/login/household':
        return <RoleLoginPage expectedRole="household" />;
      case '/login/collector':
        return <RoleLoginPage expectedRole="collector" />;
      case '/login/recycler':
        return <RoleLoginPage expectedRole="recycler" />;
      case '/register':
        return <RegisterPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <PublicHeader />
      <main className="flex-1">{renderPublicPage()}</main>
      <PublicFooter />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}
