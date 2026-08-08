// ============================================================
// GOFR — Global Open Facility Registry client (FHIR-based).
// Resolves canonical facility identity (DHIS2 org-unit UID, GPS, NHIA id)
// and can sync the registry into the local `facilities` table.
// Config: GOFR_BASE_URL, GOFR_TOKEN. No-ops safely when unset.
// ============================================================

const SYS_FACILITY = "https://gofr.cardioai.gh/facility-code";

async function gofrFetch(url, { method = "GET", body, token = process.env.GOFR_TOKEN } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/fhir+json",
      Accept: "application/fhir+json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { ok: res.ok, status: res.status, json };
}

// Map a local facility row -> FHIR Organization.
export function toFhirOrganization(f) {
  const org = {
    resourceType: "Organization",
    id: f.id,
    identifier: [
      { system: SYS_FACILITY, value: f.code },
      f.dhis2OrgUnit ? { system: "https://dhis2.moh.gov.gh/orgunit", value: f.dhis2OrgUnit } : null,
      f.nhiaId ? { system: "https://nhia.gov.gh/provider", value: f.nhiaId } : null,
    ].filter(Boolean),
    active: f.active,
    name: f.name,
    telecom: f.phone ? [{ system: "phone", value: f.phone }] : undefined,
    address: [{ text: f.address || undefined, state: f.region || undefined, country: "GH" }],
  };
  return org;
}

// Resolve a facility from GOFR by code; returns a normalised object.
export async function resolveFacility({ code }, { baseUrl = process.env.GOFR_BASE_URL } = {}) {
  if (!baseUrl) return { skipped: true, reason: "GOFR_BASE_URL not configured" };
  const base = baseUrl.replace(/\/$/, "");
  const r = await gofrFetch(`${base}/Organization?identifier=${SYS_FACILITY}|${encodeURIComponent(code)}`);
  const org = r.json?.entry?.[0]?.resource;
  if (!org) return { found: false };
  const idOf = (sys) => (org.identifier || []).find((i) => i.system && i.system.includes(sys))?.value || null;
  return {
    found: true,
    facility: {
      code, name: org.name,
      dhis2OrgUnit: idOf("dhis2"), nhiaId: idOf("nhia"),
      region: org.address?.[0]?.state || null,
      active: org.active !== false,
    },
  };
}

// Pull the facility registry from GOFR and upsert into local `facilities`.
export async function syncFacilities(prisma, { baseUrl = process.env.GOFR_BASE_URL, limit = 500 } = {}) {
  if (!baseUrl) return { skipped: true, reason: "GOFR_BASE_URL not configured" };
  const base = baseUrl.replace(/\/$/, "");
  const r = await gofrFetch(`${base}/Organization?_count=${limit}`);
  const orgs = (r.json?.entry || []).map((e) => e.resource);
  let upserted = 0;
  for (const org of orgs) {
    const code = (org.identifier || []).find((i) => i.system === SYS_FACILITY)?.value;
    if (!code) continue;
    const idOf = (sys) => (org.identifier || []).find((i) => i.system && i.system.includes(sys))?.value || null;
    await prisma.facility.upsert({
      where: { code },
      update: { name: org.name, region: org.address?.[0]?.state || "", dhis2OrgUnit: idOf("dhis2"), nhiaId: idOf("nhia"), active: org.active !== false },
      create: { code, name: org.name || code, region: org.address?.[0]?.state || "", type: "health-centre", dhis2OrgUnit: idOf("dhis2"), nhiaId: idOf("nhia") },
    });
    upserted++;
  }
  return { ok: true, total: orgs.length, upserted };
}
