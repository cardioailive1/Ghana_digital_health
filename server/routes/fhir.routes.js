// ============================================================
// FHIR R4 facade — exposes /fhir/r4/* mapping Prisma <-> FHIR.
// PHI endpoints: authenticated + every access is audited (HIPAA/ATNA).
// ============================================================
import express from "express";
import { prisma } from "../db.js";
import { authenticate } from "../auth.js";
import { capabilityStatement } from "../fhir/capability.js";
import {
  toFhirPatient, fromFhirPatient, toFhirEncounter,
  toFhirObservation, toFhirCondition, bundle, operationOutcome,
} from "../fhir/mappers.js";

const router = express.Router();

async function audit(req, action, resourceType, resourceId, outcome = "success") {
  try {
    await prisma.auditLog.create({
      data: {
        action, resourceType, resourceId, outcome,
        userId: req.user?.sub || null,
        facilityId: req.user?.facilityId || null,
        ipAddress: req.ip, userAgent: req.get("user-agent"),
        requestId: req.requestId || null,
      },
    });
  } catch (_) { /* never block a clinical request on audit failure */ }
}

// CapabilityStatement is public (gateways probe it before connecting).
router.get("/metadata", (req, res) => {
  res.type("application/fhir+json").json(capabilityStatement());
});

// Everything else requires auth and returns fhir+json.
router.use(authenticate);
router.use((req, res, next) => { res.type("application/fhir+json"); next(); });

// ── Patient ───────────────────────────────────────────────────
router.get("/Patient/:id", async (req, res) => {
  const p = await prisma.patient.findUnique({ where: { id: req.params.id } });
  await audit(req, "FHIR_READ", "Patient", req.params.id, p ? "success" : "not-found");
  if (!p) return res.status(404).json(operationOutcome("not-found", "Patient not found"));
  res.json(toFhirPatient(p));
});

router.get("/Patient", async (req, res) => {
  const where = {};
  if (req.query.identifier) {
    const v = String(req.query.identifier).split("|").pop();   // system|value or value
    where.OR = [{ nhis: v }, { ghanaCard: v }, { mrn: v }];
  }
  if (req.query.family) where.lastName = { contains: String(req.query.family), mode: "insensitive" };
  const rows = await prisma.patient.findMany({ where, take: 50, orderBy: { createdAt: "desc" } });
  await audit(req, "FHIR_SEARCH", "Patient", null);
  res.json(bundle(rows.map(toFhirPatient)));
});

router.post("/Patient", express.json({ type: ["application/fhir+json", "application/json"] }), async (req, res) => {
  if (req.body?.resourceType !== "Patient")
    return res.status(400).json(operationOutcome("invalid", "Expected resourceType Patient"));
  const data = fromFhirPatient(req.body);
  if (!data.lastName) return res.status(400).json(operationOutcome("required", "Patient.name.family is required"));
  const p = await prisma.patient.create({ data });
  await audit(req, "FHIR_CREATE", "Patient", p.id);
  res.status(201).location(`/fhir/r4/Patient/${p.id}`).json(toFhirPatient(p));
});

// ── Observation ───────────────────────────────────────────────
router.get("/Observation", async (req, res) => {
  const where = {};
  if (req.query.patient) where.patientId = String(req.query.patient).split("/").pop();
  if (req.query.code)    where.code = String(req.query.code).split("|").pop();
  const rows = await prisma.observation.findMany({ where, take: 100, orderBy: { effectiveAt: "desc" } });
  await audit(req, "FHIR_SEARCH", "Observation", null);
  res.json(bundle(rows.map(toFhirObservation)));
});

router.post("/Observation", express.json({ type: ["application/fhir+json", "application/json"] }), async (req, res) => {
  const b = req.body || {};
  if (b.resourceType !== "Observation")
    return res.status(400).json(operationOutcome("invalid", "Expected resourceType Observation"));
  const patientId = b.subject?.reference?.split("/").pop();
  const coding = b.code?.coding?.[0] || {};
  if (!patientId) return res.status(400).json(operationOutcome("required", "Observation.subject is required"));
  const o = await prisma.observation.create({
    data: {
      patientId, code: coding.code || "", display: coding.display || null,
      value: b.valueQuantity?.value != null ? String(b.valueQuantity.value) : (b.valueString ?? null),
      unit: b.valueQuantity?.unit || null,
      interpretation: b.interpretation?.[0]?.coding?.[0]?.code || null,
      status: b.status || "final", source: "fhir",
    },
  });
  await audit(req, "FHIR_CREATE", "Observation", o.id);
  res.status(201).location(`/fhir/r4/Observation/${o.id}`).json(toFhirObservation(o));
});

// ── Encounter ─────────────────────────────────────────────────
router.get("/Encounter/:id", async (req, res) => {
  const e = await prisma.encounter.findUnique({ where: { id: req.params.id } });
  await audit(req, "FHIR_READ", "Encounter", req.params.id, e ? "success" : "not-found");
  if (!e) return res.status(404).json(operationOutcome("not-found", "Encounter not found"));
  res.json(toFhirEncounter(e));
});

router.get("/Encounter", async (req, res) => {
  const where = {};
  if (req.query.patient) where.patientId = String(req.query.patient).split("/").pop();
  const rows = await prisma.encounter.findMany({ where, take: 100, orderBy: { startedAt: "desc" } });
  await audit(req, "FHIR_SEARCH", "Encounter", null);
  res.json(bundle(rows.map(toFhirEncounter)));
});

// ── Condition ─────────────────────────────────────────────────
router.get("/Condition", async (req, res) => {
  const where = {};
  if (req.query.patient) where.patientId = String(req.query.patient).split("/").pop();
  const rows = await prisma.condition.findMany({ where, take: 100, orderBy: { recordedAt: "desc" } });
  await audit(req, "FHIR_SEARCH", "Condition", null);
  res.json(bundle(rows.map(toFhirCondition)));
});

export default router;
