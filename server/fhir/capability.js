// FHIR R4 CapabilityStatement — advertises what this facade supports.
// National HIE gateways probe /fhir/r4/metadata before connecting.
export function capabilityStatement() {
  const rt = (type, interactions) => ({
    type,
    interaction: interactions.map((code) => ({ code })),
  });
  return {
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString(),
    publisher: "Cardio AI Ghana",
    kind: "instance",
    software: { name: "Cardio AI FHIR Facade", version: "1.0.0" },
    fhirVersion: "4.0.1",
    format: ["application/fhir+json"],
    rest: [{
      mode: "server",
      security: { description: "Bearer JWT (Authorization header) or session cookie; RBAC enforced." },
      resource: [
        rt("Patient",        ["read", "search-type", "create"]),
        rt("Observation",    ["search-type", "create"]),
        rt("Encounter",      ["read", "search-type"]),
        rt("Condition",      ["search-type"]),
        rt("ServiceRequest", ["search-type", "create"]),
        rt("Claim",          ["search-type", "create"]),
        rt("DocumentReference", ["search-type"]),
        rt("MedicationRequest", ["search-type", "create"]),
        rt("DiagnosticReport",  ["search-type", "create"]),
        rt("Immunization",      ["search-type", "create"]),
      ],
      operation: [
        { name: "summary",  definition: "Patient/{id}/$summary (International Patient Summary)" },
        { name: "finalize", definition: "Encounter/{id}/$finalize (push encounter to SHR + register document)" },
        { name: "xds-summary", definition: "Patient/{id}/$xds-summary (cross-facility document retrieve)" },
        { name: "autocode", definition: "Encounter/{id}/$autocode (AI ICD-11 assignment)" },
        { name: "submit",   definition: "Claim/{id}/$submit (validate + NHIA submission)" },
      ],
    }],
  };
}
