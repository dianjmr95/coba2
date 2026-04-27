-- Add discount field for faktur/penawaran documents.
-- Created: 2026-04-27

ALTER TABLE IF EXISTS public.sales_documents
  ADD COLUMN IF NOT EXISTS discount_amount bigint NOT NULL DEFAULT 0;

UPDATE public.sales_documents
SET discount_amount = 0
WHERE discount_amount IS NULL;
