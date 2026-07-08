import path from "path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

function makeClient() {
  // Resolve to absolute path so it works regardless of cwd
  const url = process.env.DATABASE_URL?.startsWith("file:")
    ? `file:${path.resolve(process.env.DATABASE_URL.slice(5))}`
    : process.env.DATABASE_URL ?? `file:${path.resolve("dev.db")}`;
  const adapter = new PrismaLibSql({ url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const db = globalForPrisma.prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
