// ============================================================
// Prisma Client — singleton for Cardio AI Ghana
// Shared across all server modules
// SOC 2 CC6: database access controlled via connection string
// HIPAA: never log query params (potential PHI)
// ============================================================
import { PrismaClient } from "@prisma/client";
import logger from "./logger.js";

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: [
    { level: "warn",  emit: "event" },
    { level: "error", emit: "event" },
    // "query" intentionally excluded — query params may contain PHI
  ],
  errorFormat: "minimal",
});

// Log DB warnings and errors — never log query content
prisma.$on("warn",  (e) => logger.warn("Prisma warn",  { msg: e.message }));
prisma.$on("error", (e) => logger.error("Prisma error", { msg: e.message }));

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown — close pool cleanly (SOC 2 availability)
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
