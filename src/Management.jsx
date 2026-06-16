import { useState, useMemo } from "react";
import { theme, roleConfig } from "./theme";
import { Card, Button, PhotoAvatar, Badge, fmt, EmptyState } from "./ui";

const todayStr = () => new Date().toISOString().split("T")[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().split("T")[0]; };

// ════════════════════════════════════════════════════════════════════════════
// MANAGEMENT / HR DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
export function ManagementDashboard({ users, attendance, leaves, reimbursements, isMobile, setTab, lateCutoff="10:15", setModal }) {
  const today = todayStr();
  const staff = users.filter(u => ["member", "lead"].includes(u.role) && u.active !== false);

  const todayAtt = attendance.filter(a => a.date === today);
  const presentToday = todayAtt.filter(a => a.status === "approved");
  const loggedToday = todayAtt;
  const pendingAttToday = todayAtt.filter(a => a.status && a.status.startsWith("pending"));

  // On leave today (approved leaves covering today)
  const onLeaveToday = leaves.filter(l => l.status === "approved" && l.from_date <= today && l.to_date >= today);

  // Late comers (logged in after configurable cutoff)
  const lateComers = todayAtt.filter(a => a.login_time && a.login_time > lateCutoff);

  // Pending approvals across the org
  const pendingLeaves = leaves.filter(l => l.status === "pending_lead" || l.status === "pending_hr");
  const pendingReimbs = reimbursements.filter(r => r.status === "pending_lead" || r.status === "pending_hr");
  const pendingReimbAmount = pendingReimbs.reduce((a, r) => a + Number(r.amount), 0);

  // Absent = active staff who did not log in and are not on leave
  const onLeaveIds = new Set(onLeaveToday.map(l => l.user_id));
  const loggedIds = new Set(loggedToday.map(a => a.user_id));
  const absentToday = staff.filter(s => !loggedIds.has(s.id) && !onLeaveIds.has(s.id));

  const getU = id => users.find(u => u.id === id);

  const bigStats = [
    { label: "Present Today", value: presentToday.length, sub: `of ${staff.length} staff`, icon: "✅", color: theme.green, bg: theme.greenBg },
    { label: "On Leave Today", value: onLeaveToday.length, sub: "approved leaves", icon: "📅", color: theme.purple, bg: theme.purpleBg },
    { label: "Absent", value: absentToday.length, sub: "not logged in", icon: "❌", color: theme.red, bg: theme.redBg },
    { label: "Late Comers", value: lateComers.length, sub: `after ${lateCutoff}`, icon: "⏰", color: theme.amber, bg: theme.amberBg },
  ];

  return <div className="anm-fade">
    <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>Management Overview</h2>
    <div style={{ color: theme.muted, fontSize: 13, marginBottom: 20 }}>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>

    {/* Big stat cards */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: isMobile ? 10 : 14, marginBottom: 22 }}>
      {bigStats.map((s, i) => (
        <Card key={s.label} className="anm-fade" style={{ background: s.bg, border: `1px solid ${s.color}22`, animationDelay: `${i * 0.06}s` }}>
          <div style={{ fontSize: isMobile ? 20 : 22, marginBottom: 6 }}>{s.icon}</div>
          <div style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginTop: 4 }}>{s.label}</div>
          <div style={{ fontSize: 11, color: theme.muted }}>{s.sub}</div>
        </Card>
      ))}
    </div>

    {/* Pending approvals banner */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 22 }}>
      <Card style={{ borderLeft: `3px solid ${theme.amber}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: theme.muted }}>Pending Leave Approvals</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: theme.amber }}>{pendingLeaves.length}</div>
          </div>
          <div style={{ fontSize: 32 }}>📅</div>
        </div>
      </Card>
      <Card style={{ borderLeft: `3px solid ${theme.green}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: theme.muted }}>Pending Claims</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: theme.green }}>₹{pendingReimbAmount.toLocaleString("en-IN")}</div>
            <div style={{ fontSize: 11, color: theme.muted }}>{pendingReimbs.length} claim(s)</div>
          </div>
          <div style={{ fontSize: 32 }}>🧾</div>
        </div>
      </Card>
    </div>

    {/* Detail lists */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: theme.red }}>❌ Absent Today ({absentToday.length})</div>
        {absentToday.length === 0 ? <div style={{ fontSize: 13, color: theme.green }}>Everyone is accounted for! 🎉</div>
          : absentToday.map(u => <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${theme.border}` }}><PhotoAvatar user={u} size={30} /><span style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</span><span style={{ fontSize: 12, color: theme.muted, marginLeft: "auto" }}>{u.team}</span></div>)}
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: theme.amber }}>⏰ Late Comers ({lateComers.length})</div>
        {lateComers.length === 0 ? <div style={{ fontSize: 13, color: theme.green }}>No late arrivals today.</div>
          : lateComers.map(a => { const u = getU(a.user_id); return <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${theme.border}` }}><PhotoAvatar user={u} size={30} /><span style={{ fontSize: 13, fontWeight: 600 }}>{u?.name}</span><span style={{ fontSize: 12, color: theme.amber, marginLeft: "auto", fontWeight: 600 }}>{a.login_time}</span></div>; })}
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: theme.purple }}>📅 On Leave Today ({onLeaveToday.length})</div>
        {onLeaveToday.length === 0 ? <div style={{ fontSize: 13, color: theme.muted }}>No one is on leave today.</div>
          : onLeaveToday.map(l => { const u = getU(l.user_id); return <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${theme.border}` }}><PhotoAvatar user={u} size={30} /><span style={{ fontSize: 13, fontWeight: 600 }}>{u?.name}</span><span style={{ fontSize: 12, color: theme.muted, marginLeft: "auto" }}>{l.type}</span></div>; })}
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: theme.green }}>✅ Present Today ({presentToday.length})</div>
        {presentToday.length === 0 ? <div style={{ fontSize: 13, color: theme.muted }}>No approved attendance yet today.</div>
          : presentToday.slice(0, 8).map(a => { const u = getU(a.user_id); return <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${theme.border}` }}><PhotoAvatar user={u} size={30} /><span style={{ fontSize: 13, fontWeight: 600 }}>{u?.name}</span><span style={{ fontSize: 12, color: theme.green, marginLeft: "auto" }}>{a.login_time}</span></div>; })}
      </Card>
    </div>

    {/* Reset attendance — for wrongly punched login/logout */}
    {setModal && (() => {
      const todayPunches = todayAtt.filter(a => a.login_time);
      return <Card style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: theme.accent }}>♻ Reset Attendance</div>
        <div style={{ fontSize: 12, color: theme.muted, marginBottom: 12 }}>If someone punched in/out by mistake today, reset it so they can punch again.</div>
        {todayPunches.length === 0 ? <div style={{ fontSize: 13, color: theme.muted }}>No attendance punched today yet.</div>
          : todayPunches.map(a => { const u = getU(a.user_id); return <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${theme.border}` }}>
              <PhotoAvatar user={u} size={30} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{u?.name}</div><div style={{ fontSize: 11, color: theme.muted }}>In {a.login_time}{a.logout_time ? ` · Out ${a.logout_time}` : ""} · {a.status}</div></div>
              <Button size="sm" variant="ghost" onClick={() => setModal({ type: "reset_attendance", data: a })} style={{ color: theme.red, borderColor: `${theme.red}55` }}>Reset</Button>
            </div>; })}
      </Card>;
    })()}
  </div>;
}
export function AIAssistant({ users, attendance, leaves, reimbursements, isMobile, lateCutoff="10:15" }) {
  const [messages, setMessages] = useState([
    { from: "ai", text: "Hi! I'm your ANM assistant. Ask me about attendance, leaves, or claims. Try one of the suggestions below 👇" },
  ]);
  const [input, setInput] = useState("");

  const suggestions = [
    "Who is present today?",
    "Who is absent today?",
    "Who is on leave this week?",
    "Show pending claims above 5000",
    "Who applied for leave this week?",
    "Who will be on leave next week?",
    "Who came late today?",
    "How many staff total?",
  ];

  const answer = (q) => {
    const ql = q.toLowerCase();
    const today = todayStr();
    const staff = users.filter(u => ["member", "lead"].includes(u.role) && u.active !== false);
    const getU = id => users.find(u => u.id === id);
    const nameList = (arr) => arr.length ? arr.join(", ") : "no one";

    // Present today
    if (/present|who.*(in|here).*today/.test(ql) && !/leave/.test(ql)) {
      const present = attendance.filter(a => a.date === today && a.status === "approved").map(a => getU(a.user_id)?.name).filter(Boolean);
      const pending = attendance.filter(a => a.date === today && a.status && a.status.startsWith("pending")).map(a => getU(a.user_id)?.name).filter(Boolean);
      let r = `✅ Present today (${present.length}): ${nameList(present)}.`;
      if (pending.length) r += `\n⏳ Logged in but pending approval: ${nameList(pending)}.`;
      return r;
    }
    // Absent today
    if (/absent|who.*not.*(here|in)|missing/.test(ql)) {
      const onLeave = new Set(leaves.filter(l => l.status === "approved" && l.from_date <= today && l.to_date >= today).map(l => l.user_id));
      const logged = new Set(attendance.filter(a => a.date === today).map(a => a.user_id));
      const absent = staff.filter(s => !logged.has(s.id) && !onLeave.has(s.id)).map(s => s.name);
      return absent.length ? `❌ Absent today (${absent.length}): ${nameList(absent)}.` : "🎉 No one is absent today — everyone is present or on approved leave.";
    }
    // Late today
    if (/late|after 9|came late|tardy/.test(ql)) {
      const late = attendance.filter(a => a.date === today && a.login_time && a.login_time > lateCutoff).map(a => `${getU(a.user_id)?.name} (${a.login_time})`);
      return late.length ? `⏰ Late comers today (after ${lateCutoff}): ${nameList(late)}.` : "👍 No late arrivals today.";
    }
    // On leave THIS week (currently approved overlapping this week)
    if (/leave.*this week|this week.*leave|on leave (this )?week/.test(ql) || (/who.*leave/.test(ql) && /this week/.test(ql))) {
      const weekEnd = addDays(today, 7);
      const onLeave = leaves.filter(l => l.status === "approved" && l.from_date <= weekEnd && l.to_date >= today).map(l => `${getU(l.user_id)?.name} (${l.type}, ${l.from_date}→${l.to_date})`);
      return onLeave.length ? `📅 On leave this week: ${nameList(onLeave)}.` : "No approved leaves overlapping this week.";
    }
    // Leave NEXT week
    if (/next week/.test(ql)) {
      const nwStart = addDays(today, 7), nwEnd = addDays(today, 14);
      const onLeave = leaves.filter(l => l.status === "approved" && l.from_date <= nwEnd && l.to_date >= nwStart).map(l => `${getU(l.user_id)?.name} (${l.type}, ${l.from_date}→${l.to_date})`);
      return onLeave.length ? `📅 On leave next week: ${nameList(onLeave)}.` : "✅ No one has approved leave next week — full attendance expected.";
    }
    // Applied for leave this week (submitted recently)
    if (/applied.*leave|leave.*request|requested leave/.test(ql)) {
      const weekAgo = addDays(today, -7);
      const applied = leaves.filter(l => (l.submitted_at || "").split("T")[0] >= weekAgo).map(l => `${getU(l.user_id)?.name} (${l.type}, ${l.status.replace("_", " ")})`);
      return applied.length ? `📝 Leave applications this week: ${nameList(applied)}.` : "No leave applications in the past week.";
    }
    // Pending claims above X
    if (/claim|reimburse|expense/.test(ql) && /pending|above|over|greater|more than|\d/.test(ql)) {
      const m = ql.match(/(\d[\d,]*)\s*k?/);
      let threshold = 0;
      if (m) { threshold = parseInt(m[1].replace(/,/g, "")); if (/k/.test(ql)) threshold *= 1000; }
      const pending = reimbursements.filter(r => (r.status === "pending_lead" || r.status === "pending_hr") && Number(r.amount) >= threshold)
        .sort((a, b) => Number(b.amount) - Number(a.amount))
        .map(r => `${getU(r.user_id)?.name} — ₹${Number(r.amount).toLocaleString("en-IN")} (${r.category}, ${r.status.replace("_", " ")})`);
      const head = threshold > 0 ? `🧾 Pending claims above ₹${threshold.toLocaleString("en-IN")}:` : "🧾 All pending claims:";
      return pending.length ? `${head}\n${pending.join("\n")}` : `No pending claims${threshold ? ` above ₹${threshold.toLocaleString("en-IN")}` : ""}.`;
    }
    // Total staff
    if (/how many|total|count|number of/.test(ql)) {
      const byRole = { Staff: staff.filter(s => s.role === "member").length, Leads: staff.filter(s => s.role === "lead").length };
      return `👥 Total active staff: ${staff.length} (${byRole.Staff} staff, ${byRole.Leads} leads). Plus management & admin.`;
    }
    // Pending approvals general
    if (/pending|approval|waiting/.test(ql)) {
      const pl = leaves.filter(l => l.status.startsWith("pending")).length;
      const pr = reimbursements.filter(r => r.status.startsWith("pending")).length;
      const pa = attendance.filter(a => a.status && a.status.startsWith("pending")).length;
      return `⏳ Pending approvals:\n• Leaves: ${pl}\n• Claims: ${pr}\n• Attendance: ${pa}`;
    }

    return "I can answer questions about: who's present/absent/late today, who's on leave this week or next week, leave applications, pending claims (e.g. 'claims above 5000'), and staff counts. Try rephrasing, or tap a suggestion below.";
  };

  const send = (text) => {
    const q = (text ?? input).trim();
    if (!q) return;
    const reply = answer(q);
    setMessages(m => [...m, { from: "user", text: q }, { from: "ai", text: reply }]);
    setInput("");
  };

  return <div className="anm-fade">
    <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>🤖 AI Assistant</h2>
    <div style={{ color: theme.muted, fontSize: 13, marginBottom: 16 }}>Ask questions about team attendance, leaves, and claims.</div>

    <Card style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", height: isMobile ? "60vh" : 480 }}>
      {/* Chat area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12, background: theme.bg }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.from === "user" ? "flex-end" : "flex-start", maxWidth: "82%" }}>
            <div style={{
              background: m.from === "user" ? theme.accent : "#fff",
              color: m.from === "user" ? "#fff" : theme.text,
              padding: "10px 14px", borderRadius: 14,
              borderBottomRightRadius: m.from === "user" ? 4 : 14,
              borderBottomLeftRadius: m.from === "user" ? 14 : 4,
              fontSize: 13.5, whiteSpace: "pre-line", lineHeight: 1.5,
              border: m.from === "ai" ? `1px solid ${theme.border}` : "none",
              boxShadow: "0 1px 3px #00000010",
            }}>{m.text}</div>
          </div>
        ))}
      </div>
      {/* Suggestions */}
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${theme.border}`, display: "flex", gap: 8, overflowX: "auto", background: theme.surface }}>
        {suggestions.map(s => <button key={s} onClick={() => send(s)} style={{ flexShrink: 0, background: theme.accentDim, border: `1px solid ${theme.accent}33`, color: theme.accent, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>{s}</button>)}
      </div>
      {/* Input */}
      <div style={{ padding: 12, borderTop: `1px solid ${theme.border}`, display: "flex", gap: 8, background: theme.surface }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask anything about your team…" style={{ flex: 1, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, outline: "none", fontFamily: "inherit" }} />
        <Button onClick={() => send()}>Send</Button>
      </div>
    </Card>
    <div style={{ fontSize: 11, color: theme.dim, marginTop: 10, textAlign: "center" }}>This assistant answers from your live portal data. It does not use external AI services — your data stays private.</div>
  </div>;
}

// ════════════════════════════════════════════════════════════════════════════
// TEAM CALENDAR (employee availability)
// ════════════════════════════════════════════════════════════════════════════
export function TeamCalendar({ users, leaves, attendance, isMobile }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date(); base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const monthName = base.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayStr();

  const staff = users.filter(u => ["member", "lead"].includes(u.role) && u.active !== false);
  const getU = id => users.find(u => u.id === id);

  // For a given date, who is on leave
  const leavesOn = (dateStr) => leaves.filter(l => l.status === "approved" && l.from_date <= dateStr && l.to_date >= dateStr);

  const [selectedDay, setSelectedDay] = useState(null);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dateOf = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return <div className="anm-fade">
    <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>📆 Team Calendar</h2>
    <div style={{ color: theme.muted, fontSize: 13, marginBottom: 16 }}>Employee availability — leave days are highlighted.</div>

    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Button size="sm" variant="ghost" onClick={() => setMonthOffset(monthOffset - 1)}>← Prev</Button>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{monthName}</div>
        <Button size="sm" variant="ghost" onClick={() => setMonthOffset(monthOffset + 1)}>Next →</Button>
      </div>
      {/* Weekday headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: theme.muted }}>{isMobile ? d[0] : d}</div>)}
      </div>
      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const ds = dateOf(d);
          const onLeave = leavesOn(ds);
          const isToday = ds === today;
          const isWeekend = new Date(ds).getDay() === 0;
          return <button key={i} onClick={() => setSelectedDay(ds)} style={{
            aspectRatio: "1", border: isToday ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
            borderRadius: 8, background: selectedDay === ds ? theme.accentDim : (onLeave.length ? theme.purpleBg : "#fff"),
            cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: 2, position: "relative", fontFamily: "inherit",
          }}>
            <span style={{ fontSize: isMobile ? 12 : 13, fontWeight: isToday ? 800 : 600, color: isWeekend ? theme.dim : theme.text }}>{d}</span>
            {onLeave.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: theme.purple, background: "#fff", borderRadius: 8, padding: "0 5px", border: `1px solid ${theme.purple}44` }}>{onLeave.length}🌴</span>}
          </button>;
        })}
      </div>
    </Card>

    {/* Selected day detail */}
    {selectedDay && (() => {
      const onLeave = leavesOn(selectedDay);
      const present = attendance.filter(a => a.date === selectedDay && a.status === "approved");
      const onLeaveIds = new Set(onLeave.map(l => l.user_id));
      const available = staff.filter(s => !onLeaveIds.has(s.id));
      return <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{new Date(selectedDay).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.purple, marginBottom: 8, textTransform: "uppercase" }}>🌴 On Leave ({onLeave.length})</div>
            {onLeave.length === 0 ? <div style={{ fontSize: 13, color: theme.muted }}>No one on leave.</div>
              : onLeave.map(l => { const u = getU(l.user_id); return <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}><PhotoAvatar user={u} size={28} /><span style={{ fontSize: 13, fontWeight: 600 }}>{u?.name}</span><span style={{ fontSize: 11, color: theme.muted, marginLeft: "auto" }}>{l.type}</span></div>; })}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.green, marginBottom: 8, textTransform: "uppercase" }}>✅ Available ({available.length})</div>
            {available.slice(0, 10).map(u => <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}><PhotoAvatar user={u} size={28} /><span style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</span><span style={{ fontSize: 11, color: theme.muted, marginLeft: "auto" }}>{u.team}</span></div>)}
          </div>
        </div>
      </Card>;
    })()}
    {!selectedDay && <Card><EmptyState icon="📆" title="Tap any day" subtitle="See who's on leave and who's available." /></Card>}
  </div>;
}
