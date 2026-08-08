// ============================================================
// ADX — FHIR (individual) -> DHIS2 (aggregate) for IDSR surveillance.
//
// DHIS2 dataElement UIDs are INSTANCE-SPECIFIC (11-char, generated per DB),
// so we never hardcode them. Instead IDSR_MAP maps ICD-11 -> a stable DHIS2
// dataElement CODE, and we resolve code -> real UID from the live instance
// (/api/dataElements). EWARN baselines are pulled from /api/analytics and the
// mean/SD computed per element. A config file (IDSR_MAPPING_FILE) lets the
// client pin their own codes/UIDs without touching code.
//
// Config: DHIS2_BASE_URL, DHIS2_USER/DHIS2_PASS or DHIS2_TOKEN,
//         IDSR_MAPPING_FILE (optional JSON), EWARN_BASELINE_PERIOD (default LAST_52_WEEKS)
// ============================================================
import fs from "fs";

// ICD-11 -> { code: <stable DHIS2 dataElement code>, name }.  NOT a UID.
export const IDSR_MAP = {
  "1F40":   { code: "IDSR_MALARIA_CONF", name: "Malaria (confirmed)" },
  "1F40.1": { code: "IDSR_MALARIA_SEV",  name: "Severe malaria" },
  "1A00":   { code: "IDSR_CHOLERA",      name: "Cholera" },
  "CA22.0": { code: "IDSR_TB_PULM",      name: "TB (pulmonary, smear+)" },
  "1C62":   { code: "IDSR_HIV",          name: "HIV" },
  "1B57":   { code: "IDSR_TYPHOID",      name: "Typhoid" },
  "JA24":   { code: "IDSR_MAT_ECLAMPSIA", name: "Maternal (eclampsia)" },
};

export const IMMEDIATE_NOTIFIABLE = new Set(["1A00", "CA22.0"]);

// Merge an optional client mapping file over the defaults.
// File format: { "1F40": { "code":"MAL_CONF", "uid":"fbfJHSPpUQD", "name":"..." }, ... }
export function loadIdsrMapping({ file = process.env.IDSR_MAPPING_FILE } = {}) {
  const map = JSON.parse(JSON.stringify(IDSR_MAP));
  if (file && fs.existsSync(file)) {
    try {
      const override = JSON.parse(fs.readFileSync(file, "utf8"));
      for (const [icd, v] of Object.entries(override)) map[icd] = { ...(map[icd] || {}), ...v };
    } catch (e) { /* keep defaults on parse error */ }
  }
  return map;
}

function dhis2Period(d = new Date()) {
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function authHeaders() {
  const h = { "Content-Type": "application/json" };
  if (process.env.DHIS2_TOKEN) h.Authorization = "ApiToken " + process.env.DHIS2_TOKEN;
  else if (process.env.DHIS2_USER) h.Authorization = "Basic " + Buffer.from(`${process.env.DHIS2_USER}:${process.env.DHIS2_PASS}`).toString("base64");
  return h;
}

async function dhis2Get(url) {
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text(); let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* */ }
  return { ok: res.ok, status: res.status, json };
}

// Resolve stable dataElement CODEs -> real DHIS2 UIDs from the live instance.
export async function resolveDataElementUids(codes, { baseUrl = process.env.DHIS2_BASE_URL } = {}) {
  if (!baseUrl || !codes.length) return {};
  const base = baseUrl.replace(/\/$/, "");
  const filter = `code:in:[${codes.join(",")}]`;
  const r = await dhis2Get(`${base}/api/dataElements.json?filter=${encodeURIComponent(filter)}&fields=id,code,name&paging=false`);
  const map = {};
  for (const de of r.json?.dataElements || []) if (de.code) map[de.code] = de.id;
  return map;
}

// Aggregate confirmed conditions since `since`, grouped by facility + ICD-11.
export async function aggregateIdsr(prisma, { since, mapping = IDSR_MAP } = {}) {
  const codes = Object.keys(mapping);
  const where = { code: { in: codes } };
  if (since) where.recordedAt = { gte: since };
  const rows = await prisma.condition.findMany({ where, select: { code: true, patient: { select: { facilityId: true } } } });
  const counts = {};
  for (const r of rows) {
    const m = mapping[r.code]; if (!m) continue;
    const ou = r.patient?.facilityId || "UNKNOWN";
    const key = `${ou}|${r.code}`;
    counts[key] = counts[key] || { orgUnit: ou, icd11: r.code, dhis2Code: m.code, uid: m.uid || null, value: 0 };
    counts[key].value += 1;
  }
  return Object.values(counts);
}

