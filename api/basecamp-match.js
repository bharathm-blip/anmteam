// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — /api/basecamp-match
// Pulls the Basecamp People roster and matches each person to a portal profile
// by email address, then saves their Basecamp Person ID into profiles.
// Returns a report: matched, unmatched (portal), and extra (basecamp-only).
//
// Admin-only. Uses Supabase service role + a valid Basecamp access token.
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   BASECAMP_ACCESS_TOKEN, BASECAMP_ACCOUNT_ID
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { getFreshBasecampToken } from "./_basecamp-token.js";

const UA = "ANM Portal (tax@anmoffice.in)";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const accountId = process.env.BASECAMP_ACCOUNT_ID;
  if (!url || !serviceKey) return res.status(500).json({ error: "Supabase not configured." });
  if (!accountId) return res.status(500).json({ error: "BASECAMP_ACCOUNT_ID not set." });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Verify caller is admin or hr
  const { callerToken } = req.body || {};
  if (!callerToken) return res.status(401).json({ error: "Missing session." });
  const { data: caller } = await admin.auth.getUser(callerToken);
  if (!caller?.user) return res.status(401).json({ error: "Invalid session." });
  const { data: prof } = await admin.from("profiles").select("role").eq("id", caller.user.id).single();
  if (!["admin", "hr"].includes(prof?.role)) return res.status(403).json({ error: "Only Admin/Management can run auto-match." });

  // Get a fresh token (auto-refreshes if needed)
  let token;
  try { token = await getFreshBasecampToken(admin); }
  catch (e) { return res.status(400).json({ error: "Could not get Basecamp token: " + e.message }); }

  // Fetch all Basecamp people (paginated)
  let people = [];
  let page = 1;
  try {
    while (true) {
      const r = await fetch(`https://3.basecampapi.com/${accountId}/people.json?page=${page}`, {
        headers: { "Authorization": `Bearer ${token}`, "User-Agent": UA },
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}));
        return res.status(400).json({ error: "Basecamp people fetch failed", detail });
      }
      const batch = await r.json();
      if (!Array.isArray(batch) || batch.length === 0) break;
      people = people.concat(batch);
      if (batch.length < 50) break; // Basecamp pages ~50
      page += 1;
      if (page > 20) break; // safety
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  // Build email → basecamp id map (lowercased)
  const bcByEmail = {};
  for (const p of people) {
    if (p && p.email_address) bcByEmail[p.email_address.toLowerCase().trim()] = { id: String(p.id), name: p.name };
  }

  // Load portal profiles
  const { data: profiles } = await admin.from("profiles").select("id,name,email,basecamp_person_id");

  const matched = [], unmatched = [], updated = [];
  for (const u of profiles || []) {
    const key = (u.email || "").toLowerCase().trim();
    const hit = key && bcByEmail[key];
    if (hit) {
      matched.push({ name: u.name, email: u.email, basecamp_id: hit.id });
      if (u.basecamp_person_id !== hit.id) {
        await admin.from("profiles").update({ basecamp_person_id: hit.id }).eq("id", u.id);
        updated.push(u.name);
      }
    } else {
      unmatched.push({ name: u.name, email: u.email });
    }
  }

  // Basecamp people with no matching portal email
  const portalEmails = new Set((profiles || []).map((u) => (u.email || "").toLowerCase().trim()));
  const extra = people
    .filter((p) => p.email_address && !portalEmails.has(p.email_address.toLowerCase().trim()))
    .map((p) => ({ name: p.name, email: p.email_address }));

  return res.status(200).json({
    success: true,
    basecampPeople: people.length,
    matchedCount: matched.length,
    updatedCount: updated.length,
    updated,
    matched,
    unmatched,
    extra,
    roster: people.map((p) => ({ id: String(p.id), name: p.name, email: p.email_address || "" })),
  });
}
