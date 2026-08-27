import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
  Image,
  Animated,
  TouchableWithoutFeedback,
  Easing,
  Pressable,
  ScrollView,
  Keyboard,
KeyboardAvoidingView,
Platform,
} from "react-native";
import { supabase } from "../supabaseClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useFocusEffect, CommonActions } from "@react-navigation/native";

import * as Animatable from "react-native-animatable";
import BottomMenu from "../components/BottomMenu";
import { Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import CustomAlert from "../components/CustomAlert";
import AlertBox from "../components/AlertBox";
// === Helpers montants ===
const n = (v) => {
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
const summarizeClientOrders = (orders = []) => {
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
const _toNum = (v) => {
  const s = (v ?? "").toString().replace(",", ".").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const _fmt = (n) => `${(Math.round(n * 100) / 100).toFixed(2)} €`;
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
const isTruthy = (v) =>
  v === true || v === 1 || v === "1" || v === "true" || v === "t";

const hasClientOrderNotified = (orders, clientId) => {
  if (!Array.isArray(orders) || clientId == null) return false;
  const cid = String(clientId);
  return orders.some(
    (o) => String(o?.client_id) === cid && isTruthy(o?.notified)
  );
};

// retourne un timestamp (ms) de la DERNIÈRE intervention OU commande d'un client
const __latestInterventionMs = (client) => {
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

const __isActiveIntervention = (row) => !__CLOSED_INT.has(__norm(row?.status));
const __isActiveOrder = (order) => {
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

const __coalesceDate = (r) =>
  r?.created_at ||
  r?.createdAt ||
  r?.createdat ||
  r?.updated_at ||
  r?.updatedAt ||
  r?.inserted_at ||
  "1970-01-01T00:00:00Z";

const __pickLatestActiveIntervention = (arr = []) =>
  arr
    .filter(__isActiveIntervention)
    .sort(
      (a, b) => new Date(__coalesceDate(b)) - new Date(__coalesceDate(a))
    )[0] || null;

const __pickLatestActiveOrder = (arr = []) =>
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
const pathFromSupabaseUrl = (url) => {
  try {
    const m = url.match(
      /\/storage\/v1\/object\/(public|sign)\/images\/(.+?)(\?|$)/
    );
    return m ? m[2] : null; // sans le "images/"
  } catch {
    return null;
  }
};

export default function HomePage({ navigation, route, setUser }) {
  const flatListRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, []);

  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [searchActionVisible, setSearchActionVisible] = useState(false);
const [searchSelectedClient, setSearchSelectedClient] = useState(null);
  const [sortBy, setSortBy] = useState("createdAt");
  const [orderAsc, setOrderAsc] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertOnClose, setAlertOnClose] = useState(null);
  const [logoutConfirmVisible, setLogoutConfirmVisible] = useState(false);

  const showAlert = (title, message, onCloseAction = null) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertOnClose(() => onCloseAction);
    setAlertVisible(true);
  };

  const [cleanupModalVisible, setCleanupModalVisible] = useState(false);
  const handlePhotoCleanup = () => {
    setCleanupModalVisible(false);
    navigation.navigate("ImageCleanup");
  };
  const [transportModalVisible, setTransportModalVisible] = useState(false);
  const [selectedCommande, setSelectedCommande] = useState(null);
  const [selectedCommandeDone, setSelectedCommandeDone] = useState(false);
  const [selectedCommandeFournisseur, setSelectedCommandeFournisseur] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true); // Loader state
  const [uploadingInterventionId, setUploadingInterventionId] = useState(null); // photo en cours d'envoi (ajout depuis la Home)
  const [photoChoiceIntervention, setPhotoChoiceIntervention] = useState(null); // intervention pour laquelle la popup Caméra/Galerie/Web est ouverte
  const [uploadingOrderPhotoId, setUploadingOrderPhotoId] = useState(null); // photo de commande en cours d'envoi (ajout depuis la Home)
  const [photoChoiceOrder, setPhotoChoiceOrder] = useState(null); // commande pour laquelle la popup Caméra/Galerie/Web est ouverte
  const [deletePhotoTarget, setDeletePhotoTarget] = useState(null); // { interventionId, uri } photo d'intervention à confirmer avant suppression
  const [deleteOrderPhotoTarget, setDeleteOrderPhotoTarget] = useState(null); // { orderId, uri } photo de commande à confirmer avant suppression
  const [uploadingOrderProductPhotoId, setUploadingOrderProductPhotoId] = useState(null); // photo d'appareil (commande) en cours d'envoi
  const [photoChoiceOrderProduct, setPhotoChoiceOrderProduct] = useState(null); // commande pour laquelle la popup Caméra/Galerie (photo d'appareil) est ouverte
  const [deleteOrderProductPhotoTarget, setDeleteOrderProductPhotoTarget] = useState(null); // { orderId, uri } photo d'appareil (commande) à confirmer avant suppression
  const [imageModalUrl, setImageModalUrl] = useState(null); // photo affichée en plein écran (commande ou intervention)
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [hasImagesToDelete, setHasImagesToDelete] = useState(false);
  const [notifyModalVisible, setNotifyModalVisible] = useState(false); // Gérer la visibilité de la modal de notification
  const [selectedInterventionId, setSelectedInterventionId] = useState(null); // Stocker l'ID de l'intervention sélectionnée
  const [repairedNotReturnedCount, setRepairedNotReturnedCount] = useState(0);
  const toBool = (v) => v === true || v === "true" || v === 1 || v === "1";
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupData, setPopupData] = useState([]); // [{ client, interventionsEnCours[], ordersEnCours[], montants }]
  const popupShownRef = useRef(false); // éviter d’ouvrir plusieurs fois dans la même session
  const [expressList, setExpressList] = useState([]);
  const [ordersList, setOrdersList] = useState([]); // ← NE PAS RENOMMER
  const [notifyLocalMap, setNotifyLocalMap] = useState({});
  const [isBannedMatch, setIsBannedMatch] = useState(false);
  // —— Note ultra simple
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteIntervId, setNoteIntervId] = useState(null);
  const [noteOrderId, setNoteOrderId] = useState(null);
  const [noteClientId, setNoteClientId] = useState(null);
const [sliderH, setSliderH] = useState(0);
// Propositions en attente
const [pendingProposals, setPendingProposals] =
  useState([]);

const [pendingProposalsLoading, setPendingProposalsLoading] =
  useState(false);

const [
  pendingProposalsModalVisible,
  setPendingProposalsModalVisible,
] = useState(false);

// Réparés non récupérés depuis plus de 30 jours
const [overdueRepairedClients, setOverdueRepairedClients] =
  useState([]);

const [overdueRepairedLoading, setOverdueRepairedLoading] =
  useState(false);

const [
  overdueRepairedModalVisible,
  setOverdueRepairedModalVisible,
] = useState(false);

// Réparés dont le client n'a jamais été prévenu (notifiedBy vide)
const [notNotifiedRepaired, setNotNotifiedRepaired] = useState([]);
const [notNotifiedRepairedLoading, setNotNotifiedRepairedLoading] =
  useState(false);
const [
  notNotifiedRepairedModalVisible,
  setNotNotifiedRepairedModalVisible,
] = useState(false);

// Interventions "En attente de pièces" dont la pièce commandée est arrivée
// mais pas encore montée (order_items.received=true, installed=false)
const [partsReceivedInterventions, setPartsReceivedInterventions] =
  useState([]);
const [partsReceivedLoading, setPartsReceivedLoading] = useState(false);
const [
  partsReceivedModalVisible,
  setPartsReceivedModalVisible,
] = useState(false);

// Interventions avec un solde restant dû à relancer
const [outstandingBalances, setOutstandingBalances] = useState([]);
const [outstandingBalancesLoading, setOutstandingBalancesLoading] =
  useState(false);
const [
  outstandingBalancesModalVisible,
  setOutstandingBalancesModalVisible,
] = useState(false);
const [outstandingBalancesPage, setOutstandingBalancesPage] = useState(1);
const OUTSTANDING_BALANCES_PAGE_SIZE = 5;
const [showOnHoldBalances, setShowOnHoldBalances] = useState(false);
// Clients avec au moins un montant actif (hors mises de côté) — sert au
// badge et à la liste par défaut de la modale "Soldes restants dus".
const activeOutstandingBalances = outstandingBalances.filter(
  (c) => c.solderestant > 0
);
const onHoldBalancesCount = outstandingBalances.reduce(
  (sum, c) => sum + c.items.filter((it) => it.on_hold).length,
  0
);
const displayedOutstandingBalances = showOnHoldBalances
  ? outstandingBalances
  : outstandingBalances
      .map((c) => ({ ...c, items: c.items.filter((it) => !it.on_hold) }))
      .filter((c) => c.items.length > 0);

// Popups Express / Commandes (boutons du haut, à côté de la Galerie Cloud)
const [expressModalVisible, setExpressModalVisible] = useState(false);
const [ordersModalVisible, setOrdersModalVisible] = useState(false);


  const [notifySheetVisible, setNotifySheetVisible] = useState(false);
  const [notifySheetCtx, setNotifySheetCtx] = useState(null); // { client, latest }
  const [notifyChooserVisible, setNotifyChooserVisible] = useState(false);
  const [notifyForClient, setNotifyForClient] = useState(null);
  const [bannedAlert, setBannedAlert] = useState({
    visible: false,
    name: "",
    phone: "",
    reason: "",
  });
  // Ouvre la modale pour la dernière intervention active, sinon la commande active
  const openNote = (clientItem) => {
    const li = clientItem?.latestIntervention;
    if (li?.id) {
      setNoteIntervId(li.id);
      setNoteOrderId(null);
      setNoteClientId(clientItem.id);
      setNoteText(li.info_note || "");
      setNoteVisible(true);
      return;
    }

    const activeOrder = (clientItem?.orders || []).filter(__isActiveOrder)[0];
    if (activeOrder?.id) {
      setNoteIntervId(null);
      setNoteOrderId(activeOrder.id);
      setNoteClientId(clientItem.id);
      setNoteText(activeOrder.info_note || "");
      setNoteVisible(true);
      return;
    }

    showAlert(
      "Aucune fiche active",
      "Cette fiche n'a ni intervention ni commande active."
    );
  };

  // Sauvegarde en base + patch local super simple
  const saveNote = async () => {
    if (!noteIntervId && !noteOrderId) return;
    const table = noteIntervId ? "interventions" : "orders";
    const targetId = noteIntervId || noteOrderId;

    const { error } = await supabase
      .from(table)
      .update({ info_note: noteText })
      .eq("id", targetId);

    if (error) {
      showAlert("Erreur", "Impossible d’enregistrer la note.");
      return;
    }

    // Patch local minimal
    const patch = (c) => {
      if (c.id !== noteClientId) return c;
      if (noteIntervId) {
        const interventions = (c.interventions || []).map((it) =>
          it.id === noteIntervId ? { ...it, info_note: noteText } : it
        );
        const latest =
          c.latestIntervention?.id === noteIntervId
            ? { ...c.latestIntervention, info_note: noteText }
            : c.latestIntervention;
        return { ...c, interventions, latestIntervention: latest };
      }
      const orders = (c.orders || []).map((o) =>
        o.id === noteOrderId ? { ...o, info_note: noteText } : o
      );
      return { ...c, orders };
    };
    setClients((prev) => prev.map(patch));
    setFilteredClients((prev) => prev.map(patch));

    setNoteVisible(false);
  };

  // Mise de côté depuis la fiche client (liste "Fiches en cours") — cible
  // l'intervention active si elle existe, sinon la commande active.
  const toggleClientOnHold = async (client, intervention, order) => {
    const target = intervention
      ? { table: "interventions", id: intervention.id, nextValue: !intervention.on_hold }
      : order
      ? { table: "orders", id: order.id, nextValue: !order.on_hold }
      : null;

    if (!target) return;

    const { error } = await supabase
      .from(target.table)
      .update({ on_hold: target.nextValue })
      .eq("id", target.id);

    if (error) {
      console.error("Erreur mise de côté :", error);
      showAlert("Erreur", "Impossible de mettre à jour cette fiche.");
      return;
    }

    const patch = (c) => {
      if (c.id !== client.id) return c;
      if (target.table === "interventions") {
        const interventions = (c.interventions || []).map((it) =>
          it.id === target.id ? { ...it, on_hold: target.nextValue } : it
        );
        const latest =
          c.latestIntervention?.id === target.id
            ? { ...c.latestIntervention, on_hold: target.nextValue }
            : c.latestIntervention;
        return { ...c, interventions, latestIntervention: latest };
      }
      const orders = (c.orders || []).map((o) =>
        o.id === target.id ? { ...o, on_hold: target.nextValue } : o
      );
      return { ...c, orders };
    };

    setClients((prev) => prev.map(patch));
    setFilteredClients((prev) => prev.map(patch));
  };

  const openBannedAlert = (item) => {
    setBannedAlert({
      visible: true,
      name: item?.name || "Client",
      phone: item?.phone || "",
      reason: item?.ban_reason || "Raison non précisée",
    });
  };

  // === Détection "la saisie correspond à un client banni" ===
  const _norm = (s) =>
    (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const _digits = (s) => (s ?? "").toString().replace(/\D/g, "");

  useEffect(() => {
    const q = (searchText || "").trim();
    if (!q) {
      setIsBannedMatch(false);
      return;
    }
    const qNorm = _norm(q);
    const qDigits = _digits(q);

    // on regarde les SUGGESTIONS affichées
    const hit = (filteredClients || []).some((c) => {
      if (c?.banned !== true) return false;
      const nameOk = _norm(c?.name).includes(qNorm);
      const phoneOk =
        qDigits.length >= 3 && _digits(c?.phone).includes(qDigits);
      return nameOk || phoneOk;
    });

    setIsBannedMatch(hit);
  }, [searchText, filteredClients]);

  // Ouvre la feuille de sélection
  const openNotifyChooser = (client) => {
    const latest = __pickLatestActiveIntervention(client?.interventions || []);
    if (!latest) {
      showAlert(
        "Aucune intervention active",
        "Ce client n'a pas de fiche active."
      );
      return;
    }
    setNotifySheetCtx({ client, latest });
    setNotifySheetVisible(true);
  };

  // lecture de l'état effectif: d'abord local, sinon champs de l'objet
  const getNotifyChoice = (interv) => {
    if (!interv) return "none";
    return (
      notifyLocalMap[interv.id] ??
      interv.notify_type ??
      (interv.notifiedBy ? "pickup" : "none")
    );
  };
  const handleNotifyPick = async (mode) => {
    try {
      const ctx = notifySheetCtx;
      if (!ctx?.client || !ctx?.latest?.id) return;

      // 1) MAJ immédiate de l’icône
      setNotifyLocal(ctx.client.id, ctx.latest.id, mode);

      // 2) Persistance DB (non bloquant)
      persistNotify(ctx.latest.id, mode).catch((e) =>
        console.error("persistNotify:", e)
      );

      // 3) Ferme la feuille
      setNotifySheetVisible(false);

      // 4) Navigation (pas pour "none")
      if (mode === "pickup" || mode === "info") {
        navigation.navigate("ClientNotificationsPage", {
          clientId: ctx.client.id,
          clientName: ctx.client.name,
          phone: ctx.client.phone,
          ficheNumber: ctx.client.ficheNumber,
          interventionId: ctx.latest.id,
          deviceType: ctx.latest.deviceType || "appareil",
          mode, // "pickup" | "info"
        });
      }
    } catch (e) {
      console.error("handleNotifyPick:", e);
    }
  };

  // mise à jour OPTIMISTE (icône immédiate) + patch dans tes listes
  const setNotifyLocal = (clientId, interventionId, choice) => {
    setNotifyLocalMap((m) => ({ ...m, [interventionId]: choice }));

    const ts = choice === "none" ? null : new Date().toISOString();
    const patchOneClient = (c) => {
      if (c.id !== clientId) return c;

      const patchInterv = (it) =>
        it.id === interventionId
          ? {
              ...it,
              notify_type: choice,
              notifiedBy: choice === "none" ? null : "SMS",
              notifiedat: ts,
            }
          : it;

      const interventions = (c.interventions || []).map(patchInterv);
      const latest =
        c.latestIntervention?.id === interventionId
          ? {
              ...c.latestIntervention,
              notify_type: choice,
              notifiedBy: choice === "none" ? null : "SMS",
              notifiedat: ts,
            }
          : c.latestIntervention;

      return { ...c, interventions, latestIntervention: latest };
    };

    setClients((prev) => prev.map(patchOneClient));
    setFilteredClients((prev) => prev.map(patchOneClient));
  };

  // persistance Supabase (asynchrone)
  // persistance Supabase (asynchrone) — SANS notify_type
  const persistNotify = async (interventionId, choice) => {
    // choice: "pickup" | "info" | "none"
    const payload =
      choice === "none"
        ? { notify_type: "none", notifiedBy: null, notifiedat: null }
        : {
            notify_type: choice,
            notifiedBy: "SMS",
            notifiedat: new Date().toISOString(),
          };

    const { error } = await supabase
      .from("interventions")
      .update(payload)
      .eq("id", interventionId);

    if (error) {
      console.error("persistNotify:", error);
      showAlert("Erreur", "Impossible d’enregistrer le signalement.");
    }
  };

  const [NotRepairedNotReturnedCount, setNotRepairedNotReturnedCount] =
    useState(0);
  const [selectedClient, setSelectedClient] = useState(null);
  const BlinkingIcon = ({ source }) => {
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }, []);
    console.log("🔍 hasImagesToDelete rendu :", hasImagesToDelete);
    return (
      <Animated.Image
        source={source}
        style={{
          width: 28,
          height: 28,
          tintColor: "#fad503", // 🔴 rouge pour attirer l’attention
          opacity: opacity,
        }}
      />
    );
  };
  const BlinkingIconBlue = ({ source }) => {
    const opacity = useRef(new Animated.Value(1)).current;
    const IconSquare = ({
      source,
      tintColor = "#00fd00",
      onPress,
      badge = false,
    }) => (
      <TouchableOpacity
        onPress={onPress}
        style={styles.iconSquare}
        activeOpacity={0.8}
      >
        <Image
          source={source}
          style={{ width: 28, height: 28, tintColor }}
          resizeMode="contain"
        />
        {badge && <View style={styles.iconBadge} />}
      </TouchableOpacity>
    );

    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }, []);

    return (
      <Animated.Image
        source={source}
        style={{
          width: 28,
          height: 28,
          tintColor: "#00BFFF",
          opacity,
        }}
      />
    );
  };
  // === Bouton carré homogène pour les icônes ===
  const IconSquare = React.memo(function IconSquare({
    source,
    tintColor = "#00fd00",
    onPress,
    badge = false,
    children,
  }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={styles.iconSquare}
        activeOpacity={0.8}
      >
        <Image
          source={source}
          style={{ width: 28, height: 28, tintColor }}
          resizeMode="contain"
        />
        {children}
        {badge ? <View style={styles.iconBadge} /> : null}
      </TouchableOpacity>
    );
  });
  const loadPendingRepairProposals = async () => {
  setPendingProposalsLoading(true);

  try {
    const {
      data: proposalRows,
      error: proposalError,
    } = await supabase
      .from("interventions")
      .select(`
        id,
        client_id,
        deviceType,
        brand,
        model,
        description,
        status,
        createdAt,
        repair_proposal,
        repair_proposal_price,
        repair_proposal_status,
        repair_proposal_method,
        repair_proposal_comment,
        repair_proposal_date
      `)
      .eq("repair_proposal_made", true)
      .eq("repair_proposal_status", "pending")
      .order("repair_proposal_date", {
        ascending: true,
        nullsFirst: false,
      });

    if (proposalError) {
      throw proposalError;
    }

    const proposals = proposalRows || [];

    if (proposals.length === 0) {
      setPendingProposals([]);
      return;
    }

    const clientIds = [
      ...new Set(
        proposals
          .map(
            (proposal) =>
              proposal.client_id
          )
          .filter(Boolean)
      ),
    ];

    let clientsMap = {};

    if (clientIds.length > 0) {
      const {
        data: clientRows,
        error: clientError,
      } = await supabase
        .from("clients")
        .select(
          "id, name, phone, ficheNumber"
        )
        .in("id", clientIds);

      if (clientError) {
        throw clientError;
      }

      clientsMap = Object.fromEntries(
        (clientRows || []).map((client) => [
          String(client.id),
          client,
        ])
      );
    }

    setPendingProposals(
      proposals.map((proposal) => ({
        ...proposal,
        client:
          clientsMap[
            String(proposal.client_id)
          ] || null,
      }))
    );
  } catch (error) {
    console.error(
      "❌ Chargement propositions :",
      error
    );

    setPendingProposals([]);
  } finally {
    setPendingProposalsLoading(false);
  }
};

// Charge les interventions réparées, non restituées, depuis plus de 30 jours
const loadOverdueRepairedInterventions = async () => {
  setOverdueRepairedLoading(true);

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const {
      data: interventionRows,
      error: interventionError,
    } = await supabase
      .from("interventions")
      .select(
        "id, client_id, deviceType, brand, model, repaired_at, updatedAt"
      )
      .eq("status", "Réparé")
      .eq("restitue", false);

    if (interventionError) {
      throw interventionError;
    }

    // repaired_at (date réelle de passage à "Réparé") si disponible,
    // sinon on retombe sur updatedAt pour les fiches antérieures à ce champ.
    const overdueRows = (interventionRows || [])
      .map((row) => ({
        ...row,
        __referenceDate: row.repaired_at || row.updatedAt,
      }))
      .filter(
        (row) =>
          row.__referenceDate &&
          new Date(row.__referenceDate) <= thirtyDaysAgo
      )
      .sort(
        (a, b) =>
          new Date(a.__referenceDate) - new Date(b.__referenceDate)
      );

    if (overdueRows.length === 0) {
      setOverdueRepairedClients([]);
      return;
    }

    const clientIds = [
      ...new Set(
        overdueRows
          .map((row) => row.client_id)
          .filter(Boolean)
      ),
    ];

    let clientsMap = {};

    if (clientIds.length > 0) {
      const {
        data: clientRows,
        error: clientError,
      } = await supabase
        .from("clients")
        .select("id, name, phone, ficheNumber")
        .in("id", clientIds);

      if (clientError) {
        throw clientError;
      }

      clientsMap = Object.fromEntries(
        (clientRows || []).map((client) => [
          String(client.id),
          client,
        ])
      );
    }

    setOverdueRepairedClients(
      overdueRows.map((row) => ({
        ...row,
        client: clientsMap[String(row.client_id)] || null,
      }))
    );
  } catch (error) {
    console.error(
      "❌ Chargement réparés non récupérés :",
      error
    );

    setOverdueRepairedClients([]);
  } finally {
    setOverdueRepairedLoading(false);
  }
};

// Charge les interventions "Réparé" dont le client n'a jamais été prévenu
const loadNotNotifiedRepaired = async () => {
  setNotNotifiedRepairedLoading(true);

  try {
    const { data: rows, error } = await supabase
      .from("interventions")
      .select("id, client_id, deviceType, brand, model, updatedAt")
      .eq("status", "Réparé")
      .eq("restitue", false)
      .is("notifiedBy", null);

    if (error) throw error;

    const list = rows || [];

    if (list.length === 0) {
      setNotNotifiedRepaired([]);
      return;
    }

    const clientIds = [
      ...new Set(list.map((row) => row.client_id).filter(Boolean)),
    ];

    let clientsMap = {};

    if (clientIds.length > 0) {
      const { data: clientRows, error: clientError } = await supabase
        .from("clients")
        .select("id, name, phone, ficheNumber")
        .in("id", clientIds);

      if (clientError) throw clientError;

      clientsMap = Object.fromEntries(
        (clientRows || []).map((client) => [String(client.id), client])
      );
    }

    setNotNotifiedRepaired(
      list.map((row) => ({
        ...row,
        client: clientsMap[String(row.client_id)] || null,
      }))
    );
  } catch (error) {
    console.error("❌ Chargement réparés non prévenus :", error);
    setNotNotifiedRepaired([]);
  } finally {
    setNotNotifiedRepairedLoading(false);
  }
};

// Charge les interventions "En attente de pièces" dont la pièce commandée
// est arrivée (order_items.received=true) mais pas encore montée (installed=false)
const loadPartsReceivedInterventions = async () => {
  setPartsReceivedLoading(true);

  try {
    const { data: waitingRows, error: waitingError } = await supabase
      .from("interventions")
      .select("id, client_id, deviceType, brand, model, commande, updatedAt")
      .eq("status", "En attente de pièces");

    if (waitingError) throw waitingError;

    const waiting = waitingRows || [];

    if (waiting.length === 0) {
      setPartsReceivedInterventions([]);
      return;
    }

    const clientIds = [
      ...new Set(waiting.map((row) => row.client_id).filter(Boolean)),
    ];

    const { data: orderRows, error: orderError } = await supabase
      .from("orders")
      .select("id, client_id, product, order_items(id, product, received, installed)")
      .in("client_id", clientIds.length > 0 ? clientIds : [-1]);

    if (orderError) throw orderError;

    const receivedNotInstalledByClient = {};
    (orderRows || []).forEach((order) => {
      (order.order_items || []).forEach((item) => {
        if (item.received === true && item.installed !== true) {
          const key = String(order.client_id);
          if (!receivedNotInstalledByClient[key]) {
            receivedNotInstalledByClient[key] = [];
          }
          receivedNotInstalledByClient[key].push(item.product || order.product);
        }
      });
    });

    const matchingInterventions = waiting.filter((row) =>
      Boolean(receivedNotInstalledByClient[String(row.client_id)])
    );

    if (matchingInterventions.length === 0) {
      setPartsReceivedInterventions([]);
      return;
    }

    let clientsMap = {};

    if (clientIds.length > 0) {
      const { data: clientRows, error: clientError } = await supabase
        .from("clients")
        .select("id, name, phone, ficheNumber")
        .in("id", clientIds);

      if (clientError) throw clientError;

      clientsMap = Object.fromEntries(
        (clientRows || []).map((client) => [String(client.id), client])
      );
    }

    setPartsReceivedInterventions(
      matchingInterventions.map((row) => ({
        ...row,
        client: clientsMap[String(row.client_id)] || null,
        receivedParts: receivedNotInstalledByClient[String(row.client_id)] || [],
      }))
    );
  } catch (error) {
    console.error("❌ Chargement pièces reçues :", error);
    setPartsReceivedInterventions([]);
  } finally {
    setPartsReceivedLoading(false);
  }
};

