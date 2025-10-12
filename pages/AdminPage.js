import React, { useState, useEffect, useRef } from "react";
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
} from "react-native";
import { supabase } from "../supabaseClient";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import BottomNavigation from "../components/BottomNavigation";

export default function AdminPage({ navigation, route }) {
  const [searchText, setSearchText] = useState("");
  const [filteredClients, setFilteredClients] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  const totalPages = Math.ceil((filteredClients?.length || 0) / itemsPerPage);
  const [showOrdersOnly, setShowOrdersOnly] = useState(false);
  const [ordersModalVisible, setOrdersModalVisible] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersForClient, setOrdersForClient] = useState([]);
  const [ordersClient, setOrdersClient] = useState(null);
  const listRef = useRef(null);

  const currentData = (filteredClients || []).slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= Math.max(totalPages, 1)) {
      setCurrentPage(newPage);
    }
  };
  const resetToFirstPage = () => {
    setCurrentPage(1);
    // Remonter en haut de la liste
    try {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch {}
  };

  const showClientOrders = async (client) => {
    setOrdersClient(client);
    setOrdersModalVisible(true);
    setOrdersLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(`*, created_at:createdat`) // alias si ta colonne est "createdat"
        .eq("client_id", client.id)
        .order("createdat", { ascending: false }); // trie sur le vrai nom

      if (error) throw error;
      setOrdersForClient(data || []);
    } catch (e) {
      console.error("Erreur chargement commandes:", e);
      Alert.alert(
        "Erreur",
        "Impossible de charger les commandes de ce client."
      );
      setOrdersForClient([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Helpers recherche
  const norm = (s) =>
    (s ?? "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // sans accents
      .toLowerCase()
      .trim();

  const digits = (s) => (s ?? "").toString().replace(/\D/g, "");

  const [clients, setClients] = useState({
    all: [],
  });
  // ✅ True si le client a au moins UNE commande (passée ou en cours)
  const hasWantedOrder = (orders = []) =>
    Array.isArray(orders) && orders.length > 0;

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const { data, error } = await supabase.from("clients").select(`
                *,
                interventions (
                    id,
                    status
                ),
                orders ( id, paid )
            `);

      if (error) throw error;

      if (data) {
        setClients({ all: data });
        setFilteredClients(data);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des clients :", error);
      Alert.alert(
        "Erreur",
        "Une erreur est survenue lors du chargement des clients."
      );
    }
  };

  useEffect(() => {
    const q = searchText ?? "";
    const qNorm = norm(q);
    const qDigits = digits(q);

    // 1) Point de départ : soit tous, soit seulement ceux avec commandes éligibles
    const base = showOrdersOnly
      ? (clients.all || []).filter(
          (c) => Array.isArray(c?.orders) && hasWantedOrder(c.orders)
        )
      : clients.all || [];

    // 2) Si saisie vide -> on affiche la base “telle quelle”
    if (q.trim() === "") {
      setFilteredClients(base);
      setCurrentPage(1);
      return;
    }

    // 3) Filtre texte (nom, fiche, téléphone)
    const filtered = base.filter((c) => {
      const nameNorm = norm(c?.name);
      const ficheStr = (c?.ficheNumber ?? "").toString().toLowerCase();
      const phoneDigit = digits(c?.phone);

      const hitName = nameNorm.includes(qNorm);
      const hitFiche = ficheStr.includes(qNorm);
      const hitPhone = qDigits.length > 0 && phoneDigit.includes(qDigits);

      return hitName || hitFiche || hitPhone;
    });

    setFilteredClients(filtered);
    setCurrentPage(1);
  }, [searchText, clients, showOrdersOnly]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, backgroundColor: "#e0e0e0" }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.container}>
            {/* -------------------- Barre de boutons actions -------------------- */}
            <View style={styles.row}>
              {/* Recherche multi-critères */}
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

              {/* Gestion produits, marques, modèles */}
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

              {/* Ajouter un produit */}
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

              {/* ➕ Nouveau bouton Barème des réparations */}
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

            {/* -------------------- Recherche + Liste clients -------------------- */}
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

            {/* Titre + bouton filtre commandes */}
            <View style={styles.titleRow}>
              <Text style={styles.sectionTitle}>
                Liste complète des clients
              </Text>

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
                data={currentData || []}
                keyExtractor={(item) => item.id?.toString()}
                contentContainerStyle={{ paddingBottom: 80 }}
                renderItem={({ item, index }) => {
                  const hasAnyOrder =
                    Array.isArray(item?.orders) && item.orders.length > 0;

                  return (
                    <TouchableOpacity
                      onPress={() => {
                        const hasAnyOrder =
                          Array.isArray(item?.orders) && item.orders.length > 0;
                        if (hasAnyOrder) {
                          showClientOrders(item); // 👉 ouvre la modale commandes
                        } else {
                          navigation.navigate("ClientInterventionsPage", {
                            clientId: item.id,
                          });
                        }
                      }}
                      style={[
                        styles.clientItem, // ✅ indispensable (position: "relative", padding, bordures…)
                        {
                          backgroundColor:
                            index % 2 === 0 ? "#d3d3d3" : "#b1b1b1",
                        },
                      ]}
                    >
                      {/* ✅ Icône + badge si commande(s) */}
                      {Array.isArray(item?.orders) &&
                        item.orders.length > 0 && (
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
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <Text style={styles.noDataText}>Aucun client à afficher.</Text>
            )}

            {/* -------------------- Boutons actions bas de page -------------------- */}
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
              <TouchableOpacity
                onPress={resetToFirstPage}
                style={styles.chevronButton}
              >
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
                    {
                      tintColor: currentPage === totalPages ? "gray" : "white",
                    },
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>

        <BottomNavigation navigation={navigation} currentRoute={route.name} />
        {/* ===== Modale Détails Commandes ===== */}
        {/* ===== Modale Détails Commandes ===== */}
        <Modal
          visible={ordersModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setOrdersModalVisible(false)}
        >
          {/* Fond semi-transparent (ferme en tapant dehors) */}
          <TouchableWithoutFeedback
            onPress={() => setOrdersModalVisible(false)}
          >
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>

          {/* Carte du bas */}
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Commandes — {ordersClient?.name || "Client"}
            </Text>

            {ordersLoading ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="large" />
                <Text style={{ marginTop: 10, color: "#444" }}>
                  Chargement…
                </Text>
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
                        {o?.paid
                          ? "Terminée (réglée)"
                          : "En cours (non réglée)"}
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
      </View>
    </KeyboardAvoidingView>
  );
}

// -------------------- Styles --------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
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
  iconSearch: {
    width: 24,
    height: 24,
    tintColor: "#fff",
    marginBottom: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#242424",
    marginVertical: 10,
  },
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
    flex: 1,
    height: 40,
    fontSize: 16,
    color: "#242424",
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginLeft: 10,
  },
  clientItem: {
    position: "relative", // <— important pour positionner le badge/icone
    padding: 15,
    borderColor: "#888787",
    backgroundColor: "#f0f0f0",
    marginVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    elevation: 5,
  },
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
  orderBadgeText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#3a3120",
  },
  orderIcon: {
    position: "absolute",
    top: 8,
    right: 80, // écart du ruban; ajuste si besoin
    opacity: 0.9,
  },

  clientText: {
    fontSize: 16,
    color: "#242424",
  },
  noDataText: {
    textAlign: "center",
    color: "#888888",
    marginTop: 20,
  },
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
    backgroundColor: "#191f2f", // sobre, dans la continuité
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#888787",
  },

  smallActionText: {
    color: "#fff",
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#f7f7f7",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: 1,
    borderColor: "#cfcfcf",
    padding: 14,
    maxHeight: "75%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#242424",
    marginBottom: 10,
  },
  orderRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d0d0d0",
    backgroundColor: "#ffffff",
    marginBottom: 8,
  },
  orderLine: {
    fontSize: 14,
    color: "#333",
    marginBottom: 2,
  },
  orderStatus: {
    marginTop: 6,
    fontWeight: "bold",
  },
  statusPaid: {
    color: "#0a6b0a",
  },
  statusUnpaid: {
    color: "#7a1b1b",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  primaryBtn: {
    backgroundColor: "#191f2f",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  secondaryBtn: {
    backgroundColor: "#e6e6e6",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bdbdbd",
  },
  secondaryBtnText: {
    color: "#333",
    fontWeight: "bold",
  },
});
