import { useState, useEffect, useRef } from "react";
import { useAuth } from "./context/AuthContext";
import { LoginScreen, PasswordResetScreen } from "./Auth";
import { theme, COMPANY as DEFAULT_COMPANY, roleConfig } from "./theme";
import { ANMLogo, Avatar, Badge, Card, Button, Input, Sel, Modal, Row, Textarea, fmt, PhotoAvatar, ProgressRing, Skeleton, EmptyState, Confetti } from "./ui";
import { useProfiles, useAttendance, useLeaves, useReimbursements, useNotifications, useLeaveTypes, useLeaveQuotas, useCompanySettings, useDesignations, sendWhatsApp, uploadAttachment, createEmployee, generateDailySummary, uploadAvatar, updateMyProfile, postToBasecamp, basecampAutoMatch } from "./hooks/useData";
import { exportCSV, exportPDF } from "./export";
import { ManagementDashboard, AIAssistant, TeamCalendar } from "./Management";

const todayStr = () => new Date().toISOString().split("T")[0];
const nowTime = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const greeting = () => { const h=new Date().getHours(); if(h<12) return {text:"Good morning",emoji:"☀️"}; if(h<17) return {text:"Good afternoon",emoji:"🌤️"}; return {text:"Good evening",emoji:"🌙"}; };

export default function App() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Splash/>;
  if (!session) return <LoginScreen/>;
  if (profile?.must_reset_pw) return <PasswordResetScreen/>;
  if (!profile) return <Splash text="Loading your profile…"/>;
  if (profile.active === false) return <InactiveScreen/>;
  return <Portal/>;
}

function Splash({ text="Loading…" }) {
  return <div style={{minHeight:"100vh",background:theme.navy,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"'DM Sans',sans-serif"}}><ANMLogo size={56}/><div style={{color:"#9AA3BF",fontSize:14}}>{text}</div></div>;
}
function InactiveScreen() {
  const { logout } = useAuth();
  return <div style={{minHeight:"100vh",background:theme.navy,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"'DM Sans',sans-serif",padding:20,textAlign:"center"}}><ANMLogo size={56}/><div style={{color:"#fff",fontSize:18,fontWeight:700}}>Account Inactive</div><div style={{color:"#9AA3BF",fontSize:14,maxWidth:360}}>Your account has been deactivated. Please contact the administrator if you believe this is an error.</div><Button onClick={logout}>Sign Out</Button></div>;
}

