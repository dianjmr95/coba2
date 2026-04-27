import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
const FIXED_ADMIN_EMAIL = String(
  process.env.FIXED_ADMIN_EMAIL || "luluklisdiantoro535@gmail.com"
).trim().toLowerCase();
const SALES_DOCUMENT_RETENTION_DAYS = 365;

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function isMissingTaxColumnError(message: string) {
  const text = message.toLowerCase();
  return (
    (text.includes("schema cache") || text.includes("column")) &&
    (
      text.includes("grand_total") ||
      text.includes("tax_enabled") ||
      text.includes("tax_rate") ||
      text.includes("tax_amount") ||
      text.includes("tax_mode") ||
      text.includes("discount_amount")
    )
  );
}

type SalesDocumentItem = {
  nama: string;
  qty: number;
  harga: number;
};

type LegacyDocumentMeta = {
  discountAmount?: number;
  taxEnabled?: boolean;
  taxMode?: "exclude" | "include";
  taxRate?: number;
  taxAmount?: number;
  grandTotal?: number;
  subtotalBeforeDiscount?: number;
};

const LEGACY_META_PREFIX = "[[DOC_META:";
const LEGACY_META_SUFFIX = "]]";

function normalizeItems(items: unknown): SalesDocumentItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const rec = item as Record<string, unknown>;
      const nama = String(rec.nama || "").trim();
      const qty = Math.max(0, Number(rec.qty) || 0);
      const harga = Math.max(0, Number(rec.harga) || 0);
      if (!nama || qty <= 0) return null;
      return { nama, qty, harga };
    })
    .filter((item): item is SalesDocumentItem => Boolean(item));
}

function parseLegacyMetaFromNotes(notes: unknown) {
  const text = String(notes || "");
  const start = text.indexOf(LEGACY_META_PREFIX);
  if (start < 0) return { cleanNotes: text.trim(), meta: null as LegacyDocumentMeta | null };
  const jsonStart = start + LEGACY_META_PREFIX.length;
  const end = text.indexOf(LEGACY_META_SUFFIX, jsonStart);
  if (end < 0) return { cleanNotes: text.trim(), meta: null as LegacyDocumentMeta | null };

  const cleanNotes = `${text.slice(0, start)}${text.slice(end + LEGACY_META_SUFFIX.length)}`.trim();
  const rawJson = text.slice(jsonStart, end).trim();
  try {
    const parsed = JSON.parse(rawJson) as LegacyDocumentMeta;
    return { cleanNotes, meta: parsed };
  } catch {
    return { cleanNotes: text.trim(), meta: null as LegacyDocumentMeta | null };
  }
}

function getSalesDocumentRetentionCutoffIso() {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - SALES_DOCUMENT_RETENTION_DAYS);
  return cutoff.toISOString();
}

