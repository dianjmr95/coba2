import { scrapePriceFromHtml, type ScrapeResult } from "./price-scraper";

const PLAYWRIGHT_TIMEOUT_MS = 30000;

export async function scrapePriceWithPlaywright(
  url: string,
  options?: { userAgent?: string }
): Promise<ScrapeResult> {
  let browser: any = null;

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-http2",
        "--disable-features=NetworkServiceInProcess,UseDNSHttpsSvcb"
      ]
    });

    const context = await browser.newContext({
      userAgent:
        options?.userAgent ||
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "id-ID"
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PLAYWRIGHT_TIMEOUT_MS });
    await page.waitForTimeout(2500);

    const html = await page.content();
    const finalUrl = page.url();
    await context.close();

    return scrapePriceFromHtml(html, finalUrl, url);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error || "");
    if (message.toLowerCase().includes("executable doesn't exist")) {
      throw new Error(
        "Playwright belum memiliki browser Chromium. Jalankan: npx playwright install chromium"
      );
    }
    throw new Error(`Fallback browser gagal: ${message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
