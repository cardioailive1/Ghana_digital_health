// ============================================================
// Cardio AI Ghana — Express Server for Render.com
// HIPAA · SOC 2 · OAuth · RBAC · Cybersecurity hardened
// ============================================================
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import passport from "passport";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import hpp from "hpp";

import logger from "./logger.js";
import { prisma } from "./db.js";
import {
  corsMiddleware, helmetMiddleware, globalRateLimit,
  sanitizeInput, requestId, securityLogger, phiResponseFilter,
} from "./security.js";
import authRoutes from "./routes/auth.routes.js";
import aiRoutes   from "./routes/ai.routes.js";
import auditRoute      from "../middleware/auditMiddleware.js";
import platformRoutes  from "./routes/platform.routes.js";
import { validate, chatSchema } from "../middleware/validateRequest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3001");
const isProd = process.env.NODE_ENV === "production";
const DIST = path.resolve(__dirname, "../dist");
const PUBLIC = path.resolve(__dirname, "../public");

const app = express();

// ── Trust proxy (Render runs behind a load balancer) ─────────
app.set("trust proxy", 1);

// ── Security middleware stack ─────────────────────────────────
app.use(requestId);
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(globalRateLimit);
app.use(securityLogger);
app.use(phiResponseFilter);
app.use(hpp());                            // HTTP parameter pollution
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));   // cap payload
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(sanitizeInput);
app.use(passport.initialize());

// ── HTTP request logging (never logs body = no PHI in logs) ──
app.use(morgan("[:date[iso]] :method :url :status :res[content-length]b :response-time ms", {
  stream: { write: (msg) => logger.info(msg.trim()) },
  skip: (req) => req.path === "/api/health",
}));

// ── Security headers not covered by helmet ────────────────────
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/api",  aiRoutes);
app.use("/api/audit",  auditRoute);
app.use("/api",        platformRoutes);

// ── Static files ──────────────────────────────────────────────
// Serve platform.html directly (no auth — it's the shell)
app.use("/platform.html", express.static(path.join(PUBLIC, "platform.html")));
app.use(express.static(PUBLIC));

// In production, serve Vite build
if (isProd) {
  app.use(express.static(DIST));
  app.get("*", (req, res) => {
    res.sendFile(path.join(DIST, "index.html"));
  });
}

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error("Unhandled error", { msg: err.message, path: req.path });
  const status = err.status || err.statusCode || 500;
  // Never send stack traces to client in production
  res.status(status).json({
    error: isProd ? "An internal error occurred" : err.message,
    requestId: req.requestId,
  });
});

// ── Start ─────────────────────────────────────────────────────
const server = createServer(app);
server.listen(PORT, "0.0.0.0", async () => {
  logger.info(`Cardio AI Ghana v3.0.0 — Port ${PORT} — ${process.env.NODE_ENV}`);
  logger.info(`Platform: http://localhost:${PORT}/platform.html`);
  logger.info(`Clinical AI: http://localhost:${PORT}`);
  // Verify DB connection on startup
  try {
    await prisma.$connect();
    const userCount = await prisma.user.count();
    logger.info(`PostgreSQL connected — ${userCount} users in database`);
    if (userCount === 0) {
      logger.warn("No users found — run: node server/seed.js");
    }
  } catch (e) {
    logger.error("PostgreSQL connection failed", { msg: e.message });
    logger.error("Set DATABASE_URL in environment and run: npx prisma migrate deploy");
  }
});

// ── Graceful shutdown (SOC 2 availability) ────────────────────
const shutdown = async (sig) => {
  logger.warn(`Signal ${sig} — graceful shutdown`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.warn("Server closed — DB disconnected");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000); // force after 10s
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException",  (e) => { logger.error("Uncaught",  {msg: e.message}); });
process.on("unhandledRejection", (r) => { logger.error("Unhandled", {msg: String(r)}); });

export default app;
