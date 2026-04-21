-- Add optional tax fields for faktur/penawaran documents.
-- Created: 2026-04-21

ALTER TABLE IF EXISTS public.sales_documents
  ADD COLUMN IF NOT EXISTS tax_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS tax_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total bigint NOT NULL DEFAULT 0;

-- Backfill existing rows: grand_total follows subtotal when tax is not configured yet.
UPDATE public.sales_documents
SET grand_total = COALESCE(subtotal, 0)
WHERE grand_total = 0;
