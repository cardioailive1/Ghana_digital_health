# OpenHIE Stack — Bring-Up Guide (Layer 3)

Stands up the OpenHIE services Cardio AI connects to: **OpenHIM** (routing), **HAPI FHIR** (SHR), **SanteMPI** (Client Registry / MPI), **DHIS2** (HMIS), and optionally **GOFR** (Facility Registry).

> **Where this runs:** a Docker host — a cloud VM (e.g. 4 vCPU / 16 GB RAM / 60 GB disk) or Kubernetes. **Not Render.** Cardio AI stays on Render and connects *out* to this host over HTTPS.
>
> **Honest status:** these compose files are validated for structure and pinned to the official images, but must be brought up on a real Docker host — that step can't be run from the app repo. Verify each image tag on Docker Hub for your target versions, and always change default passwords.

## Prerequisites
- Docker Engine + Compose v2 on a host with ≥ 16 GB RAM.
- A domain + TLS reverse proxy (Caddy/Nginx/Traefik) in front — the compose exposes plain ports for bring-up; **do not expose them raw to the internet.**

## 1. Configure
```bash
cd openhie-stack
cp .env.example .env
# edit .env: set HAPI_DB_PASSWORD, DHIS2_DB_PASSWORD, confirm image tags
# edit config/dhis.conf: set the same DHIS2 password + a 24+ char encryption.password
```

## 2. Start the core stack
```bash
docker compose up -d
docker compose ps                 # wait until healthchecks are 'healthy' (DHIS2 takes several minutes on first boot)
```

## 3. Register OpenHIM routing channels
First log in to the console at `http://<host>:9000` (default `root@openhim.org` / `openhim-password`), **change the password**, then put the new one in `.env` and run:
```bash
./scripts/init-openhim.sh
```
This creates a `cardio-ai` client and four channels: `/fhir/*`→SHR, `/CR/*`→SanteMPI, `/FR/*`→GOFR, `/dhis/*`→DHIS2.

## 4. (Optional) Facility Registry
```bash
# Requires GOFR's custom Elasticsearch image (see note in docker-compose.gofr.yml)
docker compose -f docker-compose.yml -f docker-compose.gofr.yml up -d
```

## 5. Health checks
| Service | Check |
|---|---|
| OpenHIM core | `curl -k https://<host>:5001/heartbeat` |
| OpenHIM console | open `http://<host>:9000` |
| HAPI FHIR (SHR) | `curl http://<host>:8081/fhir/metadata` |
| SanteMPI (MPI) | `curl http://<host>:8082/fhir/metadata` |
| DHIS2 | open `http://<host>:8083` (admin/district) |
| GOFR | open `http://<host>:3000` |

## 6. Wire Cardio AI (Render) to the stack
Set these on the Cardio AI **web** and **worker** services. Two options:

**A. Direct** (simplest — point at each service):
```
SHR_BASE_URL   = https://<host>:8081/fhir
MPI_BASE_URL   = https://<host>:8082/fhir
GOFR_BASE_URL  = https://<host>:3000/fhir
DHIS2_BASE_URL = https://<host>:8083
DHIS2_USER / DHIS2_PASS = <dhis2 api user>
ATNA_ARR_URL   = https://<host>:8081/fhir/AuditEvent
```

**B. Through OpenHIM** (recommended for production — every transaction routed + audited by the IOL):
```
SHR_BASE_URL   = https://<host>:5000/fhir
MPI_BASE_URL   = https://<host>:5000/CR/fhir
GOFR_BASE_URL  = https://<host>:5000/FR/fhir
DHIS2_BASE_URL = https://<host>:5000/dhis
```
(OpenHIM authenticates the `cardio-ai` client via mutual TLS or basic auth — configure in the console.)

Once set, Cardio AI's SHR push, MPI match, GOFR sync, ADX→DHIS2, and ATNA forwarding **activate automatically** (they no-op only while the URLs are unset).

## 7. Smoke test end-to-end
```bash
# From Cardio AI: finalize an encounter -> should land in the SHR
curl http://<host>:8081/fhir/DocumentReference        # see the registered document
curl http://<host>:8081/fhir/Patient                  # see pushed patients
```

---

## Production hardening (before real PHI)
1. **TLS everywhere** — terminate at the reverse proxy; enable OpenHIM `NODE_ENV=production` with real certs; MLLP over TLS.
2. **Change every default password** (OpenHIM, DHIS2 admin, DB users) and set DHIS2 `encryption.password`.
3. **Mutual-TLS clients** in OpenHIM for Cardio AI (not basic auth).
4. **Back up** the Postgres volumes (hapi, dhis2) and Mongo (openhim) — automated snapshots.
5. **Resource limits + monitoring** — DHIS2 and HAPI are memory-hungry; set container limits and alerts.
6. **Pin exact image tags** and test upgrades in staging.

## Alternative: Instant OpenHIE v2
For a community-supported, pre-wired deployment (OpenHIM channels + HAPI + CR + HMIS packages), consider **`openhie/instant-v2`** (github.com/openhie/instant-v2). It packages these same components with Swarm/Compose and config importers. Trade-off: less bespoke control than this compose, but battle-tested defaults. Either path targets the same URLs in step 6.
