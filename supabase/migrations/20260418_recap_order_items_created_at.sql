-- Tambahan kolom pendukung analitik rekap:
-- 1) order_items untuk leaderboard produk
-- 2) created_at untuk analisa jam ramai transaksi

alter table if exists public.sales_recap
  add column if not exists order_items jsonb not null default '[]'::jsonb;

alter table if exists public.sales_recap
  add column if not exists created_at timestamptz not null default now();
