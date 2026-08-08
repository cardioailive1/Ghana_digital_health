// ============================================================
// Clinical scoring + critical-value detection.
// NEWS2 table per Ghana STG / RCP National Early Warning Score 2.
// ============================================================

function band(value, bands) {
  for (const [min, max, score] of bands) {
    if (value >= min && value <= max) return score;
  }
  return 0;
}

// vitals: { rr, spo2, temp, sbp, hr, consciousness ('A'|'V'|'P'|'U'), onOxygen }
export function news2Score(v = {}) {
  const params = {};
  if (v.rr != null)   params.rr   = band(v.rr,   [[-Infinity, 8, 3], [9, 11, 1], [12, 20, 0], [21, 24, 2], [25, Infinity, 3]]);
  if (v.spo2 != null) params.spo2 = band(v.spo2, [[-Infinity, 91, 3], [92, 93, 2], [94, 95, 1], [96, Infinity, 0]]);
  if (v.temp != null) params.temp = band(v.temp, [[-Infinity, 35.0, 3], [35.1, 36.0, 1], [36.1, 38.0, 0], [38.1, 39.0, 1], [39.1, Infinity, 2]]);
  if (v.sbp != null)  params.sbp  = band(v.sbp,  [[-Infinity, 90, 3], [91, 100, 2], [101, 110, 1], [111, 219, 0], [220, Infinity, 3]]);
  if (v.hr != null)   params.hr   = band(v.hr,   [[-Infinity, 40, 3], [41, 50, 1], [51, 90, 0], [91, 110, 1], [111, 130, 2], [131, Infinity, 3]]);
  if (v.consciousness) params.consciousness = v.consciousness === "A" ? 0 : 3;
  if (v.onOxygen != null) params.oxygen = v.onOxygen ? 2 : 0;

  const score = Object.values(params).reduce((a, b) => a + b, 0);
  const anyThree = Object.values(params).some((s) => s === 3);
  let risk = "low";
  if (score >= 7) risk = "high";
  else if (score >= 5 || anyThree) risk = "medium";
  return { score, params, risk, escalate: risk !== "low" };
}

// Critical single-parameter thresholds (immediate escalation regardless of NEWS2).
const CRITICAL_VITALS = {
  spo2: (x) => x < 90,
  hr:   (x) => x > 130 || x < 40,
  sbp:  (x) => x < 90,
  temp: (x) => x > 39.5 || x < 35,
};

// Critical lab-value rules keyed by LOINC code (extend as needed).
const CRITICAL_LABS = {
  "90271-0": (v) => String(v).toUpperCase() === "DETECTED",   // GeneXpert MTB detected
  "718-7":   (v) => Number(v) < 7,                            // Haemoglobin < 7 g/dL
  "2823-3":  (v) => Number(v) > 6.5 || Number(v) < 2.5,       // Potassium
  "1558-6":  (v) => Number(v) < 2.2,                          // Fasting glucose (hypoglycaemia)
  "777-3":   (v) => Number(v) < 50,                           // Platelets (x10^9/L)
};

// An Observation-shaped object: { code, value } (LOINC code)
export function isCriticalObservation(obs) {
  const rule = CRITICAL_LABS[obs.code];
  if (rule) { try { return !!rule(obs.value); } catch { return false; } }
  return false;
}

export function criticalVitals(v = {}) {
  const flags = [];
  for (const k of Object.keys(CRITICAL_VITALS)) {
    if (v[k] != null && CRITICAL_VITALS[k](v[k])) flags.push(k);
  }
  return flags;
}
