import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Sliders,
} from 'lucide-react';
import { useApp } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { DashboardShell, type NavSectionItem } from '../components/Layout.tsx';
import { EmptyState, ModalDialog, SkeletonRows, StatusText } from '../components/SharedUI.tsx';
import { formatISTDateTime } from '../shared/scheduling.ts';
import type { RecyclerLot, RecyclerOrder } from '../shared/types.ts';

const NAV_ITEMS: NavSectionItem[] = [
  { label: 'Overview', to: '/recycler', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Marketplace Lots', to: '/recycler/marketplace', icon: <Boxes className="w-4 h-4" /> },
  { label: 'My Orders', to: '/recycler/orders', icon: <ClipboardList className="w-4 h-4" /> },
  { label: 'Accepted & Rates', to: '/recycler/rates', icon: <Sliders className="w-4 h-4" /> },
  { label: 'Facility Profile', to: '/recycler/profile', icon: <Building2 className="w-4 h-4" /> },
];

export function RecyclerDashboard() {
  const { path, user, bootstrap, refreshUser, navigate } = useApp();
  const [lots, setLots] = useState<RecyclerLot[]>([]);
  const [orders, setOrders] = useState<RecyclerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderModalLot, setOrderModalLot] = useState<RecyclerLot | null>(null);
  const [orderWeight, setOrderWeight] = useState(0);
  const [orderRate, setOrderRate] = useState(0);
  const [orderNotes, setOrderNotes] = useState('');
  const [orderErr, setOrderErr] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [l, o] = await Promise.all([
        apiFetch<{ lots: RecyclerLot[] }>('/api/recycler/lots'),
        apiFetch<{ orders: RecyclerOrder[] }>('/api/recycler/orders'),
      ]);
      setLots(l.lots);
      setOrders(o.orders);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const rp = user?.recycler_profile;

  const openOrderModal = (lot: RecyclerLot) => {
    setOrderModalLot(lot);
    setOrderWeight(lot.available_kg);
    const customRate = rp?.buying_rates?.[String(lot.category_id)] || lot.base_rate_per_kg + 2;
    setOrderRate(customRate);
    setOrderNotes('');
    setOrderErr(null);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderModalLot) return;
    setOrderErr(null);
    try {
      await apiFetch('/api/recycler/orders', {
        method: 'POST',
        body: JSON.stringify({
          category_id: orderModalLot.category_id,
          area: orderModalLot.area,
          weight_kg: orderWeight,
          offered_rate_per_kg: orderRate,
          pickup_notes: orderNotes,
        }),
      });
      setOrderModalLot(null);
      await loadData();
      navigate('/recycler/orders');
    } catch (err) {
      setOrderErr(err instanceof Error ? err.message : 'Unable to place purchase request.');
    }
  };

  const pageTitle = (() => {
    if (path === '/recycler/marketplace') return 'Aggregated Material Lots';
    if (path === '/recycler/orders') return 'Bulk Purchase Orders';
    if (path === '/recycler/rates') return 'Accepted Materials & Buying Rates';
    if (path === '/recycler/profile') return 'Recycler Facility Profile';
    return 'Recycler Overview';
  })();

  const totalOrderedKg = orders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((s, o) => s + Number(o.weight_kg), 0);

  return (
    <DashboardShell title={pageTitle} roleLabel="Recycler" navItems={NAV_ITEMS}>
      {rp && rp.kyc_status !== 'approved' && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Business KYC Status: {rp.kyc_status.toUpperCase()}</div>
            <p className="text-xs mt-0.5">Admin approval is required before placing bulk purchase requests.</p>
          </div>
        </div>
      )}

      {path === '/recycler/marketplace' ? (
        <MarketplaceLotsView lots={lots} loading={loading} onOrder={openOrderModal} />
      ) : path === '/recycler/orders' ? (
        <RecyclerOrdersView orders={orders} loading={loading} />
      ) : path === '/recycler/rates' ? (
        <RecyclerRatesView categories={bootstrap?.categories || []} onSaved={refreshUser} />
      ) : path === '/recycler/profile' ? (
        <RecyclerProfileView onSaved={refreshUser} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Available City Lots</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{lots.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Available Tonnage</div>
              <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
                {lots.reduce((s, l) => s + l.available_kg, 0).toFixed(1)} kg
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Orders Placed</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{orders.length}</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Total Sourced</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{totalOrderedKg.toFixed(1)} kg</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{rp?.business_name}</h2>
              <p className="text-sm text-slate-600 mt-1">
                GSTIN: <span className="font-mono">{rp?.gst_number || 'Pending'}</span> · City: {rp?.city}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/recycler/marketplace')}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
            >
              Browse Available Lots
            </button>
          </div>
        </div>
      )}

      <ModalDialog
        open={Boolean(orderModalLot)}
        onClose={() => setOrderModalLot(null)}
        title={`Request Bulk Lot — ${orderModalLot?.category_name}`}
      >
        <form onSubmit={handleSubmitOrder} className="space-y-4">
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
            Area: <strong>{orderModalLot?.area}, Bengaluru</strong> · Available:{' '}
            <strong className="font-mono">{orderModalLot?.available_kg} kg</strong>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Requested Weight (kg)</label>
              <input
                type="number"
                min={1}
                max={orderModalLot?.available_kg || 10000}
                step={0.5}
                required
                value={orderWeight}
                onChange={(e) => setOrderWeight(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Offered Rate (₹/kg)</label>
              <input
                type="number"
                min={1}
                step={0.5}
                required
                value={orderRate}
                onChange={(e) => setOrderRate(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Logistics / Dock Notes</label>
            <textarea
              rows={2}
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="E.g. Will send 10ft closed truck at 3 PM"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <span className="text-sm font-mono font-bold text-emerald-700">
              Total: ₹{(orderWeight * orderRate).toLocaleString('en-IN')}
            </span>
            <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg">
              Submit Purchase Request
            </button>
          </div>
          {orderErr && <p className="text-xs text-red-700">{orderErr}</p>}
        </form>
      </ModalDialog>
    </DashboardShell>
  );
}

function MarketplaceLotsView({
  lots,
  loading,
  onOrder,
}: {
  lots: RecyclerLot[];
  loading: boolean;
  onOrder: (lot: RecyclerLot) => void;
}) {
  const [catFilter, setCatFilter] = useState('All');
  if (loading) return <SkeletonRows rows={4} />;
  const catNames = ['All', ...Array.from(new Set(lots.map((l) => l.category_name)))];
  const filtered = catFilter === 'All' ? lots : lots.filter((l) => l.category_name === catFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        {catNames.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setCatFilter(name)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
              catFilter === name ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No bulk lots available" description="Completed collector pickups aggregate here automatically." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lot) => (
            <div key={`${lot.category_id}-${lot.area}`} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 mb-2">
                  <span>{lot.city} · {lot.area}</span>
                  <span>{lot.pickup_count} pickups</span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{lot.category_name}</h3>
                <div className="mt-3 flex items-baseline gap-4 font-mono">
                  <span className="text-2xl font-bold text-emerald-700">{lot.available_kg} kg</span>
                  <span className="text-xs text-slate-500">Base ₹{lot.base_rate_per_kg}/kg</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOrder(lot)}
                className="mt-5 w-full py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                Place Purchase Request
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecyclerOrdersView({ orders, loading }: { orders: RecyclerOrder[]; loading: boolean }) {
  if (loading) return <SkeletonRows rows={3} />;
  if (orders.length === 0) {
    return <EmptyState title="No bulk orders yet" description="Browse the Marketplace Lots tab to request material batches." />;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
          <tr>
            <th className="py-3 px-4">Order Code</th>
            <th className="py-3 px-4">Category & Zone</th>
            <th className="py-3 px-4 text-right">Weight</th>
            <th className="py-3 px-4 text-right">Rate</th>
            <th className="py-3 px-4 text-right">Total</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="py-3 px-4 font-mono font-semibold text-slate-900">{o.code}</td>
              <td className="py-3 px-4">
                <div className="font-medium text-slate-900">{o.category_name}</div>
                <div className="text-xs text-slate-500">{o.city} · {o.area}</div>
              </td>
              <td className="py-3 px-4 text-right font-mono">{o.weight_kg} kg</td>
              <td className="py-3 px-4 text-right font-mono">₹{o.offered_rate_per_kg}/kg</td>
              <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">
                ₹{o.total_amount.toLocaleString('en-IN')}
              </td>
              <td className="py-3 px-4"><StatusText status={o.status} /></td>
              <td className="py-3 px-4 font-mono text-xs text-slate-500">{formatISTDateTime(o.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecyclerRatesView({
  categories,
  onSaved,
}: {
  categories: Array<{ id: number; name: string; rate_per_kg: number }>;
  onSaved: () => Promise<void>;
}) {
  const { user } = useApp();
  const rp = user?.recycler_profile;
  const [accepted, setAccepted] = useState<number[]>(rp?.accepted_categories || []);
  const [rates, setRates] = useState<Record<string, number>>(rp?.buying_rates || {});
  const [msg, setMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/recycler/profile', {
      method: 'PATCH',
      body: JSON.stringify({ accepted_categories: accepted, buying_rates: rates }),
    });
    await onSaved();
    setMsg('Accepted categories and buying rates saved.');
  };

  return (
    <form onSubmit={handleSave} className="max-w-3xl bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {categories.map((cat) => {
          const isChecked = accepted.includes(cat.id);
          return (
            <div key={cat.id} className="border border-slate-200 rounded-lg p-4 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 text-sm font-medium text-slate-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() =>
                    setAccepted((prev) => (isChecked ? prev.filter((x) => x !== cat.id) : [...prev, cat.id]))
                  }
                  className="accent-emerald-700"
                />
                <span>{cat.name}</span>
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono text-slate-500">₹</span>
                <input
                  type="number"
                  step={0.5}
                  value={rates[String(cat.id)] ?? cat.rate_per_kg + 2}
                  onChange={(e) => setRates((prev) => ({ ...prev, [String(cat.id)]: Number(e.target.value) }))}
                  className="w-20 px-2 py-1 text-sm font-mono border border-slate-300 rounded-md text-right"
                />
              </div>
            </div>
          );
        })}
      </div>
      {msg && <p className="text-xs font-medium text-emerald-700">{msg}</p>}
      <button type="submit" className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg">
        Save Buying Rates
      </button>
    </form>
  );
}

function RecyclerProfileView({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user } = useApp();
  const rp = user?.recycler_profile;
  const [businessName, setBusinessName] = useState(rp?.business_name || '');
  const [gstNumber, setGstNumber] = useState(rp?.gst_number || '');
  const [city, setCity] = useState(rp?.city || 'Bengaluru');
  const [msg, setMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/recycler/profile', {
      method: 'PATCH',
      body: JSON.stringify({ business_name: businessName, gst_number: gstNumber, city }),
    });
    await onSaved();
    setMsg('Facility profile updated.');
  };

  return (
    <form onSubmit={handleSave} className="max-w-lg bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <span className="text-sm font-semibold text-slate-900">Business Verification</span>
        <StatusText status={rp?.kyc_status || 'pending'} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Business Name</label>
        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">GSTIN</label>
        <input value={gstNumber} onChange={(e) => setGstNumber(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">City</label>
        <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
      </div>
      {msg && <p className="text-xs text-emerald-700 font-medium">{msg}</p>}
      <button type="submit" className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg">
        Save Profile
      </button>
    </form>
  );
}
