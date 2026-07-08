import path from "path";
import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
