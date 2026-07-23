// RBACBadge — shows role, facility, permissions chip
export function RBACBadge({user}){
  const roleColors={
    super_admin:"#7C3AED",medical_director:"#1565C0",doctor:"#0D7377",
    nurse:"#854D0E",lab_tech:"#065F46",pharmacist:"#9A3412",
    chps_worker:"#1E3A8A",admin:"#374151",viewer:"#475569"
  };
  const c=roleColors[user?.role]||"#475569";
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:5,
      background:c+"22",border:`1px solid ${c}`,borderRadius:8,
      padding:"2px 10px",fontSize:11,fontWeight:700,color:c}}>
      {(user?.role||"unknown").replace(/_/g," ").toUpperCase()}
      {user?.facilityName&&<span style={{color:"#64748B",fontWeight:400}}> · {user.facilityName}</span>}
    </span>
  );
}

// UserHeader — top bar showing user, role, facility, logout
export function UserHeader({user,onLogout,onOpenPlatform}){
  return(
    <div style={{background:"#071228",borderBottom:"1px solid #1A2F55",
      padding:"6px 16px",display:"flex",alignItems:"center",gap:10,
      fontFamily:"'DM Sans',system-ui,sans-serif",fontSize:13,flexWrap:"wrap"}}>
      <span style={{fontWeight:800,fontSize:14,color:"#90CAF9"}}>
        Cardio<span style={{color:"#fff"}}>AI</span>
      </span>
      <span style={{color:"#475569"}}>|</span>
      <RBACBadge user={user}/>
      <span style={{color:"#475569",fontSize:12}}>{user?.name}</span>
      <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
        <button onClick={onOpenPlatform}
          style={{background:"#0B1E3D",border:"1px solid #1A2F55",color:"#90CAF9",
            borderRadius:6,padding:"3px 10px",fontSize:11,cursor:"pointer",
            fontFamily:"'DM Mono',monospace"}}>
          🏥 Ghana Digital Health Platform
        </button>
        <button onClick={onLogout}
          style={{background:"transparent",border:"1px solid #2D3748",color:"#64748B",
            borderRadius:6,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

// PermissionGate — renders children only if user has permission
export function PermissionGate({user,permission,children,fallback=null}){
  const ROLE_PERMS={
    super_admin:["*"],
    medical_director:["ai:chat","ai:patient_context","phi:read","phi:write","phi:export","ehr:read","ehr:write","lab:read","lab:write","prescribe","nhis:submit","nhis:approve","iomt:view","iomt:acknowledge","reports:view","reports:export","users:manage","audit:view","facility:manage"],
    doctor:["ai:chat","ai:patient_context","phi:read","phi:write","ehr:read","ehr:write","lab:read","prescribe","nhis:submit","iomt:view","iomt:acknowledge","reports:view"],
    nurse:["ai:chat","phi:read","phi:write","ehr:read","ehr:write","lab:read","nhis:submit","iomt:view","iomt:acknowledge"],
    lab_tech:["ai:chat","phi:read","lab:read","lab:write"],
    pharmacist:["ai:chat","phi:read","ehr:read","lab:read","nhis:submit"],
    chps_worker:["ai:chat","phi:read","phi:write","ehr:read","ehr:write","chps:access","iomt:view"],
    admin:["platform:admin","users:manage","audit:view","facility:manage","reports:view"],
    viewer:["reports:view"],
  };
  const perms=ROLE_PERMS[user?.role]||[];
  const has=perms.includes("*")||perms.includes(permission);
  return has?children:fallback;
}
