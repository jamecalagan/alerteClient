import React, { useState, useEffect } from "react";
import SmartImage from "../components/SmartImage";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
} from "react-native";
import { supabase } from "../supabaseClient";
import BottomNavigation from "../components/BottomNavigation";
// --------- Storage utils : liste → URLs publiques dédupliquées (plus récent d'abord) ---------
const listFolderPublicUrls = async (folder, interventionId) => {
  try {
    const listPath = `${folder}/${interventionId}`;
    const { data: files, error } = await supabase.storage
      .from("images")
      .list(listPath);

    if (error || !files || files.length === 0) return [];

    // Trier le plus récent d'abord (created_at si dispo, sinon par nom décroissant)
    const sorted = [...files].sort((a, b) => {
      const da = new Date(a.created_at || 0).getTime();
      const db = new Date(b.created_at || 0).getTime();
      if (da !== db) return db - da;
      return (b.name || "").localeCompare(a.name || "");
    });

    // Mapper → publicUrl
    const urls = sorted
      .map((f) => {
        const full = `${folder}/${interventionId}/${f.name}`;
        const { data: pub } = supabase.storage.from("images").getPublicUrl(full);
        return pub?.publicUrl || "";
      })
      .filter(Boolean);

    // Dédupliquer par clé bucket (ignore domaine + ?token)
    const seen = new Set();
    const out = [];
    for (const u of urls) {
      const k = bucketKey(u);
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push(u);
      }
    }
    return out;
  } catch {
    return [];
  }
};

// --------- Comparaison “même fichier” (ignore domaine + ?token) ---------
const sameBucketKey = (a, b) => {
  const key = (s) => {
    if (!s) return "";
    s = String(s);
    const q = s.indexOf("?");
    if (q > -1) s = s.slice(0, q);
    const m = s.match(/\/storage\/v1\/object\/(?:public|sign)\/images\/(.+)$/i);
    if (m && m[1]) return m[1];
    if (s.toLowerCase().startsWith("images/")) return s.slice(7);
    return s;
  };
  return !!a && !!b && key(a) === key(b);
};

// -------------------- Helpers image (UNIQUE) --------------------
// ——— Helpers nettoyage refs images ———
const stripQuotes = (s) =>
  s &&
  ((s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")))
    ? s.slice(1, -1)
    : s;

// On garde le ?token ici (utile si URL déjà signée/publique)
const cleanRefKeepToken = (raw) => {
  if (!raw) return "";
  let s =
    typeof raw === "string" ? raw : raw?.url || raw?.path || raw?.uri || "";
  s = String(s);
  // guillemets + espaces + antislash(s) de fin
  s = stripQuotes(s).trim().replace(/\\+$/g, "");
  return s; // ⚠️ on GARDE le ?token si présent
};

// Convertit le champ "photos" (array, string JSON, string brute) → array propre
const normalizePhotosField = (photos) => {
  if (Array.isArray(photos)) {
    return photos.map(cleanRefKeepToken).filter(Boolean);
  }
  if (typeof photos === "string") {
    const raw = photos.trim();
    // cas JSON array
    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr)
          ? arr.map(cleanRefKeepToken).filter(Boolean)
          : [];
      } catch {
        // retombera en “brut”
      }
    }
    // cas string brute → une seule ref
    const one = cleanRefKeepToken(raw);
    return one ? [one] : [];
  }
  return [];
};

// — comparer 2 refs en ignorant ?token et formats (url publique / signée / clé bucket)
const cleanRefNoToken = (raw) => {
  if (!raw) return "";
  let s =
    typeof raw === "string" ? raw : raw?.url || raw?.path || raw?.uri || "";
  s = String(s);
  s = stripQuotes(s).trim().replace(/\\+$/g, "");
  const q = s.indexOf("?");
  if (q > -1) s = s.slice(0, q);
  return s;
};

const bucketKey = (s) => {
  if (!s) return "";
  s = String(s);
  // extrait la partie après “…/images/”
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign)\/images\/(.+)$/i);
  if (m && m[1]) return m[1];
  if (s.toLowerCase().startsWith("images/")) return s.slice(7);
  return s; // déjà une clé relative du bucket (ex: "supplementaires/…")
};

const sameImage = (a, b) => {
  const A = bucketKey(cleanRefNoToken(a));
  const B = bucketKey(cleanRefNoToken(b));
  return !!A && !!B && A === B;
};



// ---------------------------------------------------------------

