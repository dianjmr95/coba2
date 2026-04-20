-- Arsip dokumen faktur/penawaran + share link publik
-- Created: 2026-04-20

create table if not exists public.sales_documents (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique,
  document_no text not null,
  document_type text not null check (document_type in ('faktur', 'penawaran')),
  invoice_date date not null,
  valid_until date null,
  buyer text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  address text not null default '',
  courier text not null default '',
  sales_pic text not null default '',
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  subtotal bigint not null default 0,
  print_count integer not null default 0,
  last_printed_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_documents_created_at_idx on public.sales_documents (created_at desc);
create index if not exists sales_documents_document_no_idx on public.sales_documents (document_no);

create or replace function public.touch_sales_documents_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sales_documents_updated_at on public.sales_documents;
create trigger trg_sales_documents_updated_at
before update on public.sales_documents
for each row execute function public.touch_sales_documents_updated_at();

alter table if exists public.sales_documents enable row level security;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sales_documents', p.policyname);
  END LOOP;
END $$;

create policy sales_documents_select_auth
on public.sales_documents
for select
to authenticated
using (true);

create policy sales_documents_insert_auth
on public.sales_documents
for insert
to authenticated
with check (true);

create policy sales_documents_update_auth
on public.sales_documents
for update
to authenticated
using (true)
with check (true);

create policy sales_documents_delete_auth
on public.sales_documents
for delete
to authenticated
using (true);
