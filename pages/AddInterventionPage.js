import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "../supabaseClient";
import * as ImagePicker from "expo-image-picker";
import CustomAlert from "../components/CustomAlert";
import AlertBox from "../components/AlertBox";
import BackButton from "../components/BackButton";

import { MaterialIcons } from "@expo/vector-icons";
import Icon from "react-native-vector-icons/FontAwesome";
import * as ImageManipulator from "expo-image-manipulator";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

const REFERENCE_PHOTO_HINT = "Voir photo pour référence produit";

const normalizeNumber = (v) => {
  if (v === null || v === undefined) return "";
  return String(v).replace(",", ".").trim();
};

const uploadImageToStorage = async (uri, interventionId, isLabel = false) => {
  const folder = isLabel ? "etiquettes" : "supplementaires";
  const fileName = `${uuidv4()}.jpg`;

  const filePath = `${folder}/${interventionId}/${fileName}`;
  console.log("🧾 Chemin d'upload :", filePath);

  const file = {
    uri,
    name: fileName,
    type: "image/jpeg",
  };

  const { error } = await supabase.storage
    .from("images")
    .upload(filePath, file, {
      upsert: true,
      contentType: "image/jpeg",
    });

  if (error) {
    console.error("❌ Erreur upload Supabase:", error.message);
    return null;
  }

  const { data } = supabase.storage.from("images").getPublicUrl(filePath);
  return data.publicUrl;
};

// Helper: détecte une URI locale
const isLocalRef = (s) => typeof s === "string" && s.startsWith("file://");

// Normalisations sûres (virgule/point acceptées)
const parseEu = (v) => {
  const s = (v ?? "").toString().replace(",", ".").trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Normalise pour comparer sans accents/majuscules
const norm = (s) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Cause fréquente associée à chaque panne de la liste "fault_dictionary",
// utilisée pour préremplir "Solution proposée" quand on choisit une panne.
// Regroupé par device_type car certaines pannes portent le même intitulé
// sur des appareils différents (ex: "Ne charge plus" console vs PC) sans
// avoir la même cause.
const PS5_SOLUTIONS = {
  "Aucune image / HDMI":
    "Port HDMI arraché ou pins abîmées, filtre/ESD, circuit HDMI",
  "S'allume puis s'éteint":
    "Alimentation, court-circuit carte mère, étage VRM, parfois APU",
  "Aucun signe de vie":
    "Alimentation ADP, fusible, court-circuit sur rail principal",
  "Surchauffe / arrêt en jeu":
    "Radiateur encrassé, ventilateur, métal liquide mal réparti/oxydation",
  "Lecteur ne lit plus les jeux":
    "Lentille/bloc optique, mécanisme, nappes, carte du lecteur",
  "Lecteur avale/éjecte mal le disque":
    "Mécanisme désynchronisé, moteur, capteurs",
  "Erreur stockage / démarrage impossible":
    "SSD interne/NAND, contrôleur, corruption système",
  "Wi-Fi / Bluetooth faible ou absent":
    "Antennes/connecteurs coaxiaux, module/circuit Wi-Fi-BT",
  "Port USB ne fonctionne plus":
    "Connecteur cassé, protection ESD, alimentation USB",
  "Ventilateur tourne à fond en permanence":
    "Refroidissement, sonde/température, radiateur obstrué",
};

const SWITCH_SOLUTIONS = {
  "Ne charge plus":
    "Port USB-C, M92T36, BQ24193/BQ24193R, fusible",
  "Ne s'allume plus":
    "M92T36, BQ24193, court-circuit, batterie",
  "Charge très lentement / 0,4 A":
    "USB-C, M92T36, négociation USB-PD",
  "Pas d'image sur TV/dock":
    "USB-C, P13USB/PI3USB, M92T36",
  "USB-C cassé":
    "Pins internes tordues/arrachées",
  "Joy-Con non reconnu":
    "Rail Joy-Con, nappe, connecteur",
  "Joy-Con drift":
    "Joystick analogique",
  "Lecteur de jeux HS":
    "Lecteur/cartouche, connecteur, carte fille",
  "MicroSD non reconnue":
    "Lecteur microSD/connecteur carte mère",
  "Écran noir mais console active":
    "LCD, rétroéclairage, nappe/connecteur",
  "Ventilateur bruyant/HS":
    "Ventilateur, poussière",
  "Surchauffe":
    "Pâte thermique, ventilateur, radiateur",
  "Wi-Fi/Bluetooth":
    "Antenne, coaxial, circuit RF",
};

const XBOX_SOLUTIONS = {
  "Ne s'allume plus / aucun signe de vie":
    "Bloc d'alimentation, fusible, court-circuit carte mère",
  "S'allume puis s'éteint":
    "Alimentation, court-circuit carte mère, étage VRM",
  "Écran noir / pas de signal HDMI":
    "Port HDMI, puce vidéo, GPU",
  "Surchauffe / redémarrage en jeu":
    "Pâte thermique, ventilateur encrassé, radiateur",
  "Ventilateur bruyant/HS":
    "Ventilateur, poussière",
  "Erreur système / écran d'erreur":
    "Corruption du stockage système, mise à jour ratée",
  "Lecteur ne lit plus les disques":
    "Lecteur optique, nappe, mécanisme",
  "Stockage plein ou HS":
    "SSD interne, carte d'extension de stockage",
  "Wi-Fi/Bluetooth faible ou absent":
    "Antenne, module Wi-Fi/Bluetooth",
  "Port USB ne fonctionne plus":
    "Connecteur cassé, protection ESD, alimentation USB",
  "Manette ne se connecte plus":
    "Synchronisation, batterie, module Bluetooth de la manette",
};

const PC_PORTABLE_SOLUTIONS = {
  "Écran cassé":
    "Dalle LCD/LED, nappe vidéo, charnières",
  "Écran noir":
    "Rétroéclairage, nappe vidéo, carte graphique, RAM",
  "Pas d'affichage":
    "Carte graphique, RAM, nappe vidéo, connecteur écran",
  "Fonctionne uniquement sur secteur":
    "Batterie HS ou à recalibrer, contrôleur de charge",
  "Ne charge plus":
    "Chargeur, connecteur de charge, contrôleur de charge, carte mère",
  "Batterie ne tient plus la charge":
    "Batterie usée, cycles de charge dépassés, calibrage",
  "Clavier ne fonctionne plus":
    "Nappe clavier, connecteur, liquide renversé, clavier HS",
  "Connecteur de charge endommagé":
    "Connecteur jack/USB-C cassé ou dessoudé, piste carte mère",
  "Démarrage et arrêt aléatoires":
    "Alimentation instable, RAM, surchauffe, carte mère",
  "Ne démarre plus":
    "Alimentation, RAM, carte mère, disque dur/SSD",
  "Démarre puis s'éteint":
    "Surchauffe, alimentation, court-circuit carte mère",
  "Lenteur système":
    "Disque dur HDD à remplacer par SSD, RAM insuffisante, virus/logiciels",
  "Redémarre en boucle":
    "RAM, disque dur/SSD, corruption système, surchauffe",
  "Ordinateur très lent":
    "Disque dur HDD, RAM insuffisante, virus, trop de logiciels au démarrage",
  "Ventilateur bruyant":
    "Poussière, roulement ventilateur, pâte thermique",
  "Écran bleu":
    "RAM défectueuse, pilote, disque dur, surchauffe",
  "Mot de passe oublié":
    "Réinitialisation compte Windows/BIOS",
  "Windows ne démarre plus":
    "Fichiers système corrompus, disque dur/SSD, mise à jour ratée",
};

const PC_FIXE_SOLUTIONS = {
  "Pas d'affichage":
    "Carte graphique, RAM, câble vidéo (HDMI/DisplayPort/VGA), moniteur",
  "Ne démarre plus":
    "Alimentation (bloc ATX), RAM, carte mère, disque dur/SSD",
  "Redémarre en boucle":
    "RAM, alimentation, carte mère, surchauffe",
  "Ordinateur très lent":
    "Disque dur HDD à remplacer par SSD, RAM insuffisante, virus/logiciels",
  "Disque dur défectueux":
    "Secteurs défectueux, câble SATA/alimentation, à remplacer",
  "Windows ne démarre plus":
    "Fichiers système corrompus, disque dur/SSD, mise à jour ratée",
};

const MANETTE_SOLUTIONS = {
  "Joystick drift":
    "Joystick analogique usé ou encrassé, à remplacer",
  "Bouton bloqué / ne répond plus":
    "Contact bouton, membrane, poussière",
  "Ne se connecte plus / non détectée":
    "Synchronisation Bluetooth, câble/port USB, pilote",
  "Ne charge plus":
    "Câble ou port de charge, batterie, contrôleur de charge",
  "Batterie ne tient plus la charge":
    "Batterie usée, cycles de charge dépassés",
  "Se décharge rapidement même à l'arrêt":
    "Batterie défaillante, fuite de courant, veille défectueuse",
  "Vibration HS":
    "Moteur de vibration, connecteur interne",
  "Gâchettes dures ou bloquées":
    "Ressort, mécanisme, poussière",
  "Coque ou boutons cassés":
    "Casse physique suite à une chute",
  "Micro ou haut-parleur HS":
    "Composant interne défectueux, connecteur",
};

// Clé = fault_dictionary.device_type exact (accents inclus)
const FAULT_SUGGESTED_SOLUTIONS = {
  "PlayStation 5": PS5_SOLUTIONS,
  "Nintendo Switch": SWITCH_SOLUTIONS,
  "Nintendo Switch Lite": SWITCH_SOLUTIONS,
  "Nintendo Switch OLED": SWITCH_SOLUTIONS,
  "Xbox Series X": XBOX_SOLUTIONS,
  "Xbox Series S": XBOX_SOLUTIONS,
  "PC portable": PC_PORTABLE_SOLUTIONS,
  "PC Fixe": PC_FIXE_SOLUTIONS,
  "Manette": MANETTE_SOLUTIONS,
};

export default function AddInterventionPage({ route, navigation }) {
  const { clientId } = route.params || {};

  const [reference, setReference] = useState("");
  const [brand, setBrand] = useState("");
  const [serial_number, setSerial_number] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");

  const [devisCost, setDevisCost] = useState("");
  const [estimateMin, setEstimateMin] = useState("");
  const [estimateMax, setEstimateMax] = useState("");
  const [estimateType, setEstimateType] = useState("PLAFOND"); // PLAFOND | INDICATIF
  const [paymentStatus, setPaymentStatus] = useState("non_regle");
  const [status, setStatus] = useState("default");
  const [deviceType, setDeviceType] = useState("default");
  const [password, setPassword] = useState("");
  const [commande, setCommande] = useState("");
  const [chargeur, setChargeur] = useState("Non");

  // Modale de création rapide de commande (ouverte quand le statut passe à "En attente de pièces")
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [orderProduct, setOrderProduct] = useState("");
  const [orderBrand, setOrderBrand] = useState("");
  const [orderModel, setOrderModel] = useState("");
  const [orderUnitPrice, setOrderUnitPrice] = useState("");
  const [orderQty, setOrderQty] = useState("1");
  const [orderDeposit, setOrderDeposit] = useState("");
  const [orderAmount, setOrderAmount] = useState(""); // montant de la dernière commande créée pour cette fiche
  const [orderId, setOrderId] = useState(null); // id de la commande liée, pour le bouton "Voir la commande"
  const [orderItems, setOrderItems] = useState([]); // produits déjà ajoutés à la commande en cours de création
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertTitle, setAlertTitle] = useState("");
  const [photos, setPhotos] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isPhotoTaken, setIsPhotoTaken] = useState(false);
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [labelPhoto, setLabelPhoto] = useState(null);
  const [model, setModel] = useState("");
  const [customBrand, setCustomBrand] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customDeviceType, setCustomDeviceType] = useState("");
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [acceptScreenRisk, setAcceptScreenRisk] = useState(false);
  // Proposition de réparation faite avant la création de la fiche
const [repairProposalMade, setRepairProposalMade] =
  useState(false);

const [repairProposal, setRepairProposal] =
  useState("");

const [repairProposalPrice, setRepairProposalPrice] =
  useState("");

const [repairProposalStatus, setRepairProposalStatus] =
  useState("pending");

const [repairProposalMethod, setRepairProposalMethod] =
  useState("shop");

const [repairProposalComment, setRepairProposalComment] =
  useState("");
  const [
  loanedItemEnabled,
  setLoanedItemEnabled,
] = useState(false);
// Matériel prêté
const [loanedItem, setLoanedItem] =
  useState("");

const [
  loanedItemReturned,
  setLoanedItemReturned,
] = useState(false);

  const [clientName, setClientName] = useState("");
  const [wantLabelPhoto, setWantLabelPhoto] = useState(false);

  // rappel mot de passe
  const [pwdReminderVisible, setPwdReminderVisible] = useState(false);
  const [alertType, setAlertType] = useState("info"); // "success" | "danger" | "info"

  const [partialPayment, setPartialPayment] = useState("");

  // === Confirmation avant de quitter avec des modifications non enregistrées ===
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState(null);
  const skipDirtyRef = useRef(true); // true au montage, pour ignorer l'initialisation des champs

  useEffect(() => {
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [
    reference,
    brand,
    model,
    serial_number,
    description,
    cost,
    devisCost,
    estimateMin,
    estimateMax,
    status,
    deviceType,
    password,
    commande,
    chargeur,
    customBrand,
    customModel,
    customDeviceType,
    remarks,
    clientName,
    partialPayment,
  ]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      setPendingLeaveAction(() => () => navigation.dispatch(e.data.action));
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  // 👉 gestion “même matériel”
  const [useSameDevice, setUseSameDevice] = useState(false);
  const [lastDevice, setLastDevice] = useState(null);
  const [loadingLastDevice, setLoadingLastDevice] = useState(false);

  // ✅ Autocomplete TYPE
  const [typeText, setTypeText] = useState("");
  const [typeQuery, setTypeQuery] = useState("");
  const [showTypeSuggestions, setShowTypeSuggestions] = useState(false);

  // ✅ Autocomplete MARQUE
  const [brandText, setBrandText] = useState("");
  const [brandQuery, setBrandQuery] = useState("");
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);

  // ✅ Autocomplete MODELE
  const [modelText, setModelText] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);

	// ✅ Dictionnaire des descriptions de panne
