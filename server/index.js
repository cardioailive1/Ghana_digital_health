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
import authRoutes     from "./routes/auth.routes.js";
import aiRoutes       from "./routes/ai.routes.js";
import auditRoute     from "../middleware/auditMiddleware.js";
import platformRoutes from "./routes/platform.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT   = parseInt(process.env.PORT || "3001");
const isProd = process.env.NODE_ENV === "production";
const DIST   = path.resolve(__dirname, "../dist");
const PUBLIC = path.resolve(__dirname, "../public");

const app = express();

// ── Trust proxy (Render load balancer) ───────────────────────
app.set("trust proxy", 1);

// ── 1. Static assets FIRST — but DO NOT auto-serve any index.html ─
// index:false is critical: without it, express.static(DIST) answers "/"
// with dist/index.html (the old React app) before our platform route runs.
// Named files (/platform.html, /assets/*, logos) are still served normally.
app.use(express.static(PUBLIC, { index: false }));
if (isProd) {
  app.use(express.static(DIST, { index: false }));
}

// ── 2. Security middleware (only for API/auth routes) ─────────
app.use(requestId);
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(globalRateLimit);
app.use(securityLogger);
app.use(phiResponseFilter);
app.use(hpp());
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(sanitizeInput);
app.use(passport.initialize());

// ── 3. HTTP request logging ───────────────────────────────────
app.use(morgan("[:date[iso]] :method :url :status :response-time ms", {
  stream: { write: (msg) => logger.info(msg.trim()) },
  skip: (req) => req.path === "/api/health",
}));

// ── 4. Extra security headers ─────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

// ── 5. API & Auth routes ──────────────────────────────────────
app.use("/auth",      authRoutes);
app.use("/api",       aiRoutes);
app.use("/api/audit", auditRoute);
app.use("/api",       platformRoutes);

// ── 6. Root + fallback → serve the Ghana Digital Health Platform ─
// The platform (public/platform.html) is the primary entry point. It ships
// its own login gate and calls the /api/* + /auth/* routes.
const PLATFORM_HTML = path.join(PUBLIC, "platform.html");

function sendPlatform(req, res) {
  res.sendFile(PLATFORM_HTML, (err) => {
    if (err) {
      logger.error("Failed to serve platform.html", { msg: err.message, path: PLATFORM_HTML });
      res.status(500).type("text/plain")
        .send("platform.html not found at " + PLATFORM_HTML + " — ensure public/platform.html is deployed.");
    }
  });
}

app.get("/", sendPlatform);

// Legacy React app (login/clinical-assistant SPA) still reachable at /app
if (isProd) {
  app.get(["/app", "/app/*"], (req, res) => {
    res.sendFile(path.join(DIST, "index.html"));
  });
}

// Any other non-API/non-auth GET → the platform (client handles the rest)
app.get("*", sendPlatform);

// ── 7. Global error handler ───────────────────────────────────
app.use((err, req, res, next) => {
  logger.error("Unhandled error", { msg: err.message, path: req.path });
  const status = err.status || err.statusCode || 500;
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
  try {
    await prisma.$connect();
    const userCount = await prisma.user.count();
    logger.info(`PostgreSQL connected — ${userCount} users in database`);
    if (userCount === 0) logger.warn("No users found — run: node server/seed.js");
  } catch (e) {
    logger.error("PostgreSQL connection failed", { msg: e.message });
    logger.error("Set DATABASE_URL and run: npx prisma migrate deploy");
  }
});

// ── Graceful shutdown ─────────────────────────────────────────
const shutdown = async (sig) => {
  logger.warn(`Signal ${sig} — graceful shutdown`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.warn("Server closed — DB disconnected");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException",  (e) => { logger.error("Uncaught",  { msg: e.message }); });
process.on("unhandledRejection", (r) => { logger.error("Unhandled", { msg: String(r) }); });

export default app;
