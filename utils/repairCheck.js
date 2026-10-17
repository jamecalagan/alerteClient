// Fiche de prise en charge : test après réparation (colonne interventions.repair_check, jsonb).
// Voir scripts/sql/intake_check.sql. Saisie : components/RepairCheck.js (EditInterventionPage).
//   { functions: { ecran: 'ok' | 'panne', ... },     // mêmes clés que utils/intakeCheck.js
//     other_defects: 'texte',                          // autres défauts constatés après remise en marche
//     client_notified_at: ISO | null, notify_method: 'sms' | 'appel' | null,
//     quote_prices: { clavier: '75', autres: '30', ... }, // prix du devis complémentaire, par ligne
//     quote_types: { clavier: 'piece' | 'repair' },     // pièce à commander / réparation sans pièce
//     quote_labor: { clavier: '30' },                   // main-d'œuvre de pose (lignes « pièce »)
//     quote_accepted: true | false | null,             // null = en attente de réponse
//     order_done: { at, order_id, keys: [...] } | null,  // pièces commandées (table orders)
//     cost_added: { at, amount, keys: [...] } | null }   // ajouté au montant de l'intervention
// Les lignes du devis sont les fonctions « En panne » + la ligne « autres » (texte des autres défauts) :
// voir repairQuoteLines.
import { INTAKE_FUNCTIONS, migrateFunctionKeys } from "./intakeCheck";

export const REPAIR_STATES = {
  ok: { label: "OK", color: "#15803d", bg: "#dcfce7" },
  panne: { label: "En panne", color: "#b91c1c", bg: "#fee2e2" },
};
export const REPAIR_STATE_ORDER = [null, "ok", "panne"];

export const emptyRepairCheck = () => ({
  functions: {},
  other_defects: "",
  client_notified_at: null,
  notify_method: null,
  quote_prices: {},
  quote_types: {},
  quote_labor: {},
  quote_accepted: null,
  order_done: null,
  cost_added: null,
});

export const normalizeRepairCheck = (v) => {
  let o = v;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      o = null;
    }
  }
  if (!o || typeof o !== "object") return emptyRepairCheck();
  return {
    functions: migrateFunctionKeys(o.functions),
    other_defects: o.other_defects || "",
    client_notified_at: o.client_notified_at || null,
    notify_method: o.notify_method === "sms" || o.notify_method === "appel" ? o.notify_method : null,
    quote_prices: o.quote_prices && typeof o.quote_prices === "object" ? o.quote_prices : {},
    quote_types: o.quote_types && typeof o.quote_types === "object" ? o.quote_types : {},
    quote_labor: o.quote_labor && typeof o.quote_labor === "object" ? o.quote_labor : {},
    quote_accepted: typeof o.quote_accepted === "boolean" ? o.quote_accepted : null,
    order_done: o.order_done && typeof o.order_done === "object" ? o.order_done : null,
    cost_added: o.cost_added && typeof o.cost_added === "object" ? o.cost_added : null,
  };
};

export const hasRepairCheck = (v) => {
  const o = normalizeRepairCheck(v);
  return (
    Object.values(o.functions).some(Boolean) ||
    !!o.other_defects.trim() ||
    !!o.client_notified_at ||
    Object.values(o.quote_prices).some((p) => String(p ?? "").trim())
  );
};

const prix = (p) => {
  const n = parseFloat(String(p ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Lignes du devis complémentaire : chaque fonction « En panne », puis les autres défauts notés.
// [{ key, label, price (texte saisi), value (nombre ou null) }] ; total = somme des prix saisis.
export const repairQuoteLines = (v, intake) => {
  const o = normalizeRepairCheck(v);
  const autreLabel = intake && intake.autre_label;
  const lignes = INTAKE_FUNCTIONS.filter((f) => o.functions[f.key] === "panne").map((f) => ({
    key: f.key,
    label: f.key === "autre" && autreLabel ? `Autre : ${autreLabel}` : f.label,
  }));
  if (o.other_defects.trim()) lignes.push({ key: "autres", label: o.other_defects.trim() });
  return lignes.map((l) => {
    const type = o.quote_types[l.key] === "repair" ? "repair" : "piece";
    const labor = type === "piece" ? prix(o.quote_labor[l.key]) : null;
    return {
      ...l,
      type,
      price: o.quote_prices[l.key] || "",
      value: prix(o.quote_prices[l.key]),
      labor: type === "piece" ? o.quote_labor[l.key] || "" : "",
      laborValue: labor,
    };
  });
};

// Total annoncé au client : prix des lignes + main-d'œuvre de pose des pièces
export const repairQuoteTotal = (v, intake) =>
  repairQuoteLines(v, intake).reduce((s, l) => s + (l.value || 0) + (l.laborValue || 0), 0);

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Ce qu'il reste à faire une fois le devis accepté :
//   pieces : lignes « pièce » non encore commandées (prix > 0) → bouton « Créer la commande »
//   toCost : réparations sans pièce + main-d'œuvre des pièces, non encore ajoutées au montant
//   amount : montant à ajouter au coût de l'intervention ; labels : pour le rappel
export const repairQuotePending = (v, intake) => {
  const o = normalizeRepairCheck(v);
  if (o.quote_accepted !== true) return { pieces: [], toCost: [], amount: 0, labels: [] };
  const lignes = repairQuoteLines(o, intake);
  const commandees = (o.order_done && o.order_done.keys) || [];
  const ajoutees = (o.cost_added && o.cost_added.keys) || [];
  const pieces = lignes.filter((l) => l.type === "piece" && l.value > 0 && !commandees.includes(l.key));
  const toCost = lignes
    .filter((l) => !ajoutees.includes(l.key))
    .map((l) => ({ ...l, costValue: l.type === "repair" ? l.value || 0 : l.laborValue || 0 }))
    .filter((l) => l.costValue > 0);
  const amount = r2(toCost.reduce((s, l) => s + l.costValue, 0));
  const labels = [
    ...pieces.map((l) => `${l.label} (pièce ${l.value} €)`),
    ...toCost.map((l) =>
      l.type === "repair" ? `${l.label} (${l.costValue} €)` : `pose ${l.label} (${l.costValue} €)`
    ),
  ];
  return { pieces, toCost, amount, labels };
};

export const hasPendingQuote = (v, intake) => repairQuotePending(v, intake).labels.length > 0;

export const repairCheckForSave = (v) => (hasRepairCheck(v) ? normalizeRepairCheck(v) : null);

// Fonctions testées, dans l'ordre de la fiche : [{ key, label, state }]
export const repairFunctionLines = (v) => {
  const o = normalizeRepairCheck(v);
  return INTAKE_FUNCTIONS.filter((f) => o.functions[f.key]).map((f) => ({
    key: f.key,
    label: f.label,
    state: o.functions[f.key],
  }));
};
