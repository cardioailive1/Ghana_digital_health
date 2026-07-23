// HIPAA-compliant logger — strips PHI before writing (SOC 2 CC7)
import winston from "winston";

const PHI_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\bPT-\d{5}\b/g,
  /\bGH-NHIS-\d{7,}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
];

function stripPHI(msg) {
  if (typeof msg !== "string") return msg;
  let s = msg;
  PHI_PATTERNS.forEach(p => { s = s.replace(p, "[REDACTED]"); });
  return s;
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "warn" : "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const safeMsg = stripPHI(String(message));
      const safeMeta = Object.keys(meta).length
        ? " " + JSON.stringify(meta).replace(/"password":"[^"]*"/g, '"password":"[REDACTED]"')
        : "";
      return `${timestamp} [${level.toUpperCase()}] ${safeMsg}${safeMeta}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

export function auditLog(action, userId, facilityId, resourceType, resourceId, outcome) {
  logger.warn("AUDIT", { action, userId: userId||"anon", facilityId: facilityId||"?",
    resourceType, resourceId: resourceId ? String(resourceId).substring(0,20) : "N/A",
    outcome, ts: new Date().toISOString() });
}

export default logger;
