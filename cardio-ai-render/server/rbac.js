// ============================================================
// RBAC — Role-Based Access Control
// Cardio AI Ghana · SOC 2 CC6 · HIPAA Minimum Necessary
// Roles: super_admin | medical_director | doctor | nurse |
//        lab_tech | pharmacist | chps_worker | admin | viewer
// ============================================================

export const ROLES = {
  SUPER_ADMIN:      "super_admin",
  MEDICAL_DIRECTOR: "medical_director",
  DOCTOR:           "doctor",
  NURSE:            "nurse",
  LAB_TECH:         "lab_tech",
  PHARMACIST:       "pharmacist",
  CHPS_WORKER:      "chps_worker",
  ADMIN:            "admin",
  VIEWER:           "viewer",
};

export const PERMISSIONS = {
  // Clinical AI
  AI_CHAT:            "ai:chat",
  AI_PATIENT_CTX:     "ai:patient_context",
  // Platform
  PLATFORM_VIEW:      "platform:view",
  PLATFORM_ADMIN:     "platform:admin",
  // PHI access (HIPAA minimum necessary)
  PHI_READ:           "phi:read",
  PHI_WRITE:          "phi:write",
  PHI_DELETE:         "phi:delete",
  PHI_EXPORT:         "phi:export",
  // Clinical modules
  EHR_READ:           "ehr:read",
  EHR_WRITE:          "ehr:write",
  LAB_READ:           "lab:read",
  LAB_WRITE:          "lab:write",
  PRESCRIBE:          "prescribe",
  NHIS_SUBMIT:        "nhis:submit",
  NHIS_APPROVE:       "nhis:approve",
  IOMT_VIEW:          "iomt:view",
  IOMT_ACK:           "iomt:acknowledge",
  CHPS_ACCESS:        "chps:access",
  REPORTS_VIEW:       "reports:view",
  REPORTS_EXPORT:     "reports:export",
  USER_MANAGE:        "users:manage",
  AUDIT_VIEW:         "audit:view",
  // Hospital-level
  FACILITY_MANAGE:    "facility:manage",
  ALL_FACILITIES:     "facility:all",
};

// Role → permissions map
const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),

  [ROLES.MEDICAL_DIRECTOR]: [
    PERMISSIONS.AI_CHAT, PERMISSIONS.AI_PATIENT_CTX,
    PERMISSIONS.PLATFORM_VIEW, PERMISSIONS.PHI_READ, PERMISSIONS.PHI_WRITE,
    PERMISSIONS.PHI_EXPORT, PERMISSIONS.EHR_READ, PERMISSIONS.EHR_WRITE,
    PERMISSIONS.LAB_READ, PERMISSIONS.LAB_WRITE, PERMISSIONS.PRESCRIBE,
    PERMISSIONS.NHIS_SUBMIT, PERMISSIONS.NHIS_APPROVE,
    PERMISSIONS.IOMT_VIEW, PERMISSIONS.IOMT_ACK,
    PERMISSIONS.CHPS_ACCESS, PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.USER_MANAGE, PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.FACILITY_MANAGE,
  ],

  [ROLES.DOCTOR]: [
    PERMISSIONS.AI_CHAT, PERMISSIONS.AI_PATIENT_CTX,
    PERMISSIONS.PLATFORM_VIEW, PERMISSIONS.PHI_READ, PERMISSIONS.PHI_WRITE,
    PERMISSIONS.EHR_READ, PERMISSIONS.EHR_WRITE,
    PERMISSIONS.LAB_READ, PERMISSIONS.PRESCRIBE,
    PERMISSIONS.NHIS_SUBMIT, PERMISSIONS.IOMT_VIEW, PERMISSIONS.IOMT_ACK,
    PERMISSIONS.REPORTS_VIEW,
  ],

  [ROLES.NURSE]: [
    PERMISSIONS.AI_CHAT,
    PERMISSIONS.PLATFORM_VIEW, PERMISSIONS.PHI_READ, PERMISSIONS.PHI_WRITE,
    PERMISSIONS.EHR_READ, PERMISSIONS.EHR_WRITE,
    PERMISSIONS.LAB_READ, PERMISSIONS.NHIS_SUBMIT,
    PERMISSIONS.IOMT_VIEW, PERMISSIONS.IOMT_ACK,
  ],

  [ROLES.LAB_TECH]: [
    PERMISSIONS.AI_CHAT,
    PERMISSIONS.PLATFORM_VIEW, PERMISSIONS.PHI_READ,
    PERMISSIONS.LAB_READ, PERMISSIONS.LAB_WRITE,
  ],

  [ROLES.PHARMACIST]: [
    PERMISSIONS.AI_CHAT,
    PERMISSIONS.PLATFORM_VIEW, PERMISSIONS.PHI_READ,
    PERMISSIONS.EHR_READ, PERMISSIONS.LAB_READ,
    PERMISSIONS.NHIS_SUBMIT,
  ],

  [ROLES.CHPS_WORKER]: [
    PERMISSIONS.AI_CHAT,
    PERMISSIONS.PLATFORM_VIEW, PERMISSIONS.PHI_READ, PERMISSIONS.PHI_WRITE,
    PERMISSIONS.EHR_READ, PERMISSIONS.EHR_WRITE,
    PERMISSIONS.CHPS_ACCESS, PERMISSIONS.IOMT_VIEW,
  ],

  [ROLES.ADMIN]: [
    PERMISSIONS.PLATFORM_VIEW, PERMISSIONS.PLATFORM_ADMIN,
    PERMISSIONS.USER_MANAGE, PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.FACILITY_MANAGE, PERMISSIONS.REPORTS_VIEW,
  ],

  [ROLES.VIEWER]: [
    PERMISSIONS.PLATFORM_VIEW, PERMISSIONS.REPORTS_VIEW,
  ],
};

// Facility-level isolation — user can only access their own facility
// unless they have ALL_FACILITIES permission
export function hasPermission(user, permission) {
  if (!user || !user.role) return false;
  const perms = ROLE_PERMISSIONS[user.role] || [];
  return perms.includes(permission);
}

export function canAccessFacility(user, facilityId) {
  if (!user) return false;
  if (hasPermission(user, PERMISSIONS.ALL_FACILITIES)) return true;
  return user.facilityId === facilityId;
}

// Express middleware: require permission
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: permission,
        role: req.user.role,
      });
    }
    next();
  };
}

// Express middleware: require facility access
export function requireFacilityAccess(req, res, next) {
  const facilityId = req.params.facilityId || req.body?.facilityId;
  if (facilityId && !canAccessFacility(req.user, facilityId)) {
    return res.status(403).json({ error: "Access denied to this facility" });
  }
  next();
}

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}
