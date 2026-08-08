// ============================================================
// ADX — Aggregate Data Exchange: FHIR (individual) -> DHIS2 (aggregate).
// Aggregates conditions/results into IDSR data elements and pushes a DHIS2
// dataValueSet. Includes an EWARN threshold check (2 SD over baseline).
// Config: DHIS2_BASE_URL, DHIS2_USER/DHIS2_PASS (basic) or DHIS2_TOKEN.
// ============================================================

// IDSR data-element mapping: ICD-11 code -> DHIS2 dataElement id.
// Populate with your instance's real dataElement UIDs.
export const IDSR_MAP = {
  "1F40":   { de: "IDSR_MALARIA",   name: "Malaria (confirmed)" },
  "1F40.1": { de: "IDSR_MALARIA_S", name: "Severe malaria" },
  "1A00":   { de: "IDSR_CHOLERA",   name: "Cholera" },
  "CA22.0": { de: "IDSR_TB",        name: "TB (pulmonary, smear+)" },
  "1C62":   { de: "IDSR_HIV",       name: "HIV" },
  "1B57":   { de: "IDSR_TYPHOID",   name: "Typhoid" },
};

// Immediate-notifiable (24h) IDSR conditions -> EWARN.
export const IMMEDIATE_NOTIFIABLE = new Set(["1A00" /* cholera */, "CA22.0" /* TB flagged */]);

function dhis2Period(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;   // daily period
}

// Aggregate confirmed conditions since `since` grouped by facility + IDSR element.
export async function aggregateIdsr(prisma, { since } = {}) {
  const where = { code: { in: Object.keys(IDSR_MAP) } };
  if (since) where.recordedAt = { gte: since };
  const rows = await prisma.condition.findMany({
    where,
    select: { code: true, patient: { select: { facilityId: true } } },
  });
  const counts = {};   // key: facilityId|de -> count
  for (const r of rows) {
    const de = IDSR_MAP[r.code]?.de;
    const ou = r.patient?.facilityId || "UNKNOWN";
    if (!de) continue;
    counts[`${ou}|${de}`] = (counts[`${ou}|${de}`] || 0) + 1;
  }
  return Object.entries(counts).map(([k, v]) => {
    const [orgUnit, dataElement] = k.split("|");
    return { orgUnit, dataElement, value: v };
  });
}

// Build a DHIS2 dataValueSet payload. orgUnitMap: facilityId -> DHIS2 org-unit UID.
export function buildDataValueSet(dataValues, { period = dhis2Period(), orgUnitMap = {} } = {}) {
  return {
    period,
    dataValues: dataValues.map((d) => ({
      dataElement: d.dataElement,
      orgUnit: orgUnitMap[d.orgUnit] || d.orgUnit,
      value: String(d.value),
      period,
    })),
  };
}

async function dhis2Fetch(url, { method = "POST", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.DHIS2_TOKEN) headers.Authorization = "ApiToken " + process.env.DHIS2_TOKEN;
  else if (process.env.DHIS2_USER) headers.Authorization = "Basic " + Buffer.from(`${process.env.DHIS2_USER}:${process.env.DHIS2_PASS}`).toString("base64");
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { ok: res.ok, status: res.status, json };
}

export async function pushToDhis2(dataValueSet, { baseUrl = process.env.DHIS2_BASE_URL } = {}) {
  if (!baseUrl) return { skipped: true, reason: "DHIS2_BASE_URL not configured" };
  return dhis2Fetch(`${baseUrl.replace(/\/$/, "")}/api/dataValueSets`, { method: "POST", body: dataValueSet });
}

// EWARN: flag any element whose count exceeds mean + 2*SD of its baseline series.
export function ewarnCheck(dataValues, baseline = {}) {
  const alerts = [];
  for (const d of dataValues) {
    const series = baseline[d.dataElement];
    if (series && series.length) {
      const mean = series.reduce((a, b) => a + b, 0) / series.length;
      const sd = Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length);
      if (d.value > mean + 2 * sd) alerts.push({ ...d, mean, sd, threshold: mean + 2 * sd });
    }
  }
  return alerts;
}

// Orchestrate one ADX cycle. Safe no-op when DHIS2 unconfigured.
export async function syncAdx(prisma, { since, orgUnitMap = {}, baseline = {} } = {}) {
  const dataValues = await aggregateIdsr(prisma, { since });
  const ewarn = ewarnCheck(dataValues, baseline);
  if (!process.env.DHIS2_BASE_URL) return { skipped: true, reason: "DHIS2_BASE_URL not configured", dataValues, ewarn };
  const payload = buildDataValueSet(dataValues, { orgUnitMap });
  const push = await pushToDhis2(payload);
  return { ok: push.ok, pushed: payload.dataValues.length, ewarn, push };
}
