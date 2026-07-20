-- Hapus fitur rekap penjualan marketplace beserta data tersimpan.
-- Jalankan migration ini untuk menghapus tabel rekap lama dari Supabase.

drop table if exists public.sales_recap cascade;
