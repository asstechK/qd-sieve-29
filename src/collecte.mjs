#!/usr/bin/env node
import { normalize } from "./lib/normalize.mjs";
import { TABLES, API, CLE, adresse } from "./lib/config.mjs";
import { departements, villesDuDepartement, joursDeLaVille, pageDuJour } from "./lib/source.mjs";
import { regionDepuisAdresse } from "./lib/regions.mjs";
import { villeDepuisAdresse, casseDeVille, nomDeSalle } from "./lib/noms.mjs";
const REGIONS = TABLES.regions || {};
const LIENS = TABLES.liens || {};
const SEC = process.argv.includes("--sec");
const LIMITE = (process.env.DEPARTEMENTS || "").split(/[\s,]+/).filter(Boolean);
async function precedentes() {
  try {
    const res = await fetch(`${API}/seances.json?brut`, { headers: { Authorization: `Bearer ${CLE}` } });
    return res.ok ? await res.json() : [];
  } catch (err) {
    return [];
  }
}
const jourApres = (iso) => new Date(Date.parse(iso + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
const aujourdhui = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
const rows = [];
const seen = new Set();
const vusParJour = new Map();
const voisines = new Map();
function ajouter(jour, resultat) {
  const t = resultat.theater || {};
  const loc = t.location || {};
  const adr = `${loc.address || ""} ${loc.zip || ""} ${loc.city || ""}`.trim();
  const ville = villeDepuisAdresse(adr) || casseDeVille(loc.city || "");
  const region = regionDepuisAdresse(adr) || REGIONS[normalize(ville)] || "France";
  const cinema = nomDeSalle(t.name, ville) || "Cinema";
  const code = t.internalId || "";
  const lien = LIENS[code] || (code ? adresse("salle", { code }) : adresse("seances"));
  const heures = new Set();
  for (const v of Object.values(resultat.showtimes || {})) {
    for (const s of v || []) if ((s.startsAt || "").startsWith(jour)) heures.add(s.startsAt.slice(11, 16));
  }
  for (const heure of [...heures].sort()) {
    const key = `${jour}|${heure}|${code}`;
    const carte = `${jour}|${heure}|${normalize(ville)}|${normalize(cinema)}`;
    if (seen.has(key) || seen.has(carte)) continue;
    seen.add(key);
    seen.add(carte);
    rows.push({ date: jour, heure, ville, region, cinema, lien });
  }
}
async function interroger(pres, jour, dept) {
  const vus = vusParJour.get(jour) || new Set();
  vusParJour.set(jour, vus);
  const geos = [];
  let page = 1, total = 1, suivant = "";
  while (page <= total) {
    const d = await pageDuJour(pres, jour, page);
    total = (d.pagination && d.pagination.totalPages) || 1;
    if (page === 1) suivant = d.results && d.results.length ? "" : d.nextDate || null;
    let nouveau = false;
    for (const r of d.results || []) {
      const t = r.theater || {};
      const geo = new Set(((t.location || {}).localizations || []).flatMap((l) => (l.path || []).map(String)));
      geos.push(geo);
      const id = t.internalId || t.name;
      if (geo.has(dept) && !vus.has(id)) nouveau = true;
      vus.add(id);
      ajouter(jour, r);
    }
    if (!nouveau) break;
    page++;
  }
  const couvertes = new Set([String(pres)]);
  geos.forEach((g, i) => {
    if (page > total || geos.length - i - 1 >= 2) for (const c of g) couvertes.add(c);
  });
  return { couvertes, suivant };
}
async function departement(dept) {
  let villes = [];
  try {
    villes = (await villesDuDepartement(dept)).filter((v) => String(v.id) !== dept);
  } catch (err) {
  }
  const jours = new Map();
  const fin = jourApres(aujourdhui().replace(/^\d{4}/, (a) => String(+a + 1)));
  let jour = aujourdhui();
  while (jour && jour < fin) {
    const r = await interroger(dept, jour, dept);
    const couvertes = r.couvertes;
    const suivants = [r.suivant];
    for (;;) {
      const restantes = [];
      for (const v of villes) {
        const id = String(v.id);
        if (couvertes.has(id)) continue;
        if (!jours.has(id)) jours.set(id, await joursDeLaVille(id));
        const j = jours.get(id);
        if (!j || j.has(jour) || (j.size && jour > [...j].sort().pop())) restantes.push(id);
      }
      if (!restantes.length) break;
      const gain = (id) => [id, ...(voisines.get(id) || [])].filter((c) => !couvertes.has(c)).length;
      const id = restantes.reduce((a, b) => (gain(b) > gain(a) ? b : a));
      couvertes.add(id);
      for (const c of voisines.get(id) || []) couvertes.add(c);
      const rv = await interroger(id, jour, dept);
      for (const c of rv.couvertes) {
        couvertes.add(c);
        if (c === id) continue;
        voisines.set(id, (voisines.get(id) || new Set()).add(c));
        voisines.set(c, (voisines.get(c) || new Set()).add(id));
      }
      suivants.push(rv.suivant);
    }
    const lendemain = jourApres(jour);
    if (suivants.includes("")) jour = lendemain;
    else {
      const annonces = suivants.filter(Boolean).map((s) => s.slice(0, 10)).sort();
      jour = annonces.length ? (annonces[0] > lendemain ? annonces[0] : lendemain) : null;
    }
  }
  return villes;
}
async function main() {
  let depts = [];
  try {
    depts = await departements();
  } catch (err) {
  }
  if (LIMITE.length) depts = depts.filter((d) => LIMITE.includes(d));
  if (!depts.length) {
    console.error("BILAN echec");
    process.exit(1);
  }
  const anciennes = SEC ? [] : await precedentes();
  const echecs = [];
  for (const dept of depts) {
    const avant = rows.length;
    try {
      await departement(dept);
    } catch (err) {
      rows.splice(avant);
      let villes = [];
      try {
        villes = await villesDuDepartement(dept);
      } catch (e) {
      }
      echecs.push(...villes);
    }
  }
  if (echecs.length) {
    const today = aujourdhui();
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
  if (rows.length === 0 || (SEC && echecs.length)) {
    console.error("BILAN echec");
    process.exit(1);
  }
  if (SEC) return console.log("BILAN ok");
  for (const s of anciennes) if (s.manuelle && s.date >= aujourdhui()) rows.push(s);
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure) || a.ville.localeCompare(b.ville));
  const res = await fetch(`${API}/seances.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${CLE}` },
    body: JSON.stringify(rows)
  });
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
