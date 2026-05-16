import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
const pdfParse = require("pdf-parse/lib/pdf-parse.js");
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
  skuFamily?: string;
  normalizedName: string;
  matchName: string;
  sectionTitle?: string;
};
type SkuPresenceInfo = {
  hasRow: boolean;
  hasPrice: boolean;
};
type ParsedInputRow = {
  rowNumber?: number;
  sku?: string;
  skuFamily?: string;
  productName: string;
  price: number;
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
  const maxBytes = 50 * 1024 * 1024;
  if (value.size > maxBytes) {
    throw new Error(`Ukuran file ${label} terlalu besar. Maksimal 50MB.`);
  }
  return value;
}

function resolveFileKind(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf" as const;
  if (name.endsWith(".csv")) return "csv" as const;
  return "xlsx" as const;
}

function normalizeSku(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeSkuFamily(raw: unknown) {
  const sku = normalizeSku(raw);
  if (!sku) return "";
  // Treat common suffix variants as one family (e.g. FKOH0 vs FKOH0-TY)
  return sku.replace(/-(ty|eu|us|uk|au|jp|cn|kr)$/i, "");
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
      skuFamily: normalizeSkuFamily(primarySku || fallbackSku),
      normalizedName: toNormalizedName(matchName),
      matchName,
      sectionTitle: activeSectionTitle || undefined
    });
  }

  return parsed;
}

function normalizeHeaderToken(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPrimaryDescription(raw: unknown) {
  const text = String(raw ?? "").replace(/\r/g, "\n");
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? "";
}

function findHeaderIndex(headerRow: unknown[], aliases: string[]) {
  const headerCells = headerRow.map((cell) => normalizeHeaderToken(cell));
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < headerCells.length; i += 1) {
    const cell = headerCells[i];
    if (!cell) continue;
    for (let aliasIdx = 0; aliasIdx < aliases.length; aliasIdx += 1) {
      const alias = aliases[aliasIdx];
      let score = 0;
      if (cell === alias) score = 1000 - aliasIdx;
      else if (cell.includes(alias)) score = 700 - aliasIdx;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

function extractSkuDescriptionFormatRows(workbook: XLSX.WorkBook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [] as CatalogRow[];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
  if (!rows.length) return [] as CatalogRow[];

  const scanLimit = Math.min(rows.length, 30);
  let headerIdx = -1;
  let skuIdx = -1;
  let nameIdx = -1;
  let priceIdx = -1;

  for (let idx = 0; idx < scanLimit; idx += 1) {
    const row = rows[idx] ?? [];
    const foundSkuIdx = findHeaderIndex(row, ["sku", "kode barang", "item code", "model"]);
    const foundNameIdx = findHeaderIndex(row, ["description", "item name", "product", "nama produk"]);
    const foundPriceIdx = findHeaderIndex(row, ["dealer price", "dealer", "online price", "bottom price", "retail price", "price", "harga"]);
    if (foundSkuIdx >= 0 && foundNameIdx >= 0 && foundPriceIdx >= 0) {
      headerIdx = idx;
      skuIdx = foundSkuIdx;
      nameIdx = foundNameIdx;
      priceIdx = foundPriceIdx;
      break;
    }
  }

  if (headerIdx < 0) return [] as CatalogRow[];

  const parsed: CatalogRow[] = [];
  for (let rowIdx = headerIdx + 1; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx] ?? [];
    const skuRaw = String(row[skuIdx] ?? "").trim();
    const productName = extractPrimaryDescription(row[nameIdx]);
    const price = parsePriceValue(row[priceIdx]);
    if (!productName || !price) continue;

    const sku = normalizeSku(skuRaw);
    const matchName = `${skuRaw} ${productName}`.trim();
    parsed.push({
      rowNumber: rowIdx + 1,
      productName,
      price: Math.round(price),
      sku,
      skuFamily: normalizeSkuFamily(sku),
      normalizedName: toNormalizedName(matchName),
      matchName
    });
  }

  return parsed;
}

type PriceSourceMode = "auto" | "dealer" | "online" | "retail" | "bottom";

function getPriceHeaderAliases(priceSourceMode: PriceSourceMode) {
  const base = ["dealer price", "dealer", "online price", "bottom price", "retail price", "price", "harga"];
  if (priceSourceMode === "dealer") return ["dealer price", "dealer", ...base];
  if (priceSourceMode === "online") return ["online price", "price online", ...base];
  if (priceSourceMode === "retail") return ["retail price", "retail", ...base];
  if (priceSourceMode === "bottom") return ["bottom price", "bottom", ...base];
  return base;
}

function extractSkuDescriptionFormatRowsWithPriceMode(workbook: XLSX.WorkBook, priceSourceMode: PriceSourceMode) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [] as CatalogRow[];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
  if (!rows.length) return [] as CatalogRow[];

  const scanLimit = Math.min(rows.length, 30);
  let headerIdx = -1;
  let skuIdx = -1;
  let nameIdx = -1;
  let priceIdx = -1;
  const priceAliases = getPriceHeaderAliases(priceSourceMode);

  for (let idx = 0; idx < scanLimit; idx += 1) {
    const row = rows[idx] ?? [];
    const foundSkuIdx = findHeaderIndex(row, ["sku", "kode barang", "item code", "model"]);
    const foundNameIdx = findHeaderIndex(row, ["description", "item name", "product", "nama produk"]);
    const foundPriceIdx = findHeaderIndex(row, priceAliases);
    if (foundSkuIdx >= 0 && foundNameIdx >= 0 && foundPriceIdx >= 0) {
      headerIdx = idx;
      skuIdx = foundSkuIdx;
      nameIdx = foundNameIdx;
      priceIdx = foundPriceIdx;
      break;
    }
  }

  if (headerIdx < 0) return [] as CatalogRow[];

  const parsed: CatalogRow[] = [];
  for (let rowIdx = headerIdx + 1; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx] ?? [];
    const skuRaw = String(row[skuIdx] ?? "").trim();
    const productName = String(row[nameIdx] ?? "").trim();
    const price = parsePriceValue(row[priceIdx]);
    if (!productName || !price) continue;

    const sku = normalizeSku(skuRaw);
    const matchName = `${skuRaw} ${productName}`.trim();
    parsed.push({
      rowNumber: rowIdx + 1,
      productName,
      price: Math.round(price),
      sku,
      normalizedName: toNormalizedName(matchName),
      matchName
    });
  }

  return parsed;
}

