import express from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, ensureAdminSecurityState } from './db.ts';
import { verifyGoogleFirebaseIdToken } from './firebaseAuth.ts';
import {
  clearAuthCookie,
  extractToken,
  requireAuth,
  requireRole,
  setAuthCookie,
  signAuthToken,
  verifyAuthToken,
  type AuthedRequest,
} from './auth.ts';
import {
  createNotification,
  findBestCollectorForPickup,
  getPickupById,
  getScheduleSettings,
  hydratePickupRow,
  hydrateUser,
  recordAudit,
  sanitizeImageList,
  validateDataImage,
} from './services.ts';
import {
  fetchAllBookingsFromSupabase,
  syncContactToSupabase,
  syncPickupBookingToSupabase,
  syncPickupStatusToSupabase,
} from './supabase.ts';
import {
  evaluateModifyPenalty,
  evaluateSlotAvailability,
  getNowIST,
} from '../src/shared/scheduling.ts';
import type { PickupStatus, UserRole } from '../src/shared/types.ts';

export const apiRouter = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[6-9]\d{9}$/;
const PINCODE_RE = /^\d{6}$/;

function cleanPhone(raw: unknown): string {
  return String(raw || '').replace(/[\s\-+()]/g, '').replace(/^91(?=\d{10}$)/, '');
}

// ---------------------------------------------------------------------------
// PUBLIC ROUTES
// ---------------------------------------------------------------------------

apiRouter.get('/public/bootstrap', (_req, res) => {
  const categories = db
    .prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY id ASC')
    .all() as Array<Record<string, unknown>>;

  const settings = getScheduleSettings();
  const faqs = db.prepare('SELECT * FROM faqs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
  const testimonials = db.prepare('SELECT * FROM testimonials WHERE is_active = 1 ORDER BY id ASC').all();
  const banners = db.prepare('SELECT * FROM site_banners WHERE is_active = 1').all();

  const statsRow = db
    .prepare(`
      SELECT
        COUNT(*) as completed_pickups,
        COALESCE(SUM(actual_total_weight), 0) as total_kg,
        COALESCE(SUM(actual_total_amount), 0) as total_payout
      FROM pickups
      WHERE status = 'Completed'
    `)
    .get() as { completed_pickups: number; total_kg: number; total_payout: number };

  const co2Row = db
    .prepare(`
      SELECT COALESCE(SUM(pi.actual_weight * c.co2_factor_per_kg), 0) as total_co2
      FROM pickup_items pi
      JOIN pickups p ON p.id = pi.pickup_id
      JOIN categories c ON c.id = pi.category_id
      WHERE p.status = 'Completed' AND pi.actual_weight IS NOT NULL
    `)
    .get() as { total_co2: number };

  const activeCollectors = (
    db
      .prepare(`
        SELECT COUNT(*) as c FROM collector_profiles cp
        JOIN users u ON u.id = cp.user_id
        WHERE u.status = 'active' AND cp.kyc_status = 'approved'
      `)
      .get() as { c: number }
  ).c;

  const latestRateUpdate = (
    db.prepare('SELECT MAX(updated_at) as latest FROM categories').get() as { latest: string | null }
  ).latest;

  res.json({
    categories: categories.map((c) => ({ ...c, is_active: Boolean(c.is_active) })),
    settings,
    faqs,
    testimonials,
    banners,
    latestRateUpdate,
    impact: {
      completedPickups: Number(statsRow.completed_pickups) + 1420, // baseline community volume + live DB
      totalKgRecycled: Math.round((Number(statsRow.total_kg) + 38450) * 10) / 10,
      liveDbKgRecycled: Math.round(Number(statsRow.total_kg) * 10) / 10,
      totalPayoutInr: Math.round(Number(statsRow.total_payout)),
      co2SavedKg: Math.round((Number(co2Row.total_co2) + 84590) * 10) / 10,
      treesEquivalent: Math.round((Number(co2Row.total_co2) + 84590) / 21),
      activeCollectors,
      serviceAreasCount: settings.service_areas.filter((a) => a.active).length,
    },
  });
});

apiRouter.get('/public/slots', (req, res) => {
  const dateStr = String(req.query.date || '').trim();
  const pincode = String(req.query.pincode || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
    return;
  }

  const settings = getScheduleSettings();
  const matchedArea = pincode
    ? settings.service_areas.find((a) => a.pincode === pincode && a.active)
    : undefined;

  const countsRaw = db
    .prepare(`
      SELECT slot_id, COUNT(*) as cnt
      FROM pickups
      WHERE pickup_date = ?
        AND (? = '' OR pincode = ?)
        AND status NOT IN ('Cancelled')
      GROUP BY slot_id
    `)
    .all(dateStr, pincode, pincode) as Array<{ slot_id: string; cnt: number }>;

  const countMap: Record<string, number> = {};
  for (const row of countsRaw) {
    countMap[row.slot_id] = Number(row.cnt);
  }

  const slots = settings.slots.map((slot) =>
    evaluateSlotAvailability({
      dateStr,
      slot,
      settings,
      bookedCount: countMap[slot.id] || 0,
    })
  );

  res.json({
    date: dateStr,
    pincode: pincode || null,
    isServiceable: pincode ? Boolean(matchedArea) : true,
    areaName: matchedArea ? matchedArea.area : null,
    city: matchedArea ? matchedArea.city : 'Bengaluru',
    slots,
  });
});

apiRouter.post('/public/contact', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = cleanPhone(req.body?.phone);
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();

  if (name.length < 2 || !EMAIL_RE.test(email) || subject.length < 3 || message.length < 10) {
    res.status(400).json({ error: 'Please complete all required fields with valid contact details.' });
    return;
  }

  const id = Number(
    db
      .prepare(
        `INSERT INTO contact_messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)`
      )
      .run(name, email, phone, subject, message).lastInsertRowid
  );

  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`).all() as Array<{ id: number }>;
  for (const admin of admins) {
    createNotification({
      userId: admin.id,
      type: 'contact_message',
      title: `New inquiry from ${name}`,
      message: subject,
      link: '/admin/content',
    });
  }

  await syncContactToSupabase({ name, email, phone, subject, message });

  res.status(201).json({ id, message: 'Thank you. Our Bengaluru support team will reply within 24 hours.' });
});

apiRouter.post('/public/book', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = cleanPhone(req.body?.phone);

  if (name.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (!PHONE_RE.test(phone)) {
    res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
    return;
  }

  const settings = getScheduleSettings();
  const addrInput = req.body?.address || {};
  const pincode = String(addrInput.pincode || '').trim();
  const line1 = String(addrInput.line1 || '').trim();
  const line2 = String(addrInput.line2 || '').trim();
  const areaInput = String(addrInput.area || '').trim();
  const city = String(addrInput.city || 'Bengaluru').trim();

  if (line1.length < 4 || !PINCODE_RE.test(pincode)) {
    res.status(400).json({ error: 'Valid street address and 6-digit pincode are required.' });
    return;
  }

  const serviceArea = settings.service_areas.find((a) => a.pincode === pincode && a.active);
  if (!serviceArea) {
    res.status(400).json({ error: `Pincode ${pincode} is currently outside our active service zones.` });
    return;
  }
  const area = areaInput || serviceArea.area;
  const addrSnapshot = {
    label: String(addrInput.label || 'Home').trim(),
    line1,
    line2,
    area,
    city,
    pincode,
  };

  const pickupDate = String(req.body?.pickup_date || '').trim();
  const slotId = String(req.body?.slot_id || '').trim();
  const slot = settings.slots.find((s) => s.id === slotId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || !slot) {
    res.status(400).json({ error: 'Valid pickup date and 2-hour time slot are required.' });
    return;
  }

  const bookedCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM pickups WHERE pickup_date = ? AND slot_id = ? AND pincode = ? AND status NOT IN ('Cancelled')`)
      .get(pickupDate, slotId, pincode) as { cnt: number }
  ).cnt;

  const slotEval = evaluateSlotAvailability({
    dateStr: pickupDate,
    slot,
    settings,
    bookedCount: Number(bookedCount),
  });
  if (!slotEval.available) {
    res.status(400).json({ error: `Selected slot is unavailable: ${slotEval.reason}` });
    return;
  }

  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (rawItems.length === 0) {
    res.status(400).json({ error: 'Select at least one scrap category with estimated weight.' });
    return;
  }

  const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1').all() as Array<Record<string, unknown>>;
  const catMap = new Map(categories.map((c) => [Number(c.id), c]));

  const validatedItems: Array<{ category_id: number; category_name: string; est_weight: number; rate_per_kg: number; amount: number }> = [];
  for (const item of rawItems) {
    const catId = Number(item.category_id);
    const estWeight = Number(item.est_weight);
    const cat = catMap.get(catId);
    if (!cat || !Number.isFinite(estWeight) || estWeight <= 0 || estWeight > 5000) {
      res.status(400).json({ error: 'Each selected item must have a valid category and positive weight (kg).' });
      return;
    }
    const rate = Number(cat.rate_per_kg);
    validatedItems.push({
      category_id: catId,
      category_name: String(cat.name),
      est_weight: Math.round(estWeight * 100) / 100,
      rate_per_kg: rate,
      amount: Math.round(estWeight * rate * 100) / 100,
    });
  }

  const estTotalWeight = Math.round(validatedItems.reduce((s, i) => s + i.est_weight, 0) * 100) / 100;
  const estTotalAmount = Math.round(validatedItems.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const notes = String(req.body?.notes || '').trim().slice(0, 600);
  const photos = sanitizeImageList(req.body?.photos);

  const assignedCollector = findBestCollectorForPickup({
    pincode,
    pickupDate,
    slotId,
  });

  const initialStatus: PickupStatus = assignedCollector ? 'Assigned' : 'Requested';
  const nowIso = new Date().toISOString();
  const code = `SE-${getNowIST().year}-${Math.floor(1000 + Math.random() * 9000)}`;

  const pickupId = db.transaction(() => {
    let existingUser = db.prepare('SELECT id, phone FROM users WHERE email = ?').get(email) as
      | { id: number; phone: string }
      | undefined;
    let householdId: number;
    if (existingUser) {
      householdId = existingUser.id;
      if (!existingUser.phone && phone) {
        db.prepare(`UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?`).run(phone, householdId);
      }
    } else {
      const guestHash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
      householdId = Number(
        db
          .prepare(`INSERT INTO users (role, name, email, phone, password_hash, status) VALUES ('household', ?, ?, ?, ?, 'active')`)
          .run(name, email, phone, guestHash).lastInsertRowid
      );
    }

    const addressId = Number(
      db
        .prepare(
          `INSERT INTO addresses (user_id, label, line1, line2, area, city, pincode, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
        )
        .run(householdId, addrSnapshot.label, addrSnapshot.line1, addrSnapshot.line2, addrSnapshot.area, addrSnapshot.city, addrSnapshot.pincode)
        .lastInsertRowid
    );

    const pid = Number(
      db
        .prepare(`
          INSERT INTO pickups (
            code, household_id, collector_id, address_id, address_snapshot, pincode, area,
            pickup_date, slot_id, slot_label, status, est_total_weight, est_total_amount,
            commission_rate, notes, photos, assigned_at, manual_queue, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `)
        .run(
          code,
          householdId,
          assignedCollector ? assignedCollector.user_id : null,
          addressId,
          JSON.stringify(addrSnapshot),
          pincode,
          area,
          pickupDate,
          slot.id,
          slot.label,
          initialStatus,
          estTotalWeight,
          estTotalAmount,
          settings.commission_percent,
          notes,
          JSON.stringify(photos),
          assignedCollector ? nowIso : null,
          nowIso,
          nowIso
        ).lastInsertRowid
    );

    const insItem = db.prepare(`
      INSERT INTO pickup_items (pickup_id, category_id, category_name, est_weight, actual_weight, rate_per_kg, amount)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `);
    for (const item of validatedItems) {
      insItem.run(pid, item.category_id, item.category_name, item.est_weight, item.rate_per_kg, item.amount);
    }

    db.prepare(`
      INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
      VALUES (?, 'Requested', ?, ?, 'household', ?)
    `).run(pid, `Appointment booked via web form for ${pickupDate} (${slot.label}).`, householdId, nowIso);

    if (assignedCollector) {
      db.prepare(`
        INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
        VALUES (?, 'Assigned', ?, NULL, 'system', ?)
      `).run(pid, `Auto-assigned to ${assignedCollector.name} in ${area} (${pincode}).`, nowIso);
    }

    return pid;
  })();

  if (assignedCollector) {
    createNotification({
      userId: assignedCollector.user_id,
      type: 'new_assignment',
      title: `New pickup assigned: ${code}`,
      message: `~${estTotalWeight} kg in ${area} (${pincode}) for ${pickupDate} (${slot.label}).`,
      link: '/collector/requests',
    });
  } else {
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as Array<{ id: number }>;
    for (const a of admins) {
      createNotification({
        userId: a.id,
        type: 'unassigned_pickup',
        title: `New appointment ${code} awaits collector`,
        message: `${name} in ${area} (${pincode}) booked ${pickupDate} (${slot.label}).`,
        link: '/admin/pickups',
      });
    }
  }

  const supaResult = await syncPickupBookingToSupabase({
    pickup_code: code,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    address_line1: addrSnapshot.line1,
    address_line2: addrSnapshot.line2,
    area: addrSnapshot.area,
    city: addrSnapshot.city,
    pincode: addrSnapshot.pincode,
    pickup_date: pickupDate,
    slot_id: slot.id,
    slot_label: slot.label,
    items: validatedItems,
    est_total_weight: estTotalWeight,
    est_total_amount: estTotalAmount,
    status: initialStatus,
    assigned_collector_name: assignedCollector ? assignedCollector.name : null,
    notes,
  });

  res.status(201).json({
    pickup: getPickupById(pickupId),
    supabaseSynced: supaResult.synced,
    supabaseReason: supaResult.reason,
  });
});

// ---------------------------------------------------------------------------
// AUTH ROUTES
// ---------------------------------------------------------------------------

apiRouter.post('/auth/register', (req, res) => {
  const roleRaw = String(req.body?.role || 'household').trim() as UserRole;
  if (!['household', 'collector', 'recycler'].includes(roleRaw)) {
    res.status(400).json({ error: 'Invalid registration role selected.' });
    return;
  }

  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = cleanPhone(req.body?.phone);
  const password = String(req.body?.password || '');

  if (name.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (!PHONE_RE.test(phone)) {
    res.status(400).json({ error: 'Please provide a valid 10-digit Indian mobile number.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    const userId = Number(
      db
        .prepare(`INSERT INTO users (role, name, email, phone, password_hash, status) VALUES (?, ?, ?, ?, ?, 'active')`)
        .run(roleRaw, name, email, phone, passwordHash).lastInsertRowid
    );

    if (roleRaw === 'household') {
      const pincode = String(req.body?.pincode || '560038').trim();
      const area = String(req.body?.area || 'Indiranagar').trim();
      const line1 = String(req.body?.line1 || '').trim();
      if (line1 && PINCODE_RE.test(pincode)) {
        db.prepare(`
          INSERT INTO addresses (user_id, label, line1, line2, area, city, pincode, is_default)
          VALUES (?, 'Home', ?, '', ?, 'Bengaluru', ?, 1)
        `).run(userId, line1, area, pincode);
      }
    } else if (roleRaw === 'collector') {
      const kycDocType = String(req.body?.kyc_doc_type || 'Aadhaar').trim();
      const kycDocNumber = String(req.body?.kyc_doc_number || '').trim();
      const vehicleType = String(req.body?.vehicle_type || 'Electric Cargo Trike').trim();
      const vehicleNumber = String(req.body?.vehicle_number || '').trim();
      const kycDocImage = validateDataImage(req.body?.kyc_doc_image);
      const pincodesRaw = Array.isArray(req.body?.service_pincodes)
        ? req.body.service_pincodes.map((p: unknown) => String(p).trim()).filter((p: string) => PINCODE_RE.test(p))
        : ['560038'];

      db.prepare(`
        INSERT INTO collector_profiles (
          user_id, kyc_status, kyc_doc_type, kyc_doc_number, kyc_doc_image,
          vehicle_type, vehicle_number, service_pincodes, working_days, is_online
        ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, '[1,2,3,4,5,6]', 0)
      `).run(
        userId,
        kycDocType,
        kycDocNumber,
        kycDocImage,
        vehicleType,
        vehicleNumber,
        JSON.stringify(pincodesRaw.length ? pincodesRaw : ['560038'])
      );

      const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as Array<{ id: number }>;
      for (const a of admins) {
        createNotification({
          userId: a.id,
          type: 'kyc_pending',
          title: `New collector KYC: ${name}`,
          message: `${vehicleType} (${vehicleNumber || 'Pending plate'}) awaiting KYC approval.`,
          link: '/admin/users',
        });
      }
    } else if (roleRaw === 'recycler') {
      const businessName = String(req.body?.business_name || `${name} Recycling`).trim();
      const gstNumber = String(req.body?.gst_number || '').trim().toUpperCase();
      const city = String(req.body?.city || 'Bengaluru').trim();
      const kycDocImage = validateDataImage(req.body?.kyc_doc_image);
      const acceptedCategories = Array.isArray(req.body?.accepted_categories)
        ? req.body.accepted_categories.map(Number).filter((n: number) => Number.isFinite(n))
        : [];
      const buyingRates = typeof req.body?.buying_rates === 'object' && req.body.buying_rates !== null ? req.body.buying_rates : {};

      db.prepare(`
        INSERT INTO recycler_profiles (
          user_id, business_name, gst_number, kyc_status, kyc_doc_image, city,
          service_pincodes, accepted_categories, buying_rates
        ) VALUES (?, ?, ?, 'pending', ?, ?, '["560038","560034","560011"]', ?, ?)
      `).run(
        userId,
        businessName,
        gstNumber,
        kycDocImage,
        city,
        JSON.stringify(acceptedCategories),
        JSON.stringify(buyingRates)
      );

      const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as Array<{ id: number }>;
      for (const a of admins) {
        createNotification({
          userId: a.id,
          type: 'kyc_pending',
          title: `New recycler KYC: ${businessName}`,
          message: `Business registration in ${city} awaiting admin verification.`,
          link: '/admin/users',
        });
      }
    }

    recordAudit({
      actorId: userId,
      actorEmail: email,
      actorRole: roleRaw,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: userId,
      details: { role: roleRaw },
    });

    return userId;
  });

  const userId = tx();
  const token = signAuthToken({ userId, role: roleRaw, email });
  setAuthCookie(req, res, token);
  const user = hydrateUser(userId);
  res.status(201).json({ token, user });
});

function timingSafePasscodeMatch(input: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const PORTAL_LABELS: Record<'household' | 'collector' | 'recycler', string> = {
  household: 'Household',
  collector: 'Collector Partner',
  recycler: 'Recycler Business',
};

function handleRolePortalLogin(req: express.Request, res: express.Response, portalRaw: string): void {
  const portal = portalRaw.trim().toLowerCase();
  if (portal !== 'household' && portal !== 'collector' && portal !== 'recycler') {
    res.status(400).json({
      error: 'Please select a valid role login portal (Household, Collector, or Recycler).',
    });
    return;
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!EMAIL_RE.test(email) || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const row = db.prepare('SELECT id, role, email, password_hash, status FROM users WHERE email = ?').get(email) as
    | { id: number; role: UserRole; email: string; password_hash: string; status: string }
    | undefined;

  if (row && row.role === 'admin') {
    res.status(403).json({
      error: 'Administrator sign-in is disabled here. Please use the restricted Admin Portal.',
    });
    return;
  }

  if (!row || !row.password_hash || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (row.role !== portal) {
    const accountLabel =
      row.role === 'household' ? 'Household' : row.role === 'collector' ? 'Collector' : 'Recycler';
    res.status(403).json({
      error: `Access restricted: ${accountLabel} accounts cannot sign in through the ${PORTAL_LABELS[portal]} Portal.`,
    });
    return;
  }

  if (row.status === 'blocked') {
    res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    return;
  }

  const token = signAuthToken({ userId: row.id, role: row.role, email: row.email });
  setAuthCookie(req, res, token);
  const user = hydrateUser(row.id);
  res.json({ token, user });
}

apiRouter.post('/auth/login/:portal', (req, res) => {
  handleRolePortalLogin(req, res, String(req.params.portal || ''));
});

apiRouter.post('/auth/login', (req, res) => {
  handleRolePortalLogin(req, res, String(req.body?.portal || ''));
});

apiRouter.post('/auth/google-household', async (req, res) => {
  const idToken = String(req.body?.idToken || '').trim();
  if (!idToken) {
    res.status(400).json({ error: 'Google sign-in token is required.' });
    return;
  }

  let email = '';
  let displayName = '';
  try {
    const decoded = await verifyGoogleFirebaseIdToken(idToken);
    email = String(decoded.email || '').trim().toLowerCase();
    displayName = String(decoded.name || '').trim();
  } catch (err) {
    res.status(401).json({
      error: err instanceof Error ? err.message : 'Unable to verify Google sign-in token.',
    });
    return;
  }

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'A valid verified Google email address is required.' });
    return;
  }

  const existing = db.prepare('SELECT id, role, email, name, status FROM users WHERE email = ?').get(email) as
    | { id: number; role: UserRole; email: string; name: string; status: string }
    | undefined;

  if (existing && existing.role !== 'household') {
    const roleLabel =
      existing.role === 'admin' ? 'Administrator' : existing.role === 'collector' ? 'Collector' : 'Recycler';
    res.status(403).json({
      error: `Access restricted: This email is registered to a ${roleLabel} account. Google Sign-In is available for Household customers only.`,
    });
    return;
  }

  if (existing && existing.status === 'blocked') {
    res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    return;
  }

  let userId: number;
  if (existing) {
    userId = existing.id;
    if (displayName && (!existing.name || existing.name.includes('@'))) {
      db.prepare(`UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(displayName, userId);
    }
  } else {
    const safeName = displayName.length >= 2 ? displayName : email.split('@')[0];
    userId = Number(
      db
        .prepare(`INSERT INTO users (role, name, email, phone, password_hash, status) VALUES ('household', ?, ?, '', '', 'active')`)
        .run(safeName, email).lastInsertRowid
    );
    recordAudit({
      actorId: userId,
      actorEmail: email,
      actorRole: 'household',
      action: 'USER_GOOGLE_REGISTERED',
      entityType: 'household',
      entityId: userId,
    });
  }

  const token = signAuthToken({ userId, role: 'household', email });
  setAuthCookie(req, res, token);
  res.json({ token, user: hydrateUser(userId) });
});

apiRouter.get('/admin-auth/status', (_req, res) => {
  ensureAdminSecurityState();
  const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
  const sec = db.prepare('SELECT claimed FROM admin_security WHERE id = 1').get() as { claimed: number } | undefined;
  res.json({
    configuredByEnv: envPasscode.length > 0,
    claimed: Boolean(sec?.claimed),
  });
});

apiRouter.post('/admin-auth/claim', (req, res) => {
  ensureAdminSecurityState();
  const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPasscode.length > 0) {
    res.status(403).json({ error: 'Admin Portal passcode is already configured via server environment secrets.' });
    return;
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const passcode = String(req.body?.passcode || '');

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Please enter a valid administrator email address.' });
    return;
  }
  if (passcode.length < 8) {
    res.status(400).json({ error: 'Administrator passcode must be at least 8 characters long.' });
    return;
  }

  const existingByEmail = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email) as
    | { id: number; role: UserRole }
    | undefined;
  if (existingByEmail && existingByEmail.role !== 'admin') {
    res.status(403).json({
      error: 'Access restricted: Household, collector, and recycler emails cannot be used for the Admin Portal.',
    });
    return;
  }

  const passcodeHash = bcrypt.hashSync(passcode, 10);

  let claimedAdminId: number;
  try {
    claimedAdminId = db.transaction(() => {
      const sec = db.prepare('SELECT claimed FROM admin_security WHERE id = 1').get() as { claimed: number } | undefined;
      if (sec?.claimed === 1) {
        throw new Error('ALREADY_CLAIMED');
      }

      const adminRow = db.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`).get() as
        | { id: number }
        | undefined;

      let adminId: number;
      if (adminRow) {
        adminId = adminRow.id;
        db.prepare(`UPDATE users SET email = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
          email,
          passcodeHash,
          adminId
        );
      } else {
        adminId = Number(
          db
            .prepare(
              `INSERT INTO users (role, name, email, phone, password_hash, status) VALUES ('admin', 'Platform Admin', ?, '9845000001', ?, 'active')`
            )
            .run(email, passcodeHash).lastInsertRowid
        );
      }

      const updateRes = db
        .prepare(`UPDATE admin_security SET admin_email = ?, passcode_hash = ?, claimed = 1, updated_at = datetime('now') WHERE id = 1 AND claimed = 0`)
        .run(email, passcodeHash);

      if (updateRes.changes !== 1) {
        throw new Error('ALREADY_CLAIMED');
      }

      recordAudit({
        actorId: adminId,
        actorEmail: email,
        actorRole: 'admin',
        action: 'ADMIN_PORTAL_CLAIMED',
        entityType: 'admin_security',
        entityId: adminId,
      });

      return adminId;
    })();
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_CLAIMED') {
      res.status(403).json({ error: 'Admin Portal has already been initialized and locked.' });
      return;
    }
    throw err;
  }

  const token = signAuthToken({ userId: claimedAdminId, role: 'admin', email });
  setAuthCookie(req, res, token);
  res.status(201).json({ token, user: hydrateUser(claimedAdminId) });
});

