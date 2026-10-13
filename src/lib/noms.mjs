const CODE_POSTAL = /\b\d{2}\s?\d{3}\b/g;
const PARTICULES = new Set([
  "de",
  "du",
  "des",
  "le",
  "la",
  "les",
  "sur",
  "sous",
  "en",
  "au",
  "aux",
  "et",
  "lès",
  "les",
  "d",
  "l"
]);
export function villeDepuisAdresse(adresse) {
  if (!adresse) return null;
  const texte = String(adresse).trim();
  let fin = -1;
  for (const m of texte.matchAll(CODE_POSTAL)) fin = m.index + m[0].length;
  if (fin === -1) return null;
  const reste = texte.slice(fin).replace(/^[\s,–-]+/, "").trim();
  return reste ? casseDeVille(reste) : null;
}
export function casseDeVille(nom) {
  const texte = String(nom || "").trim();
  if (!texte || texte !== texte.toUpperCase()) return texte;
  let premier = true;
  return texte.toLowerCase().replace(/[^\s'’-]+/g, (mot, position) => {
    const separateurAvant = position === 0 ? "" : texte[position - 1];
    const majuscule = mot.charAt(0).toUpperCase() + mot.slice(1);
    if (premier) {
      premier = false;
      return majuscule;
    }
    if (separateurAvant === "'" || separateurAvant === "’") return mot;
    return PARTICULES.has(mot) ? mot : majuscule;
  });
}
const FORMATS = /^(dolby(\s+(cinema|atmos))?|imax(\s+laser)?|4dx|screenx|ice|salle\s+premium|premium)$/i;
export function nomDeSalle(nom, ville) {
  let texte = String(nom || "").trim();
  if (!texte) return texte;
  const dernier = texte.lastIndexOf(" - ");
  if (dernier > 0 && FORMATS.test(texte.slice(dernier + 3).trim())) {
    texte = texte.slice(0, dernier).trim();
  }
  if (!ville) return texte;
  const separateur = texte.indexOf(" - ");
  if (separateur === -1) return texte;
  const debut = texte.slice(0, separateur).trim();
  const reste = texte.slice(separateur + 3).trim();
  if (!reste) return texte;
  const pareil = (a, b) => a.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") === b.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return pareil(debut, String(ville).trim()) ? reste : texte;
}
