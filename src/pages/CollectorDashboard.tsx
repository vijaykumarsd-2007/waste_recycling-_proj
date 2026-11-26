import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  IndianRupee,
  LayoutDashboard,
  Power,
  Scale,
  ShieldCheck,
  Truck,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AuthContext.tsx';
import { apiFetch, readImageFileAsDataUrl } from '../lib/api.ts';
import { downloadPickupReceiptPdf } from '../lib/pdf.ts';
import { DashboardShell, type NavSectionItem } from '../components/Layout.tsx';
import { EmptyState, ModalDialog, SkeletonRows, StatusText } from '../components/SharedUI.tsx';
import { formatISTDate } from '../shared/scheduling.ts';
import type { PaymentMethod, Pickup } from '../shared/types.ts';

const NAV_ITEMS: NavSectionItem[] = [
  { label: 'Overview', to: '/collector', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Incoming Requests', to: '/collector/requests', icon: <Truck className="w-4 h-4" /> },
  { label: 'My Schedule', to: '/collector/schedule', icon: <Calendar className="w-4 h-4" /> },
  { label: 'Active Pickup', to: '/collector/active', icon: <Scale className="w-4 h-4" /> },
  { label: 'Earnings', to: '/collector/earnings', icon: <IndianRupee className="w-4 h-4" /> },
  { label: 'Availability', to: '/collector/availability', icon: <Clock className="w-4 h-4" /> },
  { label: 'Profile & KYC', to: '/collector/profile', icon: <ShieldCheck className="w-4 h-4" /> },
];

export function CollectorDashboard() {
  const { path, user, refreshUser, navigate } = useApp();
  const [assignedPickups, setAssignedPickups] = useState<Pickup[]>([]);
  const [nearbyPickups, setNearbyPickups] = useState<Pickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, n] = await Promise.all([
        apiFetch<{ pickups: Pickup[] }>('/api/pickups'),
        apiFetch<{ pickups: Pickup[] }>('/api/pickups?scope=nearby'),
      ]);
      setAssignedPickups(a.pickups);
      setNearbyPickups(n.pickups);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cp = user?.collector_profile;

  const handleToggleOnline = async () => {
    if (!cp) return;
    setToggleError(null);
    try {
      await apiFetch('/api/collector/availability', {
        method: 'PATCH',
        body: JSON.stringify({ is_online: !cp.is_online }),
      });
      await refreshUser();
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : 'Unable to change status.');
    }
  };

  const pageTitle = (() => {
    if (path === '/collector/requests') return 'Incoming & Nearby Requests';
    if (path === '/collector/schedule') return 'My Pickup Schedule';
    if (path === '/collector/active') return 'Active Pickup Execution';
    if (path === '/collector/earnings') return 'Earnings & Payouts';
    if (path === '/collector/availability') return 'Availability & Service Areas';
    if (path === '/collector/profile') return 'Collector Profile & KYC';
    return 'Collector Overview';
  })();

  const activeJobs = assignedPickups.filter((p) => ['Assigned', 'En Route', 'Picked Up', 'Rescheduled'].includes(p.status));
  const completedJobs = assignedPickups.filter((p) => p.status === 'Completed');

  return (
    <DashboardShell title={pageTitle} roleLabel="Collector" navItems={NAV_ITEMS}>
      {cp && cp.kyc_status !== 'approved' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">KYC Verification: {cp.kyc_status.toUpperCase()}</div>
            <p className="text-xs mt-0.5">
              An administrator must approve your KYC documents before you can go Online or accept pickups.
            </p>
          </div>
        </div>
      )}

      {toggleError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{toggleError}</div>
      )}

      {path === '/collector/requests' ? (
        <CollectorRequestsView
          assigned={activeJobs}
          nearby={nearbyPickups}
          loading={loading}
          onRefresh={loadData}
        />
      ) : path === '/collector/schedule' ? (
        <CollectorScheduleView pickups={activeJobs} loading={loading} />
      ) : path === '/collector/active' ? (
        <CollectorActiveView pickups={activeJobs} loading={loading} onRefresh={async () => { await loadData(); await refreshUser(); }} />
      ) : path === '/collector/earnings' ? (
        <CollectorEarningsView completed={completedJobs} totalEarnings={cp?.total_earnings ?? 0} />
      ) : path === '/collector/availability' ? (
        <CollectorAvailabilityView onSaved={refreshUser} />
      ) : path === '/collector/profile' ? (
        <CollectorProfileView onSaved={refreshUser} />
      ) : (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono text-slate-500">Dispatch Status</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {cp?.is_online ? 'Online — Receiving Auto-Assigned Pickups' : 'Offline — Paused from Auto-Dispatch'}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Vehicle: {cp?.vehicle_type} ({cp?.vehicle_number || 'Pending'}) · Pincodes: {(cp?.service_pincodes || []).join(', ')}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleOnline}
              className={`px-5 py-2.5 text-sm font-semibold rounded-lg inline-flex items-center gap-2 shrink-0 ${
                cp?.is_online
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-emerald-700 text-white hover:bg-emerald-800'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{cp?.is_online ? 'Go Offline' : 'Go Online'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Active Assigned Jobs</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{activeJobs.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Nearby Open Requests</div>
              <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{nearbyPickups.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Completed Pickups</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{cp?.total_pickups ?? completedJobs.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Rating & Earnings</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
                ★ {cp?.rating_avg?.toFixed(1) ?? '5.0'} · ₹{(cp?.total_earnings ?? 0).toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/collector/active')}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              Open Active Pickup Console
            </button>
            <button
              type="button"
              onClick={() => navigate('/collector/requests')}
              className="px-4 py-2 text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 rounded-lg"
            >
              View Incoming & Nearby ({activeJobs.length + nearbyPickups.length})
            </button>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function CollectorRequestsView({
  assigned,
  nearby,
  loading,
  onRefresh,
}: {
  assigned: Pickup[];
  nearby: Pickup[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [declineTarget, setDeclineTarget] = useState<Pickup | null>(null);
  const [reason, setReason] = useState('Vehicle capacity full');
  const [error, setError] = useState<string | null>(null);

  if (loading) return <SkeletonRows rows={4} />;

  const handleAccept = async (id: number) => {
    setError(null);
    try {
      await apiFetch(`/api/collector/pickups/${id}/accept`, { method: 'POST' });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept pickup.');
    }
  };

  const handleDecline = async () => {
    if (!declineTarget) return;
    setError(null);
    try {
      await apiFetch(`/api/collector/pickups/${declineTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setDeclineTarget(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to decline pickup.');
    }
  };

  return (
    <div className="space-y-8">
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Assigned to You ({assigned.length})</h2>
        {assigned.length === 0 ? (
          <EmptyState title="No assigned pickups right now" description="Keep your status Online to receive auto-assigned slots." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assigned.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">{p.code}</span>
                  <StatusText status={p.status} />
                </div>
                <div className="text-sm text-slate-700">
                  <div className="font-semibold">{p.household_name} · {p.household_phone}</div>
                  <div>{p.address_snapshot.line1}, {p.area} ({p.pincode})</div>
                  <div className="font-mono text-xs text-emerald-700 mt-1">
                    {formatISTDate(p.pickup_date)} · {p.slot_label}
                  </div>
                </div>
                <div className="text-xs text-slate-600">
                  Items: {p.items.map((i) => `${i.category_name} (${i.est_weight} kg)`).join(', ')}
                </div>
                <div className="flex items-center gap-2 pt-2">
                  {p.status === 'Assigned' && (
                    <button
                      type="button"
                      onClick={() => setDeclineTarget(p)}
                      className="px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      Decline & Reassign
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Nearby Open Requests in Your Pincodes ({nearby.length})</h2>
        {nearby.length === 0 ? (
          <div className="p-6 bg-white border border-slate-200 rounded-xl text-sm text-slate-500">
            No unassigned requests in your configured pincodes.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {nearby.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">{p.code}</span>
                  <span className="text-xs font-mono text-emerald-700 font-semibold">~{p.est_total_weight} kg · ₹{p.est_total_amount}</span>
                </div>
                <div className="text-sm text-slate-700">
                  <div>{p.area} ({p.pincode})</div>
                  <div className="font-mono text-xs text-slate-500 mt-0.5">
                    {formatISTDate(p.pickup_date)} · {p.slot_label}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAccept(p.id)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                >
                  Accept Pickup
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalDialog open={Boolean(declineTarget)} onClose={() => setDeclineTarget(null)} title="Decline Assigned Pickup">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Declining {declineTarget?.code} will automatically reassign it to the next available collector or escalate to admin dispatch.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for declining"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDeclineTarget(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
              Cancel
            </button>
            <button type="button" onClick={handleDecline} className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg">
              Confirm Decline
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}

function CollectorScheduleView({ pickups, loading }: { pickups: Pickup[]; loading: boolean }) {
  if (loading) return <SkeletonRows rows={4} />;
  if (pickups.length === 0) {
    return <EmptyState title="Your schedule is clear" description="Accepted and auto-assigned slots will appear chronologically here." />;
  }
  const sorted = [...pickups].sort((a, b) => a.pickup_date.localeCompare(b.pickup_date));
  return (
    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
      {sorted.map((p) => (
        <div key={p.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="font-mono">{p.code}</span>
              <span className="text-slate-300">·</span>
              <span>{formatISTDate(p.pickup_date)}</span>
              <span className="text-slate-300">·</span>
              <span className="font-mono text-emerald-700">{p.slot_label}</span>
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {p.household_name} ({p.household_phone}) · {p.address_snapshot.line1}, {p.area} ({p.pincode})
            </div>
          </div>
          <StatusText status={p.status} />
        </div>
      ))}
    </div>
  );
}

function CollectorActiveView({
  pickups,
  loading,
  onRefresh,
}: {
  pickups: Pickup[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { bootstrap } = useApp();
  const categories = bootstrap?.categories || [];
  const [selectedId, setSelectedId] = useState<number | null>(pickups[0]?.id ?? null);
  const [actualWeights, setActualWeights] = useState<Record<number, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pickups.length > 0 && !pickups.find((p) => p.id === selectedId)) {
      setSelectedId(pickups[0].id);
    }
  }, [pickups, selectedId]);

  const active = pickups.find((p) => p.id === selectedId) || pickups[0];

  useEffect(() => {
    if (!active) return;
    const init: Record<number, number> = {};
    for (const item of active.items) {
      init[item.category_id] = item.actual_weight ?? item.est_weight;
    }
    setActualWeights(init);
  }, [active]);

  if (loading) return <SkeletonRows rows={4} />;
  if (!active) {
    return <EmptyState title="No active pickups" description="Accept an incoming request or wait for an auto-assigned pickup." />;
  }

  const updateStatus = async (status: 'En Route' | 'Picked Up') => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/collector/pickups/${active.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const items = Object.entries(actualWeights)
        .map(([catId, w]) => ({ category_id: Number(catId), actual_weight: Number(w) }))
        .filter((i) => i.actual_weight > 0);
      const res = await apiFetch<{ pickup: Pickup }>(`/api/collector/pickups/${active.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ items, payment_method: paymentMethod }),
      });
      downloadPickupReceiptPdf(res.pickup);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete pickup.');
    } finally {
      setBusy(false);
    }
  };

  const liveSubtotal = categories.reduce((sum, cat) => {
    const w = Number(actualWeights[cat.id] || 0);
    const existingRate = active.items.find((i) => i.category_id === cat.id)?.rate_per_kg ?? cat.rate_per_kg;
    return sum + w * existingRate;
  }, 0);

  return (
    <div className="space-y-6">
      {pickups.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {pickups.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg border ${
                p.id === active.id ? 'border-emerald-700 bg-emerald-50 text-emerald-800 font-semibold' : 'border-slate-200 bg-white'
              }`}
            >
              {p.code} ({p.area})
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-slate-900">{active.code}</span>
              <span className="text-slate-300">·</span>
              <StatusText status={active.status} />
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {active.household_name} ({active.household_phone}) · {active.address_snapshot.line1}, {active.area} ({active.pincode})
            </p>
            {active.notes && <p className="text-xs text-slate-500 mt-1">Notes: {active.notes}</p>}
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              disabled={busy || active.status === 'En Route' || active.status === 'Picked Up'}
              onClick={() => updateStatus('En Route')}
              className="px-4 py-2 text-xs font-semibold border border-sky-700 text-sky-800 bg-sky-50 hover:bg-sky-100 disabled:opacity-40 rounded-lg"
            >
              Mark En Route
            </button>
            <button
              type="button"
              disabled={busy || active.status === 'Picked Up'}
              onClick={() => updateStatus('Picked Up')}
              className="px-4 py-2 text-xs font-semibold border border-slate-800 text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg"
            >
              Mark Picked Up
            </button>
          </div>
        </div>

        <form onSubmit={handleComplete} className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Enter Digital Scale Weights (kg) & Finalize Payout</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {categories.map((cat) => {
              const rate = active.items.find((i) => i.category_id === cat.id)?.rate_per_kg ?? cat.rate_per_kg;
              const est = active.items.find((i) => i.category_id === cat.id)?.est_weight;
              return (
                <div key={cat.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-slate-900 truncate">{cat.name}</div>
                  <div className="text-[11px] font-mono text-slate-500 mb-2">
                    ₹{rate}/kg {est ? `· Est ${est} kg` : ''}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={0.1}
                    value={actualWeights[cat.id] ?? ''}
                    placeholder="0.0"
                    onChange={(e) =>
                      setActualWeights((prev) => ({ ...prev, [cat.id]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    className="w-full px-2.5 py-1.5 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-4">
              <div>
                <div className="text-xs text-slate-500">Payment Method</div>
                <div className="flex gap-2 mt-1">
                  {(['UPI', 'Cash'] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                        paymentMethod === m ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pl-4 border-l border-slate-200">
                <div className="text-xs text-slate-500">Final Payout</div>
                <div className="text-xl font-bold font-mono text-emerald-700">
                  ₹{Math.round(liveSubtotal).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{busy ? 'Completing...' : 'Complete Pickup & Issue Receipt'}</span>
            </button>
          </div>
          {error && <div className="text-xs text-red-700">{error}</div>}
        </form>
      </div>
    </div>
  );
}

function CollectorEarningsView({ completed, totalEarnings }: { completed: Pickup[]; totalEarnings: number }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Lifetime Partner Earnings</div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">₹{totalEarnings.toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Completed Pickups</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{completed.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total Material Collected</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {completed.reduce((s, p) => s + Number(p.actual_total_weight || 0), 0).toFixed(1)} kg
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
            <tr>
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Area</th>
              <th className="py-3 px-4">Mode</th>
              <th className="py-3 px-4 text-right">Weight</th>
              <th className="py-3 px-4 text-right">Household Payout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {completed.map((p) => (
              <tr key={p.id}>
                <td className="py-3 px-4 font-mono font-semibold text-slate-900">{p.code}</td>
                <td className="py-3 px-4 text-slate-600">{formatISTDate(p.pickup_date)}</td>
                <td className="py-3 px-4 text-slate-600">{p.area}</td>
                <td className="py-3 px-4 font-mono text-xs">{p.payment_method}</td>
                <td className="py-3 px-4 text-right font-mono">{p.actual_total_weight?.toFixed(1)} kg</td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">
                  ₹{p.actual_total_amount?.toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CollectorAvailabilityView({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user } = useApp();
  const cp = user?.collector_profile;
  const [isOnline, setIsOnline] = useState(Boolean(cp?.is_online));
  const [workingDays, setWorkingDays] = useState<number[]>(cp?.working_days || [1, 2, 3, 4, 5, 6]);
  const [start, setStart] = useState(cp?.working_start || '08:00');
  const [end, setEnd] = useState(cp?.working_end || '20:00');
  const [pincodesText, setPincodesText] = useState((cp?.service_pincodes || []).join(', '));
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const dayNames = [
    { d: 1, label: 'Mon' },
    { d: 2, label: 'Tue' },
    { d: 3, label: 'Wed' },
    { d: 4, label: 'Thu' },
    { d: 5, label: 'Fri' },
    { d: 6, label: 'Sat' },
  ];

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      await apiFetch('/api/collector/availability', {
        method: 'PATCH',
        body: JSON.stringify({
          is_online: isOnline,
          working_days: workingDays,
          working_start: start,
          working_end: end,
          service_pincodes: pincodesText.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      await onSaved();
      setMsg('Availability settings saved.');
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Save failed.');
    }
  };

  return (
    <form onSubmit={handleSave} className="max-w-xl bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <div className="text-sm font-semibold text-slate-900">Auto-Assignment Status</div>
          <div className="text-xs text-slate-500">Only Online collectors receive automatic pincode dispatches.</div>
        </div>
        <button
          type="button"
          onClick={() => setIsOnline(!isOnline)}
          className={`px-4 py-2 text-xs font-semibold rounded-lg ${
            isOnline ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-800'
          }`}
        >
          {isOnline ? 'Online' : 'Offline'}
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-2">Working Days (IST)</label>
        <div className="flex flex-wrap gap-2">
          {dayNames.map((day) => {
            const active = workingDays.includes(day.d);
            return (
              <button
                key={day.d}
                type="button"
                onClick={() =>
                  setWorkingDays((prev) => (active ? prev.filter((x) => x !== day.d) : [...prev, day.d]))
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                  active ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'
                }`}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Start Hour</label>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">End Hour</label>
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Service Pincodes (comma-separated)</label>
        <input value={pincodesText} onChange={(e) => setPincodesText(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
      </div>

      {err && <p className="text-xs text-red-700">{err}</p>}
      {msg && <p className="text-xs text-emerald-700 font-medium">{msg}</p>}

      <button type="submit" className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg">
        Save Availability
      </button>
    </form>
  );
}

function CollectorProfileView({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user } = useApp();
  const cp = user?.collector_profile;
  const [vehicleType, setVehicleType] = useState(cp?.vehicle_type || '');
  const [vehicleNumber, setVehicleNumber] = useState(cp?.vehicle_number || '');
  const [kycDocType, setKycDocType] = useState(cp?.kyc_doc_type || 'Aadhaar');
  const [kycDocNumber, setKycDocNumber] = useState(cp?.kyc_doc_number || '');
  const [kycImage, setKycImage] = useState<string | null>(cp?.kyc_doc_image || null);
  const [msg, setMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/collector/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        vehicle_type: vehicleType,
        vehicle_number: vehicleNumber,
        kyc_doc_type: kycDocType,
        kyc_doc_number: kycDocNumber,
        kyc_doc_image: kycImage,
      }),
    });
    await onSaved();
    setMsg('Collector KYC & vehicle details updated.');
  };

  return (
    <form onSubmit={handleSave} className="max-w-xl bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-900">KYC Verification Status</span>
        <StatusText status={cp?.kyc_status || 'pending'} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Vehicle Type</label>
          <input value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Vehicle Plate</label>
          <input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">ID Document Type</label>
          <input value={kycDocType} onChange={(e) => setKycDocType(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">ID Number</label>
          <input value={kycDocNumber} onChange={(e) => setKycDocNumber(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Update ID Image</label>
        <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer text-xs text-slate-600">
          <Upload className="w-4 h-4 text-emerald-700" />
          <span>{kycImage ? 'Document uploaded' : 'Upload PNG/JPG'}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setKycImage(await readImageFileAsDataUrl(f));
            }}
          />
        </label>
      </div>
      {msg && <p className="text-xs text-emerald-700 font-medium">{msg}</p>}
      <button type="submit" className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg">
        Save Profile
      </button>
    </form>
  );
}
