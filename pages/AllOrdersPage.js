import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    FlatList,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
} from "react-native";
import { supabase } from "../supabaseClient";

const ITEMS_PER_PAGE = 2;

export default function AllOrdersPage({ navigation }) {
    const [orders, setOrders] = useState([]);
    const [search, setSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [editingOrderId, setEditingOrderId] = useState(null);
    const [editedOrder, setEditedOrder] = useState({});
    const [filterStatus, setFilterStatus] = useState("all"); // "all", "pending", "completed"
    const [suggestions, setSuggestions] = useState([]);
    const [focusedField, setFocusedField] = useState(null);
    const [showDeleted, setShowDeleted] = useState(false);
	const [activeCount, setActiveCount] = useState(0);
	const [deletedCount, setDeletedCount] = useState(0);
	
    const getStatusIcon = (order) => {
        if (order.recovered && order.paid) return "🟢";
        if (order.received || order.paid) return "🟡";
        return "🔴";
    };
    const getStatusText = (order) => {
        if (order.recovered && order.paid) return "Terminée";
        if (order.received || order.paid) return "En cours";
        return "En attente";
    };
    useEffect(() => {
        fetchOrders();
    }, []);
    const handleSearchChange = (text) => {
        setSearch(text);

        const lower = text.toLowerCase();
        const matches = orders.filter(
            (order) =>
                order.product?.toLowerCase().includes(lower) ||
                order.brand?.toLowerCase().includes(lower) ||
                order.model?.toLowerCase().includes(lower) ||
                order.clients?.name?.toLowerCase().includes(lower) ||
                order.clients?.ficheNumber?.toString().includes(lower)
        );

        setSuggestions(text.length > 0 ? matches.slice(0, 5) : []);
    };

    const fetchOrders = async () => {
        const { data, error } = await supabase
            .from("orders")
            .select("*, clients(name, ficheNumber), billing(id)")
            .order("createdat", { ascending: false });

        if (error) {
            console.error("Erreur chargement commandes :", error);
            return;
        }

        const sorted = (data || []).sort((a, b) => {
            const priority = (order) => {
                const received = !!order.received;
                const paid = !!order.paid;
                const recovered = !!order.recovered;

                if (!received && !paid && !recovered) return 0;
                if ((received || paid) && !recovered) return 1;
                if (recovered) return 2;
                return 3;
            };
            return priority(a) - priority(b);
        });

        setOrders(sorted);
		setActiveCount(data.filter(o => !o.deleted).length);
setDeletedCount(data.filter(o => o.deleted).length);
    };

    const handleEditOrder = (item) => {
        setEditingOrderId(item.id);
        setEditedOrder({
            product: item.product,
            brand: item.brand,
            model: item.model,
            price: item.price?.toString() || "",
            deposit: item.deposit?.toString() || "",
        });
    };

    const handleSaveEditedOrder = async (orderId) => {
        try {
            const { error: orderError } = await supabase
                .from("orders")
                .update({
                    product: editedOrder.product,
                    brand: editedOrder.brand,
                    model: editedOrder.model,
                    price: parseFloat(editedOrder.price),
                    deposit: parseFloat(editedOrder.deposit),
                })
                .eq("id", orderId);

            if (orderError) {
                console.error("❌ Erreur mise à jour commande:", orderError);
                alert("Erreur lors de la mise à jour de la commande.");
                return;
            }

            // Mise à jour de la facture liée (si elle existe)
            const { data: facture, error: factureFetchError } = await supabase
                .from("billing")
                .select("id")
                .eq("order_id", orderId)
                .single();

            if (facture) {
                const { error: factureUpdateError } = await supabase
                    .from("billing")
                    .update({
                        totalttc: parseFloat(editedOrder.price),
                        acompte: parseFloat(editedOrder.deposit),
                    })
                    .eq("id", facture.id);

                if (factureUpdateError) {
                    console.error(
                        "⚠️ Erreur mise à jour facture :",
                        factureUpdateError
                    );
                } else {
                    console.log("✅ Facture mise à jour avec succès");
                }
            }

            alert("✅ Commande mise à jour avec succès");
            setEditingOrderId(null);
            setEditedOrder({});
            fetchOrders(); // Recharge la liste
        } catch (err) {
            console.error("❌ Erreur générale :", err);
            alert("Erreur inattendue.");
        }
    };

    const handleCancelEdit = () => {
        setEditingOrderId(null);
        setEditedOrder({});
    };

    const filteredOrders = orders
        .filter((order) => {
            if (showDeleted) return order.deleted === true;
            return order.deleted !== true;
        })
        .filter((order) => {
            const searchLower = search.toLowerCase();
            const matchesSearch =
                order.product.toLowerCase().includes(searchLower) ||
                order.brand.toLowerCase().includes(searchLower) ||
                order.model.toLowerCase().includes(searchLower) ||
                order.clients.name.toLowerCase().includes(searchLower) ||
                order.clients.ficheNumber.toString().includes(searchLower);

            const isPending =
                !order.received && !order.paid && !order.recovered;
            const isInProgress = order.received && !order.recovered;
            const isCompleted = order.recovered;

            if (filterStatus === "pending" && !isPending) return false;
            if (filterStatus === "inprogress" && !isInProgress) return false;
            if (filterStatus === "completed" && !isCompleted) return false;

            return matchesSearch;
        });

    const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
    const displayedOrders = filteredOrders.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );
    const handleDeleteOrder = async (orderId) => {
        // Vérifier si une facture existe pour cette commande
        const { data: billings, error: billingError } = await supabase
            .from("billing")
            .select("id")
            .eq("order_id", orderId);

        if (billingError) {
            console.error("Erreur vérification facture :", billingError);
            Alert.alert(
                "Erreur",
                "Impossible de vérifier la présence d'une facture."
            );
            return;
        }

        if (billings && billings.length > 0) {
            Alert.alert(
                "❌ Suppression interdite",
                "Une facture est liée à cette commande."
            );
            return;
        }

        // Si aucune facture, on peut supprimer
        Alert.alert(
            "Confirmation de suppression",
            "Êtes-vous sûr de vouloir supprimer cette commande ? Cette action est irréversible.",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    style: "destructive",
                    onPress: async () => {
                        const { error } = await supabase
                            .from("orders")
                            .update({ deleted: true })
                            .eq("id", orderId);

                        if (error) {
                            console.error("Erreur suppression :", error);
                        } else {
                            fetchOrders(); // recharge la liste
                        }
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            <Text style={styles.header}>📦 Toutes les commandes</Text>

            <View style={{ marginBottom: 20 }}>
                <Text
                    style={[
                        styles.floatingLabel,
                        (focusedField === "search" || search) &&
                            styles.floatingLabelFocused,
                    ]}
                >
                    Recherche client
                </Text>
                <TextInput
                    value={search}
                    onChangeText={handleSearchChange}
                    style={[
                        styles.input,
                        (focusedField === "search" || search) && {
                            paddingTop: 18,
                        },
                        focusedField === "search" && styles.inputFocused,
                    ]}
                    onFocus={() => setFocusedField("search")}
                    onBlur={() => setFocusedField(null)}
                />
                {suggestions.length > 0 && (
                    <View style={styles.suggestionContainer}>
                        {suggestions.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                onPress={() => {
                                    setSearch(item.clients.name);
                                    setSuggestions([]);
                                }}
                                style={styles.suggestionItem}
                            >
                                <Text style={styles.suggestionText}>
                                    {item.clients.name} -{" "}
                                    {item.clients.ficheNumber}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>

            <View
                style={{
                    flexDirection: "row",
                    justifyContent: "space-around",
                    marginBottom: 10,
                }}
            >
                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        filterStatus === "all" && styles.filterActive,
                    ]}
                    onPress={() => {setFilterStatus("all");setCurrentPage(1);}}
                >
                    <Text style={styles.filterText}>Toutes</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        filterStatus === "pending" && styles.filterActive,
                    ]}
                    onPress={() => {setFilterStatus("pending");setCurrentPage(1);
					}}
                >
                    <Text style={styles.filterText}>🔴 En attente</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        filterStatus === "inprogress" && styles.filterActive,
                    ]}
                    onPress={() =>{ setFilterStatus("inprogress");setCurrentPage(1);}}
                >
                    <Text style={styles.filterText}>🟡 En cours</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        filterStatus === "completed" && styles.filterActive,
                    ]}
                    onPress={() =>{ setFilterStatus("completed");setCurrentPage(1);}}
                >
                    <Text style={styles.filterText}>✅ Terminées</Text>
                </TouchableOpacity>
            </View>
			<View style={styles.toggleContainer}>
  <TouchableOpacity
    onPress={() => {
      setShowDeleted(false);
      setCurrentPage(1);
    }}
    style={[
      styles.toggleButton,
      !showDeleted && styles.toggleButtonActive,
    ]}
  >
    <Text style={styles.toggleButtonText}>✅ Actives ({activeCount})</Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() => {
      setShowDeleted(true);
      setCurrentPage(1);
    }}
    style={[
      styles.toggleButton,
      showDeleted && styles.toggleButtonActive,
    ]}
  >
    <Text style={styles.toggleButtonText}>🗑️ Supprimées ({deletedCount})</Text>
  </TouchableOpacity>
