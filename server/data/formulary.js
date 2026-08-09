// ============================================================
// Ghana STG 2023 / NHIS Essential Medicines Formulary (reference data).
//
// This is the prescribing catalogue the Pharmacy module reads via
// GET /pharmacy/drugs. It is REFERENCE data (like the ICD-11 / LOINC lists),
// not patient data — so it ships with the app rather than being seeded per
// patient.
//
// ⚠️ CLINICAL VALIDATION REQUIRED: dosing below reflects standard WHO / Ghana
// STG 2023 regimens for common presentations, but MUST be reviewed and signed
// off by a qualified pharmacist against the official Ghana Standard Treatment
// Guidelines (2023, 7th ed.) and the current NHIS Medicines List before
// production clinical use. `nhis` coverage flags in particular change with each
// NHIA tariff review and must be reconciled with the live NHIA medicines list.
// ============================================================

export const FORMULARY = [
  // ── Antimalarials ─────────────────────────────────────────
  { id: "al-20-120", name: "Artemether–Lumefantrine 20/120mg", cat: "Antimalarials", stg: "STG 2023 §1.1", icd11: "1F40", nhis: true, eml: true, brand: "Coartem", route: "Oral",
    indication: "Uncomplicated P. falciparum malaria",
    dosing: [
      { wt: "5–14 kg", dose: "1 tab", freq: "BD", days: 3, notes: "Give with fatty food/milk to aid absorption. Hour 0, 8, then 12-hourly." },
      { wt: "15–24 kg", dose: "2 tabs", freq: "BD", days: 3, notes: "Complete all 6 doses even if symptoms resolve." },
      { wt: "25–34 kg", dose: "3 tabs", freq: "BD", days: 3, notes: "Repeat dose if vomiting occurs within 30 min." },
      { wt: "≥35 kg (adult)", dose: "4 tabs", freq: "BD", days: 3, notes: "Not for severe malaria — use IV artesunate." },
    ] },
  { id: "artesunate-inj", name: "Artesunate injection 60mg", cat: "Antimalarials", stg: "STG 2023 §1.2", icd11: "1F40.1", nhis: true, eml: true, route: "IV/IM",
    indication: "Severe/complicated malaria",
    dosing: [
      { wt: "<20 kg", dose: "3 mg/kg", freq: "at 0,12,24h then daily", days: 7, notes: "Switch to oral ACT once patient can tolerate orally (min 24h IV)." },
      { wt: "≥20 kg", dose: "2.4 mg/kg", freq: "at 0,12,24h then daily", days: 7, notes: "Admit. Monitor for delayed haemolysis up to 4 weeks." },
    ] },
  { id: "sp-maternal", name: "Sulfadoxine–Pyrimethamine 500/25mg", cat: "Antimalarials", stg: "STG 2023 §1.4", icd11: "1F40", nhis: true, eml: true, brand: "Fansidar", route: "Oral",
    indication: "IPTp — malaria prevention in pregnancy",
    dosing: [
      { wt: "Pregnancy (from 2nd trimester)", dose: "3 tabs", freq: "single dose", days: 1, notes: "IPTp-SP: give at each ANC visit ≥1 month apart, from 16 weeks. Not in 1st trimester." },
    ] },

  // ── Analgesics & Antipyretics ─────────────────────────────
  { id: "paracetamol-500", name: "Paracetamol 500mg", cat: "Analgesics & Antipyretics", stg: "STG 2023 §26", nhis: true, eml: true, route: "Oral",
    indication: "Mild–moderate pain, fever",
    dosing: [
      { wt: "Child", dose: "10–15 mg/kg", freq: "QDS PRN", days: 5, notes: "Max 60 mg/kg/day. Avoid in hepatic impairment." },
      { wt: "Adult", dose: "1 g (2 tabs)", freq: "QDS PRN", days: 5, notes: "Max 4 g/day. Reduce dose in low body weight / liver disease." },
    ] },
  { id: "ibuprofen-400", name: "Ibuprofen 400mg", cat: "Analgesics & Antipyretics", stg: "STG 2023 §26", nhis: true, eml: true, route: "Oral",
    indication: "Inflammatory pain, musculoskeletal pain",
    dosing: [
      { wt: "Adult", dose: "400 mg", freq: "TDS with food", days: 5, notes: "Avoid in peptic ulcer, renal impairment, 3rd-trimester pregnancy, dengue/severe malaria." },
    ] },

  // ── Antibiotics ───────────────────────────────────────────
  { id: "amoxicillin-500", name: "Amoxicillin 500mg", cat: "Antibiotics", stg: "STG 2023 §5", icd11: "CA40", nhis: true, eml: true, route: "Oral",
    indication: "Respiratory, ENT, urinary infections",
    dosing: [
      { wt: "Child", dose: "25–45 mg/kg/day", freq: "in 2–3 divided doses", days: 5, notes: "Use weight-band paediatric suspension where available." },
      { wt: "Adult", dose: "500 mg", freq: "TDS", days: 5, notes: "Community-acquired pneumonia: consider 1 g TDS × 5–7 days." },
    ] },
  { id: "amox-clav-625", name: "Amoxicillin–Clavulanate 625mg", cat: "Antibiotics", stg: "STG 2023 §5", nhis: true, eml: true, brand: "Augmentin", route: "Oral",
    indication: "Resistant/complicated bacterial infections",
    dosing: [
      { wt: "Adult", dose: "625 mg", freq: "TDS", days: 7, notes: "Take with food. Caution in penicillin allergy." },
    ] },
  { id: "ciprofloxacin-500", name: "Ciprofloxacin 500mg", cat: "Antibiotics", stg: "STG 2023 §5", icd11: "1B57", nhis: true, eml: true, route: "Oral",
    indication: "Typhoid, complicated UTI, bacterial diarrhoea",
    dosing: [
      { wt: "Adult", dose: "500 mg", freq: "BD", days: 7, notes: "Avoid in pregnancy/children unless no alternative. Tendon rupture risk." },
    ] },
  { id: "metronidazole-400", name: "Metronidazole 400mg", cat: "Antibiotics", stg: "STG 2023 §5", nhis: true, eml: true, brand: "Flagyl", route: "Oral",
    indication: "Anaerobic infections, amoebiasis, giardiasis",
    dosing: [
      { wt: "Adult", dose: "400 mg", freq: "TDS", days: 7, notes: "No alcohol during and 48h after (disulfiram reaction)." },
    ] },
  { id: "ceftriaxone-1g", name: "Ceftriaxone injection 1g", cat: "Antibiotics", stg: "STG 2023 §5", nhis: true, eml: true, route: "IV/IM",
    indication: "Severe sepsis, meningitis, complicated infections",
    dosing: [
      { wt: "Child", dose: "50–80 mg/kg/day", freq: "OD", days: 5, notes: "Meningitis: up to 100 mg/kg/day. Do not mix with calcium-containing fluids." },
      { wt: "Adult", dose: "1–2 g", freq: "OD", days: 5, notes: "Reconstitute per label; IM dose with lidocaine is painful." },
    ] },

  // ── Antihypertensives ─────────────────────────────────────
  { id: "amlodipine-5", name: "Amlodipine 5mg", cat: "Antihypertensives", stg: "STG 2023 §13", icd11: "BA00", nhis: true, eml: true, route: "Oral",
    indication: "Hypertension",
    dosing: [
      { wt: "Adult", dose: "5 mg", freq: "OD", days: 30, notes: "May titrate to 10 mg OD. Ankle oedema common. Long-term therapy — review monthly." },
    ] },
  { id: "lisinopril-10", name: "Lisinopril 10mg", cat: "Antihypertensives", stg: "STG 2023 §13", icd11: "BA00", nhis: true, eml: true, route: "Oral",
    indication: "Hypertension, heart failure",
    dosing: [
      { wt: "Adult", dose: "10 mg", freq: "OD", days: 30, notes: "Start 5–10 mg. Check renal function & K⁺. CONTRAINDICATED in pregnancy." },
    ] },
  { id: "hydrochlorothiazide-25", name: "Hydrochlorothiazide 25mg", cat: "Antihypertensives", stg: "STG 2023 §13", icd11: "BA00", nhis: true, eml: true, route: "Oral",
    indication: "Hypertension, oedema",
    dosing: [
      { wt: "Adult", dose: "25 mg", freq: "OD (morning)", days: 30, notes: "Monitor electrolytes. May raise glucose/urate." },
    ] },

  // ── Antidiabetics ─────────────────────────────────────────
  { id: "metformin-500", name: "Metformin 500mg", cat: "Antidiabetics", stg: "STG 2023 §14", icd11: "5A11", nhis: true, eml: true, route: "Oral",
    indication: "Type 2 diabetes mellitus",
    dosing: [
      { wt: "Adult", dose: "500 mg", freq: "BD with meals", days: 30, notes: "Titrate weekly to max 2 g/day. Hold before contrast imaging. Avoid in eGFR<30." },
    ] },
  { id: "glibenclamide-5", name: "Glibenclamide 5mg", cat: "Antidiabetics", stg: "STG 2023 §14", icd11: "5A11", nhis: true, eml: true, route: "Oral",
    indication: "Type 2 diabetes mellitus",
    dosing: [
      { wt: "Adult", dose: "5 mg", freq: "OD with breakfast", days: 30, notes: "Hypoglycaemia risk — avoid in elderly/renal impairment. Not in pregnancy." },
    ] },
  { id: "insulin-soluble", name: "Soluble Insulin (regular) 100IU/ml", cat: "Antidiabetics", stg: "STG 2023 §14", icd11: "5A10", nhis: true, eml: true, route: "SC/IV",
    indication: "Type 1 DM, DKA, insulin-requiring T2DM",
    dosing: [
      { wt: "Adult", dose: "Individualised (units)", freq: "per sliding scale / regimen", days: 30, notes: "DKA: IV infusion 0.1 U/kg/h per protocol. Store 2–8°C. Rotate injection sites." },
    ] },

  // ── Respiratory ───────────────────────────────────────────
  { id: "salbutamol-inhaler", name: "Salbutamol inhaler 100mcg", cat: "Respiratory", stg: "STG 2023 §17", icd11: "CA23", nhis: true, eml: true, brand: "Ventolin", route: "Inhaled",
    indication: "Asthma, bronchospasm",
    dosing: [
      { wt: "Adult/Child", dose: "100–200 mcg (1–2 puffs)", freq: "PRN, up to QDS", days: 30, notes: "Use spacer in children. Acute severe: 4–10 puffs via spacer, repeat. Review inhaler technique." },
    ] },
  { id: "prednisolone-5", name: "Prednisolone 5mg", cat: "Respiratory", stg: "STG 2023 §17", nhis: true, eml: true, route: "Oral",
    indication: "Asthma exacerbation, inflammatory conditions",
    dosing: [
      { wt: "Adult", dose: "30–40 mg", freq: "OD (morning)", days: 5, notes: "Short course; no taper needed if <2 weeks. Take with food." },
    ] },

  // ── Anti-Tuberculosis ─────────────────────────────────────
  { id: "rhze-fdc", name: "RHZE FDC (R150/H75/Z400/E275)", cat: "Anti-Tuberculosis", stg: "STG 2023 §9", icd11: "1B10", nhis: true, eml: true, route: "Oral",
    indication: "TB — intensive phase (2 months)",
    dosing: [
      { wt: "30–37 kg", dose: "2 tabs", freq: "OD", days: 56, notes: "NTP-supervised (DOT). Take on empty stomach." },
      { wt: "38–54 kg", dose: "3 tabs", freq: "OD", days: 56, notes: "Warn re: orange urine (rifampicin). Report visual changes (ethambutol)." },
      { wt: "55–70 kg", dose: "4 tabs", freq: "OD", days: 56, notes: "Check baseline LFTs; monitor for hepatotoxicity." },
    ] },

  // ── Maternal & Reproductive Health ────────────────────────
  { id: "oxytocin-inj", name: "Oxytocin injection 10IU", cat: "Maternal & Reproductive Health", stg: "STG 2023 §21", icd11: "JA84", nhis: true, eml: true, route: "IM/IV",
    indication: "Active management 3rd stage, PPH prevention/treatment",
    dosing: [
      { wt: "Postpartum", dose: "10 IU", freq: "IM stat after delivery", days: 1, notes: "PPH: 20–40 IU in 500ml IV infusion. Store 2–8°C (cold chain)." },
    ] },
  { id: "misoprostol-200", name: "Misoprostol 200mcg", cat: "Maternal & Reproductive Health", stg: "STG 2023 §21", icd11: "JA84", nhis: true, eml: true, route: "Oral/SL/PR",
    indication: "PPH (where oxytocin unavailable), incomplete abortion",
    dosing: [
      { wt: "PPH", dose: "600–800 mcg", freq: "single dose", days: 1, notes: "Do NOT give before delivery for PPH prophylaxis if oxytocin available." },
    ] },
  { id: "ferrous-folic", name: "Ferrous + Folic Acid (200mg/0.4mg)", cat: "Maternal & Reproductive Health", stg: "STG 2023 §21", icd11: "3A00", nhis: true, eml: true, route: "Oral",
    indication: "Iron-deficiency anaemia, antenatal supplementation",
    dosing: [
      { wt: "Pregnancy", dose: "1 tab", freq: "OD", days: 30, notes: "Routine ANC supplement. Take with vitamin-C source; separate from tea/antacids." },
    ] },

  // ── Gastrointestinal ──────────────────────────────────────
  { id: "ors-zinc", name: "ORS + Zinc (co-pack)", cat: "Gastrointestinal", stg: "STG 2023 §7", icd11: "1A40", nhis: true, eml: true, route: "Oral",
    indication: "Acute diarrhoea (esp. children)",
    dosing: [
      { wt: "Child <6 mo", dose: "ORS after each stool + Zinc 10 mg", freq: "Zinc OD", days: 14, notes: "Zinc 10 mg (<6mo) / 20 mg (≥6mo) OD × 10–14 days. Continue feeding." },
      { wt: "Child ≥6 mo", dose: "ORS after each stool + Zinc 20 mg", freq: "Zinc OD", days: 14, notes: "Reassess if blood in stool, persistent vomiting, or signs of severe dehydration." },
    ] },
  { id: "omeprazole-20", name: "Omeprazole 20mg", cat: "Gastrointestinal", stg: "STG 2023 §7", icd11: "DA60", nhis: true, eml: true, route: "Oral",
    indication: "Peptic ulcer disease, GORD",
    dosing: [
      { wt: "Adult", dose: "20 mg", freq: "OD before breakfast", days: 14, notes: "H. pylori: combine with 2 antibiotics × 14 days per STG." },
    ] },

  // ── Anthelmintics ─────────────────────────────────────────
  { id: "albendazole-400", name: "Albendazole 400mg", cat: "Anthelmintics", stg: "STG 2023 §8", nhis: true, eml: true, route: "Oral",
    indication: "Soil-transmitted helminths (deworming)",
    dosing: [
      { wt: "Child ≥2 y / Adult", dose: "400 mg", freq: "single dose", days: 1, notes: "Community deworming: repeat 6-monthly. Avoid 1st-trimester pregnancy." },
    ] },

  // ── Antiretrovirals ───────────────────────────────────────
  { id: "tld-fdc", name: "TLD FDC (TDF300/3TC300/DTG50)", cat: "Antiretrovirals", stg: "STG 2023 §10", icd11: "1C62", nhis: true, eml: true, route: "Oral",
    indication: "HIV — first-line ART (adult)",
    dosing: [
      { wt: "Adult ≥30 kg", dose: "1 tab", freq: "OD", days: 30, notes: "Lifelong therapy. Counsel adherence. Monitor per NACP guidelines; check renal function (TDF)." },
    ] },
];

export const FORMULARY_META = {
  source: "Ghana Standard Treatment Guidelines 2023 (7th ed.) — starter reference set",
  validationRequired: true,
  note: "Validate dosing and NHIS coverage against the official Ghana STG 2023 and current NHIA Medicines List before clinical use.",
};
