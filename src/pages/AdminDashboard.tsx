import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarClock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  IndianRupee,
  LayoutDashboard,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  Users,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { downloadAdminPayoutsPdf, downloadCsv } from '../lib/pdf.ts';
import { DashboardShell, type NavSectionItem } from '../components/Layout.tsx';
import { EmptyState, ModalDialog, PickupTimelineTracker, SkeletonRows, StatusText } from '../components/SharedUI.tsx';
import { formatISTDate, formatISTDateTime } from '../shared/scheduling.ts';
import type {
  AuditLog,
  Category,
  ContactMessage,
  FaqItem,
  Pickup,
  PickupStatus,
  RateHistoryEntry,
  RecyclerOrder,
  ScheduleSettings,
  SiteBanner,
  TestimonialItem,
  User,
} from '../shared/types.ts';

const NAV_ITEMS: NavSectionItem[] = [
  { label: 'Overview', to: '/admin', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Bookings & Dispatch', to: '/admin/pickups', icon: <Truck className="w-4 h-4" /> },
  { label: 'User Management', to: '/admin/users', icon: <Users className="w-4 h-4" /> },
  { label: 'Rates & Categories', to: '/admin/rates', icon: <IndianRupee className="w-4 h-4" /> },
  { label: 'Slots & Timing', to: '/admin/slots', icon: <CalendarClock className="w-4 h-4" /> },
  { label: 'Payments & Reports', to: '/admin/payments', icon: <FileSpreadsheet className="w-4 h-4" /> },
  { label: 'Content & Inbox', to: '/admin/content', icon: <MessageSquare className="w-4 h-4" /> },
  { label: 'Audit Log', to: '/admin/audit', icon: <Activity className="w-4 h-4" /> },
];

export function AdminDashboard() {
  const { path, refreshBootstrap } = useApp();

  const pageTitle = (() => {
    if (path === '/admin/users') return 'User & KYC Management';
    if (path === '/admin/pickups' || path === '/admin/bookings') return 'Bookings & Dispatch Management';
    if (path === '/admin/rates') return 'Rate Card Management';
    if (path === '/admin/slots') return 'Slots, Holidays & Areas';
    if (path === '/admin/payments') return 'Payments, Orders & Reports';
    if (path === '/admin/content') return 'CMS & Contact Inbox';
    if (path === '/admin/audit') return 'System Audit Log';
    return 'Admin Operations Overview';
  })();

  return (
    <DashboardShell title={pageTitle} roleLabel="Admin" navItems={NAV_ITEMS}>
      {path === '/admin/users' ? (
        <AdminUsersView />
      ) : path === '/admin/pickups' || path === '/admin/bookings' ? (
        <AdminPickupsView />
      ) : path === '/admin/rates' ? (
        <AdminRatesView onChanged={refreshBootstrap} />
      ) : path === '/admin/slots' ? (
        <AdminSlotsView onChanged={refreshBootstrap} />
      ) : path === '/admin/payments' ? (
        <AdminPaymentsView />
      ) : path === '/admin/content' ? (
        <AdminContentView onChanged={refreshBootstrap} />
      ) : path === '/admin/audit' ? (
        <AdminAuditView />
      ) : (
        <AdminOverviewView />
      )}
    </DashboardShell>
  );
}

function AdminOverviewView() {
  const { navigate } = useApp();
  const [recentBookings, setRecentBookings] = useState<Pickup[]>([]);
  const [data, setData] = useState<{
    kpis: {
      totalUsers: number;
      activeCollectors: number;
      pickupsToday: number;
      pendingPickups: number;
      completedPickups: number;
      totalKgRecycled: number;
      totalPayoutInr: number;
      totalCommissionInr: number;
    };
    charts: {
      pickupsOverTime: Array<{ date: string; total: number; completed: number; weight_kg: number }>;
      categoryWeight: Array<{ name: string; weight_kg: number }>;
      areaDemand: Array<{ area: string; pincode: string; pickups: number; weight_kg: number }>;
      topCollectors: Array<{
        id: number;
        name: string;
        vehicle_type: string;
        rating_avg: number;
        total_pickups: number;
        total_earnings: number;
        is_online: number;
      }>;
    };
  } | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<typeof data>('/api/admin/overview'),
      apiFetch<{ bookings: Pickup[] }>('/api/admin/bookings'),
    ]).then(([overviewRes, bookingsRes]) => {
      setData(overviewRes);
      setRecentBookings((bookingsRes.bookings || []).slice(0, 6));
    });
  }, []);

  if (!data) return <SkeletonRows rows={5} />;

  const { kpis, charts } = data;
  const maxCatKg = Math.max(1, ...charts.categoryWeight.map((c) => Number(c.weight_kg)));
  const maxAreaPickups = Math.max(1, ...charts.areaDemand.map((a) => Number(a.pickups)));
  const maxDayCount = Math.max(1, ...charts.pickupsOverTime.map((d) => Number(d.total)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: kpis.totalUsers },
          { label: 'Active Collectors', value: kpis.activeCollectors },
          { label: 'Pickups Today (IST)', value: kpis.pickupsToday },
          { label: 'Pending / Active', value: kpis.pendingPickups },
          { label: 'Completed Pickups', value: kpis.completedPickups },
          { label: 'Total Kg Recycled', value: `${kpis.totalKgRecycled} kg` },
          { label: 'Household Payouts', value: `₹${kpis.totalPayoutInr.toLocaleString('en-IN')}` },
          { label: 'Platform Commission', value: `₹${kpis.totalCommissionInr.toLocaleString('en-IN')}`, accent: true },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs text-slate-500">{card.label}</div>
            <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${card.accent ? 'text-emerald-700' : 'text-slate-900'}`}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Appointments Preview */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Recent Bookings & Appointments</h3>
            <p className="text-xs text-slate-500 mt-0.5">Latest customer pickup schedules retrieved from the database.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/pickups')}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0"
          >
            Manage All Bookings
          </button>
        </div>
        {recentBookings.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No bookings recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Code</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Area & Pincode</th>
                  <th className="py-2.5 px-4">IST Window</th>
                  <th className="py-2.5 px-4 text-right">Est. Value</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentBookings.map((b) => (
                  <tr key={`${b.code}-${b.id}`} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">{b.code}</td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900">{b.household_name || 'Guest'}</div>
                      <div className="text-xs font-mono text-slate-500">{b.household_phone}</div>
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-700">
                      {b.area} · <span className="font-mono">{b.pincode}</span>
                    </td>
                    <td className="py-2.5 px-4 text-xs">
                      <span className="font-medium text-slate-900">{formatISTDate(b.pickup_date)}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="font-mono text-slate-600">{b.slot_label}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      ₹{(b.actual_total_amount ?? b.est_total_amount).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusText status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pickups Over Time Bar Chart */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Pickups Over Time</h3>
          {charts.pickupsOverTime.length === 0 ? (
            <p className="text-sm text-slate-500">No pickup history yet.</p>
          ) : (
            <div className="h-48 flex items-end gap-2 pt-4">
              {charts.pickupsOverTime.map((d) => {
                const hPct = Math.max(12, Math.round((Number(d.total) / maxDayCount) * 100));
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <div className="text-[11px] font-mono text-slate-600 mb-1">{d.total}</div>
                    <div className="w-full max-w-[36px] bg-emerald-700 rounded-t-md transition-all" style={{ height: `${hPct}%` }} />
                    <div className="text-[10px] font-mono text-slate-500 mt-1.5 truncate max-w-full">
                      {d.date.slice(5)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category-wise Weight */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Category-Wise Weight (kg)</h3>
          <div className="space-y-3">
            {charts.categoryWeight.map((c) => (
              <div key={c.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-800">{c.name}</span>
                  <span className="font-mono text-slate-600">{Number(c.weight_kg).toFixed(1)} kg</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-700 rounded-full"
                    style={{ width: `${Math.min(100, (Number(c.weight_kg) / maxCatKg) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Area-wise Demand */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Bengaluru Area-Wise Demand</h3>
          <div className="space-y-3">
            {charts.areaDemand.map((a) => (
              <div key={`${a.area}-${a.pincode}`} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-800">
                    {a.area} ({a.pincode})
                  </span>
                  <span className="font-mono text-slate-600">
                    {a.pickups} pickups · {Number(a.weight_kg).toFixed(1)} kg
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-800 rounded-full"
                    style={{ width: `${Math.min(100, (Number(a.pickups) / maxAreaPickups) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Collectors */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Top Collectors</h3>
          <div className="divide-y divide-slate-100 text-sm">
            {charts.topCollectors.map((col) => (
              <div key={col.id} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{col.name}</div>
                  <div className="text-xs text-slate-500">
                    {col.vehicle_type} · {col.is_online ? 'Online' : 'Offline'}
                  </div>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="font-semibold text-slate-900">
                    ★ {Number(col.rating_avg).toFixed(1)} · {col.total_pickups} jobs
                  </div>
                  <div className="text-emerald-700">₹{Number(col.total_earnings).toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminUsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [inspectUser, setInspectUser] = useState<User | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    role: 'household' as 'household' | 'collector' | 'recycler',
    name: '',
    email: '',
    phone: '',
    password: '',
    business_name: '',
    vehicle_number: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ role, status, search, page: String(page), pageSize: '12' });
      const res = await apiFetch<{ users: User[]; total: number }>(`/api/admin/users?${qs.toString()}`);
      setUsers(res.users);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [role, status, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleBlock = async (u: User) => {
    const next = u.status === 'active' ? 'blocked' : 'active';
    await apiFetch(`/api/admin/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    await load();
  };

  const setKyc = async (u: User, kyc_status: 'approved' | 'rejected') => {
    await apiFetch(`/api/admin/users/${u.id}/kyc`, { method: 'PATCH', body: JSON.stringify({ kyc_status }) });
    setInspectUser(null);
    await load();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setNotice(`Created ${createForm.role} account for ${createForm.email}.`);
      setCreateOpen(false);
      setCreateForm({
        role: 'household',
        name: '',
        email: '',
        phone: '',
        password: '',
        business_name: '',
        vehicle_number: '',
      });
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);
    setResetting(true);
    try {
      await apiFetch(`/api/admin/users/${resetTarget.id}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ password: resetPasswordVal }),
      });
      setNotice(`Updated login password for ${resetTarget.email}.`);
      setResetTarget(null);
      setResetPasswordVal('');
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="p-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
            <option value="all">All Roles</option>
            <option value="household">Households</option>
            <option value="collector">Collectors</option>
            <option value="recycler">Recyclers</option>
            <option value="admin">Admins</option>
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, email, or phone..."
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white flex-1 sm:w-64"
          />
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">KYC / Details</th>
                  <th className="py-3 px-4">Account</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const kyc = u.collector_profile?.kyc_status || u.recycler_profile?.kyc_status;
                  return (
                    <tr key={u.id}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{u.name}</div>
                        <div className="text-xs font-mono text-slate-500">{u.email}</div>
                      </td>
                      <td className="py-3 px-4 capitalize font-medium text-slate-700">{u.role}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{u.phone}</td>
                      <td className="py-3 px-4">
                        {kyc ? <StatusText status={kyc} /> : <span className="text-xs text-slate-400">N/A</span>}
                      </td>
                      <td className="py-3 px-4">
                        <StatusText status={u.status === 'active' ? 'approved' : 'blocked'} />
                      </td>
                      <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                        {(u.role === 'collector' || u.role === 'recycler') && (
                          <button
                            type="button"
                            onClick={() => setInspectUser(u)}
                            className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50"
                          >
                            Review KYC
                          </button>
                        )}
                        {u.role !== 'admin' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setResetTarget(u);
                                setResetPasswordVal('');
                                setResetError(null);
                              }}
                              className="px-2.5 py-1 text-xs font-medium border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
                            >
                              Set Password
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleBlock(u)}
                              className={`px-2.5 py-1 text-xs font-medium rounded-md border ${
                                u.status === 'active'
                                  ? 'border-red-200 text-red-700 hover:bg-red-50'
                                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {u.status === 'active' ? 'Block' : 'Unblock'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>Showing {users.length} of {total} users</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border border-slate-300 rounded disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page * 12 >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-slate-300 rounded disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalDialog open={Boolean(inspectUser)} onClose={() => setInspectUser(null)} title={`Partner KYC — ${inspectUser?.name}`}>
        {inspectUser && (
          <div className="space-y-4 text-sm">
            {inspectUser.collector_profile && (
              <div className="space-y-2">
                <div>Vehicle: {inspectUser.collector_profile.vehicle_type} ({inspectUser.collector_profile.vehicle_number})</div>
                <div>Document: {inspectUser.collector_profile.kyc_doc_type} · {inspectUser.collector_profile.kyc_doc_number}</div>
                <div>Pincodes: {inspectUser.collector_profile.service_pincodes.join(', ')}</div>
                {inspectUser.collector_profile.kyc_doc_image && (
                  <img src={inspectUser.collector_profile.kyc_doc_image} alt="KYC document" className="w-full max-h-56 object-contain border border-slate-200 rounded-lg" />
                )}
              </div>
            )}
            {inspectUser.recycler_profile && (
              <div className="space-y-2">
                <div>Business: {inspectUser.recycler_profile.business_name}</div>
                <div>GSTIN: {inspectUser.recycler_profile.gst_number}</div>
                <div>City: {inspectUser.recycler_profile.city}</div>
                {inspectUser.recycler_profile.kyc_doc_image && (
                  <img src={inspectUser.recycler_profile.kyc_doc_image} alt="GST document" className="w-full max-h-56 object-contain border border-slate-200 rounded-lg" />
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setKyc(inspectUser, 'rejected')}
                className="px-4 py-2 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
              >
                Reject KYC
              </button>
              <button
                type="button"
                onClick={() => setKyc(inspectUser, 'approved')}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                Approve KYC
              </button>
            </div>
          </div>
        )}
      </ModalDialog>

      <ModalDialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create User Account">
        <form onSubmit={handleCreateUser} className="space-y-4 text-sm">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Account Role</label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as 'household' | 'collector' | 'recycler' }))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="household">Household</option>
              <option value="collector">Collector Partner</option>
              <option value="recycler">Recycler Business</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                required
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">10-Digit Mobile</label>
              <input
                required
                value={createForm.phone}
                onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="9845012345"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Initial Password (min 6 chars)</label>
            <input
              type="password"
              required
              minLength={6}
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          {createForm.role === 'collector' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Vehicle Plate (Optional)</label>
              <input
                value={createForm.vehicle_number}
                onChange={(e) => setCreateForm((f) => ({ ...f, vehicle_number: e.target.value }))}
                placeholder="KA-03-EV-1234"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          )}
          {createForm.role === 'recycler' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Business Name</label>
              <input
                value={createForm.business_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, business_name: e.target.value }))}
                placeholder="Facility Pvt. Ltd."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}
          {createError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">{createError}</div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg"
            >
              {creating ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Set New Password — ${resetTarget?.name}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4 text-sm">
          <div className="text-xs text-slate-600">
            Account: <span className="font-mono font-semibold text-slate-900">{resetTarget?.email}</span> (
            <span className="capitalize">{resetTarget?.role}</span>)
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">New Password (min 6 chars)</label>
            <input
              type="password"
              required
              minLength={6}
              value={resetPasswordVal}
              onChange={(e) => setResetPasswordVal(e.target.value)}
              placeholder="Enter new login password"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          {resetError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">{resetError}</div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={resetting}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg"
            >
              {resetting ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

interface BookingSummaryStats {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  supabaseConnected: boolean;
  supabaseHasServiceRole: boolean;
  supabaseCount: number;
  supabaseError: string | null;
}

function AdminPickupsView() {
  const { bootstrap } = useApp();
  const categories = bootstrap?.categories || [];
  const settings = bootstrap?.settings;

  const [bookings, setBookings] = useState<Pickup[]>([]);
  const [summary, setSummary] = useState<BookingSummaryStats | null>(null);
  const [collectors, setCollectors] = useState<User[]>([]);

  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [manualOnly, setManualOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [viewTarget, setViewTarget] = useState<Pickup | null>(null);
  const [assignTarget, setAssignTarget] = useState<Pickup | null>(null);
  const [selectedCollectorId, setSelectedCollectorId] = useState<number>(0);

  const [editTarget, setEditTarget] = useState<Pickup | null>(null);
  const [editForm, setEditForm] = useState<{
    customer_name: string;
    customer_phone: string;
    status: PickupStatus;
    pickup_date: string;
    slot_id: string;
    collector_id: number;
    line1: string;
    line2: string;
    area: string;
    pincode: string;
    notes: string;
    payment_method: string;
    payment_status: string;
    weights: Record<number, number>;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<Pickup | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'All') qs.set('status', statusFilter);
      if (searchQuery.trim()) qs.set('search', searchQuery.trim());
      if (dateFilter) qs.set('date', dateFilter);
      if (manualOnly) qs.set('manualQueue', 'true');

      const [bRes, uRes] = await Promise.all([
        apiFetch<{ bookings: Pickup[]; summary: BookingSummaryStats }>(`/api/admin/bookings?${qs.toString()}`),
        apiFetch<{ users: User[] }>('/api/admin/users?role=collector&pageSize=50'),
      ]);
      setBookings(bRes.bookings || []);
      setSummary(bRes.summary || null);

      const approved = uRes.users.filter((u) => u.collector_profile?.kyc_status === 'approved' && u.status === 'active');
      setCollectors(approved);
      if (approved.length > 0) {
        setSelectedCollectorId((prev) => prev || approved[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, dateFilter, manualOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditModal = (p: Pickup) => {
    const weightsMap: Record<number, number> = {};
    for (const item of p.items) {
      weightsMap[item.category_id] = item.est_weight;
    }
    setEditTarget(p);
    setEditError(null);
    setEditForm({
      customer_name: p.household_name || '',
      customer_phone: p.household_phone || '',
      status: p.status,
      pickup_date: p.pickup_date,
      slot_id: p.slot_id,
      collector_id: p.collector_id || 0,
      line1: p.address_snapshot?.line1 || '',
      line2: p.address_snapshot?.line2 || '',
      area: p.area || '',
      pincode: p.pincode || '',
      notes: p.notes || '',
      payment_method: p.payment_method || '',
      payment_status: p.payment_status || 'Pending',
      weights: weightsMap,
    });
  };

  const editEstimatedTotals = useMemo(() => {
    if (!editForm) return { kg: 0, inr: 0 };
    let kg = 0;
    let inr = 0;
    for (const cat of categories) {
      const w = Number(editForm.weights[cat.id] || 0);
      if (w > 0) {
        kg += w;
        inr += w * cat.rate_per_kg;
      }
    }
    return { kg: Math.round(kg * 100) / 100, inr: Math.round(inr * 100) / 100 };
  }, [editForm, categories]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || !editForm) return;
    setEditError(null);
    setEditSaving(true);
    try {
      if (editTarget.id > 0) {
        const itemsPayload = categories
          .filter((c) => Number(editForm.weights[c.id] || 0) > 0)
          .map((c) => ({ category_id: c.id, est_weight: Number(editForm.weights[c.id]) }));

        await apiFetch(`/api/admin/bookings/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            customer_name: editForm.customer_name,
            customer_phone: editForm.customer_phone,
            status: editForm.status,
            pickup_date: editForm.pickup_date,
            slot_id: editForm.slot_id,
            collector_id: editForm.collector_id > 0 ? editForm.collector_id : null,
            address: {
              label: editTarget.address_snapshot?.label || 'Home',
              line1: editForm.line1,
              line2: editForm.line2,
              area: editForm.area,
              city: editTarget.address_snapshot?.city || 'Bengaluru',
              pincode: editForm.pincode,
            },
            notes: editForm.notes,
            payment_method: editForm.payment_method || null,
            payment_status: editForm.payment_status,
            items: itemsPayload,
          }),
        });
      } else {
        const col = collectors.find((c) => c.id === editForm.collector_id);
        await apiFetch(`/api/admin/supabase-bookings/${encodeURIComponent(editTarget.code)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            customer_name: editForm.customer_name,
            customer_phone: editForm.customer_phone,
            status: editForm.status,
            pickup_date: editForm.pickup_date,
            slot_id: editForm.slot_id,
            assigned_collector_name: col ? col.name : editTarget.collector_name,
            address: {
              line1: editForm.line1,
              line2: editForm.line2,
              area: editForm.area,
              pincode: editForm.pincode,
            },
            notes: editForm.notes,
          }),
        });
      }
      setEditTarget(null);
      setEditForm(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to save appointment changes.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!assignTarget || !selectedCollectorId) return;
    if (assignTarget.id > 0) {
      await apiFetch(`/api/admin/pickups/${assignTarget.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ collector_id: selectedCollectorId }),
      });
    } else {
      const col = collectors.find((c) => c.id === selectedCollectorId);
      await apiFetch(`/api/admin/supabase-bookings/${encodeURIComponent(assignTarget.code)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'Assigned',
          assigned_collector_name: col ? col.name : null,
        }),
      });
    }
    setAssignTarget(null);
    await load();
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelSaving(true);
    try {
      const reason = cancelReason.trim() || 'Cancelled by admin';
      if (cancelTarget.id > 0) {
        await apiFetch(`/api/pickups/${cancelTarget.id}/cancel`, {
          method: 'PATCH',
          body: JSON.stringify({ reason }),
        });
      } else {
        await apiFetch(`/api/admin/supabase-bookings/${encodeURIComponent(cancelTarget.code)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'Cancelled' }),
        });
      }
      setCancelTarget(null);
      setCancelReason('');
      if (viewTarget?.code === cancelTarget.code) setViewTarget(null);
      await load();
    } finally {
      setCancelSaving(false);
    }
  };

  const handleExportCsv = () => {
    const exportRows = bookings.map((b) => ({
      Booking_Code: b.code,
      Customer_Name: b.household_name || '',
      Customer_Email: b.household_email || '',
      Customer_Phone: b.household_phone || '',
      Address: `${b.address_snapshot?.line1 || ''}, ${b.area}, ${b.pincode}`,
      Pickup_Date: b.pickup_date,
      IST_Slot: b.slot_label,
      Status: b.status,
      Collector: b.collector_name || 'Unassigned',
      Est_Weight_Kg: b.est_total_weight,
      Est_Amount_INR: b.est_total_amount,
      Actual_Weight_Kg: b.actual_total_weight ?? '',
      Actual_Amount_INR: b.actual_total_amount ?? '',
      Payment_Method: b.payment_method || '',
      Notes: b.notes || '',
    }));
    downloadCsv(exportRows, `ScrapEase-Bookings-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const statusTabs = ['All', 'Requested', 'Assigned', 'En Route', 'Picked Up', 'Completed', 'Rescheduled', 'Cancelled'];

  return (
    <div className="space-y-5">
      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Total Bookings</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">{summary?.total ?? bookings.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Active / Scheduled</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">{summary?.active ?? 0}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Completed</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">{summary?.completed ?? 0}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Cancelled</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-600 mt-1">{summary?.cancelled ?? 0}</div>
        </div>
      </div>

      {/* Filters & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search booking code, customer, email, phone, area, or pincode..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-emerald-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by pickup date"
              className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="px-2.5 py-2 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                Clear Date
              </button>
            )}
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 px-3 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer whitespace-nowrap shrink-0">
              <input
                type="checkbox"
                checked={manualOnly}
                onChange={(e) => setManualOnly(e.target.checked)}
                className="accent-emerald-700"
              />
              <span>Manual Queue</span>
            </label>
            <button
              type="button"
              onClick={load}
              className="px-3 py-2 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={bookings.length === 0}
              className="px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Segmented Status Filter */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {statusTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {loading ? (
        <SkeletonRows rows={6} />
      ) : bookings.length === 0 ? (
        <EmptyState
          title="No appointments match these filters"
          description="Clear search or status filters to view all customer bookings."
          actionLabel="Reset Filters"
          onAction={() => {
            setStatusFilter('All');
            setSearchQuery('');
            setDateFilter('');
            setManualOnly(false);
          }}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="py-3 px-4">Booking</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Address & Zone</th>
                  <th className="py-3 px-4">IST Schedule</th>
                  <th className="py-3 px-4 text-right">Weight / Value</th>
                  <th className="py-3 px-4">Collector</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((p) => (
                  <tr key={`${p.code}-${p.id}`} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900">{p.code}</div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {formatISTDate(p.created_at.slice(0, 10))}
                      </div>
                      {p.manual_queue && <div className="text-[11px] font-semibold text-amber-700">Manual Queue</div>}
                      {p.late_flag && <div className="text-[11px] font-semibold text-red-700">Late Flag</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{p.household_name || 'Guest'}</div>
                      <div className="text-xs font-mono text-slate-600">{p.household_phone || '—'}</div>
                      {p.household_email && <div className="text-xs text-slate-500 truncate max-w-[180px]">{p.household_email}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs font-medium text-slate-900 max-w-[200px] truncate">
                        {p.address_snapshot?.line1}
                      </div>
                      <div className="text-xs text-slate-500">
                        {p.area} · <span className="font-mono">{p.pincode}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-xs font-medium text-slate-900">{formatISTDate(p.pickup_date)}</div>
                      <div className="text-xs font-mono text-slate-500">{p.slot_label}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-xs font-semibold text-slate-900">
                        ₹{(p.actual_total_amount ?? p.est_total_amount).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {(p.actual_total_weight ?? p.est_total_weight).toFixed(1)} kg
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                      {p.collector_name || 'Unassigned'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusText status={p.status} />
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewTarget(p)}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        {!['Completed', 'Cancelled'].includes(p.status) && (
                          <>
                            <button
                              type="button"
                              onClick={() => setAssignTarget(p)}
                              className="px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap shrink-0"
                            >
                              {p.collector_id || p.collector_name ? 'Reassign' : 'Assign'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCancelTarget(p);
                                setCancelReason('');
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View Appointment Details Modal */}
      <ModalDialog
        open={Boolean(viewTarget)}
        onClose={() => setViewTarget(null)}
        title={`Appointment Details — ${viewTarget?.code}`}
        maxWidth="max-w-2xl"
      >
        {viewTarget && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-semibold text-slate-900">{viewTarget.code}</span>
                <span>·</span>
                <span>Booked {formatISTDateTime(viewTarget.created_at)}</span>
              </div>
              <StatusText status={viewTarget.status} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-4 border-b border-slate-200">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500">Customer & Contact</div>
                <div className="font-semibold text-slate-900">{viewTarget.household_name || 'Guest'}</div>
                <div className="text-xs font-mono text-slate-600">{viewTarget.household_phone || '—'}</div>
                {viewTarget.household_email && <div className="text-xs text-slate-600">{viewTarget.household_email}</div>}
                <div className="text-xs text-slate-600 pt-2">
                  {viewTarget.address_snapshot?.line1}
                  {viewTarget.address_snapshot?.line2 ? `, ${viewTarget.address_snapshot.line2}` : ''}
                </div>
                <div className="text-xs text-slate-600">
                  {viewTarget.area}, {viewTarget.address_snapshot?.city || 'Bengaluru'} —{' '}
                  <span className="font-mono">{viewTarget.pincode}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500">Schedule & Collector</div>
                <div className="font-semibold text-slate-900">{formatISTDate(viewTarget.pickup_date)}</div>
                <div className="text-xs font-mono text-emerald-700">{viewTarget.slot_label} IST</div>
                <div className="text-xs text-slate-600 pt-2">
                  Collector: <strong className="text-slate-900">{viewTarget.collector_name || 'Unassigned'}</strong>
                </div>
                <div className="text-xs text-slate-600">
                  Payment: <strong className="text-slate-900">{viewTarget.payment_method || 'Pending'}</strong> ({viewTarget.payment_status})
                </div>
              </div>
            </div>

            {viewTarget.notes && (
              <div className="pb-4 border-b border-slate-200">
                <div className="text-xs font-semibold text-slate-500 mb-1">Booking Notes</div>
                <p className="text-sm text-slate-700">{viewTarget.notes}</p>
              </div>
            )}

            <div className="pb-4 border-b border-slate-200">
              <div className="text-xs font-semibold text-slate-500 mb-2">Scrap Categories & Valuation</div>
              <table className="w-full text-xs text-left">
                <thead className="text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-1.5">Category</th>
                    <th className="py-1.5 text-right">Est. kg</th>
                    <th className="py-1.5 text-right">Actual kg</th>
                    <th className="py-1.5 text-right">Rate</th>
                    <th className="py-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {viewTarget.items.map((it, idx) => (
                    <tr key={`${it.category_id}-${idx}`}>
                      <td className="py-2 font-sans font-medium text-slate-900">{it.category_name}</td>
                      <td className="py-2 text-right">{Number(it.est_weight).toFixed(1)}</td>
                      <td className="py-2 text-right">
                        {it.actual_weight !== null ? Number(it.actual_weight).toFixed(1) : '—'}
                      </td>
                      <td className="py-2 text-right">₹{it.rate_per_kg}/kg</td>
                      <td className="py-2 text-right font-semibold text-slate-900">
                        ₹{Number(it.amount).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between pt-3 mt-2 border-t border-slate-200 text-xs font-mono tabular-nums">
                <span className="text-slate-600">
                  Total Weight: {(viewTarget.actual_total_weight ?? viewTarget.est_total_weight).toFixed(1)} kg
                </span>
                <span className="font-bold text-emerald-700">
                  Total Value: ₹{(viewTarget.actual_total_amount ?? viewTarget.est_total_amount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {viewTarget.photos && viewTarget.photos.length > 0 && (
              <div className="pb-4 border-b border-slate-200">
                <div className="text-xs font-semibold text-slate-500 mb-2">Uploaded Photos</div>
                <div className="flex flex-wrap gap-2">
                  {viewTarget.photos.map((src, idx) => (
                    <img
                      key={idx}
                      src={src}
                      alt={`Scrap item ${idx + 1}`}
                      className="w-20 h-20 object-cover rounded-lg border border-slate-200"
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-semibold text-slate-500 mb-3">Status Timeline</div>
              <PickupTimelineTracker pickup={viewTarget} />
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  const target = viewTarget;
                  setViewTarget(null);
                  openEditModal(target);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Edit Appointment
              </button>
              {!['Completed', 'Cancelled'].includes(viewTarget.status) && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewTarget;
                      setViewTarget(null);
                      setAssignTarget(target);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                  >
                    {viewTarget.collector_id || viewTarget.collector_name ? 'Reassign Collector' : 'Assign Collector'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCancelTarget(viewTarget);
                      setCancelReason('');
                    }}
                    className="px-4 py-2 text-xs font-semibold text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    Cancel Appointment
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Edit Appointment Modal */}
      <ModalDialog
        open={Boolean(editTarget && editForm)}
        onClose={() => {
          setEditTarget(null);
          setEditForm(null);
        }}
        title={`Edit Appointment — ${editTarget?.code}`}
        maxWidth="max-w-2xl"
      >
        {editTarget && editForm && (
          <form onSubmit={handleSaveEdit} className="space-y-5 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Customer Name</label>
                <input
                  required
                  value={editForm.customer_name}
                  onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Number</label>
                <input
                  required
                  value={editForm.customer_phone}
                  onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as PickupStatus })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {['Requested', 'Assigned', 'En Route', 'Picked Up', 'Completed', 'Rescheduled', 'Cancelled'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Pickup Date (IST)</label>
                <input
                  type="date"
                  required
                  value={editForm.pickup_date}
                  onChange={(e) => setEditForm({ ...editForm, pickup_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">2-Hour IST Slot</label>
                <select
                  value={editForm.slot_id}
                  onChange={(e) => setEditForm({ ...editForm, slot_id: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {(settings?.slots || []).map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Collector</label>
                <select
                  value={editForm.collector_id}
                  onChange={(e) => setEditForm({ ...editForm, collector_id: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value={0}>Unassigned</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
                <select
                  value={editForm.payment_method}
                  onChange={(e) => setEditForm({ ...editForm, payment_method: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Not Set</option>
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Status</label>
                <select
                  value={editForm.payment_status}
                  onChange={(e) => setEditForm({ ...editForm, payment_status: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Street Address</label>
                <input
                  required
                  value={editForm.line1}
                  onChange={(e) => setEditForm({ ...editForm, line1: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Landmark (Optional)</label>
                <input
                  value={editForm.line2}
                  onChange={(e) => setEditForm({ ...editForm, line2: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Area</label>
                <input
                  required
                  value={editForm.area}
                  onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">6-Digit Pincode</label>
                <input
                  required
                  value={editForm.pincode}
                  onChange={(e) => setEditForm({ ...editForm, pincode: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {editTarget.id > 0 && categories.length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700">Estimated Scrap Weights (kg)</span>
                  <span className="text-xs font-mono tabular-nums text-emerald-700 font-semibold">
                    {editEstimatedTotals.kg} kg · ₹{editEstimatedTotals.inr.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between gap-2 px-3 py-2 border border-slate-200 rounded-lg">
                      <div className="text-xs">
                        <div className="font-medium text-slate-900">{cat.name}</div>
                        <div className="font-mono text-slate-500">₹{cat.rate_per_kg}/kg</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={5000}
                          step={0.5}
                          value={editForm.weights[cat.id] || ''}
                          placeholder="0"
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              weights: {
                                ...editForm.weights,
                                [cat.id]: Math.max(0, Number(e.target.value) || 0),
                              },
                            })
                          }
                          className="w-20 px-2 py-1 text-xs font-mono text-right border border-slate-300 rounded-md"
                        />
                        <span className="text-[11px] font-mono text-slate-500">kg</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Dispatch / Customer Notes</label>
              <textarea
                rows={2}
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">{editError}</div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setEditTarget(null);
                  setEditForm(null);
                }}
                className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={editSaving}
                className="px-5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg"
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </ModalDialog>

      {/* Assign Collector Modal */}
      <ModalDialog open={Boolean(assignTarget)} onClose={() => setAssignTarget(null)} title={`Assign Collector — ${assignTarget?.code}`}>
        <div className="space-y-4">
          <div className="text-xs text-slate-600">
            Location: <strong>{assignTarget?.area} ({assignTarget?.pincode})</strong> · {assignTarget?.slot_label}
          </div>
          <select
            value={selectedCollectorId}
            onChange={(e) => setSelectedCollectorId(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            {collectors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.collector_profile?.service_pincodes.join(', ')} ({c.collector_profile?.is_online ? 'Online' : 'Offline'})
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAssignTarget(null)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">
              Close
            </button>
            <button type="button" onClick={handleAssign} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-700 rounded-lg">
              Confirm Assignment
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* Cancel Appointment Modal */}
      <ModalDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Cancel Appointment — ${cancelTarget?.code}`}
      >
        {cancelTarget && (
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              Cancel pickup <strong className="font-mono text-slate-900">{cancelTarget.code}</strong> for{' '}
              <strong className="text-slate-900">{cancelTarget.household_name || 'Guest'}</strong> on{' '}
              <strong>{formatISTDate(cancelTarget.pickup_date)}</strong> ({cancelTarget.slot_label} IST)?
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cancellation Reason (Optional)</label>
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Customer requested reschedule / unreachable"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                disabled={cancelSaving}
                onClick={handleConfirmCancel}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-lg"
              >
                {cancelSaving ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
}

function AdminRatesView({ onChanged }: { onChanged: () => Promise<void> }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [history, setHistory] = useState<RateHistoryEntry[]>([]);
  const [editingRates, setEditingRates] = useState<Record<number, number>>({});
  const [newCat, setNewCat] = useState({ name: '', description: '', rate_per_kg: 15, co2_factor_per_kg: 1.5 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ categories: Category[]; history: RateHistoryEntry[] }>('/api/admin/categories');
      setCategories(res.categories);
      setHistory(res.history);
      const map: Record<number, number> = {};
      res.categories.forEach((c) => (map[c.id] = c.rate_per_kg));
      setEditingRates(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateRate = async (cat: Category) => {
    await apiFetch(`/api/admin/categories/${cat.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ rate_per_kg: editingRates[cat.id] }),
    });
    await load();
    await onChanged();
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/categories', { method: 'POST', body: JSON.stringify(newCat) });
    setNewCat({ name: '', description: '', rate_per_kg: 15, co2_factor_per_kg: 1.5 });
    await load();
    await onChanged();
  };

  if (loading) return <SkeletonRows rows={4} />;

  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
            <tr>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4">Rate (₹/kg)</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((cat) => (
              <tr key={cat.id}>
                <td className="py-3 px-4 font-semibold text-slate-900">{cat.name}</td>
                <td className="py-3 px-4 text-xs text-slate-600">{cat.description}</td>
                <td className="py-3 px-4">
                  <input
                    type="number"
                    step={0.5}
                    value={editingRates[cat.id] ?? cat.rate_per_kg}
                    onChange={(e) => setEditingRates((prev) => ({ ...prev, [cat.id]: Number(e.target.value) }))}
                    className="w-24 px-2.5 py-1 text-sm font-mono border border-slate-300 rounded-md"
                  />
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => updateRate(cat)}
                    className="px-3 py-1 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
                  >
                    Save Rate
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' });
                      await load();
                      await onChanged();
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-700"
                    aria-label="Remove category"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={addCategory} className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-3 h-fit">
          <h3 className="text-sm font-semibold text-slate-900">Add Scrap Category</h3>
          <input
            required
            placeholder="Category name (e.g. Copper Scrap)"
            value={newCat.name}
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <input
            placeholder="Accepted items description"
            value={newCat.description}
            onChange={(e) => setNewCat({ ...newCat, description: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Rate (₹/kg)</label>
              <input
                type="number"
                required
                step={0.5}
                value={newCat.rate_per_kg}
                onChange={(e) => setNewCat({ ...newCat, rate_per_kg: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">CO₂ kg/kg</label>
              <input
                type="number"
                step={0.1}
                value={newCat.co2_factor_per_kg}
                onChange={(e) => setNewCat({ ...newCat, co2_factor_per_kg: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <button type="submit" className="w-full py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center justify-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
          </button>
        </form>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Rate Change History</h3>
          <div className="divide-y divide-slate-100 text-xs max-h-64 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-slate-500">No rate changes logged yet.</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-slate-900">{h.category_name}</span>{' '}
                    <span className="font-mono text-slate-600">
                      ₹{h.old_rate} → ₹{h.new_rate}/kg
                    </span>
                  </div>
                  <div className="font-mono text-slate-400">
                    {h.changed_by_name || 'Admin'} · {formatISTDateTime(h.changed_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminSlotsView({ onChanged }: { onChanged: () => Promise<void> }) {
  const [settings, setSettings] = useState<ScheduleSettings | null>(null);
  const [holidayInput, setHolidayInput] = useState('');
  const [newArea, setNewArea] = useState({ pincode: '', area: '', city: 'Bengaluru' });
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ settings: ScheduleSettings }>('/api/admin/settings').then((r) => setSettings(r.settings));
  }, []);

  if (!settings) return <SkeletonRows rows={4} />;

  const saveSettings = async (next: ScheduleSettings) => {
    const res = await apiFetch<{ settings: ScheduleSettings }>('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(next),
    });
    setSettings(res.settings);
    await onChanged();
    setMsg('Schedule & service zone settings saved.');
  };

  const dayLabels = [
    { d: 1, label: 'Mon' },
    { d: 2, label: 'Tue' },
    { d: 3, label: 'Wed' },
    { d: 4, label: 'Thu' },
    { d: 5, label: 'Fri' },
    { d: 6, label: 'Sat' },
    { d: 0, label: 'Sun' },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Operating Days (IST)</h3>
          <div className="flex flex-wrap gap-2">
            {dayLabels.map((item) => {
              const active = settings.operating_days.includes(item.d);
              return (
                <button
                  key={item.d}
                  type="button"
                  onClick={() => {
                    const nextDays = active
                      ? settings.operating_days.filter((x) => x !== item.d)
                      : [...settings.operating_days, item.d];
                    setSettings({ ...settings, operating_days: nextDays });
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    active ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Default Slot Capacity</label>
            <input
              type="number"
              min={1}
              value={settings.default_slot_capacity}
              onChange={(e) => setSettings({ ...settings, default_slot_capacity: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Commission %</label>
            <input
              type="number"
              step={0.5}
              value={settings.commission_percent}
              onChange={(e) => setSettings({ ...settings, commission_percent: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Auto-Assign Timeout (m)</label>
            <input
              type="number"
              min={5}
              value={settings.auto_assign_timeout_mins}
              onChange={(e) => setSettings({ ...settings, auto_assign_timeout_mins: Number(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Holidays (YYYY-MM-DD)</h3>
          <div className="flex gap-2 mb-2">
            <input
              type="date"
              value={holidayInput}
              onChange={(e) => setHolidayInput(e.target.value)}
              className="px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="button"
              onClick={() => {
                if (holidayInput && !settings.holidays.includes(holidayInput)) {
                  setSettings({ ...settings, holidays: [...settings.holidays, holidayInput] });
                  setHolidayInput('');
                }
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Add Holiday
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {settings.holidays.map((h) => (
              <span key={h} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded">
                {h}
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, holidays: settings.holidays.filter((x) => x !== h) })}
                  className="text-red-700"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Service Areas & Pincodes</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              placeholder="Pincode (560095)"
              value={newArea.pincode}
              onChange={(e) => setNewArea({ ...newArea, pincode: e.target.value })}
              className="px-3 py-1.5 text-sm font-mono border border-slate-300 rounded-lg w-36"
            />
            <input
              placeholder="Area name (Koramangala 8th Block)"
              value={newArea.area}
              onChange={(e) => setNewArea({ ...newArea, area: e.target.value })}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg flex-1 min-w-[200px]"
            />
            <button
              type="button"
              onClick={() => {
                if (/^\d{6}$/.test(newArea.pincode) && newArea.area.trim()) {
                  setSettings({
                    ...settings,
                    service_areas: [...settings.service_areas, { ...newArea, active: true }],
                  });
                  setNewArea({ pincode: '', area: '', city: 'Bengaluru' });
                }
              }}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Add Pincode
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {settings.service_areas.map((sa) => (
              <div key={sa.pincode} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                <span>
                  <strong className="font-mono">{sa.pincode}</strong> · {sa.area}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({
                      ...settings,
                      service_areas: settings.service_areas.map((x) =>
                        x.pincode === sa.pincode ? { ...x, active: !x.active } : x
                      ),
                    })
                  }
                  className={sa.active ? 'text-emerald-700 font-semibold' : 'text-slate-400'}
                >
                  {sa.active ? 'Active' : 'Paused'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {msg && <p className="text-xs font-medium text-emerald-700">{msg}</p>}
        <button
          type="button"
          onClick={() => saveSettings(settings)}
          className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
        >
          Save All Timing & Area Rules
        </button>
      </div>
    </div>
  );
}

function AdminPaymentsView() {
  const [data, setData] = useState<{
    payouts: Array<{
      id: number;
      code: string;
      pickup_date: string;
      area: string;
      household_name: string;
      collector_name: string;
      actual_total_weight: number;
      actual_total_amount: number;
      commission_amount: number;
      payment_method: string;
    }>;
    recyclerOrders: RecyclerOrder[];
    commissionPercent: number;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<typeof data>('/api/admin/payments');
    setData(res);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <SkeletonRows rows={4} />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          Active Platform Commission Rate: <strong className="font-mono text-slate-900">{data.commissionPercent}%</strong>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => downloadCsv(data.payouts, `ScrapEase-Payouts-${new Date().toISOString().slice(0, 10)}.csv`)}
            className="px-4 py-2 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 rounded-lg inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => downloadAdminPayoutsPdf(data.payouts)}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg inline-flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF Report</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">
          Completed Pickup Payout Ledger
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4">Code</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Household</th>
                <th className="py-2.5 px-4">Collector</th>
                <th className="py-2.5 px-4">Method</th>
                <th className="py-2.5 px-4 text-right">Weight</th>
                <th className="py-2.5 px-4 text-right">Payout</th>
                <th className="py-2.5 px-4 text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.payouts.map((p) => (
                <tr key={p.id}>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">{p.code}</td>
                  <td className="py-3 px-4 text-xs font-mono text-slate-600">{p.pickup_date}</td>
                  <td className="py-3 px-4 text-slate-700">{p.household_name}</td>
                  <td className="py-3 px-4 text-slate-700">{p.collector_name}</td>
                  <td className="py-3 px-4 font-mono text-xs">{p.payment_method}</td>
                  <td className="py-3 px-4 text-right font-mono">{Number(p.actual_total_weight).toFixed(1)} kg</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                    ₹{Number(p.actual_total_amount).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-emerald-700">
                    ₹{Number(p.commission_amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">
          Recycler Bulk Purchase Orders
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
              <tr>
                <th className="py-2.5 px-4">Order</th>
                <th className="py-2.5 px-4">Recycler</th>
                <th className="py-2.5 px-4">Material & Zone</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.recyclerOrders.map((o) => (
                <tr key={o.id}>
                  <td className="py-3 px-4 font-mono font-semibold">{o.code}</td>
                  <td className="py-3 px-4">{o.business_name || o.recycler_name}</td>
                  <td className="py-3 px-4 text-xs">
                    {o.category_name} · {o.weight_kg} kg ({o.area})
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold">
                    ₹{Number(o.total_amount).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-4"><StatusText status={o.status} /></td>
                  <td className="py-3 px-4 text-right">
                    <select
                      value={o.status}
                      onChange={async (e) => {
                        await apiFetch(`/api/admin/recycler-orders/${o.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: e.target.value }),
                        });
                        await load();
                      }}
                      className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      {['Requested', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'].map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminContentView({ onChanged }: { onChanged: () => Promise<void> }) {
  const [content, setContent] = useState<{
    faqs: FaqItem[];
    testimonials: TestimonialItem[];
    banners: SiteBanner[];
    contactMessages: ContactMessage[];
  } | null>(null);
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: 'General' });
  const [bannerForm, setBannerForm] = useState({ title: '', subtitle: '', cta_text: '' });
  const [replyText, setReplyText] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const res = await apiFetch<typeof content>('/api/admin/content');
    setContent(res);
    const hero = res?.banners.find((b) => b.key === 'hero');
    if (hero) setBannerForm({ title: hero.title, subtitle: hero.subtitle, cta_text: hero.cta_text });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!content) return <SkeletonRows rows={4} />;

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Homepage Hero Banner</h3>
        <input
          value={bannerForm.title}
          onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
        />
        <textarea
          rows={2}
          value={bannerForm.subtitle}
          onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
        />
        <div className="flex items-center gap-3">
          <input
            value={bannerForm.cta_text}
            onChange={(e) => setBannerForm({ ...bannerForm, cta_text: e.target.value })}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg w-56"
          />
          <button
            type="button"
            onClick={async () => {
              await apiFetch('/api/admin/banners/hero', { method: 'PATCH', body: JSON.stringify(bannerForm) });
              await load();
              await onChanged();
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
          >
            Update Hero Banner
          </button>
        </div>
      </div>

      {/* FAQs */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">FAQs ({content.faqs.length})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            placeholder="New question"
            value={faqForm.question}
            onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <input
            placeholder="Answer"
            value={faqForm.answer}
            onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
          <button
            type="button"
            onClick={async () => {
              await apiFetch('/api/admin/faqs', { method: 'POST', body: JSON.stringify(faqForm) });
              setFaqForm({ question: '', answer: '', category: 'General' });
              await load();
              await onChanged();
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
          >
            Add FAQ
          </button>
        </div>
        <div className="divide-y divide-slate-100 text-sm">
          {content.faqs.map((f) => (
            <div key={f.id} className="py-2.5 flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-slate-900">{f.question}</div>
                <div className="text-xs text-slate-600 mt-0.5">{f.answer}</div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/admin/faqs/${f.id}`, { method: 'DELETE' });
                  await load();
                  await onChanged();
                }}
                className="text-red-700 text-xs shrink-0"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Messages */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">Contact Inquiries ({content.contactMessages.length})</h3>
        {content.contactMessages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages submitted yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {content.contactMessages.map((m) => (
              <div key={m.id} className="py-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-900">
                    {m.subject} · <span className="font-normal text-slate-600">{m.name} ({m.email})</span>
                  </div>
                  <StatusText status={m.status} />
                </div>
                <p className="text-slate-700">{m.message}</p>
                {m.admin_reply ? (
                  <div className="text-xs bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg text-emerald-900">
                    Reply: {m.admin_reply}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      placeholder="Write admin reply..."
                      value={replyText[m.id] || ''}
                      onChange={(e) => setReplyText({ ...replyText, [m.id]: e.target.value })}
                      className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/contact-messages/${m.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ admin_reply: replyText[m.id], status: 'Replied' }),
                        });
                        await load();
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 rounded-lg"
                    >
                      Send Reply
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdminAuditView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ logs: AuditLog[] }>('/api/admin/audit-logs')
      .then((r) => setLogs(r.logs))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonRows rows={5} />;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
            <tr>
              <th className="py-3 px-4">Timestamp (IST)</th>
              <th className="py-3 px-4">Actor</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Entity</th>
              <th className="py-3 px-4">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">{formatISTDateTime(l.created_at)}</td>
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-900">{l.actor_email}</div>
                  <div className="text-slate-500 capitalize">{l.actor_role}</div>
                </td>
                <td className="py-3 px-4 font-mono font-semibold text-emerald-800">{l.action}</td>
                <td className="py-3 px-4 font-mono text-slate-700">
                  {l.entity_type} #{l.entity_id}
                </td>
                <td className="py-3 px-4 font-mono text-slate-600">{JSON.stringify(l.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
