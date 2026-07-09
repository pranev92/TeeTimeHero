import path from "path";
import { defineConfig } from "prisma/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrate: {
    adapter: async () =>
      new PrismaLibSql({
        url: process.env.DATABASE_URL ?? `file:${path.resolve("dev.db")}`,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }),
  },
});
