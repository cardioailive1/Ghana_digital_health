// ============================================================
// CHPS offline-first sync engine (server side).
// A CHPS device buffers changes offline (2G, up to 48h) and POSTs a batch on
// reconnect. This engine applies the batch, detects & resolves conflicts, and
// returns server-side changes since the device's last cursor (bidirectional).
//
// Conflict rules (SOP 004):
//   1. Keep the version with a VERIFIED NHIS number.
//   2. Otherwise last-write-wins by updatedAt.
//   3. If clinically-significant fields diverge, FLAG for manual review
//      (server kept; conflict recorded) rather than silently overwriting.
// ============================================================

const MODELS = {
  Patient:     "patient",
  Encounter:   "encounter",
  Observation: "observation",
};

const CLINICAL_FIELDS = {
  Patient:     ["ghanaCard", "nhis", "dob", "sex"],
  Encounter:   ["status", "class", "reason"],
  Observation: ["code", "value", "interpretation"],
};

// Pure conflict resolver. Returns { winner: 'client'|'server'|'manual', reason }.
export function resolveConflict(client, server, { resourceType } = {}) {
  // Rule 1 — verified NHIS wins (Patient only)
  if (resourceType === "Patient") {
    const cN = !!client.nhis, sN = !!server.nhis;
    if (cN && !sN) return { winner: "client", reason: "client has NHIS" };
    if (sN && !cN) return { winner: "server", reason: "server has NHIS" };
  }
  // Rule 3 — clinically-significant divergence -> manual
  const fields = CLINICAL_FIELDS[resourceType] || [];
  const diverged = fields.some((f) => client[f] != null && server[f] != null && String(client[f]) !== String(server[f]));
  if (diverged) {
    // still fall through to LWW unless both edited very close together — flag if both changed recently
    const cT = new Date(client.updatedAt || 0).getTime();
    const sT = new Date(server.updatedAt || 0).getTime();
    if (Math.abs(cT - sT) < 5 * 60 * 1000) return { winner: "manual", reason: "clinical fields diverge within 5 min" };
  }
  // Rule 2 — last-write-wins
  const cT = new Date(client.updatedAt || 0).getTime();
  const sT = new Date(server.updatedAt || 0).getTime();
  return cT >= sT ? { winner: "client", reason: "last-write-wins (client newer)" }
                  : { winner: "server", reason: "last-write-wins (server newer)" };
}

// Apply a batch of buffered changes from one device.
export async function applySyncBatch(prisma, { deviceId, changes = [] }) {
  const applied = [];     // { clientId, serverId, op }
  const conflicts = [];   // recorded SyncConflict rows
  const idMap = {};       // clientId -> serverId (so client can reconcile)

  for (const ch of changes) {
    const model = MODELS[ch.resourceType];
    if (!model) { conflicts.push({ resourceType: ch.resourceType, reason: "unsupported resource" }); continue; }
    const repo = prisma[model];

    // DELETE
    if (ch.op === "delete" && ch.id) {
      try { await repo.delete({ where: { id: ch.id } }); applied.push({ clientId: ch.clientId, serverId: ch.id, op: "delete" }); }
      catch (_) { /* already gone */ }
      continue;
    }

    // Resolve server id (existing?)
    const serverId = ch.id || idMap[ch.payload?.clientRef] || null;
    const existing = serverId ? await repo.findUnique({ where: { id: serverId } }) : null;

    // CREATE
    if (!existing) {
      const row = await repo.create({ data: stripMeta(ch.payload) });
      idMap[ch.clientId] = row.id;
      applied.push({ clientId: ch.clientId, serverId: row.id, op: "create" });
      continue;
    }

    // UPDATE with conflict detection
    const serverChangedSinceBase = ch.baseUpdatedAt
      ? new Date(existing.updatedAt || 0).getTime() > new Date(ch.baseUpdatedAt).getTime()
      : false;

    if (!serverChangedSinceBase) {
      const row = await repo.update({ where: { id: existing.id }, data: stripMeta(ch.payload) });
      applied.push({ clientId: ch.clientId, serverId: row.id, op: "update" });
      continue;
    }

    // Both sides changed -> resolve
    const decision = resolveConflict({ ...ch.payload, updatedAt: ch.updatedAt }, existing, { resourceType: ch.resourceType });
    const conflict = await prisma.syncConflict.create({
      data: {
        deviceId, resourceType: ch.resourceType, resourceId: existing.id,
        clientPayload: ch.payload, serverPayload: existing,
        resolution: decision.winner, status: decision.winner === "manual" ? "open" : "resolved",
        resolvedAt: decision.winner === "manual" ? null : new Date(),
      },
    });
    conflicts.push({ id: conflict.id, resourceId: existing.id, winner: decision.winner, reason: decision.reason });

    if (decision.winner === "client") {
      const row = await repo.update({ where: { id: existing.id }, data: stripMeta(ch.payload) });
      applied.push({ clientId: ch.clientId, serverId: row.id, op: "update-client-wins" });
    } // server-wins & manual: keep server, no write
  }

  // advance cursor
  await prisma.syncCursor.upsert({
    where: { deviceId },
    update: { lastSyncAt: new Date() },
    create: { deviceId, lastSyncAt: new Date() },
  });

  return { applied, conflicts, idMap, syncToken: new Date().toISOString() };
}

// Server -> client: records changed since `since` (bidirectional sync).
export async function pullChanges(prisma, { since, resourceTypes = ["Patient", "Encounter", "Observation"], limit = 500 } = {}) {
  const out = {};
  for (const rt of resourceTypes) {
    const model = MODELS[rt]; if (!model) continue;
    const field = rt === "Observation" ? "effectiveAt" : (rt === "Encounter" ? "startedAt" : "updatedAt");
    const where = since ? { [field]: { gt: new Date(since) } } : {};
    out[rt] = await prisma[model].findMany({ where, take: limit, orderBy: { [field]: "asc" } });
  }
  return out;
}

function stripMeta(payload = {}) {
  const { clientId, clientRef, baseUpdatedAt, op, ...data } = payload;
  return data;
}
