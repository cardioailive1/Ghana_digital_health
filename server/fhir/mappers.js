// ============================================================
// FHIR R4 mappers — translate internal Prisma rows <-> FHIR resources.
// Pure functions (no DB), so they are unit-testable in isolation.
// ============================================================

const SYS = {
  ghanaCard: "https://nia.gov.gh/ghana-card",
  nhis:      "https://nhia.gov.gh/nhis",
  mrn:       "https://cardioai.gh/mrn",
  loinc:     "http://loinc.org",
  icd11:     "http://id.who.int/icd/release/11/mms",
};

function dateOnly(d) { return d ? new Date(d).toISOString().slice(0, 10) : undefined; }
function instant(d)  { return d ? new Date(d).toISOString() : undefined; }

// ── Patient ───────────────────────────────────────────────────
function toFhirPatient(p) {
  const identifier = [];
  if (p.mrn)       identifier.push({ system: SYS.mrn,       value: p.mrn });
  if (p.ghanaCard) identifier.push({ system: SYS.ghanaCard, value: p.ghanaCard });
  if (p.nhis)      identifier.push({ system: SYS.nhis,       value: p.nhis });

  const res = {
    resourceType: "Patient",
    id: p.id,
    identifier: identifier.length ? identifier : undefined,
    active: p.active,
    name: [{ use: "official", family: p.lastName, given: p.firstName ? [p.firstName] : undefined }],
    gender: p.sex ? String(p.sex).toLowerCase() : undefined,
    birthDate: dateOnly(p.dob),
    telecom: p.phone ? [{ system: "phone", value: p.phone, use: "mobile" }] : undefined,
    address: (p.region || p.district) ? [{ district: p.district || undefined, state: p.region || undefined, country: "GH" }] : undefined,
    managingOrganization: p.facilityId ? { reference: "Organization/" + p.facilityId } : undefined,
  };
  return prune(res);
}

// FHIR Patient -> internal create/update payload
function fromFhirPatient(res) {
  const ids = res.identifier || [];
  const bySys = (s) => (ids.find((i) => i.system === s) || {}).value || null;
  const name = (res.name && res.name[0]) || {};
  return {
    mrn:       bySys(SYS.mrn),
    ghanaCard: bySys(SYS.ghanaCard),
    nhis:      bySys(SYS.nhis),
    firstName: (name.given && name.given[0]) || "",
    lastName:  name.family || "",
    sex:       res.gender || null,
    dob:       res.birthDate ? new Date(res.birthDate) : null,
    phone:     (res.telecom && (res.telecom.find((t) => t.system === "phone") || {}).value) || null,
    region:    (res.address && res.address[0] && res.address[0].state) || null,
    district:  (res.address && res.address[0] && res.address[0].district) || null,
    active:    res.active !== false,
  };
}

// ── Encounter ─────────────────────────────────────────────────
function toFhirEncounter(e) {
  return prune({
    resourceType: "Encounter",
    id: e.id,
    status: e.status,
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: e.class },
    subject: { reference: "Patient/" + e.patientId },
    period: { start: instant(e.startedAt), end: instant(e.endedAt) },
    reasonCode: e.reason ? [{ text: e.reason }] : undefined,
    serviceProvider: e.facilityId ? { reference: "Organization/" + e.facilityId } : undefined,
  });
}

// ── Observation ───────────────────────────────────────────────
function toFhirObservation(o) {
  const res = {
    resourceType: "Observation",
    id: o.id,
    status: o.status || "final",
    code: { coding: [{ system: SYS.loinc, code: o.code, display: o.display || undefined }] },
    subject: { reference: "Patient/" + o.patientId },
    encounter: o.encounterId ? { reference: "Encounter/" + o.encounterId } : undefined,
    effectiveDateTime: instant(o.effectiveAt),
  };
  // numeric -> valueQuantity, else valueString
  const num = o.value != null && o.value !== "" && !isNaN(Number(o.value));
  if (num) res.valueQuantity = { value: Number(o.value), unit: o.unit || undefined, system: "http://unitsofmeasure.org" };
  else if (o.value != null) res.valueString = String(o.value);
  if (o.interpretation) {
    res.interpretation = [{
      coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation", code: o.interpretation }],
    }];
  }
  return prune(res);
}

