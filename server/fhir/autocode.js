// ============================================================
// ICD-11 auto-assignment. The Clinical AI reads the assessment text and
// returns ICD-11 codes; the bridge stores them as Conditions. An AI caller
// is injected (so it's testable and swappable); a deterministic STG keyword
// map is the fallback when the AI is unavailable or low-confidence.
// ============================================================

// Common Ghana STG 2023 presentations -> ICD-11 (fallback only).
const STG_KEYWORDS = [
  { rx: /\bmalaria\b/i,                 code: "1F40",   display: "Malaria, P. falciparum" },
  { rx: /severe malaria|cerebral malaria/i, code: "1F40.1", display: "Severe P. falciparum malaria" },
  { rx: /\bcholera\b/i,                 code: "1A00",   display: "Cholera" },
  { rx: /\b(tb|tuberculosis)\b/i,       code: "CA22.0", display: "Pulmonary TB, smear-positive" },
  { rx: /\bhiv\b/i,                     code: "1C62",   display: "HIV disease" },
  { rx: /\btyphoid\b/i,                 code: "1B57",   display: "Typhoid fever" },
  { rx: /hypertension|htn|high blood pressure/i, code: "BA00", display: "Essential hypertension" },
  { rx: /heart failure|chf|hfref/i,     code: "CA23",   display: "Heart failure" },
  { rx: /type 2 diabetes|t2dm|diabetes mellitus/i, code: "5A10", display: "Type 2 diabetes mellitus" },
  { rx: /pneumonia|cap\b/i,             code: "CA40",   display: "Community-acquired pneumonia" },
  { rx: /pre-?eclampsia/i,              code: "JA23",   display: "Pre-eclampsia" },
  { rx: /eclampsia/i,                   code: "JA24",   display: "Eclampsia" },
  { rx: /postpartum haemorrhage|pph/i,  code: "JA84",   display: "Postpartum haemorrhage" },
  { rx: /anaemia|anemia/i,              code: "3A9Z",   display: "Anaemia, unspecified" },
];

export function fallbackIcd11(text) {
  const out = [];
  for (const k of STG_KEYWORDS) if (k.rx.test(text || "")) out.push({ code: k.code, display: k.display, confidence: 0.5, source: "stg-fallback" });
  return out;
}

// aiComplete: async (prompt) => "<json array or text>"  (inject the platform's Claude call)
export async function autocodeIcd11(assessmentText, { aiComplete, minConfidence = 0.6 } = {}) {
  const text = (assessmentText || "").trim();
  if (!text) return { codes: [], source: "empty" };

  if (aiComplete) {
    const prompt = `You are a clinical coder. From this assessment, return ONLY a JSON array of ICD-11 codes as [{"code","display","confidence"}] (confidence 0-1). Assessment: "${text}"`;
    try {
      const raw = await aiComplete(prompt);
      const match = String(raw).match(/\[[\s\S]*\]/);
      const parsed = match ? JSON.parse(match[0]) : [];
      const codes = parsed
        .filter((c) => c && c.code && (c.confidence ?? 1) >= minConfidence)
        .map((c) => ({ code: c.code, display: c.display || null, confidence: c.confidence ?? 1, source: "ai" }));
      if (codes.length) return { codes, source: "ai" };
    } catch (_) { /* fall through to deterministic */ }
  }

  const fb = fallbackIcd11(text);
  return { codes: fb, source: fb.length ? "stg-fallback" : "none" };
}

// Persist auto-coded conditions for an encounter.
export async function autocodeEncounter(prisma, { encounterId, patientId, assessmentText, aiComplete }) {
  const { codes, source } = await autocodeIcd11(assessmentText, { aiComplete });
  const created = [];
  for (const c of codes) {
    created.push(await prisma.condition.create({
      data: { patientId, encounterId, code: c.code, display: c.display, clinicalStatus: "active" },
    }));
  }
  return { source, codes, conditions: created };
}
