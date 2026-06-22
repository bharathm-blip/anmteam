// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — /api/daily-summary
// Computes a day-wise summary and sends it as an in-app notification to all
// Management (hr) and Admin users.
//
// Triggered two ways:
//   1. Automatically by Vercel Cron (see vercel.json "crons")
//   2. On-demand from the app (Management/Admin clicks "Generate Summary")
//
// Required Vercel env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   CRON_SECRET  (optional — protects the auto endpoint)
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { getFreshBasecampToken } from "./_basecamp-token.js";

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: "Server not configured" });

  // If called by Vercel Cron, verify the secret (Vercel sends it in the header)
  const cronSecret = process.env.CRON_SECRET;
  const isCron = req.headers["authorization"] === `Bearer ${cronSecret}`;

  // For on-demand calls from the app, verify the caller is hr/admin
  const { date: bodyDate, callerToken } = req.body || {};

  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (!isCron) {
    // on-demand: must be hr or admin
    if (!callerToken) return res.status(401).json({ error: "Not authorized" });
    const { data: caller } = await db.auth.getUser(callerToken);
    if (!caller?.user) return res.status(401).json({ error: "Invalid session" });
    const { data: prof } = await db.from("profiles").select("role").eq("id", caller.user.id).single();
    if (!["hr", "admin"].includes(prof?.role)) return res.status(403).json({ error: "Only Management/Admin" });
  }

  // Date to summarize (default: today)
  const date = bodyDate || new Date().toISOString().split("T")[0];

  // ── Gather data ────────────────────────────────────────────────────────────
  const { data: profiles } = await db.from("profiles").select("id,name,role,team,active,basecamp_person_id,phone");
  const staff = (profiles || []).filter((p) => ["member", "lead"].includes(p.role) && p.active !== false);

  // Configurable late cutoff
  const { data: cs } = await db.from("company_settings").select("late_cutoff_time, daily_summary_intro, whatsapp_enabled, whatsapp_types").eq("id", 1).single();
  const lateCutoff = cs?.late_cutoff_time || "10:15";

  const { data: att } = await db.from("attendance").select("user_id,status,login_time").eq("date", date);
  const loggedIds = new Set((att || []).map((a) => a.user_id));
  const presentIds = new Set((att || []).filter((a) => a.status === "approved").map((a) => a.user_id));

  const presentCount = presentIds.size;
  const loggedCount = loggedIds.size;
  const absentList = staff.filter((s) => !loggedIds.has(s.id)).map((s) => s.name);
  const pendingAttCount = loggedCount - presentCount;

  // Late comers (logged in after cutoff)
  const lateList = (att || []).filter((a) => a.login_time && a.login_time > lateCutoff).map((a) => {
    const u = staff.find((s) => s.id === a.user_id);
    return u ? `${u.name} (${a.login_time})` : null;
  }).filter(Boolean);

  // Leaves submitted today
  const { data: leaves } = await db.from("leaves").select("user_id,type").gte("submitted_at", `${date}T00:00:00`).lte("submitted_at", `${date}T23:59:59`);
  const leaveNames = (leaves || []).map((l) => {
    const u = staff.find((s) => s.id === l.user_id);
    return u ? `${u.name} (${l.type})` : null;
  }).filter(Boolean);

  // Reimbursements submitted today
  const { data: reimbs } = await db.from("reimbursements").select("user_id,amount").gte("submitted_at", `${date}T00:00:00`).lte("submitted_at", `${date}T23:59:59`);
  const reimbNames = (reimbs || []).map((r) => {
    const u = staff.find((s) => s.id === r.user_id);
    return u ? `${u.name} (₹${Number(r.amount).toLocaleString("en-IN")})` : null;
  }).filter(Boolean);

  // ── Build the summary message ────────────────────────────────────────────
  const dateLabel = new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const intro = (cs && cs.daily_summary_intro && cs.daily_summary_intro.trim()) ? `${cs.daily_summary_intro.trim()}\n\n` : "";
  let msg = `${intro}📊 Daily Summary — ${dateLabel}\n`;
  msg += `✅ Present: ${presentCount}/${staff.length}`;
  if (pendingAttCount > 0) msg += ` (${pendingAttCount} pending approval)`;
  msg += `\n`;
  msg += absentList.length ? `❌ Absent (${absentList.length}): ${absentList.join(", ")}\n` : `❌ Absent: None 🎉\n`;
  msg += lateList.length ? `⏰ Late comers (${lateList.length}): ${lateList.join(", ")}\n` : `⏰ Late comers: None\n`;
  msg += leaveNames.length ? `📅 Leave requests: ${leaveNames.join(", ")}\n` : `📅 Leave requests: None\n`;
  msg += reimbNames.length ? `🧾 Reimbursements: ${reimbNames.join(", ")}` : `🧾 Reimbursements: None`;

  // ── Send to all hr + admin as in-app notifications ─────────────────────────
  const recipients = (profiles || []).filter((p) => ["hr", "admin"].includes(p.role) && p.active !== false);
  if (recipients.length) {
    const rows = recipients.map((r) => ({ user_id: r.id, type: "summary", message: msg }));
    await db.from("notifications").insert(rows);
  }

  // ── Post the summary into Basecamp, @mentioning management/HR/admin ─────────
  const bcAcct = process.env.BASECAMP_ACCOUNT_ID;
  const bcProj = process.env.BASECAMP_PROJECT_ID, bcBoard = process.env.BASECAMP_MESSAGE_BOARD_ID;
  if (bcAcct && bcProj && bcBoard) {
    try {
      let bcTok;
      try { bcTok = await getFreshBasecampToken(db); } catch { bcTok = process.env.BASECAMP_ACCESS_TOKEN; }
      if (bcTok) {
        const mentionIds = recipients.map((r) => r.basecamp_person_id).filter(Boolean);
        const mentions = mentionIds.map((id) => `<bc-attachment content-type="application/vnd.basecamp.mention" data-person-id="${id}"></bc-attachment>`).join(" ");
        const htmlBody = `<div>${msg.replace(/\n/g, "<br>")}${mentions ? `<br><br>${mentions}` : ""}</div>`;
        await fetch(`https://3.basecampapi.com/${bcAcct}/buckets/${bcProj}/message_boards/${bcBoard}/messages.json`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${bcTok}`, "Content-Type": "application/json", "User-Agent": "ANM Portal (tax@anmoffice.in)" },
          body: JSON.stringify({ subject: `📊 Daily Summary — ${date}`, content: htmlBody, status: "active" }),
        });
      }
    } catch (e) { /* non-fatal: summary still saved in-app */ }
  }

  // ── WhatsApp the summary to management (uses the daily_summary template) ─────
  const waEnabled = cs?.whatsapp_enabled && (cs?.whatsapp_types?.daily_summary !== false);
  const waToken = process.env.WHATSAPP_TOKEN, waPhoneId = process.env.WHATSAPP_PHONE_ID;
  if (waEnabled && waToken && waPhoneId) {
    const waUrl = `https://graph.facebook.com/v19.0/${waPhoneId}/messages`;
    for (const r of recipients) {
      if (!r.phone || String(r.phone).includes("X")) continue;
      try {
        await fetch(waUrl, {
          method: "POST",
          headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", to: r.phone, type: "template",
            template: { name: "daily_summary", language: { code: "en" }, components: [{ type: "body", parameters: [
              { type: "text", text: (r.name || "Team").split(" ")[0] },
              { type: "text", text: dateLabel },
              { type: "text", text: msg.replace(/\n/g, " · ").slice(0, 900) },
            ] }] },
          }),
        });
      } catch (e) { /* non-fatal */ }
    }
  }

  return res.status(200).json({
    success: true,
    date,
    summary: { present: presentCount, total: staff.length, absent: absentList, leaves: leaveNames, reimbursements: reimbNames },
    notified: recipients.length,
    message: msg,
  });
}
