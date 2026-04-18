-- Tambah dukungan status transaksi cancel pada tabel rekap penjualan.
alter table if exists public.sales_recap
  add column if not exists status text;

alter table if exists public.sales_recap
  add column if not exists alasan_cancel text;

alter table if exists public.sales_recap
  add column if not exists tanggal_cancel timestamptz;

update public.sales_recap
set status = 'sukses'
where status is null;

alter table if exists public.sales_recap
  alter column status set default 'sukses';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_recap_status_check'
  ) then
    alter table public.sales_recap
      add constraint sales_recap_status_check
      check (status in ('sukses', 'cancel'));
  end if;
end
$$;