// ── Condition ─────────────────────────────────────────────────
function toFhirCondition(c) {
  return prune({
    resourceType: "Condition",
    id: c.id,
    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: c.clinicalStatus }] },
    code: { coding: [{ system: SYS.icd11, code: c.code, display: c.display || undefined }] },
    subject: { reference: "Patient/" + c.patientId },
    encounter: c.encounterId ? { reference: "Encounter/" + c.encounterId } : undefined,
    recordedDate: instant(c.recordedAt),
  });
}

// ── Bundle + OperationOutcome helpers ─────────────────────────
function bundle(resources, type = "searchset") {
  return {
    resourceType: "Bundle",
    type,
    total: resources.length,
    entry: resources.map((r) => ({ resource: r })),
  };
}

function operationOutcome(code, diagnostics, severity = "error") {
  return { resourceType: "OperationOutcome", issue: [{ severity, code, diagnostics }] };
}

// Remove undefined/empty so output is clean FHIR JSON
function prune(obj) {
  if (Array.isArray(obj)) return obj.map(prune).filter((v) => v !== undefined);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = prune(obj[k]);
      const empty = v === undefined || v === null || (Array.isArray(v) && v.length === 0) ||
        (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
      if (!empty) out[k] = v;
    }
    return out;
  }
  return obj;
}

// ── ServiceRequest (referral) ─────────────────────────────────
function toFhirServiceRequest(r) {
  return prune({
    resourceType: "ServiceRequest",
    id: r.id,
    status: r.status || "active",
    intent: "order",
    priority: r.urgent ? "urgent" : "routine",
    code: r.reasonCode ? { coding: [{ system: SYS.icd11, code: r.reasonCode, display: r.reasonDisplay }] } : { text: r.reason || "Referral" },
    subject: { reference: "Patient/" + r.patientId },
    encounter: r.encounterId ? { reference: "Encounter/" + r.encounterId } : undefined,
    requester: r.requesterFacilityId ? { reference: "Organization/" + r.requesterFacilityId } : undefined,
    performer: r.performerFacilityId ? [{ reference: "Organization/" + r.performerFacilityId }] : undefined,
    authoredOn: instant(r.authoredAt || new Date()),
    note: r.note ? [{ text: r.note }] : undefined,
  });
}

// ── Claim (NHIA) ──────────────────────────────────────────────
function toFhirClaim(c) {
  return prune({
    resourceType: "Claim",
    id: c.id,
    status: c.status || "active",
    type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: "institutional" }] },
    use: "claim",
    patient: { reference: "Patient/" + c.patientId },
    created: instant(c.createdAt || new Date()),
    insurer: { display: "NHIA" },
    provider: c.facilityId ? { reference: "Organization/" + c.facilityId } : { display: "Facility" },
    diagnosis: (c.diagnoses || []).map((d, i) => ({
      sequence: i + 1,
      diagnosisCodeableConcept: { coding: [{ system: SYS.icd11, code: d.code, display: d.display }] },
    })),
    item: (c.items || []).map((it, i) => ({
      sequence: i + 1,
      productOrService: { text: it.description },
      unitPrice: { value: it.amount, currency: "GHS" },
      net: { value: it.amount, currency: "GHS" },
    })),
    total: { value: (c.items || []).reduce((s, it) => s + (it.amount || 0), 0), currency: "GHS" },
  });
}

