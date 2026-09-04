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

import { supabase } from "../supabaseClient";
import BottomNavigation from "../components/BottomNavigation";
import AlertBox from "../components/AlertBox";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";

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
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={styles.title}>Interventions et commande du client</Text>

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
                    {Array.isArray(item.photos) && item.photos.length > 0 && (
                      <Text style={styles.deletePhotoHint}>
                        Appui long sur une photo pour la supprimer
                      </Text>
                    )}
                    <View style={styles.photosContainer}>
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
                        <Text style={styles.deleteButtonText}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
              ListFooterComponent={
                orders.length > 0 ? (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.sectionTitle}>
                      Commandes du client
                    </Text>
                    {orders.map((order) => (
                      <View key={order.id} style={styles.orderCard}>
                        <View style={styles.interventionDetails}>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Produit :</Text>{" "}
                            {order.product || "N/A"}
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Marque :</Text>{" "}
                            {order.brand || "N/A"}
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Modèle :</Text>{" "}
                            {order.model || "N/A"}
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Quantité :</Text>{" "}
                            {order.quantity || 1}
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Prix :</Text>{" "}
                            {order.price} €
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Acompte :</Text>{" "}
                            {order.deposit || 0} €
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Total :</Text>{" "}
                            {order.total} €
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Payé :</Text>{" "}
                            {order.paid ? "Oui" : "Non"}
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Commandée :</Text>{" "}
                            {order.ordered ? "Oui" : "Non"}
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Reçue :</Text>{" "}
                            {order.received ? "Oui" : "Non"}
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Récupérée :</Text>{" "}
                            {order.recovered ? "Oui" : "Non"}
                          </Text>
                          <Text style={styles.infoLine}>
                            <Text style={styles.bold}>Créée le :</Text>{" "}
                            {fmtDate(order.createdat)}
                          </Text>
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
                <Text style={styles.infoLine}>
                  {item.name} - {formatPhone(item.phone)}
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
  container: { flex: 1, backgroundColor: "#e0e0e0" },
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

  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#242424",
    marginTop: 8,
    marginBottom: 10,
    textAlign: "center",
  },
  orderCard: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#e8e3ff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#b396f8",
  },
  orderPhotoThumb: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#270381",
    resizeMode: "cover",
  },
  photoGroupLabel: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#270381",
    marginBottom: 4,
    textAlign: "center",
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
  deletePhotoHint: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 4,
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
