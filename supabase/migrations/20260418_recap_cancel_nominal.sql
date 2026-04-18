-- Tambah nominal biaya cancel pada tabel rekap penjualan.
alter table if exists public.sales_recap
  add column if not exists nominal_cancel numeric(14,2) not null default 0;

update public.sales_recap
set nominal_cancel = 0
where nominal_cancel is null or nominal_cancel < 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sales_recap_nominal_cancel_non_negative_check'
      and conrelid = 'public.sales_recap'::regclass
  ) then
    alter table public.sales_recap
      add constraint sales_recap_nominal_cancel_non_negative_check
      check (nominal_cancel >= 0);
  end if;
end
$$;
