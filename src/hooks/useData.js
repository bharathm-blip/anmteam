import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

const today = () => new Date().toISOString().split("T")[0];

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
    const ch = supabase
      .channel(`realtime:${table}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => fetchRows())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [table, fetchRows]);

  return { rows, loading, refetch: fetchRows };
}

export function useProfiles() {
  const { rows, refetch } = useRealtimeTable("profiles", "created_at");
  const updateRole = async (id, role) => { await supabase.from("profiles").update({ role }).eq("id", id); refetch(); };
  const updatePhone = async (id, phone) => { await supabase.from("profiles").update({ phone }).eq("id", id); refetch(); };
  return { users: rows, updateRole, updatePhone, refetch };
}

export function useAttendance() {
  const { rows, refetch } = useRealtimeTable("attendance", "date");
  const logToday = async (userId, loginTime, note) => {
    const { error } = await supabase.from("attendance").insert({ user_id: userId, date: today(), login_time: loginTime, note, status: "pending" });
    return { error };
  };
  const review = async (id, userId, action, remark) => {
    const approved = action === "approve";
    const { error } = await supabase.from("attendance").update({ status: approved ? "approved" : "rejected", approver_remark: remark, approved_at: new Date().toISOString() }).eq("id", id);
    await supabase.from("notifications").insert({ user_id: userId, type: "attendance", message: approved ? "Your attendance was approved." : "Your attendance was rejected." });
    return { error };
  };
  return { attendance: rows, logToday, review, refetch };
}

export function useLeaves() {
  const { rows, refetch } = useRealtimeTable("leaves", "submitted_at");
  const submit = async (userId, leadId, hrId, data) => {
    const { error } = await supabase.from("leaves").insert({ user_id: userId, lead_id: leadId, hr_id: hrId, type: data.type, from_date: data.from, to_date: data.to, days: data.days, reason: data.reason, status: "pending_lead" });
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

export function useReimbursements() {
  const { rows, refetch } = useRealtimeTable("reimbursements", "submitted_at");
  const submit = async (userId, leadId, hrId, data) => {
    const { error } = await supabase.from("reimbursements").insert({ user_id: userId, lead_id: leadId, hr_id: hrId, category: data.category, amount: data.amount, description: data.description, invoice_note: data.invoiceNote, status: "pending_lead" });
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
    if (action === "hr_approve")  msg = `Your reimbursement of ₹${row.amount.toLocaleString("en-IN")} is approved!`;
    if (action === "hr_reject")   msg = "Your expense claim was rejected by Management.";
    if (msg) await supabase.from("notifications").insert({ user_id: row.user_id, type: "reimbursement", message: msg, ref_id: row.id });
    return { error, finalDecision: action.startsWith("hr_") };
  };
  return { reimbursements: rows, submit, review, refetch };
}

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
