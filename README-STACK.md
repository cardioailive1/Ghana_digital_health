# Cardio AI Ghana — Integration Tech Stack Status

**Purpose:** single source of truth for what is **built**, what is **wired but needs an external endpoint**, what is **infrastructure to stand up**, and what is **not built yet**. Update this as items move.

**Legend**
- ✅ **Done** — implemented in this repo and tested
- 🔌 **Client ready** — code implemented; needs the external service URL/creds to go live
- 🏗️ **Deploy** — external service to stand up (ops, not app code)
- ❌ **Not built** — needs to be built
- ⚠️ **Partial** — some of it is done; see note

Live: https://cardio-ai-ghana.onrender.com · Repo: github.com/cardioailive1/Ghana_digital_health
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

## Project Structure

Two runtimes share the repo: a small **React SPA** (`src/`, the login/auth shell) and the
full clinical platform, which is the single-file app **`public/platform.html`** (EHR, Lab,
Pharmacy, NHIS, IoMT, CHPS, etc. built in vanilla JS). The **`server/`** backend is an
Express (ESM) API organised by domain. **`openhie-stack/`** is separate infrastructure
(Docker) the app connects *out* to — it does not run on Render.

```
Ghana_digital_health/
│
├── index.html                     # Vite entry (React SPA shell)
├── vite.config.js                 # Vite build config
├── package.json                   # Dependencies + scripts
├── render.yaml                    # Render deploy: web + worker + hl7-mllp services
├── .env.example                   # Environment variable template
├── README.md                      # Deploy + security + project structure
├── README-STACK.md                # THIS FILE — integration status tracker
│
├── prisma/
│   ├── schema.prisma              # 21 models (7 original + 14 clinical/CHPS)
│   └── migrations/
│       ├── 20260101000000_init/
│       ├── 20260102000000_user_approval/
│       └── 20260103000000_clinical_models/   # 14 tables: FHIR / CHPS / alerts / compounds
│
├── public/                        # Static web root (served at /)
│   ├── platform.html              # The entire platform UI (single-file app, ~1.1 MB)
│   ├── cardio-ai-logo.png         # Cardio AI brand logo
│   ├── corverxis_logo.jpg         # Corverxis parent-company logo
│   └── favicon.svg
│
├── src/                           # React SPA (login shell, auth context)
│   ├── App.jsx, main.jsx
│   ├── components/  (Login.jsx, RBAC.jsx)
│   ├── context/     (AuthContext.jsx, RBACContext.jsx)
│   └── hooks/       (useApi, useAudit, useChat, useSessionTimer)
│
├── middleware/                    # auditMiddleware, phiGuard, validateRequest
│
├── server/                        # Express backend (ESM)
│   ├── index.js                   # App entry — mounts all routes + middleware
│   ├── worker.js                  # Background jobs: ADX (2-min) + SLA (30-sec)
│   ├── hl7-service.js             # Standalone HL7 v2 MLLP listener (port 2575)
│   ├── auth.js, db.js, logger.js, rbac.js, security.js, seed.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js         # /auth/* — login, OAuth, register
│   │   ├── ai.routes.js           # /api/chat — clinical AI assistant
│   │   ├── platform.routes.js     # EHR/Lab/Pharmacy/NHIS/CHPS (+ formulary, lab orders, compounds)
│   │   ├── fhir.routes.js         # FHIR R4 facade (all resources + operations)
│   │   ├── ops.routes.js          # IoMT alerts + ADX/GOFR manual triggers
│   │   └── chps.routes.js         # CHPS offline sync + conflict resolution
│   │
│   ├── fhir/                      # FHIR R4 interoperability layer
│   │   ├── mappers.js             # GHIMS <-> FHIR (Patient, Encounter, Claim, ...)
│   │   ├── scoring.js             # NEWS2 + critical-value detection
│   │   ├── nhia.js                # Claim validation + live NHIA submission
│   │   ├── autocode.js            # ICD-11 auto-assignment (AI + STG fallback)
│   │   ├── integrations.js        # SHR push / MPI match / XDS document query
│   │   ├── capability.js          # CapabilityStatement (/fhir/r4/metadata)
│   │   └── __tests__/verify-bridge.mjs   # 30-check verification harness
│   │
│   ├── hl7/                       # HL7 v2 (ADT/ORU)
│   │   ├── handlers.js            # Parse + apply + ACK/NAK + critical hook
│   │   ├── mllp.js                # MLLP framing over TCP/TLS
│   │   └── outbound.js            # Outbound ORU / NTCP notify
│   │
│   ├── adx/dhis2.js               # FHIR -> DHIS2 IDSR + UID resolution + EWARN
│   ├── gofr/gofr.js               # GOFR facility registry client
│   ├── atna/atna.js               # IHE ATNA audit (FHIR AuditEvent / TLS syslog)
│   ├── escalation/sla.js          # IoMT 5-minute SLA escalation ladder
│   ├── chps/
│   │   ├── sync.js                # Offline-sync engine + conflict resolution
│   │   └── offline-client.js      # Device-side 2G / 48h buffer (reference)
│   │
│   ├── data/formulary.js          # Ghana STG 2023 medicines (pharmacy dropdown)
│   ├── config/idsr-mapping.example.json   # ICD-11 -> DHIS2 dataElement mapping
│   └── scripts/dhis2-preflight.mjs        # Verify DHIS2 mapping / baselines
│
└── openhie-stack/                 # Layer-3 infrastructure (runs on a VM, not Render)
    ├── docker-compose.yml         # OpenHIM + HAPI FHIR + SanteMPI + DHIS2
    ├── docker-compose.gofr.yml    # GOFR add-on
    ├── config/                    # hapi, dhis, openhim channels + console
    ├── scripts/init-openhim.sh    # Registers OpenHIM routing channels
    ├── .env.example
    └── README.md                  # Bring-up guide + Cardio AI env wiring
```

