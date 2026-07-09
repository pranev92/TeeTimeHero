/**
 * Browns Mill Golf Course — Fore Pass Holder booking automation.
 * Uses the Kenna/TeeItUp REST API directly (no browser automation).
 *
 * Course constants (hardcoded — verified from network inspection):
 *   facilityId  : 1745
 *   courseId    : 54f14bf00c8ad60378b01a11
 *   alias       : browns-mill-fore-passholder
 *   timezone    : America/New_York
 *   GolfCourseId (cart/riding) : 135358  (tags: MO, CI)
 *   GolfCourseId (walking)     : 135355  (tags: WR)
 */

import { format, parseISO } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { KennaClient, TeeTimeSlot, TeeTimeRate } from "./kenna-api";
import type { BookingOptions, BookingResult } from "../../base";

const FACILITY_ID  = 1745;
const COURSE_ID    = "54f14bf00c8ad60378b01a11";
const ALIAS        = "browns-mill-fore-passholder";
const TZ           = "America/New_York";

export class BrownsMillForePassAutomation {
  async attempt(opts: BookingOptions): Promise<BookingResult> {
    if (!opts.siteUsername || !opts.sitePassword) {
      return { success: false, errorMessage: "Fore Pass credentials required" };
    }

    const client = new KennaClient(ALIAS);

    try {
      // 1. Authenticate
      await client.authenticate(opts.siteUsername, opts.sitePassword);

      // 2. Fetch available tee times for the target date
      const dateStr = formatInTimeZone(opts.targetDate, TZ, "yyyy-MM-dd");
      const teeTimes = await client.getTeeTimes(dateStr, FACILITY_ID);
      const slots: TeeTimeSlot[] = teeTimes.flatMap((d) => d.teetimes);

      if (slots.length === 0) {
        return { success: false, errorMessage: `No tee times available on ${dateStr}` };
      }

      // 3. Find the best slot within the time window
      const best = selectBestSlot(slots, opts);
      if (!best) {
        return {
          success: false,
          errorMessage: `No available slot between ${opts.windowStart} and ${opts.windowEnd} for ${opts.numPlayers} player(s)`,
        };
      }

      const { slot, rate } = best;
      const localTime = toLocalHHMM(slot.teetime, TZ);

      // 4. Create shopping cart
      const cart = await client.createCart();

      // 5. Add the selected tee time to the cart
      const item = await client.addCartItem(cart.id, slot, rate, opts.numPlayers, FACILITY_ID);

      // 6. Lock the tee time slot
      await client.lockTeeTime(COURSE_ID, slot.teetime, opts.numPlayers);

      // 7. Verify it's still bookable
      const { bookable } = await client.isBookable(cart.id, item.id);
      if (!bookable) {
        return { success: false, errorMessage: "Slot became unavailable after lock" };
      }

      // 8. Place the order
      await client.createOrder(cart.id);

      // 9. Finalize the tee time booking
      const final = await client.orderTeeTime(cart.id, item.id, slot.teetime, rate._id, opts.numPlayers);

      return {
        success: true,
        confirmedTime: localTime,
        confirmationId: final.confirmationNumber ?? final.id,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a UTC ISO string to "HH:MM" in the course timezone */
function toLocalHHMM(utcIso: string, tz: string): string {
  const local = toZonedTime(parseISO(utcIso), tz);
  return format(local, "HH:mm");
}

/** Pick the slot closest to preferredTime that fits within the window and allows numPlayers */
function selectBestSlot(
  slots: TeeTimeSlot[],
  opts: BookingOptions
): { slot: TeeTimeSlot; rate: TeeTimeRate } | null {
  const [wsH, wsM] = opts.windowStart.split(":").map(Number);
  const [weH, weM] = opts.windowEnd.split(":").map(Number);
  const [prefH, prefM] = opts.preferredTime.split(":").map(Number);
  const windowStartMin = wsH * 60 + wsM;
  const windowEndMin   = weH * 60 + weM;
  const preferredMin   = prefH * 60 + prefM;

  let best: { slot: TeeTimeSlot; rate: TeeTimeRate; diff: number } | null = null;

  for (const slot of slots) {
    const localTime = toLocalHHMM(slot.teetime, TZ);
    const [h, m] = localTime.split(":").map(Number);
    const slotMin = h * 60 + m;

    if (slotMin < windowStartMin || slotMin > windowEndMin) continue;
    if (slot.maxPlayers < opts.numPlayers) continue;

    const walkRate = slot.rates.find(
      (r) => r.tags.includes("WR") && r.allowedPlayers.includes(opts.numPlayers)
    );
    const cartRate = slot.rates.find(
      (r) => (r.tags.includes("CI") || r.tags.includes("MO")) && r.allowedPlayers.includes(opts.numPlayers)
    );
    const rate = walkRate ?? cartRate;
    if (!rate) continue;

    const diff = Math.abs(slotMin - preferredMin);
    if (!best || diff < best.diff) {
      best = { slot, rate, diff };
    }
  }

  return best ? { slot: best.slot, rate: best.rate } : null;
}
