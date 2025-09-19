import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../supabaseClient";
import EyeIcon from "../assets/icons/eye.png";
import EyeSlashIcon from "../assets/icons/eye-slash.png";

// === Réglages bucket/chemin ===
const ORDER_PHOTOS_BUCKET = "images"; // bucket existant
const ORDER_PHOTOS_FOLDER = "orders"; // sous-dossier pour les commandes

export default function OrdersPage({ route, navigation, order }) {
  const { clientId, clientName, clientPhone, clientNumber } = route.params || {};

  const [orders, setOrders] = useState([]);
  const [expandedOrders, setExpandedOrders] = useState([]);
  const [uploadingOrderId, setUploadingOrderId] = useState(null);

  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState(null);

  const [newOrder, setNewOrder] = useState({
    product: "",
    brand: "",
    model: "",
    serial: "",
    price: "",
    deposit: "",
    paid: false,
    client_id: null,
  });

  useEffect(() => {
    if (clientId) setNewOrder((p) => ({ ...p, client_id: clientId }));
  }, [clientId]);

  useEffect(() => {
    loadOrders();
  }, [clientId]);

  const loadOrders = async () => {
    if (!clientId) return;
    const { data, error } = await supabase
      .from("orders")
      .select("*, billing(id)")
      .eq("client_id", clientId)
      .order("createdat", { ascending: false });
    if (error) throw error;

    const toBool = (v) => v === true || v === "true" || v === 1;
    setOrders(
      (data || []).map((o) => ({
        ...o,
        originalSerial: o.serial || "",
        billing: o.billing || null,
        notified: toBool(o.notified),
        received: toBool(o.received),
        paid: toBool(o.paid),
        ordered: toBool(o.ordered),
        recovered: toBool(o.recovered),
        saved: toBool(o.saved),
      }))
    );
  };

  const handleCreateOrder = async () => {
    try {
      if (!newOrder.product || !newOrder.price) {
        alert("Veuillez remplir au moins le produit et le prix !");
        return;
      }
      const priceToSend = newOrder.price.replace(",", ".");
      const depositToSend = newOrder.deposit.replace(",", ".");
      const { error } = await supabase.from("orders").insert([
        {
          product: newOrder.product,
          brand: newOrder.brand || "",
          model: newOrder.model || "",
          serial: newOrder.serial || "",
          price: parseFloat(priceToSend),
          deposit: parseFloat(depositToSend) || 0,
          paid: false,
          client_id: clientId,
        },
      ]);
      if (error) throw error;
      setNewOrder({ product: "", brand: "", model: "", serial: "", price: "", deposit: "", paid: false, client_id: clientId });
      loadOrders();
    } catch (e) {
      console.error("❌ Ajout commande:", e);
    }
  };

  const handleDeleteOrder = async (ord) => {
    if (!ord.paid && !ord.saved) {
      Alert.alert("Suppression impossible", "Impossible de supprimer une commande ni payée ni sauvegardée.");
      return;
    }
    Alert.alert("Confirmation", "Supprimer cette commande ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("orders").delete().eq("id", ord.id);
            if (error) throw error;
            loadOrders();
          } catch (e) {
            console.error("❌ Suppression:", e);
          }
        },
      },
    ]);
  };

  const handleMarkAsPaid = (ord) => {
    Alert.alert(
      "Paiement complet",
      `Confirmez-vous le paiement complet de ${ord.price - (ord.deposit || 0)} € ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            try {
              const { error } = await supabase.from("orders").update({ paid: true }).eq("id", ord.id);
              if (error) throw error;
              loadOrders();
            } catch (e) {
              console.error("❌ Paiement:", e);
            }
          },
        },
      ]
    );
  };

  const handleSaveOrder = async (ord) => {
    if (!ord.paid || !ord.recovered) {
      Alert.alert("Erreur", "Marquez d'abord payée et récupérée avant de sauvegarder.");
      return;
    }
    Alert.alert("Sauvegarder", "Confirmez-vous la sauvegarde définitive ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Confirmer",
        onPress: async () => {
          try {
            const { error } = await supabase
              .from("orders")
              .update({ saved: true, paid_at: new Date().toISOString() })
              .eq("id", ord.id);
            if (error) throw error;
            loadOrders();
          } catch (e) {
            console.error("❌ Sauvegarde:", e);
          }
        },
      },
    ]);
  };

  const handleMarkAsRecovered = async (ord) => {
    Alert.alert("Commande récupérée", "Confirmez-vous la récupération par le client ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Confirmer",
        onPress: async () => {
          try {
            const { error } = await supabase.from("orders").update({ recovered: true }).eq("id", ord.id);
            if (error) throw error;
            loadOrders();
          } catch (e) {
            console.error("❌ Récupération:", e);
          }
        },
      },
    ]);
  };

  const handleMarkAsOrdered = async (ord) => {
    Alert.alert("Commande passée", "Confirmez-vous la commande fournisseur ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Confirmer",
        onPress: async () => {
          try {
            const { error } = await supabase.from("orders").update({ ordered: true }).eq("id", ord.id);
            if (error) throw error;
            loadOrders();
          } catch (e) {
            console.error("❌ Commande passée:", e);
          }
        },
      },
    ]);
  };

  const handleMarkAsReceived = async (ord) => {
    Alert.alert("Commande reçue", "Confirmez-vous la réception ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Confirmer",
        onPress: async () => {
          try {
            const { error } = await supabase.from("orders").update({ received: true }).eq("id", ord.id);
            if (error) throw error;
            loadOrders();
          } catch (e) {
            console.error("❌ Réception:", e);
          }
        },
      },
    ]);
  };

  const notifyOrderBySMS = async (ord) => {
    if (!clientPhone) {
      Alert.alert("Erreur", "Numéro de téléphone manquant.");
      return;
    }
    const message = `Bonjour, votre commande ${ord.product} est prête. Merci et à bientôt.\n\nAVENIR INFORMATIQUE`;
    const encoded = encodeURIComponent(message);
    try {
      const { error } = await supabase.from("orders").update({ notified: true }).eq("id", ord.id);
      if (error) throw error;
      Linking.openURL(`sms:${clientPhone}?body=${encoded}`);
      Alert.alert("✅ Notification envoyée !");
      loadOrders();
    } catch (e) {
      console.error("Erreur notification :", e);
      Alert.alert("Erreur", "Impossible d’enregistrer la notification.");
    }
  };

  // ====== PHOTOS (multi) ======
  const ensureCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission requise", "Autorisez l'accès à la caméra pour prendre des photos.");
      return false;
    }
    return true;
  };

  const getPublicUrlFromPath = (path) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path; // déjà URL
    const { data } = supabase.storage.from(ORDER_PHOTOS_BUCKET).getPublicUrl(path);
    return data?.publicUrl || null;
  };

  const candidateMulti = ["order_photos", "photos", "images"]; // colonnes liste/array/jsonb
  const candidateSingle = ["order_photo", "photo_url", "photo", "image_url", "image", "picture"]; // fallback

  const readPhotoPathsFromRow = (row) => {
    // 1) si une colonne "multi" existe
    for (const col of candidateMulti) {
      if (Object.prototype.hasOwnProperty.call(row || {}, col) && row[col] != null) {
        const v = row[col];
        if (Array.isArray(v)) return v.filter(Boolean);
        if (typeof v === "string") {
          // JSON ? CSV ? chemin unique ?
          try {
            const arr = JSON.parse(v);
            if (Array.isArray(arr)) return arr.filter(Boolean);
          } catch (_) {}
          if (v.includes(",")) return v.split(",").map((s) => s.trim()).filter(Boolean);
          return v ? [v] : [];
        }
      }
    }
    // 2) sinon on essaie les colonnes "simples"
    for (const col of candidateSingle) {
      if (Object.prototype.hasOwnProperty.call(row || {}, col) && row[col]) {
        return [row[col]];
      }
    }
    return [];
  };

  const writePhotoPathsToRow = async (orderId, paths) => {
    // on privilégie une colonne multi
    for (const col of candidateMulti) {
      try {
        const { error } = await supabase.from("orders").update({ [col]: paths }).eq("id", orderId);
        if (!error) return true;
      } catch (_) {}
    }
    // si aucune colonne multi : on tente une simple (écrira la DERNIÈRE photo)
    for (const col of candidateSingle) {
      try {
        const last = paths[paths.length - 1] || null;
        const { error } = await supabase.from("orders").update({ [col]: last }).eq("id", orderId);
        if (!error) return true;
      } catch (_) {}
    }
    Alert.alert(
      "Colonne photos introuvable",
      "Ajoutez une colonne JSON/ARRAY (ex. order_photos jsonb) pour stocker plusieurs chemins."
    );
    return false;
  };

  const takeAndUploadOrderPhoto = async (ord) => {
    try {
      const ok = await ensureCameraPermission();
      if (!ok) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: false,
        allowsEditing: false,
        exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setUploadingOrderId(ord.id);

      const extGuess = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${ORDER_PHOTOS_FOLDER}/${clientId || "client"}/${ord.id}-${Date.now()}.${extGuess}`;
      const file = { uri: asset.uri, name: filePath.split("/").pop(), type: asset.mimeType || `image/${extGuess}` };

      const { error: upErr } = await supabase.storage
        .from(ORDER_PHOTOS_BUCKET)
        .upload(filePath, file, { cacheControl: "3600", upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const current = readPhotoPathsFromRow(ord);
      const next = [...current, filePath];
      const okWrite = await writePhotoPathsToRow(ord.id, next);
      if (!okWrite) return;

      Alert.alert("✅ Photo enregistrée", "La photo a été ajoutée à la commande.");
      await loadOrders();
    } catch (e) {
      console.error("📷❌ Upload photo:", e);
      Alert.alert("Erreur", "Impossible d'envoyer la photo.");
    } finally {
      setUploadingOrderId(null);
    }
  };

  const deleteOnePhoto = async (ord, imgPath) => {
    const paths = readPhotoPathsFromRow(ord);
    const next = paths.filter((p) => p !== imgPath);
    const ok = await writePhotoPathsToRow(ord.id, next);
    if (!ok) return;
    try {
      await supabase.storage.from(ORDER_PHOTOS_BUCKET).remove([imgPath]);
    } catch (_) {}
    await loadOrders();
  };

  const toggleExpand = (id) => {
    setExpandedOrders((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openImageModal = (url) => {
    setImageModalUrl(url);
    setImageModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Créer une commande pour: {clientName}</Text>

      {/* Formulaire rapide */}
      <View style={styles.formContainer}>
        <TextInput style={styles.input} placeholder="Produit" placeholderTextColor="#000" value={newOrder.product} onChangeText={(t) => setNewOrder({ ...newOrder, product: t })} />
        <TextInput style={styles.input} placeholder="Marque" placeholderTextColor="#000" value={newOrder.brand} onChangeText={(t) => setNewOrder({ ...newOrder, brand: t })} />
        <TextInput style={styles.input} placeholder="Modèle" placeholderTextColor="#000" value={newOrder.model} onChangeText={(t) => setNewOrder({ ...newOrder, model: t })} />
        <TextInput style={styles.input} placeholder="Prix (€)" placeholderTextColor="#000" keyboardType="numeric" value={newOrder.price} onChangeText={(t) => setNewOrder({ ...newOrder, price: t })} />
        <TextInput style={styles.input} placeholder="Acompte (€)" placeholderTextColor="#000" keyboardType="numeric" value={newOrder.deposit} onChangeText={(t) => setNewOrder({ ...newOrder, deposit: t })} />
        <View style={{ alignItems: "center" }}>
          <TouchableOpacity style={styles.addButton} onPress={handleCreateOrder}>
            <Text style={styles.button}>➕ Ajouter une commande</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const isExpanded = expandedOrders.includes(item.id);
          const paths = readPhotoPathsFromRow(item);
          const urls = paths.map(getPublicUrlFromPath).filter(Boolean);

          return (
            <View style={styles.orderCard}>
              <Text style={styles.cardText}>💾 Commande sauvegardée</Text>

              {/* Pastilles de statut */}
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 8 }}>
                {item.ordered && (
                  <View style={{ backgroundColor: "#cfcfcf", padding: 5, borderRadius: 5 }}>
                    <Text style={{ color: "#92400e", fontWeight: "bold" }}>🚚 Commande passée</Text>
                  </View>
                )}
                {item.received && (
                  <View style={{ backgroundColor: "#bbf7d0", padding: 5, borderRadius: 5 }}>
                    <Text style={{ color: "#166534", fontWeight: "bold" }}>📦 Commande reçue</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.cardTitle}>{item.product}</Text>
                {item.saved && (
                  <TouchableOpacity onPress={() => toggleExpand(item.id)}>
                    <Image source={isExpanded ? EyeSlashIcon : EyeIcon} style={{ width: 24, height: 24, tintColor: "#ccc" }} />
                  </TouchableOpacity>
                )}
              </View>

              {item.recovered && (
                <View style={{ backgroundColor: "#d1fae5", padding: 5, borderRadius: 4, marginTop: 8 }}>
                  <Text style={{ color: "#065f46", fontWeight: "bold" }}>✅ Commande récupérée par le client</Text>
                </View>
              )}

              {/* === GRILLE DE VIGNETTES (multi) === */}
              {urls.length > 0 && (
                <View style={styles.thumbGrid}>
                  {urls.map((u, idx) => (
                    <Pressable key={idx} onPress={() => openImageModal(u)} onLongPress={() =>
                      Alert.alert("Supprimer la photo", "Voulez-vous supprimer cette photo ?", [
                        { text: "Annuler", style: "cancel" },
                        { text: "Supprimer", style: "destructive", onPress: () => deleteOnePhoto(item, paths[idx]) },
                      ])
                    }>
                      <Image source={{ uri: u }} style={styles.thumb} />
                      <View style={styles.thumbBadge}><Text style={styles.thumbBadgeText}>{idx + 1}</Text></View>
                    </Pressable>
                  ))}
                </View>
              )}
              {urls.length > 0 && (
                <Text style={styles.thumbHint}>Touchez pour agrandir • Restez appuyé pour supprimer</Text>
              )}

              <Text style={styles.cardText}>💳 Montant : <Text style={styles.cardValue}>{item.price} €</Text></Text>
              {item.paid_at && (
                <Text style={styles.cardText}>📅 Payée le : <Text style={styles.cardValue}>{new Date(item.paid_at).toLocaleDateString()}</Text></Text>
              )}

              {item.saved && !isExpanded && (
                <TouchableOpacity style={{ alignSelf: "flex-end", marginTop: 10, backgroundColor: "#444", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4 }} onPress={() => toggleExpand(item.id)}>
                  <Text style={{ color: "#fff", fontWeight: "bold" }}> Ouvrir</Text>
                </TouchableOpacity>
              )}

              {(!item.saved || isExpanded) && (
                <>
                  <Text style={styles.cardText}>🔸 Produit: <Text style={styles.cardValue}>{item.product}</Text></Text>
                  <Text style={styles.cardText}>🔸 Marque: <Text style={styles.cardValue}>{item.brand}</Text></Text>
                  <Text style={styles.cardText}>🔸 Modèle: <Text style={styles.cardValue}>{item.model}</Text></Text>
                  <Text style={styles.cardText}>🔸 Acompte: <Text style={styles.cardValue}>{item.deposit} €</Text></Text>
                  <Text style={styles.cardText}>🔸 Montant restant dû : <Text style={[styles.cardValue, { color: item.paid ? "#00ff00" : "#ff5555" }]}>{item.price - (item.deposit || 0)} €</Text></Text>
                  <Text style={styles.cardText}>📅 Créée le : <Text style={styles.cardValue}>{new Date(item.createdat).toLocaleDateString()}</Text></Text>
                  <Text style={styles.cardText}>💳 Statut : <Text style={[styles.cardValue, { color: item.paid ? "lightgreen" : "tomato" }]}>{item.paid ? "✅ Payé" : "❌ Non payé"}</Text></Text>

                  {/* Boutons */}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 10 }}>
                    {/* 📷 Ajouter une photo */}
                    <TouchableOpacity style={[styles.squareButton, uploadingOrderId === item.id && { opacity: 0.6 }]} onPress={() => takeAndUploadOrderPhoto(item)} disabled={uploadingOrderId === item.id}>
                      {uploadingOrderId === item.id ? <ActivityIndicator /> : <Text style={styles.squareButtonText}>📷 Ajouter photo</Text>}
                    </TouchableOpacity>

                    {/* 🖨️ Imprimer */}
                    <TouchableOpacity style={styles.squareButton} onPress={() => {
                      const remaining = item.price - (item.deposit || 0);
                      const order = { id: item.id, client: { id: clientId, name: clientName, ficheNumber: clientNumber }, deviceType: item.product, brand: item.brand, model: item.model, cost: item.price, acompte: item.deposit, remaining, signatureclient: item.signatureclient, printed: item.printed };
                      navigation.navigate("CommandePreviewPage", { order });
                    }}>
                      <Text style={styles.squareButtonText}>🖨️ Imprimer</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.squareButton, item.ordered && { backgroundColor: "#ccc" }]} onPress={() => !item.ordered && handleMarkAsOrdered(item)} disabled={item.ordered}>
                      <Text style={[styles.squareButtonText, item.ordered && { color: "#666" }]}>{item.ordered ? "✅ Commande passée" : "📦 Commande passée"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.squareButton, item.received && { backgroundColor: "#ccc" }]} onPress={() => !item.received && handleMarkAsReceived(item)} disabled={item.received}>
                      <Text style={[styles.squareButtonText, item.received && { color: "#666" }]}>{item.received ? "✅ Reçue" : "📦 Commande reçue"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.squareButton, item.paid && { backgroundColor: "#ccc" }]} onPress={() => !item.paid && handleMarkAsPaid(item)} disabled={item.paid}>
                      <Text style={[styles.squareButtonText, item.paid && { color: "#666" }]}>{item.paid ? "✅ Payé" : "💰 Paiement reçu"}</Text>
                    </TouchableOpacity>

                    {(item.billing?.length ?? 0) === 0 ? (
                      <TouchableOpacity style={styles.squareButton} onPress={() => navigation.navigate("BillingPage", {
                        expressData: {
                          order_id: item.id,
                          clientname: clientName,
                          clientphone: clientPhone,
                          product: item.product,
                          brand: item.brand,
                          model: item.model,
                          price: item.price?.toString(),
                          quantity: "1",
                          description: `${item.product} ${item.brand} ${item.model}`,
                          acompte: item.deposit?.toString() || "0",
                          paymentmethod: item.paymentmethod || "",
                          serial: item.serial || "",
                          paid: item.paid || false,
                        },
                      })}>
                        <Text style={styles.squareButtonText}>🧾 Créer Facture</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.squareButtonDisabled}>
                        <Text style={styles.squareButtonText}>✅ Facture créée</Text>
                      </View>
                    )}

                    <TouchableOpacity style={[styles.squareButton, item.recovered && { backgroundColor: "#ccc" }]} onPress={() => !item.recovered && handleMarkAsRecovered(item)} disabled={item.recovered}>
                      <Text style={[styles.squareButtonText, item.recovered && { color: "#666" }]}>{item.recovered ? "✅ Récupérée" : "📦 Commande récupérée"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.squareButton, item.saved && { backgroundColor: "#ccc" }]} disabled={item.saved} onPress={() => handleSaveOrder(item)}>
                      <Text style={[styles.squareButtonText, item.saved && { color: "#666" }]}>{item.saved ? "✅ Sauvegardée" : "💾 Sauvegarder"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.squareButton} onPress={() => handleDeleteOrder(item)}>
                      <Text style={styles.squareButtonText}>🗑 Supprimer</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.squareButton, (!item.received || item.notified) && { backgroundColor: "#ccc" }]} disabled={!item.received || item.notified} onPress={() => notifyOrderBySMS(item)}>
                      <Text style={[styles.squareButtonText, (!item.received || item.notified) && { color: "#666666" }]}>{item.notified ? "✅ Notifié" : "📩 Notifier"}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.squareButton} onPress={() => navigation.goBack()}>
                      <Text style={styles.squareButtonText}>⬅ Retour</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          );
        }}
      />

      {/* Modal zoom image */}
