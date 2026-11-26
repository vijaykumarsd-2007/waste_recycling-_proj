import { db } from './db.ts';
import {
  DEFAULT_SLOTS,
  getDayOfWeekIST,
  getNowIST,
  getSlotStartTimestampIST,
} from '../src/shared/scheduling.ts';
import type {
  Address,
  CollectorProfile,
  Pickup,
  PickupItem,
  PickupTimelineEntry,
  RecyclerProfile,
  Review,
  ScheduleSettings,
  User,
} from '../src/shared/types.ts';

export function validateDataImage(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const trimmed = input.trim();
  const match = trimmed.match(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/);
  if (!match) return null;
  if (trimmed.length > 2_800_000) return null; // ~2MB binary cap
  return trimmed;
}

export function sanitizeImageList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const clean: string[] = [];
  for (const item of list.slice(0, 4)) {
    const valid = validateDataImage(item);
    if (valid) clean.push(valid);
  }
  return clean;
}

export function getScheduleSettings(): ScheduleSettings {
  const row = db.prepare('SELECT * FROM schedule_settings WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) {
    return {
      id: 1,
      operating_days: [1, 2, 3, 4, 5, 6],
      start_hour: 8,
      end_hour: 20,
      slots: DEFAULT_SLOTS,
      default_slot_capacity: 10,
      holidays: [],
      service_areas: [],
      commission_percent: 5,
      auto_assign_timeout_mins: 15,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    id: Number(row.id),
    operating_days: JSON.parse(String(row.operating_days || '[1,2,3,4,5,6]')),
    start_hour: Number(row.start_hour ?? 8),
    end_hour: Number(row.end_hour ?? 20),
    slots: JSON.parse(String(row.slots || '[]')),
    default_slot_capacity: Number(row.default_slot_capacity ?? 10),
    holidays: JSON.parse(String(row.holidays || '[]')),
    service_areas: JSON.parse(String(row.service_areas || '[]')),
    commission_percent: Number(row.commission_percent ?? 5),
    auto_assign_timeout_mins: Number(row.auto_assign_timeout_mins ?? 15),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

export function hydrateUser(userId: number): User | null {
  const u = db
    .prepare('SELECT id, role, name, email, phone, status, created_at, updated_at FROM users WHERE id = ?')
    .get(userId) as Record<string, unknown> | undefined;
  if (!u) return null;

  const addressesRaw = db
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC')
    .all(userId) as Array<Record<string, unknown>>;

  const addresses: Address[] = addressesRaw.map((a) => ({
    id: Number(a.id),
    user_id: Number(a.user_id),
    label: String(a.label),
    line1: String(a.line1),
    line2: String(a.line2 || ''),
    area: String(a.area),
    city: String(a.city),
    pincode: String(a.pincode),
    is_default: Boolean(a.is_default),
    created_at: String(a.created_at),
  }));

  let collector_profile: CollectorProfile | null = null;
  if (u.role === 'collector') {
    const cp = db.prepare('SELECT * FROM collector_profiles WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
    if (cp) {
      collector_profile = {
        user_id: Number(cp.user_id),
        kyc_status: cp.kyc_status as CollectorProfile['kyc_status'],
        kyc_doc_type: String(cp.kyc_doc_type || 'Aadhaar'),
        kyc_doc_number: String(cp.kyc_doc_number || ''),
        kyc_doc_image: cp.kyc_doc_image ? String(cp.kyc_doc_image) : null,
        vehicle_type: String(cp.vehicle_type || ''),
        vehicle_number: String(cp.vehicle_number || ''),
        service_pincodes: JSON.parse(String(cp.service_pincodes || '[]')),
        working_days: JSON.parse(String(cp.working_days || '[1,2,3,4,5,6]')),
        working_start: String(cp.working_start || '08:00'),
        working_end: String(cp.working_end || '20:00'),
        is_online: Boolean(cp.is_online),
        rating_avg: Number(cp.rating_avg ?? 5.0),
        rating_count: Number(cp.rating_count ?? 0),
        total_pickups: Number(cp.total_pickups ?? 0),
        total_earnings: Number(cp.total_earnings ?? 0),
      };
    }
  }

  let recycler_profile: RecyclerProfile | null = null;
  if (u.role === 'recycler') {
    const rp = db.prepare('SELECT * FROM recycler_profiles WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
    if (rp) {
      recycler_profile = {
        user_id: Number(rp.user_id),
        business_name: String(rp.business_name),
        gst_number: String(rp.gst_number || ''),
        kyc_status: rp.kyc_status as RecyclerProfile['kyc_status'],
        kyc_doc_image: rp.kyc_doc_image ? String(rp.kyc_doc_image) : null,
        city: String(rp.city || 'Bengaluru'),
        service_pincodes: JSON.parse(String(rp.service_pincodes || '[]')),
        accepted_categories: JSON.parse(String(rp.accepted_categories || '[]')),
        buying_rates: JSON.parse(String(rp.buying_rates || '{}')),
        created_at: String(rp.created_at),
      };
    }
  }

  return {
    id: Number(u.id),
    role: u.role as User['role'],
    name: String(u.name),
    email: String(u.email),
    phone: String(u.phone),
    status: u.status as User['status'],
    created_at: String(u.created_at),
    updated_at: String(u.updated_at),
    addresses,
    collector_profile,
    recycler_profile,
  };
}

export function hydratePickupRow(row: Record<string, unknown>): Pickup {
  const id = Number(row.id);

  const itemsRaw = db.prepare('SELECT * FROM pickup_items WHERE pickup_id = ? ORDER BY id ASC').all(id) as Array<Record<string, unknown>>;
  const items: PickupItem[] = itemsRaw.map((it) => ({
    id: Number(it.id),
    pickup_id: Number(it.pickup_id),
    category_id: Number(it.category_id),
    category_name: String(it.category_name),
    est_weight: Number(it.est_weight),
    actual_weight: it.actual_weight === null || it.actual_weight === undefined ? null : Number(it.actual_weight),
    rate_per_kg: Number(it.rate_per_kg),
    amount: Number(it.amount),
  }));

  const timelineRaw = db
    .prepare(`
      SELECT t.*, u.name as actor_name
      FROM pickup_timeline t
      LEFT JOIN users u ON u.id = t.actor_id
      WHERE t.pickup_id = ?
      ORDER BY t.id ASC
    `)
    .all(id) as Array<Record<string, unknown>>;
  const timeline: PickupTimelineEntry[] = timelineRaw.map((t) => ({
    id: Number(t.id),
    pickup_id: Number(t.pickup_id),
    status: String(t.status),
    note: String(t.note || ''),
    actor_id: t.actor_id === null ? null : Number(t.actor_id),
    actor_role: String(t.actor_role),
    actor_name: t.actor_name ? String(t.actor_name) : undefined,
    created_at: String(t.created_at),
  }));

  const revRaw = db
    .prepare(`
      SELECT r.*, u.name as household_name
      FROM reviews r
      LEFT JOIN users u ON u.id = r.household_id
      WHERE r.pickup_id = ?
    `)
    .get(id) as Record<string, unknown> | undefined;

  const review: Review | null = revRaw
    ? {
        id: Number(revRaw.id),
        pickup_id: Number(revRaw.pickup_id),
        household_id: Number(revRaw.household_id),
        collector_id: Number(revRaw.collector_id),
        rating: Number(revRaw.rating),
        comment: String(revRaw.comment || ''),
        created_at: String(revRaw.created_at),
        household_name: revRaw.household_name ? String(revRaw.household_name) : undefined,
      }
    : null;

  return {
    id,
    code: String(row.code),
    household_id: Number(row.household_id),
    household_name: row.household_name ? String(row.household_name) : undefined,
    household_email: row.household_email ? String(row.household_email) : undefined,
    household_phone: row.household_phone ? String(row.household_phone) : undefined,
    collector_id: row.collector_id === null ? null : Number(row.collector_id),
    collector_name: row.collector_name ? String(row.collector_name) : null,
    collector_phone: row.collector_phone ? String(row.collector_phone) : null,
    collector_rating: row.collector_rating === null || row.collector_rating === undefined ? null : Number(row.collector_rating),
    address_id: row.address_id === null ? null : Number(row.address_id),
    address_snapshot: JSON.parse(String(row.address_snapshot)),
    pincode: String(row.pincode),
    area: String(row.area),
    pickup_date: String(row.pickup_date),
    slot_id: String(row.slot_id),
    slot_label: String(row.slot_label),
    status: row.status as Pickup['status'],
    est_total_weight: Number(row.est_total_weight),
    est_total_amount: Number(row.est_total_amount),
    actual_total_weight: row.actual_total_weight === null ? null : Number(row.actual_total_weight),
    actual_total_amount: row.actual_total_amount === null ? null : Number(row.actual_total_amount),
    commission_rate: Number(row.commission_rate ?? 5),
    commission_amount: Number(row.commission_amount ?? 0),
    payment_method: (row.payment_method as Pickup['payment_method']) || null,
    payment_status: (row.payment_status as Pickup['payment_status']) || 'Pending',
    late_flag: Boolean(row.late_flag),
    manual_queue: Boolean(row.manual_queue),
    notes: String(row.notes || ''),
    photos: JSON.parse(String(row.photos || '[]')),
    assigned_at: row.assigned_at ? String(row.assigned_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    items,
    timeline,
    review,
  };
}

export function getPickupById(id: number): Pickup | null {
  const row = db
    .prepare(`
      SELECT p.*,
             h.name as household_name, h.email as household_email, h.phone as household_phone,
             c.name as collector_name, c.phone as collector_phone,
             cp.rating_avg as collector_rating
      FROM pickups p
      LEFT JOIN users h ON h.id = p.household_id
      LEFT JOIN users c ON c.id = p.collector_id
      LEFT JOIN collector_profiles cp ON cp.user_id = p.collector_id
      WHERE p.id = ?
    `)
    .get(id) as Record<string, unknown> | undefined;
  return row ? hydratePickupRow(row) : null;
}

export function createNotification(params: {
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string;
}): void {
  const user = db.prepare('SELECT email, phone FROM users WHERE id = ?').get(params.userId) as
    | { email: string; phone: string }
    | undefined;
  const smsPayload = user
    ? JSON.stringify({ to: user.phone, channel: 'sms', text: `${params.title}: ${params.message}` })
    : null;
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, link, is_read, email_sent, sms_ready_payload)
    VALUES (?, ?, ?, ?, ?, 0, 1, ?)
  `).run(params.userId, params.type, params.title, params.message, params.link || '', smsPayload);
}

export function recordAudit(params: {
  actorId?: number | null;
  actorEmail?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
}): void {
  db.prepare(`
    INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.actorId ?? null,
    params.actorEmail ?? 'system',
    params.actorRole ?? 'system',
    params.action,
    params.entityType,
    String(params.entityId ?? ''),
    JSON.stringify(params.details ?? {})
  );
}

export function findBestCollectorForPickup(params: {
  pincode: string;
  pickupDate: string;
  slotId: string;
  excludeCollectorIds?: number[];
}): { user_id: number; name: string } | null {
  const settings = getScheduleSettings();
  const slot = settings.slots.find((s) => s.id === params.slotId);
  const dow = getDayOfWeekIST(params.pickupDate);

  const candidates = db
    .prepare(`
      SELECT u.id as user_id, u.name, cp.service_pincodes, cp.working_days,
             cp.working_start, cp.working_end, cp.rating_avg,
             (
               SELECT COUNT(*) FROM pickups p2
               WHERE p2.collector_id = u.id
                 AND p2.pickup_date = ?
                 AND p2.slot_id = ?
                 AND p2.status IN ('Assigned','En Route','Picked Up')
             ) as slot_load
      FROM users u
      JOIN collector_profiles cp ON cp.user_id = u.id
      WHERE u.role = 'collector'
        AND u.status = 'active'
        AND cp.kyc_status = 'approved'
        AND cp.is_online = 1
    `)
    .all(params.pickupDate, params.slotId) as Array<Record<string, unknown>>;

  const excluded = new Set(params.excludeCollectorIds || []);

  const eligible = candidates
    .filter((c) => {
      if (excluded.has(Number(c.user_id))) return false;
      const pincodes: string[] = JSON.parse(String(c.service_pincodes || '[]'));
      if (!pincodes.includes(params.pincode)) return false;
      const workingDays: number[] = JSON.parse(String(c.working_days || '[1,2,3,4,5,6]'));
      if (!workingDays.includes(dow)) return false;
      if (slot) {
        const startH = Number(String(c.working_start || '08:00').split(':')[0]);
        const endH = Number(String(c.working_end || '20:00').split(':')[0]);
        if (slot.startHour < startH || slot.endHour > endH) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const loadDiff = Number(a.slot_load) - Number(b.slot_load);
      if (loadDiff !== 0) return loadDiff;
      return Number(b.rating_avg) - Number(a.rating_avg);
    });

  if (eligible.length === 0) return null;
  return { user_id: Number(eligible[0].user_id), name: String(eligible[0].name) };
}

export function runBackgroundLogisticsSweep(): void {
  try {
    const settings = getScheduleSettings();
    const timeoutMins = settings.auto_assign_timeout_mins || 15;
    const now = new Date();
    const nowIST = getNowIST(now);

    // 1. Move unaccepted/stale Requested or unconfirmed Assigned pickups older than 15 mins to manual admin queue
    const pendingPickups = db
      .prepare(`
        SELECT id, code, status, collector_id, assigned_at, created_at, pincode, area
        FROM pickups
        WHERE status IN ('Requested', 'Assigned')
          AND manual_queue = 0
      `)
      .all() as Array<Record<string, unknown>>;

    for (const p of pendingPickups) {
      // Only move Requested pickups waiting >15 mins to manual queue (Assigned ones that have no collector or stale requested)
      const refTime = p.status === 'Requested' ? String(p.created_at) : null;
      if (!refTime) continue;
      const elapsedMins = (now.getTime() - new Date(refTime).getTime()) / 60000;
      if (elapsedMins >= timeoutMins) {
        db.prepare('UPDATE pickups SET manual_queue = 1, updated_at = ? WHERE id = ?').run(now.toISOString(), p.id);
        db.prepare(`
          INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
          VALUES (?, 'Requested', 'Escalated to manual admin assignment queue after 15-minute window.', NULL, 'system', ?)
        `).run(p.id, now.toISOString());

        const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all() as Array<{ id: number }>;
        for (const a of admins) {
          createNotification({
            userId: a.id,
            type: 'manual_queue',
            title: `Manual assignment needed: ${String(p.code)}`,
            message: `Pickup in ${String(p.area)} (${String(p.pincode)}) has been waiting over ${timeoutMins} minutes.`,
            link: '/admin/pickups',
          });
        }
      }
    }

    // 2. Dispatch 24-hour and 1-hour reminders for upcoming pickups
    const upcoming = db
      .prepare(`
        SELECT id, code, household_id, collector_id, pickup_date, slot_id, slot_label, area,
               reminder_24h_sent, reminder_1h_sent
        FROM pickups
        WHERE status IN ('Requested', 'Assigned', 'Rescheduled')
          AND (reminder_24h_sent = 0 OR reminder_1h_sent = 0)
      `)
      .all() as Array<Record<string, unknown>>;

    for (const p of upcoming) {
      const slot = settings.slots.find((s) => s.id === String(p.slot_id));
      if (!slot) continue;
      const slotStartMs = getSlotStartTimestampIST(String(p.pickup_date), slot.startHour);
      const minsUntil = (slotStartMs - nowIST.timestampMs) / 60000;

      if (minsUntil > 60 && minsUntil <= 24 * 60 && !p.reminder_24h_sent) {
        db.prepare('UPDATE pickups SET reminder_24h_sent = 1 WHERE id = ?').run(p.id);
        createNotification({
          userId: Number(p.household_id),
          type: 'reminder_24h',
          title: `Pickup reminder: ${String(p.code)} tomorrow`,
          message: `Your scrap pickup in ${String(p.area)} is scheduled for ${String(p.pickup_date)} (${String(p.slot_label)}).`,
          link: `/dashboard/pickups/${p.id}`,
        });
      }

      if (minsUntil > 0 && minsUntil <= 60 && !p.reminder_1h_sent) {
        db.prepare('UPDATE pickups SET reminder_1h_sent = 1 WHERE id = ?').run(p.id);
        createNotification({
          userId: Number(p.household_id),
          type: 'reminder_1h',
          title: `Collector arriving soon: ${String(p.code)}`,
          message: `Your pickup window (${String(p.slot_label)}) starts within 1 hour. Please keep scrap ready.`,
          link: `/dashboard/pickups/${p.id}`,
        });
        if (p.collector_id) {
          createNotification({
            userId: Number(p.collector_id),
            type: 'reminder_1h',
            title: `Upcoming slot in 1h: ${String(p.code)}`,
            message: `Slot ${String(p.slot_label)} in ${String(p.area)} starts within 1 hour.`,
            link: '/collector/active',
          });
        }
      }
    }
  } catch (err) {
    console.error('Background sweep error:', err);
  }
}
