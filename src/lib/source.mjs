import { SOURCE, adresse, motif } from "./config.mjs";
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
function liensDe(html) {
  return Array.from(html.matchAll(/<a\b[^>]*>/g), (m) => ({
    href: (m[0].match(/href="([^"]*)"/) || [])[1] || "",
    title: (m[0].match(/title="([^"]*)"/) || [])[1] || "",
    classe: (m[0].match(/class="([^"]*)"/) || [])[1] || ""
  }));
}
function decodeEntites(s) {
  return s.replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
async function lirePage(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}
async function departements() {
  const html = await lirePage(adresse("seances"));
  const param = new RegExp(`${SOURCE.paramDepartement}=(\\d+)`);
  const trouves = new Set();
  for (const a of liensDe(html)) {
    const m = a.href.match(param);
    if (m && !/disabled/.test(a.classe)) trouves.add(m[1]);
  }
  return [...trouves];
}
async function villesDuDepartement(code) {
  const html = await lirePage(adresse("departement", { code }));
  const fin = new RegExp(motif("ville").source + "$");
  const villes = [];
  for (const a of liensDe(html)) {
    const m = a.href.match(fin);
    if (m) villes.push({ id: parseInt(m[1], 10), label: decodeEntites(a.title) });
  }
  return villes;
}
async function villesDeLaFiche() {
  const html = await lirePage(adresse("fiche"));
  const re = new RegExp(`href="${motif("ville").source}" title="([^"]+)"`, "g");
  const found = new Map();
  let m;
  while (m = re.exec(html)) found.set(parseInt(m[1], 10), decodeEntites(m[2]));
  return Array.from(found, ([id, label]) => ({ id, label }));
}
export async function decouvrirVilles() {
  const villes = new Map();
  let codes = [];
  try {
    codes = await departements();
  } catch (err) {
    console.warn("departements illisibles:", err.message);
  }
  for (const code of codes) {
    try {
      for (const ville of await villesDuDepartement(code)) {
        if (!villes.has(ville.id)) villes.set(ville.id, ville);
      }
    } catch (err) {
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  try {
    for (const ville of await villesDeLaFiche()) {
      if (!villes.has(ville.id)) villes.set(ville.id, ville);
    }
  } catch (err) {
  }
  return Array.from(villes.values());
}
export async function seancesDeLaVille(page, ville) {
  await page.goto(adresse("ville", { ville: ville.id }), { timeout: 3e4, waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  const sel = SOURCE.selecteurs;
  const dates = await page.evaluate((attr) => {
    const el = document.querySelector(`[${attr}]`);
    if (!el) return [];
    try {
      return JSON.parse(el.getAttribute(attr));
    } catch (e) {
      return [];
    }
  }, sel.dates);
  const empreinte = () => page.evaluate(({ carte, horaire }) => Array.from(document.querySelectorAll(carte)).map((card) => Array.from(card.querySelectorAll(horaire)).map((el) => el.textContent.trim()).join(",")).join("|"), { carte: sel.carte, horaire: sel.horaire });
  const rows = [];
  for (const iso of dates) {
    const avant = await empreinte();
    const day = parseInt(iso.slice(8, 10), 10);
    const clicked = await page.evaluate(
      ({ day: day2, jour }) => {
        const target = Array.from(document.querySelectorAll(jour)).find((el) => {
          const m = el.textContent.match(/(\d+)/);
          return m && parseInt(m[1], 10) === day2;
        });
        if (!target || target.classList.contains("disabled")) return false;
        target.click();
        return true;
      },
      { day, jour: sel.jour }
    );
    if (!clicked) continue;
    let courante = avant;
    for (let t = 0; t < 4e3 && courante === avant; t += 250) {
      await page.waitForTimeout(250);
      courante = await empreinte();
    }
    for (let t = 0; t < 4e3; t += 400) {
      await page.waitForTimeout(400);
      const suivante = await empreinte();
      if (suivante === courante) break;
      courante = suivante;
    }
    const cartes = await page.evaluate(({ sel: sel2, param, motifCode }) => {
      const code = new RegExp(`${param}=(${motifCode})`);
      return Array.from(document.querySelectorAll(sel2.carte)).map((card) => {
        const name = (card.querySelector(sel2.nom) || {}).textContent || null;
        const address = (card.querySelector(sel2.adresse) || {}).textContent || null;
        const linkEl = card.querySelector(`a[href*="${param}"]`);
        const rawHref = linkEl ? linkEl.getAttribute("href") : null;
        return {
          name: name && name.trim(),
          address: address && address.trim(),
          code: rawHref ? (rawHref.match(code) || [])[1] : null,
          href: rawHref ? new URL(rawHref, location.origin).href : null,
          hours: Array.from(card.querySelectorAll(sel2.horaire)).map((el) => el.textContent.trim())
        };
      });
    }, { sel, param: SOURCE.paramSalle, motifCode: SOURCE.codeSalle });
    for (const carte of cartes) {
      if (!carte.code || !carte.hours || !carte.hours.length) continue;
      rows.push({ date: iso, ...carte });
    }
  }
  return rows;
}