function extractSkuPresenceMap(workbook: XLSX.WorkBook, priceSourceMode: PriceSourceMode) {
  const presence = new Map<string, SkuPresenceInfo>();
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return presence;

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
  if (!rows.length) return presence;

  const scanLimit = Math.min(rows.length, 30);
  const priceAliases = getPriceHeaderAliases(priceSourceMode);
  let headerIdx = -1;
  let skuIdx = -1;
  let nameIdx = -1;
  let priceIdx = -1;

  for (let idx = 0; idx < scanLimit; idx += 1) {
    const row = rows[idx] ?? [];
    const foundSkuIdx = findHeaderIndex(row, ["sku", "kode barang", "item code", "model"]);
    const foundNameIdx = findHeaderIndex(row, ["description", "item name", "product", "nama produk"]);
    const foundPriceIdx = findHeaderIndex(row, priceAliases);
    if (foundSkuIdx >= 0 && foundNameIdx >= 0 && foundPriceIdx >= 0) {
      headerIdx = idx;
      skuIdx = foundSkuIdx;
      nameIdx = foundNameIdx;
      priceIdx = foundPriceIdx;
      break;
    }
  }

  if (headerIdx >= 0) {
    for (let rowIdx = headerIdx + 1; rowIdx < rows.length; rowIdx += 1) {
      const row = rows[rowIdx] ?? [];
      const sku = normalizeSku(row[skuIdx]);
      const productName = extractPrimaryDescription(row[nameIdx]);
      if (!sku || !productName) continue;

      const hasPrice = Boolean(parsePriceValue(row[priceIdx]));
      const prev = presence.get(sku) ?? { hasRow: false, hasPrice: false };
      presence.set(sku, { hasRow: true, hasPrice: prev.hasPrice || hasPrice });
    }
    return presence;
  }

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx] ?? [];
    const legacySkuRaw = row[0];
    const modelCodeRaw = row[1];
    const nameRaw = row[2];
    const priceRaw = row[3];
    const productName = String(nameRaw ?? "").trim();
    const sku = normalizeSku(modelCodeRaw) || normalizeSku(legacySkuRaw);
    if (!sku || !productName) continue;

    const hasPrice = Boolean(parsePriceValue(priceRaw));
    const prev = presence.get(sku) ?? { hasRow: false, hasPrice: false };
    presence.set(sku, { hasRow: true, hasPrice: prev.hasPrice || hasPrice });
  }

  return presence;
}

