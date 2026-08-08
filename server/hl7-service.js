// ============================================================
// HL7 v2 MLLP listener — runs as its OWN process/service.
// Render web services only expose HTTP, so the MLLP (raw TCP) listener
// must run as a separate Private Service / background worker.
//   Start:  node server/hl7-service.js
//   Env:    HL7_MLLP_PORT (default 2575)
//           HL7_TLS_KEY / HL7_TLS_CERT  (PEM strings) to require MLLP-over-TLS
// ============================================================
import fs from "fs";
import logger from "./logger.js";
import { prisma } from "./db.js";
import { MLLPServer } from "./hl7/mllp.js";
import { makeHl7Handler } from "./hl7/handlers.js";
import { raiseAlert } from "./escalation/sla.js";

const PORT = parseInt(process.env.HL7_MLLP_PORT || "2575", 10);

// Every accepted message is written to the audit trail (ATNA / HIPAA).
async function auditLog(type, controlId) {
  try {
    await prisma.auditLog.create({
      data: { action: "HL7_INBOUND", resourceType: type, resourceId: controlId || null, outcome: "success" },
    });
  } catch (_) { /* non-blocking */ }
}

const tlsOpts = (process.env.HL7_TLS_KEY && process.env.HL7_TLS_CERT)
  ? { key: process.env.HL7_TLS_KEY, cert: process.env.HL7_TLS_CERT }
  : null;

async function onCritical({ patient, observation }) {
  logger.warn(`CRITICAL result: patient=${patient.mrn || patient.id} ${observation.code}=${observation.value}`);
  try {
    await prisma.auditLog.create({
      data: { action: "CRITICAL_RESULT", resourceType: "Observation", resourceId: observation.id, outcome: "critical" },
    });
    await raiseAlert(prisma, { patientId: patient.id, observationId: observation.id, facilityId: patient.facilityId, type: "critical-result", detail: `${observation.code}=${observation.value}` });
  } catch (_) {}
}

const handler = makeHl7Handler(prisma, { auditLog, onCritical });
const server = new MLLPServer(handler, { tls: tlsOpts });

server.on("message", (hl7) => {
  const firstLine = String(hl7).split("\r")[0].slice(0, 80);
  logger.info(`HL7 inbound: ${firstLine}`);
});
server.on("error", (e) => logger.error("HL7/MLLP error", { msg: e.message }));

prisma.$connect()
  .then(() => server.listen(PORT, "0.0.0.0", () => {
    logger.info(`HL7 MLLP listener on :${PORT}${tlsOpts ? " (TLS)" : " (plaintext — put behind TLS/VPN in production)"}`);
  }))
  .catch((e) => { logger.error("HL7 service DB connect failed", { msg: e.message }); process.exit(1); });

async function shutdown() { server.close(); await prisma.$disconnect(); process.exit(0); }
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
