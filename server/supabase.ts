import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedConfigKey = '';
let cachedClient: SupabaseClient | null = null;

function resolveSupabaseUrl(): string {
  const rawUrl = process.env.SUPABASE_URL?.trim();
  const projectId = process.env.SUPABASE_PROJECT_ID?.trim();
  if (rawUrl) {
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return rawUrl.replace(/\/+$/, '');
    }
    return `https://${rawUrl.replace(/\/+$/, '')}.supabase.co`;
  }
  return projectId ? `https://${projectId}.supabase.co` : '';
}

export function hasSupabaseServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function getSupabaseClient(): SupabaseClient | null {
  const url = resolveSupabaseUrl();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    '';

  if (!url || !key) {
    cachedClient = null;
    cachedConfigKey = '';
    return null;
  }

  const nextKey = `${url}|${key}`;
  if (cachedClient && cachedConfigKey === nextKey) {
    return cachedClient;
  }

  cachedConfigKey = nextKey;
  cachedClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}

export interface SupabasePickupBookingPayload {
  pickup_code: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  address_line1: string;
  address_line2?: string;
  area: string;
  city: string;
  pincode: string;
  pickup_date: string;
  slot_id: string;
  slot_label: string;
  items: Array<{
    category_id: number;
    category_name: string;
    est_weight: number;
    rate_per_kg: number;
    amount: number;
  }>;
  est_total_weight: number;
  est_total_amount: number;
  status: string;
  assigned_collector_name: string | null;
  notes: string;
}

export interface SupabasePickupBookingRow extends SupabasePickupBookingPayload {
  id: number;
  actual_total_weight: number | null;
  actual_total_amount: number | null;
  created_at: string;
  updated_at: string;
}

export async function fetchAllBookingsFromSupabase(): Promise<{
  connected: boolean;
  hasServiceRole: boolean;
  rows: SupabasePickupBookingRow[];
  error?: string;
}> {
  const supabase = getSupabaseClient();
  const hasServiceRole = hasSupabaseServiceRole();
  if (!supabase) {
    return {
      connected: false,
      hasServiceRole,
      rows: [],
      error: 'Supabase environment variables are not configured.',
    };
  }
  if (!hasServiceRole) {
    return {
      connected: true,
      hasServiceRole: false,
      rows: [],
    };
  }

  try {
    const { data, error } = await supabase
      .from('pickup_bookings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) {
      console.warn('Supabase pickup_bookings select skipped:', error.message);
      return {
        connected: true,
        hasServiceRole: true,
        rows: [],
        error: error.message,
      };
    }

    return {
      connected: true,
      hasServiceRole: true,
      rows: (data || []) as SupabasePickupBookingRow[],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Supabase fetch error';
    return {
      connected: true,
      hasServiceRole: true,
      rows: [],
      error: msg,
    };
  }
}

export async function syncPickupBookingToSupabase(
  payload: SupabasePickupBookingPayload
): Promise<{ synced: boolean; reason?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { synced: false, reason: 'Supabase env vars (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) not configured.' };
  }

  try {
    const { error } = await supabase.from('pickup_bookings').insert([payload]);
    if (error) {
      const hint =
        error.code === '42501' || error.message.toLowerCase().includes('permission denied')
          ? ' Run /supabase/schema.sql in the Supabase SQL Editor to grant anon INSERT and sequence privileges.'
          : '';
      console.warn(`Supabase pickup_bookings insert skipped (${error.message}).${hint}`);
      return { synced: false, reason: `${error.message}${hint}` };
    }
    return { synced: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown Supabase error';
    console.warn('Supabase sync exception:', msg);
    return { synced: false, reason: msg };
  }
}

export async function syncPickupStatusToSupabase(
  pickupCode: string,
  updates: {
    status?: string;
    customer_name?: string;
    customer_phone?: string;
    address_line1?: string;
    address_line2?: string;
    area?: string;
    city?: string;
    pincode?: string;
    pickup_date?: string;
    slot_id?: string;
    slot_label?: string;
    items?: Array<{
      category_id: number;
      category_name: string;
      est_weight: number;
      rate_per_kg: number;
      amount: number;
    }>;
    est_total_weight?: number;
    est_total_amount?: number;
    actual_total_weight?: number | null;
    actual_total_amount?: number | null;
    assigned_collector_name?: string | null;
    notes?: string;
  }
): Promise<{ updated: boolean; reason?: string }> {
  // Status and booking updates require service_role key if RLS restricts anon updates
  if (!hasSupabaseServiceRole()) {
    return { updated: false, reason: 'SUPABASE_SERVICE_ROLE_KEY not configured for remote row updates.' };
  }
  const supabase = getSupabaseClient();
  if (!supabase) return { updated: false, reason: 'Supabase client unavailable.' };

  try {
    const { error } = await supabase
      .from('pickup_bookings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('pickup_code', pickupCode);
    if (error) {
      console.warn('Supabase pickup_bookings update skipped:', error.message);
      return { updated: false, reason: error.message };
    }
    return { updated: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Supabase status update exception';
    console.warn(msg);
    return { updated: false, reason: msg };
  }
}

export async function syncContactToSupabase(payload: {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}): Promise<{ synced: boolean }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { synced: false };

  try {
    const { error } = await supabase.from('contact_inquiries').insert([payload]);
    if (error) {
      console.warn('Supabase contact_inquiries insert skipped:', error.message);
      return { synced: false };
    }
    return { synced: true };
  } catch {
    return { synced: false };
  }
}
