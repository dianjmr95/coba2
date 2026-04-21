-- Allow new role: staff_offline in user_roles table.
-- Fix for: check constraint "user_roles_role_check"

ALTER TABLE IF EXISTS public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE IF EXISTS public.user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (
    lower(role) IN ('admin', 'staff', 'staff_offline', 'staff offline', 'viewer')
  );
