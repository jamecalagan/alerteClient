import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import * as FileSystem from "expo-file-system";
import { supabase } from "../supabaseClient";
import AlertBox from "../components/AlertBox";
import BottomNavigation from "../components/BottomNavigation";

export default function ImageGallery({ route, navigation }) {
  const { clientId } = route.params;
  const [interventions, setInterventions] = useState([]); // [{id, photos:[uri]}]
  const [selectedImage, setSelectedImage] = useState(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [imageToDelete, setImageToDelete] = useState(null);
  const [loading, setLoading] = useState(false);

  /* ------------------------------------------------------------------ */
  /*   CHARGEMENT DES IMAGES  –  local en priorité, fallback Supabase   */
  /* ------------------------------------------------------------------ */
  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      // 1️⃣ ficheNumber pour construire le chemin local
      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .select("ficheNumber")
        .eq("id", clientId)
        .single();
      if (clientErr) throw clientErr;
      const localBase = `${FileSystem.documentDirectory}backup/${client.ficheNumber}/`;

      // 2️⃣ interventions avec photos / étiquettes
      const { data, error } = await supabase
        .from("interventions")
        .select("id, photos, label_photo")
        .eq("client_id", clientId);
      if (error) throw error;

      // 3️⃣ pour chaque photo ➜ prend le fichier local s'il existe
      const pickUri = async (remote, localName) => {
        const localPath = `${localBase}${localName}`;
        const info = await FileSystem.getInfoAsync(localPath);
        return info.exists ? localPath : remote;
      };

      const enriched = await Promise.all(
        (data || []).map(async (it) => {
          const { id, photos = [], label_photo } = it;
          const list = [];
          if (label_photo) list.push(await pickUri(label_photo, `etiquette_${id}.jpg`));
          for (let i = 0; i < photos.length; i++) {
            list.push(await pickUri(photos[i], `photo_${id}_${i + 1}.jpg`));
          }
          return { id, photos: list };
        })
      );

      setInterventions(enriched);
    } catch (err) {
      console.error("Erreur chargement images :", err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  /* ------------------------------------------------------------------ */
  /*                               ACTIONS                              */
  /* ------------------------------------------------------------------ */
  const handleImagePress = (uri) => setSelectedImage(uri);
  const handleDeleteRequest = (uri, interventionId, index) => {
    setImageToDelete({ uri, interventionId, index });
    setAlertVisible(true);
  };

  const handleConfirmDelete = async () => {
    const { uri, interventionId, index } = imageToDelete;
    try {
      if (uri.startsWith("file://")) {
        // 👉 suppression locale uniquement
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } else {
        // 👉 suppression côté Supabase
        const { data: inter, error: interErr } = await supabase
          .from("interventions")
          .select("photos")
          .eq("id", interventionId)
          .single();
        if (interErr) throw interErr;
        const newPhotos = (inter?.photos || []).filter((_, i) => i !== index);
        const { error } = await supabase
          .from("interventions")
          .update({ photos: newPhotos })
          .eq("id", interventionId);
        if (error) throw error;
      }
      await loadImages(); // rafraîchit (remontée éventuelle du cloud)
    } catch (e) {
      console.error("Suppression image :", e);
    } finally {
      setAlertVisible(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*                                 UI                                 */
  /* ------------------------------------------------------------------ */
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Galerie d'images</Text>

      {/* 🔄 Bouton forcer rechargement */}
      <TouchableOpacity style={styles.refreshBtn} onPress={loadImages}>
        <Text style={styles.refreshTxt}>🔄 Recharger</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator size="large" color="#000" style={{ marginTop: 20 }} />}

      {interventions.length ? (
        <ScrollView>
          {interventions.map((inter, idx) => (
            <View key={inter.id} style={styles.section}>
              <Text style={styles.sectionTitle}>Intervention {idx + 1}</Text>
              <View style={styles.rowWrap}>
                {inter.photos.length ? (
                  inter.photos.map((uri, ix) => {
                    const isLocal = uri.startsWith("file://");
                    return (
                      <View key={ix} style={styles.imageBox}>
                        <TouchableOpacity onPress={() => handleImagePress(uri)}>
                          <Image source={{ uri }} style={styles.thumb} />
                        </TouchableOpacity>
                        <Text style={[styles.badge, { color: isLocal ? "green" : "blue" }]}> 
                          {isLocal ? "📁 Local" : "☁️ Cloud"}
                        </Text>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteRequest(uri, inter.id, ix)}>
                          <Text style={styles.deleteTxt}>Supprimer</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.empty}>Aucune image</Text>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : !loading && <Text style={styles.empty}>Aucune image disponible.</Text>}

      {/* 🔍 Zoom */}
      {selectedImage && (
        <Modal transparent onRequestClose={() => setSelectedImage(null)}>
          <TouchableOpacity style={styles.modalBg} onPress={() => setSelectedImage(null)}>
            <Image source={{ uri: selectedImage }} style={styles.full} />
          </TouchableOpacity>
        </Modal>
      )}

      {/* Confirmation */}
      <AlertBox
        visible={alertVisible}
        title="Confirmer la suppression"
        message="Supprimer cette image ?"
        confirmText="Supprimer"
        cancelText="Annuler"
        onConfirm={handleConfirmDelete}
        onClose={() => setAlertVisible(false)}
      />

      <BottomNavigation navigation={navigation} currentRoute={route.name} />
    </View>
  );
}

/* -------------------------------- STYLES ------------------------------- */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#e9e9e9" },
  title: { fontSize: 24, fontWeight: "500", textAlign: "center", marginBottom: 10 },
  refreshBtn: { alignSelf: "center", backgroundColor: "#4a90e2", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, marginBottom: 10 },
  refreshTxt: { color: "#fff", fontWeight: "bold" },
  section: { marginBottom: 25 },
  sectionTitle: { fontSize: 18, fontWeight: "500", marginBottom: 10 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap" },
  imageBox: { margin: 6, alignItems: "center" },
  thumb: { width: 100, height: 100, borderRadius: 10, borderWidth: 2, borderColor: "#555" },
  badge: { fontSize: 12, marginTop: 2 },
  deleteBtn: { marginTop: 4, backgroundColor: "#f44336", borderRadius: 6, paddingVertical: 3, paddingHorizontal: 10 },
  deleteTxt: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  empty: { color: "#888", fontSize: 14, textAlign: "center", marginTop: 30 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center" },
  full: { width: "90%", height: "90%", resizeMode: "contain" },
});