// ── Composition (SOAP note as a FHIR document section set) ─────
function toFhirComposition(doc) {
  const section = (title, code, text) => text ? {
    title, code: { text: code },
    text: { status: "generated", div: `<div xmlns="http://www.w3.org/1999/xhtml">${escapeXml(text)}</div>` },
  } : null;
  return prune({
    resourceType: "Composition",
    id: doc.id,
    status: "final",
    type: { coding: [{ system: SYS.loinc, code: "11488-4", display: "Consultation note" }] },
    subject: { reference: "Patient/" + doc.patientId },
    encounter: doc.encounterId ? { reference: "Encounter/" + doc.encounterId } : undefined,
    date: instant(doc.date || new Date()),
    title: "SOAP Note",
    section: [
      section("Subjective", "S", doc.soap?.s),
      section("Objective", "O", doc.soap?.o),
      section("Assessment", "A", doc.soap?.a),
      section("Plan", "P", doc.soap?.p),
    ].filter(Boolean),
  });
}

// ── International Patient Summary (IPS) document bundle ────────
function buildIps({ patient, conditions = [], observations = [], medications = [] }) {
  const composition = {
    resourceType: "Composition",
    status: "final",
    type: { coding: [{ system: SYS.loinc, code: "60591-5", display: "Patient summary Document" }] },
    subject: { reference: "Patient/" + patient.id },
    date: new Date().toISOString(),
    title: "International Patient Summary",
    section: [
      { title: "Active Problems", entry: conditions.map((c) => ({ reference: "Condition/" + c.id })) },
      { title: "Results", entry: observations.map((o) => ({ reference: "Observation/" + o.id })) },
      { title: "Medications", entry: medications.map((m) => ({ reference: "MedicationRequest/" + m.id })) },
    ],
  };
  const resources = [composition, toFhirPatient(patient),
    ...conditions.map(toFhirCondition), ...observations.map(toFhirObservation)];
  return {
    resourceType: "Bundle", type: "document",
    timestamp: new Date().toISOString(),
    entry: resources.map((r) => ({ resource: r })),
  };
}

// ── Transaction bundle for pushing to the SHR ─────────────────
function buildTransactionBundle(resources) {
  return {
    resourceType: "Bundle", type: "transaction",
    entry: resources.map((r) => ({
      resource: r,
      request: { method: r.id ? "PUT" : "POST", url: r.id ? `${r.resourceType}/${r.id}` : r.resourceType },
    })),
  };
}

// LOINC codes for the common IoMT vitals (used by the IoMT->Observation path)
const IOMT_VITALS_LOINC = {
  heartRate:  { code: "8867-4",  display: "Heart rate",        unit: "/min" },
  spo2:       { code: "59408-5", display: "Oxygen saturation", unit: "%" },
  respRate:   { code: "9279-1",  display: "Respiratory rate",  unit: "/min" },
  temp:       { code: "8310-5",  display: "Body temperature",  unit: "Cel" },
  sbp:        { code: "8480-6",  display: "Systolic BP",        unit: "mm[Hg]" },
  dbp:        { code: "8462-4",  display: "Diastolic BP",       unit: "mm[Hg]" },
};

function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

// ── DocumentReference (MHD / cross-facility discovery) ────────
function toFhirDocumentReference(d) {
  return prune({
    resourceType: "DocumentReference",
    id: d.id,
    status: "current",
    type: { coding: [{ system: SYS.loinc, code: d.typeCode || "60591-5", display: d.typeDisplay || "Patient summary Document" }] },
    subject: { reference: "Patient/" + d.patientId },
    date: instant(d.date || new Date()),
    custodian: d.facilityId ? { reference: "Organization/" + d.facilityId } : undefined,
    context: d.encounterId ? { encounter: [{ reference: "Encounter/" + d.encounterId }] } : undefined,
    content: [{
      attachment: {
        contentType: "application/fhir+json",
        url: d.url || undefined,
        title: d.title || "Clinical Document",
      },
      format: { system: "http://ihe.net/fhir/ValueSet/IHE.FormatCode.codesystem", code: "urn:ihe:iti:xds:2017:mimeTypeSufficient" },
    }],
  });
}

export {
  SYS, toFhirPatient, fromFhirPatient, toFhirEncounter,
  toFhirObservation, toFhirCondition, bundle, operationOutcome,
  toFhirServiceRequest, toFhirClaim, toFhirComposition, buildIps,
  buildTransactionBundle, IOMT_VITALS_LOINC, toFhirDocumentReference,
};
