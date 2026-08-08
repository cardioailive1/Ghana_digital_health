# Cardio AI Ghana — Integration Tech Stack Status

**Purpose:** single source of truth for what is **built**, what is **wired but needs an external endpoint**, what is **infrastructure to stand up**, and what is **not built yet**. Update this as items move.

**Legend**
- ✅ **Done** — implemented in this repo and tested
- 🔌 **Client ready** — code implemented; needs the external service URL/creds to go live
- 🏗️ **Deploy** — external service to stand up (ops, not app code)
- ❌ **Not built** — needs to be built
- ⚠️ **Partial** — some of it is done; see note

Live: https://cardio-ai-ghana.onrender.com · Repo: github.com/cardioailive1/Ghana_digital_health

---

## Layer 1 — GHIMS (Sovereign Backbone) — *external state system we integrate with*

| Capability | Status | Where / Note |
|---|---|---|
| State-owned patient records | 🔌 | FHIR `Patient` read/write facade; GHIMS is system of record |
| Cross-facility registration (nationwide) | 🔌 | via SanteMPI client (identifier match) — needs MPI live |
| NHIA database linkage & billing | 🔌 ⚠️ | `Claim` + tariff/deadline/R-code validation ✅; live NHIA submission API ❌ |
| Referral tracking | ✅ | `ServiceRequest` + `Referral` table + cross-facility discovery |
| Administrative continuity | 🏗️ | GHIMS/MoH responsibility |
| MoH governance & oversight | 🏗️ | Fed by our audit trail |

## Layer 2 — Cardio AI (Clinical Intelligence) — *our product*

| Capability | Status | Where / Note |
|---|---|---|
| AI clinical decision support (STG 2023) | ✅ | Clinical Assistant in platform (pre-existing) |
| IoMT monitoring — NEWS2 | ✅ | `server/fhir/scoring.js` (verified) |
| IoMT — 5-minute SLA escalation | ✅ 🔌 | `server/escalation/sla.js` + worker; SMS gateway needs `SMS_API_URL` |
| **HL7 FHIR R4 interoperability layer** | ✅ | `server/fhir/*`, `server/hl7/*` — 30/30 + 14/14 tests |
| NHIS claims automation | ⚠️ | validation/R-codes ✅; ICD-11 auto-coding = AI's job; live submit ❌ |
| DHIS2 real-time IDSR (ADX) | ✅ 🔌 | `server/adx/dhis2.js` + worker (2-min); needs `DHIS2_BASE_URL` |
| Offline-first CHPS (2G, 48h buffer) | ❌ | Not built — larger client-side effort |

## Layer 3 — OpenHIE (Standards Bridge)

| Component | Status | Where / Note |
|---|---|---|
| OpenHIM v8.4 (routes all transactions) | 🏗️ | Deploy; our endpoints sit behind it or route direct |
| SanteMPI v3.3 (Master Patient Index) | 🔌 🏗️ | `matchPatientMpi()` ✅; deploy + set `MPI_BASE_URL` |
| HAPI FHIR v6.8 (Shared Health Record) | 🔌 🏗️ | push/query/retrieve ✅; deploy + set `SHR_BASE_URL` |
| GOFR v2.1 (facility registry) | ✅ 🔌 🏗️ | `server/gofr/gofr.js` (resolve/sync/Organization) ✅; deploy + `GOFR_BASE_URL` |
| ADX 2.0 (FHIR → DHIS2 every 2 min) | ✅ 🔌 | `server/adx/dhis2.js` + worker; needs DHIS2 |
| ATNA audit (DPA 2012) | ✅ 🔌 | local DB audit ✅ + IHE ATNA (FHIR AuditEvent / TLS syslog) ✅; needs `ATNA_ARR_URL` or `ATNA_SYSLOG_HOST` |

---

## FHIR R4 bridge — verified resource coverage (`node server/fhir/__tests__/verify-bridge.mjs`)

