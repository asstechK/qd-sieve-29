#!/usr/bin/env node
import { normalize } from "./lib/normalize.mjs";
import { webSearch, isDenylisted, extractHost } from "./lib/websearch.mjs";
import { motsUtiles as motsDistinctifs } from "./lib/salle-match.js";
import { lirePageRendue, fermerNavigateur } from "./lib/navigateur.mjs";
import { fusionnerLiens, estFicheDuFilm, estSaisi, FICHIERS } from "./lib/fusion-liens.mjs";
import { SOURCE, TABLES, API, CLE, hoteSource } from "./lib/config.mjs";
const SITES_PAR_NOM = TABLES.sites || {};
const SECRET = CLE;
const PUBLISH = process.argv.includes("--publish");
const STRICT = process.argv.includes("--strict");
const LIMITE = (() => {
  const i = process.argv.indexOf("--limit");
  return i === -1 ? Infinity : parseInt(process.argv[i + 1], 10) || Infinity;
})();
const SALLES = (() => {
  const i = process.argv.indexOf("--salles");
  if (i === -1) return null;
  const fragments = (process.argv[i + 1] || "").split(",").map((f) => normalize(f.trim())).filter(Boolean);
  return fragments.length ? fragments : null;
})();
function retenue(...champs) {
  if (!SALLES) return true;
  const texte = normalize(champs.filter(Boolean).join(" "));
  return SALLES.some((f) => texte.includes(f));
}
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PAGES = [
  "",
  "/a-l-affiche",
  "/a-laffiche",
  "/films",
  "/les-films",
  "/prochainement",
  "/programme",
  "/programmation",
  "/les-seances",
  "/seances",
  "/agenda"
];
const AGREGATEURS = new RegExp(SOURCE.agregateurs || "$^", "i");
const TITRE = SOURCE.mot;
const FILM_ID = SOURCE.id;
const HOTE_SOURCE = hoteSource();
const deLaSource = (url) => Boolean(HOTE_SOURCE) && url.includes(HOTE_SOURCE);
async function lirePage(url, { navigateur = false } = {}) {
  const directe = await fetchPage(url);
  if (!navigateur) return directe;
  if (directe && normalize(directe.body).includes(TITRE)) return directe;
  const rendue = await lirePageRendue(url);
  return rendue || directe;
}
async function fetchPage(url, ms = 18e3) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: c.signal, redirect: "follow" });
    return r.ok ? { body: await r.text(), url: r.url } : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}
