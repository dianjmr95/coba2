import { NextRequest, NextResponse } from "next/server";
import {
  isBlockedScrapeError,
  scrapePriceFromHtml,
  scrapePriceFromUrlWithOptions
} from "../../../lib/price-scraper";
import { scrapePriceWithPlaywright } from "../../../lib/price-scraper-playwright";
import { fetchHtmlViaProxy } from "../../../lib/price-scraper-proxy";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
const ENABLE_PRICE_SCRAPE = String(process.env.ENABLE_PRICE_SCRAPE || "").toLowerCase() === "true";

type PriceScrapeRequest = {
  url?: string;
  product_id?: string;
};

const SCRAPE_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_7_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
] as const;

function normalizeProductUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  parsed.hash = "";
  const host = parsed.hostname.toLowerCase();
  const isTokopediaHost = host.includes("tokopedia.com");

  const cleanParams = new URLSearchParams();
  if (!isTokopediaHost) {
    parsed.searchParams.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || lower === "fbclid" || lower === "gclid") return;
      cleanParams.append(key, value);
    });
    parsed.search = cleanParams.toString();
  } else {
    // Tokopedia URL often includes tracking query params that increase block risk.
    parsed.search = "";
  }
  return parsed.toString();
}

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `produk-${Math.random().toString(36).slice(2, 8)}`;
}

