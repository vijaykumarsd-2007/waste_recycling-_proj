import React, { useEffect, useState } from 'react';
import { ArrowRight, Factory, Home, Lock, ShieldCheck, Truck, Upload } from 'lucide-react';
import { getHomeRouteForRole, useApp } from '../context/AuthContext.tsx';
import { apiFetch, readImageFileAsDataUrl } from '../lib/api.ts';
import type { UserRole } from '../shared/types.ts';

type PortalRole = 'household' | 'collector' | 'recycler';

const PORTAL_META: Record<
  PortalRole,
  {
    title: string;
    subtitle: string;
    restrictionNote: string;
    placeholderEmail: string;
    registerLabel: string;
    icon: React.ReactNode;
  }
> = {
  household: {
    title: 'Household Sign In Portal',
    subtitle: 'For registered household accounts managing scrap pickups, saved addresses, and payouts.',
    restrictionNote: 'Collectors, recyclers, and administrators cannot sign in through this portal.',
    placeholderEmail: 'household@example.com',
    registerLabel: 'Register as Household',
    icon: <Home className="w-5 h-5 text-emerald-700 shrink-0" />,
  },
  collector: {
    title: 'Collector Partner Sign In Portal',
    subtitle: 'For KYC-verified scrap collection partners managing neighborhood pickups and digital weighing.',
    restrictionNote: 'Normal household users, recyclers, and administrators are blocked from this portal.',
    placeholderEmail: 'partner@example.com',
    registerLabel: 'Apply as Collector',
    icon: <Truck className="w-5 h-5 text-emerald-700 shrink-0" />,
  },
  recycler: {
    title: 'Recycler Business Sign In Portal',
    subtitle: 'For GST-verified recycling facilities bidding on city material lots and managing orders.',
    restrictionNote: 'Normal household users, collectors, and administrators are blocked from this portal.',
    placeholderEmail: 'procurement@facility.in',
    registerLabel: 'Register Recycler Facility',
    icon: <Factory className="w-5 h-5 text-emerald-700 shrink-0" />,
  },
};

export function GoogleSignInButton({
  onClick,
  loading,
  label = 'Sign in with Google',
}: {
  onClick: () => void;
  loading?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg flex items-center justify-center gap-3 text-sm font-semibold text-slate-800 transition-colors disabled:opacity-60 whitespace-nowrap"
    >
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      <span>{loading ? 'Connecting with Google...' : label}</span>
    </button>
  );
}

