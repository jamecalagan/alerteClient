import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ImageBackground,
  ActivityIndicator,
  Image,
  Alert,
  Animated,
  TouchableWithoutFeedback,
  Easing,
  Pressable, 
} from "react-native";
import { supabase } from "../supabaseClient";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useFocusEffect, CommonActions } from "@react-navigation/native";
import RoundedButton from "../components/RoundedButton";
import * as Animatable from "react-native-animatable";
import BottomMenu from "../components/BottomMenu";
import { Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
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
  const loadPopupData = useCallback(async () => {
    try {
      // 1) Clients + interventions + commandes
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select(
          `
        *,
        interventions(
          id, status, createdAt, solderestant, cost, commande
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
  const [paginatedClients, setPaginatedClients] = useState([]);
  const itemsPerPage = 2;

  const checkImagesToDelete = async () => {
    setIsLoading(true);
    try {
      const dateLimite = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000
      ).toISOString();
      console.log("📅 Date limite pour nettoyage :", dateLimite);

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
      console.log("🧹 Images anciennes à supprimer :", {
        extraCount,
        photosCount,
        total,
      });

      setHasImagesToDelete(total > 0);
      // si tu as un compteur à l’écran :
      // setImagesToDeleteCount(total);
    } catch (err) {
      console.error("❌ checkImagesToDelete :", err);
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

  useFocusEffect(
    useCallback(() => {
      const openOnce = async () => {
        if (popupShownRef.current) return;

        // // 🔒 Option “une fois par jour” :
        // const key = "HOME_POPUP_LAST_DATE";
        // const last = await AsyncStorage.getItem(key);
        // const today = new Date().toISOString().slice(0,10);
        // if (last === today) return;

        await loadPopupData();
        popupShownRef.current = true;
        // await AsyncStorage.setItem(key, today); // si tu actives l’option ci-dessus
        setPopupVisible(true);
      };
      openOnce();
    }, [loadPopupData])
  );

  useEffect(() => {
    loadOrders();
  }, [orders]);

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
        ["Réparé", "Réparation en cours", "En attente de pièces"].includes(
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
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    const clientsToDisplay = filteredClients.slice(startIndex, endIndex);

    setPaginatedClients(clientsToDisplay);
  }, [filteredClients, currentPage]);

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

  const toggleClientExpansion = (clientId, itemIndex) => {
    setExpandedClientId((prevId) => (prevId === clientId ? null : clientId));
    if (
      flatListRef.current &&
      Number.isFinite(itemIndex) &&
      itemIndex >= 0 &&
      itemIndex < paginatedClients.length
    ) {
      flatListRef.current.scrollToIndex({
        index: itemIndex,
        animated: true,
      });
    }
  };
  const logMessage = (message) =>
    setProcessLogs((prevLogs) => [...prevLogs, message]);

  const processInterventionQueue = () => {
    if (eligibleInterventions.length === 0) {
      return;
    }

    const nextIntervention = eligibleInterventions.shift();
    triggerPhotoCleanupAlert(nextIntervention);
  };

  const eligibleInterventions = [];
  const updateClientNotification = async (client, method) => {
    try {
      if (!client || !client.id) {
        console.warn(
          "⚠ Aucun client valide sélectionné pour la mise à jour.",
          client
        );
        return;
      }

      let error;
      let hasUpdated = false;

      console.log("🔍 Client trouvé :", client);

      if (client.interventions && client.interventions.length > 0) {
        const latestIntervention = client.interventions[0];
        console.log(
          "📌 Mise à jour de l'intervention :",
          latestIntervention.id
        );

        ({ error } = await supabase
          .from("interventions")
          .update({ notifiedBy: method })
          .eq("id", latestIntervention.id));

        hasUpdated = true;
      } else if (client.orders && client.orders.length > 0) {
        const latestOrder = client.orders[0];
        console.log("📌 Mise à jour de la commande :", latestOrder.id);

        ({ error } = await supabase
          .from("orders")
          .update({ notified: method })
          .eq("id", latestOrder.id));

        hasUpdated = true;
      }

      if (error) {
        console.error(
          "❌ Erreur lors de la mise à jour de la notification :",
          error
        );
        return;
      }

      if (hasUpdated) {
        await loadClients();
        setNotifyModalVisible(false);
        console.log(
          `✅ Notification mise à jour pour ${client.name} : ${method}`
        );
      } else {
        console.warn(
          "⚠ Aucune mise à jour effectuée (ni intervention ni commande trouvée)."
        );
      }
    } catch (error) {
      console.error(
        "❌ Erreur lors de la mise à jour de la notification :",
        error
      );
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
						model,
						cost,
						solderestant,
						createdAt,
						"updatedAt",
						commande,
						commande_effectuee,
						photos,
						notifiedBy,
						accept_screen_risk,
						devis_cost,
						imprimee,
						print_etiquette,
                        is_estimate,
 estimate_min,
 estimate_max,
 estimate_type,
 estimate_accepted
        ),
        orders(
            id,
			 price,
			  deposit,
            product,
            paid,
            notified
        )
    `
        )
        .order("createdAt", { ascending: false });

      if (clientsError) throw clientsError;

      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select(
          "id, client_id, price, deposit, paid, saved, notified, product"
        );

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
      .from('express')
      .select('id, client_id, name, phone, product, device, type, description, price, paid, notified, created_at')
      .eq('paid', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    setExpressList(data || []);
  } catch (e) {
    console.error('❌ EXPRESS (table) :', e?.message || e);
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
          "Réparation en cours",
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
            "Réparation en cours",
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

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const currentClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prevPage) => prevPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prevPage) => prevPage + 1);
    }
  };
  useFocusEffect(
    React.useCallback(() => {
      setSortBy("createdAt");
      setOrderAsc(false);
      loadClients();
      loadOrders();

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
  const formatDateTime = (dateString) => {
    try {
      return new Date(dateString).toLocaleString("fr-FR", {
        timeZone: "Europe/Paris",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch (error) {
      console.error("Erreur de formatage de la date :", error);
      return "Date invalide";
    }
  };
  useEffect(() => {
    console.log("🔄 Mise à jour de l'affichage des commandes !");
    setOrders([...orders]);
  }, [orders]);
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
            createdAt, "updatedAt", commande, photos, notifiedBy
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
            id, status, deviceType, cost, solderestant,
            createdAt, "updatedAt", commande, photos, notifiedBy
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
            id, status, deviceType, cost, solderestant,
            createdAt, "updatedAt", commande, photos, notifiedBy
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
      case "Réparation en cours":
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
      case "Réparation en cours":
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
      case "Réparation en cours":
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

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, client_id, paid");

        if (error) throw error;

        setOrders(data);
      } catch (error) {
        console.error("❌ Erreur lors du chargement des commandes :", error);
      }
    };

    fetchOrders();
  }, []);
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
        .select("id, client_id, paid, saved, price, deposit")
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
  console.log("🧭 rendu HomePage : hasImagesToDelete =", hasImagesToDelete);
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
                  filterByStatus("Réparation en cours");
                }}
              >
                <Image
                  source={require("../assets/icons/tools1.png")}
                  style={[
                    styles.drawerItemIcon,
                    {
                      tintColor: getIconColor("Réparation en cours"),
                    },
                  ]}
                />
                <Text style={styles.drawerItemText}>RÉPARATION EN COURS</Text>
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
                {repairedNotReturnedCount > 0 && (
                  <View style={styles.repairedCountContainer}>
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate("RepairedInterventionsListPage")
                      }
                      style={styles.repairedCountButton}
                    >
                      <View
                        style={{
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        <Text style={styles.repairedCountText}>
                          Produits réparés en attente de restitution :{" "}
                          {repairedNotReturnedCount}
                        </Text>
                        <Text style={styles.repairedCountText}>
                          Produits non réparables :{" "}
                          {NotRepairedNotReturnedCount}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* 🆕 Bouton résumé interventions + commandes en cours */}
                    <TouchableOpacity
                      onPress={async () => {
                        await loadPopupData();
                        setPopupVisible(true);
                      }}
                      style={[styles.repairedCountButton, { marginTop: 3 }]}
                    >
                      <Text
                        style={[
                          styles.repairedCountText,
                          { color: "#2e4f80", textAlign: "center" },
                        ]}
                      >
                        Voir interventions & commandes en cours
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {isLoading && <ActivityIndicator size="large" color="blue" />}
                {!isLoading && hasImagesToDelete === true && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate("ImageCleanup")}
                    style={{
                      marginRight: 40,
                      marginTop: 15,
                      padding: 10,
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
                        marginTop: 24,
                        padding: 10,
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
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Rechercher par nom, téléphone, ou statut"
                    placeholderTextColor="#2c2c2c"
                    value={searchText.toUpperCase()}
                    onChangeText={filterClients}
                  />
                  <Image
                    source={require("../assets/icons/search.png")}
                    style={[
                      styles.searchIcon,
                      {
                        width: 24,
                        height: 24,
                        tintColor: "#2c2c2c",
                      },
                    ]}
                  />
                </View>

                {searchText.length > 0 && filteredClients.length > 0 && (
                  <View style={styles.suggestionBox}>
                    {filteredClients.slice(0, 5).map((client) => (
                      <TouchableOpacity
                        key={client.id}
                        style={styles.suggestionItem}
                        onPress={() => {
                          setSearchText(client.name);
                          setFilteredClients([client]);
                        }}
                      >
                        <Text style={styles.suggestionText}>
                          {client.name} - {client.phone}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.buttonContainerMasquer}>
                <TouchableOpacity
                  style={styles.toggleButton}
                  onPress={() => {
                    setShowClients((prev) => {
                      const next = !prev;
                      if (!next && flatListRef.current) {
                        flatListRef.current.scrollToOffset({
                          offset: 0,
                          animated: true,
                        });
                      }
                      return next;
                    });
                  }}
                >
                  <Image
                    source={
                      showClients
                        ? require("../assets/icons/eye-slash.png") // Icône pour "masquer"
                        : require("../assets/icons/eye.png") // Icône pour "afficher"
                    }
                    style={styles.iconStyle}
                  />
                  <Text style={styles.toggleText}>
                    {showClients ? "Masquer les fiches" : "Afficher les fiches"}
                  </Text>
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
                    <FlatList
                      ref={flatListRef}
                      initialNumToRender={10}
                      maxToRenderPerBatch={5}
                      showsVerticalScrollIndicator={false}
                      scrollEnabled={true}
                      windowSize={5}
                      data={paginatedClients}
                      keyExtractor={(item) => item.id.toString()}
                      getItemLayout={(data, index) => ({
                        length: 180, // Hauteur de chaque fiche
                        offset: 180 * index,
                        index,
                      })}
                      onScrollToIndexFailed={({
                        index,
                        highestMeasuredFrameIndex,
                      }) => {
                        flatListRef.current?.scrollToIndex({
                          index: Math.max(0, highestMeasuredFrameIndex),
                          animated: true,
                        });
                      }}
                      renderItem={({ item, index }) => {
                        // Calcul du montant total à régler
                        const interventionDue = (item.interventions || [])
                          .filter(
                            (i) => i.solderestant > 0 && i.status !== "Récupéré"
                          )
                          .reduce((sum, i) => sum + i.solderestant, 0);

                        const orderDue = item.totalOrderRemaining || 0;
                        const amountDue = interventionDue + orderDue;

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
                              ]}
                            >
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

                              <TouchableOpacity
                                onPress={() =>
                                  toggleClientExpansion(item.id, index)
                                }
                                style={styles.clientInfo}
                              >
                                <Text style={styles.ficheNumber}>
                                  Fiche client N° {item.ficheNumber}
                                </Text>
                                <Text style={styles.clientText}>
                                  Nom : {item.name.toUpperCase()}
                                </Text>
                                <View style={styles.phoneContainer}>
                                  <Text style={styles.clientText}>
                                    Téléphone :{" "}
                                  </Text>
                                  <Text style={styles.phoneNumber}>
                                    {formatPhoneNumber(item.phone)}
                                  </Text>
                                </View>
                                <Text style={styles.clientText}>
                                  Montant total des interventions en cours :{" "}
                                  {item.totalAmountOngoing
                                    ? item.totalAmountOngoing.toLocaleString(
                                        "fr-FR",
                                        {
                                          style: "currency",
                                          currency: "EUR",
                                        }
                                      )
                                    : "0,00 €"}
                                </Text>
                                {(() => {
                                  // On cherche une intervention en "Devis en cours" ayant une fourchette
                                  const est = (item.interventions || []).find(
                                    (i) =>
                                      i.status === "Devis en cours" &&
                                      i.is_estimate === true &&
                                      typeof i.estimate_min === "number" &&
                                      typeof i.estimate_max === "number"
                                  );
                                  if (!est) return null;

                                  // Formattage simple en euros
                                  const fmt = (n) =>
                                    typeof n === "number"
                                      ? n.toLocaleString("fr-FR", {
                                          style: "currency",
                                          currency: "EUR",
                                        })
                                      : "—";

                                  // Message selon le type
                                  if (est.estimate_type === "PLAFOND") {
                                    return (
                                      <Text
                                        style={[
                                          styles.clientText,
                                          {
                                            fontStyle: "italic",
                                            color: "#0B3D02",
                                          },
                                        ]}
                                      >
                                        Estimation approuvée par le client : de{" "}
                                        {fmt(est.estimate_min)} à{" "}
                                        {fmt(est.estimate_max)} (plafond
                                        accepté)
                                      </Text>
                                    );
                                  }
                                  return (
                                    <Text
                                      style={[
                                        styles.clientText,
                                        {
                                          fontStyle: "italic",
                                          color: "#0B3D02",
                                        },
                                      ]}
                                    >
                                      Estimation indicative : de{" "}
                                      {fmt(est.estimate_min)} à{" "}
                                      {fmt(est.estimate_max)}
                                    </Text>
                                  );
                                })()}

                                {amountDue > 0 && (
                                  <View style={styles.dueBox}>
                                    <Text style={styles.dueText}>
                                      💰 À régler :{" "}
                                      {amountDue.toLocaleString("fr-FR", {
                                        style: "currency",
                                        currency: "EUR",
                                      })}
                                    </Text>
                                  </View>
                                )}

                                {item.devis_cost > 0 && (
                                  <Text style={styles.clientText}>
                                    Montant du devis :{" "}
                                    {item.devis_cost.toLocaleString("fr-FR", {
                                      style: "currency",
                                      currency: "EUR",
                                    })}
                                  </Text>
                                )}
                                <Text style={styles.amountText}>
                                  {item.totalOrderAmount > 0
                                    ? `🛒 Commandes : ${item.totalOrderAmount} €\n💵 Acompte : ${item.totalOrderDeposit} €\n💳 Reste dû : ${item.totalOrderRemaining} €`
                                    : "Aucune commande"}
                                </Text>

                                <View>
                                  <HorizontalSeparator />
                                </View>
                                {latestIntervention?.accept_screen_risk && (
                                  <Text style={styles.acceptRiskText}>
                                    Le client a accepté le risque de casse. Oui
                                  </Text>
                                )}
                                <Text style={styles.clientText}>
                                  Date de création :{" "}
                                  {formatDateTime(item.createdAt)}
                                </Text>
                                {item.updatedAt && (
                                  <Text style={styles.clientText}>
                                    Infos client modifiées le :{" "}
                                    {formatDateTime(item.updatedAt)}
                                  </Text>
                                )}
                                {item.interventions?.[0]
                                  ?.interventionUpdatedAt && (
                                  <Text style={styles.clientText}>
                                    Intervention mise à jour le :{" "}
                                    {formatDateTime(
                                      item.interventions[0]
                                        .interventionUpdatedAt
                                    )}
                                  </Text>
                                )}
                              </TouchableOpacity>

                              <View style={styles.topRightButtons}>
                                <View
                                  style={{
                                    flexDirection: "row",
                                  }}
                                >
                                  {status === "En attente de pièces" &&
                                    commande && (
                                      <TouchableOpacity
                                        style={[
                                          styles.iconButton,
                                          styles.editButton,
                                        ]}
                                        onPress={() => {
                                          setSelectedCommande(commande);
                                          setTransportModalVisible(true);
                                        }}
                                      >
                                        <Image
                                          source={
                                            latestIntervention?.commande_effectuee
                                              ? require("../assets/icons/shipping_fast.png") // ✅ nouvelle icône si commande faite
                                              : require("../assets/icons/shipping.png") // 🛒 icône par défaut
                                          }
                                          style={{
                                            width: 28,
                                            height: 28,
                                            tintColor:
                                              latestIntervention?.commande_effectuee
                                                ? "#00fd00" // vert si commandé
                                                : "#a073f3", // violet sinon
                                          }}
                                        />
                                      </TouchableOpacity>
                                    )}

                                  <View
                                    style={{
                                      position: "relative",
                                    }}
                                  >
                                    <TouchableOpacity
                                      style={[
                                        styles.iconButton,
                                        styles.notificationIconContainer,
                                      ]}
                                      onPress={() => {
                                        navigation.navigate(
                                          "ClientNotificationsPage",
                                          {
                                            clientId: item.id,
                                          }
                                        );
                                      }}
                                    >
                                      <Image
                                        source={require("../assets/icons/sms.png")}
                                        style={{
                                          width: 28,
                                          height: 28,
                                          tintColor:
                                            item.latestIntervention
                                              ?.notifiedBy ||
                                            (item.orders || []).some(
                                              (order) => order.notified
                                            )
                                              ? "#00fd00"
                                              : "#888787",
                                        }}
                                      />
                                      {!(
                                        item.latestIntervention?.notifiedBy ||
                                        (item.orders || []).some(
                                          (order) => order.notified
                                        )
                                      ) && (
                                        <View
                                          style={{
                                            position: "absolute",
                                            top: 2,
                                            right: 2,
                                            width: 10,
                                            height: 10,
                                            borderRadius: 5,
                                            backgroundColor: "#ff3b30",
                                          }}
                                        />
                                      )}
                                    </TouchableOpacity>
                                  </View>

                                  <TouchableOpacity
                                    style={[
                                      styles.iconButton,
                                      styles.editButton,
                                    ]}
                                    onPress={() =>
                                      navigation.navigate("EditClient", {
                                        client: item,
                                      })
                                    }
                                  >
                                    {item.latestIntervention
                                      ?.print_etiquette === false ? (
                                      <BlinkingIconBlue
                                        source={require("../assets/icons/edit.png")}
                                      />
                                    ) : (
                                      <Image
                                        source={require("../assets/icons/edit.png")}
                                        style={{
                                          width: 28,
                                          height: 28,
                                          tintColor: "#00fd00",
                                        }}
                                      />
                                    )}
                                  </TouchableOpacity>

                                  <TouchableOpacity
                                    style={[
                                      styles.iconButton,
                                      styles.printButton,
                                    ]}
                                    onPress={async () => {
                                      const interventionId =
                                        item.latestIntervention?.id;
                                      if (interventionId) {
                                        await supabase
                                          .from("interventions")
                                          .update({
                                            imprimee: true,
                                          })
                                          .eq("id", interventionId);
                                      }

                                      navigation.navigate(
                                        "SelectInterventionPage",
                                        {
                                          clientId: item.id,
                                        }
                                      );
                                    }}
                                  >
                                    {item.latestIntervention?.imprimee ===
                                    false ? (
                                      <BlinkingIcon
                                        source={require("../assets/icons/print.png")}
                                      />
                                    ) : (
                                      <Image
                                        source={require("../assets/icons/print.png")}
                                        style={{
                                          width: 28,
                                          height: 28,
                                          tintColor: "#00fd00",
                                        }}
                                      />
                                    )}
                                  </TouchableOpacity>

                                  {totalImages > 0 && (
                                    <TouchableOpacity
                                      style={[
                                        styles.iconButton,
                                        styles.photoButton,
                                      ]}
                                      onPress={() => goToImageGallery(item.id)}
                                    >
                                      <Image
                                        source={require("../assets/icons/image.png")} // Chemin vers votre icône image
                                        style={{
                                          width: 28,
                                          height: 28,
                                          tintColor: "#00fd00", // Couleur de l'icône (ici vert)
                                        }}
                                      />
                                    </TouchableOpacity>
                                  )}
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      justifyContent: "flex-end",
                                    }}
                                  >
                                    {totalInterventions > 0 && (
                                      <TouchableOpacity
                                        style={[
                                          styles.iconButton,
                                          styles.interventionContainer,
                                        ]}
                                        onPress={() =>
                                          navigation.navigate(
                                            "ClientInterventionsPage",
                                            {
                                              clientId: item.id,
                                            }
                                          )
                                        }
                                      >
                                        <Image
                                          source={require("../assets/icons/tools.png")}
                                          style={{
                                            width: 28,
                                            height: 28,
                                            tintColor: "#00fd00",
                                          }}
                                        />
                                        <Text style={styles.interventionsCount}>
                                          {item.totalInterventions}
                                        </Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                  <TouchableOpacity
                                    style={{
                                      backgroundColor: "#575757",
                                      padding: 10,
                                      alignItems: "center",
                                      borderRadius: 2,
                                      borderWidth:
                                        orderColor !== "#888787" ? 2 : 2,
                                      borderColor: orderColor,
                                      marginRight: 7,
                                    }}
                                    onPress={() =>
                                      navigation.navigate("OrdersPage", {
                                        clientId: item.id,
                                        clientName: item.name,
                                        clientPhone: item.phone,
                                        clientNumber: item.ficheNumber,
                                      })
                                    }
                                  >
                                    {isOrderNotified(item) ? (
                                      <Image
                                        source={require("../assets/icons/Notification.png")} // icône cloche
                                        style={{
                                          width: 28,
                                          height: 28,
                                          tintColor: "#28a745",
                                        }} // cloche verte
                                      />
                                    ) : shouldBlink ? (
                                      <BlinkingIcon
                                        source={require("../assets/icons/order.png")} // icône commande
                                        tintColor={orderColor}
                                      />
                                    ) : (
                                      <Image
                                        source={require("../assets/icons/order.png")}
                                        style={{
                                          width: 28,
                                          height: 28,
                                          tintColor: orderColor,
                                        }}
                                      />
                                    )}
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[
                                      styles.iconButton,
                                      styles.trashButton,
                                    ]}
                                    onPress={() => confirmDeleteClient(item.id)}
                                  >
                                    <Image
                                      source={require("../assets/icons/trash.png")} // Chemin vers votre icône poubelle
                                      style={{
                                        width: 28,
                                        height: 28,

                                        tintColor: "red", // Couleur de l'icône (ici noir)
                                      }}
                                    />
                                  </TouchableOpacity>
                                </View>
                                <View style={styles.additionalIconsContainer}>
                                  {item.interventions
                                    .filter(
                                      (intervention) =>
                                        intervention.status !== "Réparé" &&
                                        intervention.status !== "Récupéré"
                                    ) // Filtrer uniquement les interventions en cours
                                    .map((intervention, index) => (
                                      <View
                                        key={intervention.id || index}
                                        style={{
                                          flexDirection: "row",
                                          alignItems: "center",
                                          gap: 10,
                                        }}
                                      >
                                        <View
                                          style={{
                                            borderWidth: 1,
                                            borderColor: "#242424",
                                            paddingTop: 5,
                                            width: 50,
                                            height: 50,
                                            borderRadius: 2,
                                            alignItems: "center",
                                            backgroundColor: "#fff",
                                          }}
                                        >
                                          <TouchableOpacity
                                            onPress={() =>
                                              fetchDetails(
                                                intervention.deviceType,
                                                intervention.brand,
                                                intervention.model
                                              )
                                            }
                                          >
                                            {getDeviceIcon(
                                              intervention.deviceType
                                            )}
                                          </TouchableOpacity>
                                        </View>
                                      </View>
                                    ))}
                                  {item.interventions &&
                                    item.interventions.length > 0 && (
                                      <View
                                        style={[
                                          styles.deviceIconContainer,
                                          {
                                            flexDirection: "row",
                                          },
                                        ]}
                                      ></View>
                                    )}
                                </View>
                              </View>

                              {isExpanded && (
                                <View style={styles.expandedContent}>
                                  {status === "En attente de pièces" &&
                                    commande && (
                                      <Text style={styles.commandeText}>
                                        En commande : {commande}
                                      </Text>
                                    )}
                                  <Text style={styles.clientText}>
                                    Montant :{" "}
                                    {latestIntervention?.cost?.toLocaleString(
                                      "fr-FR",
                                      {
                                        minimumFractionDigits: 2,
                                      }
                                    )}{" "}
                                    €
                                  </Text>

                                  {latestIntervention?.solderestant !==
                                    undefined &&
                                  latestIntervention?.solderestant > 0 ? (
                                    <Text style={styles.clientTextSoldeRestant}>
                                      Solde restant dû :{" "}
                                      {latestIntervention.solderestant.toLocaleString(
                                        "fr-FR",
                                        {
                                          minimumFractionDigits: 2,
                                        }
                                      )}{" "}
                                      €
                                    </Text>
                                  ) : latestIntervention?.cost > 0 ? (
                                    <Text style={styles.clientTextSoldeRestant}>
                                      Solde restant dû :{" "}
                                      {latestIntervention.cost.toLocaleString(
                                        "fr-FR",
                                        {
                                          minimumFractionDigits: 2,
                                        }
                                      )}{" "}
                                      €
                                    </Text>
                                  ) : null}

                                  <Text style={styles.clientText}>
                                    Nombre d'images : {totalImages}
                                  </Text>
                                  <Text style={styles.clientText}>
                                    Interventions en cours :{" "}
                                    {totalInterventionsEnCours}
                                  </Text>
                                  {item.interventions &&
                                    item.interventions.length > 0 && (
                                      <View
                                        style={[
                                          styles.deviceIconContainer,
                                          {
                                            flexDirection: "row",
                                          },
                                        ]}
                                      ></View>
                                    )}
                                </View>
                              )}
                            </View>
                          </Animatable.View>
                        );
                      }}
                      contentContainerStyle={{
                        paddingBottom: 20,
                      }} // Ajoute un espace en bas
                    />
                  )}
                </>
              )}

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
  {expressList.length > 0 && (
    <View style={styles.expressCard} pointerEvents="box-none">
      <Text style={styles.expressTitle}>
        Fiches EXPRESS en cours : {expressList.length}
      </Text>

      {expressList.slice(0, 5).map((it) => (
        <Pressable
          key={it.id}
          onPress={() =>
            navigation.navigate("ExpressListPage", {
              initialSearch: it.phone || it.name || "",
              initialType: it.type || "all",
            })
          }
          onLongPress={() => navigation.navigate("EditClientPage", { clientId: it.client_id })}
          android_ripple={{ borderless: false }}
          style={({ pressed }) => [
            { paddingVertical: 6 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.expressItem}>
            • {it.name} — {
              (it.type && it.type.toLowerCase().startsWith("vid"))
                ? "Transferts"
                : (it.product || it.device || "Produit")
            } — {it.price ? `${it.price} €` : "—"} {it.type ? `(${it.type})` : ""}
          </Text>
        </Pressable>
      ))}

      {expressList.length > 5 && (
        <Text style={styles.expressMore}>
          … et {expressList.length - 5} de plus
        </Text>
      )}
    </View>
  )}
</View>




        <View style={styles.paginationContainer}>
          <TouchableOpacity
            onPress={goToPreviousPage}
            disabled={currentPage === 1}
          >
            <Image
              source={require("../assets/icons/chevrong.png")}
              style={{
                width: 25,
                height: 25,
                tintColor: currentPage === 1 ? "gray" : "white", // Grise si première page
              }}
            />
          </TouchableOpacity>

          <Text style={styles.paginationText}>
            Page {currentPage} sur {totalPages}
          </Text>

          <TouchableOpacity
            onPress={goToNextPage}
            disabled={currentPage === totalPages}
          >
            <Image
              source={require("../assets/icons/chevrond.png")}
              style={{
                width: 25,
                height: 25,
                tintColor: currentPage === totalPages ? "gray" : "white", // Grise si dernière page
              }}
            />
          </TouchableOpacity>
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
                            { style: "currency", currency: "EUR" }
                          )})`
                        : ""}
                      {item.totals.orderDue > 0
                        ? `  (Commandes: ${item.totals.orderDue.toLocaleString(
                            "fr-FR",
                            { style: "currency", currency: "EUR" }
                          )})`
                        : ""}
                    </Text>

                    <View
                      style={{ flexDirection: "row", gap: 8, marginTop: 8 }}
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
                          <Text style={{ color: "#fff", fontWeight: "bold" }}>
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
                          <Text style={{ color: "#fff", fontWeight: "bold" }}>
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
                <Text style={{ color: "#fff", fontWeight: "bold" }}>
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
                <Text style={{ color: "#fff", fontWeight: "bold" }}>
                  Rafraîchir
                </Text>
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
    marginTop: 24,
  },
  repairedCountButton: {
    flexDirection: "row", // Pour aligner l'icône et le texte horizontalement
    alignItems: "center", // Pour centrer le texte à l'intérieur du bouton
  },
  repairedCountText: {
    color: "#242424",
    fontWeight: "medium",
    textAlign: "center",
    fontSize: 16,
    marginLeft: 8,
    marginVertical: 5,
  },

  backgroundImage: {
    flex: 1,
    resizeMode: "cover", // L'image couvre toute la page
  },
  headerContainer: {
    flexDirection: "row",
    justifyContent: "space-between", // Aligner le titre à gauche et la page à droite
    alignItems: "center",
    marginBottom: 10, // Vous pouvez ajuster la marge en fonction de l'espace que vous souhaitez
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
    justifyContent: "flex-end",
    gap: 10,
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
  alertMessage: {
    fontSize: 16,
    color: "#444",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
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

  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
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
    maxWidth: 180,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d42d2d",
  },
  dueText: {
    fontSize: 14,
    color: "#b00000",
    fontWeight: "bold",
  },
  expressCard: {
  marginHorizontal: 15,
  marginTop: 10,
  marginBottom: 10,
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

});
