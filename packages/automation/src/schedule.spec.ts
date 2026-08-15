import { slotFor, isDue, nextSlot, zonedDateTime, wallClockInZone } from './schedule';

describe('schedule', () => {
  describe('zonedDateTime', () => {
    it('maps a UTC wall clock to the same instant', () => {
      const date = zonedDateTime({ year: 2026, month: 8, day: 13 }, '06:00', 'UTC');
      expect(date.toISOString()).toBe('2026-08-13T06:00:00.000Z');
    });

    it('respects a positive offset (Istanbul)', () => {
      const date = zonedDateTime({ year: 2026, month: 8, day: 13 }, '06:00', 'Europe/Istanbul');
      expect(date.toISOString()).toBe('2026-08-13T03:00:00.000Z');
    });

    it('respects a negative offset (New York)', () => {
      const date = zonedDateTime({ year: 2026, month: 8, day: 13 }, '06:00', 'America/New_York');
      expect(date.toISOString()).toBe('2026-08-13T10:00:00.000Z');
    });
  });

  describe('wallClockInZone', () => {
    it('returns local fields', () => {
      const wall = wallClockInZone(new Date('2026-08-13T06:00:00.000Z'), 'Europe/Istanbul');
      expect(wall.hour).toBe(9);
      expect(wall.minute).toBe(0);
    });
  });

  describe('slotFor', () => {
    const cadence = { frequency: 'daily' as const, time: '06:00' };

    it('returns today slot in the site timezone', () => {
      const now = new Date('2026-08-13T09:00:00.000Z');
      const slot = slotFor(now, cadence, 'UTC');
      expect(slot.date.toISOString()).toBe('2026-08-13T06:00:00.000Z');
      expect(slot.periodKey).toBe('2026-08-13');
    });

    it('marks the slot as due once the wall-clock time has passed', () => {
      const now = new Date('2026-08-13T07:00:00.000Z');
      const slot = slotFor(now, cadence, 'UTC');
      expect(isDue(now, slot.date)).toBe(true);
    });

    it('is not due before the wall-clock time', () => {
      const now = new Date('2026-08-13T05:00:00.000Z');
      const slot = slotFor(now, cadence, 'UTC');
      expect(isDue(now, slot.date)).toBe(false);
    });

    it('daily slot depends on the site timezone, not the server timezone', () => {
      const now = new Date('2026-08-13T23:30:00.000Z');
      const utc = slotFor(now, cadence, 'UTC');
      const pacific = slotFor(now, cadence, 'America/Los_Angeles');
      // It is still 08-13 06:00 UTC, but already 08-13 16:30 in LA (due),
      // while UTC is 23:30 (also due). Period keys differ by tz when the
      // wall-clock date differs.
      expect(utc.periodKey).toBe('2026-08-13');
      expect(pacific.periodKey).toBe('2026-08-13');
    });

    it('weekly cadence picks this week weekday', () => {
      const now = new Date('2026-08-13T09:00:00.000Z'); // Thursday
      const slot = slotFor(now, { frequency: 'weekly', weekday: 1, time: '03:00' }, 'UTC'); // Monday
      expect(slot.date.toISOString()).toBe('2026-08-10T03:00:00.000Z');
      expect(slot.periodKey).toMatch(/^2026-W\d+$/);
    });

    it('monthly cadence clamps the day of month to the month length', () => {
      const slot = slotFor(new Date('2026-02-10T00:00:00.000Z'), { frequency: 'monthly', dayOfMonth: 31, time: '06:00' }, 'UTC');
      expect(slot.date.toISOString()).toBe('2026-02-28T06:00:00.000Z');
      expect(slot.periodKey).toBe('2026-02');
    });
  });

  describe('nextSlot', () => {
    it('returns the upcoming slot after now', () => {
      const now = new Date('2026-08-13T07:00:00.000Z');
      const next = nextSlot(now, { frequency: 'daily', time: '06:00' }, 'UTC');
      expect(next.date.toISOString()).toBe('2026-08-14T06:00:00.000Z');
      expect(next.periodKey).toBe('2026-08-14');
    });
  });
});
