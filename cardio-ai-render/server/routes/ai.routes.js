// ============================================================
// AI Chat Route — Anthropic proxy + HIPAA PHI controls
// Requires authentication + AI_CHAT permission
// 429/529 pass-through with retry-after header
// ============================================================
import { Router } from "express";
import { authenticate } from "../auth.js";
import { requirePermission, hasPermission, PERMISSIONS } from "../rbac.js";
import { aiRateLimit } from "../security.js";
import { auditLog } from "../logger.js";
import logger from "../logger.js";

const router = Router();

router.post("/chat",
  authenticate,
  requirePermission(PERMISSIONS.AI_CHAT),
  aiRateLimit,
  async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({error:{message:"ANTHROPIC_API_KEY not configured"}});

    const { model, max_tokens, system, messages, stream } = req.body || {};
    if (!messages || !Array.isArray(messages))
      return res.status(400).json({error:{message:"messages array required"}});

    // HIPAA: strip patient context if user lacks PHI permission
    const canSeePHI = hasPermission(req.user, PERMISSIONS.PHI_READ);
    const safeSystem = canSeePHI
      ? (system || "")
      : (system || "").replace(/ACTIVE PATIENT[\s\S]*?(?=\n\n[A-Z]|$)/g, "[PATIENT CONTEXT REDACTED — PHI ACCESS REQUIRED]");

    auditLog("AI_CHAT", req.user.sub, req.user.facilityId, "ai", "claude", canSeePHI ? "with_phi" : "no_phi");

    try {
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model: model || "claude-haiku-4-5-20251001",
          max_tokens: Math.min(max_tokens || 1024, 4096),
          stream: stream !== false,
          system: safeSystem,
          messages: messages.slice(-20), // cap context window
        }),
      });

      // Pass 429/529 through with retry-after header intact
      if (upstream.status === 429 || upstream.status === 529) {
        const retryAfter = upstream.headers.get("retry-after") || "30";
        return res.status(upstream.status)
          .set("retry-after", retryAfter)
          .json({error:{message:`Rate limited — retry after ${retryAfter}s`}});
      }

      if (!upstream.ok) {
        const errData = await upstream.json().catch(()=>({error:{message:`HTTP ${upstream.status}`}}));
        return res.status(upstream.status).json(errData);
      }

      // Stream pass-through
      if (stream !== false) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no");
        upstream.body.pipeTo(new WritableStream({
          write(chunk) { res.write(chunk); },
          close()      { res.end(); },
          abort(e)     { logger.error("Stream abort", {e: e?.message}); res.end(); },
        }));
      } else {
        const data = await upstream.json();
        res.json(data);
      }
    } catch(err) {
      logger.error("AI proxy error", {msg: err.message});
      res.status(500).json({error:{message: err.message}});
    }
  }
);

// Health check for AI service
router.get("/health", (req,res) => {
  res.json({
    status: "ok",
    service: "Cardio AI Ghana",
    version: "3.0.0",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

export default router;
