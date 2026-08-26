import React, { useState, useRef } from "react";
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
import BottomNavigation from "../components/BottomNavigation";
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
const reprintIntervention = async (interventionId, navigation, onError) => {
  try {
    const { data, error } = await supabase
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
    };

    // Signature de restitution (colonne dédiée) en priorité ; à défaut, anciennes
    // fiches restituées avant la séparation dépôt/restitution (signatureIntervention)
    const dbSignature = data.signature || data.signatureIntervention || null;
    const sigForRoute = toSignatureUri(dbSignature);

    console.log(
      "🔎 reprintIntervention signature (début) :",
      sigForRoute ? sigForRoute.slice(0, 60) : "null"
    );

    navigation.navigate("PrintPage", {
      clientInfo,
      receiverName: data.receiver_name || clientInfo.name || "",
      guaranteeText: data.guarantee || "",
      signature: sigForRoute,
      productInfo,
      description: data.description || "",
    });
  } catch (e) {
    console.log("Réimpression — erreur:", e);
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
  const [expandedCards, setExpandedCards] = useState({});
  const [interventionIdToDelete, setInterventionIdToDelete] = useState(null);
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
        .select("intervention_id, image_data");

      if (imagesError) throw imagesError;

      // 1) Joindre la table intervention_images
      const combined = (interventions || []).map((it) => ({
        ...it,
        intervention_images: (images || [])
          .filter((img) => img.intervention_id === it.id)
          .map((img) => img.image_data),
      }));

      // 2) Normaliser : label + fusion anciennes/nouvelles + dédoublonnage
      const normalized = combined.map((it) => {
        const labelCandidates = explodeRefs(it.label_photo);
        const labelUri = resolveImageUri(labelCandidates[0] || null);

        // anciennes (champ `photos`) → enlever \\ fin
        const oldList = explodeRefs(it.photos).map(stripEndBackslashes);
        // nouvelles (table)
        const newList = explodeRefs(it.intervention_images);

        // convertir en URI affichables
        const oldUris = oldList.map(resolveImageUri).filter(Boolean);
        const newUris = newList.map(resolveImageUri).filter(Boolean);

        // fusion + dédoublonnage via clé bucket
        const merged = [...oldUris, ...newUris];
        const seen = new Set();
        const dedup = [];
        for (const u of merged) {
          const k = bucketKeyLocal(u);
          if (k && !seen.has(k)) {
            seen.add(k);
            dedup.push(u);
          }
        }

        // enlever l'étiquette des extras
        const extras = dedup.filter((u) => !sameImageLocal(u, labelUri));

        return {
          ...it,
          _labelUri: labelUri || null,
          _extraUris: extras,
        };
      });

      console.log(
        "✅ Normalized sample:",
        normalized.slice(0, 5).map((x) => ({
          id: x.id,
          label: !!x._labelUri,
          extras: x._extraUris.length,
        }))
      );

      setRecoveredClients(normalized);
      setFilteredClients(normalized);
    } catch (error) {
      console.error(
        "Erreur lors du chargement des clients récupérés :",
        error
      );
    }
  };

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
                    <View style={styles.infoCell}>
                      <Text style={styles.infoLabel}>Type</Text>
                      <Text style={styles.infoValue}>
                        {item.deviceType || "—"}
                      </Text>
                    </View>
                    <View style={styles.infoCell}>
                      <Text style={styles.infoLabel}>Marque</Text>
                      <Text style={styles.infoValue}>{item.brand || "—"}</Text>
                    </View>
                    <View style={styles.infoCell}>
                      <Text style={styles.infoLabel}>Modèle</Text>
                      <Text style={styles.infoValue}>{item.model || "—"}</Text>
                    </View>
                    <View style={styles.infoCell}>
                      <Text style={styles.infoLabel}>Coût</Text>
                      <Text style={styles.infoValue}>{item.cost} €</Text>
                    </View>
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
                  </View>

                  <View style={styles.imageContainer}>
                    {item._extraUris && item._extraUris.length > 0 ? (
                      item._extraUris.map((uri) => (
                        <TouchableOpacity
                          key={`${item.id}-${uri}`}
                          onPress={() => setSelectedImage(uri)}
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
                      ))
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

      <BottomNavigation navigation={navigation} currentRoute={route.name} />

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
