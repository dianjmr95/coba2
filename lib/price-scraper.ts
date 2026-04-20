import axios from "axios";
import * as cheerio from "cheerio";

export type MarketplaceType = "tokopedia" | "shopee" | "other";

export type ScrapeResult = {
  marketplace: MarketplaceType;
  productName: string;
  storeName: string;
  price: number;
  finalUrl: string;
};

export type ScrapeRequestOptions = {
  userAgent?: string;
};

const REQUEST_TIMEOUT_MS = 20000;

const COMMON_PRICE_SELECTORS = [
  "[itemprop='price']",
  "meta[property='product:price:amount']",
  "meta[property='og:price:amount']",
  "meta[name='twitter:data1']",
  ".price",
  ".product-price",
  "[data-price]"
];

const MARKETPLACE_PRICE_SELECTORS: Record<MarketplaceType, string[]> = {
  tokopedia: [
    "[data-testid='lblPDPDetailProductPrice']",
    "[data-testid='lblPDPDetailProductPrice'] span",
    ".price",
    ...COMMON_PRICE_SELECTORS
  ],
  shopee: [
    ".IZPeQz",
    ".pmmxKx",
    "[class*='product-price']",
    ".price",
    ...COMMON_PRICE_SELECTORS
  ],
  other: COMMON_PRICE_SELECTORS
};

const MARKETPLACE_STORE_SELECTORS: Record<MarketplaceType, string[]> = {
  tokopedia: [
    "[data-testid='llbPDPFooterShopName']",
    "[data-testid='pdp_shop_section_name']",
    "[data-testid='llbPDPFooterShopName'] a"
  ],
  shopee: [".yQmmFK", ".GrcWn0", "[class*='shop-name']"],
  other: [".store-name", ".shop-name", "[itemprop='seller']"]
};

const MARKETPLACE_NAME_LABEL: Record<MarketplaceType, string> = {
  tokopedia: "Tokopedia",
  shopee: "Shopee",
  other: "Toko Lain"
};

const BLOCKED_MARKERS = [
  "captcha",
  "access denied",
  "forbidden",
  "bot verification",
  "please verify"
];

const BLOCKED_ERROR_MARKERS = ["diblokir", "anti-bot", "captcha", "forbidden", "access denied"];

function getHostname(urlString: string) {
  return new URL(urlString).hostname.toLowerCase();
}

