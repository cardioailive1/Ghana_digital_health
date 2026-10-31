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

// Connect with bounded retry/backoff instead of crash-looping on a transient
// or misconfigured database. A cold Render Postgres (or a stale DATABASE_URL)
// should not put the worker into a tight restart loop.
const CONNECT_MAX_RETRIES = Number(process.env.WORKER_DB_MAX_RETRIES || 10);
const CONNECT_BASE_DELAY_MS = Number(process.env.WORKER_DB_RETRY_MS || 5000);

async function connectWithRetry() {
  for (let attempt = 1; attempt <= CONNECT_MAX_RETRIES; attempt++) {
    try {
      await prisma.$connect();
      return true;
    } catch (e) {
      const delay = Math.min(CONNECT_BASE_DELAY_MS * attempt, 60000);
      logger.error("Worker DB connect failed", { msg: e.message, attempt, maxRetries: CONNECT_MAX_RETRIES, retryInMs: delay });
      if (attempt === CONNECT_MAX_RETRIES) return false;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return false;
}

function startJobs() {
  logger.info(`Worker started — ADX every ${ADX_INTERVAL_MS / 1000}s, SLA every ${SLA_INTERVAL_MS / 1000}s`);
  setInterval(adxTick, ADX_INTERVAL_MS);
  setInterval(slaTick, SLA_INTERVAL_MS);
  slaTick(); adxTick();
}

connectWithRetry().then((ok) => {
  if (ok) { startJobs(); return; }
  // Could not reach the DB after all retries. Exit non-zero so the platform
  // operator notices, but only after real backoff — not an instant crash loop.
  logger.error("Worker giving up after DB connect retries — check DATABASE_URL points at the live Postgres instance");
  process.exit(1);
});

async function shutdown() { await prisma.$disconnect(); process.exit(0); }
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
