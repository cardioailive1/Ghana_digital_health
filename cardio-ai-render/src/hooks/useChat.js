// ============================================================
// useChat — Clinical AI streaming chat state + logic
// Handles: message history, streaming, 429 retry countdown,
//          patient context toggle, RBAC-gated PHI injection
// ============================================================
import { useState, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useRBAC } from "../context/RBACContext.jsx";

const RETRY_DELAYS = [5, 15, 30, 60];
const MAX_RETRIES  = 4;

export function useChat({ system, patientCtx }) {
  const { token, logout } = useAuth();
  const { can } = useRBAC();

  const [messages,   setMessages]   = useState([]);
  const [streamText, setStreamText] = useState("");
  const [busy,       setBusy]       = useState(false);
  const [retryInfo,  setRetryInfo]  = useState(null); // { attempt, delay, countdown }
  const [error,      setError]      = useState(null);
  const [usePatient, setUsePatient] = useState(false);

  const logRef         = useRef([]);  // raw [{role,content}] for API
  const retryCountRef  = useRef(0);
  const retryTimerRef  = useRef(null);
  const abortRef       = useRef(null);

  // ── Build system prompt ────────────────────────────────────
  function buildSystem() {
    const canSeePHI = can("ai:patient_context") && can("phi:read");
    let sys = system || "";
    if (usePatient && patientCtx) {
      sys += canSeePHI
        ? patientCtx
        : "\n\n[PATIENT CONTEXT REDACTED — phi:read permission required]";
    }
    return sys;
  }

  // ── Core fetch (recursive for retry) ──────────────────────
  async function doFetch(payload) {
    abortRef.current = new AbortController();
    const tok = token || localStorage.getItem("cai_token") || "";

    let res;
    try {
      res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        signal: abortRef.current.signal,
        headers: {
          "Content-Type": "application/json",
          ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
        },
        body: payload,
      });
    } catch (e) {
      if (e.name === "AbortError") return;
      throw Object.assign(new Error("Network error — check connection"), { code: "NETWORK" });
    }

    // 401 — session expired
    if (res.status === 401) { logout(); return; }

    // 429 / 529 — rate limit with retry
    if (res.status === 429 || res.status === 529) {
      if (retryCountRef.current >= MAX_RETRIES) {
        retryCountRef.current = 0;
        setRetryInfo(null);
        throw new Error(
          `Rate limit (429) — ${MAX_RETRIES} retries exhausted.\n\n` +
          "Solutions:\n1. Wait 60s and try again\n2. Reduce request frequency"
        );
      }
      const retryAfter = parseInt(res.headers.get("retry-after") || "0", 10);
      const delay = retryAfter > 0 ? retryAfter : (RETRY_DELAYS[retryCountRef.current] || 60);
      retryCountRef.current++;

      // Countdown UI
      let remaining = delay;
      setRetryInfo({ attempt: retryCountRef.current, delay, countdown: remaining });
      const tick = setInterval(() => {
        remaining--;
        setRetryInfo(r => r ? { ...r, countdown: remaining } : null);
        if (remaining <= 0) clearInterval(tick);
      }, 1000);

      retryTimerRef.current = setTimeout(() => {
        clearInterval(tick);
        setRetryInfo(null);
        doFetch(payload);
      }, delay * 1000);
      return;
    }

    retryCountRef.current = 0;
    setRetryInfo(null);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }

    // Stream response
    const reader = res.body.getReader();
    const dec    = new TextDecoder();
    let full     = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of dec.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try {
          const ev = JSON.parse(raw);
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            full += ev.delta.text;
            setStreamText(full);
          }
        } catch { /* skip malformed SSE lines */ }
      }
    }

    logRef.current.push({ role: "assistant", content: full || "No response." });
    setMessages(prev => [...prev, { role: "ai", text: full || "No response." }]);
    setStreamText("");
    setBusy(false);
  }

  // ── Send message ──────────────────────────────────────────
  const send = useCallback(async (text) => {
    const trimmed = (text || "").trim();
    if (!trimmed || busy) return;

    setError(null);
    setBusy(true);
    setStreamText("");
    retryCountRef.current = 0;

    logRef.current.push({ role: "user", content: trimmed });
    setMessages(prev => [...prev, { role: "user", text: trimmed }]);

    const payload = JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      stream: true,
      system: buildSystem(),
      messages: logRef.current.slice(-20),
    });

    try {
      await doFetch(payload);
    } catch (e) {
      setMessages(prev => [...prev, { role: "err", text: `**Error:** ${e.message}` }]);
      setStreamText("");
      setBusy(false);
    }
  }, [busy, token, usePatient, system, patientCtx, can]);

  // ── Clear conversation ────────────────────────────────────
  const clear = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    abortRef.current?.abort();
    logRef.current = [];
    setMessages([]);
    setStreamText("");
    setRetryInfo(null);
    setError(null);
    setBusy(false);
    retryCountRef.current = 0;
  }, []);

  return {
    messages, streamText, busy, retryInfo, error,
    usePatient, setUsePatient,
    send, clear,
  };
}
