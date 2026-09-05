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
} from "react-native";
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../supabaseClient";
import BottomNavigation from "../components/BottomNavigation";
import AlertBox from "../components/AlertBox";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";

const STATUS_COLORS = {
  "Réparé": { bg: "#dcfce7", text: "#15803d" },
  "Non réparable": { bg: "#fee2e2", text: "#dc2626" },
  "Intervention en cours": { bg: "#dbeafe", text: "#1d4ed8" },
  "En attente de pièces": { bg: "#fef3c7", text: "#b45309" },
  "Devis en cours": { bg: "#ede9fe", text: "#6d28d9" },
  "Devis accepté": { bg: "#e0f2fe", text: "#0369a1" },
  "Récupéré": { bg: "#e2e8f0", text: "#334155" },
};
const getStatusColors = (status) =>
  STATUS_COLORS[status] || { bg: "#e2e8f0", text: "#334155" };

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
  // Ramène à la clé stable dans le bucket : une URL publique et une URL
  // signée du même fichier doivent être reconnues comme identiques.
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign)\/images\/(.+)$/i);
  if (m && m[1]) return m[1];
  if (s.startsWith("images/")) return s.slice(7);
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
  } catch { /* pas d'URL signée disponible */ }
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

// Ancienne convention : fichiers old_images/ stockés à plat, nommés
// "<ficheNumber>_<nom>_<interventionId>_<timestamp>.jpg" (pas de sous-dossier
// par intervention). Liste tout le dossier (à appeler une seule fois).
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
      } catch { /* pas du JSON valide, ignoré */ }
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
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [interventionIdToDelete, setInterventionIdToDelete] = useState(null);
  const [photoToDelete, setPhotoToDelete] = useState(null); // { interventionId, uri }
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

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
        const query = supabase
          .from("interventions")
          .select("*, photos, label_photo, signatureIntervention")
          .eq("client_id", selectedClient.id);

        const { data, error } = await query.order("createdAt", {
          ascending: false,
        });

        if (error) throw error;

        const oldImagesFiles = await listOldImagesFiles();

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
                .select("image_data, file_path")
                .eq("intervention_id", it.id);

              if (!imgErr && Array.isArray(rows)) {
                const raws = rows.map(
                  (r) => r?.image_data || r?.file_path || ""
                );
                photosTable = await Promise.all(raws.map((p) => toUrl(p)));
              }
            } catch { /* pas de photos en base, ignoré */ }

            // Storage
            const fromSupp = await listFolderUrls("supplementaires", it.id);
            const fromAlt = await listFolderUrls("intervention_images", it.id);

            // Ancienne convention old_images/ (nom de fichier contenant l'id)
            const fromOldImagesRaw = oldImagesFiles.filter((f) =>
              f.name.includes(it.id)
            );
            const fromOldImages = await Promise.all(
              fromOldImagesRaw.map((f) => toUrl(`old_images/${f.name}`))
            );

            // Local
            const { labelLocal, photosLocal, sigLocal } =
              await listLocalBackupImages(selectedClient?.ficheNumber, it.id);

            const finalLabel = label || labelLocal || "";

            // Fusion & dédup — le cache local (photosLocal) contient les
            // mêmes photos que le cloud sous des noms différents (impossible
            // à dédupliquer par nom) : on ne l'utilise qu'en repli, si rien
            // n'a été trouvé côté cloud, pas en plus.
            const cloudPhotos = [
              ...photosDB,
              ...photosTable,
              ...fromSupp,
              ...fromAlt,
              ...fromOldImages,
            ];
            const pool = (
              cloudPhotos.length > 0 ? cloudPhotos : photosLocal
            ).filter(Boolean);

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
            const photosWithSigLocal =
              !sig && sigLocal ? [...photosWithSig, sigLocal] : photosWithSig;

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

  // Charger les commandes du client
  useEffect(() => {
    if (!selectedClient) return;

    const fetchClientOrders = async () => {
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("*, order_items(product, brand, quantity, unit_price, fournisseur)")
          .eq("client_id", selectedClient.id)
          .or("deleted.eq.false,deleted.is.null")
          .order("createdat", { ascending: false });

        if (error) throw error;

        const normalized = await Promise.all(
          (data || []).map(async (order) => {
            const orderPhotosRaw = normalizePhotosField(order.order_photos);
            const productPhotosRaw = normalizePhotosField(order.product_photos);
            const [orderPhotos, productPhotos] = await Promise.all([
              Promise.all(orderPhotosRaw.map((p) => toUrl(p))),
              Promise.all(productPhotosRaw.map((p) => toUrl(p))),
            ]);
            return {
              ...order,
              order_photos: orderPhotos.filter(Boolean),
              product_photos: productPhotos.filter(Boolean),
            };
          })
        );

        setOrders(normalized);
      } catch (err) {
        console.error("Erreur lors du chargement des commandes :", err);
      }
    };

    fetchClientOrders();
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
        showAlert("Erreur", "Une erreur est survenue lors de la suppression.");
        console.error("Erreur de suppression :", error);
        return;
      }
      showAlert("Succès", "L'intervention a été supprimée avec succès.");
      setInterventions((prev) =>
        prev.filter((intervention) => intervention.id !== interventionId)
      );
    } catch (err) {
      showAlert("Erreur", "Impossible de supprimer l'intervention.");
      console.error("Erreur :", err);
    }
  };

  const confirmDeleteIntervention = (interventionId) => {
    setInterventionIdToDelete(interventionId);
  };

  const confirmDeletePhoto = (interventionId, uri) => {
    setPhotoToDelete({ interventionId, uri });
  };

  const handleDeletePhoto = async () => {
    const target = photoToDelete;
    setPhotoToDelete(null);
    if (!target) return;
    const { interventionId, uri } = target;

    try {
      const path = cleanRefNoToken(uri);
      if (path) {
        const { error: storageError } = await supabase.storage
          .from("images")
          .remove([path]);
        if (storageError) {
          console.error("Suppression Storage photo :", storageError);
        }
      }

      const { data: row, error: readErr } = await supabase
        .from("interventions")
        .select("photos")
        .eq("id", interventionId)
        .single();

      if (readErr) throw readErr;

      const nextPhotos = normalizePhotosField(row?.photos).filter(
        (p) => cleanRefNoToken(p) !== path
      );

      const { error: updateErr } = await supabase
        .from("interventions")
        .update({ photos: nextPhotos })
        .eq("id", interventionId);

      if (updateErr) throw updateErr;

      setInterventions((prev) =>
        prev.map((it) =>
          it.id === interventionId
            ? { ...it, photos: (it.photos || []).filter((p) => p !== uri) }
            : it
        )
      );
    } catch (err) {
      console.error("Erreur suppression photo :", err);
      showAlert("Erreur", "Impossible de supprimer cette photo.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={styles.title}>📋 Interventions et commandes du client</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchBar}
            placeholder="Rechercher par nom ou téléphone"
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Liste des interventions (si pas de recherche en cours) */}
        {selectedClient && searchQuery === "" && (
          <View style={{ flex: 1 }}>
            <FlatList
              data={interventions}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => {
                const statusColors = getStatusColors(item.status);
                return (
                <View style={styles.interventionCard}>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {/* ───── Bloc INFOS (client + intervention) ───── */}
                  <View style={styles.interventionDetails}>
                    <View style={styles.ficheBadge}>
                      <Text style={styles.ficheBadgeText}>
                        N° {selectedClient.ficheNumber}
                      </Text>
                    </View>
                    <Text style={styles.clientName}>{selectedClient.name}</Text>
                    <Text style={styles.clientPhone}>{formatPhone(selectedClient.phone)}</Text>
                    <Text style={styles.mutedLine}>
                      Client depuis le {fmtDate(selectedClient.createdAt)}
                    </Text>

                    <View style={styles.sep} />

                    <View style={[styles.statusPill, { backgroundColor: statusColors.bg, alignSelf: "flex-start" }]}>
                      <Text style={[styles.statusPillText, { color: statusColors.text }]}>
                        {item.status || "Statut inconnu"}
                      </Text>
                    </View>

                    {[
                      { label: "Référence", value: item.reference || "N/A" },
                      { label: "Type", value: item.deviceType || "N/A" },
                      { label: "Marque", value: item.brand || "N/A" },
                      { label: "Modèle", value: item.model || "N/A" },
                      { label: "Description", value: item.description },
                      ...(item.detailIntervention
                        ? [{ label: "Détail intervention", value: item.detailIntervention }]
                        : []),
                      { label: "Mot de passe", value: item.password || "—" },
                      { label: "Coût", value: `${item.cost} €` },
                      { label: "Reste dû", value: `${item.solderestant} €` },
                      { label: "Création intervention", value: fmtDate(item.createdAt) },
                      ...(item.status === "Récupéré"
                        ? [{
                            label: "Récupéré le",
                            value: item.updatedAt ? fmtDate(item.updatedAt) : "Non disponible",
                          }]
                        : []),
                    ].map((row, idx) => (
                      <View
                        key={row.label}
                        style={[styles.infoRow, idx % 2 === 1 && styles.infoRowAlt]}
                      >
                        <Text style={styles.infoLine}>
                          <Text style={styles.bold}>{row.label} :</Text> {row.value}
                        </Text>
                      </View>
                    ))}
                    {item.accept_screen_risk ? (
                      <Text style={styles.acceptRiskText}>
                        Le client a accepté le risque de casse.
                      </Text>
                    ) : null}
                  </View>

                  {/* ───── Bloc ÉTIQUETTE uniquement ───── */}
                  <View style={styles.mediaColumn}>
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
                  </View>
                </View>

                {/* ───── Photos supplémentaires, sous le tableau ───── */}
                {Array.isArray(item.photos) && item.photos.length > 0 && (
                  <Text style={styles.deletePhotoHint}>
                    Appui long sur une photo pour la supprimer
                  </Text>
                )}
                <View style={styles.photosContainerBelow}>
                  {Array.isArray(item.photos) && item.photos.length > 0 ? (
                    item.photos.map((uri, index) => (
                      <TouchableOpacity
                        key={`${item.id}-${index}`}
                        onPress={() => handleImagePress(uri)}
                        onLongPress={() => confirmDeletePhoto(item.id, uri)}
                        delayLongPress={350}
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
                    <Ionicons name="trash-outline" size={14} color="#dc2626" />
                    <Text style={styles.deleteButtonText}>Supprimer</Text>
                  </TouchableOpacity>
                </View>
                </View>
                );
              }}
              ListFooterComponent={
                orders.length > 0 ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.sectionTitle}>
                      Commandes du client
                    </Text>
                    {orders.map((order) => (
                      <View key={order.id} style={styles.orderCard}>
                        <View style={styles.interventionDetails}>
                          <View style={styles.orderBadge}>
                            <Text style={styles.orderBadgeText}>COMMANDE</Text>
                          </View>
                          {[
                            { label: "Produit", value: order.product || "N/A" },
                            { label: "Marque", value: order.brand || "N/A" },
                            { label: "Modèle", value: order.model || "N/A" },
                            { label: "Quantité", value: order.quantity || 1 },
                            { label: "Prix", value: `${order.price} €` },
                            { label: "Acompte", value: `${order.deposit || 0} €` },
                            { label: "Total", value: `${order.total} €` },
                            { label: "Payé", value: order.paid ? "Oui" : "Non" },
                            { label: "Commandée", value: order.ordered ? "Oui" : "Non" },
                            { label: "Reçue", value: order.received ? "Oui" : "Non" },
                            { label: "Récupérée", value: order.recovered ? "Oui" : "Non" },
                            { label: "Créée le", value: fmtDate(order.createdat) },
                          ].map((row, idx) => (
                            <View
                              key={row.label}
                              style={[styles.infoRow, idx % 2 === 1 && styles.infoRowAlt]}
                            >
                              <Text style={styles.infoLine}>
                                <Text style={styles.bold}>{row.label} :</Text> {row.value}
                              </Text>
                            </View>
                          ))}
                        </View>

                        <View style={styles.mediaColumn}>
                          {Array.isArray(order.product_photos) &&
                            order.product_photos.length > 0 && (
                              <>
                                <Text style={styles.photoGroupLabel}>
                                  Photo de l'appareil
                                </Text>
                                <View style={styles.photosContainer}>
                                  {order.product_photos.map((uri, index) => (
                                    <TouchableOpacity
                                      key={`${order.id}-product-${index}`}
                                      onPress={() => handleImagePress(uri)}
                                    >
                                      <Image
                                        source={{ uri }}
                                        style={styles.orderPhotoThumb}
                                      />
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </>
                            )}

                          <Text style={styles.photoGroupLabel}>
                            Photos de la commande
                          </Text>
                          <View style={styles.photosContainer}>
                            {Array.isArray(order.order_photos) &&
                            order.order_photos.length > 0 ? (
                              order.order_photos.map((uri, index) => (
                                <TouchableOpacity
                                  key={`${order.id}-${index}`}
                                  onPress={() => handleImagePress(uri)}
                                >
                                  <Image
                                    source={{ uri }}
                                    style={styles.orderPhotoThumb}
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
                      </View>
                    ))}
                  </View>
                ) : null
              }
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
                <Ionicons name="person-circle-outline" size={22} color="#4338ca" />
                <Text style={styles.clientCardText}>
                  {item.name} — {formatPhone(item.phone)}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      <BottomNavigation navigation={navigation} currentRoute={route.name} />

      <BackButton onPress={() => navigation.goBack()} style={{ marginTop: 12, marginBottom: 90 }} />

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
            activeOpacity={1}
          >
            <TouchableOpacity style={styles.imageCloseBtn} onPress={() => setSelectedImage(null)}>
              <Text style={styles.imageCloseBtnText}>✕</Text>
            </TouchableOpacity>
            <Image source={{ uri: selectedImage }} style={styles.fullImage} />
          </TouchableOpacity>
        </Modal>
      )}

      <AlertBox
        visible={!!interventionIdToDelete}
        title="Confirmation"
        message="Supprimer cette intervention ?"
        cancelText="Annuler"
        confirmText="Supprimer"
        onClose={() => setInterventionIdToDelete(null)}
        onConfirm={() => {
          const id = interventionIdToDelete;
          setInterventionIdToDelete(null);
          handleDeleteIntervention(id);
        }}
      />

      <AlertBox
        visible={!!photoToDelete}
        title="Supprimer la photo"
        message="Supprimer définitivement cette photo ?"
        cancelText="Annuler"
        confirmText="Supprimer"
        onClose={() => setPhotoToDelete(null)}
        onConfirm={handleDeletePhoto}
      />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  title: {
    fontSize: 20,
    color: "#0f172a",
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
  },
  searchWrap: {
    position: "relative",
    justifyContent: "center",
    marginBottom: 14,
  },
  searchIcon: {
    position: "absolute",
    left: 14,
    zIndex: 1,
  },
  searchBar: {
    backgroundColor: "#ffffff",
    height: 44,
    borderColor: "#e2e8f0",
    borderWidth: 1,
    paddingLeft: 40,
    borderRadius: 12,
    fontSize: 15,
    color: "#0f172a",
  },
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  clientCardText: {
    fontSize: 14,
    color: "#1e293b",
    fontWeight: "600",
  },

  interventionCard: {
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginTop: 10,
    marginBottom: 10,
    textAlign: "center",
  },
  orderCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e9d5ff",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  orderBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#f5f3ff",
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  orderBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7c3aed",
    letterSpacing: 0.4,
  },
  orderPhotoThumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9d5ff",
    resizeMode: "cover",
  },
  photoGroupLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7c3aed",
    marginBottom: 4,
    textAlign: "center",
  },

  /* Infos bloc */
  interventionDetails: { flex: 2 },
  bold: { fontWeight: "700", color: "#475569" },
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
    fontSize: 12,
  },
  clientName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  clientPhone: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 1,
  },
  mutedLine: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 1,
  },
  statusPill: {
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  infoRow: {
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  infoRowAlt: {
    backgroundColor: "#eef2f7",
    borderRadius: 4,
  },
  infoLine: { color: "#334155", fontSize: 13 },
  sep: { height: 1, backgroundColor: "#f1f5f9", marginVertical: 8 },

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
  photosContainerBelow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  noPhotosText: {
    fontSize: 12,
    fontStyle: "italic",
    color: "#94a3b8",
    marginTop: 4,
    textAlign: "center",
  },
  deletePhotoHint: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 10,
  },

  /* Divers */
  acceptRiskText: {
    marginTop: 6,
    fontSize: 12,
    color: "#15803d",
    fontWeight: "700",
  },
  deleteButtonContainer: {
    marginTop: 10,
    alignItems: "center",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  deleteButtonText: { color: "#dc2626", fontWeight: "700", fontSize: 13 },

  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
  },
  fullImage: { width: "90%", height: "90%", resizeMode: "contain", borderRadius: 16 },
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
