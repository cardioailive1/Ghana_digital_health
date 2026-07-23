// ============================================================
// RBACContext — permission checking available everywhere
// Mirrors server-side rbac.js but runs client-side
// Never trust client RBAC alone — server enforces too
// ============================================================
import { createContext, useContext, useMemo } from "react";
import { useAuth } from "./AuthContext.jsx";

// Matches server/rbac.js ROLE_PERMISSIONS exactly
const ROLE_PERMISSIONS = {
  super_admin: ["*"],
  medical_director: [
    "ai:chat","ai:patient_context","platform:view","platform:admin",
    "phi:read","phi:write","phi:export",
    "ehr:read","ehr:write","lab:read","lab:write","prescribe",
    "nhis:submit","nhis:approve","iomt:view","iomt:acknowledge",
    "chps:access","reports:view","reports:export",
    "users:manage","audit:view","facility:manage",
  ],
  doctor: [
    "ai:chat","ai:patient_context","platform:view",
    "phi:read","phi:write","ehr:read","ehr:write",
    "lab:read","prescribe","nhis:submit",
    "iomt:view","iomt:acknowledge","reports:view",
  ],
  nurse: [
    "ai:chat","platform:view","phi:read","phi:write",
    "ehr:read","ehr:write","lab:read",
    "nhis:submit","iomt:view","iomt:acknowledge",
  ],
  lab_tech: [
    "ai:chat","platform:view","phi:read","lab:read","lab:write",
  ],
  pharmacist: [
    "ai:chat","platform:view","phi:read",
    "ehr:read","lab:read","nhis:submit",
  ],
  chps_worker: [
    "ai:chat","platform:view","phi:read","phi:write",
    "ehr:read","ehr:write","chps:access","iomt:view",
  ],
  admin: [
    "platform:view","platform:admin",
    "users:manage","audit:view","facility:manage","reports:view",
  ],
  viewer: ["platform:view","reports:view"],
};

const RBACContext = createContext(null);

export function RBACProvider({ children }) {
  const { user } = useAuth();

  const permissions = useMemo(() => {
    if (!user?.role) return new Set();
    const perms = ROLE_PERMISSIONS[user.role] || [];
    return new Set(perms);
  }, [user]);

  const can = useMemo(() => (permission) => {
    if (!user) return false;
    if (permissions.has("*")) return true;
    return permissions.has(permission);
  }, [permissions, user]);

  const canAccessFacility = useMemo(() => (facilityId) => {
    if (!user) return false;
    if (can("facility:all") || user.role === "super_admin") return true;
    return user.facilityId === facilityId;
  }, [user, can]);

  return (
    <RBACContext.Provider value={{ can, canAccessFacility, permissions, role: user?.role }}>
      {children}
    </RBACContext.Provider>
  );
}

export function useRBAC() {
  const ctx = useContext(RBACContext);
  if (!ctx) throw new Error("useRBAC must be used inside <RBACProvider>");
  return ctx;
}
