// ============================================================
// HL7 v2 inbound handlers.
//   ADT (A01/A04/A08/A28/A31) -> upsert Patient (+ Encounter for admits)
//   ORU (R01)                 -> Observations from OBX segments
// Extraction is pure (parseAdt / parseOru) so it can be unit-tested;
// persistence is separate (applyAdt / applyOru).
// ============================================================
import { HL7Message } from "hl7v2";

function val(seg, field, comp) {
  if (!seg) return null;
  try {
    const f = seg.field(field);
    if (!f) return null;
    const v = comp ? f.component(comp).getValue() : f.getValue();
    return v == null || v === "" ? null : String(v);
  } catch (_) { return null; }
}

function hl7DateToJs(s) {
  if (!s) return null;
  // YYYYMMDD or YYYYMMDDHHMMSS
  const y = s.slice(0, 4), mo = s.slice(4, 6) || "01", d = s.slice(6, 8) || "01";
  const hh = s.slice(8, 10) || "00", mm = s.slice(10, 12) || "00", ss = s.slice(12, 14) || "00";
  const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}

function sexFromHl7(s) {
  const m = { M: "male", F: "female", O: "other", U: "unknown" };
  return s ? (m[s.toUpperCase()] || "unknown") : null;
}

function segments(msg, type) { return msg.segments.filter((s) => s.segmentType === type); }

// ── Pure extractors ───────────────────────────────────────────
export function parseAdt(msg) {
  const pid = msg.getSegment("PID");
  const pv1 = msg.getSegment("PV1");
  const patient = {
    mrn:       val(pid, 3, 1),
    lastName:  val(pid, 5, 1) || "",
    firstName: val(pid, 5, 2) || "",
    dob:       hl7DateToJs(val(pid, 7)),
    sex:       sexFromHl7(val(pid, 8)),
    phone:     val(pid, 13),
  };
  const patientClass = val(pv1, 2);   // I=inpatient, O=outpatient, E=emergency
  const classMap = { I: "IMP", O: "AMB", E: "EMER" };
  return {
    patient,
    encounter: pv1 ? { class: classMap[patientClass] || "AMB" } : null,
  };
}

export function parseOru(msg) {
  const pid = msg.getSegment("PID");
  const obs = segments(msg, "OBX").map((obx) => ({
    code:           val(obx, 3, 1),
    display:        val(obx, 3, 2),
    value:          val(obx, 5),
    unit:           val(obx, 6),
    interpretation: val(obx, 8),
    status:         (val(obx, 11) === "F" ? "final" : "preliminary"),
  })).filter((o) => o.code);
  return { mrn: val(pid, 3, 1), observations: obs };
}

// ── Persistence ───────────────────────────────────────────────
async function upsertPatientByMrn(prisma, patient) {
  if (patient.mrn) {
    const existing = await prisma.patient.findUnique({ where: { mrn: patient.mrn } });
    if (existing) {
      return prisma.patient.update({ where: { id: existing.id }, data: cleanUndef(patient) });
    }
  }
  return prisma.patient.create({ data: { firstName: patient.firstName || "", lastName: patient.lastName || "", ...cleanUndef(patient) } });
}
function cleanUndef(o) { const r = {}; for (const k in o) if (o[k] != null) r[k] = o[k]; return r; }

export async function applyAdt(prisma, msg) {
  const { patient, encounter } = parseAdt(msg);
  const p = await upsertPatientByMrn(prisma, patient);
  if (encounter) {
    await prisma.encounter.create({ data: { patientId: p.id, class: encounter.class, status: "in-progress", facilityId: p.facilityId || null } });
  }
  return p;
}

export async function applyOru(prisma, msg) {
  const { mrn, observations } = parseOru(msg);
  const p = mrn ? await prisma.patient.findUnique({ where: { mrn } }) : null;
  if (!p) throw new Error(`Unknown patient MRN '${mrn}' — cannot store results`);
  const created = [];
  for (const o of observations) {
    created.push(await prisma.observation.create({ data: { patientId: p.id, source: "hl7", ...o } }));
  }
  return created;
}

// ── Top-level dispatcher: returns an ACK string ───────────────
export function makeHl7Handler(prisma, { auditLog } = {}) {
  return async function handle(hl7String) {
    let msg;
    try { msg = HL7Message.parse(hl7String); }
    catch (e) { return nak(null, e.message); }

    const type = (msg.messageType || "").split("^")[0];
    try {
      if (type === "ADT")      await applyAdt(prisma, msg);
      else if (type === "ORU") await applyOru(prisma, msg);
      else return msg.createNak ? msg.createNak("AR", `Unsupported message type ${type}`).toHL7String() : nak(msg, `Unsupported ${type}`);
      if (auditLog) { try { await auditLog(type, msg.controlId); } catch (_) {} }
      return msg.createAck().toHL7String();     // MSA|AA
    } catch (e) {
      return (msg.createNak ? msg.createNak("AE", e.message) : { toHL7String: () => nak(msg, e.message) }).toHL7String();
    }
  };
}

// Minimal hand-built ACK/NAK fallback (if library helpers unavailable)
function nak(msg, reason) {
  const ctrl = (msg && msg.controlId) || "";
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `MSH|^~\\&|CARDIOAI|GHS|||${ts}||ACK|${ctrl}|P|2.5.1\rMSA|AE|${ctrl}|${reason || "error"}`;
}
