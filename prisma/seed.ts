import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  await db.golfCourse.upsert({
    where: { slug: "browns-mill-fore-pass" },
    update: {},
    create: {
      name: "Browns Mill Golf Course (Fore Pass)",
      slug: "browns-mill-fore-pass",
      websiteUrl: "https://www.cityofatlantagolf.com/browns-mill-fore-pass-member-tee-times/",
      bookingUrl: "https://browns-mill-fore-passholder.book.teeitup.golf/",
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
