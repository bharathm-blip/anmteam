import { useState } from "react";
import { theme, statusConfig, roleConfig } from "./theme";

export function ANMLogo({ size=32 }) {
  return <div style={{width:size,height:size,borderRadius:8,background:`linear-gradient(135deg,${theme.accent},${theme.accentLight})`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:size*0.36,color:"#fff",flexShrink:0,letterSpacing:-0.5,fontFamily:"Georgia,serif",boxShadow:`0 2px 12px ${theme.accent}44`}}>ANM</div>;
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
