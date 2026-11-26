-- Run this SQL once in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ryftihupertemnteaobm/sql

CREATE TABLE IF NOT EXISTS public.pickup_bookings (
  id BIGSERIAL PRIMARY KEY,
  pickup_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT DEFAULT '',
  area TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Bengaluru',
  pincode TEXT NOT NULL,
  pickup_date DATE NOT NULL,
  slot_id TEXT NOT NULL,
  slot_label TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  est_total_weight NUMERIC(10, 2) NOT NULL DEFAULT 0,
  est_total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  actual_total_weight NUMERIC(10, 2),
  actual_total_amount NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'Requested',
  assigned_collector_name TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pickup_bookings_date ON public.pickup_bookings (pickup_date);
CREATE INDEX IF NOT EXISTS idx_pickup_bookings_pincode ON public.pickup_bookings (pincode);
CREATE INDEX IF NOT EXISTS idx_pickup_bookings_email ON public.pickup_bookings (customer_email);

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grant schema, table, and sequence privileges required by PostgREST (anon / authenticated / service_role)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT INSERT ON TABLE public.pickup_bookings TO anon, authenticated;
GRANT ALL ON TABLE public.pickup_bookings TO service_role;

GRANT INSERT ON TABLE public.contact_inquiries TO anon, authenticated;
GRANT ALL ON TABLE public.contact_inquiries TO service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER TABLE public.pickup_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public appointment inserts" ON public.pickup_bookings;
CREATE POLICY "Allow public appointment inserts"
  ON public.pickup_bookings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service read on pickup_bookings" ON public.pickup_bookings;
CREATE POLICY "Allow service read on pickup_bookings"
  ON public.pickup_bookings
  FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public contact inserts" ON public.contact_inquiries;
CREATE POLICY "Allow public contact inserts"
  ON public.contact_inquiries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
