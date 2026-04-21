import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  extractPriceRowsFromWorkbook,
  parsePriceValue,
  scoreNameSimilarity,
  toNormalizedName,
  type ParsedPriceRow
} from "../../../lib/price-compare";

export const runtime = "nodejs";

type CatalogRow = ParsedPriceRow & {
  sku?: string;
  normalizedName: string;
};

function findBestMatch(productName: string, catalog: CatalogRow[]) {
  let best: CatalogRow | null = null;
  let bestScore = 0;

  for (const item of catalog) {
    const score = scoreNameSimilarity(productName, item.normalizedName);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  if (!best) return null;
  return { best, score: bestScore };
}

function mapStatus(diff: number) {
  if (diff < 0) return "today_cheaper" as const;
  if (diff > 0) return "previous_cheaper" as const;
  return "same" as const;
}

function ensureValidFile(value: FormDataEntryValue | null, label: string) {
  if (!(value instanceof File)) {
    throw new Error(`File ${label} wajib diisi.`);
  }
  const maxBytes = 10 * 1024 * 1024;
  if (value.size > maxBytes) {
    throw new Error(`Ukuran file ${label} terlalu besar. Maksimal 10MB.`);
  }
  return value;
}

function normalizeSku(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

function extractBpFormatRows(workbook: XLSX.WorkBook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [] as CatalogRow[];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
  const parsed: CatalogRow[] = [];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx] ?? [];
    const skuRaw = row[0];
    const nameRaw = row[1];
    const priceRaw = row[3];

    const productName = String(nameRaw ?? "").trim();
    const price = parsePriceValue(priceRaw);
    if (!productName || !price) continue;

    parsed.push({
      rowNumber: rowIdx + 1,
      productName,
      price: Math.round(price),
      sku: normalizeSku(skuRaw),
      normalizedName: toNormalizedName(productName)
    });
  }

  return parsed;
}

function extractBestRows(workbook: XLSX.WorkBook) {
  const bpRows = extractBpFormatRows(workbook);
  if (bpRows.length >= 20) return bpRows;

  const genericRows = extractPriceRowsFromWorkbook(workbook, { maxRows: 1000 });
  return genericRows.map((row) => ({
    ...row,
    sku: "",
    normalizedName: toNormalizedName(row.productName)
  }));
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const todayFile = ensureValidFile(form.get("today_file"), "price list hari ini");
    const previousFile = ensureValidFile(form.get("previous_file"), "price list sebelumnya");

    const todayWorkbook = XLSX.read(Buffer.from(await todayFile.arrayBuffer()), { type: "buffer" });
    const previousWorkbook = XLSX.read(Buffer.from(await previousFile.arrayBuffer()), { type: "buffer" });

    const todayRows = extractBestRows(todayWorkbook);
    const previousRows = extractBestRows(previousWorkbook);

    if (!todayRows.length) {
      return NextResponse.json({
        ok: true,
        data: {
          rows: [],
          summary: {
            totalRows: 0,
            matchedRows: 0,
            todayCheaperCount: 0,
            previousCheaperCount: 0,
            samePriceCount: 0
          }
        }
      });
    }

    const previousCatalog: CatalogRow[] = previousRows;
    const previousBySku = new Map<string, CatalogRow>();
    for (const item of previousCatalog) {
      if (!item.sku) continue;
      if (!previousBySku.has(item.sku)) previousBySku.set(item.sku, item);
    }

    const similarityThreshold = 0.35;
    const rows = todayRows.map((row) => {
      const skuHit = row.sku ? previousBySku.get(row.sku) : null;
      const matched = skuHit ? { best: skuHit, score: 1 } : findBestMatch(row.productName, previousCatalog);
      if (!matched || matched.score < similarityThreshold) {
        return {
          todayRowNumber: row.rowNumber,
          todayProductName: row.productName,
          todayPrice: row.price,
          matched: false,
          similarityScore: Number((matched?.score ?? 0).toFixed(3)),
          status: "unmatched" as const
        };
      }

      const difference = row.price - matched.best.price;
      return {
        todayRowNumber: row.rowNumber,
        todayProductName: row.productName,
        todayPrice: row.price,
        matched: true,
        previousProductName: matched.best.productName,
        previousPrice: matched.best.price,
        difference: Math.round(difference),
        similarityScore: Number(matched.score.toFixed(3)),
        status: mapStatus(difference)
      };
    });

    const matchedRows = rows.filter((item) => item.matched);
    const todayCheaperCount = matchedRows.filter((item) => item.status === "today_cheaper").length;
    const previousCheaperCount = matchedRows.filter((item) => item.status === "previous_cheaper").length;
    const samePriceCount = matchedRows.filter((item) => item.status === "same").length;

    return NextResponse.json({
      ok: true,
      data: {
        rows,
        summary: {
          totalRows: rows.length,
          matchedRows: matchedRows.length,
          todayCheaperCount,
          previousCheaperCount,
          samePriceCount
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan saat memproses file.";
    const status = message.includes("wajib diisi") || message.includes("terlalu besar") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
