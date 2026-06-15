import { useState, useEffect, useRef } from "react";
import { useAuth } from "./context/AuthContext";
import { LoginScreen, PasswordResetScreen } from "./Auth";
import { theme, COMPANY, roleConfig } from "./theme";
import { ANMLogo, Avatar, Badge, Card, Button, Input, Sel, Modal, Row, Textarea, fmt } from "./ui";
import { useProfiles, useAttendance, useLeaves, useReimbursements, useNotifications, sendWhatsApp } from "./hooks/useData";

const todayStr = () => new Date().toISOString().split("T")[0];

export default function App() {
  const { session, profile, loading, logout } = useAuth();

  if (loading) return <Splash/>;
  if (!session) return <LoginScreen/>;
  if (profile?.must_reset_pw) return <PasswordResetScreen/>;
  if (!profile) return <Splash text="Loading your profile…"/>;
  return <Portal/>;
}

function Splash({ text="Loading…" }) {
  return <div style={{minHeight:"100vh",background:theme.navy,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"'DM Sans',sans-serif"}}>
    <ANMLogo size={56}/><div style={{color:"#9AA3BF",fontSize:14}}>{text}</div>
  </div>;
}

function Portal() {
  const { profile: me, logout } = useAuth();
  const { users, updateRole, updatePhone } = useProfiles();
  const { attendance, logToday, review: reviewAtt } = useAttendance();
  const { leaves, submit: submitLeave, review: reviewLeave } = useLeaves();
  const { reimbursements, submit: submitReimb, review: reviewReimb } = useReimbursements();
  const { notifications, markAllRead } = useNotifications(me.id);

  const [tab, setTab]         = useState("dashboard");
  const [liveTime, setLiveTime] = useState(new Date());
  const [modal, setModal]     = useState(null);
  const [toast, setToast]     = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const tickRef = useRef();

  useEffect(()=>{ tickRef.current=setInterval(()=>setLiveTime(new Date()),1000); return()=>clearInterval(tickRef.current); },[]);
  useEffect(()=>{ if(toast){const t=setTimeout(()=>setToast(null),3400);return()=>clearTimeout(t);} },[toast]);
  const showToast=(msg,type="success")=>setToast({msg,type});

  const unread = notifications.filter(n=>!n.read).length;
  const getUser = id => users.find(u=>u.id===id);

  const myAttend = attendance.filter(a=>a.user_id===me.id);
  const todayLog = myAttend.find(a=>a.date===todayStr());
  const myLeaves = leaves.filter(l=>l.user_id===me.id);
  const myReimbs = reimbursements.filter(r=>r.user_id===me.id);

  // Pending queues
  const pendAttLead = me.role==="lead" ? attendance.filter(a=>a.status==="pending"&&getUser(a.user_id)?.team===me.team&&getUser(a.user_id)?.role==="member") : [];
  const pendAttHR   = me.role==="hr"   ? attendance.filter(a=>a.status==="pending") : [];
  const pendLeaveLead = me.role==="lead" ? leaves.filter(l=>l.status==="pending_lead"&&l.lead_id===me.id) : [];
  const pendLeaveHR   = me.role==="hr"   ? leaves.filter(l=>l.status==="pending_hr") : [];
  const pendReimbLead = me.role==="lead" ? reimbursements.filter(r=>r.status==="pending_lead"&&r.lead_id===me.id) : [];
  const pendReimbHR   = me.role==="hr"   ? reimbursements.filter(r=>r.status==="pending_hr") : [];
  const totalPending = pendAttLead.length+pendAttHR.length+pendLeaveLead.length+pendLeaveHR.length+pendReimbLead.length+pendReimbHR.length;

  const isReportRole = ["hr","admin"].includes(me.role);

  // ── Actions ────────────────────────────────────────────────────────────
  const doLogAttendance = async (loginTime,note) => {
    if(todayLog){ showToast("Already logged in today!","error"); return; }
    const { error } = await logToday(me.id, loginTime, note);
    showToast(error?error.message:"Attendance logged! Pending approval.", error?"error":"success");
    setModal(null);
  };
  const doReviewAtt = async (item,action,remark) => {
    await reviewAtt(item.id, item.user_id, action, remark);
    showToast(action==="approve"?"Attendance approved!":"Attendance rejected.", action==="approve"?"success":"error");
    setModal(null);
  };
  const doSubmitLeave = async (data) => {
    const lead=users.find(u=>u.role==="lead"&&u.team===me.team); const hr=users.find(u=>u.role==="hr");
    const { error } = await submitLeave(me.id, lead?.id, hr?.id, data);
    showToast(error?error.message:"Leave application submitted!", error?"error":"success");
    setModal(null);
  };
  const doReviewLeave = async (row,action,comment) => {
    const { finalDecision } = await reviewLeave(row,action,comment);
    if(finalDecision){
      const recipient=getUser(row.user_id);
      sendWhatsApp(action==="hr_approve"?"leave_approved":"leave_rejected", recipient, {leaveType:row.type,fromDate:row.from_date,toDate:row.to_date,days:row.days,hrComment:comment});
      showToast(action==="hr_approve"?`Approved! WhatsApp sent to ${recipient?.name}`:`Rejected. WhatsApp sent.`, action==="hr_approve"?"success":"error");
    } else showToast(action.includes("approve")?"Recommended for Management!":"Rejected.", action.includes("approve")?"success":"error");
    setModal(null);
  };
  const doReviewReimb = async (row,action,comment) => {
    const { finalDecision } = await reviewReimb(row,action,comment);
    if(finalDecision){
      const recipient=getUser(row.user_id);
      sendWhatsApp(action==="hr_approve"?"reimbursement_approved":"reimbursement_rejected", recipient, {amount:row.amount,category:row.category,hrComment:comment});
      showToast(action==="hr_approve"?`Approved! WhatsApp sent to ${recipient?.name}`:`Rejected. WhatsApp sent.`, action==="hr_approve"?"success":"error");
    } else showToast(action.includes("approve")?"Recommended for Management!":"Rejected.", action.includes("approve")?"success":"error");
    setModal(null);
  };

  const tabs=[
    {id:"dashboard",label:"Dashboard",icon:"⊞"},
    {id:"attendance",label:"Attendance",icon:"🕐"},
    {id:"leaves",label:"Leaves",icon:"📅"},
    {id:"reimb",label:"Expenses",icon:"🧾"},
    ...(["lead","hr"].includes(me.role)?[{id:"approvals",label:"Approvals",icon:"✅",badge:totalPending}]:[]),
    ...(isReportRole?[{id:"reports",label:"Reports",icon:"📊"}]:[]),
    ...(me.role==="admin"?[{id:"admin",label:"Admin",icon:"⚙"}]:[]),
  ];

  return <div style={{minHeight:"100vh",background:theme.bg,fontFamily:"'DM Sans','Segoe UI',sans-serif",color:theme.text,display:"flex",flexDirection:"column"}}>
    {/* Header */}
    <div style={{background:theme.navy,borderBottom:`1px solid ${theme.navyMid}`,padding:"0 24px",display:"flex",alignItems:"center",gap:14,height:62,position:"sticky",top:0,zIndex:100}}>
      <ANMLogo size={34}/>
      <div style={{lineHeight:1.2}}>
        <div style={{fontWeight:800,fontSize:14,color:"#fff",letterSpacing:-0.3}}>{COMPANY.name}</div>
        <div style={{fontSize:10,color:"#9AA3BF"}}>{COMPANY.tagline}</div>
      </div>
      <div style={{width:1,height:32,background:theme.navyMid,margin:"0 6px"}}/>
      <div style={{fontWeight:700,fontSize:13,color:theme.accentLight}}>Leave & Expense Portal</div>
      <div style={{flex:1}}/>
      <div style={{fontSize:11,color:"#9AA3BF",fontFamily:"monospace",letterSpacing:0.8}}><span style={{color:"#3DD68C"}}>●</span> LIVE {liveTime.toLocaleTimeString()}</div>
      {/* Notifications */}
      <div style={{position:"relative"}}>
        <button onClick={()=>{setNotifOpen(p=>!p); if(!notifOpen) markAllRead();}} style={{background:notifOpen?`${theme.accentLight}33`:"transparent",border:`1px solid ${notifOpen?theme.accentLight:theme.navyMid}`,borderRadius:8,padding:"6px 12px",cursor:"pointer",color:"#fff",fontSize:16,position:"relative"}}>
          🔔{unread>0&&<span style={{position:"absolute",top:-5,right:-5,background:theme.red,color:"#fff",fontSize:9,fontWeight:800,borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</span>}
        </button>
        {notifOpen&&<div style={{position:"absolute",right:0,top:46,width:320,background:theme.card,border:`1px solid ${theme.border}`,borderRadius:14,padding:16,zIndex:200,boxShadow:"0 12px 40px #00000022",maxHeight:400,overflow:"auto"}}>
          <div style={{fontWeight:700,marginBottom:12,fontSize:14}}>Notifications</div>
          {notifications.length===0?<div style={{color:theme.muted,fontSize:13}}>No notifications yet.</div>:notifications.map(n=><div key={n.id} style={{display:"flex",gap:10,padding:"10px 14px",background:n.read?"transparent":`${theme.accent}10`,borderRadius:8,border:`1px solid ${n.read?theme.border:theme.accent+"44"}`,marginBottom:6}}><span style={{fontSize:15}}>🔔</span><div><div style={{fontSize:13,color:theme.text}}>{n.message}</div><div style={{fontSize:10,color:theme.muted,marginTop:2}}>{fmt(n.created_at)}</div></div></div>)}
        </div>}
      </div>
      {/* User menu */}
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <Avatar initials={me.avatar} size={32} color={roleConfig[me.role]?.color}/>
        <div style={{lineHeight:1.2}}>
          <div style={{fontSize:12,fontWeight:700,color:"#fff"}}>{me.name}</div>
          <div style={{fontSize:10,color:"#9AA3BF"}}>{roleConfig[me.role]?.label}</div>
        </div>
        <button onClick={logout} title="Sign out" style={{background:"transparent",border:`1px solid ${theme.navyMid}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",color:"#9AA3BF",fontSize:12,marginLeft:6}}>Sign out</button>
      </div>
    </div>

    {/* Nav */}
    <div style={{background:theme.surface,borderBottom:`2px solid ${theme.border}`,padding:"0 24px",display:"flex",gap:2,boxShadow:"0 2px 8px #00000008",overflowX:"auto"}}>
      {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",padding:"13px 18px",cursor:"pointer",fontSize:13,fontWeight:600,color:tab===t.id?theme.accent:theme.muted,borderBottom:tab===t.id?`2px solid ${theme.accent}`:"2px solid transparent",marginBottom:-2,fontFamily:"inherit",whiteSpace:"nowrap"}}>{t.icon} {t.label}{t.badge>0&&<span style={{marginLeft:6,background:theme.red,color:"#fff",fontSize:10,fontWeight:800,borderRadius:10,padding:"1px 6px"}}>{t.badge}</span>}</button>)}
    </div>

    {/* Content */}
    <div style={{flex:1}}>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"28px 24px"}}>
        {tab==="dashboard"&&<Dashboard me={me} users={users} leaves={myLeaves} reimbs={myReimbs} attend={myAttend} todayLog={todayLog} totalPending={totalPending} setTab={setTab} setModal={setModal}/>}
        {tab==="attendance"&&<AttendanceTab attendance={myAttend} todayLog={todayLog} setModal={setModal}/>}
        {tab==="leaves"&&<LeavesTab leaves={myLeaves} setModal={setModal}/>}
        {tab==="reimb"&&<ReimbTab reimbursements={myReimbs} setModal={setModal}/>}
        {tab==="approvals"&&<ApprovalsTab me={me} users={users} pendAtt={me.role==="lead"?pendAttLead:pendAttHR} pendLeave={me.role==="lead"?pendLeaveLead:pendLeaveHR} pendReimb={me.role==="lead"?pendReimbLead:pendReimbHR} attendance={attendance} leaves={leaves} reimbursements={reimbursements} setModal={setModal}/>}
        {tab==="reports"&&<ReportsTab users={users} attendance={attendance} reimbursements={reimbursements}/>}
        {tab==="admin"&&<AdminTab users={users} updateRole={updateRole} updatePhone={updatePhone}/>}
      </div>
    </div>

    <Footer/>

    {modal?.type==="log_attendance"&&<LogAttendanceModal onClose={()=>setModal(null)} onSubmit={doLogAttendance} todayLog={todayLog}/>}
    {modal?.type==="review_attendance"&&<ReviewAttendanceModal onClose={()=>setModal(null)} item={modal.data} users={users} onAction={doReviewAtt}/>}
    {modal?.type==="apply_leave"&&<ApplyLeaveModal onClose={()=>setModal(null)} onSubmit={doSubmitLeave}/>}
    {modal?.type==="apply_reimb"&&<ApplyReimbModal onClose={()=>setModal(null)} onSubmitReal={async(data)=>{const lead=users.find(u=>u.role==="lead"&&u.team===me.team);const hr=users.find(u=>u.role==="hr");const{error}=await submitReimb(me.id,lead?.id,hr?.id,data);showToast(error?error.message:"Expense claim submitted!",error?"error":"success");setModal(null);}}/>}
    {modal?.type==="review_leave"&&<ReviewModal onClose={()=>setModal(null)} item={modal.data} users={users} me={me} onAction={doReviewLeave} itemType="leave"/>}
    {modal?.type==="review_reimb"&&<ReviewModal onClose={()=>setModal(null)} item={modal.data} users={users} me={me} onAction={doReviewReimb} itemType="reimb"/>}

    {toast&&<div style={{position:"fixed",bottom:28,right:28,background:toast.type==="success"?theme.green:theme.red,color:"#fff",padding:"12px 22px",borderRadius:10,fontWeight:700,fontSize:14,zIndex:9999,boxShadow:"0 8px 32px #00000022"}}>{toast.type==="success"?"✓":"✗"} {toast.msg}</div>}
  </div>;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ me, users, leaves, reimbs, attend, todayLog, totalPending, setTab, setModal }) {
  const takenDays=leaves.filter(l=>l.status==="approved").reduce((a,l)=>a+l.days,0);
  const reimbTotal=reimbs.filter(r=>r.status==="approved").reduce((a,r)=>a+Number(r.amount),0);
  const attendDays=attend.filter(a=>a.status==="approved").length;
  const stats=[
    {label:"Days Present",value:attendDays,icon:"🕐",color:theme.accent},
    {label:"Leave Days Approved",value:takenDays,icon:"📅",color:theme.purple},
    {label:"Reimbursed",value:`₹${reimbTotal.toLocaleString("en-IN")}`,icon:"💰",color:theme.green},
    {label:"Pending Items",value:totalPending,icon:"⏳",color:theme.amber},
  ];
  return <div>
    <div style={{background:`linear-gradient(135deg,${theme.navy},${theme.navyMid})`,borderRadius:16,padding:"22px 28px",marginBottom:28,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
      <div>
        <div style={{fontSize:22,fontWeight:800,marginBottom:4,color:"#fff"}}>Welcome, {me.name.split(" ")[0]} 👋</div>
        <div style={{fontSize:13,color:"#9AA3BF"}}><span style={{color:theme.accentLight,fontWeight:600}}>{roleConfig[me.role]?.label}</span> · {me.team} · <span style={{color:theme.accentLight}}>{COMPANY.short}</span></div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {!todayLog&&<Button onClick={()=>setModal({type:"log_attendance"})}>🕐 Log Attendance</Button>}
        {todayLog&&<div style={{background:theme.greenBg,border:`1px solid ${theme.green}33`,borderRadius:8,padding:"8px 16px",fontSize:13,color:theme.green,fontWeight:600}}>✓ Logged at {todayLog.login_time} — {todayLog.status}</div>}
        <Button onClick={()=>setModal({type:"apply_leave"})} variant="outline" style={{borderColor:"#fff4",color:"#fff"}}>＋ Leave</Button>
        <Button onClick={()=>setModal({type:"apply_reimb"})} variant="outline" style={{borderColor:"#fff4",color:"#fff"}}>＋ Expense</Button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
      {stats.map(s=><Card key={s.label} style={{borderTop:`3px solid ${s.color}`}}><div style={{fontSize:22,marginBottom:6}}>{s.icon}</div><div style={{fontSize:26,fontWeight:800,color:s.color}}>{s.value}</div><div style={{fontSize:12,color:theme.muted,marginTop:2}}>{s.label}</div></Card>)}
    </div>
    {totalPending>0&&<div style={{background:theme.amberBg,border:`1px solid ${theme.amber}44`,borderRadius:10,padding:"12px 18px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{fontSize:14,color:theme.amber,fontWeight:600}}>⏳ {totalPending} item(s) awaiting your action</div>
      <Button size="sm" variant="outline" onClick={()=>setTab("approvals")} style={{borderColor:theme.amber+"66",color:theme.amber}}>Review Now →</Button>
    </div>}
    <Card>
      <div style={{fontWeight:700,marginBottom:16,fontSize:15}}>Recent Activity</div>
      {[...leaves.slice(0,3).map(l=>({...l,_t:"leave"})),...reimbs.slice(0,3).map(r=>({...r,_t:"reimb"})),...attend.slice(0,3).map(a=>({...a,_t:"att"}))].sort((a,b)=>new Date(b.submitted_at||b.date)-new Date(a.submitted_at||a.date)).slice(0,6).map(item=><div key={item.id+item._t} style={{display:"flex",alignItems:"center",gap:14,padding:"10px 0",borderBottom:`1px solid ${theme.border}`}}><div style={{fontSize:20}}>{item._t==="leave"?"📅":item._t==="reimb"?"🧾":"🕐"}</div><div style={{flex:1}}><div style={{fontWeight:600,fontSize:14}}>{item._t==="leave"?`${item.type} — ${item.days}d`:item._t==="reimb"?`Expense ₹${Number(item.amount).toLocaleString("en-IN")}`:`Attendance ${item.date} @ ${item.login_time}`}</div><div style={{fontSize:12,color:theme.muted}}>{item._t==="att"?fmt(item.date):fmt(item.submitted_at)}</div></div><Badge status={item.status}/></div>)}
      {leaves.length+reimbs.length+attend.length===0&&<div style={{color:theme.muted,fontSize:14}}>No activity yet.</div>}
    </Card>
  </div>;
}

// ── Attendance Tab ───────────────────────────────────────────────────────────
function AttendanceTab({ attendance, todayLog, setModal }) {
  const approved=attendance.filter(a=>a.status==="approved").length;
  const pending=attendance.filter(a=>a.status==="pending").length;
  const rejected=attendance.filter(a=>a.status==="rejected").length;
  return <div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
      <h2 style={{margin:0,fontSize:20,fontWeight:800}}>My Attendance</h2>
      {!todayLog?<Button onClick={()=>setModal({type:"log_attendance"})}>🕐 Log Today's Attendance</Button>:<div style={{background:todayLog.status==="approved"?theme.greenBg:theme.amberBg,border:`1px solid ${todayLog.status==="approved"?theme.green:theme.amber}33`,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>Today: {todayLog.login_time} <Badge status={todayLog.status}/></div>}
    </div>
    <div style={{display:"flex",gap:12,marginBottom:22}}>
      {[{l:"Days Present",v:approved,c:theme.green,bg:theme.greenBg},{l:"Pending",v:pending,c:theme.amber,bg:theme.amberBg},{l:"Rejected",v:rejected,c:theme.red,bg:theme.redBg}].map(s=><div key={s.l} style={{background:s.bg,border:`1px solid ${s.c}22`,borderRadius:10,padding:"10px 18px",flex:1,textAlign:"center"}}><div style={{fontWeight:800,fontSize:22,color:s.c}}>{s.v}</div><div style={{fontSize:12,color:theme.muted}}>{s.l}</div></div>)}
    </div>
    {attendance.length===0&&<Card><div style={{color:theme.muted}}>No attendance records yet.</div></Card>}
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {attendance.map(a=><Card key={a.id} style={{display:"flex",gap:14,alignItems:"center"}}>
        <div style={{width:44,height:44,borderRadius:10,background:a.status==="approved"?theme.greenBg:a.status==="rejected"?theme.redBg:theme.amberBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🕐</div>
        <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:15}}>{a.date}</span><span style={{fontSize:13,color:theme.muted}}>Login: <strong style={{color:theme.text}}>{a.login_time}</strong></span><Badge status={a.status}/></div>{a.note&&<div style={{fontSize:12,color:theme.muted}}>Note: {a.note}</div>}{a.approver_remark&&<div style={{fontSize:12,color:theme.purple,background:theme.purpleBg,padding:"4px 8px",borderRadius:6,marginTop:4}}>Remark: "{a.approver_remark}"</div>}</div>
      </Card>)}
    </div>
  </div>;
}

// ── Leaves Tab ───────────────────────────────────────────────────────────────
function LeavesTab({ leaves, setModal }) {
  const bal=[{type:"Annual Leave",total:18},{type:"Sick Leave",total:10},{type:"Casual Leave",total:8}].map(b=>({...b,taken:leaves.filter(l=>l.type===b.type&&l.status==="approved").reduce((a,l)=>a+l.days,0)}));
  return <div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}><h2 style={{margin:0,fontSize:20,fontWeight:800}}>My Leave Applications</h2><Button onClick={()=>setModal({type:"apply_leave"})}>＋ Apply Leave</Button></div>
    <div style={{display:"flex",gap:12,marginBottom:22}}>{bal.map(b=><div key={b.type} style={{background:theme.card,border:`1px solid ${theme.border}`,borderRadius:10,padding:"10px 16px",flex:1,boxShadow:"0 1px 4px #00000009"}}><div style={{fontSize:11,color:theme.muted,marginBottom:4}}>{b.type}</div><div style={{fontWeight:800,fontSize:20,color:theme.accent}}>{b.total-b.taken}<span style={{fontSize:12,color:theme.muted,fontWeight:400}}> / {b.total} left</span></div></div>)}</div>
    {leaves.length===0&&<Card><div style={{color:theme.muted}}>No leave applications yet.</div></Card>}
    <div style={{display:"flex",flexDirection:"column",gap:12}}>{leaves.map(l=><Card key={l.id} style={{display:"flex",gap:16,alignItems:"flex-start"}}><div style={{width:44,height:44,borderRadius:10,background:theme.accentDim,border:`1px solid ${theme.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>📅</div><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}><span style={{fontWeight:700}}>{l.type}</span><Badge status={l.status}/></div><div style={{fontSize:13,color:theme.muted,marginBottom:4}}>{l.from_date} → {l.to_date} · {l.days} day(s)</div><div style={{fontSize:13,color:theme.muted}}>{l.reason}</div>{l.lead_comment&&<div style={{fontSize:12,marginTop:8,color:theme.purple,background:theme.purpleBg,padding:"5px 10px",borderRadius:6}}>Senior: "{l.lead_comment}"</div>}{l.hr_comment&&<div style={{fontSize:12,marginTop:4,color:theme.green,background:theme.greenBg,padding:"5px 10px",borderRadius:6}}>Management: "{l.hr_comment}"</div>}</div><div style={{fontSize:11,color:theme.dim,flexShrink:0}}>{fmt(l.submitted_at)}</div></Card>)}</div>
  </div>;
}

// ── Reimb Tab ────────────────────────────────────────────────────────────────
function ReimbTab({ reimbursements, setModal }) {
  const total=reimbursements.reduce((a,r)=>a+Number(r.amount),0);
  const approved=reimbursements.filter(r=>r.status==="approved").reduce((a,r)=>a+Number(r.amount),0);
  const pending=reimbursements.filter(r=>r.status.startsWith("pending")).reduce((a,r)=>a+Number(r.amount),0);
  return <div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}><h2 style={{margin:0,fontSize:20,fontWeight:800}}>My Expense Claims</h2><Button onClick={()=>setModal({type:"apply_reimb"})}>＋ Submit Expense</Button></div>
    <div style={{display:"flex",gap:12,marginBottom:22}}>{[{l:"Total Submitted",v:`₹${total.toLocaleString("en-IN")}`,c:theme.accent,bg:theme.accentDim},{l:"Approved",v:`₹${approved.toLocaleString("en-IN")}`,c:theme.green,bg:theme.greenBg},{l:"Pending",v:`₹${pending.toLocaleString("en-IN")}`,c:theme.amber,bg:theme.amberBg}].map(s=><div key={s.l} style={{background:s.bg,border:`1px solid ${s.c}22`,borderRadius:10,padding:"10px 18px",flex:1}}><div style={{fontWeight:800,fontSize:18,color:s.c}}>{s.v}</div><div style={{fontSize:12,color:theme.muted}}>{s.l}</div></div>)}</div>
    {reimbursements.length===0&&<Card><div style={{color:theme.muted}}>No expense claims yet.</div></Card>}
    <div style={{display:"flex",flexDirection:"column",gap:12}}>{reimbursements.map(r=><Card key={r.id} style={{display:"flex",gap:16,alignItems:"flex-start"}}><div style={{width:44,height:44,borderRadius:10,background:theme.greenBg,border:`1px solid ${theme.green}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🧾</div><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:16}}>₹{Number(r.amount).toLocaleString("en-IN")}</span><span style={{fontSize:11,color:theme.muted,background:theme.surface,padding:"2px 8px",borderRadius:12,border:`1px solid ${theme.border}`}}>{r.category}</span><Badge status={r.status}/></div><div style={{fontSize:13,color:theme.muted,marginBottom:4}}>{r.description}</div><div style={{fontSize:12,color:theme.dim}}>{r.invoice_note}</div>{r.lead_comment&&<div style={{fontSize:12,marginTop:8,color:theme.purple,background:theme.purpleBg,padding:"5px 10px",borderRadius:6}}>Senior: "{r.lead_comment}"</div>}{r.hr_comment&&<div style={{fontSize:12,marginTop:4,color:theme.green,background:theme.greenBg,padding:"5px 10px",borderRadius:6}}>Management: "{r.hr_comment}"</div>}</div><div style={{fontSize:11,color:theme.dim,flexShrink:0}}>{fmt(r.submitted_at)}</div></Card>)}</div>
  </div>;
}

// ── Approvals Tab ────────────────────────────────────────────────────────────
function ApprovalsTab({ me, users, pendAtt, pendLeave, pendReimb, attendance, leaves, reimbursements, setModal }) {
  const getU=id=>users.find(u=>u.id===id);
  const total=pendAtt.length+pendLeave.length+pendReimb.length;
  const Group=({title,icon,items,type})=>items.length===0?null:<div style={{marginBottom:28}}><div style={{fontWeight:700,fontSize:13,color:theme.amber,marginBottom:12,textTransform:"uppercase",letterSpacing:0.6}}>{icon} {title} ({items.length})</div><div style={{display:"flex",flexDirection:"column",gap:10}}>{items.map(item=>{const sub=getU(item.user_id);return <Card key={item.id} style={{display:"flex",gap:14,alignItems:"center",borderLeft:`3px solid ${theme.amber}`}}><Avatar initials={sub?.avatar} color={theme.amber} size={40}/><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{sub?.name}</div><div style={{fontSize:13,color:theme.muted}}>{type==="att"&&`Attendance: ${item.date} @ ${item.login_time}${item.note?` — "${item.note}"`:""}`}{type==="leave"&&`${item.type} · ${item.from_date} → ${item.to_date} (${item.days}d)`}{type==="reimb"&&`₹${Number(item.amount).toLocaleString("en-IN")} · ${item.category}`}</div></div><Button size="sm" onClick={()=>setModal({type:type==="att"?"review_attendance":type==="leave"?"review_leave":"review_reimb",data:item})}>Review →</Button></Card>;})}</div></div>;
  return <div>
    <h2 style={{margin:"0 0 24px",fontSize:20,fontWeight:800}}>Approvals Queue</h2>
    {total===0&&<Card style={{marginBottom:20,borderLeft:`3px solid ${theme.green}`,background:theme.greenBg}}><div style={{color:theme.green,fontWeight:600}}>✓ All caught up! No pending approvals.</div></Card>}
    <Group title="Attendance" icon="🕐" items={pendAtt} type="att"/>
    <Group title="Leave Applications" icon="📅" items={pendLeave} type="leave"/>
    <Group title="Expense Claims" icon="🧾" items={pendReimb} type="reimb"/>
  </div>;
}

// ── Reports Tab ──────────────────────────────────────────────────────────────
function ReportsTab({ users, attendance, reimbursements }) {
  const [rt,setRt]=useState("register");
  const [fDate,setFDate]=useState(todayStr());
  const [fMonth,setFMonth]=useState(todayStr().slice(0,7));
  const members=users.filter(u=>["member","lead"].includes(u.role));
  const allDates=[...new Set(attendance.map(a=>a.date))].sort((a,b)=>b.localeCompare(a)).slice(0,14);
  const dayLogs=attendance.filter(a=>a.date===fDate);
  const presentIds=new Set(dayLogs.filter(a=>a.status==="approved").map(a=>a.user_id));
  const loggedIds=new Set(dayLogs.map(a=>a.user_id));
  const approvedReimbs=reimbursements.filter(r=>r.status==="approved");
  const monthReimbs=approvedReimbs.filter(r=>(r.hr_at||r.submitted_at||"").startsWith(fMonth));
  const reimbTotal=monthReimbs.reduce((a,r)=>a+Number(r.amount),0);
  const rtabs=[{id:"register",label:"📋 Attendance Register"},{id:"daily",label:"📅 Daily Summary"},{id:"payables",label:"💰 Reimbursements to Pay"}];
  return <div>
    <h2 style={{margin:"0 0 20px",fontSize:20,fontWeight:800}}>Reports & Registers</h2>
    <div style={{display:"flex",gap:2,marginBottom:24,background:theme.surface,borderRadius:10,padding:4,border:`1px solid ${theme.border}`,width:"fit-content",flexWrap:"wrap"}}>{rtabs.map(t=><button key={t.id} onClick={()=>setRt(t.id)} style={{background:rt===t.id?theme.accent:"transparent",color:rt===t.id?"#fff":theme.muted,border:"none",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontWeight:600,fontSize:13,fontFamily:"inherit"}}>{t.label}</button>)}</div>

    {rt==="register"&&<div>
      <div style={{fontWeight:700,marginBottom:14,fontSize:15}}>Attendance Register — Last 14 Days</div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",background:theme.card,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px #00000009"}}><thead><tr style={{background:theme.navy}}><th style={{padding:"12px 16px",textAlign:"left",fontSize:12,fontWeight:700,color:"#9AA3BF",whiteSpace:"nowrap"}}>STAFF</th>{allDates.map(d=><th key={d} style={{padding:"12px 10px",textAlign:"center",fontSize:11,fontWeight:700,color:"#9AA3BF",minWidth:64}}>{new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</th>)}<th style={{padding:"12px 10px",textAlign:"center",fontSize:12,fontWeight:700,color:theme.accentLight}}>TOTAL</th></tr></thead><tbody>{members.map((u,ri)=>{const rowTotal=allDates.filter(d=>attendance.find(a=>a.user_id===u.id&&a.date===d&&a.status==="approved")).length;return <tr key={u.id} style={{background:ri%2===0?theme.card:theme.bg,borderBottom:`1px solid ${theme.border}`}}><td style={{padding:"11px 16px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><Avatar initials={u.avatar} size={28}/><div><div style={{fontWeight:600,fontSize:13}}>{u.name}</div><div style={{fontSize:11,color:theme.muted}}>{u.team}</div></div></div></td>{allDates.map(d=>{const log=attendance.find(a=>a.user_id===u.id&&a.date===d);const cell=!log?{bg:"#fff0",txt:"—",c:theme.dim}:log.status==="approved"?{bg:theme.greenBg,txt:"P",c:theme.green}:log.status==="rejected"?{bg:theme.redBg,txt:"R",c:theme.red}:{bg:theme.amberBg,txt:"?",c:theme.amber};return <td key={d} style={{padding:"11px 10px",textAlign:"center"}}><span title={log?`${log.login_time}`:"No record"} style={{display:"inline-block",width:28,height:28,borderRadius:6,background:cell.bg,color:cell.c,fontWeight:700,fontSize:12,lineHeight:"28px"}}>{cell.txt}</span></td>;})}<td style={{padding:"11px 10px",textAlign:"center",fontWeight:800,fontSize:14,color:theme.accent}}>{rowTotal}</td></tr>;})}</tbody></table></div>
      <div style={{display:"flex",gap:16,marginTop:14,flexWrap:"wrap"}}>{[{l:"P = Present",c:theme.green,bg:theme.greenBg},{l:"? = Pending",c:theme.amber,bg:theme.amberBg},{l:"R = Rejected",c:theme.red,bg:theme.redBg},{l:"— = Absent",c:theme.dim,bg:"#f0ece6"}].map(x=><div key={x.l} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:theme.muted}}><span style={{display:"inline-block",width:20,height:20,borderRadius:4,background:x.bg,border:`1px solid ${x.c}33`}}></span>{x.l}</div>)}</div>
    </div>}

    {rt==="daily"&&<div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,flexWrap:"wrap"}}><div style={{fontWeight:700,fontSize:15}}>Daily Attendance Summary</div><input type="date" value={fDate} onChange={e=>setFDate(e.target.value)} style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:8,padding:"8px 12px",color:theme.text,fontSize:13,fontFamily:"inherit"}}/></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>{[{l:"Total Staff",v:members.length,c:theme.accent,bg:theme.accentDim},{l:"Present",v:presentIds.size,c:theme.green,bg:theme.greenBg},{l:"Logged (Pending)",v:loggedIds.size-presentIds.size,c:theme.amber,bg:theme.amberBg},{l:"Absent",v:members.length-loggedIds.size,c:theme.red,bg:theme.redBg}].map(s=><div key={s.l} style={{background:s.bg,border:`1px solid ${s.c}22`,borderRadius:10,padding:"14px 16px",textAlign:"center"}}><div style={{fontWeight:800,fontSize:24,color:s.c}}>{s.v}</div><div style={{fontSize:12,color:theme.muted}}>{s.l}</div></div>)}</div>
      <Card><div style={{fontWeight:700,marginBottom:14}}>Staff-wise Status — {fmt(fDate)}</div><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{borderBottom:`2px solid ${theme.border}`}}>{["Name","Team","Login","Note","Status"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:"left",fontSize:11,fontWeight:700,color:theme.muted,textTransform:"uppercase"}}>{h}</th>)}</tr></thead><tbody>{members.map(u=>{const log=attendance.find(a=>a.user_id===u.id&&a.date===fDate);return <tr key={u.id} style={{borderBottom:`1px solid ${theme.border}`}}><td style={{padding:"10px 12px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><Avatar initials={u.avatar} size={28}/><span style={{fontWeight:600,fontSize:13}}>{u.name}</span></div></td><td style={{padding:"10px 12px",fontSize:13,color:theme.muted}}>{u.team}</td><td style={{padding:"10px 12px",fontSize:13,fontWeight:600,color:log?theme.text:theme.dim}}>{log?log.login_time:"—"}</td><td style={{padding:"10px 12px",fontSize:12,color:theme.muted}}>{log?.note||"—"}</td><td style={{padding:"10px 12px"}}>{log?<Badge status={log.status}/>:<span style={{fontSize:12,color:theme.red,fontWeight:600}}>● ABSENT</span>}</td></tr>;})}</tbody></table></Card>
    </div>}

    {rt==="payables"&&<div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20,flexWrap:"wrap"}}><div style={{fontWeight:700,fontSize:15}}>Approved Reimbursements — Payable</div><input type="month" value={fMonth} onChange={e=>setFMonth(e.target.value)} style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:8,padding:"8px 12px",color:theme.text,fontSize:13,fontFamily:"inherit"}}/><div style={{marginLeft:"auto",background:theme.greenBg,border:`1px solid ${theme.green}33`,borderRadius:8,padding:"8px 16px",fontWeight:800,fontSize:16,color:theme.green}}>Total: ₹{reimbTotal.toLocaleString("en-IN")}</div></div>
      {monthReimbs.length===0&&<Card><div style={{color:theme.muted}}>No approved reimbursements for this month.</div></Card>}
      {monthReimbs.length>0&&<Card style={{padding:0,overflow:"hidden"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr style={{background:theme.navy}}>{["Staff","Category","Description","Invoice","Approved","Amount"].map(h=><th key={h} style={{padding:"12px 14px",textAlign:"left",fontSize:11,fontWeight:700,color:"#9AA3BF",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{monthReimbs.map((r,i)=>{const u=users.find(x=>x.id===r.user_id);return <tr key={r.id} style={{background:i%2===0?theme.card:theme.bg,borderBottom:`1px solid ${theme.border}`}}><td style={{padding:"11px 14px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><Avatar initials={u?.avatar} size={26}/><span style={{fontWeight:600,fontSize:13}}>{u?.name}</span></div></td><td style={{padding:"11px 14px",fontSize:13}}><span style={{background:theme.accentDim,color:theme.accent,padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:600}}>{r.category}</span></td><td style={{padding:"11px 14px",fontSize:13,maxWidth:180}}>{r.description}</td><td style={{padding:"11px 14px",fontSize:12,color:theme.muted}}>{r.invoice_note}</td><td style={{padding:"11px 14px",fontSize:12,color:theme.muted,whiteSpace:"nowrap"}}>{fmt(r.hr_at)}</td><td style={{padding:"11px 14px",fontWeight:800,fontSize:14,color:theme.green}}>₹{Number(r.amount).toLocaleString("en-IN")}</td></tr>;})}<tr style={{background:theme.navy}}><td colSpan={5} style={{padding:"12px 14px",fontWeight:700,fontSize:13,color:"#9AA3BF",textAlign:"right"}}>TOTAL PAYABLE</td><td style={{padding:"12px 14px",fontWeight:900,fontSize:16,color:theme.accentLight}}>₹{reimbTotal.toLocaleString("en-IN")}</td></tr></tbody></table></Card>}
    </div>}
  </div>;
}

// ── Admin Tab ────────────────────────────────────────────────────────────────
function AdminTab({ users, updateRole, updatePhone }) {
  const [editPhone,setEditPhone]=useState(null);
  const [phoneVal,setPhoneVal]=useState("");
  return <div>
    <h2 style={{margin:"0 0 6px",fontSize:20,fontWeight:800}}>Admin Panel</h2>
    <div style={{color:theme.muted,fontSize:13,marginBottom:24}}>Manage designations, phone numbers, and approval hierarchy.</div>
    <Card style={{marginBottom:20,borderLeft:`3px solid #25D366`}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}><div style={{fontSize:28}}>💬</div><div><div style={{fontWeight:700,fontSize:15}}>WhatsApp Integration</div><div style={{fontSize:12,color:theme.muted}}>Notifications on Management approval/rejection</div></div><div style={{marginLeft:"auto",background:"#25D36618",border:"1px solid #25D36644",borderRadius:8,padding:"4px 12px",fontSize:12,fontWeight:700,color:"#128C7E"}}>READY</div></div>
      <div style={{fontSize:12,color:theme.muted,background:theme.amberBg,borderRadius:8,padding:"8px 12px",border:`1px solid ${theme.amber}33`}}>⚙️ Set <code>WHATSAPP_TOKEN</code> and <code>WHATSAPP_PHONE_ID</code> in Vercel env variables, then ensure phone numbers below are correct.</div>
    </Card>
    <Card style={{marginBottom:20}}>
      <div style={{fontWeight:700,marginBottom:4}}>Office Information</div>
      <div style={{fontSize:13,color:theme.muted,marginBottom:12}}>Contact details on file</div>
      {[{icon:"✉",label:"Primary Email",val:COMPANY.email},{icon:"✉",label:"HR Email",val:COMPANY.emailHR},{icon:"📞",label:"Phone",val:COMPANY.phone},{icon:"📍",label:"Address",val:COMPANY.address}].map(c=><div key={c.label} style={{display:"flex",gap:12,padding:"8px 0",borderBottom:`1px solid ${theme.border}`,alignItems:"center"}}><span style={{color:theme.accent,width:20}}>{c.icon}</span><span style={{fontSize:12,color:theme.muted,width:110,flexShrink:0}}>{c.label}</span><span style={{fontSize:13,color:theme.text}}>{c.val}</span></div>)}
    </Card>
    <Card>
      <div style={{fontWeight:700,marginBottom:16}}>Team Designations & Phone Numbers</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>{users.map(u=><div key={u.id} style={{display:"flex",alignItems:"center",gap:14,padding:"8px 0",borderBottom:`1px solid ${theme.border}`,flexWrap:"wrap"}}>
        <Avatar initials={u.avatar} color={roleConfig[u.role]?.color} size={38}/>
        <div style={{flex:1,minWidth:180}}><div style={{fontWeight:600,fontSize:14}}>{u.name}</div><div style={{fontSize:12,color:theme.muted}}>{u.email} · {u.team}</div>
          {editPhone===u.id?<div style={{display:"flex",gap:6,marginTop:4}}><input value={phoneVal} onChange={e=>setPhoneVal(e.target.value)} placeholder="919XXXXXXXXX" style={{fontSize:12,padding:"4px 8px",border:`1px solid ${theme.border}`,borderRadius:6,fontFamily:"monospace"}}/><Button size="sm" onClick={()=>{updatePhone(u.id,phoneVal);setEditPhone(null);}}>Save</Button><Button size="sm" variant="ghost" onClick={()=>setEditPhone(null)}>Cancel</Button></div>:<div style={{fontSize:11,color:u.phone?.includes("X")||!u.phone?theme.amber:theme.green,marginTop:2,cursor:"pointer"}} onClick={()=>{setEditPhone(u.id);setPhoneVal(u.phone||"");}}>📱 {u.phone?.includes("X")||!u.phone?"Tap to set phone":u.phone} ✎</div>}
        </div>
        <select value={u.role} onChange={e=>updateRole(u.id,e.target.value)} style={{background:theme.surface,border:`1px solid ${theme.border}`,borderRadius:8,padding:"6px 12px",color:roleConfig[u.role]?.color,fontSize:12,fontFamily:"inherit",cursor:"pointer",fontWeight:600}}><option value="member">Staff</option><option value="lead">Senior / Lead</option><option value="hr">Management</option><option value="admin">Admin</option></select>
      </div>)}</div>
    </Card>
  </div>;
}

// ── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return <footer style={{borderTop:`1px solid ${theme.border}`,background:theme.navy,marginTop:60,padding:"28px 24px"}}>
    <div style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:28}}>
      <div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><ANMLogo size={36}/><div><div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{COMPANY.name}</div><div style={{fontSize:11,color:"#9AA3BF"}}>{COMPANY.tagline}</div></div></div></div>
      <div><div style={{fontWeight:700,fontSize:13,color:theme.accentLight,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Contact</div>{[{icon:"✉",val:COMPANY.email},{icon:"📞",val:COMPANY.phone},{icon:"📍",val:COMPANY.address}].map(c=><div key={c.val} style={{display:"flex",gap:8,fontSize:12,color:"#9AA3BF",marginBottom:6}}><span style={{color:theme.accentLight}}>{c.icon}</span>{c.val}</div>)}</div>
      <div><div style={{fontWeight:700,fontSize:13,color:theme.accentLight,marginBottom:12,textTransform:"uppercase",letterSpacing:1}}>Modules</div>{["Attendance","Leave","Expenses","Reports","WhatsApp Alerts"].map((s,i)=><div key={s} style={{display:"flex",gap:8,alignItems:"center",marginBottom:6}}><div style={{width:20,height:20,borderRadius:"50%",background:`${theme.accent}44`,border:`1px solid ${theme.accent}88`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:theme.accentLight}}>{i+1}</div><span style={{fontSize:12,color:"#9AA3BF"}}>{s}</span></div>)}</div>
    </div>
    <div style={{maxWidth:1100,margin:"18px auto 0",paddingTop:18,borderTop:"1px solid #2C3A6E",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><div style={{fontSize:11,color:"#6B7599"}}>© 2026 {COMPANY.name}. All rights reserved.</div><div style={{fontSize:11,color:"#6B7599"}}>{COMPANY.credits}</div></div>
  </footer>;
}

// ── Modals ───────────────────────────────────────────────────────────────────
function LogAttendanceModal({ onClose, onSubmit, todayLog }) {
  const now=new Date();const [loginTime,setLoginTime]=useState(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);const [note,setNote]=useState("");
  if(todayLog) return <Modal open onClose={onClose} title="Today's Attendance"><div style={{textAlign:"center",padding:"10px 0"}}><div style={{fontSize:40,marginBottom:10}}>✅</div><div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Already logged in today!</div><div style={{color:theme.muted,marginBottom:20}}>Login time: <strong>{todayLog.login_time}</strong></div><Button variant="ghost" onClick={onClose}>Close</Button></div></Modal>;
  return <Modal open onClose={onClose} title="Log Today's Attendance"><div style={{display:"flex",flexDirection:"column",gap:16}}><div style={{background:theme.accentDim,borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,border:`1px solid ${theme.accent}33`}}><div style={{fontSize:28}}>🕐</div><div><div style={{fontWeight:700,fontSize:15,color:theme.accent}}>Today — {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</div><div style={{fontSize:12,color:theme.muted}}>Confirm your login time</div></div></div><Input label="Login Time" type="time" value={loginTime} onChange={setLoginTime} required/><div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase",letterSpacing:0.6}}>Note (optional)</label><Textarea value={note} onChange={setNote} placeholder="e.g. Late due to traffic…"/></div><div style={{fontSize:12,color:theme.muted,background:theme.surface,padding:"10px 14px",borderRadius:8}}>Sent to your Senior / Team Lead for approval.</div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={()=>onSubmit(loginTime,note)}>✓ Submit</Button></div></div></Modal>;
}

function ReviewAttendanceModal({ onClose, item, users, onAction }) {
  const [c,setC]=useState("");const sub=users.find(u=>u.id===item.user_id);
  return <Modal open onClose={onClose} title="Review Attendance"><div style={{display:"flex",flexDirection:"column",gap:16}}><div style={{display:"flex",gap:12,alignItems:"center"}}><Avatar initials={sub?.avatar} size={46}/><div><div style={{fontWeight:700,fontSize:15}}>{sub?.name}</div><div style={{fontSize:12,color:theme.muted}}>{sub?.team} · {sub?.email}</div></div><div style={{marginLeft:"auto"}}><Badge status={item.status}/></div></div><div style={{background:theme.surface,borderRadius:10,padding:14,display:"flex",flexDirection:"column",gap:8}}><Row k="Date" v={fmt(item.date)}/><Row k="Login Time" v={<strong>{item.login_time}</strong>}/><Row k="Note" v={item.note||"—"}/></div><div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase"}}>Remarks</label><Textarea value={c} onChange={setC} placeholder="Optional…"/></div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="danger" onClick={()=>onAction(item,"reject",c)}>✗ Reject</Button><Button variant="success" onClick={()=>onAction(item,"approve",c)}>✓ Approve</Button></div></div></Modal>;
}

function ApplyLeaveModal({ onClose, onSubmit }) {
  const [form,setForm]=useState({type:"Casual Leave",from:"",to:"",reason:""});
  const days=form.from&&form.to?Math.max(1,Math.round((new Date(form.to)-new Date(form.from))/86400000)+1):0;
  const f=k=>v=>setForm(p=>({...p,[k]:v}));
  return <Modal open onClose={onClose} title="Apply for Leave"><div style={{display:"flex",flexDirection:"column",gap:16}}><Sel label="Leave Type" value={form.type} onChange={f("type")} options={["Annual Leave","Sick Leave","Casual Leave","Maternity Leave","Paternity Leave","Compensatory Leave","Unpaid Leave"].map(v=>({value:v,label:v}))}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Input label="From" type="date" value={form.from} onChange={f("from")} required/><Input label="To" type="date" value={form.to} onChange={f("to")} required/></div>{days>0&&<div style={{fontSize:13,color:theme.accent,background:theme.accentDim,padding:"8px 12px",borderRadius:8,border:`1px solid ${theme.accent}33`}}>Duration: <strong>{days} working day(s)</strong></div>}<div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase"}}>Reason <span style={{color:theme.red}}>*</span></label><Textarea value={form.reason} onChange={f("reason")} rows={3} placeholder="Brief reason…"/></div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={()=>form.from&&form.to&&form.reason&&onSubmit({...form,days})} disabled={!form.from||!form.to||!form.reason}>Submit</Button></div></div></Modal>;
}

function ApplyReimbModal({ onClose, onSubmitReal }) {
  const [form,setForm]=useState({category:"Travel",amount:"",description:"",invoiceNote:""});
  const f=k=>v=>setForm(p=>({...p,[k]:v}));
  return <Modal open onClose={onClose} title="Submit Expense Claim"><div style={{display:"flex",flexDirection:"column",gap:16}}><Sel label="Category" value={form.category} onChange={f("category")} options={["Travel","Food & Entertainment","Accommodation","Office Supplies","Professional Fees","Client Gifts","Training & CPE","Medical","Other"].map(v=>({value:v,label:v}))}/><Input label="Amount (₹)" type="number" value={form.amount} onChange={f("amount")} placeholder="0.00" required/><div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase"}}>Description <span style={{color:theme.red}}>*</span></label><Textarea value={form.description} onChange={f("description")} placeholder="Purpose…"/></div><Input label="Invoice / Receipt Reference" value={form.invoiceNote} onChange={f("invoiceNote")} placeholder="Invoice number…"/><div style={{fontSize:12,color:theme.muted,background:theme.surface,padding:"10px 14px",borderRadius:8}}>📎 Senior verifies before forwarding to Management.</div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={()=>form.amount&&form.description&&onSubmitReal({...form,amount:+form.amount})} disabled={!form.amount||!form.description}>Submit</Button></div></div></Modal>;
}

function ReviewModal({ onClose, item, users, me, onAction, itemType }) {
  const [c,setC]=useState("");const sub=users.find(u=>u.id===item.user_id);
  const isLead=item.status==="pending_lead"&&me.role==="lead";const isHR=item.status==="pending_hr"&&me.role==="hr";
  const canAct=isLead||isHR;const prefix=isLead?"lead":"hr";
  return <Modal open onClose={onClose} title={`Review ${itemType==="leave"?"Leave":"Expense"} Request`}><div style={{display:"flex",flexDirection:"column",gap:16}}><div style={{display:"flex",gap:12,alignItems:"center"}}><Avatar initials={sub?.avatar} size={46}/><div><div style={{fontWeight:700,fontSize:15}}>{sub?.name}</div><div style={{fontSize:12,color:theme.muted}}>{sub?.team} · {sub?.email}</div></div><div style={{marginLeft:"auto"}}><Badge status={item.status}/></div></div><div style={{background:theme.surface,borderRadius:10,padding:14,display:"flex",flexDirection:"column",gap:8}}>{itemType==="leave"?<><Row k="Type" v={item.type}/><Row k="Dates" v={`${item.from_date} → ${item.to_date} (${item.days}d)`}/><Row k="Reason" v={item.reason}/></>:<><Row k="Category" v={item.category}/><Row k="Amount" v={`₹${Number(item.amount).toLocaleString("en-IN")}`}/><Row k="Description" v={item.description}/><Row k="Invoice" v={item.invoice_note}/></>}<Row k="Submitted" v={fmt(item.submitted_at)}/></div>{item.lead_comment&&<div style={{fontSize:13,color:theme.purple,background:theme.purpleBg,padding:"8px 12px",borderRadius:8}}>Senior: "{item.lead_comment}"</div>}{canAct&&<><div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,fontWeight:600,color:theme.muted,textTransform:"uppercase"}}>Remarks</label><Textarea value={c} onChange={setC} placeholder="Optional…"/></div><div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="danger" onClick={()=>onAction(item,`${prefix}_reject`,c)}>✗ Reject</Button><Button variant="success" onClick={()=>onAction(item,`${prefix}_approve`,c)}>✓ {isLead?"Recommend":"Approve"}</Button></div></>}{!canAct&&<Button variant="ghost" onClick={onClose} style={{alignSelf:"flex-end"}}>Close</Button>}</div></Modal>;
}
