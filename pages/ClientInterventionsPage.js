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
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from "../supabaseClient";
import BottomNavigation from "../components/BottomNavigation";

/* ─────────── Helpers format ─────────── */
const formatPhone = (p) => (p ? String(p).replace(/(\d{2})(?=\d)/g, "$1 ") : "");
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("fr-FR") : "");

/* ─────────── Helpers images (nettoyage / URLs / fusion) ─────────── */
const stripQuotes = (s) =>
  s &&
  ((s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")))
    ? s.slice(1, -1)
    : s;

const cleanRefKeepToken = (raw) => {
  if (!raw) return "";
  let s =
    typeof raw === "string" ? raw : raw?.url || raw?.path || raw?.uri || "";
  s = String(s);
  return stripQuotes(s).trim().replace(/\\+$/g, "");
};

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

const toUrl = async (raw) => {
  const s = cleanRefKeepToken(raw);
  if (!s) return "";
  if (
    /^https?:\/\//i.test(s) ||
    s.startsWith("data:image") ||
    s.startsWith("file:") ||
    s.startsWith("content:")
  ) {
    return s;
  }
  const key = s.startsWith("images/") ? s.slice(7) : s;

  const pub = supabase.storage.from("images").getPublicUrl(key)?.data?.publicUrl;
  if (pub) return pub;

  try {
    const signed = await supabase.storage
      .from("images")
      .createSignedUrl(key, 60 * 60 * 24 * 7);
    if (signed?.data?.signedUrl) return signed.data.signedUrl;
  } catch {}
  return "";
};

const listFolderUrls = async (folder, interventionId) => {
  try {
    const prefix = `${folder}/${interventionId}`;
    const out = [];
    const LIMIT = 100;
    let offset = 0;

    while (true) {
      const { data: files, error } = await supabase.storage
        .from("images")
        .list(prefix, { limit: LIMIT, offset });
      if (error) throw error;
      if (!files || files.length === 0) break;

      for (const f of files) {
        if (!f?.name) continue; // ignore “dossiers”
        const full = `${prefix}/${f.name}`;
        const url = await toUrl(full);
        if (url) out.push(url);
      }
      if (files.length < LIMIT) break;
      offset += LIMIT;
    }

    out.sort((a, b) => b.localeCompare(a));
    return out;
  } catch {
    return [];
  }
};

const normalizePhotosField = (photos) => {
  if (Array.isArray(photos)) {
    return photos.map(cleanRefKeepToken).filter(Boolean);
  }
  if (typeof photos === "string") {
    const raw = photos.trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr)
          ? arr.map(cleanRefKeepToken).filter(Boolean)
          : [];
      } catch {}
    }
    const one = cleanRefKeepToken(raw);
    return one ? [one] : [];
  }
  return [];
};

const listLocalBackupImages = async (ficheNumber, interventionId) => {
  try {
    if (!ficheNumber || !interventionId)
      return { labelLocal: "", photosLocal: [], sigLocal: "" };

    const base = `${FileSystem.documentDirectory}backup/${ficheNumber}/`;
    const info = await FileSystem.getInfoAsync(base);
    if (!info.exists)
      return { labelLocal: "", photosLocal: [], sigLocal: "" };

    const files = await FileSystem.readDirectoryAsync(base);

    const labelName = `etiquette_${interventionId}.jpg`;
    const labelLocal = files.includes(labelName) ? `${base}${labelName}` : "";

    const sigName = `signature_${interventionId}.jpg`;
    const sigLocal = files.includes(sigName) ? `${base}${sigName}` : "";

    const photosLocal = files
      .filter((n) => n.startsWith(`photo_${interventionId}_`))
      .map((n) => `${base}${n}`);

    return { labelLocal, photosLocal, sigLocal };
  } catch {
    return { labelLocal: "", photosLocal: [], sigLocal: "" };
  }
};

/* ─────────── Page ─────────── */

