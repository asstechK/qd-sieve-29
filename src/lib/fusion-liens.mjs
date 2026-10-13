export const FICHIERS = /\.(jpg|jpeg|png|webp|gif|svg|css|js|pdf|mp4|webm|mov|avi|mkv|mp3|wav|zip|docx?|xlsx?)(\?|$)/i;
export function adresseDe(valeur) {
  if (!valeur) return "";
  return typeof valeur === "string" ? valeur : valeur.url || "";
}
export function estSaisi(valeur) {
  if (!valeur || typeof valeur !== "object") return false;
  return valeur.source === "tableau" || valeur.source === "admin";
}
export function rang(valeur) {
  if (!valeur) return 0;
  const url = adresseDe(valeur);
  const film = typeof valeur === "object" && valeur.film === true;
  let profond = false;
  try {
    const chemin = new URL(url).pathname;
    profond = chemin !== "" && chemin !== "/";
  } catch (e) {
  }
  return film ? 3 : profond ? 2 : 1;
}
export function estFicheDuFilm(page, entreeIndex) {
  if (!page) return false;
  if (!page.approx) return true;
  const declaree = entreeIndex && typeof entreeIndex === "object" && entreeIndex.film === true;
  return Boolean(declaree && entreeIndex.url && page.url === entreeIndex.url);
}
export function fusionnerLiens(trouves, existants) {
  const fusion = Object.assign({}, trouves);
  for (const [cle, valeur] of Object.entries(existants || {})) {
    const adresse = adresseDe(valeur);
    if (adresse && FICHIERS.test(adresse)) continue;
    if (estSaisi(valeur) || rang(valeur) >= rang(fusion[cle])) fusion[cle] = valeur;
  }
  return fusion;
}
