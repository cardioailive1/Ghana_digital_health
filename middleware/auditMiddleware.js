// ============================================================
// Audit Middleware — writes to PostgreSQL via Prisma
// HIPAA §164.312(b) · SOC 2 CC7.2
// POST /api/audit — receives events from client useAudit hook
// ============================================================
import { Router } from "express";
import { authenticate } from "../server/auth.js";
import { prisma } from "../server/db.js";
import logger from "../server/logger.js";

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

router.post("/", authenticate, async (req, res) => {
  const { action, resourceType, resourceId, outcome, metadata } = req.body || {};

  if (!ALLOWED_ACTIONS.has(action))
    return res.status(400).json({ error: "Invalid audit action" });
  if (!ALLOWED_RESOURCE_TYPES.has(resourceType))
    return res.status(400).json({ error: "Invalid resource type" });

  try {
    await prisma.auditLog.create({
      data: {
        action,
        userId:       req.user.sub,
        facilityId:   req.user.facilityId || null,
        resourceType,
        resourceId:   resourceId ? String(resourceId).substring(0, 64) : null,
        outcome:      outcome || "success",
        ipAddress:    req.ip?.substring(0, 45),
        userAgent:    req.headers["user-agent"]?.substring(0, 200),
        requestId:    req.requestId,
        metadata:     metadata || null,
      },
    });
    res.status(204).end();
  } catch (e) {
    logger.error("Audit write failed", { msg: e.message });
    // Audit failures must never break the UI — return 204 anyway
    res.status(204).end();
  }
});

export default router;