export default function ClientInterventionsPage({ route, navigation }) {
  const { clientId } = route.params;
  const [interventions, setInterventions] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // Charger le client courant (incl. createdAt)
  useEffect(() => {
    const fetchClient = async () => {
      try {
        const { data: clientData, error } = await supabase
          .from("clients")
          .select("id, name, phone, ficheNumber, createdAt")
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

  // Charger interventions + fusion images
  useEffect(() => {
    if (!selectedClient) return;

    const fetchClientInterventions = async () => {
      try {
        const { data, error } = await supabase
          .from("interventions")
          .select("*, photos, label_photo, signatureIntervention")
          .eq("client_id", selectedClient.id)
          .order("createdAt", { ascending: false });

        if (error) throw error;

        const enriched = await Promise.all(
          (data || []).map(async (it) => {
            // Label : BDD/Storage puis fallback local
            let label =
              (typeof it.label_photo === "string"
                ? it.label_photo.trim()
                : "") || "";
            label = label ? await toUrl(label) : "";
            if (!label) {
              const labels = await listFolderUrls("etiquettes", it.id);
              label = labels[0] || "";
            }

            // Photos BDD
            const photosDBRaw = normalizePhotosField(it.photos);
            const photosDB = await Promise.all(photosDBRaw.map((p) => toUrl(p)));

            // Table intervention_images (au cas où)
            let photosTable = [];
            try {
              const { data: rows, error: imgErr } = await supabase
                .from("intervention_images")
                .select("image_data, image_url, url, path")
                .eq("intervention_id", it.id);

              if (!imgErr && Array.isArray(rows)) {
                const raws = rows.map(
                  (r) => r?.image_data || r?.image_url || r?.url || r?.path || ""
                );
                photosTable = await Promise.all(raws.map((p) => toUrl(p)));
              }
            } catch {}

            // Storage
            const fromSupp = await listFolderUrls("supplementaires", it.id);
            const fromAlt = await listFolderUrls("intervention_images", it.id);

            // Local
            const { labelLocal, photosLocal, sigLocal } =
              await listLocalBackupImages(selectedClient?.ficheNumber, it.id);

            const finalLabel = label || labelLocal || "";

            // Fusion & dédup
            const pool = [
              ...photosDB,
              ...photosTable,
              ...fromSupp,
              ...fromAlt,
              ...photosLocal,
            ].filter(Boolean);

            const seen = new Set();
            const uniq = [];
            for (const u of pool) {
              const key = cleanRefNoToken(u);
              if (!key) continue;
              if (!seen.has(key)) {
                seen.add(key);
                uniq.push(u);
              }
            }

            // Retirer l’étiquette des photos
            const photos =
              finalLabel
                ? uniq.filter(
                    (u) => cleanRefNoToken(u) !== cleanRefNoToken(finalLabel)
                  )
                : uniq;

            // Signature
            const sig = it.signatureIntervention
              ? cleanRefKeepToken(it.signatureIntervention)
              : "";
            const photosWithSig = sig ? [...photos, sig] : photos;
            const photosWithSigLocal = sigLocal
              ? [...photosWithSig, sigLocal]
              : photosWithSig;

            return { ...it, label_photo: finalLabel, photos: photosWithSigLocal };
          })
        );

        setInterventions(enriched);
      } catch (err) {
        console.error("Erreur lors du chargement des interventions :", err);
      }
    };

    fetchClientInterventions();
  }, [selectedClient]);

  // Liste clients pour recherche
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

  const filteredClients =
    (clients || []).filter(
      (client) =>
        (client?.name || "")
          .toLowerCase()
          .includes((searchQuery || "").toLowerCase()) ||
        (client?.phone || "").includes(searchQuery || "")
    ) || [];

  const handleImagePress = (imageUri) => setSelectedImage(imageUri);

  const handleDeleteIntervention = async (interventionId) => {
    try {
      const { error } = await supabase
        .from("interventions")
        .delete()
        .eq("id", interventionId);
      if (error) {
        Alert.alert("Erreur", "Une erreur est survenue lors de la suppression.");
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

        {/* Liste des interventions (si pas de recherche en cours) */}
        {selectedClient && searchQuery === "" && (
          <View style={{ flex: 1 }}>
            <FlatList
              data={interventions}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <View style={styles.interventionCard}>
                  {/* ───── Bloc INFOS (client + intervention) ───── */}
                  <View style={styles.interventionDetails}>
                    {/* Client */}
                    <Text style={styles.clientLine}>
                      <Text style={styles.bold}>Client :</Text> {selectedClient.name}
                    </Text>
                    <Text style={styles.clientLine}>
                      <Text style={styles.bold}>Téléphone :</Text> {formatPhone(selectedClient.phone)}
                    </Text>
                    <Text style={styles.clientLine}>
                      <Text style={styles.bold}>N° de fiche :</Text> {selectedClient.ficheNumber}
                    </Text>
                    <Text style={styles.clientLine}>
                      <Text style={styles.bold}>Création client :</Text> {fmtDate(selectedClient.createdAt)}
                    </Text>

                    {/* Intervention */}
                    <View style={styles.sep} />
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Référence :</Text> {item.reference || "N/A"}
                    </Text>
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Type :</Text> {item.deviceType || "N/A"}
                    </Text>
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Marque :</Text> {item.brand || "N/A"}
                    </Text>
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Modèle :</Text> {item.model || "N/A"}
                    </Text>
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Description :</Text> {item.description}
                    </Text>
                    {!!item.detailIntervention && (
                      <Text style={styles.infoLine}>
                        <Text style={styles.bold}>Détail intervention :</Text> {item.detailIntervention}
                      </Text>
                    )}
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Mot de passe :</Text> {item.password || "—"}
                    </Text>
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Statut :</Text> {item.status}
                    </Text>
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Coût :</Text> {item.cost} €
                    </Text>
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Reste dû :</Text> {item.solderestant} €
                    </Text>
                    <Text style={styles.infoLine}>
                      <Text style={styles.bold}>Création intervention :</Text>{" "}
                      {fmtDate(item.createdAt)}
                    </Text>
                    {item.status === "Récupéré" && (
                      <Text style={styles.infoLine}>
                        <Text style={styles.bold}>Récupéré le :</Text>{" "}
                        {item.updatedAt ? fmtDate(item.updatedAt) : "Non disponible"}
                      </Text>
                    )}
                    {item.accept_screen_risk ? (
                      <Text style={styles.acceptRiskText}>
                        Le client a accepté le risque de casse.
                      </Text>
                    ) : null}
                  </View>

                  {/* ───── Bloc IMAGES (label + photos + signature) ───── */}
                  <View style={styles.mediaColumn}>
                    {/* Étiquette (ou fallback texte) */}
                    <View style={styles.labelContainer}>
                      {(() => {
                        const label =
                          typeof item.label_photo === "string"
                            ? item.label_photo.trim()
                            : "";
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
                              uri={label}
                              ficheNumber={selectedClient?.ficheNumber}
                              interventionId={item.id}
                              type="label"
                              size={90}
                              borderRadius={10}
                              borderWidth={2}
                              badge
                            />
                          </TouchableOpacity>
                        );
                      })()}
                    </View>

                    {/* Photos supplémentaires (fusionnées/dédupliquées) */}
                    <View style={styles.photosContainer}>
                      {Array.isArray(item.photos) && item.photos.length > 0 ? (
                        item.photos.map((uri, index) => (
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
                              size={64}
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

                    {/* Bouton supprimer */}
                    <View style={styles.deleteButtonContainer}>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => confirmDeleteIntervention(item.id)}
                      >
                        <Text style={styles.deleteButtonText}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            />
          </View>
        )}

        {/* Résultats recherche (liste clients) */}
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
                <Text style={styles.infoLine}>
                  {item.name} - {formatPhone(item.phone)}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}

        <BottomNavigation navigation={navigation} currentRoute={route.name} />
      </View>

      {/* Modale image */}
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
    marginBottom: 12,
    textAlign: "center",
  },
  searchBar: {
    backgroundColor: "#c7c5c5",
    height: 40,
    borderColor: "#777676",
    borderWidth: 1,
    paddingLeft: 8,
    marginBottom: 16,
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

  interventionCard: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#cacaca",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#888787",
  },

  /* Infos bloc */
  interventionDetails: { flex: 2 },
  bold: { fontWeight: "bold" },
  clientLine: { color: "#242424", marginBottom: 2 },
  infoLine: { color: "#242424", marginBottom: 2 },
  sep: { height: 8 },

  /* Images bloc */
  mediaColumn: { flex: 1, alignItems: "center" },
  labelContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  referenceText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#242424",
    textAlign: "center",
  },
  photosContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  noPhotosText: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#555",
    marginTop: 4,
    textAlign: "center",
  },

  /* Divers */
  acceptRiskText: {
    marginTop: 6,
    fontSize: 13,
    color: "green",
    fontWeight: "700",
  },
  deleteButtonContainer: {
    marginTop: 10,
    alignItems: "center",
  },
  deleteButton: {
    backgroundColor: "#fd0000",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#888787",
  },
  deleteButtonText: { color: "#ffffff", fontWeight: "bold", fontSize: 14 },

  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#191f2f",
  },
  fullImage: { width: "90%", height: "90%", resizeMode: "contain" },
});
