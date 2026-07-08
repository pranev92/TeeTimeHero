/**
 * Run: npx tsx scripts/inspect-teeitup.ts
 *
 * Opens the Browns Mill Fore Pass booking page in a visible browser.
 * Captures ALL Kenna API request bodies + response bodies so we can
 * build a direct API client (no browser automation needed).
 *
 * Output saved to scripts/inspect-output/
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";

const OUT_DIR = "./scripts/inspect-output";
mkdirSync(OUT_DIR, { recursive: true });

const BOOKING_URL = "https://www.cityofatlantagolf.com/browns-mill-fore-pass-member-tee-times/";
const KENNA_HOST = "phx-api-be-east-1b.kenna.io";

type ApiEntry = {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  status: number | null;
  responseBody: string | null;
};

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const apiLog: ApiEntry[] = [];

  // Intercept requests to the Kenna API
  await context.route(`**/${KENNA_HOST}/**`, async (route) => {
    const req = route.request();
    let reqBody: string | null = null;
    try { reqBody = req.postData(); } catch {}

    const entry: ApiEntry = {
      method: req.method(),
      url: req.url(),
      requestHeaders: req.headers(),
      requestBody: reqBody,
      status: null,
      responseBody: null,
    };
    apiLog.push(entry);

    // Let the request through and capture the response
    const response = await route.fetch();
    entry.status = response.status();
    try {
      const body = await response.text();
      entry.responseBody = body.substring(0, 8000); // cap at 8kb per entry
    } catch {}

    await route.fulfill({ response });
  });

  const page = await context.newPage();
  console.log(`\nNavigating to ${BOOKING_URL} ...\n`);
  await page.goto(BOOKING_URL, { waitUntil: "networkidle", timeout: 30_000 });

  await page.screenshot({ path: `${OUT_DIR}/01-initial.png`, fullPage: true });

  console.log("=".repeat(60));
  console.log(" LOG IN, pick a date, select a tee time, complete booking");
  console.log(" (or go as far as the confirmation page)");
  console.log(" Press ENTER in this terminal when done.");
  console.log("=".repeat(60));
  console.log();

  await new Promise<void>((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    });
  });

  await page.screenshot({ path: `${OUT_DIR}/02-final.png`, fullPage: true });

  // Save the full API log
  writeFileSync(`${OUT_DIR}/kenna-api-log.json`, JSON.stringify(apiLog, null, 2));

  console.log(`\n✅ Captured ${apiLog.length} Kenna API calls → kenna-api-log.json\n`);
  console.log("Calls captured:");
  for (const e of apiLog) {
    console.log(`  [${e.method}] ${e.url.replace(`https://${KENNA_HOST}`, "")} → ${e.status}`);
  }

  await browser.close();
}

main().catch(console.error);
