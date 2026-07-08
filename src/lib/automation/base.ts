import type { Browser, Page } from "playwright";

export interface BookingOptions {
  targetDate: Date;
  preferredTime: string; // HH:MM
  windowStart: string;   // HH:MM
  windowEnd: string;     // HH:MM
  numPlayers: number;
  golferNames: string[];
  siteUsername?: string;
  sitePassword?: string;
}

export interface BookingResult {
  success: boolean;
  confirmedTime?: string;  // HH:MM
  confirmationId?: string;
  errorMessage?: string;
  screenshotPath?: string;
}

export abstract class BaseAutomation {
  protected browser!: Browser;
  protected page!: Page;

  constructor(protected readonly courseSlug: string) {}

  /** Full end-to-end booking attempt. Returns result; never throws. */
  async attempt(opts: BookingOptions): Promise<BookingResult> {
    const { chromium } = await import("playwright");
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
    try {
      await this.login(opts);
      const result = await this.book(opts);
      return result;
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await this.browser.close();
    }
  }

  protected abstract login(opts: BookingOptions): Promise<void>;
  protected abstract book(opts: BookingOptions): Promise<BookingResult>;
}