<Modal
  visible={imageModalVisible}
  animationType="fade"
  transparent={false}                 // ← occupe tout l’écran
  presentationStyle="fullScreen"      // iOS
  statusBarTranslucent={true}         // Android
  onRequestClose={() => setImageModalVisible(false)}
>
  <Pressable
    style={styles.fullscreenContainer}
    onPress={() => setImageModalVisible(false)} // toucher pour fermer
  >
    {imageModalUrl && (
      <Image
        source={{ uri: imageModalUrl }}
        style={styles.fullscreenImage}          // ← 100% largeur/hauteur
        resizeMode="contain"
      />
    )}
    <View style={styles.fullscreenClose}>
      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>✕</Text>
    </View>
  </Pressable>
</Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#e0e0e0" },
  header: { fontSize: 16, fontWeight: "bold", color: "#242424", marginBottom: 10 },
  orderCard: { padding: 20, paddingBottom: 10, backgroundColor: "#cacaca", borderRadius: 10, borderWidth: 1, borderColor: "#3e4c69" },
  cardTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 10, color: "#242424" },
  cardText: { fontSize: 16, marginBottom: 5, color: "#242424" },
  cardValue: { fontWeight: "bold", color: "#242424" },
  input: { borderWidth: 1, borderColor: "#53669b", padding: 10, marginBottom: 20, borderRadius: 5, backgroundColor: "#cacaca", width: "90%", alignSelf: "center" },
  button: { flexDirection: "row", gap: 5, alignItems: "center", backgroundColor: "#191f2f", padding: 15, borderWidth: 1, borderRadius: 2, borderColor: "#888787", marginBottom: 10, marginTop: 10, fontSize: 18, fontWeight: "500", color: "#cacaca" },
  formContainer: { marginBottom: 20 },
  addButton: { width: "60%", padding: 10, borderRadius: 2, alignItems: "center" },
  squareButton: { width: "30%", paddingVertical: 10, backgroundColor: "#191f2f", borderWidth: 1, borderColor: "#888787", borderRadius: 4, marginVertical: 8, alignItems: "center", justifyContent: "center" },
  squareButtonText: { color: "#fff", fontWeight: "bold", textAlign: "center" },
  squareButtonDisabled: { width: "30%", backgroundColor: "#636262", borderWidth: 1, borderColor: "#888787", borderRadius: 4, marginVertical: 8, alignItems: "center", justifyContent: "center" },
  // Grille de vignettes
  thumbGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  thumb: { width: 90, height: 90, borderRadius: 8, borderWidth: 1, borderColor: "#888" },
  thumbBadge: { position: "absolute", bottom: -4, right: -4, backgroundColor: "#000", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  thumbBadgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  thumbHint: { fontSize: 12, color: "#333", marginTop: 6, textAlign: "center" },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "92%", maxHeight: "85%", backgroundColor: "#000", borderRadius: 12, padding: 10 },
  modalImage: { width: "100%", height: 500, borderRadius: 8 },
  closeButton: { position: "absolute", top: 8, right: 8, zIndex: 2, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8 },
  fullscreenContainer: {
  flex: 1,
  backgroundColor: '#000',   // noir, comme au cinéma
  justifyContent: 'center',
  alignItems: 'center',
},
fullscreenImage: {
  width: '100%',
  height: '100%',            // prend toute la hauteur
},
fullscreenClose: {
  position: 'absolute',
  top: 24,
  right: 16,
  backgroundColor: 'rgba(0,0,0,0.6)',
  borderRadius: 16,
  paddingHorizontal: 10,
  paddingVertical: 6,
},

});
