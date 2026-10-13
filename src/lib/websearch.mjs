import { SOURCE } from "./config.mjs";
const SEARCH_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0"
];
export const DENYLIST_HOSTS = [
  "imdb.com",
  "facebook.com",
  "instagram.com",
  "google.com",
  "google.fr",
  "tripadvisor",
  "linkedin.com",
  "wikipedia.org",
  "yelp.",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "amazon.",
  "leboncoin.fr",
  "orange.fr",
  "bing.com",
  "duckduckgo.com",
  ...(SOURCE.exclus || [])
];
export function randomSearchUA() {
  return SEARCH_UAS[Math.floor(Math.random() * SEARCH_UAS.length)];
}
export function searchHeaders() {
  return {
    "User-Agent": randomSearchUA(),
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.5",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  };
}
export function extractHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (err) {
    return "";
  }
}
export function isDenylisted(url) {
  const host = extractHost(url).toLowerCase();
  if (!host) return true;
  return DENYLIST_HOSTS.some((bad) => host.includes(bad));
}
async function ddgLiteSearch(query) {
  const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
    headers: searchHeaders()
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return [...html.matchAll(/class="result-link"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
}
async function ddgHtmlSearch(query) {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: searchHeaders()
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return [...html.matchAll(/class="result__a"[^>]*href="([^"]+)"/g)].map(
    (m) => decodeURIComponent(m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0])
  );
}
async function bingSearch(query) {
  const res = await fetch(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=fr&cc=FR`,
    { headers: searchHeaders() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return [...html.matchAll(/<li class="b_algo"[\s\S]*?<a[^>]+href="([^"]+)"/g)].map((m) => m[1]);
}
export function resoudreRedirection(url) {
  if (!/bing\.com\/ck\/a/i.test(url)) return url;
  try {
    const brut = new URL(url.replace(/&amp;/g, "&")).searchParams.get("u");
    if (!brut) return url;
    const b64 = brut.slice(2).replace(/-/g, "+").replace(/_/g, "/");
    const decode = Buffer.from(b64 + "=".repeat((4 - b64.length % 4) % 4), "base64").toString("utf8");
    return /^https?:\/\//i.test(decode) ? decode : url;
  } catch (e) {
    return url;
  }
}
export async function webSearch(query) {
  const engines = [
    ["ddg-lite", ddgLiteSearch],
    ["bing", bingSearch],
    ["ddg-html", ddgHtmlSearch]
  ];
  let lastErr;
  for (const [name, fn] of engines) {
    try {
      const urls = (await fn(query)).map(resoudreRedirection);
      if (urls.length) return urls;
      lastErr = new Error(`${name}: 0 resultat`);
    } catch (err) {
      lastErr = new Error(`${name}: ${err.message}`);
    }
  }
  throw lastErr;
}