### Data model — 21 Prisma models

- **Original (7):** Facility, User, Session, AuditLog, ChatLog, NhisClaim, IoMTAlert
- **Clinical / interop (14):** Patient, Encounter, Observation, Condition, Referral, Claim, Alert, MedicationRequest, DiagnosticReport, Immunization, AllergyIntolerance, SyncConflict, SyncCursor, Compound

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
| NHIS claims automation | ✅ 🔌 | validation/R-codes ✅; live submit ✅ (needs `NHIA_API_URL`); ICD-11 autocode ✅ |
| DHIS2 real-time IDSR (ADX) | ✅ 🔌 | `server/adx/dhis2.js` + worker (2-min); needs `DHIS2_BASE_URL` |
| Offline-first CHPS (2G, 48h buffer) | ✅ 🔌 | `server/chps/sync.js` (conflict resolution) + `offline-client.js` reference buffer; device app embeds the client |

## Layer 3 — OpenHIE (Standards Bridge)

| Component | Status | Where / Note |
|---|---|---|
| OpenHIM v8.4 (routes all transactions) | 🏗️ | Deploy; our endpoints sit behind it or route direct |
| SanteMPI v3.3 (Master Patient Index) | 🔌 🏗️ | `matchPatientMpi()` ✅; deploy + set `MPI_BASE_URL` |
| HAPI FHIR v6.8 (Shared Health Record) | 🔌 🏗️ | push/query/retrieve ✅; deploy + set `SHR_BASE_URL` |
| GOFR v2.1 (facility registry) | ✅ 🔌 🏗️ | `server/gofr/gofr.js` (resolve/sync/Organization) ✅; deploy + `GOFR_BASE_URL` |
| ADX 2.0 (FHIR → DHIS2 every 2 min) | ✅ 🔌 | `server/adx/dhis2.js`: real UID resolution (code→UID from instance) + analytics EWARN baselines; needs DHIS2 |
| ATNA audit (DPA 2012) | ✅ 🔌 | local DB audit ✅ + IHE ATNA (FHIR AuditEvent / TLS syslog) ✅; needs `ATNA_ARR_URL` or `ATNA_SYSLOG_HOST` |

---

