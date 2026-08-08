// ============================================================
// NHIA claim rules — tariff validation, 30-day submission deadline,
// and automated R-code (rejection) resolution actions.
// Figures are indicative NHIA tariff bands (GHS); adjust to the live schedule.
// ============================================================

export const NHIA_TARIFF = {
  "OPD-CONSULT":       { min: 15, max: 28,  label: "OPD consultation" },
  "INPATIENT-DAY":     { min: 45, max: 120, label: "Inpatient per day" },
  "CS":                { min: 780, max: 1200, label: "Caesarean section" },
  "NORMAL-DELIVERY":   { min: 180, max: 320, label: "Normal delivery" },
  "MALARIA-RDT":       { min: 5,  max: 5,   label: "Malaria RDT" },
  "BLOOD-UNIT":        { min: 120, max: 180, label: "Blood transfusion (unit)" },
  "GENEXPERT":         { min: 55, max: 55,  label: "GeneXpert" },
};

const DAY = 24 * 60 * 60 * 1000;

// claim: { serviceDate, nhisVerified, credentialled, isDuplicate, items:[{tariffCode, amount}] }
export function validateClaim(claim, now = new Date()) {
  const errors = [];

  // 30-day submission deadline
  const svc = new Date(claim.serviceDate);
  const daysElapsed = Math.floor((now - svc) / DAY);
  const daysToDeadline = 30 - daysElapsed;
  if (daysToDeadline < 0) errors.push({ code: "DEADLINE", message: "Past 30-day NHIA submission deadline", action: "cannot-submit" });

  // Tariff bounds
  for (const it of claim.items || []) {
    const t = NHIA_TARIFF[it.tariffCode];
    if (!t) { errors.push({ code: "TARIFF-UNKNOWN", message: `Unknown tariff code ${it.tariffCode}`, item: it }); continue; }
    if (it.amount < t.min || it.amount > t.max) {
      errors.push({ code: "TARIFF-RANGE", message: `${t.label}: ${it.amount} outside GHS ${t.min}-${t.max}`, item: it });
    }
  }

  // Rejection precursors (map to R-codes)
  if (claim.nhisVerified === false) errors.push(rcode("R001"));
  if (claim.isDuplicate)            errors.push(rcode("R024"));
  if (claim.credentialled === false) errors.push(rcode("R062"));

  return {
    valid: errors.length === 0,
    errors,
    daysToDeadline,
    urgent: daysToDeadline >= 0 && daysToDeadline <= 3,
    total: (claim.items || []).reduce((s, it) => s + (it.amount || 0), 0),
  };
}

// Automated resolution actions for the R-codes from the Super User SOP.
export function resolveRCode(code) {
  const map = {
    R001: { message: "NHIS not verified", action: "Re-verify NHIS via NIA/NHIA API, update record, resubmit", auto: true },
    R024: { message: "Duplicate claim", action: "Pull original; if paid do not resubmit, else add clinical justification note", auto: true },
    R062: { message: "Provider not credentialled", action: "Escalate to Medical Director; do NOT resubmit until resolved", auto: false },
  };
  return map[code] || { message: "Unknown rejection code", action: "Manual review", auto: false };
}

function rcode(code) { const r = resolveRCode(code); return { code, message: r.message, action: r.action, auto: r.auto }; }