// Charge les interventions avec un solde restant dû (hors "Récupéré")
const loadOutstandingBalances = async () => {
  setOutstandingBalancesLoading(true);

  try {
    // 1) Interventions avec solde restant dû (hors "Récupéré")
    const { data: interventionRows, error: interventionError } = await supabase
      .from("interventions")
      .select(
        "id, client_id, deviceType, brand, model, solderestant, status, updatedAt, on_hold"
      )
      .neq("status", "Récupéré")
      .gt("solderestant", 0);

    if (interventionError) throw interventionError;

    // 2) Commandes non supprimées, avec calcul du reste dû (total - acompte)
    const { data: orderRows, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, client_id, product, brand, model, price, quantity, deposit, total, paid, deleted, on_hold"
      )
      .or("deleted.eq.false,deleted.is.null");

    if (orderError) throw orderError;

    const outstandingOrders = (orderRows || [])
      .map((order) => {
        const isDeleted =
          order?.deleted === true ||
          order?.deleted === "true" ||
          order?.deleted === 1 ||
          order?.deleted === "1";
        if (isDeleted) return null;
        if (order?.paid === true || order?.paid === "true") return null;

        const qty = Math.max(1, Number(order.quantity) || 1);
        const total =
          order.total != null
            ? Number(order.total)
            : (Number(order.price) || 0) * qty;
        const remaining = Math.round((total - (Number(order.deposit) || 0)) * 100) / 100;

        if (remaining <= 0) return null;

        return {
          id: `order-${order.id}`,
          rawId: order.id,
          client_id: order.client_id,
          source: "order",
          label: [order.product, order.brand, order.model]
            .filter(Boolean)
            .join(" "),
          solderestant: remaining,
          on_hold: !!order.on_hold,
        };
      })
      .filter(Boolean);

    const outstandingInterventions = (interventionRows || []).map((row) => ({
      id: `intervention-${row.id}`,
      rawId: row.id,
      client_id: row.client_id,
      source: "intervention",
      label: [row.deviceType, row.brand, row.model].filter(Boolean).join(" "),
      status: row.status,
      solderestant: Number(row.solderestant) || 0,
      on_hold: !!row.on_hold,
    }));

    const combined = [...outstandingInterventions, ...outstandingOrders];

    if (combined.length === 0) {
      setOutstandingBalances([]);
      return;
    }

    const clientIds = [
      ...new Set(combined.map((row) => row.client_id).filter(Boolean)),
    ];

    let clientsMap = {};

    if (clientIds.length > 0) {
      const { data: clientRows, error: clientError } = await supabase
        .from("clients")
        .select("id, name, phone, ficheNumber")
        .in("id", clientIds);

      if (clientError) throw clientError;

      clientsMap = Object.fromEntries(
        (clientRows || []).map((client) => [String(client.id), client])
      );
    }

    // Regroupement par client : un seul montant total (intervention + commandes).
    // Les éléments mis de côté (on_hold) restent affichés mais ne comptent plus
    // dans le total actif à relancer.
    const byClient = {};
    combined.forEach((row) => {
      const key = String(row.client_id);
      if (!byClient[key]) {
        byClient[key] = {
          id: key,
          client_id: row.client_id,
          client: clientsMap[key] || null,
          solderestant: 0,
          items: [],
        };
      }
      if (!row.on_hold) {
        byClient[key].solderestant += row.solderestant;
      }
      byClient[key].items.push(row);
    });

    const merged = Object.values(byClient).sort(
      (a, b) => b.solderestant - a.solderestant
    );

    setOutstandingBalances(merged);
  } catch (error) {
    console.error("❌ Chargement soldes restants :", error);
    setOutstandingBalances([]);
  } finally {
    setOutstandingBalancesLoading(false);
  }
};

// Bascule "mise de côté" d'une fiche (intervention ou commande) dans la
// liste des soldes dus — elle reste affichée mais son montant ne compte
// plus dans le total à relancer.
const toggleOnHoldBalance = async (item) => {
  const table = item.source === "order" ? "orders" : "interventions";
  const nextValue = !item.on_hold;

  const { error } = await supabase
    .from(table)
    .update({ on_hold: nextValue })
    .eq("id", item.rawId);

  if (error) {
    console.error("❌ Mise de côté :", error);
    showAlert("Erreur", "Impossible de mettre à jour cette fiche.");
    return;
  }

  setOutstandingBalances((prev) =>
    prev.map((client) => {
      const items = client.items.map((it) =>
        it.id === item.id ? { ...it, on_hold: nextValue } : it
      );
      const solderestant = items.reduce(
        (sum, it) => (it.on_hold ? sum : sum + it.solderestant),
        0
      );
      return { ...client, items, solderestant };
    })
  );
};

// Charge les commandes en cours (paid=false OU saved=false) pour l'encart
const loadOrdersInProgress = async () => {
  try {
    const { data: rows, error: err } = await supabase
      .from("orders")
      .select("*")
      .or("paid.eq.false,saved.eq.false")
      .or("deleted.eq.false,deleted.is.null");

    if (err) throw err;

const activeRows = (rows || []).filter((order) => {
  const isDeleted =
    order?.deleted === true ||
    order?.deleted === "true" ||
    order?.deleted === 1 ||
    order?.deleted === "1";

  return !isDeleted && (!order?.paid || !order?.saved);
});

const sorted = activeRows
  .slice()
  .sort(
    (a, b) => new Date(__coalesceDate(b)) - new Date(__coalesceDate(a))
  );

    const ids = [
      ...new Set(sorted.map((o) => o.client_id).filter(Boolean)),
    ];

    let map = {};

    if (ids.length > 0) {
      const { data: clients, error: cErr } = await supabase
        .from("clients")
        .select("id, name, phone, ficheNumber")
        .in("id", ids);

      if (cErr) throw cErr;

      map = Object.fromEntries(
        (clients || []).map((c) => [String(c.id), c])
      );
    }

    setOrdersList(
      sorted.map((o) => ({
        ...o,
        __client: map[String(o.client_id)] || null,
      }))
    );
  } catch (e) {
    console.error("❌ Commandes en cours :", e);
    setOrdersList([]);
  }
};

const loadPopupData = useCallback(async () => {
  try {
    const {
      data: clientsData,
      error: clientsError,
    } = await supabase
      .from("clients")
      .select(
        `
        *,
        interventions(
          id,
          status,
          createdAt,
          solderestant,
          cost,
          commande,
          info_note,
          on_hold
        ),
        orders(
          id,
          client_id,
          price,
          deposit,
          quantity,
          total,
          product,
          brand,
          model,
          paid,
          saved,
          recovered,
          notified,
          deleted,
          order_photos,
          createdat,
          on_hold
        )
        `
      )
      .order("createdAt", {
        ascending: false,
      });

    if (clientsError) {
      throw clientsError;
    }

    const rows = (clientsData || [])
      .map((clientRow) => {
        const interventions = Array.isArray(
          clientRow.interventions
        )
          ? clientRow.interventions
          : [];

        const orders = (
          Array.isArray(clientRow.orders)
            ? clientRow.orders
            : []
        ).map((order) => {
          let photoPaths = [];

          if (Array.isArray(order.order_photos)) {
            photoPaths =
              order.order_photos.filter(Boolean);
          } else if (
            typeof order.order_photos === "string" &&
            order.order_photos.trim()
          ) {
            try {
              const parsed = JSON.parse(
                order.order_photos
              );

              photoPaths = Array.isArray(parsed)
                ? parsed.filter(Boolean)
                : [order.order_photos.trim()];
            } catch {
              photoPaths =
                order.order_photos.includes(",")
                  ? order.order_photos
                      .split(",")
                      .map((photo) => photo.trim())
                      .filter(Boolean)
                  : [order.order_photos.trim()];
            }
          }

          const photoUrls = photoPaths
            .map((photoPath) => {
              if (
                /^https?:\/\//i.test(photoPath)
              ) {
                return photoPath;
              }

              const cleanPath =
                photoPath.startsWith("images/")
                  ? photoPath.slice(7)
                  : photoPath;

              const { data } =
                supabase.storage
                  .from("images")
                  .getPublicUrl(cleanPath);

              return data?.publicUrl || null;
            })
            .filter(Boolean);

          return {
            ...order,
            order_photos: photoUrls,
          };
        });

        const interventionsEnCours =
          interventions.filter(
            (intervention) =>
              ![
                "Réparé",
                "Récupéré",
                "Non réparable",
              ].includes(intervention.status)
          );

        const ordersEnCours =
          orders.filter(__isActiveOrder);

        if (
          interventionsEnCours.length === 0 &&
          ordersEnCours.length === 0
        ) {
          return null;
        }

        const totalIntervDu =
          interventionsEnCours
            .filter(
              (intervention) =>
                Number(
                  intervention.solderestant || 0
                ) > 0 && !intervention.on_hold
            )
            .reduce(
              (total, intervention) =>
                total +
                Number(
                  intervention.solderestant || 0
                ),
              0
            );

        const totalOrdersDue =
          ordersEnCours.reduce(
            (total, order) => {
              if (order.on_hold) return total;
              const quantity = Math.max(
                1,
                Number.parseInt(
                  order.quantity ?? 1,
                  10
                ) || 1
              );

              const price = Number(
                order.price || 0
              );

              const orderTotal =
                order.total != null &&
                !Number.isNaN(
                  Number(order.total)
                )
                  ? Number(order.total)
                  : price * quantity;

              const deposit = Number(
                order.deposit || 0
              );

              return (
                total +
                Math.max(
                  orderTotal - deposit,
                  0
                )
              );
            },
            0
          );

        const allOnHold =
          interventionsEnCours.every((i) => i.on_hold) &&
          ordersEnCours.every((o) => o.on_hold);

        return {
          client: {
            id: clientRow.id,
            name: clientRow.name,
            phone: clientRow.phone,
            ficheNumber:
              clientRow.ficheNumber,
          },
          interventionsEnCours,
          ordersEnCours,
          allOnHold,
          totals: {
            due:
              totalIntervDu +
              totalOrdersDue,
            intervDue: totalIntervDu,
            orderDue: totalOrdersDue,
          },
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.totals.due -
          a.totals.due
      );

    setPopupData(rows);
  } catch (error) {
    console.error(
      "Popup load error:",
      error
    );

    setPopupData([]);
  }
}, []);

  const [expandedClientId, setExpandedClientId] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [processLogs, setProcessLogs] = useState([]);
  const slideAnim = useRef(new Animated.Value(-250)).current;
  const [menuVisible, setMenuVisible] = useState(false);
  const [showClients, setShowClients] = useState(true);
  const [allInterventions, setAllInterventions] = useState([]);
  const [modalData, setModalData] = useState({
    title: "",
    message: "",
    onConfirm: null,
  });
  const [pages, setPages] = useState([]);
  const [sliderW, setSliderW] = useState(0);
  const itemsPerPage = 2;

const checkImagesToDelete = async () => {
  try {
    const dateLimite = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: interventionsData, error: interventionsError } =
      await supabase
        .from("interventions")
        .select('id, photos, "updatedAt", status')
        .eq("status", "Récupéré")
        .lte("updatedAt", dateLimite);

    if (interventionsError) {
      throw interventionsError;
    }

    const eligibleIds = new Set(
      (interventionsData || []).map((intervention) =>
        String(intervention.id)
      )
    );

    // Photos encore référencées directement dans interventions.photos
    const photosCount = (interventionsData || []).reduce(
      (total, intervention) => {
        const photos = Array.isArray(intervention.photos)
          ? intervention.photos.filter(Boolean)
          : [];

        return total + photos.length;
      },
      0
    );

    // Photos présentes dans intervention_images
    let extraCount = 0;

    // Filtre défensif : seuls les vrais UUID sont envoyés au filtre .in(),
    // et par lots, pour éviter un "Bad Request" si un id est invalide ou
    // si la liste est trop longue pour une seule requête.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validEligibleIds = [...eligibleIds].filter((id) => UUID_RE.test(id));

    if (validEligibleIds.length > 0) {
      const CHUNK_SIZE = 200;
      let extraImages = [];

      for (let i = 0; i < validEligibleIds.length; i += CHUNK_SIZE) {
        const chunk = validEligibleIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from("intervention_images")
          .select("id, intervention_id, image_data")
          .in("intervention_id", chunk);

        if (error) {
          console.warn(
            "⚠️ Vérification intervention_images :",
            error
          );
          continue;
        }

        extraImages = extraImages.concat(data || []);
      }

      extraCount = extraImages.filter(
        (image) =>
          typeof image.image_data === "string" &&
          image.image_data.trim().length > 0
      ).length;
    }

    // Vérification des dossiers Storage supplementaires/<interventionId>
    const { data: storageFolders, error: storageFoldersError } =
      await supabase.storage
        .from("images")
        .list("supplementaires", {
          limit: 1000,
          offset: 0,
        });

    if (storageFoldersError) {
      console.warn(
        "⚠️ Vérification Storage supplementaires :",
        storageFoldersError
      );
    }

    const eligibleStorageFolders = (storageFolders || []).filter(
      (entry) =>
        entry?.name &&
        eligibleIds.has(String(entry.name))
    );

    const storageCount = eligibleStorageFolders.length;

    // ImageCleanupPage ne traite que interventions.photos et intervention_images :
    // storageCount n'est pas exploitable par cette page, donc exclu du déclenchement du bouton
    // (sinon le bouton reste affiché en permanence sans rien à nettoyer sur cette page).
    const total = photosCount + extraCount;

    console.log("🧹 Images anciennes détectées :", {
      interventions: interventionsData?.length || 0,
      photosCount,
      extraCount,
      storageCount,
      total,
    });

    setHasImagesToDelete(total > 0);
  } catch (error) {
    console.error(
      "❌ Vérification des images à nettoyer :",
      error
    );

    setHasImagesToDelete(false);
  }
};
  useEffect(() => {
    const unsub = navigation.addListener("focus", checkImagesToDelete);
    return unsub;
  }, [navigation]);

  const openPopup = async () => {
    try {
      await loadPopupData(); // recharge la liste à jour
    } catch (e) {
      console.warn("loadPopupData:", e);
    }
    setPopupVisible(true); // ouvre la modale
  };

  const handleLoadRecoveredInterventions = async () => {
    try {
      const { data: interventions, error } = await supabase
        .from("interventions")
        .select("id, photos, updatedAt, status")
        .eq("status", "Récupéré");

      if (error) {
        console.error(
          "Erreur lors de la récupération des interventions récupérées :",
          error
        );
        return [];
      }

      const filteredInterventions = interventions.filter((intervention) => {
        const dateRestitution = new Date(intervention.updatedAt);
        const now = new Date();
        const diffInDays = (now - dateRestitution) / (1000 * 60 * 60 * 24);
        return diffInDays >= 10 && intervention.photos.length > 0;
      });

      return filteredInterventions;
    } catch (error) {
      console.error(
        "Erreur lors du chargement des interventions récupérées :",
        error
      );
      return [];
    }
  };
  // Même périmètre que OngoingAmountsPage.js : interventions non
  // récupérées/non réparables avec solde dû + commandes non payées.
  const [totalCost, setTotalCost] = useState(0);
  const loadOngoingTotal = async () => {
    try {
      const { data: interventions, error: errInt } = await supabase
        .from("interventions")
        .select("solderestant")
        .neq("status", "Récupéré")
        .neq("status", "Non réparable")
        .gt("solderestant", 0);

      if (errInt) throw errInt;

      const { data: orders, error: errOrd } = await supabase
        .from("orders")
        .select("price, deposit")
        .eq("deleted", false)
        .or("paid.eq.false,paid.is.null");

      if (errOrd) throw errOrd;

      const interventionsTotal = (interventions || []).reduce(
        (sum, i) => sum + (i.solderestant || 0),
        0
      );

      const ordersTotal = (orders || []).reduce((sum, o) => {
        const remaining = (o.price || 0) - (o.deposit || 0);
        return remaining > 0 ? sum + remaining : sum;
      }, 0);

      setTotalCost((interventionsTotal + ordersTotal).toFixed(2));
    } catch (error) {
      console.error("❌ Chargement montant en cours :", error);
    }
  };

  
  useEffect(() => {
    const chunks = [];
    for (let i = 0; i < (filteredClients || []).length; i += itemsPerPage) {
      chunks.push(filteredClients.slice(i, i + itemsPerPage));
    }
    setPages(chunks);

    // 🔒 fiches fermées par défaut + recadrage page si besoin
    setExpandedClientId(null);
    const maxPage = Math.max(1, chunks.length);
    if (currentPage > maxPage) setCurrentPage(maxPage);
    if (currentPage < 1) setCurrentPage(1);
  }, [filteredClients]);

  // Restaure la position de défilement après un rechargement (ex: ajout/suppression
  // d'une photo) pour éviter de revenir sur la première fiche.
  // Le délai laisse la FlatList (initialNumToRender=1) monter au moins l'élément
  // ciblé avant de tenter le scroll, sinon scrollToIndex échoue immédiatement.
  useEffect(() => {
    if (pages.length === 0) return;
    const targetIndex = Math.max(0, Math.min(currentPage - 1, pages.length - 1));
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
    }, 50);
    return () => clearTimeout(timer);
  }, [pages]);

