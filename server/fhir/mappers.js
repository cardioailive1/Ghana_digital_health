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

export {
  SYS, toFhirPatient, fromFhirPatient, toFhirEncounter,
  toFhirObservation, toFhirCondition, bundle, operationOutcome,
};
