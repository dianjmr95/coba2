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
  matchName: string;
  sectionTitle?: string;
};

const KNOWN_SECTION_BRANDS = [
  "ACER",
  "ASUS",
  "LENOVO",
  "HP",
  "DELL",
  "MSI",
  "APPLE",
  "SAMSUNG",
  "HUAWEI",
  "AXIOO",
  "INFINIX",
  "ADVAN",
  "XIAOMI"
];

function normalizeSectionTitle(rawValue: unknown) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  const detectedBrand = KNOWN_SECTION_BRANDS.find((brand) => upper.includes(brand));
  if (detectedBrand) return detectedBrand;

  const cleaned = upper.replace(/[^A-Z0-9\s/-]/g, " ");
  const firstToken = cleaned.split(/[\s/-]+/).find(Boolean);
  return firstToken || upper;
}

type MatchCandidate = {
  item: CatalogRow;
  score: number;
};

function getMatchCandidates(productName: string, catalog: CatalogRow[]) {
  const candidates: MatchCandidate[] = [];
  for (const item of catalog) {
    const score = scoreNameSimilarity(productName, item.matchName);
    candidates.push({ item, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function findBestAvailableMatch(
  productName: string,
  catalog: CatalogRow[],
  usedCatalogKeys: Set<string>
) {
  let best: CatalogRow | null = null;
  let bestScore = 0;

  for (const item of catalog) {
    const candidateKey = `${item.rowNumber}:${item.sku ?? ""}:${item.normalizedName}`;
    if (usedCatalogKeys.has(candidateKey)) continue;
    const score = scoreNameSimilarity(productName, item.matchName);
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

function parsePositiveInt(raw: string | null, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed);
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
  let activeSectionTitle = "";

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx] ?? [];
    const legacySkuRaw = row[0];
    const modelCodeRaw = row[1];
    const nameRaw = row[2];
    const priceRaw = row[3];
    const modelCode = String(modelCodeRaw ?? "").trim();
    const productName = String(nameRaw ?? "").trim();
    const price = parsePriceValue(priceRaw);

    const looksLikeSectionRow = modelCode && !productName && !price;
    if (looksLikeSectionRow) {
      activeSectionTitle = normalizeSectionTitle(modelCode);
      continue;
    }

    if (!productName || !price) continue;
    const matchName = `${modelCode} ${productName}`.trim();
    const primarySku = normalizeSku(modelCodeRaw);
    const fallbackSku = normalizeSku(legacySkuRaw);

    parsed.push({
      rowNumber: rowIdx + 1,
      productName,
      price: Math.round(price),
      sku: primarySku || fallbackSku,
      normalizedName: toNormalizedName(matchName),
      matchName,
      sectionTitle: activeSectionTitle || undefined
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
    normalizedName: toNormalizedName(row.productName),
    matchName: row.productName,
    sectionTitle: undefined
  }));
}

function buildNameBuckets(rows: CatalogRow[]) {
  const map = new Map<string, CatalogRow[]>();
  for (const row of rows) {
    const key = row.normalizedName;
    if (!key) continue;
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

function pickUnusedFromBucket(bucket: CatalogRow[] | undefined, usedCatalogKeys: Set<string>) {
  if (!bucket?.length) return null;
  for (const item of bucket) {
    const key = `${item.rowNumber}:${item.sku ?? ""}:${item.normalizedName}`;
    if (!usedCatalogKeys.has(key)) {
      return item;
    }
  }
  return null;
}
function getCatalogRowKey(item: CatalogRow) {
  return `${item.rowNumber}:${item.sku ?? ""}:${item.normalizedName}`;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const todayFile = ensureValidFile(form.get("today_file"), "price list hari ini");
    const previousFile = ensureValidFile(form.get("previous_file"), "price list sebelumnya");
    const compareModeRaw = String(form.get("compare_mode") ?? "normal").toLowerCase();
    const compareMode = compareModeRaw === "strict" ? "strict" : "normal";
    const toleranceNominal = parsePositiveInt(String(form.get("tolerance_nominal") ?? "0"), 0);

    const todayWorkbook = XLSX.read(Buffer.from(await todayFile.arrayBuffer()), { type: "buffer" });
    const previousWorkbook = XLSX.read(Buffer.from(await previousFile.arrayBuffer()), { type: "buffer" });

    const todayRows = extractBestRows(todayWorkbook);
    const previousRows = extractBestRows(previousWorkbook);

    const previousCatalog: CatalogRow[] = previousRows;
    const previousBySku = new Map<string, CatalogRow>();
    const previousByNormalizedName = buildNameBuckets(previousCatalog);
    for (const item of previousCatalog) {
      if (!item.sku) continue;
      if (!previousBySku.has(item.sku)) previousBySku.set(item.sku, item);
    }

    const similarityThreshold = compareMode === "strict" ? 0.55 : 0.35;
    const hasSkuCatalog = previousCatalog.some((item) => Boolean(item.sku));
    const usedCatalogKeys = new Set<string>();
    const rows = todayRows.map((row) => {
      const exactNameHit = pickUnusedFromBucket(previousByNormalizedName.get(row.normalizedName), usedCatalogKeys);
      const skuHit = row.sku ? previousBySku.get(row.sku) : null;
      if (row.sku && hasSkuCatalog && !skuHit) {
        const topCandidates = getMatchCandidates(row.matchName || row.productName, previousCatalog)
          .slice(0, 3)
          .map((candidate) => ({
            productName: candidate.item.productName,
            price: candidate.item.price,
            similarityScore: Number(candidate.score.toFixed(3))
          }));
        return {
          todayRowNumber: row.rowNumber,
          todayProductName: row.matchName || row.productName,
          todaySectionTitle: row.sectionTitle || "",
          todayPrice: row.price,
          matched: false,
          similarityScore: 0,
          status: "unmatched" as const,
          unmatchedType: "produk_baru" as const,
          unmatchedReason: "Produk baru: tidak ada di price list sebelumnya.",
          topCandidates
        };
      }
      const matched =
        exactNameHit
          ? { best: exactNameHit, score: 1 }
          : skuHit && !usedCatalogKeys.has(`${skuHit.rowNumber}:${skuHit.sku ?? ""}:${skuHit.normalizedName}`)
          ? { best: skuHit, score: 1 }
          : findBestAvailableMatch(row.matchName || row.productName, previousCatalog, usedCatalogKeys);
      if (!matched || matched.score < similarityThreshold) {
        const topCandidates = getMatchCandidates(row.matchName || row.productName, previousCatalog)
          .slice(0, 3)
          .map((candidate) => ({
            productName: candidate.item.productName,
            price: candidate.item.price,
            similarityScore: Number(candidate.score.toFixed(3))
          }));
        const reason =
          matched && matched.score > 0
            ? `Skor kemiripan di bawah ambang ${similarityThreshold.toFixed(2)}`
            : "Tidak ada kandidat produk sebelumnya yang cukup mirip";
        return {
          todayRowNumber: row.rowNumber,
          todayProductName: row.matchName || row.productName,
          todaySectionTitle: row.sectionTitle || "",
          todayPrice: row.price,
          matched: false,
          similarityScore: Number((matched?.score ?? 0).toFixed(3)),
          status: "unmatched" as const,
          unmatchedType: "produk_baru" as const,
          unmatchedReason: `Produk baru: ${reason}.`,
          topCandidates
        };
      }

      const matchedKey = getCatalogRowKey(matched.best);
      usedCatalogKeys.add(matchedKey);
      const rawDifference = row.price - matched.best.price;
      const difference = Math.abs(rawDifference) <= toleranceNominal ? 0 : rawDifference;
      return {
        todayRowNumber: row.rowNumber,
        todayProductName: row.matchName || row.productName,
        todaySectionTitle: row.sectionTitle || "",
        todayPrice: row.price,
        matched: true,
        previousProductName: matched.best.matchName || matched.best.productName,
        previousSectionTitle: matched.best.sectionTitle || "",
        previousPrice: matched.best.price,
        difference: Math.round(difference),
        similarityScore: Number(matched.score.toFixed(3)),
        status: mapStatus(difference),
        toleranceApplied: Math.abs(rawDifference) <= toleranceNominal
      };
    });

    const previousOnlyRows = previousCatalog
      .filter((item) => !usedCatalogKeys.has(getCatalogRowKey(item)))
      .map((item) => ({
        todayRowNumber: 0,
        todayProductName: "",
        todaySectionTitle: "",
        todayPrice: 0,
        matched: false,
        previousProductName: item.matchName || item.productName,
        previousSectionTitle: item.sectionTitle || "",
        previousPrice: item.price,
        similarityScore: 0,
        status: "unmatched" as const,
        unmatchedType: "produk_kosong" as const,
        unmatchedReason: "Produk kosong: ada di price list sebelumnya, tetapi hilang di hari ini.",
        topCandidates: [] as Array<{ productName: string; price: number; similarityScore: number }>
      }));

    const finalRows = [...rows, ...previousOnlyRows];

    const matchedRows = finalRows.filter((item) => item.matched);
    const todayCheaperCount = matchedRows.filter((item) => item.status === "today_cheaper").length;
    const previousCheaperCount = matchedRows.filter((item) => item.status === "previous_cheaper").length;
    const samePriceCount = matchedRows.filter((item) => item.status === "same").length;

    return NextResponse.json({
      ok: true,
      data: {
        rows: finalRows,
        summary: {
          totalRows: finalRows.length,
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
