// ============================================================
// phiGuard — PHI access control middleware
// HIPAA §164.312 Minimum Necessary Standard
// Strips or blocks PHI fields based on user role/permission
// Must be applied AFTER authenticate()
// ============================================================
import { hasPermission, PERMISSIONS } from "../server/rbac.js";
import { auditLog } from "../server/logger.js";

/**
 * requirePHI — blocks the route entirely if user lacks phi:read
 */
export function requirePHI(req, res, next) {
  if (!hasPermission(req.user, PERMISSIONS.PHI_READ)) {
    auditLog("PHI_DENIED", req.user?.sub, req.user?.facilityId, "phi", req.path, "denied");
    return res.status(403).json({
      error: "PHI access denied",
      detail: "Your role does not have phi:read permission. Contact your administrator.",
      role: req.user?.role,
    });
  }
  auditLog("PHI_ACCESS", req.user.sub, req.user.facilityId, "phi", req.path, "allowed");
  next();
}

/**
 * stripPHIResponse — removes PHI fields from response objects
 * when user lacks phi:read. Attach to res.json for auto-filter.
 */
export function stripPHIResponse(req, res, next) {
  const canReadPHI = hasPermission(req.user, PERMISSIONS.PHI_READ);
  if (canReadPHI) return next();

  // PHI fields to remove from any JSON response
  const PHI_FIELDS = new Set([
    "name","firstName","lastName","dateOfBirth","dob","address","phone",
    "email","ssn","mrn","nhisNumber","ghanaCard","patientId","pid",
    "diagnosis","medications","labResults","vitalSigns","soapNote",
    "icd11","prescriptions","referrals","notes","history",
  ]);

  const originalJson = res.json.bind(res);
  res.json = (data) => {
    const scrubbed = deepScrub(data, PHI_FIELDS);
    return originalJson(scrubbed);
  };
  next();
}

function deepScrub(obj, fields) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(item => deepScrub(item, fields));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = fields.has(k) ? "[PHI REDACTED]" : deepScrub(v, fields);
  }
  return out;
}

/**
 * facilityGuard — ensures user can only access their own facility's data
 * Reads facilityId from req.params or req.body
 */
export function facilityGuard(req, res, next) {
  const requestedFacility = req.params?.facilityId || req.body?.facilityId;
  if (!requestedFacility) return next(); // no facility scoping on this route

  const userFacility = req.user?.facilityId;
  const isSuperAdmin = req.user?.role === "super_admin";
  const isMedDir     = req.user?.role === "medical_director";

  if (!isSuperAdmin && !isMedDir && userFacility !== requestedFacility) {
    auditLog("FACILITY_DENIED", req.user?.sub, req.user?.facilityId,
      "facility", requestedFacility, "cross-facility-blocked");
    return res.status(403).json({
      error: "Cross-facility access denied",
      detail: `Your account is scoped to facility ${userFacility}`,
    });
  }
  next();
}
