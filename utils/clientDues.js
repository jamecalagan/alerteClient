// Montants encore dus par un client, partagés entre l'accueil, la page des
// commandes et la restitution, pour qu'un solde d'intervention ne soit jamais
// oublié quand on règle une commande (et inversement).
//
// Sert aussi à construire la facture d'une intervention : les commandes du
// client pas encore facturées y sont ajoutées en lignes supplémentaires.
import { supabase } from "../supabaseClient";

const toNum = (v) => {
  const x = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};

const isTrue = (v) =>
  v === true || v === 1 || v === "1" || v === "true" || v === "t";

export const formatEuro = (value) =>
  `${toNum(value).toFixed(2).replace(".", ",")} €`;

// "Ordinateur Asus X515" ou, à défaut, la description de la panne.
export const describeIntervention = (intervention) =>
  [intervention?.deviceType, intervention?.brand, intervention?.model]
    .filter((v) => v && String(v).trim())
    .join(" ") ||
  String(intervention?.description || "").trim() ||
  "intervention";

// Interventions "Réparé" (pas encore restituées) dont le solde n'est pas
// réglé. Même règle que le "Total à régler" de l'accueil (solderestant).
export const fetchRepairedInterventionsDue = async (clientId) => {
  if (!clientId) return [];
  const { data, error } = await supabase
    .from("interventions")
    .select("id, deviceType, brand, model, description, solderestant")
    .eq("client_id", clientId)
    .eq("status", "Réparé");
  if (error) throw error;
  return (data || []).filter((i) => toNum(i.solderestant) > 0);
};

// Avant de supprimer une intervention : ses commandes la référencent
// (orders.intervention_id, contrainte orders_intervention_id_fkey), ce qui
// bloque la suppression (erreur 23503). On les détache sans les supprimer :
// elles restent rattachées au client.
export const detachOrdersFromIntervention = async (interventionId) => {
  if (!interventionId) return;
  const { error } = await supabase
    .from("orders")
    .update({ intervention_id: null })
    .eq("intervention_id", interventionId);
  if (error) throw error;
};

// Commandes du client non supprimées et non payées, avec un reste à régler.
export const fetchUnpaidOrders = async (clientId) => {
  if (!clientId) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("id, product, total, price, quantity, deposit, paid, deleted")
    .eq("client_id", clientId);
  if (error) throw error;
  return (data || [])
    .filter((o) => !isTrue(o.deleted) && !isTrue(o.paid))
    .map((o) => ({
      ...o,
      remaining: Math.max(
        0,
        toNum(o.total ?? toNum(o.price) * (toNum(o.quantity) || 1)) -
          toNum(o.deposit)
      ),
    }))
    .filter((o) => o.remaining > 0);
};

// Une commande est déjà facturée si une facture (non supprimée) la référence,
// soit par billing.order_id, soit par une ligne { order_id } ajoutée sur la
// facture d'une intervention.
export const isOrderAlreadyInvoiced = async (orderId) => {
  const [
    { data: direct, error: directError },
    { data: inLines, error: inLinesError },
  ] = await Promise.all([
    supabase
      .from("billing")
      .select("id, deleted")
      .eq("order_id", orderId),
    // Valeur passée en texte JSON : un tableau JS serait converti par
    // supabase-js en tableau Postgres "{...}", invalide pour une colonne jsonb.
    supabase
      .from("billing")
      .select("id, deleted")
      .contains("lines", JSON.stringify([{ order_id: orderId }])),
  ]);
  if (directError) console.warn("⚠️ Vérification facture (order_id) :", directError);
  if (inLinesError) console.warn("⚠️ Vérification facture (lignes) :", inLinesError);
  return [...(direct || []), ...(inLines || [])].some((b) => !isTrue(b.deleted));
};

const normalizeText = (value) =>
  (value ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// Commandes à ajouter sur la facture d'une intervention :
//  - commandes rattachées à cette intervention (orders.intervention_id) ;
//  - commandes du même client sans intervention rattachée, si elles sont
//    encore en cours (non sauvegardées), créées depuis le dépôt de
//    l'intervention (ex. batterie commandée depuis le chariot de l'accueil
//    après le passage en "Réparé", donc sans lien), ou portant le nom de la
//    commande de l'intervention ;
//  - jamais une commande supprimée ou déjà facturée.
// Les articles "coût inclus dans l'intervention" apparaissent à 0 €.
export const fetchOrdersForInterventionInvoice = async (intervention) => {
  const empty = { extraLines: [], ordersDeposit: 0, ordersAllPaid: true, orderIds: [] };
  const clientId = intervention?.client_id;
  if (!clientId) return empty;

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, intervention_id, product, brand, model, quantity, total, price, deposit, paid, saved, deleted, include_in_intervention, createdat, order_items(product, brand, model, quantity, unit_price, include_in_intervention)"
    )
    .eq("client_id", clientId);
  if (error) throw error;

  // Date de dépôt de l'intervention (relue si l'appelant ne l'a pas).
  let interventionCreatedAt = intervention?.createdAt || null;
  if (!interventionCreatedAt && intervention?.id) {
    const { data: row } = await supabase
      .from("interventions")
      .select("createdAt")
      .eq("id", intervention.id)
      .maybeSingle();
    interventionCreatedAt = row?.createdAt || null;
  }
  const interventionMs = interventionCreatedAt
    ? new Date(interventionCreatedAt).getTime()
    : NaN;

  const commande = normalizeText(intervention?.commande);
  const candidates = (data || []).filter((o) => {
    if (isTrue(o.deleted)) return false;
    if (o.intervention_id) return o.intervention_id === intervention.id;
    const orderMs = new Date(o.createdat || 0).getTime();
    return (
      !isTrue(o.saved) ||
      (Number.isFinite(interventionMs) && orderMs >= interventionMs) ||
      (commande !== "" && normalizeText(o.product) === commande)
    );
  });

  const invoiced = await Promise.all(
    candidates.map((o) => isOrderAlreadyInvoiced(o.id))
  );
  const orders = candidates.filter((_, i) => !invoiced[i]);
  if (orders.length === 0) return empty;

  const designationOf = (row, included) => {
    const base = [row.product, row.brand, row.model]
      .filter((v) => v && String(v).trim())
      .join(" — ");
    return included ? `${base} (inclus dans l'intervention)` : base;
  };

  const extraLines = [];
  orders.forEach((o) => {
    const items = Array.isArray(o.order_items) ? o.order_items : [];
    if (items.length > 0) {
      items.forEach((it) => {
        const included = isTrue(it.include_in_intervention);
        extraLines.push({
          designation: designationOf(it, included),
          quantity: Math.max(1, toNum(it.quantity) || 1),
          price: included ? 0 : toNum(it.unit_price),
          serial: "",
          order_id: o.id,
        });
      });
    } else {
      const included = isTrue(o.include_in_intervention);
      // orders.total est déjà le total de la commande (quantité comprise).
      extraLines.push({
        designation: designationOf(o, included),
        quantity: 1,
        price: included ? 0 : toNum(o.total ?? o.price),
        serial: "",
        order_id: o.id,
      });
    }
  });

  return {
    extraLines,
    ordersDeposit: orders.reduce((s, o) => s + toNum(o.deposit), 0),
    ordersAllPaid: orders.every((o) => isTrue(o.paid)),
    orderIds: orders.map((o) => o.id),
  };
};
