import { chromium } from "playwright";

export interface ScreenshotDetails {
  courseName: string;
  confirmedTime: string;
  targetDate: Date;
  numPlayers: number;
  confirmationId: string;
}

function buildReceiptHtml(d: ScreenshotDetails): string {
  const dateStr = d.targetDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  const [h, m] = d.confirmedTime.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  const timeStr = `${h12}:${String(m).padStart(2, "0")} ${ampm}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #09090b;
    color: #fff;
    width: 560px;
    padding: 32px;
  }
  .card {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 16px;
    overflow: hidden;
  }
  .header {
    background: #14532d;
    padding: 24px 28px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .check {
    background: #16a34a;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }
  .header-text h1 {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
  }
  .header-text p {
    font-size: 13px;
    color: #86efac;
    margin-top: 2px;
  }
  .body {
    padding: 28px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .field label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #71717a;
    margin-bottom: 4px;
    display: block;
  }
  .field .value {
    font-size: 15px;
    font-weight: 600;
    color: #f4f4f5;
  }
  .field.full {
    grid-column: 1 / -1;
  }
  .footer {
    border-top: 1px solid #27272a;
    padding: 16px 28px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .brand {
    font-size: 12px;
    color: #52525b;
    font-weight: 500;
  }
  .brand span { color: #22c55e; }
  .conf {
    font-size: 11px;
    color: #52525b;
    font-family: monospace;
  }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="check">✓</div>
    <div class="header-text">
      <h1>Tee Time Booked</h1>
      <p>${d.courseName}</p>
    </div>
  </div>
  <div class="body">
    <div class="field">
      <label>Date</label>
      <div class="value">${dateStr}</div>
    </div>
    <div class="field">
      <label>Tee Time</label>
      <div class="value">${timeStr}</div>
    </div>
    <div class="field">
      <label>Players</label>
      <div class="value">${d.numPlayers} ${d.numPlayers === 1 ? "Player" : "Players"}</div>
    </div>
    <div class="field">
      <label>Rate</label>
      <div class="value">Fore Pass (Walking)</div>
    </div>
    <div class="field full">
      <label>Confirmation #</label>
      <div class="value" style="font-family:monospace;color:#4ade80;font-size:14px;">${d.confirmationId}</div>
    </div>
  </div>
  <div class="footer">
    <div class="brand"><span>TeeTime</span>Hero</div>
    <div class="conf">Booked via Kenna/TeeItUp API</div>
  </div>
</div>
</body>
</html>`;
}

export async function takeConfirmationScreenshot(
  details: ScreenshotDetails
): Promise<Buffer | null> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 560, height: 360 });
    await page.setContent(buildReceiptHtml(details), { waitUntil: "load" });
    // Clip to card height to avoid excessive whitespace
    const card = page.locator(".card");
    const box = await card.boundingBox();
    const clip = box
      ? { x: box.x, y: box.y, width: box.width, height: box.height }
      : undefined;
    const png = await page.screenshot({ clip, type: "png" });
    return Buffer.from(png);
  } catch (err) {
    console.error("[screenshot] Failed to capture confirmation screenshot:", err);
    return null;
  } finally {
    await browser?.close();
  }
}
