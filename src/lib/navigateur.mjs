let navigateur = null;
async function ouvrir() {
  if (navigateur) return navigateur;
  const { chromium } = await import("playwright");
  navigateur = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  return navigateur;
}
export async function fermerNavigateur() {
  if (!navigateur) return;
  const ouvert = navigateur;
  navigateur = null;
  const delai = new Promise((suite) => setTimeout(suite, 5e3).unref());
  await Promise.race([ouvert.close().catch(() => {
  }), delai]);
}
export async function lirePageRendue(url, options) {
  const attente = options && options.attenteMs || 2500;
  let contexte;
  try {
    const nav = await ouvrir();
    contexte = await nav.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      locale: "fr-FR",
      viewport: { width: 1280, height: 900 }
    });
    const page = await contexte.newPage();
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "font" || type === "media") return route.abort();
      return route.continue();
    });
    const reponse = await page.goto(url, { timeout: 25e3, waitUntil: "domcontentloaded" });
    if (!reponse) return null;
    await page.waitForTimeout(attente);
    const html = await page.content();
    return { body: html, url: page.url(), status: reponse.status() };
  } catch (err) {
    return null;
  } finally {
    if (contexte) await contexte.close().catch(() => {
    });
  }
}
