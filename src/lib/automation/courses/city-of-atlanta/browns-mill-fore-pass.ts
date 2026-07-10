/**
 * Browns Mill Golf Course — Fore Pass Holder booking automation.
 *
 * Uses the Kenna/TeeItUp REST API to find the best available slot,
 * then confirms the booking via Playwright browser (the API checkout
 * endpoints return success but don't reliably finalize reservations).
 *
 * Course constants:
 *   facilityId : 1745
 *   alias      : browns-mill-fore-passholder
 *   timezone   : America/New_York
 */

import { format, parseISO } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { KennaClient, TeeTimeSlot, TeeTimeRate } from "./kenna-api";
import type { BookingOptions, BookingResult } from "../../base";

const FACILITY_ID = 1745;
const ALIAS = "browns-mill-fore-passholder";
const TEEITUP_URL = "https://browns-mill-fore-passholder.book.teeitup.golf/";
const TZ = "America/New_York";

export class BrownsMillForePassAutomation {
  async attempt(opts: BookingOptions): Promise<BookingResult> {
    if (!opts.siteUsername || !opts.sitePassword) {
      return { success: false, errorMessage: "Fore Pass credentials required" };
    }

    // Step 1: Use Kenna API to find the best available slot
    const client = new KennaClient(ALIAS);
    let bestSlot: { slot: TeeTimeSlot; rate: TeeTimeRate; localTime: string } | null = null;

    try {
      await client.authenticate(opts.siteUsername, opts.sitePassword);
      const dateStr = formatInTimeZone(opts.targetDate, TZ, "yyyy-MM-dd");
      const teeTimes = await client.getTeeTimes(dateStr, FACILITY_ID);
      const slots: TeeTimeSlot[] = teeTimes.flatMap((d) => d.teetimes);

      if (slots.length === 0) {
        return { success: false, errorMessage: `No tee times available on ${dateStr}` };
      }

      const best = selectBestSlot(slots, opts);
      if (!best) {
        return {
          success: false,
          errorMessage: `No available slot between ${opts.windowStart} and ${opts.windowEnd}`,
        };
      }
      bestSlot = { ...best, localTime: toLocalHHMM(best.slot.teetime, TZ) };
    } catch (err) {
      return {
        success: false,
        errorMessage: `API error finding slot: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Step 2: Book through the browser (reliable — mirrors what user does manually)
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    try {
      const displayTime = toDisplayTime(bestSlot.localTime); // "6:30 PM"

      // Navigate directly to TeeItUp (avoids WordPress iframe issues)
      // Use "load" not "networkidle" — SPAs keep polling and networkidle never fires
      await page.goto(TEEITUP_URL, { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(3000);

      // Log in with Fore Pass credentials
      const emailInput = page.locator('input[type="email"], input[name="email"], input[name="username"]').first();
      if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
        await emailInput.fill(opts.siteUsername);
        await page.locator('input[type="password"]').first().fill(opts.sitePassword);
        await Promise.all([
          page.waitForLoadState("load", { timeout: 20000 }),
          page.keyboard.press("Enter"),
        ]);
      } else {
        // Login might be behind a sign-in button
        const signInBtn = page.getByRole("button", { name: /sign.?in|log.?in/i })
          .or(page.getByRole("link", { name: /sign.?in|log.?in/i })).first();
        if (await signInBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await signInBtn.click();
          await page.waitForTimeout(1000);
          const emailInput2 = page.locator('input[type="email"], input[name="email"]').first();
          if (await emailInput2.isVisible({ timeout: 5000 }).catch(() => false)) {
            await emailInput2.fill(opts.siteUsername);
            await page.locator('input[type="password"]').first().fill(opts.sitePassword);
            await Promise.all([
              page.waitForLoadState("load", { timeout: 20000 }),
              page.keyboard.press("Enter"),
            ]);
          }
        }
      }

      // Navigate to the target date in calendar
      const dayNum = parseInt(formatInTimeZone(opts.targetDate, TZ, "d"), 10);
      const targetMonth = formatInTimeZone(opts.targetDate, TZ, "M");
      const currentMonth = formatInTimeZone(new Date(), TZ, "M");

      if (targetMonth !== currentMonth) {
        const nextBtn = page.locator('button[aria-label*="next" i], .next-month, [class*="next"]').first();
        if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn.click();
          await page.waitForTimeout(1000);
        }
      }

      const dateCell = page.locator(`td:has-text("${dayNum}"), button:has-text("${dayNum}")`).first();
      if (await dateCell.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dateCell.click();
        await page.waitForTimeout(2000);
      }

      await page.waitForTimeout(2000);

      // Take diagnostic screenshot to see what the browser actually sees
      const diagScreenshot = await page.screenshot({ type: "png", fullPage: false });

      // Find the tee time — try multiple formats (SPA may render "6:30 PM", "6:30pm", "6:30")
      const timePart = displayTime.split(" ")[0]; // "6:30"
      const timeLocators = [
        page.getByText(displayTime, { exact: false }),           // "6:30 PM"
        page.getByText(displayTime.toLowerCase(), { exact: false }), // "6:30 pm"
        page.locator(`text=/${timePart.replace(":", "\\:")} ?[Pp][Mm]/`), // regex
        page.getByText(timePart, { exact: false }),              // bare "6:30"
      ];
      let timeText = null;
      for (const loc of timeLocators) {
        if (await loc.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          timeText = loc.first();
          break;
        }
      }
      if (!timeText) {
        // Return diagnostic screenshot so we can see what went wrong
        return {
          success: false,
          errorMessage: `Tee time ${displayTime} not found on booking page`,
          screenshotBuffer: diagScreenshot,
        };
      }

      // Find the "CHOOSE RATE" button in the same card as the time
      // Walk up ancestors until we find a container with a CHOOSE RATE button
      let chooseRateBtn = null;
      for (const selector of [
        `xpath=//*/text()[contains(., "${displayTime}")]/ancestor::div[.//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'choose rate')]][1]//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'choose rate')]`,
        `text=CHOOSE RATE >> nth=0`,
        `button:has-text("CHOOSE RATE")`,
        `button:has-text("Choose Rate")`,
      ]) {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          chooseRateBtn = btn;
          break;
        }
      }