function urlsDuFilm(html, base) {
  const out = new Set();
  let hoteBase = "";
  try {
    hoteBase = new URL(base).hostname;
  } catch (e) {
  }
  const re = /(?:href|src|data-href|location\.href)\s*=\s*['"]([^'"]+)['"]/gi;
  let m;
  while (m = re.exec(html)) {
    const brut = m[1];
    if (!new RegExp(TITRE, "i").test(brut) && !brut.includes(FILM_ID)) continue;
    if (AGREGATEURS.test(brut) || deLaSource(brut)) continue;
    if (FICHIERS.test(brut)) continue;
    try {
      const abs = new URL(brut, base);
      if (hoteBase && abs.hostname !== hoteBase) continue;
      out.add(abs.href);
    } catch (e) {
    }
  }
  return [...out];
}
function contientMot(texte, mot) {
  return new RegExp("(^|[^a-z0-9])" + mot + "([^a-z0-9]|$)").test(texte);
}
const PLATEFORMES = /samsung|disneyplus|canalplus|netflix|primevideo|apple\.com|orange\.fr|sfr\.fr|free\.fr|molotov/i;
const CIRCUITS = [
  ["pathe", /pathe/],
  ["ugc", /ugc/],
  ["cgr", /cgr/],
  ["mk2", /mk2/],
  ["kinepolis", /kinepolis/],
  ["megarama", /megarama/]
];
function circuitIncoherent(url, cinema) {
  const hote = extractHost(url).toLowerCase();
  const nom = normalize(cinema);
  return CIRCUITS.some(([marque, motif]) => motif.test(hote) && !nom.includes(marque));
}
function domaineCoherent(url, cinema, ville) {
  const hote = normalize(extractHost(url)).replace(/ /g, "");
  const nom = normalize(cinema);
  if (CIRCUITS.some(([marque, motif]) => motif.test(hote) && nom.includes(marque))) return true;
  const mots = motsDistinctifs(cinema).concat(motsDistinctifs(ville));
  return mots.some((m) => m.length >= 4 && hote.includes(m));
}
async function ressembleAUnCinema(url, cinema, ville) {
  if (PLATEFORMES.test(url)) return false;
  if (circuitIncoherent(url, cinema)) return false;
  if (!domaineCoherent(url, cinema, ville)) return false;
  const res = await fetchPage(url, 14e3);
  if (!res) return false;
  const t = normalize(res.body);
  const marqueursForts = ["seance", "horaire", "a l affiche", "prochainement", "programmation"];
  if (!marqueursForts.some((mot) => t.includes(mot))) return false;
  const vocabulaire = ["seance", "horaire", "film", "programmation", "a l affiche", "cinema"].filter((mot) => t.includes(mot)).length >= 2;
  if (!vocabulaire) return false;
  const motsVille = motsDistinctifs(ville);
  const villeCitee = !motsVille.length || motsVille.some((m) => contientMot(t, m));
  if (!villeCitee) return false;
  const mots = motsDistinctifs(cinema);
  if (!mots.length) return true;
  const presents = mots.filter((m) => contientMot(t, m)).length;
  return presents >= Math.min(2, mots.length);
}
async function chercherSite(cinema, ville) {
  const requetes = [
    `"${cinema}" ${ville} "${SOURCE.titre}" seance`,
    `cinema "${cinema}" ${ville} site officiel programmation`
  ];
  for (const requete of requetes) {
    let resultats;
    try {
      resultats = await webSearch(requete);
    } catch (err) {
      continue;
    }
    for (const url of resultats.slice(0, 8)) {
      if (isDenylisted(url) || AGREGATEURS.test(url) || deLaSource(url)) continue;
      const host = extractHost(url);
      if (!host) continue;
      const racine = `https://${host}`;
      if (await ressembleAUnCinema(racine, cinema, ville)) return racine;
    }
    await new Promise((r) => setTimeout(r, 2e3));
  }
  return null;
}
function racineDe(url) {
  try {
    return new URL(url).origin + "/";
  } catch (e) {
    return url;
  }
}
async function chercherPageFilm(site) {
  for (const p of PAGES) {
    const res = await lirePage(site.replace(/\/$/, "") + p, { navigateur: p === "" });
    if (!res) continue;
    if (!normalize(res.body).includes(TITRE)) continue;
    const urls = urlsDuFilm(res.body, res.url);
    if (urls.length) return { url: urls[0], via: p || "/" };
    return { url: res.url, via: p || "/", approx: true };
  }
  return null;
}
async function lireLiensActuels() {
  const res = await fetch(`${API}/admin/api/data`, {
    headers: { "User-Agent": UA, Authorization: `Bearer ${SECRET}` }
  });
  if (!res.ok) return {};
  return (await res.json()).liens || {};
}
async function main() {
  const res = await fetch(`${API}/seances.json`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`seances inaccessibles : HTTP ${res.status}`);
  const seances = await res.json();
  const salles = new Map();
  for (const s of seances) {
    const cle = normalize(s.cinema);
    if (!salles.has(cle)) {
      salles.set(cle, { cle, cinema: s.cinema, ville: s.ville, lien: s.lien, n: 0 });
    }
    salles.get(cle).n += 1;
  }
  const estAccueil = (url) => {
    try {
      return ["", "/"].includes(new URL(url).pathname);
    } catch (e) {
      return false;
    }
  };
  const existantsAvant = SECRET ? await lireLiensActuels() : {};
  const aTraiter = [...salles.values()].filter((v) => v.lienFilm !== true).filter((v) => !estSaisi(existantsAvant[v.cle + "|" + normalize(v.ville)])).filter((v) => retenue(v.cinema, v.ville)).slice(0, LIMITE);
  const liens = {};
  const echecs = [];
  const accueils = [];
  const sitesTrouves = {};
  for (const [cle, valeur] of Object.entries(existantsAvant)) {
    if (!estSaisi(valeur)) continue;
    if (valeur.film === true) {
      liens[cle] = valeur;
      continue;
    }
    if (!retenue(cle.replace("|", " "))) {
      liens[cle] = valeur;
      continue;
    }
    const page = await lirePage(valeur.url, { navigateur: true });
    const annonceLeFilm = page && normalize(page.body).includes(TITRE);
    liens[cle] = annonceLeFilm ? { ...valeur, film: true } : valeur;
    await new Promise((r) => setTimeout(r, 1200));
  }
  for (const salle of aTraiter) {
    const entree = SITES_PAR_NOM[salle.cle + "|" + normalize(salle.ville)] || SITES_PAR_NOM[salle.cle];
    const inscrit = typeof entree === "string" ? entree : entree && entree.url;
    const site = inscrit && (await fetchPage(inscrit) ? inscrit : racineDe(inscrit)) || await chercherSite(salle.cinema, salle.ville);
    if (!site) {
      echecs.push(`${salle.cinema} (${salle.ville}) — site introuvable`);
      await new Promise((r) => setTimeout(r, 2500));
      continue;
    }
    sitesTrouves[salle.cle] = site;
    const page = await chercherPageFilm(site);
    if (page) {
      const fiche = estFicheDuFilm(page, entree);
      liens[salle.cle + "|" + normalize(salle.ville)] = fiche ? { url: page.url, film: true } : page.url;
    } else if (STRICT) {
      echecs.push(`${salle.cinema} (${salle.ville}) — film absent de ${site}`);
    } else {
      liens[salle.cle + "|" + normalize(salle.ville)] = site;
      accueils.push(`${salle.cinema} (${salle.ville})`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!PUBLISH || !Object.keys(liens).length) {
    if (!PUBLISH) console.log("BILAN ok");
    return;
  }
  if (!SECRET) {
    console.error("BILAN echec");
    process.exit(1);
  }
  const actuel = await fetch(`${API}/admin/api/data`, {
    headers: { "User-Agent": UA, Authorization: `Bearer ${SECRET}` }
  });
  if (!actuel.ok) throw new Error(`liens actuels inaccessibles : HTTP ${actuel.status}`);
  const existants = (await actuel.json()).liens || {};
  let fusion = fusionnerLiens(liens, existants);
  if (STRICT) {
    const verifies = {};
    for (const [cle, url] of Object.entries(fusion)) {
      const page = await fetchPage(url);
      if (page && normalize(page.body).includes(TITRE)) {
        verifies[cle] = url;
      } else {
      }
    }
    fusion = verifies;
  }
  const envoi = await fetch(`${API}/admin/api/liens`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ liens: fusion })
  });
  const corps = await envoi.json();
  if (!envoi.ok) {
    console.error("BILAN echec");
    process.exit(1);
  }
  console.log("BILAN ok");
}
main().catch((err) => {
  console.error("BILAN echec");
  process.exitCode = 1;
}).finally(async () => {
  await fermerNavigateur();
  await new Promise((suite) => process.stdout.write("", suite));
  process.exit(process.exitCode || 0);
});
