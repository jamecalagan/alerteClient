import React, { useState, useRef } from "react";
import SmartImage from "../components/SmartImage";
import {
  View,
  Text,
  Alert,
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
// Helper pour obtenir une URI exploitable par <Image>
// À placer une seule fois en haut du fichier
// Helper unique : accepte string OU objet {url|path|uri}, JSON stringifié, etc.
// Remplace TOTALEMENT ta version par celle-ci
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

    // garde le chemin avant un éventuel ?token (au cas où tu veux forcer un nouveau token)
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
      } catch {}
    }
  }
  if (typeof raw === "object") {
    return cleanRef(raw.url || raw.path || raw.uri || "");
  }
  // string simple : retirer guillemets + antislashs finaux
  const stripQuotes = (s) =>
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")))
      ? s.slice(1, -1)
      : s;
  return stripQuotes(String(raw)).trim().replace(/\\+$/g, "");
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

const toSignatureUri = (s) => {
  if (!s || typeof s !== "string") return null;
  if (s.startsWith("data:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return s.length > 50 ? `data:image/png;base64,${s}` : null;
};
const reprintIntervention = async (interventionId, navigation) => {
  try {
    const { data, error } = await supabase
      .from("interventions")
      .select(
        `
        id, client_id,
        deviceType, brand, model, reference, description,
        guarantee, receiver_name, signature,
        client:client_id ( name, ficheNumber, phone, email )
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
      description: data.description || "", // ta PrintPage l’utilise aussi
    };

    navigation.navigate("PrintPage", {
      clientInfo,
      receiverName: data.receiver_name || clientInfo.name || "",
      guaranteeText: data.guarantee || "",
      signature: toSignatureUri(data.signature),
      productInfo,
      description: data.description || "",
    });
  } catch (e) {
    console.log("Réimpression — erreur:", e);
    Alert.alert(
      "Erreur",
      e?.message || "Impossible de préparer la réimpression."
    );
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
  const pageSize = 6;
  const [expandedCards, setExpandedCards] = useState({});
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
const bucketKey = (input) => {
  if (!input) return "";
  let s = String(input).trim();
  const q = s.indexOf("?");
  if (q > -1) s = s.slice(0, q);
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign)\/images\/(.+)$/i);
  if (m && m[1]) return m[1];
  if (s.startsWith("images/")) return s.slice(7);
  return s;
};
const sameImage = (a, b) => {
  const A = bucketKey(a);
  const B = bucketKey(b);
  return !!A && !!B && A === B;
};

const loadRecoveredClients = async () => {
  try {
    const { data: interventions, error: interventionsError } = await supabase
      .from("interventions")
      .select(`
        *,
        clients (name, ficheNumber, phone)
      `)
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
      const labelCandidates = explodeRefs(it.label_photo);   // ← réutilise ta explodeRefs déjà définie
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
        const k = bucketKey(u);
        if (k && !seen.has(k)) {
          seen.add(k);
          dedup.push(u);
        }
      }

      // enlever l'étiquette des extras
      const extras = dedup.filter((u) => !sameImage(u, labelUri));

      return {
        ...it,
        _labelUri: labelUri || null,
        _extraUris: extras, // ← ton rendu lit ça
      };
    });

    // DEBUG utile (premières lignes)
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
    console.error("Erreur lors du chargement des clients récupérés :", error);
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

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  const scrollToCard = (index) => {
    if (flatListRef.current && typeof index === "number") {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
      });
    } else {
      console.error("scrollToCard : index invalide ou FlatList non disponible");
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

  const handleScrollError = (info) => {
    console.warn("Scroll error:", info);
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

  const toggleDetails = (id) => {
    setExpandedCards((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };
  const handleLabelClick = (e, labelPhotoUri) => {
    e.stopPropagation();
    setSelectedImage(labelPhotoUri);
  };
  const deleteIntervention = async (id) => {
    Alert.alert(
      "Confirmation",
      "Es-tu sûr de vouloir supprimer cette intervention ?",
      [
        {
          text: "Annuler",
          style: "cancel",
        },
        {
          text: "Supprimer",
          onPress: async () => {
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
          },
          style: "destructive",
        },
      ]
    );
  };
  return (
    <View style={{ flex: 1, backgroundColor: "#e0e0e0" }}>
      <View style={styles.overlay}>
        <Text style={styles.title}>Clients ayant récupéré le matériel</Text>

        <TextInput
          style={styles.searchBar}
          placeholder="Rechercher par nom ou téléphone"
          placeholderTextColor="#242424"
          value={searchQuery}
          onChangeText={handleSearch}
        />

        <FlatList
          ref={flatListRef}
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
          renderItem={({ item, index }) => (
            <Animatable.View
              animation="zoomIn"
              duration={400}
              delay={index * 150}
              style={[
                styles.card,
                index % 2 === 0 ? styles.cardEven : styles.cardOdd,
              ]}
            >
              <View>
                <View style={styles.cardHeader}>
                  <TouchableOpacity
                    onPress={() => toggleCardExpansion(item.id, index)}
                    activeOpacity={0.9}
                    style={{ flex: 1 }}
                  >
                    <Text style={styles.clientInfo}>
                      Fiche Client N°: {item.clients.ficheNumber}
                    </Text>
                    <Text style={styles.clientInfo}>
                      Nom: {item.clients.name}
                    </Text>
                    <Text style={styles.clientInfo}>
                      Téléphone:{" "}
                      {item.clients.phone.replace(/(\d{2})(?=\d)/g, "$1 ")}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.imageStack}>
                    <Image
                      source={getDeviceIcon(item.deviceType)}
                      style={styles.deviceIcon}
                    />

                    {item._labelUri && (
                      <TouchableOpacity
                        onPress={() => setSelectedImage(item._labelUri)}
                      >
                        <SmartImage
                          uri={item._labelUri}
                          ficheNumber={item.clients?.ficheNumber}
                          interventionId={item.id}
                          type="label"
                          size={50}
                          borderRadius={4}
                          borderWidth={2}
                          badge
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {expandedCards[item.id] && (
                  <>
                    <Text style={styles.interventionInfo}>
                      Type d'appareil: {item.deviceType}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Marque: {item.brand}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Modèle: {item.model}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Référence: {item.reference}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Description du problème: {item.description}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Coût: {item.cost} €
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Date de récupération:{" "}
                      {new Date(item.updatedAt).toLocaleDateString("fr-FR")}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Détail de l'intervention: {item.detailIntervention}
                    </Text>
                    {item.receiver_name && (
                      <Text style={styles.receiverText}>
                        Récupéré par : {item.receiver_name}
                      </Text>
                    )}
                    <Text style={styles.interventionInfo}>
                      Remarques: {item.remarks}
                    </Text>
                    <Text style={styles.interventionInfo}>
                      Statut du règlement: {item.paymentStatus}
                    </Text>
                    {item.status === "Récupéré" && (
                      <TouchableOpacity
                        onPress={() => reprintIntervention(item.id, navigation)}
                        style={{
                          marginTop: 8,
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          backgroundColor: "#191f2f",
                          borderWidth: 1,
                          borderColor: "#888787",
                          alignSelf: "flex-start",
                        }}
                      >
                        <Text style={{ color: "white" }}>
                          Réimprimer la restitution (A5)
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate("InterventionImages", {
                          interventionId: item.id,
                        })
                      }
                      style={{
                        marginTop: 8,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: "#191f2f",
                        borderWidth: 1,
                        borderColor: "#888787",
                        alignSelf: "flex-start",
                      }}
                    >
                      <Text style={{ color: "white" }}>
                        Voir toutes les images
                      </Text>
                    </TouchableOpacity>

<View style={styles.imageContainer}>
  {item._extraUris && item._extraUris.length > 0 ? (
    item._extraUris.map((uri, idx) => (
      <TouchableOpacity
        key={`${item.id}-${uri}`}          // force un remount par URL réelle
        onPress={() => setSelectedImage(uri)}
        style={{ margin: 5 }}
      >
        <Image
          source={{ uri }}                 // on passe l’URL finale telle quelle
          style={{ width: 80, height: 80, borderRadius: 5 }}
          onError={(e) => {
            console.warn('thumb load error', uri, e?.nativeEvent?.error);
          }}
        />
      </TouchableOpacity>
    ))
  ) : (
    <Text style={styles.interventionInfo}>Pas d'images supplémentaires</Text>
  )}
</View>

                  </>
                )}
              </View>
            </Animatable.View>
          )}
        />

        <View style={styles.paginationContainer}>
          <TouchableOpacity
            onPress={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            style={styles.chevronButton}
          >
            <Image
              source={require("../assets/icons/chevrong.png")} // Icône pour chevron gauche
              style={[
                styles.chevronIcon,
                {
                  tintColor: currentPage === 1 ? "gray" : "white",
                },
              ]}
            />
          </TouchableOpacity>

          <Text style={styles.paginationText}>
            Page {currentPage} sur {totalPages}
          </Text>

          <TouchableOpacity
            onPress={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={styles.chevronButton}
          >
            <Image
              source={require("../assets/icons/chevrond.png")}
              style={[
                styles.chevronIcon,
                {
                  tintColor: currentPage === totalPages ? "gray" : "white",
                },
              ]}
            />
          </TouchableOpacity>
        </View>
      </View>
      <BottomNavigation navigation={navigation} currentRoute={route.name} />
      <Modal
        visible={!!selectedImage}
        transparent
        onRequestClose={() => setSelectedImage(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
          <View style={styles.modalBackground}>
            {selectedImage ? (
              <Image
                source={{ uri: selectedImage }}
                style={styles.fullImage}
                onError={() => {
                  Alert.alert("Erreur", "Impossible de charger l’image.");
                  setSelectedImage(null);
                }}
              />
            ) : null}
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0)",
    padding: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "medium",
    marginBottom: 20,
    textAlign: "center",
    color: "#242424",
  },
  searchBar: {
    backgroundColor: "#f3f3f3",
    padding: 10,
    borderRadius: 10,

    marginBottom: 20,
    fontSize: 16,
    color: "#242424",
  },
  card: {
    backgroundColor: "#f0f0f0",
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
  },
  deviceIcon: {
    position: "absolute",
    top: 15,
    width: 40,
    height: 40,
    resizeMode: "contain",
    tintColor: "#888787",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },

  iconContainer: {
    justifyContent: "center",
    alignItems: "flex-end",
    flex: 0,
    marginLeft: 10,
  },

  clientInfo: {
    fontSize: 16,
    marginBottom: 5,
    color: "#242424",
  },
  interventionInfo: {
    fontSize: 14,
    color: "#242424",
    marginBottom: 5,
  },

  icon: {
    marginRight: 10,
  },
  signatureImage: {
    backgroundColor: "#fcfcfc",
    width: "95%",
    height: 300,
    marginTop: 10,
    marginLeft: 20,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: "#888787",
  },
  imageContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
  imageThumbnail: {
    width: 80,
    height: 80,
    margin: 5,
    borderRadius: 5,
    resizeMode: "cover",
  },
  newImageThumbnail: {
    borderWidth: 2,
    borderColor: "blue",
  },
  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  fullImage: {
    width: "90%",
    height: "90%",
    resizeMode: "contain",
  },
  receiverText: {
    fontSize: 18,
    color: "#ff9100",
    marginTop: 5,
  },
  labelImage: {
    borderWidth: 2,
    borderColor: "green",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 10,
    marginBottom: 60,
  },
  chevronButton: {
    padding: 5,
  },
  chevronIcon: {
    width: 22,
    height: 22,
  },
  paginationText: {
    marginHorizontal: 10,
    color: "#242424",
    fontSize: 20,
  },

  rightIconWrapper: {
    position: "absolute",
    right: 15,
    top: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  labelThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "green",
    resizeMode: "cover",
  },

  deviceIcon: {
    width: 40,
    height: 40,
    resizeMode: "contain",
    tintColor: "#888787",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  imageStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toggleButton: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    padding: 10,
    backgroundColor: "#191f2f",
    borderWidth: 1,
    borderColor: "#929090",
    borderRadius: 5,
    elevation: 5,
  },
  toggleButtonText: {
    color: "#888787",
    fontWeight: "bold",
    marginLeft: 10,
  },
  icon: {
    marginRight: 10,
  },
});
