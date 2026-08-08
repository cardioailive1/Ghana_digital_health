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
  toFhirServiceRequest, toFhirClaim, buildIps,
  toFhirComposition, buildTransactionBundle, toFhirDocumentReference,
} from "../fhir/mappers.js";
import { isCriticalObservation } from "../fhir/scoring.js";
import { validateClaim } from "../fhir/nhia.js";
import { publishToShr, queryDocuments, retrieveDocument } from "../fhir/integrations.js";
import { forwardAtna } from "../atna/atna.js";
import { raiseAlert } from "../escalation/sla.js";

const router = express.Router();

async function audit(req, action, resourceType, resourceId, outcome = "success") {
  const entry = {
    action, resourceType, resourceId, outcome,
    userId: req.user?.sub || null,
    facilityId: req.user?.facilityId || null,
    ipAddress: req.ip, userAgent: req.get("user-agent"),
    requestId: req.requestId || null, createdAt: new Date(),
  };
  try { await prisma.auditLog.create({ data: entry }); }
  catch (_) { /* never block a clinical request on audit failure */ }
  forwardAtna(entry).catch(() => {});   // IHE ATNA copy to ARR (no-op if unconfigured)
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
  if (isCriticalObservation(o)) {
    await audit(req, "CRITICAL_RESULT", "Observation", o.id, "critical");
    try { await raiseAlert(prisma, { patientId: o.patientId, observationId: o.id, type: "critical-result", detail: `${o.code}=${o.value}` }); } catch (_) {}
  }
  res.status(201).location(`/fhir/r4/Observation/${o.id}`).json(toFhirObservation(o));
});

// ── ServiceRequest (referral) ─────────────────────────────────
router.get("/ServiceRequest", async (req, res) => {
  const where = {};
  if (req.query.patient) where.patientId = String(req.query.patient).split("/").pop();
  const rows = await prisma.referral.findMany({ where, take: 100, orderBy: { authoredAt: "desc" } });
  await audit(req, "FHIR_SEARCH", "ServiceRequest", null);
  res.json(bundle(rows.map((r) => toFhirServiceRequest({
    id: r.id, patientId: r.patientId, encounterId: r.encounterId, urgent: r.urgent,
    reasonCode: r.reasonCode, reasonDisplay: r.reasonDisplay, status: r.status,
    requesterFacilityId: r.fromFacilityId, performerFacilityId: r.toFacilityId, note: r.note, authoredAt: r.authoredAt,
  }))));
});

router.post("/ServiceRequest", express.json({ type: ["application/fhir+json", "application/json"] }), async (req, res) => {
  const b = req.body || {};
  if (b.resourceType !== "ServiceRequest")
    return res.status(400).json(operationOutcome("invalid", "Expected resourceType ServiceRequest"));
  const patientId = b.subject?.reference?.split("/").pop();
  if (!patientId) return res.status(400).json(operationOutcome("required", "ServiceRequest.subject is required"));
  const coding = b.code?.coding?.[0] || {};
  const r = await prisma.referral.create({
    data: {
      patientId, encounterId: b.encounter?.reference?.split("/").pop() || null,
      fromFacilityId: b.requester?.reference?.split("/").pop() || null,
      toFacilityId: b.performer?.[0]?.reference?.split("/").pop() || null,
      reasonCode: coding.code || null, reasonDisplay: coding.display || b.code?.text || null,
      urgent: b.priority === "urgent" || b.priority === "stat",
      note: b.note?.[0]?.text || null,
    },
  });
  await audit(req, "FHIR_CREATE", "ServiceRequest", r.id);
  res.status(201).location(`/fhir/r4/ServiceRequest/${r.id}`).json(toFhirServiceRequest({
    id: r.id, patientId: r.patientId, encounterId: r.encounterId, urgent: r.urgent,
    reasonCode: r.reasonCode, reasonDisplay: r.reasonDisplay, requesterFacilityId: r.fromFacilityId,
    performerFacilityId: r.toFacilityId, note: r.note, authoredAt: r.authoredAt,
  }));
});

// ── Claim (NHIA) with auto-validation ─────────────────────────
router.post("/Claim", express.json({ type: ["application/fhir+json", "application/json"] }), async (req, res) => {
  const b = req.body || {};
  // Accept either a FHIR Claim or a simple internal claim payload.
  const patientId = b.patient?.reference?.split("/").pop() || b.patientId;
  if (!patientId) return res.status(400).json(operationOutcome("required", "Claim.patient is required"));
  const items = b.items || (b.item || []).map((it) => ({
    description: it.productOrService?.text, tariffCode: it.tariffCode, amount: it.net?.value ?? it.unitPrice?.value,
  }));
  const diagnoses = b.diagnoses || (b.diagnosis || []).map((d) => ({
    code: d.diagnosisCodeableConcept?.coding?.[0]?.code, display: d.diagnosisCodeableConcept?.coding?.[0]?.display,
  }));
  const serviceDate = b.serviceDate ? new Date(b.serviceDate) : new Date();
  const validation = validateClaim({ serviceDate, nhisVerified: b.nhisVerified, credentialled: b.credentialled, isDuplicate: b.isDuplicate, items });
  const c = await prisma.claim.create({
    data: {
      patientId, encounterId: b.encounterId || null, facilityId: b.facilityId || null,
      diagnoses, items, total: validation.total, serviceDate,
      nhisVerified: b.nhisVerified === true,
      status: validation.valid ? "draft" : "rejected",
      rejectionCode: validation.errors.find((e) => /^R\d/.test(e.code))?.code || null,
    },
  });
  await audit(req, "FHIR_CREATE", "Claim", c.id, validation.valid ? "success" : "rejected");
  res.status(201).json({ claim: toFhirClaim({ ...c, createdAt: c.createdAt }), validation });
});