const closeAllModals = () => {
    setAlertVisible(false);
    setNotifyModalVisible(false);
    setTransportModalVisible(false);
  };

  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const openModal = (type, title, message, onConfirm = null) => {
    setActiveModal(type);
    setModalData({ title, message, onConfirm });
  };
  const closeModal = () => {
    setActiveModal(null);
  };

  const toggleClientExpansion = (clientId) => {
    setExpandedClientId((prevId) => (prevId === clientId ? null : clientId));
  };
  // === Carte client (réutilisée pour le slider 2 fiches/page) ===
  const renderClientCard = ({ item, index }) => {
                        const isBanned = item?.banned === true;

                        const latestForTint = __pickLatestActiveIntervention(
                          item?.interventions || []
                        );
                        const tChoice = getNotifyChoice(latestForTint);
                        const smsTint =
                          tChoice === "pickup"
                            ? "#00c853"
                            : tChoice === "info"
                            ? "#2f00ff"
                            : "#888787";

                        // Calcul du montant total à régler
                        // Calcul du montant total à régler (inclut l'acompte des commandes)
                        // === Nouveau calcul qui distingue "commande comprise" vs "commande simple" ===

                        // Reste dû intervention (si solderestant absent, on le gère plus bas au besoin)
                        const interDue = (item.interventions || [])
                          .filter((i) => i.status !== "Récupéré")
                          .reduce(
                            (sum, i) =>
                              sum + Math.max(0, _toNum(i.solderestant)),
                            0
                          );

// Intervention active utilisée pour les calculs et les commandes
// Intervention active utilisée pour les calculs et les commandes
const latestIntervention = item.latestIntervention;

const normalizeOrderText = (value) =>
  (value ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

// Toutes les commandes réellement ouvertes
const openOrders = Array.isArray(item.orders)
  ? item.orders.filter(__isActiveOrder)
  : [];

// Produit actuellement indiqué dans l’intervention
const currentCommande = normalizeOrderText(
  latestIntervention?.commande
);

let activeOrders = openOrders;

// Lorsqu’une intervention possède un produit en commande,
// conserver uniquement la dernière commande correspondante.
if (latestIntervention && currentCommande) {
  const matchingOrders = openOrders
    .filter(
      (order) =>
        normalizeOrderText(order?.product) ===
        currentCommande
    )
    .sort((a, b) => {
      const dateA = new Date(
        a?.createdat ||
          a?.createdAt ||
          a?.created_at ||
          0
      ).getTime();

      const dateB = new Date(
        b?.createdat ||
          b?.createdAt ||
          b?.created_at ||
          0
      ).getTime();

      return dateB - dateA;
    });

  if (matchingOrders.length > 0) {
    activeOrders = matchingOrders.slice(0, 1);
  }
}


// Agrégation uniquement des commandes actives
const ordAgg = summarizeClientOrders(activeOrders);

const ordDue = ordAgg.restStandalone;
const ordTotal = ordAgg.totalStandalone;
const ordDeposit = ordAgg.depositStandalone;
const hasIncludedOrder = ordAgg.hasIncluded;

// Acompte éventuel sur l’intervention
const intervDeposit = _toNum(
  latestIntervention?.partialPayment ??
    latestIntervention?.acompte
);

// Total à régler
const totalDue = interDue + ordDue;

const isNotified =
  latestIntervention?.notifiedBy ||
  activeOrders.some((order) => order.notified);

const isEven = index % 2 === 0;

const backgroundColor = isEven
  ? "#f9f9f9"
  : "#e0e0e0";

const isExpanded = expandedClientId === item.id;

const ongoingInterventions =
  item.interventions?.filter(
    (intervention) =>
      intervention.status !== "Réparé" &&
      intervention.status !== "Récupéré" &&
      intervention.status !== "Non réparable"
  ) || [];

const totalInterventionsEnCours =
  ongoingInterventions.length;

const totalInterventions = item.interventions
  ? item.interventions.length
  : 0;

const loanedItem =
  latestIntervention?.loaned_item || "";

const hasLoanedItem =
  loanedItem.trim().length > 0 &&
  latestIntervention?.loaned_item_returned !== true;

const restitutionNote =
  latestIntervention?.restitution_note || "";

const hasRestitutionNote =
  restitutionNote.trim() !== "" &&
  latestIntervention?.restitution_note_done !== true;

const hasReminder =
  hasLoanedItem || hasRestitutionNote;

const hasOrders = activeOrders.length > 0;

                        const status =
                          ongoingInterventions.length > 0
                            ? ongoingInterventions[0].status
                            : hasOrders
                            ? "Commande en cours"
                            : "Aucun statut";
                        const totalImages =
                          latestIntervention?.photos?.length || 0;
                        const commande = latestIntervention?.commande;

                        // Montant(s) proposé(s) au client quand un devis est en cours
                        const devisIntervention =
                          status === "Devis en cours"
                            ? ongoingInterventions[0]
                            : null;
                        const devisLabel = (() => {
                          if (!devisIntervention) return null;
                          const hasRange =
                            devisIntervention.estimate_min != null &&
                            devisIntervention.estimate_max != null;
                          if (hasRange) {
                            const plafond =
                              devisIntervention.estimate_type === "PLAFOND"
                                ? " (plafonné)"
                                : "";
                            return `Devis proposé : ${devisIntervention.estimate_min} € - ${devisIntervention.estimate_max} €${plafond}`;
                          }
                          if (devisIntervention.devis_cost) {
                            return `Devis proposé : ${devisIntervention.devis_cost} €`;
                          }
                          return null;
                        })();
const orderColor = getOrderColor(activeOrders);

const shouldBlink = activeOrders.some(
  (order) => !order.paid
);
                        const labelUri =
                          item?.latestIntervention?.label_photo || null;
                        // Bleu si une commande du client est marquée notifiée (on tolère true/"true"/1)
const orderNotified =
  activeOrders.some((order) =>
    isTruthy(order?.notified)
  );

                        return (
<Animatable.View
  animation="fadeInUp"
  duration={350}
  delay={Math.min(index, 6) * 70}   // évite des délais énormes si la liste est longue
  useNativeDriver
>
<View
  style={[
    styles.clientCard,
    getStatusStyle(status),
    isBanned && styles.bannedRow, // ← fond rosé si banni
  ]}
>
  <View style={styles.cardHeaderRow}>
    <View style={styles.statusContent}>
      <View style={styles.iconCircle}>
        <Image
          source={getIconSource(status)}
          style={{
            width: 20,
            height: 20,
            tintColor: getIconColor(status), // Ajoute la couleur définie
          }}
        />
      </View>
      <Text style={styles.statusText}>{status}</Text>
    </View>

<View style={{ flex: 1, marginLeft: 8 }}>
  {(devisIntervention?.description || latestIntervention?.description) ? (
    <Text
      style={[styles.descriptionText, { flex: 0, marginLeft: 0 }]}
      numberOfLines={2}
    >
      {devisIntervention?.description || latestIntervention.description}
    </Text>
  ) : null}

  {devisLabel && (
    <Text
      style={[
        styles.descriptionText,
        {
          flex: 0,
          marginLeft: 0,
          marginTop: 4,
          fontWeight: "700",
          fontStyle: "italic",
          color: "#f57f17",
        },
      ]}
    >
      {devisLabel}
    </Text>
  )}
</View>
</View>

{hasReminder && (
  <View style={styles.reminderBox}>
    <Text style={styles.reminderBoxTitle}>
      RAPPELS
    </Text>

    {hasLoanedItem && (
      <View style={[styles.reminderItem, styles.reminderItemLoan]}>
        <Text style={styles.reminderLoanTitle}>
          📦 ACCESSOIRE PRÊTÉ
        </Text>

        <Text
          style={styles.reminderText}
          numberOfLines={2}
        >
          {loanedItem}
        </Text>
      </View>
    )}

    {hasRestitutionNote && (
      <View
        style={[
          styles.reminderItem,
          styles.reminderItemInfo,
          hasLoanedItem && styles.reminderItemSpacing,
        ]}
      >
        <Text style={styles.reminderInfoTitle}>
          💬 INFORMATION CLIENT
        </Text>

        <Text
          style={styles.reminderText}
          numberOfLines={3}
        >
          {restitutionNote}
        </Text>
      </View>
    )}
  </View>
)}

{(() => {
                                // ====== 1) Construction des lignes du tableau ======
                                const li = latestIntervention;

 

                                // format "produit · marque modèle" sur une seule ligne
                                const formatOrderLine = (o) => {
                                  const p = (
                                    o.product ??
                                    o.produit ??
                                    "Produit"
                                  )
                                    .toString()
                                    .trim();

                                  const b = (
                                    o.brand ??
                                    o.marque ??
                                    o.product_brand ??
                                    o.produit_marque ??
                                    ""
                                  )
                                    .toString()
                                    .trim();

                                  const m = (
                                    o.model ??
                                    o.modele ??
                                    o.product_model ??
                                    o.produit_modele ??
                                    ""
                                  )
                                    .toString()
                                    .trim();

                                  if (b && m) return `${p} · ${b} ${m}`;
                                  if (b) return `${p} · ${b}`;
                                  if (m) return `${p} · ${m}`;
                                  return p;
                                };

                                const ordersListText = activeOrders
                                  .map(formatOrderLine)
                                  .filter(Boolean)
                                  .join(", ");

                                // ---- ligne Matériel / Produit dynamique ----
                                const hasActiveIntervention = !!li; // si li existe, on considère intervention prioritaire

                                const materialLabel = hasActiveIntervention
                                  ? "Matériel"
                                  : activeOrders.length > 0
                                  ? "Produit"
                                  : "Matériel";

                                const materialValue = hasActiveIntervention
                                  ? `${li.deviceType || "—"}${
                                      li.brand ? " · " + li.brand : ""
                                    }${li.model ? " " + li.model : ""}`
                                  : activeOrders.length > 0
                                  ? ordersListText || "Commande en cours"
                                  : "—";

                                // --- 5 lignes visibles au départ ---
const baseRows = [
  {
    label: "Client",
    value: `${(item.name || "—").toUpperCase()} · Fiche N° ${
      item.ficheNumber ?? "—"
    }`,
  },
  {
    label: "Téléphone",
    value: formatPhoneNumber(item.phone),
  },
  {
    label: materialLabel,
    value: materialValue,
  },
];

                                const ordersSummary = activeOrders.length
                                  ? `${
                                      activeOrders.length
                                    } en cours · reste ${ordDue.toLocaleString(
                                      "fr-FR",
                                      {
                                        style: "currency",
                                        currency: "EUR",
                                      }
                                    )}`
                                  : "Aucune commande";

                                const dueValue =
                                  totalDue > 0
                                    ? `${totalDue.toLocaleString("fr-FR", {
                                        style: "currency",
                                        currency: "EUR",
                                      })}${
                                        hasIncludedOrder
                                          ? " (commande comprise)"
                                          : ""
                                      }`
                                    : "0,00 €";

                                // --- extraRows SANS Statut/Materiel (sinon doublon) ---
                                const extraRows = [
                                  {
                                    label: "Intervention créée",
                                    value: li?.createdAt
                                      ? formatDateTime(li.createdAt)
                                      : "—",
                                  },
                                  {
                                    label: "Montant intervention",
                                    value:
                                      li?.cost != null
                                        ? `${n(li.cost).toFixed(2)} €`
                                        : "—",
                                  },
                                  {
                                    label: "Solde restant",
                                    value:
                                      li?.solderestant != null
                                        ? `${n(li.solderestant).toFixed(2)} €`
                                        : li?.cost != null
                                        ? `${n(li.cost).toFixed(2)} €`
                                        : "—",
                                  },
                                  {
                                    label: "Total à régler",
                                    value: dueValue,
                                  },
                                  {
                                    label: "Commandes",
                                    value: ordersListText
                                      ? `${ordersSummary}\n${ordersListText}`
                                      : ordersSummary,
                                  },
                                  {
                                    label: "Création fiche client",
                                    value: formatDateTime(item.createdAt),
                                  },
                                  item.updatedAt
                                    ? {
                                        label: "Client modifié",
                                        value: formatDateTime(item.updatedAt),
                                      }
                                    : null,
                                  li?.interventionUpdatedAt
                                    ? {
                                        label: "Intervention MAJ",
                                        value: formatDateTime(
                                          li.interventionUpdatedAt
                                        ),
                                      }
                                    : null,
                                  li?.accept_screen_risk
                                    ? {
                                        label: "Risque écran",
                                        value: "Accepté",
                                      }
                                    : null,
                                ].filter(Boolean);

                                const allRows = [...baseRows, ...extraRows];

                                // nombre de lignes visibles au départ = baseRows.length (donc 5)
                                const previewCount = baseRows.length;
                                const rowsToShow = isExpanded
                                  ? allRows
                                  : baseRows;

                                // ====== 2) Rendu tableau + barre d’icônes ======
                                return (
                                  <>
                                    <TouchableOpacity
                                      onPress={() => {
                                        if (isBanned) {
                                          openBannedAlert(item);
                                          return;
                                        }
                                        toggleClientExpansion(item.id, index);
                                      }}
                                      activeOpacity={0.85}
                                      style={styles.tableCard}
                                    >
                                      {rowsToShow.map((r, i) => {
                                        const isDueRow =
                                          r.label === "Total à régler";
                                        return (
                                          <View
                                            key={`${r.label}-${i}`}
                                            style={[
                                              styles.tableRow,
                                              i < rowsToShow.length - 1 &&
                                                styles.tableRowBorder,
                                            ]}
                                          >
                                            <Text style={styles.tableLabel}>
                                              {r.label}
                                            </Text>

                                            {r.label === "Client" ? (
  <Text style={styles.tableValue}>
    <Text style={{ fontWeight: "bold" }}>
      {(item.name || "—").toUpperCase()}
    </Text>
    <Text>{` · Fiche N° ${item.ficheNumber ?? "—"}`}</Text>
  </Text>
) : (
  <Text
    style={[
      styles.tableValue,
      isDueRow &&
        totalDue > 0 &&
        styles.tableValueDueRed,
    ]}
  >
    {r.value}
  </Text>
)}
                                          </View>
                                        );
                                      })}

                                      {!isExpanded &&
                                        allRows.length > previewCount && (
                                          <Text style={styles.tableMoreText}>
                                            Appuyez pour voir{" "}
                                            {allRows.length - previewCount}{" "}
                                            infos de plus
                                          </Text>
                                        )}

                                      {isBanned && (
                                        <View style={styles.bannedBadge}>
                                          <Text style={styles.bannedBadgeText}>
                                            BANNI
                                            {item?.ban_reason
                                              ? ` — ${item.ban_reason}`
                                              : ""}
                                          </Text>
                                        </View>
                                      )}
                                    </TouchableOpacity>
{(() => {
  const hasIntervention = !!latestIntervention?.id;
  const hasActiveOrders =
    Array.isArray(activeOrders) && activeOrders.length > 0;
  const primaryOrder = hasActiveOrders ? activeOrders[0] : null;

  if (!hasIntervention && !primaryOrder) return null;

  // Bloc vert "Photo du produit" (l'appareil, ex: le PC) : cible
  // l'intervention si elle existe, sinon la première commande active.
  const devicePhotos = hasIntervention
    ? (Array.isArray(latestIntervention?.product_photos)
        ? latestIntervention.product_photos.filter(Boolean)
        : []
      ).map((uri) => ({
        uri,
        onDelete: () => deleteInterventionPhoto(latestIntervention.id, uri),
      }))
    : (Array.isArray(primaryOrder?.product_photos)
        ? primaryOrder.product_photos.filter(Boolean)
        : []
      ).map((uri) => ({
        uri,
        onDelete: () => deleteOrderProductPhoto(primaryOrder.id, uri),
      }));

  const isDevicePhotoUploading = hasIntervention
    ? uploadingInterventionId === latestIntervention.id
    : uploadingOrderProductPhotoId === primaryOrder?.id;

  const handleAddDevicePhoto = () => {
    if (hasIntervention) {
      handleAddInterventionPhoto(latestIntervention);
    } else if (primaryOrder) {
      handleAddOrderProductPhoto(primaryOrder);
    }
  };

  const devicePhotoBox = (
    <View
      style={{
        width: "100%",
        alignSelf: "stretch",
        marginTop: 8,
        marginBottom: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: "#00c853",
        borderRadius: 8,
        backgroundColor: "#eaffea",
      }}
    >
      <Text
        style={{
          color: "#0a6b2f",
          fontWeight: "bold",
          marginBottom: 6,
        }}
      >
        Photo du produit
      </Text>
      {devicePhotos.length > 0 && (
        <Text
          style={{
            color: "#0a6b2f",
            fontSize: 12,
            marginBottom: 6,
          }}
        >
          Appui long sur une photo pour la supprimer
        </Text>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: "row",
          gap: 8,
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        {devicePhotos.map((entry, photoIndex) => (
          <Pressable
            key={`device-photo-${photoIndex}`}
            onPress={() => openImageModal(entry.uri)}
            onLongPress={entry.onDelete}
          >
            <Image
              source={{ uri: entry.uri }}
              style={{
                width: 80,
                height: 80,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#0a6b2f",
                resizeMode: "cover",
              }}
            />
          </Pressable>
        ))}
        <TouchableOpacity
          style={{
            width: 80,
            height: 80,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#00c853",
            backgroundColor: "#eaffea",
            justifyContent: "center",
            alignItems: "center",
          }}
          activeOpacity={0.8}
          onPress={handleAddDevicePhoto}
        >
          {isDevicePhotoUploading ? (
            <ActivityIndicator size="small" color="#00c853" />
          ) : (
            <Image
              source={require("../assets/icons/upload.png")}
              style={{ width: 28, height: 28, tintColor: "#00c853" }}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  if (!hasActiveOrders) {
    return devicePhotoBox;
  }

  // Bloc violet "Photos des produits commandés" (la pièce, ex: la
  // batterie) : une entrée + un bouton d'ajout par commande active.
  const hasOrderPhotos = activeOrders.some(
    (order) =>
      Array.isArray(order.order_photos) && order.order_photos.length > 0
  );

  const orderPhotoBox = (
    <View
      style={{
        width: "100%",
        alignSelf: "stretch",
        marginTop: 8,
        marginBottom: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: "#b396f8",
        borderRadius: 8,
        backgroundColor: "#f7f3ff",
      }}
    >
      <Text
        style={{
          color: "#270381",
          fontWeight: "bold",
          marginBottom: 6,
        }}
      >
        Photos des produits commandés
      </Text>
      {hasOrderPhotos && (
        <Text
          style={{
            color: "#270381",
            fontSize: 12,
            marginBottom: 6,
          }}
        >
          Appui long sur une photo pour la supprimer
        </Text>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: "row",
          gap: 8,
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        {activeOrders.flatMap((order) => [
          ...(Array.isArray(order.order_photos)
            ? order.order_photos.map((uri, photoIndex) => (
                <Pressable
                  key={`${order.id}-order-photo-${photoIndex}`}
                  onPress={() => openImageModal(uri)}
                  onLongPress={() => deleteOrderPhoto(order.id, uri)}
                >
                  <Image
                    source={{ uri }}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#270381",
                      resizeMode: "cover",
                    }}
                  />
                </Pressable>
              ))
            : []),
          <TouchableOpacity
            key={`${order.id}-add-order-photo`}
            style={{
              width: 80,
              height: 80,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#270381",
              backgroundColor: "#efe6ff",
              justifyContent: "center",
              alignItems: "center",
            }}
            activeOpacity={0.8}
            onPress={() => handleAddOrderPhoto(order)}
          >
            {uploadingOrderPhotoId === order.id ? (
              <ActivityIndicator size="small" color="#270381" />
            ) : (
              <Image
                source={require("../assets/icons/upload.png")}
                style={{ width: 28, height: 28, tintColor: "#270381" }}
                resizeMode="contain"
              />
            )}
          </TouchableOpacity>,
        ])}
      </ScrollView>
    </View>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
      }}
    >
      <View style={{ flex: 1 }}>{orderPhotoBox}</View>
      <View style={{ flex: 1 }}>{devicePhotoBox}</View>
    </View>
  );
})()}
                                    {/* === BARRE D’ICÔNES EN BAS, ALIGNÉE À GAUCHE === */}
                                    <View
                                      style={styles.additionalIconsContainer}
                                    >
                                      {/* Notifications */}
                                      {(() => {
                                        const latestForIcon =
                                          __pickLatestActiveIntervention(
                                            item?.interventions || []
                                          );
                                        const choice =
                                          getNotifyChoice(latestForIcon);
                                        const notifyIconSource =
                                          choice === "pickup"
                                            ? require("../assets/icons/ok.png")
                                            : choice === "info"
                                            ? require("../assets/icons/infos.png")
                                            : require("../assets/icons/sms.png");
                                        return (
                                          <IconSquare
                                            source={notifyIconSource}
                                            tintColor={
                                              choice === "pickup"
                                                ? "#00c853"
                                                : choice === "info"
                                                ? "#008cff"
                                                : "#888787"
                                            }
                                            onPress={() =>
                                              openNotifyChooser(item)
                                            }
                                          />
                                        );
                                      })()}

                                      {/* Mettre de côté — uniquement fiche dépliée, pour ne pas encombrer la liste */}
                                      {isExpanded && (latestIntervention || activeOrders[0]) && (
                                        <IconSquare
                                          source={require("../assets/icons/clock.png")}
                                          tintColor={
                                            latestIntervention?.on_hold ||
                                            activeOrders[0]?.on_hold
                                              ? "#0d9488"
                                              : "#888787"
                                          }
                                          onPress={() =>
                                            toggleClientOnHold(
                                              item,
                                              latestIntervention,
                                              activeOrders[0]
                                            )
                                          }
                                        />
                                      )}

                                      {/* Edit client */}
                                      {item.latestIntervention
                                        ?.print_etiquette === false ? (
                                        <TouchableOpacity
                                          style={styles.iconSquare}
                                          onPress={() =>
                                            navigation.navigate("EditClient", {
                                              client: item,
                                            })
                                          }
                                          activeOpacity={0.8}
                                        >
                                          <BlinkingIconBlue
                                            source={require("../assets/icons/edit.png")}
                                          />
                                        </TouchableOpacity>
                                      ) : (
                                        <IconSquare
                                          source={require("../assets/icons/edit.png")}
                                          tintColor="#00fd00"
                                          onPress={() =>
                                            navigation.navigate("EditClient", {
                                              client: item,
                                            })
                                          }
                                        />
                                      )}

                                      {/* Print étiquette / fiche */}
                                      {item.latestIntervention?.imprimee ===
                                      false ? (
                                        <TouchableOpacity
                                          style={styles.iconSquare}
                                          onPress={async () => {
                                            const interventionId =
                                              item.latestIntervention?.id;
                                            if (interventionId) {
                                              await supabase
                                                .from("interventions")
                                                .update({ imprimee: true })
                                                .eq("id", interventionId);
                                            }
                                            navigation.navigate(
                                              "SelectInterventionPage",
                                              {
                                                clientId: item.id,
                                              }
                                            );
                                          }}
                                          activeOpacity={0.8}
                                        >
                                          <BlinkingIcon
                                            source={require("../assets/icons/print.png")}
                                          />
                                        </TouchableOpacity>
                                      ) : (
                                        <IconSquare
                                          source={require("../assets/icons/print.png")}
                                          tintColor="#00fd00"
                                          onPress={async () => {
                                            const interventionId =
                                              item.latestIntervention?.id;
                                            if (interventionId) {
                                              await supabase
                                                .from("interventions")
                                                .update({ imprimee: true })
                                                .eq("id", interventionId);
                                            }
                                            navigation.navigate(
                                              "SelectInterventionPage",
                                              {
                                                clientId: item.id,
                                              }
                                            );
                                          }}
                                        />
                                      )}

                                      {/* Galerie photos */}
                                      {totalImages > 0 && (
                                        <IconSquare
                                          source={require("../assets/icons/image.png")}
                                          tintColor="#00fd00"
                                          onPress={() =>
                                            goToImageGallery(item.id)
                                          }
                                        />
                                      )}

                                      {/* Interventions count */}
                                      {totalInterventions > 0 && (
                                        <IconSquare
                                          source={require("../assets/icons/tools.png")}
                                          tintColor="#00fd00"
                                          onPress={() =>
                                            navigation.navigate(
                                              "ClientInterventionsPage",
                                              {
                                                clientId: item.id,
                                              }
                                            )
                                          }
                                        >
                                          <View style={styles.countBadge}>
                                            <Text style={styles.countBadgeText}>
                                              {item.totalInterventions}
                                            </Text>
                                          </View>
                                        </IconSquare>
                                      )}

                                      {/* Commandes */}
                                      <TouchableOpacity
                                        style={[
                                          styles.iconSquare,
                                          {
                                            borderColor: getOrderColor(
                                              item.orders || []
                                            ),
                                          },
                                        ]}
                                        onPress={() =>
                                          navigation.navigate("OrdersPage", {
                                            clientId: item.id,
                                            clientName: item.name,
                                            clientPhone: item.phone,
                                            clientNumber: item.ficheNumber,
                                          })
                                        }
                                        activeOpacity={0.8}
                                      >
                                        {orderNotified ? (
                                          <Image
                                            source={require("../assets/icons/checklist.png")}
                                            style={{
                                              width: 28,
                                              height: 28,
                                              tintColor: "#1E90FF",
                                            }}
                                            resizeMode="contain"
                                          />
                                        ) : Array.isArray(item.orders) &&
                                          item.orders.some(__isActiveOrder) ? (
                                          <BlinkingIcon
                                            source={require("../assets/icons/order.png")}
                                          />
                                        ) : (
                                          <Image
                                            source={require("../assets/icons/order.png")}
                                            style={{
                                              width: 28,
                                              height: 28,
                                              tintColor: getOrderColor(
                                                item.orders || []
                                              ),
                                            }}
                                            resizeMode="contain"
                                          />
                                        )}
                                      </TouchableOpacity>

                                      {/* Icône commande transport (ancien champ texte "commande" OU nouvelles commandes structurées) */}
                                      {(() => {
                                        const hasLegacyCommande = Boolean(commande);
                                        if (!hasLegacyCommande && !hasOrders) return null;

                                        const isDone = hasLegacyCommande
                                          ? Boolean(li?.commande_effectuee)
                                          : activeOrders.every((o) => o.received);

                                        const label =
                                          commande ||
                                          activeOrders
                                            .map((o) => o.product)
                                            .filter(Boolean)
                                            .join(", ");

                                        const fournisseurLabel = hasLegacyCommande
                                          ? ""
                                          : Array.from(
                                              new Set(
                                                activeOrders
                                                  .flatMap((o) =>
                                                    Array.isArray(o.order_items)
                                                      ? o.order_items
                                                      : []
                                                  )
                                                  .map((oi) => oi.fournisseur)
                                                  .filter(Boolean)
                                              )
                                            ).join(", ");

                                        return (
                                          <IconSquare
                                            source={
                                              isDone
                                                ? require("../assets/icons/shipping_fast.png")
                                                : require("../assets/icons/shipping.png")
                                            }
                                            tintColor={isDone ? "#00fd00" : "#a073f3"}
                                            onPress={() => {
                                              setSelectedCommande(label);
                                              setSelectedCommandeDone(isDone);
                                              setSelectedCommandeFournisseur(fournisseurLabel);
                                              setTransportModalVisible(true);
                                            }}
                                          />
                                        );
                                      })()}

                                      {/* Note info (intervention active, sinon commande active) */}
                                      {(() => {
                                        const noteSource =
                                          li || activeOrders[0];
                                        const hasNote = Boolean(
                                          noteSource?.info_note &&
                                            noteSource.info_note.trim().length > 0
                                        );
                                        return (
                                          <IconSquare
                                            source={require("../assets/icons/infos.png")}
                                            tintColor={
                                              hasNote ? "#ff3603" : "#c3c4c5"
                                            }
                                            onPress={() => openNote(item)}
                                          />
                                        );
                                      })()}

                                      {/* Icônes matériels (toutes les interventions en cours) */}
                                      {(item.interventions || [])
                                        .filter(
                                          (it) =>
                                            it.status !== "Réparé" &&
                                            it.status !== "Récupéré"
                                        )
                                        .map((it, idx2) => (
                                          <TouchableOpacity
                                            key={it.id || idx2}
                                            onPress={() =>
                                              fetchDetails(
                                                it.deviceType,
                                                it.brand,
                                                it.model
                                              )
                                            }
                                            activeOpacity={0.7}
                                            style={styles.deviceSquare}
                                          >
                                            {getDeviceIcon(it.deviceType)}
                                          </TouchableOpacity>
                                        ))}

                                      {/* Label / trash */}
                                      {labelUri ? (
                                        <TouchableOpacity
                                          style={styles.iconSquare}
                                          activeOpacity={0.85}
                                          onPress={() =>
                                            navigation.navigate(
                                              "ImageGallery",
                                              { clientId: item.id }
                                            )
                                          }
                                          onLongPress={() =>
                                            confirmDeleteClient(item.id)
                                          }
                                          delayLongPress={400}
                                        >
                                          <Image
                                            source={{ uri: labelUri }}
                                            style={styles.labelInSquare}
                                          />
                                        </TouchableOpacity>
                                      ) : (
                                        <TouchableOpacity
                                          style={styles.iconSquare}
                                          onPress={() =>
                                            confirmDeleteClient(item.id)
                                          }
                                          activeOpacity={0.8}
                                        >
                                          <Image
                                            source={require("../assets/icons/trash.png")}
                                            style={{
                                              width: 28,
                                              height: 28,
                                              tintColor: "red",
                                            }}
                                            resizeMode="contain"
                                          />
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  </>
                                );
                              })()}
                            </View>
                          </Animatable.View>
                        );
                      
  };

  const logMessage = (message) =>
    setProcessLogs((prevLogs) => [...prevLogs, message]);

  const eligibleInterventions = [];
  const updateClientNotification = async (client, method) => {
    try {
      if (!client || !client.id) return;

      const latestI = __pickLatestActiveIntervention(
        client.interventions || []
      );
      const latestO = __pickLatestActiveOrder(client.orders || []);

      let error,
        updated = false;

      if (latestI) {
        ({ error } = await supabase
          .from("interventions")
          .update({ is_notified: true, notifiedBy: method || "autre" })
          .eq("id", latestI.id));
        updated = true;
      } else if (latestO) {
        ({ error } = await supabase
          .from("orders")
          .update({ notified: true, notified_method: method || "autre" })
          .eq("id", latestO.id));
        updated = true;
      }

      if (!error && updated) {
        await loadClients();
        setNotifyModalVisible(false);
      } else if (error) {
        console.error("update notif:", error);
      }
    } catch (e) {
      console.error("update notif ex:", e);
    }
  };

  const loadRepairedNotReturnedCount = async () => {
    try {
      const { data, error } = await supabase
        .from("interventions")
        .select("*")
        .eq("status", "Réparé")
        .eq("restitue", false)
        .or("on_hold.eq.false,on_hold.is.null");

      if (error) throw error;

      setRepairedNotReturnedCount(data.length);
    } catch (error) {
      console.error(
        "Erreur lors du chargement des fiches réparées non restituées:",
        error
      );
    }
  };

  const loadNotRepairedNotReturnedCount = async () => {
    try {
      const { data, error } = await supabase
        .from("interventions")
        .select("*")
        .eq("status", "Non réparable")
        .eq("restitue", false);

      if (error) throw error;

      setNotRepairedNotReturnedCount(data.length);
    } catch (error) {
      console.error(
        "Erreur lors du chargement des fiches non réparables non restituées:",
        error
      );
    }
  };

  const goToImageGallery = (clientId) => {
    navigation.navigate("ImageGallery", { clientId });
  };

  // Ajout d'une photo à l'intervention directement depuis la Home
  // (même bucket/dossier "supplementaires" que la création d'intervention).
  const uploadInterventionPhotoAsset = async (interventionId, asset) => {
    if (!interventionId || !asset?.uri) return;

    setUploadingInterventionId(interventionId);

    try {
      const uriWithoutQuery = asset.uri.split("?")[0];
      const rawExtension =
        uriWithoutQuery.split(".").pop()?.toLowerCase() || "jpg";
      const allowedExtensions = ["jpg", "jpeg", "png", "webp"];
      const extension = allowedExtensions.includes(rawExtension)
        ? rawExtension
        : "jpg";
      const mimeType =
        asset.mimeType ||
        (extension === "png"
          ? "image/png"
          : extension === "webp"
          ? "image/webp"
          : "image/jpeg");

      const filePath = `supplementaires/${interventionId}/${Date.now()}.${extension}`;

      const file = {
        uri: asset.uri,
        name: filePath.split("/").pop(),
        type: mimeType,
      };

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: mimeType,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("images")
        .getPublicUrl(filePath);
      const publicUrl = publicUrlData?.publicUrl || filePath;

      // Relit les photos actuelles pour ne pas écraser une modification concurrente
      const { data: currentRow, error: readError } = await supabase
        .from("interventions")
        .select("product_photos")
        .eq("id", interventionId)
        .single();

      if (readError) throw readError;

      const nextPhotos = [
        ...(Array.isArray(currentRow?.product_photos)
          ? currentRow.product_photos
          : []),
        publicUrl,
      ];

      const { error: updateError } = await supabase
        .from("interventions")
        .update({ product_photos: nextPhotos })
        .eq("id", interventionId);

      if (updateError) throw updateError;

      showAlert("Photo ajoutée", "La photo a été ajoutée à l'intervention.");
      await loadClients();
    } catch (error) {
      console.error("📷❌ Ajout photo intervention (Home) :", error);
      showAlert(
        "Erreur",
        error?.message || "Impossible d'ajouter la photo."
      );
    } finally {
      setUploadingInterventionId(null);
    }
  };

  const uploadOrderPhotoAsset = async (orderId, asset) => {
    if (!orderId || !asset?.uri) return;

    setUploadingOrderPhotoId(orderId);

    try {
      const uriWithoutQuery = asset.uri.split("?")[0];
      const rawExtension =
        uriWithoutQuery.split(".").pop()?.toLowerCase() || "jpg";
      const allowedExtensions = ["jpg", "jpeg", "png", "webp"];
      const extension = allowedExtensions.includes(rawExtension)
        ? rawExtension
        : "jpg";
      const mimeType =
        asset.mimeType ||
        (extension === "png"
          ? "image/png"
          : extension === "webp"
          ? "image/webp"
          : "image/jpeg");

      const filePath = `commandes/${orderId}/${Date.now()}.${extension}`;

      const file = {
        uri: asset.uri,
        name: filePath.split("/").pop(),
        type: mimeType,
      };

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: mimeType,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("images")
        .getPublicUrl(filePath);
      const publicUrl = publicUrlData?.publicUrl || filePath;

      // Relit les photos actuelles pour ne pas écraser une modification concurrente
      const { data: currentRow, error: readError } = await supabase
        .from("orders")
        .select("order_photos")
        .eq("id", orderId)
        .single();

      if (readError) throw readError;

      let rawPhotos = [];
      if (Array.isArray(currentRow?.order_photos)) {
        rawPhotos = currentRow.order_photos;
      } else if (
        typeof currentRow?.order_photos === "string" &&
        currentRow.order_photos.trim()
      ) {
        const value = currentRow.order_photos.trim();
        try {
          const parsed = JSON.parse(value);
          rawPhotos = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          rawPhotos = value.includes(",")
            ? value.split(",").map((p) => p.trim()).filter(Boolean)
            : [value];
        }
      }

      const nextPhotos = [...rawPhotos, publicUrl];

      const { error: updateError } = await supabase
        .from("orders")
        .update({ order_photos: nextPhotos })
        .eq("id", orderId);

      if (updateError) throw updateError;

      showAlert("Photo ajoutée", "La photo a été ajoutée à la commande.");
      await loadClients();
    } catch (error) {
      console.error("📷❌ Ajout photo commande (Home) :", error);
      showAlert(
        "Erreur",
        error?.message || "Impossible d'ajouter la photo."
      );
    } finally {
      setUploadingOrderPhotoId(null);
    }
  };

  // Photo de l'appareil (ex: le PC) lié à une commande sans intervention,
  // distincte de la photo de la pièce commandée (order_photos ci-dessus).
  const uploadOrderProductPhotoAsset = async (orderId, asset) => {
    if (!orderId || !asset?.uri) return;

    setUploadingOrderProductPhotoId(orderId);

    try {
      const uriWithoutQuery = asset.uri.split("?")[0];
      const rawExtension =
        uriWithoutQuery.split(".").pop()?.toLowerCase() || "jpg";
      const allowedExtensions = ["jpg", "jpeg", "png", "webp"];
      const extension = allowedExtensions.includes(rawExtension)
        ? rawExtension
        : "jpg";
      const mimeType =
        asset.mimeType ||
        (extension === "png"
          ? "image/png"
          : extension === "webp"
          ? "image/webp"
          : "image/jpeg");

      const filePath = `commandes-appareil/${orderId}/${Date.now()}.${extension}`;

      const file = {
        uri: asset.uri,
        name: filePath.split("/").pop(),
        type: mimeType,
      };

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: mimeType,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("images")
        .getPublicUrl(filePath);
      const publicUrl = publicUrlData?.publicUrl || filePath;

      // Relit les photos actuelles pour ne pas écraser une modification concurrente
      const { data: currentRow, error: readError } = await supabase
        .from("orders")
        .select("product_photos")
        .eq("id", orderId)
        .single();

      if (readError) throw readError;

      const nextPhotos = [
        ...(Array.isArray(currentRow?.product_photos)
          ? currentRow.product_photos
          : []),
        publicUrl,
      ];

      const { error: updateError } = await supabase
        .from("orders")
        .update({ product_photos: nextPhotos })
        .eq("id", orderId);

      if (updateError) throw updateError;

      showAlert("Photo ajoutée", "La photo a été ajoutée.");
      await loadClients();
    } catch (error) {
      console.error("📷❌ Ajout photo appareil (commande, Home) :", error);
      showAlert(
        "Erreur",
        error?.message || "Impossible d'ajouter la photo."
      );
    } finally {
      setUploadingOrderProductPhotoId(null);
    }
  };

  const deleteInterventionPhoto = (interventionId, uri) => {
    if (!interventionId || !uri) return;
    setDeletePhotoTarget({ interventionId, uri });
  };

  const confirmDeleteInterventionPhoto = async () => {
    const target = deletePhotoTarget;
    setDeletePhotoTarget(null);
    if (!target) return;
    const { interventionId, uri } = target;

    try {
      const path = pathFromSupabaseUrl(uri);
      if (path) {
        const { error: storageError } = await supabase.storage
          .from("images")
          .remove([path]);
        if (storageError) {
          console.error("🗑️❌ Suppression Storage :", storageError);
        }
      }

      const { data: currentRow, error: readError } = await supabase
        .from("interventions")
        .select("product_photos")
        .eq("id", interventionId)
        .single();

      if (readError) throw readError;

      const nextPhotos = (
        Array.isArray(currentRow?.product_photos)
          ? currentRow.product_photos
          : []
      ).filter((p) => p !== uri);

      const { error: updateError } = await supabase
        .from("interventions")
        .update({ product_photos: nextPhotos })
        .eq("id", interventionId);

      if (updateError) throw updateError;

      await loadClients();
    } catch (error) {
      console.error("🗑️❌ Suppression photo intervention (Home) :", error);
      showAlert("Erreur", error?.message || "Impossible de supprimer cette image.");
    }
  };

  const deleteOrderPhoto = (orderId, uri) => {
    if (!orderId || !uri) return;
    setDeleteOrderPhotoTarget({ orderId, uri });
  };

  const confirmDeleteOrderPhoto = async () => {
    const target = deleteOrderPhotoTarget;
    setDeleteOrderPhotoTarget(null);
    if (!target) return;
    const { orderId, uri } = target;

    try {
      const path = pathFromSupabaseUrl(uri);
      if (path) {
        const { error: storageError } = await supabase.storage
          .from("images")
          .remove([path]);
        if (storageError) {
          console.error("🗑️❌ Suppression Storage (commande) :", storageError);
        }
      }

      const { data: currentRow, error: readError } = await supabase
        .from("orders")
        .select("order_photos")
        .eq("id", orderId)
        .single();

      if (readError) throw readError;

      let rawPhotos = [];
      if (Array.isArray(currentRow?.order_photos)) {
        rawPhotos = currentRow.order_photos;
      } else if (
        typeof currentRow?.order_photos === "string" &&
        currentRow.order_photos.trim()
      ) {
        const value = currentRow.order_photos.trim();
        try {
          const parsed = JSON.parse(value);
          rawPhotos = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          rawPhotos = value.includes(",")
            ? value.split(",").map((p) => p.trim()).filter(Boolean)
            : [value];
        }
      }

      const toPublicUrl = (rawValue) => {
        if (!rawValue || typeof rawValue !== "string") return null;
        if (/^https?:\/\//i.test(rawValue)) return rawValue;
        const cleanPath = rawValue.replace(/^\/+/, "").replace(/^images\//i, "");
        const { data } = supabase.storage.from("images").getPublicUrl(cleanPath);
        return data?.publicUrl || null;
      };

      const nextPhotos = rawPhotos.filter(
        (rawValue) => toPublicUrl(rawValue) !== uri
      );

      const { error: updateError } = await supabase
        .from("orders")
        .update({ order_photos: nextPhotos })
        .eq("id", orderId);

      if (updateError) throw updateError;

      await loadClients();
    } catch (error) {
      console.error("🗑️❌ Suppression photo commande (Home) :", error);
      showAlert("Erreur", error?.message || "Impossible de supprimer cette image.");
    }
  };

  const deleteOrderProductPhoto = (orderId, uri) => {
    if (!orderId || !uri) return;
    setDeleteOrderProductPhotoTarget({ orderId, uri });
  };

  const confirmDeleteOrderProductPhoto = async () => {
    const target = deleteOrderProductPhotoTarget;
    setDeleteOrderProductPhotoTarget(null);
    if (!target) return;
    const { orderId, uri } = target;

    try {
      const path = pathFromSupabaseUrl(uri);
      if (path) {
        const { error: storageError } = await supabase.storage
          .from("images")
          .remove([path]);
        if (storageError) {
          console.error("🗑️❌ Suppression Storage (appareil commande) :", storageError);
        }
      }

      const { data: currentRow, error: readError } = await supabase
        .from("orders")
        .select("product_photos")
        .eq("id", orderId)
        .single();

      if (readError) throw readError;

      const nextPhotos = (
        Array.isArray(currentRow?.product_photos)
          ? currentRow.product_photos
          : []
      ).filter((p) => p !== uri);

      const { error: updateError } = await supabase
        .from("orders")
        .update({ product_photos: nextPhotos })
        .eq("id", orderId);

      if (updateError) throw updateError;

      await loadClients();
    } catch (error) {
      console.error("🗑️❌ Suppression photo appareil (commande, Home) :", error);
      showAlert("Erreur", error?.message || "Impossible de supprimer cette image.");
    }
  };

  const openImageModal = (url) => {
    setImageModalUrl(url);
    setImageModalVisible(true);
  };

  const takeAndUploadInterventionPhoto = async (interventionId) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      showAlert(
        "Permission requise",
        "Autorisez l'accès à la caméra pour prendre des photos."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    await uploadInterventionPhotoAsset(interventionId, asset);
  };

  const pickAndUploadInterventionPhoto = async (interventionId) => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      showAlert(
        "Permission requise",
        "Autorisez l'accès aux photos pour choisir une image."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    await uploadInterventionPhotoAsset(interventionId, asset);
  };

  const openWebImageSearchForIntervention = async (intervention) => {
    try {
      const query = [
        intervention?.deviceType,
        intervention?.brand,
        intervention?.model,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      if (!query) {
        showAlert(
          "Recherche impossible",
          "Aucun type, marque ou modèle n'est renseigné pour cette intervention."
        );
        return;
      }

      const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
        query
      )}`;

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showAlert("Erreur", "Aucun navigateur ne peut ouvrir cette recherche.");
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      console.error("🌐❌ Recherche image intervention :", error);
      showAlert("Erreur", "Impossible d'ouvrir la recherche d'images.");
    }
  };

  const handleAddInterventionPhoto = (intervention) => {
    if (!intervention?.id) return;
    setPhotoChoiceIntervention(intervention);
  };

  const takeAndUploadOrderPhoto = async (orderId) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      showAlert(
        "Permission requise",
        "Autorisez l'accès à la caméra pour prendre des photos."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    await uploadOrderPhotoAsset(orderId, asset);
  };

  const pickAndUploadOrderPhoto = async (orderId) => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      showAlert(
        "Permission requise",
        "Autorisez l'accès aux photos pour choisir une image."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    await uploadOrderPhotoAsset(orderId, asset);
  };

  const openWebImageSearchForOrder = async (order) => {
    try {
      const query = [order?.product, order?.brand, order?.model]
        .filter(Boolean)
        .join(" ")
        .trim();

      if (!query) {
        showAlert(
          "Recherche impossible",
          "Aucun produit, marque ou modèle n'est renseigné pour cette commande."
        );
        return;
      }

      const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(
        query
      )}`;

      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showAlert("Erreur", "Aucun navigateur ne peut ouvrir cette recherche.");
        return;
      }

      await Linking.openURL(url);
    } catch (error) {
      console.error("🌐❌ Recherche image commande :", error);
      showAlert("Erreur", "Impossible d'ouvrir la recherche d'images.");
    }
  };

  const handleAddOrderPhoto = (order) => {
    if (!order?.id) return;
    setPhotoChoiceOrder(order);
  };

  const takeAndUploadOrderProductPhoto = async (orderId) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      showAlert(
        "Permission requise",
        "Autorisez l'accès à la caméra pour prendre des photos."
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    await uploadOrderProductPhotoAsset(orderId, asset);
  };

  const pickAndUploadOrderProductPhoto = async (orderId) => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      showAlert(
        "Permission requise",
        "Autorisez l'accès aux photos pour choisir une image."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: false,
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    await uploadOrderProductPhotoAsset(orderId, asset);
  };

  const handleAddOrderProductPhoto = (order) => {
    if (!order?.id) return;
    setPhotoChoiceOrderProduct(order);
  };

  const loadClients = async (sortBy = "createdAt", orderAsc = false) => {
    setIsLoading(true);
    try {
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select(
          `
					*,
					updatedAt,
					interventions(
						id,
						status,
						deviceType,
						brand,
            description,
						model,
						cost,
						solderestant,
						createdAt,
						"updatedAt",
						commande,
						commande_effectuee,
						photos,
						product_photos,
						label_photo,
						notifiedBy,
						notify_type,
						accept_screen_risk,
						devis_cost,
						imprimee,
						print_etiquette,
            is_estimate,
            estimate_min,
            estimate_max,
            estimate_type,
            estimate_accepted,
            info_note,
            loaned_item,
            loaned_item_returned,
restitution_note,
restitution_note_done,
on_hold
),
orders(
  id,
  client_id,
  price,
  deposit,
  quantity,
  total,
  product,
  brand,
  model,
  paid,
  saved,
  recovered,
  notified,
  deleted,
  createdat,
  on_hold,
  order_items(
    id,
    order_id,
    product,
    quantity,
    ordered,
    received,
    installed
  )
)

    `
        )
        .order("createdAt", { ascending: false });

      if (clientsError) throw clientsError;

const { data: ordersData, error: ordersError } = await supabase
  .from("orders")
  .select("*, order_items(product, fournisseur)");

if (ordersError) throw ordersError;

// Transforme les photos des commandes en URL affichables
const normalizedOrdersData = (ordersData || [])
  .filter((order) => {
    const isDeleted =
      order?.deleted === true ||
      order?.deleted === "true" ||
      order?.deleted === 1 ||
      order?.deleted === "1";

    const isPaid =
      order?.paid === true ||
      order?.paid === "true" ||
      order?.paid === 1 ||
      order?.paid === "1";

    const isSaved =
      order?.saved === true ||
      order?.saved === "true" ||
      order?.saved === 1 ||
      order?.saved === "1";

    // Une commande est affichée uniquement si elle est :
    // non supprimée, non payée et non sauvegardée.
    return !isDeleted && !isPaid && !isSaved;
  })
  .map((order) => {
    let rawPhotos = [];

    if (Array.isArray(order.order_photos)) {
      rawPhotos = order.order_photos;
    } else if (
      typeof order.order_photos === "string" &&
      order.order_photos.trim()
    ) {
      const value = order.order_photos.trim();

      try {
        const parsed = JSON.parse(value);
        rawPhotos = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        rawPhotos = value.includes(",")
          ? value
              .split(",")
              .map((photo) => photo.trim())
              .filter(Boolean)
          : [value];
      }
    } else if (order.order_photos) {
      rawPhotos = [order.order_photos];
    }

    const photoUrls = rawPhotos
      .map((photo) => {
        const rawValue =
          typeof photo === "string"
            ? photo
            : photo?.url ||
              photo?.publicUrl ||
              photo?.uri ||
              photo?.path ||
              "";

        if (!rawValue || typeof rawValue !== "string") {
          return null;
        }

        const value = rawValue.trim();

        if (!value) return null;

        if (/^https?:\/\//i.test(value)) {
          return value;
        }

        // Une image locale ne peut pas être affichée après redémarrage
        if (
          value.startsWith("file://") ||
          value.startsWith("content://")
        ) {
          console.warn(
            "⚠️ Photo commande encore locale dans loadClients :",
            value
          );

          return null;
        }

        const cleanPath = value
          .replace(/^\/+/, "")
          .replace(/^images\//i, "");

        const { data } = supabase.storage
          .from("images")
          .getPublicUrl(cleanPath);

        return data?.publicUrl || null;
      })
      .filter(Boolean);

    return {
      ...order,
      notified: toBool(order.notified),
      order_photos: photoUrls,
    };
  });

const ordersByClient = {};

normalizedOrdersData.forEach((order) => {
        
        const clientId = String(order.client_id);
        if (!ordersByClient[clientId]) {
          ordersByClient[clientId] = {
            total: 0,
            deposit: 0,
            remaining: 0,
            hasUnpaid: false,
            hasUnsaved: false,
            orders: ordersByClient[clientId]?.orders || [],
          };
        }
        ordersByClient[clientId].orders.push(order);
        ordersByClient[clientId].total += order.price || 0;
        ordersByClient[clientId].deposit += order.deposit || 0;

        if (!order.paid) {
          ordersByClient[clientId].remaining +=
            (order.price || 0) - (order.deposit || 0);
          ordersByClient[clientId].hasUnpaid = true;
        }
        if (!order.saved) {
          ordersByClient[clientId].hasUnsaved = true;
        }
      });

      if (clientsData) {
        const updatedData = clientsData.map((client) => {
          const clientId = String(client.id);
          const interventions = Array.isArray(client.interventions)
            ? client.interventions
            : [];

          const ongoingInterventions = interventions.filter(
            (intervention) =>
              intervention.status !== "Réparé" &&
              intervention.status !== "Récupéré" &&
              intervention.status !== "Non réparable"
          );

          const totalAmountOngoing = ongoingInterventions.reduce(
            (total, intervention) =>
              total +
              (parseFloat(intervention.cost) ||
                parseFloat(intervention.solderestant) ||
                0),
            0
          );

          const totalDevisAmount = interventions.reduce(
            (total, intervention) =>
              intervention.status === "Devis en cours" &&
              intervention.devis_cost
                ? total + parseFloat(intervention.devis_cost)
                : total,
            0
          );

          const totalOrderAmount = ordersByClient[clientId]?.total || 0;
          const totalOrderDeposit = ordersByClient[clientId]?.deposit || 0;
          const totalOrderRemaining = ordersByClient[clientId]?.remaining || 0;
          const clientOrders = ordersByClient[clientId]?.orders || [];

          return {
            ...client,
            orders: clientOrders,
            totalInterventions: interventions.length,
            devis_cost: totalDevisAmount,
            clientUpdatedAt: client.updatedAt,
            interventions: interventions.map((intervention) => ({
              ...intervention,
              interventionUpdatedAt: intervention.updatedAt,
            })),
            totalAmountOngoing,
            totalOrderAmount,
            totalOrderDeposit,
            totalOrderRemaining,
            hasOrderUnsaved: ordersByClient[clientId]?.hasUnsaved || false,
          };
        });

        setClients(updatedData);

        const clientsToShow = updatedData
          .filter((client) => {
            const interventions = client.interventions || [];
            const orders = client.orders || [];

            const hasInterventionEnCours = interventions.some(
              (intervention) =>
                intervention.status !== "Réparé" &&
                intervention.status !== "Récupéré" &&
                intervention.status !== "Non réparable"
            );

            const hasCommandeActive =
              orders.length > 0 &&
              orders.some((order) => !order.saved || !order.paid);

            return hasInterventionEnCours || hasCommandeActive;
          })
          .map((client) => {
            client.interventions = client.interventions
              .filter(
                (intervention) =>
                  intervention.status !== "Réparé" &&
                  intervention.status !== "Récupéré" &&
                  intervention.status !== "Non réparable"
              )
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            client.latestIntervention = client.interventions[0];
            return client;
          });
        clientsToShow.sort(
          (a, b) => __latestInterventionMs(b) - __latestInterventionMs(a)
        );
        setClients(clientsToShow);
        setFilteredClients(clientsToShow);
      }
    } catch (error) {
      console.error("❌ Erreur lors du chargement des clients:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, client_id, paid");
      if (error) throw error;
      setOrders(data);
    } catch (error) {
      console.error("Erreur lors du chargement des commandes:", error);
    }
  };
  const loadExpressInProgress = async () => {
    try {
      const { data, error } = await supabase
        .from("express")
        .select(
          "id, client_id, name, phone, product, device, type, description, price, paid, notified, notified_at, created_at"
        )
        .eq("paid", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setExpressList(data || []);
    } catch (e) {
      console.error("❌ EXPRESS (table) :", e?.message || e);
      setExpressList([]);
    }
  };

  const loadOngoingInterventions = async () => {
    try {
      const { data, error } = await supabase
        .from("interventions")
        .select("*")
        .in("status", [
          "Réparé",
          "En attente de pièces",
          "Intervention en cours",
          "Devis en cours",
        ]);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error(
        "Erreur lors de la récupération des interventions :",
        error
      );
      return [];
    }
  };
  useEffect(() => {
    const fetchAllInterventions = async () => {
      try {
        const { data, error } = await supabase
          .from("interventions")
          .select("*")
          .in("status", [
            "Réparé",
            "En attente de pièces",
            "Intervention en cours",
            "Devis en cours",
          ]);

        if (error) throw error;

        setAllInterventions(data);
        const total = data.reduce(
          (sum, intervention) => sum + (intervention.solderestant || 0),
          0
        );

        setTotalCost(total.toFixed(2));
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des interventions :",
          error
        );
      }
    };

    fetchAllInterventions();
  }, []);

  const fetchDetails = (deviceType, marque, model) => {
    setSelectedDevice({
      deviceType,
      brand: marque || "Inconnu",
      model: model || "Inconnu",
    });
    setIsModalVisible(true);
  };

  useEffect(() => {
    loadRepairedNotReturnedCount();
    loadNotRepairedNotReturnedCount();
  }, []);

  const totalPages = Math.max(1, pages.length);
 const sliderTotalPages = Array.isArray(pages) ? pages.length : 0;
  const currentClients = pages[currentPage - 1] || [];
const goToPreviousPage = () => {
    if (currentPage > 1) {
      const target = currentPage - 2; // index 0-based
      setExpandedClientId(null);
      flatListRef.current?.scrollToIndex({ index: target, animated: true });
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      const target = currentPage; // index 0-based
      setExpandedClientId(null);
      flatListRef.current?.scrollToIndex({ index: target, animated: true });
      setCurrentPage(currentPage + 1);
    }
  };
  useFocusEffect(
    React.useCallback(() => {
      setSortBy("createdAt");
      setOrderAsc(false);
      loadClients();
      loadOrders();
      loadOrdersInProgress();
      loadRepairedNotReturnedCount();
      loadNotRepairedNotReturnedCount();
      loadExpressInProgress(); // ← AJOUT
      checkImagesToDelete();
	  loadPendingRepairProposals();
	  loadOverdueRepairedInterventions();
	  loadNotNotifiedRepaired();
	  loadPartsReceivedInterventions();
	  loadOutstandingBalances();
	  loadOngoingTotal();
    }, [])
  );

  const confirmDeleteClient = (clientId) => {
    setSelectedClientId(clientId);
    setModalVisible(true);
  };
  const handleDeleteClient = async () => {
    try {
      const { data: interventions, error: interventionsError } = await supabase
        .from("interventions")
        .select("*")
        .eq("client_id", selectedClientId);

      if (interventionsError) throw interventionsError;

      if (interventions && interventions.length > 0) {
        showAlert(
          "Suppression impossible",
          "Ce client ne peut pas être supprimé car il a des interventions associées."
        );
        return;
      }

      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", selectedClientId);

      if (error) throw error;

      loadClients();
      setModalVisible(false);
    } catch (error) {
      console.error("Erreur lors de la suppression du client :", error);
    }
  };
  // 🔧 Remplace TOUT ton formatDateTime actuel par ce bloc :
  const parseAsUTC = (s) => {
    if (!s) return null;
    if (s instanceof Date) return s;
    // Déjà avec fuseau ? (Z ou ±HH(:)MM)
    const hasTZ = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
    // Normalise séparateur ' ' -> 'T' pour ISO
    const iso = s.includes("T") ? s : s.replace(" ", "T");
    // Si pas de fuseau -> on force UTC en ajoutant 'Z'
    return new Date(hasTZ ? iso : iso + "Z");
  };

  const formatDateTime = (value) => {
    try {
      const d = parseAsUTC(value);
      if (!d || isNaN(d)) return "Date invalide";
      return new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(d);
    } catch {
      return "Date invalide";
    }
  };

  const filterClients = async (text) => {
    setSearchText(text);
    const requestId = ++searchRequestIdRef.current;

    // si champ vide -> on remet la liste initiale
    if (!text || !text.trim()) {
      if (requestId === searchRequestIdRef.current) setFilteredClients(clients);
      return;
    }

    try {
      setIsLoading(true);

      // ————— normalisations de saisie —————
      const raw = text.trim();
      const query = raw.toUpperCase();
      const digits = raw.replace(/\D+/g, ""); // ne garde que les chiffres

      // détection des types de recherche
      const isFicheNumber = /^\d+$/.test(query);
      const isPhoneNumber = /^0\d{9}$/.test(digits); // tél FR "0XXXXXXXXX"

      // petits helpers pour couvrir les formats
      const toIntl = (d) => (d.startsWith("0") ? "+33" + d.slice(1) : d);
      const to0033 = (d) => (d.startsWith("0") ? "0033" + d.slice(1) : d);
      const wildcard = (s) => s.split("").join("%"); // "0601..." => "0%6%0%1%3%3%0%8%9%1"

      // ————— 1) construire la requête clients —————
      let clientQuery;
      if (isFicheNumber && !isPhoneNumber) {
        // recherche par numéro de fiche
        clientQuery = supabase
          .from("clients")
          .select(
            `
          *,
interventions(
  id, status, deviceType, cost, solderestant,
  createdAt, "updatedAt", commande,
  photos, product_photos, label_photo, notifiedBy, notify_type, print_etiquette, info_note,
  devis_cost, is_estimate, estimate_min, estimate_max, estimate_type, estimate_accepted
)

        `
          )
          .eq("ficheNumber", parseInt(query, 10));
      } else if (isPhoneNumber) {
        // ====== BRANCHE TÉLÉPHONE MODIFIÉE (seule vraie modif) ======
        const dLocal = digits; // 0601330891
        const dIntl = toIntl(digits); // +33601330891
        const d0033 = to0033(digits); // 0033601330891

        const wLocal = wildcard(dLocal); // 0%6%0%1%3%3%0%8%9%1
        const wIntl = wildcard(dIntl).replace(/\+/g, "%+"); // tolère le +
        const w0033 = wildcard(d0033);

        const orParts = [
          `phone.ilike.%${dLocal}%`,
          `phone.ilike.%${dIntl}%`,
          `phone.ilike.%${d0033}%`,
          `phone.ilike.%${wLocal}%`,
          `phone.ilike.%${wIntl}%`,
          `phone.ilike.%${w0033}%`,
        ].join(",");

        clientQuery = supabase
          .from("clients")
          .select(
            `
          *,
interventions(
  id, status, deviceType, description, cost, solderestant,
  createdAt, "updatedAt", commande,
  photos, product_photos, label_photo, notifiedBy, notify_type, print_etiquette, info_note, loaned_item, loaned_item_returned,
  devis_cost, is_estimate, estimate_min, estimate_max, estimate_type, estimate_accepted
)

        `
          )
          .or(orParts);
        // ============================================================
      } else {
        // recherche par NOM
        clientQuery = supabase
          .from("clients")
          .select(
            `
          *,
interventions(
  id, status, deviceType, description, cost, solderestant,
  createdAt, "updatedAt", commande,
  photos, product_photos, label_photo, notifiedBy, notify_type, print_etiquette, info_note,
  devis_cost, is_estimate, estimate_min, estimate_max, estimate_type, estimate_accepted
)

        `
          )
          .ilike("name", `%${query}%`);
      }

      const { data: clientsData, error: clientError } = await clientQuery;
      if (clientError) {
        console.error("❌ Erreur chargement clients :", clientError);
        if (requestId === searchRequestIdRef.current) setFilteredClients([]);
        return;
      }

      // ————— 2) enrichissement avec orders (identique à ton flux) —————
      const combined = clientsData || [];
      if (combined.length === 0) {
        if (requestId === searchRequestIdRef.current) setFilteredClients([]);
        return;
      }

      const { data: ordersData, error: orderError } = await supabase
        .from("orders")
        .select("*, client_id, order_items(product, fournisseur)")
        .in(
          "client_id",
          combined.map((c) => c.id)
        );

      if (orderError) {
        console.error("❌ Erreur chargement commandes :", orderError);
        if (requestId === searchRequestIdRef.current) setFilteredClients(combined);
        return;
      }

      const ordersByClient = {};
      (ordersData || []).forEach((o) => {
        (ordersByClient[o.client_id] ||= []).push(o);
      });

      const enriched = combined.map((client) => {
        const interventions = client.interventions || [];
        const orders = ordersByClient[client.id] || [];

        const ongoingInterventions = interventions.filter(
          (i) =>
            i.status !== "Réparé" &&
            i.status !== "Récupéré" &&
            i.status !== "Non réparable"
        );

        const totalAmountOngoing = interventions
          .filter((i) => (i.solderestant || 0) > 0 && i.status !== "Récupéré")
          .reduce((sum, i) => sum + (i.solderestant || 0), 0);

        const totalOrderRemaining = orders
          .filter((o) => !o.paid)
          .reduce((sum, o) => sum + ((o.price || 0) - (o.deposit || 0)), 0);

        return {
          ...client,
          interventions: ongoingInterventions,
          orders,
          latestIntervention:
            ongoingInterventions.sort(
              (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            )[0] || null,
          totalAmountOngoing,
          totalOrderRemaining,
        };
      });

      enriched.sort(
        (a, b) => __latestInterventionMs(b) - __latestInterventionMs(a)
      );
      if (requestId === searchRequestIdRef.current) setFilteredClients(enriched);
    } catch (e) {
      console.error("❌ Erreur lors de la recherche des clients :", e);
      if (requestId === searchRequestIdRef.current) setFilteredClients([]);
    } finally {
      if (requestId === searchRequestIdRef.current) setIsLoading(false);
    }
  };

  const getIconSource = (status) => {
    switch (status) {
      case "En attente de pièces":
        return require("../assets/icons/shipping.png");
      case "Devis accepté":
        return require("../assets/icons/devisAccepte.png");
      case "Intervention en cours":
        return require("../assets/icons/tools1.png");
      case "Réparé":
        return require("../assets/icons/ok.png");
      case "Devis en cours":
        return require("../assets/icons/devisEnCours.png");
      case "Non réparable":
        return require("../assets/icons/no.png");
      default:
        return require("../assets/icons/order.png");
    }
  };
  const HorizontalSeparator = () => {
    return <View style={styles.separator} />;
  };
  const getIconColor = (status) => {
    switch (status) {
      case "En attente de pièces":
        return "#b396f8"; // Violet
      case "Devis accepté":
        return "#FFD700"; // Doré
      case "Intervention en cours":
        return "#528fe0"; // Bleu
      case "Réparé":
        return "#006400"; // Vert
      case "Devis en cours":
        return "#f37209"; // Orange
      case "Non réparable":
        return "#ff0000"; // Orange
      default:
        return "#04fd57"; // Gris par défaut
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case "En attente de pièces":
        return { borderLeftColor: "#b396f8", borderLeftWidth: 3 };
      case "Devis accepté":
        return { borderLeftColor: "#FFD700", borderLeftWidth: 3 };
      case "Intervention en cours":
        return { borderLeftColor: "#528fe0", borderLeftWidth: 3 };
      case "Réparé":
        return { borderLeftColor: "#98fb98", borderLeftWidth: 3 };
      case "Devis en cours":
        return { borderLeftColor: "#f37209", borderLeftWidth: 3 };
      case "Non réparable":
        return { borderLeftColor: "#ff0000", borderLeftWidth: 3 };
      default:
        return { borderLeftColor: "#868585", borderLeftWidth: 3 };
    }
  };
  const deviceIcons = {
    "PC portable": require("../assets/icons/portable.png"),
    MacBook: require("../assets/icons/macbook_air.png"),
    iMac: require("../assets/icons/iMac.png"),
    "PC Fixe": require("../assets/icons/ordinateur (1).png"),
    "PC tout en un": require("../assets/icons/allInone.png"),
    Tablette: require("../assets/icons/tablette.png"),
    Smartphone: require("../assets/icons/smartphone.png"),
    Console: require("../assets/icons/console-de-jeu.png"),
    "Disque dur": require("../assets/icons/disk.png"),
    "Disque dur externe": require("../assets/icons/disque-dur.png"),
    "Carte SD": require("../assets/icons/carte-memoire.png"),
    "Cle usb": require("../assets/icons/cle-usb.png"),
    "Casque audio": require("../assets/icons/playaudio.png"),
    "Video-projecteur": require("../assets/icons/Projector.png"),
    Clavier: require("../assets/icons/keyboard.png"),
    Ecran: require("../assets/icons/screen.png"),
    iPAD: require("../assets/icons/iPad.png"),
    Imprimante: require("../assets/icons/printer.png"),
    Joystick: require("../assets/icons/joystick.png"),
    Processeur: require("../assets/icons/cpu.png"),
    Batterie: require("../assets/icons/battery.png"),
    Commande: require("../assets/icons/shipping_box.png"),
    "Carte graphique": require("../assets/icons/Vga_card.png"),
    Manette: require("../assets/icons/controller.png"),
    Enceinte: require("../assets/icons/speaker.png"),
    PDA: require("../assets/icons/Pda.png"),
    default: require("../assets/icons/point-dinterrogation.png"),
  };

  const getDeviceIcon = (deviceType) => {
    if (!deviceType)
      return (
        <Image
          source={deviceIcons.default}
          style={{ width: 40, height: 40, tintColor: "#888787" }}
        />
      );

    const lowerCaseName = deviceType.toLowerCase();

    if (lowerCaseName.includes("macbook")) {
      return (
        <Image
          source={deviceIcons.MacBook}
          style={{ width: 40, height: 40, tintColor: "#888787" }}
        />
      );
    }

    if (lowerCaseName.includes("imac")) {
      return (
        <Image
          source={deviceIcons.iMac}
          style={{ width: 40, height: 40, tintColor: "#888787" }}
        />
      );
    }

    const iconSource = deviceIcons[deviceType] || deviceIcons.default;
    return (
      <Image
        source={iconSource}
        style={{ width: 40, height: 40, tintColor: "#888787" }}
      />
    );
  };

  const filterByStatus = (status) => {
    if (!showClients) {
      const filtered = clients.filter((client) =>
        client.interventions.some(
          (intervention) => intervention.status === status
        )
      );
      setFilteredClients(filtered);
      setShowClients(true);
    } else {
      const filtered = clients.filter((client) =>
        client.interventions.some(
          (intervention) => intervention.status === status
        )
      );
      setFilteredClients(filtered);
    }
  };

  const resetFilter = () => {
    setSearchText("");
    setFilteredClients(clients);
    setCurrentPage(1);
    setExpandedClientId(null);
    flatListRef.current?.scrollToIndex({ index: 0, animated: true });
  };

  const formatPhoneNumber = (phoneNumber) => {
    if (!phoneNumber) return "";

    return phoneNumber.replace(/(\d{2})(?=\d)/g, "$1 ");
  };
  const toggleMenu = () => {
    Animated.timing(slideAnim, {
      toValue: menuVisible ? -250 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setMenuVisible(!menuVisible);
  };
  const closeMenu = () => {
    if (menuVisible) {
      toggleMenu();
    }
  };

  const handleLogout = async () => {
    try {
      console.log("Déconnexion en cours...");

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Erreur lors de la déconnexion :", error);
        showAlert(
          "Erreur",
          "Impossible de se déconnecter. Veuillez réessayer."
        );
        return;
      }

      console.log("Déconnexion réussie ! Redirection vers Login...");
    } catch (err) {
      console.error("Erreur inattendue lors de la déconnexion :", err);
      showAlert("Erreur", "Une erreur inattendue est survenue.");
    }
  };

  const DateDisplay = () => {
    const [currentDate, setCurrentDate] = useState("");
    const [dateVisible, setDateVisible] = useState(false);

    useEffect(() => {
      const now = new Date();
      const formattedDate = now.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      setCurrentDate(formattedDate);
    }, []);

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setDateVisible((prev) => !prev)}
        style={styles.dateContainer}
      >
        <Image
          source={require("../assets/icons/calendar.png")}
          style={styles.icon}
        />
        {dateVisible && <Text style={styles.dateText}>{currentDate}</Text>}
      </TouchableOpacity>
    );
  };
  const TimeDisplay = () => {
    const [currentTime, setCurrentTime] = useState("");

    useEffect(() => {
      const interval = setInterval(() => {
        const now = new Date();
        const formattedTime = now.toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        setCurrentTime(formattedTime);
      }, 1000);

      return () => clearInterval(interval);
    }, []);

    return (
      <View style={styles.timeContainer}>
        <Image
          source={require("../assets/icons/clock.png")}
          style={styles.icon}
        />
        <Text style={styles.timeText}>{currentTime}</Text>
      </View>
    );
  };
  const [orders, setOrders] = useState([]);

  const getOrderColor = (clientOrders = []) => {
    if (!Array.isArray(clientOrders) || clientOrders.length === 0) {
      return "#888787"; // ⚪ Gris, aucune commande
    }

    const hasUnsavedAndPaid = clientOrders.some(
      (order) => order.paid && !order.saved
    );
    if (hasUnsavedAndPaid) {
      return "#00fd00"; // 🟢 Vert, commande payée prête à sauvegarder
    }

    const hasUnpaidOrder = clientOrders.some((order) => !order.paid);
    if (hasUnpaidOrder) {
      return "#f8b705"; // 🔴 Rouge, commande créée mais non payée
    }

    return "#888787"; // ⚪ Gris, tout est sauvegardé et payé
  };

  const filterClientsWithCommandeEnCours = async () => {
    try {
      const { data: unpaidOrders, error: orderError } = await supabase
  .from("orders")
.select(
  "id, client_id, paid, saved, deleted, price, deposit, product, brand, model, notified, quantity, total, order_photos"
)
  .or("paid.eq.false,saved.eq.false")
  .or("deleted.eq.false,deleted.is.null");

      const { data: interventions, error: interventionError } = await supabase
        .from("interventions")
        .select("*")
        .not("commande", "is", null)
        .neq("commande", "")
        .not("status", "in", '("Réparé","Récupéré")');

      if (orderError || interventionError) {
        console.error("❌ Erreur Supabase :", orderError || interventionError);
        return;
      }
const activeOrders = (unpaidOrders || []).filter((order) => {
  const isDeleted =
    order?.deleted === true ||
    order?.deleted === "true" ||
    order?.deleted === 1 ||
    order?.deleted === "1";

  return !isDeleted;
});
const ordersWithPhotos = activeOrders.map((order) => {
  let rawPhotos = [];

  if (Array.isArray(order.order_photos)) {
    rawPhotos = order.order_photos;
  } else if (
    typeof order.order_photos === "string" &&
    order.order_photos.trim()
  ) {
    const value = order.order_photos.trim();

    try {
      const parsed = JSON.parse(value);
      rawPhotos = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      rawPhotos = value.includes(",")
        ? value
            .split(",")
            .map((photo) => photo.trim())
            .filter(Boolean)
        : [value];
    }
  } else if (order.order_photos) {
    rawPhotos = [order.order_photos];
  }

  const photoUrls = rawPhotos
    .map((photo) => {
      // Accepte une URL simple ou un objet { url, uri, path }
      const rawValue =
        typeof photo === "string"
          ? photo
          : photo?.url ||
            photo?.publicUrl ||
            photo?.uri ||
            photo?.path ||
            "";

      if (!rawValue || typeof rawValue !== "string") {
        return null;
      }

      const value = rawValue.trim();

      if (!value) return null;

      // URL Internet ou URL publique Supabase
      if (/^https?:\/\//i.test(value)) {
        return value;
      }

      // Une adresse locale file:// ne peut pas être relue après l’upload
      if (
        value.startsWith("file://") ||
        value.startsWith("content://")
      ) {
        console.warn(
          "⚠️ Photo de commande encore locale :",
          value
        );
        return null;
      }

      // Nettoyage d’un éventuel préfixe du nom du bucket
      const cleanPath = value
        .replace(/^\/+/, "")
        .replace(/^images\//i, "");

      const { data } = supabase.storage
        .from("images")
        .getPublicUrl(cleanPath);

      return data?.publicUrl || null;
    })
    .filter(Boolean);

  console.log("📷 Photos commande Home :", {
    orderId: order.id,
    original: order.order_photos,
    urls: photoUrls,
  });

  return {
    ...order,
    order_photos: photoUrls,
  };
});
      const clientIdsFromOrders = ordersWithPhotos
        .map((o) => o.client_id)
        .filter(Boolean);
      const clientIdsFromInterventions = interventions
        .map((i) => i.client_id)
        .filter(Boolean);
      const allClientIds = [
        ...new Set([...clientIdsFromOrders, ...clientIdsFromInterventions]),
      ];

      if (allClientIds.length === 0) {
        console.warn("Aucun client avec commande en cours.");
        setFilteredClients([]);
        return;
      }

      const { data: clients, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .in("id", allClientIds)
        .order("createdAt", { ascending: false });

      if (clientError) {
        console.error("❌ Erreur chargement clients :", clientError.message);
        return;
      }

      const enrichedClients = clients.map((client) => {
        const clientOrders = ordersWithPhotos.filter(
          (o) => o.client_id === client.id
        );
        const clientInterventions = interventions.filter(
          (i) => i.client_id === client.id
        );

        const latestIntervention = clientInterventions.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        )[0];

        const totalOrderAmount = clientOrders.reduce(
          (sum, o) => sum + (parseFloat(o.price) || 0),
          0
        );
        const totalOrderDeposit = clientOrders.reduce(
          (sum, o) => sum + (parseFloat(o.deposit) || 0),
          0
        );
        const totalOrderRemaining = totalOrderAmount - totalOrderDeposit;

        return {
          ...client,
          orders: clientOrders,
          interventions: clientInterventions,
          latestIntervention,
          totalOrderAmount,
          totalOrderDeposit,
          totalOrderRemaining,
        };
      });

      setFilteredClients(enrichedClients);
    } catch (err) {
      console.error("❌ Erreur inattendue :", err.message);
    }
  };

  const isOrderNotified = (client) =>
    client.orders?.some((o) => o.notified === true) || false;
  const repairedNotReturnedCountSafe = Number(repairedNotReturnedCount ?? 0);
  const notRepairableCountSafe = Number(NotRepairedNotReturnedCount ?? 0);
  const hasAny = repairedNotReturnedCountSafe + notRepairableCountSafe > 0;
  
  const handleSearchClientPick = (client) => {
  if (!client) return;

  if (client.banned === true) {
    openBannedAlert(client);
    return;
  }

  Keyboard.dismiss();

  setSearchSelectedClient(client);
  setSearchActionVisible(true);

  // Ferme immédiatement la liste de recherche
  setSearchText("");
  
};


const closeSearchActions = () => {
  setSearchActionVisible(false);
  setSearchSelectedClient(null);
};

const goToAddInterventionFromSearch = () => {
  const client = searchSelectedClient;
  if (!client?.id) return;

  closeSearchActions();
  setSearchText("");

  navigation.navigate("AddIntervention", {
    clientId: client.id,
  });
};

const goToOrderFromSearch = () => {
  const client = searchSelectedClient;
  if (!client?.id) return;

  closeSearchActions();
  setSearchText("");

  navigation.navigate("OrdersPage", {
    clientId: client.id,
    clientName: client.name || "",
    clientPhone: client.phone || "",
    clientNumber: client.ficheNumber || "",
  });
};

const goToClientFromSearch = () => {
  const client = searchSelectedClient;
  if (!client?.id) return;

  closeSearchActions();
  setSearchText("");

  navigation.navigate("ClientInterventionsPage", {
    clientId: client.id,
  });
};
const selectedClientActiveInterventions = (
  searchSelectedClient?.interventions || []
).filter(__isActiveIntervention);

const selectedClientActiveOrders = (
  searchSelectedClient?.orders || []
).filter(__isActiveOrder);

const selectedClientInterventionCount =
  selectedClientActiveInterventions.length;

const selectedClientOrderCount = selectedClientActiveOrders.length;
  return (
    <View style={{ flex: 1, backgroundColor: "#e0e0e0", elevation: 5 }}>
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={[styles.container, { paddingHorizontal: 15 }]}>
            <TouchableOpacity style={styles.menuButton} onPress={toggleMenu}>
              <Image
                source={require("../assets/icons/menu.png")}
                style={styles.menuIcon}
              />
            </TouchableOpacity>
            <DateDisplay />
            <Animated.View
              style={[
                styles.drawer,
                { transform: [{ translateX: slideAnim }] },
              ]}
            >
              <Text style={styles.drawerTitle}>Menu</Text>

              <Text style={styles.sectionTitle}>Navigation</Text>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  navigation.navigate("Home");
                }}
              >
                <Image
                  source={require("../assets/icons/home.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor:
                        navigation.getState().index === 0 ? "blue" : "gray",
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>ACCUEIL</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  navigation.navigate("AddClient");
                }}
              >
                <Image
                  source={require("../assets/icons/add.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor:
                        navigation.getState().index === 1 ? "blue" : "gray",
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>AJOUTER CLIENT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  navigation.navigate("RepairedInterventions");
                }}
              >
                <Image
                  source={require("../assets/icons/tools1.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor:
                        navigation.getState().index === 2 ? "blue" : "gray",
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>RÉPARÉS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  navigation.navigate("RecoveredClients");
                }}
              >
                <Image
                  source={require("../assets/icons/ok.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor:
                        navigation.getState().index === 2 ? "blue" : "gray",
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>RESTITUÉS</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  navigation.navigate("Admin");
                }}
              >
                <Image
                  source={require("../assets/icons/Config.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor:
                        navigation.getState().index === 3 ? "blue" : "gray",
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>ADMINISTRATION</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  setLogoutConfirmVisible(true);
                }}
              >
                <Image
                  source={require("../assets/icons/disconnects.png")}
                  style={[styles.drawerItemIcon, { tintColor: "red" }]}
                />
                <Text style={styles.drawerItemText}>DÉCONNEXION</Text>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>Filtres</Text>
              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  filterByStatus("En attente de pièces");
                }}
              >
                <Image
                  source={require("../assets/icons/shipping.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor: getIconColor("En attente de pièces"),
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>EN ATTENTE DE PIECE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu(); // Ferme le menu
                  filterByStatus("Devis accepté");
                }}
              >
                <Image
                  source={require("../assets/icons/devisAccepte.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor: getIconColor("Devis accepté"),
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>DEVIS ACCEPTÉ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  filterByStatus("Intervention en cours");
                }}
              >
                <Image
                  source={require("../assets/icons/tools1.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor: getIconColor("Intervention en cours"),
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>Intervention en cours</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  filterByStatus("Devis en cours");
                }}
              >
                <Image
                  source={require("../assets/icons/devisEnCours.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor: getIconColor("Devis en cours"),
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>DEVIS EN COURS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  navigation.navigate("MigrateOldImagesPage");
                }}
              >
                <Image
                  source={require("../assets/icons/upload.png")}
                  style={[styles.drawerItemIcon, { tintColor: "#4CAF50" }]}
                />
                <Text style={styles.drawerItemText}>MIGRATION IMAGES</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.drawerItem}
                onPress={() => {
                  toggleMenu();
                  resetFilter();
                  setCurrentPage(1);
                }}
              >
                <Image
                  source={require("../assets/icons/reload.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor: getIconColor("Réinitialiser"),
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>RÉINITIALISER</Text>
              </TouchableOpacity>
            </Animated.View>
            <View style={styles.overlay}>
              <View style={styles.headerContainer}>

                {isLoading && <ActivityIndicator size="large" color="blue" />}

                {!isLoading && hasImagesToDelete === true && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate("ImageCleanup")}
                    style={{
                      marginRight: 40,
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 2,
                      borderWidth: 1,
                      borderColor: "#888787",
                      backgroundColor: "#191f2f",
                    }}
                  > 
                    <Text style={{ color: "white" }}>Nettoyer les images</Text>
                  </TouchableOpacity>
                )}

                {!isLoading && hasImagesToDelete === false && (
                  <View style={styles.images_numberText}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate("StoredImages")}
                      style={styles.homeActionBtn}
                    >
                      <Text style={styles.homeActionBtnText}>
                        Accès à la Galerie Cloud
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() =>
                        navigation.navigate("OngoingAmountsPage", {
                          interventions: allInterventions,
                        })
                      }
                      style={styles.homeActionBtn}
                    >
                      <Text style={styles.homeActionBtnText}>
                        En cours : {totalCost} €
                      </Text>
                    </TouchableOpacity>

                    {expressList.length > 0 && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setExpressModalVisible(true)}
                        style={[styles.homeActionBtn, styles.homeActionBtnHighlight]}
                      >
                        <Text style={styles.homeActionBtnText}>
                          EXPRESS ({expressList.length})
                        </Text>
                      </TouchableOpacity>
                    )}

                    {ordersList.length > 0 && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setOrdersModalVisible(true)}
                        style={[styles.homeActionBtn, styles.homeActionBtnHighlight]}
                      >
                        <Text style={styles.homeActionBtnText}>
                          COMMANDES ({ordersList.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                <Text style={styles.pageNumberText}>
                  Page {currentPage} / {totalPages}
                </Text>
              </View>

              <View style={{ marginBottom: 20 }}>
                {/* —— BARRE DE RECHERCHE —— */}
                <View
                  style={[
                    styles.searchContainer,
                    isBannedMatch && styles.searchContainerBanned,
                  ]}
                >
                  <TextInput
                    style={[
                      styles.searchInput,
                      isBannedMatch && styles.searchInputBanned,
                    ]}
                    placeholder="Rechercher client (nom ou téléphone)"
                    placeholderTextColor={isBannedMatch ? "#7f1d1d" : "#575757"}
                    value={searchText}
                    onChangeText={(t) => {
                      setSearchText(t);
                      if (searchDebounceRef.current) {
                        clearTimeout(searchDebounceRef.current);
                      }
                      searchDebounceRef.current = setTimeout(() => {
                        filterClients(t);
                      }, 300);
                    }}
                    autoCorrect={false}
                    autoCapitalize="characters"
                    returnKeyType="search"
                  />
                  <Image
                    source={require("../assets/icons/search.png")}
                    style={{
                      width: 20,
                      height: 20,
                      tintColor: isBannedMatch ? "#b91c1c" : "#888787",
                      marginLeft: 8,
                    }}
                  />
                </View>

                {isBannedMatch && (
                  <Text style={styles.bannedHint}>
                    ⚠️ Correspond à un client banni — sélection désactivée.
                  </Text>
                )}

                {/* —— SUGGESTIONS —— */}
                {searchText?.trim()?.length > 0 && (
                  <FlatList
					data={(filteredClients || []).slice(0, 20)}
					keyExtractor={(it) => String(it.id)}
					keyboardShouldPersistTaps="always"
					keyboardDismissMode="on-drag"
					nestedScrollEnabled
					showsVerticalScrollIndicator
					style={styles.suggestionsBox}
                    renderItem={({ item }) => {
                      const isBanned = item?.banned === true;

const onPick = () => {
  handleSearchClientPick(item);
};

                      return (
                        <TouchableOpacity
                          onPress={onPick}
                          activeOpacity={isBanned ? 1 : 0.8}
                          style={[
                            {
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: "#f3f4f6",
                              backgroundColor: "#fff",
                            },
                            isBanned && styles.sugRowBanned, // fond rosé si banni
                          ]}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.sugName,
                              isBanned && styles.sugNameBanned,
                            ]} // nom en rouge
                          >
                            {item?.name || "—"}
                          </Text>

                          <Text
                            style={{ color: "#6b7280", fontSize: 12 }}
                            numberOfLines={1}
                          >
                            {item?.phone
                              ? item.phone.replace(/(\d{2})(?=\d)/g, "$1 ")
                              : "—"}
                            {typeof item?.ficheNumber !== "undefined"
                              ? `  ·  Fiche ${item.ficheNumber}`
                              : ""}
                          </Text>

                          {isBanned && (
                            <View style={styles.sugBadgeBanned}>
                              <Text style={styles.sugBadgeBannedText}>
                                BANNI
                                {item?.ban_reason
                                  ? ` — ${item.ban_reason}`
                                  : ""}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                )}


              </View>

              <View style={styles.buttonContainerMasquer}>
                <TouchableOpacity
                  style={styles.toggleButton}
                  onPress={openPopup}
                >
                  <Image
                    source={
                      showClients
                        ? require("../assets/icons/eye.png") // Icône pour "masquer"
                        : require("../assets/icons/eye.png") // Icône pour "afficher"
                    }
                    style={styles.iconStyle}
                  />
                  <Text style={styles.toggleText}>Fiches en cours</Text>
                </TouchableOpacity>
{pendingProposals.length > 0 && (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() =>
      setPendingProposalsModalVisible(true)
    }
    style={{
      height: 46,
      minWidth: 130,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: "#b45309",
      borderRadius: 10,
      backgroundColor: "#d97706",
      elevation: 3,
    }}
  >
    <Text
      style={{
        color: "#ffffff",
        fontSize: 13,
        fontWeight: "bold",
      }}
    >
      Propositions
    </Text>

    <View
      style={{
        minWidth: 24,
        height: 24,
        marginLeft: 8,
        paddingHorizontal: 5,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ffffff",
      }}
    >
      <Text
        style={{
          color: "#b45309",
          fontSize: 12,
          fontWeight: "bold",
        }}
      >
        {pendingProposals.length}
      </Text>
    </View>
  </TouchableOpacity>
)}
{repairedNotReturnedCountSafe > 0 && (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() =>
      navigation.navigate("RepairedInterventionsListPage", {
        initialFilter: "Réparé",
      })
    }
    style={{
      height: 46,
      minWidth: 130,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: "#166534",
      borderRadius: 10,
      backgroundColor: "#15803d",
      elevation: 3,
    }}
  >
    <Text
      style={{
        color: "#ffffff",
        fontSize: 13,
        fontWeight: "bold",
      }}
    >
      Réparés en attente
    </Text>

    <View
      style={{
        minWidth: 24,
        height: 24,
        marginLeft: 8,
        paddingHorizontal: 5,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ffffff",
      }}
    >
      <Text
        style={{
          color: "#166534",
          fontSize: 12,
          fontWeight: "bold",
        }}
      >
        {repairedNotReturnedCountSafe}
      </Text>
    </View>
  </TouchableOpacity>
)}
{overdueRepairedClients.length > 0 && (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() =>
      setOverdueRepairedModalVisible(true)
    }
    style={{
      height: 46,
      minWidth: 130,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: "#991b1b",
      borderRadius: 10,
      backgroundColor: "#dc2626",
      elevation: 3,
    }}
  >
    <Text
      style={{
        color: "#ffffff",
        fontSize: 13,
        fontWeight: "bold",
      }}
    >
      Non récupérés 30j+
    </Text>

    <View
      style={{
        minWidth: 24,
        height: 24,
        marginLeft: 8,
        paddingHorizontal: 5,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ffffff",
      }}
    >
      <Text
        style={{
          color: "#991b1b",
          fontSize: 12,
          fontWeight: "bold",
        }}
      >
        {overdueRepairedClients.length}
      </Text>
    </View>
  </TouchableOpacity>
)}
{notNotifiedRepaired.length > 0 && (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() => setNotNotifiedRepairedModalVisible(true)}
    style={{
      height: 46,
      minWidth: 130,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: "#1e40af",
      borderRadius: 10,
      backgroundColor: "#2563eb",
      elevation: 3,
    }}
  >
    <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "bold" }}>
      À prévenir
    </Text>
    <View
      style={{
        minWidth: 24,
        height: 24,
        marginLeft: 8,
        paddingHorizontal: 5,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ffffff",
      }}
    >
      <Text style={{ color: "#1e40af", fontSize: 12, fontWeight: "bold" }}>
        {notNotifiedRepaired.length}
      </Text>
    </View>
  </TouchableOpacity>
)}
{partsReceivedInterventions.length > 0 && (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() => setPartsReceivedModalVisible(true)}
    style={{
      height: 46,
      minWidth: 130,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: "#5b21b6",
      borderRadius: 10,
      backgroundColor: "#7c3aed",
      elevation: 3,
    }}
  >
    <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "bold" }}>
      Pièce reçue
    </Text>
    <View
      style={{
        minWidth: 24,
        height: 24,
        marginLeft: 8,
        paddingHorizontal: 5,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ffffff",
      }}
    >
      <Text style={{ color: "#5b21b6", fontSize: 12, fontWeight: "bold" }}>
        {partsReceivedInterventions.length}
      </Text>
    </View>
  </TouchableOpacity>
)}
{activeOutstandingBalances.length > 0 && (
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() => {
      setOutstandingBalancesPage(1);
      setOutstandingBalancesModalVisible(true);
    }}
    style={{
      height: 46,
      minWidth: 130,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: "#115e59",
      borderRadius: 10,
      backgroundColor: "#0d9488",
      elevation: 3,
    }}
  >
    <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "bold" }}>
      Soldes dus
    </Text>
    <View
      style={{
        minWidth: 24,
        height: 24,
        marginLeft: 8,
        paddingHorizontal: 5,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ffffff",
      }}
    >
      <Text style={{ color: "#115e59", fontSize: 12, fontWeight: "bold" }}>
        {activeOutstandingBalances.length}
      </Text>
    </View>
  </TouchableOpacity>
)}
              </View>
              {isLoading ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size={90} color="#e5e8eb" />
                </View>
              ) : currentClients.length === 0 ? (
                <Text style={styles.noClientsText}>Aucun client trouvé</Text>
              ) : (
                <>
                  {showClients && (
                    <View
                      onLayout={(e) => {
                        const w = e?.nativeEvent?.layout?.width || 0;
                        const h = e?.nativeEvent?.layout?.height || 0;
                                    if (w && w !== sliderW) setSliderW(w);
                        if (h && h !== sliderH) setSliderH(h);
                      }}
                    >
                      <FlatList
                        ref={flatListRef}
                        horizontal
                        pagingEnabled
                        bounces={false}
                        showsHorizontalScrollIndicator={false}
                        data={pages}
                        initialNumToRender={1}
                        maxToRenderPerBatch={1}
                        windowSize={3}
                        removeClippedSubviews={true}
                        keyExtractor={(_, idx) => `page-${idx}`}
                        getItemLayout={(data, index) => ({
                          length: sliderW,
                          offset: sliderW * index,
                          index,
                        })}
                        onScrollToIndexFailed={({ index }) => {
                          // fallback : on attend que la liste ait fini de monter
                          // les éléments avant de réessayer, sinon le retry échoue
                          // à nouveau immédiatement (boucle infinie / stack overflow).
                          setTimeout(() => {
                            flatListRef.current?.scrollToIndex({
                              index: Math.max(0, Math.min(index, sliderTotalPages - 1)),
                              animated: true,
                            });
                          }, 100);
                        }}
                        onMomentumScrollEnd={(e) => {
                          const w = e?.nativeEvent?.layoutMeasurement?.width || 0;
                          const x = e?.nativeEvent?.contentOffset?.x || 0;
                          if (!w) return;
                          const page = Math.round(x / w);
                          const p = page + 1;
                          if (p !== currentPage) {
                            setExpandedClientId(null);
                            setCurrentPage(p);
                          }
                        }}
                        renderItem={({ item: pageItems, index: pageIndex }) => (
                          <View style={{ width: sliderW || 1, height: sliderH || "100%" }}>
                            <ScrollView
                              nestedScrollEnabled
                              showsVerticalScrollIndicator={false}
                              contentContainerStyle={{ paddingBottom: 130 }}
                            >
                              {(pageItems || []).map((cli, i) => (
                                <View key={String(cli.id)} style={{ marginBottom: 3 }}>
                                  {renderClientCard({
                                    item: cli,
                                    index: pageIndex * itemsPerPage + i,
                                  })}
                                </View>
                              ))}
                            </ScrollView>
                          </View>
                        )}

                        contentContainerStyle={{
                          paddingBottom: 10,
                        }} // Ajoute un espace en bas
                      />
		
<View>
        
                      {totalPages > 1 && currentPage === totalPages && (
                        <TouchableOpacity
                          style={styles.backToStartBtn}
                          onPress={() => {
                            setExpandedClientId(null);
                            flatListRef.current?.scrollToIndex({ index: 0, animated: true });
                            setCurrentPage(1);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.backToStartText}>Retour</Text>
                        </TouchableOpacity>
                      )}
                      {/* ✅ Indicateur de pages (● ○ ○) */}
                      {sliderTotalPages > 1 && (
                        <View style={styles.dotsRow}>
                          {Array.from({ length: sliderTotalPages }).map((_, i) => (
                            <View
                              key={`dot-${i}`}
                              style={[
                                styles.dot,
                                i === currentPage - 1 && styles.dotActive,
                              ]}
                            />
                          ))}
                        </View>
                        
                      )}
                      </View>
                    </View>
                  )}
                </>
              )}
