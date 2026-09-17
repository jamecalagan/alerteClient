import React, { useState, useRef, useEffect, useCallback } from "react";
import SmartImage from "../components/SmartImage";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ImageBackground,
  TextInput,
  Modal,
  TouchableWithoutFeedback,
} from "react-native";
import { supabase } from "../supabaseClient";
import Icon from "react-native-vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import * as Animatable from "react-native-animatable";
import BottomMenu from "../components/BottomMenu";
import AlertBox from "../components/AlertBox";
import CustomAlert from "../components/CustomAlert";

// Helper pour obtenir une URI exploitable par <Image>
const stripQuotes = (s) =>
  typeof s === "string" &&
  s.length >= 2 &&
  ((s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")))
    ? s.slice(1, -1)
    : s;

const tidy = (s) => {
  if (!s) return "";
  let out = stripQuotes(String(s)).trim();
  // supprime les antislashs de fin ...jpg\\ -> ...jpg
  out = out.replace(/\\+$/g, "");
  return out;
};

// -> toujours une URI exploitable par <Image>
const resolveImageUri = (input) => {
  if (!input) return null;

  // 1) si objet, essaye url > publicUrl > uri > path
  if (typeof input === "object") {
    const cand =
      input.url ||
      input.publicUrl ||
      input.uri ||
      input.path ||
      input.key ||
      "";
    const s = tidy(cand);

    // si déjà http(s)/file/content/data -> ok
    if (/^(https?:|file:|content:|data:)/i.test(s)) return s;

    // sinon c'est un chemin bucket relatif: "images/..." ou "supplementaires/..."
    const pathInBucket = s.startsWith("images/") ? s.slice(7) : s;
    const { data } = supabase.storage.from("images").getPublicUrl(pathInBucket);
    return data?.publicUrl || null;
  }

  // 2) si string
  if (typeof input === "string") {
    let s = tidy(input);

    // si déjà exploitable
    if (/^(https?:|file:|content:|data:)/i.test(s)) return s;

    // si on a "images/..." -> enlève le préfixe bucket
    const pathInBucket = s.startsWith("images/") ? s.slice(7) : s;

    // garde le chemin avant un éventuel ?token
    const q = pathInBucket.indexOf("?");
    const key = q > -1 ? pathInBucket.slice(0, q) : pathInBucket;

    const { data } = supabase.storage.from("images").getPublicUrl(key);
    return data?.publicUrl || null;
  }

  return null;
};

// Normalise une référence image → string “propre”
const cleanRef = (raw) => {
  if (!raw) return "";
  // si string JSON → parse puis re-extrait
  if (typeof raw === "string") {
    const t = raw.trim();
    if (
      (t.startsWith("{") && t.endsWith("}")) ||
      (t.startsWith("[") && t.endsWith("]"))
    ) {
      try {
        const obj = JSON.parse(t);
        return cleanRef(obj);
      } catch { /* pas du JSON valide, ignoré */ }
    }
  }
  if (typeof raw === "object") {
    return cleanRef(raw.url || raw.path || raw.uri || "");
  }
  // string simple : retirer guillemets + antislashs finaux
  const stripQuotesInner = (s) =>
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")))
      ? s.slice(1, -1)
      : s;
  return stripQuotesInner(String(raw)).trim().replace(/\\+$/g, "");
};

// Convertit le champ photos → array de strings propres
const normalizePhotosField = (photos) => {
  if (!photos) return [];
  if (Array.isArray(photos)) return photos.map(cleanRef).filter(Boolean);
  if (typeof photos === "string") {
    const s = photos.trim();
    if (s.startsWith("[") && s.endsWith("]")) {
      try {
        const arr = JSON.parse(s);
        return Array.isArray(arr) ? arr.map(cleanRef).filter(Boolean) : [];
      } catch {
        /* tombe en brut */
      }
    }
    const one = cleanRef(s);
    return one ? [one] : [];
  }
  // objet isolé
  return [cleanRef(photos)].filter(Boolean);
};

// retire ?token et le domaine -> clé bucket stable (ex: "supplementaires/<id>/<file>.jpg")
const bucketKey = (input) => {
  if (!input) return "";
  let s = String(input).trim();
  const q = s.indexOf("?");
  if (q > -1) s = s.slice(0, q);
  // enlève le début d'une URL publique jusqu'à "/images/"
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign)\/images\/(.+)$/i);
  if (m && m[1]) return m[1];
  // enlève un éventuel préfixe "images/"
  if (s.startsWith("images/")) return s.slice(7);
  return s;
};

