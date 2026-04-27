import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
const SALES_DOCUMENT_RETENTION_DAYS = 365;

type SalesDocumentItem = {
  nama: string;
  qty: number;
  harga: number;
};

type SalesDocumentRequest = {
  publicToken?: string;
  documentNo?: string;
  documentType?: "faktur" | "penawaran";
  invoiceDate?: string;
  validUntil?: string | null;
  buyer?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  courier?: string;
  salesPic?: string;
  notes?: string;
  items?: SalesDocumentItem[];
  subtotal?: number;
  discountAmount?: number;
  taxEnabled?: boolean;
  taxMode?: "exclude" | "include";
  taxRate?: number;
  taxAmount?: number;
  grandTotal?: number;
  downPaymentPercent?: number;
  markPrinted?: boolean;
};

type LegacyDocumentMeta = {
  discountAmount?: number;
  downPaymentPercent?: number;
  taxEnabled?: boolean;
  taxMode?: "exclude" | "include";
  taxRate?: number;
  taxAmount?: number;
  grandTotal?: number;
  subtotalBeforeDiscount?: number;
};

const LEGACY_META_PREFIX = "[[DOC_META:";
const LEGACY_META_SUFFIX = "]]";

function normalizeIsoDate(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeItems(items: unknown) {
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
    .filter((item): item is { nama: string; qty: number; harga: number } => Boolean(item));
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

function getPublicAppOrigin(request: NextRequest) {
  const configured =
    String(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!configured) return request.nextUrl.origin;
  try {
    return new URL(configured).origin;
  } catch {
    return request.nextUrl.origin;
  }
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
      text.includes("discount_amount") ||
      text.includes("down_payment_percent")
    )
  );
}

function stripLegacyMetaNotes(notes: string) {
  const trimmed = String(notes || "").trim();
  const markerIndex = trimmed.indexOf(LEGACY_META_PREFIX);
  if (markerIndex < 0) return trimmed;
  return trimmed.slice(0, markerIndex).trim();
}