| GHIMS → FHIR mapping | Status |
|---|---|
| Patient Record → `Patient` (Ghana Card + NHIS ids, SanteMPI match) | ✅ |
| Clinical Encounter → `Encounter` + SOAP `Composition` + ICD-11 `Condition` + Bundle→SHR | ✅ |
| Billing/NHIA → `Claim` + tariff/30-day/R-code | ✅ |
| Lab Result → `Observation` (LOINC) + critical escalation | ✅ |
| Referral → `ServiceRequest` + IPS + cross-facility `DocumentReference` | ✅ |
| IoMT Vitals → `Observation` (LOINC 8867-4/59408-5) + NEWS2 | ✅ |

**Not yet built on the FHIR side:** `MedicationRequest`, `DiagnosticReport`, `Immunization`, `AllergyIntolerance` mappers; legacy **SOAP/ebXML XDS.b** adapter (FHIR MHD equivalent is done).

---

## Services / processes

| Process | File | Render service | Notes |
|---|---|---|---|
| Web API + platform + FHIR facade | `server/index.js` | `cardio-ai-ghana` (web) | HTTP |
| HL7 v2 MLLP listener | `server/hl7-service.js` | `cardio-ai-hl7-mllp` (pserv) | raw TCP :2575; needs TLS for PHI |
| Background scheduler (ADX + SLA) | `server/worker.js` | `cardio-ai-worker` (worker) | ADX 2-min, SLA 30-sec |
| PostgreSQL | — | `cardio-ai-postgres` | managed |

## Environment variables (set in Render dashboard, per service)

| Var | Used by | Purpose |
|---|---|---|
| `SHR_BASE_URL`, `SHR_TOKEN` | web | HAPI FHIR SHR push/query/retrieve |
| `MPI_BASE_URL`, `MPI_TOKEN` | web | SanteMPI patient matching |
| `GOFR_BASE_URL`, `GOFR_TOKEN` | web/worker | GOFR facility registry |
| `DHIS2_BASE_URL`, `DHIS2_USER`/`DHIS2_PASS` or `DHIS2_TOKEN` | worker | ADX dataValueSets push |
| `ATNA_ARR_URL` and/or `ATNA_SYSLOG_HOST`/`ATNA_SYSLOG_PORT` | web | IHE ATNA audit repository |
| `SMS_API_URL`, `SMS_API_KEY`, `ESCALATION_CONTACTS` (JSON) | worker | SLA SMS dispatch |
| `HL7_MLLP_PORT`, `HL7_TLS_KEY`, `HL7_TLS_CERT` | hl7-mllp | MLLP listener + TLS |

*All external clients no-op safely when their vars are unset — nothing errors; features are simply inactive.*

---

## Next / not done (tracked backlog)

1. **#6 Stand up external services (CRITICAL for client)** — Docker/deploy OpenHIM v8.4, SanteMPI v3.3, HAPI FHIR v6.8, GOFR v2.1, DHIS2; wire URLs above. *Ops, not app code.*
2. **Offline-first CHPS sync** — 2G, 48h buffer, conflict resolution. *Not built.*
3. **Live NHIA claims submission API** — currently validate-only.
4. **ICD-11 auto-assignment** — AI produces the code; bridge stores it. Wire the AI output into `Condition.code`.
5. **Legacy SOAP/ebXML XDS.b adapter** — only needed if a partner exchange can't speak FHIR MHD.
6. **Additional FHIR resources** — MedicationRequest, DiagnosticReport, Immunization, AllergyIntolerance.
7. **Real DHIS2 dataElement UIDs + baselines** — replace placeholder IDs in `IDSR_MAP`; load EWARN baselines.

## Deploy order

1. Deploy web + run migration `20260103000000_clinical_models` (creates patients/encounters/observations/conditions/referrals/claims/alerts + facility columns). **Watch this migration.**
2. Verify `GET /fhir/r4/metadata`.
3. Add worker + hl7-mllp services.
4. Stand up Layer-3 services (#6); set env URLs; features activate automatically.
