const MOTS_VIDES = new Set([
  "cinema",
  "cinemas",
  "cine",
  "le",
  "la",
  "les",
  "l",
  "de",
  "du",
  "des",
  "salle"
]);
export function normaliserNom(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function motsUtiles(nom) {
  return normaliserNom(nom).replace(/\(([^)]*)\)/g, " $1 ").split(" ").filter((m) => (m.length > 3 || /^\d+$/.test(m)) && !MOTS_VIDES.has(m));
}
export function memeSalle(a, b, options) {
  const motsMin = options && options.motsMin || 1;
  const strict = Boolean(options && options.strict);
  const ma = motsUtiles(a);
  const mb = motsUtiles(b);
  if (!ma.length || !mb.length) return normaliserNom(a) === normaliserNom(b);
  const communs = strict ? ma.filter((m) => mb.includes(m)) : ma.filter((m) => mb.some((n) => n === m || n.includes(m) || m.includes(n)));
  const exiges = strict ? motsMin : Math.min(motsMin, ma.length, mb.length);
  return communs.length >= exiges;
}
export function seuleAuCreneau(seances, date, ville, heure) {
  if (!heure) return null;
  const auCreneau = (seances || []).filter(
    (s) => s.date === date && s.heure === heure && normaliserNom(s.ville) === normaliserNom(ville)
  );
  return auCreneau.length === 1 ? auCreneau[0] : null;
}
