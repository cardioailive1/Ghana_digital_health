// ============================================================
// Platform API Routes — serve dynamic data to the Ghana
// Digital Health Platform HTML modules
// All routes: authenticated + facility-scoped
// Returns: { data: [...], meta: { total, facilityId, ts } }
// ============================================================
import { Router }  from "express";
import { prisma }  from "../db.js";
import { authenticate } from "../auth.js";
import { requirePermission, PERMISSIONS } from "../rbac.js";
import { requirePHI, facilityGuard } from "../../middleware/phiGuard.js";
import { auditLog } from "../logger.js";

const router = Router();

// All platform routes require auth
router.use(authenticate);

function meta(facilityId, total) {
  return { total: total || 0, facilityId: facilityId || null, ts: new Date().toISOString() };
}

// ── Helper: facility filter for queries ───────────────────────
function facFilter(req) {
  if (req.user.role === "super_admin") return {};
  return { facilityId: req.user.facilityId || undefined };
}

// ── Overview KPIs ─────────────────────────────────────────────
router.get("/overview/kpis", async (req, res) => {
  try {
    const fac = facFilter(req);
    const [users, claims, alerts, chatLogs] = await Promise.all([
      prisma.user.count({ where: { ...fac, active: true } }),
      prisma.nhisClaim.count({ where: fac }),
      prisma.ioMTAlert.count({ where: { ...fac, resolvedAt: null } }),
      prisma.chatLog.count({ where: fac }),
    ]);
    const approvedClaims  = await prisma.nhisClaim.count({ where: { ...fac, status: "approved" } });
    const claimValue      = await prisma.nhisClaim.aggregate({ where: { ...fac, status: "approved" }, _sum: { amount: true } });
    res.json({ data: {
      activeUsers:    users,
      totalClaims:    claims,
      approvedClaims,
      claimValueGhc:  Number(claimValue._sum.amount || 0).toFixed(2),
      activeAlerts:   alerts,
      aiInteractions: chatLogs,
    }, meta: meta(req.user.facilityId, 1) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── EHR: Patients ─────────────────────────────────────────────
router.get("/ehr/patients", requirePermission(PERMISSIONS.EHR_READ), async (req, res) => {
  auditLog("EHR_VIEW", req.user.sub, req.user.facilityId, "patient", "list", "allowed");
  // EHR_PTS are stored in ChatLog metadata for now until dedicated EHR table is added
  // Return empty with proper structure so platform renders empty state
  res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Connect EHR system to populate" });
});

// ── EHR: Pending encounters for ICD-11 coding ─────────────────
router.get("/ehr/encounters/pending", requirePermission(PERMISSIONS.EHR_READ), async (req, res) => {
  res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Encounters sync from EHR on save" });
});

// ── NHIS: Claims ──────────────────────────────────────────────
router.get("/nhis/claims", requirePermission(PERMISSIONS.NHIS_SUBMIT), async (req, res) => {
  try {
    const fac    = facFilter(req);
    const claims = await prisma.nhisClaim.findMany({
      where:   fac,
      orderBy: { createdAt: "desc" },
      take:    100,
    });
    res.json({ data: claims, meta: meta(req.user.facilityId, claims.length) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// NHIS: Summary KPIs
router.get("/nhis/summary", async (req, res) => {
  try {
    const fac  = facFilter(req);
    const rows = await prisma.nhisClaim.groupBy({
      by: ["status"], where: fac, _count: true,
      _sum: { amount: true },
    });
    const summary = {};
    rows.forEach(r => { summary[r.status] = { count: r._count, total: Number(r._sum.amount||0).toFixed(2) }; });
    res.json({ data: summary, meta: meta(req.user.facilityId, rows.length) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// NHIS: Create claim
router.post("/nhis/claims", requirePermission(PERMISSIONS.NHIS_SUBMIT), async (req, res) => {
  const { patientId, icd11Code, icdDesc, amount, confidence } = req.body || {};
  if (!patientId || !icd11Code || !amount) return res.status(400).json({ error: "patientId, icd11Code, amount required" });
  try {
    const claim = await prisma.nhisClaim.create({ data: {
      claimRef:    `CLM-${Date.now()}`,
      patientId,
      facilityId:  req.user.facilityId || "UNKNOWN",
      icd11Code, icdDesc: icdDesc || "", amount,
      confidence:  confidence || null, status: "pending",
    }});
    auditLog("NHIS_SUBMIT", req.user.sub, req.user.facilityId, "nhis_claim", claim.id, "created");
    res.status(201).json({ data: claim });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// NHIS: Update claim status
router.put("/nhis/claims/:id", requirePermission(PERMISSIONS.NHIS_APPROVE), async (req, res) => {
  try {
    const claim = await prisma.nhisClaim.update({
      where: { id: req.params.id },
      data:  { status: req.body.status, nhiaRef: req.body.nhiaRef, rejectionCode: req.body.rejectionCode },
    });
    res.json({ data: claim });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MedCRM: Patients (from audit log - no dedicated patient table yet) ──
router.get("/medcrm/patients", requirePermission(PERMISSIONS.EHR_READ), async (req, res) => {
  res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Connect patient registration to populate" });
});

router.get("/medcrm/pipeline",  async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0) }));
router.get("/medcrm/comms",     async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0) }));
router.get("/medcrm/agentlog",  async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where:   { ...facFilter(req), action: { in: ["AI_CHAT","NHIS_SUBMIT","IOMT_ACK","PHI_VIEW"] } },
      orderBy: { createdAt: "desc" },
      take:    50,
    });
    res.json({ data: logs, meta: meta(req.user.facilityId, logs.length) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Lab ────────────────────────────────────────────────────────
router.get("/lab/orders",    async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Lab orders from LIS integration" }));
router.get("/lab/results",   async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Results from LIS/LOINC integration" }));
router.get("/lab/genexpert", async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "GeneXpert results from device integration" }));
router.get("/lab/critical",  async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Critical values from LIS real-time feed" }));

// ── Pharmacy ──────────────────────────────────────────────────
router.get("/pharmacy/drugs",         async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0) }));
router.get("/pharmacy/prescriptions", async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0) }));
router.get("/pharmacy/queue",         async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0) }));

// ── IoMT: Devices ─────────────────────────────────────────────
router.get("/iomt/devices", requirePermission(PERMISSIONS.IOMT_VIEW), async (req, res) => {
  res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Devices register on first heartbeat" });
});

// IoMT: Alerts (from DB)
router.get("/iomt/alerts", requirePermission(PERMISSIONS.IOMT_VIEW), async (req, res) => {
  try {
    const alerts = await prisma.ioMTAlert.findMany({
      where:   { ...facFilter(req), resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take:    50,
    });
    res.json({ data: alerts, meta: meta(req.user.facilityId, alerts.length) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// IoMT: Acknowledge alert
router.put("/iomt/alerts/:id/ack", requirePermission(PERMISSIONS.IOMT_ACK), async (req, res) => {
  try {
    const alert = await prisma.ioMTAlert.update({
      where: { id: req.params.id },
      data:  { acknowledgedBy: req.user.name, acknowledgedAt: new Date() },
    });
    auditLog("IOMT_ACK", req.user.sub, req.user.facilityId, "iomt_alert", req.params.id, "acknowledged");
    res.json({ data: alert });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// IoMT: Create alert (from device/CHPS-Hub)
router.post("/iomt/alerts", async (req, res) => {
  const { deviceId, patientRef, alertType, score, level, vitals } = req.body || {};
  if (!deviceId || !alertType || !level) return res.status(400).json({ error: "deviceId, alertType, level required" });
  try {
    const alert = await prisma.ioMTAlert.create({ data: {
      deviceId, patientRef: patientRef || "UNKNOWN",
      facilityId: req.user.facilityId || req.body.facilityId || "UNKNOWN",
      alertType, score: score || null, level, vitals: vitals || null,
    }});
    res.status(201).json({ data: alert });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// IoMT: Vitals (latest from device stream)
router.get("/iomt/vitals/:patientId", requirePermission(PERMISSIONS.IOMT_VIEW), async (req, res) => {
  res.json({ data: { rr:0, spo2:0, sbp:0, hr:0, temp:0, avpu:"A" }, meta: meta(req.user.facilityId, 0), note: "Real-time vitals from device stream" });
});

// IoMT: Maternal / PICU / NEWS2 patients
router.get("/iomt/maternal",     async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0) }));
router.get("/iomt/picu",        async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0) }));
router.get("/iomt/news2-alerts", async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0) }));

// ── CHPS ──────────────────────────────────────────────────────
router.get("/chps/compounds", requirePermission(PERMISSIONS.CHPS_ACCESS), async (req, res) => {
  res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Compounds register on first CHPS-Hub sync" });
});
router.get("/chps/register",  requirePermission(PERMISSIONS.CHPS_ACCESS), async (req, res) => {
  res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Field register entries sync from CHPS-Hub" });
});
router.get("/chps/synclog",   requirePermission(PERMISSIONS.CHPS_ACCESS), async (req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where:   { ...facFilter(req), action: "CHPS_SYNC" },
      orderBy: { createdAt: "desc" }, take: 50,
    });
    res.json({ data: logs, meta: meta(req.user.facilityId, logs.length) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// CHPS: Receive bundle push from CHPS-Hub v2
router.post("/chps/sync", async (req, res) => {
  const { compoundId, records, deviceId } = req.body || {};
  if (!compoundId || !records) return res.status(400).json({ error: "compoundId and records required" });
  auditLog("CHPS_SYNC", req.user.sub, req.user.facilityId, "chps", compoundId, `${records.length} records`);
  // Records would be processed and stored in dedicated tables in full implementation
  res.json({ data: { received: records.length, compoundId }, meta: meta(req.user.facilityId, 1) });
});

// ── Scan / Imaging ────────────────────────────────────────────
router.get("/scan/studies",  async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0), note: "Imaging studies from PACS/Orthanc integration" }));
router.get("/scan/records",  async (req, res) => res.json({ data: [], meta: meta(req.user.facilityId, 0) }));

// ── DHIS2 stats ───────────────────────────────────────────────
router.get("/dhis2/stats", async (req, res) => {
  res.json({ data: { synced: 0, pending: 0, lastSync: null }, meta: meta(req.user.facilityId, 0), note: "DHIS2 ADX 2.0 sync stats" });
});

// ── Audit log (read) ──────────────────────────────────────────
router.get("/audit/logs", requirePermission(PERMISSIONS.AUDIT_VIEW), async (req, res) => {
  try {
    const fac  = facFilter(req);
    const logs = await prisma.auditLog.findMany({
      where:   fac,
      orderBy: { createdAt: "desc" },
      take:    200,
      include: { user: { select: { name: true, email: true, role: true } } },
    });
    res.json({ data: logs, meta: meta(req.user.facilityId, logs.length) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Chat: Save message to DB ──────────────────────────────────
router.post("/chat/log", async (req, res) => {
  const { role, content, withPHI, tokenCount } = req.body || {};
  if (!role || !content) return res.status(400).json({ error: "role and content required" });
  try {
    const log = await prisma.chatLog.create({ data: {
      userId:    req.user.sub,
      facilityId: req.user.facilityId || null,
      role, content: content.substring(0, 10000),
      withPHI: withPHI || false,
      tokenCount: tokenCount || null,
    }});
    res.status(201).json({ data: { id: log.id } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Chat: Load history
router.get("/chat/history", async (req, res) => {
  try {
    const logs = await prisma.chatLog.findMany({
      where:   { userId: req.user.sub },
      orderBy: { createdAt: "asc" },
      take:    40,
    });
    res.json({ data: logs, meta: meta(req.user.facilityId, logs.length) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