router.get("/Claim", async (req, res) => {
  const where = {};
  if (req.query.patient) where.patientId = String(req.query.patient).split("/").pop();
  if (req.query.status)  where.status = String(req.query.status);
  const rows = await prisma.claim.findMany({ where, take: 100, orderBy: { createdAt: "desc" } });
  await audit(req, "FHIR_SEARCH", "Claim", null);
  res.json(bundle(rows.map((c) => toFhirClaim({ ...c, createdAt: c.createdAt }))));
});

// ── Patient $summary (International Patient Summary, IPS) ──────
router.get("/Patient/:id/\\$summary", async (req, res) => {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient) return res.status(404).json(operationOutcome("not-found", "Patient not found"));
  const [conditions, observations] = await Promise.all([
    prisma.condition.findMany({ where: { patientId: patient.id }, orderBy: { recordedAt: "desc" } }),
    prisma.observation.findMany({ where: { patientId: patient.id }, orderBy: { effectiveAt: "desc" }, take: 50 }),
  ]);
  await audit(req, "FHIR_IPS", "Patient", patient.id);
  res.json(buildIps({ patient, conditions, observations, medications: [] }));
});

// ── Encounter $finalize — mark finished + auto-push to the SHR ─
// Assembles Encounter + Conditions + Observations (+ SOAP Composition if given),
// pushes a transaction Bundle + IPS to the SHR, and registers a DocumentReference
// so other facilities can discover it (cross-facility continuity).
router.post("/Encounter/:id/\\$finalize", express.json({ type: ["application/fhir+json", "application/json"] }), async (req, res) => {
  const enc = await prisma.encounter.findUnique({ where: { id: req.params.id } });
  if (!enc) return res.status(404).json(operationOutcome("not-found", "Encounter not found"));

  const finished = await prisma.encounter.update({
    where: { id: enc.id }, data: { status: "finished", endedAt: new Date() },
  });
  const [patient, conditions, observations] = await Promise.all([
    prisma.patient.findUnique({ where: { id: finished.patientId } }),
    prisma.condition.findMany({ where: { encounterId: finished.id } }),
    prisma.observation.findMany({ where: { encounterId: finished.id } }),
  ]);

  const soap = req.body?.soap;   // optional { s,o,a,p }
  const composition = soap ? toFhirComposition({ patientId: patient.id, encounterId: finished.id, soap }) : null;
  const resources = [toFhirEncounter(finished), ...conditions.map(toFhirCondition), ...observations.map(toFhirObservation)];
  if (composition) resources.push(composition);

  const transactionBundle = buildTransactionBundle(resources);
  const ipsBundle = buildIps({ patient, conditions, observations, medications: [] });
  const documentReference = toFhirDocumentReference({
    patientId: patient.id, encounterId: finished.id, facilityId: finished.facilityId,
    title: "Encounter summary " + finished.id, url: (process.env.SHR_BASE_URL || "") + "/Encounter/" + finished.id,
  });

  const push = await publishToShr({ transactionBundle, ipsBundle, documentReference });
  await audit(req, "FHIR_FINALIZE_PUSH", "Encounter", finished.id, push.skipped ? "skipped" : (push.ok ? "success" : "error"));
  res.json({ encounter: toFhirEncounter(finished), shr: push, documentReference });
});

// ── Cross-facility document query (MHD ITI-67 / XDS.b intent) ──
router.get("/DocumentReference", async (req, res) => {
  const identifier = req.query["patient.identifier"] || req.query.identifier;
  const patientRef = req.query.patient;
  let ghanaCard, nhis, patientId;
  if (patientRef) patientId = String(patientRef).split("/").pop();
  if (identifier) {
    const v = String(identifier).split("|");
    if (v[0].includes("ghana-card")) ghanaCard = v[1]; else if (v[0].includes("nhis")) nhis = v[1]; else patientId = v[1] || v[0];
  }
  const result = await queryDocuments({ ghanaCard, nhis, patientId });
  await audit(req, "FHIR_XDS_QUERY", "DocumentReference", patientId || ghanaCard || nhis || null, result.skipped ? "skipped" : "success");
  if (result.skipped) return res.json(bundle([]));   // SHR not configured -> empty result set
  res.json(bundle(result.documents || []));
});

// ── Retrieve a cross-facility document (MHD ITI-68) ───────────
router.get("/Patient/:id/\\$xds-summary", async (req, res) => {
  const patient = await prisma.patient.findUnique({ where: { id: req.params.id } });
  if (!patient) return res.status(404).json(operationOutcome("not-found", "Patient not found"));
  const docs = await queryDocuments({ ghanaCard: patient.ghanaCard, nhis: patient.nhis, patientId: patient.id });
  await audit(req, "FHIR_XDS_QUERY", "Patient", patient.id);
  const first = (docs.documents || [])[0];
  const url = first?.content?.[0]?.attachment?.url;
  const retrieved = url ? await retrieveDocument(url) : null;
  res.json({ patient: patient.id, documentsFound: docs.total || 0, summary: retrieved?.document || null });
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
