// ============================================================
// CHPS offline-sync routes.
//   POST /api/chps/sync                  — device pushes buffered changes, pulls server changes
//   GET  /api/chps/conflicts             — open conflicts needing manual review
//   POST /api/chps/conflicts/:id/resolve — resolve a flagged conflict
// ============================================================
import express from "express";
import { prisma } from "../db.js";
import { authenticate } from "../auth.js";
import { applySyncBatch, pullChanges } from "../chps/sync.js";

const router = express.Router();
router.use(authenticate);

router.post("/chps/sync", express.json({ limit: "5mb" }), async (req, res) => {
  const { deviceId, changes = [], since } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: "deviceId required" });
  try {
    const result = await applySyncBatch(prisma, { deviceId, changes });
    const serverChanges = await pullChanges(prisma, { since });
    res.json({ ...result, serverChanges });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/chps/conflicts", async (req, res) => {
  const status = req.query.status || "open";
  const conflicts = await prisma.syncConflict.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 200 });
  res.json({ conflicts, total: conflicts.length });
});

router.post("/chps/conflicts/:id/resolve", express.json(), async (req, res) => {
  const choice = req.body?.choice;   // 'client' | 'server'
  const conflict = await prisma.syncConflict.findUnique({ where: { id: req.params.id } });
  if (!conflict) return res.status(404).json({ error: "conflict not found" });
  const modelMap = { Patient: "patient", Encounter: "encounter", Observation: "observation" };
  const model = modelMap[conflict.resourceType];
  if (choice === "client" && model && conflict.resourceId && conflict.clientPayload) {
    const { clientId, clientRef, baseUpdatedAt, op, ...data } = conflict.clientPayload;
    await prisma[model].update({ where: { id: conflict.resourceId }, data });
  }
  const updated = await prisma.syncConflict.update({
    where: { id: conflict.id },
    data: { status: "resolved", resolution: choice === "client" ? "client-wins" : "server-wins", resolvedAt: new Date() },
  });
  res.json({ conflict: updated });
});

export default router;
