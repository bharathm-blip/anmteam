-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — v9 BASECAMP (person mapping + token store)
-- Run in Supabase SQL Editor. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Per-person Basecamp ID (for @mention notifications)
alter table profiles add column if not exists basecamp_person_id text;

-- 2. Secure token store for auto-refresh (only the service role touches this)
create table if not exists integration_tokens (
  provider      text primary key,        -- 'basecamp'
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz default now()
);

alter table integration_tokens enable row level security;
-- No policies = no anon/auth access. The server (service role) bypasses RLS,
-- so tokens stay secret from the browser. Do NOT add a select policy here.

-- ✅ DONE.
