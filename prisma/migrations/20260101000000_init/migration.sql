-- ============================================================
-- Initial Migration — Cardio AI Ghana
-- Run: npx prisma migrate deploy
-- ============================================================

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Facilities
CREATE TABLE "facilities" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "region"    TEXT NOT NULL,
  "type"      TEXT NOT NULL DEFAULT 'teaching',
  "address"   TEXT,
  "phone"     TEXT,
  "nhiaId"    TEXT,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "facilities_code_key" ON "facilities"("code");

-- Users
CREATE TABLE "users" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "email"        TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "passwordHash" TEXT,
  "role"         TEXT NOT NULL DEFAULT 'viewer',
  "facilityId"   TEXT,
  "provider"     TEXT NOT NULL DEFAULT 'local',
  "oauthId"      TEXT,
  "mfaEnabled"   BOOLEAN NOT NULL DEFAULT false,
  "mfaSecret"    TEXT,
  "active"       BOOLEAN NOT NULL DEFAULT true,
  "lastLogin"    TIMESTAMP(3),
  "loginCount"   INTEGER NOT NULL DEFAULT 0,
  "failedLogins" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_facilityId_fkey" FOREIGN KEY ("facilityId")
    REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_facilityId_idx" ON "users"("facilityId");
CREATE INDEX "users_role_idx"       ON "users"("role");

-- Sessions
CREATE TABLE "sessions" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"     TEXT NOT NULL,
  "facilityId" TEXT,
  "jti"        TEXT NOT NULL,
  "provider"   TEXT NOT NULL DEFAULT 'local',
  "ipAddress"  TEXT,
  "userAgent"  TEXT,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "revokedAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sessions_jti_key"      ON "sessions"("jti");
CREATE INDEX       "sessions_userId_idx"    ON "sessions"("userId");
CREATE INDEX       "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- Audit logs
CREATE TABLE "audit_logs" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "action"       TEXT NOT NULL,
  "userId"       TEXT,
  "facilityId"   TEXT,
  "resourceType" TEXT,
  "resourceId"   TEXT,
  "outcome"      TEXT NOT NULL DEFAULT 'success',
  "ipAddress"    TEXT,
  "userAgent"    TEXT,
  "requestId"    TEXT,
  "metadata"     JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_userId_idx"    ON "audit_logs"("userId");
CREATE INDEX "audit_logs_facilityId_idx" ON "audit_logs"("facilityId");
CREATE INDEX "audit_logs_action_idx"    ON "audit_logs"("action");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- Chat logs
CREATE TABLE "chat_logs" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"     TEXT NOT NULL,
  "facilityId" TEXT,
  "role"       TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "withPHI"    BOOLEAN NOT NULL DEFAULT false,
  "tokenCount" INTEGER,
  "model"      TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chat_logs_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "chat_logs_userId_idx"    ON "chat_logs"("userId");
CREATE INDEX "chat_logs_createdAt_idx" ON "chat_logs"("createdAt");

-- NHIS claims
CREATE TABLE "nhis_claims" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "claimRef"      TEXT NOT NULL,
  "patientId"     TEXT NOT NULL,
  "facilityId"    TEXT NOT NULL,
  "icd11Code"     TEXT NOT NULL,
  "icdDesc"       TEXT NOT NULL,
  "amount"        DECIMAL(10,2) NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "nhiaRef"       TEXT,
  "rejectionCode" TEXT,
  "confidence"    INTEGER,
  "submittedAt"   TIMESTAMP(3),
  "approvedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nhis_claims_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "nhis_claims_claimRef_key" ON "nhis_claims"("claimRef");
CREATE INDEX "nhis_claims_facilityId_idx" ON "nhis_claims"("facilityId");
CREATE INDEX "nhis_claims_status_idx"     ON "nhis_claims"("status");

-- IoMT alerts
CREATE TABLE "iomt_alerts" (
  "id"              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "deviceId"        TEXT NOT NULL,
  "patientRef"      TEXT NOT NULL,
  "facilityId"      TEXT NOT NULL,
  "alertType"       TEXT NOT NULL,
  "score"           INTEGER,
  "level"           TEXT NOT NULL,
  "vitals"          JSONB,
  "acknowledgedBy"  TEXT,
  "acknowledgedAt"  TIMESTAMP(3),
  "escalatedAt"     TIMESTAMP(3),
  "resolvedAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "iomt_alerts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "iomt_alerts_facilityId_idx" ON "iomt_alerts"("facilityId");
CREATE INDEX "iomt_alerts_alertType_idx"  ON "iomt_alerts"("alertType");
CREATE INDEX "iomt_alerts_createdAt_idx"  ON "iomt_alerts"("createdAt");

-- Seed demo facilities
INSERT INTO "facilities" ("id","code","name","region","type") VALUES
  ('fac-kbu','KBU','Korle Bu Teaching Hospital',       'Greater Accra','teaching'),
  ('fac-kat','KAT','Komfo Anokye Teaching Hospital',   'Ashanti',      'teaching'),
  ('fac-tth','TTH','Tamale Teaching Hospital',          'Northern',     'teaching'),
  ('fac-cct','CCT','Cape Coast Teaching Hospital',      'Central',      'teaching'),
  ('fac-rdg','RDG','Ridge Regional Hospital',           'Greater Accra','regional');
