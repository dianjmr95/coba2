-- Shared preset table for calculator settings
-- Created: 2026-04-18

create table if not exists public.potongan_presets (
  id text primary key,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on updates
create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_potongan_presets_updated_at on public.potongan_presets;
create trigger trg_potongan_presets_updated_at
before update on public.potongan_presets
for each row
execute function public.set_timestamp_updated_at();

alter table public.potongan_presets enable row level security;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'potongan_presets'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.potongan_presets', p.policyname);
  END LOOP;
END $$;

create policy potongan_presets_select_auth
on public.potongan_presets
for select
to authenticated
using (true);

create policy potongan_presets_insert_auth
on public.potongan_presets
for insert
to authenticated
with check (true);

create policy potongan_presets_update_auth
on public.potongan_presets
for update
to authenticated
using (true)
with check (true);

create policy potongan_presets_delete_auth
on public.potongan_presets
for delete
to authenticated
using (true);