<Modal
  visible={searchActionVisible}
  transparent={true}
  animationType="fade"
  statusBarTranslucent={true}
  onRequestClose={closeSearchActions}
>
  <View
    style={{
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.65)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 20,
    }}
  >
    <View
      style={{
        width: "90%",
        maxWidth: 500,
        backgroundColor: "#ffffff",
        borderRadius: 16,
        padding: 22,
        elevation: 20,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      }}
    >
      <Text
        style={{
          fontSize: 22,
          fontWeight: "bold",
          color: "#242424",
          textAlign: "center",
          marginBottom: 6,
        }}
      >
        {searchSelectedClient?.name || "Client"}
      </Text>

      <Text
        style={{
          fontSize: 15,
          color: "#555",
          textAlign: "center",
          marginBottom: 2,
        }}
      >
        {searchSelectedClient?.phone
          ? formatPhoneNumber(searchSelectedClient.phone)
          : "Téléphone non renseigné"}
      </Text>

      <Text
        style={{
          fontSize: 15,
          color: "#555",
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        Fiche N° {searchSelectedClient?.ficheNumber || "—"}
      </Text>

      {/* —— Contacter le client —— */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 18,
          gap: 8,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!searchSelectedClient?.phone}
          onPress={() => {
            const phone = searchSelectedClient?.phone;
            if (!phone) {
              showAlert("Erreur", "Numéro de téléphone manquant.");
              return;
            }
            Linking.openURL(`tel:${phone}`);
          }}
          style={{
            flex: 1,
            height: 46,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: searchSelectedClient?.phone
              ? "#16a34a"
              : "#d1d5db",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
            📞 Appeler
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!searchSelectedClient?.phone}
          onPress={async () => {
            const phone = searchSelectedClient?.phone;
            if (!phone) {
              showAlert("Erreur", "Numéro de téléphone manquant.");
              return;
            }
            const smsUrl = `sms:${phone}`;
            const supported = await Linking.canOpenURL(smsUrl);
            if (!supported) {
              showAlert(
                "Erreur",
                "L'envoi de SMS n'est pas pris en charge sur cet appareil."
              );
              return;
            }
            Linking.openURL(smsUrl);
          }}
          style={{
            flex: 1,
            height: 46,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: searchSelectedClient?.phone
              ? "#2563eb"
              : "#d1d5db",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
            📩 SMS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          disabled={!searchSelectedClient?.email}
          onPress={() => {
            const email = searchSelectedClient?.email;
            if (!email) {
              showAlert("Erreur", "Adresse e-mail manquante.");
              return;
            }
            Linking.openURL(`mailto:${email}`);
          }}
          style={{
            flex: 1,
            height: 46,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: searchSelectedClient?.email
              ? "#7c3aed"
              : "#d1d5db",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
            ✉️ E-mail
          </Text>
        </TouchableOpacity>
      </View>

<View
  style={{
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  }}
>
  <View
    style={{
      flex: 1,
      backgroundColor: "#eff6ff",
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 8,
      marginRight: 5,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#bfdbfe",
    }}
  >
    <Text
      style={{
        fontSize: 22,
        fontWeight: "800",
        color: "#1d4ed8",
      }}
    >
      {selectedClientInterventionCount}
    </Text>

    <Text
      style={{
        fontSize: 13,
        color: "#1e3a8a",
        textAlign: "center",
      }}
    >
      Intervention
      {selectedClientInterventionCount > 1 ? "s" : ""} en cours
    </Text>
  </View>

  <View
    style={{
      flex: 1,
      backgroundColor: "#fff7ed",
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 8,
      marginLeft: 5,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#fed7aa",
    }}
  >
    <Text
      style={{
        fontSize: 22,
        fontWeight: "800",
        color: "#c2410c",
      }}
    >
      {selectedClientOrderCount}
    </Text>

    <Text
      style={{
        fontSize: 13,
        color: "#7c2d12",
        textAlign: "center",
      }}
    >
      Commande
      {selectedClientOrderCount > 1 ? "s" : ""} en cours
    </Text>
  </View>
</View>
      <Text
        style={{
          fontSize: 17,
          fontWeight: "700",
          color: "#242424",
          textAlign: "center",
          marginBottom: 14,
        }}
      >
        Que voulez-vous faire ?
      </Text>

      <TouchableOpacity
        onPress={goToAddInterventionFromSearch}
        activeOpacity={0.85}
        style={{
          height: 56,
          backgroundColor: "#2563eb",
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          marginBottom: 10,
          overflow: "hidden",
        }}
      >
        <Image
          source={require("../assets/icons/plus.png")}
          resizeMode="contain"
          style={{
            width: 24,
            height: 24,
            marginRight: 14,
            tintColor: "#ffffff",
          }}
        />

<Text
  style={{
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#ffffff",
  }}
>
  {selectedClientInterventionCount > 0
    ? "Ajouter une intervention"
    : "Créer une nouvelle intervention"}
</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={goToOrderFromSearch}
        activeOpacity={0.85}
        style={{
          height: 56,
          backgroundColor: "#d97706",
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          marginBottom: 10,
          overflow: "hidden",
        }}
      >
        <Image
          source={require("../assets/icons/order.png")}
          resizeMode="contain"
          style={{
            width: 24,
            height: 24,
            marginRight: 14,
            tintColor: "#ffffff",
          }}
        />

        <Text
          style={{
            flex: 1,
            fontSize: 17,
            fontWeight: "700",
            color: "#ffffff",
          }}
        >
          {selectedClientOrderCount > 0
  ? "Ajouter une commande"
  : "Créer une nouvelle commande"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={goToClientFromSearch}
        activeOpacity={0.85}
        style={{
          height: 56,
          backgroundColor: "#15803d",
          borderRadius: 10,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          marginBottom: 10,
          overflow: "hidden",
        }}
      >
        <Image
          source={require("../assets/icons/checklist.png")}
          resizeMode="contain"
          style={{
            width: 24,
            height: 24,
            marginRight: 14,
            tintColor: "#ffffff",
          }}
        />

        <Text
          style={{
            flex: 1,
            fontSize: 17,
            fontWeight: "700",
            color: "#ffffff",
          }}
        >
          Voir la fiche client
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={closeSearchActions}
        activeOpacity={0.8}
        style={{
          height: 48,
          borderRadius: 9,
          backgroundColor: "#e5e7eb",
          justifyContent: "center",
          alignItems: "center",
          marginTop: 4,
        }}
      >
        <Text
          style={{
            color: "#991b1b",
            fontSize: 16,
            fontWeight: "700",
          }}
        >
          Annuler
        </Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
              <Modal
                transparent
                visible={bannedAlert.visible}
                animationType="fade"
                onRequestClose={() =>
                  setBannedAlert((v) => ({ ...v, visible: false }))
                }
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.alertBox}>
                    <Image
                      source={require("../assets/icons/no.png")} // ou un pictogramme “ban”
                      style={styles.warningIcon}
                    />
                    <Text style={styles.alertTitle}>Client banni</Text>
                    <Text style={styles.alertMessage}>
                      Vous ne pouvez pas sélectionner cette fiche.
                    </Text>

                    <View style={styles.bannedCard}>
                      <Text style={styles.bannedLine}>
                        <Text style={styles.bannedLabel}>Nom : </Text>
                        {bannedAlert.name?.toUpperCase()}
                      </Text>
                      {!!bannedAlert.phone && (
                        <Text style={styles.bannedLine}>
                          <Text style={styles.bannedLabel}>Téléphone : </Text>
                          {formatPhoneNumber(bannedAlert.phone)}
                        </Text>
                      )}
                      <Text style={styles.bannedReason}>
                        <Text style={styles.bannedLabel}>Raison : </Text>
                        {bannedAlert.reason}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.modalButton,
                        { alignSelf: "stretch", marginTop: 6 },
                      ]}
                      onPress={() =>
                        setBannedAlert((v) => ({ ...v, visible: false }))
                      }
                    >
                      <Text style={styles.modalButtonText}>Compris</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

              <Modal
                transparent
                visible={notifySheetVisible}
                animationType="fade"
                onRequestClose={() => setNotifySheetVisible(false)}
              >
                {/* Fond assombri cliquable */}
                <Pressable
                  style={stylesNS.backdrop}
                  onPress={() => setNotifySheetVisible(false)}
                />

                {/* Contenu en bas (sheet) */}
                <View style={stylesNS.sheet}>
                  <Text style={stylesNS.sheetTitle}>Notifier le client</Text>
                  <Text style={stylesNS.sheetSubtitle}>
                    Choisissez le type de notification pour{" "}
                    {notifySheetCtx?.client?.name || "ce client"}.
                  </Text>

                  {/* Option — Intervention terminée */}
                  <Pressable
                    android_ripple={{ color: "#e5e5e5" }}
                    style={stylesNS.row}
                    onPress={() => handleNotifyPick("pickup")}
                  >
                    <Image
                      source={require("../assets/icons/ok.png")}
                      style={[stylesNS.rowIcon, { tintColor: "#00c853" }]}
                    />
                    <View style={stylesNS.rowTextWrap}>
                      <Text style={stylesNS.rowTitle}>
                        Intervention terminée
                      </Text>
                      <Text style={stylesNS.rowSubtitle}>
                        Le client peut venir récupérer.
                      </Text>
                    </View>
                    <Image
                      source={require("../assets/icons/chevrond.png")}
                      style={stylesNS.chev}
                    />
                  </Pressable>

                  {/* Option — Demande d’informations */}
                  <Pressable
                    android_ripple={{ color: "#e5e5e5" }}
                    style={stylesNS.row}
                    onPress={() => handleNotifyPick("info")}
                  >
                    <Image
                      source={require("../assets/icons/devisEnCours.png")}
                      style={[stylesNS.rowIcon, { tintColor: "#ffbf00" }]}
                    />
                    <View style={stylesNS.rowTextWrap}>
                      <Text style={stylesNS.rowTitle}>
                        Demande d'informations
                      </Text>
                      <Text style={stylesNS.rowSubtitle}>
                        Besoin d’un retour du client.
                      </Text>
                    </View>
                    <Image
                      source={require("../assets/icons/chevrond.png")}
                      style={stylesNS.chev}
                    />
                  </Pressable>

                  {/* Option — Annuler le signalement */}
                  <Pressable
                    android_ripple={{ color: "#e5e5e5" }}
                    style={stylesNS.row}
                    onPress={() => handleNotifyPick("none")}
                  >
                    <Image
                      source={require("../assets/icons/trash.png")}
                      style={[stylesNS.rowIcon, { tintColor: "#e53935" }]}
                    />
                    <View style={stylesNS.rowTextWrap}>
                      <Text style={stylesNS.rowTitle}>
                        Annuler le signalement
                      </Text>
                      <Text style={stylesNS.rowSubtitle}>
                        Réinitialise l’icône (gris).
                      </Text>
                    </View>
                    <Image
                      source={require("../assets/icons/chevrond.png")}
                      style={stylesNS.chev}
                    />
                  </Pressable>

                  {/* Fermer */}
                  <Pressable
                    android_ripple={{ color: "#dcdcdc" }}
                    style={stylesNS.closeBtn}
                    onPress={() => setNotifySheetVisible(false)}
                  >
                    <Text style={stylesNS.closeText}>Fermer</Text>
                  </Pressable>
                </View>
              </Modal>

              <Modal
                transparent
                visible={notifyModalVisible}
                animationType="fade"
                onRequestClose={() => setNotifyModalVisible(false)}
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.alertBox}>
                    <Text style={styles.alertTitle}>Notifier le client</Text>

                    <View style={styles.modalButtonRow}>
                      {/* 📋 Copier numéro + Messages Web */}
                      <TouchableOpacity
                        style={styles.modalButton}
                        onPress={async () => {
                          if (!selectedClient?.phone) {
                            showAlert(
                              "Erreur",
                              "Numéro de téléphone manquant."
                            );
                            return;
                          }

                          try {
                            await Clipboard.setStringAsync(
                              selectedClient.phone
                            );
                            await updateClientNotification(
                              selectedClient,
                              "SMS"
                            );
                            setNotifyModalVisible(false);
                            showAlert(
                              "📋 Numéro copié",
                              "Collez le numéro dans Messages Web."
                            );
                            Linking.openURL("https://messages.google.com/web");
                          } catch (err) {
                            console.error("Erreur Messages Web :", err);
                            showAlert(
                              "Erreur",
                              "Impossible de notifier ce client."
                            );
                          }
                        }}
                      >
                        <Text style={styles.modalButtonText}>
                          📋 Copier numéro + Messages Web
                        </Text>
                      </TouchableOpacity>

                      {/* 📩 Envoyer via SMS (avec SIM) */}
                      <TouchableOpacity
                        style={styles.modalButton}
                        onPress={async () => {
                          if (!selectedClient?.phone) {
                            showAlert(
                              "Erreur",
                              "Numéro de téléphone manquant."
                            );
                            return;
                          }

                          const smsUrl = `sms:${selectedClient.phone}`;

                          try {
                            const supported = await Linking.canOpenURL(smsUrl);
                            if (!supported) {
                              showAlert(
                                "Erreur",
                                "L'envoi de SMS n'est pas pris en charge sur cet appareil."
                              );
                              return;
                            }

                            await Linking.openURL(smsUrl);
                            await updateClientNotification(
                              selectedClient,
                              "SMS"
                            );
                            setNotifyModalVisible(false);
                          } catch (err) {
                            console.error("Erreur SMS SIM :", err);
                            showAlert(
                              "Erreur",
                              "Impossible d’ouvrir l’app SMS."
                            );
                          }
                        }}
                      >
                        <Text style={styles.modalButtonText}>
                          📩 Envoyer via SMS (avec SIM)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.modalButton}
                        onPress={async () => {
                          if (!selectedClient?.phone) {
                            showAlert(
                              "Erreur",
                              "Numéro de téléphone manquant."
                            );
                            return;
                          }

                          const telUrl = `tel:${selectedClient.phone}`;

                          try {
                            const supported = await Linking.canOpenURL(telUrl);
                            if (!supported) {
                              showAlert(
                                "Erreur",
                                "L’appel n’est pas supporté sur cet appareil."
                              );
                              return;
                            }

                            await Linking.openURL(telUrl);
                            await updateClientNotification(
                              selectedClient,
                              "Téléphone"
                            );
                            setNotifyModalVisible(false);
                          } catch (err) {
                            console.error("Erreur appel :", err);
                            showAlert(
                              "Erreur",
                              "Impossible d’initier l’appel."
                            );
                          }
                        }}
                      >
                        <Text style={styles.modalButtonText}>📞 Appeler</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.modalButton,
                          styles.modalButtonSecondary,
                        ]}
                        onPress={() => setNotifyModalVisible(false)}
                      >
                        <Text style={styles.modalButtonTextSecondary}>
                          ❌ Annuler
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>

              {/* Commande en cours */}
              <Modal
                transparent
                visible={transportModalVisible}
                animationType="fade"
                onRequestClose={() => setTransportModalVisible(false)}
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.alertBox}>
                    <Text
                      style={[
                        styles.alertTitle,
                        { color: selectedCommandeDone ? "#00a83c" : "#a073f3" },
                      ]}
                    >
                      {selectedCommandeDone ? "Commande reçue" : "Commande passée"}
                    </Text>
                    <Text
                      style={[
                        styles.alertMessage,
                        {
                          fontWeight: "bold",
                          fontSize: 25,
                        },
                      ]}
                    >
                      {selectedCommande || "Aucune commande en cours"}
                    </Text>
                    {selectedCommandeFournisseur ? (
                      <Text
                        style={{
                          fontSize: 15,
                          color: "#6B7280",
                          fontStyle: "italic",
                          marginBottom: 12,
                        }}
                      >
                        Fournisseur : {selectedCommandeFournisseur}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonSecondary]}
                      onPress={() => setTransportModalVisible(false)}
                    >
                      <Text style={styles.modalButtonTextSecondary}>
                        Fermer
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

              <Modal
                transparent
                visible={isModalVisible}
                animationType="fade"
                onRequestClose={() => setIsModalVisible(false)}
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.alertBox}>
                    <Text style={styles.alertTitle}>Détails du matériel</Text>

                    {selectedDevice && (
                      <>
                        <Text style={styles.modalText}>
                          Type : {selectedDevice.deviceType}
                        </Text>
                        <Text style={styles.modalText}>
                          Marque : {selectedDevice.brand}
                        </Text>
                        <Text style={styles.modalText}>
                          Modèle : {selectedDevice.model}
                        </Text>

                        <View style={styles.buttonRowG}>
                          <TouchableOpacity
                            style={[
                              styles.modalButtonG,
                              {
                                backgroundColor: "#4285F4",
                              },
                            ]}
                            onPress={() => {
                              const query = encodeURIComponent(
                                `${selectedDevice.brand} ${selectedDevice.model}`
                              );
                              Linking.openURL(
                                `https://www.google.com/search?q=${query}+fiche+technique`
                              );
                            }}
                          >
                            <Text style={styles.modalButtonTextG}>Google</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.modalButtonG,
                              {
                                backgroundColor: "#FF9900",
                              },
                            ]}
                            onPress={() => {
                              const query = encodeURIComponent(
                                `${selectedDevice.brand} ${selectedDevice.model}`
                              );
                              Linking.openURL(
                                `https://www.amazon.fr/s?k=${query}`
                              );
                            }}
                          >
                            <Text style={styles.modalButtonTextG}>Amazon</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.modalButtonG,
                              {
                                backgroundColor: "#34A853",
                              },
                            ]}
                            onPress={() => {
                              const query = encodeURIComponent(
                                `${selectedDevice.brand} ${selectedDevice.model}`
                              );
                              Linking.openURL(
                                `https://www.google.com/search?tbm=isch&q=${query}`
                              );
                            }}
                          >
                            <Text style={styles.modalButtonTextG}>
                              Google images
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}

                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonSecondary]}
                      onPress={() => setIsModalVisible(false)}
                    >
                      <Text style={styles.modalButtonTextSecondary}>
                        Fermer
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

              <Modal
                transparent
                visible={modalVisible}
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.alertBox}>
                    <Text style={styles.alertTitle}>
                      Confirmer la suppression
                    </Text>
                    <Text style={styles.alertMessage}>
                      Êtes-vous sûr de vouloir supprimer cette fiche client ?
                    </Text>
                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={[
                          styles.modalButton,
                          styles.modalButtonSecondary,
                        ]}
                        onPress={() => setModalVisible(false)}
                      >
                        <Text style={styles.modalButtonTextSecondary}>
                          Annuler
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.modalButton}
                        onPress={handleDeleteClient}
                      >
                        <Text style={styles.modalButtonText}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>

              <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                onClose={() => {
                  setAlertVisible(false);
                  if (alertOnClose) alertOnClose();
                }}
              />

              <AlertBox
                visible={logoutConfirmVisible}
                title="Confirmation"
                message="Êtes-vous sûr de vouloir vous déconnecter ?"
                cancelText="Annuler"
                confirmText="Déconnexion"
                onClose={() => setLogoutConfirmVisible(false)}
                onConfirm={async () => {
                  setLogoutConfirmVisible(false);
                  try {
                    await handleLogout();
                    toggleMenu();
                  } catch (error) {
                    console.error("Erreur de déconnexion :", error);
                  }
                }}
              />

              <AlertBox
                visible={!!deletePhotoTarget}
                title="Supprimer cette image ?"
                message="Cette action supprimera l'image du stockage et de la fiche."
                cancelText="Annuler"
                confirmText="Supprimer"
                onClose={() => setDeletePhotoTarget(null)}
                onConfirm={confirmDeleteInterventionPhoto}
              />

              <AlertBox
                visible={!!deleteOrderPhotoTarget}
                title="Supprimer cette image ?"
                message="Cette action supprimera l'image du stockage et de la commande."
                cancelText="Annuler"
                confirmText="Supprimer"
                onClose={() => setDeleteOrderPhotoTarget(null)}
                onConfirm={confirmDeleteOrderPhoto}
              />

              <AlertBox
                visible={!!deleteOrderProductPhotoTarget}
                title="Supprimer cette image ?"
                message="Cette action supprimera l'image du stockage et de la commande."
                cancelText="Annuler"
                confirmText="Supprimer"
                onClose={() => setDeleteOrderProductPhotoTarget(null)}
                onConfirm={confirmDeleteOrderProductPhoto}
              />

              {cleanupModalVisible && (
                <Modal
                  transparent
                  visible={cleanupModalVisible}
                  animationType="fade"
                  onRequestClose={() => setCleanupModalVisible(false)}
                >
                  <View style={styles.modalOverlay}>
                    <View style={styles.alertBox}>
                      <Text style={styles.alertTitle}>{alertTitle}</Text>
                      <Text style={styles.alertMessage}>{alertMessage}</Text>
                      <View style={styles.modalButtons}>
                        <TouchableOpacity
                          style={styles.modalButtonGoog}
                          onPress={handlePhotoCleanup}
                        >
                          <Text style={styles.modalButtonText}>Nettoyer</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.modalButton,
                            styles.modalButtonSecondary,
                          ]}
                          onPress={() => setCleanupModalVisible(false)}
                        >
                          <Text style={styles.modalButtonTextSecondary}>
                            Annuler
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Modal>
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>

