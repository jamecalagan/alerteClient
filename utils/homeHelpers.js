// Fonctions utilitaires pures utilisées par HomePage.js (montants de
// commandes/interventions, détection "intervention/commande active", tri par
// date la plus récente). Extraites pour alléger ce fichier — aucune ne
// dépend de l'état du composant, copiées telles quelles.
//
// Certaines (computeOrderAmounts, _fmt, hasOpenOrderForClient,
// getOrderRemainingForClient, getInterventionRemaining,
// hasClientOrderNotified, __notifBellGreen) ne sont plus appelées ailleurs
// dans HomePage.js au moment de cette extraction (code mort probable) —
// conservées telles quelles, à vérifier avant suppression éventuelle.

// === Helpers montants ===
export const n = (v) => {
  const x = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

const computeOrderAmounts = (o) => {
  // total (essaie plusieurs champs)
  const qty = n(o.quantity ?? 1);
  const unit = n(o.unit_price ?? o.price ?? 0);
  const totalCandidate = o.total ?? o.amount ?? qty * unit;
  const total = Math.max(0, +n(totalCandidate).toFixed());

  // acomptes + paiements
  const deposit = n(o.deposit ?? o.acompte ?? 0);
  const paidAmount = o.paid ? total : n(o.paid_amount ?? 0);

  const rest = Math.max(0, +(total - deposit - paidAmount).toFixed(2));

  // commande incluse ? (si tu n'as pas encore de colonnes dédiées)
  const included =
    o.included_in_intervention === true ||
    o.linked_intervention_id != null ||
    (total === 0 && deposit === 0 && paidAmount === 0);

  return { total, deposit, paidAmount, rest, included };
};
// Agrège les montants de commandes d'un client en séparant "comprises" vs "simples"
export const summarizeClientOrders = (orders = []) => {
  let restStandalone = 0; // reste à payer uniquement pour les commandes "simples"
  let totalStandalone = 0; // total des simples (pour le hint)
  let depositStandalone = 0; // acompte cumulé des simples
  let hasIncluded = false; // au moins une commande "incluse" (comprise)

  for (const o of orders) {
    const { total, deposit, paidAmount, rest, included } =
      computeOrderAmounts(o);
    if (included) {
      hasIncluded = true;
      continue; // on n'additionne pas les incluses dans le restant global
    }
    restStandalone += rest;
    totalStandalone += total;
    depositStandalone += deposit;
  }

  return { restStandalone, totalStandalone, depositStandalone, hasIncluded };
};

// ——— Helpers montants ———
export const _toNum = (v) => {
  const s = (v ?? "").toString().replace(",", ".").trim();
  const num = parseFloat(s);
  return Number.isFinite(num) ? num : 0;
};
const _fmt = (num) => `${(Math.round(num * 100) / 100).toFixed(2)} €`;
const hasOpenOrderForClient = (orders = [], clientId) => {
  const cid = String(clientId ?? "");
  return orders.some((o) => String(o.client_id) === cid && !o.saved);
};

// Somme du restant dû pour les COMMANDES d’un client (non sauvegardées)
const getOrderRemainingForClient = (orders = [], clientId) => {
  const cid = String(clientId ?? "");
  return orders
    .filter((o) => String(o.client_id) === cid && !o.saved) // tu peux retirer !o.saved si tu veux compter même les sauvegardées
    .reduce((acc, o) => {
      const qty = Math.max(1, parseInt(o.quantity ?? 1, 10) || 1);
      const unit = typeof o.price === "number" ? o.price : _toNum(o.price);
      const total =
        typeof o.total === "number" && !isNaN(o.total) ? o.total : unit * qty;
      const deposit = _toNum(o.deposit);
      const remaining = Math.max(0, total - deposit);
      return acc + remaining;
    }, 0);
};

// Restant dû pour l’INTERVENTION (prend solderestant si dispo, sinon recalcule)
const getInterventionRemaining = (latestIntervention) => {
  if (!latestIntervention) return 0;
  if (latestIntervention.solderestant != null)
    return _toNum(latestIntervention.solderestant);
  const cost = _toNum(latestIntervention.cost);
  const acompte = _toNum(
    latestIntervention.partialPayment ?? latestIntervention.acompte
  );
  return Math.max(0, cost - acompte);
};

// ——— Helpers notifs commandes ———
export const isTruthy = (v) =>
  v === true || v === 1 || v === "1" || v === "true" || v === "t";

const hasClientOrderNotified = (orders, clientId) => {
  if (!Array.isArray(orders) || clientId == null) return false;
  const cid = String(clientId);
  return orders.some(
    (o) => String(o?.client_id) === cid && isTruthy(o?.notified)
  );
};

export const __coalesceDate = (r) =>
  r?.created_at ||
  r?.createdAt ||
  r?.createdat ||
  r?.updated_at ||
  r?.updatedAt ||
  r?.inserted_at ||
  "1970-01-01T00:00:00Z";

// retourne un timestamp (ms) de la DERNIÈRE intervention OU commande d'un client
export const __latestInterventionMs = (client) => {
  const interventions = Array.isArray(client?.interventions) ? client.interventions : [];
  const orders = Array.isArray(client?.orders) ? client.orders : [];
  let best = 0;
  for (const it of [...interventions, ...orders]) {
    const d = new Date(__coalesceDate(it)).getTime();
    if (Number.isFinite(d) && d > best) best = d;
  }
  return best; // 0 si rien
};

const __norm = (s) =>
  (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

const __CLOSED_INT = new Set([
  "recupere",
  "restitue",
  "annule",
  "non reparable",
  "livre",
  "termine",
  "terminee",
  "archive",
  "archivee",
]);

const __CLOSED_ORDER = new Set([
  "livre",
  "restitue",
  "annule",
  "termine",
  "terminee",
  "archive",
  "archivee",
]);

export const __isActiveIntervention = (row) => !__CLOSED_INT.has(__norm(row?.status));
export const __isActiveOrder = (order) => {
  if (!order) return false;

  const isTrue = (value) =>
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "t";

  const isDeleted = isTrue(order.deleted);
  const isPaid = isTrue(order.paid);
  const isSaved = isTrue(order.saved);
  const isRecovered = isTrue(order.recovered);

  return (
    !isDeleted &&
    !isPaid &&
    !isSaved &&
    !isRecovered
  );
};

export const __pickLatestActiveIntervention = (arr = []) =>
  arr
    .filter(__isActiveIntervention)
    .sort(
      (a, b) => new Date(__coalesceDate(b)) - new Date(__coalesceDate(a))
    )[0] || null;

export const __pickLatestActiveOrder = (arr = []) =>
  arr
    .filter(__isActiveOrder)
    .sort(
      (a, b) => new Date(__coalesceDate(b)) - new Date(__coalesceDate(a))
    )[0] || null;

// Cloche NOTIF = vert si la DERNIÈRE fiche ACTIVE (intervention prioritaire, sinon commande) est notifiée
const __notifBellGreen = (client) => {
  const li = __pickLatestActiveIntervention(client?.interventions || []);
  if (li) return Boolean(li.is_notified === true || li.notifiedBy);
  const lo = __pickLatestActiveOrder(client?.orders || []);
  return Boolean(lo?.notified === true);
};

// Récupère le path bucket "images/..." (public ou signé)
export const pathFromSupabaseUrl = (url) => {
  try {
    const m = url.match(
      /\/storage\/v1\/object\/(public|sign)\/images\/(.+?)(\?|$)/
    );
    return m ? m[2] : null; // sans le "images/"
  } catch {
    return null;
  }
};

// Exports groupés pour les fonctions non encore utilisées ailleurs (voir
// note en tête de fichier), pour ne rien perdre lors de l'extraction.
export {
  computeOrderAmounts,
  _fmt,
  hasOpenOrderForClient,
  getOrderRemainingForClient,
  getInterventionRemaining,
  hasClientOrderNotified,
  __notifBellGreen,
};
