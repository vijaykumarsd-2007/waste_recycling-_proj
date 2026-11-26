import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  Download,
  Home,
  Leaf,
  ListChecks,
  MapPin,
  Plus,
  Star,
  Trash2,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import { useApp } from '../context/AuthContext.tsx';
import { apiFetch, readImageFileAsDataUrl } from '../lib/api.ts';
import { downloadPickupReceiptPdf } from '../lib/pdf.ts';
import { DashboardShell, type NavSectionItem } from '../components/Layout.tsx';
import {
  CategoryIcon,
  EmptyState,
  ModalDialog,
  PickupTimelineTracker,
  SkeletonRows,
  StatusText,
} from '../components/SharedUI.tsx';
import {
  evaluateModifyPenalty,
  formatISTDate,
  formatISTDateTime,
  getBookingDateOptions,
  type SlotAvailability,
} from '../shared/scheduling.ts';
import type { Address, Pickup } from '../shared/types.ts';

const NAV_ITEMS: NavSectionItem[] = [
  { label: 'Overview', to: '/dashboard', icon: <Home className="w-4 h-4" /> },
  { label: 'Book Pickup', to: '/dashboard/book', icon: <Plus className="w-4 h-4" /> },
  { label: 'My Pickups', to: '/dashboard/pickups', icon: <ListChecks className="w-4 h-4" /> },
  { label: 'Addresses', to: '/dashboard/addresses', icon: <MapPin className="w-4 h-4" /> },
  { label: 'Impact', to: '/dashboard/impact', icon: <Leaf className="w-4 h-4" /> },
  { label: 'Profile', to: '/dashboard/profile', icon: <UserIcon className="w-4 h-4" /> },
  { label: 'Notifications', to: '/dashboard/notifications', icon: <Bell className="w-4 h-4" /> },
];

