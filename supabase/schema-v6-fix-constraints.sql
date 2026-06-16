-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — v6 CONSTRAINT FIX
-- Run this in Supabase SQL Editor.
-- Fixes: "new row violates check constraint attendance_status_check" error.
--
-- WHY: the original schema only allowed status = pending/approved/rejected.
-- v6 introduced the two-step flow (pending_lead → pending_hr) for attendance
-- and leaves, so the old CHECK constraints reject the new values.
-- Safe to run once. Keeps the old 'pending' value so existing rows are fine.
-- ════════════════════════════════════════════════════════════════════════════

-- Attendance
alter table attendance drop constraint if exists attendance_status_check;
alter table attendance add constraint attendance_status_check
  check (status in ('pending','pending_lead','pending_hr','approved','rejected'));

-- Leaves
alter table leaves drop constraint if exists leaves_status_check;
alter table leaves add constraint leaves_status_check
  check (status in ('pending','pending_lead','pending_hr','approved','rejected'));

-- Reimbursements
alter table reimbursements drop constraint if exists reimbursements_status_check;
alter table reimbursements add constraint reimbursements_status_check
  check (status in ('pending','pending_lead','pending_hr','approved','rejected'));

-- ✅ DONE. Attendance / leave / reimbursement submissions will now work.
