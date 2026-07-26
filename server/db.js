// ============================================================
// Prisma Client — singleton for Cardio AI Ghana (Prisma 5.x)
// SOC 2 CC6: database access controlled via DATABASE_URL
// HIPAA: query logging disabled — params may contain PHI
// ============================================================
import { PrismaClient } from "@prisma/client";
import logger from "./logger.js";

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: [
    { level: "warn",  emit: "event" },
    { level: "error", emit: "event" },
  ],
  errorFormat: "minimal",
});

prisma.$on("warn",  (e) => logger.warn("Prisma warn",  { msg: e.message }));
prisma.$on("error", (e) => logger.error("Prisma error", { msg: e.message }));

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

export default prisma;