const sameImage = (a, b) => {
  const A = bucketKey(a);
  const B = bucketKey(b);
  return !!A && !!B && A === B;
};

const normalizeOrderText = (value) =>
  (value ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// Commandes réellement rattachées à une intervention : lien direct via
// orders.intervention_id, sinon repli par rapprochement de nom de produit
// avec interventions.commande (comportement historique), une seule retenue.
const findLinkedOrders = (intervention, clientOrders) => {
  const direct = clientOrders.filter(
    (o) => o.intervention_id === intervention.id
  );
  if (direct.length > 0) return direct;

  const currentCommande = normalizeOrderText(intervention.commande);
  if (!currentCommande) return [];

  const matching = clientOrders
    .filter((o) => normalizeOrderText(o.product) === currentCommande)
    .sort(
      (a, b) => new Date(b.createdat || 0).getTime() - new Date(a.createdat || 0).getTime()
    );

  return matching.length > 0 ? [matching[0]] : [];
};

// Transforme éventuellement du base64 brut en data:image/...
const toSignatureUri = (s) => {
  if (!s || typeof s !== "string") return null;
  if (s.startsWith("data:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  // si c'est un long base64 brut
  return s.length > 50 ? `data:image/png;base64,${s}` : null;
};

/**
 * Réimpression d'une intervention "Récupéré"
 * -> charge l'intervention + client
 * -> envoie la signature vers PrintPage
 */
const REPRINT_TIMEOUT_MS = 10000;

const reprintIntervention = async (interventionId, navigation, onError) => {
  try {
    const fetchPromise = supabase
      .from("interventions")
      .select(
        `
        id,
        client_id,
        deviceType,
        brand,
        model,
        reference,
        description,
        repair_action,
        guarantee,
        receiver_name,
        signature,
        signatureIntervention,
        client:client_id (
          name,
          ficheNumber,
          phone,
          email
        )
      `
      )
      .eq("id", interventionId)
      .single();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Délai dépassé, réessaie.")),
        REPRINT_TIMEOUT_MS
      )
    );

    const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

    if (error || !data) throw error || new Error("Intervention introuvable.");

    const clientInfo = {
      name: data.client?.name || "",
      ficheNumber: data.client?.ficheNumber ?? "",
      phone: data.client?.phone || "",
      email: data.client?.email || "",
    };

    const productInfo = {
      deviceType: data.deviceType || "",
      brand: data.brand || "",
      model: data.model || "",
      reference: data.reference || "",
      description: data.description || "",
      repairAction: data.repair_action || "",
    };

    // Signature de restitution (colonne dédiée) en priorité ; à défaut, anciennes
    // fiches restituées avant la séparation dépôt/restitution (signatureIntervention)
    const dbSignature = data.signature || data.signatureIntervention || null;
    const sigForRoute = toSignatureUri(dbSignature);

    navigation.navigate("PrintPage", {
      clientInfo,
      receiverName: data.receiver_name || clientInfo.name || "",
      guaranteeText: data.guarantee || "",
      signature: sigForRoute,
      productInfo,
      description: data.description || "",
    });
  } catch (e) {
    console.error("Réimpression — erreur:", e);
    if (onError) {
      onError(e?.message || "Impossible de préparer la réimpression.");
    }
  }
};


export default function RecoveredClientsPage({ navigation, route }) {
  const flatListRef = useRef(null);
  const [recoveredClients, setRecoveredClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleSignatures, setVisibleSignatures] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 9;
  const [pageImagesLoaded, setPageImagesLoaded] = useState({}); // { [interventionId]: true }
  const oldImagesFilesRef = useRef(null); // cache partagé, null = pas encore chargé
  const [expandedCards, setExpandedCards] = useState({});
  const [interventionIdToDelete, setInterventionIdToDelete] = useState(null);
  const [extraImageToDelete, setExtraImageToDelete] = useState(null); // { interventionId, uri }
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  // --- HELPERS NORMALISATION ---
  const stripEndBackslashes = (s) =>
    typeof s === "string" ? s.replace(/\\+$/g, "") : s;

  // Déplie n'importe quel input (string, JSON stringifié, objet, array) → array plat
  const explodeRefs = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input.flatMap(explodeRefs);
    if (typeof input === "string") {
      const t = input.trim();
      if (
        (t.startsWith("[") && t.endsWith("]")) ||
        (t.startsWith("{") && t.endsWith("}"))
      ) {
        try {
          const parsed = JSON.parse(t);
          return explodeRefs(parsed);
        } catch {
          return [t];
        }
      }
      return [t];
    }
    if (typeof input === "object") return [input]; // {url|path|uri...}
    return [];
  };

  // retire ?token + domaine → clé bucket stable
  const bucketKeyLocal = (input) => {
    if (!input) return "";
    let s = String(input).trim();
    const q = s.indexOf("?");
    if (q > -1) s = s.slice(0, q);
    const m = s.match(
      /\/storage\/v1\/object\/(?:public|sign)\/images\/(.+)$/i
    );
    if (m && m[1]) return m[1];
    if (s.startsWith("images/")) return s.slice(7);
    return s;
  };
  const sameImageLocal = (a, b) => {
    const A = bucketKeyLocal(a);
    const B = bucketKeyLocal(b);
    return !!A && !!B && A === B;
  };

  // Fichiers stockés directement dans le bucket (dossier <folder>/<interventionId>)
  // sans forcément avoir de ligne correspondante en base.
  const listFolderUris = async (folder, interventionId) => {
    try {
      const prefix = `${folder}/${interventionId}`;
      const { data: files, error } = await supabase.storage
        .from("images")
        .list(prefix, { limit: 100, offset: 0 });
      if (error || !Array.isArray(files)) return [];
      return files
        .filter((f) => f?.name)
        .map((f) => resolveImageUri(`${prefix}/${f.name}`))
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  // Ancienne convention : fichiers stockés à plat dans old_images/, nommés
  // "<ficheNumber>_<nom>_<interventionId>_<timestamp>.jpg" (pas de sous-dossier
  // par intervention). On liste une seule fois pour tout le monde.
  const listOldImagesFiles = async () => {
    try {
      const out = [];
      const LIMIT = 1000;
      let offset = 0;
      while (true) {
        const { data: files, error } = await supabase.storage
          .from("images")
          .list("old_images", { limit: LIMIT, offset });
        if (error || !files || files.length === 0) break;
        out.push(...files.filter((f) => f?.name));
        if (files.length < LIMIT) break;
        offset += LIMIT;
      }
      return out;
    } catch {
      return [];
    }
  };

  const dedupeUris = (list) => {
    const seen = new Set();
    const out = [];
    for (const u of list) {
      const k = bucketKeyLocal(u);
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push(u);
      }
    }
    return out;
  };

  // Chargement léger (aucun appel Storage) : DB uniquement, pour toutes les
  // fiches "Récupéré". Le scan Storage (photos non répertoriées en base) est
  // fait à la demande, uniquement pour la page actuellement affichée (voir
  // loadExtraImagesForPage), afin d'éviter une rafale de centaines de
  // requêtes réseau simultanées qui ralentissait toute l'appli (y compris
  // des écrans sans rapport comme la création de facture juste après).
  const loadRecoveredClients = async () => {
    try {
      const { data: interventions, error: interventionsError } = await supabase
        .from("interventions")
        .select(
          `
        *,
        clients (name, ficheNumber, phone)
      `
        )
        .eq("status", "Récupéré")
        .order("updatedAt", { ascending: false });

      if (interventionsError) throw interventionsError;

      const { data: images, error: imagesError } = await supabase
        .from("intervention_images")
        .select("intervention_id, image_data, file_path");

      if (imagesError) throw imagesError;

      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(
          "id, client_id, intervention_id, product, brand, model, price, quantity, total, paid, received, recovered, deleted, createdat"
        )
        .or("deleted.eq.false,deleted.is.null");

      if (ordersError) throw ordersError;

      const normalized = (interventions || []).map((it) => {
        const clientOrders = (orders || []).filter(
          (o) => o.client_id === it.client_id
        );
        const linkedOrders = findLinkedOrders(it, clientOrders);
        const orderCost = linkedOrders.reduce(
          (sum, o) => sum + Number(o.total ?? o.price ?? 0),
          0
        );

        const labelCandidates = explodeRefs(it.label_photo);
        const labelUri = resolveImageUri(labelCandidates[0] || null);

        // anciennes (champ `photos`) → enlever \\ fin
        const oldList = explodeRefs(it.photos).map(stripEndBackslashes);
        // nouvelles (table intervention_images)
        const newList = explodeRefs(
          (images || [])
            .filter((img) => img.intervention_id === it.id)
            .map((img) => img.image_data || img.file_path)
        );

        const oldUris = oldList.map(resolveImageUri).filter(Boolean);
        const newUris = newList.map(resolveImageUri).filter(Boolean);
        const dbUris = dedupeUris([...oldUris, ...newUris]);
        const extras = dbUris.filter((u) => !sameImageLocal(u, labelUri));

        return {
          ...it,
          _labelUri: labelUri || null,
          _extraUris: extras,
          _linkedOrders: linkedOrders,
          _orderCost: orderCost,
        };
      });

      setRecoveredClients(normalized);
      setFilteredClients(normalized);
      setPageImagesLoaded({});
      oldImagesFilesRef.current = null;
    } catch (error) {
      console.error(
        "Erreur lors du chargement des clients récupérés :",
        error
      );
    }
  };

  // Scan Storage (dossiers "supplementaires"/"intervention_images" + ancienne
  // convention "old_images/") pour retrouver d'éventuelles photos non
  // répertoriées en base — uniquement pour les fiches passées en paramètre
  // (la page actuellement affichée), et une seule fois par fiche.
  const loadExtraImagesForPage = useCallback(
    async (items) => {
      const pending = items.filter((it) => !pageImagesLoaded[it.id]);
      if (pending.length === 0) return;

      if (oldImagesFilesRef.current === null) {
        oldImagesFilesRef.current = await listOldImagesFiles();
      }
      const oldImagesFiles = oldImagesFilesRef.current;

      const updates = await Promise.all(
        pending.map(async (it) => {
          const [fromSupp, fromAlt] = await Promise.all([
            listFolderUris("supplementaires", it.id),
            listFolderUris("intervention_images", it.id),
          ]);

          const fromOldImages = oldImagesFiles
            .filter((f) => f.name.includes(it.id))
            .map((f) => resolveImageUri(`old_images/${f.name}`))
            .filter(Boolean);

          const merged = dedupeUris([
            ...(it._extraUris || []),
            ...fromSupp,
            ...fromAlt,
            ...fromOldImages,
          ]);
          const extras = merged.filter((u) => !sameImageLocal(u, it._labelUri));

          return { id: it.id, extras };
        })
      );

      setPageImagesLoaded((prev) => {
        const next = { ...prev };
        updates.forEach((u) => {
          next[u.id] = true;
        });
        return next;
      });

      const extrasMap = new Map(updates.map((u) => [u.id, u.extras]));
      const applyExtras = (list) =>
        list.map((it) =>
          extrasMap.has(it.id) ? { ...it, _extraUris: extrasMap.get(it.id) } : it
        );
      setRecoveredClients((prev) => applyExtras(prev));
      setFilteredClients((prev) => applyExtras(prev));
    },
    [pageImagesLoaded]
  );

  useFocusEffect(
    React.useCallback(() => {
      loadRecoveredClients();
    }, [])
  );

  const toggleSignatureVisibility = (id) => {
    setVisibleSignatures((prevState) => ({
      ...prevState,
      [id]: !prevState[id],
    }));
  };

  const handleSearch = (query) => {
    setSearchQuery(query);

    if (query.trim() === "") {
      setFilteredClients(recoveredClients);
    } else {
      const filtered = recoveredClients.filter((client) => {
        const clientName = client.clients?.name?.toLowerCase() || "";
        const clientPhone = client.clients?.phone
          ? client.clients.phone.toString()
          : "";

        return (
          clientName.includes(query.toLowerCase()) ||
          clientPhone.includes(query)
        );
      });

      setFilteredClients(filtered);
      setCurrentPage(1);
    }
  };

  const getPaginatedClients = () => {
    const data = filteredClients;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  };

  const totalPages = Math.ceil(filteredClients.length / pageSize);

  // Ne scanne le Storage que pour les fiches de la page actuellement
  // affichée (voir loadExtraImagesForPage), pas pour tout l'historique.
  useEffect(() => {
    const currentItems = getPaginatedClients();
    if (currentItems.length > 0) {
      loadExtraImagesForPage(currentItems);
    }
  }, [currentPage, filteredClients]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const scrollToCard = (index) => {
    if (flatListRef.current && typeof index === "number") {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
      });
    } else {
      console.error(
        "scrollToCard : index invalide ou FlatList non disponible"
      );
    }
  };

  const getDeviceIcon = (deviceType) => {
    switch (deviceType) {
      case "PC portable":
        return require("../assets/icons/portable.png");
      case "MacBook":
        return require("../assets/icons/macbook_air.png");
      case "iMac":
        return require("../assets/icons/iMac.png");
      case "PC Fixe":
        return require("../assets/icons/ordinateur (1).png");
      case "PC tout en un":
        return require("../assets/icons/allInone.png");
      case "Tablette":
        return require("../assets/icons/tablette.png");
      case "Smartphone":
        return require("../assets/icons/smartphone.png");
      case "Console":
        return require("../assets/icons/console-de-jeu.png");
      case "Disque dur":
        return require("../assets/icons/disk.png");
      case "Disque dur externe":
        return require("../assets/icons/disque-dur.png");
      case "Carte SD":
        return require("../assets/icons/carte-memoire.png");
      case "Cle usb":
        return require("../assets/icons/cle-usb.png");
      case "Casque audio":
        return require("../assets/icons/playaudio.png");
      case "Video-projecteur":
        return require("../assets/icons/Projector.png");
      case "Clavier":
        return require("../assets/icons/keyboard.png");
      case "Ecran":
        return require("../assets/icons/screen.png");
      case "iPAD":
        return require("../assets/icons/iPad.png");
      case "Imprimante":
        return require("../assets/icons/printer.png");
      case "Joystick":
        return require("../assets/icons/joystick.png");
      case "Processeur":
        return require("../assets/icons/Vga_card.png");
      case "Carte graphique":
        return require("../assets/icons/cpu.png");
      case "Manette":
        return require("../assets/icons/controller.png");
      case "Batterie":
        return require("../assets/icons/battery.png");
      case "Commande":
        return require("../assets/icons/shipping_box.png");
      case "Enceinte":
        return require("../assets/icons/speaker.png");
      case "PDA":
        return require("../assets/icons/Pda.png");
      default:
        return require("../assets/icons/point-dinterrogation.png");
    }
  };

  const toggleCardExpansion = (id, index) => {
    if (typeof index !== "number") {
      console.error(`Index non valide : ${index}`);
      return;
    }

    setExpandedCards((prevState) => ({
      ...prevState,
      [id]: !prevState[id],
    }));

    if (!expandedCards[id]) {
      scrollToCard(index);
    }
  };

  const handleLabelClick = (e, labelPhotoUri) => {
    e.stopPropagation();
    setSelectedImage(labelPhotoUri);
  };

  const deleteIntervention = (id) => {
    setInterventionIdToDelete(id);
  };

  const confirmDeleteIntervention = async () => {
    const id = interventionIdToDelete;
    setInterventionIdToDelete(null);
    try {
      const { error: imageError } = await supabase
        .from("intervention_images")
        .delete()
        .eq("intervention_id", id);

      const { error } = await supabase
        .from("interventions")
        .delete()
        .eq("id", id);

      if (error || imageError) {
        console.error("Erreur suppression :", error || imageError);
      } else {
        setRecoveredClients((prev) =>
          prev.filter((item) => item.id !== id)
        );
        setFilteredClients((prev) =>
          prev.filter((item) => item.id !== id)
        );
      }
    } catch (err) {
      console.error("Erreur lors de la suppression :", err);
    }
  };

  const confirmDeleteExtraImage = (interventionId, uri) => {
    setExtraImageToDelete({ interventionId, uri });
  };

  const handleDeleteExtraImage = async () => {
    const target = extraImageToDelete;
    setExtraImageToDelete(null);
    if (!target) return;
    const { interventionId, uri } = target;

    try {
      const path = bucketKeyLocal(uri);
      if (path) {
        const { error: storageError } = await supabase.storage
          .from("images")
          .remove([path]);
        if (storageError) {
          console.error("Suppression Storage image :", storageError);
        }
      }

      // Retire la référence de l'ancien champ interventions.photos si présente
      const { data: row, error: readErr } = await supabase
        .from("interventions")
        .select("photos")
        .eq("id", interventionId)
        .single();
      if (readErr) throw readErr;

      const currentPhotos = normalizePhotosField(row?.photos);
      const nextPhotos = currentPhotos.filter(
        (p) => bucketKeyLocal(p) !== path
      );
      if (nextPhotos.length !== currentPhotos.length) {
        const { error: updateErr } = await supabase
          .from("interventions")
          .update({ photos: nextPhotos })
          .eq("id", interventionId);
        if (updateErr) throw updateErr;
      }

      // Retire les lignes intervention_images correspondant au même fichier
      const { data: imgRows, error: imgReadErr } = await supabase
        .from("intervention_images")
        .select("id, image_data, file_path")
        .eq("intervention_id", interventionId);
      if (imgReadErr) throw imgReadErr;

      const matchingIds = (imgRows || [])
        .filter((r) => bucketKeyLocal(r.image_data || r.file_path) === path)
        .map((r) => r.id);

      if (matchingIds.length > 0) {
        const { error: delErr } = await supabase
          .from("intervention_images")
          .delete()
          .in("id", matchingIds);
        if (delErr) throw delErr;
      }

      const stripUri = (list) =>
        (list || []).filter((u) => u !== uri);

      setRecoveredClients((prev) =>
        prev.map((it) =>
          it.id === interventionId
            ? { ...it, _extraUris: stripUri(it._extraUris) }
            : it
        )
      );
      setFilteredClients((prev) =>
        prev.map((it) =>
          it.id === interventionId
            ? { ...it, _extraUris: stripUri(it._extraUris) }
            : it
        )
      );
    } catch (err) {
      console.error("Erreur suppression image :", err);
      showAlert("Erreur", "Impossible de supprimer cette image.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Clients ayant récupéré le matériel</Text>

        <View style={styles.searchWrap}>
          <Icon name="search" size={16} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchBar}
            placeholder="Rechercher par nom ou téléphone"
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={handleSearch}
          />
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        onScrollToIndexFailed={(info) => {
          console.warn("Échec du défilement :", info);

          if (flatListRef.current) {
            flatListRef.current.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }
        }}
        data={getPaginatedClients()}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          const isExpanded = !!expandedCards[item.id];
          return (
            <Animatable.View
              animation="fadeInUp"
              duration={350}
              delay={Math.min(index, 8) * 60}
              style={styles.card}
            >
              <TouchableOpacity
                onPress={() => toggleCardExpansion(item.id, index)}
                activeOpacity={0.9}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.ficheBadge}>
                      <Text style={styles.ficheBadgeText}>
                        N° {item.clients?.ficheNumber || "—"}
                      </Text>
                    </View>
                    <Text style={styles.clientName}>
                      {item.clients?.name || "Client inconnu"}
                    </Text>
                    <Text style={styles.clientPhone}>
                      {item.clients?.phone
                        ? item.clients.phone.replace(/(\d{2})(?=\d)/g, "$1 ")
                        : "Téléphone non disponible"}
                    </Text>
                  </View>

                  <View style={styles.imageStack}>
                    <View style={styles.deviceIconWrap}>
                      <Image
                        source={getDeviceIcon(item.deviceType)}
                        style={styles.deviceIcon}
                      />
                    </View>

                    {item._labelUri && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setSelectedImage(item._labelUri);
                        }}
                      >
                        <SmartImage
                          uri={item._labelUri}
                          ficheNumber={item.clients?.ficheNumber}
                          interventionId={item.id}
                          type="label"
                          size={50}
                          borderRadius={10}
                          borderWidth={2}
                          badge
                        />
                      </TouchableOpacity>
                    )}

                    <Icon
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color="#94a3b8"
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.detailBlock}>
                  <View style={styles.infoGrid}>
                    <View style={styles.infoCellThird}>
                      <Text style={styles.infoLabel}>Type</Text>
                      <Text style={styles.infoValue}>
                        {item.deviceType || "—"}
                      </Text>
                    </View>
                    <View style={styles.infoCellThird}>
                      <Text style={styles.infoLabel}>Marque</Text>
                      <Text style={styles.infoValue}>{item.brand || "—"}</Text>
                    </View>
                    <View style={styles.infoCellThird}>
                      <Text style={styles.infoLabel}>Modèle</Text>
                      <Text style={styles.infoValue}>{item.model || "—"}</Text>
                    </View>
                  </View>

                  <View style={styles.costBlock}>
                    <View style={[styles.costRow, styles.costRowIntervention]}>
                      <Text style={styles.costRowLabel}>Coût intervention</Text>
                      <Text style={styles.costRowValue}>{item.cost} €</Text>
                    </View>
                    {item._linkedOrders && item._linkedOrders.length > 0 && (
                      <View style={[styles.costRow, styles.costRowOrder]}>
                        <Text style={styles.costRowLabel}>Coût commande</Text>
                        <Text style={styles.costRowValue}>
                          {item._orderCost.toFixed(2)} €
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Référence</Text>
                    <Text style={styles.sectionValue}>
                      {item.reference || "—"}
                    </Text>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>
                      Description du problème
                    </Text>
                    <Text style={styles.sectionValue}>
                      {item.description || "—"}
                    </Text>
                  </View>

                  {item._linkedOrders && item._linkedOrders.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>
                        {item._linkedOrders.length > 1
                          ? "Commandes liées"
                          : "Commande liée"}
                      </Text>
                      {item._linkedOrders.map((order) => (
                        <View key={order.id} style={styles.orderLinkRow}>
                          <Text style={styles.sectionValue}>
                            {order.product || "—"}
                            {order.brand ? ` (${order.brand})` : ""} —{" "}
                            {Number(order.total ?? order.price ?? 0).toFixed(2)}{" "}
                            €
                          </Text>
                          <Text style={styles.orderLinkMeta}>
                            {order.received ? "Reçue" : "Non reçue"} ·{" "}
                            {order.recovered ? "Récupérée" : "Non récupérée"} ·{" "}
                            {order.paid ? "Payée" : "Non payée"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {item.detailIntervention && (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>
                        Détail de l'intervention
                      </Text>
                      <Text style={styles.sectionValue}>
                        {item.detailIntervention}
                      </Text>
                    </View>
                  )}

                  {item.remarks && (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Remarques</Text>
                      <Text style={styles.sectionValue}>{item.remarks}</Text>
                    </View>
                  )}

                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>
                      Récupéré le{" "}
                      {new Date(item.updatedAt).toLocaleDateString("fr-FR")}
                    </Text>
                    <Text style={styles.metaText}>
                      Règlement : {item.paymentStatus}
                    </Text>
                  </View>

                  {item.receiver_name && (
                    <Text style={styles.receiverText}>
                      Récupéré par : {item.receiver_name}
                    </Text>
                  )}

                  <View style={styles.buttonRow}>
                    {item.status === "Récupéré" && (
                      <TouchableOpacity
                        onPress={() =>
                          reprintIntervention(item.id, navigation, (msg) =>
                            showAlert("Erreur", msg)
                          )
                        }
                        style={styles.secondaryBtn}
                      >
                        <Icon name="print" size={14} color="#334155" />
                        <Text style={styles.secondaryBtnText}>
                          Réimprimer (A5)
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate("InterventionImages", {
                          interventionId: item.id,
                        })
                      }
                      style={styles.secondaryBtn}
                    >
                      <Icon name="picture-o" size={14} color="#334155" />
                      <Text style={styles.secondaryBtnText}>
                        Voir toutes les images
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate("BillingPage", {
                          expressData: {
                            name: item.clients?.name || "",
                            phone: item.clients?.phone || "",
                            client_address: "",
                            description: [
                              item.repair_action || item.description,
                              [item.deviceType, item.brand, item.model]
                                .filter(Boolean)
                                .join(" — "),
                            ]
                              .filter(Boolean)
                              .join("\n"),
                            quantity: "1",
                            price: item.cost != null ? String(item.cost) : "0",
                            serial: item.serial_number || "",
                            paymentmethod: "",
                            acompte:
                              item.partialPayment != null
                                ? String(item.partialPayment)
                                : "",
                            paid: item.paymentStatus === "solde",
                            intervention_id: item.id,
                            extraLines: (item._linkedOrders || []).map(
                              (order) => ({
                                designation: [order.product, order.brand]
                                  .filter(Boolean)
                                  .join(" — "),
                                quantity: order.quantity || 1,
                                price: Number(
                                  order.total ?? order.price ?? 0
                                ),
                                serial: "",
                              })
                            ),
                          },
                        })
                      }
                      style={styles.secondaryBtn}
                    >
                      <Icon name="file-text-o" size={14} color="#334155" />
                      <Text style={styles.secondaryBtnText}>
                        Créer une facture
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {item._extraUris && item._extraUris.length > 0 && (
                    <Text style={styles.deletePhotoHint}>
                      Appui long sur une image pour la supprimer
                    </Text>
                  )}
                  <View style={styles.imageContainer}>
                    {item._extraUris && item._extraUris.length > 0 ? (
                      item._extraUris.map((uri) => {
                        const isSignature =
                          !!item.signatureIntervention &&
                          sameImage(uri, item.signatureIntervention);
                        return (
                          <TouchableOpacity
                            key={`${item.id}-${uri}`}
                            onPress={() => setSelectedImage(uri)}
                            onLongPress={
                              isSignature
                                ? undefined
                                : () => confirmDeleteExtraImage(item.id, uri)
                            }
                            delayLongPress={350}
                          >
                            <Image
                              source={{ uri }}
                              style={styles.imageThumbnail}
                              onError={(e) => {
                                console.warn(
                                  "thumb load error",
                                  uri,
                                  e?.nativeEvent?.error
                                );
                              }}
                            />
                          </TouchableOpacity>
                        );
                      })
                    ) : (
                      <Text style={styles.sectionValue}>
                        Pas d'images supplémentaires
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </Animatable.View>
          );
        }}
      />

      <View style={styles.pager}>
        <TouchableOpacity
          style={[styles.pagerBtn, currentPage <= 1 && styles.pagerBtnDisabled]}
          disabled={currentPage <= 1}
          onPress={() => handlePageChange(currentPage - 1)}
        >
          <Image
            source={require("../assets/icons/chevrong.png")}
            style={[
              styles.pagerIcon,
              { tintColor: currentPage <= 1 ? "#cbd5e1" : "#4338ca" },
            ]}
          />
        </TouchableOpacity>

        <Text style={styles.pagerInfo}>
          Page {currentPage} / {totalPages || 1}
        </Text>

        <TouchableOpacity
          style={[
            styles.pagerBtn,
            currentPage >= totalPages && styles.pagerBtnDisabled,
          ]}
          disabled={currentPage >= totalPages}
          onPress={() => handlePageChange(currentPage + 1)}
        >
          <Image
            source={require("../assets/icons/chevrond.png")}
            style={[
              styles.pagerIcon,
              { tintColor: currentPage >= totalPages ? "#cbd5e1" : "#4338ca" },
            ]}
          />
        </TouchableOpacity>
      </View>

      <BottomMenu navigation={navigation} />

      <Modal
        visible={!!selectedImage}
        transparent
        onRequestClose={() => setSelectedImage(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
          <View style={styles.modalBackground}>
            <TouchableOpacity style={styles.imageCloseBtn} onPress={() => setSelectedImage(null)}>
              <Text style={styles.imageCloseBtnText}>✕</Text>
            </TouchableOpacity>
            {selectedImage ? (
              <Image
                source={{ uri: selectedImage }}
                style={styles.fullImage}
                onError={() => {
                  showAlert("Erreur", "Impossible de charger l'image.");
                  setSelectedImage(null);
                }}
              />
            ) : null}
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <AlertBox
        visible={!!interventionIdToDelete}
        title="Confirmation"
        message="Es-tu sûr de vouloir supprimer cette intervention ?"
        cancelText="Annuler"
        confirmText="Supprimer"
        onClose={() => setInterventionIdToDelete(null)}
        onConfirm={confirmDeleteIntervention}
      />

      <AlertBox
        visible={!!extraImageToDelete}
        title="Supprimer l'image"
        message="Supprimer définitivement cette image ?"
        cancelText="Annuler"
        confirmText="Supprimer"
        onClose={() => setExtraImageToDelete(null)}
        onConfirm={handleDeleteExtraImage}
      />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },

  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 12,
  },
  searchWrap: {
    position: "relative",
    justifyContent: "center",
  },
  searchIcon: {
    position: "absolute",
    left: 14,
    zIndex: 1,
  },
  searchBar: {
    backgroundColor: "#fff",
    paddingVertical: 11,
    paddingHorizontal: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 15,
    color: "#0f172a",
  },

  listContent: { paddingHorizontal: 16, paddingBottom: 90 },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ficheBadge: {
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  ficheBadgeText: {
    color: "#4338ca",
    fontWeight: "700",
    fontSize: 11,
  },
  clientName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  clientPhone: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },

  imageStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 10,
  },
  deviceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  deviceIcon: {
    width: 22,
    height: 22,
    resizeMode: "contain",
    tintColor: "#475569",
  },

  detailBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },

  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  infoCell: {
    width: "50%",
    marginBottom: 8,
  },
  infoCellThird: {
    width: "33%",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "600",
    marginTop: 2,
  },
  costBlock: {
    marginBottom: 10,
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  costRowIntervention: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
  },
  costRowOrder: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
  },
  costRowLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  costRowValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },

  section: { marginBottom: 10 },
  sectionLabel: {
    fontSize: 11,
    color: "#94a3b8",
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  sectionValue: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
  },
  orderLinkRow: { marginBottom: 6 },
  orderLinkMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  deletePhotoHint: {
    fontSize: 11,
    color: "#94a3b8",
    fontStyle: "italic",
    marginBottom: 4,
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 6,
  },
  metaText: {
    fontSize: 12,
    color: "#64748b",
  },
  receiverText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#b45309",
    marginBottom: 10,
  },

  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
    marginBottom: 10,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  secondaryBtnText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },

  imageContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  imageThumbnail: {
    width: 76,
    height: 76,
    borderRadius: 10,
  },

  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
    marginVertical: 10,
    marginBottom: 90,
  },
  pagerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  pagerBtnDisabled: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
  },
  pagerIcon: {
    width: 18,
    height: 18,
  },
  pagerInfo: {
    minWidth: 100,
    textAlign: "center",
    fontWeight: "700",
    color: "#333",
  },

  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
  },
  fullImage: {
    width: "90%",
    height: "90%",
    resizeMode: "contain",
    borderRadius: 16,
  },
  imageCloseBtn: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  imageCloseBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
