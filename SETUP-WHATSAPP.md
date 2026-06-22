# Connecting ANM Portal to WhatsApp (Business API)

WhatsApp notifications are **automatic** and reach staff even when they don't
open the app or Basecamp. This needs Meta's WhatsApp Business API: it is **paid
per message** and every message format must be a **pre-approved template**.

Notifications wired in the portal (no per-punch attendance):
- Leave/Expense **applied** → the approver
- Leave/Expense **recommended** → management
- Leave/Expense **approved / rejected** → the staff member
- **Daily summary** → management

The portal skips WhatsApp gracefully if it isn't configured, so nothing breaks
while you set this up.

═══════════════════════════════════════════════════════════════════════════════
PART 1 — Meta setup (one-time)
═══════════════════════════════════════════════════════════════════════════════
1. Go to **developers.facebook.com** → create/observe your App (type: Business).
2. Add the **WhatsApp** product to the app.
3. You'll get a **test number** to try things; for real use you must add and
   verify your own **business phone number** (it must NOT be active in the normal
   WhatsApp app). Meta may require **business verification** (documents) — start
   this early, it can take a few days.
4. Note these two values:
   - **Phone Number ID**  → WhatsApp → API Setup (a long number)
   - **Permanent Access Token** → create a System User token in Business Settings
     with `whatsapp_business_messaging` permission (the temporary 24-hr token
     works for testing but expires; use a permanent one for production).

═══════════════════════════════════════════════════════════════════════════════
PART 2 — Create the message templates (submit each for approval)
═══════════════════════════════════════════════════════════════════════════════
In Meta → WhatsApp Manager → **Message Templates** → Create template.
Category: **Utility**. Language: **English (en)**.
Create each one with EXACTLY these names and body variables in this order.
(The {{1}}, {{2}}… are filled by the portal in the order shown.)

⚠️ The template NAME must match exactly (lowercase, underscores).

────────────────────────────────────────────────────────────────────────────
1) Name: leave_approved
Body:
   Hi {{1}}, your {{2}} leave from {{3}} to {{4}} ({{5}} day(s)) has been APPROVED. Note: {{6}}. — ANM & Co.
Variables: 1 name, 2 type, 3 from, 4 to, 5 days, 6 remark

2) Name: leave_rejected
Body:
   Hi {{1}}, your {{2}} leave from {{3}} to {{4}} was NOT approved. Note: {{5}}. — ANM & Co.
Variables: 1 name, 2 type, 3 from, 4 to, 5 remark

3) Name: reimbursement_approved
Body:
   Hi {{1}}, your expense claim of Rs {{2}} ({{3}}) has been APPROVED. {{4}}. — ANM & Co.
Variables: 1 name, 2 amount, 3 category, 4 remark

4) Name: reimbursement_rejected
Body:
   Hi {{1}}, your expense claim of Rs {{2}} ({{3}}) was NOT approved. {{4}}. — ANM & Co.
Variables: 1 name, 2 amount, 3 category, 4 remark

5) Name: leave_applied
Body:
   Hi {{1}}, {{2}} has applied for {{3}} leave from {{4}} to {{5}} ({{6}} day(s)) and needs your action in the ANM Portal.
Variables: 1 approver, 2 applicant, 3 type, 4 from, 5 to, 6 days

6) Name: reimbursement_applied
Body:
   Hi {{1}}, {{2}} submitted an expense claim of Rs {{3}} ({{4}}) for your action in the ANM Portal.
Variables: 1 approver, 2 applicant, 3 amount, 4 category

7) Name: leave_recommended
Body:
   Hi {{1}}, {{2}}'s {{3}} leave from {{4}} to {{5}} has been recommended and awaits your approval in the ANM Portal.
Variables: 1 manager, 2 applicant, 3 type, 4 from, 5 to

8) Name: reimbursement_recommended
Body:
   Hi {{1}}, {{2}}'s expense claim of Rs {{3}} ({{4}}) has been recommended and awaits your approval in the ANM Portal.
Variables: 1 manager, 2 applicant, 3 amount, 4 category

9) Name: daily_summary
Body:
   Hi {{1}}, ANM daily summary for {{2}}: {{3}}
Variables: 1 manager, 2 date, 3 summary text

TIP: Meta rejects templates that look promotional or have placeholder-only
content. Keep them factual/utility, as above. Approval takes minutes to a day.

═══════════════════════════════════════════════════════════════════════════════
PART 3 — Add to Vercel + numbers
═══════════════════════════════════════════════════════════════════════════════
1. Vercel → Settings → Environment Variables:
   - `WHATSAPP_TOKEN`     = your permanent access token
   - `WHATSAPP_PHONE_ID`  = your Phone Number ID
   Redeploy.
2. Each person's phone must be saved in **Admin → Employees → person → Details**,
   with country code and NO plus sign or spaces, e.g. **919845012345**.
   (Anyone without a valid number is simply skipped — no error.)

═══════════════════════════════════════════════════════════════════════════════
PART 4 — Test & go live
═══════════════════════════════════════════════════════════════════════════════
- While your app is in **test mode**, WhatsApp only delivers to numbers you add
  to the allowed test-recipient list in Meta. Add your own number, then apply a
  leave and approve it to see the message.
- To message anyone, your app must be moved to **Live** and the number approved.

NOTES / COSTS
- WhatsApp charges per conversation/message; utility templates to India have a
  per-message fee. Budget for daily summaries × managers + approval messages.
- The portal's in-app and Basecamp notifications keep working regardless.
- If a template name/variable count doesn't match, Meta returns an error and the
  portal logs it (Vercel → Functions logs for /api/send-whatsapp) — fix the
  template to match the variable list above.

═══════════════════════════════════════════════════════════════════════════════
PART 5 — Turn it on + control cost (in the portal)
═══════════════════════════════════════════════════════════════════════════════
After templates are approved and Vercel env vars are set:
1. Run `supabase/schema-v14-whatsapp-toggles.sql` once in Supabase.
2. In the portal: **Admin → 📢 Announcements → 💬 WhatsApp Notifications**.
   - Master switch: turn WhatsApp ON/OFF for the whole portal.
   - Then tick exactly which notifications go via WhatsApp:
     • New applications → approver
     • Recommended → management
     • Approved/Rejected → staff
     • Daily summary → management
   - Save. Untick the higher-volume ones to cut cost; keep the ones staff value.
3. Phone numbers: **Admin → Employees → person → Details → Mobile Number**
   (country code, digits only, e.g. 919845012345). Anyone without a number is skipped.

WhatsApp stays OFF until you flip the master switch — so you can deploy now and
enable it only once your Meta templates are approved.