## Bringing up the OpenHIE stack (Layer 3)

The Layer-3 services live in **`openhie-stack/`** and run on a **Docker host — a cloud VM or on-prem server, NOT Render.** Cardio AI (on Render) connects *out* to this host over HTTPS. Full guide + production hardening: `openhie-stack/README.md`.

**Host requirements:** ≥ 16 GB RAM, 4 vCPU, ~60 GB disk, Docker Engine + Compose v2.

**Services & host ports (from `docker-compose.yml`):**

| Service | Role | Host port |
|---|---|---|
| `openhim-core` / `openhim-console` | Interop layer (routing) + admin UI | `5000`/`5001`, `9000` |
| `hapi-fhir` (+ postgres) | Shared Health Record (SHR) | `8081` |
| `santempi` | Client Registry / MPI | `8082`, `2100` |
| `dhis2-core` (+ postgis) | HMIS / aggregate target | `8083` |
| `gofr` (add-on: + es + redis) | Facility Registry | `3000` |

**Steps:**

```bash
cd openhie-stack
# 1. Configure
cp .env.example .env                     # set HAPI_DB_PASSWORD + DHIS2_DB_PASSWORD (replace CHANGE_ME_*)
#                                          also edit config/dhis.conf: same DHIS2 pw + 24+ char encryption.password
# 2. Start the core stack
docker compose up -d
docker compose ps                        # wait for "healthy" — DHIS2 takes several minutes on first boot
# 3. Register OpenHIM routing channels
#    first log in at http://<host>:9000 (root@openhim.org / openhim-password), CHANGE the password,
#    put it in .env, then:
./scripts/init-openhim.sh                # creates the cardio-ai client + /fhir /CR /FR /dhis channels
# 4. (optional) Facility Registry — needs GOFR's custom Elasticsearch image
docker compose -f docker-compose.yml -f docker-compose.gofr.yml up -d
```

**Verify:**

| Service | Check |
|---|---|
| OpenHIM core | `curl -k https://<host>:5001/heartbeat` |
| HAPI FHIR (SHR) | `curl http://<host>:8081/fhir/metadata` |
| SanteMPI (MPI) | `curl http://<host>:8082/fhir/metadata` |
| DHIS2 | open `http://<host>:8083` (default `admin` / `district`) |
| OpenHIM console | open `http://<host>:9000` |

**Then wire Cardio AI (Render env):** `SHR_BASE_URL=https://<host>:8081/fhir`, `MPI_BASE_URL=https://<host>:8082/fhir`, `DHIS2_BASE_URL=https://<host>:8083`, `GOFR_BASE_URL=https://<host>:3000/fhir` — or the OpenHIM channel URLs (`https://<host>:5000/fhir`, `/CR`, `/FR`, `/dhis`) for production. Features activate automatically once set (see env table above).

