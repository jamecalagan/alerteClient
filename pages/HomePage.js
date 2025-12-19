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
  Alert,
  Animated,
  TouchableWithoutFeedback,
  Easing,
  Pressable,
  ScrollView,
} from "react-native";
import { supabase } from "../supabaseClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useFocusEffect, CommonActions } from "@react-navigation/native";

import * as Animatable from "react-native-animatable";
import BottomMenu from "../components/BottomMenu";
import { Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
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
  const total = Math.max(0, +n(totalCandidate).toFixed(2));

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

// retourne un timestamp (ms) de la DERNIÈRE intervention d'un client
const __latestInterventionMs = (client) => {
  const list = Array.isArray(client?.interventions) ? client.interventions : [];
  let best = 0;
  for (const it of list) {
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
const __isActiveOrder = (o) =>
  o && o.paid !== true && !__CLOSED_ORDER.has(__norm(o.status));

const __coalesceDate = (r) =>
  r?.created_at ||
  r?.createdAt ||
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

export default function HomePage({ navigation, route, setUser }) {
  const flatListRef = useRef(null);
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [orderAsc, setOrderAsc] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [cleanupModalVisible, setCleanupModalVisible] = useState(false);
  const [transportModalVisible, setTransportModalVisible] = useState(false);
  const [selectedCommande, setSelectedCommande] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true); // Loader state
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
  const [openExpress, setOpenExpress] = useState(true);
  const [openOrders, setOpenOrders] = useState(true);
  // —— Note ultra simple
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteIntervId, setNoteIntervId] = useState(null);
  const [noteClientId, setNoteClientId] = useState(null);
const [bottomTab, setBottomTab] = useState(null); // null = rien affiché
const [sliderH, setSliderH] = useState(0);

const toggleBottomTab = (key) => {
  setBottomTab((prev) => (prev === key ? null : key));
};


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
  // Ouvre la modale pour la dernière intervention de la fiche
  const openNote = (clientItem) => {
    const li = clientItem?.latestIntervention;
    if (!li?.id) {
      Alert.alert(
        "Aucune intervention",
        "Cette fiche n'a pas d'intervention active."
      );
      return;
    }
    setNoteIntervId(li.id);
    setNoteClientId(clientItem.id);
    setNoteText(li.info_note || "");
    setNoteVisible(true);
  };

  // Sauvegarde en base + patch local super simple
  const saveNote = async () => {
    if (!noteIntervId) return;
    const { error } = await supabase
      .from("interventions")
      .update({ info_note: noteText })
      .eq("id", noteIntervId);

    if (error) {
      Alert.alert("Erreur", "Impossible d’enregistrer la note.");
      return;
    }

    // Patch local minimal
    const patch = (c) => {
      if (c.id !== noteClientId) return c;
      const interventions = (c.interventions || []).map((it) =>
        it.id === noteIntervId ? { ...it, info_note: noteText } : it
      );
      const latest =
        c.latestIntervention?.id === noteIntervId
          ? { ...c.latestIntervention, info_note: noteText }
          : c.latestIntervention;
      return { ...c, interventions, latestIntervention: latest };
    };
    setClients((prev) => prev.map(patch));
    setFilteredClients((prev) => prev.map(patch));

    setNoteVisible(false);
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
      Alert.alert(
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
      Alert.alert("Erreur", "Impossible d’enregistrer le signalement.");
    }
  };

  const [NotRepairedNotReturnedCount, setNotRepairedNotReturnedCount] =
    useState(0);
  const hasPendingOrder =
    Array.isArray(orders) &&
    orders.some((order) => order.client_id === String(item.id) && !order.paid);
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
  // Charge les commandes en cours (paid=false OU saved=false) pour l'encart
  const loadOrdersInProgress = async () => {
    try {
      const { data: rows, error: err } = await supabase
        .from("orders")
        .select("*")
        .or("paid.eq.false,saved.eq.false"); // pas d'ORDER BY (on trie côté JS)

      if (err) throw err;

      const sorted = (rows || [])
        .slice()
        .sort(
          (a, b) => new Date(__coalesceDate(b)) - new Date(__coalesceDate(a))
        );

      const ids = [...new Set(sorted.map((o) => o.client_id).filter(Boolean))];
      let map = {};
      if (ids.length > 0) {
        const { data: clients, error: cErr } = await supabase
          .from("clients")
          .select("id, name, phone, ficheNumber")
          .in("id", ids);
        if (cErr) throw cErr;
        map = Object.fromEntries((clients || []).map((c) => [String(c.id), c]));
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
      // 1) Clients + interventions + commandes
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select(
          `
        *,
        interventions(
          id, status, createdAt, solderestant, cost, commande, info_note
        ),
        orders(
          id, price, deposit, paid, saved, product
        )
      `
        )
        .order("createdAt", { ascending: false });

      if (clientsError) throw clientsError;

      // 2) Filtrage "en cours"
      const rows = (clientsData || [])
        .map((c) => {
          const interventions = Array.isArray(c.interventions)
            ? c.interventions
            : [];
          const orders = Array.isArray(c.orders) ? c.orders : [];

          const interventionsEnCours = interventions.filter(
            (i) => !["Réparé", "Récupéré", "Non réparable"].includes(i.status)
          );

          const ordersEnCours = orders.filter((o) => !o.paid || !o.saved);

          if (interventionsEnCours.length === 0 && ordersEnCours.length === 0) {
            return null;
          }

          const totalIntervDu = interventionsEnCours
            .filter((i) => (i.solderestant ?? 0) > 0)
            .reduce((s, i) => s + (i.solderestant || 0), 0);

          const totalOrdersDue = ordersEnCours.reduce((s, o) => {
            const price = Number(o.price || 0);
            const deposit = Number(o.deposit || 0);
            return s + Math.max(price - deposit, 0);
          }, 0);

          return {
            client: {
              id: c.id,
              name: c.name,
              phone: c.phone,
              ficheNumber: c.ficheNumber,
            },
            interventionsEnCours,
            ordersEnCours,
            totals: {
              due: totalIntervDu + totalOrdersDue,
              intervDue: totalIntervDu,
              orderDue: totalOrdersDue,
            },
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.totals.due - a.totals.due); // les plus “urgents” d’abord

      setPopupData(rows);
    } catch (e) {
      console.error("Popup load error:", e);
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
    setIsLoading(true);
    try {
      const dateLimite = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000
      ).toISOString();

      // 1) Images ajoutées dans la table 'intervention_images'
      const extraPromise = supabase
        .from("intervention_images")
        .select("id, image_data, created_at")
        .lte("created_at", dateLimite);

      // 2) Photos enregistrées dans 'interventions.photos' (fiches récupérées de +10 j)
      const intvPromise = supabase
        .from("interventions")
        .select("id, photos, updatedAt, status")
        .eq("status", "Récupéré")
        .lte("updatedAt", dateLimite); // ⚠️ camelCase, pas updated_at

      const [
        { data: extraData, error: extraErr },
        { data: intvData, error: intvErr },
      ] = await Promise.all([extraPromise, intvPromise]);

      if (extraErr) throw extraErr;
      if (intvErr) throw intvErr;

      // Compte des images "cloud" (URL http) dans la table extra
      const extraCount = (extraData || []).filter(
        (img) =>
          typeof img.image_data === "string" &&
          img.image_data.startsWith("http")
      ).length;

      // Compte des photos "cloud" dans interventions.photos
      const photosCount = (intvData || [])
        .flatMap((it) => (Array.isArray(it.photos) ? it.photos : []))
        .filter((u) => typeof u === "string" && u.startsWith("http")).length;

      const total = extraCount + photosCount;

      setHasImagesToDelete(total > 0);
      // si tu as un compteur à l’écran :
      // setImagesToDeleteCount(total);
    } catch (err) {
      setHasImagesToDelete(false);
      // setImagesToDeleteCount?.(0);
    } finally {
      setIsLoading(false);
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
  const calculateTotalOngoingCost = (clients) => {
    const allInterventions = clients.flatMap((client) =>
      client.interventions.filter((intervention) =>
        ["Réparé", "Intervention en cours", "En attente de pièces"].includes(
          intervention.status
        )
      )
    );

    const totalCost = allInterventions.reduce(
      (sum, intervention) => sum + (intervention.solderestant || 0),
      0
    );

    return totalCost.toFixed(2);
  };

  const [totalCost, setTotalCost] = useState(0);
  useEffect(() => {
    if (clients.length > 0) {
      const total = calculateTotalOngoingCost(clients);
      setTotalCost(total);
    }
  }, [clients]);

  
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

                        // Agrégation des commandes du client
                        const ordAgg = summarizeClientOrders(item.orders || []);
                        const ordDue = ordAgg.restStandalone; // seulement les commandes "simples"
                        const ordTotal = ordAgg.totalStandalone;
                        const ordDeposit = ordAgg.depositStandalone;
                        const hasIncludedOrder = ordAgg.hasIncluded;

                        // Acompte éventuel sur l’intervention (pour le hint, s’il existe)
                        const intervDeposit = _toNum(
                          item?.latestIntervention?.partialPayment ??
                            item?.latestIntervention?.acompte
                        );

                        // Total à régler : intervention + commandes "simples" (on n’ajoute PAS les incluses)
                        const totalDue = interDue + ordDue;

                        const isNotified =
                          item.latestIntervention?.notifiedBy ||
                          (item.orders || []).some((order) => order.notified);

                        const isEven = index % 2 === 0;
                        const backgroundColor = isEven ? "#f9f9f9" : "#e0e0e0";
                        const isExpanded = expandedClientId === item.id;

                        const ongoingInterventions =
                          item.interventions?.filter(
                            (intervention) =>
                              intervention.status !== "Réparé" &&
                              intervention.status !== "Récupéré"
                          ) || [];
                        const totalInterventionsEnCours =
                          ongoingInterventions.length;
                        const totalInterventions = item.interventions
                          ? item.interventions.length
                          : 0;
                        const latestIntervention = item.latestIntervention;
                        const hasOrders = item.orders && item.orders.length > 0;

                        const status =
                          ongoingInterventions.length > 0
                            ? ongoingInterventions[0].status
                            : hasOrders
                            ? "Commande en cours"
                            : "Aucun statut";
                        const totalImages =
                          latestIntervention?.photos?.length || 0;
                        const commande = latestIntervention?.commande;
                        const orderColor = getOrderColor(item.orders || []);
                        const shouldBlink = item.orders?.some(
                          (order) => !order.paid
                        );
                        const labelUri =
                          item?.latestIntervention?.label_photo || null;
                        // Bleu si une commande du client est marquée notifiée (on tolère true/"true"/1)
                        const orderNotified =
                          Array.isArray(item.orders) &&
                          item.orders.some((o) => isTruthy(o?.notified));

                        return (
                          // <View style={[styles.clientCard, { backgroundColor:backgroundColor }]}>
                          <Animatable.View
                            animation="zoomIn" // Type d'animation
                            duration={500} // Durée en millisecondes
                            delay={index * 200} // Délai basé sur l'index pour un effet "une après l'autre"
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

    {latestIntervention?.description ? (
      <Text
        style={styles.descriptionText}
        numberOfLines={2}
      >
        {latestIntervention.description}
      </Text>
    ) : null}
  </View>

  {(() => {
                                // ====== 1) Construction des lignes du tableau ======
                                const li = latestIntervention;

                                const activeOrders = (item.orders || []).filter(
                                  (o) => !o.paid || !o.saved
                                );

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
                                    label: "Fiche",
                                    value: `N° ${item.ficheNumber ?? "—"}`,
                                  },
                                  {
                                    label: "Nom",
                                    value: (item.name || "—").toUpperCase(),
                                  },
                                  {
                                    label: "Téléphone",
                                    value: formatPhoneNumber(item.phone),
                                  },
                                  {
                                    label: "Statut",
                                    value: status,
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
                                            source={require("../assets/icons/order.png")}
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

                                      {/* Icône commande transport (si en attente de pièces) */}
                                      {status === "En attente de pièces" &&
                                        commande &&
                                        (li?.commande_effectuee ? (
                                          <IconSquare
                                            source={require("../assets/icons/shipping_fast.png")}
                                            tintColor="#00fd00"
                                            onPress={() => {
                                              setSelectedCommande(commande);
                                              setTransportModalVisible(true);
                                            }}
                                          />
                                        ) : (
                                          <IconSquare
                                            source={require("../assets/icons/shipping.png")}
                                            tintColor="#a073f3"
                                            onPress={() => {
                                              setSelectedCommande(commande);
                                              setTransportModalVisible(true);
                                            }}
                                          />
                                        ))}

                                      {/* Note info (une seule fois) */}
                                      {(() => {
                                        const hasNote = Boolean(
                                          li?.info_note &&
                                            li.info_note.trim().length > 0
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
        .eq("restitue", false);

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
 info_note
        ),
        orders(
  id,
  price,
  deposit,
  product,
  brand,
  model,
  paid,
  saved,
  notified
)
    `
        )
        .order("createdAt", { ascending: false });

      if (clientsError) throw clientsError;

      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*");

      if (ordersError) throw ordersError;

      const ordersByClient = {};

      ordersData.forEach((order) => {
        order.notified = toBool(order.notified);
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
        setAlertVisible(true);
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
    const hasTZ = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(s);
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

    // si champ vide -> on remet la liste initiale
    if (!text || !text.trim()) {
      setFilteredClients(clients);
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
  photos, label_photo, notifiedBy, notify_type, print_etiquette, info_note
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
  photos, label_photo, notifiedBy, notify_type, print_etiquette, info_note
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
  photos, label_photo, notifiedBy, notify_type, print_etiquette, info_note
)

        `
          )
          .ilike("name", `%${query}%`);
      }

      const { data: clientsData, error: clientError } = await clientQuery;
      if (clientError) {
        console.error("❌ Erreur chargement clients :", clientError);
        setFilteredClients([]);
        return;
      }

      // ————— 2) enrichissement avec orders (identique à ton flux) —————
      const combined = clientsData || [];
      if (combined.length === 0) {
        setFilteredClients([]);
        return;
      }

      const { data: ordersData, error: orderError } = await supabase
        .from("orders")
        .select("*, client_id")
        .in(
          "client_id",
          combined.map((c) => c.id)
        );

      if (orderError) {
        console.error("❌ Erreur chargement commandes :", orderError);
        setFilteredClients(combined);
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
      setFilteredClients(enriched);
    } catch (e) {
      console.error("❌ Erreur lors de la recherche des clients :", e);
      setFilteredClients([]);
    } finally {
      setIsLoading(false);
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
        Alert.alert(
          "Erreur",
          "Impossible de se déconnecter. Veuillez réessayer."
        );
        return;
      }

      console.log("Déconnexion réussie ! Redirection vers Login...");
    } catch (err) {
      console.error("Erreur inattendue lors de la déconnexion :", err);
      Alert.alert("Erreur", "Une erreur inattendue est survenue.");
    }
  };

  const DateDisplay = () => {
    const [currentDate, setCurrentDate] = useState("");

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
      <View style={styles.dateContainer}>
        <Image
          source={require("../assets/icons/calendar.png")}
          style={styles.icon}
        />
        <Text style={styles.dateText}>{currentDate}</Text>
      </View>
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
          "id, client_id, paid, saved, price, deposit, product, brand, model, notified"
        )
        .or("paid.eq.false,saved.eq.false");

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

      const clientIdsFromOrders = unpaidOrders
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
        const clientOrders = unpaidOrders.filter(
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
                  Alert.alert(
                    "Confirmation",
                    "Êtes-vous sûr de vouloir vous déconnecter ?",
                    [
                      {
                        text: "Annuler",
                        style: "cancel",
                      },
                      {
                        text: "Déconnexion",
                        onPress: async () => {
                          try {
                            await handleLogout();
                            toggleMenu();
                          } catch (error) {
                            console.error("Erreur de déconnexion :", error);
                          }
                        },
                        style: "destructive",
                      },
                    ],
                    { cancelable: true }
                  );
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
                <View style={styles.repairedCountContainer}>
                  {/* Bouton — Réparés en attente */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() =>
                      repairedNotReturnedCountSafe > 0 &&
                      navigation.navigate("RepairedInterventionsListPage", {
                        initialFilter: "Réparé",
                      })
                    }
                    disabled={repairedNotReturnedCountSafe === 0}
                    style={[
                      styles.counterBtn,
                      styles.btnRepaired,
                      repairedNotReturnedCountSafe === 0 && styles.btnDisabled,
                    ]}
                  >
                    <Text style={styles.counterBtnText}>
                      Produits réparés en attente de restitution :{" "}
                      {repairedNotReturnedCountSafe}
                    </Text>
                  </TouchableOpacity>

                  {/* Bouton — Non réparables */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() =>
                      notRepairableCountSafe > 0 &&
                      navigation.navigate("RepairedInterventionsListPage", {
                        initialFilter: "Non réparable",
                      })
                    }
                    disabled={notRepairableCountSafe === 0}
                    style={[
                      styles.counterBtn,
                      styles.btnNR,
                      { marginTop: 6 },
                      notRepairableCountSafe === 0 && styles.btnDisabled,
                    ]}
                  >
                    <Text style={styles.counterBtnText}>
                      Produits non réparables : {notRepairableCountSafe}
                    </Text>
                  </TouchableOpacity>
                </View>

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
                      onPress={() => navigation.navigate("StoredImages")}
                      style={{
                        marginRight: 40,
                        marginTop: 1,
                        padding: 12,
                        borderRadius: 10,
                        backgroundColor: "#cacaca",
                        elevation: 1,
                      }}
                    >
                      <Text style={{ color: "#242424" }}>
                        Accès à la Galerie Cloud
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate("OngoingAmountsPage", {
                          interventions: allInterventions,
                        })
                      }
                    >
                      <Text style={styles.totalText}>
                        En cours : {totalCost} €
                      </Text>
                    </TouchableOpacity>
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
                      filterClients(t);
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
                    data={(filteredClients || []).slice(0, 10)}
                    keyExtractor={(it) => String(it.id)}
                    keyboardShouldPersistTaps="handled"
                    style={styles.suggestionsBox}
                    renderItem={({ item }) => {
                      const isBanned = item?.banned === true;

                      const onPick = () => {
                        if (isBanned) {
                          openBannedAlert(item);
                          return;
                        }
                        navigation.navigate("ClientInterventionsPage", {
                          clientId: item.id,
                        });
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

                <View>
                  <DateDisplay />
                </View>

                <View>
                  <TimeDisplay />
                </View>
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
                        keyExtractor={(_, idx) => `page-${idx}`}
                        onScrollToIndexFailed={({ index }) => {
                          // fallback simple
                          flatListRef.current?.scrollToIndex({
                            index: Math.max(0, Math.min(index, sliderTotalPages - 1)),
                            animated: true,
                          });
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
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      {(pageItems || []).map((cli, i) => (
        <View key={String(cli.id)} style={{ marginBottom: 20 }}>
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
            <Text style={styles.backToStartText}>Retour aux deux premières</Text>
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
                  )}
                </>
              )}
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
                            Alert.alert(
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
                            Alert.alert(
                              "📋 Numéro copié",
                              "Collez le numéro dans Messages Web."
                            );
                            Linking.openURL("https://messages.google.com/web");
                          } catch (err) {
                            console.error("Erreur Messages Web :", err);
                            Alert.alert(
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
                            Alert.alert(
                              "Erreur",
                              "Numéro de téléphone manquant."
                            );
                            return;
                          }

                          const smsUrl = `sms:${selectedClient.phone}`;

                          try {
                            const supported = await Linking.canOpenURL(smsUrl);
                            if (!supported) {
                              Alert.alert(
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
                            Alert.alert(
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
                            Alert.alert(
                              "Erreur",
                              "Numéro de téléphone manquant."
                            );
                            return;
                          }

                          const telUrl = `tel:${selectedClient.phone}`;

                          try {
                            const supported = await Linking.canOpenURL(telUrl);
                            if (!supported) {
                              Alert.alert(
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
                            Alert.alert(
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
                    <Text style={styles.alertTitle}>Commande en cours</Text>
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

              <Modal
                transparent
                visible={alertVisible}
                animationType="fade"
                onRequestClose={() => setAlertVisible(false)}
              >
                <View style={styles.modalOverlay}>
                  <View style={styles.alertBox}>
                    <Text style={styles.alertTitle}>
                      Suppression impossible
                    </Text>
                    <Text style={styles.alertMessage}>
                      Ce client ne peut pas être supprimé car il a des
                      interventions associées.
                    </Text>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.modalButtonSecondary]}
                      onPress={() => setAlertVisible(false)}
                    >
                      <Text style={styles.modalButtonTextSecondary}>OK</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

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

<View pointerEvents="box-none">
  {(expressList.length > 0 || ordersList.length > 0) && (
    <View style={stylesNS.expressWrap}>
      {/* ===== Barre d’onglets (1 seule ligne) ===== */}
      <View style={stylesNS.tabsRow}>
        <Pressable
          onPress={() => toggleBottomTab("express")}
          android_ripple={{ color: "#e5e7eb" }}
          style={[
            stylesNS.tabBtn,
            bottomTab === "express" && stylesNS.tabBtnActive,
          ]}
        >
          <Text
            style={[
              stylesNS.tabText,
              bottomTab === "express" && stylesNS.tabTextActive,
            ]}
          >
            EXPRESS ({expressList.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => toggleBottomTab("orders")}
          android_ripple={{ color: "#e5e7eb" }}
          style={[
            stylesNS.tabBtn,
            bottomTab === "orders" && stylesNS.tabBtnActive,
          ]}
        >
          <Text
            style={[
              stylesNS.tabText,
              bottomTab === "orders" && stylesNS.tabTextActive,
            ]}
          >
            COMMANDES ({ordersList.length})
          </Text>
        </Pressable>
      </View>

      {/* ===== Contenu selon onglet ===== */}
      {bottomTab === "express" && expressList.length > 0 && (
        <View style={stylesNS.card}>
          <Pressable
            style={stylesNS.cardHeader}
            onPress={() => setOpenExpress((v) => !v)}
            android_ripple={{ color: "#e5e7eb" }}
          >
            <Text style={stylesNS.cardTitle}>
              Fiches EXPRESS en cours : {expressList.length}
            </Text>
            <Image
              source={require("../assets/icons/chevrond.png")}
              style={[
                stylesNS.cardChevron,
                { transform: [{ rotate: openExpress ? "90deg" : "-90deg" }] },
              ]}
            />
          </Pressable>

          {openExpress && (
            <View style={stylesNS.cardBody}>
              {expressList.slice(0, 5).map((it) => (
                <Pressable
                  key={it.id}
                  onPress={() =>
                    navigation.navigate("ExpressListPage", {
                      initialSearch: it.phone || it.name || "",
                      initialType: it.type || "all",
                    })
                  }
                  onLongPress={() =>
                    navigation.navigate("EditClientPage", {
                      clientId: it.client_id,
                    })
                  }
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
              ))}

              {expressList.length > 5 && (
                <Text style={stylesNS.moreText}>
                  … et {expressList.length - 5} de plus
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {bottomTab === "orders" && ordersList.length > 0 && (
        <View style={stylesNS.card}>
          <Pressable
            style={stylesNS.cardHeader}
            onPress={() => setOpenOrders((v) => !v)}
            android_ripple={{ color: "#e5e7eb" }}
          >
            <Text style={stylesNS.cardTitle}>
              Commandes en cours : {ordersList.length}
            </Text>
            <Image
              source={require("../assets/icons/chevrond.png")}
              style={[
                stylesNS.cardChevron,
                { transform: [{ rotate: openOrders ? "90deg" : "-90deg" }] },
              ]}
            />
          </Pressable>

          {openOrders && (
            <View style={stylesNS.cardBody}>
              {ordersList.slice(0, 5).map((o) => {
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
                    key={o.id}
                    onPress={() =>
                      navigation.navigate("OrdersPage", {
                        clientId: cli.id || o.client_id,
                        clientName: cli.name,
                        clientPhone: cli.phone,
                        clientNumber: cli.ficheNumber,
                      })
                    }
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
              })}

              {ordersList.length > 5 && (
                <Text style={stylesNS.moreText}>
                  … et {ordersList.length - 5} de plus
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  )}
</View>




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
                    }}
                  >
                    <Text style={{ fontWeight: "bold" }}>
                      {item.client.name?.toUpperCase()} — Fiche{" "}
                      {item.client.ficheNumber}
                    </Text>
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
    </View>
  );
}
const styles = StyleSheet.create({
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
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#cacaca",
    borderRadius: 10,
    marginBottom: 10,
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
  repairedCountContainer: {
    backgroundColor: "#cacaca", // Fond blanc pour le contraste
    padding: 10,
    borderRadius: 10,
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
    marginBottom: 2, // Vous pouvez ajuster la marge en fonction de l'espace que vous souhaitez
    marginTop: 20,
  },
  pageNumberText: {
    marginRight: 20,
    marginTop: 80,
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
    marginTop: 50,
    marginBottom: 6,
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
  backToStartBtn: {
  alignSelf: "center",
  marginTop: 10,
  marginBottom: 10,
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 12,
  backgroundColor: "#111827",
},
backToStartText: {
  color: "#ffffff",
  fontWeight: "800",
  fontSize: 13,
  letterSpacing: 0.2,
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
    marginTop: 9,
    marginRight: 40,
    padding: 8,
    backgroundColor: "#cacaca",
    borderRadius: 10,

    elevation: 1, // Ajoute une ombre pour un effet de profondeur
  },
  images_numberText: {
    marginLeft: 40,
  },
  dateContainer: {
    flexDirection: "row", // Alignement horizontal
    alignItems: "center",
    borderRadius: 10, // Coins arrondis
    paddingVertical: 11, // Espacement intérieur haut/bas
    paddingHorizontal: 20, // Espacement intérieur gauche/droite
    backgroundColor: "#cacaca", // Fond blanc pour le contraste
    alignSelf: "center", // Centrage du bloc
    marginLeft: 10,
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    marginBottom: 4,
  },

  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: "#000",
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    marginTop: 6,
    maxHeight: 280,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    marginBottom: 8,
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
  dueHint: { fontSize: 14, color: "#666", fontStyle: "italic" },

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
    marginTop: 100,
	marginBottom: 130,
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

  closeBtn: {
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
  tabsRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  backgroundColor: "#ccd9ec",
  borderRadius: 10,
  overflow: "hidden",
  borderWidth: 1,
  borderColor: "#aab7cc",
  marginBottom: 8,
},

tabBtn: {
  flex: 1,
  paddingVertical: 10,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  gap: 6,
},

tabBtnActive: {
  backgroundColor: "#ffffff",
},

tabText: {
  fontSize: 14,
  fontWeight: "800",
  color: "#374151",
},

tabTextActive: {
  color: "#111827",
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


});
