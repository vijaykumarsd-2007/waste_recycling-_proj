import type { ScheduleSettings, SlotDefinition } from './types.ts';

export const DEFAULT_SLOTS: SlotDefinition[] = [
  { id: '08-10', label: '8:00 AM – 10:00 AM', startHour: 8, endHour: 10 },
  { id: '10-12', label: '10:00 AM – 12:00 PM', startHour: 10, endHour: 12 },
  { id: '12-14', label: '12:00 PM – 2:00 PM', startHour: 12, endHour: 14 },
  { id: '14-16', label: '2:00 PM – 4:00 PM', startHour: 14, endHour: 16 },
  { id: '16-18', label: '4:00 PM – 6:00 PM', startHour: 16, endHour: 18 },
  { id: '18-20', label: '6:00 PM – 8:00 PM', startHour: 18, endHour: 20 },
];

export interface ISTNow {
  dateStr: string; // YYYY-MM-DD
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  timestampMs: number;
}

export function getNowIST(referenceDate: Date = new Date()): ISTNow {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(referenceDate);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const minute = Number(map.minute);

  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const dayOfWeek = new Date(`${dateStr}T12:00:00+05:30`).getUTCDay();

  return {
    dateStr,
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek,
    timestampMs: referenceDate.getTime(),
  };
}

export function getSlotStartTimestampIST(dateStr: string, startHour: number): number {
  const hh = String(startHour).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:00:00+05:30`).getTime();
}

export function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  const base = new Date(`${dateStr}T12:00:00+05:30`);
  base.setUTCDate(base.getUTCDate() + daysToAdd);
  return getNowIST(base).dateStr;
}

export function diffDaysIST(fromDateStr: string, toDateStr: string): number {
  const a = new Date(`${fromDateStr}T00:00:00+05:30`).getTime();
  const b = new Date(`${toDateStr}T00:00:00+05:30`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function getDayOfWeekIST(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00+05:30`).getUTCDay();
}

export function formatISTDateTime(isoOrDateStr: string | null | undefined): string {
  if (!isoOrDateStr) return '—';
  const d = new Date(isoOrDateStr);
  if (Number.isNaN(d.getTime())) return isoOrDateStr;
  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d) + ' IST'
  );
}

export function formatISTDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export interface DateOption {
  dateStr: string;
  label: string;
  dayName: string;
  isOperatingDay: boolean;
  isHoliday: boolean;
  reason?: string;
}

export function getBookingDateOptions(
  settings: Pick<ScheduleSettings, 'operating_days' | 'holidays'>,
  referenceDate: Date = new Date()
): DateOption[] {
  const nowIST = getNowIST(referenceDate);
  const results: DateOption[] = [];

  for (let offset = 0; offset <= 14; offset++) {
    const dateStr = addDaysToDateStr(nowIST.dateStr, offset);
    const dow = getDayOfWeekIST(dateStr);
    const isOperatingDay = settings.operating_days.includes(dow);
    const isHoliday = settings.holidays.includes(dateStr);
    const d = new Date(`${dateStr}T12:00:00+05:30`);
    const dayName = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
    }).format(d);
    const shortDate = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
    }).format(d);

    let reason: string | undefined;
    if (isHoliday) reason = 'Public Holiday';
    else if (!isOperatingDay) reason = dow === 0 ? 'Sunday Closed' : 'Closed';

    results.push({
      dateStr,
      label: offset === 0 ? `Today, ${shortDate}` : offset === 1 ? `Tomorrow, ${shortDate}` : `${dayName}, ${shortDate}`,
      dayName,
      isOperatingDay,
      isHoliday,
      reason,
    });
  }

  return results;
}

export interface SlotAvailability {
  slot: SlotDefinition;
  available: boolean;
  bookedCount: number;
  capacity: number;
  remaining: number;
  reason?: string;
}

export function evaluateSlotAvailability(params: {
  dateStr: string;
  slot: SlotDefinition;
  settings: Pick<ScheduleSettings, 'operating_days' | 'holidays' | 'default_slot_capacity' | 'start_hour' | 'end_hour'>;
  bookedCount: number;
  referenceDate?: Date;
}): SlotAvailability {
  const { dateStr, slot, settings, bookedCount, referenceDate = new Date() } = params;
  const nowIST = getNowIST(referenceDate);
  const capacity = slot.capacity ?? settings.default_slot_capacity ?? 10;
  const remaining = Math.max(0, capacity - bookedCount);

  const dayDiff = diffDaysIST(nowIST.dateStr, dateStr);
  if (dayDiff < 0) {
    return { slot, available: false, bookedCount, capacity, remaining, reason: 'Past date' };
  }
  if (dayDiff > 14) {
    return { slot, available: false, bookedCount, capacity, remaining, reason: 'Max 14 days advance' };
  }

  const dow = getDayOfWeekIST(dateStr);
  if (!settings.operating_days.includes(dow)) {
    return {
      slot,
      available: false,
      bookedCount,
      capacity,
      remaining,
      reason: dow === 0 ? 'Closed on Sunday' : 'Non-operating day',
    };
  }
  if (settings.holidays.includes(dateStr)) {
    return { slot, available: false, bookedCount, capacity, remaining, reason: 'Holiday' };
  }

  if (slot.startHour < settings.start_hour || slot.endHour > settings.end_hour) {
    return { slot, available: false, bookedCount, capacity, remaining, reason: 'Outside operating hours' };
  }

  const slotStartMs = getSlotStartTimestampIST(dateStr, slot.startHour);
  const diffMins = (slotStartMs - nowIST.timestampMs) / 60000;

  if (dayDiff === 0 && diffMins < 180) {
    return {
      slot,
      available: false,
      bookedCount,
      capacity,
      remaining,
      reason: diffMins <= 0 ? 'Slot passed' : 'Needs 3h advance notice',
    };
  }

  if (remaining <= 0) {
    return { slot, available: false, bookedCount, capacity, remaining: 0, reason: 'Slot full' };
  }

  return {
    slot,
    available: true,
    bookedCount,
    capacity,
    remaining,
  };
}

export function evaluateModifyPenalty(
  dateStr: string,
  slotStartHour: number,
  referenceDate: Date = new Date()
): { isLate: boolean; minutesUntil: number; warning: string | null } {
  const nowIST = getNowIST(referenceDate);
  const slotStartMs = getSlotStartTimestampIST(dateStr, slotStartHour);
  const minutesUntil = Math.round((slotStartMs - nowIST.timestampMs) / 60000);
  const isLate = minutesUntil < 120;
  return {
    isLate,
    minutesUntil,
    warning: isLate
      ? 'This pickup is within 2 hours of its scheduled slot start. Cancelling or rescheduling now will be flagged as a late change.'
      : null,
  };
}
