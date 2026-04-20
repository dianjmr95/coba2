-- Restrict sales_documents delete access to fixed admin email only
-- Created: 2026-04-20

alter table if exists public.sales_documents enable row level security;

drop policy if exists sales_documents_delete_auth on public.sales_documents;
drop policy if exists sales_documents_delete_admin_only on public.sales_documents;

create policy sales_documents_delete_admin_only
on public.sales_documents
for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'luluklisdiantoro535@gmail.com');
