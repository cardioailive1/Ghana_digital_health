// ============================================================
// Outbound HL7 v2 — build and send messages to external systems
// (e.g. NTCP notification of a GeneXpert-confirmed TB case).
// ============================================================
import { sendHl7 } from "./mllp.js";

function ts() { return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14); }

// Build an ORU^R01 result message (used to notify NTCP of a TB result).
export function buildOru({ sendingApp = "CARDIOAI", sendingFac = "GHS", receivingApp = "NTCP", receivingFac = "GHS",
  controlId = "CA" + Date.now(), patient, observations = [], version = "2.5.1", processingId = "P" }) {
  const p = patient || {};
  const lines = [];
  lines.push(["MSH", "^~\\&", sendingApp, sendingFac, receivingApp, receivingFac, ts(), "", "ORU^R01", controlId, processingId, version].join("|"));
  lines.push(["PID", "1", "", (p.mrn || "") + "^^^CARDIOAI^MR", "", (p.lastName || "") + "^" + (p.firstName || ""), "",
    (p.dob ? new Date(p.dob).toISOString().slice(0, 10).replace(/-/g, "") : ""), (p.sexHl7 || "")].join("|"));
  lines.push(["OBR", "1", "", controlId, "TB-NOTIFY^TB case notification^L"].join("|"));
  observations.forEach((o, i) => {
    lines.push(["OBX", String(i + 1), o.type || "ST", (o.code || "") + "^" + (o.display || "") + "^LN", "",
      o.value || "", o.unit || "", o.interpretation || "", "", "", o.status || "F"].join("|"));
  });
  return lines.join("\r");
}

// Convenience: notify NTCP of a confirmed TB case.
export async function notifyNtcpTb({ host, port, patient, mtb = "DETECTED", rifResistance = "NOT DETECTED", useTls = true }) {
  const message = buildOru({
    receivingApp: "NTCP",
    patient,
    observations: [
      { code: "90271-0", display: "MTB/RIF result", value: mtb, interpretation: mtb === "DETECTED" ? "A" : "N" },
      { code: "RIF-RES", display: "Rifampicin resistance", value: rifResistance, interpretation: rifResistance === "DETECTED" ? "A" : "N" },
    ],
  });
  const ack = await sendHl7(host, port, message, { useTls });
  const ok = /\|A[AC]\|/.test(ack);          // MSA|AA or MSA|AC
  return { ok, ack, message };
}