export function HouseholdDashboard() {
  const { path, navigate, user, bootstrap, notifications, markNotificationRead, markAllNotificationsRead, refreshUser } =
    useApp();

  const [pickups, setPickups] = useState<Pickup[]>([]);
  const [loadingPickups, setLoadingPickups] = useState(true);
  const [addresses, setAddresses] = useState<Address[]>([]);

  const loadPickups = useCallback(async () => {
    setLoadingPickups(true);
    try {
      const data = await apiFetch<{ pickups: Pickup[] }>('/api/pickups');
      setPickups(data.pickups);
    } finally {
      setLoadingPickups(false);
    }
  }, []);

  const loadAddresses = useCallback(async () => {
    const data = await apiFetch<{ addresses: Address[] }>('/api/addresses');
    setAddresses(data.addresses);
  }, []);

  useEffect(() => {
    loadPickups();
    loadAddresses();
  }, [loadPickups, loadAddresses]);

  const pickupDetailMatch = path.match(/^\/dashboard\/pickups\/(\d+)$/);

  const pageTitle = (() => {
    if (pickupDetailMatch) return 'Pickup Details & Tracking';
    if (path === '/dashboard/book') return 'Schedule a Scrap Pickup';
    if (path === '/dashboard/pickups') return 'My Pickups';
    if (path === '/dashboard/addresses') return 'Saved Addresses';
    if (path === '/dashboard/impact') return 'Environmental Impact';
    if (path === '/dashboard/profile') return 'Account Profile';
    if (path === '/dashboard/notifications') return 'Notifications';
    return 'Household Overview';
  })();

  return (
    <DashboardShell title={pageTitle} roleLabel="Household" navItems={NAV_ITEMS}>
      {pickupDetailMatch ? (
        <PickupDetailView
          pickupId={Number(pickupDetailMatch[1])}
          onUpdated={loadPickups}
        />
      ) : path === '/dashboard/book' ? (
        <BookPickupWizard
          addresses={addresses}
          onBooked={async (created) => {
            await loadPickups();
            await loadAddresses();
            navigate(`/dashboard/pickups/${created.id}`);
          }}
        />
      ) : path === '/dashboard/pickups' ? (
        <MyPickupsView pickups={pickups} loading={loadingPickups} />
      ) : path === '/dashboard/addresses' ? (
        <AddressesView addresses={addresses} onChanged={loadAddresses} />
      ) : path === '/dashboard/impact' ? (
        <ImpactView />
      ) : path === '/dashboard/profile' ? (
        <ProfileView user={user!} onUpdated={refreshUser} />
      ) : path === '/dashboard/notifications' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">All Notifications</h2>
            <button
              type="button"
              onClick={markAllNotificationsRead}
              className="text-xs font-medium text-emerald-700 hover:underline"
            >
              Mark all as read
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">No notifications yet.</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={async () => {
                    if (!n.is_read) await markNotificationRead(n.id);
                    if (n.link) navigate(n.link);
                  }}
                  className={`px-6 py-4 cursor-pointer hover:bg-slate-50 ${n.is_read ? '' : 'bg-emerald-50/40'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                    <div className="text-xs font-mono text-slate-500">{formatISTDateTime(n.created_at)}</div>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <HouseholdOverview pickups={pickups} loading={loadingPickups} categoriesCount={bootstrap?.categories.length ?? 8} />
      )}
    </DashboardShell>
  );
}

function HouseholdOverview({
  pickups,
  loading,
}: {
  pickups: Pickup[];
  loading: boolean;
  categoriesCount: number;
}) {
  const { navigate } = useApp();

  const stats = useMemo(() => {
    const completed = pickups.filter((p) => p.status === 'Completed');
    const active = pickups.filter((p) => ['Requested', 'Assigned', 'En Route', 'Picked Up', 'Rescheduled'].includes(p.status));
    const totalKg = completed.reduce((s, p) => s + Number(p.actual_total_weight || 0), 0);
    const totalEarnings = completed.reduce((s, p) => s + Number(p.actual_total_amount || 0), 0);
    return {
      completedCount: completed.length,
      activeCount: active.length,
      upcoming: active[0] || null,
      totalKg: Math.round(totalKg * 10) / 10,
      totalEarnings: Math.round(totalEarnings),
    };
  }, [pickups]);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total Earned</div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
            ₹{stats.totalEarnings.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total Scrap Recycled</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{stats.totalKg} kg</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Active Requests</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{stats.activeCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Completed Pickups</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{stats.completedCount}</div>
        </div>
      </div>

      {/* Upcoming Pickup or Quick CTA */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {stats.upcoming ? (
          <div>
            <div className="text-xs font-mono text-emerald-700 font-semibold">Next Scheduled Pickup · {stats.upcoming.code}</div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              {formatISTDate(stats.upcoming.pickup_date)} · {stats.upcoming.slot_label}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {stats.upcoming.area} ({stats.upcoming.pincode}) ·{' '}
              {stats.upcoming.collector_name ? `Collector: ${stats.upcoming.collector_name}` : 'Assigning nearest collector'}
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-bold text-slate-900">Ready to clear out recyclables?</h2>
            <p className="text-sm text-slate-600 mt-1">
              Schedule a 2-hour pickup window in Bengaluru and earn instant UPI or cash payouts.
            </p>
          </div>
        )}
        <div className="flex items-center gap-3 shrink-0">
          {stats.upcoming && (
            <button
              type="button"
              onClick={() => navigate(`/dashboard/pickups/${stats.upcoming!.id}`)}
              className="px-4 py-2 text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg whitespace-nowrap"
            >
              Track Pickup
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/dashboard/book')}
            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
          >
            Book New Pickup
          </button>
        </div>
      </div>

      {/* Recent Pickups */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Recent Pickups</h3>
          <button
            type="button"
            onClick={() => navigate('/dashboard/pickups')}
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            View all
          </button>
        </div>
        {loading ? (
          <SkeletonRows rows={3} />
        ) : pickups.length === 0 ? (
          <EmptyState
            title="No pickups scheduled yet"
            description="Book your first doorstep pickup in under 60 seconds."
            actionLabel="Schedule Pickup"
            onAction={() => navigate('/dashboard/book')}
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {pickups.slice(0, 5).map((p) => (
              <div
                key={p.id}
                onClick={() => navigate(`/dashboard/pickups/${p.id}`)}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="font-mono">{p.code}</span>
                    <span className="text-slate-300">·</span>
                    <span>{p.area}</span>
                    <span className="text-slate-300">·</span>
                    <StatusText status={p.status} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {formatISTDate(p.pickup_date)} · {p.slot_label} · {p.items.length} categories
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-sm font-bold text-slate-900">
                    ₹{(p.actual_total_amount ?? p.est_total_amount).toLocaleString('en-IN')}
                  </div>
                  <div className="text-xs text-slate-500">
                    {(p.actual_total_weight ?? p.est_total_weight).toFixed(1)} kg {p.actual_total_weight ? 'measured' : 'est.'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookPickupWizard({
  addresses,
  onBooked,
}: {
  addresses: Address[];
  onBooked: (pickup: Pickup) => Promise<void>;
}) {
  const { bootstrap } = useApp();
  const categories = bootstrap?.categories || [];
  const settings = bootstrap?.settings;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Items
  const [weights, setWeights] = useState<Record<number, number>>({});

  // Step 2: Address
  const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
  const [useSaved, setUseSaved] = useState<boolean>(Boolean(defaultAddr));
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(defaultAddr?.id ?? null);
  const [newAddress, setNewAddress] = useState({
    label: 'Home',
    line1: '',
    line2: '',
    area: settings?.service_areas[0]?.area || 'Indiranagar',
    city: 'Bengaluru',
    pincode: settings?.service_areas[0]?.pincode || '560038',
  });
  const [saveNewAddress, setSaveNewAddress] = useState(true);
  const [pincodeCheckMsg, setPincodeCheckMsg] = useState<string | null>(null);

  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const def = addresses.find((a) => a.is_default) || addresses[0];
      setSelectedAddressId(def.id);
      setUseSaved(true);
    }
  }, [addresses, selectedAddressId]);

  const activePincode = useMemo(() => {
    if (useSaved && selectedAddressId) {
      return addresses.find((a) => a.id === selectedAddressId)?.pincode || '';
    }
    return newAddress.pincode.trim();
  }, [useSaved, selectedAddressId, addresses, newAddress.pincode]);

  const activeAreaName = useMemo(() => {
    if (useSaved && selectedAddressId) {
      return addresses.find((a) => a.id === selectedAddressId)?.area || '';
    }
    return newAddress.area;
  }, [useSaved, selectedAddressId, addresses, newAddress.area]);

  // Step 3: Date & Slot
  const dateOptions = useMemo(() => {
    if (!settings) return [];
    return getBookingDateOptions(settings);
  }, [settings]);

  const firstOperatingDate = dateOptions.find((d) => d.isOperatingDay && !d.isHoliday)?.dateStr || '';
  const [pickupDate, setPickupDate] = useState<string>(firstOperatingDate);
  const [slotId, setSlotId] = useState<string>('');
  const [slotAvailabilities, setSlotAvailabilities] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!pickupDate && firstOperatingDate) setPickupDate(firstOperatingDate);
  }, [pickupDate, firstOperatingDate]);

  useEffect(() => {
    if (!pickupDate || !activePincode || activePincode.length !== 6) return;
    let cancelled = false;
    setLoadingSlots(true);
    apiFetch<{ isServiceable: boolean; areaName: string | null; slots: SlotAvailability[] }>(
      `/api/public/slots?date=${encodeURIComponent(pickupDate)}&pincode=${encodeURIComponent(activePincode)}`
    )
      .then((res) => {
        if (cancelled) return;
        setSlotAvailabilities(res.slots);
        setPincodeCheckMsg(
          res.isServiceable
            ? `Serviceable zone: ${res.areaName || activeAreaName} (${activePincode})`
            : `Pincode ${activePincode} is not currently in our active Bengaluru service zones.`
        );
        const stillValid = res.slots.find((s) => s.slot.id === slotId && s.available);
        if (!stillValid) {
          const firstAvail = res.slots.find((s) => s.available);
          setSlotId(firstAvail ? firstAvail.slot.id : '');
        }
      })
      .catch(() => {
        if (!cancelled) setSlotAvailabilities([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pickupDate, activePincode, activeAreaName, slotId]);

  // Step 4: Notes, Photos & Confirm
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedItems = useMemo(() => {
    return categories
      .filter((c) => Number(weights[c.id] || 0) > 0)
      .map((c) => {
        const w = Number(weights[c.id]);
        return {
          category_id: c.id,
          category_name: c.name,
          est_weight: w,
          rate_per_kg: c.rate_per_kg,
          amount: Math.round(w * c.rate_per_kg * 100) / 100,
        };
      });
  }, [categories, weights]);

  const estTotalWeight = selectedItems.reduce((s, i) => s + i.est_weight, 0);
  const estTotalAmount = selectedItems.reduce((s, i) => s + i.amount, 0);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4 - photos.length);
    setError(null);
    try {
      const converted = await Promise.all(files.map(readImageFileAsDataUrl));
      setPhotos((prev) => [...prev, ...converted].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid photo upload.');
    }
  };

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        items: selectedItems.map((i) => ({ category_id: i.category_id, est_weight: i.est_weight })),
        pickup_date: pickupDate,
        slot_id: slotId,
        notes,
        photos,
      };
      if (useSaved && selectedAddressId) {
        body.address_id = selectedAddressId;
      } else {
        body.address = newAddress;
        body.save_address = saveNewAddress;
      }
      const res = await apiFetch<{ pickup: Pickup }>('/api/pickups', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await onBooked(res.pickup);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const isAreaServiceable = Boolean(
    settings?.service_areas.find((a) => a.pincode === activePincode && a.active)
  );

  return (
    <div className="max-w-4xl space-y-6">
      {/* 4-Step Indicator */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { num: 1, label: '01. Categories' },
          { num: 2, label: '02. Address' },
          { num: 3, label: '03. Date & Slot' },
          { num: 4, label: '04. Review' },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            disabled={s.num > step}
            onClick={() => s.num <= step && setStep(s.num as 1 | 2 | 3 | 4)}
            className={`px-3 py-2.5 text-xs sm:text-sm font-medium rounded-lg border text-left transition-colors ${
              step === s.num
                ? 'border-emerald-700 bg-emerald-50 text-emerald-800 font-semibold'
                : s.num < step
                  ? 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                  : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 1: Choose Scrap Categories & Approximate Weights</h2>
              <p className="text-sm text-slate-600 mt-1">Final weights are confirmed on our collector’s digital scale.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {categories.map((cat) => {
                const w = weights[cat.id] ?? 0;
                return (
                  <div
                    key={cat.id}
                    className={`border rounded-xl p-4 transition-colors ${
                      w > 0 ? 'border-emerald-700 bg-emerald-50/30' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <CategoryIcon name={cat.icon} className="w-5 h-5 text-emerald-700 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{cat.name}</div>
                          <div className="text-xs font-mono text-emerald-700">₹{cat.rate_per_kg}/{cat.unit}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={1000}
                          step={0.5}
                          value={w === 0 ? '' : w}
                          placeholder="0"
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setWeights((prev) => ({ ...prev, [cat.id]: val }));
                          }}
                          className="w-20 px-2.5 py-1.5 text-sm font-mono text-right border border-slate-300 rounded-lg bg-white"
                        />
                        <span className="text-xs font-mono text-slate-500">kg</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">{cat.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-6 font-mono">
                <div>
                  <span className="text-xs text-slate-500 block">Approx. Weight</span>
                  <span className="text-lg font-bold text-slate-900">{estTotalWeight.toFixed(1)} kg</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Estimated Payout</span>
                  <span className="text-lg font-bold text-emerald-700">₹{estTotalAmount.toLocaleString('en-IN')}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={selectedItems.length === 0}
                onClick={() => setStep(2)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2"
              >
                <span>Continue to Address</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 2: Select Pickup Address & Verify Pincode</h2>
              <p className="text-sm text-slate-600 mt-1">Choose a saved address or enter a new Bengaluru location.</p>
            </div>

            {addresses.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUseSaved(true)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                    useSaved ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Saved Addresses ({addresses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setUseSaved(false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                    !useSaved ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Enter New Address
                </button>
              </div>
            )}

            {useSaved && addresses.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {addresses.map((addr) => {
                  const selected = selectedAddressId === addr.id;
                  return (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => setSelectedAddressId(addr.id)}
                      className={`text-left p-4 rounded-xl border transition-colors ${
                        selected ? 'border-emerald-700 bg-emerald-50/40' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-slate-900">{addr.label}</span>
                        <span className="text-xs font-mono text-slate-500">{addr.pincode}</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {addr.line1}
                        {addr.line2 ? `, ${addr.line2}` : ''}, {addr.area}, {addr.city}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Address Label</label>
                    <input
                      value={newAddress.label}
                      onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                      placeholder="Home / Office"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Service Area (Bengaluru)</label>
                    <select
                      value={newAddress.pincode}
                      onChange={(e) => {
                        const sa = settings?.service_areas.find((a) => a.pincode === e.target.value);
                        setNewAddress({
                          ...newAddress,
                          pincode: e.target.value,
                          area: sa ? sa.area : newAddress.area,
                        });
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {(settings?.service_areas || []).map((sa) => (
                        <option key={sa.pincode} value={sa.pincode}>
                          {sa.area} ({sa.pincode})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">House / Flat & Street</label>
                    <input
                      value={newAddress.line1}
                      onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
                      placeholder="42, 12th Main Road"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Pincode</label>
                    <input
                      value={newAddress.pincode}
                      onChange={(e) => setNewAddress({ ...newAddress, pincode: e.target.value })}
                      placeholder="560038"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveNewAddress}
                    onChange={(e) => setSaveNewAddress(e.target.checked)}
                    className="accent-emerald-700"
                  />
                  <span>Save this address to my profile</span>
                </label>
              </div>
            )}

            {activePincode.length === 6 && (
              <div
                className={`p-3 rounded-lg text-xs font-medium border ${
                  isAreaServiceable
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {pincodeCheckMsg ||
                  (isAreaServiceable
                    ? `Pincode ${activePincode} is serviceable.`
                    : `Pincode ${activePincode} is outside active Bengaluru service zones.`)}
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={
                  !isAreaServiceable ||
                  (!useSaved && newAddress.line1.trim().length < 4) ||
                  (useSaved && !selectedAddressId)
                }
                onClick={() => setStep(3)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2"
              >
                <span>Choose Date & Slot</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 3: Choose Pickup Date & 2-Hour IST Slot</h2>
              <p className="text-sm text-slate-600 mt-1">
                Operating Monday–Saturday, 8:00 AM – 8:00 PM IST. Same-day bookings require 3 hours advance notice.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Select Date (Next 14 Days)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
                {dateOptions.map((d) => {
                  const disabled = !d.isOperatingDay || d.isHoliday;
                  const selected = pickupDate === d.dateStr;
                  return (
                    <button
                      key={d.dateStr}
                      type="button"
                      disabled={disabled}
                      onClick={() => setPickupDate(d.dateStr)}
                      className={`p-3 text-left rounded-lg border transition-colors ${
                        disabled
                          ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                          : selected
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{d.label}</div>
                      <div className="text-[11px] font-mono mt-0.5">{d.reason || d.dateStr}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Select Time Window (IST) — Pincode {activePincode}
              </label>
              {loadingSlots ? (
                <SkeletonRows rows={2} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {slotAvailabilities.map((sa) => {
                    const selected = slotId === sa.slot.id;
                    return (
                      <button
                        key={sa.slot.id}
                        type="button"
                        disabled={!sa.available}
                        onClick={() => setSlotId(sa.slot.id)}
                        className={`p-3.5 text-left rounded-lg border transition-colors ${
                          !sa.available
                            ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                            : selected
                              ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-900'
                        }`}
                      >
                        <div className="text-sm font-semibold font-mono">{sa.slot.label}</div>
                        <div className="text-xs mt-1">
                          {sa.available ? `${sa.remaining} of ${sa.capacity} slots open` : sa.reason}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={!pickupDate || !slotId}
                onClick={() => setStep(4)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-2"
              >
                <span>Review Booking</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Step 4: Review & Confirm Pickup</h2>
              <p className="text-sm text-slate-600 mt-1">Add optional scrap photos or gate instructions before confirming.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Pickup Schedule</div>
                <div className="font-semibold text-slate-900 mt-0.5">{formatISTDate(pickupDate)}</div>
                <div className="font-mono text-xs text-emerald-700 mt-0.5">
                  {slotAvailabilities.find((s) => s.slot.id === slotId)?.slot.label} IST
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Location</div>
                <div className="font-semibold text-slate-900 mt-0.5">
                  {activeAreaName} ({activePincode})
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {useSaved
                    ? addresses.find((a) => a.id === selectedAddressId)?.line1
                    : newAddress.line1}
                </div>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4 text-right">Est. Weight</th>
                    <th className="py-2.5 px-4 text-right">Rate</th>
                    <th className="py-2.5 px-4 text-right">Est. Payout</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedItems.map((it) => (
                    <tr key={it.category_id}>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{it.category_name}</td>
                      <td className="py-2.5 px-4 text-right font-mono">{it.est_weight} kg</td>
                      <td className="py-2.5 px-4 text-right font-mono">₹{it.rate_per_kg}/kg</td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-700">₹{it.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes for Collector (Optional)</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="E.g. Ring bell at security cabin, cardboard stacked near garage"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Upload Scrap Photos (Optional, up to 4)</label>
                <div className="flex flex-wrap items-center gap-3">
                  {photos.map((src, idx) => (
                    <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                      <img src={src} alt={`Scrap item ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((p) => p.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-slate-900/75 text-white rounded p-0.5 text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {photos.length < 4 && (
                    <label className="w-20 h-20 border border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 text-xs text-slate-500">
                      <Upload className="w-4 h-4 mb-1 text-emerald-700" />
                      <span>Add</span>
                      <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            </div>

            {error && <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">{error}</div>}

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg inline-flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirm}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg inline-flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Confirming...' : `Confirm Pickup (Est. ₹${estTotalAmount.toLocaleString('en-IN')})`}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MyPickupsView({ pickups, loading }: { pickups: Pickup[]; loading: boolean }) {
  const { navigate } = useApp();
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = pickups.filter((p) => {
    if (statusFilter !== 'All' && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return p.code.toLowerCase().includes(q) || p.area.toLowerCase().includes(q) || p.pincode.includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
          {['All', 'Requested', 'Assigned', 'En Route', 'Completed', 'Cancelled'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or area..."
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
          />
          <button
            type="button"
            onClick={() => navigate('/dashboard/book')}
            className="px-4 py-1.5 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
          >
            New Pickup
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching pickups"
          description="Try clearing your filters or schedule a new scrap pickup."
          actionLabel="Schedule Pickup"
          onAction={() => navigate('/dashboard/book')}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Date & Slot (IST)</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Collector</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Weight</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/dashboard/pickups/${p.id}`)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">{p.code}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{formatISTDate(p.pickup_date)}</div>
                      <div className="text-xs font-mono text-slate-500">{p.slot_label}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {p.area} ({p.pincode})
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">{p.collector_name || 'Awaiting assignment'}</td>
                    <td className="py-3.5 px-4">
                      <StatusText status={p.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono">
                      {(p.actual_total_weight ?? p.est_total_weight).toFixed(1)} kg
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-emerald-700">
                      ₹{(p.actual_total_amount ?? p.est_total_amount).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PickupDetailView({ pickupId, onUpdated }: { pickupId: number; onUpdated: () => Promise<void> }) {
  const { navigate, bootstrap } = useApp();
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reschedule & Cancel modals
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const settings = bootstrap?.settings;
  const dateOptions = useMemo(() => (settings ? getBookingDateOptions(settings) : []), [settings]);
  const [newDate, setNewDate] = useState('');
  const [newSlotId, setNewSlotId] = useState('');
  const [slotAvails, setSlotAvails] = useState<SlotAvailability[]>([]);
  const [savingAction, setSavingAction] = useState(false);

  // Review state
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ pickup: Pickup }>(`/api/pickups/${pickupId}`);
      setPickup(res.pickup);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load pickup.');
    } finally {
      setLoading(false);
    }
  }, [pickupId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!rescheduleOpen || !pickup || !newDate) return;
    apiFetch<{ slots: SlotAvailability[] }>(
      `/api/public/slots?date=${encodeURIComponent(newDate)}&pincode=${encodeURIComponent(pickup.pincode)}`
    ).then((res) => {
      setSlotAvails(res.slots);
      const first = res.slots.find((s) => s.available);
      if (first) setNewSlotId(first.slot.id);
    });
  }, [rescheduleOpen, pickup, newDate]);

  if (loading) return <SkeletonRows rows={5} />;
  if (error || !pickup) {
    return (
      <EmptyState
        title="Pickup not found"
        description={error || 'Unable to locate this pickup.'}
        actionLabel="Back to My Pickups"
        onAction={() => navigate('/dashboard/pickups')}
      />
    );
  }

  const slotStartHour = settings?.slots.find((s) => s.id === pickup.slot_id)?.startHour ?? 10;
  const modifyCheck = evaluateModifyPenalty(pickup.pickup_date, slotStartHour);
  const canModify = ['Requested', 'Assigned', 'En Route', 'Rescheduled'].includes(pickup.status);

  const handleCancel = async () => {
    setSavingAction(true);
    try {
      await apiFetch(`/api/pickups/${pickup.id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: cancelReason }),
      });
      setCancelOpen(false);
      await load();
      await onUpdated();
    } finally {
      setSavingAction(false);
    }
  };

  const handleReschedule = async () => {
    setSavingAction(true);
    try {
      await apiFetch(`/api/pickups/${pickup.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ pickup_date: newDate, slot_id: newSlotId }),
      });
      setRescheduleOpen(false);
      await load();
      await onUpdated();
    } finally {
      setSavingAction(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      const res = await apiFetch<{ pickup: Pickup }>(`/api/pickups/${pickup.id}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment }),
      });
      setPickup(res.pickup);
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard/pickups')}
            className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50"
            aria-label="Back to pickups"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold font-mono text-slate-900">{pickup.code}</h2>
              <span className="text-slate-300">·</span>
              <StatusText status={pickup.status} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {formatISTDate(pickup.pickup_date)} · {pickup.slot_label} IST · {pickup.area} ({pickup.pincode})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pickup.status === 'Completed' && (
            <button
              type="button"
              onClick={() => downloadPickupReceiptPdf(pickup)}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF Receipt</span>
            </button>
          )}
          {canModify && (
            <>
              <button
                type="button"
                onClick={() => {
                  const nextOpen = dateOptions.find((d) => d.isOperatingDay && !d.isHoliday)?.dateStr || '';
                  setNewDate(nextOpen);
                  setRescheduleOpen(true);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg inline-flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                <span>Reschedule</span>
              </button>
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="px-4 py-2 text-sm font-medium text-red-700 border border-red-200 bg-white hover:bg-red-50 rounded-lg"
              >
                Cancel Pickup
              </button>
            </>
          )}
        </div>
      </div>

      {/* Visual Timeline */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Live Status Timeline</h3>
        <PickupTimelineTracker pickup={pickup} />
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Scrap Items & Payout</h3>
            {pickup.payment_method && (
              <span className="text-xs font-mono text-emerald-700 font-semibold">
                {pickup.payment_method} · {pickup.payment_status}
              </span>
            )}
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4 text-right">Est. kg</th>
                <th className="py-2.5 px-4 text-right">Actual kg</th>
                <th className="py-2.5 px-4 text-right">Rate</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pickup.items.map((it, idx) => (
                <tr key={idx}>
                  <td className="py-3 px-4 font-medium text-slate-900">{it.category_name}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">{it.est_weight.toFixed(1)}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-900">
                    {it.actual_weight !== null ? it.actual_weight.toFixed(1) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">₹{it.rate_per_kg}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700">₹{it.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-sm font-mono">
            <span className="font-semibold text-slate-700">
              Total: {(pickup.actual_total_weight ?? pickup.est_total_weight).toFixed(1)} kg
            </span>
            <span className="text-base font-bold text-emerald-700">
              ₹{(pickup.actual_total_amount ?? pickup.est_total_amount).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2 text-sm">
            <div className="text-xs font-semibold text-slate-500">Assigned Collector</div>
            {pickup.collector_name ? (
              <>
                <div className="text-base font-semibold text-slate-900">{pickup.collector_name}</div>
                <div className="font-mono text-xs text-slate-600">
                  Mobile: {pickup.collector_phone} · ★ {pickup.collector_rating?.toFixed(1) || '5.0'}
                </div>
              </>
            ) : (
              <div className="text-slate-600">
                {pickup.manual_queue ? 'In admin dispatch queue — assigning shortly.' : 'Matching online collector in your pincode...'}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5 text-sm">
            <div className="text-xs font-semibold text-slate-500">Pickup Address</div>
            <div className="font-semibold text-slate-900">{pickup.address_snapshot.label}</div>
            <div className="text-slate-600">
              {pickup.address_snapshot.line1}
              {pickup.address_snapshot.line2 ? `, ${pickup.address_snapshot.line2}` : ''}
            </div>
            <div className="text-slate-600">
              {pickup.area}, {pickup.address_snapshot.city} — {pickup.pincode}
            </div>
            {pickup.notes && <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">Note: {pickup.notes}</div>}
          </div>

          {pickup.photos.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-semibold text-slate-500 mb-2">Uploaded Photos</div>
              <div className="grid grid-cols-2 gap-2">
                {pickup.photos.map((src, i) => (
                  <img key={i} src={src} alt={`Uploaded scrap ${i + 1}`} className="w-full h-24 object-cover rounded-lg border border-slate-200" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collector Rating & Review */}
      {pickup.status === 'Completed' && pickup.collector_id && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-900 mb-3">Rate Your Collector</h3>
          {pickup.review ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-1 text-amber-500">
                {Array.from({ length: pickup.review.rating }).map((_, idx) => (
                  <Star key={idx} className="w-4 h-4 fill-amber-500" />
                ))}
                <span className="ml-2 font-mono text-xs text-slate-600">{pickup.review.rating}/5</span>
              </div>
              {pickup.review.comment && <p className="text-slate-700 mt-1">“{pickup.review.comment}”</p>}
            </div>
          ) : (
            <form onSubmit={handleReviewSubmit} className="space-y-4 max-w-lg">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1"
                    aria-label={`Rate ${star} stars`}
                  >
                    <Star className={`w-6 h-6 ${star <= rating ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`} />
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share feedback on punctuality and digital weighing..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={submittingReview}
                className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                {submittingReview ? 'Submitting...' : 'Submit Review'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Reschedule Modal */}
      <ModalDialog open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Reschedule Pickup">
        <div className="space-y-4">
          {modifyCheck.warning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{modifyCheck.warning}</span>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">New Operating Date</label>
            <select
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {dateOptions
                .filter((d) => d.isOperatingDay && !d.isHoliday)
                .map((d) => (
                  <option key={d.dateStr} value={d.dateStr}>
                    {d.label} ({d.dateStr})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">New 2-Hour IST Slot</label>
            <select
              value={newSlotId}
              onChange={(e) => setNewSlotId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {slotAvails.map((s) => (
                <option key={s.slot.id} value={s.slot.id} disabled={!s.available}>
                  {s.slot.label} {s.available ? `(${s.remaining} open)` : `— ${s.reason}`}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRescheduleOpen(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
              Keep Current
            </button>
            <button
              type="button"
              disabled={!newSlotId || savingAction}
              onClick={handleReschedule}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
            >
              {savingAction ? 'Updating...' : 'Confirm Reschedule'}
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* Cancel Modal */}
      <ModalDialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel Pickup">
        <div className="space-y-4">
          {modifyCheck.warning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{modifyCheck.warning}</span>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Reason for cancelling (Optional)</label>
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="E.g. Need more time to sort"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCancelOpen(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
              Keep Pickup
            </button>
            <button
              type="button"
              disabled={savingAction}
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg"
            >
              {savingAction ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}

function AddressesView({ addresses, onChanged }: { addresses: Address[]; onChanged: () => Promise<void> }) {
  const { bootstrap } = useApp();
  const serviceAreas = bootstrap?.settings.service_areas || [];
  const [form, setForm] = useState({
    label: 'Home',
    line1: '',
    line2: '',
    area: serviceAreas[0]?.area || 'Indiranagar',
    pincode: serviceAreas[0]?.pincode || '560038',
    is_default: false,
  });
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/addresses', { method: 'POST', body: JSON.stringify(form) });
      setForm({ ...form, line1: '', line2: '' });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save address.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-3">
        {addresses.length === 0 ? (
          <EmptyState title="No saved addresses" description="Add a Bengaluru pickup address on the right." />
        ) : (
          addresses.map((addr) => (
            <div key={addr.id} className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{addr.label}</span>
                  {addr.is_default && <span className="text-xs font-mono text-emerald-700 font-semibold">· Default</span>}
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {addr.line1}
                  {addr.line2 ? `, ${addr.line2}` : ''}, {addr.area}, {addr.city} — {addr.pincode}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!addr.is_default && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/addresses/${addr.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ is_default: true }),
                      });
                      await onChanged();
                    }}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    Set Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/addresses/${addr.id}`, { method: 'DELETE' });
                    await onChanged();
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-700"
                  aria-label="Delete address"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 h-fit">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Add New Address</h3>
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Label</label>
            <input
              required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Bengaluru Zone</label>
            <select
              value={form.pincode}
              onChange={(e) => {
                const sa = serviceAreas.find((a) => a.pincode === e.target.value);
                setForm({ ...form, pincode: e.target.value, area: sa ? sa.area : form.area });
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
            <label className="block text-xs font-medium text-slate-700 mb-1">Flat / House No. & Street</label>
            <input
              required
              value={form.line1}
              onChange={(e) => setForm({ ...form, line1: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Landmark (Optional)</label>
            <input
              value={form.line2}
              onChange={(e) => setForm({ ...form, line2: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              className="accent-emerald-700"
            />
            <span>Make default pickup address</span>
          </label>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <button type="submit" className="w-full py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg">
            Save Address
          </button>
        </form>
      </div>
    </div>
  );
}

function ImpactView() {
  const [impact, setImpact] = useState<{
    completedPickups: number;
    totalKgRecycled: number;
    totalEarnings: number;
    co2SavedKg: number;
    treesEquivalent: number;
    breakdown: Array<{ category_name: string; kg: number; earnings: number; co2_saved: number }>;
  } | null>(null);

  useEffect(() => {
    apiFetch<typeof impact>('/api/household/impact').then(setImpact);
  }, []);

  if (!impact) return <SkeletonRows rows={3} />;
  const maxKg = Math.max(1, ...impact.breakdown.map((b) => b.kg));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total Kg Recycled</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{impact.totalKgRecycled} kg</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">CO₂ Emissions Prevented</div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">{impact.co2SavedKg} kg</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Mature Trees Equivalent</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{impact.treesEquivalent}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Lifetime Scrap Earnings</div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
            ₹{impact.totalEarnings.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Material Recovery Breakdown</h3>
        {impact.breakdown.length === 0 ? (
          <p className="text-sm text-slate-500">Complete your first pickup to see category-level CO₂ impact.</p>
        ) : (
          <div className="space-y-4">
            {impact.breakdown.map((b) => (
              <div key={b.category_name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-900">{b.category_name}</span>
                  <span className="font-mono text-xs text-slate-600">
                    {Number(b.kg).toFixed(1)} kg · ₹{Number(b.earnings).toLocaleString('en-IN')} ·{' '}
                    {Number(b.co2_saved).toFixed(1)} kg CO₂
                  </span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-700 rounded-full"
                    style={{ width: `${Math.min(100, (b.kg / maxKg) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileView({ user, onUpdated }: { user: NonNullable<ReturnType<typeof useApp>['user']>; onUpdated: () => Promise<void> }) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name, phone, newPassword: newPassword || undefined }),
    });
    setNewPassword('');
    await onUpdated();
    setMsg('Profile updated.');
  };

  return (
    <div className="max-w-lg bg-white border border-slate-200 rounded-xl p-6">
      <h3 className="text-base font-semibold text-slate-900 mb-4">Account Settings</h3>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
          <input disabled value={user.email} className="w-full px-3 py-2 text-sm border border-slate-200 bg-slate-50 rounded-lg text-slate-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">New Password (Optional)</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
        </div>
        {msg && <p className="text-xs font-medium text-emerald-700">{msg}</p>}
        <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg">
          Save Changes
        </button>
      </form>
    </div>
  );
}
