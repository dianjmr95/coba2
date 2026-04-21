import * as XLSX from "xlsx";

export type ParsedPriceRow = {
  rowNumber: number;
  productName: string;
  price: number;
};

const PRODUCT_HEADER_ALIASES = ["nama produk", "nama barang", "produk", "barang", "product", "item name"];
const PRICE_HEADER_ALIASES = ["harga", "price", "harga jual", "selling price", "net price", "unit price"];

type ExtractOptions = {
  sheetName?: string;
  headerRow?: number;
  productColumn?: string;
  priceColumn?: string;
  maxRows?: number;
};

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHeaderMatch(value: string, aliases: string[]) {
  const normalized = normalizeText(value);
  return aliases.some((alias) => normalized === alias || normalized.includes(alias));
}

function toCellText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function parsePriceValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const clean = raw
    .replace(/rp/gi, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function resolveSheetName(workbook: XLSX.WorkBook, preferredName?: string) {
  if (preferredName && workbook.Sheets[preferredName]) return preferredName;
  return workbook.SheetNames[0];
}

function resolveHeaderRow(rows: unknown[][], forcedHeaderRow?: number) {
  if (typeof forcedHeaderRow === "number" && forcedHeaderRow > 0) {
    return Math.max(0, forcedHeaderRow - 1);
  }

  const maxScan = Math.min(15, rows.length);
  for (let idx = 0; idx < maxScan; idx += 1) {
    const row = rows[idx] ?? [];
    const hasProduct = row.some((cell) => isHeaderMatch(toCellText(cell), PRODUCT_HEADER_ALIASES));
    const hasPrice = row.some((cell) => isHeaderMatch(toCellText(cell), PRICE_HEADER_ALIASES));
    if (hasProduct && hasPrice) return idx;
  }

  return 0;
}

function findColumnIndex(
  headerRow: unknown[],
  aliases: string[],
  explicitColumn?: string
) {
  const headerCells = headerRow.map((cell) => toCellText(cell));

  if (explicitColumn) {
    const explicit = normalizeText(explicitColumn);
    const exactIndex = headerCells.findIndex((cell) => normalizeText(cell) === explicit);
    if (exactIndex >= 0) return exactIndex;
  }

  const aliasIndex = headerCells.findIndex((cell) => isHeaderMatch(cell, aliases));
  return aliasIndex;
}

export function extractPriceRowsFromWorkbook(workbook: XLSX.WorkBook, options: ExtractOptions = {}) {
  const sheetName = resolveSheetName(workbook, options.sheetName);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Sheet tidak ditemukan pada file.");
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
  if (!rows.length) {
    return [] as ParsedPriceRow[];
  }

  const headerIdx = resolveHeaderRow(rows, options.headerRow);
  const header = rows[headerIdx] ?? [];

  let productColIdx = findColumnIndex(header, PRODUCT_HEADER_ALIASES, options.productColumn);
  let priceColIdx = findColumnIndex(header, PRICE_HEADER_ALIASES, options.priceColumn);

  if (productColIdx < 0) productColIdx = 0;
  if (priceColIdx < 0) priceColIdx = productColIdx === 0 ? 1 : 0;

  const results: ParsedPriceRow[] = [];
  const maxRows = Math.max(1, options.maxRows ?? 500);

  for (let rowIdx = headerIdx + 1; rowIdx < rows.length; rowIdx += 1) {
    const row = rows[rowIdx] ?? [];
    const productName = toCellText(row[productColIdx]);
    if (!productName) continue;

    const priceValue = parsePriceValue(row[priceColIdx]);
    if (!priceValue) continue;

    results.push({
      rowNumber: rowIdx + 1,
      productName,
      price: Math.round(priceValue)
    });

    if (results.length >= maxRows) break;
  }

  return results;
}

function wordSet(input: string) {
  const normalized = normalizeText(input);
  const words = normalized.split(" ").filter((word) => word.length > 1);
  return new Set(words);
}

function jaccardScore(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let intersect = 0;
  for (const item of a) {
    if (b.has(item)) intersect += 1;
  }
  const union = a.size + b.size - intersect;
  return union > 0 ? intersect / union : 0;
}

function bigrams(input: string) {
  const n = normalizeText(input).replace(/\s+/g, "");
  if (!n) return [] as string[];
  if (n.length === 1) return [n];
  const out: string[] = [];
  for (let i = 0; i < n.length - 1; i += 1) {
    out.push(n.slice(i, i + 2));
  }
  return out;
}

function diceScore(a: string, b: string) {
  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);
  if (!aBigrams.length || !bBigrams.length) return 0;
  const counts = new Map<string, number>();
  for (const gram of aBigrams) {
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let overlap = 0;
  for (const gram of bBigrams) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      overlap += 1;
      counts.set(gram, remaining - 1);
    }
  }
  return (2 * overlap) / (aBigrams.length + bBigrams.length);
}

export function scoreNameSimilarity(inputName: string, targetName: string) {
  const inputNorm = normalizeText(inputName);
  const targetNorm = normalizeText(targetName);
  if (!inputNorm || !targetNorm) return 0;
  if (inputNorm === targetNorm) return 1;

  const wordScore = jaccardScore(wordSet(inputNorm), wordSet(targetNorm));
  const charScore = diceScore(inputNorm, targetNorm);
  const containsBoost = inputNorm.includes(targetNorm) || targetNorm.includes(inputNorm) ? 0.1 : 0;

  return Math.min(1, wordScore * 0.55 + charScore * 0.45 + containsBoost);
}

export function toNormalizedName(input: string) {
  return normalizeText(input);
}
