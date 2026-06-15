// ─────────────────────────────────────────────────────────────────────────────
// Vercel Serverless Function — /api/send-whatsapp
// ANM Leave & Expense Portal — WhatsApp Business API Notifier
//
// Environment variables required (set in Vercel Dashboard → Settings → Env):
//   WHATSAPP_TOKEN        → Your Meta permanent access token
//   WHATSAPP_PHONE_ID     → Your WhatsApp Phone Number ID (from Meta dashboard)
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { type, recipientPhone, recipientName, data } = req.body;

  // Validate required fields
  if (!type || !recipientPhone || !recipientName) {
    return res.status(400).json({ error: "Missing required fields: type, recipientPhone, recipientName" });
  }

  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    return res.status(500).json({ error: "WhatsApp credentials not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in Vercel environment variables." });
  }

  // ── Build template payload based on notification type ──────────────────────
  let templatePayload;

  if (type === "leave_approved") {
    // Template params: {{1}}=name, {{2}}=type, {{3}}=from, {{4}}=to, {{5}}=days, {{6}}=remarks
    templatePayload = {
      name: "leave_approved",
      language: { code: "en" },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: recipientName },
          { type: "text", text: data.leaveType },
          { type: "text", text: data.fromDate },
          { type: "text", text: data.toDate },
          { type: "text", text: String(data.days) },
          { type: "text", text: data.hrComment || "Approved by Management" },
        ]
      }]
    };
  } else if (type === "leave_rejected") {
    templatePayload = {
      name: "leave_rejected",
      language: { code: "en" },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: recipientName },
          { type: "text", text: data.leaveType },
          { type: "text", text: data.fromDate },
          { type: "text", text: data.toDate },
          { type: "text", text: data.hrComment || "Please contact Management for details" },
        ]
      }]
    };
  } else if (type === "reimbursement_approved") {
    // Template params: {{1}}=name, {{2}}=amount, {{3}}=category, {{4}}=remarks
    templatePayload = {
      name: "reimbursement_approved",
      language: { code: "en" },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: recipientName },
          { type: "text", text: data.amount.toLocaleString("en-IN") },
          { type: "text", text: data.category },
          { type: "text", text: data.hrComment || "Will be processed for payment shortly" },
        ]
      }]
    };
  } else if (type === "reimbursement_rejected") {
    templatePayload = {
      name: "reimbursement_rejected",
      language: { code: "en" },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: recipientName },
          { type: "text", text: data.amount.toLocaleString("en-IN") },
          { type: "text", text: data.category },
          { type: "text", text: data.hrComment || "Please contact Management for details" },
        ]
      }]
    };
  } else {
    return res.status(400).json({ error: `Unknown notification type: ${type}` });
  }

  // ── Call Meta WhatsApp Cloud API ───────────────────────────────────────────
  const url = `https://graph.facebook.com/v19.0/${phoneId}/messages`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipientPhone,           // Format: 919876543210 (country code, no +)
        type: "template",
        template: templatePayload,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API error:", result);
      return res.status(response.status).json({
        error: "WhatsApp API call failed",
        details: result,
      });
    }

    console.log(`✅ WhatsApp sent [${type}] to ${recipientPhone} — Message ID: ${result.messages?.[0]?.id}`);
    return res.status(200).json({
      success: true,
      messageId: result.messages?.[0]?.id,
      type,
      recipient: recipientPhone,
    });

  } catch (err) {
    console.error("Network error calling WhatsApp API:", err);
    return res.status(500).json({ error: "Network error", message: err.message });
  }
}
