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

const ITEMS_PER_PAGE = 3;

export default function AllOrdersPage({ navigation }) {
    const [orders, setOrders] = useState([]);
    const [search, setSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [editingOrderId, setEditingOrderId] = useState(null);
    const [editedOrder, setEditedOrder] = useState({});

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        const { data, error } = await supabase
            .from("orders")
            .select("*, clients(name, ficheNumber)")
            .order("createdat", { ascending: false });

        if (error) {
            console.error("Erreur chargement commandes :", error);
            return;
        }
        setOrders(data || []);
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
					console.error("⚠️ Erreur mise à jour facture :", factureUpdateError);
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

    const filteredOrders = orders.filter((order) => {
        const searchLower = search.toLowerCase();
        return (
            order.product.toLowerCase().includes(searchLower) ||
            order.brand.toLowerCase().includes(searchLower) ||
            order.model.toLowerCase().includes(searchLower) ||
            order.clients.name.toLowerCase().includes(searchLower) ||
            order.clients.ficheNumber.toString().includes(searchLower)
        );
    });

    const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
    const displayedOrders = filteredOrders.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <View style={styles.container}>
            <Text style={styles.header}>📦 Toutes les commandes</Text>

            <TextInput
                style={styles.searchInput}
                placeholder="🔍 Rechercher commande ou client..."
                placeholderTextColor="#aaa"
                value={search}
                onChangeText={(text) => {
                    setSearch(text);
                    setCurrentPage(1);
                }}
            />

            <FlatList
                data={displayedOrders}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <Text style={styles.client}>
                            👤 {item.clients.name} (#{item.clients.ficheNumber})
                        </Text>
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
    container: { flex: 1, padding: 15, backgroundColor: "#eef2f7" },
    header: {
        fontSize: 22,
        fontWeight: "bold",
        color: "#333",
        marginBottom: 15,
        textAlign: "center",
    },
    searchInput: {
        backgroundColor: "#fff",
        padding: 12,
        borderRadius: 8,
        color: "#333",
        marginBottom: 15,
        borderWidth: 1,
        borderColor: "#ccc",
    },
    card: {
        backgroundColor: "#fff",
        padding: 15,
        marginBottom: 15,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#ddd",
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    client: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#222",
        marginBottom: 5,
    },
    date: { fontSize: 14, color: "#666", marginBottom: 8 },
    text: { fontSize: 15, color: "#444", marginBottom: 4 },
    label: {
        color: "#3003f8",
        fontWeight: "600",
        fontSize: 15,
        marginBottom: 4,
    },
    value: {
        color: "#302f2f",
        fontWeight: "bold",
        fontSize: 15,
    },
    input: {
        backgroundColor: "#f9f9f9",
        padding: 10,
        marginBottom: 10,
        borderRadius: 6,
        borderColor: "#ccc",
        borderWidth: 1,
        color: "#000",
    },
    buttonText: { fontSize: 16, color: "#fff" },
    editButton: {
        backgroundColor: "#007bff",
        padding: 10,
        borderRadius: 8,
        marginTop: 10,
        alignItems: "center",
    },
    saveButton: {
        backgroundColor: "#28a745",
        padding: 10,
        borderRadius: 8,
        flex: 1,
        marginRight: 5,
        alignItems: "center",
    },
    cancelButton: {
        backgroundColor: "#dc3545",
        padding: 10,
        borderRadius: 8,
        flex: 1,
        marginLeft: 5,
        alignItems: "center",
    },
    editButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 10,
    },
    pagination: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 20,
    },
    pageButton: {
        backgroundColor: "#007bff",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    disabledButton: { backgroundColor: "#ccc" },
    pageButtonText: { color: "#fff", fontSize: 16 },
    pageIndicator: { color: "#333", fontSize: 16 },
    returnButton: {
        backgroundColor: "#6c757d",
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
        marginTop: 20,
    },
    recoveredBox: {
        backgroundColor: "#e6f4ea",
        padding: 8,
        borderRadius: 5,
        marginTop: 8,
    },
    recoveredText: {
        color: "#2d6a4f",
        fontWeight: "bold",
        textAlign: "center",
    },
});
