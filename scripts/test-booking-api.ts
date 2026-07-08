/**
 * Dry-run test of the Browns Mill Fore Pass booking API.
 * Does NOT actually complete a booking — stops before POST /orders.
 *
 * Usage:
 *   SITE_USERNAME=your@email.com SITE_PASSWORD=yourpassword \
 *   npx tsx scripts/test-booking-api.ts [YYYY-MM-DD]
 *
 * If no date is given, uses today.
 */

import { KennaClient } from "../src/lib/automation/courses/city-of-atlanta/kenna-api";
import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const USERNAME = process.env.SITE_USERNAME;
const PASSWORD = process.env.SITE_PASSWORD;
const DATE_ARG = process.argv[2] ?? format(new Date(), "yyyy-MM-dd");
const TZ = "America/New_York";
const FACILITY_ID = 1745;

if (!USERNAME || !PASSWORD) {
  console.error("Set SITE_USERNAME and SITE_PASSWORD env vars");
  process.exit(1);
}

function localTime(utcIso: string) {
  return format(toZonedTime(parseISO(utcIso), TZ), "h:mm a");
}

async function main() {
  const client = new KennaClient("browns-mill-fore-passholder");

  console.log(`\n1. Authenticating as ${USERNAME}...`);
  const auth = await client.authenticate(USERNAME!, PASSWORD!);
  console.log(`   ✓ Logged in as ${auth.customer.name.formatted}`);

  console.log(`\n2. Fetching tee times for ${DATE_ARG}...`);
  const data = await client.getTeeTimes(DATE_ARG, FACILITY_ID);
  const slots = data.flatMap((d) => d.teetimes);
  console.log(`   ✓ Found ${slots.length} tee time slots`);

  if (slots.length === 0) {
    console.log("   No slots available.");
    return;
  }

  console.log("\n   Available slots:");
  for (const slot of slots.slice(0, 10)) {
    const time = localTime(slot.teetime);
    const players = `${slot.maxPlayers - slot.bookedPlayers} spot(s) left`;
    const cartRate = slot.rates.find((r) => r.tags.includes("CI"));
    const price = cartRate ? `$${(cartRate.greenFeeCart ?? 0) / 100}` : "—";
    console.log(`     ${time}  |  max ${slot.maxPlayers} players  |  ${players}  |  ${price} cart`);
  }
  if (slots.length > 10) console.log(`     ... and ${slots.length - 10} more`);

  console.log("\n3. Creating shopping cart...");
  const cart = await client.createCart();
  console.log(`   ✓ Cart created: ${cart.id}`);

  // Pick the first available slot for testing
  const testSlot = slots.find((s) => s.maxPlayers > s.bookedPlayers);
  if (!testSlot) {
    console.log("   No open slots to test with.");
    return;
  }

  const rate = testSlot.rates.find((r) => r.tags.includes("CI") && r.allowedPlayers.includes(1))
    ?? testSlot.rates[0];

  console.log(`\n4. Adding tee time ${localTime(testSlot.teetime)} to cart (rate ${rate._id})...`);
  const item = await client.addCartItem(
    cart.id,
    rate._id,
    rate.golfnow.GolfCourseId,
    1,
    testSlot.teetime,
    "54f14bf00c8ad60378b01a11"
  );
  console.log(`   ✓ Cart item added: ${item.id}`);

  console.log("\n5. Checking if bookable...");
  const { bookable } = await client.isBookable(cart.id, item.id);
  console.log(`   ✓ Bookable: ${bookable}`);

  console.log("\n✅ Dry run complete — stopping before order placement.");
  console.log("   The API flow works. Real bookings will proceed to POST /orders + /order-teetime.\n");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
