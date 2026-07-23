// ============================================================
// Prisma Seed — Demo users + facilities
// Run: node server/seed.js
// Or:  npx prisma db seed (after adding seed config to package.json)
// ============================================================
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "CardioAI2026!";

const DEMO_USERS = [
  // Korle Bu Teaching Hospital
  { email:"superadmin@cardioai.gh",    name:"Platform Super Admin",              role:"super_admin",      facilityCode:null },
  { email:"admin@kbu.cardioai.gh",     name:"Medical Director — Korle Bu",       role:"medical_director", facilityCode:"KBU" },
  { email:"doctor@kbu.cardioai.gh",    name:"Dr. Clinician — Korle Bu",          role:"doctor",           facilityCode:"KBU" },
  { email:"nurse@kbu.cardioai.gh",     name:"Nurse — Korle Bu",                  role:"nurse",            facilityCode:"KBU" },
  { email:"lab@kbu.cardioai.gh",       name:"Lab Tech — Korle Bu",               role:"lab_tech",         facilityCode:"KBU" },
  { email:"pharmacy@kbu.cardioai.gh",  name:"Pharmacist — Korle Bu",             role:"pharmacist",       facilityCode:"KBU" },
  // Komfo Anokye
  { email:"admin@kat.cardioai.gh",     name:"Medical Director — KATH",           role:"medical_director", facilityCode:"KAT" },
  { email:"doctor@kat.cardioai.gh",    name:"Dr. Clinician — KATH",              role:"doctor",           facilityCode:"KAT" },
  // Tamale Teaching
  { email:"admin@tth.cardioai.gh",     name:"Medical Director — TTH",            role:"medical_director", facilityCode:"TTH" },
  { email:"doctor@tth.cardioai.gh",    name:"Dr. Clinician — TTH",               role:"doctor",           facilityCode:"TTH" },
  { email:"chps@tth.cardioai.gh",      name:"CHPS Worker — TTH Zone",            role:"chps_worker",      facilityCode:"TTH" },
  // Cape Coast
  { email:"admin@cct.cardioai.gh",     name:"Medical Director — CCTH",           role:"medical_director", facilityCode:"CCT" },
  { email:"doctor@cct.cardioai.gh",    name:"Dr. Clinician — CCTH",              role:"doctor",           facilityCode:"CCT" },
  // Ridge
  { email:"admin@rdg.cardioai.gh",     name:"Medical Director — Ridge",          role:"medical_director", facilityCode:"RDG" },
  { email:"doctor@rdg.cardioai.gh",    name:"Dr. Clinician — Ridge",             role:"doctor",           facilityCode:"RDG" },
  { email:"lab@rdg.cardioai.gh",       name:"Lab Tech — Ridge",                  role:"lab_tech",         facilityCode:"RDG" },
];

async function main() {
  console.log("Seeding Cardio AI Ghana database…");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // Upsert facilities
  const facilities = await prisma.facility.findMany();
  const facilityMap = Object.fromEntries(facilities.map(f => [f.code, f.id]));

  if (facilities.length === 0) {
    console.error("No facilities found. Run migrations first: npx prisma migrate deploy");
    process.exit(1);
  }

  let created = 0, skipped = 0;

  for (const u of DEMO_USERS) {
    const facilityId = u.facilityCode ? facilityMap[u.facilityCode] : null;
    const existing = await prisma.user.findUnique({ where: { email: u.email } });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        facilityId,
        provider: "local",
        active: true,
      },
    });
    created++;
    console.log(`  ✓ Created: ${u.email} (${u.role})`);
  }

  console.log(`\nSeed complete: ${created} created, ${skipped} already existed`);
  console.log(`Default password: ${DEMO_PASSWORD}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