function Portal() {
  const { profile: me, logout } = useAuth();
  const { users, updateRole, updatePhone, updateProfile, setActive, setLead } = useProfiles();
  const { attendance, login: attLogin, logout: attLogout, review: reviewAtt, reset: resetAtt } = useAttendance();
  const { leaves, submit: submitLeave, review: reviewLeave, cancel: cancelLeave } = useLeaves();
  const { reimbursements, submit: submitReimb, review: reviewReimb, cancel: cancelReimb } = useReimbursements();
  const { notifications, markAllRead } = useNotifications(me.id);
  const { leaveTypes, allLeaveTypes, addType, updateType, removeType } = useLeaveTypes();
  const { quotas, setQuota } = useLeaveQuotas();
  const { settings, updateSettings } = useCompanySettings();
  const { designations, allDesignations, addDesignation, updateDesignation, removeDesignation } = useDesignations();

  const COMPANY = settings || DEFAULT_COMPANY;

  const [tab, setTab]         = useState("dashboard");
  const [liveTime, setLiveTime] = useState(new Date());
  const [modal, setModal]     = useState(null);
  const [toast, setToast]     = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  const tickRef = useRef();

  const celebrate = () => { setConfetti(true); setTimeout(()=>setConfetti(false), 3000); };

  useEffect(()=>{ const onResize=()=>setIsMobile(window.innerWidth<768); window.addEventListener("resize",onResize); return()=>window.removeEventListener("resize",onResize); },[]);

  // Celebrate when an approval notification arrives
  const prevNotifCount = useRef(null);
  useEffect(()=>{
    const approvals = notifications.filter(n=>!n.read && /approved/i.test(n.message));
    if(prevNotifCount.current !== null && approvals.length > prevNotifCount.current) celebrate();
    prevNotifCount.current = approvals.length;
  },[notifications]);

  useEffect(()=>{ tickRef.current=setInterval(()=>setLiveTime(new Date()),1000); return()=>clearInterval(tickRef.current); },[]);
  useEffect(()=>{ if(toast){const t=setTimeout(()=>setToast(null),3400);return()=>clearTimeout(t);} },[toast]);
  const showToast=(msg,type="success")=>setToast({msg,type});

  const unread = notifications.filter(n=>!n.read).length;
  const getUser = id => users.find(u=>u.id===id);
  const activeUsers = users.filter(u=>u.active !== false);

  const myAttend = attendance.filter(a=>a.user_id===me.id);
  const todayLog = myAttend.find(a=>a.date===todayStr());
  const myLeaves = leaves.filter(l=>l.user_id===me.id);
  const myReimbs = reimbursements.filter(r=>r.user_id===me.id);

  // Pending queues — lead sees their assigned employees (by assigned_lead_id OR same team fallback)
  // ── Approval routing ───────────────────────────────────────────────────
  // Attendance & Leave: two-step. Staff → pending_lead (their lead recommends) → pending_hr (management approves).
  //                     Lead own attendance/leave → pending_hr directly (management approves).
  // A lead recommends items at pending_lead from THEIR assigned staff.
  // HR/Admin can also act on pending_lead items whose submitter has NO assigned lead (fallback, nothing gets stuck).
  const iLeadFor = (submitterId) => {
    const sub = getUser(submitterId);
    if (!sub || sub.role !== "member") return false;
    if (me.role === "lead") {
      // staff who report to me, OR unled staff on my team (fallback so nothing is stuck)
      return sub.assigned_lead_id === me.id || (!sub.assigned_lead_id && sub.team === me.team);
    }
    // HR & Admin can recommend for orphaned staff (no lead assigned anywhere)
    if (me.role === "hr" || me.role === "admin") return !sub.assigned_lead_id;
    return false;
  };
  const canApproveHR = me.role === "hr" || me.role === "admin"; // admin acts as management too
  const pendAttLead   = ["lead","hr","admin"].includes(me.role) ? attendance.filter(a=>a.status==="pending_lead" && iLeadFor(a.user_id)) : [];
  const pendAttHR     = canApproveHR ? attendance.filter(a=>a.status==="pending_hr") : [];
  const pendAtt       = [...pendAttLead, ...pendAttHR];
  const pendLeaveLead = ["lead","hr","admin"].includes(me.role) ? leaves.filter(l=>l.status==="pending_lead" && iLeadFor(l.user_id)) : [];
  const pendLeaveHR   = canApproveHR ? leaves.filter(l=>l.status==="pending_hr") : [];
  const pendLeave     = [...pendLeaveLead, ...pendLeaveHR];
  // Reimbursement: lead recommends items assigned to them; HR/Admin approves items at pending_hr
  const pendReimbLead = me.role==="lead" ? reimbursements.filter(r=>r.status==="pending_lead" && r.assigner_id===me.id) : [];
  const pendReimbHR   = canApproveHR ? reimbursements.filter(r=>r.status==="pending_hr") : [];
  const pendReimb = [...pendReimbLead, ...pendReimbHR];
  const totalPending = pendAtt.length+pendLeave.length+pendReimb.length;

  const isReportRole = ["hr","admin"].includes(me.role);

  // ── Actions ───────────────────────────────────────────────────────────
  const doLogin = async (note) => {
    if(todayLog){ showToast("Already logged in today!","error"); return; }
    const { error } = await attLogin(me.id, note, me.role);
    showToast(error?error.message:`Login recorded at ${nowTime()}! Pending approval.`, error?"error":"success");
    setModal(null);
  };
  const doLogout = async () => {
    if(!todayLog){ showToast("Please log in first.","error"); return; }
    if(todayLog.logout_time){ showToast("Already logged out today.","error"); return; }
    const { error } = await attLogout(todayLog.id);
    showToast(error?error.message:`Logout recorded at ${nowTime()}!`, error?"error":"success");
  };
  const doReviewAtt = async (row,action,remark) => {
    const { finalDecision } = await reviewAtt(row,action,remark);
    if(finalDecision) showToast(action==="hr_approve"?"Attendance approved!":"Attendance rejected.", action==="hr_approve"?"success":"error");
    else showToast(action.includes("approve")?"Recommended for Management!":"Rejected.", action.includes("approve")?"success":"error");
    setModal(null);
  };
  // ── Basecamp mention helpers ────────────────────────────────────────────
  const bcId = (u) => u && u.basecamp_person_id;
  const mgmtBcIds = () => users.filter(u=>["hr","admin"].includes(u.role) && u.active!==false).map(bcId).filter(Boolean);

  const doSubmitLeave = async (data) => {
    const lead = getUser(me.assigned_lead_id);
    const hr=users.find(u=>u.role==="hr");
    const { error } = await submitLeave(me.id, lead?.id, hr?.id, data, me.role);
    if(!error){
      // notify the pool lead (or management directly if the submitter is a lead)
      const targets = me.role==="member" ? [bcId(lead)] : mgmtBcIds();
      postToBasecamp(`📅 ${me.name} applied for ${data.type}`, `${data.from} → ${data.to} (${data.days} day(s)) · ${data.reason}`, targets);
    }
    showToast(error?error.message:"Leave application submitted!", error?"error":"success"); setModal(null);
  };
  const doReviewLeave = async (row,action,comment) => {
    const { finalDecision } = await reviewLeave(row,action,comment);
    const applicant = getUser(row.user_id);
    if(action==="lead_approve"){
      // recommended → notify admin/HR/management
      postToBasecamp(`✅ ${me.name} recommended a leave request`, `${applicant?.name}'s ${row.type} (${row.from_date} → ${row.to_date}) awaits Management approval.`, mgmtBcIds());
    } else if(finalDecision){
      // approved/rejected → notify the applicant
      const word = action==="hr_approve" ? "APPROVED ✅" : "REJECTED ❌";
      postToBasecamp(`Leave ${word} — ${applicant?.name}`, `${row.type} · ${row.from_date} → ${row.to_date}${comment?` · Note: ${comment}`:""}`, [bcId(applicant)]);
    }
    if(finalDecision) showToast(action==="hr_approve"?"Leave approved!":"Leave rejected.", action==="hr_approve"?"success":"error");
    else showToast(action.includes("approve")?"Recommended for Management!":"Rejected.", action.includes("approve")?"success":"error");
    setModal(null);
  };
  const doSubmitReimb = async (data) => {
    const { error } = await submitReimb(me.id, data);
    if(!error){
      const assigner = getUser(data.assignerId);
      // notify the work-assigner (lead → recommends; HR/mgmt → approves directly)
      postToBasecamp(`🧾 ${me.name} submitted an expense claim of ₹${Number(data.amount).toLocaleString("en-IN")}`, `${data.category} · ${data.description} · assigned by ${assigner?.name||"—"}`, [bcId(assigner)]);
    }
    showToast(error?error.message:"Expense claim submitted!", error?"error":"success"); setModal(null);
  };
  const doReviewReimb = async (row,action,comment) => {
    const { finalDecision } = await reviewReimb(row,action,comment);
    const applicant = getUser(row.user_id);
    if(action==="lead_approve"){
      postToBasecamp(`✅ ${me.name} recommended an expense claim`, `${applicant?.name}'s ₹${Number(row.amount).toLocaleString("en-IN")} (${row.category}) awaits Management approval.`, mgmtBcIds());
    } else if(finalDecision){
      const word = action==="hr_approve" ? "APPROVED ✅" : "REJECTED ❌";
      postToBasecamp(`Reimbursement ${word} — ${applicant?.name}`, `₹${Number(row.amount).toLocaleString("en-IN")} · ${row.category}${comment?` · Note: ${comment}`:""}`, [bcId(applicant)]);
    }
    if(finalDecision) showToast(action==="hr_approve"?"Reimbursement approved!":"Claim rejected.", action==="hr_approve"?"success":"error");
    else showToast(action.includes("approve")?"Recommended for Management!":"Rejected.", action.includes("approve")?"success":"error");
    setModal(null);
  };
  const doCancelLeave = async (row) => {
    const { error } = await cancelLeave(row);
    showToast(error?error.message:"Leave application cancelled.", error?"error":"success");
    setModal(null);
  };
  const doCancelReimb = async (row) => {
    const { error } = await cancelReimb(row);
    showToast(error?error.message:"Expense claim cancelled.", error?"error":"success");
    setModal(null);
  };
  const doResetAttendance = async (row) => {
    const { error } = await resetAtt(row.id, row.user_id);
    showToast(error?error.message:"Attendance reset. Employee can punch again.", error?"error":"success");
    setModal(null);
  };

  const tabs=[
    {id:"dashboard",label:"Dashboard",icon:"⊞"},
    ...(isReportRole?[{id:"overview",label:"Overview",icon:"📈"}]:[]),
    {id:"attendance",label:"Attendance",icon:"🕐"},
    {id:"leaves",label:"Leaves",icon:"📅"},
    {id:"reimb",label:"Expenses",icon:"🧾"},
    ...(["lead","hr","admin"].includes(me.role)?[{id:"approvals",label:"Approvals",icon:"✅",badge:totalPending}]:[]),
    ...(isReportRole?[{id:"calendar",label:"Calendar",icon:"📆"}]:[]),
    ...(isReportRole?[{id:"assistant",label:"Assistant",icon:"🤖"}]:[]),
    ...(isReportRole?[{id:"reports",label:"Reports",icon:"📊"}]:[]),
    ...(me.role==="admin"?[{id:"admin",label:"Admin",icon:"⚙"}]:[]),
    {id:"profile",label:"Profile",icon:"👤"},
  ];

  return <div style={{minHeight:"100vh",background:theme.bg,fontFamily:"'DM Sans','Segoe UI',sans-serif",color:theme.text,display:"flex",flexDirection:"column",paddingBottom:isMobile?72:0}}>
    {/* Header — compact on mobile, clears the phone status bar via safe-area */}
    <div style={{background:theme.navy,borderBottom:`1px solid ${theme.navyMid}`,padding:isMobile?"0 12px":"0 24px",paddingTop:isMobile?"env(safe-area-inset-top)":0,display:"flex",alignItems:"center",gap:isMobile?8:14,height:isMobile?"calc(56px + env(safe-area-inset-top))":62,position:"sticky",top:0,zIndex:100}}>
      <ANMLogo size={isMobile?30:34}/>
      <div style={{lineHeight:1.2,minWidth:0,flex:isMobile?1:"unset"}}>
        <div style={{fontWeight:800,fontSize:isMobile?13:14,color:"#fff",letterSpacing:-0.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isMobile?"ANM & Co.":COMPANY.name}</div>
        <div style={{fontSize:10,color:"#9AA3BF",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{isMobile?"Leave & Expense Portal":COMPANY.tagline}</div>
      </div>
      {!isMobile&&<><div style={{width:1,height:32,background:theme.navyMid,margin:"0 6px"}}/><div style={{fontWeight:700,fontSize:13,color:theme.accentLight}}>Leave & Expense Portal</div><div style={{flex:1}}/><div style={{fontSize:11,color:"#9AA3BF",fontFamily:"monospace",letterSpacing:0.8}}><span style={{color:"#3DD68C"}}>●</span> LIVE {liveTime.toLocaleTimeString()}</div></>}
      <div style={{position:"relative"}}>
        <button onClick={()=>{setNotifOpen(p=>!p); if(!notifOpen) markAllRead();}} style={{background:notifOpen?`${theme.accentLight}33`:"transparent",border:`1px solid ${notifOpen?theme.accentLight:theme.navyMid}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",color:"#fff",fontSize:16,position:"relative"}}>🔔{unread>0&&<span style={{position:"absolute",top:-5,right:-5,background:theme.red,color:"#fff",fontSize:9,fontWeight:800,borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</span>}</button>
        {notifOpen&&<div style={{position:"absolute",right:0,top:46,width:isMobile?280:320,maxWidth:"90vw",background:theme.card,border:`1px solid ${theme.border}`,borderRadius:14,padding:16,zIndex:200,boxShadow:"0 12px 40px #00000022",maxHeight:400,overflow:"auto"}}><div style={{fontWeight:700,marginBottom:12,fontSize:14}}>Notifications</div>{notifications.length===0?<div style={{color:theme.muted,fontSize:13}}>No notifications yet.</div>:notifications.map(n=><div key={n.id} style={{display:"flex",gap:10,padding:"10px 14px",background:n.read?"transparent":`${theme.accent}10`,borderRadius:8,border:`1px solid ${n.read?theme.border:theme.accent+"44"}`,marginBottom:6}}><span style={{fontSize:15}}>🔔</span><div><div style={{fontSize:13,color:theme.text,whiteSpace:"pre-line"}}>{n.message}</div><div style={{fontSize:10,color:theme.muted,marginTop:2}}>{fmt(n.created_at)}</div></div></div>)}</div>}
      </div>
      {!isMobile&&<div style={{display:"flex",alignItems:"center",gap:8}}>
        <PhotoAvatar user={me} size={32}/>
        <div style={{lineHeight:1.2}}><div style={{fontSize:12,fontWeight:700,color:"#fff"}}>{me.name}</div><div style={{fontSize:10,color:"#9AA3BF"}}>{roleConfig[me.role]?.label}</div></div>
        <button onClick={logout} title="Sign out" style={{background:"transparent",border:`1px solid ${theme.navyMid}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",color:"#9AA3BF",fontSize:12,marginLeft:6}}>Sign out</button>
      </div>}
      {isMobile&&<button onClick={logout} title="Sign out" style={{background:"transparent",border:`1px solid ${theme.navyMid}`,borderRadius:8,padding:"6px 9px",cursor:"pointer",color:"#9AA3BF",fontSize:14}}>⏻</button>}
    </div>

    {/* Top Nav — only on desktop */}
    {!isMobile&&<div style={{background:theme.surface,borderBottom:`2px solid ${theme.border}`,padding:"0 24px",display:"flex",gap:2,boxShadow:"0 2px 8px #00000008",overflowX:"auto"}}>
      {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",padding:"13px 18px",cursor:"pointer",fontSize:13,fontWeight:600,color:tab===t.id?theme.accent:theme.muted,borderBottom:tab===t.id?`2px solid ${theme.accent}`:"2px solid transparent",marginBottom:-2,fontFamily:"inherit",whiteSpace:"nowrap"}}>{t.icon} {t.label}{t.badge>0&&<span style={{marginLeft:6,background:theme.red,color:"#fff",fontSize:10,fontWeight:800,borderRadius:10,padding:"1px 6px"}}>{t.badge}</span>}</button>)}
    </div>}

    {/* Content */}
    <div style={{flex:1}}><div style={{maxWidth:1100,margin:"0 auto",padding:isMobile?"18px 14px":"28px 24px"}}>
      {tab==="dashboard"&&<Dashboard me={me} COMPANY={COMPANY} leaves={myLeaves} reimbs={myReimbs} attend={myAttend} todayLog={todayLog} totalPending={totalPending} setTab={setTab} setModal={setModal} doLogout={doLogout} isMobile={isMobile}/>}
      {tab==="attendance"&&<AttendanceTab attendance={myAttend} todayLog={todayLog} setModal={setModal} doLogout={doLogout}/>}
      {tab==="leaves"&&<LeavesTab leaves={myLeaves} leaveTypes={leaveTypes} quotas={quotas} me={me} setModal={setModal}/>}
      {tab==="reimb"&&<ReimbTab reimbursements={myReimbs} me={me} setModal={setModal}/>}
      {tab==="approvals"&&<ApprovalsTab me={me} users={users} pendAtt={pendAtt} pendLeave={pendLeave} pendReimb={pendReimb} setModal={setModal}/>}
      {tab==="reports"&&<ReportsTab users={users} attendance={attendance} leaves={leaves} reimbursements={reimbursements} COMPANY={COMPANY} showToast={showToast}/>}
      {tab==="admin"&&<AdminTab me={me} users={users} activeUsers={activeUsers} COMPANY={COMPANY} updateRole={updateRole} updateProfile={updateProfile} setActive={setActive} setLead={setLead} leaveTypes={leaveTypes} allLeaveTypes={allLeaveTypes} addType={addType} updateType={updateType} removeType={removeType} quotas={quotas} setQuota={setQuota} updateSettings={updateSettings} designations={designations} allDesignations={allDesignations} addDesignation={addDesignation} updateDesignation={updateDesignation} removeDesignation={removeDesignation} setModal={setModal} showToast={showToast}/>}
      {tab==="profile"&&<ProfileTab me={me} showToast={showToast} isMobile={isMobile} designations={designations}/>}
      {tab==="overview"&&<ManagementDashboard users={users} attendance={attendance} leaves={leaves} reimbursements={reimbursements} isMobile={isMobile} setTab={setTab} lateCutoff={COMPANY.late_cutoff_time||"10:15"} setModal={setModal}/>}
      {tab==="calendar"&&<TeamCalendar users={users} leaves={leaves} attendance={attendance} isMobile={isMobile}/>}
      {tab==="assistant"&&<AIAssistant users={users} attendance={attendance} leaves={leaves} reimbursements={reimbursements} isMobile={isMobile} lateCutoff={COMPANY.late_cutoff_time||"10:15"}/>}
    </div></div>

    {!isMobile&&<Footer COMPANY={COMPANY}/>}

    {/* Bottom Nav — mobile only (Instagram-style), max 5 items + More */}
    {isMobile&&(()=>{
      const primary = tabs.slice(0,4);
      const overflow = tabs.slice(4);
      const moreActive = overflow.some(t=>t.id===tab);
      const moreBadge = overflow.reduce((a,t)=>a+(t.badge||0),0);
      return <>
        <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:`1px solid ${theme.border}`,display:"flex",justifyContent:"space-around",alignItems:"center",height:64,zIndex:150,boxShadow:"0 -2px 16px #00000010",paddingBottom:"env(safe-area-inset-bottom)"}}>
          {primary.map(t=><button key={t.id} onClick={()=>setTab(t.id)} className="anm-tap" style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,flex:1,height:"100%",position:"relative",padding:0,transition:"transform 0.1s"}}>
            <span style={{fontSize:20,filter:tab===t.id?"none":"grayscale(0.6) opacity(0.55)",transform:tab===t.id?"scale(1.1)":"scale(1)",transition:"transform 0.15s"}}>{t.icon}</span>
            <span style={{fontSize:9.5,fontWeight:tab===t.id?700:500,color:tab===t.id?theme.accent:theme.muted}}>{t.label}</span>
            {tab===t.id&&<span style={{position:"absolute",top:0,width:24,height:3,borderRadius:3,background:theme.accent}}/>}
            {t.badge>0&&<span style={{position:"absolute",top:6,right:"50%",marginRight:-22,background:theme.red,color:"#fff",fontSize:8,fontWeight:800,borderRadius:"50%",minWidth:15,height:15,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{t.badge}</span>}
          </button>)}
          {overflow.length>0&&<button onClick={()=>setMoreOpen(true)} className="anm-tap" style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,flex:1,height:"100%",position:"relative",padding:0}}>
            <span style={{fontSize:20,filter:moreActive?"none":"grayscale(0.6) opacity(0.55)"}}>⋯</span>
            <span style={{fontSize:9.5,fontWeight:moreActive?700:500,color:moreActive?theme.accent:theme.muted}}>More</span>
            {moreActive&&<span style={{position:"absolute",top:0,width:24,height:3,borderRadius:3,background:theme.accent}}/>}
            {moreBadge>0&&<span style={{position:"absolute",top:6,right:"50%",marginRight:-22,background:theme.red,color:"#fff",fontSize:8,fontWeight:800,borderRadius:"50%",minWidth:15,height:15,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{moreBadge}</span>}
          </button>}
        </div>
        {moreOpen&&<div onClick={()=>setMoreOpen(false)} style={{position:"fixed",inset:0,background:"#00000055",zIndex:300,display:"flex",alignItems:"flex-end"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",width:"100%",borderRadius:"20px 20px 0 0",padding:"20px 16px 32px",animation:"anmFadeUp 0.25s ease"}}>
            <div style={{width:40,height:4,background:theme.border,borderRadius:4,margin:"0 auto 16px"}}/>
            <div style={{fontWeight:700,fontSize:15,marginBottom:14,padding:"0 4px"}}>More</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {overflow.map(t=><button key={t.id} onClick={()=>{setTab(t.id);setMoreOpen(false);}} style={{background:tab===t.id?theme.accentDim:theme.surface,border:`1px solid ${tab===t.id?theme.accent:theme.border}`,borderRadius:14,padding:"18px 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8,position:"relative"}}>
                <span style={{fontSize:26}}>{t.icon}</span>
                <span style={{fontSize:12,fontWeight:600,color:tab===t.id?theme.accent:theme.text}}>{t.label}</span>
                {t.badge>0&&<span style={{position:"absolute",top:8,right:8,background:theme.red,color:"#fff",fontSize:9,fontWeight:800,borderRadius:"50%",minWidth:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px"}}>{t.badge}</span>}
              </button>)}
            </div>
          </div>
        </div>}
      </>;
    })()}

    {modal?.type==="login_attendance"&&<LoginAttendanceModal onClose={()=>setModal(null)} onSubmit={doLogin}/>}
    {modal?.type==="review_attendance"&&<ReviewAttendanceModal onClose={()=>setModal(null)} item={modal.data} users={users} me={me} onAction={doReviewAtt}/>}
    {modal?.type==="apply_leave"&&<ApplyLeaveModal onClose={()=>setModal(null)} onSubmit={doSubmitLeave} leaveTypes={leaveTypes}/>}
    {modal?.type==="apply_reimb"&&<ApplyReimbModal onClose={()=>setModal(null)} onSubmit={doSubmitReimb} me={me} users={users} showToast={showToast}/>}
    {modal?.type==="review_leave"&&<ReviewModal onClose={()=>setModal(null)} item={modal.data} users={users} me={me} onAction={doReviewLeave} itemType="leave"/>}
    {modal?.type==="review_reimb"&&<ReviewModal onClose={()=>setModal(null)} item={modal.data} users={users} me={me} onAction={doReviewReimb} itemType="reimb"/>}
    {modal?.type==="cancel_leave"&&<CancelConfirmModal onClose={()=>setModal(null)} onConfirm={()=>doCancelLeave(modal.data)} kind="leave" item={modal.data}/>}
    {modal?.type==="cancel_reimb"&&<CancelConfirmModal onClose={()=>setModal(null)} onConfirm={()=>doCancelReimb(modal.data)} kind="reimb" item={modal.data}/>}
    {modal?.type==="reset_attendance"&&<ResetAttendanceModal onClose={()=>setModal(null)} onConfirm={()=>doResetAttendance(modal.data)} item={modal.data} users={users}/>}
    {modal?.type==="add_employee"&&<AddEmployeeModal onClose={()=>setModal(null)} users={users} designations={designations} showToast={showToast}/>}

    {confetti&&<Confetti/>}
    {toast&&<div style={{position:"fixed",bottom:isMobile?80:28,right:isMobile?16:28,left:isMobile?16:"auto",background:toast.type==="success"?theme.green:theme.red,color:"#fff",padding:"12px 22px",borderRadius:10,fontWeight:700,fontSize:14,zIndex:9999,boxShadow:"0 8px 32px #00000022",textAlign:"center"}}>{toast.type==="success"?"✓":"✗"} {toast.msg}</div>}
  </div>;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ me, COMPANY, leaves, reimbs, attend, todayLog, totalPending, setTab, setModal, doLogout, isMobile }) {
  const takenDays=leaves.filter(l=>l.status==="approved").reduce((a,l)=>a+l.days,0);
  const reimbTotal=reimbs.filter(r=>r.status==="approved").reduce((a,r)=>a+Number(r.amount),0);
  const attendDays=attend.filter(a=>a.status==="approved").length;
  const stats=[{label:"Days Present",value:attendDays,icon:"🕐",color:theme.accent},{label:"Leave Days Approved",value:takenDays,icon:"📅",color:theme.purple},{label:"Reimbursed",value:`₹${reimbTotal.toLocaleString("en-IN")}`,icon:"💰",color:theme.green},{label:"Pending Items",value:totalPending,icon:"⏳",color:theme.amber}];
  const g = greeting();
  // Live work timer
  const [, forceTick] = useState(0);
  useEffect(()=>{ if(todayLog && !todayLog.logout_time){ const t=setInterval(()=>forceTick(x=>x+1),60000); return()=>clearInterval(t);} },[todayLog]);
  const workDuration = () => {
    if(!todayLog?.login_time) return null;
    const [lh,lm]=todayLog.login_time.split(":").map(Number);
    const start=new Date(); start.setHours(lh,lm,0,0);
    let end=new Date();
    if(todayLog.logout_time){ const [oh,om]=todayLog.logout_time.split(":").map(Number); end=new Date(); end.setHours(oh,om,0,0); }
    const mins=Math.max(0,Math.floor((end-start)/60000));
    return `${Math.floor(mins/60)}h ${mins%60}m`;
  };
  return <div className="anm-fade">
    <div style={{background:`linear-gradient(135deg,${theme.navy},${theme.navyMid})`,borderRadius:16,padding:isMobile?"18px 20px":"22px 28px",marginBottom:isMobile?18:28,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
      <div><div style={{fontSize:isMobile?19:22,fontWeight:800,marginBottom:4,color:"#fff"}}>{g.text}, {me.name.split(" ")[0]} {g.emoji}</div><div style={{fontSize:13,color:"#9AA3BF"}}><span style={{color:theme.accentLight,fontWeight:600}}>{roleConfig[me.role]?.label}</span> · {me.team}{todayLog&&!todayLog.logout_time&&<span style={{marginLeft:8,color:"#3DD68C"}}>⏱ {workDuration()} today</span>}</div></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",width:isMobile?"100%":"auto"}}>
        {!todayLog&&<Button onClick={()=>setModal({type:"login_attendance"})} style={isMobile?{flex:1}:{}}>🕐 Log In</Button>}
        {todayLog&&!todayLog.logout_time&&<Button onClick={doLogout} style={isMobile?{flex:1}:{}}>🚪 Log Out</Button>}
        {todayLog&&todayLog.logout_time&&<div style={{background:theme.greenBg,border:`1px solid ${theme.green}33`,borderRadius:8,padding:"8px 16px",fontSize:13,color:theme.green,fontWeight:600}}>✓ {todayLog.login_time} → {todayLog.logout_time} ({workDuration()})</div>}
        <Button onClick={()=>setModal({type:"apply_leave"})} variant="outline" style={isMobile?{flex:1,borderColor:"#fff4",color:"#fff"}:{borderColor:"#fff4",color:"#fff"}}>＋ Leave</Button>
        <Button onClick={()=>setModal({type:"apply_reimb"})} variant="outline" style={isMobile?{flex:1,borderColor:"#fff4",color:"#fff"}:{borderColor:"#fff4",color:"#fff"}}>＋ Expense</Button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:isMobile?10:14,marginBottom:24}}>{stats.map((s,i)=><Card key={s.label} className="anm-fade" style={{borderTop:`3px solid ${s.color}`,padding:isMobile?16:20,animationDelay:`${i*0.06}s`}}><div style={{fontSize:isMobile?20:22,marginBottom:6}}>{s.icon}</div><div style={{fontSize:isMobile?22:26,fontWeight:800,color:s.color}}>{s.value}</div><div style={{fontSize:12,color:theme.muted,marginTop:2}}>{s.label}</div></Card>)}</div>
    {totalPending>0&&<div style={{background:theme.amberBg,border:`1px solid ${theme.amber}44`,borderRadius:10,padding:"12px 18px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}><div style={{fontSize:14,color:theme.amber,fontWeight:600}}>⏳ {totalPending} item(s) awaiting your action</div><Button size="sm" variant="outline" onClick={()=>setTab("approvals")} style={{borderColor:theme.amber+"66",color:theme.amber}}>Review Now →</Button></div>}
    <Card><div style={{fontWeight:700,marginBottom:16,fontSize:15}}>Recent Activity</div>{[...leaves.slice(0,3).map(l=>({...l,_t:"leave"})),...reimbs.slice(0,3).map(r=>({...r,_t:"reimb"})),...attend.slice(0,3).map(a=>({...a,_t:"att"}))].sort((a,b)=>new Date(b.submitted_at||b.date)-new Date(a.submitted_at||a.date)).slice(0,6).map(item=><div key={item.id+item._t} style={{display:"flex",alignItems:"center",gap:14,padding:"10px 0",borderBottom:`1px solid ${theme.border}`}}><div style={{fontSize:20}}>{item._t==="leave"?"📅":item._t==="reimb"?"🧾":"🕐"}</div><div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{item._t==="leave"?`${item.type} — ${item.days}d`:item._t==="reimb"?`Expense ₹${Number(item.amount).toLocaleString("en-IN")}`:`Attendance ${item.date} (${item.login_time}${item.logout_time?` → ${item.logout_time}`:""})`}</div><div style={{fontSize:12,color:theme.muted}}>{item._t==="att"?fmt(item.date):fmt(item.submitted_at)}</div></div><Badge status={item.status}/></div>)}{leaves.length+reimbs.length+attend.length===0&&<div style={{color:theme.muted,fontSize:14}}>No activity yet.</div>}</Card>
  </div>;
}

// ── Attendance Tab (login + logout) ──────────────────────────────────────────
function AttendanceTab({ attendance, todayLog, setModal, doLogout }) {
  const approved=attendance.filter(a=>a.status==="approved").length;
  const pending=attendance.filter(a=>a.status==="pending_lead"||a.status==="pending_hr").length;
  const rejected=attendance.filter(a=>a.status==="rejected").length;
  return <div className="anm-fade">
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
      <h2 style={{margin:0,fontSize:20,fontWeight:800}}>My Attendance</h2>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        {!todayLog&&<Button onClick={()=>setModal({type:"login_attendance"})}>🕐 Log In</Button>}
        {todayLog&&!todayLog.logout_time&&<><div style={{background:theme.greenBg,border:`1px solid ${theme.green}33`,borderRadius:8,padding:"8px 14px",fontSize:13,color:theme.green,fontWeight:600}}>In at {todayLog.login_time}</div><Button onClick={doLogout}>🚪 Log Out</Button></>}
        {todayLog&&todayLog.logout_time&&<div style={{background:theme.greenBg,border:`1px solid ${theme.green}33`,borderRadius:8,padding:"8px 16px",fontSize:13,color:theme.green,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>✓ {todayLog.login_time} → {todayLog.logout_time} <Badge status={todayLog.status}/></div>}
      </div>
    </div>
    <div style={{display:"flex",gap:12,marginBottom:22}}>{[{l:"Days Present",v:approved,c:theme.green,bg:theme.greenBg},{l:"Pending",v:pending,c:theme.amber,bg:theme.amberBg},{l:"Rejected",v:rejected,c:theme.red,bg:theme.redBg}].map(s=><div key={s.l} style={{background:s.bg,border:`1px solid ${s.c}22`,borderRadius:10,padding:"10px 18px",flex:1,textAlign:"center"}}><div style={{fontWeight:800,fontSize:22,color:s.c}}>{s.v}</div><div style={{fontSize:12,color:theme.muted}}>{s.l}</div></div>)}</div>
    {attendance.length===0&&<Card><EmptyState icon="🕐" title="No attendance yet" subtitle="Tap 'Log In' to record your first day."/></Card>}
    <div style={{display:"flex",flexDirection:"column",gap:10}}>{attendance.map(a=><Card key={a.id} style={{display:"flex",gap:14,alignItems:"center"}}><div style={{width:44,height:44,borderRadius:10,background:a.status==="approved"?theme.greenBg:a.status==="rejected"?theme.redBg:theme.amberBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🕐</div><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:15}}>{a.date}</span><span style={{fontSize:13,color:theme.muted}}>In: <strong style={{color:theme.green}}>{a.login_time}</strong>{a.logout_time&&<> · Out: <strong style={{color:theme.red}}>{a.logout_time}</strong></>}</span><Badge status={a.status}/></div>{a.note&&<div style={{fontSize:12,color:theme.muted}}>Note: {a.note}</div>}{a.approver_remark&&<div style={{fontSize:12,color:theme.purple,background:theme.purpleBg,padding:"4px 8px",borderRadius:6,marginTop:4}}>Remark: "{a.approver_remark}"</div>}</div></Card>)}</div>
  </div>;
}

// ── Leaves Tab ───────────────────────────────────────────────────────────────
function LeavesTab({ leaves, leaveTypes, quotas, me, setModal }) {
  const balForType = (lt) => {
    const override = quotas.find(q=>q.user_id===me.id && q.leave_type_id===lt.id);
    const total = override ? override.qty : lt.default_qty;
    const taken = leaves.filter(l=>l.type===lt.name && l.status==="approved").reduce((a,l)=>a+l.days,0);
    return { total, taken };
  };
  return <div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}><h2 style={{margin:0,fontSize:20,fontWeight:800}}>My Leave Applications</h2><Button onClick={()=>setModal({type:"apply_leave"})}>＋ Apply Leave</Button></div>
    <div style={{display:"flex",gap:12,marginBottom:22,flexWrap:"wrap"}}>{leaveTypes.filter(lt=>balForType(lt).total>0).map(lt=>{const {total,taken}=balForType(lt);const left=total-taken;return <Card key={lt.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,minWidth:120,flex:1}}><ProgressRing value={left} total={total} size={74} label="left" color={left/total>0.3?theme.accent:theme.red}/><div style={{fontSize:12,fontWeight:600,color:theme.text,textAlign:"center"}}>{lt.name}</div><div style={{fontSize:11,color:theme.muted}}>{taken} used · {total} total</div></Card>;})}</div>
    {leaves.length===0&&<Card><div style={{color:theme.muted}}>No leave applications yet.</div></Card>}
    <div style={{display:"flex",flexDirection:"column",gap:12}}>{leaves.map(l=><Card key={l.id} style={{display:"flex",gap:16,alignItems:"flex-start"}}><div style={{width:44,height:44,borderRadius:10,background:theme.accentDim,border:`1px solid ${theme.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>📅</div><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}><span style={{fontWeight:700}}>{l.type}</span><Badge status={l.status}/></div><div style={{fontSize:13,color:theme.muted,marginBottom:4}}>{l.from_date} → {l.to_date} · {l.days} day(s)</div><div style={{fontSize:13,color:theme.muted}}>{l.reason}</div>{l.lead_comment&&<div style={{fontSize:12,marginTop:8,color:theme.purple,background:theme.purpleBg,padding:"5px 10px",borderRadius:6}}>Senior: "{l.lead_comment}"</div>}{l.hr_comment&&<div style={{fontSize:12,marginTop:4,color:theme.green,background:theme.greenBg,padding:"5px 10px",borderRadius:6}}>Management: "{l.hr_comment}"</div>}{["pending","pending_lead","pending_hr"].includes(l.status)&&<Button size="sm" variant="ghost" onClick={()=>setModal({type:"cancel_leave",data:l})} style={{marginTop:10,color:theme.red,borderColor:`${theme.red}55`}}>✕ Cancel Application</Button>}</div><div style={{fontSize:11,color:theme.dim,flexShrink:0}}>{fmt(l.submitted_at)}</div></Card>)}</div>
  </div>;
}

// ── Reimb Tab ────────────────────────────────────────────────────────────────
function ReimbTab({ reimbursements, me, setModal }) {
  const total=reimbursements.reduce((a,r)=>a+Number(r.amount),0);
  const approved=reimbursements.filter(r=>r.status==="approved").reduce((a,r)=>a+Number(r.amount),0);
  const pending=reimbursements.filter(r=>r.status.startsWith("pending")).reduce((a,r)=>a+Number(r.amount),0);
  return <div className="anm-fade">
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}><h2 style={{margin:0,fontSize:20,fontWeight:800}}>My Expense Claims</h2><Button onClick={()=>setModal({type:"apply_reimb"})}>＋ Submit Expense</Button></div>
    <div style={{display:"flex",gap:12,marginBottom:22}}>{[{l:"Total Submitted",v:`₹${total.toLocaleString("en-IN")}`,c:theme.accent,bg:theme.accentDim},{l:"Approved",v:`₹${approved.toLocaleString("en-IN")}`,c:theme.green,bg:theme.greenBg},{l:"Pending",v:`₹${pending.toLocaleString("en-IN")}`,c:theme.amber,bg:theme.amberBg}].map(s=><div key={s.l} style={{background:s.bg,border:`1px solid ${s.c}22`,borderRadius:10,padding:"10px 18px",flex:1}}><div style={{fontWeight:800,fontSize:18,color:s.c}}>{s.v}</div><div style={{fontSize:12,color:theme.muted}}>{s.l}</div></div>)}</div>
    {reimbursements.length===0&&<Card><div style={{color:theme.muted}}>No expense claims yet.</div></Card>}
    <div style={{display:"flex",flexDirection:"column",gap:12}}>{reimbursements.map(r=><Card key={r.id} style={{display:"flex",gap:16,alignItems:"flex-start"}}><div style={{width:44,height:44,borderRadius:10,background:theme.greenBg,border:`1px solid ${theme.green}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🧾</div><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:16}}>₹{Number(r.amount).toLocaleString("en-IN")}</span><span style={{fontSize:11,color:theme.muted,background:theme.surface,padding:"2px 8px",borderRadius:12,border:`1px solid ${theme.border}`}}>{r.category}</span><Badge status={r.status}/></div><div style={{fontSize:13,color:theme.muted,marginBottom:4}}>{r.description}</div>{(r.attachments||[]).length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>{r.attachments.map((f,i)=><a key={i} href={f.url} target="_blank" rel="noreferrer" style={{fontSize:11,color:theme.accent,background:theme.accentDim,padding:"3px 8px",borderRadius:6,textDecoration:"none",border:`1px solid ${theme.accent}33`}}>📎 {f.name}</a>)}</div>}{r.lead_comment&&<div style={{fontSize:12,marginTop:8,color:theme.purple,background:theme.purpleBg,padding:"5px 10px",borderRadius:6}}>Senior: "{r.lead_comment}"</div>}{r.hr_comment&&<div style={{fontSize:12,marginTop:4,color:theme.green,background:theme.greenBg,padding:"5px 10px",borderRadius:6}}>Management: "{r.hr_comment}"</div>}{r.user_id===me.id&&["pending","pending_lead","pending_hr"].includes(r.status)&&<Button size="sm" variant="ghost" onClick={()=>setModal({type:"cancel_reimb",data:r})} style={{marginTop:10,color:theme.red,borderColor:`${theme.red}55`}}>✕ Cancel Claim</Button>}</div><div style={{fontSize:11,color:theme.dim,flexShrink:0}}>{fmt(r.submitted_at)}</div></Card>)}</div>
  </div>;
}

// ── Approvals Tab ────────────────────────────────────────────────────────────
function ApprovalsTab({ me, users, pendAtt, pendLeave, pendReimb, setModal }) {
  const getU=id=>users.find(u=>u.id===id);
  const total=pendAtt.length+pendLeave.length+pendReimb.length;
  const Group=({title,icon,items,type})=>items.length===0?null:<div style={{marginBottom:28}}><div style={{fontWeight:700,fontSize:13,color:theme.amber,marginBottom:12,textTransform:"uppercase",letterSpacing:0.6}}>{icon} {title} ({items.length})</div><div style={{display:"flex",flexDirection:"column",gap:10}}>{items.map(item=>{const sub=getU(item.user_id);return <Card key={item.id} style={{display:"flex",gap:14,alignItems:"center",borderLeft:`3px solid ${theme.amber}`}}><PhotoAvatar user={sub} size={40}/><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{sub?.name}</div><div style={{fontSize:13,color:theme.muted}}>{type==="att"&&`Attendance: ${item.date} @ ${item.login_time}${item.logout_time?` → ${item.logout_time}`:""}${item.note?` — "${item.note}"`:""}`}{type==="leave"&&`${item.type} · ${item.from_date} → ${item.to_date} (${item.days}d)`}{type==="reimb"&&<>₹{Number(item.amount).toLocaleString("en-IN")} · {item.category}{(item.attachments||[]).length>0&&<span style={{marginLeft:6,color:theme.accent}}>📎 {item.attachments.length}</span>}</>}</div></div><Button size="sm" onClick={()=>setModal({type:type==="att"?"review_attendance":type==="leave"?"review_leave":"review_reimb",data:item})}>Review →</Button></Card>;})}</div></div>;
  return <div>
    <h2 style={{margin:"0 0 24px",fontSize:20,fontWeight:800}}>Approvals Queue</h2>
    {total===0&&<Card style={{marginBottom:20,borderLeft:`3px solid ${theme.green}`,background:theme.greenBg}}><div style={{color:theme.green,fontWeight:600}}>✓ All caught up! No pending approvals.</div></Card>}
    <Group title="Attendance" icon="🕐" items={pendAtt} type="att"/>
    <Group title="Leave Applications" icon="📅" items={pendLeave} type="leave"/>
    <Group title="Expense Claims" icon="🧾" items={pendReimb} type="reimb"/>
  </div>;
}

// ── Reports Tab (with date range + export) ───────────────────────────────────
function ReportsTab({ users, attendance, leaves, reimbursements, COMPANY, showToast }) {
  const [dataset,setDataset]=useState("attendance");
  const [range,setRange]=useState("month");
  const [customFrom,setCustomFrom]=useState(todayStr());
  const [customTo,setCustomTo]=useState(todayStr());
  const [summaryBusy,setSummaryBusy]=useState(false);
  const [summaryResult,setSummaryResult]=useState(null);

  const runSummary = async () => {
    setSummaryBusy(true);
    const { result, error } = await generateDailySummary(todayStr());
    setSummaryBusy(false);
    if(error){ showToast(error.message||"Failed","error"); }
    else { setSummaryResult(result); showToast(`Summary sent to ${result.notified} manager(s)!`,"success"); }
  };

  // Compute date window
  const now=new Date();
  let from, to=todayStr();
  if(range==="day"){ from=todayStr(); }
  else if(range==="week"){ const d=new Date(now); d.setDate(d.getDate()-6); from=d.toISOString().split("T")[0]; }
  else if(range==="month"){ const d=new Date(now); d.setDate(d.getDate()-29); from=d.toISOString().split("T")[0]; }
  else { from=customFrom; to=customTo; }

  const inRange=(dateStr)=> dateStr>=from && dateStr<=to;
  const getU=id=>users.find(u=>u.id===id);

  // Build rows per dataset
  let rows=[], columns=[], title="";
  if(dataset==="attendance"){
    title="Attendance Report";
    columns=["Date","Staff","Team","Login","Logout","Status","Remark"];
    rows=attendance.filter(a=>inRange(a.date)).sort((a,b)=>b.date.localeCompare(a.date)).map(a=>{const u=getU(a.user_id);return [a.date,u?.name||"?",u?.team||"",a.login_time||"—",a.logout_time||"—",a.status,a.approver_remark||""];});
  } else if(dataset==="leaves"){
    title="Leave Requests Report";
    columns=["Submitted","Staff","Type","From","To","Days","Status","Mgmt Remark"];
    rows=leaves.filter(l=>inRange((l.submitted_at||"").split("T")[0])).map(l=>{const u=getU(l.user_id);return [(l.submitted_at||"").split("T")[0],u?.name||"?",l.type,l.from_date,l.to_date,l.days,l.status,l.hr_comment||""];});
  } else {
    title="Reimbursement Report";
    columns=["Submitted","Staff","Category","Amount","Description","Status","Approved On"];
    rows=reimbursements.filter(r=>inRange((r.submitted_at||"").split("T")[0])).map(r=>{const u=getU(r.user_id);return [(r.submitted_at||"").split("T")[0],u?.name||"?",r.category,Number(r.amount),r.description,r.status,r.hr_at?fmt(r.hr_at):""];});
  }

  const rangeLabel = range==="custom" ? `${from} to ${to}` : range==="day"?"Today":range==="week"?"Last 7 Days":"Last 30 Days";

  return <div>
    <h2 style={{margin:"0 0 20px",fontSize:20,fontWeight:800}}>Reports & Registers</h2>

    {/* Daily Summary card */}
    <Card style={{marginBottom:20,borderLeft:`3px solid ${theme.purple}`}}>
      <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <div style={{fontSize:28}}>📊</div>
        <div style={{flex:1,minWidth:200}}>
          <div style={{fontWeight:700,fontSize:15}}>Daily Summary to Management</div>
          <div style={{fontSize:12,color:theme.muted}}>Sends the present/absent count plus leave &amp; expense activity for today as an in-app alert to all Management &amp; Admin. Runs automatically every evening, or generate now.</div>
        </div>
        <Button onClick={runSummary} disabled={summaryBusy} style={{background:theme.purple}}>{summaryBusy?"Generating…":"📤 Generate & Send Now"}</Button>
      </div>
      {summaryResult&&<div style={{marginTop:14,padding:14,background:theme.purpleBg,borderRadius:10,border:`1px solid ${theme.purple}33`,fontSize:13,color:theme.text,whiteSpace:"pre-line"}}>{summaryResult.message}</div>}
    </Card>

    <Card style={{marginBottom:20}}>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-end"}}>
        <Sel label="Report Type" value={dataset} onChange={setDataset} options={[{value:"attendance",label:"Attendance"},{value:"leaves",label:"Leave Requests"},{value:"reimbursements",label:"Reimbursements"}]} style={{minWidth:160}}/>
        <Sel label="Period" value={range} onChange={setRange} options={[{value:"day",label:"Daily (Today)"},{value:"week",label:"Weekly (7 days)"},{value:"month",label:"Monthly (30 days)"},{value:"custom",label:"Custom Range"}]} style={{minWidth:160}}/>
        {range==="custom"&&<><Input label="From" type="date" value={customFrom} onChange={setCustomFrom}/><Input label="To" type="date" value={customTo} onChange={setCustomTo}/></>}
        <div style={{flex:1}}/>
        <Button variant="outline" onClick={()=>exportCSV(title,columns,rows,rangeLabel,COMPANY)}>⬇ Excel/CSV</Button>
        <Button onClick={()=>exportPDF(title,columns,rows,rangeLabel,COMPANY)}>⬇ PDF</Button>
      </div>
    </Card>
    <Card style={{padding:0,overflow:"hidden"}}>
      <div style={{padding:"14px 18px",background:theme.surface,borderBottom:`1px solid ${theme.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontWeight:700,fontSize:14}}>{title}</div><div style={{fontSize:12,color:theme.muted}}>{rangeLabel} · {rows.length} record(s)</div></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{background:theme.navy}}>{columns.map(c=><th key={c} style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:"#9AA3BF",textTransform:"uppercase",whiteSpace:"nowrap"}}>{c}</th>)}</tr></thead><tbody>{rows.length===0&&<tr><td colSpan={columns.length} style={{padding:"20px",textAlign:"center",color:theme.muted}}>No records in this period.</td></tr>}{rows.map((r,i)=><tr key={i} style={{background:i%2===0?theme.card:theme.bg,borderBottom:`1px solid ${theme.border}`}}>{r.map((cell,j)=><td key={j} style={{padding:"10px 14px",fontSize:13,color:theme.text,whiteSpace:"nowrap"}}>{columns[j]==="Amount"?`₹${Number(cell).toLocaleString("en-IN")}`:columns[j]==="Status"?<Badge status={cell}/>:String(cell)}</td>)}</tr>)}</tbody></table></div>
    </Card>
  </div>;
}

// ── Admin Tab ────────────────────────────────────────────────────────────────
function AdminTab({ me, users, activeUsers, COMPANY, updateRole, updateProfile, setActive, setLead, leaveTypes, allLeaveTypes, addType, updateType, removeType, quotas, setQuota, updateSettings, designations, allDesignations, addDesignation, updateDesignation, removeDesignation, setModal, showToast }) {
  const [sub,setSub]=useState("employees");
  const subtabs=[{id:"employees",label:"👥 Employees"},{id:"designations",label:"🏷️ Designations"},{id:"leavetypes",label:"📅 Leave Types"},{id:"company",label:"🏢 Company Details"},{id:"basecamp",label:"🏕️ Basecamp"}];
  const leads=users.filter(u=>u.role==="lead");
  return <div className="anm-fade">
    <h2 style={{margin:"0 0 6px",fontSize:20,fontWeight:800}}>Admin Panel</h2>
    <div style={{color:theme.muted,fontSize:13,marginBottom:20}}>Manage employees, designations, leave policy, and company details.</div>
    <div style={{display:"flex",gap:2,marginBottom:24,background:theme.surface,borderRadius:10,padding:4,border:`1px solid ${theme.border}`,width:"fit-content",flexWrap:"wrap"}}>{subtabs.map(t=><button key={t.id} onClick={()=>setSub(t.id)} style={{background:sub===t.id?theme.accent:"transparent",color:sub===t.id?"#fff":theme.muted,border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit"}}>{t.label}</button>)}</div>

    {sub==="employees"&&<EmployeesAdmin users={users} leads={leads} updateRole={updateRole} setActive={setActive} setLead={setLead} leaveTypes={leaveTypes} quotas={quotas} setQuota={setQuota} updateProfile={updateProfile} designations={designations} setModal={setModal}/>}
    {sub==="designations"&&<DesignationsAdmin allDesignations={allDesignations} addDesignation={addDesignation} updateDesignation={updateDesignation} removeDesignation={removeDesignation} showToast={showToast}/>}
    {sub==="leavetypes"&&<LeaveTypesAdmin allLeaveTypes={allLeaveTypes} addType={addType} updateType={updateType} removeType={removeType} showToast={showToast}/>}
    {sub==="company"&&<CompanyAdmin COMPANY={COMPANY} updateSettings={updateSettings} showToast={showToast}/>}
    {sub==="basecamp"&&<BasecampAdmin users={users} showToast={showToast}/>}
  </div>;
}

function DesignationsAdmin({ allDesignations, addDesignation, updateDesignation, removeDesignation, showToast }) {
  const [name,setName]=useState("");
  return <div>
    <Card style={{marginBottom:16}}>
      <div style={{fontWeight:700,marginBottom:12}}>Add New Designation</div>
      <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}><Input label="Designation Name" value={name} onChange={setName} placeholder="e.g. Consultant" style={{flex:1,minWidth:200}}/><Button onClick={async()=>{if(!name){showToast("Enter a name","error");return;}const{error}=await addDesignation(name);showToast(error?error.message:"Designation added!",error?"error":"success");setName("");}}>Add</Button></div>
    </Card>
    <Card>
      <div style={{fontWeight:700,marginBottom:14}}>Designations</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>{allDesignations.map(d=><div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${theme.border}`,opacity:d.active?1:0.5}}><span style={{flex:1,fontWeight:600,fontSize:14}}>{d.name}{!d.active&&<span style={{fontSize:11,color:theme.red,marginLeft:8}}>(removed)</span>}</span>{d.active&&<><input defaultValue={d.name} onBlur={e=>e.target.value!==d.name&&e.target.value.trim()&&updateDesignation(d.id,e.target.value.trim())} style={{width:160,padding:"5px 10px",border:`1px solid ${theme.border}`,borderRadius:6,fontSize:13,fontFamily:"inherit"}}/><Button size="sm" variant="ghost" onClick={()=>removeDesignation(d.id)}>Remove</Button></>}</div>)}</div>
      <div style={{fontSize:11,color:theme.dim,marginTop:10}}>Edit a name in the box (saves on blur). These appear when assigning a designation to an employee and in profiles.</div>
    </Card>
  </div>;
}

function EmployeesAdmin({ users, leads, updateRole, setActive, setLead, leaveTypes, quotas, setQuota, updateProfile, designations, setModal }) {
  const [expanded,setExpanded]=useState(null);
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={{fontWeight:700,fontSize:15}}>Employees ({users.filter(u=>u.active!==false).length} active)</div><Button onClick={()=>setModal({type:"add_employee"})}>＋ Add Employee</Button></div>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>{users.map(u=><Card key={u.id} style={{opacity:u.active===false?0.55:1}}>
      <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <PhotoAvatar user={u} size={40}/>
        <div style={{flex:1,minWidth:160}}><div style={{fontWeight:600,fontSize:14}}>{u.name} {u.active===false&&<span style={{fontSize:11,color:theme.red,background:theme.redBg,padding:"1px 8px",borderRadius:10,marginLeft:6}}>INACTIVE</span>}</div><div style={{fontSize:12,color:theme.muted}}>{u.email} · {u.designation||u.team}</div></div>
        <select value={u.role} onChange={e=>updateRole(u.id,e.target.value)} style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:8,padding:"6px 10px",color:roleConfig[u.role]?.color,fontSize:12,fontFamily:"inherit",cursor:"pointer",fontWeight:600}}><option value="member">Staff</option><option value="lead">Senior / Lead</option><option value="hr">Management</option><option value="admin">Admin</option></select>
        {u.role==="member"&&<select value={u.assigned_lead_id||""} onChange={e=>setLead(u.id,e.target.value)} title="Which Senior/Lead approves this staff member" style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:8,padding:"6px 10px",color:theme.text,fontSize:12,fontFamily:"inherit",cursor:"pointer"}}><option value="">— Reports to (Lead) —</option>{leads.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>}
        <Button size="sm" variant="ghost" onClick={()=>setExpanded(expanded===u.id?null:u.id)}>Details ▾</Button>
        <Button size="sm" variant={u.active===false?"success":"danger"} onClick={()=>setActive(u.id,u.active===false)}>{u.active===false?"Reactivate":"Deactivate"}</Button>
      </div>
      {expanded===u.id&&<div style={{marginTop:14,padding:14,background:theme.surface,borderRadius:10,border:`1px solid ${theme.border}`}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div><label style={{fontSize:11,fontWeight:700,color:theme.muted,textTransform:"uppercase",display:"block",marginBottom:6}}>Designation</label><select value={u.designation||""} onChange={e=>updateProfile(u.id,{designation:e.target.value})} style={{width:"100%",background:"#fff",border:`1px solid ${theme.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",cursor:"pointer"}}><option value="">— None —</option>{designations.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}</select></div>
          <div><label style={{fontSize:11,fontWeight:700,color:theme.muted,textTransform:"uppercase",display:"block",marginBottom:6}}>Team</label><input defaultValue={u.team||""} onBlur={e=>e.target.value!==u.team&&updateProfile(u.id,{team:e.target.value})} style={{width:"100%",background:"#fff",border:`1px solid ${theme.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/></div>
        </div>
        <div style={{marginBottom:16}}><label style={{fontSize:11,fontWeight:700,color:theme.muted,textTransform:"uppercase",display:"block",marginBottom:6}}>Basecamp Person ID <span style={{color:theme.dim,fontWeight:400,textTransform:"none"}}>(for Basecamp notifications)</span></label><input defaultValue={u.basecamp_person_id||""} onBlur={e=>e.target.value!==(u.basecamp_person_id||"")&&updateProfile(u.id,{basecamp_person_id:e.target.value.trim()})} placeholder="e.g. 49887210" style={{width:"100%",maxWidth:240,background:"#fff",border:`1px solid ${theme.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/></div>
        <div style={{fontSize:12,fontWeight:700,color:theme.muted,marginBottom:10,textTransform:"uppercase"}}>Leave Quota Overrides</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>{leaveTypes.map(lt=>{const override=quotas.find(q=>q.user_id===u.id&&q.leave_type_id===lt.id);return <div key={lt.id} style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:12,color:theme.text,flex:1}}>{lt.name}</span><input type="number" defaultValue={override?override.qty:lt.default_qty} onBlur={e=>setQuota(u.id,lt.id,parseInt(e.target.value)||0)} style={{width:56,padding:"4px 6px",border:`1px solid ${theme.border}`,borderRadius:6,fontSize:12,fontFamily:"inherit"}}/></div>;})}</div>
        <div style={{fontSize:11,color:theme.dim,marginTop:8}}>Quota: default shown; change to set a per-employee override (saved on blur).</div>
      </div>}
    </Card>)}</div>
  </div>;
}

function LeaveTypesAdmin({ allLeaveTypes, addType, updateType, removeType, showToast }) {
  const [name,setName]=useState(""); const [qty,setQty]=useState("");
  return <div>
    <Card style={{marginBottom:16}}>
      <div style={{fontWeight:700,marginBottom:12}}>Add New Leave Type</div>
      <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}><Input label="Leave Type Name" value={name} onChange={setName} placeholder="e.g. Study Leave" style={{flex:1,minWidth:180}}/><Input label="Default Days/Year" type="number" value={qty} onChange={setQty} placeholder="0"/><Button onClick={async()=>{if(!name){showToast("Enter a name","error");return;}const{error}=await addType(name,parseInt(qty)||0);showToast(error?error.message:"Leave type added!",error?"error":"success");setName("");setQty("");}}>Add</Button></div>
    </Card>
    <Card>
      <div style={{fontWeight:700,marginBottom:14}}>Leave Types & Default Quotas</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>{allLeaveTypes.map(lt=><div key={lt.id} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${theme.border}`,opacity:lt.active?1:0.5}}><span style={{flex:1,fontWeight:600,fontSize:14}}>{lt.name}{!lt.active&&<span style={{fontSize:11,color:theme.red,marginLeft:8}}>(removed)</span>}</span><span style={{fontSize:12,color:theme.muted}}>Default:</span><input type="number" defaultValue={lt.default_qty} onBlur={e=>updateType(lt.id,{default_qty:parseInt(e.target.value)||0})} style={{width:60,padding:"4px 8px",border:`1px solid ${theme.border}`,borderRadius:6,fontSize:13,fontFamily:"inherit"}}/><span style={{fontSize:12,color:theme.muted}}>days/yr</span>{lt.active&&<Button size="sm" variant="ghost" onClick={()=>removeType(lt.id)}>Remove</Button>}</div>)}</div>
    </Card>
  </div>;
}

function BasecampAdmin({ users, showToast }) {
  const [running,setRunning]=useState(false);
  const [report,setReport]=useState(null);
  const linked=users.filter(u=>u.basecamp_person_id).length;
  const run=async()=>{
    setRunning(true); setReport(null);
    const res=await basecampAutoMatch();
    setRunning(false);
    if(res.error||!res.success){ showToast(res.error||"Auto-match failed","error"); setReport({err:res.error||"Failed"}); }
    else { showToast(`Matched ${res.matchedCount}, updated ${res.updatedCount}`,"success"); setReport(res); }
  };
  return <div>
    <Card style={{marginBottom:16}}>
      <div style={{fontWeight:700,marginBottom:6}}>🏕️ Basecamp Notifications</div>
      <div style={{fontSize:13,color:theme.muted,marginBottom:14,lineHeight:1.5}}>The portal @mentions people in Basecamp when leaves/claims are applied, recommended, and approved. To do that, each person needs their Basecamp Person ID. Use auto-match to fill these automatically by matching email addresses.</div>
      <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <Button onClick={run} disabled={running}>{running?"Matching…":"🔄 Auto-match Person IDs"}</Button>
        <span style={{fontSize:13,color:theme.muted}}><strong style={{color:theme.green}}>{linked}</strong> of {users.length} linked</span>
      </div>
      <div style={{fontSize:11,color:theme.dim,marginTop:10}}>Requires Basecamp to be connected (token + account configured in Vercel). Matching is by email — the Basecamp email must equal the portal email.</div>
    </Card>
    {report&&!report.err&&<Card>
      <div style={{fontWeight:700,marginBottom:12}}>Match Report</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
        {[{l:"Matched",v:report.matchedCount,c:theme.green},{l:"Newly Updated",v:report.updatedCount,c:theme.accent},{l:"Unmatched",v:(report.unmatched||[]).length,c:theme.amber}].map(s=><div key={s.l} style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:8,padding:12,textAlign:"center"}}><div style={{fontWeight:800,fontSize:22,color:s.c}}>{s.v}</div><div style={{fontSize:11,color:theme.muted}}>{s.l}</div></div>)}
      </div>
      {(report.unmatched||[]).length>0&&<div style={{marginBottom:12}}><div style={{fontSize:12,fontWeight:700,color:theme.amber,marginBottom:6,textTransform:"uppercase"}}>⚠️ Portal users not found in Basecamp (check their email)</div>{report.unmatched.map((u,i)=><div key={i} style={{fontSize:13,padding:"4px 0",borderBottom:`1px solid ${theme.border}`}}>{u.name} <span style={{color:theme.muted}}>· {u.email||"no email"}</span></div>)}</div>}
      {(report.extra||[]).length>0&&<div><div style={{fontSize:12,fontWeight:700,color:theme.muted,marginBottom:6,textTransform:"uppercase"}}>People in Basecamp with no matching portal user</div>{report.extra.slice(0,12).map((u,i)=><div key={i} style={{fontSize:13,padding:"4px 0",borderBottom:`1px solid ${theme.border}`,color:theme.muted}}>{u.name} · {u.email}</div>)}</div>}
      {(report.roster||[]).length>0&&<div style={{marginTop:16}}>
        <div style={{fontSize:12,fontWeight:700,color:theme.accent,marginBottom:6,textTransform:"uppercase"}}>📋 All Basecamp people — copy an ID to paste manually</div>
        <div style={{fontSize:11,color:theme.muted,marginBottom:8}}>If someone did not auto-match, find them here, copy the number, and paste it into Admin → Employees → that person → Basecamp Person ID.</div>
        <div style={{maxHeight:280,overflowY:"auto",border:`1px solid ${theme.border}`,borderRadius:8}}>{report.roster.map((p,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 12px",borderBottom:`1px solid ${theme.border}`,fontSize:13}}><div style={{flex:1,minWidth:0}}><div style={{fontWeight:600}}>{p.name}</div><div style={{fontSize:11,color:theme.muted,wordBreak:"break-all"}}>{p.email||"(no email in Basecamp)"}</div></div><code style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:6,padding:"3px 8px",fontSize:12,color:theme.accent,fontWeight:700,cursor:"pointer"}} onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(p.id);showToast(`Copied ID ${p.id}`,"success");}}>{p.id} 📋</code></div>)}</div>
      </div>}
    </Card>}
  </div>;
}

function CompanyAdmin({ COMPANY, updateSettings, showToast }) {
  const [form,setForm]=useState({name:COMPANY.name||"",tagline:COMPANY.tagline||"",email:COMPANY.email||"",hr_email:COMPANY.hr_email||COMPANY.emailHR||"",phone:COMPANY.phone||"",address:COMPANY.address||"",office_start_time:COMPANY.office_start_time||"10:00",late_cutoff_time:COMPANY.late_cutoff_time||"10:15"});
  const f=k=>v=>setForm(p=>({...p,[k]:v}));
  return <Card>
    <div style={{fontWeight:700,marginBottom:16}}>Company Details</div>
    <div style={{display:"flex",flexDirection:"column",gap:16,maxWidth:560}}>
      <Input label="Company Name" value={form.name} onChange={f("name")}/>
      <Input label="Tagline" value={form.tagline} onChange={f("tagline")}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Input label="Primary Email" value={form.email} onChange={f("email")}/><Input label="HR Manager Email" value={form.hr_email} onChange={f("hr_email")}/></div>
      <Input label="Phone" value={form.phone} onChange={f("phone")}/>
      <Input label="Address" value={form.address} onChange={f("address")}/>
      <div style={{borderTop:`1px solid ${theme.border}`,paddingTop:16}}>
        <div style={{fontSize:12,fontWeight:700,color:theme.muted,textTransform:"uppercase",marginBottom:12}}>⏰ Attendance Timing</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Input label="Office Start Time" type="time" value={form.office_start_time} onChange={f("office_start_time")}/><Input label="Late Comer Cutoff" type="time" value={form.late_cutoff_time} onChange={f("late_cutoff_time")}/></div>
        <div style={{fontSize:11,color:theme.dim,marginTop:8}}>Staff who log in after the cutoff time are flagged as "late comers" in the Management dashboard and AI assistant.</div>
      </div>
      <Button onClick={async()=>{const{error}=await updateSettings(form);showToast(error?error.message:"Company details updated!",error?"error":"success");}} style={{alignSelf:"flex-start"}}>Save Changes</Button>
    </div>
  </Card>;
}

// ── Footer ───────────────────────────────────────────────────────────────────
function Footer({ COMPANY }) {
  return <footer style={{borderTop:`1px solid ${theme.border}`,background:theme.navy,marginTop:60,padding:"28px 24px"}}>
    <div style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:28}}>
      <div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><ANMLogo size={36}/><div><div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{COMPANY.name}</div><div style={{fontSize:11,color:"#9AA3BF"}}>{COMPANY.tagline}</div></div></div></div>
      <div><div style={{fontWeight:700,fontSize:13,color:theme.accentLight,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Contact</div>{[{icon:"✉",val:COMPANY.email},{icon:"📞",val:COMPANY.phone},{icon:"📍",val:COMPANY.address}].map(c=><div key={c.val} style={{display:"flex",gap:8,fontSize:12,color:"#9AA3BF",marginBottom:6}}><span style={{color:theme.accentLight}}>{c.icon}</span>{c.val}</div>)}</div>
      <div><div style={{fontWeight:700,fontSize:13,color:theme.accentLight,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Modules</div>{["Attendance","Leave","Expenses","Reports","WhatsApp Alerts"].map((s,i)=><div key={s} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}><div style={{width:20,height:20,borderRadius:"50%",background:`${theme.accent}44`,border:`1px solid ${theme.accent}88`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:theme.accentLight}}>{i+1}</div><span style={{fontSize:12,color:"#9AA3BF"}}>{s}</span></div>)}</div>
    </div>
    <div style={{maxWidth:1100,margin:"18px auto 0",paddingTop:18,borderTop:"1px solid #2C3A6E",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><div style={{fontSize:11,color:"#6B7599"}}>© 2026 {COMPANY.name}. All rights reserved.</div><div style={{fontSize:11,color:"#6B7599"}}>{COMPANY.credits||"Developed by Bharath"}</div></div>
  </footer>;
}

// ── Modals ───────────────────────────────────────────────────────────────────
function LoginAttendanceModal({ onClose, onSubmit }) {
  const [note,setNote]=useState("");
  return <Modal open onClose={onClose} title="Log In — Attendance"><div style={{display:"flex",flexDirection:"column",gap:16}}><div style={{background:theme.accentDim,borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,border:`1px solid ${theme.accent}33`}}><div style={{fontSize:28}}>🕐</div><div><div style={{fontWeight:700,fontSize:15,color:theme.accent}}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</div><div style={{fontSize:12,color:theme.muted}}>Login time will be captured as <strong>{nowTime()}</strong></div></div></div><div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase",letterSpacing:0.6}}>Note (optional)</label><Textarea value={note} onChange={setNote} placeholder="e.g. Working from client site…"/></div><div style={{fontSize:12,color:theme.muted,background:theme.surface,padding:"10px 14px",borderRadius:8}}>You can log out later to record your end time. Attendance is sent to your Senior for approval.</div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={()=>onSubmit(note)}>✓ Log In Now</Button></div></div></Modal>;
}

function ReviewAttendanceModal({ onClose, item, users, me, onAction }) {
  const [c,setC]=useState("");const sub=users.find(u=>u.id===item.user_id);
  const isLead=item.status==="pending_lead"&&["lead","hr","admin"].includes(me.role);
  const isHR=item.status==="pending_hr"&&["hr","admin"].includes(me.role);
  const canAct=isLead||isHR;const prefix=isLead?"lead":"hr";
  return <Modal open onClose={onClose} title="Review Attendance"><div style={{display:"flex",flexDirection:"column",gap:16}}><div style={{display:"flex",gap:12,alignItems:"center"}}><PhotoAvatar user={sub} size={46}/><div><div style={{fontWeight:700,fontSize:15}}>{sub?.name}</div><div style={{fontSize:12,color:theme.muted}}>{sub?.team} · {sub?.email}</div></div><div style={{marginLeft:"auto"}}><Badge status={item.status}/></div></div><div style={{background:theme.surface,borderRadius:10,padding:14,display:"flex",flexDirection:"column",gap:8}}><Row k="Date" v={fmt(item.date)}/><Row k="Login" v={<strong style={{color:theme.green}}>{item.login_time}</strong>}/><Row k="Logout" v={item.logout_time?<strong style={{color:theme.red}}>{item.logout_time}</strong>:"Not logged out"}/><Row k="Note" v={item.note||"—"}/></div>{item.lead_comment&&<div style={{fontSize:13,color:theme.purple,background:theme.purpleBg,padding:"8px 12px",borderRadius:8}}>Recommended by senior: "{item.lead_comment}"</div>}{canAct&&<><div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase"}}>Remarks</label><Textarea value={c} onChange={setC} placeholder="Optional…"/></div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="danger" onClick={()=>onAction(item,`${prefix}_reject`,c)}>✗ Reject</Button><Button variant="success" onClick={()=>onAction(item,`${prefix}_approve`,c)}>✓ {isLead?"Recommend":"Approve"}</Button></div></>}{!canAct&&<Button variant="ghost" onClick={onClose} style={{alignSelf:"flex-end"}}>Close</Button>}</div></Modal>;
}

function ApplyLeaveModal({ onClose, onSubmit, leaveTypes }) {
  const [form,setForm]=useState({type:leaveTypes[0]?.name||"Casual Leave",from:"",to:"",reason:""});
  const days=form.from&&form.to?Math.max(1,Math.round((new Date(form.to)-new Date(form.from))/86400000)+1):0;
  const f=k=>v=>setForm(p=>({...p,[k]:v}));
  return <Modal open onClose={onClose} title="Apply for Leave"><div style={{display:"flex",flexDirection:"column",gap:16}}><Sel label="Leave Type" value={form.type} onChange={f("type")} options={leaveTypes.map(lt=>({value:lt.name,label:lt.name}))}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Input label="From" type="date" value={form.from} onChange={f("from")} required/><Input label="To" type="date" value={form.to} onChange={f("to")} required/></div>{days>0&&<div style={{fontSize:13,color:theme.accent,background:theme.accentDim,padding:"8px 12px",borderRadius:8,border:`1px solid ${theme.accent}33`}}>Duration: <strong>{days} day(s)</strong></div>}<div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase"}}>Reason <span style={{color:theme.red}}>*</span></label><Textarea value={form.reason} onChange={f("reason")} rows={3} placeholder="Brief reason…"/></div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={()=>form.from&&form.to&&form.reason&&onSubmit({...form,days})} disabled={!form.from||!form.to||!form.reason}>Submit</Button></div></div></Modal>;
}

function ApplyReimbModal({ onClose, onSubmit, me, users, showToast }) {
  // Work-assigner options: pool leads, HR, management (exclude self and plain staff)
  const assigners = users.filter(u=>["lead","hr","admin"].includes(u.role) && u.id!==me.id && u.active!==false);
  const [form,setForm]=useState({category:"Travel",amount:"",description:"",invoiceNote:"",assignerId:assigners[0]?.id||""});
  const [files,setFiles]=useState([]);
  const [uploading,setUploading]=useState(false);
  const f=k=>v=>setForm(p=>({...p,[k]:v}));
  const handleFiles=async(e)=>{
    const selected=Array.from(e.target.files);
    setUploading(true);
    const uploaded=[];
    for(const file of selected){
      const res=await uploadAttachment(me.id,file);
      if(res.error) showToast(`Upload failed: ${res.error.message}`,"error");
      else uploaded.push(res);
    }
    setFiles(p=>[...p,...uploaded]);
    setUploading(false);
  };
  const assigner = assigners.find(u=>u.id===form.assignerId);
  const assignerRole = assigner?.role;
  const flowNote = assignerRole==="lead"
    ? "This Senior/Lead will verify & recommend, then Management approves."
    : "This Management/HR member will approve your claim directly.";
  const submit=()=>{
    if(!form.amount||!form.description){showToast("Amount and description required","error");return;}
    if(!form.assignerId){showToast("Please select who assigned the work","error");return;}
    onSubmit({...form,amount:+form.amount,attachments:files,assignerId:form.assignerId,assignerRole});
  };
  return <Modal open onClose={onClose} title="Submit Expense Claim"><div style={{display:"flex",flexDirection:"column",gap:16}}>
    <Sel label="Work Assigned By" value={form.assignerId} onChange={f("assignerId")} options={assigners.map(u=>({value:u.id,label:`${u.name} (${u.role==="lead"?"Senior/Lead":u.role==="hr"?"Management":"Admin"})`}))}/>
    <div style={{fontSize:12,color:theme.accent,background:theme.accentDim,padding:"8px 12px",borderRadius:8,border:`1px solid ${theme.accent}33`}}>ℹ️ {flowNote}</div>
    <Sel label="Category" value={form.category} onChange={f("category")} options={["Travel","Food & Entertainment","Accommodation","Office Supplies","Professional Fees","Client Gifts","Training & CPE","Medical","Other"].map(v=>({value:v,label:v}))}/><Input label="Amount (₹)" type="number" value={form.amount} onChange={f("amount")} placeholder="0.00" required/><div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase"}}>Description <span style={{color:theme.red}}>*</span></label><Textarea value={form.description} onChange={f("description")} placeholder="Purpose…"/></div><Input label="Invoice / Receipt Reference" value={form.invoiceNote} onChange={f("invoiceNote")} placeholder="Invoice number…"/>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase"}}>Attachments (invoice copies)</label>
      <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"16px",border:`2px dashed ${theme.border}`,borderRadius:10,cursor:"pointer",background:theme.surface,fontSize:13,color:theme.accent,fontWeight:600}}>📎 Click to upload files (any type)<input type="file" multiple onChange={handleFiles} style={{display:"none"}}/></label>
      {uploading&&<div style={{fontSize:12,color:theme.amber}}>⏳ Uploading…</div>}
      {files.length>0&&<div style={{display:"flex",flexDirection:"column",gap:6}}>{files.map((file,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,background:theme.greenBg,padding:"6px 10px",borderRadius:6,border:`1px solid ${theme.green}33`}}><span style={{flex:1,color:theme.text}}>📄 {file.name}</span><span style={{color:theme.muted}}>{(file.size/1024).toFixed(0)} KB</span><button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:theme.red,cursor:"pointer",fontWeight:700}}>✕</button></div>)}</div>}
    </div>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={!form.amount||!form.description||uploading}>Submit</Button></div></div></Modal>;
}

function ReviewModal({ onClose, item, users, me, onAction, itemType }) {
  const [c,setC]=useState("");const sub=users.find(u=>u.id===item.user_id);
  // Both leave and reimb are two-step: lead recommends (pending_lead) → hr approves (pending_hr).
  const isLeave = itemType==="leave";
  const isLead = item.status==="pending_lead" && ["lead","hr","admin"].includes(me.role);
  const isHR   = item.status==="pending_hr"   && ["hr","admin"].includes(me.role);
  const canAct = isLead||isHR;
  const prefix = isLead?"lead":"hr";
  const assigner = item.assigner_id ? users.find(u=>u.id===item.assigner_id) : null;
  return <Modal open onClose={onClose} title={`Review ${isLeave?"Leave":"Expense"} Request`}><div style={{display:"flex",flexDirection:"column",gap:16}}><div style={{display:"flex",gap:12,alignItems:"center"}}><PhotoAvatar user={sub} size={46}/><div><div style={{fontWeight:700,fontSize:15}}>{sub?.name}</div><div style={{fontSize:12,color:theme.muted}}>{sub?.team} · {sub?.email}</div></div><div style={{marginLeft:"auto"}}><Badge status={item.status}/></div></div><div style={{background:theme.surface,borderRadius:10,padding:14,display:"flex",flexDirection:"column",gap:8}}>{isLeave?<><Row k="Type" v={item.type}/><Row k="Dates" v={`${item.from_date} → ${item.to_date} (${item.days}d)`}/><Row k="Reason" v={item.reason}/></>:<><Row k="Category" v={item.category}/><Row k="Amount" v={`₹${Number(item.amount).toLocaleString("en-IN")}`}/><Row k="Description" v={item.description}/><Row k="Invoice Ref" v={item.invoice_note}/>{assigner&&<Row k="Work Assigned By" v={assigner.name}/>}</>}<Row k="Submitted" v={fmt(item.submitted_at)}/></div>
    {!isLeave&&(item.attachments||[]).length>0&&<div style={{background:theme.accentDim,borderRadius:10,padding:14,border:`1px solid ${theme.accent}33`}}><div style={{fontSize:12,fontWeight:700,color:theme.accent,marginBottom:8,textTransform:"uppercase"}}>📎 Attached Documents — verify before approving</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{item.attachments.map((file,i)=><a key={i} href={file.url} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:theme.accent,background:"#fff",padding:"8px 12px",borderRadius:8,textDecoration:"none",border:`1px solid ${theme.border}`,fontWeight:600}}>📄 {file.name} <span style={{marginLeft:"auto",color:theme.muted,fontSize:11}}>Open ↗</span></a>)}</div></div>}
    {!isLeave&&(item.attachments||[]).length===0&&<div style={{fontSize:12,color:theme.amber,background:theme.amberBg,padding:"8px 12px",borderRadius:8}}>⚠️ No documents attached to this claim.</div>}
    {item.lead_comment&&<div style={{fontSize:13,color:theme.purple,background:theme.purpleBg,padding:"8px 12px",borderRadius:8}}>Recommended by senior: "{item.lead_comment}"</div>}
    {canAct&&<><div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase"}}>Remarks</label><Textarea value={c} onChange={setC} placeholder={!isLeave&&isLead?"Confirm documents verified…":"Optional…"}/></div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="danger" onClick={()=>onAction(item,`${prefix}_reject`,c)}>✗ Reject</Button>
        <Button variant="success" onClick={()=>onAction(item,`${prefix}_approve`,c)}>✓ {isLead?(isLeave?"Recommend":"Verify & Recommend"):"Approve"}</Button>
      </div></>}
    {!canAct&&<Button variant="ghost" onClick={onClose} style={{alignSelf:"flex-end"}}>Close</Button>}</div></Modal>;
}

function ResetAttendanceModal({ onClose, onConfirm, item, users }) {
  const u = users.find(x=>x.id===item.user_id);
  return <Modal open onClose={onClose} title="Reset Attendance?">
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:theme.amberBg,border:`1px solid ${theme.amber}33`,borderRadius:10,padding:14,fontSize:14,color:theme.text}}>
        This will delete the attendance record of <strong>{u?.name}</strong> for <strong>{item.date}</strong> so they can punch in again. Use this if they logged in or out by mistake.
      </div>
      <div style={{background:theme.surface,borderRadius:10,padding:14,fontSize:13,color:theme.muted}}>
        Current: In {item.login_time||"—"}{item.logout_time?` · Out ${item.logout_time}`:""} · {item.status}
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="danger" onClick={onConfirm}>♻ Reset Attendance</Button>
      </div>
    </div>
  </Modal>;
}

function CancelConfirmModal({ onClose, onConfirm, kind, item }) {
  return <Modal open onClose={onClose} title={`Cancel ${kind==="leave"?"Leave Application":"Expense Claim"}?`}>
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{background:theme.redBg,border:`1px solid ${theme.red}33`,borderRadius:10,padding:14,fontSize:14,color:theme.text}}>
        Are you sure you want to cancel this {kind==="leave"?"leave application":"expense claim"}? This permanently removes it and cannot be undone.
      </div>
      <div style={{background:theme.surface,borderRadius:10,padding:14,fontSize:13,color:theme.muted}}>
        {kind==="leave" ? `${item.type} · ${item.from_date} → ${item.to_date} (${item.days}d)` : `₹${Number(item.amount).toLocaleString("en-IN")} · ${item.category}`}
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Button variant="ghost" onClick={onClose}>Keep It</Button>
        <Button variant="danger" onClick={onConfirm}>✕ Yes, Cancel</Button>
      </div>
    </div>
  </Modal>;
}

function AddEmployeeModal({ onClose, users, designations=[], showToast }) {
  const leads=users.filter(u=>u.role==="lead"&&u.active!==false);
  const [form,setForm]=useState({name:"",email:"",password:"Anm@2026",phone:"",role:"member",team:"Audit",designation:"",assigned_lead_id:""});
  const [busy,setBusy]=useState(false);
  const f=k=>v=>setForm(p=>({...p,[k]:v}));
  const avatar=(form.name||"").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()||"NA";
  const submit=async()=>{
    if(!form.name||!form.email){showToast("Name and email required","error");return;}
    setBusy(true);
    const { error } = await createEmployee({...form, avatar});
    setBusy(false);
    if(error){showToast(error.message||"Failed to add employee","error");}
    else{showToast(`${form.name} added! Default password: ${form.password}`,"success");onClose();}
  };
  return <Modal open onClose={onClose} title="Add New Employee"><div style={{display:"flex",flexDirection:"column",gap:16}}>
    <Input label="Full Name" value={form.name} onChange={f("name")} placeholder="e.g. Ramesh Kumar" required/>
    <Input label="Email" type="email" value={form.email} onChange={f("email")} placeholder="ramesh@anmoffice.in" required/>
    <Input label="Phone" value={form.phone} onChange={f("phone")} placeholder="919845012345"/>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Sel label="Role" value={form.role} onChange={f("role")} options={[{value:"member",label:"Staff"},{value:"lead",label:"Senior / Lead"},{value:"hr",label:"Management"},{value:"admin",label:"Admin"}]}/><Input label="Team" value={form.team} onChange={f("team")} placeholder="Audit / Tax…"/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Sel label="Designation" value={form.designation} onChange={f("designation")} options={[{value:"",label:"— None —"},...designations.map(d=>({value:d.name,label:d.name}))]}/>{form.role==="member"&&<Sel label="Reports to (Lead)" value={form.assigned_lead_id} onChange={f("assigned_lead_id")} options={[{value:"",label:"— Select Lead —"},...leads.map(l=>({value:l.id,label:l.name}))]}/>}</div>
    <Input label="Default Password" value={form.password} onChange={f("password")}/>
    <div style={{fontSize:12,color:theme.muted,background:theme.surface,padding:"10px 14px",borderRadius:8}}>Employee logs in with this password and is prompted to change it on first login. Avatar: <strong>{avatar}</strong></div>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={busy||!form.name||!form.email}>{busy?"Adding…":"Add Employee"}</Button></div>
  </div></Modal>;
}

// ── Profile Tab (with photo upload) ──────────────────────────────────────────
function ProfileTab({ me, showToast, isMobile, designations=[] }) {
  const { refreshProfile } = useAuth();
  const [uploading,setUploading]=useState(false);
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({ phone:me.phone||"", designation:me.designation||"", emergency_contact:me.emergency_contact||"" });
  const f=k=>v=>setForm(p=>({...p,[k]:v}));

  const handlePhoto=async(e)=>{
    const file=e.target.files[0]; if(!file) return;
    if(!file.type.startsWith("image/")){ showToast("Please select an image","error"); return; }
    setUploading(true);
    const res=await uploadAvatar(me.id,file);
    setUploading(false);
    if(res.error) showToast(res.error.message||"Upload failed","error");
    else { showToast("Photo updated!"); refreshProfile&&refreshProfile(); }
  };
  const saveProfile=async()=>{
    const { error }=await updateMyProfile(me.id, form);
    if(error) showToast(error.message,"error");
    else { showToast("Profile updated!"); setEditing(false); refreshProfile&&refreshProfile(); }
  };

  return <div className="anm-fade">
    <h2 style={{margin:"0 0 20px",fontSize:20,fontWeight:800}}>My Profile</h2>

    {/* Profile header card */}
    <Card style={{marginBottom:20,textAlign:"center",padding:"28px 20px",background:`linear-gradient(180deg, ${theme.navy} 0%, ${theme.navy} 90px, ${theme.card} 90px)`}}>
      <div style={{position:"relative",display:"inline-block",marginBottom:12}}>
        {me.photo_url
          ? <img src={me.photo_url} alt={me.name} style={{width:96,height:96,borderRadius:"50%",objectFit:"cover",border:`4px solid ${theme.card}`,boxShadow:"0 4px 16px #00000022"}}/>
          : <div style={{width:96,height:96,borderRadius:"50%",background:`linear-gradient(135deg,${theme.accent},${theme.accentLight})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,fontWeight:800,color:"#fff",fontFamily:"monospace",border:`4px solid ${theme.card}`,boxShadow:"0 4px 16px #00000022"}}>{me.avatar}</div>}
        <label style={{position:"absolute",bottom:4,right:4,background:theme.accent,width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",border:"2px solid #fff",fontSize:14}}>{uploading?"⏳":"📷"}<input type="file" accept="image/*" onChange={handlePhoto} style={{display:"none"}}/></label>
      </div>
      <div style={{fontWeight:800,fontSize:20,color:theme.text}}>{me.name}</div>
      <div style={{fontSize:13,color:theme.muted,marginTop:2}}>{me.designation||roleConfig[me.role]?.label} · {me.team}</div>
      <div style={{display:"inline-block",marginTop:10,fontSize:11,fontWeight:600,color:roleConfig[me.role]?.color,background:`${roleConfig[me.role]?.color}18`,border:`1px solid ${roleConfig[me.role]?.color}33`,borderRadius:20,padding:"3px 12px",textTransform:"uppercase"}}>{roleConfig[me.role]?.label}</div>
    </Card>

    {/* Details */}
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:15}}>Details</div>
        {!editing
          ? <Button size="sm" variant="outline" onClick={()=>setEditing(true)}>✎ Edit</Button>
          : <div style={{display:"flex",gap:8}}><Button size="sm" variant="ghost" onClick={()=>setEditing(false)}>Cancel</Button><Button size="sm" onClick={saveProfile}>Save</Button></div>}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <DetailRow label="Email" value={me.email} editable={false}/>
        {editing
          ? <><Input label="Phone" value={form.phone} onChange={f("phone")} placeholder="919845012345"/><Sel label="Designation" value={form.designation} onChange={f("designation")} options={[{value:"",label:"— Select —"},...designations.map(d=>({value:d.name,label:d.name}))]}/><Input label="Emergency Contact" value={form.emergency_contact} onChange={f("emergency_contact")} placeholder="Name & number"/></>
          : <><DetailRow label="Phone" value={me.phone||"Not set"}/><DetailRow label="Designation" value={me.designation||"Not set"}/><DetailRow label="Team" value={me.team}/><DetailRow label="Emergency Contact" value={me.emergency_contact||"Not set"}/>{me.date_joined&&<DetailRow label="Joined" value={fmt(me.date_joined)}/>}</>}
      </div>
    </Card>
  </div>;
}
function DetailRow({ label, value }) {
  return <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${theme.border}`}}><span style={{fontSize:12,color:theme.muted,textTransform:"uppercase",letterSpacing:0.5,fontWeight:600}}>{label}</span><span style={{fontSize:14,color:theme.text,fontWeight:500}}>{value}</span></div>;
}
