-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — v12 (announcements + custom daily-summary intro)
-- Run in Supabase SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- Custom intro line shown at the top of the daily summary (editable by admin)
alter table company_settings add column if not exists daily_summary_intro text default '';

-- 'announcement' is just a free-text notification type; no schema change needed
-- (notifications.type is already free text).

-- ✅ DONE.
