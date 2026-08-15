import type { AutomationFrequency } from '@creative-seo/types';

/**
 * Scheduling primitives for recurring automation. All schedule math is done in
 * the site's configured timezone: slots are computed from the zone's wall clock,
 * and the instant is derived by mapping wall-clock back to UTC using the zone's
 * offset (DST-aware via iteration).
 *
 * Model: every operation has a slot per period (a day for `daily`, a week for
 * `weekly`, a month for `monthly`). On a scheduler tick we look up the slot of
 * the *current* period; if it is in the past and not yet claimed, the run is due
 * (this is the missed-run recovery path — after downtime the most recent slot is
 * picked up). Each period maps to a deterministic idempotency key, so a period
 * is claimed at most once no matter how often the tick runs.
 */

export interface Cadence {
  frequency: AutomationFrequency;
  /** 0 = Sunday .. 6 = Saturday (JS convention). `weekly` only. */
  weekday?: number;
  /** 1..31 (clamped). `monthly` only. */
  dayOfMonth?: number;
  /** `HH:MM`, 24-hour. */
  time?: string;
}

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const DAY_MS = 86_400_000;

/** Wall clock (local fields) of an instant in a given IANA timezone. */
export function wallClockInZone(now: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(now);
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** UTC offset (minutes) of a zone at a given instant. */
export function utcOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Maps local wall-clock fields + time to a UTC instant in a zone (DST-safe). */
export function zonedDateTime(wall: { year: number; month: number; day: number }, time: string, timeZone: string): Date {
  const [hour = 0, minute = 0] = (time ?? '00:00').split(':').map(Number);
  const localUtc = Date.UTC(wall.year, wall.month - 1, wall.day, hour, minute);
  let candidate = new Date(localUtc);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const offset = utcOffsetMinutes(candidate, timeZone);
    candidate = new Date(localUtc - offset * 60_000);
  }
  return candidate;
}

/** Days in a given month (1-12), DST-independent. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Monday-based week key `YYYY-Www` for the date (in UTC instant terms). */
function weekKey(date: Date): string {
  const day = date.getUTCDay() || 7;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day + 1));
  const jan4 = new Date(Date.UTC(monday.getUTCFullYear(), 0, 4));
  const week = Math.ceil(((monday.getTime() - jan4.getTime()) / DAY_MS + (jan4.getUTCDay() || 7) - 3) / 7);
  return `${monday.getUTCFullYear()}-W${pad(week)}`;
}

export interface Slot {
  /** The UTC instant of the slot. */
  date: Date;
  /** Deterministic period key used for idempotency. */
  periodKey: string;
}

/**
 * Slot for the period that contains `base` (today / this week / this month).
 * Returns a slot even if it is already in the past.
 */
export function slotFor(base: Date, cadence: Cadence, timeZone: string): Slot {
  const wall = wallClockInZone(base, timeZone);
  const time = cadence.time ?? '06:00';
  let date: Date;
  let periodKey: string;

  if (cadence.frequency === 'daily') {
    date = zonedDateTime(wall, time, timeZone);
    periodKey = `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
  } else if (cadence.frequency === 'weekly') {
    const weekday = cadence.weekday ?? 0;
    const wc = wallClockInZone(base, timeZone);
    const dayOfWeekNumber = new Date(Date.UTC(wc.year, wc.month - 1, wc.day)).getUTCDay();
    const diff = (dayOfWeekNumber - weekday + 7) % 7;
    date = zonedDateTime({ year: wc.year, month: wc.month, day: wc.day - diff }, time, timeZone);
    periodKey = weekKey(date);
  } else {
    const dayOfMonth = clampDay(cadence.dayOfMonth ?? 1, wall.year, wall.month);
    date = zonedDateTime({ year: wall.year, month: wall.month, day: dayOfMonth }, time, timeZone);
    periodKey = `${wall.year}-${pad(wall.month)}`;
  }

  return { date, periodKey };
}

/** True when the current-period slot has already passed (i.e. is due). */
export function isDue(now: Date, slot: Date): boolean {
  return slot.getTime() <= now.getTime();
}

/** The next upcoming slot strictly after `now`. */
export function nextSlot(now: Date, cadence: Cadence, timeZone: string): Slot {
  let base = new Date(now);
  let slot = slotFor(base, cadence, timeZone);
  let guard = 0;
  while (isDue(now, slot.date) && guard < 400) {
    base = advance(base, cadence.frequency);
    slot = slotFor(base, cadence, timeZone);
    guard += 1;
  }
  return slot;
}

/** Advances a date by one period (calendar-aware for months). */
function advance(date: Date, frequency: AutomationFrequency): Date {
  if (frequency === 'daily') return new Date(date.getTime() + DAY_MS);
  if (frequency === 'weekly') return new Date(date.getTime() + 7 * DAY_MS);
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function clampDay(day: number, year: number, month: number): number {
  return Math.min(Math.max(day, 1), daysInMonth(year, month));
}
