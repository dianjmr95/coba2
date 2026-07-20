-- Fitur Kontrol Stok & Restock
-- Tabel dipisah dengan prefix restock_ supaya tidak bentrok dengan tabel products lama.

create extension if not exists pgcrypto;

create table if not exists public.restock_warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.restock_products (
  id uuid primary key default gen_random_uuid(),
  sku text null,
  name text not null,
  harga_modal numeric(14,2) not null default 0,
  harga_jual numeric(14,2) not null default 0,
  sku_normalized text not null default '',
  name_normalized text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists restock_products_sku_normalized_uq
  on public.restock_products (sku_normalized)
  where sku_normalized <> '';

create unique index if not exists restock_products_name_normalized_uq
  on public.restock_products (name_normalized);

create table if not exists public.restock_warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.restock_warehouses(id) on delete cascade,
  product_id uuid not null references public.restock_products(id) on delete cascade,
  qty integer not null default 0 check (qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, product_id)
);

create index if not exists restock_warehouse_stock_warehouse_idx
  on public.restock_warehouse_stock (warehouse_id);

create index if not exists restock_warehouse_stock_product_idx
  on public.restock_warehouse_stock (product_id);

create table if not exists public.restock_sales_records (
  id uuid primary key default gen_random_uuid(),
  period_label text not null,
  product_id uuid null references public.restock_products(id) on delete set null,
  product_name text not null,
  normalized_name text not null default '',
  qty_terjual integer not null default 0 check (qty_terjual >= 0),
  omzet numeric(14,2) not null default 0 check (omzet >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists restock_sales_records_period_name_uq
  on public.restock_sales_records (period_label, normalized_name);

create index if not exists restock_sales_records_period_idx
  on public.restock_sales_records (period_label);

create or replace function public.touch_restock_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_restock_products_updated_at on public.restock_products;
create trigger trg_restock_products_updated_at
before update on public.restock_products
for each row execute function public.touch_restock_updated_at();

drop trigger if exists trg_restock_warehouse_stock_updated_at on public.restock_warehouse_stock;
create trigger trg_restock_warehouse_stock_updated_at
before update on public.restock_warehouse_stock
for each row execute function public.touch_restock_updated_at();

drop trigger if exists trg_restock_sales_records_updated_at on public.restock_sales_records;
create trigger trg_restock_sales_records_updated_at
before update on public.restock_sales_records
for each row execute function public.touch_restock_updated_at();

alter table if exists public.restock_warehouses enable row level security;
alter table if exists public.restock_products enable row level security;
alter table if exists public.restock_warehouse_stock enable row level security;
alter table if exists public.restock_sales_records enable row level security;
