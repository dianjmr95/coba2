-- Add DP percentage field for sales invoice documents.
-- Created: 2026-04-27

ALTER TABLE IF EXISTS public.sales_documents
  ADD COLUMN IF NOT EXISTS down_payment_percent numeric(5,2) NOT NULL DEFAULT 0;

UPDATE public.sales_documents
SET down_payment_percent = 0
WHERE down_payment_percent IS NULL;
