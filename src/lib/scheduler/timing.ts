import { addDays, nextDay, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { DayOfWeek } from "@prisma/client";

const DAY_INDEX: Record<DayOfWeek, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/**
 * Given a booking request's day + course config, return the UTC timestamp
 * of the NEXT booking window opening — i.e., exactly when the booking
 * system opens for that target tee date.
 *
 * Example:
 *   dayOfWeek = SUNDAY, bookingWindowDays = 7, bookingOpenTime = "00:20"
 *   → next Sunday's tee sheet opens the previous Sunday at 00:20 local time
 */
export function nextBookingWindowOpen(opts: {
  dayOfWeek: DayOfWeek;
  timezone: string;
  bookingWindowDays: number;
  bookingOpenTime: string; // "HH:MM"
}): { openAt: Date; targetDate: Date } {
  const { dayOfWeek, timezone, bookingWindowDays, bookingOpenTime } = opts;
  const [openHour, openMinute] = bookingOpenTime.split(":").map(Number);
  const targetDayIndex = DAY_INDEX[dayOfWeek];

  // Work in the course's local timezone
  const nowLocal = toZonedTime(new Date(), timezone);
  const todayIndex = nowLocal.getDay();

  // Days until the next occurrence of targetDayIndex
  let daysUntilTarget = (targetDayIndex - todayIndex + 7) % 7;
  if (daysUntilTarget === 0) daysUntilTarget = 7; // always the NEXT one, not today

  // The future tee date (local)
  let targetLocal = addDays(nowLocal, daysUntilTarget);
  targetLocal = setHours(setMinutes(setSeconds(setMilliseconds(targetLocal, 0), 0), 0), 0);

  // The booking window opens `bookingWindowDays` before the tee date
  let openLocal = addDays(targetLocal, -bookingWindowDays);
  openLocal = setHours(setMinutes(setSeconds(setMilliseconds(openLocal, 0), 0), openMinute), openHour);

  // If the window has already passed, advance by 7 days
  if (openLocal <= nowLocal) {
    targetLocal = addDays(targetLocal, 7);
    openLocal = addDays(openLocal, 7);
  }

  return {
    openAt: fromZonedTime(openLocal, timezone),
    targetDate: fromZonedTime(targetLocal, timezone),
  };
}

/** Milliseconds until the booking window opens */
export function msUntilOpen(openAt: Date): number {
  return Math.max(0, openAt.getTime() - Date.now());
}
