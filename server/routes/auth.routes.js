import { Router }   from "express";
import passport     from "passport";
import { Strategy as GoogleStrategy }    from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import {
  localLogin, oauthUpsert, refreshToken,
  authenticate, revokeSession, getUserById,
  getAllUsers, updateUserRole,
  getPendingUsers, setApproval,
} from "../auth.js";
import { authRateLimit } from "../security.js";
import { requirePermission, PERMISSIONS } from "../rbac.js";
import { auditLog } from "../logger.js";

const router = Router();
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge:   8 * 60 * 60 * 1000,   // 8h — HIPAA automatic logoff
};
const CALLBACK_BASE = "https://cardio-ai-ghana.onrender.com";

// ── Passport — Google ─────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  "https://cardio-ai-ghana.onrender.com/auth/google/callback",
    passReqToCallback: true,
  }, async (req, at, rt, profile, done) => {
    try { done(null, await oauthUpsert(profile, "google", req)); }
    catch (e) { done(e); }
  }));
}

// ── Passport — Microsoft ──────────────────────────────────────
if (process.env.MICROSOFT_CLIENT_ID) {
  passport.use(new MicrosoftStrategy({
    clientID:     process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL:  "https://cardio-ai-ghana.onrender.com/auth/microsoft/callback",
    tenant:       process.env.MICROSOFT_TENANT_ID || "common",
    scope:        ["user.read","openid","profile","email"],
    passReqToCallback: true,
  }, async (req, at, rt, profile, done) => {
    try { done(null, await oauthUpsert(profile, "microsoft", req)); }
    catch (e) { done(e); }
  }));
}

passport.serializeUser((u, done)   => done(null, u));
passport.deserializeUser((u, done) => done(null, u));

// ── Local login ───────────────────────────────────────────────
router.post("/login", authRateLimit, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });
  try {
    const result = await localLogin(email.trim(), password, req);
    res.cookie("authToken", result.token, COOKIE_OPTS);
    res.json({ token: result.token, user: result.user });
  } catch (e) {
    auditLog("LOGIN_FAIL", null, null, "auth", email, "failed");
    res.status(401).json({ error: e.message || "Invalid email or password" });
  }
});

// ── Google OAuth ──────────────────────────────────────────────
router.get("/google",
  passport.authenticate("google", { scope: ["profile","email"], session: false }));

router.get("/google/callback",
  (req, res, next) => {
    passport.authenticate("google", { session: false }, (err, result, info) => {
      if (err) {
        console.error("Google OAuth error:", err.message);
        return res.redirect("/?auth=fail&reason=" + encodeURIComponent(err.message));
      }
      if (!result)                    return res.redirect("/?auth=fail&reason=no_user");
      if (result.status === "denied") return res.redirect("/?auth=denied");
      if (result.status === "pending")return res.redirect("/?auth=pending");
      res.cookie("authToken", result.token, COOKIE_OPTS);
      res.redirect("/?auth=success");
    })(req, res, next);
  }
);

// ── Microsoft OAuth ───────────────────────────────────────────
router.get("/microsoft",
  passport.authenticate("microsoft", { session: false }));

router.get("/microsoft/callback",
  (req, res, next) => {
    passport.authenticate("microsoft", { session: false }, (err, result, info) => {
      if (err) {
        console.error("Microsoft OAuth error:", err.message);
        return res.redirect("/?auth=fail&reason=" + encodeURIComponent(err.message));
      }
      if (!result)                    return res.redirect("/?auth=fail&reason=no_user");
      if (result.status === "denied") return res.redirect("/?auth=denied");
      if (result.status === "pending")return res.redirect("/?auth=pending");
      res.cookie("authToken", result.token, COOKIE_OPTS);
      res.redirect("/?auth=success");
    })(req, res, next);
  }
);

// ── Token refresh ─────────────────────────────────────────────
router.post("/refresh", authenticate, async (req, res) => {
  try {
    const { token } = await refreshToken(req.user.jti, req);
    res.cookie("authToken", token, COOKIE_OPTS);
    const user = await getUserById(req.user.sub);
    res.json({ token, user });
  } catch (e) {
    // If jti-based refresh fails (OAuth user), issue new token from user record
    try {
      const user = await getUserById(req.user.sub);
      if (!user) throw new Error("User not found");
      const { signToken } = await import("../auth.js");
      const token = signToken(user);
      res.cookie("authToken", token, COOKIE_OPTS);
      res.json({ token, user });
    } catch (e2) {
      res.status(401).json({ error: e2.message });
    }
  }
});

// ── Me ────────────────────────────────────────────────────────
router.get("/me", authenticate, async (req, res) => {
  const user = await getUserById(req.user.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

// ── Logout — revoke session in DB ─────────────────────────────
router.post("/logout", authenticate, async (req, res) => {
  await revokeSession(req.user.jti);
  auditLog("LOGOUT", req.user.sub, req.user.facilityId, "auth", "session", "success");
  res.clearCookie("authToken");
  res.json({ message: "Signed out successfully" });
});

// ── User management ───────────────────────────────────────────
router.get("/users",
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    const facilityId = req.user.role === "super_admin" ? null : req.user.facilityId;
    const users = await getAllUsers(facilityId);
    res.json({ users, total: users.length });
  }
);

router.put("/users/:email/role",
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    const { role, facilityId, facilityName } = req.body || {};
    if (!role) return res.status(400).json({ error: "role required" });
    try {
      const updated = await updateUserRole(req.params.email, role, facilityId, facilityName, req.user);
      res.json({ user: updated });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  }
);

// ── User approval (Super Admin / Medical Director) ────────────
router.get("/users/pending",
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    const users = await getPendingUsers();
    res.json({ users, total: users.length });
  }
);

router.post("/users/:email/approve",
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    const { role, facilityId } = req.body || {};
    try {
      const user = await setApproval(req.params.email, "approved", req.user, role, facilityId);
      res.json({ user });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  }
);

router.post("/users/:email/reject",
  authenticate,
  requirePermission(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    try {
      const user = await setApproval(req.params.email, "rejected", req.user);
      res.json({ user });
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  }
);

export default router;
