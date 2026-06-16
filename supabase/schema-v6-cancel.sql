-- ════════════════════════════════════════════════════════════════════════════
-- ANM PORTAL — v6 CANCEL POLICIES
-- Run in Supabase SQL Editor. Lets staff cancel their OWN still-pending
-- leave / reimbursement applications. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- Leaves: owner can delete their own request while still pending
drop policy if exists "cancel own leave" on leaves;
create policy "cancel own leave" on leaves for delete
  using ( user_id = auth.uid() and status in ('pending','pending_lead','pending_hr') );

-- Reimbursements: owner can delete their own claim while still pending
drop policy if exists "cancel own reimb" on reimbursements;
create policy "cancel own reimb" on reimbursements for delete
  using ( user_id = auth.uid() and status in ('pending','pending_lead','pending_hr') );

-- ✅ DONE. Staff can now cancel pending applications.

-- Attendance reset: HR / Management / Admin can delete any attendance row
-- (so an employee who punched wrongly can re-punch).
drop policy if exists "reset attendance" on attendance;
create policy "reset attendance" on attendance for delete
  using ( my_role() in ('hr','admin') or user_id = auth.uid() );