{/* ===== Popup Express (déclenchée par le bouton EXPRESS en haut) ===== */}
<Modal
  visible={expressModalVisible}
  transparent={true}
  animationType="fade"
  statusBarTranslucent={true}
  onRequestClose={() => setExpressModalVisible(false)}
>
  <TouchableWithoutFeedback onPress={() => setExpressModalVisible(false)}>
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.70)",
        justifyContent: "center",
        alignItems: "center",
        padding: 12,
      }}
    >
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "96%",
            maxWidth: 1050,
            maxHeight: "88%",
            padding: 18,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            elevation: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 21, fontWeight: "bold", color: "#1e293b" }}>
                Fiches Express en cours
              </Text>
              <Text style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>
                {expressList.length} fiche{expressList.length > 1 ? "s" : ""}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setExpressModalVisible(false)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#e5e7eb",
              }}
            >
              <Text style={{ color: "#475569", fontSize: 17, fontWeight: "bold" }}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 1, marginBottom: 12, backgroundColor: "#e2e8f0" }} />

          <FlatList
            data={expressList}
            keyExtractor={(it) => String(it.id)}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: it }) => (
              <Pressable
                onPress={() => {
                  setExpressModalVisible(false);
                  navigation.navigate("ExpressListPage", {
                    initialSearch: it.phone || it.name || "",
                    initialType: it.type || "all",
                  });
                }}
                onLongPress={async () => {
                  if (!it.client_id) return;
                  const { data: client, error } = await supabase
                    .from("clients")
                    .select("*")
                    .eq("id", it.client_id)
                    .single();
                  if (error || !client) {
                    console.error("Erreur chargement client :", error);
                    return;
                  }
                  setExpressModalVisible(false);
                  navigation.navigate("EditClient", { client });
                }}
                android_ripple={{ color: "#f1f5f9" }}
                style={stylesNS.row}
              >
                <View style={{ flex: 1 }}>
                  <Text style={stylesNS.rowMain} numberOfLines={1}>
                    {(it.name || "CLIENT").toUpperCase()} —{" "}
                    {it.type && it.type.toLowerCase().startsWith("vid")
                      ? "Transferts"
                      : it.product || it.device || "Produit"}
                  </Text>
                  <Text style={stylesNS.rowSub} numberOfLines={1}>
                    {it.price ? `${Number(it.price).toFixed(2)} €` : "—"} ·{" "}
                    {it.created_at
                      ? new Date(it.created_at).toLocaleDateString("fr-FR")
                      : "—"}
                  </Text>
                </View>

                <Text
                  style={[
                    stylesNS.pill,
                    it?.notified ? stylesNS.pillOk : stylesNS.pillDue,
                  ]}
                >
                  {it?.notified ? "Notifié" : "À notifier"}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>

{/* ===== Popup Commandes (déclenchée par le bouton COMMANDES en haut) ===== */}
<Modal
  visible={ordersModalVisible}
  transparent={true}
  animationType="fade"
  statusBarTranslucent={true}
  onRequestClose={() => setOrdersModalVisible(false)}
>
  <TouchableWithoutFeedback onPress={() => setOrdersModalVisible(false)}>
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.70)",
        justifyContent: "center",
        alignItems: "center",
        padding: 12,
      }}
    >
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "96%",
            maxWidth: 1050,
            maxHeight: "88%",
            padding: 18,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            elevation: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 21, fontWeight: "bold", color: "#1e293b" }}>
                Commandes en cours
              </Text>
              <Text style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>
                {ordersList.length} commande{ordersList.length > 1 ? "s" : ""}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setOrdersModalVisible(false)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#e5e7eb",
              }}
            >
              <Text style={{ color: "#475569", fontSize: 17, fontWeight: "bold" }}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 1, marginBottom: 12, backgroundColor: "#e2e8f0" }} />

          <FlatList
            data={ordersList}
            keyExtractor={(o) => String(o.id)}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: o }) => {
              const cli = o.__client || {};
              const price = Number(o.price || 0);
              const deposit = Number(o.deposit || 0);
              const rest = Math.max(0, price - deposit);

              const statusText = o.recovered
                ? "Restituée"
                : o.paid
                ? "Payée"
                : o.received
                ? "Reçue"
                : "Passée";

              const statusStyle = o.recovered
                ? stylesNS.pillTerminee
                : o.paid
                ? stylesNS.pillPayee
                : o.received
                ? stylesNS.pillEnCours
                : stylesNS.pillAttente;

              return (
                <Pressable
                  onPress={() => {
                    setOrdersModalVisible(false);
                    navigation.navigate("OrdersPage", {
                      clientId: cli.id || o.client_id,
                      clientName: cli.name,
                      clientPhone: cli.phone,
                      clientNumber: cli.ficheNumber,
                    });
                  }}
                  android_ripple={{ color: "#e9efff" }}
                  style={stylesNS.row}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={stylesNS.rowMain} numberOfLines={1}>
                      {(cli.name || "CLIENT").toUpperCase()}{" "}
                      {o.product || "Produit"} — {o.brand || "Marque"}
                    </Text>
                    <Text style={stylesNS.rowSub} numberOfLines={1}>
                      {price ? `${price.toFixed(2)} €` : "—"} · Fiche{" "}
                      {cli.ficheNumber ?? "—"}
                    </Text>
                  </View>

                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Text style={[stylesNS.pill, statusStyle]}>
                      {statusText}
                    </Text>
                    <Text style={stylesNS.encartMoney}>
                      {deposit > 0 ? "Reste à régler" : "À régler"} :{" "}
                      {rest.toFixed(2)} €
                    </Text>
                    {deposit > 0 && (
                      <Text style={stylesNS.encartSub}>
                        acompte de {deposit.toFixed(2)} € — total{" "}
                        {price.toFixed(2)} €
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>


<Modal
  visible={pendingProposalsModalVisible}
  transparent={true}
  animationType="fade"
  statusBarTranslucent={true}
  onRequestClose={() =>
    setPendingProposalsModalVisible(false)
  }
>
  <TouchableWithoutFeedback
    onPress={() =>
      setPendingProposalsModalVisible(false)
    }
  >
    <View
      style={{
        flex: 1,
        backgroundColor:
          "rgba(0,0,0,0.70)",
        justifyContent: "center",
        alignItems: "center",
        padding: 12,
      }}
    >
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "96%",
            maxWidth: 1050,
            maxHeight: "88%",
            padding: 18,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            elevation: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 21,
                  fontWeight: "bold",
                  color: "#1e293b",
                }}
              >
                Estimations à confirmer
              </Text>

              <Text
                style={{
                  marginTop: 3,
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                Clients en attente d’une
                décision
              </Text>
            </View>

            <View
              style={{
                minWidth: 38,
                height: 38,
                marginRight: 10,
                paddingHorizontal: 8,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#d97706",
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: "bold",
                }}
              >
                {pendingProposals.length}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() =>
                setPendingProposalsModalVisible(
                  false
                )
              }
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#e5e7eb",
              }}
            >
              <Text
                style={{
                  color: "#475569",
                  fontSize: 17,
                  fontWeight: "bold",
                }}
              >
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={{
              height: 1,
              marginBottom: 12,
              backgroundColor: "#e2e8f0",
            }}
          />

          {pendingProposalsLoading ? (
            <View
              style={{
                minHeight: 220,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator
                size="large"
                color="#d97706"
              />

              <Text
                style={{
                  marginTop: 10,
                  color: "#64748b",
                }}
              >
                Chargement…
              </Text>
            </View>
          ) : (
            <FlatList
              data={pendingProposals}
              keyExtractor={(item) =>
                String(item.id)
              }
              showsVerticalScrollIndicator={
                false
              }
              renderItem={({ item }) => {
                const clientName =
                  item.client?.name ||
                  "Client inconnu";

                const deviceText = [
                  item.deviceType,
                  item.brand,
                  item.model,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={() => {
                      setPendingProposalsModalVisible(
                        false
                      );

                      navigation.navigate(
                        "EditIntervention",
                        {
                          clientId:
                            item.client_id,
                          interventionId:
                            item.id,
                        }
                      );
                    }}
                    style={{
                      marginBottom: 10,
                      padding: 13,
                      borderWidth: 1,
                      borderColor: "#fdba74",
                      borderRadius: 12,
                      backgroundColor:
                        "#fff7ed",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "bold",
                            color: "#1e293b",
                          }}
                        >
                          {clientName.toUpperCase()}
                        </Text>

                        <Text
                          style={{
                            marginTop: 2,
                            fontSize: 12,
                            color: "#64748b",
                          }}
                        >
                          Fiche n°{" "}
                          {item.client
                            ?.ficheNumber ??
                            "—"}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 99,
                          backgroundColor:
                            "#fef3c7",
                        }}
                      >
                        <Text
                          style={{
                            color: "#92400e",
                            fontSize: 10,
                            fontWeight: "bold",
                          }}
                        >
                          À CONFIRMER
                        </Text>
                      </View>
                    </View>

                    {!!deviceText && (
                      <Text
                        style={{
                          marginTop: 9,
                          fontSize: 13,
                          fontWeight: "600",
                          color: "#475569",
                        }}
                      >
                        {deviceText}
                      </Text>
                    )}

                    <View
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 9,
                        backgroundColor:
                          "#ffffff",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "bold",
                          color: "#92400e",
                        }}
                      >
                        RÉPARATION ENVISAGÉE
                      </Text>

                      <Text
                        style={{
                          marginTop: 4,
                          fontSize: 14,
                          fontWeight: "700",
                          color: "#1f2937",
                        }}
                      >
                        {item.repair_proposal ||
                          "Non renseignée"}
                      </Text>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 10,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 16,
                          fontWeight: "bold",
                          color: "#b45309",
                        }}
                      >
                        {item.repair_proposal_price !=
                        null
                          ? `${Number(
                              item.repair_proposal_price
                            ).toFixed(2)} €`
                          : "Montant non renseigné"}
                      </Text>

                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "bold",
                          color: "#2563eb",
                        }}
                      >
                        Ouvrir la fiche ›
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>

