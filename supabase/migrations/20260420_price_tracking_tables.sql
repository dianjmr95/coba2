-- Price tracking tables
-- Created: 2026-04-20

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  target_url text not null
);

create table if not exists public.price_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric(14,2) not null check (price >= 0),
  store_name text not null,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_price_logs_product_id on public.price_logs(product_id);
create index if not exists idx_price_logs_fetched_at on public.price_logs(fetched_at desc);