const [faultList, setFaultList] = useState([]);
const [faultModalVisible, setFaultModalVisible] = useState(false);

// Barème de réparations (repair_prices) : suggestion de tarif pour le
// type d'appareil courant, pour éviter d'aller chercher le prix ailleurs.
const [priceList, setPriceList] = useState([]);
const [priceListVisible, setPriceListVisible] = useState(false);
const [priceListLoading, setPriceListLoading] = useState(false);
const [newPriceModalVisible, setNewPriceModalVisible] = useState(false);
const [newPriceIssue, setNewPriceIssue] = useState("");
const [newPriceSymptoms, setNewPriceSymptoms] = useState("");
const [newPriceMin, setNewPriceMin] = useState("");
const [newPriceMax, setNewPriceMax] = useState("");
const [priceListTarget, setPriceListTarget] = useState("cost"); // "cost" ou "devis"
const [faultSearch, setFaultSearch] = useState("");
const [faultLoading, setFaultLoading] = useState(false);

const [newFaultModalVisible, setNewFaultModalVisible] =
  useState(false);

const [newFaultDescription, setNewFaultDescription] =
  useState("");

const [newFaultCategory, setNewFaultCategory] =
  useState("");

  const [alertOnClose, setAlertOnClose] = useState(null);

  const openAlert = (type, title, message) => {
    setAlertType(type);
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertOnClose(null);
    setAlertVisible(true);
  };

  const showAlert = (title, message, onCloseAction = null) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertOnClose(() => onCloseAction);
    setAlertVisible(true);
  };

  const [deletePhotoConfirmVisible, setDeletePhotoConfirmVisible] =
    useState(false);
  const [photoUriToDelete, setPhotoUriToDelete] = useState(null);

  useEffect(() => {
  loadProducts();
  loadFaultDictionary();
}, []);
useEffect(() => {
  if (
    deviceType &&
    deviceType !== "default"
  ) {
    loadFaultDictionary();
  }
}, [deviceType, customDeviceType, modelText, customModel]);
  useEffect(() => {
    const fetchClientName = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .single();

      if (error) {
        console.error("Erreur lors de la récupération du nom du client:", error);
      } else {
        setClientName(data.name);
      }
    };

    if (clientId) fetchClientName();
  }, [clientId]);

  // 👉 on récupère la dernière intervention de ce client
  useEffect(() => {
    const fetchLastDevice = async () => {
      if (!clientId) return;
      try {
        setLoadingLastDevice(true);
        const { data, error } = await supabase
          .from("interventions")
          .select("*")
          .eq("client_id", clientId)
          .order("createdAt", { ascending: false })
          .limit(1);

        if (error) {
          console.error(
            "Erreur lors de la récupération du dernier matériel :",
            error
          );
          setLastDevice(null);
          return;
        }

        if (data && data.length > 0) setLastDevice(data[0]);
        else setLastDevice(null);
      } catch (e) {
        console.error("Exception lors de la récupération du dernier matériel :", e);
        setLastDevice(null);
      } finally {
        setLoadingLastDevice(false);
      }
    };

    fetchLastDevice();
  }, [clientId]);

  const getCurrentDeviceTypeName = () => {
  if (deviceType === "Autre") {
    return customDeviceType?.trim() || typeText?.trim() || "";
  }

  return deviceType && deviceType !== "default"
    ? String(deviceType).trim()
    : typeText?.trim() || "";
};

// Nom du modèle sélectionné (ex: "PlayStation 5"), pour affiner les
// suggestions de pannes au-delà du simple type d'appareil (ex: "Console").
const getCurrentModelName = () => {
  if (model === "Autre") {
    return customModel?.trim() || modelText?.trim() || "";
  }
  return modelText?.trim() || "";
};

// ✅ FIX #4 : requête sécurisée (deux requêtes fusionnées côté client,
// évite tout souci d'échappement PostgREST dans .or() si currentType
// contient une virgule ou un caractère spécial)
const loadFaultDictionary = async () => {
  setFaultLoading(true);

  try {
    const currentType = getCurrentDeviceTypeName();
    const currentModel = getCurrentModelName();

    if (currentType || currentModel) {
      const baseSelect =
        "id, device_type, category, description, active";

      const queries = [
        supabase
          .from("fault_dictionary")
          .select(baseSelect)
          .eq("active", true)
          .is("device_type", null),
      ];

      if (currentType) {
        queries.push(
          supabase
            .from("fault_dictionary")
            .select(baseSelect)
            .eq("active", true)
            .ilike("device_type", currentType)
        );
      }

      // Suggestions spécifiques au modèle (ex: "PlayStation 5"), en plus
      // de celles du type d'appareil (ex: "Console").
      if (currentModel && norm(currentModel) !== norm(currentType)) {
        queries.push(
          supabase
            .from("fault_dictionary")
            .select(baseSelect)
            .eq("active", true)
            .ilike("device_type", currentModel)
        );
      }

      const results = await Promise.all(queries);
      for (const r of results) {
        if (r.error) throw r.error;
      }

      const byId = new Map();
      results.forEach((r) => (r.data || []).forEach((f) => byId.set(f.id, f)));

      const merged = Array.from(byId.values()).sort((a, b) => {
        const catCmp = (a.category || "").localeCompare(b.category || "");
        return catCmp !== 0
          ? catCmp
          : (a.description || "").localeCompare(b.description || "");
      });

      setFaultList(merged);
    } else {
      const { data, error } = await supabase
        .from("fault_dictionary")
        .select("id, device_type, category, description, active")
        .eq("active", true)
        .order("category", { ascending: true })
        .order("description", { ascending: true });

      if (error) throw error;

      setFaultList(data || []);
    }
  } catch (error) {
    console.error(
      "❌ Chargement descriptions de panne :",
      error
    );

    showAlert(
      "Erreur",
      "Impossible de charger la liste des pannes."
    );

    setFaultList([]);
  } finally {
    setFaultLoading(false);
  }
};

// Ouvre le barème de réparations filtré sur le type d'appareil courant,
// pour suggérer un tarif sans avoir à quitter la fiche.
const openPriceList = async () => {
  const currentType = getCurrentDeviceTypeName();
  const currentModel = getCurrentModelName();

  setPriceListVisible(true);
  setPriceListLoading(true);

  try {
    const queries = [];
    if (currentType) {
      queries.push(
        supabase
          .from("repair_prices")
          .select("id, product_type, issue, symptoms, price_min, price_max")
          .ilike("product_type", currentType)
      );
    }
    if (currentModel && norm(currentModel) !== norm(currentType)) {
      queries.push(
        supabase
          .from("repair_prices")
          .select("id, product_type, issue, symptoms, price_min, price_max")
          .ilike("product_type", currentModel)
      );
    }

    if (queries.length === 0) {
      setPriceList([]);
      return;
    }

    const results = await Promise.all(queries);
    for (const r of results) {
      if (r.error) throw r.error;
    }

    const byId = new Map();
    results.forEach((r) => (r.data || []).forEach((p) => byId.set(p.id, p)));
    const merged = Array.from(byId.values()).sort((a, b) =>
      (a.issue || "").localeCompare(b.issue || "")
    );

    setPriceList(merged);
  } catch (error) {
    console.error("❌ Chargement barème de réparations :", error);
    showAlert("Erreur", "Impossible de charger le barème de réparations.");
    setPriceList([]);
  } finally {
    setPriceListLoading(false);
  }
};

// Ajoute un nouveau tarif au barème (repair_prices) pour le type
// d'appareil courant, quand la réparation recherchée n'y figure pas.
const saveNewPrice = async () => {
  const cleanedIssue = newPriceIssue.trim().replace(/\s+/g, " ");
  const cleanedSymptoms = newPriceSymptoms.trim().replace(/\s+/g, " ");
  const min = parseFloat(newPriceMin.replace(",", "."));
  const max = parseFloat(newPriceMax.replace(",", "."));

  if (!cleanedIssue) {
    showAlert("Intitulé manquant", "Saisis le type de réparation.");
    return;
  }
  if (isNaN(min) || isNaN(max)) {
    showAlert("Tarif manquant", "Saisis un prix min et un prix max.");
    return;
  }

  const currentType = getCurrentDeviceTypeName();
  if (!currentType) {
    showAlert(
      "Type d'appareil manquant",
      "Sélectionne d'abord un type d'appareil."
    );
    return;
  }

  try {
    const { data, error } = await supabase
      .from("repair_prices")
      .insert([
        {
          product_type: currentType,
          issue: cleanedIssue,
          symptoms: cleanedSymptoms || null,
          price_min: min,
          price_max: max,
        },
      ])
      .select("id, product_type, issue, symptoms, price_min, price_max")
      .single();

    if (error) throw error;

    if (priceListTarget === "devis") {
      setEstimateMin(normalizeNumber(String(data.price_min)));
      setEstimateMax(normalizeNumber(String(data.price_max)));
    } else {
      setCost(normalizeNumber(String(data.price_min)));
    }

    setNewPriceModalVisible(false);
    setPriceListVisible(false);
    setNewPriceIssue("");
    setNewPriceSymptoms("");
    setNewPriceMin("");
    setNewPriceMax("");
  } catch (error) {
    console.error("❌ Ajout tarif barème :", error);
    showAlert("Erreur", error?.message || "Impossible d'ajouter ce tarif.");
  }
};

  const loadProducts = async () => {
    const { data, error } = await supabase.from("article").select("*");
    if (error) console.error("Erreur lors du chargement des produits:", error.message);
    else setProducts(data);
  };

  const loadBrands = async (articleId) => {
    const { data, error } = await supabase
      .from("marque")
      .select("*")
      .eq("article_id", articleId);
    if (error) {
      console.error("Erreur lors du chargement des marques :", error);
      return [];
    } else {
      setBrands(data);
      return data;
    }
  };

  const loadModels = async (brandId) => {
    const { data, error } = await supabase
      .from("modele")
      .select("*")
      .eq("marque_id", brandId);
    if (error) {
      console.error("Erreur lors du chargement des modèles :", error);
      return [];
    } else {
      setModels(data);
      return data;
    }
  };

  // ✅ suggestions filtrées
  const filteredTypes = products
    .slice()
    .sort((a, b) => (a?.nom || "").localeCompare(b?.nom || ""))
    .filter((p) => norm(p.nom).includes(norm(typeQuery)))
    .slice(0, 12);

  const filteredBrands = brands
    .slice()
    .sort((a, b) => (a?.nom || "").localeCompare(b?.nom || ""))
    .filter((b) => norm(b.nom).includes(norm(brandQuery)))
    .slice(0, 12);

  const filteredModels = models
    .slice()
    .sort((a, b) => (a?.nom || "").localeCompare(b?.nom || ""))
    .filter((m) => norm(m.nom).includes(norm(modelQuery)))
    .slice(0, 12);

  const hasTypeExact = products.some((p) => norm(p.nom) === norm(typeQuery));
  const hasBrandExact = brands.some((b) => norm(b.nom) === norm(brandQuery));
  const hasModelExact = models.some((m) => norm(m.nom) === norm(modelQuery));

const filteredFaults = faultList.filter((fault) => {
  const searchValue = norm(faultSearch);

  if (!searchValue) return true;

  return (
    norm(fault.description).includes(searchValue) ||
    norm(fault.category).includes(searchValue) ||
    norm(fault.device_type).includes(searchValue)
  );
});

