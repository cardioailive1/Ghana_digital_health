import { useState } from "react";

const LOGO = "data:image/png;base64,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";

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  async function handleLocal(e) {
    e.preventDefault();
    if (!email || !password) return setError("Email and password required");
    setLoading(true); setError(null);
    try {
      const res  = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      onLogin(data.user, data.token);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight:"100vh", fontFamily:"'DM Sans',system-ui,sans-serif",
      display:"flex", position:"relative", overflow:"hidden",
      background:"linear-gradient(135deg,#021830 0%,#031F3D 45%,#042550 75%,#021830 100%)",
    }}>

      {/* Grid overlay */}
      <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none",
        backgroundImage:"linear-gradient(rgba(41,133,198,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(41,133,198,.06) 1px,transparent 1px)",
        backgroundSize:"48px 48px" }} />

      {/* Orbs */}
      <div style={{ position:"absolute",top:"8%",left:"5%",width:360,height:360,borderRadius:"50%",background:"radial-gradient(circle,rgba(41,133,198,.2) 0%,transparent 70%)",zIndex:0,pointerEvents:"none" }} />
      <div style={{ position:"absolute",bottom:"10%",right:"4%",width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,rgba(72,194,251,.15) 0%,transparent 70%)",zIndex:0,pointerEvents:"none" }} />

      {/* Left branding panel */}
      <div className="login-left-panel" style={{ flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"60px 56px",position:"relative",zIndex:1 }}>

        {/* Logo + name */}
        <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:44 }}>
          <img src={LOGO} alt="Coverxis Technologies" style={{
            width:64,height:64,borderRadius:14,objectFit:"contain",
            background:"rgba(255,255,255,0.06)",padding:6,
            boxShadow:"0 4px 24px rgba(41,133,198,.45)",
            border:"1px solid rgba(41,133,198,.3)",
          }} />
          <div>
            <div style={{ fontSize:20,fontWeight:800,color:"#fff" }}>Cardio<span style={{ color:"#48C2FB" }}>AI</span></div>
            <div style={{ fontSize:11,color:"#2985C6",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase" }}>by Coverxis Technologies</div>
          </div>
        </div>

        <h1 style={{ fontSize:36,fontWeight:800,color:"#fff",lineHeight:1.2,marginBottom:16,letterSpacing:"-1px" }}>
          Ghana's Digital<br/>
          <span style={{ background:"linear-gradient(90deg,#48C2FB,#2985C6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>
            Health Platform
          </span>
        </h1>
        <p style={{ fontSize:14,color:"#4A6A8A",lineHeight:1.7,maxWidth:380,marginBottom:40 }}>
          AI-powered clinical decision support for Ghana's 2,070+ GHS facilities.
          Built for doctors, nurses, CHPS workers, and administrators.
        </p>

        {[
          { icon:"🧠", title:"Clinical AI Assistant",     desc:"84 Ghana STG 2023 prompts · WHO · ACC/AHA · ESC" },
          { icon:"📡", title:"IoMT Real-Time Monitoring", desc:"NEWS2 · SOFA · HELLP · PELOD-2 with auto-alerts" },
          { icon:"🏥", title:"NHIS Billing Automation",   desc:"ICD-11 auto-coding · NHIA submission · R-code fixes" },
          { icon:"🔐", title:"HIPAA · SOC 2 · RBAC",      desc:"9 roles · facility isolation · full audit trail" },
        ].map(f => (
          <div key={f.title} style={{ display:"flex",gap:14,marginBottom:20,alignItems:"flex-start" }}>
            <div style={{ width:40,height:40,borderRadius:10,flexShrink:0,background:"rgba(41,133,198,.12)",border:"1px solid rgba(41,133,198,.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>{f.icon}</div>
            <div>
              <div style={{ fontSize:13,fontWeight:700,color:"#E2E8F0",marginBottom:2 }}>{f.title}</div>
              <div style={{ fontSize:12,color:"#3A5A7A",lineHeight:1.5 }}>{f.desc}</div>
            </div>
          </div>
        ))}

        <div style={{ marginTop:32,paddingTop:24,borderTop:"1px solid rgba(255,255,255,.06)" }}>
          <div style={{ fontSize:11,color:"#2A4A6A",marginBottom:4 }}>Developed by</div>
          <div style={{ fontSize:14,fontWeight:800,color:"#2985C6",letterSpacing:".08em" }}>COVERXIS TECHNOLOGIES</div>
          <div style={{ fontSize:11,color:"#2A4A6A",marginTop:3 }}>Delaware C-Corp · cardioailive.com</div>
        </div>
      </div>

      {/* Right login card */}
      <div style={{ width:"100%",maxWidth:460,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",padding:"32px 24px",position:"relative",zIndex:1 }}>
        <div style={{
          width:"100%",background:"rgba(3,12,30,.9)",backdropFilter:"blur(24px)",
          border:"1px solid rgba(41,133,198,.25)",borderRadius:20,padding:"40px 36px",
          boxShadow:"0 32px 80px rgba(0,0,0,.7),0 0 0 1px rgba(72,194,251,.04)",
        }}>

          {/* Logo on card — always visible */}
          <div style={{ textAlign:"center",marginBottom:28 }}>
            <img src={LOGO} alt="Coverxis Technologies" style={{
              width:76,height:76,borderRadius:16,objectFit:"contain",
              background:"rgba(255,255,255,.05)",padding:8,
              boxShadow:"0 6px 28px rgba(41,133,198,.5)",
              border:"1px solid rgba(41,133,198,.3)",
              marginBottom:12,display:"block",margin:"0 auto 12px",
            }} />
            <div style={{ fontSize:22,fontWeight:800,color:"#fff" }}>Cardio<span style={{ color:"#48C2FB" }}>AI</span></div>
            <div style={{ fontSize:11,color:"#2985C6",fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",marginTop:2 }}>by Coverxis Technologies</div>
            <div style={{ fontSize:12,color:"#3A5A7A",marginTop:5 }}>Ghana Digital Health Platform</div>
          </div>

          {/* Badges */}
          <div style={{ display:"flex",justifyContent:"center",gap:5,marginBottom:22,flexWrap:"wrap" }}>
            {["HIPAA","SOC 2","RBAC","OAuth 2.0","FHIR R4"].map(b => (
              <span key={b} style={{ background:"rgba(2,18,48,.8)",border:"1px solid rgba(41,133,198,.3)",borderRadius:6,padding:"3px 8px",fontSize:10,color:"#2985C6",fontWeight:700 }}>{b}</span>
            ))}
          </div>

          {error && (
            <div style={{ background:"rgba(248,113,113,.08)",border:"1px solid rgba(153,27,27,.5)",borderLeft:"3px solid #F87171",borderRadius:8,padding:"10px 13px",color:"#FCA5A5",fontSize:13,marginBottom:16 }}>
              {error}
            </div>
          )}

          {/* Google */}
          <button style={{ width:"100%",padding:"11px",borderRadius:10,border:"1px solid rgba(255,255,255,.1)",fontWeight:600,fontSize:13,cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"#fff",color:"#1A1A1A" }}
            onClick={() => window.location.href="/auth/google"}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.17z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
            </svg>
            Continue with Google Workspace
          </button>

          {/* Microsoft */}
          <button style={{ width:"100%",padding:"11px",borderRadius:10,border:"none",fontWeight:600,fontSize:13,cursor:"pointer",marginBottom:22,display:"flex",alignItems:"center",justifyContent:"center",gap:10,background:"#0078D4",color:"#fff" }}
            onClick={() => window.location.href="/auth/microsoft"}>
            <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            Continue with Microsoft / Azure AD
          </button>

          {/* Divider */}
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:20 }}>
            <div style={{ flex:1,height:1,background:"rgba(41,133,198,.2)" }}/>
            <span style={{ fontSize:11,color:"#2A4A6A",whiteSpace:"nowrap" }}>or sign in with credentials</span>
            <div style={{ flex:1,height:1,background:"rgba(41,133,198,.2)" }}/>
          </div>

          {/* Form */}
          <form onSubmit={handleLocal}>
            <label style={{ display:"block",fontSize:11,fontWeight:700,color:"#4A6A8A",marginBottom:6,textTransform:"uppercase",letterSpacing:".08em" }}>Email Address</label>
            <input style={{ width:"100%",background:"rgba(2,12,32,.8)",border:"1px solid rgba(41,133,198,.3)",borderRadius:8,padding:"10px 12px",color:"#E2E8F0",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:14 }}
              type="email" value={email} onChange={e=>setEmail(e.target.value)}
              placeholder="you@hospital.cardioai.gh" required autoComplete="email"
              onFocus={e=>e.target.style.borderColor="#2985C6"}
              onBlur={e=>e.target.style.borderColor="rgba(41,133,198,.3)"}
            />
            <label style={{ display:"block",fontSize:11,fontWeight:700,color:"#4A6A8A",marginBottom:6,textTransform:"uppercase",letterSpacing:".08em" }}>Password</label>
            <input style={{ width:"100%",background:"rgba(2,12,32,.8)",border:"1px solid rgba(41,133,198,.3)",borderRadius:8,padding:"10px 12px",color:"#E2E8F0",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:20 }}
              type="password" value={password} onChange={e=>setPassword(e.target.value)}
              placeholder="••••••••••" required autoComplete="current-password"
              onFocus={e=>e.target.style.borderColor="#2985C6"}
              onBlur={e=>e.target.style.borderColor="rgba(41,133,198,.3)"}
            />
            <button
              type="submit"
              disabled={loading||!email||!password}
              style={{
                width:"100%",padding:"12px",borderRadius:10,border:"none",
                fontWeight:700,fontSize:14,
                cursor:loading||!email||!password?"default":"pointer",
                background:loading||!email||!password?"rgba(41,133,198,.2)":"linear-gradient(135deg,#2985C6,#1565C0)",
                color:"#fff",
                boxShadow:loading||!email||!password?"none":"0 4px 20px rgba(41,133,198,.45)",
              }}>
              {loading ? "Signing in…" : "Sign In →"}
            </button>
          </form>

          <div style={{ marginTop:20,padding:"14px",background:"rgba(2,15,38,.6)",borderRadius:10,border:"1px solid rgba(41,133,198,.15)",textAlign:"center" }}>
            <div style={{ fontSize:11,color:"#2A4A6A",lineHeight:1.7 }}>
              🔒 Sessions expire after <strong style={{ color:"#2985C6" }}>8 hours</strong> (HIPAA §164.312)<br/>
              All access is logged and audited (SOC 2 CC6)
            </div>
          </div>

          <div style={{ fontSize:11,color:"#1A3A5A",textAlign:"center",marginTop:12 }}>
            Demo: <code style={{ color:"#2985C6" }}>doctor@kbu.cardioai.gh</code> / <code style={{ color:"#2985C6" }}>CardioAI2026!</code>
          </div>
        </div>
      </div>

      <style>{`
        .login-left-panel { display: flex; }
        @media (max-width: 860px) { .login-left-panel { display: none !important; } }
      `}</style>
    </div>
  );
}
