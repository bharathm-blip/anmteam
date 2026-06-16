import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

const today = () => new Date().toISOString().split("T")[0];
const nowTime = () => { const d=new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };

function useRealtimeTable(table, orderCol = "created_at") {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase.from(table).select("*").order(orderCol, { ascending: false });
    if (!error) setRows(data || []);
    setLoading(false);
  }, [table, orderCol]);
  useEffect(() => {
    fetchRows();
    const ch = supabase.channel(`realtime:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => fetchRows())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [table, fetchRows]);
  return { rows, loading, refetch: fetchRows };
}

// ── Profiles / Employee management ───────────────────────────────────────────
export function useProfiles() {
  const { rows, refetch } = useRealtimeTable("profiles", "created_at");
  const updateRole  = async (id, role)  => { await supabase.from("profiles").update({ role }).eq("id", id); refetch(); };
  const updatePhone = async (id, phone) => { await supabase.from("profiles").update({ phone }).eq("id", id); refetch(); };
  const updateProfile = async (id, patch) => { const { error } = await supabase.from("profiles").update(patch).eq("id", id); refetch(); return { error }; };
  const setActive   = async (id, active) => { await supabase.from("profiles").update({ active }).eq("id", id); refetch(); };
  const setLead     = async (id, leadId) => { await supabase.from("profiles").update({ assigned_lead_id: leadId || null }).eq("id", id); refetch(); };
  return { users: rows, updateRole, updatePhone, updateProfile, setActive, setLead, refetch };
}

// ── Attendance (login + logout) ──────────────────────────────────────────────
export function useAttendance() {
  const { rows, refetch } = useRealtimeTable("attendance", "date");
  // Login: create todays row. submitterRole decides start status:
  //   staff (member) → pending_lead (lead recommends, then HR approves)
  //   lead → pending_hr (management approves directly)
  const login = async (userId, note, submitterRole) => {
    const startStatus = submitterRole === "member" ? "pending_lead" : "pending_hr";
    const { error } = await supabase.from("attendance").insert({ user_id: userId, date: today(), login_time: nowTime(), note, status: startStatus });
    return { error };
  };
  // Logout: set logout_time = now on todays row
  const logout = async (rowId) => {
    const { error } = await supabase.from("attendance").update({ logout_time: nowTime() }).eq("id", rowId);
    return { error };
  };
  // Two-step: lead recommends (pending_lead→pending_hr); HR approves (pending_hr→approved)
  const review = async (row, action, remark) => {
    let patch = {};
    if (action === "lead_approve") patch = { status: "pending_hr", lead_comment: remark, lead_at: new Date().toISOString() };
    if (action === "lead_reject")  patch = { status: "rejected",    lead_comment: remark, lead_at: new Date().toISOString() };
    if (action === "hr_approve")   patch = { status: "approved",    approver_remark: remark, approved_at: new Date().toISOString() };
    if (action === "hr_reject")    patch = { status: "rejected",    approver_remark: remark, approved_at: new Date().toISOString() };
    const { error } = await supabase.from("attendance").update(patch).eq("id", row.id);
    let msg = null;
    if (action === "lead_reject") msg = "Your attendance was not recommended by your senior.";
    if (action === "hr_approve")  msg = "Your attendance was approved.";
    if (action === "hr_reject")   msg = "Your attendance was rejected by Management.";
    if (msg) await supabase.from("notifications").insert({ user_id: row.user_id, type: "attendance", message: msg, ref_id: row.id });
    return { error, finalDecision: action.startsWith("hr_") };
  };
  return { attendance: rows, login, logout, review, refetch };
}

// ── Leaves (two-step routed, same as attendance) ─────────────────────────────
export function useLeaves() {
  const { rows, refetch } = useRealtimeTable("leaves", "submitted_at");
  // staff → pending_lead (lead recommends → HR approves); lead → pending_hr (HR approves directly)
  const submit = async (userId, leadId, hrId, data, submitterRole) => {
    const startStatus = submitterRole === "member" ? "pending_lead" : "pending_hr";
    const { error } = await supabase.from("leaves").insert({ user_id: userId, lead_id: leadId, hr_id: hrId, type: data.type, from_date: data.from, to_date: data.to, days: data.days, reason: data.reason, status: startStatus });
    return { error };
  };
  const review = async (row, action, comment) => {
    let patch = {};
    if (action === "lead_approve") patch = { status: "pending_hr", lead_comment: comment, lead_at: new Date().toISOString() };
    if (action === "lead_reject")  patch = { status: "rejected",    lead_comment: comment, lead_at: new Date().toISOString() };
    if (action === "hr_approve")   patch = { status: "approved",    hr_comment: comment,   hr_at: new Date().toISOString() };
    if (action === "hr_reject")    patch = { status: "rejected",    hr_comment: comment,   hr_at: new Date().toISOString() };
    const { error } = await supabase.from("leaves").update(patch).eq("id", row.id);
    let msg = null;
    if (action === "lead_reject") msg = "Your leave was not recommended by your senior.";
    if (action === "hr_approve")  msg = "Your leave has been approved by Management!";
    if (action === "hr_reject")   msg = "Your leave was rejected by Management.";
    if (msg) await supabase.from("notifications").insert({ user_id: row.user_id, type: "leave", message: msg, ref_id: row.id });
    return { error, finalDecision: action.startsWith("hr_") };
  };
  return { leaves: rows, submit, review, refetch };
}

// ── Reimbursements (assigner-based flow) ─────────────────────────────────────
export function useReimbursements() {
  const { rows, refetch } = useRealtimeTable("reimbursements", "submitted_at");
  // assignerRole: if 'lead' → pending_lead (lead recommends, then HR approves).
  //               if 'hr'/'admin' → pending_hr (they approve directly, 1 step).
  const submit = async (userId, data) => {
    const startStatus = (data.assignerRole === "lead") ? "pending_lead" : "pending_hr";
    const { error } = await supabase.from("reimbursements").insert({
      user_id: userId, assigner_id: data.assignerId, lead_id: data.assignerRole === "lead" ? data.assignerId : null,
      hr_id: null, category: data.category, amount: data.amount, description: data.description,
      invoice_note: data.invoiceNote, attachments: data.attachments || [], status: startStatus,
    });
    return { error };
  };
  const review = async (row, action, comment) => {
    let patch = {};
    if (action === "lead_approve") patch = { status: "pending_hr", lead_comment: comment, lead_at: new Date().toISOString() };
    if (action === "lead_reject")  patch = { status: "rejected",    lead_comment: comment, lead_at: new Date().toISOString() };
    if (action === "hr_approve")   patch = { status: "approved",    hr_comment: comment,   hr_at: new Date().toISOString() };
    if (action === "hr_reject")    patch = { status: "rejected",    hr_comment: comment,   hr_at: new Date().toISOString() };
    const { error } = await supabase.from("reimbursements").update(patch).eq("id", row.id);
    let msg = null;
    if (action === "lead_reject") msg = "Your expense claim was not recommended.";
    if (action === "hr_approve")  msg = `Your reimbursement of ₹${Number(row.amount).toLocaleString("en-IN")} is approved!`;
    if (action === "hr_reject")   msg = "Your expense claim was rejected by Management.";
    if (msg) await supabase.from("notifications").insert({ user_id: row.user_id, type: "reimbursement", message: msg, ref_id: row.id });
    return { error, finalDecision: action.startsWith("hr_") };
  };
  return { reimbursements: rows, submit, review, refetch };
}

// ── File upload to Supabase Storage ──────────────────────────────────────────
export async function uploadAttachment(userId, file) {
  const ext = file.name.split(".").pop();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await supabase.storage.from("attachments").upload(path, file, { upsert: false });
  if (error) return { error };
  const { data } = supabase.storage.from("attachments").getPublicUrl(path);
  return { url: data.publicUrl, name: file.name, size: file.size };
}

// ── Profile photo upload ─────────────────────────────────────────────────────
export async function uploadAvatar(userId, file) {
  const ext = file.name.split(".").pop();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
  if (error) return { error };
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // save to profile
  await supabase.from("profiles").update({ photo_url: data.publicUrl }).eq("id", userId);
  return { url: data.publicUrl };
}

// ── Self profile update ──────────────────────────────────────────────────────
export async function updateMyProfile(userId, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  return { error };
}

// ── Designations (managed list) ──────────────────────────────────────────────
export function useDesignations() {
  const { rows, refetch } = useRealtimeTable("designations", "created_at");
  const add    = async (name) => { const { error } = await supabase.from("designations").insert({ name }); refetch(); return { error }; };
  const update = async (id, name) => { await supabase.from("designations").update({ name }).eq("id", id); refetch(); };
  const remove = async (id) => { await supabase.from("designations").update({ active: false }).eq("id", id); refetch(); };
  return { designations: rows.filter(d=>d.active), allDesignations: rows, addDesignation: add, updateDesignation: update, removeDesignation: remove, refetch };
}

// ── Leave types & quotas ─────────────────────────────────────────────────────
export function useLeaveTypes() {
  const { rows, refetch } = useRealtimeTable("leave_types", "created_at");
  const add    = async (name, qty) => { const { error } = await supabase.from("leave_types").insert({ name, default_qty: qty }); refetch(); return { error }; };
  const update = async (id, patch) => { await supabase.from("leave_types").update(patch).eq("id", id); refetch(); };
  const remove = async (id) => { await supabase.from("leave_types").update({ active: false }).eq("id", id); refetch(); };
  return { leaveTypes: rows.filter(t=>t.active), allLeaveTypes: rows, addType: add, updateType: update, removeType: remove, refetch };
}

export function useLeaveQuotas() {
  const { rows, refetch } = useRealtimeTable("leave_quotas", "id");
  const setQuota = async (userId, leaveTypeId, qty) => {
    const { error } = await supabase.from("leave_quotas").upsert({ user_id: userId, leave_type_id: leaveTypeId, qty }, { onConflict: "user_id,leave_type_id" });
    refetch(); return { error };
  };
  return { quotas: rows, setQuota, refetch };
}

// ── Company settings ─────────────────────────────────────────────────────────
export function useCompanySettings() {
  const [settings, setSettings] = useState(null);
  const fetch = useCallback(async () => {
    const { data } = await supabase.from("company_settings").select("*").eq("id", 1).single();
    if (data) setSettings(data);
  }, []);
  useEffect(() => {
    fetch();
    const ch = supabase.channel("realtime:company_settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "company_settings" }, () => fetch())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetch]);
  const update = async (patch) => { const { error } = await supabase.from("company_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1); fetch(); return { error }; };
  return { settings, updateSettings: update };
}

// ── Notifications ────────────────────────────────────────────────────────────
export function useNotifications(userId) {
  const [rows, setRows] = useState([]);
  const fetchRows = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    setRows(data || []);
  }, [userId]);
  useEffect(() => {
    fetchRows();
    if (!userId) return;
    const ch = supabase.channel(`notif:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => fetchRows())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [userId, fetchRows]);
  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    fetchRows();
  };
  return { notifications: rows, markAllRead };
}

// ── Admin: create new employee ───────────────────────────────────────────────
// Calls server-side API (keeps admin logged in; uses service role securely)
export async function createEmployee({ email, password, name, phone, role, team, avatar, designation, assigned_lead_id }) {
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch("/api/create-employee", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, phone, role, team, avatar, designation, assigned_lead_id, callerToken: session?.access_token }),
    });
    const result = await res.json();
    if (!res.ok) return { error: { message: result.error || "Failed to create employee" } };
    return { user: { id: result.userId } };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

// ── Daily summary (on-demand trigger) ────────────────────────────────────────
export async function generateDailySummary(date) {
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const res = await fetch("/api/daily-summary", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, callerToken: session?.access_token }),
    });
    const result = await res.json();
    if (!res.ok) return { error: { message: result.error || "Failed to generate summary" } };
    return { result };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────
export async function sendWhatsApp(type, user, data) {
  if (!user?.phone || user.phone.includes("X")) return { skipped: true };
  try {
    const res = await fetch("/api/send-whatsapp", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, recipientPhone: user.phone, recipientName: user.name.split(" ")[0], data }),
    });
    return await res.json();
  } catch (err) { return { error: err.message }; }
}
