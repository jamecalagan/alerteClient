import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Image,
  Modal,
  ActivityIndicator,
  Switch,
  Pressable,
} from "react-native";
import { supabase } from "../supabaseClient";
import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import BottomNavigation from "../components/BottomNavigation";

export default function AdminPage({ navigation, route }) {
  // Recherche / pagination
  const [searchText, setSearchText] = useState("");
  const [filteredClients, setFilteredClients] = useState([]);
  const [clients, setClients] = useState({ all: [] });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;
  const totalPages = Math.ceil((filteredClients?.length || 0) / itemsPerPage);
  const [showOrdersOnly, setShowOrdersOnly] = useState(false);
  const listRef = useRef(null);

  // Modale Commandes
  const [ordersModalVisible, setOrdersModalVisible] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersForClient, setOrdersForClient] = useState([]);
  const [ordersClient, setOrdersClient] = useState(null);

  // Modale Ban/Déban
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [banClient, setBanClient] = useState(null);
  const [banSaving, setBanSaving] = useState(false);
  const [banForm, setBanForm] = useState({ banned: false, ban_reason: "" });

  // Helpers
  const norm = (s) =>
    (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const digits = (s) => (s ?? "").toString().replace(/\D/g, "");
  const hasWantedOrder = (orders = []) =>
    Array.isArray(orders) && orders.length > 0;

  // Chargement clients
  const loadClients = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select(`
          id, name, phone, ficheNumber,
          banned, ban_reason, banned_at, banned_by,
          interventions ( id, status ),
          orders ( id, paid )
        `)
        .order("name", { ascending: true });

      if (error) throw error;
      const arr = data || [];
      setClients({ all: arr });
      setFilteredClients(arr);
      setCurrentPage(1);
      setSearchText((s) => s ?? "");
    } catch (e) {
      console.error("loadClients:", e);
      Alert.alert("Erreur", "Impossible de charger la liste des clients.");
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Rechargement fiable au retour sur la page
  useFocusEffect(
    useCallback(() => {
      loadClients();
      return () => {};
    }, [loadClients])
  );

  // Filtrage
  useEffect(() => {
    const q = searchText ?? "";
    const qNorm = norm(q);
    const qDigits = digits(q);

    const base = showOrdersOnly
      ? (clients.all || []).filter(
          (c) => Array.isArray(c?.orders) && hasWantedOrder(c.orders)
        )
      : clients.all || [];

    if (q.trim() === "") {
      setFilteredClients(base);
      setCurrentPage(1);
      return;
    }

    const filtered = base.filter((c) => {
      const nameNorm = norm(c?.name);
      const ficheStr = (c?.ficheNumber ?? "").toString().toLowerCase();
      const phoneDigit = digits(c?.phone);
      const hitName = nameNorm.includes(qNorm);
      const hitFiche = ficheStr.includes(qNorm);
      const hitPhone = qDigits.length > 0 && phoneDigit.includes(qDigits);
      return hitName || hitFiche || hitPhone;
    });

    const safe = filtered.length === 0 && q.trim() !== "" ? base : filtered;
    setFilteredClients(safe);
    setCurrentPage(1);
  }, [searchText, clients, showOrdersOnly]);

  // Pagination
  const currentData = (filteredClients || []).slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= Math.max(totalPages, 1)) {
      setCurrentPage(newPage);
      try {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } catch {}
    }
  };
  const resetToFirstPage = () => {
    setCurrentPage(1);
    try {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch {}
  };

  // Commandes d'un client
  const showClientOrders = async (client) => {
    setOrdersClient(client);
    setOrdersModalVisible(true);
    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`*, created_at:createdat`)
        .eq("client_id", client.id)
        .order("createdat", { ascending: false });

      if (error) throw error;
      setOrdersForClient(data || []);
    } catch (e) {
      console.error("Erreur chargement commandes:", e);
      Alert.alert("Erreur", "Impossible de charger les commandes.");
      setOrdersForClient([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  // BAN / DEBAN
  const openBanModal = (client) => {
    setBanClient(client);
    setBanForm({
      banned: client?.banned === true,
      ban_reason: client?.ban_reason || "",
    });
    setBanModalVisible(true);
  };

  const getCurrentUserId = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      return data?.user?.id || null;
    } catch {
      return null;
    }
  };

  const saveBan = async () => {
    if (!banClient?.id) {
      setBanModalVisible(false);
      return;
    }
    try {
      setBanSaving(true);
      const userId = await getCurrentUserId();

      const payload = banForm.banned
        ? {
            banned: true,
            ban_reason: (banForm.ban_reason || "").trim(),
            banned_at: new Date().toISOString(),
            banned_by: userId,
          }
        : {
            banned: false,
            ban_reason: null,
            banned_at: null,
            banned_by: null,
          };

      const { error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", banClient.id);

      if (error) throw error;

      await loadClients();
      setBanModalVisible(false);
      setBanClient(null);
      setBanForm({ banned: false, ban_reason: "" });
      Alert.alert("OK", banForm.banned ? "Client banni." : "Client débanni.");
    } catch (e) {
      console.error("saveBan:", e);
      Alert.alert("Erreur", "Impossible d'enregistrer le bannissement.");
    } finally {
      setBanSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, backgroundColor: "#e0e0e0" }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            {/* --- Barre d'actions --- */}
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("SearchClientsPage")}
              >
                <Image
                  source={require("../assets/icons/search.png")}
                  style={styles.iconSearch}
                />
                <Text style={styles.buttonText}>Recherche multi-critères</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("ArticlesPage")}
              >
                <Image
                  source={require("../assets/icons/list.png")}
                  style={styles.iconSearch}
                />
                <Text style={styles.buttonText}>
                  Gérer Produits, Marques et Modèles
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("AddProductPage")}
              >
                <Image
                  source={require("../assets/icons/add_product.png")}
                  style={styles.iconSearch}
                />
                <Text style={styles.buttonText}>Ajouter un produit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("RepairPrices")}
              >
                <Image
                  source={require("../assets/icons/tools.png")}
                  style={styles.iconSearch}
                />
                <Text style={styles.buttonText}>Barème réparations</Text>
              </TouchableOpacity>
            </View>

            {/* --- Recherche + Liste --- */}
            <Text style={styles.sectionTitle}>
              Recherche dans la liste complète des clients
            </Text>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="RECHERCHER PAR NOM OU TÉLÉPHONE"
                placeholderTextColor="#575757"
                value={searchText}
                autoCapitalize="characters"
                onChangeText={(text) => setSearchText(text.toUpperCase())}
              />
              <MaterialIcons
                name="search"
                size={24}
                color="#888787"
                style={styles.searchIcon}
              />
            </View>

            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>Liste complète des clients</Text>

              <TouchableOpacity
              style={styles.smallActionButton}
                onPress={() => navigation.navigate("ArchivesInterventionsPage")}
                activeOpacity={0.8}
              >
              <MaterialIcons name="receipt-long" size={18} color="#fff" />
                <Text style={styles.smallActionText}>Archives (Non réparables)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.smallActionButton}
                onPress={() => setShowOrdersOnly((v) => !v)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="receipt-long" size={18} color="#fff" />
                <Text style={styles.smallActionText}>
                  {showOrdersOnly
                    ? "Voir tous les clients"
                    : "Voir fiches avec commandes"}
                </Text>
              </TouchableOpacity>
            </View>

            {currentData.length > 0 ? (
              <FlatList
                ref={listRef}
                data={currentData}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ paddingBottom: 80 }}
                renderItem={({ item, index }) => {
                  const hasAnyOrder =
                    Array.isArray(item?.orders) && item.orders.length > 0;

                  return (
                    <TouchableOpacity
                      onPress={() => {
                        if (hasAnyOrder) {
                          showClientOrders(item);
                        } else {
                          navigation.navigate("ClientInterventionsPage", {
                            clientId: item.id,
                          });
                        }
                      }}
                      style={[
                        styles.clientItem,
                        { backgroundColor: index % 2 === 0 ? "#d3d3d3" : "#b1b1b1" },
                      ]}
                    >
                      {/* Badge Commandes */}
                      {hasAnyOrder && (
                        <>
                          <View style={styles.orderBadge}>
                            <Text style={styles.orderBadgeText}>
                              {item.orders.length > 1
                                ? `${item.orders.length} commandes`
                                : "Commande"}
                            </Text>
                          </View>
                          <MaterialIcons
                            name="shopping-cart"
                            size={20}
                            color="#1f4d1f"
                            style={styles.orderIcon}
                          />
                        </>
                      )}

                      {/* Badge BANNI */}
                      {item?.banned === true && (
                        <View style={styles.banBadge}>
                          <Text style={styles.banBadgeText}>BANNI</Text>
                        </View>
                      )}

                      <Text style={styles.clientText}>
                        Fiche client N°: {item?.ficheNumber || "Non disponible"}
                      </Text>
                      <Text style={styles.clientText}>
                        Nom : {item?.name || "Non disponible"}
                      </Text>
                      <Text style={styles.clientText}>
                        Téléphone :{" "}
                        {item?.phone
                          ? item.phone.replace(/(\d{2})(?=\d)/g, "$1 ")
                          : "Non disponible"}
                      </Text>

                      {/* Actions client */}
                      <View style={styles.clientActionsRow}>
                        <TouchableOpacity
                          style={[
                            styles.banBtn,
                            item?.banned ? { backgroundColor: "#7f1d1d" } : { backgroundColor: "#0f766e" },
                          ]}
                          onPress={() => openBanModal(item)}
                          activeOpacity={0.85}
                        >
                          <Text style={styles.banBtnText}>
                            {item?.banned ? "Débannir" : "Bannir"}
                          </Text>
                        </TouchableOpacity>

<Pressable
  onPress={() =>
    navigation.navigate("ClientInterventionsPage", { clientId: item.id })
  }
  android_ripple={{ color: "rgba(255,255,255,0.25)" }}
  style={({ pressed }) => [
    styles.primaryBtn,
    pressed && styles.primaryBtnPressed,
  ]}
>
  <Text style={styles.primaryBtnText}>Voir</Text>
</Pressable>

                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <Text style={styles.noDataText}>Aucun client à afficher.</Text>
            )}

            {/* Bas de page */}
            <TouchableOpacity
              onPress={() => navigation.navigate("ImageBackup")}
              style={styles.backupButton}
            >
              <Text style={{ color: "#888787", fontWeight: "bold" }}>
                SAUVEGARDER LES IMAGES
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.webSearchButton}
              onPress={() => navigation.navigate("ProductViewer")}
            >
              <Text style={{ color: "#fff", textAlign: "center" }}>
                🔍 Recherche de produit sur le web
              </Text>
            </TouchableOpacity>

            {/* Pagination */}
            <View style={styles.paginationContainer}>
              <TouchableOpacity onPress={resetToFirstPage} style={styles.chevronButton}>
                <MaterialIcons name="first-page" size={40} color="#08d14b" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                style={styles.chevronButton}
              >
                <Image
                  source={require("../assets/icons/chevrong.png")}
                  style={[
                    styles.chevronIcon,
                    { tintColor: currentPage === 1 ? "gray" : "white" },
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
                    { tintColor: currentPage === totalPages ? "gray" : "white" },
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>

        <BottomNavigation navigation={navigation} currentRoute={route.name} />

        {/* Modale Commandes */}
        <Modal
          visible={ordersModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setOrdersModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setOrdersModalVisible(false)}>
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>

          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Commandes — {ordersClient?.name || "Client"}
            </Text>

            {ordersLoading ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="large" />
                <Text style={{ marginTop: 10, color: "#444" }}>Chargement…</Text>
              </View>
            ) : ordersForClient.length === 0 ? (
              <Text style={styles.noDataText}>Aucune commande.</Text>
            ) : (
              <FlatList
                data={ordersForClient}
                keyExtractor={(o) => String(o.id)}
                contentContainerStyle={{ paddingBottom: 10 }}
                renderItem={({ item: o }) => (
                  <View style={styles.orderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderLine}>
                        N° {o.id} —{" "}
                        {o?.created_at
                          ? new Date(o.created_at).toLocaleDateString()
                          : o?.createdat
                          ? new Date(o.createdat).toLocaleDateString()
                          : "date inconnue"}
                      </Text>

                      {!!o?.product && (
                        <Text style={styles.orderLine}>
                          Produit : {o.product}
                          {o?.brand ? ` · ${o.brand}` : ""}
                          {o?.model ? ` · ${o.model}` : ""}
                        </Text>
                      )}

                      {(() => {
                        const qty = o?.quantity ?? o?.qty ?? 1;
                        const unitPrice =
                          o?.unit_price ??
                          o?.unitPrice ??
                          o?.price_unit ??
                          o?.priceUnit ??
                          o?.price ??
                          null;
                        const total =
                          o?.total ??
                          (unitPrice != null ? Number(unitPrice) * Number(qty) : null);

                        return (
                          <Text style={styles.orderLine}>
                            Qté {qty}
                            {unitPrice != null ? ` · PU ${unitPrice}€` : ""}
                            {total != null ? ` · Total ${total}€` : ""}
                          </Text>
                        );
                      })()}

                      <Text
                        style={[
                          styles.orderStatus,
                          o?.paid ? styles.statusPaid : styles.statusUnpaid,
                        ]}
                      >
                        {o?.paid ? "Terminée (réglée)" : "En cours (non réglée)"}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  setOrdersModalVisible(false);
                  if (ordersClient?.id) {
                    navigation.navigate("ClientInterventionsPage", {
                      clientId: ordersClient.id,
                    });
                  }
                }}
              >
                <Text style={styles.secondaryBtnText}>Voir interventions</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setOrdersModalVisible(false)}
              >
                <Text style={styles.primaryBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Modale Bannir / Débannir */}
        <Modal
          visible={banModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setBanModalVisible(false)}
        >
          <TouchableWithoutFeedback onPress={() => setBanModalVisible(false)}>
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>

          <View style={styles.banModalCard}>
            <Text style={styles.modalTitle}>
              {banForm.banned ? "Bannir le client" : "Débannir le client"}
            </Text>

            <View style={styles.banRow}>
              <Text style={styles.banLabel}>Client banni</Text>
              <Switch
                value={banForm.banned}
                onValueChange={(v) => setBanForm((prev) => ({ ...prev, banned: v }))}
              />
            </View>

            {banForm.banned && (
              <TextInput
                style={styles.input}
                value={banForm.ban_reason}
                onChangeText={(t) =>
                  setBanForm((prev) => ({ ...prev, ban_reason: t }))
                }
                placeholder="Raison du bannissement (facultatif)"
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setBanModalVisible(false)}
                disabled={banSaving}
              >
                <Text style={styles.secondaryBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, banSaving && { opacity: 0.6 }]}
                onPress={saveBan}
                disabled={banSaving}
              >
                {banSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

// -------------------- Styles --------------------
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#191f2f",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 5,
    height: 100,
  },
  iconSearch: { width: 24, height: 24, tintColor: "#fff", marginBottom: 8 },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
    textAlign: "center",
  },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: "#242424", marginVertical: 10 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#888787",
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 15,
    backgroundColor: "#cacaca",
  },
  searchInput: {
    flex: 1, height: 40, fontSize: 16, color: "#242424", paddingHorizontal: 10,
  },
  searchIcon: { marginLeft: 10 },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 6,
  },
  smallActionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#191f2f",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#888787",
  },
  smallActionText: { color: "#fff", marginLeft: 6, fontSize: 12, fontWeight: "bold" },

  clientItem: {
    position: "relative",
    padding: 15,
    borderColor: "#888787",
    backgroundColor: "#f0f0f0",
    marginVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    elevation: 5,
  },

  // Badges
  orderBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#d9c7a1",
    borderColor: "#8a7b5a",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderTopRightRadius: 5,
    borderBottomLeftRadius: 5,
    zIndex: 2,
  },
  orderBadgeText: { fontSize: 11, fontWeight: "bold", color: "#3a3120" },
  orderIcon: { position: "absolute", top: 8, right: 80, opacity: 0.9 },

  banBadge: {
    position: "absolute",
    top: -8,
    left: -8,
    backgroundColor: "#fee2e2",
    borderColor: "#b91c1c",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderTopLeftRadius: 5,
    borderBottomRightRadius: 5,
    zIndex: 2,
  },
  banBadgeText: { fontSize: 11, fontWeight: "bold", color: "#7f1d1d" },

  clientText: { fontSize: 16, color: "#242424" },
  clientActionsRow: { flexDirection: "row", gap: 8, marginTop: 8 },

  banBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  banBtnText: { color: "#fff", fontWeight: "bold" },

  noDataText: { textAlign: "center", color: "#888888", marginTop: 20 },

  backupButton: {
    backgroundColor: "#24435c",
    padding: 12,
    marginVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#888787",
    alignItems: "center",
  },
  webSearchButton: {
    backgroundColor: "#007bff",
    padding: 10,
    borderRadius: 8,
    marginTop: 5,
  },

  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 10,
    marginBottom: 40,
  },
  chevronButton: { padding: 5 },
  chevronIcon: { width: 22, height: 22 },
  paginationText: { marginHorizontal: 10, color: "#242424", fontSize: 20 },

  // Modales (fond)
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },

  // Modale commandes
  modalCard: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    backgroundColor: "#f7f7f7",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: 1,
    borderColor: "#cfcfcf",
    padding: 14,
    maxHeight: "75%",
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#242424", marginBottom: 10 },
  orderRow: {
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1, borderColor: "#d0d0d0",
    backgroundColor: "#ffffff", marginBottom: 8,
  },
  orderLine: { fontSize: 14, color: "#333", marginBottom: 2 },
  orderStatus: { marginTop: 6, fontWeight: "bold" },
  statusPaid: { color: "#0a6b0a" },
  statusUnpaid: { color: "#7a1b1b" },
  modalActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  primaryBtn: { backgroundColor: "#191f2f", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "bold" },
  secondaryBtn: {
    backgroundColor: "#e6e6e6",
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1, borderColor: "#bdbdbd",
  },
  secondaryBtnText: { color: "#333", fontWeight: "bold" },

  // Modale Ban/Déban
  banModalCard: {
    position: "absolute",
    top: "20%",
    left: 16,
    right: 16,
    backgroundColor: "#f7f7f7",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cfcfcf",
    padding: 14,
  },
  banRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderColor: "#e5e7eb",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: "#f9fafb",
  },
  banLabel: { fontSize: 16, fontWeight: "600", color: "#111827" },

  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
});
