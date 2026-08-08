// ============================================================
// Ops routes — IoMT alerts + manual ADX/GOFR triggers (admin).
// ============================================================
import express from "express";
import { prisma } from "../db.js";
import { authenticate } from "../auth.js";
import { requirePermission, PERMISSIONS } from "../rbac.js";
import { acknowledgeAlert } from "../escalation/sla.js";
import { syncAdx } from "../adx/dhis2.js";
import { syncFacilities } from "../gofr/gofr.js";

const router = express.Router();
router.use(authenticate);

// Open IoMT alerts (Alert Centre)
router.get("/alerts", async (req, res) => {
  const status = req.query.status || "open";
  const alerts = await prisma.alert.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ alerts, total: alerts.length });
});

// Acknowledge an alert (stops escalation)
router.post("/alerts/:id/acknowledge", async (req, res) => {
  try {
    const a = await acknowledgeAlert(prisma, req.params.id, req.user?.sub);
    res.json({ alert: a });
  } catch (e) { res.status(404).json({ error: e.message }); }
});

// Manual ADX -> DHIS2 sync (admin)
router.post("/adx/sync", requirePermission(PERMISSIONS.USER_MANAGE), async (req, res) => {
  const since = req.body?.since ? new Date(req.body.since) : new Date(Date.now() - 24 * 3600 * 1000);
  const r = await syncAdx(prisma, { since });
  res.json(r);
});

// Manual GOFR facility registry sync (admin)
router.post("/gofr/sync", requirePermission(PERMISSIONS.USER_MANAGE), async (req, res) => {
  const r = await syncFacilities(prisma);
  res.json(r);
});

export default router;