async function findOrCreateProductId(input: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  productId?: string;
  targetUrl: string;
  productName: string;
}) {
  if (input.productId) return input.productId;

  const { data: existingProduct, error: fetchError } = await input.supabaseAdmin
    .from("products")
    .select("id")
    .eq("target_url", input.targetUrl)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Gagal cek data produk: ${fetchError.message}`);
  }

  if (existingProduct?.id) return existingProduct.id;

  const baseSlug = slugify(input.productName);
  for (let i = 0; i < 4; i += 1) {
    const candidateSlug = i === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: inserted, error: insertError } = await input.supabaseAdmin
      .from("products")
      .insert({
        name: input.productName,
        slug: candidateSlug,
        target_url: input.targetUrl
      })
      .select("id")
      .single();

    if (!insertError && inserted?.id) return inserted.id;

    if (insertError && insertError.code !== "23505") {
      throw new Error(`Gagal membuat produk baru: ${insertError.message}`);
    }
  }

  throw new Error("Gagal membuat data produk karena slug bentrok berulang.");
}

function mapScrapeErrorToResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const lowered = message.toLowerCase();

  if (lowered.includes("diblokir") || lowered.includes("anti-bot") || lowered.includes("captcha")) {
    return { status: 503, message };
  }
  if (lowered.includes("selector") || lowered.includes("harga tidak ditemukan")) {
    return { status: 422, message };
  }
  if (lowered.includes("invalid url") || lowered.includes("url")) {
    return { status: 400, message };
  }

  return { status: 500, message };
}

function shouldUseBrowserFallback(error: unknown) {
  if (isBlockedScrapeError(error)) return true;
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    message.includes("harga tidak ditemukan") ||
    message.includes("selector") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("econn") ||
    message.includes("socket")
  );
}

function buildUrlVariants(urlString: string) {
  const variants = new Set<string>();
  variants.add(urlString);

  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    const isTokopediaHost = host === "tokopedia.com" || host === "www.tokopedia.com";

    if (isTokopediaHost) {
      const noQuery = new URL(parsed.toString());
      noQuery.search = "";
      variants.add(noQuery.toString());

      const mobile = new URL(noQuery.toString());
      mobile.hostname = "m.tokopedia.com";
      variants.add(mobile.toString());

      const mobileNoWww = new URL(noQuery.toString());
      mobileNoWww.hostname = "m.tokopedia.com";
      mobileNoWww.pathname = mobileNoWww.pathname.replace(/\/+$/, "");
      variants.add(mobileNoWww.toString());
    }
  } catch {
    // keep original only
  }

  return Array.from(variants);
}

function sanitizeErrorMessage(raw: string) {
  return raw
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function scrapeWithRetry(url: string) {
  const attemptErrors: string[] = [];
  const variants = buildUrlVariants(url);

  for (const candidateUrl of variants) {
    for (const userAgent of SCRAPE_USER_AGENTS) {
      try {
        const scrape = await scrapePriceFromUrlWithOptions(candidateUrl, { userAgent });
        return { scrape, scrapeMethod: "http" as const };
      } catch (httpError) {
        const httpMessage = sanitizeErrorMessage(
          String(httpError instanceof Error ? httpError.message : httpError || "")
        );
        attemptErrors.push(`[HTTP] ${candidateUrl} -> ${httpMessage}`);

        if (!shouldUseBrowserFallback(httpError)) {
          continue;
        }

        try {
          const scrape = await scrapePriceWithPlaywright(candidateUrl, { userAgent });
          return { scrape, scrapeMethod: "playwright" as const };
        } catch (browserError) {
          const browserMessage = sanitizeErrorMessage(
            String(browserError instanceof Error ? browserError.message : browserError || "")
          );
          attemptErrors.push(`[Browser] ${candidateUrl} -> ${browserMessage}`);

          try {
            const proxyResult = await fetchHtmlViaProxy(candidateUrl, userAgent);
            if (proxyResult?.html) {
              const scrape = scrapePriceFromHtml(
                proxyResult.html,
                proxyResult.finalUrl || candidateUrl,
                candidateUrl
              );
              return { scrape, scrapeMethod: "proxy" as const };
            }
          } catch (proxyError) {
            const proxyMessage = sanitizeErrorMessage(
              String(proxyError instanceof Error ? proxyError.message : proxyError || "")
            );
            attemptErrors.push(`[Proxy] ${candidateUrl} -> ${proxyMessage}`);
          }
        }
      }
    }
  }

  const uniqueErrors = Array.from(new Set(attemptErrors));
  const compact = uniqueErrors.slice(0, 2).join(" | ");
  const proxyHint =
    !process.env.SCRAPERAPI_KEY && !process.env.ZENROWS_API_KEY
      ? " Tambahkan SCRAPERAPI_KEY atau ZENROWS_API_KEY untuk fallback anti-bot."
      : "";
  throw new Error(
    `Semua percobaan scraping gagal. ${compact || "Tidak ada detail error."}${proxyHint} Silakan isi harga manual sementara.`
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!ENABLE_PRICE_SCRAPE) {
      return NextResponse.json(
        {
          ok: false,
          error: "Fitur scraping harga sedang dinonaktifkan."
        },
        { status: 404 }
      );
    }

    const body = (await request.json()) as PriceScrapeRequest;
    const rawUrl = String(body?.url ?? "").trim();

    if (!rawUrl) {
      return NextResponse.json(
        { ok: false, error: "Field `url` wajib diisi." },
        { status: 400 }
      );
    }

    const normalizedUrl = normalizeProductUrl(rawUrl);
    const { scrape, scrapeMethod } = await scrapeWithRetry(normalizedUrl);

    if (!scrape || !Number.isFinite(scrape.price) || scrape.price <= 0) {
      throw new Error("Harga tidak valid dari hasil scraping.");
    }

    const supabaseAdmin = getSupabaseAdmin();
    const productId = await findOrCreateProductId({
      supabaseAdmin,
      productId: body.product_id,
      targetUrl: normalizedUrl,
      productName: scrape.productName
    });

    const { data: insertedLog, error: insertError } = await supabaseAdmin
      .from("price_logs")
      .insert({
        product_id: productId,
        price: scrape.price,
        store_name: scrape.storeName,
        fetched_at: new Date().toISOString()
      })
      .select("id, product_id, price, store_name, fetched_at")
      .single();

    if (insertError) {
      throw new Error(`Gagal menyimpan price log: ${insertError.message}`);
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...insertedLog,
        marketplace: scrape.marketplace,
        product_name: scrape.productName,
        target_url: scrape.finalUrl,
        scraped_via: scrapeMethod
      }
    });
  } catch (error) {
    const mapped = mapScrapeErrorToResponse(error);
    return NextResponse.json({ ok: false, error: mapped.message }, { status: mapped.status });
  }
}
