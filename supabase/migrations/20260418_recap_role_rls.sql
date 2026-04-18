-- Sales recap + role table RLS baseline (safe for authenticated app users)
-- Created: 2026-04-18

alter table if exists public.sales_recap enable row level security;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_recap'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sales_recap', p.policyname);
  END LOOP;
END $$;

CREATE POLICY sales_recap_select_auth
ON public.sales_recap
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY sales_recap_insert_auth
ON public.sales_recap
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY sales_recap_update_auth
ON public.sales_recap
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY sales_recap_delete_auth
ON public.sales_recap
FOR DELETE
TO authenticated
USING (true);

alter table if exists public.user_roles enable row level security;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', p.policyname);
  END LOOP;
END $$;

CREATE POLICY user_roles_select_auth
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

-- Restrict role writes to fixed main admin email
CREATE POLICY user_roles_write_admin_only
ON public.user_roles
FOR ALL
TO authenticated
USING ((auth.jwt() ->> 'email') = 'luluklisdiantoro535@gmail.com')
WITH CHECK ((auth.jwt() ->> 'email') = 'luluklisdiantoro535@gmail.com');
