// ============================================================
// Authentication — OAuth 2.0 (Google + Microsoft) + JWT
// Backed by PostgreSQL via Prisma
// HIPAA: unique user IDs, automatic logoff, MFA-ready
// SOC 2 CC6.1: logical access controls
// ============================================================
import jwt        from "jsonwebtoken";
import bcrypt     from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "./db.js";
import logger, { auditLog } from "./logger.js";
import { ROLES } from "./rbac.js";

const JWT_SECRET  = process.env.JWT_SECRET  || "CHANGE-ME-IN-PRODUCTION-256bit";
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "8h";

// ── Organisation email restriction (HIPAA access provisioning) ──
// Only emails on an approved org domain (or an explicit test allowlist) may
// self-provision via OAuth. Everything else is denied before account creation.
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || "cardioai.gh")
  .split(",").map(d => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

export function isEmailAllowed(email) {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  const at = e.indexOf("@");
  // Must be exactly one "@", with a non-empty local part and domain.
  if (at <= 0 || at !== e.lastIndexOf("@") || at === e.length - 1) return false;
  if (ALLOWED_EMAILS.includes(e)) return true;               // explicit test allowlist
  const domain = e.slice(at + 1);
  // Allow the domain itself and any sub-domain of it (cardioai.gh → kbu.cardioai.gh)
  return ALLOWED_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith("." + d));
}

// ── JWT helpers ───────────────────────────────────────────────
export function signToken(user) {
  const jti = uuidv4(); // unique JWT ID — enables per-session revocation
  return jwt.sign(
    {
      sub: user.id,
      jti,
      email: user.email,
      role:  user.role,
      facilityId:   user.facilityId   || null,
      facilityName: user.facility?.name || user.facilityName || null,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES, issuer: "cardio-ai-ghana", audience: "cardio-ai-platform" }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET,
    { issuer: "cardio-ai-ghana", audience: "cardio-ai-platform" });
}

// ── Express middleware: authenticate ──────────────────────────
export async function authenticate(req, res, next) {
  const auth  = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : req.cookies?.authToken;
  if (!token) return res.status(401).json({ error: "No token provided" });

  let payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    if (e.name === "TokenExpiredError")
      return res.status(401).json({ error: "Session expired — please sign in again", code: "TOKEN_EXPIRED" });
    return res.status(401).json({ error: "Invalid token" });
  }

  // Check session not revoked (SOC 2 CC6.3 — access removal)
  try {
    const session = await prisma.session.findUnique({ where: { jti: payload.jti } });
    if (session && session.revokedAt) {
      return res.status(401).json({ error: "Session revoked — please sign in again" });
    }
  } catch (e) {
    // If sessions table unavailable, continue (DB may still be migrating)
    logger.warn("Session check failed", { msg: e.message });
  }

  // Check user still active
  const user = await prisma.user.findUnique({
    where:  { id: payload.sub },
    include: { facility: true },
  });
  if (!user || !user.active) {
    return res.status(401).json({ error: "Account inactive" });
  }

  // Approval gate (HIPAA/SOC 2): no access until a Super Admin approves.
  if (user.approvalStatus && user.approvalStatus !== "approved") {
    return res.status(403).json({
      error: "Account pending administrator approval",
      code:  "PENDING_APPROVAL",
    });
  }

  req.user = {
    sub:          user.id,
    email:        user.email,
    name:         user.name,
    role:         user.role,
    facilityId:   user.facilityId,
    facilityName: user.facility?.name || null,
    jti:          payload.jti,
  };

  auditLog("API_ACCESS", user.id, user.facilityId, "endpoint", req.path, "allowed");
  next();
}

// ── Store session in DB ───────────────────────────────────────
async function storeSession(userId, facilityId, jti, req) {
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8h
  try {
    await prisma.session.create({
      data: {
        userId, facilityId: facilityId || null, jti,
        provider:  "local",
        ipAddress: req?.ip?.substring(0, 45),
        userAgent: req?.headers?.["user-agent"]?.substring(0, 200),
        expiresAt,
      },
    });
  } catch (e) {
    // Log but don't fail login if session storage fails
    logger.error("Session store failed", { msg: e.message });
  }
}

// ── Local login ───────────────────────────────────────────────
export async function localLogin(email, password, req) {
  const user = await prisma.user.findUnique({
    where:   { email: email.toLowerCase() },
    include: { facility: true },
  });

  if (!user || !user.active || !user.passwordHash) {
    throw new Error("Invalid credentials");
  }

  // Account lockout after 10 failed attempts (HIPAA brute-force)
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new Error(`Account locked. Try again in ${mins} minutes.`);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failedLogins = user.failedLogins + 1;
    const lockedUntil  = failedLogins >= 10
      ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await prisma.user.update({
      where: { id: user.id },
      data:  { failedLogins, lockedUntil },
    });
    auditLog("LOGIN_FAIL", user.id, user.facilityId, "auth", "local", "failed");
    throw new Error("Invalid credentials");
  }

  // Reset failed logins on success
  await prisma.user.update({
    where: { id: user.id },
    data:  { failedLogins: 0, lockedUntil: null, lastLogin: new Date(), loginCount: { increment: 1 } },
  });

  // Approval gate: password may be correct, but access needs admin approval.
  if (user.approvalStatus && user.approvalStatus !== "approved") {
    auditLog("LOGIN_BLOCKED_PENDING", user.id, user.facilityId, "auth", "local", "pending");
    const err = new Error("Account pending administrator approval");
    err.code = "PENDING_APPROVAL";
    throw err;
  }

  const token = signToken(user);
  const decoded = verifyToken(token);
  await storeSession(user.id, user.facilityId, decoded.jti, req);

  auditLog("LOGIN", user.id, user.facilityId, "auth", "local", "success");
  return { token, user: sanitizeUser(user) };
}

