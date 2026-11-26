import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SLOTS, getNowIST, addDaysToDateStr } from '../src/shared/scheduling.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'scrapease.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK(role IN ('household', 'collector', 'recycler', 'admin')),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'blocked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      line1 TEXT NOT NULL,
      line2 TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Bengaluru',
      pincode TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);
    CREATE INDEX IF NOT EXISTS idx_addresses_pincode ON addresses(pincode);

    CREATE TABLE IF NOT EXISTS collector_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK(kyc_status IN ('pending', 'approved', 'rejected')),
      kyc_doc_type TEXT NOT NULL DEFAULT 'Aadhaar',
      kyc_doc_number TEXT NOT NULL DEFAULT '',
      kyc_doc_image TEXT,
      vehicle_type TEXT NOT NULL DEFAULT 'Electric Cargo Trike',
      vehicle_number TEXT NOT NULL DEFAULT '',
      service_pincodes TEXT NOT NULL DEFAULT '[]',
      working_days TEXT NOT NULL DEFAULT '[1,2,3,4,5,6]',
      working_start TEXT NOT NULL DEFAULT '08:00',
      working_end TEXT NOT NULL DEFAULT '20:00',
      is_online INTEGER NOT NULL DEFAULT 1,
      rating_avg REAL NOT NULL DEFAULT 5.0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      total_pickups INTEGER NOT NULL DEFAULT 0,
      total_earnings REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS recycler_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      gst_number TEXT NOT NULL DEFAULT '',
      kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK(kyc_status IN ('pending', 'approved', 'rejected')),
      kyc_doc_image TEXT,
      city TEXT NOT NULL DEFAULT 'Bengaluru',
      service_pincodes TEXT NOT NULL DEFAULT '[]',
      accepted_categories TEXT NOT NULL DEFAULT '[]',
      buying_rates TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      rate_per_kg REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      co2_factor_per_kg REAL NOT NULL DEFAULT 1.5,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

    CREATE TABLE IF NOT EXISTS rate_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      old_rate REAL NOT NULL,
      new_rate REAL NOT NULL,
      changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rate_history_cat ON rate_history(category_id);

    CREATE TABLE IF NOT EXISTS pickups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      household_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      collector_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      address_id INTEGER REFERENCES addresses(id) ON DELETE SET NULL,
      address_snapshot TEXT NOT NULL,
      pincode TEXT NOT NULL,
      area TEXT NOT NULL,
      pickup_date TEXT NOT NULL,
      slot_id TEXT NOT NULL,
      slot_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Requested' CHECK(status IN ('Requested','Assigned','En Route','Picked Up','Completed','Cancelled','Rescheduled')),
      est_total_weight REAL NOT NULL DEFAULT 0,
      est_total_amount REAL NOT NULL DEFAULT 0,
      actual_total_weight REAL,
      actual_total_amount REAL,
      commission_rate REAL NOT NULL DEFAULT 5.0,
      commission_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT CHECK(payment_method IN ('Cash','UPI') OR payment_method IS NULL),
      payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK(payment_status IN ('Pending','Paid')),
      late_flag INTEGER NOT NULL DEFAULT 0,
      manual_queue INTEGER NOT NULL DEFAULT 0,
      reminder_24h_sent INTEGER NOT NULL DEFAULT 0,
      reminder_1h_sent INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      photos TEXT NOT NULL DEFAULT '[]',
      assigned_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pickups_household ON pickups(household_id);
    CREATE INDEX IF NOT EXISTS idx_pickups_collector ON pickups(collector_id);
    CREATE INDEX IF NOT EXISTS idx_pickups_date_slot ON pickups(pickup_date, slot_id);
    CREATE INDEX IF NOT EXISTS idx_pickups_pincode ON pickups(pincode);
    CREATE INDEX IF NOT EXISTS idx_pickups_status ON pickups(status);

    CREATE TABLE IF NOT EXISTS pickup_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pickup_id INTEGER NOT NULL REFERENCES pickups(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      category_name TEXT NOT NULL,
      est_weight REAL NOT NULL,
      actual_weight REAL,
      rate_per_kg REAL NOT NULL,
      amount REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_pickup_items_pickup ON pickup_items(pickup_id);

    CREATE TABLE IF NOT EXISTS pickup_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pickup_id INTEGER NOT NULL REFERENCES pickups(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_timeline_pickup ON pickup_timeline(pickup_id);

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pickup_id INTEGER NOT NULL UNIQUE REFERENCES pickups(id) ON DELETE CASCADE,
      household_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      collector_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_collector ON reviews(collector_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      email_sent INTEGER NOT NULL DEFAULT 1,
      sms_ready_payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

    CREATE TABLE IF NOT EXISTS schedule_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      operating_days TEXT NOT NULL,
      start_hour INTEGER NOT NULL DEFAULT 8,
      end_hour INTEGER NOT NULL DEFAULT 20,
      slots TEXT NOT NULL,
      default_slot_capacity INTEGER NOT NULL DEFAULT 10,
      holidays TEXT NOT NULL DEFAULT '[]',
      service_areas TEXT NOT NULL DEFAULT '[]',
      commission_percent REAL NOT NULL DEFAULT 5.0,
      auto_assign_timeout_mins INTEGER NOT NULL DEFAULT 15,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recycler_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      recycler_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES categories(id),
      category_name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Bengaluru',
      area TEXT NOT NULL DEFAULT 'All Zones',
      weight_kg REAL NOT NULL,
      offered_rate_per_kg REAL NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Requested' CHECK(status IN ('Requested','Confirmed','Dispatched','Delivered','Cancelled')),
      pickup_notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_recycler_orders_recycler ON recycler_orders(recycler_id);

    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      area TEXT NOT NULL,
      quote TEXT NOT NULL,
      metric TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS site_banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      cta_text TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New','Replied','Resolved')),
      admin_reply TEXT,
      replied_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT NOT NULL DEFAULT 'system',
      actor_role TEXT NOT NULL DEFAULT 'system',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

    CREATE TABLE IF NOT EXISTS admin_security (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      admin_email TEXT NOT NULL DEFAULT 'admin@scrapease.com',
      passcode_hash TEXT NOT NULL DEFAULT '',
      claimed INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function ensureAdminSecurityState(): void {
  const existingSec = db.prepare('SELECT id, admin_email, passcode_hash, claimed FROM admin_security WHERE id = 1').get() as
    | { id: number; admin_email: string; passcode_hash: string; claimed: number }
    | undefined;

  const adminUser = db.prepare(`SELECT id, email, password_hash FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`).get() as
    | { id: number; email: string; password_hash: string }
    | undefined;

  if (!existingSec) {
    const email = adminUser?.email || 'admin@scrapease.com';
    db.prepare(`INSERT INTO admin_security (id, admin_email, passcode_hash, claimed) VALUES (1, ?, '', 0)`).run(email);
    // Clear legacy default password hash so no hardcoded seed credential remains active
    if (adminUser && adminUser.password_hash) {
      db.prepare(`UPDATE users SET password_hash = '' WHERE id = ?`).run(adminUser.id);
    }
  }
}

export function seedInitialData(): void {
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) {
    ensureAdminSecurityState();
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (role, name, email, phone, password_hash, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `);

  const adminId = Number(
    insertUser.run('admin', 'Meera Deshmukh', 'admin@scrapease.com', '9845000001', '').lastInsertRowid
  );
  db.prepare(`INSERT OR IGNORE INTO admin_security (id, admin_email, passcode_hash, claimed) VALUES (1, 'admin@scrapease.com', '', 0)`).run();
  const household1Id = Number(
    insertUser.run('household', 'Ananya Rao', 'ananya@scrapease.com', '9845112233', bcrypt.hashSync('Household@123', 10)).lastInsertRowid
  );
  const household2Id = Number(
    insertUser.run('household', 'Karthik Hegde', 'karthik@scrapease.com', '9845445566', bcrypt.hashSync('Household@123', 10)).lastInsertRowid
  );
  const collector1Id = Number(
    insertUser.run('collector', 'Ramesh Gowda', 'ramesh.collector@scrapease.com', '9900112233', bcrypt.hashSync('Collector@123', 10)).lastInsertRowid
  );
  const collector2Id = Number(
    insertUser.run('collector', 'Suresh Kulkarni', 'suresh.collector@scrapease.com', '9900223344', bcrypt.hashSync('Collector@123', 10)).lastInsertRowid
  );
  const collector3Id = Number(
    insertUser.run('collector', 'Mahesh Shetty', 'mahesh.collector@scrapease.com', '9900334455', bcrypt.hashSync('Collector@123', 10)).lastInsertRowid
  );
  const recycler1Id = Number(
    insertUser.run('recycler', 'Vikram Nair', 'greenloop@scrapease.com', '9880112233', bcrypt.hashSync('Recycler@123', 10)).lastInsertRowid
  );

  // Addresses
  const insertAddr = db.prepare(`
    INSERT INTO addresses (user_id, label, line1, line2, area, city, pincode, is_default)
    VALUES (?, ?, ?, ?, ?, 'Bengaluru', ?, ?)
  `);
  const addr1Id = Number(insertAddr.run(household1Id, 'Home', '42, 12th Main Road', 'HAL 2nd Stage', 'Indiranagar', '560038', 1).lastInsertRowid);
  insertAddr.run(household1Id, 'Studio', '18, 4th Block, 80 Feet Road', 'Near Sony World Signal', 'Koramangala', '560034', 0);
  const addr3Id = Number(insertAddr.run(household2Id, 'Residence', '74, 9th Main, 4th Block', 'Near Cool Joint', 'Jayanagar', '560011', 1).lastInsertRowid);

  // Collector profiles
  const insertCollector = db.prepare(`
    INSERT INTO collector_profiles (
      user_id, kyc_status, kyc_doc_type, kyc_doc_number, vehicle_type, vehicle_number,
      service_pincodes, working_days, working_start, working_end, is_online,
      rating_avg, rating_count, total_pickups, total_earnings
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCollector.run(
    collector1Id,
    'approved',
    'Aadhaar',
    'XXXX-XXXX-4821',
    'Electric Cargo Trike',
    'KA-03-EV-4821',
    JSON.stringify(['560038', '560034', '560008', '560001']),
    JSON.stringify([1, 2, 3, 4, 5, 6]),
    '08:00',
    '20:00',
    1,
    4.9,
    42,
    64,
    24850
  );
  insertCollector.run(
    collector2Id,
    'approved',
    'Driving Licence',
    'KA05-2021009412',
    'Tata Ace EV',
    'KA-05-EV-9104',
    JSON.stringify(['560011', '560078', '560066', '560102', '560003']),
    JSON.stringify([1, 2, 3, 4, 5, 6]),
    '08:00',
    '20:00',
    1,
    4.8,
    31,
    49,
    19420
  );
  insertCollector.run(
    collector3Id,
    'pending',
    'Aadhaar',
    'XXXX-XXXX-7730',
    'Pickup Auto',
    'KA-01-AG-7730',
    JSON.stringify(['560066', '560037']),
    JSON.stringify([1, 2, 3, 4, 5, 6]),
    '08:00',
    '18:00',
    0,
    5.0,
    0,
    0,
    0
  );

  // Categories
  const categoriesData = [
    { slug: 'paper-cardboard', name: 'Paper and Cardboard', icon: 'FileText', description: 'Newspapers, corrugated cartons, magazines, office paper, books', rate: 14, co2: 1.8 },
    { slug: 'plastic', name: 'Plastic', icon: 'Package', description: 'Clean PET bottles, HDPE containers, milk pouches, rigid household plastics', rate: 18, co2: 1.5 },
    { slug: 'metal', name: 'Metal', icon: 'Wrench', description: 'Iron rods, aluminium cans, copper wires, brass fittings, steel utensils', rate: 38, co2: 4.2 },
    { slug: 'e-waste', name: 'E-waste', icon: 'Cpu', description: 'Old laptops, monitors, keyboards, routers, chargers, small appliances', rate: 45, co2: 5.5 },
    { slug: 'glass', name: 'Glass', icon: 'GlassWater', description: 'Sorted unbroken clear and amber glass bottles and jars', rate: 6, co2: 0.3 },
    { slug: 'clothes-textiles', name: 'Clothes and Textiles', icon: 'Shirt', description: 'Clean dry cotton wear, linens, curtains, reusable fabric bundles', rate: 12, co2: 3.6 },
    { slug: 'batteries', name: 'Batteries', icon: 'BatteryCharging', description: 'Inverter lead-acid batteries, UPS batteries, laptop battery packs', rate: 65, co2: 4.8 },
    { slug: 'mixed-other', name: 'Mixed / Other', icon: 'Layers', description: 'Assorted dry household recyclables awaiting digital scale sorting', rate: 10, co2: 1.1 },
  ];

  const insertCat = db.prepare(`
    INSERT INTO categories (slug, name, icon, description, rate_per_kg, unit, co2_factor_per_kg, is_active)
    VALUES (?, ?, ?, ?, ?, 'kg', ?, 1)
  `);
  const catIds: Record<string, number> = {};
  for (const c of categoriesData) {
    catIds[c.slug] = Number(insertCat.run(c.slug, c.name, c.icon, c.description, c.rate, c.co2).lastInsertRowid);
  }

  // Recycler profile
  db.prepare(`
    INSERT INTO recycler_profiles (
      user_id, business_name, gst_number, kyc_status, city,
      service_pincodes, accepted_categories, buying_rates
    ) VALUES (?, ?, ?, 'approved', 'Bengaluru', ?, ?, ?)
  `).run(
    recycler1Id,
    'GreenLoop Materials Pvt. Ltd.',
    '29AABCG4821K1Z5',
    JSON.stringify(['560038', '560034', '560011', '560066', '560102', '560078']),
    JSON.stringify([catIds['paper-cardboard'], catIds['plastic'], catIds['metal'], catIds['e-waste']]),
    JSON.stringify({
      [catIds['paper-cardboard']]: 16.5,
      [catIds['plastic']]: 21,
      [catIds['metal']]: 42,
      [catIds['e-waste']]: 50,
    })
  );

  // Schedule settings
  const serviceAreas = [
    { pincode: '560038', area: 'Indiranagar', city: 'Bengaluru', active: true },
    { pincode: '560034', area: 'Koramangala', city: 'Bengaluru', active: true },
    { pincode: '560011', area: 'Jayanagar', city: 'Bengaluru', active: true },
    { pincode: '560066', area: 'Whitefield', city: 'Bengaluru', active: true },
    { pincode: '560102', area: 'HSR Layout', city: 'Bengaluru', active: true },
    { pincode: '560078', area: 'JP Nagar', city: 'Bengaluru', active: true },
    { pincode: '560003', area: 'Malleswaram', city: 'Bengaluru', active: true },
    { pincode: '560001', area: 'MG Road / Central', city: 'Bengaluru', active: true },
    { pincode: '560008', area: 'Ulsoor / Halasuru', city: 'Bengaluru', active: true },
  ];

  db.prepare(`
    INSERT INTO schedule_settings (
      id, operating_days, start_hour, end_hour, slots, default_slot_capacity,
      holidays, service_areas, commission_percent, auto_assign_timeout_mins
    ) VALUES (1, ?, 8, 20, ?, 10, ?, ?, 5.0, 15)
  `).run(
    JSON.stringify([1, 2, 3, 4, 5, 6]),
    JSON.stringify(DEFAULT_SLOTS),
    JSON.stringify([]),
    JSON.stringify(serviceAreas)
  );

  // Seed historical & upcoming pickups in IST
  const nowIST = getNowIST();
  const pastDate1 = addDaysToDateStr(nowIST.dateStr, -12);
  const pastDate2 = addDaysToDateStr(nowIST.dateStr, -5);
  const pastDate3 = addDaysToDateStr(nowIST.dateStr, -2);
  let nextOperatingDate = addDaysToDateStr(nowIST.dateStr, 1);
  if (new Date(`${nextOperatingDate}T12:00:00+05:30`).getUTCDay() === 0) {
    nextOperatingDate = addDaysToDateStr(nextOperatingDate, 1);
  }
  let futureOperatingDate = addDaysToDateStr(nextOperatingDate, 1);
  if (new Date(`${futureOperatingDate}T12:00:00+05:30`).getUTCDay() === 0) {
    futureOperatingDate = addDaysToDateStr(futureOperatingDate, 1);
  }

  const insertPickup = db.prepare(`
    INSERT INTO pickups (
      code, household_id, collector_id, address_id, address_snapshot, pincode, area,
      pickup_date, slot_id, slot_label, status, est_total_weight, est_total_amount,
      actual_total_weight, actual_total_amount, commission_rate, commission_amount,
      payment_method, payment_status, notes, assigned_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5.0, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO pickup_items (pickup_id, category_id, category_name, est_weight, actual_weight, rate_per_kg, amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTimeline = db.prepare(`
    INSERT INTO pickup_timeline (pickup_id, status, note, actor_id, actor_role, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Completed Pickup 1
  const p1Snap = JSON.stringify({ label: 'Home', line1: '42, 12th Main Road', line2: 'HAL 2nd Stage', area: 'Indiranagar', city: 'Bengaluru', pincode: '560038' });
  const p1Id = Number(insertPickup.run(
    'SE-2026-1001', household1Id, collector1Id, addr1Id, p1Snap, '560038', 'Indiranagar',
    pastDate1, '10-12', '10:00 AM – 12:00 PM', 'Completed',
    24, 524, 26.5, 589, 29.45, 'UPI', 'Paid',
    'Neatly tied newspapers and old UPS battery near gate.', `${pastDate1}T09:15:00+05:30`, `${pastDate1}T08:40:00+05:30`, `${pastDate1}T11:25:00+05:30`
  ).lastInsertRowid);
  insertItem.run(p1Id, catIds['paper-cardboard'], 'Paper and Cardboard', 18, 19.5, 14, 273);
  insertItem.run(p1Id, catIds['metal'], 'Metal', 4, 4.5, 38, 171);
  insertItem.run(p1Id, catIds['e-waste'], 'E-waste', 2, 2.5, 45, 112.5);
  insertItem.run(p1Id, catIds['plastic'], 'Plastic', 0, 1.8, 18, 32.5);
  insertTimeline.run(p1Id, 'Requested', 'Pickup booked for 10:00 AM – 12:00 PM slot.', household1Id, 'household', `${pastDate1}T08:40:00+05:30`);
  insertTimeline.run(p1Id, 'Assigned', 'Auto-assigned to Ramesh Gowda (560038).', null, 'system', `${pastDate1}T08:41:00+05:30`);
  insertTimeline.run(p1Id, 'En Route', 'Collector departed for Indiranagar.', collector1Id, 'collector', `${pastDate1}T10:15:00+05:30`);
  insertTimeline.run(p1Id, 'Picked Up', 'Verified digital scale weights recorded.', collector1Id, 'collector', `${pastDate1}T11:10:00+05:30`);
  insertTimeline.run(p1Id, 'Completed', 'Payout of ₹589 settled via UPI.', collector1Id, 'collector', `${pastDate1}T11:25:00+05:30`);

  db.prepare(`INSERT INTO reviews (pickup_id, household_id, collector_id, rating, comment) VALUES (?, ?, ?, 5, ?)`)
    .run(p1Id, household1Id, collector1Id, 'Arrived right on time with a calibrated digital scale and paid immediately via UPI.');

  // Completed Pickup 2
  const p2Snap = JSON.stringify({ label: 'Residence', line1: '74, 9th Main, 4th Block', line2: 'Near Cool Joint', area: 'Jayanagar', city: 'Bengaluru', pincode: '560011' });
  const p2Id = Number(insertPickup.run(
    'SE-2026-1002', household2Id, collector2Id, addr3Id, p2Snap, '560011', 'Jayanagar',
    pastDate2, '14-16', '2:00 PM – 4:00 PM', 'Completed',
    35, 925, 38, 1020, 51, 'Cash', 'Paid',
    'Home renovation metal and corrugated boxes.', `${pastDate2}T12:10:00+05:30`, `${pastDate2}T11:50:00+05:30`, `${pastDate2}T15:10:00+05:30`
  ).lastInsertRowid);
  insertItem.run(p2Id, catIds['metal'], 'Metal', 15, 16, 38, 608);
  insertItem.run(p2Id, catIds['paper-cardboard'], 'Paper and Cardboard', 12, 14, 14, 196);
  insertItem.run(p2Id, catIds['plastic'], 'Plastic', 8, 8, 18, 144);
  insertItem.run(p2Id, catIds['clothes-textiles'], 'Clothes and Textiles', 0, 6, 12, 72);
  insertTimeline.run(p2Id, 'Requested', 'Pickup requested by Karthik Hegde.', household2Id, 'household', `${pastDate2}T11:50:00+05:30`);
  insertTimeline.run(p2Id, 'Assigned', 'Auto-assigned to Suresh Kulkarni (560011).', null, 'system', `${pastDate2}T11:51:00+05:30`);
  insertTimeline.run(p2Id, 'Completed', 'Paid ₹1,020 in Cash after scale verification.', collector2Id, 'collector', `${pastDate2}T15:10:00+05:30`);

  // Completed Pickup 3 (Indiranagar)
  const p3Id = Number(insertPickup.run(
    'SE-2026-1003', household1Id, collector1Id, addr1Id, p1Snap, '560038', 'Indiranagar',
    pastDate3, '16-18', '4:00 PM – 6:00 PM', 'Completed',
    18, 490, 19.2, 534, 26.7, 'UPI', 'Paid',
    'Old inverter battery and kitchen aluminium.', `${pastDate3}T14:00:00+05:30`, `${pastDate3}T13:45:00+05:30`, `${pastDate3}T17:15:00+05:30`
  ).lastInsertRowid);
  insertItem.run(p3Id, catIds['batteries'], 'Batteries', 5, 5.2, 65, 338);
  insertItem.run(p3Id, catIds['paper-cardboard'], 'Paper and Cardboard', 10, 10, 14, 140);
  insertItem.run(p3Id, catIds['paper-cardboard'], 'Paper and Cardboard', 4, 4, 14, 56);
  insertTimeline.run(p3Id, 'Requested', 'Pickup scheduled.', household1Id, 'household', `${pastDate3}T13:45:00+05:30`);
  insertTimeline.run(p3Id, 'Assigned', 'Auto-assigned to Ramesh Gowda.', null, 'system', `${pastDate3}T13:46:00+05:30`);
  insertTimeline.run(p3Id, 'Completed', 'Completed and receipt issued.', collector1Id, 'collector', `${pastDate3}T17:15:00+05:30`);

  // Upcoming Assigned Pickup 4
  const p4Id = Number(insertPickup.run(
    'SE-2026-1004', household1Id, collector1Id, addr1Id, p1Snap, '560038', 'Indiranagar',
    nextOperatingDate, '10-12', '10:00 AM – 12:00 PM', 'Assigned',
    16, 376, null, null, 0, null, 'Pending',
    'Ring bell at first floor intercom.', new Date().toISOString(), new Date().toISOString(), new Date().toISOString()
  ).lastInsertRowid);
  insertItem.run(p4Id, catIds['paper-cardboard'], 'Paper and Cardboard', 10, null, 14, 140);
  insertItem.run(p4Id, catIds['e-waste'], 'E-waste', 3, null, 45, 135);
  insertItem.run(p4Id, catIds['plastic'], 'Plastic', 3, null, 18, 54);
  insertTimeline.run(p4Id, 'Requested', 'Pickup requested for tomorrow morning.', household1Id, 'household', new Date().toISOString());
  insertTimeline.run(p4Id, 'Assigned', 'Auto-assigned to Ramesh Gowda (Indiranagar).', null, 'system', new Date().toISOString());

  // Unassigned Manual Queue Pickup 5 (Whitefield)
  const p5Snap = JSON.stringify({ label: 'Office Annex', line1: '214, ITPL Main Road', line2: 'Brookefield', area: 'Whitefield', city: 'Bengaluru', pincode: '560066' });
  const p5Id = Number(insertPickup.run(
    'SE-2026-1005', household2Id, null, addr3Id, p5Snap, '560066', 'Whitefield',
    futureOperatingDate, '12-14', '12:00 PM – 2:00 PM', 'Requested',
    30, 740, null, null, 0, null, 'Pending',
    'Bulk office cartons and old monitors.', null, new Date().toISOString(), new Date().toISOString()
  ).lastInsertRowid);
  db.prepare(`UPDATE pickups SET manual_queue = 1 WHERE id = ?`).run(p5Id);
  insertItem.run(p5Id, catIds['paper-cardboard'], 'Paper and Cardboard', 20, null, 14, 280);
  insertItem.run(p5Id, catIds['e-waste'], 'E-waste', 10, null, 45, 450);
  insertTimeline.run(p5Id, 'Requested', 'Awaiting collector assignment in Whitefield (560066).', household2Id, 'household', new Date().toISOString());

  // Seed Recycler Order
  db.prepare(`
    INSERT INTO recycler_orders (code, recycler_id, category_id, category_name, city, area, weight_kg, offered_rate_per_kg, total_amount, status, pickup_notes)
    VALUES ('RO-2026-201', ?, ?, 'Paper and Cardboard', 'Bengaluru', 'Indiranagar', 25.0, 16.5, 412.5, 'Confirmed', 'Baled kraft and newspaper lot ready for dock pickup.')
  `).run(recycler1Id, catIds['paper-cardboard']);

  // Notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertNotif.run(household1Id, 'pickup_assigned', 'Collector assigned for SE-2026-1004', 'Ramesh Gowda is scheduled for tomorrow 10:00 AM – 12:00 PM in Indiranagar.', `/dashboard/pickups/${p4Id}`);
  insertNotif.run(collector1Id, 'new_assignment', 'New pickup assigned: SE-2026-1004', '16 kg estimated load at Indiranagar (560038) for 10:00 AM – 12:00 PM.', '/collector/requests');
  insertNotif.run(adminId, 'manual_queue', 'Pickup SE-2026-1005 needs assignment', 'Whitefield (560066) pickup awaits collector dispatch.', '/admin/pickups');

  // FAQs
  const insertFaq = db.prepare(`INSERT INTO faqs (question, answer, category, sort_order) VALUES (?, ?, ?, ?)`);
  insertFaq.run('How are scrap weights verified at my doorstep?', 'Every ScrapEase collector carries a calibrated digital hanging or platform scale. Items are weighed category-by-category in your presence before the final payout is calculated.', 'Pickups', 1);
  insertFaq.run('What are the operating hours and slot rules?', 'Pickups operate Monday to Saturday from 8:00 AM to 8:00 PM IST across six 2-hour windows. Same-day slots require at least 3 hours advance notice, and you can book up to 14 days ahead.', 'Scheduling', 2);
  insertFaq.run('Is there a fee for rescheduling or cancelling?', 'Rescheduling or cancelling is completely free up to 2 hours before your slot begins. Changes inside the 2-hour window are flagged so our dispatch team can re-route nearby collectors.', 'Scheduling', 3);
  insertFaq.run('How do I receive payment for my scrap?', 'You can choose instant UPI transfer or Cash right after digital weighing is confirmed. A downloadable GST-ready PDF receipt is immediately saved to your account.', 'Payments', 4);
  insertFaq.run('How do collectors and recyclers join ScrapEase?', 'Collectors register with Aadhaar/Driving Licence KYC and vehicle details. Verified recyclers register with GST credentials to bid on aggregated city material lots.', 'Partners', 5);

  // Testimonials
  const insertTest = db.prepare(`INSERT INTO testimonials (name, role, area, quote, metric) VALUES (?, ?, ?, ?, ?)`);
  insertTest.run('Ananya Rao', 'Homeowner', 'Indiranagar, Bengaluru', 'Cleared three months of Amazon cartons and two dead monitors in fifteen minutes. The digital scale matched my estimate and UPI hit before the van left.', '₹1,123 earned in 2 pickups');
  insertTest.run('Karthik Hegde', 'Apartment RWA Secretary', 'Jayanagar, Bengaluru', 'Our 48-flat society moved from irregular informal pickups to scheduled Saturday morning slots with transparent ₹/kg rate cards.', '412 kg diverted in Q3');
  insertTest.run('Vikram Nair', 'Procurement Lead, GreenLoop Materials', 'Peenya Industrial Area', 'Consolidated pre-sorted cardboard and copper lots save our baling floor hours of manual segregation every week.', '4.2 tonnes sourced monthly');

  // Banners
  db.prepare(`INSERT INTO site_banners (key, title, subtitle, cta_text) VALUES (?, ?, ?, ?)`)
    .run('hero', 'Turn your scrap into value. Schedule a pickup in 60 seconds.', 'Doorstep digital weighing across Bengaluru with verified collectors, live ₹/kg rates, and instant UPI payouts.', 'Schedule Pickup');

  // Audit Log
  db.prepare(`INSERT INTO audit_logs (actor_id, actor_email, actor_role, action, entity_type, entity_id, details) VALUES (?, ?, 'admin', 'SYSTEM_SEED', 'system', '1', ?)`)
    .run(adminId, 'admin@scrapease.com', JSON.stringify({ message: 'Initial Bengaluru marketplace data seeded' }));
}
