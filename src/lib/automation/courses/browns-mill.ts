import { BaseAutomation, BookingOptions, BookingResult } from "../base";
import { format } from "date-fns";

/**
 * Browns Mill Golf Course — Atlanta, GA
 * Booking site: https://www.brownsmillgc.com (or GolfNow / city portal)
 *
 * TODO: Inspect the actual booking flow and fill in selectors.
 * The login() and book() methods below are scaffolded but NOT wired to live selectors.
 */
export class BrownsMillAutomation extends BaseAutomation {
  private static readonly BOOKING_URL = "https://www.brownsmillgc.com/tee-times";

  constructor() {
    super("browns-mill");
  }

  protected async login(opts: BookingOptions): Promise<void> {
    if (!opts.siteUsername || !opts.sitePassword) {
      throw new Error("Browns Mill requires site credentials");
    }

    await this.page.goto(BrownsMillAutomation.BOOKING_URL, { waitUntil: "networkidle" });

    // TODO: Update selectors to match actual login form
    await this.page.fill('[name="username"], input[type="email"]', opts.siteUsername);
    await this.page.fill('[name="password"], input[type="password"]', opts.sitePassword);
    await this.page.click('button[type="submit"]');
    await this.page.waitForLoadState("networkidle");
  }

  protected async book(opts: BookingOptions): Promise<BookingResult> {
    const dateStr = format(opts.targetDate, "yyyy-MM-dd");

    // TODO: Navigate to the tee sheet for the target date
    // The URL pattern below is a placeholder — inspect the real site
    await this.page.goto(
      `${BrownsMillAutomation.BOOKING_URL}?date=${dateStr}&players=${opts.numPlayers}`,
      { waitUntil: "networkidle" }
    );

    // TODO: Find available tee times within the window
    // const slots = await this.page.locator('.tee-time-slot').all();
    // const best = selectBestSlot(slots, opts.windowStart, opts.windowEnd);

    // TODO: Click the slot, fill player info, confirm
    // await best.click();
    // await this.page.fill('[name="golfer1"]', opts.golferNames[0] ?? opts.siteUsername ?? "");
    // await this.page.click('button:has-text("Confirm Booking")');
    // const confirmId = await this.page.textContent('.confirmation-number');

    // Placeholder — remove once real selectors are wired up
    throw new Error(
      "BrownsMillAutomation.book() is not yet implemented. " +
      "Inspect the booking site and fill in the selectors above."
    );
  }
}