apiRouter.post('/admin-auth/login', (req, res) => {
  ensureAdminSecurityState();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const passcode = String(req.body?.passcode || '');

  if (!EMAIL_RE.test(email) || !passcode) {
    res.status(400).json({ error: 'Administrator email and passcode are required.' });
    return;
  }

  const row = db.prepare('SELECT id, role, email, status FROM users WHERE email = ?').get(email) as
    | { id: number; role: UserRole; email: string; status: string }
    | undefined;

  if (row && row.role !== 'admin') {
    res.status(403).json({
      error: 'Access restricted: Collectors, households, and recyclers are blocked from logging into the Admin Portal.',
    });
    return;
  }

  const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
  const sec = db.prepare('SELECT passcode_hash, claimed FROM admin_security WHERE id = 1').get() as
    | { passcode_hash: string; claimed: number }
    | undefined;

  if (!envPasscode && (!sec || sec.claimed !== 1 || !sec.passcode_hash)) {
    res.status(403).json({
      error: 'Admin Portal has not been initialized yet. Complete the first-run setup on the Admin Portal page.',
    });
    return;
  }

  if (!row) {
    res.status(401).json({ error: 'Invalid administrator credentials.' });
    return;
  }
  if (row.status === 'blocked') {
    res.status(403).json({ error: 'This administrator account has been suspended.' });
    return;
  }

  const valid = envPasscode.length > 0
    ? timingSafePasscodeMatch(passcode, envPasscode)
    : bcrypt.compareSync(passcode, sec!.passcode_hash);

  if (!valid) {
    res.status(401).json({ error: 'Invalid administrator credentials.' });
    return;
  }

  recordAudit({
    actorId: row.id,
    actorEmail: row.email,
    actorRole: 'admin',
    action: 'ADMIN_LOGIN',
    entityType: 'user',
    entityId: row.id,
  });

  const token = signAuthToken({ userId: row.id, role: 'admin', email: row.email });
  setAuthCookie(req, res, token);
  res.json({ token, user: hydrateUser(row.id) });
});

apiRouter.post('/auth/logout', (req, res) => {
  clearAuthCookie(req, res);
  res.json({ ok: true });
});

apiRouter.get('/auth/me', (req, res) => {
  const token = extractToken(req);
  if (!token) {
    res.json({ user: null });
    return;
  }
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    res.json({ user: null });
    return;
  }
  const user = hydrateUser(decoded.userId);
  if (!user || user.status === 'blocked') {
    res.json({ user: null });
    return;
  }
  res.json({ token, user });
});

apiRouter.patch('/auth/profile', requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const name = String(req.body?.name || '').trim();
  const phone = cleanPhone(req.body?.phone);
  const newPassword = String(req.body?.newPassword || '');

  if (name.length < 2) {
    res.status(400).json({ error: 'Name must be at least 2 characters.' });
    return;
  }
  if (!PHONE_RE.test(phone)) {
    res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' });
    return;
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare(`UPDATE users SET name = ?, phone = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(name, phone, hash, userId);
  } else {
    db.prepare(`UPDATE users SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(name, phone, userId);
  }

  res.json({ user: hydrateUser(userId) });
});

