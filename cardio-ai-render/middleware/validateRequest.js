// ============================================================
// validateRequest — schema validation middleware
// Prevents malformed or oversized payloads reaching handlers
// SOC 2 CC6.6 / HIPAA Technical Safeguard
// ============================================================
import logger from "../server/logger.js";

/**
 * validate(schema)
 * schema: { body: {field: {type, required, maxLength, min, max}}, ... }
 * Usage: router.post("/chat", validate({body:{messages:{type:"array",required:true}}}), handler)
 */
export function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    function checkField(value, name, rules) {
      if (rules.required && (value === undefined || value === null || value === "")) {
        errors.push(`${name} is required`);
        return;
      }
      if (value === undefined || value === null) return;

      if (rules.type === "string" && typeof value !== "string") {
        errors.push(`${name} must be a string`);
      }
      if (rules.type === "array" && !Array.isArray(value)) {
        errors.push(`${name} must be an array`);
      }
      if (rules.type === "number" && typeof value !== "number") {
        errors.push(`${name} must be a number`);
      }
      if (rules.maxLength && typeof value === "string" && value.length > rules.maxLength) {
        errors.push(`${name} exceeds max length of ${rules.maxLength}`);
      }
      if (rules.maxItems && Array.isArray(value) && value.length > rules.maxItems) {
        errors.push(`${name} exceeds max ${rules.maxItems} items`);
      }
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${name} must be >= ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${name} must be <= ${rules.max}`);
      }
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${name} must be one of: ${rules.enum.join(", ")}`);
      }
      if (rules.pattern && typeof value === "string" && !rules.pattern.test(value)) {
        errors.push(`${name} has invalid format`);
      }
    }

    if (schema.body) {
      for (const [field, rules] of Object.entries(schema.body)) {
        checkField(req.body?.[field], `body.${field}`, rules);
      }
    }
    if (schema.params) {
      for (const [field, rules] of Object.entries(schema.params)) {
        checkField(req.params?.[field], `params.${field}`, rules);
      }
    }
    if (schema.query) {
      for (const [field, rules] of Object.entries(schema.query)) {
        checkField(req.query?.[field], `query.${field}`, rules);
      }
    }

    if (errors.length > 0) {
      logger.warn("Validation failed", { path: req.path, errors, reqId: req.requestId });
      return res.status(400).json({ error: "Validation failed", details: errors });
    }
    next();
  };
}

// Pre-built schema for the AI chat endpoint
export const chatSchema = {
  body: {
    messages: { type: "array", required: true, maxItems: 50 },
    model:     { type: "string", maxLength: 60 },
    max_tokens:{ type: "number", min: 1, max: 4096 },
  },
};

// Pre-built schema for role update
export const roleUpdateSchema = {
  body: {
    role: {
      type: "string", required: true,
      enum: ["super_admin","medical_director","doctor","nurse","lab_tech","pharmacist","chps_worker","admin","viewer"],
    },
    facilityId:   { type: "string", maxLength: 20 },
    facilityName: { type: "string", maxLength: 100 },
  },
  params: {
    email: { type: "string", required: true, maxLength: 254 },
  },
};
