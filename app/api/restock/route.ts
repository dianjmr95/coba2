import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

type UploadStockRow = {
  sku: string;
  name: string;
  harga_modal: number;
  harga_jual: number;
  qty: number;
};

type UploadSalesRow = {
  product_name: string;
  qty_terjual: number;
  omzet: number;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, " ");
}

function normalizeSku(value: unknown) {
  return normalizeText(value).toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function parseNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

async function readJsonBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [warehouses, products, stocks, salesRecords] = await Promise.all([
      supabase.from("restock_warehouses").select("*").order("name", { ascending: true }),
      supabase.from("restock_products").select("*").order("name", { ascending: true }),
      supabase.from("restock_warehouse_stock").select("*"),
      supabase.from("restock_sales_records").select("*").order("period_label", { ascending: true })
    ]);

    if (warehouses.error) throw warehouses.error;
    if (products.error) throw products.error;
    if (stocks.error) throw stocks.error;
    if (salesRecords.error) throw salesRecords.error;

    return NextResponse.json({
      ok: true,
      data: {
        warehouses: warehouses.data ?? [],
        products: products.data ?? [],
        stocks: stocks.data ?? [],
        salesRecords: salesRecords.data ?? []
      }
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Gagal memuat data restock." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ ok: false, error: "Payload tidak valid." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    if (body.action === "add_warehouse") {
      const name = normalizeText(body.name);
      if (!name) return NextResponse.json({ ok: false, error: "Nama gudang wajib diisi." }, { status: 400 });
      const { data, error } = await supabase.from("restock_warehouses").insert({ name }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, data });
    }

    if (body.action === "upload_stock") {
      const warehouseId = normalizeText(body.warehouseId);
      const rows = Array.isArray(body.rows) ? (body.rows as UploadStockRow[]) : [];
      if (!warehouseId) return NextResponse.json({ ok: false, error: "Gudang tujuan wajib dipilih." }, { status: 400 });
      if (!rows.length) return NextResponse.json({ ok: false, error: "Tidak ada baris stok untuk diproses." }, { status: 400 });

      const { data: existingProducts, error: productFetchError } = await supabase.from("restock_products").select("*");
      if (productFetchError) throw productFetchError;

      const productMap = new Map<string, { id: string; sku_normalized: string; name_normalized: string }>();
      for (const product of existingProducts ?? []) {
        if (product.sku_normalized) productMap.set(`sku:${product.sku_normalized}`, product);
        productMap.set(`name:${product.name_normalized}`, product);
      }

      const resolvedProducts: Array<{ product: { id: string; sku_normalized: string; name_normalized: string }; qty: number }> = [];
      for (const row of rows) {
        const sku = normalizeSku(row.sku);
        const name = normalizeText(row.name);
        const skuNormalized = normalizeSku(row.sku);
        const nameNormalized = normalizeKey(row.name);
        if (!name) continue;

        let existing =
          (skuNormalized ? productMap.get(`sku:${skuNormalized}`) : null) ?? productMap.get(`name:${nameNormalized}`) ?? null;

        if (!existing) {
          const payload = {
            sku: sku || null,
            name,
            harga_modal: Math.max(0, Number(row.harga_modal) || 0),
            harga_jual: Math.max(0, Number(row.harga_jual) || 0),
            sku_normalized: skuNormalized,
            name_normalized: nameNormalized
          };
          const { data, error } = await supabase.from("restock_products").insert(payload).select("*").single();
          if (error) throw error;
          existing = data;
          productMap.set(`name:${nameNormalized}`, data);
          if (skuNormalized) productMap.set(`sku:${skuNormalized}`, data);
        } else {
          const { data, error } = await supabase
            .from("restock_products")
            .update({
              sku: sku ? row.sku || null : existing.sku_normalized ? row.sku || null : null,
              name,
              harga_modal: Math.max(0, Number(row.harga_modal) || 0),
              harga_jual: Math.max(0, Number(row.harga_jual) || 0),
              sku_normalized: skuNormalized,
              name_normalized: nameNormalized
            })
            .eq("id", existing.id)
            .select("*")
            .single();
          if (error) throw error;
          existing = data;
          productMap.set(`name:${nameNormalized}`, data);
          if (skuNormalized) productMap.set(`sku:${skuNormalized}`, data);
        }
        if (!existing) {
          throw new Error(`Produk gagal diproses untuk baris: ${name}`);
        }
        resolvedProducts.push({ product: existing, qty: Math.max(0, Math.round(Number(row.qty) || 0)) });
      }

      const mergedStockMap = new Map<string, { productId: string; qty: number }>();
      for (const item of resolvedProducts) {
        const current = mergedStockMap.get(item.product.id);
        mergedStockMap.set(item.product.id, {
          productId: item.product.id,
          qty: (current?.qty ?? 0) + item.qty
        });
      }

      const { error: stockDeleteError } = await supabase.from("restock_warehouse_stock").delete().eq("warehouse_id", warehouseId);
      if (stockDeleteError) throw stockDeleteError;

      const stockPayload = Array.from(mergedStockMap.values()).map(({ productId, qty }) => ({
        warehouse_id: warehouseId,
        product_id: productId,
        qty
      }));
      const { error: stockInsertError } = await supabase.from("restock_warehouse_stock").insert(stockPayload);
      if (stockInsertError) throw stockInsertError;

      return NextResponse.json({ ok: true, data: { products: resolvedProducts.length, stockRows: stockPayload.length } });
    }

    if (body.action === "upload_sales") {
      const periodLabel = normalizeText(body.periodLabel);
      const replaceExisting = Boolean(body.replaceExisting);
      const rows = Array.isArray(body.rows) ? (body.rows as UploadSalesRow[]) : [];
      if (!periodLabel) return NextResponse.json({ ok: false, error: "Periode wajib diisi." }, { status: 400 });
      if (!rows.length) return NextResponse.json({ ok: false, error: "Tidak ada data penjualan untuk diproses." }, { status: 400 });

      const { data: products, error: productsError } = await supabase.from("restock_products").select("*");
      if (productsError) throw productsError;
      const productMap = new Map<string, { id: string; name_normalized: string }>();
      for (const product of products ?? []) {
        productMap.set(product.name_normalized, product);
      }

      if (replaceExisting) {
        const { error: deleteError } = await supabase.from("restock_sales_records").delete().eq("period_label", periodLabel);
        if (deleteError) throw deleteError;
      }

      const payloadMap = new Map<string, {
        period_label: string;
        product_id: string | null;
        product_name: string;
        normalized_name: string;
        qty_terjual: number;
        omzet: number;
      }>();

      for (const row of rows) {
        const productName = normalizeText(row.product_name);
        const normalizedName = normalizeKey(productName);
        if (!productName) continue;
        const matched = productMap.get(normalizedName) ?? null;
        const existing = payloadMap.get(normalizedName);
        const nextRow = {
          period_label: periodLabel,
          product_id: matched?.id ?? existing?.product_id ?? null,
          product_name: productName,
          normalized_name: normalizedName,
          qty_terjual: Math.max(0, Number(row.qty_terjual) || 0),
          omzet: Math.max(0, Number(row.omzet) || 0)
        };
        if (existing) {
          payloadMap.set(normalizedName, {
            ...existing,
            product_id: existing.product_id ?? nextRow.product_id,
            qty_terjual: existing.qty_terjual + nextRow.qty_terjual,
            omzet: existing.omzet + nextRow.omzet
          });
        } else {
          payloadMap.set(normalizedName, nextRow);
        }
      }

      const payload = Array.from(payloadMap.values())
        .map((row) => {
          return row;
        })
        .filter(Boolean);

      const { error: insertError } = await supabase.from("restock_sales_records").insert(payload as never[]);
      if (insertError) throw insertError;

      return NextResponse.json({ ok: true, data: { inserted: payload.length } });
    }

    return NextResponse.json({ ok: false, error: "Action tidak dikenal." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
