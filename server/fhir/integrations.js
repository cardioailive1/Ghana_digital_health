// ============================================================
// External FHIR integrations:
//   - pushBundleToShr: POST a transaction/document Bundle to the SHR (HAPI FHIR)
//   - matchPatientMpi: resolve a patient across facilities via SanteMPI ($match / identifier search)
// Both are endpoint-configurable via env; if unset they no-op gracefully so
// local development and tests never block on external infrastructure.
//   SHR_BASE_URL  e.g. https://shr.cardioai.gh/fhir
//   MPI_BASE_URL  e.g. https://mpi.cardioai.gh/fhir
//   SHR_TOKEN / MPI_TOKEN  optional bearer tokens
// ============================================================

async function fhirFetch(url, { method = "GET", body, token } = {}) {
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
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

export async function pushBundleToShr(bundle, { baseUrl = process.env.SHR_BASE_URL, token = process.env.SHR_TOKEN } = {}) {
  if (!baseUrl) return { skipped: true, reason: "SHR_BASE_URL not configured" };
  // A transaction Bundle is POSTed to the base; a document Bundle to /Bundle.
  const url = bundle.type === "transaction" ? baseUrl.replace(/\/$/, "") : baseUrl.replace(/\/$/, "") + "/Bundle";
  return fhirFetch(url, { method: "POST", body: bundle, token });
}

// Resolve cross-facility identity. Prefers SanteMPI $match; falls back to identifier search.
export async function matchPatientMpi({ ghanaCard, nhis }, { baseUrl = process.env.MPI_BASE_URL, token = process.env.MPI_TOKEN } = {}) {
  if (!baseUrl) return { skipped: true, reason: "MPI_BASE_URL not configured" };
  const base = baseUrl.replace(/\/$/, "");
  const idParam = ghanaCard
    ? `identifier=https://nia.gov.gh/ghana-card|${encodeURIComponent(ghanaCard)}`
    : nhis ? `identifier=https://nhia.gov.gh/nhis|${encodeURIComponent(nhis)}` : null;
  if (!idParam) return { matched: false, reason: "no identifier supplied" };
  const r = await fhirFetch(`${base}/Patient?${idParam}`, { token });
  const entries = r.json?.entry || [];
  return { matched: entries.length > 0, total: entries.length, candidates: entries.map((e) => e.resource) };
}

// ── Publish an encounter document to the SHR + register it for discovery ──
// 1) POST a transaction Bundle (Encounter/Conditions/Observations/Composition)
// 2) POST an IPS document Bundle
// 3) Register a DocumentReference so other facilities can find it (MHD ITI-65/67)
export async function publishToShr({ transactionBundle, ipsBundle, documentReference },
  { baseUrl = process.env.SHR_BASE_URL, token = process.env.SHR_TOKEN } = {}) {
  if (!baseUrl) return { skipped: true, reason: "SHR_BASE_URL not configured" };
  const base = baseUrl.replace(/\/$/, "");
  const results = {};
  if (transactionBundle) results.transaction = await fhirFetch(base, { method: "POST", body: transactionBundle, token });
  if (ipsBundle)         results.ips = await fhirFetch(`${base}/Bundle`, { method: "POST", body: ipsBundle, token });
  if (documentReference) results.documentReference = await fhirFetch(`${base}/DocumentReference`, { method: "POST", body: documentReference, token });
  return { ok: Object.values(results).every((r) => r.ok), results };
}

// ── Cross-facility document QUERY (MHD ITI-67 / XDS.b intent) ──
// Find all documents for a patient across facilities, by shared identifier.
export async function queryDocuments({ ghanaCard, nhis, patientId },
  { baseUrl = process.env.SHR_BASE_URL, token = process.env.SHR_TOKEN } = {}) {
  if (!baseUrl) return { skipped: true, reason: "SHR_BASE_URL not configured" };
  const base = baseUrl.replace(/\/$/, "");
  let q;
  if (patientId) q = `patient=Patient/${encodeURIComponent(patientId)}`;
  else if (ghanaCard) q = `patient.identifier=https://nia.gov.gh/ghana-card|${encodeURIComponent(ghanaCard)}`;
  else if (nhis) q = `patient.identifier=https://nhia.gov.gh/nhis|${encodeURIComponent(nhis)}`;
  else return { documents: [], reason: "no identifier supplied" };
  const r = await fhirFetch(`${base}/DocumentReference?${q}&_sort=-date`, { token });
  const docs = (r.json?.entry || []).map((e) => e.resource);
  return { ok: r.ok, total: docs.length, documents: docs };
}

// ── Retrieve a document (MHD ITI-68) ──────────────────────────
export async function retrieveDocument(url, { token = process.env.SHR_TOKEN } = {}) {
  if (!url) return { error: "no document url" };
  const r = await fhirFetch(url, { token });
  return { ok: r.ok, document: r.json };
}
