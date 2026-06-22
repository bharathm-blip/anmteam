-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — v14 WhatsApp per-type toggles
-- Run in Supabase SQL Editor. Safe to re-run.
-- Stores which WhatsApp notification types are enabled (cost control).
-- ════════════════════════════════════════════════════════════════════════════

alter table company_settings add column if not exists whatsapp_enabled boolean default false;
alter table company_settings add column if not exists whatsapp_types jsonb default '{
  "applied": true,
  "recommended": true,
  "approved_rejected": true,
  "daily_summary": true
}'::jsonb;

-- ✅ DONE.