// ---------------------------------------------------------------------------
// ADDRESSES
// ---------------------------------------------------------------------------

apiRouter.get('/addresses', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC').all(req.user!.id);
  res.json({
    addresses: rows.map((a: unknown) => {
      const row = a as Record<string, unknown>;
      return { ...row, is_default: Boolean(row.is_default) };
    }),
  });
});

apiRouter.post('/addresses', requireAuth, (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const label = String(req.body?.label || 'Home').trim();
  const line1 = String(req.body?.line1 || '').trim();
  const line2 = String(req.body?.line2 || '').trim();
  const area = String(req.body?.area || '').trim();
  const city = String(req.body?.city || 'Bengaluru').trim();
  const pincode = String(req.body?.pincode || '').trim();
  const isDefault = Boolean(req.body?.is_default);

  if (line1.length < 4 || area.length < 2 || !PINCODE_RE.test(pincode)) {
    res.status(400).json({ error: 'Please enter a valid street address, area, and 6-digit pincode.' });
    return;
  }

  if (isDefault) {
    db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(userId);
  }
  const id = Number(
    db
      .prepare(
        `INSERT INTO addresses (user_id, label, line1, line2, area, city, pincode, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(userId, label, line1, line2, area, city, pincode, isDefault ? 1 : 0).lastInsertRowid
  );

  res.status(201).json({ address: db.prepare('SELECT * FROM addresses WHERE id = ?').get(id) });
});

apiRouter.patch('/addresses/:id', requireAuth, (req: AuthedRequest, res) => {
  const addrId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(addrId, req.user!.id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Address not found.' });
    return;
  }

  const label = String(req.body?.label ?? existing.label).trim();
  const line1 = String(req.body?.line1 ?? existing.line1).trim();
  const line2 = String(req.body?.line2 ?? existing.line2).trim();
  const area = String(req.body?.area ?? existing.area).trim();
  const city = String(req.body?.city ?? existing.city).trim();
  const pincode = String(req.body?.pincode ?? existing.pincode).trim();
  const isDefault = req.body?.is_default !== undefined ? Boolean(req.body.is_default) : Boolean(existing.is_default);

  if (line1.length < 4 || area.length < 2 || !PINCODE_RE.test(pincode)) {
    res.status(400).json({ error: 'Valid address line, area, and 6-digit pincode required.' });
    return;
  }

  if (isDefault) {
    db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user!.id);
  }
  db.prepare(`
    UPDATE addresses SET label = ?, line1 = ?, line2 = ?, area = ?, city = ?, pincode = ?, is_default = ?
    WHERE id = ? AND user_id = ?
  `).run(label, line1, line2, area, city, pincode, isDefault ? 1 : 0, addrId, req.user!.id);

  res.json({ address: db.prepare('SELECT * FROM addresses WHERE id = ?').get(addrId) });
});

apiRouter.delete('/addresses/:id', requireAuth, (req: AuthedRequest, res) => {
  const addrId = Number(req.params.id);
  const info = db.prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?').run(addrId, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Address not found.' });
    return;
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PICKUPS (SHARED / HOUSEHOLD / COLLECTOR / ADMIN)
// ---------------------------------------------------------------------------

apiRouter.get('/pickups', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const statusFilter = String(req.query.status || '').trim();
  const scope = String(req.query.scope || '').trim();

  let baseSql = `
    SELECT p.*,
           h.name as household_name, h.email as household_email, h.phone as household_phone,
           c.name as collector_name, c.phone as collector_phone,
           cp.rating_avg as collector_rating
    FROM pickups p
    LEFT JOIN users h ON h.id = p.household_id
    LEFT JOIN users c ON c.id = p.collector_id
    LEFT JOIN collector_profiles cp ON cp.user_id = p.collector_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (user.role === 'household') {
    baseSql += ' AND p.household_id = ?';
    params.push(user.id);
  } else if (user.role === 'collector') {
    if (scope === 'nearby') {
      const cp = db.prepare('SELECT service_pincodes FROM collector_profiles WHERE user_id = ?').get(user.id) as
        | { service_pincodes: string }
        | undefined;
      const pincodes: string[] = cp ? JSON.parse(cp.service_pincodes || '[]') : [];
      if (pincodes.length === 0) {
        res.json({ pickups: [] });
        return;
      }
      const placeholders = pincodes.map(() => '?').join(',');
      baseSql += ` AND p.collector_id IS NULL AND p.status = 'Requested' AND p.pincode IN (${placeholders})`;
      params.push(...pincodes);
    } else {
      baseSql += ' AND p.collector_id = ?';
      params.push(user.id);
    }
  } else if (user.role === 'admin') {
    if (req.query.pincode) {
      baseSql += ' AND p.pincode = ?';
      params.push(String(req.query.pincode).trim());
    }
    if (req.query.date) {
      baseSql += ' AND p.pickup_date = ?';
      params.push(String(req.query.date).trim());
    }
    if (req.query.collectorId) {
      baseSql += ' AND p.collector_id = ?';
      params.push(Number(req.query.collectorId));
    }
    if (req.query.manualQueue === 'true') {
      baseSql += ` AND (p.manual_queue = 1 OR (p.collector_id IS NULL AND p.status IN ('Requested','Rescheduled')))`;
    }
  } else {
    res.status(403).json({ error: 'Recyclers access bulk material lots rather than individual household pickups.' });
    return;
  }

  if (statusFilter && statusFilter !== 'All') {
    baseSql += ' AND p.status = ?';
    params.push(statusFilter);
  }

  baseSql += ' ORDER BY p.pickup_date DESC, p.id DESC LIMIT 200';
  const rows = db.prepare(baseSql).all(...params) as Array<Record<string, unknown>>;
  res.json({ pickups: rows.map(hydratePickupRow) });
});

apiRouter.get('/pickups/:id', requireAuth, (req: AuthedRequest, res) => {
  const pickup = getPickupById(Number(req.params.id));
  if (!pickup) {
    res.status(404).json({ error: 'Pickup not found.' });
    return;
  }

  const user = req.user!;
  if (user.role === 'household' && pickup.household_id !== user.id) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  if (user.role === 'collector' && pickup.collector_id !== user.id && pickup.collector_id !== null) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }
  if (user.role === 'recycler') {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  res.json({ pickup });
});

apiRouter.post('/pickups', requireAuth, requireRole(['household', 'admin']), async (req: AuthedRequest, res) => {
  const user = req.user!;
  const settings = getScheduleSettings();

  // Resolve address
  let addrSnapshot: { label: string; line1: string; line2?: string; area: string; city: string; pincode: string } | null = null;
  let addressId: number | null = null;

  if (req.body?.address_id) {
    const addr = db
      .prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?')
      .get(Number(req.body.address_id), user.id) as Record<string, unknown> | undefined;
    if (!addr) {
      res.status(400).json({ error: 'Selected address not found.' });
      return;
    }
    addressId = Number(addr.id);
    addrSnapshot = {
      label: String(addr.label),
      line1: String(addr.line1),
      line2: String(addr.line2 || ''),
      area: String(addr.area),
      city: String(addr.city),
      pincode: String(addr.pincode),
    };
  } else if (req.body?.address && typeof req.body.address === 'object') {
    const a = req.body.address;
    const pincode = String(a.pincode || '').trim();
    const line1 = String(a.line1 || '').trim();
    const area = String(a.area || '').trim();
    if (line1.length < 4 || area.length < 2 || !PINCODE_RE.test(pincode)) {
      res.status(400).json({ error: 'Valid address line, area, and 6-digit pincode are required.' });
      return;
    }
    addrSnapshot = {
      label: String(a.label || 'Pickup Address').trim(),
      line1,
      line2: String(a.line2 || '').trim(),
      area,
      city: String(a.city || 'Bengaluru').trim(),
      pincode,
    };
    if (req.body?.save_address) {
      addressId = Number(
        db
          .prepare(
            `INSERT INTO addresses (user_id, label, line1, line2, area, city, pincode, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
          )
          .run(user.id, addrSnapshot.label, addrSnapshot.line1, addrSnapshot.line2 || '', addrSnapshot.area, addrSnapshot.city, addrSnapshot.pincode).lastInsertRowid
      );
    }
  }

  if (!addrSnapshot) {
    res.status(400).json({ error: 'Pickup address is required.' });
    return;
  }

  const serviceArea = settings.service_areas.find((a) => a.pincode === addrSnapshot!.pincode && a.active);
  if (!serviceArea) {
    res.status(400).json({ error: `Pincode ${addrSnapshot.pincode} is currently outside our active service zones.` });
    return;
  }

  const pickupDate = String(req.body?.pickup_date || '').trim();
  const slotId = String(req.body?.slot_id || '').trim();
  const slot = settings.slots.find((s) => s.id === slotId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate) || !slot) {
    res.status(400).json({ error: 'Valid pickup date and 2-hour time slot are required.' });
    return;
  }

  const bookedCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM pickups WHERE pickup_date = ? AND slot_id = ? AND pincode = ? AND status NOT IN ('Cancelled')`
      )
      .get(pickupDate, slotId, addrSnapshot.pincode) as { cnt: number }
  ).cnt;

  const slotEval = evaluateSlotAvailability({
    dateStr: pickupDate,
    slot,
    settings,
    bookedCount: Number(bookedCount),
  });
  if (!slotEval.available) {
    res.status(400).json({ error: `Selected slot is unavailable: ${slotEval.reason}` });
    return;
  }

  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (rawItems.length === 0) {
    res.status(400).json({ error: 'Select at least one scrap category with estimated weight.' });
    return;
  }

  const categories = db.prepare('SELECT * FROM categories WHERE is_active = 1').all() as Array<Record<string, unknown>>;
  const catMap = new Map(categories.map((c) => [Number(c.id), c]));

  const validatedItems: Array<{ category_id: number; category_name: string; est_weight: number; rate_per_kg: number; amount: number }> = [];
  for (const item of rawItems) {
    const catId = Number(item.category_id);
    const estWeight = Number(item.est_weight);
    const cat = catMap.get(catId);
    if (!cat || !Number.isFinite(estWeight) || estWeight <= 0 || estWeight > 5000) {
      res.status(400).json({ error: 'Each selected item must have a valid category and positive weight (kg).' });
      return;
    }
    const rate = Number(cat.rate_per_kg);
    validatedItems.push({
      category_id: catId,
      category_name: String(cat.name),
      est_weight: Math.round(estWeight * 100) / 100,
      rate_per_kg: rate,
      amount: Math.round(estWeight * rate * 100) / 100,
    });
  }

  const estTotalWeight = Math.round(validatedItems.reduce((s, i) => s + i.est_weight, 0) * 100) / 100;
  const estTotalAmount = Math.round(validatedItems.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const notes = String(req.body?.notes || '').trim().slice(0, 600);
  const photos = sanitizeImageList(req.body?.photos);

  const assignedCollector = findBestCollectorForPickup({
    pincode: addrSnapshot.pincode,
    pickupDate,
    slotId,
  });

  const initialStatus: PickupStatus = assignedCollector ? 'Assigned' : 'Requested';
  const nowIso = new Date().toISOString();
  const code = `SE-${getNowIST().year}-${Math.floor(1000 + Math.random() * 9000)}`;

  const pickupId = db.transaction(() => {
    const pid = Number(
      db
        .prepare(`
          INSERT INTO pickups (
            code, household_id, collector_id, address_id, address_snapshot, pincode, area,
            pickup_date, slot_id, slot_label, status, est_total_weight, est_total_amount,
            commission_rate, notes, photos, assigned_at, manual_queue, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          code,
          user.id,
          assignedCollector ? assignedCollector.user_id : null,
          addressId,
          JSON.stringify(addrSnapshot),
          addrSnapshot!.pincode,
          addrSnapshot!.area,
          pickupDate,
          slot.id,
          slot.label,
          initialStatus,
          estTotalWeight,
          estTotalAmount,
          settings.commission_percent,
          notes,
          JSON.stringify(photos),
          assignedCollector ? nowIso : null,
          assignedCollector ? 0 : 0,
          nowIso,
          nowIso
        ).lastInsertRowid
    );

    const insItem = db.prepare(`
      INSERT INTO pickup_items (pickup_id, category_id, category_name, est_weight, actual_weight, rate_per_kg, amount)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `);
    for (const item of validatedItems) {
      insItem.run(pid, item.category_id, item.category_name, item.est_weight, item.rate_per_kg, item.amount);
    }

    db.prepare(`
      INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
      VALUES (?, 'Requested', ?, ?, ?, ?)
    `).run(pid, `Pickup booked for ${pickupDate} (${slot.label}).`, user.id, user.role, nowIso);

    if (assignedCollector) {
      db.prepare(`
        INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
        VALUES (?, 'Assigned', ?, NULL, 'system', ?)
      `).run(pid, `Auto-assigned to ${assignedCollector.name} in ${addrSnapshot!.area} (${addrSnapshot!.pincode}).`, nowIso);
    }

    return pid;
  })();

  // Notifications
  createNotification({
    userId: user.id,
    type: 'booking_confirmed',
    title: `Booking confirmed: ${code}`,
    message: assignedCollector
      ? `${assignedCollector.name} is assigned for ${pickupDate} (${slot.label}).`
      : `Your pickup for ${pickupDate} (${slot.label}) is queued for collector assignment.`,
    link: `/dashboard/pickups/${pickupId}`,
  });

  if (assignedCollector) {
    createNotification({
      userId: assignedCollector.user_id,
      type: 'new_assignment',
      title: `New pickup assigned: ${code}`,
      message: `~${estTotalWeight} kg in ${addrSnapshot.area} (${addrSnapshot.pincode}) for ${pickupDate} (${slot.label}).`,
      link: '/collector/requests',
    });
  } else {
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as Array<{ id: number }>;
    for (const a of admins) {
      createNotification({
        userId: a.id,
        type: 'unassigned_pickup',
        title: `No online collector in ${addrSnapshot.pincode}`,
        message: `Pickup ${code} (${addrSnapshot.area}) needs collector assignment.`,
        link: '/admin/pickups',
      });
    }
  }

  const dbUser = db.prepare('SELECT name, email, phone FROM users WHERE id = ?').get(user.id) as
    | { name: string; email: string; phone: string }
    | undefined;

  const supaResult = await syncPickupBookingToSupabase({
    pickup_code: code,
    customer_name: dbUser?.name || user.name,
    customer_email: dbUser?.email || user.email,
    customer_phone: dbUser?.phone || '',
    address_line1: addrSnapshot.line1,
    address_line2: addrSnapshot.line2 || '',
    area: addrSnapshot.area,
    city: addrSnapshot.city,
    pincode: addrSnapshot.pincode,
    pickup_date: pickupDate,
    slot_id: slot.id,
    slot_label: slot.label,
    items: validatedItems,
    est_total_weight: estTotalWeight,
    est_total_amount: estTotalAmount,
    status: initialStatus,
    assigned_collector_name: assignedCollector ? assignedCollector.name : null,
    notes,
  });

  res.status(201).json({
    pickup: getPickupById(pickupId),
    supabaseSynced: supaResult.synced,
    supabaseReason: supaResult.reason,
  });
});

apiRouter.patch('/pickups/:id/reschedule', requireAuth, async (req: AuthedRequest, res) => {
  const pickup = getPickupById(Number(req.params.id));
  if (!pickup) {
    res.status(404).json({ error: 'Pickup not found.' });
    return;
  }
  if (req.user!.role !== 'admin' && pickup.household_id !== req.user!.id) {
    res.status(403).json({ error: 'Only the booking household or admin can reschedule this pickup.' });
    return;
  }
  if (['Completed', 'Cancelled', 'Picked Up'].includes(pickup.status)) {
    res.status(400).json({ error: `Cannot reschedule a pickup in ${pickup.status} status.` });
    return;
  }

  const settings = getScheduleSettings();
  const currentSlot = settings.slots.find((s) => s.id === pickup.slot_id) || settings.slots[0];
  const penalty = evaluateModifyPenalty(pickup.pickup_date, currentSlot.startHour);

  const newDate = String(req.body?.pickup_date || '').trim();
  const newSlotId = String(req.body?.slot_id || '').trim();
  const newSlot = settings.slots.find((s) => s.id === newSlotId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !newSlot) {
    res.status(400).json({ error: 'Valid new date and time slot are required.' });
    return;
  }

  const bookedCount = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM pickups WHERE pickup_date = ? AND slot_id = ? AND pincode = ? AND status != 'Cancelled' AND id != ?`)
      .get(newDate, newSlotId, pickup.pincode, pickup.id) as { cnt: number }
  ).cnt;

  const slotEval = evaluateSlotAvailability({
    dateStr: newDate,
    slot: newSlot,
    settings,
    bookedCount: Number(bookedCount),
  });
  if (!slotEval.available) {
    res.status(400).json({ error: `New slot unavailable: ${slotEval.reason}` });
    return;
  }

  const nowIso = new Date().toISOString();
  const note = penalty.isLate
    ? `Rescheduled (within 2h late window) to ${newDate} (${newSlot.label}).`
    : `Rescheduled to ${newDate} (${newSlot.label}).`;

  db.prepare(`
    UPDATE pickups
    SET pickup_date = ?, slot_id = ?, slot_label = ?, status = 'Rescheduled',
        late_flag = CASE WHEN ? = 1 THEN 1 ELSE late_flag END,
        reminder_24h_sent = 0, reminder_1h_sent = 0, updated_at = ?
    WHERE id = ?
  `).run(newDate, newSlot.id, newSlot.label, penalty.isLate ? 1 : 0, nowIso, pickup.id);

  db.prepare(`
    INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
    VALUES (?, 'Rescheduled', ?, ?, ?, ?)
  `).run(pickup.id, note, req.user!.id, req.user!.role, nowIso);

  if (pickup.collector_id) {
    createNotification({
      userId: pickup.collector_id,
      type: 'pickup_rescheduled',
      title: `Pickup ${pickup.code} rescheduled`,
      message: note,
      link: '/collector/schedule',
    });
  }

  await syncPickupStatusToSupabase(pickup.code, {
    status: 'Rescheduled',
    pickup_date: newDate,
    slot_id: newSlot.id,
    slot_label: newSlot.label,
  });

  res.json({ pickup: getPickupById(pickup.id), late_flag: penalty.isLate });
});

apiRouter.patch('/pickups/:id/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const pickup = getPickupById(Number(req.params.id));
  if (!pickup) {
    res.status(404).json({ error: 'Pickup not found.' });
    return;
  }
  if (req.user!.role !== 'admin' && pickup.household_id !== req.user!.id) {
    res.status(403).json({ error: 'Only the booking household or admin can cancel this pickup.' });
    return;
  }
  if (['Completed', 'Cancelled', 'Picked Up'].includes(pickup.status)) {
    res.status(400).json({ error: `Cannot cancel a pickup that is already ${pickup.status}.` });
    return;
  }

  const settings = getScheduleSettings();
  const currentSlot = settings.slots.find((s) => s.id === pickup.slot_id) || settings.slots[0];
  const penalty = evaluateModifyPenalty(pickup.pickup_date, currentSlot.startHour);
  const reason = String(req.body?.reason || '').trim();
  const nowIso = new Date().toISOString();

  db.prepare(`
    UPDATE pickups
    SET status = 'Cancelled',
        late_flag = CASE WHEN ? = 1 THEN 1 ELSE late_flag END,
        manual_queue = 0,
        updated_at = ?
    WHERE id = ?
  `).run(penalty.isLate ? 1 : 0, nowIso, pickup.id);

  const note = [
    penalty.isLate ? 'Cancelled within 2h of slot start (late flag).' : 'Cancelled by user.',
    reason ? `Reason: ${reason}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  db.prepare(`
    INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
    VALUES (?, 'Cancelled', ?, ?, ?, ?)
  `).run(pickup.id, note, req.user!.id, req.user!.role, nowIso);

  if (pickup.collector_id) {
    createNotification({
      userId: pickup.collector_id,
      type: 'pickup_cancelled',
      title: `Pickup ${pickup.code} cancelled`,
      message: note,
      link: '/collector/schedule',
    });
  }

  if (req.user!.role === 'admin') {
    recordAudit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'PICKUP_ADMIN_CANCELLED',
      entityType: 'pickup',
      entityId: pickup.id,
      details: { code: pickup.code, reason },
    });
  }

  await syncPickupStatusToSupabase(pickup.code, { status: 'Cancelled' });

  res.json({ pickup: getPickupById(pickup.id), late_flag: penalty.isLate });
});

apiRouter.post('/pickups/:id/review', requireAuth, requireRole(['household']), (req: AuthedRequest, res) => {
  const pickup = getPickupById(Number(req.params.id));
  if (!pickup || pickup.household_id !== req.user!.id) {
    res.status(404).json({ error: 'Pickup not found.' });
    return;
  }
  if (pickup.status !== 'Completed' || !pickup.collector_id) {
    res.status(400).json({ error: 'Only completed pickups with an assigned collector can be rated.' });
    return;
  }
  if (pickup.review) {
    res.status(409).json({ error: 'You have already submitted a review for this pickup.' });
    return;
  }

  const rating = Number(req.body?.rating);
  const comment = String(req.body?.comment || '').trim().slice(0, 500);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
    return;
  }

  db.transaction(() => {
    db.prepare(`INSERT INTO reviews (pickup_id, household_id, collector_id, rating, comment) VALUES (?, ?, ?, ?, ?)`)
      .run(pickup.id, req.user!.id, pickup.collector_id, rating, comment);

    const agg = db
      .prepare('SELECT AVG(rating) as avg_r, COUNT(*) as cnt FROM reviews WHERE collector_id = ?')
      .get(pickup.collector_id) as { avg_r: number; cnt: number };

    db.prepare('UPDATE collector_profiles SET rating_avg = ?, rating_count = ? WHERE user_id = ?').run(
      Math.round(Number(agg.avg_r) * 10) / 10,
      Number(agg.cnt),
      pickup.collector_id
    );
  })();

  res.status(201).json({ pickup: getPickupById(pickup.id) });
});

apiRouter.get('/household/impact', requireAuth, requireRole(['household', 'admin']), (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const summary = db
    .prepare(`
      SELECT
        COUNT(*) as completed_count,
        COALESCE(SUM(actual_total_weight), 0) as total_kg,
        COALESCE(SUM(actual_total_amount), 0) as total_earnings
      FROM pickups
      WHERE household_id = ? AND status = 'Completed'
    `)
    .get(uid) as { completed_count: number; total_kg: number; total_earnings: number };

  const breakdown = db
    .prepare(`
      SELECT c.name as category_name,
             COALESCE(SUM(pi.actual_weight), 0) as kg,
             COALESCE(SUM(pi.amount), 0) as earnings,
             COALESCE(SUM(pi.actual_weight * c.co2_factor_per_kg), 0) as co2_saved
      FROM pickup_items pi
      JOIN pickups p ON p.id = pi.pickup_id
      JOIN categories c ON c.id = pi.category_id
      WHERE p.household_id = ? AND p.status = 'Completed' AND pi.actual_weight IS NOT NULL
      GROUP BY c.id
      ORDER BY kg DESC
    `)
    .all(uid) as Array<{ category_name: string; kg: number; earnings: number; co2_saved: number }>;

  const totalCo2 = breakdown.reduce((s, b) => s + Number(b.co2_saved), 0);

  res.json({
    completedPickups: Number(summary.completed_count),
    totalKgRecycled: Math.round(Number(summary.total_kg) * 10) / 10,
    totalEarnings: Math.round(Number(summary.total_earnings) * 100) / 100,
    co2SavedKg: Math.round(totalCo2 * 10) / 10,
    treesEquivalent: Math.max(0, Math.round((totalCo2 / 21) * 10) / 10),
    breakdown,
  });
});

// ---------------------------------------------------------------------------
// COLLECTOR ROUTES
// ---------------------------------------------------------------------------

apiRouter.patch('/collector/availability', requireAuth, requireRole(['collector']), (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const cp = db.prepare('SELECT * FROM collector_profiles WHERE user_id = ?').get(uid) as Record<string, unknown> | undefined;
  if (!cp) {
    res.status(404).json({ error: 'Collector profile not found.' });
    return;
  }

  const isOnline = req.body?.is_online !== undefined ? Boolean(req.body.is_online) : Boolean(cp.is_online);
  if (isOnline && cp.kyc_status !== 'approved') {
    res.status(400).json({ error: 'Your KYC verification must be approved by an admin before going online.' });
    return;
  }

  const workingDays = Array.isArray(req.body?.working_days)
    ? req.body.working_days.map(Number).filter((d: number) => d >= 0 && d <= 6)
    : JSON.parse(String(cp.working_days));
  const workingStart = String(req.body?.working_start || cp.working_start).trim();
  const workingEnd = String(req.body?.working_end || cp.working_end).trim();
  const pincodes = Array.isArray(req.body?.service_pincodes)
    ? req.body.service_pincodes.map((p: unknown) => String(p).trim()).filter((p: string) => PINCODE_RE.test(p))
    : JSON.parse(String(cp.service_pincodes));

  db.prepare(`
    UPDATE collector_profiles
    SET is_online = ?, working_days = ?, working_start = ?, working_end = ?, service_pincodes = ?
    WHERE user_id = ?
  `).run(isOnline ? 1 : 0, JSON.stringify(workingDays), workingStart, workingEnd, JSON.stringify(pincodes), uid);

  res.json({ user: hydrateUser(uid) });
});

apiRouter.patch('/collector/profile', requireAuth, requireRole(['collector']), (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const cp = db.prepare('SELECT * FROM collector_profiles WHERE user_id = ?').get(uid) as Record<string, unknown> | undefined;
  if (!cp) {
    res.status(404).json({ error: 'Collector profile not found.' });
    return;
  }

  const vehicleType = String(req.body?.vehicle_type ?? cp.vehicle_type).trim();
  const vehicleNumber = String(req.body?.vehicle_number ?? cp.vehicle_number).trim().toUpperCase();
  const kycDocType = String(req.body?.kyc_doc_type ?? cp.kyc_doc_type).trim();
  const kycDocNumber = String(req.body?.kyc_doc_number ?? cp.kyc_doc_number).trim();
  const newImg = validateDataImage(req.body?.kyc_doc_image);

  db.prepare(`
    UPDATE collector_profiles
    SET vehicle_type = ?, vehicle_number = ?, kyc_doc_type = ?, kyc_doc_number = ?,
        kyc_doc_image = COALESCE(?, kyc_doc_image)
    WHERE user_id = ?
  `).run(vehicleType, vehicleNumber, kycDocType, kycDocNumber, newImg, uid);

  res.json({ user: hydrateUser(uid) });
});

apiRouter.post('/collector/pickups/:id/accept', requireAuth, requireRole(['collector']), (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const cp = db.prepare('SELECT kyc_status FROM collector_profiles WHERE user_id = ?').get(uid) as { kyc_status: string } | undefined;
  if (!cp || cp.kyc_status !== 'approved') {
    res.status(403).json({ error: 'Approved collector KYC is required to accept pickups.' });
    return;
  }

  const pickup = getPickupById(Number(req.params.id));
  if (!pickup) {
    res.status(404).json({ error: 'Pickup not found.' });
    return;
  }
  if (pickup.collector_id && pickup.collector_id !== uid) {
    res.status(409).json({ error: 'This pickup is already assigned to another collector.' });
    return;
  }
  if (!['Requested', 'Assigned', 'Rescheduled'].includes(pickup.status)) {
    res.status(400).json({ error: `Cannot accept pickup in ${pickup.status} status.` });
    return;
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE pickups SET collector_id = ?, status = 'Assigned', manual_queue = 0, assigned_at = ?, updated_at = ?
    WHERE id = ?
  `).run(uid, nowIso, nowIso, pickup.id);

  db.prepare(`
    INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
    VALUES (?, 'Assigned', ?, ?, 'collector', ?)
  `).run(pickup.id, `Accepted by ${req.user!.name}.`, uid, nowIso);

  createNotification({
    userId: pickup.household_id,
    type: 'collector_assigned',
    title: `Collector confirmed for ${pickup.code}`,
    message: `${req.user!.name} has accepted your pickup for ${pickup.pickup_date} (${pickup.slot_label}).`,
    link: `/dashboard/pickups/${pickup.id}`,
  });

  res.json({ pickup: getPickupById(pickup.id) });
});

apiRouter.post('/collector/pickups/:id/reject', requireAuth, requireRole(['collector']), (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const pickup = getPickupById(Number(req.params.id));
  if (!pickup || pickup.collector_id !== uid) {
    res.status(404).json({ error: 'Assigned pickup not found.' });
    return;
  }
  if (!['Assigned', 'Rescheduled'].includes(pickup.status)) {
    res.status(400).json({ error: 'Can only decline an Assigned or Rescheduled pickup before arrival.' });
    return;
  }

  const reason = String(req.body?.reason || 'Schedule conflict').trim();
  const nowIso = new Date().toISOString();

  const nextCollector = findBestCollectorForPickup({
    pincode: pickup.pincode,
    pickupDate: pickup.pickup_date,
    slotId: pickup.slot_id,
    excludeCollectorIds: [uid],
  });

  db.transaction(() => {
    db.prepare(`
      INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
      VALUES (?, 'Requested', ?, ?, 'collector', ?)
    `).run(pickup.id, `Declined by ${req.user!.name}: ${reason}`, uid, nowIso);

    if (nextCollector) {
      db.prepare(`
        UPDATE pickups SET collector_id = ?, status = 'Assigned', assigned_at = ?, manual_queue = 0, updated_at = ?
        WHERE id = ?
      `).run(nextCollector.user_id, nowIso, nowIso, pickup.id);

      db.prepare(`
        INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
        VALUES (?, 'Assigned', ?, NULL, 'system', ?)
      `).run(pickup.id, `Reassigned automatically to ${nextCollector.name}.`, nowIso);
    } else {
      db.prepare(`
        UPDATE pickups SET collector_id = NULL, status = 'Requested', manual_queue = 1, assigned_at = NULL, updated_at = ?
        WHERE id = ?
      `).run(nowIso, pickup.id);
    }
  })();

  if (nextCollector) {
    createNotification({
      userId: nextCollector.user_id,
      type: 'new_assignment',
      title: `Reassigned pickup: ${pickup.code}`,
      message: `Pickup in ${pickup.area} (${pickup.pincode}) on ${pickup.pickup_date} (${pickup.slot_label}).`,
      link: '/collector/requests',
    });
  } else {
    const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as Array<{ id: number }>;
    for (const a of admins) {
      createNotification({
        userId: a.id,
        type: 'manual_queue',
        title: `Collector declined ${pickup.code}`,
        message: `Moved to manual assignment queue for ${pickup.area} (${pickup.pincode}).`,
        link: '/admin/pickups',
      });
    }
  }

  res.json({ ok: true, reassignedTo: nextCollector?.name || null });
});

apiRouter.patch('/collector/pickups/:id/status', requireAuth, requireRole(['collector', 'admin']), async (req: AuthedRequest, res) => {
  const pickup = getPickupById(Number(req.params.id));
  if (!pickup) {
    res.status(404).json({ error: 'Pickup not found.' });
    return;
  }
  if (req.user!.role === 'collector' && pickup.collector_id !== req.user!.id) {
    res.status(403).json({ error: 'Not assigned to this pickup.' });
    return;
  }

  const nextStatus = String(req.body?.status || '').trim() as PickupStatus;
  if (!['En Route', 'Picked Up'].includes(nextStatus)) {
    res.status(400).json({ error: 'Use En Route or Picked Up status here; use /complete to finalize weights & payout.' });
    return;
  }

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE pickups SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, nowIso, pickup.id);
  db.prepare(`
    INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    pickup.id,
    nextStatus,
    nextStatus === 'En Route' ? 'Collector is on the way to your doorstep.' : 'Scrap collected and weighed on site.',
    req.user!.id,
    req.user!.role,
    nowIso
  );

  if (nextStatus === 'En Route') {
    createNotification({
      userId: pickup.household_id,
      type: 'collector_arriving',
      title: `Collector en route: ${pickup.code}`,
      message: `${req.user!.name} is heading to ${pickup.area} for your ${pickup.slot_label} pickup.`,
      link: `/dashboard/pickups/${pickup.id}`,
    });
  }

  await syncPickupStatusToSupabase(pickup.code, { status: nextStatus });

  res.json({ pickup: getPickupById(pickup.id) });
});

apiRouter.post('/collector/pickups/:id/complete', requireAuth, requireRole(['collector', 'admin']), async (req: AuthedRequest, res) => {
  const pickup = getPickupById(Number(req.params.id));
  if (!pickup) {
    res.status(404).json({ error: 'Pickup not found.' });
    return;
  }
  if (req.user!.role === 'collector' && pickup.collector_id !== req.user!.id) {
    res.status(403).json({ error: 'Not assigned to this pickup.' });
    return;
  }
  if (pickup.status === 'Completed' || pickup.status === 'Cancelled') {
    res.status(400).json({ error: `Pickup is already ${pickup.status}.` });
    return;
  }

  const paymentMethod = String(req.body?.payment_method || 'UPI');
  if (!['Cash', 'UPI'].includes(paymentMethod)) {
    res.status(400).json({ error: 'Payment method must be Cash or UPI.' });
    return;
  }

  const itemsInput = Array.isArray(req.body?.items) ? req.body.items : [];
  if (itemsInput.length === 0) {
    res.status(400).json({ error: 'Enter actual measured weights for at least one category.' });
    return;
  }

  const categories = db.prepare('SELECT * FROM categories').all() as Array<Record<string, unknown>>;
  const catMap = new Map(categories.map((c) => [Number(c.id), c]));
  const settings = getScheduleSettings();

  let actualTotalWeight = 0;
  let actualTotalAmount = 0;
  const resolvedItems: Array<{ category_id: number; category_name: string; est_weight: number; actual_weight: number; rate_per_kg: number; amount: number }> = [];

  for (const row of itemsInput) {
    const catId = Number(row.category_id);
    const weight = Number(row.actual_weight);
    const cat = catMap.get(catId);
    if (!cat || !Number.isFinite(weight) || weight < 0 || weight > 10000) {
      res.status(400).json({ error: 'All category weights must be valid non-negative numbers.' });
      return;
    }
    if (weight === 0) continue;
    const existingItem = pickup.items.find((i) => i.category_id === catId);
    const rate = existingItem ? existingItem.rate_per_kg : Number(cat.rate_per_kg);
    const amount = Math.round(weight * rate * 100) / 100;
    actualTotalWeight += weight;
    actualTotalAmount += amount;
    resolvedItems.push({
      category_id: catId,
      category_name: String(cat.name),
      est_weight: existingItem ? existingItem.est_weight : 0,
      actual_weight: Math.round(weight * 100) / 100,
      rate_per_kg: rate,
      amount,
    });
  }

  if (resolvedItems.length === 0 || actualTotalWeight <= 0) {
    res.status(400).json({ error: 'Total actual weight must be greater than 0 kg.' });
    return;
  }

  actualTotalWeight = Math.round(actualTotalWeight * 100) / 100;
  actualTotalAmount = Math.round(actualTotalAmount * 100) / 100;
  const commissionRate = settings.commission_percent;
  const commissionAmount = Math.round(actualTotalAmount * (commissionRate / 100) * 100) / 100;
  const nowIso = new Date().toISOString();

  db.transaction(() => {
    db.prepare('DELETE FROM pickup_items WHERE pickup_id = ?').run(pickup.id);
    const insItem = db.prepare(`
      INSERT INTO pickup_items (pickup_id, category_id, category_name, est_weight, actual_weight, rate_per_kg, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of resolvedItems) {
      insItem.run(pickup.id, item.category_id, item.category_name, item.est_weight, item.actual_weight, item.rate_per_kg, item.amount);
    }

    db.prepare(`
      UPDATE pickups
      SET status = 'Completed', actual_total_weight = ?, actual_total_amount = ?,
          commission_rate = ?, commission_amount = ?, payment_method = ?, payment_status = 'Paid',
          manual_queue = 0, updated_at = ?
      WHERE id = ?
    `).run(actualTotalWeight, actualTotalAmount, commissionRate, commissionAmount, paymentMethod, nowIso, pickup.id);

    db.prepare(`
      INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
      VALUES (?, 'Picked Up', ?, ?, ?, ?)
    `).run(pickup.id, `Digital scale confirmed ${actualTotalWeight} kg across ${resolvedItems.length} categories.`, req.user!.id, req.user!.role, nowIso);

    db.prepare(`
      INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
      VALUES (?, 'Completed', ?, ?, ?, ?)
    `).run(pickup.id, `Payout of ₹${actualTotalAmount} settled via ${paymentMethod}. Receipt generated.`, req.user!.id, req.user!.role, nowIso);

    if (pickup.collector_id) {
      db.prepare(`
        UPDATE collector_profiles
        SET total_pickups = total_pickups + 1,
            total_earnings = total_earnings + ?
        WHERE user_id = ?
      `).run(Math.round((actualTotalAmount * 0.15 + 60) * 100) / 100, pickup.collector_id);
    }
  })();

  createNotification({
    userId: pickup.household_id,
    type: 'pickup_completed',
    title: `Pickup completed & receipt ready: ${pickup.code}`,
    message: `${actualTotalWeight} kg recycled · ₹${actualTotalAmount} paid via ${paymentMethod}.`,
    link: `/dashboard/pickups/${pickup.id}`,
  });

  await syncPickupStatusToSupabase(pickup.code, {
    status: 'Completed',
    actual_total_weight: actualTotalWeight,
    actual_total_amount: actualTotalAmount,
  });

  res.json({ pickup: getPickupById(pickup.id) });
});

// ---------------------------------------------------------------------------
// RECYCLER ROUTES
// ---------------------------------------------------------------------------

apiRouter.get('/recycler/lots', requireAuth, requireRole(['recycler', 'admin']), (_req: AuthedRequest, res) => {
  const completedLots = db
    .prepare(`
      SELECT
        c.id as category_id,
        c.name as category_name,
        c.rate_per_kg as base_rate_per_kg,
        p.area,
        COUNT(DISTINCT p.id) as pickup_count,
        COALESCE(SUM(pi.actual_weight), 0) as collected_kg
      FROM pickup_items pi
      JOIN pickups p ON p.id = pi.pickup_id
      JOIN categories c ON c.id = pi.category_id
      WHERE p.status = 'Completed' AND pi.actual_weight > 0
      GROUP BY c.id, p.area
      ORDER BY collected_kg DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const orderedRows = db
    .prepare(`
      SELECT category_id, area, COALESCE(SUM(weight_kg), 0) as ordered_kg
      FROM recycler_orders
      WHERE status != 'Cancelled'
      GROUP BY category_id, area
    `)
    .all() as Array<{ category_id: number; area: string; ordered_kg: number }>;

  const orderedMap = new Map(orderedRows.map((o) => [`${o.category_id}:${o.area}`, Number(o.ordered_kg)]));

  const lots = completedLots
    .map((l) => {
      const key = `${l.category_id}:${l.area}`;
      const remaining = Math.max(0, Math.round((Number(l.collected_kg) - (orderedMap.get(key) || 0)) * 10) / 10);
      return {
        category_id: Number(l.category_id),
        category_name: String(l.category_name),
        city: 'Bengaluru',
        area: String(l.area),
        available_kg: remaining,
        base_rate_per_kg: Number(l.base_rate_per_kg),
        pickup_count: Number(l.pickup_count),
      };
    })
    .filter((l) => l.available_kg > 0);

  res.json({ lots });
});

apiRouter.get('/recycler/orders', requireAuth, requireRole(['recycler', 'admin']), (req: AuthedRequest, res) => {
  const user = req.user!;
  const rows =
    user.role === 'admin'
      ? db
          .prepare(`
            SELECT ro.*, u.name as recycler_name, rp.business_name
            FROM recycler_orders ro
            JOIN users u ON u.id = ro.recycler_id
            LEFT JOIN recycler_profiles rp ON rp.user_id = ro.recycler_id
            ORDER BY ro.id DESC
          `)
          .all()
      : db
          .prepare(`
            SELECT ro.*, u.name as recycler_name, rp.business_name
            FROM recycler_orders ro
            JOIN users u ON u.id = ro.recycler_id
            LEFT JOIN recycler_profiles rp ON rp.user_id = ro.recycler_id
            WHERE ro.recycler_id = ?
            ORDER BY ro.id DESC
          `)
          .all(user.id);

  res.json({ orders: rows });
});

apiRouter.post('/recycler/orders', requireAuth, requireRole(['recycler']), (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const rp = db.prepare('SELECT * FROM recycler_profiles WHERE user_id = ?').get(uid) as Record<string, unknown> | undefined;
  if (!rp || rp.kyc_status !== 'approved') {
    res.status(403).json({ error: 'Approved business KYC is required before placing bulk purchase requests.' });
    return;
  }

  const categoryId = Number(req.body?.category_id);
  const area = String(req.body?.area || '').trim();
  const weightKg = Number(req.body?.weight_kg);
  const offeredRate = Number(req.body?.offered_rate_per_kg);
  const pickupNotes = String(req.body?.pickup_notes || '').trim();

  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId) as Record<string, unknown> | undefined;
  if (!cat || !area || !Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(offeredRate) || offeredRate <= 0) {
    res.status(400).json({ error: 'Valid category, area, weight (kg), and offered ₹/kg rate are required.' });
    return;
  }

  const totalAmount = Math.round(weightKg * offeredRate * 100) / 100;
  const code = `RO-${getNowIST().year}-${Math.floor(100 + Math.random() * 900)}`;

  const orderId = Number(
    db
      .prepare(`
        INSERT INTO recycler_orders (
          code, recycler_id, category_id, category_name, city, area,
          weight_kg, offered_rate_per_kg, total_amount, status, pickup_notes
        ) VALUES (?, ?, ?, ?, 'Bengaluru', ?, ?, ?, ?, 'Requested', ?)
      `)
      .run(code, uid, categoryId, String(cat.name), area, weightKg, offeredRate, totalAmount, pickupNotes).lastInsertRowid
  );

  const admins = db.prepare(`SELECT id FROM users WHERE role = 'admin'`).all() as Array<{ id: number }>;
  for (const a of admins) {
    createNotification({
      userId: a.id,
      type: 'recycler_order',
      title: `Bulk purchase request: ${code}`,
      message: `${String(rp.business_name)} requested ${weightKg} kg of ${String(cat.name)} (${area}) @ ₹${offeredRate}/kg.`,
      link: '/admin/payments',
    });
  }

  res.status(201).json({ order: db.prepare('SELECT * FROM recycler_orders WHERE id = ?').get(orderId) });
});

apiRouter.patch('/recycler/profile', requireAuth, requireRole(['recycler']), (req: AuthedRequest, res) => {
  const uid = req.user!.id;
  const rp = db.prepare('SELECT * FROM recycler_profiles WHERE user_id = ?').get(uid) as Record<string, unknown> | undefined;
  if (!rp) {
    res.status(404).json({ error: 'Recycler profile not found.' });
    return;
  }

  const businessName = String(req.body?.business_name ?? rp.business_name).trim();
  const gstNumber = String(req.body?.gst_number ?? rp.gst_number).trim().toUpperCase();
  const city = String(req.body?.city ?? rp.city).trim();
  const acceptedCategories = Array.isArray(req.body?.accepted_categories)
    ? req.body.accepted_categories.map(Number)
    : JSON.parse(String(rp.accepted_categories || '[]'));
  const buyingRates =
    typeof req.body?.buying_rates === 'object' && req.body.buying_rates !== null
      ? req.body.buying_rates
      : JSON.parse(String(rp.buying_rates || '{}'));
  const newDoc = validateDataImage(req.body?.kyc_doc_image);

  db.prepare(`
    UPDATE recycler_profiles
    SET business_name = ?, gst_number = ?, city = ?, accepted_categories = ?, buying_rates = ?,
        kyc_doc_image = COALESCE(?, kyc_doc_image)
    WHERE user_id = ?
  `).run(businessName, gstNumber, city, JSON.stringify(acceptedCategories), JSON.stringify(buyingRates), newDoc, uid);

  res.json({ user: hydrateUser(uid) });
});

// ---------------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------------

apiRouter.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50')
    .all(req.user!.id) as Array<Record<string, unknown>>;
  res.json({
    notifications: rows.map((n) => ({
      ...n,
      is_read: Boolean(n.is_read),
      email_sent: Boolean(n.email_sent),
    })),
  });
});

apiRouter.patch('/notifications/:id/read', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user!.id);
  res.json({ ok: true });
});

apiRouter.post('/notifications/read-all', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADMIN PANEL ROUTES
// ---------------------------------------------------------------------------

apiRouter.use('/admin', requireAuth, requireRole(['admin']));

apiRouter.get('/admin/overview', (_req, res) => {
  const todayIST = getNowIST().dateStr;

  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const activeCollectors = (
    db
      .prepare(`SELECT COUNT(*) as c FROM collector_profiles cp JOIN users u ON u.id = cp.user_id WHERE u.status = 'active' AND cp.kyc_status = 'approved'`)
      .get() as { c: number }
  ).c;
  const pickupsToday = (
    db.prepare(`SELECT COUNT(*) as c FROM pickups WHERE pickup_date = ? AND status != 'Cancelled'`).get(todayIST) as { c: number }
  ).c;
  const pendingPickups = (
    db.prepare(`SELECT COUNT(*) as c FROM pickups WHERE status IN ('Requested','Assigned','En Route','Picked Up','Rescheduled')`).get() as { c: number }
  ).c;
  const completedStats = db
    .prepare(`
      SELECT COUNT(*) as c,
             COALESCE(SUM(actual_total_weight), 0) as total_kg,
             COALESCE(SUM(actual_total_amount), 0) as total_payout,
             COALESCE(SUM(commission_amount), 0) as total_commission
      FROM pickups WHERE status = 'Completed'
    `)
    .get() as { c: number; total_kg: number; total_payout: number; total_commission: number };

  const pickupsOverTime = db
    .prepare(`
      SELECT pickup_date as date,
             COUNT(*) as total,
             SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
             COALESCE(SUM(actual_total_weight), SUM(est_total_weight), 0) as weight_kg
      FROM pickups
      GROUP BY pickup_date
      ORDER BY pickup_date ASC
      LIMIT 14
    `)
    .all();

  const categoryWeight = db
    .prepare(`
      SELECT c.name, COALESCE(SUM(COALESCE(pi.actual_weight, pi.est_weight)), 0) as weight_kg
      FROM categories c
      LEFT JOIN pickup_items pi ON pi.category_id = c.id
      GROUP BY c.id
      ORDER BY weight_kg DESC
    `)
    .all();

  const areaDemand = db
    .prepare(`
      SELECT area, pincode, COUNT(*) as pickups,
             COALESCE(SUM(COALESCE(actual_total_weight, est_total_weight)), 0) as weight_kg
      FROM pickups
      GROUP BY area, pincode
      ORDER BY pickups DESC
      LIMIT 8
    `)
    .all();

  const topCollectors = db
    .prepare(`
      SELECT u.id, u.name, u.phone, cp.vehicle_type, cp.rating_avg, cp.total_pickups, cp.total_earnings, cp.is_online
      FROM users u
      JOIN collector_profiles cp ON cp.user_id = u.id
      WHERE u.role = 'collector'
      ORDER BY cp.total_pickups DESC, cp.rating_avg DESC
      LIMIT 6
    `)
    .all();

  res.json({
    kpis: {
      totalUsers,
      activeCollectors,
      pickupsToday,
      pendingPickups,
      completedPickups: Number(completedStats.c),
      totalKgRecycled: Math.round(Number(completedStats.total_kg) * 10) / 10,
      totalPayoutInr: Math.round(Number(completedStats.total_payout) * 100) / 100,
      totalCommissionInr: Math.round(Number(completedStats.total_commission) * 100) / 100,
    },
    charts: {
      pickupsOverTime,
      categoryWeight,
      areaDemand,
      topCollectors,
    },
  });
});

apiRouter.get('/admin/users', (req, res) => {
  const role = String(req.query.role || '').trim();
  const status = String(req.query.status || '').trim();
  const search = String(req.query.search || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize || 15)));

  let where = ' WHERE 1=1';
  const params: unknown[] = [];
  if (role && role !== 'all') {
    where += ' AND role = ?';
    params.push(role);
  }
  if (status && status !== 'all') {
    where += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    where += ' AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const total = (db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params) as { c: number }).c;
  const rows = db
    .prepare(`SELECT id FROM users ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as Array<{ id: number }>;

  const users = rows.map((r) => hydrateUser(r.id)).filter(Boolean);
  res.json({ users, total, page, pageSize });
});

apiRouter.post('/admin/users', (req: AuthedRequest, res) => {
  const roleRaw = String(req.body?.role || '').trim() as UserRole;
  if (!['household', 'collector', 'recycler'].includes(roleRaw)) {
    res.status(400).json({ error: 'Select a valid role (household, collector, or recycler).' });
    return;
  }

  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = cleanPhone(req.body?.phone);
  const password = String(req.body?.password || '');

  if (name.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (!PHONE_RE.test(phone)) {
    res.status(400).json({ error: 'Please provide a valid 10-digit Indian mobile number.' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const userId = db.transaction(() => {
    const newId = Number(
      db
        .prepare(`INSERT INTO users (role, name, email, phone, password_hash, status) VALUES (?, ?, ?, ?, ?, 'active')`)
        .run(roleRaw, name, email, phone, passwordHash).lastInsertRowid
    );

    if (roleRaw === 'collector') {
      const pincode = String(req.body?.pincode || '560038').trim();
      const vehicleType = String(req.body?.vehicle_type || 'Electric Cargo Trike').trim();
      const vehicleNumber = String(req.body?.vehicle_number || '').trim();
      db.prepare(`
        INSERT INTO collector_profiles (
          user_id, kyc_status, kyc_doc_type, kyc_doc_number,
          vehicle_type, vehicle_number, service_pincodes, working_days, is_online
        ) VALUES (?, 'approved', 'Aadhaar', '', ?, ?, ?, '[1,2,3,4,5,6]', 1)
      `).run(newId, vehicleType, vehicleNumber, JSON.stringify([PINCODE_RE.test(pincode) ? pincode : '560038']));
    } else if (roleRaw === 'recycler') {
      const businessName = String(req.body?.business_name || `${name} Recycling`).trim();
      const gstNumber = String(req.body?.gst_number || '').trim().toUpperCase();
      db.prepare(`
        INSERT INTO recycler_profiles (
          user_id, business_name, gst_number, kyc_status, city,
          service_pincodes, accepted_categories, buying_rates
        ) VALUES (?, ?, ?, 'approved', 'Bengaluru', '["560038","560034","560011"]', '[]', '{}')
      `).run(newId, businessName, gstNumber);
    }

    recordAudit({
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      actorRole: req.user!.role,
      action: 'ADMIN_USER_CREATED',
      entityType: roleRaw,
      entityId: newId,
      details: { email },
    });

    return newId;
  })();

  res.status(201).json({ user: hydrateUser(userId) });
});

apiRouter.patch('/admin/users/:id/password', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const newPassword = String(req.body?.password || '');
  if (newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters.' });
    return;
  }

  const target = db.prepare('SELECT id, role, email FROM users WHERE id = ?').get(targetId) as
    | { id: number; role: UserRole; email: string }
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  if (target.role === 'admin') {
    res.status(403).json({ error: 'Admin passcodes cannot be modified from user management.' });
    return;
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, targetId);

  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'USER_PASSWORD_RESET',
    entityType: target.role,
    entityId: targetId,
    details: { email: target.email },
  });

  res.json({ ok: true });
});

apiRouter.patch('/admin/users/:id/status', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const status = String(req.body?.status || '').trim();
  if (!['active', 'blocked'].includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  if (targetId === req.user!.id) {
    res.status(400).json({ error: 'Cannot block your own admin account.' });
    return;
  }
  db.prepare(`UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, targetId);
  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: status === 'blocked' ? 'USER_BLOCKED' : 'USER_UNBLOCKED',
    entityType: 'user',
    entityId: targetId,
  });
  res.json({ user: hydrateUser(targetId) });
});

apiRouter.patch('/admin/users/:id/kyc', (req: AuthedRequest, res) => {
  const targetId = Number(req.params.id);
  const kycStatus = String(req.body?.kyc_status || '').trim();
  if (!['approved', 'rejected', 'pending'].includes(kycStatus)) {
    res.status(400).json({ error: 'Invalid KYC status.' });
    return;
  }
  const target = hydrateUser(targetId);
  if (!target || !['collector', 'recycler'].includes(target.role)) {
    res.status(404).json({ error: 'Collector or recycler account not found.' });
    return;
  }

  if (target.role === 'collector') {
    db.prepare('UPDATE collector_profiles SET kyc_status = ? WHERE user_id = ?').run(kycStatus, targetId);
  } else {
    db.prepare('UPDATE recycler_profiles SET kyc_status = ? WHERE user_id = ?').run(kycStatus, targetId);
  }

  createNotification({
    userId: targetId,
    type: 'kyc_update',
    title: `KYC status updated: ${kycStatus.toUpperCase()}`,
    message:
      kycStatus === 'approved'
        ? 'Your ScrapEase partner verification is approved. You now have full operational access.'
        : 'Your KYC verification requires attention. Please review your submitted documents.',
    link: target.role === 'collector' ? '/collector/profile' : '/recycler/profile',
  });

  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: `KYC_${kycStatus.toUpperCase()}`,
    entityType: target.role,
    entityId: targetId,
  });

  res.json({ user: hydrateUser(targetId) });
});

apiRouter.post('/admin/pickups/:id/assign', async (req: AuthedRequest, res) => {
  const pickup = getPickupById(Number(req.params.id));
  if (!pickup) {
    res.status(404).json({ error: 'Pickup not found.' });
    return;
  }

  const collectorId = Number(req.body?.collector_id);
  const collector = hydrateUser(collectorId);
  if (!collector || collector.role !== 'collector' || collector.collector_profile?.kyc_status !== 'approved') {
    res.status(400).json({ error: 'Select a valid KYC-approved collector.' });
    return;
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE pickups SET collector_id = ?, status = 'Assigned', manual_queue = 0, assigned_at = ?, updated_at = ?
    WHERE id = ?
  `).run(collectorId, nowIso, nowIso, pickup.id);

  db.prepare(`
    INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
    VALUES (?, 'Assigned', ?, ?, 'admin', ?)
  `).run(pickup.id, `Manually assigned by admin to ${collector.name}.`, req.user!.id, nowIso);

  createNotification({
    userId: collectorId,
    type: 'new_assignment',
    title: `Admin assigned pickup: ${pickup.code}`,
    message: `${pickup.area} (${pickup.pincode}) on ${pickup.pickup_date} (${pickup.slot_label}).`,
    link: '/collector/requests',
  });
  createNotification({
    userId: pickup.household_id,
    type: 'collector_assigned',
    title: `Collector assigned: ${pickup.code}`,
    message: `${collector.name} has been assigned to your pickup.`,
    link: `/dashboard/pickups/${pickup.id}`,
  });

  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'PICKUP_MANUAL_ASSIGN',
    entityType: 'pickup',
    entityId: pickup.id,
    details: { collectorId, collectorName: collector.name },
  });

  await syncPickupStatusToSupabase(pickup.code, {
    status: 'Assigned',
    assigned_collector_name: collector.name,
  });

  res.json({ pickup: getPickupById(pickup.id) });
});

// Unified Admin Bookings Retrieval (SQLite + Supabase) & Full Appointment Editor
apiRouter.get('/admin/bookings', async (req: AuthedRequest, res) => {
  const statusFilter = String(req.query.status || '').trim();
  const search = String(req.query.search || '').trim().toLowerCase();
  const dateFilter = String(req.query.date || '').trim();
  const pincodeFilter = String(req.query.pincode || '').trim();
  const manualOnly = req.query.manualQueue === 'true';

  const localRows = db
    .prepare(`
      SELECT p.*,
             h.name as household_name, h.email as household_email, h.phone as household_phone,
             c.name as collector_name, c.phone as collector_phone,
             cp.rating_avg as collector_rating
      FROM pickups p
      LEFT JOIN users h ON h.id = p.household_id
      LEFT JOIN users c ON c.id = p.collector_id
      LEFT JOIN collector_profiles cp ON cp.user_id = p.collector_id
      ORDER BY p.pickup_date DESC, p.id DESC
      LIMIT 300
    `)
    .all() as Array<Record<string, unknown>>;

  const supa = await fetchAllBookingsFromSupabase();
  const supaCodes = new Set(supa.rows.map((r) => r.pickup_code));

  const localBookings = localRows.map((row) => {
    const p = hydratePickupRow(row);
    return {
      ...p,
      source: (supaCodes.has(p.code) ? 'synced' : 'local') as 'synced' | 'local',
    };
  });

  const localCodes = new Set(localBookings.map((b) => b.code));
  const supabaseOnlyBookings = supa.rows
    .filter((r) => !localCodes.has(r.pickup_code))
    .map((r) => ({
      id: -Math.abs(Number(r.id) || 1),
      code: r.pickup_code,
      household_id: 0,
      household_name: r.customer_name,
      household_email: r.customer_email,
      household_phone: r.customer_phone,
      source: 'supabase' as const,
      collector_id: null,
      collector_name: r.assigned_collector_name,
      collector_phone: null,
      collector_rating: null,
      address_id: null,
      address_snapshot: {
        label: 'Home',
        line1: r.address_line1,
        line2: r.address_line2 || '',
        area: r.area,
        city: r.city || 'Bengaluru',
        pincode: r.pincode,
      },
      pincode: r.pincode,
      area: r.area,
      pickup_date: r.pickup_date,
      slot_id: r.slot_id,
      slot_label: r.slot_label,
      status: (r.status || 'Requested') as PickupStatus,
      est_total_weight: Number(r.est_total_weight || 0),
      est_total_amount: Number(r.est_total_amount || 0),
      actual_total_weight: r.actual_total_weight === null ? null : Number(r.actual_total_weight),
      actual_total_amount: r.actual_total_amount === null ? null : Number(r.actual_total_amount),
      commission_rate: 5,
      commission_amount: 0,
      payment_method: null,
      payment_status: 'Pending' as const,
      late_flag: false,
      manual_queue: false,
      notes: r.notes || '',
      photos: [],
      assigned_at: null,
      created_at: r.created_at,
      updated_at: r.updated_at || r.created_at,
      items: Array.isArray(r.items)
        ? r.items.map((it) => ({
            category_id: Number(it.category_id),
            category_name: String(it.category_name),
            est_weight: Number(it.est_weight),
            actual_weight: null,
            rate_per_kg: Number(it.rate_per_kg),
            amount: Number(it.amount),
          }))
        : [],
      timeline: [
        {
          id: 1,
          pickup_id: -Math.abs(Number(r.id) || 1),
          status: r.status || 'Requested',
          note: 'Retrieved from Supabase pickup_bookings.',
          actor_id: null,
          actor_role: 'system',
          created_at: r.created_at,
        },
      ],
      review: null,
    }));

  const allBookings = [...localBookings, ...supabaseOnlyBookings].sort((a, b) => {
    const dateCmp = String(b.pickup_date).localeCompare(String(a.pickup_date));
    if (dateCmp !== 0) return dateCmp;
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  const filtered = allBookings.filter((b) => {
    if (statusFilter && statusFilter !== 'All' && b.status !== statusFilter) return false;
    if (dateFilter && b.pickup_date !== dateFilter) return false;
    if (pincodeFilter && b.pincode !== pincodeFilter) return false;
    if (manualOnly && !b.manual_queue) return false;
    if (search) {
      const hay = [
        b.code,
        b.household_name || '',
        b.household_email || '',
        b.household_phone || '',
        b.area,
        b.pincode,
        b.address_snapshot?.line1 || '',
        b.collector_name || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const summary = {
    total: allBookings.length,
    active: allBookings.filter((b) => ['Requested', 'Assigned', 'En Route', 'Picked Up', 'Rescheduled'].includes(b.status)).length,
    completed: allBookings.filter((b) => b.status === 'Completed').length,
    cancelled: allBookings.filter((b) => b.status === 'Cancelled').length,
    supabaseConnected: supa.connected,
    supabaseHasServiceRole: supa.hasServiceRole,
    supabaseCount: supa.rows.length,
    supabaseError: supa.error || null,
  };

  res.json({ bookings: filtered, summary });
});

apiRouter.patch('/admin/bookings/:id', async (req: AuthedRequest, res) => {
  const pickupId = Number(req.params.id);
  const existing = getPickupById(pickupId);
  if (!existing) {
    res.status(404).json({ error: 'Appointment not found.' });
    return;
  }

  const settings = getScheduleSettings();
  const allowedStatuses: PickupStatus[] = [
    'Requested',
    'Assigned',
    'En Route',
    'Picked Up',
    'Completed',
    'Rescheduled',
    'Cancelled',
  ];

  const nextStatus = (req.body?.status ? String(req.body.status).trim() : existing.status) as PickupStatus;
  if (!allowedStatuses.includes(nextStatus)) {
    res.status(400).json({ error: 'Invalid appointment status.' });
    return;
  }

  const nextDate = req.body?.pickup_date ? String(req.body.pickup_date).trim() : existing.pickup_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
    res.status(400).json({ error: 'Valid pickup date (YYYY-MM-DD) is required.' });
    return;
  }

  const nextSlotId = req.body?.slot_id ? String(req.body.slot_id).trim() : existing.slot_id;
  const nextSlot = settings.slots.find((s) => s.id === nextSlotId);
  if (!nextSlot) {
    res.status(400).json({ error: 'Valid 2-hour pickup slot is required.' });
    return;
  }

  let nextCollectorId: number | null =
    req.body?.collector_id === null || req.body?.collector_id === '' || req.body?.collector_id === 0
      ? null
      : req.body?.collector_id !== undefined
        ? Number(req.body.collector_id)
        : existing.collector_id;

  let nextCollectorName: string | null = existing.collector_name || null;
  if (nextCollectorId !== null) {
    const col = hydrateUser(nextCollectorId);
    if (!col || col.role !== 'collector' || col.collector_profile?.kyc_status !== 'approved') {
      res.status(400).json({ error: 'Selected collector must be a KYC-approved active collector.' });
      return;
    }
    nextCollectorName = col.name;
  } else {
    nextCollectorName = null;
  }

  const addrBody = req.body?.address || {};
  const nextAddr = {
    label: String(addrBody.label ?? existing.address_snapshot.label ?? 'Home').trim(),
    line1: String(addrBody.line1 ?? existing.address_snapshot.line1).trim(),
    line2: String(addrBody.line2 ?? existing.address_snapshot.line2 ?? '').trim(),
    area: String(addrBody.area ?? existing.area).trim(),
    city: String(addrBody.city ?? existing.address_snapshot.city ?? 'Bengaluru').trim(),
    pincode: String(addrBody.pincode ?? existing.pincode).trim(),
  };

  if (nextAddr.line1.length < 3 || nextAddr.area.length < 2 || !PINCODE_RE.test(nextAddr.pincode)) {
    res.status(400).json({ error: 'Valid street address, area, and 6-digit pincode are required.' });
    return;
  }

  const customerName =
    req.body?.customer_name !== undefined ? String(req.body.customer_name).trim() : existing.household_name || '';
  const customerPhone =
    req.body?.customer_phone !== undefined ? cleanPhone(req.body.customer_phone) : existing.household_phone || '';

  if (customerName.length < 2) {
    res.status(400).json({ error: 'Customer name must be at least 2 characters.' });
    return;
  }
  if (req.body?.customer_phone !== undefined && !PHONE_RE.test(customerPhone)) {
    res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
    return;
  }

  const nextNotes = req.body?.notes !== undefined ? String(req.body.notes).trim().slice(0, 600) : existing.notes;
  const nextPaymentMethod =
    req.body?.payment_method === null || req.body?.payment_method === ''
      ? null
      : ['Cash', 'UPI'].includes(String(req.body?.payment_method || ''))
        ? String(req.body.payment_method)
        : existing.payment_method;
  const nextPaymentStatus = ['Pending', 'Paid'].includes(String(req.body?.payment_status || ''))
    ? String(req.body.payment_status)
    : existing.payment_status;

  let nextEstWeight = existing.est_total_weight;
  let nextEstAmount = existing.est_total_amount;
  let validatedItems: Array<{
    category_id: number;
    category_name: string;
    est_weight: number;
    actual_weight: number | null;
    rate_per_kg: number;
    amount: number;
  }> | null = null;

  if (Array.isArray(req.body?.items)) {
    if (req.body.items.length === 0) {
      res.status(400).json({ error: 'At least one scrap category must remain selected.' });
      return;
    }
    const categories = db.prepare('SELECT * FROM categories').all() as Array<Record<string, unknown>>;
    const catMap = new Map(categories.map((c) => [Number(c.id), c]));
    validatedItems = [];
    for (const row of req.body.items) {
      const catId = Number(row.category_id);
      const estW = Number(row.est_weight);
      const cat = catMap.get(catId);
      if (!cat || !Number.isFinite(estW) || estW <= 0 || estW > 5000) {
        res.status(400).json({ error: 'Each scrap item must have a valid category and positive weight (kg).' });
        return;
      }
      const rate = Number(cat.rate_per_kg);
      const prev = existing.items.find((i) => i.category_id === catId);
      const actualW =
        row.actual_weight !== undefined && row.actual_weight !== null && row.actual_weight !== ''
          ? Number(row.actual_weight)
          : prev?.actual_weight ?? null;
      const calcWeight = actualW !== null ? actualW : estW;
      validatedItems.push({
        category_id: catId,
        category_name: String(cat.name),
        est_weight: Math.round(estW * 100) / 100,
        actual_weight: actualW !== null ? Math.round(actualW * 100) / 100 : null,
        rate_per_kg: rate,
        amount: Math.round(calcWeight * rate * 100) / 100,
      });
    }
    nextEstWeight = Math.round(validatedItems.reduce((s, i) => s + i.est_weight, 0) * 100) / 100;
    nextEstAmount = Math.round(validatedItems.reduce((s, i) => s + i.est_weight * i.rate_per_kg, 0) * 100) / 100;
  }

  const nowIso = new Date().toISOString();

  db.transaction(() => {
    if (existing.household_id > 0 && (customerName !== existing.household_name || customerPhone !== existing.household_phone)) {
      db.prepare(`UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?`).run(
        customerName,
        customerPhone,
        nowIso,
        existing.household_id
      );
    }

    db.prepare(`
      UPDATE pickups
      SET collector_id = ?, address_snapshot = ?, pincode = ?, area = ?,
          pickup_date = ?, slot_id = ?, slot_label = ?, status = ?,
          est_total_weight = ?, est_total_amount = ?,
          payment_method = ?, payment_status = ?, notes = ?,
          manual_queue = CASE WHEN ? IS NOT NULL THEN 0 ELSE manual_queue END,
          assigned_at = CASE WHEN ? IS NOT NULL AND assigned_at IS NULL THEN ? ELSE assigned_at END,
          updated_at = ?
      WHERE id = ?
    `).run(
      nextCollectorId,
      JSON.stringify(nextAddr),
      nextAddr.pincode,
      nextAddr.area,
      nextDate,
      nextSlot.id,
      nextSlot.label,
      nextStatus,
      nextEstWeight,
      nextEstAmount,
      nextPaymentMethod,
      nextPaymentStatus,
      nextNotes,
      nextCollectorId,
      nextCollectorId,
      nowIso,
      nowIso,
      existing.id
    );

    if (validatedItems) {
      db.prepare('DELETE FROM pickup_items WHERE pickup_id = ?').run(existing.id);
      const ins = db.prepare(`
        INSERT INTO pickup_items (pickup_id, category_id, category_name, est_weight, actual_weight, rate_per_kg, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const it of validatedItems) {
        ins.run(existing.id, it.category_id, it.category_name, it.est_weight, it.actual_weight, it.rate_per_kg, it.amount);
      }
    }

    const changeParts: string[] = [];
    if (nextStatus !== existing.status) changeParts.push(`status -> ${nextStatus}`);
    if (nextDate !== existing.pickup_date || nextSlot.id !== existing.slot_id) {
      changeParts.push(`slot -> ${nextDate} (${nextSlot.label})`);
    }
    if (nextCollectorId !== existing.collector_id) {
      changeParts.push(`collector -> ${nextCollectorName || 'Unassigned'}`);
    }
    if (nextAddr.pincode !== existing.pincode || nextAddr.line1 !== existing.address_snapshot.line1) {
      changeParts.push(`address updated`);
    }
    if (validatedItems) changeParts.push(`items updated (${nextEstWeight} kg)`);

    db.prepare(`
      INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
      VALUES (?, ?, ?, ?, 'admin', ?)
    `).run(
      existing.id,
      nextStatus,
      `Edited by admin${changeParts.length ? `: ${changeParts.join(', ')}` : '.'}`,
      req.user!.id,
      nowIso
    );
  })();

  if (existing.household_id > 0 && (nextStatus !== existing.status || nextDate !== existing.pickup_date || nextSlot.id !== existing.slot_id)) {
    createNotification({
      userId: existing.household_id,
      type: 'pickup_updated',
      title: `Appointment ${existing.code} updated`,
      message: `Status: ${nextStatus} · ${nextDate} (${nextSlot.label}).`,
      link: `/dashboard/pickups/${existing.id}`,
    });
  }

  if (nextCollectorId && nextCollectorId !== existing.collector_id) {
    createNotification({
      userId: nextCollectorId,
      type: 'new_assignment',
      title: `Assigned appointment: ${existing.code}`,
      message: `${nextAddr.area} (${nextAddr.pincode}) on ${nextDate} (${nextSlot.label}).`,
      link: '/collector/requests',
    });
  }

  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'PICKUP_ADMIN_UPDATED',
    entityType: 'pickup',
    entityId: existing.id,
    details: { code: existing.code, status: nextStatus, pickupDate: nextDate, slotId: nextSlot.id },
  });

  const updated = getPickupById(existing.id)!;
  await syncPickupStatusToSupabase(existing.code, {
    status: updated.status,
    customer_name: updated.household_name || customerName,
    customer_phone: updated.household_phone || customerPhone,
    address_line1: updated.address_snapshot.line1,
    address_line2: updated.address_snapshot.line2 || '',
    area: updated.area,
    city: updated.address_snapshot.city || 'Bengaluru',
    pincode: updated.pincode,
    pickup_date: updated.pickup_date,
    slot_id: updated.slot_id,
    slot_label: updated.slot_label,
    items: updated.items.map((i) => ({
      category_id: i.category_id,
      category_name: i.category_name,
      est_weight: i.est_weight,
      rate_per_kg: i.rate_per_kg,
      amount: i.amount,
    })),
    est_total_weight: updated.est_total_weight,
    est_total_amount: updated.est_total_amount,
    assigned_collector_name: updated.collector_name || null,
    notes: updated.notes,
  });

  res.json({ pickup: updated });
});

apiRouter.patch('/admin/supabase-bookings/:code', async (req: AuthedRequest, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) {
    res.status(400).json({ error: 'Booking code is required.' });
    return;
  }

  const settings = getScheduleSettings();
  const updates: Record<string, unknown> = {};

  if (req.body?.status) updates.status = String(req.body.status).trim();
  if (req.body?.pickup_date) updates.pickup_date = String(req.body.pickup_date).trim();
  if (req.body?.slot_id) {
    const slot = settings.slots.find((s) => s.id === String(req.body.slot_id).trim());
    if (slot) {
      updates.slot_id = slot.id;
      updates.slot_label = slot.label;
    }
  }
  if (req.body?.customer_name) updates.customer_name = String(req.body.customer_name).trim();
  if (req.body?.customer_phone) updates.customer_phone = cleanPhone(req.body.customer_phone);
  if (req.body?.notes !== undefined) updates.notes = String(req.body.notes).trim();
  if (req.body?.address) {
    if (req.body.address.line1) updates.address_line1 = String(req.body.address.line1).trim();
    if (req.body.address.line2 !== undefined) updates.address_line2 = String(req.body.address.line2).trim();
    if (req.body.address.area) updates.area = String(req.body.address.area).trim();
    if (req.body.address.pincode) updates.pincode = String(req.body.address.pincode).trim();
  }
  if (req.body?.assigned_collector_name !== undefined) {
    updates.assigned_collector_name = req.body.assigned_collector_name
      ? String(req.body.assigned_collector_name).trim()
      : null;
  }

  const result = await syncPickupStatusToSupabase(code, updates);
  if (!result.updated) {
    res.status(400).json({ error: result.reason || 'Unable to update booking in Supabase.' });
    return;
  }

  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'SUPABASE_BOOKING_UPDATED',
    entityType: 'pickup_booking',
    entityId: code,
    details: updates,
  });

  res.json({ ok: true });
});

// Rates & Categories
apiRouter.get('/admin/categories', (_req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  const history = db
    .prepare(`
      SELECT rh.*, c.name as category_name, u.name as changed_by_name
      FROM rate_history rh
      JOIN categories c ON c.id = rh.category_id
      LEFT JOIN users u ON u.id = rh.changed_by
      ORDER BY rh.id DESC LIMIT 50
    `)
    .all();
  res.json({
    categories: categories.map((c) => ({ ...c, is_active: Boolean(c.is_active) })),
    history,
  });
});

apiRouter.post('/admin/categories', (req: AuthedRequest, res) => {
  const name = String(req.body?.name || '').trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const icon = String(req.body?.icon || 'Layers').trim();
  const description = String(req.body?.description || '').trim();
  const rate = Number(req.body?.rate_per_kg);
  const co2 = Number(req.body?.co2_factor_per_kg || 1.5);

  if (name.length < 2 || !Number.isFinite(rate) || rate <= 0) {
    res.status(400).json({ error: 'Valid category name and positive ₹/kg rate are required.' });
    return;
  }

  const id = Number(
    db
      .prepare(`
        INSERT INTO categories (slug, name, icon, description, rate_per_kg, unit, co2_factor_per_kg, is_active)
        VALUES (?, ?, ?, ?, ?, 'kg', ?, 1)
      `)
      .run(slug, name, icon, description, rate, co2).lastInsertRowid
  );

  db.prepare(`INSERT INTO rate_history (category_id, old_rate, new_rate, changed_by) VALUES (?, 0, ?, ?)`).run(
    id,
    rate,
    req.user!.id
  );
  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'CATEGORY_CREATED',
    entityType: 'category',
    entityId: id,
    details: { name, rate },
  });

  res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(id) });
});

apiRouter.patch('/admin/categories/:id', (req: AuthedRequest, res) => {
  const catId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(catId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Category not found.' });
    return;
  }

  const name = String(req.body?.name ?? existing.name).trim();
  const description = String(req.body?.description ?? existing.description).trim();
  const newRate = req.body?.rate_per_kg !== undefined ? Number(req.body.rate_per_kg) : Number(existing.rate_per_kg);
  const co2 = req.body?.co2_factor_per_kg !== undefined ? Number(req.body.co2_factor_per_kg) : Number(existing.co2_factor_per_kg);
  const isActive = req.body?.is_active !== undefined ? Boolean(req.body.is_active) : Boolean(existing.is_active);

  if (!Number.isFinite(newRate) || newRate <= 0) {
    res.status(400).json({ error: 'Rate per kg must be positive.' });
    return;
  }

  db.prepare(`
    UPDATE categories
    SET name = ?, description = ?, rate_per_kg = ?, co2_factor_per_kg = ?, is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name, description, newRate, co2, isActive ? 1 : 0, catId);

  if (newRate !== Number(existing.rate_per_kg)) {
    db.prepare(`INSERT INTO rate_history (category_id, old_rate, new_rate, changed_by) VALUES (?, ?, ?, ?)`).run(
      catId,
      Number(existing.rate_per_kg),
      newRate,
      req.user!.id
    );
  }

  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'CATEGORY_RATE_UPDATED',
    entityType: 'category',
    entityId: catId,
    details: { name, oldRate: existing.rate_per_kg, newRate },
  });

  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(catId) });
});

apiRouter.delete('/admin/categories/:id', (req: AuthedRequest, res) => {
  const catId = Number(req.params.id);
  const used = (db.prepare('SELECT COUNT(*) as c FROM pickup_items WHERE category_id = ?').get(catId) as { c: number }).c;
  if (used > 0) {
    db.prepare('UPDATE categories SET is_active = 0 WHERE id = ?').run(catId);
  } else {
    db.prepare('DELETE FROM categories WHERE id = ?').run(catId);
  }
  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'CATEGORY_REMOVED',
    entityType: 'category',
    entityId: catId,
  });
  res.json({ ok: true });
});

// Slot & Timing Settings
apiRouter.get('/admin/settings', (_req, res) => {
  res.json({ settings: getScheduleSettings() });
});

apiRouter.patch('/admin/settings', (req: AuthedRequest, res) => {
  const current = getScheduleSettings();
  const operatingDays = Array.isArray(req.body?.operating_days)
    ? req.body.operating_days.map(Number).filter((d: number) => d >= 0 && d <= 6)
    : current.operating_days;
  const startHour = req.body?.start_hour !== undefined ? Number(req.body.start_hour) : current.start_hour;
  const endHour = req.body?.end_hour !== undefined ? Number(req.body.end_hour) : current.end_hour;
  const slots = Array.isArray(req.body?.slots) ? req.body.slots : current.slots;
  const defaultCap = req.body?.default_slot_capacity !== undefined ? Number(req.body.default_slot_capacity) : current.default_slot_capacity;
  const holidays = Array.isArray(req.body?.holidays) ? req.body.holidays.map(String) : current.holidays;
  const serviceAreas = Array.isArray(req.body?.service_areas) ? req.body.service_areas : current.service_areas;
  const commissionPercent =
    req.body?.commission_percent !== undefined ? Number(req.body.commission_percent) : current.commission_percent;
  const timeoutMins =
    req.body?.auto_assign_timeout_mins !== undefined
      ? Number(req.body.auto_assign_timeout_mins)
      : current.auto_assign_timeout_mins;

  db.prepare(`
    UPDATE schedule_settings
    SET operating_days = ?, start_hour = ?, end_hour = ?, slots = ?,
        default_slot_capacity = ?, holidays = ?, service_areas = ?,
        commission_percent = ?, auto_assign_timeout_mins = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(
    JSON.stringify(operatingDays),
    startHour,
    endHour,
    JSON.stringify(slots),
    defaultCap,
    JSON.stringify(holidays),
    JSON.stringify(serviceAreas),
    commissionPercent,
    timeoutMins
  );

  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'SCHEDULE_SETTINGS_UPDATED',
    entityType: 'schedule_settings',
    entityId: '1',
    details: { commissionPercent, defaultCap, holidaysCount: holidays.length },
  });

  res.json({ settings: getScheduleSettings() });
});

// Payments & Recycler Orders
apiRouter.get('/admin/payments', (_req, res) => {
  const payouts = db
    .prepare(`
      SELECT p.id, p.code, p.pickup_date, p.area, p.pincode,
             p.actual_total_weight, p.actual_total_amount, p.commission_rate, p.commission_amount,
             p.payment_method, p.payment_status, p.updated_at,
             h.name as household_name, c.name as collector_name
      FROM pickups p
      LEFT JOIN users h ON h.id = p.household_id
      LEFT JOIN users c ON c.id = p.collector_id
      WHERE p.status = 'Completed'
      ORDER BY p.id DESC
    `)
    .all();

  const recyclerOrders = db
    .prepare(`
      SELECT ro.*, u.name as recycler_name, rp.business_name
      FROM recycler_orders ro
      JOIN users u ON u.id = ro.recycler_id
      LEFT JOIN recycler_profiles rp ON rp.user_id = ro.recycler_id
      ORDER BY ro.id DESC
    `)
    .all();

  res.json({ payouts, recyclerOrders, commissionPercent: getScheduleSettings().commission_percent });
});

apiRouter.patch('/admin/recycler-orders/:id', (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '').trim();
  if (!['Requested', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'].includes(status)) {
    res.status(400).json({ error: 'Invalid order status.' });
    return;
  }
  db.prepare(`UPDATE recycler_orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
  const order = db.prepare('SELECT * FROM recycler_orders WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (order) {
    createNotification({
      userId: Number(order.recycler_id),
      type: 'recycler_order_update',
      title: `Bulk order ${String(order.code)}: ${status}`,
      message: `${String(order.weight_kg)} kg ${String(order.category_name)} order updated to ${status}.`,
      link: '/recycler/orders',
    });
  }
  recordAudit({
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    actorRole: req.user!.role,
    action: 'RECYCLER_ORDER_STATUS',
    entityType: 'recycler_order',
    entityId: id,
    details: { status },
  });
  res.json({ order });
});

// Content Management (FAQs, Testimonials, Banners, Contact Messages)
apiRouter.get('/admin/content', (_req, res) => {
  res.json({
    faqs: db.prepare('SELECT * FROM faqs ORDER BY sort_order ASC, id ASC').all(),
    testimonials: db.prepare('SELECT * FROM testimonials ORDER BY id ASC').all(),
    banners: db.prepare('SELECT * FROM site_banners ORDER BY id ASC').all(),
    contactMessages: db.prepare('SELECT * FROM contact_messages ORDER BY id DESC').all(),
  });
});

apiRouter.post('/admin/faqs', (req: AuthedRequest, res) => {
  const question = String(req.body?.question || '').trim();
  const answer = String(req.body?.answer || '').trim();
  const category = String(req.body?.category || 'General').trim();
  if (!question || !answer) {
    res.status(400).json({ error: 'Question and answer are required.' });
    return;
  }
  const id = Number(
    db.prepare('INSERT INTO faqs (question, answer, category, sort_order) VALUES (?, ?, ?, 99)').run(question, answer, category).lastInsertRowid
  );
  recordAudit({ actorId: req.user!.id, actorEmail: req.user!.email, actorRole: req.user!.role, action: 'FAQ_CREATED', entityType: 'faq', entityId: id });
  res.status(201).json({ faq: db.prepare('SELECT * FROM faqs WHERE id = ?').get(id) });
});

apiRouter.delete('/admin/faqs/:id', (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM faqs WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

apiRouter.post('/admin/testimonials', (req: AuthedRequest, res) => {
  const name = String(req.body?.name || '').trim();
  const role = String(req.body?.role || '').trim();
  const area = String(req.body?.area || '').trim();
  const quote = String(req.body?.quote || '').trim();
  const metric = String(req.body?.metric || '').trim();
  if (!name || !quote) {
    res.status(400).json({ error: 'Name and quote are required.' });
    return;
  }
  const id = Number(
    db.prepare('INSERT INTO testimonials (name, role, area, quote, metric) VALUES (?, ?, ?, ?, ?)').run(name, role, area, quote, metric).lastInsertRowid
  );
  res.status(201).json({ testimonial: db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id) });
});

apiRouter.delete('/admin/testimonials/:id', (_req, res) => {
  db.prepare('DELETE FROM testimonials WHERE id = ?').run(Number(_req.params.id));
  res.json({ ok: true });
});

apiRouter.patch('/admin/banners/:key', (req: AuthedRequest, res) => {
  const title = String(req.body?.title || '').trim();
  const subtitle = String(req.body?.subtitle || '').trim();
  const ctaText = String(req.body?.cta_text || 'Schedule Pickup').trim();
  db.prepare('UPDATE site_banners SET title = ?, subtitle = ?, cta_text = ? WHERE key = ?').run(title, subtitle, ctaText, req.params.key);
  recordAudit({ actorId: req.user!.id, actorEmail: req.user!.email, actorRole: req.user!.role, action: 'BANNER_UPDATED', entityType: 'banner', entityId: req.params.key });
  res.json({ banner: db.prepare('SELECT * FROM site_banners WHERE key = ?').get(req.params.key) });
});

apiRouter.patch('/admin/contact-messages/:id', (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const reply = String(req.body?.admin_reply || '').trim();
  const status = String(req.body?.status || 'Replied').trim();
  db.prepare(`UPDATE contact_messages SET admin_reply = ?, status = ?, replied_at = datetime('now') WHERE id = ?`).run(
    reply,
    status,
    id
  );
  recordAudit({ actorId: req.user!.id, actorEmail: req.user!.email, actorRole: req.user!.role, action: 'CONTACT_REPLIED', entityType: 'contact_message', entityId: id });
  res.json({ message: db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(id) });
});

apiRouter.get('/admin/audit-logs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all() as Array<Record<string, unknown>>;
  res.json({
    logs: rows.map((r) => ({ ...r, details: JSON.parse(String(r.details || '{}')) })),
  });
});
