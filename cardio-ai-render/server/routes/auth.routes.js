import { Router } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as MicrosoftStrategy } from "passport-microsoft";
import {
  localLogin, oauthUpsert, signToken,
  getUserById, getAllUsers, updateUserRole, authenticate,
} from "../auth.js";
import { authRateLimit } from "../security.js";
import { requirePermission, PERMISSIONS } from "../rbac.js";
import logger, { auditLog } from "../logger.js";

const router = Router();

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.CLIENT_URL||"http://localhost:3001"}/auth/google/callback`,
  }, (at, rt, profile, done) => {
    try { done(null, oauthUpsert(profile, "google")); } catch(e) { done(e); }
  }));
}

if (process.env.MICROSOFT_CLIENT_ID) {
  passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL: `${process.env.CLIENT_URL||"http://localhost:3001"}/auth/microsoft/callback`,
    tenant: process.env.MICROSOFT_TENANT_ID || "common",
    scope: ["user.read","openid","profile","email"],
  }, (at, rt, profile, done) => {
    try { done(null, oauthUpsert(profile, "microsoft")); } catch(e) { done(e); }
  }));
}

passport.serializeUser((u,done)=>done(null,u));
passport.deserializeUser((u,done)=>done(null,u));

router.post("/login", authRateLimit, async (req,res) => {
  const { email, password } = req.body || {};
  if (!email||!password) return res.status(400).json({error:"Email and password required"});
  try {
    const result = await localLogin(email.trim(), password);
    res.cookie("authToken", result.token, {
      httpOnly:true, secure:process.env.NODE_ENV==="production",
      sameSite:"strict", maxAge:8*60*60*1000
    });
    res.json({ token:result.token, user:result.user });
  } catch(e) {
    auditLog("LOGIN_FAIL",null,null,"auth",email,"failed");
    res.status(401).json({error:"Invalid email or password"});
  }
});

router.get("/google", passport.authenticate("google",{scope:["profile","email"],session:false}));
router.get("/google/callback",
  passport.authenticate("google",{session:false,failureRedirect:"/?auth=fail"}),
  (req,res) => {
    const {token} = req.user;
    res.cookie("authToken",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:8*60*60*1000});
    res.redirect("/?auth=success");
  }
);

router.get("/microsoft", passport.authenticate("microsoft",{session:false}));
router.get("/microsoft/callback",
  passport.authenticate("microsoft",{session:false,failureRedirect:"/?auth=fail"}),
  (req,res) => {
    const {token} = req.user;
    res.cookie("authToken",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:8*60*60*1000});
    res.redirect("/?auth=success");
  }
);

router.post("/refresh", authenticate, (req,res) => {
  const user = getUserById(req.user.sub);
  if (!user) return res.status(401).json({error:"User not found"});
  const token = signToken(user);
  res.cookie("authToken",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:8*60*60*1000});
  res.json({token});
});

router.get("/me", authenticate, (req,res) => {
  const user = getUserById(req.user.sub);
  if (!user) return res.status(404).json({error:"User not found"});
  res.json({user});
});

router.post("/logout", authenticate, (req,res) => {
  auditLog("LOGOUT",req.user.sub,req.user.facilityId,"auth","session","success");
  res.clearCookie("authToken");
  res.json({message:"Signed out successfully"});
});

router.get("/users", authenticate, requirePermission(PERMISSIONS.USER_MANAGE), (req,res) => {
  const users = getAllUsers();
  const filtered = req.user.role==="super_admin" ? users : users.filter(u=>u.facilityId===req.user.facilityId);
  res.json({users:filtered, total:filtered.length});
});

router.put("/users/:email/role", authenticate, requirePermission(PERMISSIONS.USER_MANAGE), (req,res) => {
  const {role,facilityId,facilityName} = req.body||{};
  if (!role) return res.status(400).json({error:"role required"});
  try {
    const updated = updateUserRole(req.params.email,role,facilityId,facilityName,req.user);
    res.json({user:updated});
  } catch(e) { res.status(404).json({error:e.message}); }
});

export default router;