export function LoginPage() {
  const { loginWithGoogleHousehold, navigate } = useApp();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const handleGoogleHousehold = async () => {
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      const authedUser = await loginWithGoogleHousehold();
      navigate(getHomeRouteForRole(authedUser.role));
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const portals: Array<{
    role: PortalRole;
    title: string;
    description: string;
    to: string;
    icon: React.ReactNode;
  }> = [
    {
      role: 'household',
      title: 'Household Portal',
      description: 'Schedule pickups, manage addresses, and view payout history.',
      to: '/login/household',
      icon: <Home className="w-5 h-5 text-emerald-700 shrink-0" />,
    },
    {
      role: 'collector',
      title: 'Collector Partner Portal',
      description: 'Accept pincode assignments, log digital scale weights, and track earnings.',
      to: '/login/collector',
      icon: <Truck className="w-5 h-5 text-emerald-700 shrink-0" />,
    },
    {
      role: 'recycler',
      title: 'Recycler Business Portal',
      description: 'Browse aggregated city material lots and manage bulk collection orders.',
      to: '/login/recycler',
      icon: <Factory className="w-5 h-5 text-emerald-700 shrink-0" />,
    },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 py-14">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Select Your Sign-In Portal</h1>
        <p className="text-sm text-slate-600 mt-1">
          Each account role uses its own separate login portal. Cross-role sign-in is blocked.
        </p>

        <div className="mt-6 p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Selling Scrap as a Household?</div>
            <div className="text-xs text-slate-600 mt-0.5">
              Quick sign-in with your Google account to book doorstep pickups and track payouts.
            </div>
          </div>
          <GoogleSignInButton
            onClick={handleGoogleHousehold}
            loading={googleLoading}
            label="Sign in with Google (Household)"
          />
          {googleError && (
            <div className="p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">{googleError}</div>
          )}
        </div>

        <div className="mt-5 space-y-3">
          {portals.map((p) => (
            <button
              key={p.role}
              type="button"
              onClick={() => navigate(p.to)}
              className="w-full p-4 text-left bg-white border border-slate-200 hover:border-emerald-700 hover:bg-emerald-50/30 rounded-xl flex items-center justify-between gap-4 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{p.icon}</div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{p.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{p.description}</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-500 mb-2">Administration</div>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="w-full p-3.5 text-left bg-slate-50 border border-slate-200 hover:border-slate-900 hover:bg-slate-100 rounded-xl flex items-center justify-between gap-4 transition-colors"
          >
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-slate-900">Admin Portal Login</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Restricted to administrators only (private passcode required).
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />
          </button>
        </div>

        <p className="mt-6 text-center text-sm text-slate-600">
          New to ScrapEase?{' '}
          <button type="button" onClick={() => navigate('/register')} className="font-semibold text-emerald-700 hover:underline">
            Create an account
          </button>
        </p>
      </div>
    </div>
  );
}

export function RoleLoginPage({ expectedRole }: { expectedRole: PortalRole }) {
  const { user, login, loginWithGoogleHousehold, navigate } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const meta = PORTAL_META[expectedRole];

  useEffect(() => {
    setEmail('');
    setPassword('');
    setError(null);
  }, [expectedRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const authedUser = await login(email, password, expectedRole);
      navigate(getHomeRouteForRole(authedUser.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const authedUser = await loginWithGoogleHousehold();
      navigate(getHomeRouteForRole(authedUser.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  if (user) {
    if (user.role === expectedRole) {
      return (
        <div className="max-w-md mx-auto px-4 py-14">
          <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-slate-900">
              {meta.icon}
              <h1 className="text-xl font-bold">{meta.title}</h1>
            </div>
            <p className="text-sm text-slate-600">
              You are signed in as <strong>{user.name}</strong> ({user.email}).
            </p>
            <button
              type="button"
              onClick={() => navigate(getHomeRouteForRole(user.role))}
              className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Open My Dashboard
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-md mx-auto px-4 py-14">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900">Portal Access Restricted</h1>
          <p className="text-sm text-slate-600">
            You are signed in with a <strong className="capitalize">{user.role}</strong> account.{' '}
            {meta.restrictionNote}
          </p>
          <button
            type="button"
            onClick={() => navigate(getHomeRouteForRole(user.role))}
            className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
          >
            Return to My Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex items-center gap-2.5 text-slate-900">
          {meta.icon}
          <h1 className="text-xl font-bold">{meta.title}</h1>
        </div>
        <p className="text-sm text-slate-600 mt-1.5">{meta.subtitle}</p>
        <p className="text-xs text-slate-500 mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          {meta.restrictionNote}
        </p>

        {expectedRole === 'household' && (
          <div className="mt-6 space-y-4">
            <GoogleSignInButton onClick={handleGoogleSignIn} loading={googleLoading} />
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200" />
              <span className="shrink mx-3 text-xs text-slate-400">or sign in with email</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`${expectedRole === 'household' ? 'mt-3' : 'mt-6'} space-y-4`}>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Registered Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={meta.placeholderEmail}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your account password"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors"
          >
            {submitting ? 'Verifying credentials...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <button
            type="button"
            onClick={() => navigate(`/register?role=${expectedRole}`)}
            className="font-semibold text-emerald-700 hover:underline"
          >
            {meta.registerLabel}
          </button>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="font-medium text-slate-600 hover:text-slate-900 hover:underline"
          >
            Switch Portal
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminGatePage() {
  const { adminLogin, adminClaim, navigate } = useApp();
  const [statusLoading, setStatusLoading] = useState(true);
  const [status, setStatus] = useState<{ configuredByEnv: boolean; claimed: boolean } | null>(null);
  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<{ configuredByEnv: boolean; claimed: boolean }>('/api/admin-auth/status')
      .then((res) => {
        if (active) setStatus(res);
      })
      .catch(() => {
        if (active) setStatus({ configuredByEnv: false, claimed: true });
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const needsSetup = status !== null && !status.configuredByEnv && !status.claimed;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsSetup) {
      if (passcode.length < 8) {
        setError('Administrator passcode must be at least 8 characters long.');
        return;
      }
      if (passcode !== confirmPasscode) {
        setError('Passcodes do not match.');
        return;
      }
    }
    setSubmitting(true);
    try {
      if (needsSetup) {
        await adminClaim(email, passcode);
      } else {
        await adminLogin(email, passcode);
      }
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex items-center gap-2.5 text-slate-900">
          {needsSetup ? (
            <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
          ) : (
            <Lock className="w-5 h-5 text-slate-800 shrink-0" />
          )}
          <h1 className="text-xl font-bold">
            {needsSetup ? 'Initialize Admin Portal' : 'Restricted Admin Portal'}
          </h1>
        </div>

        <p className="text-sm text-slate-600 mt-1.5">
          {needsSetup
            ? 'Set the administrator email and private passcode (8+ characters) to lock and activate the Admin Portal.'
            : 'Authorized administrators only. Household, collector, and recycler accounts are blocked from this portal.'}
        </p>

        {statusLoading ? (
          <div className="py-10 text-center text-sm text-slate-500">Checking admin portal status...</div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Administrator Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@scrapease.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                {needsSetup ? 'Create Admin Passcode (min 8 chars)' : 'Administrator Passcode'}
              </label>
              <input
                type="password"
                required
                minLength={needsSetup ? 8 : 1}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={needsSetup ? 'Enter a strong private passcode' : 'Enter administrator passcode'}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>

            {needsSetup && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Confirm Admin Passcode</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  placeholder="Re-enter administrator passcode"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
                />
              </div>
            )}

            {error && (
              <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors"
            >
              {submitting
                ? needsSetup
                  ? 'Locking & Activating...'
                  : 'Verifying...'
                : needsSetup
                  ? 'Set Passcode & Open Admin Portal'
                  : 'Sign In to Admin Portal'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Not an administrator?</span>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="font-semibold text-emerald-700 hover:underline"
          >
            Go to User Sign In
          </button>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { register, loginWithGoogleHousehold, bootstrap, navigate } = useApp();
  const initialRoleParam = new URLSearchParams(window.location.search).get('role');
  const [role, setRole] = useState<Exclude<UserRole, 'admin'>>(
    initialRoleParam === 'collector' || initialRoleParam === 'recycler' ? initialRoleParam : 'household'
  );

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Household fields
  const [line1, setLine1] = useState('');
  const [area, setArea] = useState('Indiranagar');
  const [pincode, setPincode] = useState('560038');

  // Collector fields
  const [kycDocType, setKycDocType] = useState('Aadhaar');
  const [kycDocNumber, setKycDocNumber] = useState('');
  const [kycDocImage, setKycDocImage] = useState<string | null>(null);
  const [vehicleType, setVehicleType] = useState('Electric Cargo Trike');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [servicePincodes, setServicePincodes] = useState('560038, 560034');

  // Recycler fields
  const [businessName, setBusinessName] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [acceptedCats, setAcceptedCats] = useState<number[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const serviceAreas = bootstrap?.settings.service_areas || [];
  const categories = bootstrap?.categories || [];

  const handleGoogleHouseholdRegister = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const authedUser = await loginWithGoogleHousehold();
      navigate(getHomeRouteForRole(authedUser.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setKycDocImage(dataUrl);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid file.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        role,
        name,
        email,
        phone,
        password,
      };
      if (role === 'household') {
        payload.line1 = line1;
        payload.area = area;
        payload.pincode = pincode;
      } else if (role === 'collector') {
        payload.kyc_doc_type = kycDocType;
        payload.kyc_doc_number = kycDocNumber;
        payload.kyc_doc_image = kycDocImage;
        payload.vehicle_type = vehicleType;
        payload.vehicle_number = vehicleNumber;
        payload.service_pincodes = servicePincodes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (role === 'recycler') {
        payload.business_name = businessName;
        payload.gst_number = gstNumber;
        payload.city = city;
        payload.kyc_doc_image = kycDocImage;
        payload.accepted_categories = acceptedCats;
      }

      const user = await register(payload);
      navigate(getHomeRouteForRole(user.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Create Your ScrapEase Account</h1>
        <p className="text-sm text-slate-600 mt-1">Select your role to get started in Bengaluru.</p>

        {/* Role Selector */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg mt-6">
          {[
            { id: 'household', label: 'Household' },
            { id: 'collector', label: 'Collector' },
            { id: 'recycler', label: 'Recycler' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRole(tab.id as Exclude<UserRole, 'admin'>)}
              className={`py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                role === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {role === 'household' && (
          <div className="mt-6 space-y-4">
            <GoogleSignInButton
              onClick={handleGoogleHouseholdRegister}
              loading={googleLoading}
              label="Continue with Google (Household)"
            />
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200" />
              <span className="shrink mx-3 text-xs text-slate-400">or register manually</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`${role === 'household' ? 'mt-3' : 'mt-6'} space-y-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">10-Digit Mobile (India)</label>
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9845012345"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password (min 6 chars)</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
            </div>
          </div>

          {role === 'household' && (
            <div className="pt-3 border-t border-slate-200 space-y-4">
              <div className="text-xs font-semibold text-slate-700">Default Pickup Address (Optional)</div>
              <input
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="House / Flat No., Street Name"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Area</label>
                  <select
                    value={pincode}
                    onChange={(e) => {
                      const found = serviceAreas.find((a) => a.pincode === e.target.value);
                      setPincode(e.target.value);
                      if (found) setArea(found.area);
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {serviceAreas.map((sa) => (
                      <option key={sa.pincode} value={sa.pincode}>
                        {sa.area} ({sa.pincode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pincode</label>
                  <input
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {role === 'collector' && (
            <div className="pt-3 border-t border-slate-200 space-y-4">
              <div className="text-xs font-semibold text-slate-700">Collector KYC & Vehicle Details</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">KYC Document Type</label>
                  <select
                    value={kycDocType}
                    onChange={(e) => setKycDocType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Aadhaar">Aadhaar Card</option>
                    <option value="Driving Licence">Driving Licence</option>
                    <option value="Voter ID">Voter ID</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Document Number</label>
                  <input
                    required
                    value={kycDocNumber}
                    onChange={(e) => setKycDocNumber(e.target.value)}
                    placeholder="Last 4 digits or DL No."
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Vehicle Type</label>
                  <input
                    required
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Vehicle Plate</label>
                  <input
                    required
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder="KA-03-EV-1234"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Service Pincodes (comma-separated)</label>
                <input
                  required
                  value={servicePincodes}
                  onChange={(e) => setServicePincodes(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Upload ID Document Image (PNG/JPG)</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-xs text-slate-600">
                  <Upload className="w-4 h-4 text-emerald-700" />
                  <span>{kycDocImage ? 'Document uploaded ready for admin verification' : 'Choose image file (max 2MB)'}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {role === 'recycler' && (
            <div className="pt-3 border-t border-slate-200 space-y-4">
              <div className="text-xs font-semibold text-slate-700">Recycler Business & Material Profile</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Registered Business Name</label>
                  <input
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">GSTIN</label>
                  <input
                    required
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    placeholder="29AABCG1234K1Z5"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Operating City</label>
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">Accepted Scrap Categories</label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((cat) => {
                    const checked = acceptedCats.includes(cat.id);
                    return (
                      <label key={cat.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setAcceptedCats((prev) =>
                              checked ? prev.filter((id) => id !== cat.id) : [...prev, cat.id]
                            )
                          }
                          className="accent-emerald-700"
                        />
                        <span>{cat.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Upload GST / Registration Certificate</label>
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-xs text-slate-600">
                  <Upload className="w-4 h-4 text-emerald-700" />
                  <span>{kycDocImage ? 'Certificate attached' : 'Choose image file (max 2MB)'}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg transition-colors"
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already registered?{' '}
          <button type="button" onClick={() => navigate(`/login/${role}`)} className="font-semibold text-emerald-700 hover:underline">
            Sign in to {role === 'household' ? 'Household' : role === 'collector' ? 'Collector' : 'Recycler'} Portal
          </button>
        </p>
      </div>
    </div>
  );
}
