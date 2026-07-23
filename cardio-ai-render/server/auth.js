// ============================================================
// Authentication — OAuth 2.0 (Google + Microsoft) + JWT
// HIPAA: unique user IDs, automatic logoff, MFA-ready
// SOC 2 CC6.1: logical access controls
// ============================================================
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import logger, { auditLog } from "./logger.js";
import { ROLES } from "./rbac.js";

const JWT_SECRET  = process.env.JWT_SECRET  || "CHANGE-ME-IN-PRODUCTION-256bit";
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "8h";

// ── In-memory user store (replace with PostgreSQL in production) ──
// Schema mirrors what a pg table would hold
const USERS = new Map();
const SESSIONS = new Map(); // sessionId → { userId, expiresAt }

// Seed demo users for all hospital roles
function seedDemoUsers() {
  const hospitals = [
    { id: "KBU", name: "Korle Bu Teaching Hospital" },
    { id: "KAT", name: "Komfo Anokye Teaching Hospital" },
    { id: "TTH", name: "Tamale Teaching Hospital" },
    { id: "CCT", name: "Cape Coast Teaching Hospital" },
    { id: "RDG", name: "Ridge Regional Hospital" },
  ];

  const demoAccounts = [];
  hospitals.forEach(h => {
    demoAccounts.push(
      { email: `admin@${h.id.toLowerCase()}.cardioai.gh`,    role: ROLES.MEDICAL_DIRECTOR, facility: h.id, facilityName: h.name, name: `Medical Director — ${h.name}` },
      { email: `doctor@${h.id.toLowerCase()}.cardioai.gh`,   role: ROLES.DOCTOR,           facility: h.id, facilityName: h.name, name: `Dr. Clinician — ${h.name}` },
      { email: `nurse@${h.id.toLowerCase()}.cardioai.gh`,    role: ROLES.NURSE,            facility: h.id, facilityName: h.name, name: `Nurse — ${h.name}` },
      { email: `lab@${h.id.toLowerCase()}.cardioai.gh`,      role: ROLES.LAB_TECH,         facility: h.id, facilityName: h.name, name: `Lab Tech — ${h.name}` },
    );
  });

  // Global super admin
  demoAccounts.push({
    email: "superadmin@cardioai.gh",
    role: ROLES.SUPER_ADMIN,
    facility: null, facilityName: "Cardio AI Inc.",
    name: "Platform Super Admin",
  });

  demoAccounts.forEach(u => {
    const id = uuidv4();
    USERS.set(u.email, {
      id, email: u.email, name: u.name,
      role: u.role,
      facilityId: u.facility,
      facilityName: u.facilityName,
      passwordHash: bcrypt.hashSync("CardioAI2026!", 10),
      mfaEnabled: false,
      provider: "local",
      createdAt: new Date().toISOString(),
      lastLogin: null,
      active: true,
    });
  });
  logger.info(`Seeded ${USERS.size} demo users`);
}
seedDemoUsers();

// ── JWT helpers ───────────────────────────────────────────────
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role,
      facilityId: user.facilityId, facilityName: user.facilityName, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES, issuer: "cardio-ai-ghana", audience: "cardio-ai-platform" }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET,
    { issuer: "cardio-ai-ghana", audience: "cardio-ai-platform" });
}

// ── Express middleware: authenticate ─────────────────────────
export function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : req.cookies?.authToken;
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = verifyToken(token);
    // Automatic logoff: JWT expiry enforces 8h session (HIPAA)
    auditLog("API_ACCESS", req.user.sub, req.user.facilityId, "endpoint", req.path, "allowed");
    next();
  } catch (e) {
    if (e.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Session expired — please sign in again", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ── Local login ───────────────────────────────────────────────
export async function localLogin(email, password) {
  const user = USERS.get(email?.toLowerCase());
  if (!user || !user.active) throw new Error("Invalid credentials");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error("Invalid credentials");
  user.lastLogin = new Date().toISOString();
  auditLog("LOGIN", user.id, user.facilityId, "auth", "local", "success");
  return { token: signToken(user), user: sanitizeUser(user) };
}

// ── OAuth upsert (Google / Microsoft) ────────────────────────
export function oauthUpsert(profile, provider) {
  const email = (profile.emails?.[0]?.value || profile.upn || "").toLowerCase();
  if (!email) throw new Error("No email in OAuth profile");

  let user = USERS.get(email);
  if (!user) {
    // Auto-register OAuth users as VIEWER; admin promotes to correct role
    const id = uuidv4();
    user = {
      id, email, name: profile.displayName || profile.name?.givenName || email,
      role: ROLES.VIEWER,
      facilityId: null, facilityName: null,
      passwordHash: null, mfaEnabled: false,
      provider, createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(), active: true,
      oauthId: profile.id,
    };
    USERS.set(email, user);
    logger.info(`New OAuth user registered: ${email} via ${provider}`);
  } else {
    user.lastLogin = new Date().toISOString();
    user.oauthId = profile.id;
  }
  auditLog("LOGIN", user.id, user.facilityId || "none", "auth", provider, "success");
  return { token: signToken(user), user: sanitizeUser(user) };
}

// ── User helpers ──────────────────────────────────────────────
function sanitizeUser(u) {
  const { passwordHash, ...safe } = u;
  return safe;
}

export function getUserById(id) {
  for (const u of USERS.values()) if (u.id === id) return sanitizeUser(u);
  return null;
}

export function getAllUsers() {
  return [...USERS.values()].map(sanitizeUser);
}

export function updateUserRole(targetEmail, role, facilityId, facilityName, adminUser) {
  const user = USERS.get(targetEmail);
  if (!user) throw new Error("User not found");
  user.role = role;
  user.facilityId = facilityId;
  user.facilityName = facilityName;
  auditLog("ROLE_CHANGE", adminUser.sub, adminUser.facilityId, "user", targetEmail, `role=${role}`);
  return sanitizeUser(user);
}
