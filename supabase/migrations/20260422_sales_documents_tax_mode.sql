-- Add tax mode so documents can choose:
-- - exclude: subtotal + tax (PPN ditambahkan)
-- - include: subtotal already includes tax
-- Created: 2026-04-22

ALTER TABLE IF EXISTS public.sales_documents
  ADD COLUMN IF NOT EXISTS tax_mode text NOT NULL DEFAULT 'exclude';
