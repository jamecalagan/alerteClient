import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
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
import CustomAlert from "../components/CustomAlert";

export default function AdminPage({ navigation, route }) {
  // Recherche / pagination
  const [searchText, setSearchText] = useState("");
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };
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
      showAlert("Erreur", "Impossible de charger la liste des clients.");
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
      } catch { /* liste pas encore montée, sans effet */ }
    }
  };
  const resetToFirstPage = () => {
    setCurrentPage(1);
    try {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch { /* liste pas encore montée, sans effet */ }
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
      showAlert("Erreur", "Impossible de charger les commandes.");
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
      showAlert("OK", banForm.banned ? "Client banni." : "Client débanni.");
    } catch (e) {
      console.error("saveBan:", e);
      showAlert("Erreur", "Impossible d'enregistrer le bannissement.");
    } finally {
      setBanSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.screen}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            {/* --- Barre d'actions --- */}
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("SearchClientsPage")}
                activeOpacity={0.85}
              >
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="search" size={20} color="#4338ca" />
                </View>
                <Text style={styles.buttonText}>Recherche multi-critères</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("ArticlesPage")}
                activeOpacity={0.85}
              >
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="inventory-2" size={20} color="#4338ca" />
                </View>
                <Text style={styles.buttonText}>
                  Gérer Produits, Marques et Modèles
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("AddProductPage")}
                activeOpacity={0.85}
              >
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="add-box" size={20} color="#4338ca" />
                </View>
                <Text style={styles.buttonText}>Ajouter un produit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => navigation.navigate("RepairPrices")}
                activeOpacity={0.85}
              >
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="build" size={20} color="#4338ca" />
                </View>
                <Text style={styles.buttonText}>Barème réparations</Text>
              </TouchableOpacity>
            </View>

            {/* --- Recherche + Liste --- */}
            <Text style={styles.sectionTitle}>
              Recherche dans la liste complète des clients
            </Text>
            <View style={styles.searchContainer}>
              <MaterialIcons
                name="search"
                size={20}
                color="#94a3b8"
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="RECHERCHER PAR NOM OU TÉLÉPHONE"
                placeholderTextColor="#94a3b8"
                value={searchText}
                autoCapitalize="characters"
                onChangeText={(text) => setSearchText(text.toUpperCase())}
              />
            </View>

            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>Liste complète des clients</Text>
            </View>

            <View style={styles.filterRow}>
              <TouchableOpacity
                style={styles.smallActionButton}
                onPress={() => navigation.navigate("ArchivesInterventionsPage")}
                activeOpacity={0.85}
              >
                <MaterialIcons name="receipt-long" size={16} color="#334155" />
                <Text style={styles.smallActionText}>
                  Archives (Non réparables)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.smallActionButton,
                  showOrdersOnly && styles.smallActionButtonActive,
                ]}
                onPress={() => setShowOrdersOnly((v) => !v)}
                activeOpacity={0.85}
              >
                <MaterialIcons
                  name="shopping-cart"
                  size={16}
                  color={showOrdersOnly ? "#fff" : "#334155"}
                />
                <Text
                  style={[
                    styles.smallActionText,
                    showOrdersOnly && styles.smallActionTextActive,
                  ]}
                >
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
                contentContainerStyle={{ paddingBottom: 4 }}
                renderItem={({ item }) => {
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
                      style={styles.clientItem}
                      activeOpacity={0.9}
                    >
                      {(hasAnyOrder || item?.banned === true) && (
                        <View style={styles.badgeRow}>
                          {hasAnyOrder && (
                            <View style={styles.orderBadge}>
                              <MaterialIcons
                                name="shopping-cart"
                                size={12}
                                color="#8a7b5a"
                              />
                              <Text style={styles.orderBadgeText}>
                                {item.orders.length > 1
                                  ? `${item.orders.length} commandes`
                                  : "Commande"}
                              </Text>
                            </View>
                          )}
                          {item?.banned === true && (
                            <View style={styles.banBadge}>
                              <Text style={styles.banBadgeText}>BANNI</Text>
                            </View>
                          )}
                        </View>
                      )}

                      <View style={styles.ficheBadge}>
                        <Text style={styles.ficheBadgeText}>
                          N° {item?.ficheNumber || "—"}
                        </Text>
                      </View>
                      <Text style={styles.clientName}>
                        {item?.name || "Non disponible"}
                      </Text>
                      <Text style={styles.clientPhone}>
                        {item?.phone
                          ? item.phone.replace(/(\d{2})(?=\d)/g, "$1 ")
                          : "Non disponible"}
                      </Text>

                      {/* Actions client */}
                      <View style={styles.clientActionsRow}>
                        <TouchableOpacity
                          style={[
                            styles.banBtn,
                            item?.banned
                              ? { backgroundColor: "#fee2e2" }
                              : { backgroundColor: "#dcfce7" },
                          ]}
                          onPress={() => openBanModal(item)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.banBtnText,
                              item?.banned
                                ? { color: "#b91c1c" }
                                : { color: "#15803d" },
                            ]}
                          >
                            {item?.banned ? "Débannir" : "Bannir"}
                          </Text>
                        </TouchableOpacity>

                        <Pressable
                          onPress={() =>
                            navigation.navigate("ClientInterventionsPage", {
                              clientId: item.id,
                            })
                          }
                          android_ripple={{ color: "rgba(255,255,255,0.25)" }}
                          style={({ pressed }) => [
                            styles.primaryBtn,
                            { flex: 1 },
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
              activeOpacity={0.85}
            >
              <MaterialIcons name="cloud-upload" size={18} color="#334155" />
              <Text style={styles.backupButtonText}>
                Sauvegarder les images
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.webSearchButton}
              onPress={() => navigation.navigate("ProductViewer")}
              activeOpacity={0.85}
            >
              <MaterialIcons name="travel-explore" size={18} color="#fff" />
              <Text style={styles.webSearchButtonText}>
                Recherche de produit sur le web
              </Text>
            </TouchableOpacity>

            {/* Pagination */}
            <View style={styles.pager}>
              <TouchableOpacity onPress={resetToFirstPage} style={styles.pagerBtn}>
                <MaterialIcons name="first-page" size={20} color="#4338ca" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.pagerBtn,
                  currentPage <= 1 && styles.pagerBtnDisabled,
                ]}
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
                Page {currentPage} / {totalPages}
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
                    {
                      tintColor:
                        currentPage >= totalPages ? "#cbd5e1" : "#4338ca",
                    },
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
            <View style={styles.modalCardHandle} />
            <View style={styles.modalIconCircleBlue}>
              <MaterialIcons name="receipt-long" size={26} color="#2563EB" />
            </View>
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
                style={{ width: "100%" }}
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
                          (unitPrice != null
                            ? Number(unitPrice) * Number(qty)
                            : null);

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
            <View
              style={
                banForm.banned
                  ? styles.modalIconCircleRed
                  : styles.modalIconCircleGreen
              }
            >
              <MaterialIcons
                name={banForm.banned ? "block" : "how-to-reg"}
                size={26}
                color={banForm.banned ? "#DC2626" : "#16A34A"}
              />
            </View>
            <Text style={styles.modalTitle}>
              {banForm.banned ? "Bannir le client" : "Débannir le client"}
            </Text>

            <View style={styles.banRow}>
              <Text style={styles.banLabel}>Client banni</Text>
              <Switch
                value={banForm.banned}
                onValueChange={(v) =>
                  setBanForm((prev) => ({ ...prev, banned: v }))
                }
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
                placeholderTextColor="#9CA3AF"
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setBanModalVisible(false)}
                disabled={banSaving}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, banSaving && { opacity: 0.6 }]}
                onPress={saveBan}
                disabled={banSaving}
                activeOpacity={0.85}
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

        <CustomAlert
          visible={alertVisible}
          title={alertTitle}
          message={alertMessage}
          onClose={() => setAlertVisible(false)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

// -------------------- Styles --------------------
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  container: { flex: 1, padding: 16 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    height: 96,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  buttonText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 11,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginVertical: 12,
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: "#0f172a",
    paddingHorizontal: 10,
  },
  searchIcon: {},

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  smallActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  smallActionButtonActive: {
    backgroundColor: "#4338ca",
  },
  smallActionText: { color: "#334155", fontSize: 12, fontWeight: "700" },
  smallActionTextActive: { color: "#fff" },

  clientItem: {
    padding: 14,
    backgroundColor: "#ffffff",
    marginVertical: 6,
    borderRadius: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },

  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  orderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  orderBadgeText: { fontSize: 11, fontWeight: "700", color: "#92400e" },

  banBadge: {
    backgroundColor: "#fee2e2",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  banBadgeText: { fontSize: 11, fontWeight: "700", color: "#b91c1c" },

  ficheBadge: {
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
    marginBottom: 6,
  },
  ficheBadgeText: { color: "#4338ca", fontWeight: "700", fontSize: 11 },

  clientName: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  clientPhone: { fontSize: 13, color: "#64748b", marginTop: 2 },
  clientActionsRow: { flexDirection: "row", gap: 8, marginTop: 10 },

  banBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  banBtnText: { fontWeight: "700", fontSize: 13 },

  noDataText: { textAlign: "center", color: "#94a3b8", marginTop: 20 },

  backupButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#e2e8f0",
    paddingVertical: 12,
    marginVertical: 6,
    borderRadius: 12,
  },
  backupButtonText: { color: "#334155", fontWeight: "700", fontSize: 13 },
  webSearchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 2,
  },
  webSearchButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
    marginTop: 6,
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

  // Modales (fond)
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    padding: 16,
  },

  // Modale commandes
  modalCard: {
    width: 420,
    maxWidth: "100%",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalCardHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 10,
  },
  modalIconCircleBlue: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  modalIconCircleRed: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  modalIconCircleGreen: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    textAlign: "center",
  },
  orderRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    marginBottom: 8,
    width: "100%",
  },
  orderLine: { fontSize: 14, color: "#374151", marginBottom: 2 },
  orderStatus: { marginTop: 6, fontWeight: "700" },
  statusPaid: { color: "#16A34A" },
  statusUnpaid: { color: "#DC2626" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
    width: "100%",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#4338ca",
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryBtnPressed: { opacity: 0.85 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  secondaryBtnText: { color: "#374151", fontWeight: "700", fontSize: 15 },

  // Modale Ban/Déban
  banModalCard: {
    width: 380,
    maxWidth: "100%",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  banRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderColor: "#E5E7EB",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: "#F9FAFB",
    width: "100%",
  },
  banLabel: { fontSize: 16, fontWeight: "600", color: "#111827" },

  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    color: "#111827",
  },
});
