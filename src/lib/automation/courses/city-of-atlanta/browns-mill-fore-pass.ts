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
    const siteUsername = opts.siteUsername;
    const sitePassword = opts.sitePassword;

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
      const localTime24 = bestSlot.localTime; // "18:30"

      console.log(`[BM] Navigating to ${TEEITUP_URL}`);
      await page.goto(TEEITUP_URL, { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(4000);
      console.log(`[BM] Page loaded. URL: ${page.url()}`);

      // Log in with Fore Pass credentials
      const emailInput = page.locator('input[type="email"], input[name="email"], input[name="username"]').first();
      if (await emailInput.isVisible({ timeout: 8000 }).catch(() => false)) {
        console.log("[BM] Email input visible — filling credentials");
        await emailInput.fill(siteUsername);
        await page.locator('input[type="password"]').first().fill(sitePassword);
        await Promise.all([
          page.waitForLoadState("load", { timeout: 20000 }),
          page.keyboard.press("Enter"),
        ]);
        await page.waitForTimeout(3000);
        console.log(`[BM] After login. URL: ${page.url()}`);
      } else {
        console.log("[BM] No email input on page load — checking for sign-in button");
        const signInBtn = page.getByRole("button", { name: /sign.?in|log.?in/i })
          .or(page.getByRole("link", { name: /sign.?in|log.?in/i })).first();
        if (await signInBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log("[BM] Sign-in button found — clicking and waiting for modal");
          await signInBtn.click();
          // Wait longer for modal/drawer to animate open
          await page.waitForTimeout(2000);
          const emailInput2 = page.locator('input[type="email"], input[name="email"]').first();
          if (await emailInput2.isVisible({ timeout: 8000 }).catch(() => false)) {
            console.log("[BM] Login modal open — filling credentials");
            await emailInput2.fill(opts.siteUsername);
            await page.locator('input[type="password"]').first().fill(opts.sitePassword);
            // Click the Login button rather than pressing Enter (more reliable in modals)
            const loginBtn = page.getByRole("button", { name: /^login$/i })
              .or(page.getByRole("button", { name: /^sign in$/i })).first();
            if (await loginBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
              console.log("[BM] Clicking Login button");
              await loginBtn.click();
            } else {
              await page.keyboard.press("Enter");
            }
            await page.waitForTimeout(5000);
            console.log(`[BM] After login. URL: ${page.url()}`);
          } else {
            console.log("[BM] Login modal did not open — proceeding without login");
          }
        } else {
          console.log("[BM] No login UI found — tee times visible without auth");
        }
      }

      // Navigate to the target date in calendar
      const dayNum = parseInt(formatInTimeZone(opts.targetDate, TZ, "d"), 10);
      const targetMonth = formatInTimeZone(opts.targetDate, TZ, "M");
      const currentMonth = formatInTimeZone(new Date(), TZ, "M");
      console.log(`[BM] Navigating to day ${dayNum}, targetMonth=${targetMonth}, currentMonth=${currentMonth}`);

      if (targetMonth !== currentMonth) {
        const nextBtn = page.locator('button[aria-label*="next" i], .next-month, [class*="next"]').first();
        if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nextBtn.click();
          await page.waitForTimeout(1000);
        }
      }

      const dateCell = page.locator(`td:has-text("${dayNum}"), button:has-text("${dayNum}")`).first();
      if (await dateCell.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log(`[BM] Clicking date cell ${dayNum}`);
        await dateCell.click();
        await page.waitForTimeout(3000);
      } else {
        console.log(`[BM] Date cell ${dayNum} not found — skipping click`);
      }

      // Take diagnostic screenshot to see what the browser actually sees
      const diagScreenshot = await page.screenshot({ type: "png", fullPage: false });
      const rawBodyText = await page.textContent("body").catch(() => null);
      const bodyText = (rawBodyText ?? "").slice(0, 500);
      console.log(`[BM] Page body preview: ${bodyText}`);

      // Find the tee time — try multiple formats: "6:30 PM", "6:30 pm", "6:30", "18:30"
      const timePart = displayTime.split(" ")[0]; // "6:30"
      const timeLocators = [
        page.getByText(displayTime, { exact: false }),               // "6:30 PM"
        page.getByText(displayTime.toLowerCase(), { exact: false }),  // "6:30 pm"
        page.locator(`text=/${timePart.replace(":", "\\:")} ?[Pp][Mm]/`), // regex
        page.getByText(timePart, { exact: false }),                   // bare "6:30"
        page.getByText(localTime24, { exact: false }),                // "18:30" (24h)
      ];
      let timeText = null;
      for (const loc of timeLocators) {
        if (await loc.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          timeText = loc.first();
          break;
        }
      }
      console.log(`[BM] Time text found: ${timeText !== null}`);
      if (!timeText) {
        return {
          success: false,
          errorMessage: `Tee time ${displayTime} not found on booking page`,
          screenshotBuffer: diagScreenshot,
        };
      }

      // Find the card containing BOTH the target time AND a CHOOSE RATE button,
      // then click the CHOOSE RATE button within that card.
      // Using filter() chains is more reliable than XPath ancestor traversal.
      const chooseRateBtn = page
        .locator("div, article, li, section")
        .filter({ hasText: new RegExp(timePart, "i") })
        .filter({ has: page.getByRole("button", { name: /choose rate/i }) })
        .first()
        .getByRole("button", { name: /choose rate/i });

      if (!(await chooseRateBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        const s = await page.screenshot({ type: "png" });
        return { success: false, errorMessage: `CHOOSE RATE not found for ${displayTime}`, screenshotBuffer: s };
      }

      console.log(`[BM] Clicking CHOOSE RATE for ${displayTime}`);
      await chooseRateBtn.click();
      await page.waitForTimeout(3000);

      const afterRateText = (await page.textContent("body").catch(() => null) ?? "").slice(0, 300);
      console.log(`[BM] After CHOOSE RATE: ${afterRateText}`);

      // Select Fore Pass / Walking rate if a rate selection modal appears
      const rateLocators = [
        page.getByRole("button", { name: /fore pass/i }),
        page.getByRole("button", { name: /walking/i }),
        page.getByText(/fore pass/i, { exact: false }),
        page.getByText(/walking/i, { exact: false }),
      ];
      for (const rateLoc of rateLocators) {
        if (await rateLoc.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log("[BM] Selecting rate option");
          await rateLoc.first().click();
          await page.waitForTimeout(2000);
          break;
        }
      }

      // Click the final Book / Confirm / Complete button
      const confirmBtn = page
        .getByRole("button", { name: /book|confirm|complete|reserve|checkout|proceed/i })
        .first();
      if (!(await confirmBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
        const s = await page.screenshot({ type: "png" });
        const pg = (await page.textContent("body").catch(() => null) ?? "").slice(0, 300);
        console.log(`[BM] No confirm button found. Page: ${pg}`);
        return { success: false, errorMessage: "Could not find booking confirm button", screenshotBuffer: s };
      }

      console.log("[BM] Clicking confirm button");
      await confirmBtn.click();
      await page.waitForTimeout(5000);

      // Verify the booking actually confirmed
      const finalText = (await page.textContent("body").catch(() => null) ?? "").toLowerCase();
      console.log(`[BM] Final page text: ${finalText.slice(0, 300)}`);
      const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });

      const confirmed = /confirm|reserved|booking|thank you|success|reservation/.test(finalText);
      if (!confirmed) {
        return {
          success: false,
          errorMessage: "Booking flow completed but no confirmation text detected",
          screenshotBuffer,
        };
      }

      const confMatch = finalText.match(/[0-9a-f]{24}/i);
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