function buildLegacyMetaNotes(notes: string, meta: LegacyDocumentMeta) {
  const baseNotes = stripLegacyMetaNotes(notes);
  const safeMeta = {
    discountAmount: Math.max(0, Number(meta.discountAmount) || 0),
    downPaymentPercent: Math.min(100, Math.max(0, Number(meta.downPaymentPercent) || 0)),
    taxEnabled: Boolean(meta.taxEnabled),
    taxMode: meta.taxMode === "include" ? "include" : "exclude",
    taxRate: Math.max(0, Number(meta.taxRate) || 0),
    taxAmount: Math.max(0, Number(meta.taxAmount) || 0),
    grandTotal: Math.max(0, Number(meta.grandTotal) || 0),
    subtotalBeforeDiscount: Math.max(0, Number(meta.subtotalBeforeDiscount) || 0)
  } satisfies Required<LegacyDocumentMeta>;
  const metaText = `${LEGACY_META_PREFIX}${JSON.stringify(safeMeta)}${LEGACY_META_SUFFIX}`;
  return baseNotes ? `${baseNotes}\n${metaText}` : metaText;
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
    console.error(`[sales-documents] cleanup expired docs gagal: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SalesDocumentRequest;
    const publicToken = String(body.publicToken || "").trim();
    const documentNo = String(body.documentNo || "").trim();
    const documentType = body.documentType === "penawaran" ? "penawaran" : "faktur";
    const invoiceDate = normalizeIsoDate(body.invoiceDate);
    const validUntil = normalizeIsoDate(body.validUntil || null);
    const items = normalizeItems(body.items);
    const subtotal = Math.max(0, Math.round(Number(body.subtotal) || 0));
    const discountAmount = Math.min(subtotal, Math.max(0, Math.round(Number(body.discountAmount) || 0)));
    const discountedSubtotal = Math.max(0, subtotal - discountAmount);
    const taxEnabled = Boolean(body.taxEnabled);
    const taxMode = body.taxMode === "include" ? "include" : "exclude";
    const taxRate = Math.max(0, Number(body.taxRate) || 11);
    const taxAmount = taxEnabled ? Math.max(0, Math.round(Number(body.taxAmount) || 0)) : 0;
    const downPaymentPercentRaw = Number(body.downPaymentPercent);
    const downPaymentPercent = Math.round(
      Math.min(100, Math.max(0, Number.isFinite(downPaymentPercentRaw) ? downPaymentPercentRaw : 0)) * 100
    ) / 100;
    const grandTotal = Math.max(
      0,
      Math.round(Number(body.grandTotal) || discountedSubtotal + taxAmount)
    );
    const markPrinted = Boolean(body.markPrinted);

    if (!publicToken) {
      return NextResponse.json({ ok: false, error: "publicToken wajib diisi." }, { status: 400 });
    }
    if (!documentNo) {
      return NextResponse.json({ ok: false, error: "documentNo wajib diisi." }, { status: 400 });
    }
    if (!invoiceDate) {
      return NextResponse.json({ ok: false, error: "invoiceDate tidak valid." }, { status: 400 });
    }
    if (!items.length) {
      return NextResponse.json({ ok: false, error: "Minimal 1 item barang wajib diisi." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    await cleanupExpiredSalesDocuments(supabaseAdmin);
    const bearerToken = getBearerToken(request);
    let authUserId: string | null = null;
    if (bearerToken) {
      const {
        data: { user }
      } = await supabaseAdmin.auth.getUser(bearerToken);
      authUserId = user?.id || null;
    }

    const { data: existing, error: findError } = await supabaseAdmin
      .from("sales_documents")
      .select("id, print_count")
      .eq("public_token", publicToken)
      .maybeSingle();
    if (findError) {
      throw new Error(`Gagal cek dokumen: ${findError.message}`);
    }

    const payloadBase = {
      public_token: publicToken,
      document_no: documentNo,
      document_type: documentType,
      invoice_date: invoiceDate,
      valid_until: documentType === "penawaran" ? validUntil : null,
      buyer: String(body.buyer || "").trim(),
      phone: String(body.phone || "").trim(),
      whatsapp: String(body.whatsapp || "").trim(),
      address: String(body.address || "").trim(),
      courier: String(body.courier || "").trim(),
      sales_pic: documentType === "penawaran" ? String(body.salesPic || "").trim() : "",
      notes: String(body.notes || "").trim(),
      items,
      subtotal,
      discount_amount: discountAmount,
      down_payment_percent: downPaymentPercent,
      last_printed_at: markPrinted ? new Date().toISOString() : null
    };
    const payloadBaseLegacyNoDiscount = {
      public_token: publicToken,
      document_no: documentNo,
      document_type: documentType,
      invoice_date: invoiceDate,
      valid_until: documentType === "penawaran" ? validUntil : null,
      buyer: String(body.buyer || "").trim(),
      phone: String(body.phone || "").trim(),
      whatsapp: String(body.whatsapp || "").trim(),
      address: String(body.address || "").trim(),
      courier: String(body.courier || "").trim(),
      sales_pic: documentType === "penawaran" ? String(body.salesPic || "").trim() : "",
      notes: buildLegacyMetaNotes(String(body.notes || "").trim(), {
        discountAmount,
        downPaymentPercent,
        taxEnabled,
        taxMode,
        taxRate,
        taxAmount,
        grandTotal,
        subtotalBeforeDiscount: subtotal
      }),
      items,
      subtotal,
      last_printed_at: markPrinted ? new Date().toISOString() : null
    };
    const payloadWithTax = {
      ...payloadBase,
      tax_enabled: taxEnabled,
      tax_mode: taxMode,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      grand_total: grandTotal
    };
    const payloadWithTaxNoMode = {
      ...payloadBase,
      tax_enabled: taxEnabled,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      grand_total: grandTotal
    };
    const payloadWithTaxLegacyNoDiscount = {
      ...payloadBaseLegacyNoDiscount,
      tax_enabled: taxEnabled,
      tax_mode: taxMode,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      grand_total: grandTotal
    };
    const payloadWithTaxNoModeLegacyNoDiscount = {
      ...payloadBaseLegacyNoDiscount,
      tax_enabled: taxEnabled,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      grand_total: grandTotal
    };

    if (existing?.id) {
      const nextPrintCount = markPrinted ? Math.max(0, Number(existing.print_count) || 0) + 1 : existing.print_count;
      let { error: updateError } = await supabaseAdmin
        .from("sales_documents")
        .update({
          ...payloadWithTax,
          print_count: nextPrintCount
        })
        .eq("id", existing.id);
      if (updateError && isMissingTaxColumnError(updateError.message || "")) {
        const retryNoMode = await supabaseAdmin
          .from("sales_documents")
          .update({
            ...payloadWithTaxNoMode,
            print_count: nextPrintCount
          })
          .eq("id", existing.id);
        updateError = retryNoMode.error;
      }
      if (updateError && isMissingTaxColumnError(updateError.message || "")) {
        const legacyRetryNoDiscount = await supabaseAdmin
          .from("sales_documents")
          .update({
            ...payloadWithTaxLegacyNoDiscount,
            print_count: nextPrintCount
          })
          .eq("id", existing.id);
        updateError = legacyRetryNoDiscount.error;
      }
      if (updateError && isMissingTaxColumnError(updateError.message || "")) {
        const legacyRetryNoModeNoDiscount = await supabaseAdmin
          .from("sales_documents")
          .update({
            ...payloadWithTaxNoModeLegacyNoDiscount,
            print_count: nextPrintCount
          })
          .eq("id", existing.id);
        updateError = legacyRetryNoModeNoDiscount.error;
      }
      if (updateError && isMissingTaxColumnError(updateError.message || "")) {
        const legacyRetryNoTax = await supabaseAdmin
          .from("sales_documents")
          .update({
            ...payloadBaseLegacyNoDiscount,
            print_count: nextPrintCount
          })
          .eq("id", existing.id);
        updateError = legacyRetryNoTax.error;
      }
      if (updateError) {
        throw new Error(`Gagal update dokumen: ${updateError.message}`);
      }
    } else {
      let { error: insertError } = await supabaseAdmin.from("sales_documents").insert({
        ...payloadWithTax,
        print_count: markPrinted ? 1 : 0,
        created_by: authUserId
      });
      if (insertError && isMissingTaxColumnError(insertError.message || "")) {
        const retryNoMode = await supabaseAdmin.from("sales_documents").insert({
          ...payloadWithTaxNoMode,
          print_count: markPrinted ? 1 : 0,
          created_by: authUserId
        });
        insertError = retryNoMode.error;
      }
      if (insertError && isMissingTaxColumnError(insertError.message || "")) {
        const legacyRetryNoDiscount = await supabaseAdmin.from("sales_documents").insert({
          ...payloadWithTaxLegacyNoDiscount,
          print_count: markPrinted ? 1 : 0,
          created_by: authUserId
        });
        insertError = legacyRetryNoDiscount.error;
      }
      if (insertError && isMissingTaxColumnError(insertError.message || "")) {
        const legacyRetryNoModeNoDiscount = await supabaseAdmin.from("sales_documents").insert({
          ...payloadWithTaxNoModeLegacyNoDiscount,
          print_count: markPrinted ? 1 : 0,
          created_by: authUserId
        });
        insertError = legacyRetryNoModeNoDiscount.error;
      }
      if (insertError && isMissingTaxColumnError(insertError.message || "")) {
        const legacyRetryNoTax = await supabaseAdmin.from("sales_documents").insert({
          ...payloadBaseLegacyNoDiscount,
          print_count: markPrinted ? 1 : 0,
          created_by: authUserId
        });
        insertError = legacyRetryNoTax.error;
      }
      if (insertError) {
        throw new Error(`Gagal simpan dokumen: ${insertError.message}`);
      }
    }

    const origin = getPublicAppOrigin(request);
    return NextResponse.json({
      ok: true,
      data: {
        documentNo,
        publicToken,
        shareUrl: `${origin}/dokumen/${publicToken}`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi error server.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