// ── OAuth upsert ──────────────────────────────────────────────
// Returns { status, user, token }.
//   status "approved" → token issued (caller sets cookie, redirects success)
//   status "pending"  → account created/awaiting approval (no token)
//   status "denied"   → off-domain or deactivated/rejected (no token)
export async function oauthUpsert(profile, provider, req) {
  const email = (
    profile.emails?.[0]?.value ||
    profile.upn ||
    profile._json?.mail || ""
  ).toLowerCase();

  if (!email) throw new Error("No email in OAuth profile");

  // Organisation restriction — reject before creating anything.
  if (!isEmailAllowed(email)) {
    auditLog("LOGIN_DENIED_DOMAIN", null, null, "auth", email, provider);
    logger.warn(`OAuth denied (off-domain): ${email} via ${provider}`);
    return { status: "denied", reason: "domain", user: null, token: null };
  }

  let user = await prisma.user.findUnique({
    where:   { email },
    include: { facility: true },
  });

  if (!user) {
    // New account → PENDING. A Super Admin / Medical Director must approve.
    user = await prisma.user.create({
      data: {
        email,
        name:     profile.displayName || profile.name?.givenName || email,
        role:     ROLES.VIEWER,
        provider,
        oauthId:  profile.id,
        active:   true,
        approvalStatus: "pending",
      },
      include: { facility: true },
    });
    auditLog("USER_PENDING", user.id, null, "auth", email, provider);
    logger.info(`New OAuth user pending approval: ${email} via ${provider}`);
    return { status: "pending", user: sanitizeUser(user), token: null };
  }

  // Existing account — enforce state.
  if (!user.active || user.approvalStatus === "rejected") {
    auditLog("LOGIN_DENIED_INACTIVE", user.id, user.facilityId, "auth", email, provider);
    return { status: "denied", reason: "inactive", user: sanitizeUser(user), token: null };
  }
  if (user.approvalStatus !== "approved") {
    return { status: "pending", user: sanitizeUser(user), token: null };
  }

  user = await prisma.user.update({
    where:   { id: user.id },
    data:    { lastLogin: new Date(), oauthId: profile.id, loginCount: { increment: 1 } },
    include: { facility: true },
  });

  const token   = signToken(user);
  const decoded = verifyToken(token);
  await storeSession(user.id, user.facilityId, decoded.jti, req);

  auditLog("LOGIN", user.id, user.facilityId, "auth", provider, "success");
  return { status: "approved", token, user: sanitizeUser(user) };
}

// ── Logout — revoke session in DB ─────────────────────────────
export async function revokeSession(jti) {
  await prisma.session.updateMany({
    where: { jti },
    data:  { revokedAt: new Date() },
  });
}

// ── Token refresh ─────────────────────────────────────────────
export async function refreshToken(oldJti, req) {
  // Revoke the old session
  await revokeSession(oldJti);

  // Find user via session
  const session = await prisma.session.findUnique({
    where:   { jti: oldJti },
    include: { user: { include: { facility: true } } },
  });
  if (!session?.user) throw new Error("Session not found");

  const user  = session.user;
  const token = signToken(user);
  const dec   = verifyToken(token);
  await storeSession(user.id, user.facilityId, dec.jti, req);

  return { token, user: sanitizeUser(user) };
}

// ── User helpers ──────────────────────────────────────────────
function sanitizeUser(u) {
  const { passwordHash, mfaSecret, ...safe } = u;
  return safe;
}

export async function getUserById(id) {
  const u = await prisma.user.findUnique({
    where:   { id },
    include: { facility: true },
  });
  return u ? sanitizeUser(u) : null;
}

export async function getAllUsers(facilityId = null) {
  const users = await prisma.user.findMany({
    where:   facilityId ? { facilityId } : {},
    include: { facility: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map(sanitizeUser);
}

export async function updateUserRole(email, role, facilityId, facilityName, adminUser) {
  const user = await prisma.user.update({
    where:   { email },
    data:    { role, facilityId: facilityId || null },
    include: { facility: true },
  });
  auditLog("ROLE_CHANGE", adminUser.sub, adminUser.facilityId, "user", email, `role=${role}`);
  return sanitizeUser(user);
}

// ── Approval workflow ─────────────────────────────────────────
export async function getPendingUsers() {
  const users = await prisma.user.findMany({
    where:   { approvalStatus: "pending" },
    include: { facility: true },
    orderBy: { createdAt: "asc" },
  });
  return users.map(sanitizeUser);
}

export async function setApproval(email, decision, adminUser, role, facilityId) {
  const data = {
    approvalStatus: decision,                 // "approved" | "rejected"
    approvedById:   adminUser?.sub || null,
    approvedAt:     new Date(),
  };
  if (decision === "approved") {
    data.active = true;
    if (role) data.role = role;               // assign real role at approval time
    if (facilityId !== undefined) data.facilityId = facilityId || null;
  } else {
    data.active = false;                      // rejected → no access
  }
  const user = await prisma.user.update({
    where:   { email },
    data,
    include: { facility: true },
  });
  auditLog(decision === "approved" ? "USER_APPROVED" : "USER_REJECTED",
    adminUser?.sub, adminUser?.facilityId, "user", email, `by=${adminUser?.email || "?"}`);
  return sanitizeUser(user);
}
