// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — /api/create-employee
// Creates a new staff auth user WITHOUT disturbing the admin's session.
// Uses the Supabase SERVICE ROLE key (server-side only, never exposed to browser).
//
// Required Vercel env vars:
//   SUPABASE_URL              → your project URL
//   SUPABASE_SERVICE_ROLE_KEY → Settings → API → service_role key (SECRET!)
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password, name, phone, role, team, avatar, callerToken } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: "Missing required fields" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: "Server not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Verify the caller is actually an admin (security check)
  if (callerToken) {
    const { data: caller } = await admin.auth.getUser(callerToken);
    if (caller?.user) {
      const { data: prof } = await admin.from("profiles").select("role").eq("id", caller.user.id).single();
      if (prof?.role !== "admin") return res.status(403).json({ error: "Only admins can add employees." });
    } else {
      return res.status(401).json({ error: "Invalid session." });
    }
  }

  // Create the user with email auto-confirmed
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name, phone, role, team, avatar },
  });
  if (error) return res.status(400).json({ error: error.message });

  // Ensure the profile row is correct
  await admin.from("profiles").update({ name, phone, role, team, avatar, must_reset_pw: true, active: true }).eq("id", data.user.id);

  return res.status(200).json({ success: true, userId: data.user.id });
}