**Caveats (honest):** the compose is validated for structure and pinned to official images, but the first `docker compose up` on your host is where it's truly tested — watch that boot. Verify image tags on Docker Hub (esp. `DHIS2_TAG`). GOFR's Elasticsearch needs the IntraHealth similarity plugin (stock ES won't work). Defaults are insecure for bring-up — change all passwords, add a TLS reverse proxy, set OpenHIM `NODE_ENV=production` with real certs, and back up volumes before real PHI. Alternative: **Instant OpenHIE v2** (`openhie/instant-v2`) packages the same components.

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

**FHIR resource coverage:** Patient, Encounter, Observation, Condition, ServiceRequest, Claim, DocumentReference, MedicationRequest, DiagnosticReport, Immunization, **AllergyIntolerance** ✅ — resource set complete. Remaining: legacy **SOAP/ebXML XDS.b** adapter only (FHIR MHD equivalent is done).

---

## Services / processes

| Process | File | Render service | Notes |
|---|---|---|---|
| Web API + platform + FHIR facade | `server/index.js` | `cardio-ai-ghana` (web) | HTTP |
| HL7 v2 MLLP listener | `server/hl7-service.js` | `cardio-ai-hl7-mllp` (pserv) | raw TCP :2575; needs TLS for PHI |
| Background scheduler (ADX + SLA) | `server/worker.js` | `cardio-ai-worker` (worker) | ADX 2-min, SLA 30-sec |
| PostgreSQL | — | `cardio-ai-postgres` | managed |

## Environment variables (set in Render dashboard, per service)

**Where set:** Render Dashboard → service → **Environment** (never commit real values; `.env.example` is a template only, `.env` is git-ignored). **Where the value comes from** is in the last column. All interoperability vars are **optional** — the code no-ops safely when they're unset, so login and the platform work without any of them.

### Base / core (required for the app to run)

| Var | Used by | Where the value comes from |
|---|---|---|
| `NODE_ENV=production`, `PORT` | web | Fixed values you set |
| `DATABASE_URL` | web/worker | Auto-injected by Render (`fromDatabase`) from `cardio-ai-postgres`; manually = Postgres service → **Internal Database URL** |
| `JWT_SECRET`, `SESSION_SECRET` | web | Auto-generated by Render (`generateValue: true`); locally `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | web | console.anthropic.com → **API Keys** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | web | Google Cloud Console → APIs & Services → **Credentials** → OAuth 2.0 Client |
| `MICROSOFT_CLIENT_ID` / `SECRET` / `TENANT_ID` | web | Azure Portal → **App Registrations** (secret under Certificates & secrets; tenant on Overview or `common`) |
| `CLIENT_URL`, `ALLOWED_ORIGINS` | web | Your live domain(s), comma-separated — e.g. `https://digitalhealthgh.com,https://www.digitalhealthgh.com` (this is the CORS allowlist) |

### Interoperability (optional — only when the OpenHIE stack is deployed)

> These tokens/URLs **come from the OpenHIE services you stand up** in `openhie-stack/`, not from an outside vendor. You generate them when you deploy those services. Only `SMS_API_*` comes from a third-party (an SMS gateway).

| Var | Used by | Where the value comes from |
|---|---|---|
| `SHR_BASE_URL` | web | Your HAPI FHIR URL, e.g. `https://<host>:8081/fhir` |
| `SHR_TOKEN` | web | Bearer token you mint in HAPI/OpenHIM (optional; auth often at OpenHIM layer) |
| `MPI_BASE_URL` | web | Your SanteMPI URL, e.g. `https://<host>:8082/fhir` |
| `MPI_TOKEN` | web | SanteMPI → OIDC/AMI client credential you issue |
| `GOFR_BASE_URL` / `GOFR_TOKEN` | web/worker | Your GOFR URL + token from GOFR user settings |
| `DHIS2_BASE_URL` | worker | Your DHIS2 URL, e.g. `https://<host>:8083` |
| `DHIS2_USER` / `DHIS2_PASS` **or** `DHIS2_TOKEN` | worker | A DHIS2 **API user** (Users app), or a **Personal Access Token** from that user's profile |
| `IDSR_MAPPING_FILE`, `EWARN_BASELINE_PERIOD` | worker | Path to your filled `idsr-mapping.json` (from the `.example`); period e.g. `LAST_52_WEEKS` |
| `ATNA_ARR_URL` and/or `ATNA_SYSLOG_HOST`/`PORT` | web | Your audit repository endpoint (OpenHIM ATNA, or HAPI `/AuditEvent`) |
| `SMS_API_URL` / `SMS_API_KEY` | worker | **SMS gateway account** (e.g. Hubtel / Ghana aggregator / Twilio) — key from its dashboard |
| `ESCALATION_CONTACTS` (JSON) | worker | You write it: `{"Super User":"+233…","Ward Matron":"+233…","Medical Officer (on-call)":"+233…"}` |
| `HL7_MLLP_PORT`, `HL7_TLS_KEY`, `HL7_TLS_CERT` | hl7-mllp | Port you choose (default 2575) + TLS cert/key you generate (Let's Encrypt / your CA) |

*All external clients no-op safely when their vars are unset — nothing errors; features are simply inactive.*

### Setup checklist — generating the interoperability values

Do this **after** bringing up `openhie-stack` (see `openhie-stack/README.md`). Its own `.env` holds the admin passwords for OpenHIM/HAPI/SanteMPI/DHIS2 that *you* choose.

1. **DHIS2 token** — DHIS2 (`:8083`) → **Users** app → create an API user with import rights → that user → **Profile → Personal Access Tokens** → generate → set `DHIS2_TOKEN` (or use `DHIS2_USER`/`DHIS2_PASS`).
2. **IDSR mapping** — copy `server/config/idsr-mapping.example.json` → `idsr-mapping.json`, fill each `code` (or `uid`) to match your DHIS2 dataElements, point `IDSR_MAPPING_FILE` at it, then run `node server/scripts/dhis2-preflight.mjs` to confirm every code resolves.
3. **SHR / MPI / GOFR URLs** — take the service URLs from your host (`:8081` HAPI, `:8082` SanteMPI, `:3000`/`/fhir` GOFR). If routing through OpenHIM, use the `:5000/fhir`, `/CR`, `/FR` channel URLs from `init-openhim.sh` instead.
4. **OpenHIM client credential** — OpenHIM console (`:9000`) → Clients → the `cardio-ai` client created by `init-openhim.sh` → set its password/mutual-TLS → use as `SHR_TOKEN` etc.
5. **ATNA** — point `ATNA_ARR_URL` at OpenHIM's audit endpoint or HAPI `/fhir/AuditEvent`; for classic ATNA set `ATNA_SYSLOG_HOST`/`PORT` (6514).
6. **SMS gateway** — sign up with your SMS provider, copy its API URL + key into `SMS_API_URL`/`SMS_API_KEY`, and write `ESCALATION_CONTACTS`.
7. **HL7 TLS** — generate a cert/key for the MLLP host and set `HL7_TLS_KEY`/`HL7_TLS_CERT` before any real PHI flows over MLLP.

---

## Next / not done (tracked backlog)

1. **#6 Stand up external services (CRITICAL for client)** — ✅ **deploy artifacts built**: `openhie-stack/` has docker-compose for OpenHIM v8, HAPI FHIR v6.8 (SHR), SanteMPI (CR/MPI), DHIS2, and a GOFR add-on, plus OpenHIM channel registration and a bring-up guide. **Remaining:** run it on a Docker host (VM/k8s), change defaults, add TLS, set the Cardio AI env URLs (§6 of `openhie-stack/README.md`). *Ops — can't be executed from the app repo.*
2. ~~**Offline-first CHPS sync**~~ — ✅ server engine + reference client built (`server/chps/`). Remaining: embed `offline-client.js` in the CHPS device app + a conflict-review UI.
3. ~~**Live NHIA claims submission**~~ — ✅ `submitClaimToNhia` + `Claim/{id}/$submit`. Needs `NHIA_API_URL` + the real NHIA response schema mapping.
4. ~~**ICD-11 auto-assignment**~~ — ✅ `autocode.js` + `Encounter/{id}/$autocode`. Wire the platform's Claude call into `app.locals.aiComplete` (falls back to STG map).
5. **Legacy SOAP/ebXML XDS.b adapter** — only needed if a partner exchange can't speak FHIR MHD.
6. ~~**Additional FHIR resources**~~ — ✅ MedicationRequest/DiagnosticReport/Immunization/AllergyIntolerance all done. FHIR resource set complete.
7. ~~**Real DHIS2 dataElement UIDs + baselines**~~ — ✅ UIDs resolved live from the instance (never hardcoded); EWARN baselines pulled from `/api/analytics`. Client fills `config/idsr-mapping.json` and runs `node server/scripts/dhis2-preflight.mjs` to verify.

## Deploy order

1. Deploy web + run migration `20260103000000_clinical_models` (creates patients/encounters/observations/conditions/referrals/claims/alerts + facility columns). **Watch this migration.**
2. Verify `GET /fhir/r4/metadata`.
3. Add worker + hl7-mllp services.
4. Stand up Layer-3 services (#6); set env URLs; features activate automatically.
