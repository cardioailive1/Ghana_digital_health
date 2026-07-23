import { useState } from "react";
const S = {
  page:{minHeight:"100vh",background:"#050E1A",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',system-ui,sans-serif"},
  card:{width:"100%",maxWidth:420,background:"#071228",border:"1px solid #1A2F55",borderRadius:14,padding:"36px 32px",boxShadow:"0 24px 64px rgba(0,0,0,.5)"},
  logoText:{fontSize:26,fontWeight:800,color:"#90CAF9"},
  logoSub:{fontSize:12,color:"#475569",marginTop:4,textAlign:"center"},
  label:{display:"block",fontSize:12,fontWeight:600,color:"#94A3B8",marginBottom:5,textTransform:"uppercase",letterSpacing:".05em"},
  input:{width:"100%",background:"#0B1E3D",border:"1px solid #1E3A6E",borderRadius:8,padding:"10px 12px",color:"#E2E8F0",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:14},
  btn:{width:"100%",padding:"11px",borderRadius:8,border:"none",fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:10},
  error:{background:"rgba(248,113,113,.1)",border:"1px solid #991B1B",borderRadius:8,padding:"10px 13px",color:"#FCA5A5",fontSize:13,marginBottom:14},
  badge:{display:"inline-block",background:"#071C3A",border:"1px solid #1E3A6E",borderRadius:6,padding:"2px 8px",fontSize:10,color:"#4A90D9",marginRight:4},
};
export default function Login({onLogin}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  async function handleLocal(e){
    e.preventDefault();
    if(!email||!password)return setError("Email and password required");
    setLoading(true);setError(null);
    try{
      const res=await fetch("/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({email:email.trim(),password})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"Login failed");
      localStorage.setItem("cai_token",data.token);
      onLogin(data.user,data.token);
    }catch(e){setError(e.message);}finally{setLoading(false);}
  }
  return(
    <div style={S.page}>
      <div style={S.card}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={S.logoText}>Cardio<span style={{color:"#fff"}}>AI</span></div>
          <div style={S.logoSub}>Ghana Digital Health Platform</div>
          <div style={{marginTop:10}}>
            {["HIPAA","SOC 2","RBAC","OAuth 2.0"].map(b=><span key={b} style={S.badge}>{b}</span>)}
          </div>
        </div>
        {error&&<div style={S.error}>{error}</div>}
        <button style={{...S.btn,background:"#fff",color:"#1A1A1A"}} onClick={()=>window.location.href="/auth/google"}>
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.17z"/><path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/><path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/><path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/></svg>
          Continue with Google Workspace
        </button>
        <button style={{...S.btn,background:"#0078D4",color:"#fff"}} onClick={()=>window.location.href="/auth/microsoft"}>
          <svg width="18" height="18" viewBox="0 0 21 21" fill="none"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>
          Continue with Microsoft / Azure AD
        </button>
        <div style={{display:"flex",alignItems:"center",gap:10,margin:"18px 0",color:"#2D3748",fontSize:12}}>
          <div style={{flex:1,height:1,background:"#1A2F55"}}/><span>or credentials</span><div style={{flex:1,height:1,background:"#1A2F55"}}/>
        </div>
        <form onSubmit={handleLocal}>
          <label style={S.label}>Email</label>
          <input style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@hospital.cardioai.gh" required autoComplete="email"/>
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••" required autoComplete="current-password"/>
          <button style={{...S.btn,background:loading||!email||!password?"#1A2F55":"#1565C0",color:"#fff"}} type="submit" disabled={loading||!email||!password}>
            {loading?"Signing in…":"Sign In"}
          </button>
        </form>
        <div style={{fontSize:11,color:"#334155",textAlign:"center",marginTop:16,lineHeight:1.6}}>
          Sessions expire after 8 hours (HIPAA §164.312).<br/>All access audited (SOC 2 CC6). PHI protected per DPA 2012.
        </div>
        <div style={{fontSize:11,color:"#1E3A6E",textAlign:"center",marginTop:8}}>
          Demo: <code style={{color:"#4A90D9"}}>doctor@kbu.cardioai.gh</code> / <code style={{color:"#4A90D9"}}>CardioAI2026!</code>
        </div>
      </div>
    </div>
  );
}
