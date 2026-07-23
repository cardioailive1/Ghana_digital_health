// ============================================================
// useAudit — client-side audit event emitter
// SOC 2 CC7 / HIPAA §164.312(b): activity logging
// Sends structured audit events to /api/audit
// ============================================================
import { useCallback } from "react";
import { useAuth } from "../context/AuthContext.jsx";

export function useAudit() {
  const { token, user } = useAuth();

  const emit = useCallback(async (action, resourceType, resourceId, outcome = "success") => {
    if (!user) return;
    try {
      await fetch("/api/audit", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action,
          userId:       user.sub,
          facilityId:   user.facilityId,
          facilityName: user.facilityName,
          role:         user.role,
          resourceType,
          resourceId:   String(resourceId || "").substring(0, 64),
          outcome,
          ts:           new Date().toISOString(),
          userAgent:    navigator.userAgent.substring(0, 100),
        }),
      });
    } catch { /* audit failures must never break the UI */ }
  }, [token, user]);

  // Convenience helpers for common audit events
  const auditPHIAccess   = useCallback((resourceId) => emit("PHI_VIEW",     "patient",   resourceId), [emit]);
  const auditAIChat      = useCallback((withPHI)    => emit("AI_CHAT",      "claude",    withPHI ? "with_phi" : "no_phi"), [emit]);
  const auditLogin       = useCallback(() =>           emit("LOGIN",         "auth",      "session"), [emit]);
  const auditLogout      = useCallback(() =>           emit("LOGOUT",        "auth",      "session"), [emit]);
  const auditPlatformOpen = useCallback((module) =>   emit("PLATFORM_VIEW", "platform",  module), [emit]);
  const auditIoMTAck     = useCallback((alertId) =>   emit("IOMT_ACK",      "iomt_alert", alertId), [emit]);
  const auditNHISSubmit  = useCallback((claimId) =>   emit("NHIS_SUBMIT",   "nhis_claim", claimId), [emit]);

  return {
    emit,
    auditPHIAccess, auditAIChat, auditLogin, auditLogout,
    auditPlatformOpen, auditIoMTAck, auditNHISSubmit,
  };
}
