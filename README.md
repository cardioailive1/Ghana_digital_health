# Cardio AI Ghana Digital Health Platform v3.0
### Render.com Deployment | HIPAA · SOC 2 · OAuth 2.0 · RBAC

## Quick Deploy to Render.com

1. Push this repo to GitHub
2. In Render Dashboard → **New Web Service** → connect repo
3. Set **Build Command**: `npm install && npm run build`
4. Set **Start Command**: `npm start`
5. Add Environment Variables (see below)

## Required Environment Variables (Render Dashboard → Environment)

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `JWT_SECRET` | 256-bit random string (generate: `openssl rand -hex 32`) |
| `SESSION_SECRET` | Random string |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `MICROSOFT_CLIENT_ID` | Azure AD App Client ID |
| `MICROSOFT_CLIENT_SECRET` | Azure AD Client Secret |
| `MICROSOFT_TENANT_ID` | `common` or your tenant ID |
| `CLIENT_URL` | `https://your-app.onrender.com` |
| `ALLOWED_ORIGINS` | `https://your-app.onrender.com` |

## OAuth Setup

### Google Workspace
1. GCP Console → APIs & Services → Credentials → OAuth 2.0 Client ID
2. Authorized redirect URI: `https://your-app.onrender.com/auth/google/callback`
3. For hospital SSO: enable Google Workspace domain restriction

### Microsoft Azure AD
1. Azure Portal → App Registrations → New Registration
2. Redirect URI: `https://your-app.onrender.com/auth/microsoft/callback`
3. Set Tenant ID to your hospital's Azure AD tenant for single-tenant mode

## Project Structure

```
cardio-ai-render/
├── server/
│   ├── index.js          # Express server — all middleware
│   ├── auth.js           # JWT + bcrypt + OAuth upsert
│   ├── rbac.js           # 9 roles × 24 permissions
│   ├── security.js       # Helmet + CORS + rate limits + CSP
│   ├── logger.js         # HIPAA-safe winston logger (PHI stripped)
│   └── routes/
│       ├── auth.routes.js  # /auth/* — login, OAuth, me, users
│       └── ai.routes.js    # /api/chat — AI proxy with PHI controls
├── src/
│   ├── App.jsx             # Clinical AI (auth-wrapped, 84 prompts)
│   ├── main.jsx
│   └── components/
│       ├── Login.jsx       # OAuth + local login page
│       └── RBAC.jsx        # RBACBadge, UserHeader, PermissionGate
├── public/
│   ├── platform.html       # Full Ghana Digital Health Platform (1.1MB)
│   └── favicon.svg
├── render.yaml             # Render.com auto-deploy config
├── vite.config.js
├── package.json
└── .env.example
```

## Security Architecture

### HIPAA (45 CFR §164)
- **§164.312(a)(2)(iii)** Automatic logoff: 8-hour JWT expiry enforced server-side
- **§164.312(b)** Audit controls: every API call logged (user, facility, resource, outcome)
- **§164.312(c)(1)** Integrity: HMAC-SHA256 on IoMT data streams
- **§164.312(d)** Person authentication: OAuth 2.0 + bcrypt local auth
- **§164.312(e)(1)** Transmission security: TLS 1.3 enforced by Render; HTTPS-only CSP
- **PHI minimum necessary**: patient context stripped from AI if user lacks `phi:read`
- **PHI in logs**: PHI patterns redacted from all log output (18 HIPAA identifiers)

### SOC 2 Trust Service Criteria
- **CC6.1** Logical access: RBAC 9 roles × 24 permissions, facility isolation
- **CC6.2** New access: OAuth auto-register as VIEWER; admin promotes
- **CC6.3** Access removal: JWT invalidated on logout; 8h expiry
- **CC6.6** Threats: rate limiting (10 login/15min, 30 AI/min, 100 global/min)
- **CC6.7** Encryption: bcrypt passwords, JWT RS256-ready, TLS 1.3
- **CC7.2** System monitoring: Winston audit log, request IDs, Morgan HTTP log
- **CC8.1** Change management: version-controlled deployment via GitHub→Render

### Cybersecurity
- **Helmet.js**: CSP, HSTS (1yr + preload), X-Frame-Options DENY, noSniff
- **CORS**: strict allow-list in production
- **HPP**: HTTP parameter pollution prevention
- **Input sanitisation**: null byte stripping, payload size limit (2MB), depth limit
- **Rate limiting**: tiered (auth / AI / global)
- **Request IDs**: full traceability across logs
- **No stack traces**: error details hidden from client in production
- **Cookie security**: httpOnly + secure + sameSite=strict

## Demo Credentials

| Email | Password | Role | Facility |
|---|---|---|---|
| `doctor@kbu.cardioai.gh` | `CardioAI2026!` | Doctor | Korle Bu |
| `nurse@kbu.cardioai.gh` | `CardioAI2026!` | Nurse | Korle Bu |
| `admin@kat.cardioai.gh` | `CardioAI2026!` | Medical Director | KATH |
| `lab@tth.cardioai.gh` | `CardioAI2026!` | Lab Tech | TTH |
| `superadmin@cardioai.gh` | `CardioAI2026!` | Super Admin | All |

## RBAC Roles

| Role | Key Permissions |
|---|---|
| `super_admin` | All permissions, all facilities |
| `medical_director` | All clinical + user management, own facility |
| `doctor` | Full clinical access, prescribing, PHI read/write |
| `nurse` | EHR read/write, vitals, IoMT alerts, no prescribing |
| `lab_tech` | Lab results entry, PHI read only |
| `pharmacist` | EHR read, NHIS submission, no prescribing |
| `chps_worker` | CHPS module, EHR read/write, no NHIS |
| `admin` | User management, audit log, no PHI |
| `viewer` | Reports only, no PHI |
