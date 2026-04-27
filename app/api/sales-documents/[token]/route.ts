import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
const FIXED_ADMIN_EMAIL = String(
  process.env.FIXED_ADMIN_EMAIL || "luluklisdiantoro535@gmail.com"
).trim().toLowerCase();

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

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const publicToken = String(token || "").trim();
    if (!publicToken) {
      return NextResponse.json({ ok: false, error: "Token dokumen tidak valid." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
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

    const subtotal = Math.max(0, Number(data.subtotal) || 0);
    const taxRate = Math.max(0, Number(data.tax_rate) || 11);
    const taxAmountRaw = Math.max(0, Number(data.tax_amount) || 0);
    const grandTotalRaw = Math.max(0, Number(data.grand_total) || subtotal);
    const rawTaxMode = String(data.tax_mode || "").toLowerCase();
    const inferredTaxEnabledBase = Boolean(data.tax_enabled) || taxAmountRaw > 0 || grandTotalRaw > subtotal + 1;
    const inferredTaxModeBase =
      rawTaxMode === "include" || rawTaxMode === "exclude"
        ? rawTaxMode
        : inferredTaxEnabledBase && Math.abs(grandTotalRaw - subtotal) <= 1 && taxAmountRaw > 0
          ? "include"
          : "exclude";
    const discountAmountFromColumn = Math.min(subtotal, Math.max(0, Number(data.discount_amount) || 0));
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
        notes: data.notes,
        items: Array.isArray(data.items) ? data.items : [],
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
