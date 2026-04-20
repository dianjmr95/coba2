import axios from "axios";

type ProxyHtmlResult = {
  html: string;
  finalUrl: string;
  provider: "scraperapi" | "zenrows";
};

function normalizeHtmlResponse(data: unknown) {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "html" in (data as Record<string, unknown>)) {
    const html = (data as Record<string, unknown>).html;
    if (typeof html === "string") return html;
  }
  return "";
}

export async function fetchHtmlViaProxy(
  targetUrl: string,
  userAgent?: string
): Promise<ProxyHtmlResult | null> {
  const scraperApiKey = String(process.env.SCRAPERAPI_KEY || "").trim();
  const zenRowsKey = String(process.env.ZENROWS_API_KEY || "").trim();

  if (!scraperApiKey && !zenRowsKey) return null;

  if (scraperApiKey) {
    const response = await axios.get("http://api.scraperapi.com", {
      timeout: 35000,
      responseType: "text",
      params: {
        api_key: scraperApiKey,
        url: targetUrl,
        keep_headers: "true",
        country_code: "id",
        render: "false"
      },
      headers: userAgent ? { "User-Agent": userAgent } : undefined,
      validateStatus: () => true
    });

    const html = normalizeHtmlResponse(response.data);
    if (response.status >= 200 && response.status < 300 && html) {
      return { html, finalUrl: targetUrl, provider: "scraperapi" };
    }
  }

  if (zenRowsKey) {
    const response = await axios.get("https://api.zenrows.com/v1/", {
      timeout: 35000,
      responseType: "text",
      params: {
        apikey: zenRowsKey,
        url: targetUrl,
        js_render: "false",
        premium_proxy: "true"
      },
      headers: userAgent ? { "User-Agent": userAgent } : undefined,
      validateStatus: () => true
    });

    const html = normalizeHtmlResponse(response.data);
    if (response.status >= 200 && response.status < 300 && html) {
      return { html, finalUrl: targetUrl, provider: "zenrows" };
    }
  }

  return null;
}