export function detectMarketplace(urlString: string): MarketplaceType {
  const hostname = getHostname(urlString);
  if (hostname.includes("tokopedia")) return "tokopedia";
  if (hostname.includes("shopee")) return "shopee";
  return "other";
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parsePriceToNumber(rawValue: string): number | null {
  const value = normalizeWhitespace(rawValue);
  if (!value) return null;

  const numeric = value.replace(/[^0-9,.-]/g, "");
  if (!numeric) return null;

  const hasDot = numeric.includes(".");
  const hasComma = numeric.includes(",");

  if (hasDot && hasComma) {
    const lastDot = numeric.lastIndexOf(".");
    const lastComma = numeric.lastIndexOf(",");
    const decimalSep = lastDot > lastComma ? "." : ",";
    const normalized = numeric
      .replace(decimalSep === "." ? /,/g : /\./g, "")
      .replace(decimalSep, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  if (hasComma) {
    const decimalLikely = /,\d{1,2}$/.test(numeric);
    const normalized = decimalLikely ? numeric.replace(",", ".") : numeric.replace(/,/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  if (hasDot) {
    const decimalLikely = /\.\d{1,2}$/.test(numeric);
    const normalized = decimalLikely ? numeric : numeric.replace(/\./g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function findPriceFromSelectors($: cheerio.CheerioAPI, selectors: string[]): number | null {
  for (const selector of selectors) {
    const element = $(selector).first();
    if (!element.length) continue;

    const content = element.attr("content");
    const candidate = content ? content : element.text();
    const parsed = parsePriceToNumber(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseJsonLdPrice($: cheerio.CheerioAPI): number | null {
  const scripts = $("script[type='application/ld+json']");
  for (let i = 0; i < scripts.length; i += 1) {
    try {
      const raw = $(scripts[i]).contents().text();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const offers = (node as Record<string, unknown>)?.offers as Record<string, unknown> | undefined;
        const priceRaw = offers?.price ?? (node as Record<string, unknown>)?.price;
        if (priceRaw === undefined || priceRaw === null) continue;
        const price = parsePriceToNumber(String(priceRaw));
        if (price !== null) return price;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function findTextBySelectors($: cheerio.CheerioAPI, selectors: string[]): string | null {
  for (const selector of selectors) {
    const text = normalizeWhitespace($(selector).first().text());
    if (text) return text;
  }
  return null;
}

function deriveProductName($: cheerio.CheerioAPI) {
  return (
    normalizeWhitespace($("meta[property='og:title']").attr("content") || "") ||
    normalizeWhitespace($("h1").first().text()) ||
    normalizeWhitespace($("title").text()) ||
    "Produk"
  );
}

function deriveStoreName($: cheerio.CheerioAPI, marketplace: MarketplaceType, hostname: string) {
  return (
    findTextBySelectors($, MARKETPLACE_STORE_SELECTORS[marketplace]) ||
    normalizeWhitespace($("meta[property='og:site_name']").attr("content") || "") ||
    hostname ||
    MARKETPLACE_NAME_LABEL[marketplace]
  );
}

function assertNotBlocked(responseStatus: number, html: string) {
  if (responseStatus === 403 || responseStatus === 429) {
    throw new Error(`Permintaan diblokir oleh website target (HTTP ${responseStatus}).`);
  }
  const lowered = html.toLowerCase();
  if (BLOCKED_MARKERS.some((marker) => lowered.includes(marker))) {
    throw new Error("Halaman terdeteksi menggunakan proteksi anti-bot/captcha.");
  }
}

export function isBlockedScrapeError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return BLOCKED_ERROR_MARKERS.some((marker) => message.includes(marker));
}

function extractScrapeResultFromHtml(input: {
  html: string;
  sourceUrl: string;
  fallbackUrl?: string;
}) {
  const marketplace = detectMarketplace(input.sourceUrl);
  const $ = cheerio.load(input.html);
  const hostname = getHostname(input.fallbackUrl || input.sourceUrl);

  const priceFromSelectors = findPriceFromSelectors($, MARKETPLACE_PRICE_SELECTORS[marketplace]);
  const priceFromJsonLd = parseJsonLdPrice($);
  const price = priceFromSelectors ?? priceFromJsonLd;

  if (price === null) {
    throw new Error(
      "Harga tidak ditemukan. Kemungkinan selector HTML berubah atau harga dirender lewat JavaScript dinamis."
    );
  }

  return {
    marketplace,
    productName: deriveProductName($),
    storeName: deriveStoreName($, marketplace, hostname),
    price,
    finalUrl: input.fallbackUrl || input.sourceUrl
  } satisfies ScrapeResult;
}

export async function scrapePriceFromUrl(url: string): Promise<ScrapeResult> {
  return scrapePriceFromUrlWithOptions(url, {});
}

export async function scrapePriceFromUrlWithOptions(
  url: string,
  options: ScrapeRequestOptions
): Promise<ScrapeResult> {
  const response = await axios.get<string>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
    responseType: "text",
    headers: {
      "User-Agent":
        options.userAgent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: "https://www.google.com/"
    },
    validateStatus: () => true
  });

  const html = String(response.data ?? "");
  assertNotBlocked(response.status, html);

  if (!html || html.length < 100) {
    throw new Error("Konten halaman kosong atau tidak valid.");
  }

  return extractScrapeResultFromHtml({
    html,
    sourceUrl: response.request?.res?.responseUrl || url,
    fallbackUrl: url
  });
}

export function scrapePriceFromHtml(html: string, sourceUrl: string, fallbackUrl?: string): ScrapeResult {
  if (!html || html.length < 100) {
    throw new Error("Konten halaman kosong atau tidak valid.");
  }
  assertNotBlocked(200, html);
  return extractScrapeResultFromHtml({ html, sourceUrl, fallbackUrl });
}
