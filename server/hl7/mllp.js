// ============================================================
// MLLP (Minimal Lower Layer Protocol) transport for HL7 v2 over TCP.
// Framing: <VT> message <FS><CR>.  Optionally wrapped in TLS.
// ============================================================
import net from "net";
import tls from "tls";
import { EventEmitter } from "events";

const VT = 0x0b; // start block
const FS = 0x1c; // end block
const CR = 0x0d; // carriage return

export function frame(message) {
  return Buffer.concat([Buffer.from([VT]), Buffer.from(message, "utf8"), Buffer.from([FS, CR])]);
}

// Pulls complete MLLP messages out of a rolling buffer.
function makeParser(onMessage) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let start = buf.indexOf(VT);
    while (start !== -1) {
      const end = buf.indexOf(FS, start + 1);
      if (end === -1) break;                       // incomplete; wait for more
      const msg = buf.slice(start + 1, end).toString("utf8");
      // skip the CR after FS if present
      let next = end + 1;
      if (buf[next] === CR) next += 1;
      buf = buf.slice(next);
      onMessage(msg);
      start = buf.indexOf(VT);
    }
    if (start > 0) buf = buf.slice(start);          // drop leading noise
  };
}

// ── Server ────────────────────────────────────────────────────
// handler: async (hl7String) => ackString
export class MLLPServer extends EventEmitter {
  constructor(handler, opts = {}) {
    super();
    this.handler = handler;
    this.tlsOptions = opts.tls || null;             // { key, cert } to require TLS
    const onConn = (socket) => {
      socket.setEncoding("binary");
      const parse = makeParser(async (hl7) => {
        this.emit("message", hl7);
        let ack;
        try { ack = await this.handler(hl7); }
        catch (e) { this.emit("error", e); ack = null; }
        if (ack) socket.write(frame(ack));
      });
      socket.on("data", (d) => parse(Buffer.from(d, "binary")));
      socket.on("error", (e) => this.emit("error", e));
    };
    this.server = this.tlsOptions
      ? tls.createServer(this.tlsOptions, onConn)
      : net.createServer(onConn);
  }
  listen(port, host = "0.0.0.0", cb) { this.server.listen(port, host, cb); return this; }
  close(cb) { this.server.close(cb); }
}

// ── Client (outbound) ─────────────────────────────────────────
// Sends one HL7 message, resolves with the ACK string.
export function sendHl7(host, port, message, { useTls = false, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const lib = useTls ? tls : net;
    const socket = lib.connect({ host, port, rejectUnauthorized: false }, () => {
      socket.write(frame(message));
    });
    let acc = Buffer.alloc(0);
    const parse = makeParser((ack) => { cleanup(); resolve(ack); });
    socket.setTimeout(timeout, () => { cleanup(); reject(new Error("MLLP timeout")); });
    socket.on("data", (d) => parse(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    socket.on("error", (e) => { cleanup(); reject(e); });
    function cleanup() { try { socket.destroy(); } catch (_) {} }
  });
}
