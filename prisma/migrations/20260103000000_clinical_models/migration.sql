-- Clinical models for the FHIR R4 / HL7 v2 bridge.

CREATE TABLE "patients" (
  "id" TEXT NOT NULL,
  "mrn" TEXT,
  "ghanaCard" TEXT,
  "nhis" TEXT,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "sex" TEXT,
  "dob" TIMESTAMP(3),
  "phone" TEXT,
  "region" TEXT,
  "district" TEXT,
  "facilityId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patients_mrn_key" ON "patients"("mrn");
CREATE UNIQUE INDEX "patients_ghanaCard_key" ON "patients"("ghanaCard");
CREATE INDEX "patients_nhis_idx" ON "patients"("nhis");
CREATE INDEX "patients_ghanaCard_idx" ON "patients"("ghanaCard");
CREATE INDEX "patients_lastName_idx" ON "patients"("lastName");

CREATE TABLE "encounters" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "facilityId" TEXT,
  "class" TEXT NOT NULL DEFAULT 'AMB',
  "status" TEXT NOT NULL DEFAULT 'in-progress',
  "reason" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "encounters_patientId_idx" ON "encounters"("patientId");

CREATE TABLE "observations" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "encounterId" TEXT,
  "code" TEXT NOT NULL,
  "display" TEXT,
  "value" TEXT,
  "unit" TEXT,
  "interpretation" TEXT,
  "status" TEXT NOT NULL DEFAULT 'final',
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "observations_patientId_idx" ON "observations"("patientId");
CREATE INDEX "observations_code_idx" ON "observations"("code");

CREATE TABLE "conditions" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "encounterId" TEXT,
  "code" TEXT NOT NULL,
  "display" TEXT,
  "clinicalStatus" TEXT NOT NULL DEFAULT 'active',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conditions_patientId_idx" ON "conditions"("patientId");

ALTER TABLE "patients" ADD CONSTRAINT "patients_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "observations" ADD CONSTRAINT "observations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "observations" ADD CONSTRAINT "observations_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Referral (FHIR ServiceRequest) and Claim (FHIR Claim) persistence
CREATE TABLE "referrals" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "encounterId" TEXT,
  "fromFacilityId" TEXT,
  "toFacilityId" TEXT,
  "reasonCode" TEXT,
  "reasonDisplay" TEXT,
  "note" TEXT,
  "urgent" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'active',
  "authoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "referrals_patientId_idx" ON "referrals"("patientId");

CREATE TABLE "claims" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "encounterId" TEXT,
  "facilityId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "diagnoses" JSONB,
  "items" JSONB,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "serviceDate" TIMESTAMP(3) NOT NULL,
  "nhisVerified" BOOLEAN NOT NULL DEFAULT false,
  "submittedAt" TIMESTAMP(3),
  "rejectionCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "claims_patientId_idx" ON "claims"("patientId");
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- GOFR facility fields + IoMT alert escalation
ALTER TABLE "facilities" ADD COLUMN "dhis2OrgUnit" TEXT;
ALTER TABLE "facilities" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "facilities" ADD COLUMN "longitude" DOUBLE PRECISION;

CREATE TABLE "alerts" (
  "id" TEXT NOT NULL,
  "patientId" TEXT,
  "observationId" TEXT,
  "facilityId" TEXT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'critical',
  "detail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "escalationLevel" INTEGER NOT NULL DEFAULT 0,
  "acknowledgedById" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "lastEscalatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "alerts_status_idx" ON "alerts"("status");
CREATE INDEX "alerts_patientId_idx" ON "alerts"("patientId");

-- Extra FHIR resources + CHPS offline-sync tracking
CREATE TABLE "medication_requests" (
  "id" TEXT NOT NULL, "patientId" TEXT NOT NULL, "encounterId" TEXT,
  "code" TEXT NOT NULL, "display" TEXT, "dosage" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "authoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "medication_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "medication_requests_patientId_idx" ON "medication_requests"("patientId");

CREATE TABLE "diagnostic_reports" (
  "id" TEXT NOT NULL, "patientId" TEXT NOT NULL, "encounterId" TEXT,
  "code" TEXT NOT NULL, "display" TEXT, "status" TEXT NOT NULL DEFAULT 'final',
  "conclusion" TEXT, "observationIds" JSONB,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "diagnostic_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "diagnostic_reports_patientId_idx" ON "diagnostic_reports"("patientId");

CREATE TABLE "immunizations" (
  "id" TEXT NOT NULL, "patientId" TEXT NOT NULL,
  "vaccineCode" TEXT NOT NULL, "display" TEXT, "status" TEXT NOT NULL DEFAULT 'completed',
  "lotNumber" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "immunizations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "immunizations_patientId_idx" ON "immunizations"("patientId");

CREATE TABLE "sync_conflicts" (
  "id" TEXT NOT NULL, "deviceId" TEXT, "resourceType" TEXT NOT NULL, "resourceId" TEXT,
  "clientPayload" JSONB, "serverPayload" JSONB, "resolution" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "sync_conflicts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sync_conflicts_status_idx" ON "sync_conflicts"("status");

CREATE TABLE "sync_cursors" (
  "deviceId" TEXT NOT NULL, "facilityId" TEXT,
  "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sync_cursors_pkey" PRIMARY KEY ("deviceId")
);

-- AllergyIntolerance
CREATE TABLE "allergy_intolerances" (
  "id" TEXT NOT NULL, "patientId" TEXT NOT NULL,
  "code" TEXT NOT NULL, "display" TEXT, "category" TEXT,
  "criticality" TEXT NOT NULL DEFAULT 'low',
  "clinicalStatus" TEXT NOT NULL DEFAULT 'active',
  "reaction" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "allergy_intolerances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "allergy_intolerances_patientId_idx" ON "allergy_intolerances"("patientId");
