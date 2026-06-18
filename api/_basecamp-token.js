// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: getFreshBasecampToken(adminSupabaseClient)
// Returns a valid Basecamp access token, refreshing it automatically when expired.
//
// Tokens are stored in the `integration_tokens` table (see schema-v9-basecamp.sql):
//   provider='basecamp', access_token, refresh_token, expires_at
//
// On first use, if the table is empty, it falls back to the BASECAMP_ACCESS_TOKEN
// env var (so the integration works even before refresh is wired up).
//
// Env vars used for refresh:
//   BASECAMP_CLIENT_ID, BASECAMP_CLIENT_SECRET
// ─────────────────────────────────────────────────────────────────────────────

export async function getFreshBasecampToken(admin) {
  // Try the stored token first
  const { data: row } = await admin
    .from("integration_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", "basecamp")
    .maybeSingle();

  // No stored row → use env token (legacy / first run)
  if (!row || !row.access_token) {
    const envTok = process.env.BASECAMP_ACCESS_TOKEN;
    if (envTok) return envTok;
    throw new Error("No Basecamp token stored and BASECAMP_ACCESS_TOKEN not set.");
  }

  // Still valid (with 5-min safety margin)? Use it.
  const now = Date.now();
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (exp && exp - now > 5 * 60 * 1000) {
    return row.access_token;
  }

  // Expired or near expiry → refresh
  if (!row.refresh_token) {
    // Can't refresh; return what we have and hope it still works
    return row.access_token;
  }
  const clientId = process.env.BASECAMP_CLIENT_ID;
  const clientSecret = process.env.BASECAMP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    // No refresh creds; return existing token
    return row.access_token;
  }

  const refreshUrl = `https://launchpad.37signals.com/authorization/token?type=refresh&refresh_token=${encodeURIComponent(row.refresh_token)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const r = await fetch(refreshUrl, { method: "POST", headers: { "User-Agent": "ANM Portal (tax@anmoffice.in)" } });
  if (!r.ok) {
    // Refresh failed; return existing token as last resort
    return row.access_token;
  }
  const data = await r.json();
  const newAccess = data.access_token;
  const expiresInSec = data.expires_in || 1209600; // Basecamp default ~2 weeks
  const newExpiry = new Date(Date.now() + expiresInSec * 1000).toISOString();

  // Save the refreshed token (refresh_token usually stays the same)
  await admin.from("integration_tokens").update({
    access_token: newAccess,
    expires_at: newExpiry,
    updated_at: new Date().toISOString(),
  }).eq("provider", "basecamp");

  return newAccess;
}
