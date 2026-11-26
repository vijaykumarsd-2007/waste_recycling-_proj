export type UserRole = 'household' | 'collector' | 'recycler' | 'admin';
export type UserStatus = 'active' | 'blocked';
export type KycStatus = 'pending' | 'approved' | 'rejected';

export type PickupStatus =
  | 'Requested'
  | 'Assigned'
  | 'En Route'
  | 'Picked Up'
  | 'Completed'
  | 'Cancelled'
  | 'Rescheduled';

export type PaymentMethod = 'Cash' | 'UPI';
export type PaymentStatus = 'Pending' | 'Paid';

export interface Address {
  id: number;
  user_id: number;
  label: string;
  line1: string;
  line2: string;
  area: string;
  city: string;
  pincode: string;
  is_default: boolean;
  created_at: string;
}

export interface CollectorProfile {
  user_id: number;
  kyc_status: KycStatus;
  kyc_doc_type: string;
  kyc_doc_number: string;
  kyc_doc_image: string | null;
  vehicle_type: string;
  vehicle_number: string;
  service_pincodes: string[];
  working_days: number[]; // 1=Mon ... 6=Sat, 0=Sun
  working_start: string; // "08:00"
  working_end: string; // "20:00"
  is_online: boolean;
  rating_avg: number;
  rating_count: number;
  total_pickups: number;
  total_earnings: number;
}

export interface RecyclerProfile {
  user_id: number;
  business_name: string;
  gst_number: string;
  kyc_status: KycStatus;
  kyc_doc_image: string | null;
  city: string;
  service_pincodes: string[];
  accepted_categories: number[];
  buying_rates: Record<string, number>;
  created_at: string;
}

export interface User {
  id: number;
  role: UserRole;
  name: string;
  email: string;
  phone: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  addresses?: Address[];
  collector_profile?: CollectorProfile | null;
  recycler_profile?: RecyclerProfile | null;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  icon: string;
  description: string;
  rate_per_kg: number;
  unit: string;
  co2_factor_per_kg: number;
  is_active: boolean;
  updated_at: string;
}

export interface RateHistoryEntry {
  id: number;
  category_id: number;
  category_name?: string;
  old_rate: number;
  new_rate: number;
  changed_by_name?: string;
  changed_at: string;
}

export interface PickupItem {
  id?: number;
  pickup_id?: number;
  category_id: number;
  category_name: string;
  est_weight: number;
  actual_weight: number | null;
  rate_per_kg: number;
  amount: number;
}

export interface PickupTimelineEntry {
  id: number;
  pickup_id: number;
  status: string;
  note: string;
  actor_id: number | null;
  actor_role: string;
  actor_name?: string;
  created_at: string;
}

export interface Review {
  id: number;
  pickup_id: number;
  household_id: number;
  collector_id: number;
  rating: number;
  comment: string;
  created_at: string;
  household_name?: string;
}

export interface Pickup {
  id: number;
  code: string;
  household_id: number;
  household_name?: string;
  household_email?: string;
  household_phone?: string;
  source?: 'local' | 'supabase' | 'synced';
  collector_id: number | null;
  collector_name?: string | null;
  collector_phone?: string | null;
  collector_rating?: number | null;
  address_id: number | null;
  address_snapshot: {
    label: string;
    line1: string;
    line2?: string;
    area: string;
    city: string;
    pincode: string;
  };
  pincode: string;
  area: string;
  pickup_date: string; // YYYY-MM-DD in IST
  slot_id: string;
  slot_label: string;
  status: PickupStatus;
  est_total_weight: number;
  est_total_amount: number;
  actual_total_weight: number | null;
  actual_total_amount: number | null;
  commission_rate: number;
  commission_amount: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  late_flag: boolean;
  manual_queue: boolean;
  notes: string;
  photos: string[];
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
  items: PickupItem[];
  timeline: PickupTimelineEntry[];
  review?: Review | null;
}

export interface SlotDefinition {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
  capacity?: number;
}

export interface ServiceArea {
  pincode: string;
  area: string;
  city: string;
  active: boolean;
}

export interface ScheduleSettings {
  id: number;
  operating_days: number[]; // [1,2,3,4,5,6]
  start_hour: number;
  end_hour: number;
  slots: SlotDefinition[];
  default_slot_capacity: number;
  holidays: string[]; // YYYY-MM-DD
  service_areas: ServiceArea[];
  commission_percent: number;
  auto_assign_timeout_mins: number;
  updated_at: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  link: string;
  is_read: boolean;
  email_sent: boolean;
  sms_ready_payload: string | null;
  created_at: string;
}

export interface RecyclerLot {
  category_id: number;
  category_name: string;
  city: string;
  area: string;
  available_kg: number;
  base_rate_per_kg: number;
  pickup_count: number;
}

export interface RecyclerOrder {
  id: number;
  code: string;
  recycler_id: number;
  recycler_name?: string;
  business_name?: string;
  category_id: number;
  category_name: string;
  city: string;
  area: string;
  weight_kg: number;
  offered_rate_per_kg: number;
  total_amount: number;
  status: 'Requested' | 'Confirmed' | 'Dispatched' | 'Delivered' | 'Cancelled';
  pickup_notes: string;
  created_at: string;
  updated_at: string;
}

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  is_active: boolean;
}

export interface TestimonialItem {
  id: number;
  name: string;
  role: string;
  area: string;
  quote: string;
  metric: string;
  is_active: boolean;
}

export interface SiteBanner {
  id: number;
  key: string;
  title: string;
  subtitle: string;
  cta_text: string;
  is_active: boolean;
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: 'New' | 'Replied' | 'Resolved';
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor_email: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}
