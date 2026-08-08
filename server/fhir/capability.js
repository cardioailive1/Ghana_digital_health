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
        rt("Patient",     ["read", "search-type", "create"]),
        rt("Observation", ["search-type", "create"]),
        rt("Encounter",   ["read", "search-type"]),
        rt("Condition",   ["search-type"]),
      ],
    }],
  };
}