      if (!chooseRateBtn) {
        return { success: false, errorMessage: "Could not find CHOOSE RATE button" };
      }

      await chooseRateBtn.click();
      await page.waitForTimeout(2000);

      // Select Fore Pass / Walking rate if a rate selection screen appears
      for (const rateSelector of [
        'text=Fore Pass',
        'text=Walking',
        'button:has-text("Fore Pass")',
        'button:has-text("Walking")',
        '[class*="rate"]:has-text("Walking")',
      ]) {
        const rateEl = page.locator(rateSelector).first();
        if (await rateEl.isVisible({ timeout: 2000 }).catch(() => false)) {
          await rateEl.click();
          await page.waitForTimeout(500);
          break;
        }
      }

      // Click Book / Confirm / Complete button
      const confirmBtn = page.getByRole("button", { name: /^(book|confirm|complete|reserve|checkout)/i }).first();
      if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(4000);
      }

      // Wait for confirmation to appear
      await page.waitForTimeout(3000);

      // Take screenshot of the confirmation / post-booking page
      const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });

      // Try to extract confirmation ID from the page
      const pageText = await page.textContent("body").catch(() => "");
      const confMatch = pageText?.match(/[0-9a-f]{24}/i);

      return {
        success: true,
        confirmedTime: bestSlot.localTime,
        confirmationId: confMatch?.[0] ?? bestSlot.localTime,
        screenshotBuffer,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: `Browser booking error: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      await browser.close();
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalHHMM(utcIso: string, tz: string): string {
  const local = toZonedTime(parseISO(utcIso), tz);
  return format(local, "HH:mm");
}

function toDisplayTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function selectBestSlot(
  slots: TeeTimeSlot[],
  opts: BookingOptions
): { slot: TeeTimeSlot; rate: TeeTimeRate } | null {
  const [wsH, wsM] = opts.windowStart.split(":").map(Number);
  const [weH, weM] = opts.windowEnd.split(":").map(Number);
  const [prefH, prefM] = opts.preferredTime.split(":").map(Number);
  const windowStartMin = wsH * 60 + wsM;
  const windowEndMin = weH * 60 + weM;
  const preferredMin = prefH * 60 + prefM;

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
    if (!best || diff < best.diff) best = { slot, rate, diff };
  }

  return best ? { slot: best.slot, rate: best.rate } : null;
}