export default function ClientInterventionsPage({ route, navigation }) {
  const { clientId } = route.params;
  const [interventions, setInterventions] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // Charger le client courant
  useEffect(() => {
    const fetchClient = async () => {
      try {
        const { data: clientData, error } = await supabase
          .from("clients")
          .select("id, name, phone, ficheNumber")
          .eq("id", clientId)
          .single();

        if (error) throw error;
        setSelectedClient(clientData);
      } catch (e) {
        console.error("Erreur lors du chargement du client :", e);
      }
    };

    fetchClient();
  }, [clientId]);

  // Charger les interventions du client + nettoyer les refs
useEffect(() => {
  if (!selectedClient) return;

const fetchClientInterventions = async () => {
  try {
    const { data, error } = await supabase
      .from("interventions")
      .select("*, photos, label_photo")
      .eq("client_id", selectedClient.id)
      .order("createdAt", { ascending: false });

    if (error) throw error;

    const enriched = await Promise.all(
      (data || []).map(async (it) => {
        // 1) Nettoyage simple
        const labelFromDB = typeof it.label_photo === "string" ? it.label_photo.trim() : "";
        let photosFromDB = Array.isArray(it.photos)
          ? it.photos.filter(Boolean)
          : (typeof it.photos === "string" && it.photos.trim().startsWith("["))
              ? (JSON.parse(it.photos) || []).filter(Boolean)
              : [];

        // 2) Si la BDD est vide → on récupère du bucket (comme StoredImagesPage)
        let label = labelFromDB;
        if (!label) {
          const labels = await listFolderPublicUrls("etiquettes", it.id);
          label = labels[0] || "";
        }

        let photos = photosFromDB;
        if (!photos || photos.length === 0) {
          // Essaie d’abord "supplementaires", puis "intervention_images"
          const supp = await listFolderPublicUrls("supplementaires", it.id);
          const alt  = await listFolderPublicUrls("intervention_images", it.id);
          photos = [...supp, ...alt];
        }

        // 3) Évite le doublon “étiquette” dans les photos
        photos = photos.filter(u => !sameBucketKey(u, label));

        return { ...it, label_photo: label, photos };
      })
    );

    setInterventions(enriched);
  } catch (err) {
    console.error("Erreur lors du chargement des interventions :", err);
  }
};


  fetchClientInterventions();
}, [selectedClient]);



  // Charger la liste des clients (pour la recherche)
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const { data: clientData, error } = await supabase
          .from("clients")
          .select("id, name, phone");

        if (error) throw error;
        setClients(clientData || []);
      } catch (error) {
        console.error("Erreur lors du chargement des clients :", error);
      }
    };

    fetchClients();
  }, []);

  // Filtre de recherche
  const filteredClients =
    (clients || []).filter(
      (client) =>
        (client?.name || "")
          .toLowerCase()
          .includes((searchQuery || "").toLowerCase()) ||
        (client?.phone || "").includes(searchQuery || "")
    ) || [];

  const handleImagePress = (imageUri) => {
    setSelectedImage(imageUri);
  };

  const handleDeleteIntervention = async (interventionId) => {
    try {
      const { error } = await supabase
        .from("interventions")
        .delete()
        .eq("id", interventionId);

      if (error) {
        Alert.alert(
          "Erreur",
          "Une erreur est survenue lors de la suppression."
        );
        console.error("Erreur de suppression :", error);
        return;
      }

      Alert.alert("Succès", "L'intervention a été supprimée avec succès.");
      setInterventions((prev) =>
        prev.filter((intervention) => intervention.id !== interventionId)
      );
    } catch (err) {
      Alert.alert("Erreur", "Impossible de supprimer l'intervention.");
      console.error("Erreur :", err);
    }
  };

  const confirmDeleteIntervention = (interventionId) => {
    Alert.alert("Confirmation", "Supprimer cette intervention ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", onPress: () => handleDeleteIntervention(interventionId) },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Interventions du client</Text>

        <TextInput
          style={styles.searchBar}
          placeholder="Rechercher par nom ou téléphone"
          placeholderTextColor="#888787"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {/* Liste des interventions du client sélectionné (si pas de recherche en cours) */}
        {selectedClient && searchQuery === "" && (
          <View style={{ flex: 1 }}>
            <Text style={styles.clientInfo}>
              Client : {selectedClient.name} -{" "}
              {selectedClient.phone.replace(/(\d{2})(?=\d)/g, "$1 ")}
            </Text>

            <FlatList
              data={interventions}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <View style={styles.interventionCard}>
                  <View style={styles.interventionDetails}>
                    <Text style={styles.updatedAt}>
                      Référence : {item.reference || "N/A"}
                    </Text>
                    <Text style={styles.updatedAt}>
                      Produit : {item.deviceType || "N/A"}
                    </Text>
                    <Text style={styles.updatedAt}>
                      Marque : {item.brand || "N/A"}
                    </Text>
                    <Text style={styles.updatedAt}>
                      Modèle : {item.model || "N/A"}
                    </Text>
                    <Text style={styles.updatedAt}>
                      Description : {item.description}
                    </Text>
                    <Text style={styles.updatedAt}>
                      Mot de passe: {item.password}
                    </Text>
                    <Text style={styles.updatedAt}>
                      Statut : {item.status}
                    </Text>
                    <Text style={styles.updatedAt}>Coût : {item.cost} €</Text>
                    <Text style={styles.updatedAt}>
                      Montant restant dû : {item.solderestant} €
                    </Text>
                    <Text style={styles.updatedAt}>
                      Date :{" "}
                      {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                    </Text>
                    {!!item.detailIntervention && (
                      <Text style={styles.updatedAt}>
                        Détail de l'intervention: {item.detailIntervention}
                      </Text>
                    )}

                    {item.status === "Récupéré" && (
                      <Text style={styles.updatedAt}>
                        Date de récupération :{" "}
                        {item.updatedAt
                          ? new Date(item.updatedAt).toLocaleDateString(
                              "fr-FR"
                            )
                          : "Non disponible"}
                      </Text>
                    )}
                  </View>

                  <View style={styles.deleteButtonContainer}>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => confirmDeleteIntervention(item.id)}
                    >
                      <Text style={styles.deleteButtonText}>Supprimer</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Étiquette */}
<View style={styles.labelContainer}>
  {(() => {
    const label =
      typeof item.label_photo === "string" ? item.label_photo.trim() : "";
    if (!label) {
      return (
        <Text style={styles.referenceText}>
          {item.reference || "Référence manquante"}
        </Text>
      );
    }
    return (
      <TouchableOpacity onPress={() => handleImagePress(label)}>
        <SmartImage
          uri={label}                       // ← toujours une string non vide
          ficheNumber={selectedClient?.ficheNumber}
          interventionId={item.id}
          type="label"
          size={80}
          borderRadius={8}
          borderWidth={2}
          badge
        />
      </TouchableOpacity>
    );
  })()}
</View>


                  {/* Photos supplémentaires */}
                  <View style={styles.photosContainer}>
                    {Array.isArray(item.photos) && item.photos.length > 0 ? (
                      item.photos
                        .filter((u) => !sameImage(u, item.label_photo))
                        .map((uri, index) => (
                          <TouchableOpacity
                            key={`${item.id}-${index}`}
                            onPress={() => handleImagePress(uri)}
                          >
                            <SmartImage
                              uri={uri}
                              ficheNumber={selectedClient?.ficheNumber}
                              interventionId={item.id}
                              index={index}
                              type="photo"
                              size={60}
                              borderRadius={8}
                              borderWidth={1}
                              badge
                            />
                          </TouchableOpacity>
                        ))
                    ) : (
                      <Text style={styles.noPhotosText}>
                        Pas d'images disponibles
                      </Text>
                    )}
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {/* Résultats de recherche (liste des clients) */}
        {searchQuery !== "" && (
          <FlatList
            data={filteredClients}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedClient(item);
                  setSearchQuery("");
                }}
                style={styles.clientCard}
              >
                <Text style={styles.updatedAt}>
                  {item.name} - {item.phone}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}

        <BottomNavigation
          navigation={navigation}
          currentRoute={route.name}
        />
      </View>

      {/* Modale d'aperçu image */}
      {selectedImage && (
        <Modal
          transparent={true}
          visible={true}
          onRequestClose={() => setSelectedImage(null)}
        >
          <TouchableOpacity
            style={styles.modalBackground}
            onPress={() => setSelectedImage(null)}
          >
            <Image source={{ uri: selectedImage }} style={styles.fullImage} />
          </TouchableOpacity>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#e0e0e0" },
  title: {
    fontSize: 24,
    color: "#242424",
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  searchBar: {
    backgroundColor: "#c7c5c5",
    height: 40,
    borderColor: "#777676",
    borderWidth: 1,
    paddingLeft: 8,
    marginBottom: 20,
    borderRadius: 20,
    fontSize: 16,
    color: "#242424",
  },
  clientCard: {
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#cacaca",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#888787",
  },
  clientInfo: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#242424",
    marginBottom: 10,
  },
  interventionCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 15,
    marginBottom: 10,
    backgroundColor: "#cacaca",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#888787",
  },
  recuperedStatusCard: {
    borderColor: "red",
    borderWidth: 2,
  },
  updatedAt: {
    fontWeight: "500",
    color: "#242424",
  },
  interventionDetails: {
    flex: 3,
  },
  labelContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  labelImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#49f760",
  },
  referenceText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#242424",
    textAlign: "center",
  },
  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#191f2f",
  },
  fullImage: {
    width: "90%",
    height: "90%",
    resizeMode: "contain",
  },
  photosContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 40,
  },
  photo: {
    width: 60,
    height: 60,
    margin: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#888787",
  },
  noPhotosText: {
    fontSize: 14,
    fontStyle: "italic",
    color: "#888787",
    marginTop: 10,
  },
  deleteButtonContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    marginTop: 10,
  },
  deleteButton: {
    backgroundColor: "#fd0000",
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#888787",
  },
  deleteButtonText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 14,
  },
});
