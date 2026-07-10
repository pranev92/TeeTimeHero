/**
 * Browns Mill Golf Course — Fore Pass Holder booking automation.
 *
 * Uses the Kenna/TeeItUp REST API to find the best available slot,
 * then completes the booking via Playwright using real data-testid selectors
 * captured from the TeeItUp SPA via Chrome DevTools Recorder.
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
const TEEITUP_BASE = "https://browns-mill-fore-passholder.book.teeitup.golf/";
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
      await client.authenticate(siteUsername, sitePassword);
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

    // Step 2: Book through the browser using exact selectors from Chrome DevTools Recorder
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
      const timePart = displayTime.split(" ")[0]; // "6:30"
      const dateStr = formatInTimeZone(opts.targetDate, TZ, "yyyy-MM-dd");

      // Navigate with date in URL — no calendar clicking needed
      const bookingUrl = `${TEEITUP_BASE}?course=${FACILITY_ID}&date=${dateStr}&max=999999`;
      console.log(`[BM] Navigating to ${bookingUrl}`);
      await page.goto(bookingUrl, { waitUntil: "load", timeout: 60000 });
      await page.waitForTimeout(4000);
      console.log(`[BM] Page loaded. URL: ${page.url()}`);

      // ── Login ──────────────────────────────────────────────────────────────
      const emailInput = page
        .locator('input[type="email"], input[name="email"], input[name="username"]')
        .first();

      if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log("[BM] Email input visible on page — filling credentials");
        await emailInput.fill(siteUsername);
        await page.locator('input[type="password"]').first().fill(sitePassword);
        const loginBtn = page.getByRole("button", { name: /^login$|^sign in$/i }).first();
        if (await loginBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await loginBtn.click();
        } else {
          await page.keyboard.press("Enter");
        }
        await page.waitForTimeout(4000);
      } else {
        // Login is behind a Sign In button
        const signInBtn = page
          .getByRole("button", { name: /sign.?in|log.?in/i })
          .or(page.getByRole("link", { name: /sign.?in|log.?in/i }))
          .first();
        if (await signInBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          console.log("[BM] Clicking Sign In button");
          await signInBtn.click();
          await page.waitForTimeout(2000); // wait for modal to animate open

          const emailInput2 = page
            .locator('input[type="email"], input[name="email"]')
            .first();
          if (await emailInput2.isVisible({ timeout: 8000 }).catch(() => false)) {
            console.log("[BM] Login modal open — filling credentials");
            await emailInput2.fill(siteUsername);
            await page.locator('input[type="password"]').first().fill(sitePassword);
            const loginBtn2 = page.getByRole("button", { name: /^login$|^sign in$/i }).first();
            if (await loginBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
              console.log("[BM] Clicking Login button");
              await loginBtn2.click();
            } else {
              await page.keyboard.press("Enter");
            }
            await page.waitForTimeout(5000);
            console.log(`[BM] After login. URL: ${page.url()}`);
          } else {
            console.log("[BM] Login modal did not open — proceeding");
          }
        } else {
          console.log("[BM] No login UI — tee times visible without auth");
        }
      }

      // After login the SPA may redirect — navigate back to the date URL
      if (!page.url().includes(dateStr)) {
        console.log(`[BM] Re-navigating to date URL after login`);
        await page.goto(bookingUrl, { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(3000);
      }

      // ── Find the CHOOSE RATE button for the target time ────────────────────
      // The buttons have data-testid='teetimes_choose_rate_button' and an
      // aria-label containing the time, e.g. "...6:30:00 pm..."
      const diagScreenshot = await page.screenshot({ type: "png" });

      const allRateBtns = page.locator("[data-testid='teetimes_choose_rate_button']");
      const btnCount = await allRateBtns.count().catch(() => 0);
      console.log(`[BM] Found ${btnCount} CHOOSE RATE buttons on page`);

      let chooseRateBtn = null;
      for (let i = 0; i < btnCount; i++) {
        const btn = allRateBtns.nth(i);
        const ariaLabel = (await btn.getAttribute("aria-label").catch(() => "")) ?? "";
        console.log(`[BM] Button[${i}] aria-label: ${ariaLabel}`);
        if (ariaLabel.toLowerCase().includes(timePart)) {
          chooseRateBtn = btn;
          console.log(`[BM] Matched button[${i}] for ${timePart}`);
          break;
        }
      }

      // Fallback: find by card container containing the time text
      if (!chooseRateBtn && btnCount > 0) {
        console.log("[BM] aria-label match failed — trying card container fallback");
        chooseRateBtn = page
          .locator("div, article, li, section")
          .filter({ hasText: new RegExp(timePart.replace(":", "\\:"), "i") })
          .filter({ has: page.locator("[data-testid='teetimes_choose_rate_button']") })
          .first()
          .locator("[data-testid='teetimes_choose_rate_button']");
      }

      if (!chooseRateBtn || !(await chooseRateBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
        return {
          success: false,
          errorMessage: `CHOOSE RATE button not found for ${displayTime}`,
          screenshotBuffer: diagScreenshot,
        };
      }

      console.log(`[BM] Clicking CHOOSE RATE for ${displayTime}`);
      await chooseRateBtn.click();
      await page.waitForTimeout(3000);

      const afterChoose = (await page.textContent("body").catch(() => null) ?? "").slice(0, 200);
      console.log(`[BM] After CHOOSE RATE: ${afterChoose}`);

      // ── Add to Cart ────────────────────────────────────────────────────────
      const addToCartBtn = page.locator("[data-testid='add-to-cart-button']");
      if (!(await addToCartBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
        const s = await page.screenshot({ type: "png" });
        const pg = (await page.textContent("body").catch(() => null) ?? "").slice(0, 200);
        console.log(`[BM] Add to Cart not found. Page: ${pg}`);
        return { success: false, errorMessage: "Add to Cart button not found after CHOOSE RATE", screenshotBuffer: s };
      }
      console.log("[BM] Clicking Add to Cart");
      await addToCartBtn.click();
      await page.waitForTimeout(3000);

      // ── CHECKOUT (in cart drawer) ──────────────────────────────────────────
      const checkoutBtn = page.locator("[data-testid='shopping-cart-drawer-checkout-btn']");
      if (!(await checkoutBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
        const s = await page.screenshot({ type: "png" });
        return { success: false, errorMessage: "CHECKOUT button not found in cart drawer", screenshotBuffer: s };
      }
      console.log("[BM] Clicking CHECKOUT");
      await checkoutBtn.click();
      await page.waitForTimeout(3000);

      // ── Terms and Conditions ───────────────────────────────────────────────
      const termsInput = page.locator(
        "[data-testid='terms-and-conditions-checkbox'] input, [data-testid='terms-and-conditions-checkbox']"
      ).first();
      if (await termsInput.isVisible({ timeout: 8000 }).catch(() => false)) {
        const checked = await termsInput.isChecked().catch(() => false);
        if (!checked) {
          console.log("[BM] Checking Terms and Conditions");
          await termsInput.click();
          await page.waitForTimeout(1000);
        }
      } else {
        console.log("[BM] Terms checkbox not found — skipping");
      }

      // ── COMPLETE YOUR PURCHASE ─────────────────────────────────────────────
      const completeBtn = page
        .getByRole("button", { name: /complete your purchase/i })
        .first();
      if (!(await completeBtn.isVisible({ timeout: 8000 }).catch(() => false))) {
        const s = await page.screenshot({ type: "png" });
        const pg = (await page.textContent("body").catch(() => null) ?? "").slice(0, 200);
        console.log(`[BM] COMPLETE YOUR PURCHASE not found. Page: ${pg}`);
        return { success: false, errorMessage: "COMPLETE YOUR PURCHASE button not found", screenshotBuffer: s };
      }
      console.log("[BM] Clicking COMPLETE YOUR PURCHASE");
      await completeBtn.click();
      await page.waitForTimeout(6000);

      // ── Confirm success ────────────────────────────────────────────────────
      const finalText = (await page.textContent("body").catch(() => null) ?? "").toLowerCase();
      console.log(`[BM] Final page: ${finalText.slice(0, 300)}`);
      const screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });

      const confirmed = /confirm|reserved|booking|thank you|success|reservation/.test(finalText);
      if (!confirmed) {
        return {
          success: false,
          errorMessage: "No confirmation text found after COMPLETE YOUR PURCHASE",
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