const groupedFaults = filteredFaults.reduce(
  (groups, fault) => {
    const category =
      fault.category?.trim() || "Autres";

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(fault);

    return groups;
  },
  {}
);

  // ✅ synchro affichage TYPE
  useEffect(() => {
    if (!products?.length) return;

    if (deviceType === "Autre" && customDeviceType) {
      if (typeText !== customDeviceType) setTypeText(customDeviceType);
      return;
    }

    if (deviceType && deviceType !== "default" && deviceType !== "Autre") {
      if (typeText !== deviceType) setTypeText(deviceType);
    }
  }, [products, deviceType, customDeviceType]);

  // ✅ synchro affichage MARQUE
  useEffect(() => {
    if (!brands?.length) return;

    const found = brands.find((b) => b.id === brand);
    if (found && found.nom && brandText !== found.nom) setBrandText(found.nom);

    if (brand === "Autre" && customBrand && brandText !== customBrand) {
      setBrandText(customBrand);
    }
  }, [brands, brand, customBrand]);

  // ✅ synchro affichage MODELE
  useEffect(() => {
    if (!models?.length) return;

    const found = models.find((m) => m.id === model);
    if (found && found.nom && modelText !== found.nom) setModelText(found.nom);

    if (model === "Autre" && customModel && modelText !== customModel) {
      setModelText(customModel);
    }
  }, [models, model, customModel]);

  const pickLabelImage = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;

        const compressedImage = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 800 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );

        const compressedUri = compressedImage.uri;

        const publicUrl = await uploadImageToStorage(
          compressedUri,
          clientId || "tmp",
          true
        );

        if (!publicUrl) {
          showAlert("Erreur", "Échec de l'upload de l’étiquette.");
          return;
        }

        setLabelPhoto(publicUrl);
        setIsPhotoTaken(true);

        if (wantLabelPhoto && !reference) {setReference(REFERENCE_PHOTO_HINT);}


        console.log("✅ Image d'étiquette (URL):", publicUrl);
      } else {
        console.log("Aucune image capturée ou opération annulée.");
      }
    } catch (error) {
      console.error("Erreur lors de la capture d'image :", error);
    }
  };

  const pickAdditionalImage = async () => {
    if (isAddingPhoto) return; // évite un double upload si le bouton est pressé deux fois rapidement
    setIsAddingPhoto(true);
    try {
      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;

        const compressedImage = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 800 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );

        const compressedUri = compressedImage.uri;

        const publicUrl = await uploadImageToStorage(
          compressedUri,
          clientId || "tmp",
          false
        );

        if (!publicUrl) {
          showAlert("Erreur", "Échec de l'upload de la photo.");
          return;
        }

        setPhotos((prev) => [...prev, publicUrl]);
        console.log("✅ Image supplémentaire ajoutée (URL):", publicUrl);
      } else {
        console.log("Aucune image capturée ou opération annulée.");
      }
    } catch (error) {
      console.error("Erreur lors de la capture d'image :", error);
    } finally {
      setIsAddingPhoto(false);
    }
  };

  const confirmDeletePhoto = (uri) => {
    setPhotoUriToDelete(uri);
    setDeletePhotoConfirmVisible(true);
  };

  // ✅ utilisées encore (ex: reprise dernier matériel)
  const handleDeviceTypeChange = async (value) => {
    setDeviceType(value);

    // sync champ texte
    setTypeText(value === "Autre" ? customDeviceType : value);
    setTypeQuery(value === "Autre" ? customDeviceType : value);

    // reset marque + modèle
    setBrands([]);
    setBrand("");
    setCustomBrand("");
    setBrandText("");
    setBrandQuery("");
    setShowBrandSuggestions(false);

    setModels([]);
    setModel("");
    setCustomModel("");
    setModelText("");
    setModelQuery("");
    setShowModelSuggestions(false);

    if (value === "Autre") {
      setCustomDeviceType("");
      return;
    }

    setCustomDeviceType("");
    const selectedProduct = products.find((p) => p.nom === value);
    if (selectedProduct) await loadBrands(selectedProduct.id);
  };

  const handleBrandChange = async (value) => {
    setBrand(value);

    // reset modèle
    setModels([]);
    setModel("");
    setCustomModel("");
    setModelText("");
    setModelQuery("");
    setShowModelSuggestions(false);

    if (value === "Autre") {
      setCustomBrand("");
      setBrandText("");
      setBrandQuery("");
      return;
    }

    setCustomBrand("");
    const selectedBrand = brands.find((b) => b.id === value);
    if (selectedBrand) await loadModels(selectedBrand.id);
  };

  const addArticleIfNeeded = async () => {
    console.log("📥 addArticleIfNeeded appelée");

    if (deviceType === "Autre" && customDeviceType) {
      console.log("🆕 Article à insérer :", customDeviceType);

      const { data, error } = await supabase
        .from("article")
        .insert([{ nom: customDeviceType.trim() }])
        .select();

      if (error) {
        console.error("❌ Erreur Supabase article :", error.message);
        return null;
      }

      if (data && data[0]) {
        console.log("✅ Article inséré :", data[0]);
        return data[0].id;
      }
    }

    const existing = products.find((product) => product.nom === deviceType);
    console.log("📦 Article existant trouvé :", existing);
    return existing?.id || null;
  };

  const addBrandIfNeeded = async (articleId) => {
    if (brand === "Autre" && customBrand) {
      const { data, error } = await supabase
        .from("marque")
        .insert([{ nom: customBrand.trim(), article_id: articleId }])
        .select();

      if (error) {
        console.error("Erreur lors de l'ajout de la marque :", error);
        showAlert("Erreur", "Impossible d'ajouter la nouvelle marque.");
        return null;
      }
      if (data && data[0]) {
        setBrands((prev) => [...prev, data[0]]);
        return data[0].id;
      }
    }
    return brands.find((b) => b.id === brand)?.id || null;
  };

  const addModelIfNeeded = async (brandId, articleId) => {
    if (model === "Autre" && customModel) {
      const { data, error } = await supabase
        .from("modele")
        .insert([
          {
            nom: customModel.trim(),
            marque_id: brandId,
            article_id: articleId,
          },
        ])
        .select();

      if (error) {
        console.error("Erreur lors de l'ajout du modèle :", error);
        showAlert("Erreur", "Impossible d'ajouter le nouveau modèle.");
        return null;
      }
      if (data && data[0]) {
        setModels((prev) => [...prev, data[0]]);
        return data[0].id;
      }
    }
    return models.find((m) => m.id === model)?.id || null;
  };

  // 👉 FIX #1 : applique le dernier matériel sur la fiche
  // On utilise directement les données RETOURNÉES par loadBrands/loadModels
  // au lieu de relire le state React (brands/models), qui n'est pas encore
  // mis à jour au moment de l'exécution de cette fonction (stale closure).
  const applyLastDevice = async () => {
    if (!lastDevice) {
      showAlert(
        "Aucun matériel précédant",
        "Aucune intervention précédente trouvée pour ce client."
      );
      setUseSameDevice(false);
      return;
    }

    try {
      setLoadingLastDevice(true);

      // Type de produit
      if (lastDevice.deviceType) {
        await handleDeviceTypeChange(lastDevice.deviceType);
      } else if (lastDevice.article_id && products && products.length > 0) {
        const art = products.find((p) => p.id === lastDevice.article_id);
        if (art) await handleDeviceTypeChange(art.nom);
      }

      // Marque
      if (lastDevice.marque_id) {
        let loadedBrands = brands;
        if (lastDevice.article_id) {
          loadedBrands = await loadBrands(lastDevice.article_id);
        }

        setBrand(lastDevice.marque_id);
        const b = loadedBrands.find((x) => x.id === lastDevice.marque_id);
        if (b?.nom) {
          setBrandText(b.nom);
          setBrandQuery(b.nom);
        }

        const loadedModels = await loadModels(lastDevice.marque_id);

        // Modèle (utilise directement loadedModels, pas le state `models`)
        if (lastDevice.modele_id) {
          setModel(lastDevice.modele_id);
          const m = loadedModels.find((x) => x.id === lastDevice.modele_id);
          if (m?.nom) {
            setModelText(m.nom);
            setModelQuery(m.nom);
          }
        }
      }

      // Référence / n° de série
      if (lastDevice.reference) setReference(lastDevice.reference);
      if (lastDevice.serial_number) setSerial_number(lastDevice.serial_number);
    } catch (err) {
      console.error("Erreur lors de la reprise du matériel :", err);
      showAlert(
        "Erreur",
        "Impossible de reprendre automatiquement le matériel précédent."
      );
      setUseSameDevice(false);
    } finally {
      setLoadingLastDevice(false);
    }
  };

