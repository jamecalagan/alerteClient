// Fiche de prise en charge : état de l'appareil au dépôt (colonne interventions.intake_check, jsonb).
// Voir scripts/sql/intake_check.sql. Utilisé par components/IntakeCheck.js (saisie),
// SignatureClient.js et ClientPreviewPage.js (récapitulatif et fiche imprimée).

export const INTAKE_FUNCTIONS = [
  { key: "ecran", label: "Écran" },
  { key: "clavier", label: "Clavier" },
  { key: "pave", label: "Pavé tactile" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "bluetooth", label: "Bluetooth" },
  { key: "son", label: "Son / haut-parleurs" },
  { key: "webcam", label: "Webcam / micro" },
  { key: "ports", label: "Ports USB / HDMI" },
  { key: "charge", label: "Charge / batterie" },
  { key: "autre", label: "Autre" },
];

// Ordre de rotation au toucher : (vide) → OK → En panne → Non testable → (vide)
export const INTAKE_STATES = {
  ok: { label: "OK", color: "#15803d", bg: "#dcfce7" },
  panne: { label: "En panne", color: "#b91c1c", bg: "#fee2e2" },
  nt: { label: "Non testable", color: "#475569", bg: "#e2e8f0" },
};
export const INTAKE_STATE_ORDER = [null, "ok", "panne", "nt"];

export const INTAKE_PHYSICAL = [
  { key: "rayures", label: "Rayures" },
  { key: "coque", label: "Coque fendue / cassée" },
  { key: "ecran_fissure", label: "Écran fissuré" },
  { key: "liquide", label: "Traces de liquide" },
  { key: "vis", label: "Vis manquantes" },
  { key: "deja_ouvert", label: "Déjà ouvert / réparé ailleurs" },
];

// Clause reprise de la fiche papier (supports/fiche-prise-en-charge-A4.pdf, site avenir-informatique.fr)
export const INTAKE_CLAUSE =
  "Les fonctions marquées « non testable » n’ont pas pu être vérifiées au dépôt. La réparation porte uniquement sur la panne décrite. " +
  "Les défauts constatés après la remise en marche de l’appareil (par exemple clavier, Wi-Fi ou écran), souvent liés à la même cause, " +
  "ne résultent pas de notre intervention : nous vous en informons et ils font l’objet d’un devis séparé, soumis à votre accord.";
export const INTAKE_CLAUSE_DUE =
  "La réparation de la panne décrite reste due, même si vous refusez ce devis complémentaire.";
// Version courte pour la fiche imprimée A5 (même sens, moins de place)
export const INTAKE_CLAUSE_PRINT =
  "Les fonctions non testables n’ont pas pu être vérifiées au dépôt. La réparation porte uniquement sur la panne décrite ; " +
  "les défauts constatés après la remise en marche, souvent liés à la même cause, ne résultent pas de notre intervention et font l’objet d’un devis séparé, soumis à votre accord.";

export const emptyIntake = () => ({ powers_on: null, functions: {}, physical: [], autre_label: "" });

// Accepte null, une chaîne JSON ou un objet ; renvoie toujours un objet complet.
export const normalizeIntake = (v) => {
  let o = v;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      o = null;
    }
  }
  if (!o || typeof o !== "object") return emptyIntake();
  return {
    powers_on: typeof o.powers_on === "boolean" ? o.powers_on : null,
    functions: o.functions && typeof o.functions === "object" ? o.functions : {},
    physical: Array.isArray(o.physical) ? o.physical : [],
    autre_label: o.autre_label || "",
  };
};

// Vrai si quelque chose a été renseigné (sinon on enregistre null et on n'affiche rien)
export const hasIntake = (v) => {
  const o = normalizeIntake(v);
  return (
    o.powers_on !== null ||
    Object.values(o.functions).some(Boolean) ||
    o.physical.length > 0
  );
};

// Valeur à enregistrer en base : null si rien n'a été renseigné
export const intakeForSave = (v) => (hasIntake(v) ? normalizeIntake(v) : null);

const fnLabel = (f, o) =>
  f.key === "autre" && o.autre_label ? `Autre : ${o.autre_label}` : f.label;

// Lignes de récapitulatif (texte) : [{ label, state }] pour les fonctions renseignées
export const intakeFunctionLines = (v) => {
  const o = normalizeIntake(v);
  return INTAKE_FUNCTIONS.filter((f) => o.functions[f.key]).map((f) => ({
    label: fnLabel(f, o),
    state: o.functions[f.key],
  }));
};

export const intakePhysicalLabels = (v) => {
  const o = normalizeIntake(v);
  return INTAKE_PHYSICAL.filter((p) => o.physical.includes(p.key)).map((p) => p.label);
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Bloc HTML pour la fiche imprimée (ClientPreviewPage). Chaîne vide si rien n'est renseigné.
export const intakeHtml = (v) => {
  if (!hasIntake(v)) return "";
  const o = normalizeIntake(v);
  // Regroupe les fonctions par état, sur une ligne chacun (fiche A5 : place limitée).
  // « Ne s'allume pas » est placé en tête de la ligne « Non testable » pour gagner une ligne.
  const parEtat = ["nt", "panne", "ok"]
    .map((st) => {
      const noms = intakeFunctionLines(o)
        .filter((l) => l.state === st)
        .map((l) => esc(l.label));
      const prefixe =
        st === "nt" && o.powers_on === false ? "<strong>Ne s’allume pas</strong> — " : "";
      return noms.length
        ? `<div class="intake-line">${prefixe}<strong style="color:${INTAKE_STATES[st].color}">${esc(
            INTAKE_STATES[st].label
          )} :</strong> ${noms.join(", ")}</div>`
        : "";
    })
    .join("");
  const aucunNt = !intakeFunctionLines(o).some((l) => l.state === "nt");
  const etat =
    o.powers_on === false && aucunNt
      ? "L’appareil ne s’allume pas : ses fonctions ne peuvent pas être testées."
      : o.powers_on === true
      ? "L’appareil s’allume."
      : "";
  const physique = intakePhysicalLabels(o);
  return `
    <div class="intake-box">
      <div class="intake-title">État à la réception</div>
      ${etat ? `<div class="intake-line"><strong>${esc(etat)}</strong></div>` : ""}
      ${parEtat}
      ${physique.length ? `<div class="intake-line"><strong>État physique :</strong> ${esc(physique.join(", "))}</div>` : ""}
      <div class="intake-clause">${esc(INTAKE_CLAUSE_PRINT)} <strong>${esc(INTAKE_CLAUSE_DUE)}</strong></div>
    </div>`;
};

// Styles à ajouter dans le <style> de la fiche imprimée (format A5)
export const INTAKE_PRINT_CSS = `
  .intake-box { border: 1px solid #b91c1c; border-radius: 6px; padding: 4px 6px; margin: 4px 0; }
  .intake-title { color: #b91c1c; font-weight: bold; font-size: 9px; margin-bottom: 2px; }
  .intake-line { font-size: 8px; color: #222; margin-bottom: 1px; line-height: 1.25; }
  .intake-clause { font-size: 7.5px; color: #222; margin-top: 3px; line-height: 1.25; }
  .intake-clause strong { color: #b91c1c; }
`;