// Turn aggregates into DHIS2 dataValues using resolved UIDs.
export function toDataValues(aggregates, { codeToUid = {}, orgUnitMap = {} } = {}) {
  const values = [], unresolved = [];
  for (const a of aggregates) {
    const uid = a.uid || codeToUid[a.dhis2Code];
    if (!uid) { unresolved.push(a.dhis2Code); continue; }
    values.push({ dataElement: uid, orgUnit: orgUnitMap[a.orgUnit] || a.orgUnit, value: a.value, icd11: a.icd11 });
  }
  return { values, unresolved: [...new Set(unresolved)] };
}

export function buildDataValueSet(dataValues, { period = dhis2Period(), dataSet } = {}) {
  return {
    dataSet, period,
    dataValues: dataValues.map((d) => ({ dataElement: d.dataElement, orgUnit: d.orgUnit, value: String(d.value), period })),
  };
}

export async function pushToDhis2(dataValueSet, { baseUrl = process.env.DHIS2_BASE_URL } = {}) {
  if (!baseUrl) return { skipped: true, reason: "DHIS2_BASE_URL not configured" };
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/dataValueSets`, { method: "POST", headers: authHeaders(), body: JSON.stringify(dataValueSet) });
  const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { ok: res.ok, status: res.status, json };
}

// EWARN baselines from DHIS2 analytics: mean + SD per dataElement over a period.
export async function loadBaselines(uids, { baseUrl = process.env.DHIS2_BASE_URL, orgUnit, period = process.env.EWARN_BASELINE_PERIOD || "LAST_52_WEEKS" } = {}) {
  if (!baseUrl || !uids.length) return {};
  const base = baseUrl.replace(/\/$/, "");
  let url = `${base}/api/analytics.json?dimension=dx:${uids.join(";")}&dimension=pe:${period}&skipMeta=true`;
  if (orgUnit) url += `&dimension=ou:${orgUnit}`;
  const r = await dhis2Get(url);
  const series = {};
  for (const row of r.json?.rows || []) {
    const dx = row[0], val = Number(row[row.length - 1]);
    if (!isNaN(val)) (series[dx] = series[dx] || []).push(val);
  }
  return series;   // { uid: [values...] } — consumed by ewarnCheck
}

// Flag any element whose count exceeds mean + 2*SD of its baseline series.
export function ewarnCheck(dataValues, baseline = {}) {
  const alerts = [];
  for (const d of dataValues) {
    const s = baseline[d.dataElement];
    if (s && s.length) {
      const mean = s.reduce((a, b) => a + b, 0) / s.length;
      const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
      if (d.value > mean + 2 * sd) alerts.push({ ...d, mean: +mean.toFixed(2), sd: +sd.toFixed(2), threshold: +(mean + 2 * sd).toFixed(2) });
    }
  }
  return alerts;
}

// One ADX cycle: map -> aggregate -> resolve UIDs -> baselines -> EWARN -> push.
export async function syncAdx(prisma, { since, orgUnitMap = {} } = {}) {
  const mapping = loadIdsrMapping();
  const aggregates = await aggregateIdsr(prisma, { since, mapping });

  if (!process.env.DHIS2_BASE_URL) {
    return { skipped: true, reason: "DHIS2_BASE_URL not configured", aggregates };
  }

  const needResolve = [...new Set(aggregates.filter((a) => !a.uid).map((a) => a.dhis2Code))];
  const codeToUid = needResolve.length ? await resolveDataElementUids(needResolve) : {};
  const { values, unresolved } = toDataValues(aggregates, { codeToUid, orgUnitMap });

  const baseline = await loadBaselines(values.map((v) => v.dataElement), {});
  const ewarn = ewarnCheck(values, baseline);

  const push = await pushToDhis2(buildDataValueSet(values));
  return { ok: push.ok, pushed: values.length, unresolved, ewarn, push };
}
