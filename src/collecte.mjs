#!/usr/bin/env node
import { chromium } from "playwright";
import { normalize } from "./lib/normalize.mjs";
import { TABLES, API, CLE } from "./lib/config.mjs";
import { UA, decouvrirVilles, seancesDeLaVille } from "./lib/source.mjs";
import { regionDepuisAdresse } from "./lib/regions.mjs";
import { villeDepuisAdresse, casseDeVille, nomDeSalle } from "./lib/noms.mjs";
const VILLES_SECOURS = TABLES.villes || [];
const REGIONS = TABLES.regions || {};
const LIENS = TABLES.liens || {};
const SEC = process.argv.includes("--sec");
async function precedentes() {
  try {
    const res = await fetch(`${API}/seances.json?brut`, { headers: { Authorization: `Bearer ${CLE}` } });
    return res.ok ? await res.json() : [];
  } catch (err) {
    return [];
  }
}
async function main() {
  let villes = await decouvrirVilles();
  if (!villes.length) {
    console.warn("liste de villes introuvable : liste de secours");
    villes = VILLES_SECOURS;
  } else {
    const parId = new Map(villes.map((c) => [c.id, c]));
    for (const c of VILLES_SECOURS) if (!parId.has(c.id)) parId.set(c.id, c);
    villes = Array.from(parId.values());
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: UA });
  await page.route("**://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("**://fonts.gstatic.com/**", (route) => route.abort());
  const anciennes = await precedentes();
  const seen = new Set();
  const rows = [];
  const echecs = [];
  for (const city of villes) {
    let cartes;
    try {
      cartes = await seancesDeLaVille(page, city);
    } catch (err) {
      echecs.push(city);
      continue;
    }
    for (const c of cartes) {
      const ville = villeDepuisAdresse(c.address) || casseDeVille(city.label);
      const region = regionDepuisAdresse(c.address) || REGIONS[normalize(ville)] || null;
      const lienDirect = LIENS[c.code] || null;
      const cinema = nomDeSalle(c.name, ville) || "Cinema";
      for (const heure of c.hours) {
        const key = `${c.date}|${heure}|${c.code}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const carte = `${c.date}|${heure}|${normalize(ville)}|${normalize(cinema)}`;
        if (seen.has(carte)) continue;
        seen.add(carte);
        rows.push({ date: c.date, heure, ville, region: region || "France", cinema, lien: lienDirect || c.href });
      }
    }
  }
  await browser.close();
  if (echecs.length) {
    const today = (new Date()).toISOString().slice(0, 10);
    const deja = new Set(rows.map((r) => `${r.date}|${r.heure}|${normalize(r.cinema)}`));
    for (const city of echecs) {
      const label = normalize(city.label);
      for (const s of anciennes) {
        if (normalize(s.ville) !== label || s.date < today) continue;
        const key = `${s.date}|${s.heure}|${normalize(s.cinema)}`;
        if (deja.has(key)) continue;
        deja.add(key);
        rows.push(s);
      }
    }
  }
  if (rows.length === 0) {
    console.error("BILAN echec");
    process.exit(1);
  }
  if (SEC) return console.log("BILAN ok");
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure) || a.ville.localeCompare(b.ville));
  const res = await fetch(`${API}/seances.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CLE}` },
    body: JSON.stringify(rows)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("BILAN echec");
    process.exit(1);
  }
  console.log("BILAN ok");
}
main().catch((err) => {
  console.error("BILAN echec");
  process.exit(1);
});
