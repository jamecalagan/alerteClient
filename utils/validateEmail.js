// Vérifie le format d'une adresse e-mail et bloque les fautes de saisie
// courantes (points doubles, domaine sans extension, espaces, etc.) sans
// tenter de vérifier que l'adresse existe réellement.
export const isValidEmail = (value) =>
  /^[a-zA-Z0-9]+(?:[._%+-][a-zA-Z0-9]+)*@[a-zA-Z0-9]+(?:[.-][a-zA-Z0-9]+)*\.[a-zA-Z]{2,}$/.test(
    String(value || "").trim()
  );