async function cleanupExpiredSalesDocuments(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  const cutoffIso = getSalesDocumentRetentionCutoffIso();
  const { error } = await supabaseAdmin
    .from("sales_documents")
    .delete()
    .lt("created_at", cutoffIso);
  if (error) {
    console.error(`[sales-documents/token] cleanup expired docs gagal: ${error.message}`);
  }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const publicToken = String(token || "").trim();
    if (!publicToken) {
      return NextResponse.json({ ok: false, error: "Token dokumen tidak valid." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    await cleanupExpiredSalesDocuments(supabaseAdmin);
    let { data, error } = await supabaseAdmin
      .from("sales_documents")
      .select(
        "public_token, document_no, document_type, invoice_date, valid_until, buyer, phone, whatsapp, address, courier, sales_pic, notes, items, subtotal, discount_amount, tax_enabled, tax_mode, tax_rate, tax_amount, grand_total, print_count, last_printed_at, created_at"
      )
      .eq("public_token", publicToken)
      .maybeSingle();
    if (error && isMissingTaxColumnError(error.message || "")) {
      const retryNoDiscount = await supabaseAdmin
        .from("sales_documents")
        .select(
          "public_token, document_no, document_type, invoice_date, valid_until, buyer, phone, whatsapp, address, courier, sales_pic, notes, items, subtotal, tax_enabled, tax_mode, tax_rate, tax_amount, grand_total, print_count, last_printed_at, created_at"
        )
        .eq("public_token", publicToken)
        .maybeSingle();
      data = retryNoDiscount.data as typeof data;
      error = retryNoDiscount.error;
    }
    if (error && isMissingTaxColumnError(error.message || "")) {
      const retryNoMode = await supabaseAdmin
        .from("sales_documents")
        .select(
          "public_token, document_no, document_type, invoice_date, valid_until, buyer, phone, whatsapp, address, courier, sales_pic, notes, items, subtotal, discount_amount, tax_enabled, tax_rate, tax_amount, grand_total, print_count, last_printed_at, created_at"
        )
        .eq("public_token", publicToken)
        .maybeSingle();
      data = retryNoMode.data as typeof data;
      error = retryNoMode.error;
    }
    if (error && isMissingTaxColumnError(error.message || "")) {
      const retryNoModeNoDiscount = await supabaseAdmin
        .from("sales_documents")
        .select(
          "public_token, document_no, document_type, invoice_date, valid_until, buyer, phone, whatsapp, address, courier, sales_pic, notes, items, subtotal, tax_enabled, tax_rate, tax_amount, grand_total, print_count, last_printed_at, created_at"
        )
        .eq("public_token", publicToken)
        .maybeSingle();
      data = retryNoModeNoDiscount.data as typeof data;
      error = retryNoModeNoDiscount.error;
    }
    if (error && isMissingTaxColumnError(error.message || "")) {
      const legacyResultNoTax = await supabaseAdmin
        .from("sales_documents")
        .select(
          "public_token, document_no, document_type, invoice_date, valid_until, buyer, phone, whatsapp, address, courier, sales_pic, notes, items, subtotal, print_count, last_printed_at, created_at"
        )
        .eq("public_token", publicToken)
        .maybeSingle();
      data = legacyResultNoTax.data as typeof data;
      error = legacyResultNoTax.error;
    }

    if (error) {
      throw new Error(`Gagal membaca dokumen: ${error.message}`);
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Dokumen tidak ditemukan." }, { status: 404 });
    }

    const normalizedItems = normalizeItems(data.items);
    const { cleanNotes, meta: legacyMeta } = parseLegacyMetaFromNotes(data.notes);
    const subtotalFromColumn = Math.max(0, Number(data.subtotal) || 0);
    const subtotalFromItems = normalizedItems.reduce(
      (acc, item) => acc + Math.max(0, Number(item.qty) || 0) * Math.max(0, Number(item.harga) || 0),
      0
    );
    // Backward compatibility:
    // beberapa dokumen lama menyimpan subtotal sesudah diskon, jadi kita ambil nilai terbesar
    // antara subtotal kolom dan hasil penjumlahan item sebagai "subtotal barang" sebelum diskon.
    const subtotal = Math.max(subtotalFromColumn, subtotalFromItems);
    const taxRate = Math.max(0, Number(data.tax_rate) || Math.max(0, Number(legacyMeta?.taxRate) || 11));
    const taxAmountRaw = Math.max(0, Number(data.tax_amount) || Math.max(0, Number(legacyMeta?.taxAmount) || 0));
    const grandTotalRaw = Math.max(0, Number(data.grand_total) || Math.max(0, Number(legacyMeta?.grandTotal) || subtotal));
    const rawTaxMode = String(data.tax_mode || "").toLowerCase();
    const inferredTaxEnabledBase =
      Boolean(data.tax_enabled) ||
      Boolean(legacyMeta?.taxEnabled) ||
      taxAmountRaw > 0 ||
      grandTotalRaw > subtotal + 1;
    const inferredTaxModeBase =
      rawTaxMode === "include" || rawTaxMode === "exclude"
        ? rawTaxMode
        : legacyMeta?.taxMode === "include" || legacyMeta?.taxMode === "exclude"
          ? legacyMeta.taxMode
        : inferredTaxEnabledBase && Math.abs(grandTotalRaw - subtotal) <= 1 && taxAmountRaw > 0
          ? "include"
          : "exclude";
    const discountAmountFromColumn = Math.min(
      subtotal,
      Math.max(0, Number(data.discount_amount) || Math.max(0, Number(legacyMeta?.discountAmount) || 0))
    );
    const inferredDiscountFromTotals = Math.max(
      0,
      inferredTaxEnabledBase
        ? inferredTaxModeBase === "exclude"
          ? subtotal + taxAmountRaw - grandTotalRaw
          : subtotal - grandTotalRaw
        : subtotal - grandTotalRaw
    );
    const discountAmount = Math.min(
      subtotal,
      discountAmountFromColumn > 0 ? discountAmountFromColumn : inferredDiscountFromTotals
    );
    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);
    const inferredTaxEnabled = inferredTaxEnabledBase;
    const inferredTaxMode = inferredTaxModeBase;
    const inferredTaxAmount =
      inferredTaxEnabled
        ? inferredTaxMode === "include"
          ? Math.max(0, taxAmountRaw || subtotalAfterDiscount - Math.round((subtotalAfterDiscount * 100) / (100 + taxRate)))
          : Math.max(0, taxAmountRaw || grandTotalRaw - subtotalAfterDiscount || Math.round((subtotalAfterDiscount * taxRate) / 100))
        : 0;
    const inferredGrandTotal = inferredTaxEnabled
      ? inferredTaxMode === "include"
        ? Math.max(0, grandTotalRaw || subtotalAfterDiscount)
        : Math.max(0, grandTotalRaw || subtotalAfterDiscount + inferredTaxAmount)
      : subtotalAfterDiscount;

    return NextResponse.json({
      ok: true,
      data: {
        publicToken: data.public_token,
        documentNo: data.document_no,
        documentType: data.document_type,
        invoiceDate: data.invoice_date,
        validUntil: data.valid_until,
        buyer: data.buyer,
        phone: data.phone,
        whatsapp: data.whatsapp,
        address: data.address,
        courier: data.courier,
        salesPic: data.sales_pic,
        notes: cleanNotes,
        items: normalizedItems,
        subtotal,
        discountAmount,
        taxEnabled: inferredTaxEnabled,
        taxMode: inferredTaxMode,
        taxRate,
        taxAmount: inferredTaxAmount,
        grandTotal: inferredGrandTotal,
        printCount: Number(data.print_count) || 0,
        lastPrintedAt: data.last_printed_at,
        createdAt: data.created_at
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi error server.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const publicToken = String(token || "").trim();
    if (!publicToken) {
      return NextResponse.json({ ok: false, error: "Token dokumen tidak valid." }, { status: 400 });
    }

    const bearerToken = getBearerToken(request);
    if (!bearerToken) {
      return NextResponse.json({ ok: false, error: "Token login tidak ditemukan." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const {
      data: { user }
    } = await supabaseAdmin.auth.getUser(bearerToken);
    const email = String(user?.email || "").trim().toLowerCase();
    if (!user || !email) {
      return NextResponse.json({ ok: false, error: "Token login tidak valid." }, { status: 401 });
    }
    if (email !== FIXED_ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: "Hanya role admin yang bisa menghapus dokumen." }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("sales_documents")
      .delete()
      .eq("public_token", publicToken)
      .select("id")
      .maybeSingle();
    if (error) {
      throw new Error(`Gagal menghapus dokumen: ${error.message}`);
    }
    if (!data?.id) {
      return NextResponse.json({ ok: false, error: "Dokumen tidak ditemukan." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi error server.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