function extractBestRows(workbook: XLSX.WorkBook, priceSourceMode: PriceSourceMode) {
  const skuDescRows = extractSkuDescriptionFormatRowsWithPriceMode(workbook, priceSourceMode);
  if (skuDescRows.length >= 20) return skuDescRows;

  const bpRows = extractBpFormatRows(workbook);
  if (bpRows.length >= 20) return bpRows;

  const genericRows = extractPriceRowsFromWorkbook(workbook, { maxRows: 1000 });
  return genericRows.map((row) => ({
    ...row,
    sku: "",
    skuFamily: "",
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

function pickUnusedByFamily(
  bucket: CatalogRow[] | undefined,
  usedCatalogKeys: Set<string>
) {
  if (!bucket?.length) return null;
  for (const item of bucket) {
    const key = getCatalogRowKey(item);
    if (!usedCatalogKeys.has(key)) return item;
  }
  return null;
}

function looksLikeSkuToken(token: string) {
  const t = token.trim();
  if (!t) return false;
  if (t.length < 4) return false;
  if (!/[a-z]/i.test(t) || !/\d/.test(t)) return false;
  return /^[a-z0-9-]+$/i.test(t);
}

function extractRowsFromPdfText(text: string) {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows: CatalogRow[] = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length < 3) continue;

    const skuTokenIdx = tokens.findIndex((token) => looksLikeSkuToken(token));
    if (skuTokenIdx < 0) continue;

    let priceTokenIdx = -1;
    let priceValue: number | null = null;
    for (let tIdx = skuTokenIdx + 1; tIdx < tokens.length; tIdx += 1) {
      const parsed = parsePriceValue(tokens[tIdx]);
      if (parsed) {
        priceTokenIdx = tIdx;
        priceValue = parsed;
        break;
      }
    }
    if (priceTokenIdx < 0 || !priceValue) continue;

    const skuRaw = tokens[skuTokenIdx];
    const productName = tokens.slice(skuTokenIdx + 1, priceTokenIdx).join(" ").trim();
    if (!productName || productName.length < 3) continue;

    const sku = normalizeSku(skuRaw);
    const matchName = `${skuRaw} ${productName}`.trim();
    rows.push({
      rowNumber: idx + 1,
      productName,
      price: Math.round(priceValue),
      sku,
      skuFamily: normalizeSkuFamily(sku),
      normalizedName: toNormalizedName(matchName),
      matchName,
      sectionTitle: undefined
    });
  }
  return rows;
}

async function extractRowsFromFile(file: File, priceSourceMode: PriceSourceMode) {
  const kind = resolveFileKind(file);
  if (kind === "pdf") {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const text = String(parsed?.text ?? "");
    const rows = extractRowsFromPdfText(text);
    return rows;
  }
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  return extractBestRows(workbook, priceSourceMode);
}

async function extractPresenceMapFromFile(file: File, priceSourceMode: PriceSourceMode) {
  const kind = resolveFileKind(file);
  if (kind === "pdf") {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const text = String(parsed?.text ?? "");
    const rows = extractRowsFromPdfText(text);
    const map = new Map<string, SkuPresenceInfo>();
    for (const row of rows) {
      const sku = row.sku || "";
      if (!sku) continue;
      map.set(sku, { hasRow: true, hasPrice: Boolean(row.price) });
    }
    return map;
  }
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  return extractSkuPresenceMap(workbook, priceSourceMode);
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    const isJsonBody = contentType.toLowerCase().includes("application/json");
    const payload = isJsonBody ? await request.json() : null;

    const compareModeRaw = String((isJsonBody ? payload?.compare_mode : null) ?? "normal").toLowerCase();
    const compareMode = compareModeRaw === "strict" ? "strict" : "normal";
    const matchStrategyRaw = String((isJsonBody ? payload?.match_strategy : null) ?? "sku_fallback_name").toLowerCase();
    const matchStrategy = matchStrategyRaw === "sku_only" ? "sku_only" : "sku_fallback_name";
    const priceSourceRaw = String((isJsonBody ? payload?.price_source_mode : null) ?? "auto").toLowerCase();
    const priceSourceMode: PriceSourceMode =
      priceSourceRaw === "dealer" || priceSourceRaw === "online" || priceSourceRaw === "retail" || priceSourceRaw === "bottom"
        ? priceSourceRaw
        : "auto";
    const toleranceNominal = parsePositiveInt(String((isJsonBody ? payload?.tolerance_nominal : null) ?? "0"), 0);

    let todayRows: CatalogRow[] = [];
    let previousRows: CatalogRow[] = [];
    let previousSkuPresence = new Map<string, SkuPresenceInfo>();

    if (isJsonBody) {
      const todayInput = Array.isArray(payload?.today_rows) ? (payload.today_rows as ParsedInputRow[]) : [];
      const previousInput = Array.isArray(payload?.previous_rows) ? (payload.previous_rows as ParsedInputRow[]) : [];
      if (!todayInput.length || !previousInput.length) {
        throw new Error("Data hasil parse kosong. Pastikan file price list berisi data produk dan harga.");
      }
      const toCatalogRows = (inputRows: ParsedInputRow[]) =>
        inputRows
          .map((item, idx) => {
            const productName = String(item.productName || "").trim();
            const parsedPrice = parsePriceValue(item.price);
            if (!productName || !parsedPrice) return null;
            const sku = normalizeSku(item.sku);
            const skuFamily = normalizeSkuFamily(item.skuFamily || sku);
            const matchName = `${item.sku || ""} ${productName}`.trim();
            return {
              rowNumber: Number(item.rowNumber || idx + 1),
              productName,
              price: Math.round(parsedPrice),
              sku,
              skuFamily,
              normalizedName: toNormalizedName(matchName || productName),
              matchName: matchName || productName,
              sectionTitle: item.sectionTitle ? String(item.sectionTitle) : undefined
            } as CatalogRow;
          })
          .filter(Boolean) as CatalogRow[];
      todayRows = toCatalogRows(todayInput);
      previousRows = toCatalogRows(previousInput);

      const presencePayload = payload?.previous_sku_presence as Record<string, { hasRow?: boolean; hasPrice?: boolean }> | undefined;
      if (presencePayload && typeof presencePayload === "object") {
        for (const [rawSku, info] of Object.entries(presencePayload)) {
          const sku = normalizeSku(rawSku);
          if (!sku) continue;
          previousSkuPresence.set(sku, {
            hasRow: Boolean(info?.hasRow),
            hasPrice: Boolean(info?.hasPrice)
          });
        }
      }
      if (!previousSkuPresence.size) {
        for (const row of previousRows) {
          if (!row.sku) continue;
          previousSkuPresence.set(row.sku, { hasRow: true, hasPrice: row.price > 0 });
        }
      }
    } else {
      const form = await request.formData();
      const todayFile = ensureValidFile(form.get("today_file"), "price list hari ini");
      const previousFile = ensureValidFile(form.get("previous_file"), "price list sebelumnya");
      todayRows = await extractRowsFromFile(todayFile, priceSourceMode);
      previousRows = await extractRowsFromFile(previousFile, priceSourceMode);
      previousSkuPresence = await extractPresenceMapFromFile(previousFile, priceSourceMode);
    }

    const previousCatalog: CatalogRow[] = previousRows;
    const previousBySku = new Map<string, CatalogRow>();
    const previousBySkuFamily = new Map<string, CatalogRow[]>();
    const previousByNormalizedName = buildNameBuckets(previousCatalog);
    for (const item of previousCatalog) {
      if (!item.sku) continue;
      if (!previousBySku.has(item.sku)) previousBySku.set(item.sku, item);
      const family = item.skuFamily || normalizeSkuFamily(item.sku);
      if (family) {
        const bucket = previousBySkuFamily.get(family) ?? [];
        bucket.push(item);
        previousBySkuFamily.set(family, bucket);
      }
    }

    const similarityThreshold = compareMode === "strict" ? 0.55 : 0.35;
    const hasSkuCatalog = previousCatalog.some((item) => Boolean(item.sku));
    const usedCatalogKeys = new Set<string>();
    const rows = todayRows.map((row) => {
      const skuHit = row.sku ? previousBySku.get(row.sku) : null;
      const rowSkuFamily = row.skuFamily || normalizeSkuFamily(row.sku);
      const skuFamilyHit =
        !skuHit && rowSkuFamily ? pickUnusedByFamily(previousBySkuFamily.get(rowSkuFamily), usedCatalogKeys) : null;
      const exactNameHit = pickUnusedFromBucket(previousByNormalizedName.get(row.normalizedName), usedCatalogKeys);
      const previousSkuInfo = row.sku ? previousSkuPresence.get(row.sku) : undefined;

      if (matchStrategy === "sku_only") {
        if (!row.sku) {
          return {
            todayRowNumber: row.rowNumber,
            todaySku: "",
            todayProductName: row.productName,
            todaySectionTitle: row.sectionTitle || "",
            todayPrice: row.price,
            matched: false,
            similarityScore: 0,
            status: "unmatched" as const,
            unmatchedType: "produk_baru" as const,
            unmatchedReason: "Produk baru: SKU pada file hari ini kosong, sehingga tidak bisa dicocokkan di mode SKU only.",
            topCandidates: []
          };
        }
        if (!hasSkuCatalog) {
          return {
            todayRowNumber: row.rowNumber,
            todaySku: row.sku,
            todayProductName: row.productName,
            todaySectionTitle: row.sectionTitle || "",
            todayPrice: row.price,
            matched: false,
            similarityScore: 0,
            status: "unmatched" as const,
            unmatchedType: "produk_baru" as const,
            unmatchedReason: "Produk baru: SKU pada file sebelumnya tidak tersedia, sehingga mode SKU only tidak bisa dipakai.",
            topCandidates: []
          };
        }
        if (!skuHit && !skuFamilyHit) {
          const missingPriceReason = previousSkuInfo?.hasRow && !previousSkuInfo?.hasPrice;
          return {
            todayRowNumber: row.rowNumber,
            todaySku: row.sku,
            todayProductName: row.productName,
            todaySectionTitle: row.sectionTitle || "",
            todayPrice: row.price,
            matched: false,
            similarityScore: 0,
            status: "unmatched" as const,
            unmatchedType: missingPriceReason ? ("produk_kosong" as const) : ("produk_baru" as const),
            unmatchedReason: missingPriceReason
              ? "Produk kosong: SKU ada di file sebelumnya, tetapi harga sebelumnya kosong."
              : "Produk baru: SKU tidak ditemukan di file sebelumnya.",
            matchMethod: "sku_missing",
            topCandidates: []
          };
        }
      }

      if (matchStrategy !== "sku_only" && row.sku && !skuHit && previousSkuInfo?.hasRow && !previousSkuInfo?.hasPrice) {
        return {
          todayRowNumber: row.rowNumber,
          todaySku: row.sku || "",
          todayProductName: row.productName,
          todaySectionTitle: row.sectionTitle || "",
          todayPrice: row.price,
          matched: false,
          similarityScore: 0,
          status: "unmatched" as const,
          unmatchedType: "produk_kosong" as const,
          unmatchedReason: "Produk kosong: SKU ada di file sebelumnya, tetapi harga sebelumnya kosong.",
          matchMethod: "sku_missing_price",
          topCandidates: []
        };
      }

      if (matchStrategy !== "sku_only" && hasSkuCatalog && row.sku) {
        if (!skuHit && !skuFamilyHit) {
          return {
            todayRowNumber: row.rowNumber,
            todaySku: row.sku || "",
            todayProductName: row.productName,
            todaySectionTitle: row.sectionTitle || "",
            todayPrice: row.price,
            matched: false,
            similarityScore: 0,
            status: "unmatched" as const,
            unmatchedType: "produk_baru" as const,
            unmatchedReason: "Produk baru: SKU tidak ditemukan di file sebelumnya.",
            matchMethod: "sku_missing",
            topCandidates: []
          };
        }
        const lockedCandidate = skuHit ?? skuFamilyHit;
        const skuKey = lockedCandidate ? getCatalogRowKey(lockedCandidate) : "";
        if (usedCatalogKeys.has(skuKey)) {
          return {
            todayRowNumber: row.rowNumber,
            todaySku: row.sku || "",
            todayProductName: row.productName,
            todaySectionTitle: row.sectionTitle || "",
            todayPrice: row.price,
            matched: false,
            similarityScore: 0,
            status: "unmatched" as const,
            unmatchedType: "produk_baru" as const,
            unmatchedReason: "Produk baru: SKU duplikat di file hari ini dan SKU yang sama di file sebelumnya sudah terpakai.",
            matchMethod: "sku_duplicate_conflict",
            topCandidates: []
          };
        }
      }

      if (matchStrategy === "sku_only" && row.sku && hasSkuCatalog && !skuHit) {
        const topCandidates = getMatchCandidates(row.matchName || row.productName, previousCatalog)
          .slice(0, 3)
          .map((candidate) => ({
            productName: candidate.item.productName,
            price: candidate.item.price,
            similarityScore: Number(candidate.score.toFixed(3))
          }));
        return {
          todayRowNumber: row.rowNumber,
          todaySku: row.sku || "",
          todayProductName: row.productName,
          todaySectionTitle: row.sectionTitle || "",
          todayPrice: row.price,
          matched: false,
          similarityScore: 0,
          status: "unmatched" as const,
          unmatchedType: "produk_baru" as const,
          unmatchedReason: "Produk baru: tidak ada di price list sebelumnya.",
          matchMethod: "sku_missing",
          topCandidates
        };
      }
      const matched =
        skuHit && !usedCatalogKeys.has(getCatalogRowKey(skuHit))
          ? { best: skuHit, score: 1, method: "sku_exact" as const }
          : skuFamilyHit && !usedCatalogKeys.has(getCatalogRowKey(skuFamilyHit))
          ? { best: skuFamilyHit, score: 1, method: "sku_family_alias" as const }
          : matchStrategy === "sku_only"
          ? null
          : exactNameHit
          ? { best: exactNameHit, score: 1, method: "name_exact" as const }
          : (() => {
              const fallback = findBestAvailableMatch(row.matchName || row.productName, previousCatalog, usedCatalogKeys);
              return fallback ? { ...fallback, method: "name_fuzzy" as const } : null;
            })();
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
          todaySku: row.sku || "",
          todayProductName: row.productName,
          todaySectionTitle: row.sectionTitle || "",
          todayPrice: row.price,
          matched: false,
          similarityScore: Number((matched?.score ?? 0).toFixed(3)),
          status: "unmatched" as const,
          unmatchedType: "produk_baru" as const,
          unmatchedReason: `Produk baru: ${reason}.`,
          matchMethod: "name_unmatched",
          topCandidates
        };
      }

      const matchedKey = getCatalogRowKey(matched.best);
      usedCatalogKeys.add(matchedKey);
      const rawDifference = row.price - matched.best.price;
      const difference = Math.abs(rawDifference) <= toleranceNominal ? 0 : rawDifference;
      return {
        todayRowNumber: row.rowNumber,
        todaySku: row.sku || "",
        todayProductName: row.productName,
        todaySectionTitle: row.sectionTitle || "",
        todayPrice: row.price,
        matched: true,
        previousSku: matched.best.sku || "",
        previousProductName: matched.best.productName,
        previousSectionTitle: matched.best.sectionTitle || "",
          previousPrice: matched.best.price,
        difference: Math.round(difference),
        similarityScore: Number(matched.score.toFixed(3)),
        status: mapStatus(difference),
        matchMethod: matched.method,
        toleranceApplied: Math.abs(rawDifference) <= toleranceNominal,
        analysisNote: !row.sku
            ? "Analisa: SKU di pricelist hari ini kosong/hilang, matching dilakukan via nama produk."
            : row.sku === (matched.best.sku || "")
            ? "Analisa: matching berdasarkan SKU yang sama."
            : "Analisa: matching fallback nama karena kondisi khusus."
        };
      });

    const previousOnlyRows = previousCatalog
      .filter((item) => !usedCatalogKeys.has(getCatalogRowKey(item)))
      .map((item) => ({
        todayRowNumber: 0,
        todaySku: "",
        todayProductName: "",
        todaySectionTitle: "",
        todayPrice: 0,
        matched: false,
        previousSku: item.sku || "",
        previousProductName: item.productName,
        previousSectionTitle: item.sectionTitle || "",
        previousPrice: item.price,
        similarityScore: 0,
        status: "unmatched" as const,
        unmatchedType: "produk_kosong" as const,
        unmatchedReason: "Produk kosong: ada di price list sebelumnya, tetapi hilang di hari ini.",
        matchMethod: "missing_today",
        analysisNote: item.sku ? "Analisa: SKU ada di pricelist sebelumnya tetapi tidak muncul di pricelist hari ini." : "",
        topCandidates: [] as Array<{ productName: string; price: number; similarityScore: number }>
      }));

    const finalRows = [...rows, ...previousOnlyRows];

    const matchedRows = finalRows.filter((item) => item.matched);
    const todayCheaperCount = matchedRows.filter((item) => item.status === "today_cheaper").length;
    const previousCheaperCount = matchedRows.filter((item) => item.status === "previous_cheaper").length;
    const samePriceCount = matchedRows.filter((item) => item.status === "same").length;
    const matchedBySkuExact = matchedRows.filter((item) => item.matchMethod === "sku_exact").length;
    const matchedBySkuFamily = matchedRows.filter((item) => item.matchMethod === "sku_family_alias").length;
    const matchedByNameExact = matchedRows.filter((item) => item.matchMethod === "name_exact").length;
    const matchedByNameFuzzy = matchedRows.filter((item) => item.matchMethod === "name_fuzzy").length;
    const missingSkuTodayCount = finalRows.filter((item) => item.matchMethod === "missing_today").length;
    const missingSkuPreviousCount = finalRows.filter((item) => item.matchMethod === "sku_missing").length;
    const missingPricePreviousCount = finalRows.filter((item) => item.matchMethod === "sku_missing_price").length;
    const duplicateSkuConflictCount = finalRows.filter((item) => item.matchMethod === "sku_duplicate_conflict").length;

    return NextResponse.json({
      ok: true,
      data: {
        rows: finalRows,
        summary: {
          totalRows: finalRows.length,
          matchedRows: matchedRows.length,
          todayCheaperCount,
          previousCheaperCount,
          samePriceCount,
          matchedBySkuExact,
          matchedBySkuFamily,
          matchedByNameExact,
          matchedByNameFuzzy,
          missingSkuTodayCount,
          missingSkuPreviousCount,
          missingPricePreviousCount,
          duplicateSkuConflictCount
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan saat memproses file.";
    const status = message.includes("wajib diisi") || message.includes("terlalu besar") ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