<Modal
  visible={overdueRepairedModalVisible}
  transparent={true}
  animationType="fade"
  statusBarTranslucent={true}
  onRequestClose={() =>
    setOverdueRepairedModalVisible(false)
  }
>
  <TouchableWithoutFeedback
    onPress={() =>
      setOverdueRepairedModalVisible(false)
    }
  >
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.70)",
        justifyContent: "center",
        alignItems: "center",
        padding: 12,
      }}
    >
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "96%",
            maxWidth: 1050,
            maxHeight: "88%",
            padding: 18,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            elevation: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 21,
                  fontWeight: "bold",
                  color: "#1e293b",
                }}
              >
                Réparés non récupérés
              </Text>

              <Text
                style={{
                  marginTop: 3,
                  fontSize: 13,
                  color: "#64748b",
                }}
              >
                Prêts depuis plus de 30 jours, jamais récupérés
              </Text>
            </View>

            <View
              style={{
                minWidth: 38,
                height: 38,
                marginRight: 10,
                paddingHorizontal: 8,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#dc2626",
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: "bold",
                }}
              >
                {overdueRepairedClients.length}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() =>
                setOverdueRepairedModalVisible(false)
              }
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#e5e7eb",
              }}
            >
              <Text
                style={{
                  color: "#475569",
                  fontSize: 17,
                  fontWeight: "bold",
                }}
              >
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={{
              height: 1,
              marginBottom: 12,
              backgroundColor: "#e2e8f0",
            }}
          />

          {overdueRepairedLoading ? (
            <View
              style={{
                minHeight: 220,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <ActivityIndicator size="large" color="#dc2626" />

              <Text style={{ marginTop: 10, color: "#64748b" }}>
                Chargement…
              </Text>
            </View>
          ) : (
            <FlatList
              data={overdueRepairedClients}
              keyExtractor={(item) => String(item.id)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const clientName =
                  item.client?.name || "Client inconnu";

                const deviceText = [
                  item.deviceType,
                  item.brand,
                  item.model,
                ]
                  .filter(Boolean)
                  .join(" · ");

                const referenceDate =
                  item.repaired_at || item.updatedAt;

                const daysSince = referenceDate
                  ? Math.floor(
                      (Date.now() -
                        new Date(referenceDate).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                  : null;

                return (
                  <View
                    style={{
                      marginBottom: 10,
                      padding: 13,
                      borderWidth: 1,
                      borderColor: "#fca5a5",
                      borderRadius: 12,
                      backgroundColor: "#fef2f2",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "bold",
                            color: "#1e293b",
                          }}
                        >
                          {clientName.toUpperCase()}
                        </Text>

                        <Text
                          style={{
                            marginTop: 2,
                            fontSize: 12,
                            color: "#64748b",
                          }}
                        >
                          Fiche n° {item.client?.ficheNumber ?? "—"}
                          {item.client?.phone
                            ? ` · ${item.client.phone}`
                            : ""}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 99,
                          backgroundColor: "#fee2e2",
                        }}
                      >
                        <Text
                          style={{
                            color: "#991b1b",
                            fontSize: 10,
                            fontWeight: "bold",
                          }}
                        >
                          {daysSince != null
                            ? `${daysSince} JOURS`
                            : "30 JOURS+"}
                        </Text>
                      </View>
                    </View>

                    {!!deviceText && (
                      <Text
                        style={{
                          marginTop: 9,
                          fontSize: 13,
                          fontWeight: "600",
                          color: "#475569",
                        }}
                      >
                        {deviceText}
                      </Text>
                    )}

                    <View
                      style={{
                        flexDirection: "row",
                        marginTop: 10,
                        gap: 10,
                      }}
                    >
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={!item.client?.phone}
                        onPress={() => {
                          setOverdueRepairedModalVisible(false);

                          navigation.navigate(
                            "ClientNotificationsPage",
                            {
                              clientId: item.client_id,
                              clientName: item.client?.name,
                              phone: item.client?.phone,
                              ficheNumber:
                                item.client?.ficheNumber,
                              interventionId: item.id,
                              deviceType:
                                item.deviceType || "appareil",
                              mode: "pickup",
                            }
                          );
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 9,
                          alignItems: "center",
                          backgroundColor: item.client?.phone
                            ? "#dc2626"
                            : "#d1d5db",
                        }}
                      >
                        <Text
                          style={{
                            color: "#ffffff",
                            fontSize: 13,
                            fontWeight: "bold",
                          }}
                        >
                          📩 Renotifier par SMS
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setOverdueRepairedModalVisible(false);

                          navigation.navigate(
                            "ClientInterventionsPage",
                            { clientId: item.client_id }
                          );
                        }}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderRadius: 9,
                          alignItems: "center",
                          borderWidth: 1,
                          borderColor: "#fca5a5",
                        }}
                      >
                        <Text
                          style={{
                            color: "#991b1b",
                            fontSize: 13,
                            fontWeight: "bold",
                          }}
                        >
                          Voir la fiche
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>

<Modal
  visible={notNotifiedRepairedModalVisible}
  transparent={true}
  animationType="fade"
  statusBarTranslucent={true}
  onRequestClose={() => setNotNotifiedRepairedModalVisible(false)}
>
  <TouchableWithoutFeedback
    onPress={() => setNotNotifiedRepairedModalVisible(false)}
  >
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.70)",
        justifyContent: "center",
        alignItems: "center",
        padding: 12,
      }}
    >
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "96%",
            maxWidth: 1050,
            maxHeight: "88%",
            padding: 18,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            elevation: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 21, fontWeight: "bold", color: "#1e293b" }}>
                Réparés à prévenir
              </Text>
              <Text style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>
                Client jamais notifié que l'appareil est prêt
              </Text>
            </View>

            <View
              style={{
                minWidth: 38,
                height: 38,
                marginRight: 10,
                paddingHorizontal: 8,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#2563eb",
              }}
            >
              <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "bold" }}>
                {notNotifiedRepaired.length}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setNotNotifiedRepairedModalVisible(false)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#e5e7eb",
              }}
            >
              <Text style={{ color: "#475569", fontSize: 17, fontWeight: "bold" }}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 1, marginBottom: 12, backgroundColor: "#e2e8f0" }} />

          {notNotifiedRepairedLoading ? (
            <View style={{ minHeight: 220, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={{ marginTop: 10, color: "#64748b" }}>Chargement…</Text>
            </View>
          ) : (
            <FlatList
              data={notNotifiedRepaired}
              keyExtractor={(item) => String(item.id)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const clientName = item.client?.name || "Client inconnu";
                const deviceText = [item.deviceType, item.brand, item.model]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <View
                    style={{
                      marginBottom: 10,
                      padding: 13,
                      borderWidth: 1,
                      borderColor: "#bfdbfe",
                      borderRadius: 12,
                      backgroundColor: "#eff6ff",
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "bold", color: "#1e293b" }}>
                      {clientName.toUpperCase()}
                    </Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                      Fiche n° {item.client?.ficheNumber ?? "—"}
                      {item.client?.phone ? ` · ${item.client.phone}` : ""}
                    </Text>

                    {!!deviceText && (
                      <Text style={{ marginTop: 9, fontSize: 13, fontWeight: "600", color: "#475569" }}>
                        {deviceText}
                      </Text>
                    )}

                    <View style={{ flexDirection: "row", marginTop: 10, gap: 10 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={!item.client?.phone}
                        onPress={() => {
                          setNotNotifiedRepairedModalVisible(false);
                          navigation.navigate("ClientNotificationsPage", {
                            clientId: item.client_id,
                            clientName: item.client?.name,
                            phone: item.client?.phone,
                            ficheNumber: item.client?.ficheNumber,
                            interventionId: item.id,
                            deviceType: item.deviceType || "appareil",
                            mode: "pickup",
                          });
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 9,
                          alignItems: "center",
                          backgroundColor: item.client?.phone ? "#2563eb" : "#d1d5db",
                        }}
                      >
                        <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "bold" }}>
                          📩 Prévenir par SMS
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setNotNotifiedRepairedModalVisible(false);
                          navigation.navigate("ClientInterventionsPage", {
                            clientId: item.client_id,
                          });
                        }}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 14,
                          borderRadius: 9,
                          alignItems: "center",
                          borderWidth: 1,
                          borderColor: "#bfdbfe",
                        }}
                      >
                        <Text style={{ color: "#1e40af", fontSize: 13, fontWeight: "bold" }}>
                          Voir la fiche
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>

<Modal
  visible={partsReceivedModalVisible}
  transparent={true}
  animationType="fade"
  statusBarTranslucent={true}
  onRequestClose={() => setPartsReceivedModalVisible(false)}
>
  <TouchableWithoutFeedback onPress={() => setPartsReceivedModalVisible(false)}>
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.70)",
        justifyContent: "center",
        alignItems: "center",
        padding: 12,
      }}
    >
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "96%",
            maxWidth: 1050,
            maxHeight: "88%",
            padding: 18,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            elevation: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 21, fontWeight: "bold", color: "#1e293b" }}>
                Pièces reçues à monter
              </Text>
              <Text style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>
                Commande reçue, réparation en attente de reprise
              </Text>
            </View>

            <View
              style={{
                minWidth: 38,
                height: 38,
                marginRight: 10,
                paddingHorizontal: 8,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#7c3aed",
              }}
            >
              <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "bold" }}>
                {partsReceivedInterventions.length}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setPartsReceivedModalVisible(false)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#e5e7eb",
              }}
            >
              <Text style={{ color: "#475569", fontSize: 17, fontWeight: "bold" }}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 1, marginBottom: 12, backgroundColor: "#e2e8f0" }} />

          {partsReceivedLoading ? (
            <View style={{ minHeight: 220, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" color="#7c3aed" />
              <Text style={{ marginTop: 10, color: "#64748b" }}>Chargement…</Text>
            </View>
          ) : (
            <FlatList
              data={partsReceivedInterventions}
              keyExtractor={(item) => String(item.id)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const clientName = item.client?.name || "Client inconnu";
                const deviceText = [item.deviceType, item.brand, item.model]
                  .filter(Boolean)
                  .join(" · ");
                const partsText = (item.receivedParts || [])
                  .filter(Boolean)
                  .join(", ");

                return (
                  <View
                    style={{
                      marginBottom: 10,
                      padding: 13,
                      borderWidth: 1,
                      borderColor: "#ddd6fe",
                      borderRadius: 12,
                      backgroundColor: "#f5f3ff",
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: "bold", color: "#1e293b" }}>
                      {clientName.toUpperCase()}
                    </Text>
                    <Text style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                      Fiche n° {item.client?.ficheNumber ?? "—"}
                      {item.client?.phone ? ` · ${item.client.phone}` : ""}
                    </Text>

                    {!!deviceText && (
                      <Text style={{ marginTop: 9, fontSize: 13, fontWeight: "600", color: "#475569" }}>
                        {deviceText}
                      </Text>
                    )}

                    {!!partsText && (
                      <Text style={{ marginTop: 4, fontSize: 12, color: "#5b21b6" }}>
                        Pièce reçue : {partsText}
                      </Text>
                    )}

                    <View style={{ flexDirection: "row", marginTop: 10, gap: 10 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setPartsReceivedModalVisible(false);
                          navigation.navigate("ClientInterventionsPage", {
                            clientId: item.client_id,
                          });
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 9,
                          alignItems: "center",
                          backgroundColor: "#7c3aed",
                        }}
                      >
                        <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "bold" }}>
                          Voir la fiche
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>

<Modal
  visible={outstandingBalancesModalVisible}
  transparent={true}
  animationType="fade"
  statusBarTranslucent={true}
  onRequestClose={() => setOutstandingBalancesModalVisible(false)}
>
  <TouchableWithoutFeedback onPress={() => setOutstandingBalancesModalVisible(false)}>
    <View
      style={{
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.70)",
        justifyContent: "center",
        alignItems: "center",
        padding: 12,
      }}
    >
      <TouchableWithoutFeedback>
        <View
          style={{
            width: "96%",
            maxWidth: 1050,
            maxHeight: "88%",
            padding: 18,
            borderRadius: 18,
            backgroundColor: "#ffffff",
            elevation: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 21, fontWeight: "bold", color: "#1e293b" }}>
                Soldes restants dus
              </Text>
              <Text style={{ marginTop: 3, fontSize: 13, color: "#64748b" }}>
                Total à relancer :{" "}
                {outstandingBalances
                  .reduce((sum, item) => sum + (Number(item.solderestant) || 0), 0)
                  .toFixed(2)}{" "}
                €
              </Text>
            </View>

            <View
              style={{
                minWidth: 38,
                height: 38,
                marginRight: 10,
                paddingHorizontal: 8,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#0d9488",
              }}
            >
              <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "bold" }}>
                {activeOutstandingBalances.length}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setOutstandingBalancesModalVisible(false)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#e5e7eb",
              }}
            >
              <Text style={{ color: "#475569", fontSize: 17, fontWeight: "bold" }}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 1, marginBottom: 12, backgroundColor: "#e2e8f0" }} />

          {outstandingBalancesLoading ? (
            <View style={{ minHeight: 220, justifyContent: "center", alignItems: "center" }}>
              <ActivityIndicator size="large" color="#0d9488" />
              <Text style={{ marginTop: 10, color: "#64748b" }}>Chargement…</Text>
            </View>
          ) : (
            <>
            <FlatList
              data={displayedOutstandingBalances.slice(
                (outstandingBalancesPage - 1) * OUTSTANDING_BALANCES_PAGE_SIZE,
                outstandingBalancesPage * OUTSTANDING_BALANCES_PAGE_SIZE
              )}
              keyExtractor={(item) => String(item.id)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const clientName = item.client?.name || "Client inconnu";

                return (
                  <View
                    style={{
                      marginBottom: 10,
                      padding: 13,
                      borderWidth: 1,
                      borderColor: "#99f6e4",
                      borderRadius: 12,
                      backgroundColor: "#f0fdfa",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: "bold", color: "#1e293b" }}>
                          {clientName.toUpperCase()}
                        </Text>
                        <Text style={{ marginTop: 2, fontSize: 12, color: "#64748b" }}>
                          Fiche n° {item.client?.ficheNumber ?? "—"}
                          {item.client?.phone ? ` · ${item.client.phone}` : ""}
                        </Text>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 99,
                          backgroundColor: "#ccfbf1",
                        }}
                      >
                        <Text style={{ color: "#115e59", fontSize: 13, fontWeight: "bold" }}>
                          {Number(item.solderestant).toFixed(2)} €
                        </Text>
                      </View>
                    </View>

                    {(item.items || []).map((it, idx) => {
                      const label =
                        it.label || (it.source === "order" ? "Commande" : "Intervention");
                      const suffix =
                        it.source === "order" ? "commande" : it.status || "intervention";

                      return (
                        <View
                          key={it.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginTop: idx === 0 ? 9 : 4,
                            opacity: it.on_hold ? 0.5 : 1,
                          }}
                        >
                          <Text
                            style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#475569" }}
                          >
                            {label} ({suffix}) · {it.solderestant.toFixed(2)} €
                            {it.on_hold ? " — mise de côté" : ""}
                          </Text>

                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => toggleOnHoldBalance(it)}
                            style={{
                              marginLeft: 8,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: it.on_hold ? "#0d9488" : "#cbd5e1",
                              backgroundColor: it.on_hold ? "#ccfbf1" : "#f1f5f9",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "bold",
                                color: it.on_hold ? "#0d9488" : "#64748b",
                              }}
                            >
                              {it.on_hold ? "Réactiver" : "Mettre de côté"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}

                    <View style={{ flexDirection: "row", marginTop: 10, gap: 10 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setOutstandingBalancesModalVisible(false);
                          navigation.navigate("ClientInterventionsPage", {
                            clientId: item.client_id,
                          });
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          borderRadius: 9,
                          alignItems: "center",
                          backgroundColor: "#0d9488",
                        }}
                      >
                        <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "bold" }}>
                          Voir la fiche
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
            {displayedOutstandingBalances.length > OUTSTANDING_BALANCES_PAGE_SIZE && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 14,
                }}
              >
                <TouchableOpacity
                  onPress={() =>
                    setOutstandingBalancesPage((p) => Math.max(1, p - 1))
                  }
                  disabled={outstandingBalancesPage === 1}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "#f0fdfa",
                    borderWidth: 1,
                    borderColor: "#99f6e4",
                  }}
                >
                  <Image
                    source={require("../assets/icons/chevrong.png")}
                    style={{
                      width: 18,
                      height: 18,
                      tintColor: outstandingBalancesPage === 1 ? "#cbd5e1" : "#0d9488",
                    }}
                  />
                </TouchableOpacity>

                <Text style={{ color: "#334155", fontSize: 13, fontWeight: "700" }}>
                  Page {outstandingBalancesPage} sur{" "}
                  {Math.max(
                    1,
                    Math.ceil(displayedOutstandingBalances.length / OUTSTANDING_BALANCES_PAGE_SIZE)
                  )}
                </Text>

                <TouchableOpacity
                  onPress={() =>
                    setOutstandingBalancesPage((p) =>
                      Math.min(
                        Math.max(
                          1,
                          Math.ceil(displayedOutstandingBalances.length / OUTSTANDING_BALANCES_PAGE_SIZE)
                        ),
                        p + 1
                      )
                    )
                  }
                  disabled={
                    outstandingBalancesPage >=
                    Math.max(
                      1,
                      Math.ceil(displayedOutstandingBalances.length / OUTSTANDING_BALANCES_PAGE_SIZE)
                    )
                  }
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "#f0fdfa",
                    borderWidth: 1,
                    borderColor: "#99f6e4",
                  }}
                >
                  <Image
                    source={require("../assets/icons/chevrond.png")}
                    style={{
                      width: 18,
                      height: 18,
                      tintColor:
                        outstandingBalancesPage >=
                        Math.max(
                          1,
                          Math.ceil(displayedOutstandingBalances.length / OUTSTANDING_BALANCES_PAGE_SIZE)
                        )
                          ? "#cbd5e1"
                          : "#0d9488",
                    }}
                  />
                </TouchableOpacity>
              </View>
            )}

            {onHoldBalancesCount > 0 && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setShowOnHoldBalances((v) => !v);
                  setOutstandingBalancesPage(1);
                }}
                style={{ marginTop: 12, alignItems: "center" }}
              >
                <Text style={{ color: "#0d9488", fontSize: 13, fontWeight: "700" }}>
                  {showOnHoldBalances
                    ? "Masquer les mises de côté"
                    : `Afficher aussi les ${onHoldBalancesCount} mise${
                        onHoldBalancesCount > 1 ? "s" : ""
                      } de côté`}
                </Text>
              </TouchableOpacity>
            )}
            </>
          )}
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>

        <BottomMenu
          onFilterCommande={filterClientsWithCommandeEnCours}
          navigation={navigation}
          filterByStatus={filterByStatus}
          resetFilter={resetFilter}
        />
      </View>
      <Modal
        visible={popupVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPopupVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "92%",
              maxHeight: "80%",
              backgroundColor: "#fff",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontWeight: "bold",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              Clients avec interventions / commandes en cours
            </Text>

            {popupData.length === 0 ? (
              <View style={{ padding: 16 }}>
                <Text style={{ textAlign: "center" }}>
                  Aucun élément en cours 👍
                </Text>
              </View>
            ) : (
              <FlatList
                data={popupData}
                keyExtractor={(row) => String(row.client.id)}
                renderItem={({ item }) => (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: "#ddd",
                      borderRadius: 8,
                      padding: 10,
                      marginBottom: 10,
                      backgroundColor: "#f9f9f9",
                      opacity: item.allOnHold ? 0.5 : 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ fontWeight: "bold" }}>
                        {item.client.name?.toUpperCase()} — Fiche{" "}
                        {item.client.ficheNumber}
                      </Text>
                      {item.allOnHold && (
                        <View
                          style={{
                            marginLeft: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 8,
                            backgroundColor: "#e2e8f0",
                          }}
                        >
                          <Text
                            style={{ color: "#475569", fontWeight: "700", fontSize: 11 }}
                          >
                            Mise de côté
                          </Text>
                        </View>
                      )}
                    </View>
                    {item.interventionsEnCours.length > 0 && (
                      <Text style={{ marginTop: 4 }}>
                        🔧 Interventions en cours :{" "}
                        {item.interventionsEnCours.length}
                      </Text>
                    )}
                    {item.ordersEnCours.length > 0 && (
                      <Text>
                        🛒 Commandes en cours : {item.ordersEnCours.length}
                      </Text>
                    )}

					{item.ordersEnCours.some(
  (order) =>
    Array.isArray(order.order_photos) &&
    order.order_photos.length > 0
) && (
  <View
    style={{
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 8,
      marginBottom: 4,
    }}
  >
    {item.ordersEnCours.flatMap((order) =>
      Array.isArray(order.order_photos)
        ? order.order_photos.map((uri, index) => (
            <Image
              key={`${order.id}-photo-${index}`}
              source={{ uri }}
              style={{
                width: 70,
                height: 70,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#270381",
                resizeMode: "cover",
              }}
            />
          ))
        : []
    )}
  </View>
)}
                    <Text style={{ marginTop: 4 }}>
                      💰 À régler :{" "}
                      {item.totals.due.toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })}
                      {item.totals.intervDue > 0
                        ? `  (Interventions: ${item.totals.intervDue.toLocaleString(
                            "fr-FR",
                            {
                              style: "currency",
                              currency: "EUR",
                            }
                          )})`
                        : ""}
                      {item.totals.orderDue > 0
                        ? `  (Commandes: ${item.totals.orderDue.toLocaleString(
                            "fr-FR",
                            {
                              style: "currency",
                              currency: "EUR",
                            }
                          )})`
                        : ""}
                    </Text>

                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      {item.interventionsEnCours.length > 0 && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: "#2c3e50",
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 6,
                          }}
                          onPress={() => {
                            setPopupVisible(false);
                            navigation.navigate("ClientInterventionsPage", {
                              clientId: item.client.id,
                            });
                          }}
                        >
                          <Text
                            style={{
                              color: "#fff",
                              fontWeight: "bold",
                            }}
                          >
                            Voir interventions
                          </Text>
                        </TouchableOpacity>
                      )}
                      {item.ordersEnCours.length > 0 && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: "#007bff",
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 6,
                          }}
                          onPress={() => {
                            setPopupVisible(false);
                            navigation.navigate("OrdersPage", {
                              clientId: item.client.id,
                              clientName: item.client.name,
                              clientPhone: item.client.phone,
                              clientNumber: item.client.ficheNumber,
                            });
                          }}
                        >
                          <Text
                            style={{
                              color: "#fff",
                              fontWeight: "bold",
                            }}
                          >
                            Voir commandes
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              />
            )}

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 6,
              }}
            >
              <TouchableOpacity
                onPress={() => setPopupVisible(false)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  backgroundColor: "#888",
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "bold",
                  }}
                >
                  Fermer
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={async () => {
                  await loadPopupData();
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  backgroundColor: "#28a745",
                  borderRadius: 6,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "bold",
                  }}
                >
                  Rafraîchir
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        transparent
        visible={noteVisible}
        animationType="fade"
        onRequestClose={() => setNoteVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>Note d'information</Text>

            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Ex: commande imprévue, détail à ne pas oublier…"
              placeholderTextColor="#888"
              style={{
                alignSelf: "stretch",
                minHeight: 100,
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 10,
                padding: 10,
                textAlignVertical: "top",
                color: "#111",
                marginTop: 8,
              }}
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#4CAF50" }]}
                onPress={saveNote}
              >
                <Text style={styles.modalButtonText}>Enregistrer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setNoteVisible(false)}
              >
                <Text style={styles.modalButtonTextSecondary}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#ef4444" }]}
                onPress={() => setNoteText("")}
              >
                <Text style={styles.modalButtonText}>Effacer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Choix de la source d'une photo d'intervention (ajout depuis la Home) */}
      <Modal
        visible={!!photoChoiceIntervention}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoChoiceIntervention(null)}
      >
        <Pressable
          style={styles.photoChoiceOverlay}
          onPress={() => setPhotoChoiceIntervention(null)}
        >
          <Pressable style={styles.photoChoiceCard} onPress={() => {}}>
            <Text style={styles.photoChoiceTitle}>Ajouter une image</Text>
            <Text style={styles.photoChoiceSubtitle}>
              Choisissez la source de l'image.
            </Text>

            {[
              {
                label: "📷 Appareil photo",
                onPress: () =>
                  takeAndUploadInterventionPhoto(photoChoiceIntervention.id),
              },
              {
                label: "🖼️ Galerie",
                onPress: () =>
                  pickAndUploadInterventionPhoto(photoChoiceIntervention.id),
              },
              {
                label: "🔍 Recherche web",
                onPress: () =>
                  openWebImageSearchForIntervention(photoChoiceIntervention),
              },
            ].map((option) => (
              <TouchableOpacity
                key={option.label}
                style={styles.photoChoiceOption}
                activeOpacity={0.75}
                onPress={() => {
                  setPhotoChoiceIntervention(null);
                  option.onPress();
                }}
              >
                <Text style={styles.photoChoiceOptionText}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.photoChoiceCancel}
              activeOpacity={0.75}
              onPress={() => setPhotoChoiceIntervention(null)}
            >
              <Text style={styles.photoChoiceCancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Choix de la source d'une photo de commande (ajout depuis la Home) */}
      <Modal
        visible={!!photoChoiceOrder}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoChoiceOrder(null)}
      >
        <Pressable
          style={styles.photoChoiceOverlay}
          onPress={() => setPhotoChoiceOrder(null)}
        >
          <Pressable style={styles.photoChoiceCard} onPress={() => {}}>
            <Text style={styles.photoChoiceTitle}>Ajouter une image</Text>
            <Text style={styles.photoChoiceSubtitle}>
              Choisissez la source de l'image.
            </Text>

            {[
              {
                label: "📷 Appareil photo",
                onPress: () => takeAndUploadOrderPhoto(photoChoiceOrder.id),
              },
              {
                label: "🖼️ Galerie",
                onPress: () => pickAndUploadOrderPhoto(photoChoiceOrder.id),
              },
              {
                label: "🔍 Recherche web",
                onPress: () => openWebImageSearchForOrder(photoChoiceOrder),
              },
            ].map((option) => (
              <TouchableOpacity
                key={option.label}
                style={styles.photoChoiceOption}
                activeOpacity={0.75}
                onPress={() => {
                  setPhotoChoiceOrder(null);
                  option.onPress();
                }}
              >
                <Text style={styles.photoChoiceOptionText}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.photoChoiceCancel}
              activeOpacity={0.75}
              onPress={() => setPhotoChoiceOrder(null)}
            >
              <Text style={styles.photoChoiceCancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Choix de la source d'une photo d'appareil liée à une commande (ajout depuis la Home) */}
      <Modal
        visible={!!photoChoiceOrderProduct}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoChoiceOrderProduct(null)}
      >
        <Pressable
          style={styles.photoChoiceOverlay}
          onPress={() => setPhotoChoiceOrderProduct(null)}
        >
          <Pressable style={styles.photoChoiceCard} onPress={() => {}}>
            <Text style={styles.photoChoiceTitle}>Ajouter une image</Text>
            <Text style={styles.photoChoiceSubtitle}>
              Choisissez la source de l'image.
            </Text>

            {[
              {
                label: "📷 Appareil photo",
                onPress: () =>
                  takeAndUploadOrderProductPhoto(photoChoiceOrderProduct.id),
              },
              {
                label: "🖼️ Galerie",
                onPress: () =>
                  pickAndUploadOrderProductPhoto(photoChoiceOrderProduct.id),
              },
              {
                label: "🔍 Recherche web",
                onPress: () =>
                  openWebImageSearchForOrder(photoChoiceOrderProduct),
              },
            ].map((option) => (
              <TouchableOpacity
                key={option.label}
                style={styles.photoChoiceOption}
                activeOpacity={0.75}
                onPress={() => {
                  setPhotoChoiceOrderProduct(null);
                  option.onPress();
                }}
              >
                <Text style={styles.photoChoiceOptionText}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.photoChoiceCancel}
              activeOpacity={0.75}
              onPress={() => setPhotoChoiceOrderProduct(null)}
            >
              <Text style={styles.photoChoiceCancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Zoom plein écran (photo de commande ou d'intervention) */}
      <Modal
        visible={imageModalVisible}
        animationType="fade"
        transparent={false}
        presentationStyle="fullScreen"
        statusBarTranslucent={true}
        onRequestClose={() => setImageModalVisible(false)}
      >
        <Pressable
          style={styles.fullscreenContainer}
          onPress={() => setImageModalVisible(false)}
        >
          {imageModalUrl && (
            <Image
              source={{ uri: imageModalUrl }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
          <View style={styles.fullscreenClose}>
            <Text style={styles.fullscreenCloseText}>✕</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  fullscreenContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: { width: "100%", height: "100%" },
  fullscreenClose: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenCloseText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  photoChoiceOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  photoChoiceCard: {
    width: 340,
    maxWidth: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  photoChoiceTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 4,
  },
  photoChoiceSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 16,
  },
  photoChoiceOption: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    marginBottom: 10,
  },
  photoChoiceOptionText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  photoChoiceCancel: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  photoChoiceCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(7, 7, 7, 0)",
    width: "100%",
    justifyContent: "flex-start",
  },
  container: {
    flex: 1,
    paddingBottom: 230, // ✅ réserve de l’espace en bas (onglets + BottomMenu)
  },
  toggleButton: {
	height: 46,
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#cacaca",
    borderRadius: 10,
    marginBottom: 0,
  },
  toggleText: {
    marginLeft: 2,
    fontSize: 16,
    color: "#242424",
    fontWeight: "medium",
  },
  iconStyle: {
    width: 24, // Taille de l'icône
    height: 24, // Taille de l'icône
    marginRight: 10, // Espace entre l'icône et le texte
    tintColor: "#242424", // Supprimez si vos images ont déjà une couleur
  },
  menuButton: {
    backgroundColor: "#cacaca",

    justifyContent: "center",
    alignItems: "center",
    position: "absolute", // Position absolue pour le placer en haut à droite
    top: 20, // Distance depuis le haut
    right: 13, // Distance depuis la droite (remplacez `left`)
    zIndex: 10, // S'assure que le bouton est au-dessus du contenu
    borderRadius: 5, // Bords arrondis pour un style plus moderne
  },
  menuIcon: {
    width: 40,
    height: 40,
    tintColor: "#707070", // Supprimez si vos images ont déjà une couleur
  },
  drawer: {
    position: "absolute",
    left: 0, // Positionne le menu à gauche
    top: 0,
    bottom: 0,
    width: 250,
    backgroundColor: "#3a3a3af1",
    padding: 20,
    shadowColor: "#000", // Couleur de l'ombre
    shadowOffset: { width: 5, height: 0 }, // Ombre vers la droite
    shadowOpacity: 0.2, // Opacité de l'ombre
    shadowRadius: 5, // Diffusion de l'ombre
    elevation: 5, // Élévation pour Android
    zIndex: 9,
  },

  drawerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#f1f1f1",
  },
  drawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginVertical: 10,
    color: "#f1f1f1",
  },
  drawerItemIcon: {
    width: 24,
    height: 24,
    marginRight: 10, // Espacement entre l'icône et le texte
  },
  drawerItemText: {
    fontSize: 16,
    color: "#f1f1f1",
  },
  contentText: {
    fontSize: 20,
    fontWeight: "bold",
  },
  repairedCountButton: {
    flexDirection: "row", // Pour aligner l'icône et le texte horizontalement
    alignItems: "center", // Pour centrer le texte à l'intérieur du bouton
    marginBottom: 3,
  },
  repairedCountText: {
    color: "#242424",
    fontWeight: "medium",
    textAlign: "center",
    fontSize: 16,
    marginLeft: 8,
    marginVertical: 5,
  },
  tableValueDueRed: {
    color: "#b00000",
    fontWeight: "bold",
  },

  backgroundImage: {
    flex: 1,
    resizeMode: "cover", // L'image couvre toute la page
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between", // Aligner le titre à gauche et la page à droite
    alignItems: "center",
    marginBottom: 16, // Espace avant la barre de recherche
    marginTop: 58, // Dégage le bouton menu et l'icône date (position absolue en haut)
  },
  pageNumberText: {
    marginRight: 20,
    fontSize: 20,
    color: "#242424", // Assurez-vous que la couleur correspond à votre thème
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    color: "#fff",
  },

  clientCard: {
    padding: 10,
    marginVertical: 5,
    backgroundColor: "#cacaca",
    borderRadius: 10,
  },
  clientInfo: {
    flex: 1,
    paddingRight: 10,
  },
  tableCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },

  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
  },

  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#ececec",
  },

  tableLabel: {
    width: 140,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },

  tableValue: {
    flex: 1,
    fontSize: 14,
    color: "#242424",
    textAlign: "right",
    flexShrink: 1,
  },

  tableMoreText: {
    marginTop: 6,
    fontSize: 12,
    color: "#6b7280",
    fontStyle: "italic",
    textAlign: "center",
  },

  deviceSquare: {
    width: 53,
    height: 53,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#242424",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  clientTextSoldeRestant: {
    fontSize: 20,
    color: "#242424", // Rouge orangé pour attirer l'attention
    fontWeight: "medium",
  },
  expandedContent: {
    paddingTop: 10,
    backgroundColor: "#cacaca",
    marginTop: 10,
    width: "100%",
  },
  deviceIconContainer: {
    position: "absolute",
    bottom: 10,
    right: 10,
  },
  ficheNumber: {
    fontSize: 16,
    fontWeight: "medium",
    color: "#242424",
    marginBottom: 5,
  },
  phoneContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  phoneNumber: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#242424",
  },
  clientText: {
    fontSize: 16,
    color: "#242424",
  },
  statusText: {
    fontSize: 20,
    fontStyle: "normal",
    fontWeight: "bold",
    marginBottom: 10,
    color: "#414141",
  },
  topRightButtons: {
    position: "absolute",
    top: 10,
    right: 10,
    gap: 10,
  },
  photoButton: {
    padding: 10,
    borderRadius: 2,
    marginRight: 10,
    backgroundColor: "#575757", // Fond blanc
    width: 53,
    height: 53,
  },
  editButton: {
    backgroundColor: "#575757", // Bleu pour l'icône d'édition
    padding: 10,
    borderRadius: 2,
    marginRight: 10,
    width: 53,
    height: 53,
  },
  printButton: {
    backgroundColor: "#575757", // Vert pour l'icône d'impression
    padding: 10,
    borderRadius: 2,
    marginRight: 10,
    width: 53,
    height: 53,
  },
  trashButton: {
    backgroundColor: "#575757", // Rouge pour l'icône de poubelle
    padding: 10,
    borderRadius: 2,
    width: 53,
    height: 53,
  },
  transportButton: {
    padding: 10,
    borderRadius: 2,
    marginRight: 10,
    width: 53,
    height: 53,
  },
  rightSection: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  totalInterventionsText: {
    fontSize: 16,
    fontWeight: "light",
    fontStyle: "italic",
    color: "#242424",
  },
  commandeText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#242424",
  },
  noClientsText: {
    textAlign: "center",
    fontSize: 18,
    marginTop: 20,
    color: "#fff",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",

    marginBottom: 140,
  },
  paginationText: {
    fontSize: 18,
    marginHorizontal: 10,
    color: "#242424",
  },
  disabledPaginationText: {
    fontSize: 16,
    marginHorizontal: 10,
    color: "#ccc",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },

  alertMessage: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    backgroundColor: "#007BFF",
    padding: 10,
    borderRadius: 2,
    marginHorizontal: 5, // Espace entre les boutons
    minWidth: 80, // Largeur minimale pour chaque bouton
    alignItems: "center", // Centre le texte à l'intérieur du bouton
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  interventionContainer: {
    flexDirection: "row", // Aligne l'icône et le texte côte à côte
    alignItems: "center", // Centre verticalement
    padding: 10, // Padding pour l'icône

    borderRadius: 2, // Bords arrondis

    marginRight: 8,
    backgroundColor: "#575757", // Fond blanc
  },
  interventionContainerRight: {
    marginTop: 70, // Espacement du haut
  },
  additionalIconsContainer: {
    flexDirection: "row",
    flexWrap: "wrap", // reste sur 1 ligne tant qu’il y a la place
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 5, // espacement identique
    marginTop: 8,
  },

  interventionBox: {
    flexDirection: "row", // Aligner l'icône et le texte en ligne
    alignItems: "center", // Centrer verticalement
    padding: 10, // Ajouter du padding à l'intérieur du rectangle
    borderWidth: 1, // Épaisseur de la bordure
    borderRadius: 2, // Bordures arrondies pour correspondre au style des autres icônes
    borderColor: "#888787", // Couleur de la bordure (vous pouvez l'adapter à vos besoins)
    backgroundColor: "#575757", // Couleur de fond (adaptez-la si nécessaire)
    shadowColor: "#000", // Ombre (si cela correspond au style des autres icônes)
    shadowOpacity: 0.2, // Légère opacité pour l'ombre
    shadowOffset: { width: 2, height: 2 },
  },
  interventionsCount: {
    fontSize: 16,
    fontWeight: "medium",
    marginLeft: 5, // Espace entre l'icône et le texte
    color: "#ffffff", // Couleur du texte
  },
  interventionsEnCoursContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  interventionCountCircle: {
    width: 30, // Taille du cercle
    height: 30, // Taille du cercle
    borderRadius: 2, // Forme circulaire
    backgroundColor: "#32CD32", // Vert
    justifyContent: "center", // Centre verticalement
    alignItems: "center", // Centre horizontalement
    marginLeft: 10, // Espace entre le texte et le cercle
  },
  interventionCountText: {
    color: "#fff", // Texte blanc
    fontWeight: "bold", // Texte en gras
    fontSize: 16, // Taille du texte
  },
  totalInterventions: {
    color: "#fff", // Texte blanc
    fontWeight: "bold", // Texte en gras
    fontSize: 16, // Taille du texte
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  iconRowContainer: {
    flexDirection: "row", // Aligne les icônes horizontalement
    alignItems: "center", // Centre verticalement les icônes
  },
  notificationIconContainer: {
    width: 53,
    height: 53,
    padding: 10, // Padding pour l'icône
    borderRadius: 2, // Bords arrondis
    marginRight: 10, // Espace à droite de l'icône pour séparer les icônes
    backgroundColor: "#575757", // Fond blanc */
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  buttonContainerMasquer: {
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
},
  alertBox: {
    width: "85%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#222",
    marginBottom: 12,
    textAlign: "center",
  },

  modalText: {
    fontSize: 16,
    color: "#333",
    marginBottom: 8,
  },
  modalButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 16,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    width: "100%",
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    marginHorizontal: 6,
    backgroundColor: "#1976D2",
  },
  modalButtonSecondary: {
    backgroundColor: "#E0E0E0",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  modalButtonTextSecondary: {
    color: "#333",
    fontWeight: "bold",
    fontSize: 16,
    textAlign: "center",
  },

  statusContent: {
    flexDirection: "row", // Aligne l'icône et le texte côte à côte
    alignItems: "center", // Centrage vertical
    marginBottom: 10,
  },
  cardHeaderRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 8,
},

descriptionText: {
  flex: 1,
  marginLeft: 8,
  textAlign: "right",
  fontSize: 13,
  color: "#242424",
},
dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop:3,
    marginBottom: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: "rgba(0,0,0,0.25)",
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: "#2563eb",
    transform: [{ scale: 1.15 }],
  },
  iconCircle: {
    backgroundColor: "#575757", // Couleur de fond gris
    width: 32, // Diamètre du cercle
    height: 32, // Diamètre du cercle
    borderWidth: 1, // Épaisseur de la bordure
    borderRadius: 2, // Moitié de la largeur/hauteur pour faire un cercle
    borderColor: "#242424", // Couleur de fond gris
    justifyContent: "center", // Centrage de l'icône à l'intérieur du cercle
    alignItems: "center", // Centrage de l'icône à l'intérieur du cercle
    marginRight: 8, // Espace entre le cercle et le texte
  },
  separator: {
    height: 1, // Épaisseur de la barre
    backgroundColor: "#888787", // Couleur de la barre
    marginVertical: 8, // Espacement vertical optionnel
  },
  totalText: {
    color: "#242424",
    marginRight: 40,
    padding: 8,
    backgroundColor: "#cacaca",
    borderRadius: 10,

    elevation: 1, // Ajoute une ombre pour un effet de profondeur
  },
  images_numberText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
    gap: 10,
  },
  homeActionBtn: {
    minWidth: 150,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  homeActionBtnText: {
    color: "#1e293b",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
  homeActionBtnHighlight: {
    borderWidth: 1.5,
    borderColor: "#f59e0b",
  },
  dateContainer: {
    flexDirection: "row", // Alignement horizontal
    alignItems: "center",
    borderRadius: 10, // Coins arrondis
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#cacaca",
    position: "absolute", // Icône compacte, à côté du bouton menu
    top: 20,
    right: 63,
    zIndex: 10,
  },
  icon: {
    width: 20,
    height: 20,
    tintColor: "#242424", // Couleur de l'icône
    marginRight: 8, // Espacement entre l'icône et le texte
  },
  dateText: {
    fontSize: 16,
    fontWeight: "medium",
    color: "#242424", // Texte en vert
  },
  timeContainer: {
    flexDirection: "row", // Alignement horizontal
    alignItems: "center",
    borderRadius: 10, // Coins arrondis
    paddingVertical: 8, // Espacement intérieur haut/bas
    paddingHorizontal: 50, // Espacement intérieur gauche/droite
    backgroundColor: "#cacaca", // Fond blanc
    alignSelf: "center", // Centrage horizontal
    marginLeft: 10,
  },
  timeText: {
    fontSize: 20,
    fontWeight: "medium",
    color: "#242424", // Couleur orange pour l'heure
  },
  orderButton: {
    width: 50,
    height: 50,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    marginLeft: 5,
  },
  orderIcon: {
    width: 30,
    height: 30,
    tintColor: "orange",
  },

  amountText: {
    fontSize: 16,
    fontWeight: "medium",
    color: "#242424", // Couleur orange pour l'heure
  },

  suggestionBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    maxHeight: 180,
    overflow: "hidden",
  },

  suggestionText: {
    fontSize: 16,
    color: "#333333",
  },
  searchIcon: {
    marginLeft: 8,
  },

  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },

  acceptRiskText: {
    fontSize: 16,
    color: "#a10303",
    marginTop: 10,
  },
  buttonRowG: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBlock: 10,
  },

  modalButtonG: {
    flex: 1,
    padding: 10,
    marginHorizontal: 4,
    borderRadius: 8,
    alignItems: "center",
  },

  modalButtonTextG: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "medium",
  },

  modalButtonSecondaryG: {
    backgroundColor: "#ccc",
    marginTop: 16,
  },

  modalButtonTextSecondaryG: {
    color: "#333",
    textAlign: "center",
    fontWeight: "bold",
  },
  dueBox: {
    maxWidth: 250,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d42d2d",
  },
  dueMainText: {
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },

  dueHintsWrap: {
    marginTop: 4,
    gap: 2, // si non supporté par ta version RN, remplace par marginBottom sur chaque enfant
  },

  dueHintText: {
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
    flexWrap: "wrap",
  },
  dueText: {
    fontSize: 14,
    color: "#b00000",
    fontWeight: "bold",
  },
  expressCard: {
    marginHorizontal: 15,
    marginTop: 10,

    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  expressTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#9a3412",
    marginBottom: 6,
  },
  expressItem: {
    fontSize: 14,
    color: "#7c2d12",
    marginBottom: 2,
  },
  expressMore: {
    marginTop: 4,
    fontSize: 13,
    fontStyle: "italic",
    color: "#9a3412",
  },
  iconSquare: {
    width: 53,
    height: 53,
    borderRadius: 8,
    backgroundColor: "#575757",
    borderWidth: 1,
    borderColor: "#3f3f3f",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  iconBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ff3b30",
  },
  countBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9, // même rondeur partout
    backgroundColor: "#2c7a7b",
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  labelInSquare: {
    width: "100%",
    height: "100%",
    borderRadius: 8, // même radius que iconSquare
    resizeMode: "cover", // on remplit proprement le carré
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    width: "100%",
    borderRadius: 8,
  },
  optionIcon: {
    width: 28,
    height: 28,
    tintColor: "#374151",
    marginRight: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111827",
  },
  optionSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  optionDivider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    alignSelf: "stretch",
    marginVertical: 8,
  },
  repairedCountContainer: {
    alignItems: "stretch",
  },

  counterBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  btnRepaired: {
    backgroundColor: "#e6f1e6",
    borderColor: "#6b8f6b",
  },

  btnNR: {
    backgroundColor: "#f6eaea",
    borderColor: "#a16565",
  },

  btnDisabled: {
    opacity: 0.5,
  },

  counterBtnText: {
    color: "#242424",
    fontWeight: "bold",
    textAlign: "center",
  },
  badgeNotify: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    overflow: "hidden",
  },
  badgeNotifyYes: {
    backgroundColor: "#e8f1ff",
    borderColor: "#0d6efd",
    color: "#0b5ed7",
  },
  badgeNotifyNo: {
    backgroundColor: "#f3f4f6",
    borderColor: "#cfd4da",
    color: "#5f6368",
  },
  bannedName: {
    color: "#b91c1c", // rouge soutenu
    fontWeight: "800",
  },
  bannedRow: {
    backgroundColor: "#fff1f2", // léger rose
  },
  bannedBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "#fee2e2",
    borderColor: "#b91c1c",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bannedBadgeText: {
    color: "#7f1d1d",
    fontWeight: "800",
    fontSize: 11,
  },
  suggestionsBox: {
	maxHeight: 330,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    marginTop: 6,
    
zIndex: 1000,
elevation: 20,
  },

  // ligne + nom “banni”
  sugRowBanned: { backgroundColor: "#fff1f2" },
  sugName: { fontWeight: "800", color: "#111827" },
  sugNameBanned: { color: "#b91c1c" },

  // badge “BANNI”
  sugBadgeBanned: {
    alignSelf: "flex-start",
    marginTop: 2,
    backgroundColor: "#fee2e2",
    borderColor: "#b91c1c",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sugBadgeBannedText: { color: "#7f1d1d", fontWeight: "800", fontSize: 11 },

  // si pas déjà présents
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#888787",
    borderRadius: 5,
    paddingHorizontal: 10,

    backgroundColor: "#cacaca",
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: "#242424",
    paddingHorizontal: 10,
  },
  searchContainerBanned: {
    borderColor: "#b91c1c",
    backgroundColor: "#fff1f2",
  },
  searchInputBanned: {
    color: "#7f1d1d",
  },
  bannedHint: {
    marginTop: 4,
    color: "#7f1d1d",
    fontSize: 12,
    fontStyle: "italic",
  },
  warningIcon: {
    width: 44,
    height: 44,
    tintColor: "#b91c1c",
    marginBottom: 8,
  },

  bannedCard: {
    alignSelf: "stretch",
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
  },

  bannedLine: {
    fontSize: 15,
    color: "#111827",
    marginBottom: 4,
  },

  bannedLabel: {
    fontWeight: "700",
    color: "#374151",
  },

  bannedReason: {
    fontSize: 15,
    color: "#7f1d1d",
    marginTop: 6,
  },
  // ✅ Bouton fin de slider (retour aux 2 premières fiches)
  backToStartBtn: {
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffffff",
    backgroundColor: "#191f2f",
  },
  backToStartText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.2,
  },
