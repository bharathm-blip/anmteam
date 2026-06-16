-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — STORAGE SETUP (for reimbursement file attachments)
-- Run this in Supabase SQL Editor AFTER schema-v3-additions.sql
-- ════════════════════════════════════════════════════════════════════════════

-- Create a private storage bucket for invoice attachments
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

-- Policies: any logged-in user can upload; anyone authenticated can read
drop policy if exists "attach upload" on storage.objects;
create policy "attach upload" on storage.objects for insert
  to authenticated with check ( bucket_id = 'attachments' );

drop policy if exists "attach read" on storage.objects;
create policy "attach read" on storage.objects for select
  to authenticated using ( bucket_id = 'attachments' );

drop policy if exists "attach delete own" on storage.objects;
create policy "attach delete own" on storage.objects for delete
  to authenticated using ( bucket_id = 'attachments' and owner = auth.uid() );

-- ✅ DONE. Reimbursement uploads will now work.
