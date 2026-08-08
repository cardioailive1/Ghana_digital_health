// ============================================================
// IoMT critical-alert escalation with a 5-minute SLA ladder (SOP 003).
//   0–5 min   -> ward nurse
//   5–15 min  -> Super User (SMS)
//   15–30 min -> Ward Matron
//   30+ min   -> Medical Officer on call
// Alerts persist in `alerts`; a scheduler advances unacknowledged ones and
// dispatches SMS. Acknowledgement stops escalation.
// Config: SMS_API_URL, SMS_API_KEY, ESCALATION_CONTACTS (JSON). No-ops if unset.
// ============================================================

export const LADDER = [
  { level: 0, afterMin: 0,  role: "Ward Nurse",           notify: false },
  { level: 1, afterMin: 5,  role: "Super User",           notify: true },
  { level: 2, afterMin: 15, role: "Ward Matron",          notify: true },
  { level: 3, afterMin: 30, role: "Medical Officer (on-call)", notify: true },
];

export function levelForAge(ageMinutes) {
  let lvl = LADDER[0];
  for (const step of LADDER) if (ageMinutes >= step.afterMin) lvl = step;
  return lvl;
}

function contacts() {
  try { return JSON.parse(process.env.ESCALATION_CONTACTS || "{}"); } catch { return {}; }
}

// SMS dispatch (MTN MoMo / generic gateway). No-op when unconfigured.
export async function dispatchSms(to, message, { url = process.env.SMS_API_URL, key = process.env.SMS_API_KEY } = {}) {
  if (!url || !to) return { skipped: true };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) },
      body: JSON.stringify({ to, message }),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Raise (or de-duplicate) a critical alert.
export async function raiseAlert(prisma, { patientId, observationId, facilityId, type = "critical-result", severity = "critical", detail }) {
  if (observationId) {
    const existing = await prisma.alert.findFirst({ where: { observationId, status: { not: "resolved" } } });
    if (existing) return existing;
  }
  return prisma.alert.create({ data: { patientId, observationId, facilityId, type, severity, detail, status: "open", escalationLevel: 0 } });
}

export async function acknowledgeAlert(prisma, id, userId) {
  return prisma.alert.update({ where: { id }, data: { status: "acknowledged", acknowledgedById: userId || null, acknowledgedAt: new Date() } });
}

// Scheduler tick: advance unacknowledged alerts through the ladder + dispatch.
export async function processEscalations(prisma, { now = new Date(), sms = dispatchSms } = {}) {
  const open = await prisma.alert.findMany({ where: { status: "open" } });
  const contactMap = contacts();
  const actions = [];
  for (const a of open) {
    const ageMin = (now - new Date(a.createdAt)) / 60000;
    const step = levelForAge(ageMin);
    if (step.level > a.escalationLevel) {
      await prisma.alert.update({ where: { id: a.id }, data: { escalationLevel: step.level, lastEscalatedAt: now } });
      let dispatch = { skipped: true };
      if (step.notify) {
        const to = contactMap[step.role] || contactMap[String(step.level)];
        dispatch = await sms(to, `CRITICAL ALERT (${step.role}): ${a.type} ${a.detail || ""} — patient ${a.patientId || "?"}. Acknowledge in Cardio AI.`);
      }
      actions.push({ alert: a.id, level: step.level, role: step.role, dispatch });
    }
  }
  return { processed: open.length, escalated: actions.length, actions };
}
