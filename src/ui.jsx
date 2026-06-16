import { useState } from "react";
import { theme, statusConfig, roleConfig } from "./theme";

export function ANMLogo({ size=32 }) {
  return <img src="/anm-logo.jpeg" alt="ANM & Co." style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,background:"#fff",boxShadow:`0 2px 12px ${theme.accent}33`}}/>;
}
export function Avatar({ initials, size=36, color }) {
  const bg=color||theme.accent;
  return <div style={{width:size,height:size,borderRadius:"50%",background:`${bg}22`,border:`1.5px solid ${bg}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.34,fontWeight:700,color:bg,flexShrink:0,fontFamily:"monospace"}}>{initials}</div>;
}
export function Badge({ status }) {
  const cfg=statusConfig[status]||{label:status,color:theme.muted};
  return <span style={{fontSize:11,fontWeight:600,color:cfg.color,background:`${cfg.color}18`,border:`1px solid ${cfg.color}33`,borderRadius:20,padding:"2px 10px",letterSpacing:0.4,textTransform:"uppercase"}}>{cfg.dot} {cfg.label}</span>;
}
export function Card({ children, style }) {
  return <div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:14,padding:20,boxShadow:"0 1px 4px #00000009",...style}}>{children}</div>;
}
export function Button({ children, onClick, variant="primary", size="md", disabled, style }) {
  const base={cursor:disabled?"not-allowed":"pointer",border:"none",borderRadius:8,fontWeight:600,fontFamily:"inherit",transition:"all 0.15s",opacity:disabled?0.5:1};
  const p=size==="sm"?"6px 14px":"10px 22px"; const fp=size==="sm"?12:14;
  const V={primary:{background:theme.accent,color:"#fff",padding:p,fontSize:fp},success:{background:theme.green,color:"#fff",padding:p,fontSize:fp},danger:{background:theme.red,color:"#fff",padding:p,fontSize:fp},ghost:{background:"transparent",color:theme.muted,border:`1px solid ${theme.border}`,padding:size==="sm"?"5px 13px":"9px 21px",fontSize:fp},outline:{background:"transparent",color:theme.accent,border:`1px solid ${theme.accent}55`,padding:size==="sm"?"5px 13px":"9px 21px",fontSize:fp}};
  return <button onClick={disabled?undefined:onClick} style={{...base,...V[variant],...style}}>{children}</button>;
}
export function Input({ label, value, onChange, type="text", placeholder, required, style }) {
  return <div style={{display:"flex",flexDirection:"column",gap:6,...style}}>{label&&<label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase",letterSpacing:0.6}}>{label}{required&&<span style={{color:theme.red}}> *</span>}</label>}<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:8,padding:"10px 14px",color:theme.text,fontSize:14,outline:"none",fontFamily:"inherit"}}/></div>;
}
export function Sel({ label, value, onChange, options, style }) {
  return <div style={{display:"flex",flexDirection:"column",gap:6,...style}}>{label&&<label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase",letterSpacing:0.6}}>{label}</label>}<select value={value} onChange={e=>onChange(e.target.value)} style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:8,padding:"10px 14px",color:theme.text,fontSize:14,outline:"none",fontFamily:"inherit"}}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
}
export function Modal({ open, onClose, title, children, wide }) {
  if(!open) return null;
  return <div style={{position:"fixed",inset:0,background:"#00000055",backdropFilter:"blur(4px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:18,width:"100%",maxWidth:wide?820:520,maxHeight:"92vh",overflow:"auto",boxShadow:"0 24px 80px #00000022"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 24px",borderBottom:`1px solid ${theme.border}`,background:theme.surface,borderRadius:"18px 18px 0 0"}}><div style={{display:"flex",alignItems:"center",gap:10}}><ANMLogo size={24}/><h3 style={{margin:0,fontSize:16,fontWeight:700,color:theme.text}}>{title}</h3></div><button onClick={onClose} style={{background:"none",border:"none",color:theme.muted,cursor:"pointer",fontSize:20,lineHeight:1}}>✕</button></div><div style={{padding:24}}>{children}</div></div></div>;
}
export function Row({ k, v }) {
  return <div style={{display:"flex",gap:8,fontSize:13}}><span style={{color:theme.muted,width:110,flexShrink:0}}>{k}</span><span style={{color:theme.text}}>{v}</span></div>;
}
export function Textarea({ value, onChange, rows=2, placeholder }) {
  return <textarea value={value} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder} style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:8,padding:"10px 14px",color:theme.text,fontSize:14,resize:"vertical",fontFamily:"inherit",outline:"none",width:"100%",boxSizing:"border-box"}}/>;
}
export const fmt = d => d ? new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "—";

// ════════════════════════════════════════════════════════════════════════════
// v4 ENHANCEMENT COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

// Inject keyframe animations once
if (typeof document !== "undefined" && !document.getElementById("anm-anim")) {
  const s = document.createElement("style");
  s.id = "anm-anim";
  s.textContent = `
    @keyframes anmFadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    @keyframes anmShimmer { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
    @keyframes anmPop { 0% { transform:scale(0.8); } 50% { transform:scale(1.15); } 100% { transform:scale(1); } }
    @keyframes anmConfettiFall { 0% { transform:translateY(-10px) rotate(0deg); opacity:1; } 100% { transform:translateY(100vh) rotate(720deg); opacity:0; } }
    .anm-fade { animation: anmFadeUp 0.4s ease both; }
    .anm-tap:active { transform: scale(0.96); }
    .anm-skel { background: linear-gradient(90deg, #ECE8E0 25%, #F5F2EC 50%, #ECE8E0 75%); background-size: 800px 100%; animation: anmShimmer 1.3s infinite linear; border-radius: 8px; }
  `;
  document.head.appendChild(s);
}

// Photo-aware avatar (shows image if photo_url, else initials)
export function PhotoAvatar({ user, size=36 }) {
  const bg = themeColorForRole(user?.role);
  if (user?.photo_url) {
    return <img src={user.photo_url} alt={user.name} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", border:`1.5px solid ${bg}55`, flexShrink:0 }}/>;
  }
  return <div style={{ width:size, height:size, borderRadius:"50%", background:`${bg}22`, border:`1.5px solid ${bg}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.34, fontWeight:700, color:bg, flexShrink:0, fontFamily:"monospace" }}>{user?.avatar||"?"}</div>;
}
function themeColorForRole(role) {
  return { member:theme.accent, lead:theme.purple, hr:theme.green, admin:theme.amber }[role] || theme.accent;
}

// Circular progress ring (for leave balances)
export function ProgressRing({ value, total, size=72, label, color=theme.accent }) {
  const pct = total>0 ? Math.max(0, Math.min(1, value/total)) : 0;
  const r = (size-10)/2, c = 2*Math.PI*r, off = c*(1-pct);
  return (
    <div style={{ position:"relative", width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={theme.border} strokeWidth={6}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition:"stroke-dashoffset 0.6s ease" }}/>
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontWeight:800, fontSize:size*0.26, color }}>{value}</div>
        {label && <div style={{ fontSize:size*0.13, color:theme.muted, marginTop:-2 }}>{label}</div>}
      </div>
    </div>
  );
}

// Skeleton loader block
export function Skeleton({ h=16, w="100%", style }) {
  return <div className="anm-skel" style={{ height:h, width:w, ...style }}/>;
}

// Empty state
export function EmptyState({ icon="📭", title="Nothing here yet", subtitle }) {
  return <div style={{ textAlign:"center", padding:"40px 20px", color:theme.muted }}>
    <div style={{ fontSize:44, marginBottom:12, opacity:0.7 }}>{icon}</div>
    <div style={{ fontWeight:700, fontSize:15, color:theme.text, marginBottom:4 }}>{title}</div>
    {subtitle && <div style={{ fontSize:13 }}>{subtitle}</div>}
  </div>;
}

// Confetti burst (fires once on mount)
export function Confetti() {
  const colors = [theme.accent, theme.green, theme.purple, theme.amber, "#FF6B9D", "#4ECDC4"];
  const pieces = Array.from({length:40});
  return <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:99999, overflow:"hidden" }}>
    {pieces.map((_,i)=>{
      const left=Math.random()*100, delay=Math.random()*0.4, dur=1.6+Math.random()*1.2, size=6+Math.random()*8, col=colors[i%colors.length];
      return <div key={i} style={{ position:"absolute", left:`${left}%`, top:-20, width:size, height:size*1.4, background:col, borderRadius:2, animation:`anmConfettiFall ${dur}s ${delay}s ease-in forwards` }}/>;
    })}
  </div>;
}

// Pull-to-refresh wrapper (mobile)
export function PullToRefresh({ onRefresh, children }) {
  return <div style={{ position:"relative" }} data-ptr>{children}</div>;
}