reminderBox: {
  width: "100%",
  marginTop: 6,
  marginBottom: 8,
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderWidth: 1,
  borderColor: "#cbd5e1",
  borderRadius: 8,
  backgroundColor: "#f8fafc",
},

reminderBoxTitle: {
  marginBottom: 6,
  fontSize: 11,
  fontWeight: "bold",
  color: "#475569",
},

reminderItem: {
  paddingHorizontal: 9,
  paddingVertical: 7,
  borderRadius: 7,
  backgroundColor: "#ffffff",
},

reminderItemInfo: {
  backgroundColor: "#e0f2fe",
  borderLeftWidth: 4,
  borderLeftColor: "#0369a1",
},

reminderItemLoan: {
  backgroundColor: "#fff7ed",
  borderLeftWidth: 4,
  borderLeftColor: "#b45309",
},

reminderItemSpacing: {
  marginTop: 6,
},

reminderLoanTitle: {
  fontSize: 12,
  fontWeight: "bold",
  color: "#b45309",
  letterSpacing: 0.3,
},

reminderInfoTitle: {
  fontSize: 12,
  fontWeight: "bold",
  color: "#0369a1",
  letterSpacing: 0.3,
},

reminderText: {
  marginTop: 2,
  fontSize: 13,
  fontWeight: "600",
  color: "#334155",
},
});
const stylesNS = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 24,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 2,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 12,
  },
  rowIcon: { width: 26, height: 26, marginRight: 12 },
  rowTextWrap: { flex: 1 },
  rowTitle: { fontSize: 16, color: "#111827", fontWeight: "600" },
  rowSubtitle: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  chev: { width: 20, height: 20, tintColor: "#9ca3af", marginLeft: 10 },
  closeBtn: {
    marginTop: 8,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  closeText: { color: "#111827", fontWeight: "700", fontSize: 15 },
  amountLine: { fontSize: 16, color: "#242424", fontWeight: "600" },
  amountMain: { fontWeight: "800", color: "#242424" },
  amountHint: { fontSize: 14, color: "#666", fontStyle: "italic" }, // affiché à droite

  dueRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between", // ← met la mention à droite, dans le même encart
  },

  dueHint: {
    fontSize: 14,
    color: "#666",
    fontStyle: "italic",
  },
  // Conteneur de l'encart EXPRESS avec ancrage possible
  expressWrap: {
    position: "relative",
    marginHorizontal: 15, // aligne avec ton expressCard existant
    marginTop: 30,
	marginBottom: 125,
  },

  // Carte "Commandes en cours" ancrée en bas à droite
  ordersOverlay: {
    position: "absolute",
    right: 10,
    bottom: 10,
    width: 320,
    backgroundColor: "#eef6ff",
    borderColor: "#93c5fd",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    zIndex: 5, // ← ajoute ça
  },

  // Sous stylesNS = StyleSheet.create({...})
  ordersCard: {
    marginTop: 10,
    backgroundColor: "#eef6ff",
    borderColor: "#93c5fd",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },

  ordersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  ordersTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e3a8a",
  },

  ordersCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },

  closeBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
  },

  ordersRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    gap: 10,
  },

  ordersMain: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "700",
  },

  ordersSub: {
    marginTop: 2,
    fontSize: 13,
    color: "#6b7280",
  },

  ordersPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
  },

  ordersPillOk: {
    backgroundColor: "#ecfdf5",
    borderColor: "#34d399",
    color: "#059669",
  },

  ordersPillDue: {
    backgroundColor: "#fff1f2",
    borderColor: "#fb7185",
    color: "#be123c",
  },

  ordersMore: {
    marginTop: 6,
    fontSize: 13,
    fontStyle: "italic",
    color: "#1e3a8a",
  },
  card: {
    marginHorizontal: 15,
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ccd9ec",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderRadius: 10,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },

  cardChevron: {
    width: 20,
    height: 20,
    tintColor: "#6b7280",
  },

  cardBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    gap: 10,
  },

  rowMain: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "700",
  },

  rowSub: {
    marginTop: 2,
    fontSize: 13,
    color: "#6b7280",
  },

  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
  },
  pillAttente: { backgroundColor: "#DFE7FF", color: "#1D4ED8" }, // Créée
  pillEnCours: { backgroundColor: "#FFF3CD", color: "#8A6D3B" }, // Reçue
  pillPayee: { backgroundColor: "#D1FAE5", color: "#065F46" }, // Payée
  pillTerminee: { backgroundColor: "#E2E3E5", color: "#41464B" }, // Restituée
  pillOk: {
    backgroundColor: "#ecfdf5",
    borderColor: "#34d399",
    color: "#059669",
  },

  pillDue: {
    backgroundColor: "#fff1f2",
    borderColor: "#fb7185",
    color: "#be123c",
  },

  moreText: {
    marginTop: 6,
    fontSize: 13,
    fontStyle: "italic",
    color: "#1e3a8a",
  },
  pillNeutral: {
    backgroundColor: "#e5e7eb", // gris clair
    color: "#111827",
  },
  encartMoney: {
    fontSize: 14,
    fontWeight: "700",
  },
  encartMoneyMuted: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6b7280", // gris
  },
  encartSub: {
    fontSize: 12,
    color: "#6b7280",
  },
