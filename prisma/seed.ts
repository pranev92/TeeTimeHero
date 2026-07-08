import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  await db.golfCourse.upsert({
    where: { slug: "browns-mill" },
    update: {},
    create: {
      name: "Browns Mill Golf Course",
      slug: "browns-mill",
      websiteUrl: "https://www.brownsmillgc.com",
      bookingUrl: "https://www.brownsmillgc.com/tee-times",
      timezone: "America/New_York",
      bookingWindowDays: 7,
      bookingOpenTime: "00:20",
      requiresLogin: true,
    },
  });

  console.log("Seeded golf courses");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
