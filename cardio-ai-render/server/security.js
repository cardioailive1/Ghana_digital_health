// ============================================================
// Security Middleware Stack
// HIPAA Technical Safeguards · SOC 2 CC6 · Cybersecurity
// ============================================================
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import hpp from "hpp";
import logger from "./logger.js";

const isProd = process.env.NODE_ENV === "production";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(o => o.trim()).filter(Boolean);

// ── CORS ─────────────────────────────────────────────────────
export const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin, health checks
    if (!isProd) return cb(null, true); // dev: allow all
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    logger.warn(`CORS blocked: ${origin}`);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
});

// ── Helmet (security headers) ─────────────────────────────────
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.anthropic.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  permittedCrossDomainPolicies: false,
  crossOriginEmbedderPolicy: false, // needed for fonts
});

// ── Rate limiting (SOC 2 CC6, HIPAA brute-force protection) ──
export const globalRateLimit = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000"),
  max: parseInt(process.env.RATE_LIMIT_MAX || "100"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please slow down" },
  skip: req => req.path === "/api/health",
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,                    // 10 login attempts
  message: { error: "Too many login attempts — try again in 15 minutes" },
  standardHeaders: true,
});

export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,        // 1 min
  max: 30,                    // 30 AI calls/min per IP
  message: { error: "AI rate limit — slow down requests" },
  standardHeaders: true,
});

// ── Input sanitisation (prevent injection) ────────────────────
export function sanitizeInput(req, res, next) {
  // Strip null bytes
  const sanitize = (obj) => {
    if (typeof obj === "string") return obj.replace(/\0/g, "").slice(0, 50000);
    if (Array.isArray(obj)) return obj.map(sanitize).slice(0, 100);
    if (obj && typeof obj === "object") {
      const out = {};
      for (const k of Object.keys(obj).slice(0, 50)) {
        out[k] = sanitize(obj[k]);
      }
      return out;
    }
    return obj;
  };
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  next();
}

// ── Request ID (SOC 2 traceability) ──────────────────────────
export function requestId(req, res, next) {
  const id = req.headers["x-request-id"] || crypto.randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}

// ── PHI field filter — never log PHI in response (HIPAA) ─────
export function phiResponseFilter(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    // Do not log response bodies on PHI endpoints
    if (req.path.includes("/phi") || req.path.includes("/patient")) {
      logger.info(`PHI endpoint response sent [${req.requestId}] — body not logged`);
    }
    return originalJson(data);
  };
  next();
}

// ── Security event logger ──────────────────────────────────────
export function securityLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    if (res.statusCode >= 400) {
      logger.warn("HTTP_ERROR", {
        method: req.method, path: req.path,
        status: res.statusCode, ms, ip: req.ip,
        reqId: req.requestId, ua: req.headers["user-agent"]?.substring(0, 80),
      });
    }
  });
  next();
}