tabBadge: {
  minWidth: 22,
  height: 22,
  borderRadius: 11,
  backgroundColor: "#242424",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 6,
},

tabBadgeText: {
  color: "#fff",
  fontSize: 12,
  fontWeight: "800",
},
tabsRow: {
  flexDirection: "row",
  gap: 8,
  marginBottom: 8,
},

tabBtn: {
  flex: 1,
  paddingVertical: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "#b7c3d6",
  backgroundColor: "#e6e6e6",
  alignItems: "center",
  justifyContent: "center",
},

tabBtnActive: {
  backgroundColor: "#ccd9ec",
  borderColor: "#93a8c8",
},

tabText: {
  fontSize: 15,
  fontWeight: "700",
  color: "#242424",
},

tabTextActive: {
  color: "#111827",
},


  backToStartBtn: {
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffffff",
    backgroundColor: "#191f2f",
  },
  backToStartText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },  
searchActionOverlay: {
  flex: 1,
  backgroundColor: "rgba(0, 0, 0, 0.55)",
  justifyContent: "center",
  alignItems: "center",
  padding: 20,
},

searchActionBox: {
  width: "100%",
  maxWidth: 500,
  backgroundColor: "#ffffff",
  borderRadius: 14,
  padding: 20,
  elevation: 12,
},

searchActionTitle: {
  fontSize: 22,
  fontWeight: "800",
  color: "#242424",
  textAlign: "center",
  marginBottom: 4,
},

searchActionInfo: {
  fontSize: 15,
  color: "#555555",
  textAlign: "center",
},

searchActionQuestion: {
  fontSize: 17,
  fontWeight: "700",
  color: "#242424",
  textAlign: "center",
  marginTop: 18,
  marginBottom: 12,
},

searchActionButton: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-start",
  minHeight: 56,
  borderRadius: 9,
  paddingHorizontal: 16,
  marginBottom: 10,
  overflow: "hidden",
},

interventionActionButton: {
  backgroundColor: "#2563eb",
},

orderActionButton: {
  backgroundColor: "#d97706",
},

clientActionButton: {
  backgroundColor: "#15803d",
},

searchActionIcon: {
  width: 27,
  height: 27,
  tintColor: "#ffffff",
  marginRight: 14,
  resizeMode: "contain",
},

searchActionButtonText: {
  flex: 1,
  color: "#ffffff",
  fontSize: 17,
  fontWeight: "700",
},

searchActionCancel: {
  alignItems: "center",
  paddingVertical: 12,
  marginTop: 2,
},

searchActionCancelText: {
  color: "#991b1b",
  fontSize: 16,
  fontWeight: "700",
},
clientSearchModalIcon: {
  width: 24,
  height: 24,
  maxWidth: 24,
  maxHeight: 24,
  marginRight: 12,
  tintColor: "#ffffff",
  resizeMode: "contain",
  flexShrink: 0,
},
homeOrderPhotos: {
  flexDirection: "row",
  flexWrap: "wrap",
  marginTop: 8,
  gap: 6,
},

homeOrderPhoto: {
  width: 70,
  height: 70,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "#270381",
  resizeMode: "cover",
},
});
