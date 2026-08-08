// ============================================================
// Background worker — runs the scheduled jobs as its own process.
//   - ADX FHIR->DHIS2 IDSR sync  every 2 minutes
//   - IoMT SLA escalation tick    every 30 seconds
// Run:  node server/worker.js   (Render: a separate worker service)
// ============================================================
import logger from "./logger.js";
import { prisma } from "./db.js";
import { syncAdx } from "./adx/dhis2.js";
import { processEscalations, dispatchSms } from "./escalation/sla.js";

const ADX_INTERVAL_MS = Number(process.env.ADX_INTERVAL_MS || 120000);   // 2 min
const SLA_INTERVAL_MS = Number(process.env.SLA_INTERVAL_MS || 30000);    // 30 s

let adxBusy = false, slaBusy = false;

async function adxTick() {
  if (adxBusy) return; adxBusy = true;
  try {
    const since = new Date(Date.now() - ADX_INTERVAL_MS);
    const r = await syncAdx(prisma, { since });
    if (r.skipped) logger.info("ADX skipped (DHIS2 not configured)");
    else logger.info(`ADX pushed ${r.pushed} data values; EWARN alerts: ${r.ewarn.length}`);
  } catch (e) { logger.error("ADX tick failed", { msg: e.message }); }
  finally { adxBusy = false; }
}

async function slaTick() {
  if (slaBusy) return; slaBusy = true;
  try {
    const r = await processEscalations(prisma, { sms: dispatchSms });
    if (r.escalated) logger.info(`SLA escalated ${r.escalated} alert(s)`);
  } catch (e) { logger.error("SLA tick failed", { msg: e.message }); }
  finally { slaBusy = false; }
}

prisma.$connect().then(() => {
  logger.info(`Worker started — ADX every ${ADX_INTERVAL_MS / 1000}s, SLA every ${SLA_INTERVAL_MS / 1000}s`);
  setInterval(adxTick, ADX_INTERVAL_MS);
  setInterval(slaTick, SLA_INTERVAL_MS);
  slaTick(); adxTick();
}).catch((e) => { logger.error("Worker DB connect failed", { msg: e.message }); process.exit(1); });

async function shutdown() { await prisma.$disconnect(); process.exit(0); }
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
