// DHIS2 pre-flight: verify the IDSR mapping resolves against the live instance
// and preview EWARN baselines. Run BEFORE relying on ADX in production.
//   DHIS2_BASE_URL=... DHIS2_USER=... DHIS2_PASS=... IDSR_MAPPING_FILE=... \
//     node server/scripts/dhis2-preflight.mjs
import { loadIdsrMapping, resolveDataElementUids, loadBaselines } from "../adx/dhis2.js";

if (!process.env.DHIS2_BASE_URL) { console.error("Set DHIS2_BASE_URL (and auth) first."); process.exit(1); }
const mapping = loadIdsrMapping();
const codes = [...new Set(Object.values(mapping).map((m) => m.code).filter(Boolean))];
console.log(`Resolving ${codes.length} dataElement codes against ${process.env.DHIS2_BASE_URL} ...`);
const codeToUid = await resolveDataElementUids(codes);

let ok = 0, missing = [];
for (const [icd, m] of Object.entries(mapping)) {
  const uid = m.uid || codeToUid[m.code];
  if (uid) { ok++; console.log(`  ✓ ${icd}  ${m.code} -> ${uid}`); }
  else { missing.push(`${icd} (${m.code})`); console.log(`  ✗ ${icd}  ${m.code} -> NOT FOUND`); }
}
console.log(`\nResolved ${ok}/${Object.keys(mapping).length}.`);
if (missing.length) console.log("Missing (create these dataElements or fix codes):\n  " + missing.join("\n  "));

const uids = Object.values(mapping).map((m) => m.uid || codeToUid[m.code]).filter(Boolean);
if (uids.length) {
  const base = await loadBaselines(uids, {});
  console.log("\nEWARN baseline sample (mean±SD over " + (process.env.EWARN_BASELINE_PERIOD || "LAST_52_WEEKS") + "):");
  for (const uid of uids) {
    const s = base[uid]; if (!s || !s.length) { console.log(`  ${uid}: no history`); continue; }
    const mean = s.reduce((a,b)=>a+b,0)/s.length;
    const sd = Math.sqrt(s.reduce((a,b)=>a+(b-mean)**2,0)/s.length);
    console.log(`  ${uid}: mean ${mean.toFixed(1)}, SD ${sd.toFixed(1)}, n=${s.length}, EWARN threshold ${(mean+2*sd).toFixed(1)}`);
  }
}
