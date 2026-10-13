function lireJson(nom) {
  try {
    return JSON.parse(process.env[nom] || "{}");
  } catch (err) {
    console.error(`${nom} illisible`);
    process.exit(1);
  }
}
export const SOURCE = lireJson("SOURCE");
export const TABLES = lireJson("TABLES");
export const API = (process.env.API || "").replace(/\/$/, "");
export const CLE = process.env.CLE || "";
if (process.env.GITHUB_ACTIONS) {
  const masques = new Set();
  const parcourir = (v) => {
    if (v && typeof v === "object") return Object.entries(v).forEach(([k, x]) => (parcourir(k), parcourir(x)));
    const s = String(v ?? "");
    if (s.length < 4) return;
    masques.add(s);
    try {
      const u = new URL(s);
      masques.add(u.hostname);
      masques.add(u.hostname.replace(/^www\./, ""));
    } catch (e) {
    }
  };
  parcourir(SOURCE);
  parcourir(TABLES);
  parcourir(API);
  for (const s of masques) console.log(`::add-mask::${s}`);
}
export function adresse(gabarit, valeurs = {}) {
  const chemin = SOURCE[gabarit].replace(/\{(\w+)\}/g, (_, k) => k === "id" ? SOURCE.id : valeurs[k]);
  return SOURCE.base + chemin;
}
export function motif(gabarit, drapeaux = "") {
  const echappe = SOURCE[gabarit].replace(/\{id\}/g, SOURCE.id).replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{ville\\?\}/g, "(\\d+)");
  return new RegExp(echappe, drapeaux);
}
export function hoteSource() {
  try {
    return new URL(SOURCE.base).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}
