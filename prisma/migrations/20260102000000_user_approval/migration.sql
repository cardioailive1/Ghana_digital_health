-- User approval workflow (HIPAA/SOC 2 CC6 access provisioning)
-- New accounts default to 'pending' and cannot access the platform until a
-- Super Admin / Medical Director approves them.

ALTER TABLE "users" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "users" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "users" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- Backfill: every account that already exists at migration time (seeded staff,
-- existing local logins) is trusted and marked approved so nobody is locked out.
UPDATE "users" SET "approvalStatus" = 'approved', "approvedAt" = CURRENT_TIMESTAMP;

CREATE INDEX "users_approvalStatus_idx" ON "users"("approvalStatus");
