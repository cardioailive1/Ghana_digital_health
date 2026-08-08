// ============================================================
// IHE ATNA — Audit Trail and Node Authentication.
// Emits audit events to an Audit Record Repository (ARR) as either:
//   (a) FHIR AuditEvent  -> POST ATNA_ARR_URL         (modern OpenHIE)
//   (b) RFC 5424 syslog over TLS -> ATNA_SYSLOG_HOST:PORT (classic ATNA/RFC 3881)
// Local DB audit remains the source of truth; ATNA forwards a copy.
// All transports no-op safely when unconfigured.
// ============================================================
import tls from "tls";

// Map our AuditLog entry -> FHIR AuditEvent (DICOM/IHE audit semantics).
export function toFhirAuditEvent(e) {
  const outcomeMap = { success: "0", critical: "4", "not-found": "4", error: "8", rejected: "4", skipped: "0" };
  return {
    resourceType: "AuditEvent",
    type: { system: "http://terminology.hl7.org/CodeSystem/audit-event-type", code: "rest", display: "RESTful Operation" },
    action: /CREATE|FINALIZE/.test(e.action) ? "C" : /READ|SEARCH|IPS|QUERY/.test(e.action) ? "R" : "E",
    recorded: (e.createdAt ? new Date(e.createdAt) : new Date()).toISOString(),
    outcome: outcomeMap[e.outcome] || "0",
    agent: [{
      who: e.userId ? { identifier: { value: e.userId } } : { display: "system" },
      requestor: true,
      network: e.ipAddress ? { address: e.ipAddress, type: "2" } : undefined,
    }],
    source: { observer: { display: "Cardio AI Ghana" }, type: [{ code: "4", display: "Application Server" }] },
    entity: e.resourceType ? [{
      what: e.resourceId ? { reference: `${e.resourceType}/${e.resourceId}` } : undefined,
      type: { system: "http://terminology.hl7.org/CodeSystem/audit-entity-type", code: "2", display: "System Object" },
    }] : undefined,
  };
}

async function postFhirAuditEvent(auditEvent, url) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/fhir+json", ...(process.env.ATNA_TOKEN ? { Authorization: "Bearer " + process.env.ATNA_TOKEN } : {}) },
    body: JSON.stringify(auditEvent),
  });
  return { ok: res.ok, status: res.status };
}

// RFC 5424 syslog message over TLS (RFC 5425). Facility 10 (security/audit), severity 5 (notice).
function buildSyslog(message, { app = "cardioai", host = "cardioai" } = {}) {
  const pri = 10 * 8 + 5;             // facility*8 + severity
  const ts = new Date().toISOString();
  const header = `<${pri}>1 ${ts} ${host} ${app} - - -`;
  const msg = `${header} ${message}`;
  return `${Buffer.byteLength(msg, "utf8")} ${msg}`;   // octet-counting framing (RFC 5425)
}

export function sendSyslogTls(message, { host = process.env.ATNA_SYSLOG_HOST, port = process.env.ATNA_SYSLOG_PORT || 6514 } = {}) {
  return new Promise((resolve) => {
    if (!host) return resolve({ skipped: true });
    const socket = tls.connect({ host, port: Number(port), rejectUnauthorized: false }, () => {
      socket.write(buildSyslog(message), () => { socket.end(); resolve({ ok: true }); });
    });
    socket.setTimeout(8000, () => { socket.destroy(); resolve({ ok: false, error: "timeout" }); });
    socket.on("error", (e) => resolve({ ok: false, error: e.message }));
  });
}

// Fire-and-forget forward of an audit entry to the configured ARR.
export async function forwardAtna(entry) {
  const results = {};
  try {
    if (process.env.ATNA_ARR_URL) results.fhir = await postFhirAuditEvent(toFhirAuditEvent(entry), process.env.ATNA_ARR_URL);
    if (process.env.ATNA_SYSLOG_HOST) results.syslog = await sendSyslogTls(JSON.stringify(toFhirAuditEvent(entry)));
  } catch (e) { results.error = e.message; }
  if (!results.fhir && !results.syslog) return { skipped: true, reason: "ATNA_ARR_URL / ATNA_SYSLOG_HOST not configured" };
  return results;
}