const saveNewFault = async () => {
  const cleanedDescription =
    newFaultDescription.trim().replace(/\s+/g, " ");

  const cleanedCategory =
    newFaultCategory.trim().replace(/\s+/g, " ");

  if (!cleanedDescription) {
    showAlert(
      "Description manquante",
      "Saisis la description de la panne."
    );
    return;
  }

  const currentType = getCurrentDeviceTypeName();

  try {
    const existingFault = faultList.some(
      (fault) =>
        norm(fault.description) ===
        norm(cleanedDescription)
    );

    if (existingFault) {
      showAlert(
        "Panne existante",
        "Cette description existe déjà dans la liste."
      );
      return;
    }

    const { data, error } = await supabase
      .from("fault_dictionary")
      .insert([
        {
          device_type: currentType || null,
          category: cleanedCategory || "Autres",
          description: cleanedDescription,
          active: true,
        },
      ])
      .select(
        "id, device_type, category, description, active"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        showAlert(
          "Panne existante",
          "Cette description existe déjà."
        );
        return;
      }

      throw error;
    }

    setDescription(data.description.toUpperCase());

    setNewFaultModalVisible(false);
    setFaultModalVisible(false);
    setNewFaultDescription("");
    setNewFaultCategory("");

    await loadFaultDictionary();
  } catch (error) {
    console.error(
      "❌ Ajout description de panne :",
      error
    );

    showAlert(
      "Erreur",
      error?.message ||
        "Impossible d’ajouter cette description."
    );
  }
};


  const handleSaveIntervention = async () => {
    const errors = [];

    if (!brand || brand === "default") errors.push("Marque");
    if (!model || model === "default") errors.push("Modèle");
    if (!description) errors.push("Description");
    if (deviceType === "default") errors.push("Type de produit");
    if (status === "default") errors.push("Statut");
	if (repairProposalMade) {
  if (!repairProposal.trim()) {
    errors.push("Solution proposée");
  }

  if (!repairProposalStatus) {
    errors.push("Décision du client");
  }

  if (!repairProposalMethod) {
    errors.push("Mode de proposition");
  }

  if (
    repairProposalPrice.trim() &&
    parseEu(repairProposalPrice) <= 0
  ) {
    errors.push("Montant proposé valide");
  }
}

    if (status !== "Devis en cours" && !cost) errors.push("Coût de la réparation");

    // Validation fourchette
    if (status === "Devis en cours") {
      const min = parseFloat(normalizeNumber(estimateMin));
      const max = parseFloat(normalizeNumber(estimateMax));
      if (isNaN(min) || isNaN(max)) {
        errors.push("Fourchette de devis (de/à)");
      } else if (min < 0 || max < 0) {
        errors.push("Fourchette de devis : valeurs positives requises");
      } else if (min > max) {
        errors.push("Fourchette de devis : 'De' doit être ≤ 'À'");
      }
    }

    if (wantLabelPhoto && !labelPhoto) {errors.push("Photo d’étiquette");}


    // ✅ FIX #3 : comparaison cohérente avec parseEu (gère virgule/point)
    if (
      paymentStatus === "reglement_partiel" &&
      (!partialPayment || parseEu(partialPayment) > parseEu(cost))
    ) {
      errors.push("Acompte valide");
    }

    if (errors.length > 0) {
      openAlert(
        "danger",
        "Champs manquants ou incorrects",
        "Veuillez corriger :\n\n" + errors.join("\n")
      );
      return;
    }

    // 🔔 Rappel non bloquant si mot de passe vide
    if (!password) {
      setPwdReminderVisible(true);
      return;
    }

    await performAddIntervention();
  };

 const closeAlert = () => {
  setAlertVisible(false);

  if (alertOnClose) {
    alertOnClose();
  } else if (alertTitle === "Succès") {
    navigation.reset({
      index: 0,
      routes: [{ name: "MainTabs" }],
    });
  }
};

  const performAddIntervention = async () => {
    const formattedDevisCost =
      status === "Devis en cours" && devisCost ? parseFloat(devisCost) : null;

    const costValue = parseEu(cost);
    const partialPaymentValue = parseEu(partialPayment);

    let solderestant = costValue - partialPaymentValue;
    if (isNaN(solderestant) || solderestant < 0) solderestant = 0;

    const uploadedPhotoUrls = photos;
    const labelPhotoUrl = labelPhoto;

    const articleId = await addArticleIfNeeded();
    const brandId = await addBrandIfNeeded(articleId);
    const modelId = await addModelIfNeeded(brandId, articleId);

    if (!articleId) {
      showAlert("Erreur", "Type de produit introuvable. Veuillez réessayer.");
      return;
    }
    if (!brandId) {
      showAlert("Erreur", "Marque introuvable. Veuillez réessayer.");
      return;
    }

    const interventionData = {
      reference,
      brand: customBrand || brands.find((b) => b.id === brand)?.nom,
      model: customModel || models.find((m) => m.id === model)?.nom,
      serial_number,
      description,
	  loaned_item:
    loanedItemEnabled
        ? loanedItem.trim()
        : null,

loaned_item_returned:
    loanedItemEnabled
        ? loanedItemReturned
        : false,

loaned_item_date:
    loanedItemEnabled
        ? new Date().toISOString()
        : null,
	  repair_proposal_made: repairProposalMade,

repair_proposal: repairProposalMade
  ? repairProposal.trim()
  : null,

repair_proposal_price:
  repairProposalMade && repairProposalPrice.trim()
    ? parseEu(repairProposalPrice)
    : null,

repair_proposal_status: repairProposalMade
  ? repairProposalStatus
  : null,

repair_proposal_method: repairProposalMade
  ? repairProposalMethod
  : null,

repair_proposal_comment: repairProposalMade
  ? repairProposalComment.trim() || null
  : null,

repair_proposal_date: repairProposalMade
  ? new Date().toISOString()
  : null,
      cost: costValue,
      solderestant,
      status,

      estimate_min:
        status === "Devis en cours"
          ? parseFloat(normalizeNumber(estimateMin))
          : null,
      estimate_max:
        status === "Devis en cours"
          ? parseFloat(normalizeNumber(estimateMax))
          : null,
      estimate_type: status === "Devis en cours" ? estimateType : null,
      is_estimate: status === "Devis en cours",
      estimate_accepted:
        status === "Devis en cours" && estimateType === "PLAFOND" ? true : null,
      estimate_accepted_at:
        status === "Devis en cours" && estimateType === "PLAFOND"
          ? new Date().toISOString()
          : null,

      deviceType: customDeviceType || deviceType,
      password,
      commande,
      chargeur: chargeur === "Oui",
      client_id: clientId,
      photos: uploadedPhotoUrls,
      label_photo: labelPhotoUrl,
      article_id: articleId,
      marque_id: brandId,
      modele_id: modelId,
      remarks,
      paymentStatus,
      // ✅ FIX #3 : parseEu au lieu de parseFloat pour accepter la virgule décimale
      partialPayment: partialPayment ? parseEu(partialPayment) : null,
      accept_screen_risk: acceptScreenRisk,
      createdAt: new Date().toISOString(),
    };

    if (status === "Devis en cours") interventionData.devis_cost = formattedDevisCost;

    try {
      const { error } = await supabase.from("interventions").insert(interventionData);

      if (error) {
        console.error("❌ Erreur d'insertion intervention :", error.message);
        openAlert("danger", "Erreur", "Une erreur est survenue lors de l'enregistrement.");
        return;
      }

      setHasUnsavedChanges(false);
      openAlert("success", "Succès", "Intervention enregistrée avec succès.");
    } catch (e) {
      console.error("❌ Exception insertion :", e);
      openAlert("danger", "Erreur", "Impossible d'enregistrer l'intervention.");
    }
  };

  // Création rapide d'une commande liée au client, déclenchée quand le statut
  // passe à "En attente de pièces". L'intervention n'existe pas encore en base
  // à ce stade : on préremplit simplement le champ "Commande" existant.
  // Ajoute le produit en cours de saisie à la liste des produits de la commande,
  // pour permettre de commander plusieurs composants en une seule commande.
  const handleAddOrderItem = () => {
    const product = orderProduct?.trim();
    const price = parseEu(orderUnitPrice);

    if (!product) {
      showAlert("Champs manquants", "Le produit est requis.");
      return;
    }
    if (!(price > 0)) {
      showAlert("Montant invalide", "Saisis un prix unitaire valide (> 0).");
      return;
    }

    setOrderItems((prev) => [
      ...prev,
      {
        localId: `${Date.now()}-${Math.random()}`,
        product,
        brand: orderBrand?.trim() || "",
        model: orderModel?.trim() || "",
        price,
        qty: Math.max(1, Math.floor(parseEu(orderQty) || 1)),
      },
    ]);

    setOrderProduct("");
    setOrderBrand("");
    setOrderModel("");
    setOrderUnitPrice("");
    setOrderQty("1");
  };

  const handleCreateOrderFromStatus = async () => {
    try {
      // Inclut automatiquement le produit en cours de saisie s'il est rempli,
      // en plus de ceux déjà ajoutés à la liste via "+ Ajouter un autre produit".
      const items = [...orderItems];
      const pendingProduct = orderProduct?.trim();
      if (pendingProduct) {
        const pendingPrice = parseEu(orderUnitPrice);
        if (!(pendingPrice > 0)) {
          showAlert("Montant invalide", "Saisis un prix unitaire valide (> 0).");
          return;
        }
        items.push({
          localId: "pending",
          product: pendingProduct,
          brand: orderBrand?.trim() || "",
          model: orderModel?.trim() || "",
          price: pendingPrice,
          qty: Math.max(1, Math.floor(parseEu(orderQty) || 1)),
        });
      }

      if (items.length === 0) {
        showAlert("Champs manquants", "Ajoute au moins un produit.");
        return;
      }

      const deposit = Math.max(0, parseEu(orderDeposit));

      const itemsWithTotal = items.map((item) => ({
        ...item,
        total: Math.round((item.price * item.qty + Number.EPSILON) * 100) / 100,
      }));
      const total = itemsWithTotal.reduce((sum, item) => sum + item.total, 0);
      const first = itemsWithTotal[0];
      const orderName =
        itemsWithTotal.length === 1
          ? first.product
          : `${first.product} + ${itemsWithTotal.length - 1} autre${
              itemsWithTotal.length > 2 ? "s" : ""
            }`;

      const payload = {
        client_id: clientId,
        order_name: orderName,
        items_count: itemsWithTotal.length,
        product: first.product,
        brand: first.brand,
        model: first.model,
        price: total,
        quantity: 1,
        total,
        deposit,
        received: false,
        paid: false,
        recovered: false,
        deleted: false,
        createdat: new Date().toISOString(),
      };

      const { data: createdOrder, error: createOrderError } = await supabase
        .from("orders")
        .insert([payload])
        .select("id")
        .single();

      if (createOrderError) {
        console.error("❌ Insertion order :", createOrderError);
        showAlert("Erreur", "Impossible de créer la commande.");
        return;
      }

      const lignes = itemsWithTotal.map((item, index) => ({
        order_id: createdOrder.id,
        product: item.product,
        brand: item.brand,
        model: item.model,
        serial: "",
        quantity: item.qty,
        unit_price: item.price,
        include_in_intervention: false,
        ordered: false,
        received: false,
        installed: false,
        position: index + 1,
      }));

      const { error: createOrderItemError } = await supabase
        .from("order_items")
        .insert(lignes);

      if (createOrderItemError) {
        console.error("❌ Création order_items :", createOrderItemError);
        showAlert(
          "Erreur",
          "La commande a été créée, mais ses produits n’ont pas pu être ajoutés."
        );
        return;
      }

      setCommande(orderName);
      setOrderAmount(total);
      setOrderId(createdOrder.id);
      setOrderItems([]);
      setOrderProduct("");
      setOrderBrand("");
      setOrderModel("");
      setOrderUnitPrice("");
      setOrderQty("1");
      setOrderDeposit("");
      setOrderModalVisible(false);
      showAlert(
        "✅ Commande",
        `${itemsWithTotal.length} produit${itemsWithTotal.length > 1 ? "s" : ""} enregistré${
          itemsWithTotal.length > 1 ? "s" : ""
        }.`
      );
    } catch (e) {
      console.error("❌ handleCreateOrderFromStatus:", e);
      showAlert("Erreur", "Création de la commande impossible.");
    }
  };

  const handleViewOrder = () => {
    if (!orderId) return;
    try {
      navigation.navigate("OrdersPage", {
        clientId,
        clientName: clientName || "",
      });
    } catch (e) {
      console.error("❌ handleViewOrder:", e);
      showAlert("Erreur", "Impossible d'ouvrir les commandes.");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      {clientName && <Text style={styles.clientName}>{`Client: ${clientName}`}</Text>}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
        keyboardShouldPersistTaps="always"
      >
        {/* 👉 case "même matériel" */}
        {lastDevice && (
          <View style={styles.sameDeviceRow}>
            <TouchableOpacity
              onPress={async () => {
                const newVal = !useSameDevice;
                setUseSameDevice(newVal);
                if (newVal) await applyLastDevice();
              }}
              style={styles.sameDeviceCheckbox}
            >
              {useSameDevice && (
                <Image
                  source={require("../assets/icons/checked.png")}
                  style={{ width: 20, height: 20, tintColor: "#007bff" }}
                  resizeMode="contain"
                />
              )}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkboxLabel}>
                Même matériel que la dernière intervention
              </Text>
              {lastDevice.deviceType || lastDevice.brand || lastDevice.model ? (
                <Text style={styles.sameDeviceHint}>
                  {[lastDevice.deviceType, lastDevice.brand, lastDevice.model]
                    .filter(Boolean)
                    .join(" - ")}
                </Text>
              ) : (
                <Text style={styles.sameDeviceHint}>
                  Dernier matériel enregistré pour ce client.
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ✅ TYPE / MARQUE / MODELE : champs éditables + suggestions */}
        <View style={styles.pickersRow}>
          {/* TYPE */}
          <View style={[styles.pickerBox, { paddingHorizontal: 0 }]}>
            <TextInput
              style={styles.typeInput}
              placeholder="Type de produit"
              placeholderTextColor="#666"
              value={typeText}
              onChangeText={async (t) => {
                const txt = t;
                setTypeText(txt);
                setTypeQuery(txt);
                setShowTypeSuggestions(true);
                setShowBrandSuggestions(false);
                setShowModelSuggestions(false);

                const exact = products.find((p) => norm(p.nom) === norm(txt));
                if (exact) {
                  setDeviceType(exact.nom);
                  setCustomDeviceType("");

                  // reset marque+modèle
                  setBrands([]);
                  setBrand("");
                  setCustomBrand("");
                  setBrandText("");
                  setBrandQuery("");

                  setModels([]);
                  setModel("");
                  setCustomModel("");
                  setModelText("");
                  setModelQuery("");

                  await loadBrands(exact.id);
                } else {
                  setDeviceType("Autre");
                  setCustomDeviceType(txt.trim());

                  setBrands([]);
                  setBrand("");
                  setCustomBrand("");
                  setBrandText("");
                  setBrandQuery("");

                  setModels([]);
                  setModel("");
                  setCustomModel("");
                  setModelText("");
                  setModelQuery("");
                }
              }}
              onFocus={() => {
                setShowTypeSuggestions(true);
                setShowBrandSuggestions(false);
                setShowModelSuggestions(false);
              }}
              onBlur={() => setTimeout(() => setShowTypeSuggestions(false), 150)}
              returnKeyType="done"
            />
          </View>

          <View style={{ width: 8 }} />

          {/* MARQUE */}
          <View
            style={[
              styles.pickerBox,
              { opacity: deviceType && deviceType !== "default" ? 1 : 0.5, paddingHorizontal: 0 },
            ]}
          >
            <TextInput
              style={styles.brandInput}
              editable={!!deviceType && deviceType !== "default"}
              placeholder="Marque"
              placeholderTextColor="#666"
              value={brandText}
              onChangeText={async (t) => {
                const txt = t;
                setBrandText(txt);
                setBrandQuery(txt);
                setShowBrandSuggestions(true);
                setShowTypeSuggestions(false);
                setShowModelSuggestions(false);

                const exact = brands.find((b) => norm(b.nom) === norm(txt));
                if (exact) {
                  setBrand(exact.id);
                  setCustomBrand("");

                  // reset modèle + charge modèles
                  setModels([]);
                  setModel("");
                  setCustomModel("");
                  setModelText("");
                  setModelQuery("");

                  await loadModels(exact.id);
                } else {
                  setBrand("Autre");
                  setCustomBrand(txt.trim());

                  setModels([]);
                  setModel("");
                  setCustomModel("");
                  setModelText("");
                  setModelQuery("");
                }
              }}
              onFocus={() => {
                if (deviceType && deviceType !== "default") {
                  setShowBrandSuggestions(true);
                  setShowTypeSuggestions(false);
                  setShowModelSuggestions(false);
                }
              }}
              onBlur={() => setTimeout(() => setShowBrandSuggestions(false), 150)}
              returnKeyType="done"
            />
          </View>

          <View style={{ width: 8 }} />

          {/* MODELE */}
          <View style={[styles.pickerBox, { opacity: brand ? 1 : 0.5, paddingHorizontal: 0 }]}>
            <TextInput
              style={styles.modelInput}
              editable={!!brand}
              placeholder="Modèle"
              placeholderTextColor="#666"
              value={modelText}
              onChangeText={(t) => {
                const txt = t;
                setModelText(txt);
                setModelQuery(txt);
                setShowModelSuggestions(true);
                setShowTypeSuggestions(false);
                setShowBrandSuggestions(false);

                const exact = models.find((m) => norm(m.nom) === norm(txt));
                if (exact) {
                  setModel(exact.id);
                  setCustomModel("");
                } else {
                  setModel("Autre");
                  setCustomModel(txt.trim());
                }
              }}
              onFocus={() => {
                if (brand) {
                  setShowModelSuggestions(true);
                  setShowTypeSuggestions(false);
                  setShowBrandSuggestions(false);
                }
              }}
              onBlur={() => setTimeout(() => setShowModelSuggestions(false), 150)}
              returnKeyType="done"
            />
          </View>
        </View>

{/* Suggestions TYPE */}
{showTypeSuggestions && (
  <View style={styles.suggestBox}>
    {filteredTypes.map((item) => (
      <TouchableOpacity
        key={item.id}
        style={styles.suggestItem}
        onPress={async () => {
          setDeviceType(item.nom);
          setTypeText(item.nom);
          setTypeQuery(item.nom);
          setCustomDeviceType("");
          setShowTypeSuggestions(false);

          // reset marque+modèle
          setBrands([]);
          setBrand("");
          setCustomBrand("");
          setBrandText("");
          setBrandQuery("");

          setModels([]);
          setModel("");
          setCustomModel("");
          setModelText("");
          setModelQuery("");

          await loadBrands(item.id);
          Keyboard.dismiss();
        }}
      >
        <Text style={styles.suggestText}>{item.nom}</Text>
      </TouchableOpacity>
    ))}

    {!!typeQuery?.trim() && !hasTypeExact && (
      <TouchableOpacity
        style={[styles.suggestItem, styles.addRow]}
        onPress={() => {
          const v = typeQuery.trim();
          setDeviceType("Autre");
          setCustomDeviceType(v);
          setTypeText(v);
          setShowTypeSuggestions(false);

          // reset marque+modèle
          setBrands([]);
          setBrand("");
          setCustomBrand("");
          setBrandText("");
          setBrandQuery("");

          setModels([]);
          setModel("");
          setCustomModel("");
          setModelText("");
          setModelQuery("");

          Keyboard.dismiss();
        }}
      >
        <Text style={styles.addRowText}>➕ Ajouter : {typeQuery.trim()}</Text>
      </TouchableOpacity>
    )}

    {!filteredTypes.length && !typeQuery?.trim() && (
      <View style={styles.emptyRow}>
        <Text style={styles.emptyRowText}>Commence à taper…</Text>
      </View>
    )}
  </View>
)}


{/* Suggestions MARQUE */}
{deviceType && deviceType !== "default" && showBrandSuggestions && (
  <View style={styles.suggestBox}>
    {filteredBrands.map((item) => (
      <TouchableOpacity
        key={item.id}
        style={styles.suggestItem}
        onPress={async () => {
          setBrand(item.id);
          setBrandText(item.nom);
          setBrandQuery(item.nom);
          setCustomBrand("");
          setShowBrandSuggestions(false);

          // reset modèle + charge
          setModels([]);
          setModel("");
          setCustomModel("");
          setModelText("");
          setModelQuery("");

          await loadModels(item.id);
          Keyboard.dismiss();
        }}
      >
        <Text style={styles.suggestText}>{item.nom}</Text>
      </TouchableOpacity>
    ))}

    {!!brandQuery?.trim() && !hasBrandExact && (
      <TouchableOpacity
        style={[styles.suggestItem, styles.addRow]}
        onPress={() => {
          const v = brandQuery.trim();
          setBrand("Autre");
          setCustomBrand(v);
          setBrandText(v);
          setShowBrandSuggestions(false);

          // reset modèle
          setModels([]);
          setModel("");
          setCustomModel("");
          setModelText("");
          setModelQuery("");

          Keyboard.dismiss();
        }}
      >
        <Text style={styles.addRowText}>➕ Ajouter : {brandQuery.trim()}</Text>
      </TouchableOpacity>
    )}

    {!filteredBrands.length && !brandQuery?.trim() && (
      <View style={styles.emptyRow}>
        <Text style={styles.emptyRowText}>Commence à taper…</Text>
      </View>
    )}
  </View>
)}


{/* Suggestions MODELE */}
{brand && showModelSuggestions && (
  <View style={styles.suggestBox}>
    {filteredModels.map((item) => (
      <TouchableOpacity
        key={item.id}
        style={styles.suggestItem}
        onPress={() => {
          setModel(item.id);
          setModelText(item.nom);
          setModelQuery(item.nom);
          setCustomModel("");
          setShowModelSuggestions(false);
          Keyboard.dismiss();
        }}
      >
        <Text style={styles.suggestText}>{item.nom}</Text>
      </TouchableOpacity>
    ))}

    {!!modelQuery?.trim() && !hasModelExact && (
      <TouchableOpacity
        style={[styles.suggestItem, styles.addRow]}
        onPress={() => {
          const v = modelQuery.trim();
          setModel("Autre");
          setCustomModel(v);
          setModelText(v);
          setShowModelSuggestions(false);
          Keyboard.dismiss();
        }}
      >
        <Text style={styles.addRowText}>➕ Ajouter : {modelQuery.trim()}</Text>
      </TouchableOpacity>
    )}

    {!filteredModels.length && !modelQuery?.trim() && (
      <View style={styles.emptyRow}>
        <Text style={styles.emptyRowText}>Commence à taper…</Text>
      </View>
    )}
  </View>
)}


        {/* Champs saisis quand “Autre” est choisi */}
        {deviceType === "Autre" && (
          <TextInput
            style={styles.input}
            placeholder="Entrez le type de produit"
            value={customDeviceType}
            onChangeText={(t) => {
              setCustomDeviceType(t);
              setTypeText(t);
              setTypeQuery(t);
            }}
          />
        )}

        {brand === "Autre" && (
          <TextInput
            style={styles.input}
            placeholder="Entrez la marque"
            value={customBrand}
            onChangeText={(t) => {
              setCustomBrand(t);
              setBrandText(t);
              setBrandQuery(t);
            }}
          />
        )}

        {model === "Autre" && (
          <TextInput
            style={styles.input}
            placeholder="Entrez le modèle"
            value={customModel}
            onChangeText={(t) => {
              setCustomModel(t);
              setModelText(t);
              setModelQuery(t);
            }}
          />
        )}

        {/* Séparateur */}
        <View style={{ height: 2, backgroundColor: "#cacaca", marginVertical: 8 }} />

        <View style={styles.referenceContainer}>
          <TextInput
            style={styles.referenceInput}
            value={reference.toUpperCase()}
            onFocus={() => {
              // Efface l'indication "Voir photo..." dès qu'on tape ou scanne un code-barre dans le champ
              if (reference === REFERENCE_PHOTO_HINT) setReference("");
            }}
            onChangeText={(text) => {
              // Filet de sécurité si la douchette écrit avant que le focus n'ait déclenché l'effacement
              if (
                reference === REFERENCE_PHOTO_HINT &&
                text.toUpperCase().startsWith(REFERENCE_PHOTO_HINT.toUpperCase())
              ) {
                setReference(
                  text.slice(REFERENCE_PHOTO_HINT.length).toUpperCase()
                );
              } else {
                setReference(text.toUpperCase());
              }
            }}
            autoCapitalize="characters"
            placeholderTextColor="#242424"
            placeholder="Référence du produit / Numéro de série / photo étiquette"
          />

          {isPhotoTaken && (
            <MaterialIcons
              name="check-circle"
              size={24}
              color="green"
              style={styles.checkIcon}
            />
          )}
        </View>
{/* ✅ Case à cocher : activer/désactiver la photo d’étiquette */}
<View style={styles.labelToggleRow}>
  <TouchableOpacity
    onPress={() => {
      const next = !wantLabelPhoto;
      setWantLabelPhoto(next);

      // Si on désactive, on efface l’étiquette (et l’indicateur)
      if (!next) {
        setLabelPhoto(null);
        setIsPhotoTaken(false);
      }
    }}
    style={styles.labelToggleCheckbox}
  >
    {wantLabelPhoto && (
      <Image
        source={require("../assets/icons/checked.png")}
        style={{ width: 20, height: 20, tintColor: "#007bff" }}
        resizeMode="contain"
      />
    )}
  </TouchableOpacity>

  <Text style={styles.labelToggleText}>Prendre la photo de l’étiquette</Text>
</View>

        {/* Bouton + vignette étiquette */}
        {wantLabelPhoto && (
        <View style={styles.labelRow}>
          <TouchableOpacity style={styles.button} onPress={pickLabelImage}>
            <Icon name="camera" size={20} color="#dddcdc" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Prendre une photo de l'étiquette</Text>
          </TouchableOpacity>

          {labelPhoto && (
            <TouchableOpacity
              onPress={() => setSelectedImage(labelPhoto)}
              activeOpacity={0.85}
              style={{ position: "relative" }}
            >
              <Image source={{ uri: labelPhoto }} style={styles.labelThumb} />
              <View
                style={[
                  styles.badgeOverlay,
                  isLocalRef(labelPhoto) ? styles.badgeLocalBg : styles.badgeCloudBg,
                ]}
              >
                <Text style={styles.badgeText}>
                  {isLocalRef(labelPhoto) ? "Local" : "Cloud"}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
        )}
<FloatingField label="Description de la panne">
  <View style={styles.faultDescriptionContainer}>
    <TextInput
      style={styles.faultDescriptionInput}
      value={description.toUpperCase()}
      onChangeText={(text) =>
        setDescription(text.toUpperCase())
      }
      multiline
      autoCapitalize="characters"
      placeholder="Décrivez la panne ou choisissez dans la liste"
      placeholderTextColor="#7b7b7b"
    />

    <TouchableOpacity
      style={styles.faultChooseButton}
      onPress={async () => {
        Keyboard.dismiss();
        setFaultSearch("");
        await loadFaultDictionary();
        setFaultModalVisible(true);
      }}
    >
      <MaterialIcons
        name="list-alt"
        size={22}
        color="#ffffff"
      />

      <Text style={styles.faultChooseButtonText}>
        Choisir
      </Text>
    </TouchableOpacity>
  </View>
</FloatingField>

        <FloatingField label="Mot de passe (si applicable)">
          <TextInput style={styles.input} value={password} onChangeText={setPassword} />
        </FloatingField>
{/* Proposition de réparation immédiate */}
<View style={styles.repairProposalBox}>
  <TouchableOpacity
    style={styles.repairProposalToggleRow}
    onPress={() => {
      const nextValue = !repairProposalMade;

      setRepairProposalMade(nextValue);

      if (!nextValue) {
        setRepairProposal("");
        setRepairProposalPrice("");
        setRepairProposalStatus("pending");
        setRepairProposalMethod("shop");
        setRepairProposalComment("");
      }
    }}
  >
    <View style={styles.repairProposalCheckbox}>
      {repairProposalMade && (
        <Image
          source={require("../assets/icons/checked.png")}
          style={{
            width: 20,
            height: 20,
            tintColor: "#047857",
          }}
          resizeMode="contain"
        />
      )}
    </View>

    <View style={{ flex: 1 }}>
      <Text style={styles.repairProposalToggleTitle}>
        Proposition de réparation faite au client
      </Text>

      <Text style={styles.repairProposalToggleHelp}>
        À utiliser si le matériel est testé devant le
        client avant l’enregistrement de la fiche.
      </Text>
    </View>
  </TouchableOpacity>

  {repairProposalMade && (
    <View style={styles.repairProposalContent}>
      <FloatingField label="Solution proposée">
        <TextInput
          style={[
            styles.input,
            styles.repairProposalTextInput,
          ]}
          value={repairProposal}
          onChangeText={setRepairProposal}
          placeholder="Exemple : remplacement du circuit interne d’affichage"
          placeholderTextColor="#777"
          multiline
          textAlignVertical="top"
        />
      </FloatingField>

      <FloatingField label="Montant proposé (€) — facultatif">
        <TextInput
          style={styles.input}
          value={repairProposalPrice}
          onChangeText={(value) =>
            setRepairProposalPrice(
              normalizeNumber(value)
            )
          }
          keyboardType="numeric"
          placeholder="Exemple : 120"
          placeholderTextColor="#777"
        />
      </FloatingField>

      <FloatingField label="Décision du client">
        <Picker
          selectedValue={repairProposalStatus}
          style={styles.input}
          onValueChange={setRepairProposalStatus}
        >
          <Picker.Item
            label="En attente de décision"
            value="pending"
          />

          <Picker.Item
            label="Acceptée immédiatement"
            value="accepted"
          />

          <Picker.Item
            label="Refusée"
            value="refused"
          />
        </Picker>
      </FloatingField>

      <FloatingField label="Proposition faite">
        <Picker
          selectedValue={repairProposalMethod}
          style={styles.input}
          onValueChange={setRepairProposalMethod}
        >
          <Picker.Item
            label="En présence du client"
            value="shop"
          />

          <Picker.Item
            label="Par téléphone"
            value="phone"
          />

          <Picker.Item
            label="Par SMS"
            value="sms"
          />

          <Picker.Item
            label="Par email"
            value="email"
          />
        </Picker>
      </FloatingField>

      <FloatingField label="Commentaire facultatif">
        <TextInput
          style={[
            styles.input,
            styles.repairProposalCommentInput,
          ]}
          value={repairProposalComment}
          onChangeText={setRepairProposalComment}
          placeholder="Exemple : le client accepte la réparation si elle ne dépasse pas 120 €"
          placeholderTextColor="#777"
          multiline
          textAlignVertical="top"
        />
      </FloatingField>

      {repairProposalStatus === "accepted" && (
        <View style={styles.repairProposalAcceptedBox}>
          <Text
            style={
              styles.repairProposalAcceptedText
            }
          >
            ✓ Accord du client enregistré lors de la
            création de la fiche
          </Text>
        </View>
      )}

      {repairProposalStatus === "pending" && (
        <View style={styles.repairProposalPendingBox}>
          <Text
            style={
              styles.repairProposalPendingText
            }
          >
            Proposition en attente de réponse du client
          </Text>
        </View>
      )}

      {repairProposalStatus === "refused" && (
        <View style={styles.repairProposalRefusedBox}>
          <Text
            style={
              styles.repairProposalRefusedText
            }
          >
            Proposition refusée par le client
          </Text>
        </View>
      )}
    </View>
  )}
</View>
{/* Matériel prêté */}
<View style={styles.repairProposalBox}>
  <TouchableOpacity
    style={styles.repairProposalToggleRow}
onPress={() => {
    const next = !loanedItemEnabled;

    setLoanedItemEnabled(next);

    if (!next) {
        setLoanedItem("");
        setLoanedItemReturned(false);
    }
}}
  >
    <View style={styles.repairProposalCheckbox}>
      {loanedItemEnabled && (
        <Image
          source={require("../assets/icons/checked.png")}
          style={{
            width: 20,
            height: 20,
            tintColor: "#d97706",
          }}
          resizeMode="contain"
        />
      )}
    </View>

    <View style={{ flex: 1 }}>
      <Text style={styles.repairProposalToggleTitle}>
        Matériel prêté au client
      </Text>

      <Text style={styles.repairProposalToggleHelp}>
        Chargeur, alimentation, adaptateur...
      </Text>
    </View>
  </TouchableOpacity>

  {loanedItemEnabled && (
    <View style={styles.repairProposalContent}>
    <FloatingField label="Matériel prêté">
      <TextInput
        style={styles.input}
        value={loanedItem}
        onChangeText={setLoanedItem}
        placeholder="Ex : Chargeur Lenovo USB-C 65W"
        placeholderTextColor="#777"
      />
    </FloatingField>
  </View>
  )}
</View>
        <FloatingField label="Coût de l'intervention (€)">
          <TextInput
            style={styles.input}
            value={cost ? cost.toString() : ""}
            onChangeText={(t) => setCost(normalizeNumber(t))}
            keyboardType="numeric"
            placeholderTextColor="#191f2f"
            editable={status !== "Devis en cours"}
            placeholder={
              status === "Devis en cours" ? "Indisponible en mode Devis" : "Entrez le coût"
            }
          />
        </FloatingField>

        {status !== "Devis en cours" &&
          !!(deviceType && deviceType !== "default") && (
            <TouchableOpacity
              style={styles.priceListButton}
              onPress={() => {
                setPriceListTarget("cost");
                openPriceList();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="price-check" size={18} color="#0d9488" />
              <Text style={styles.priceListButtonText}>
                Voir le barème de réparations
              </Text>
            </TouchableOpacity>
          )}

        <View>
          <View>
            <View style={[styles.checkboxContainer, { marginBottom: 20 }]}>
              <TouchableOpacity
                onPress={() => setAcceptScreenRisk((prev) => !prev)}
                style={styles.checkboxRow}
              >
                <View style={styles.checkbox}>
                  {acceptScreenRisk && (
                    <Image
                      source={require("../assets/icons/checked.png")}
                      style={{ width: 20, height: 20, tintColor: "#007bff" }}
                      resizeMode="contain"
                    />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>
                  J'accepte le démontage de l'écran de mon produit malgré le risque de casse.
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.checkboxContainer}>
              <TouchableOpacity
                onPress={() => {
                  setPaymentStatus("non_regle");
                  setPartialPayment("");
                }}
                style={styles.checkboxRow}
              >
                <View style={styles.checkbox}>
                  {paymentStatus === "non_regle" && (
                    <Image
                      source={require("../assets/icons/checked.png")}
                      style={{ width: 20, height: 20, tintColor: "#fc0707" }}
                      resizeMode="contain"
                    />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>Non réglé</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setPaymentStatus("reglement_partiel")}
                style={styles.checkboxRow}
              >
                <View style={styles.checkbox}>
                  {paymentStatus === "reglement_partiel" && (
                    <Image
                      source={require("../assets/icons/checked.png")}
                      style={{ width: 20, height: 20, tintColor: "#e4a907" }}
                      resizeMode="contain"
                    />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>Règlement partiel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setPaymentStatus("solde")}
                style={styles.checkboxRow}
              >
                <View style={styles.checkbox}>
                  {paymentStatus === "solde" && (
                    <Image
                      source={require("../assets/icons/checked.png")}
                      style={{ width: 20, height: 20, tintColor: "#4CAF50" }}
                      resizeMode="contain"
                    />
                  )}
                </View>
                <Text style={styles.checkboxLabel}>Soldé</Text>
              </TouchableOpacity>
            </View>
          </View>

          {paymentStatus === "reglement_partiel" && (
            <View>
              <FloatingField label="Montant de l'acompte (€)">
                <TextInput
                  style={styles.input}
                  value={partialPayment}
                  onChangeText={(value) => {
                    const v = normalizeNumber(value);
                    if (parseEu(v) > parseEu(cost)) {
                      showAlert("Erreur", "L'acompte ne peut pas dépasser le montant total.");
                    } else {
                      setPartialPayment(v);
                    }
                  }}
                  keyboardType="numeric"
                  placeholder="Entrez le montant de l'acompte"
                />
              </FloatingField>

              <Text style={styles.label}>
                Solde restant :{" "}
                {cost && partialPayment
                  ? (parseEu(cost) - parseEu(partialPayment)).toFixed(2)
                  : cost}{" "}
                €
              </Text>
            </View>
          )}
        </View>

        <View
          style={[
            styles.rowFlexContainer,
            status === "En attente de pièces" && { paddingHorizontal: 20 },
          ]}
        >
          <View style={[styles.fullwidthContainer, { width: "100%" }]}>
            <View style={{ width: "90%", alignSelf: "center", flexDirection: "row" }}>
              <FloatingField label="Statut" style={{ width: "46%", marginRight: "8%" }}>
                <View style={{ width: "100%", overflow: "hidden", borderRadius: 10 }}>
                  <Picker
                    selectedValue={status}
                    style={[styles.input, { width: "100%", marginBottom: 0 }]}
                    onValueChange={(itemValue) => {
                      setStatus(itemValue);
                      if (itemValue === "Devis en cours") setCost("");
                      if (
                        itemValue === "En attente de pièces" &&
                        status !== "En attente de pièces"
                      ) {
                        setOrderProduct("");
                        setOrderBrand("");
                        setOrderModel("");
                        setOrderUnitPrice("");
                        setOrderQty("1");
                        setOrderDeposit("");
                        setOrderItems([]);
                        setOrderModalVisible(true);
                      }
                    }}
                  >
                    <Picker.Item label="Sélectionnez un statut..." value="default" />
                    <Picker.Item label="En attente de pièces" value="En attente de pièces" />
                    <Picker.Item label="Devis en cours" value="Devis en cours" />
                    <Picker.Item label="Devis accepté" value="Devis accepté" />
                    <Picker.Item label="Intervention en cours" value="Intervention en cours" />
                    <Picker.Item label="Réparé" value="Réparé" />
                    <Picker.Item label="Non réparable" value="Non réparable" />
                  </Picker>
                </View>
              </FloatingField>

              <FloatingField label="Chargeur" style={{ width: "46%" }}>
                <View style={{ width: "100%", overflow: "hidden", borderRadius: 10 }}>
                  <Picker
                    selectedValue={chargeur}
                    style={[styles.input, { width: "100%", marginBottom: 0 }]}
                    onValueChange={(itemValue) => setChargeur(itemValue)}
                  >
                    <Picker.Item label="Non" value="Non" />
                    <Picker.Item label="Oui" value="Oui" />
                  </Picker>
                </View>
              </FloatingField>
            </View>

            {status === "Devis en cours" && (
              <TextInput
                style={styles.input}
                placeholder="Montant du devis (€)"
                placeholderTextColor="#202020"
                keyboardType="numeric"
                value={devisCost}
                onChangeText={(text) => setDevisCost(normalizeNumber(text))}
              />
            )}

            {status === "Devis en cours" && (
              <>
                <Text style={styles.label}>Fourchette de devis (€)</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <FloatingField label="De (€)" style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      keyboardType="numeric"
                      value={estimateMin}
                      onChangeText={(t) => setEstimateMin(normalizeNumber(t))}
                    />
                  </FloatingField>

                  <FloatingField label="À (€)" style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      keyboardType="numeric"
                      value={estimateMax}
                      onChangeText={(t) => setEstimateMax(normalizeNumber(t))}
                    />
                  </FloatingField>
                </View>

                <Text style={styles.label}>Type de fourchette</Text>
                <Picker
                  selectedValue={estimateType}
                  style={styles.input}
                  onValueChange={(val) => setEstimateType(val)}
                >
                  <Picker.Item
                    label="Fourchette plafonnée (acceptée d’office)"
                    value="PLAFOND"
                  />
                  <Picker.Item
                    label="Fourchette indicative (à confirmer)"
                    value="INDICATIF"
                  />
                </Picker>
                <Text style={styles.interventionText}>
                  Si “plafond” est choisi, le client accepte un maximum garanti (vous facturez ≤{" "}
                  {estimateMax || "…"} €).
                </Text>

                {!!(deviceType && deviceType !== "default") && (
                  <TouchableOpacity
                    style={styles.priceListButton}
                    onPress={() => {
                      setPriceListTarget("devis");
                      openPriceList();
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name="price-check"
                      size={18}
                      color="#0d9488"
                    />
                    <Text style={styles.priceListButtonText}>
                      Voir le barème de réparations
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {status !== "Devis en cours" && (
              <View style={styles.halfWidthContainer}>
                {orderAmount !== "" && (
                  <Text style={styles.interventionText}>
                    Coût total (commande comprise) :{" "}
                    {(
                      (parseEu(cost) || 0) + (parseFloat(orderAmount) || 0)
                    ).toFixed(2)}{" "}
                    €
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        {status === "En attente de pièces" && (
          <View style={styles.halfWidthContainer}>
            <Text style={styles.label}>Commande</Text>

            <View style={styles.commandeRowContainer}>
              <View style={styles.sameLineRow}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[
                      styles.inlineInput,
                      orderAmount !== "" && { paddingRight: 80 },
                    ]}
                    value={commande.toUpperCase()}
                    onChangeText={(text) => setCommande(text.toUpperCase())}
                    autoCapitalize="characters"
                    placeholder="Pièce ou produit à commander"
                    placeholderTextColor="#202020"
                  />
                  {orderAmount !== "" && (
                    <Text
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        right: 10,
                        top: 0,
                        height: 46,
                        lineHeight: 46,
                        fontWeight: "600",
                        color: "#202020",
                      }}
                    >
                      ({parseFloat(orderAmount).toFixed(2)} €)
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[
                    styles.inlineButton,
                    !commande?.trim() && styles.inlineButtonDisabled,
                  ]}
                  activeOpacity={0.8}
                  disabled={!commande?.trim()}
                  onPress={() => {
                    if (!clientId) {
                      showAlert("Client manquant", "Impossible d'ouvrir les commandes sans client.");
                      return;
                    }
                    navigation.navigate("OrdersPage", {
                      clientId,
                      clientName: clientName || "",
                      prefillProduct: (commande || "").trim(),
                      autoReturnOnCreate: true,
                      fromIntervention: true,
                    });
                  }}
                >
                  <Text style={styles.inlineButtonText}>Créer commande</Text>
                </TouchableOpacity>
              </View>

              {orderId != null && (
                <TouchableOpacity
                  onPress={handleViewOrder}
                  style={{
                    marginTop: 8,
                    alignSelf: "center",
                    backgroundColor: "#191f2f",
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    Voir la commande
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <FloatingField label="Remarques">
          <TextInput
            style={styles.input}
            value={remarks}
            onChangeText={setRemarks}
            placeholderTextColor="#191f2f"
            placeholder="Ajoutez des remarques ici..."
            multiline
          />
        </FloatingField>

        {photos.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.galleryRowCentered}
            style={{ marginTop: 12 }}
          >
            {photos.map((photo, index) => (
              <View key={index} style={styles.thumbWrapper}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedImage(photo)}
                  onLongPress={() => confirmDeletePhoto(photo)}
                  style={{ position: "relative" }}
                >
                  <Image
                    source={{ uri: photo }}
                    style={[
                      styles.thumbnail,
                      photo === labelPhoto && { borderWidth: 2, borderColor: "#43ec86" },
                    ]}
                  />

                  <View
                    style={[
                      styles.badgeOverlay,
                      isLocalRef(photo) ? styles.badgeLocalBg : styles.badgeCloudBg,
                    ]}
                  >
                    <Text style={styles.badgeText}>{isLocalRef(photo) ? "Local" : "Cloud"}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteBadge}
                  onPress={() => confirmDeletePhoto(photo)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={styles.deleteBadgeText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {selectedImage && (
          <Modal
            visible={true}
            transparent={true}
            onRequestClose={() => setSelectedImage(null)}
          >
            <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
              <View style={styles.modalBackground}>
                <Image source={{ uri: selectedImage }} style={styles.fullImage} />
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.iconButton, styles.button]}
            disabled={isAddingPhoto}
            onPress={() => {
              Keyboard.dismiss();
              pickAdditionalImage();
            }}
          >
            <Icon name="camera" size={20} color="#888787" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Prendre une autre photo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.saveButton]}
            onPress={() => {
              Keyboard.dismiss();
              handleSaveIntervention();
            }}
          >
            <Icon name="save" size={20} color="#e6e6e6" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Sauvegarder l'intervention</Text>
          </TouchableOpacity>
        </View>

        <BackButton onPress={() => navigation.goBack()} style={{ marginTop: 16 }} />
      </ScrollView>
	  {/* Modale d’ajout d’une panne */}
<Modal
  visible={newFaultModalVisible}
  transparent
  animationType="fade"
  onRequestClose={() =>
    setNewFaultModalVisible(false)
  }
>
  <TouchableWithoutFeedback
    onPress={() =>
      setNewFaultModalVisible(false)
    }
  >
    <View style={styles.faultModalOverlay}>
      <TouchableWithoutFeedback>
        <View style={styles.newFaultModalBox}>
          <Text style={styles.newFaultTitle}>
            Ajouter une panne
          </Text>

          <Text style={styles.newFaultDevice}>
            Type :{" "}
            {getCurrentDeviceTypeName() ||
              "Tous les appareils"}
          </Text>

          <Text style={styles.newFaultLabel}>
            Description
          </Text>

          <TextInput
            style={styles.newFaultInput}
            value={newFaultDescription}
            onChangeText={setNewFaultDescription}
            placeholder="Exemple : s’éteint après quelques minutes"
            placeholderTextColor="#7b8794"
            multiline
            autoFocus
          />

          <Text style={styles.newFaultLabel}>
            Catégorie
          </Text>

          <TextInput
            style={styles.newFaultInput}
            value={newFaultCategory}
            onChangeText={setNewFaultCategory}
            placeholder="Exemple : Démarrage"
            placeholderTextColor="#7b8794"
          />

          <View style={styles.newFaultActions}>
            <TouchableOpacity
              style={styles.newFaultCancelButton}
              onPress={() => {
                setNewFaultModalVisible(false);
                setNewFaultDescription("");
                setNewFaultCategory("");
              }}
            >
              <Text
                style={
                  styles.newFaultCancelButtonText
                }
              >
                Annuler
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.newFaultSaveButton}
              onPress={saveNewFault}
            >
              <Text
                style={
                  styles.newFaultSaveButtonText
                }
              >
                Ajouter
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>
{/* Modale de sélection de la panne */}
<Modal
  visible={faultModalVisible}
  transparent
  animationType="fade"
  onRequestClose={() =>
    setFaultModalVisible(false)
  }
>
  <TouchableWithoutFeedback
    onPress={() => setFaultModalVisible(false)}
  >
    <View style={styles.faultModalOverlay}>
      <TouchableWithoutFeedback>
        <View style={styles.faultModalBox}>
          <View style={styles.faultModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.faultModalTitle}>
                Description de la panne
              </Text>

              <Text style={styles.faultModalSubtitle}>
                {getCurrentDeviceTypeName() ||
                  "Tous les types de produits"}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.faultModalClose}
              onPress={() =>
                setFaultModalVisible(false)
              }
            >
              <Text style={styles.faultModalCloseText}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.faultSearchContainer}>
            <MaterialIcons
              name="search"
              size={22}
              color="#64748b"
            />

            <TextInput
              style={styles.faultSearchInput}
              value={faultSearch}
              onChangeText={setFaultSearch}
              placeholder="Rechercher une panne..."
              placeholderTextColor="#7b8794"
              autoFocus
            />

            {!!faultSearch && (
              <TouchableOpacity
                onPress={() => setFaultSearch("")}
              >
                <Text style={styles.faultSearchClear}>
                  ✕
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={styles.faultListScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {faultLoading ? (
              <Text style={styles.faultEmptyText}>
                Chargement…
              </Text>
            ) : filteredFaults.length === 0 ? (
              <Text style={styles.faultEmptyText}>
                Aucune panne trouvée.
              </Text>
            ) : (
              Object.entries(groupedFaults).map(
                ([category, faults]) => (
                  <View key={category}>
                    <Text
                      style={styles.faultCategoryTitle}
                    >
                      {category}
                    </Text>

                    {faults.map((fault) => (
                      <TouchableOpacity
                        key={String(fault.id)}
                        style={styles.faultRow}
                        onPress={() => {
                          setDescription(
                            fault.description.toUpperCase()
                          );

                          const suggestedSolution =
                            FAULT_SUGGESTED_SOLUTIONS[fault.device_type]?.[
                              fault.description
                            ];
                          if (suggestedSolution && !repairProposal.trim()) {
                            setRepairProposal(suggestedSolution);
                          }

                          setFaultModalVisible(false);
                          setFaultSearch("");
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={
                              styles.faultRowDescription
                            }
                          >
                            {fault.description}
                          </Text>

                          {!!fault.device_type && (
                            <Text
                              style={
                                styles.faultRowDevice
                              }
                            >
                              {fault.device_type}
                            </Text>
                          )}
                        </View>

                        <Text style={styles.faultRowArrow}>
                          ›
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )
              )
            )}
          </ScrollView>

          <TouchableOpacity
            style={styles.addFaultButton}
            onPress={() => {
              setNewFaultDescription(
                faultSearch?.trim() || ""
              );

              setNewFaultCategory("");
              setNewFaultModalVisible(true);
            }}
          >
            <Text style={styles.addFaultButtonText}>
              ➕ Ajouter une nouvelle panne
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>
{/* Modale du barème de réparations (suggestion de tarif) */}
<Modal
  visible={priceListVisible}
  transparent
  animationType="fade"
  onRequestClose={() => setPriceListVisible(false)}
>
  <TouchableWithoutFeedback onPress={() => setPriceListVisible(false)}>
    <View style={styles.faultModalOverlay}>
      <TouchableWithoutFeedback onPress={() => {}}>
        <View style={styles.faultModalBox}>
          <Text style={styles.faultModalTitle}>Barème de réparations</Text>
          <Text style={styles.faultRowDevice}>
            {getCurrentDeviceTypeName() || "Tous types"}
          </Text>

          <ScrollView
            style={styles.faultListScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {priceListLoading ? (
              <Text style={styles.faultEmptyText}>Chargement…</Text>
            ) : priceList.length === 0 ? (
              <Text style={styles.faultEmptyText}>
                Aucun tarif enregistré pour ce type d'appareil.
              </Text>
            ) : (
              priceList.map((item) => (
                <TouchableOpacity
                  key={String(item.id)}
                  style={styles.faultRow}
                  onPress={() => {
                    if (priceListTarget === "devis") {
                      setEstimateMin(normalizeNumber(String(item.price_min)));
                      setEstimateMax(normalizeNumber(String(item.price_max)));
                    } else {
                      setCost(normalizeNumber(String(item.price_min)));
                    }
                    setPriceListVisible(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.faultRowDescription}>
                      {item.issue}
                    </Text>
                    {!!item.symptoms && (
                      <Text style={styles.faultRowDevice}>
                        {item.symptoms}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.faultRowDescription}>
                    {item.price_min} € – {item.price_max} €
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <TouchableOpacity
            style={styles.addFaultButton}
            onPress={() => {
              setNewPriceIssue("");
              setNewPriceSymptoms("");
              setNewPriceMin("");
              setNewPriceMax("");
              setNewPriceModalVisible(true);
            }}
          >
            <Text style={styles.addFaultButtonText}>
              ➕ Ajouter un tarif
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>
{/* Modale d'ajout d'un tarif au barème */}
<Modal
  visible={newPriceModalVisible}
  transparent
  animationType="fade"
  onRequestClose={() => setNewPriceModalVisible(false)}
>
  <TouchableWithoutFeedback onPress={() => setNewPriceModalVisible(false)}>
    <View style={styles.faultModalOverlay}>
      <TouchableWithoutFeedback>
        <View style={styles.newFaultModalBox}>
          <Text style={styles.newFaultTitle}>Ajouter un tarif</Text>

          <Text style={styles.newFaultDevice}>
            Type : {getCurrentDeviceTypeName() || "Tous les appareils"}
          </Text>

          <Text style={styles.newFaultLabel}>Type de réparation</Text>
          <TextInput
            style={styles.newFaultInput}
            value={newPriceIssue}
            onChangeText={setNewPriceIssue}
            placeholder="Exemple : Remplacement écran"
            placeholderTextColor="#7b8794"
            multiline
            autoFocus
          />

          <Text style={styles.newFaultLabel}>Symptômes (optionnel)</Text>
          <TextInput
            style={styles.newFaultInput}
            value={newPriceSymptoms}
            onChangeText={setNewPriceSymptoms}
            placeholder="Exemple : écran fissuré, tactile HS"
            placeholderTextColor="#7b8794"
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.newFaultLabel}>Prix min (€)</Text>
              <TextInput
                style={styles.newFaultInput}
                value={newPriceMin}
                onChangeText={setNewPriceMin}
                placeholder="Ex : 40"
                placeholderTextColor="#7b8794"
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.newFaultLabel}>Prix max (€)</Text>
              <TextInput
                style={styles.newFaultInput}
                value={newPriceMax}
                onChangeText={setNewPriceMax}
                placeholder="Ex : 60"
                placeholderTextColor="#7b8794"
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.newFaultActions}>
            <TouchableOpacity
              style={styles.newFaultCancelButton}
              onPress={() => {
                setNewPriceModalVisible(false);
                setNewPriceIssue("");
                setNewPriceSymptoms("");
                setNewPriceMin("");
                setNewPriceMax("");
              }}
            >
              <Text style={styles.newFaultCancelButtonText}>Annuler</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.newFaultSaveButton}
              onPress={saveNewPrice}
            >
              <Text style={styles.newFaultSaveButtonText}>Ajouter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>
      {/* Alert */}
      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={closeAlert}
      />

      <AlertBox
        visible={deletePhotoConfirmVisible}
        title="Supprimer la photo"
        message="Voulez-vous vraiment supprimer cette photo ?"
        cancelText="Annuler"
        confirmText="Supprimer"
        onClose={() => setDeletePhotoConfirmVisible(false)}
        onConfirm={() => {
          setDeletePhotoConfirmVisible(false);
          const uri = photoUriToDelete;
          setPhotos((prev) => prev.filter((p) => p !== uri));
          if (uri === labelPhoto) setLabelPhoto(null);
          if (selectedImage === uri) setSelectedImage(null);
          setPhotoUriToDelete(null);
        }}
      />

      <AlertBox
        visible={!!pendingLeaveAction}
        title="Modifications non enregistrées"
        message="Vous allez perdre les informations saisies pour cette intervention. Voulez-vous vraiment quitter ?"
        cancelText="Annuler"
        confirmText="Quitter"
        onClose={() => setPendingLeaveAction(null)}
        onConfirm={() => {
          const action = pendingLeaveAction;
          setHasUnsavedChanges(false);
          setPendingLeaveAction(null);
          action?.();
        }}
      />

      {/* Modale rappel mot de passe */}
      <Modal
        transparent
        visible={pwdReminderVisible}
        animationType="fade"
        onRequestClose={() => setPwdReminderVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.pwdReminderBox}>
            <Text style={styles.pwdReminderTitle}>Mot de passe non renseigné</Text>
            <Text style={styles.pwdReminderMessage}>
              Vous pouvez l’ajouter maintenant, ou continuer sans.{"\n"}
              (Ce rappel n’empêche pas l’enregistrement.)
            </Text>

            <View style={styles.pwdReminderActions}>
              <TouchableOpacity
                style={[styles.pwdBtn, styles.pwdBtnCancel]}
                onPress={() => setPwdReminderVisible(false)}
              >
                <Text style={styles.pwdBtnCancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pwdBtn, styles.pwdBtnContinue]}
                onPress={async () => {
                  setPwdReminderVisible(false);
                  await performAddIntervention();
                }}
              >
                <Text style={styles.pwdBtnContinueText}>Continuer sans</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modale création commande rapide */}
      <Modal
        visible={orderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOrderModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: "92%",
              maxHeight: "88%",
              backgroundColor: "#fff",
              borderRadius: 10,
              padding: 14,
            }}
          >
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                textAlign: "center",
                marginBottom: 10,
              }}
            >
              Créer la commande
            </Text>

            <FloatingField label="Produit à commander">
              <TextInput
                style={styles.input}
                value={orderProduct}
                onChangeText={setOrderProduct}
                placeholder="Ex: BATTERIE ASUS X512"
                placeholderTextColor="#777"
              />
            </FloatingField>

            <FloatingField label="Marque">
              <TextInput
                style={styles.input}
                value={orderBrand}
                onChangeText={setOrderBrand}
                placeholder="(facultatif)"
                placeholderTextColor="#777"
              />
            </FloatingField>

            <FloatingField label="Modèle">
              <TextInput
                style={styles.input}
                value={orderModel}
                onChangeText={setOrderModel}
                placeholder="(facultatif)"
                placeholderTextColor="#777"
              />
            </FloatingField>

            <FloatingField label="Prix unitaire (€)">
              <TextInput
                style={styles.input}
                value={orderUnitPrice}
                onChangeText={setOrderUnitPrice}
                keyboardType="decimal-pad"
                placeholder="Ex: 80"
                placeholderTextColor="#777"
              />
            </FloatingField>

            <FloatingField label="Quantité">
              <TextInput
                style={styles.input}
                value={orderQty}
                onChangeText={(t) => setOrderQty(t.replace(/[^\d]/g, ""))}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor="#777"
              />
            </FloatingField>

            <TouchableOpacity
              onPress={handleAddOrderItem}
              style={{
                alignSelf: "center",
                marginBottom: 10,
                paddingVertical: 8,
                paddingHorizontal: 14,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: "#0d6efd",
              }}
            >
              <Text style={{ color: "#0d6efd", fontWeight: "700" }}>
                + Ajouter un autre produit
              </Text>
            </TouchableOpacity>

            {orderItems.length > 0 && (
              <View
                style={{
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: "#ddd",
                  borderRadius: 8,
                  backgroundColor: "#fafafa",
                  padding: 10,
                }}
              >
                <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                  Produits ajoutés
                </Text>
                {orderItems.map((item) => (
                  <View
                    key={item.localId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "600" }}>{item.product}</Text>
                      <Text style={{ color: "#666", fontSize: 12 }}>
                        {item.qty} × {item.price.toFixed(2)} €
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() =>
                        setOrderItems((prev) =>
                          prev.filter((p) => p.localId !== item.localId)
                        )
                      }
                    >
                      <Text
                        style={{ color: "red", marginLeft: 10, fontWeight: "700" }}
                      >
                        ✕
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <FloatingField label="Acompte (€)">
              <TextInput
                style={styles.input}
                value={orderDeposit}
                onChangeText={setOrderDeposit}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor="#777"
              />
            </FloatingField>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setOrderModalVisible(false)}
                style={{
                  flex: 1,
                  backgroundColor: "#6c757d",
                  padding: 12,
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleCreateOrderFromStatus}
                style={{
                  flex: 1,
                  backgroundColor: "#0d6efd",
                  padding: 12,
                  borderRadius: 8,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>Créer</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// Petit wrapper pour avoir un label "à cheval" sur le champ
function FloatingField({ label, children, style }) {
  return (
    <View style={[styles.fieldWrapper, style]}>
      {children}
      <Text style={styles.floatingLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e0e0e0",
    paddingHorizontal: 20,
  },
  clientName: {
    fontSize: 20,
    fontWeight: "500",
    textAlign: "center",
    marginVertical: 10,
    color: "#242424",
  },

  sameDeviceRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "90%",
    alignSelf: "center",
    marginBottom: 10,
    marginTop: 5,
  },
  sameDeviceCheckbox: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: "#ccc",
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "#fff",
  },
  sameDeviceHint: {
    fontSize: 13,
    color: "#555",
    marginTop: 2,
  },

  input: {
    height: 50,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 16,
    borderRadius: 10,
    backgroundColor: "#cacaca",
    width: "90%",
    alignSelf: "center",
    fontSize: 16,
    fontWeight: "500",
    color: "#191f2f",
  },
  fieldWrapper: {
    width: "100%",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 8,
    position: "relative",
    overflow: "visible",
  },

  floatingLabel: {
    position: "absolute",
    left: "8%",
    top: -12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#e0e0e0",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#999",
    fontSize: 12,
    fontWeight: "600",
    color: "#222",
    zIndex: 10,
    elevation: 3,
  },

  label: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#242424",
    width: "90%",
    alignSelf: "center",
  },

  referenceContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    alignSelf: "center",
  },
  referenceInput: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#cacaca",
    width: "90%",
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 5,
    color: "#888787",
  },
  checkIcon: { marginLeft: 10 },

  thumbnail: { width: 100, height: 100, margin: 5, borderRadius: 10 },

  button: {
    backgroundColor: "#0c0f18",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 20,
    maxWidth: 250,
  },
  buttonText: { color: "#fff", fontWeight: "500" },
  saveButton: {
    backgroundColor: "#04852b",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 20,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  alertBox: {
    width: 300,
    padding: 20,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 20,
    alignItems: "center",
  },
  alertTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 10, color: "#333" },
  alertMessage: { fontSize: 16, color: "#666", textAlign: "center", marginBottom: 20 },

  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  fullImage: { width: "90%", height: "90%", resizeMode: "contain" },

  fullwidthContainer: { flex: 1, width: "48%" },
  rowFlexContainer: { flexDirection: "row", width: "100%" },

  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 40,
    gap: 10,
  },
  buttonIcon: { marginRight: 10 },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#888787",
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 2,
    justifyContent: "center",
    flex: 1,
    marginHorizontal: 5,
  },

  modalButton: {
    backgroundColor: "#dddddd",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  modalButtonText: { color: "#202020", fontSize: 16, fontWeight: "bold" },

  checkboxContainer: { flexDirection: "row", marginVertical: 10 },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
    marginRight: 10,
    marginLeft: 40,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: "#ccc",
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "#fff",
  },
  checkboxLabel: { color: "#242424", fontSize: 16, fontWeight: "500" },

  interventionText: {
    fontSize: 16,
    color: "#ff4500",
    fontWeight: "500",
    marginBottom: 15,
    width: "90%",
    alignSelf: "center",
  },

  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  labelThumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#43ec86",
  },

  thumbWrapper: { position: "relative", width: 100, height: 100, margin: 5 },
  deleteBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#ff3b30",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#e0e0e0",
    elevation: 2,
  },
  deleteBadgeText: { color: "#fff", fontSize: 16, lineHeight: 16, fontWeight: "bold" },

  badgeOverlay: {
    position: "absolute",
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 10,
    elevation: 6,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  badgeLocalBg: { backgroundColor: "rgba(92,184,92,0.95)" },
  badgeCloudBg: { backgroundColor: "rgba(217,83,79,0.95)" },

  galleryRowCentered: {
    flexGrow: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },

  pickersRow: { flexDirection: "row", marginBottom: 12 },

  pickerBox: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: "#585858",
    borderRadius: 8,
    backgroundColor: "#cacaca",
    paddingHorizontal: 10,
    justifyContent: "center",
  },

  // ✅ Inputs Type/Marque/Modèle
  typeInput: {
    height: 52,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: "500",
    color: "#191f2f",
  },
  brandInput: {
    height: 52,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: "500",
    color: "#191f2f",
  },
  modelInput: {
    height: 52,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: "500",
    color: "#191f2f",
  },

  // ✅ Suggestions
  suggestBox: {
    width: "90%",
    alignSelf: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#585858",
    borderRadius: 10,
    marginTop: -6,
    marginBottom: 10,
    overflow: "hidden",
    elevation: 6,
  },
  suggestItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  suggestText: { fontSize: 15, color: "#111", fontWeight: "500" },

  commandeRowContainer: { width: "90%", alignSelf: "center" },
  sameLineRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  inlineInput: {
    flex: 1,
    height: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#424242",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    color: "#111827",
  },
  inlineButton: {
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#424242",
    backgroundColor: "#191f2f",
    alignItems: "center",
    justifyContent: "center",
  },
  inlineButtonDisabled: { opacity: 0.5 },
  inlineButtonText: { color: "#ffffff", fontWeight: "700", fontSize: 12 },

  pwdReminderBox: {
    width: 320,
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#d32f2f",
    alignItems: "center",
  },
  pwdReminderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#b71c1c",
    marginBottom: 6,
    textAlign: "center",
  },
  pwdReminderMessage: { fontSize: 14, color: "#333", textAlign: "center", marginBottom: 14 },
  pwdReminderActions: { flexDirection: "row", gap: 10 },
  pwdBtn: {
    minWidth: 120,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pwdBtnCancel: { backgroundColor: "#eeeeee", borderWidth: 1, borderColor: "#c7c7c7" },
  pwdBtnContinue: { backgroundColor: "#0c0f18" },
  pwdBtnCancelText: { color: "#333", fontWeight: "600" },
  pwdBtnContinueText: { color: "#fff", fontWeight: "700" },

  alertBoxDanger: {
    borderWidth: 2,
    borderColor: "#d32f2f",
    backgroundColor: "rgba(255,235,238,0.95)",
  },
  alertBoxSuccess: {
    borderWidth: 2,
    borderColor: "#2e7d32",
    backgroundColor: "rgba(232,245,233,0.95)",
  },
  alertTitleDanger: { color: "#b71c1c" },
  alertTitleSuccess: { color: "#1b5e20" },
  modalButtonTextDanger: { color: "#b71c1c", fontWeight: "700" },
  modalButtonTextSuccess: { color: "#1b5e20", fontWeight: "700" },

  halfWidthContainer: { flex: 1 },
  addRow: {
  backgroundColor: "#f6fff4",
},
addRowText: {
  fontSize: 15,
  fontWeight: "700",
  color: "#1b5e20",
},
emptyRow: {
  paddingVertical: 10,
  paddingHorizontal: 12,
},
emptyRowText: {
  fontSize: 14,
  color: "#666",
  fontWeight: "500",
},
labelToggleRow: {
  flexDirection: "row",
  alignItems: "center",
  width: "90%",
  alignSelf: "center",
  marginTop: 8,
  marginBottom: 8,
  gap: 10,
},

labelToggleCheckbox: {
  width: 28,
  height: 28,
  borderWidth: 2,
  borderColor: "#ccc",
  borderRadius: 5,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "#fff",
},

labelToggleText: {
  fontSize: 16,
  fontWeight: "500",
  fontStyle: "italic",
  color: "#242424",
},
faultDescriptionContainer: {
  flexDirection: "row",
  alignItems: "stretch",
  width: "90%",
  alignSelf: "center",
},

faultDescriptionInput: {
  flex: 1,
  minHeight: 75,
  borderWidth: 1,
  borderColor: "#a8a8a8",
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  color: "#111827",
  backgroundColor: "#ffffff",
  textAlignVertical: "top",
},

faultChooseButton: {
  width: 92,
  marginLeft: 8,
  borderRadius: 8,
  backgroundColor: "#2563eb",
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: 10,
},

faultChooseButtonText: {
  marginTop: 3,
  color: "#ffffff",
  fontSize: 13,
  fontWeight: "bold",
},

faultModalOverlay: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.65)",
  justifyContent: "center",
  alignItems: "center",
  padding: 18,
},

faultModalBox: {
  width: "100%",
  maxWidth: 680,
  maxHeight: "90%",
  backgroundColor: "#ffffff",
  borderRadius: 16,
  padding: 16,
},

faultModalHeader: {
  flexDirection: "row",
  alignItems: "flex-start",
  marginBottom: 12,
},

faultModalTitle: {
  fontSize: 22,
  fontWeight: "bold",
  color: "#1f2937",
},

faultModalSubtitle: {
  marginTop: 3,
  fontSize: 14,
  color: "#64748b",
},

faultModalClose: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: "#e5e7eb",
  justifyContent: "center",
  alignItems: "center",
  marginLeft: 10,
},

faultModalCloseText: {
  fontSize: 17,
  fontWeight: "bold",
  color: "#374151",
},

faultSearchContainer: {
  flexDirection: "row",
  alignItems: "center",
  borderWidth: 1,
  borderColor: "#94a3b8",
  borderRadius: 10,
  backgroundColor: "#f8fafc",
  paddingHorizontal: 11,
  marginBottom: 10,
},

faultSearchInput: {
  flex: 1,
  minHeight: 46,
  paddingHorizontal: 8,
  fontSize: 16,
  color: "#111827",
},

faultSearchClear: {
  paddingHorizontal: 8,
  fontSize: 18,
  color: "#64748b",
},

faultListScroll: {
  maxHeight: 490,
},

faultCategoryTitle: {
  marginTop: 10,
  marginBottom: 5,
  paddingHorizontal: 8,
  fontSize: 14,
  fontWeight: "bold",
  color: "#1d4ed8",
  textTransform: "uppercase",
},

faultRow: {
  minHeight: 52,
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 11,
  paddingVertical: 8,
  borderBottomWidth: 1,
  borderBottomColor: "#e5e7eb",
},

faultRowDescription: {
  fontSize: 16,
  color: "#1f2937",
  fontWeight: "600",
},

faultRowDevice: {
  marginTop: 2,
  fontSize: 12,
  color: "#94a3b8",
},

faultRowArrow: {
  marginLeft: 10,
  fontSize: 25,
  color: "#94a3b8",
},

faultEmptyText: {
  paddingVertical: 35,
  textAlign: "center",
  fontSize: 15,
  color: "#64748b",
},

addFaultButton: {
  marginTop: 12,
  paddingVertical: 13,
  borderRadius: 10,
  backgroundColor: "#047857",
  alignItems: "center",
},

priceListButton: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  marginTop: -12,
  marginBottom: 16,
  paddingVertical: 8,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: "#99f6e4",
  backgroundColor: "#f0fdfa",
},
priceListButtonText: {
  color: "#0d9488",
  fontWeight: "700",
  fontSize: 13,
},

addFaultButtonText: {
  fontSize: 16,
  fontWeight: "bold",
  color: "#ffffff",
},

newFaultModalBox: {
  width: "100%",
  maxWidth: 560,
  backgroundColor: "#ffffff",
  borderRadius: 16,
  padding: 18,
},

newFaultTitle: {
  fontSize: 22,
  fontWeight: "bold",
  color: "#1f2937",
},

newFaultDevice: {
  marginTop: 5,
  marginBottom: 15,
  fontSize: 14,
  color: "#64748b",
},

newFaultLabel: {
  marginTop: 10,
  marginBottom: 6,
  fontSize: 14,
  fontWeight: "700",
  color: "#374151",
},

newFaultInput: {
  minHeight: 48,
  borderWidth: 1,
  borderColor: "#94a3b8",
  borderRadius: 10,
  backgroundColor: "#f8fafc",
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  color: "#111827",
  textAlignVertical: "top",
},

newFaultActions: {
  flexDirection: "row",
  gap: 10,
  marginTop: 20,
},

newFaultCancelButton: {
  flex: 1,
  paddingVertical: 13,
  borderWidth: 1,
  borderColor: "#94a3b8",
  borderRadius: 10,
  alignItems: "center",
},

newFaultCancelButtonText: {
  color: "#475569",
  fontSize: 16,
  fontWeight: "700",
},

newFaultSaveButton: {
  flex: 1,
  paddingVertical: 13,
  borderRadius: 10,
  backgroundColor: "#047857",
  alignItems: "center",
},

newFaultSaveButtonText: {
  color: "#ffffff",
  fontSize: 16,
  fontWeight: "bold",
},
repairProposalBox: {
  width: "90%",
  alignSelf: "center",
  marginTop: 8,
  marginBottom: 14,
  padding: 12,
  borderWidth: 1,
  borderColor: "#94a3b8",
  borderRadius: 12,
  backgroundColor: "#f8fafc",
},

repairProposalToggleRow: {
  flexDirection: "row",
  alignItems: "center",
},

repairProposalCheckbox: {
  width: 27,
  height: 27,
  borderWidth: 2,
  borderColor: "#047857",
  borderRadius: 6,
  justifyContent: "center",
  alignItems: "center",
  marginRight: 11,
  backgroundColor: "#ffffff",
},

repairProposalToggleTitle: {
  fontSize: 16,
  fontWeight: "bold",
  color: "#1f2937",
},

repairProposalToggleHelp: {
  marginTop: 3,
  fontSize: 12,
  lineHeight: 17,
  color: "#64748b",
},

repairProposalContent: {
  marginTop: 14,
  paddingTop: 10,
  borderTopWidth: 1,
  borderTopColor: "#cbd5e1",
},

repairProposalTextInput: {
  minHeight: 75,
},

repairProposalCommentInput: {
  minHeight: 70,
},

repairProposalAcceptedBox: {
  marginTop: 8,
  padding: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "#86efac",
  backgroundColor: "#dcfce7",
},

repairProposalAcceptedText: {
  color: "#166534",
  fontSize: 14,
  fontWeight: "700",
  textAlign: "center",
},

repairProposalPendingBox: {
  marginTop: 8,
  padding: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "#fcd34d",
  backgroundColor: "#fef3c7",
},

repairProposalPendingText: {
  color: "#92400e",
  fontSize: 14,
  fontWeight: "700",
  textAlign: "center",
},

repairProposalRefusedBox: {
  marginTop: 8,
  padding: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "#fca5a5",
  backgroundColor: "#fee2e2",
},

repairProposalRefusedText: {
  color: "#991b1b",
  fontSize: 14,
  fontWeight: "700",
  textAlign: "center",
},
});