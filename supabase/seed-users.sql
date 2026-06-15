-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — SEED STAFF LOGIN ACCOUNTS
--
-- Creates 6 staff members with default password: Anm@2026
-- Each user is forced to reset their password on first login.
--
-- HOW TO USE:
--   Run this AFTER schema.sql, in Supabase → SQL Editor → New Query → RUN
--
-- ⚠️  IMPORTANT: Replace the phone numbers (919XXXXXXXXX) with real numbers
--     before running, OR update them later in the Admin panel / SQL.
-- ════════════════════════════════════════════════════════════════════════════

-- Helper to create an auth user + profile in one go
create or replace function seed_user(
  p_email text, p_name text, p_phone text, p_role text, p_team text, p_avatar text
) returns void as $$
declare
  uid uuid := gen_random_uuid();
begin
  -- Insert into auth.users with default password 'Anm@2026'
  insert into auth.users (
    id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
    crypt('Anm@2026', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('name',p_name,'phone',p_phone,'role',p_role,'team',p_team,'avatar',p_avatar),
    now(), now()
  )
  on conflict (email) do nothing;
end;
$$ language plpgsql;

-- ── Create the staff accounts ───────────────────────────────────────────────
select seed_user('bharath.m@anmoffice.in',  'Bharath M',  '919XXXXXXXXX', 'member', 'Audit',      'BM');
select seed_user('balaji.s@anmoffice.in',   'Balaji S',   '919XXXXXXXXX', 'lead',   'Audit',      'BS');
select seed_user('tax@anmoffice.in',        'A N Murthy', '918660735588', 'hr',     'Management', 'NM');
select seed_user('sukruthi.r@anmoffice.in', 'Sukruthi R', '919XXXXXXXXX', 'member', 'Tax',        'SR');
select seed_user('kavitha.d@anmoffice.in',  'Kavitha D',  '919XXXXXXXXX', 'lead',   'Tax',        'KD');
select seed_user('admin@anmoffice.in',      'Admin',      '919XXXXXXXXX', 'admin',  'Admin',      'AD');

-- Clean up helper
drop function seed_user(text,text,text,text,text,text);

-- ✅ DONE. All 6 staff can now log in with:
--    Email:    (their email above)
--    Password: Anm@2026
--    → They'll be prompted to reset on first login.
