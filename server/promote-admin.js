// ============================================================
// promote-admin.js — one-off: elevate a user to an APPROVED role
// Usage (Render Shell or locally with DATABASE_URL set):
//   node server/promote-admin.js <email> [role]
//   node server/promote-admin.js tonywell@cardioailive.com super_admin
// Roles: super_admin | medical_director | doctor | nurse | lab_tech |
//        pharmacist | chps_worker | admin | viewer
// ============================================================
import "dotenv/config";
import { prisma } from "./db.js";

async function main() {
  const email = (process.argv[2] || process.env.PROMOTE_EMAIL || "").toLowerCase().trim();
  const role  = (process.argv[3] || "super_admin").trim();
  if (!email) {
    console.error("Usage: node server/promote-admin.js <email> [role]");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found for ${email}. Sign in once (Google or register) first, then re-run.`);
    process.exit(1);
  }
  await prisma.user.update({
    where: { email },
    data:  { role, approvalStatus: "approved", active: true, approvedAt: new Date() },
  });
  console.log(`✓ ${email} → role=${role}, approved, active`);
}

main()
  .catch((e) => { console.error("promote-admin failed:", e.message); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