</View>


            <FlatList
                data={displayedOrders}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
					<View style={styles.card}>
						<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
							<Text style={styles.client}>
								👤 {item.clients.name} (#{item.clients.ficheNumber})
							</Text>
							<Text style={styles.statusIndicator}>
								{getStatusIcon(item)} {getStatusText(item)}
							</Text>
						</View>


                        <Text style={styles.date}>
                            📅 {new Date(item.createdat).toLocaleDateString()}
                        </Text>

                        {editingOrderId === item.id ? (
                            <>
                                {[
                                    "product",
                                    "brand",
                                    "model",
                                    "price",
                                    "deposit",
                                ].map((field) => (
                                    <View key={field}>
                                        <Text style={styles.label}>
                                            {field === "price"
                                                ? "Prix (€)"
                                                : field === "deposit"
                                                ? "Acompte (€)"
                                                : field
                                                      .charAt(0)
                                                      .toUpperCase() +
                                                  field.slice(1)}
                                        </Text>
                                        <TextInput
                                            style={styles.input}
                                            value={editedOrder[field]}
                                            onChangeText={(text) =>
                                                setEditedOrder({
                                                    ...editedOrder,
                                                    [field]: text,
                                                })
                                            }
                                            keyboardType={
                                                field === "price" ||
                                                field === "deposit"
                                                    ? "numeric"
                                                    : "default"
                                            }
                                            placeholder={field}
                                            placeholderTextColor="#999"
                                        />
                                    </View>
                                ))}
                                <View style={styles.editButtons}>
                                    <TouchableOpacity
                                        style={styles.saveButton}
                                        onPress={() =>
                                            handleSaveEditedOrder(item.id)
                                        }
                                    >
                                        <Text style={styles.buttonText}>
                                            ✅ Sauvegarder
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.cancelButton}
                                        onPress={handleCancelEdit}
                                    >
                                        <Text style={styles.buttonText}>
                                            ❌ Annuler
                                        </Text>
                                    </TouchableOpacity>
                                    {(!item.billing ||
                                        item.billing.length === 0) && (
                                        <TouchableOpacity
                                            style={styles.deleteButton}
                                            onPress={() =>
                                                handleDeleteOrder(item.id)
                                            }
                                        >
                                            <Text style={styles.buttonText}>
                                                🗑️ Supprimer
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.infoBlock}>
                                    <Text style={styles.label}>
                                        🔹 Produit :{" "}
                                        <Text style={styles.value}>
                                            {item.product}
                                        </Text>
                                    </Text>
                                    <Text style={styles.label}>
                                        🔹 Marque :{" "}
                                        <Text style={styles.value}>
                                            {item.brand}
                                        </Text>
                                    </Text>
                                    <Text style={styles.label}>
                                        🔹 Modèle :{" "}
                                        <Text style={styles.value}>
                                            {item.model}
                                        </Text>
                                    </Text>
                                    <Text style={styles.label}>
                                        🔹 Prix :{" "}
                                        <Text style={styles.value}>
                                            {item.price} €
                                        </Text>
                                    </Text>
                                    <Text style={styles.label}>
                                        🔹 Acompte :{" "}
                                        <Text style={styles.value}>
                                            {item.deposit} €
                                        </Text>
                                    </Text>
                                </View>

                                <Text style={styles.text}>
                                    💳 Statut :{" "}
                                    <Text
                                        style={{
                                            color: item.paid
                                                ? "#4caf50"
                                                : "#f44336",
                                        }}
                                    >
                                        {item.paid
                                            ? "✅ Payée"
                                            : "❌ Non payée"}
                                    </Text>
                                    {item.saved && " 💾 Sauvegardée"}
                                </Text>
                            </>
                        )}

                        {item.recovered && (
                            <View style={styles.recoveredBox}>
                                <Text style={styles.recoveredText}>
                                    📦 Commande récupérée par le client
                                </Text>
                            </View>
                        )}
                        {showDeleted && (
                            <TouchableOpacity
                                style={[
                                    styles.editButton,
                                    { backgroundColor: "#17a2b8" },
                                ]}
                                onPress={async () => {
                                    const { error } = await supabase
                                        .from("orders")
                                        .update({ deleted: false })
                                        .eq("id", item.id);
                                    if (!error) fetchOrders();
                                }}
                            >
                                <Text style={styles.buttonText}>
                                    ♻ Restaurer
                                </Text>
                            </TouchableOpacity>
                        )}

                        {editingOrderId !== item.id && (
                            <TouchableOpacity
                                style={styles.editButton}
                                onPress={() => handleEditOrder(item)}
                            >
                                <Text style={styles.buttonText}>
                                    ✏️ Modifier
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            />

            <View style={styles.pagination}>
                <TouchableOpacity
                    style={[
                        styles.pageButton,
                        currentPage === 1 && styles.disabledButton,
                    ]}
                    onPress={() =>
                        currentPage > 1 && setCurrentPage(currentPage - 1)
                    }
                    disabled={currentPage === 1}
                >
                    <Text style={styles.pageButtonText}>⬅️ Précédent</Text>
                </TouchableOpacity>

                <Text style={styles.pageIndicator}>
                    Page {currentPage}/{totalPages || 1}
                </Text>

                <TouchableOpacity
                    style={[
                        styles.pageButton,
                        currentPage === totalPages && styles.disabledButton,
                    ]}
                    onPress={() =>
                        currentPage < totalPages &&
                        setCurrentPage(currentPage + 1)
                    }
                    disabled={currentPage === totalPages}
                >
                    <Text style={styles.pageButtonText}>Suivant ➡️</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.returnButton}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.buttonText}>⬅ Retour</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f4f4f4",
  },
  header: {
    fontSize: 22,
    fontWeight: "600",
    color: "#2e2e2e",
    marginBottom: 20,
    textAlign: "center",
  },
  searchInput: {
    backgroundColor: "#ffffff",
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    color: "#333",
    borderWidth: 1,
    borderColor: "#ccc",
    marginBottom: 12,
    fontSize: 15,
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 16,
    borderRadius: 10,
    borderColor: "#ddd",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  client: {
    fontSize: 17,
    fontWeight: "600",
    color: "#222",
    marginBottom: 5,
  },
  date: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  text: {
    fontSize: 15,
    color: "#444",
    marginBottom: 5,
  },
  label: {
    color: "#4a4a4a",
    fontWeight: "500",
    fontSize: 15,
    marginBottom: 3,
  },
  value: {
    color: "#1a1a1a",
    fontWeight: "500",
    fontSize: 15,
  },
  input: {
    backgroundColor: "#fafafa",
    padding: 10,
    marginBottom: 10,
    borderRadius: 6,
    borderColor: "#ccc",
    borderWidth: 1,
    color: "#000",
    fontSize: 15,
  },
  buttonText: {
    fontSize: 15,
    color: "#fff",
    fontWeight: "500",
  },
  editButton: {
    backgroundColor: "#505050",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: "center",
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#5cb85c",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f0ad4e",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  deleteButton: {
    flex: 1,
    backgroundColor: "#d9534f",
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  editButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    gap: 8,
  },
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
  },
  pageButton: {
    backgroundColor: "#6c757d",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  disabledButton: {
    backgroundColor: "#ccc",
  },
  pageButtonText: {
    color: "#fff",
    fontSize: 15,
  },
  pageIndicator: {
    color: "#555",
    fontSize: 15,
  },
  returnButton: {
    backgroundColor: "#6c757d",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  recoveredBox: {
    backgroundColor: "#e9ecef",
    padding: 8,
    borderRadius: 5,
    marginTop: 8,
  },
  recoveredText: {
    color: "#343a40",
    fontWeight: "500",
    textAlign: "center",
    fontSize: 14,
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#ced4da",
    borderRadius: 6,
  },
  filterActive: {
    backgroundColor: "#495057",
  },
  filterText: {
    color: "#fff",
    fontWeight: "500",
    fontSize: 14,
  },
  searchInputFocused: {
    borderColor: "#999",
    height: 48,
    borderWidth: 1.5,
    padding: 10,
  },
  suggestionContainer: {
    backgroundColor: "#ffffff",
    borderColor: "#ccc",
    borderWidth: 1,
    borderTopWidth: 0,
    maxHeight: 130,
  },
  suggestionItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#efefef",
  },
  suggestionText: {
    fontSize: 14,
  },
  floatingLabel: {
    position: "absolute",
    top: 10,
    left: 12,
    fontSize: 13,
    color: "#999",
    zIndex: 1,
  },
  floatingLabelFocused: {
    top: -10,
    fontSize: 12,
    color: "#555",
  },
  inputFocused: {
    borderColor: "#888",
    backgroundColor: "#f5f5f5",
  },
  toggleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginVertical: 24,
  },
  toggleButton: {
    flex: 1,
    backgroundColor: "#adb5bd",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  toggleButtonText: {
    color: "#fff",
    fontWeight: "500",
    fontSize: 14,
  },
  toggleButtonActive: {
    backgroundColor: "#343a40",
  },
  statusIndicator: {
    fontSize: 16,
    color: "#444",
    fontWeight: "600",
},

});

