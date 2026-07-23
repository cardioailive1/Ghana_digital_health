// ============================================================
// auditMiddleware — server-side audit event receiver
// POST /api/audit from client useAudit hook
// Validates, sanitises, writes to audit log
// HIPAA §164.312(b) · SOC 2 CC7.2
// ============================================================
import { Router } from "express";
import { authenticate } from "../server/auth.js";
import logger, { auditLog } from "../server/logger.js";

const router = Router();

const ALLOWED_ACTIONS = new Set([
  "PHI_VIEW","AI_CHAT","LOGIN","LOGOUT","PLATFORM_VIEW",
  "IOMT_ACK","NHIS_SUBMIT","EHR_VIEW","EHR_WRITE","LAB_VIEW",
  "FILE_DOWNLOAD","REPORT_EXPORT","USER_MANAGE",
]);

const ALLOWED_RESOURCE_TYPES = new Set([
  "patient","auth","platform","iomt_alert","nhis_claim",
  "ehr_record","lab_result","report","user","claude",
]);

router.post("/", authenticate, (req, res) => {
  const { action, resourceType, resourceId, outcome, ts } = req.body || {};

  if (!ALLOWED_ACTIONS.has(action)) {
    return res.status(400).json({ error: "Invalid audit action" });
  }
  if (!ALLOWED_RESOURCE_TYPES.has(resourceType)) {
    return res.status(400).json({ error: "Invalid resource type" });
  }

  // Write to server audit log — req.user is already verified by authenticate()
  auditLog(
    action,
    req.user.sub,
    req.user.facilityId,
    resourceType,
    resourceId ? String(resourceId).substring(0, 64) : "N/A",
    outcome || "success"
  );

  res.status(204).end();
});

export default router;
