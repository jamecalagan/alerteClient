import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
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

  const handleEditOrder = (order) => {
    setEditingOrderId(order.id);
    setEditedOrder({
      product: order.product,
      brand: order.brand,
      model: order.model,
      price: order.price.toString(),
      deposit: order.deposit.toString(),
    });
  };

  const handleSaveEditedOrder = async (orderId) => {
    const originalOrder = orders.find((o) => o.id === orderId);
    let changes = [];

    if (originalOrder.product !== editedOrder.product) changes.push("Produit");
    if (originalOrder.brand !== editedOrder.brand) changes.push("Marque");
    if (originalOrder.model !== editedOrder.model) changes.push("Modèle");
    if (parseFloat(originalOrder.price) !== parseFloat(editedOrder.price)) changes.push("Prix");
    if (parseFloat(originalOrder.deposit) !== parseFloat(editedOrder.deposit)) changes.push("Acompte");

    if (changes.length === 0) {
      Alert.alert("Aucune modification", "Aucun changement détecté.");
      return;
    }

    Alert.alert(
      "Confirmer la modification",
      `⚙️ Vous avez modifié : ${changes.join(", ")}.\n\nVoulez-vous sauvegarder ces modifications ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from("orders")
                .update({
                  product: editedOrder.product,
                  brand: editedOrder.brand,
                  model: editedOrder.model,
                  price: parseFloat(editedOrder.price),
                  deposit: parseFloat(editedOrder.deposit),
                })
                .eq("id", orderId);

              if (error) {
                console.error("Erreur mise à jour commande:", error);
                Alert.alert("Erreur", "❌ Impossible de modifier la commande.");
                return;
              }

              setEditingOrderId(null);
              setEditedOrder({});
              fetchOrders();
              Alert.alert("Succès", "✅ Modifications sauvegardées !");
            } catch (error) {
              console.error("Erreur mise à jour commande:", error);
              Alert.alert("Erreur", "❌ Erreur inattendue.");
            }
          },
        },
      ],
      { cancelable: true }
    );
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
          <View style={styles.orderCard}>
            <Text style={styles.client}>
              👤 {item.clients.name} ({item.clients.ficheNumber})
            </Text>
            <Text style={styles.text}>📅 {new Date(item.createdat).toLocaleDateString()}</Text>

            {editingOrderId === item.id ? (
              <>
                <Text style={styles.fieldLabel}>Produit</Text>
                <TextInput
                  style={styles.input}
                  value={editedOrder.product}
                  onChangeText={(text) => setEditedOrder({ ...editedOrder, product: text })}
                  placeholder="Produit"
                  placeholderTextColor="#999"
                />

                <Text style={styles.fieldLabel}>Marque</Text>
                <TextInput
                  style={styles.input}
                  value={editedOrder.brand}
                  onChangeText={(text) => setEditedOrder({ ...editedOrder, brand: text })}
                  placeholder="Marque"
                  placeholderTextColor="#999"
                />

                <Text style={styles.fieldLabel}>Modèle</Text>
                <TextInput
                  style={styles.input}
                  value={editedOrder.model}
                  onChangeText={(text) => setEditedOrder({ ...editedOrder, model: text })}
                  placeholder="Modèle"
                  placeholderTextColor="#999"
                />

                <Text style={styles.fieldLabel}>Prix (€)</Text>
                <TextInput
                  style={styles.input}
                  value={editedOrder.price}
                  onChangeText={(text) => setEditedOrder({ ...editedOrder, price: text })}
                  keyboardType="numeric"
                  placeholder="Prix"
                  placeholderTextColor="#999"
                />

                <Text style={styles.fieldLabel}>Acompte (€)</Text>
                <TextInput
                  style={styles.input}
                  value={editedOrder.deposit}
                  onChangeText={(text) => setEditedOrder({ ...editedOrder, deposit: text })}
                  keyboardType="numeric"
                  placeholder="Acompte"
                  placeholderTextColor="#999"
                />

                <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 10 }}>
                  <TouchableOpacity style={styles.saveButton} onPress={() => handleSaveEditedOrder(item.id)}>
                    <Text style={styles.buttonText}>✅ Sauvegarder</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit}>
                    <Text style={styles.buttonText}>❌ Annuler</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.text}>🔹 Produit : {item.product}</Text>
                <Text style={styles.text}>🔹 Marque : {item.brand}</Text>
                <Text style={styles.text}>🔹 Modèle : {item.model}</Text>
                <Text style={styles.text}>💰 Prix : {item.price} €</Text>
                <Text style={styles.text}>💵 Acompte : {item.deposit} €</Text>
                <Text style={styles.text}>
                  💳 Statut :{" "}
                  <Text style={{ color: item.paid ? "#00FF00" : "#FF5555" }}>
                    {item.paid ? "✅ Payée" : "❌ Non payée"}
                  </Text>
                  {item.saved && " 💾"}
                </Text>
              </>
            )}

            {item.recovered && (
              <View style={{ marginTop: 8, backgroundColor: "#d1fae5", padding: 5, borderRadius: 5 }}>
                <Text style={{ color: "#065f46", fontWeight: "bold", textAlign: "center" }}>
                  📦 Commande récupérée par le client
                </Text>
              </View>
            )}

            {editingOrderId !== item.id && (
              <TouchableOpacity style={styles.editButton} onPress={() => handleEditOrder(item)}>
                <Text style={styles.buttonText}>✏️ Modifier</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      {/* Pagination */}
      <View style={styles.pagination}>
        <TouchableOpacity
          style={[styles.pageButton, currentPage === 1 && styles.disabledButton]}
          onPress={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <Text style={styles.pageButtonText}>⬅️ Précédent</Text>
        </TouchableOpacity>

        <Text style={styles.pageIndicator}>
          Page {currentPage}/{totalPages || 1}
        </Text>

        <TouchableOpacity
          style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]}
          onPress={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <Text style={styles.pageButtonText}>Suivant ➡️</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>⬅ Retour</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15, backgroundColor: "#191f2f" },
  header: { fontSize: 22, fontWeight: "bold", color: "#fff", marginBottom: 15, textAlign: "center" },
  searchInput: { backgroundColor: "#2a2f45", padding: 12, borderRadius: 8, color: "#fff", marginBottom: 15, borderWidth: 1, borderColor: "#444" },
  orderCard: { backgroundColor: "#2a2f45", padding: 15, marginBottom: 15, borderRadius: 8, borderWidth: 1, borderColor: "#3e4c69" },
  client: { fontSize: 18, fontWeight: "bold", color: "#fff", marginBottom: 8 },
  text: { fontSize: 16, color: "#ccc", marginBottom: 5 },
  input: { backgroundColor: "#808080", padding: 10, marginBottom: 10, borderRadius: 8, color: "#fff" },
  fieldLabel: { fontSize: 16, color: "#aaa", marginBottom: 5, marginTop: 10 },
  button: { backgroundColor: "#3e4c69", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 10 },
  buttonText: { fontSize: 18, color: "#fff" },
  editButton: { backgroundColor: "#5c6bc0", padding: 10, borderRadius: 8, marginTop: 10, alignItems: "center" },
  saveButton: { backgroundColor: "#4caf50", padding: 10, borderRadius: 8, flex: 1, marginRight: 5 },
  cancelButton: { backgroundColor: "#f44336", padding: 10, borderRadius: 8, flex: 1, marginLeft: 5 },
  pagination: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 15 },
  pageButton: { backgroundColor: "#3e4c69", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  disabledButton: { backgroundColor: "#555" },
  pageButtonText: { color: "#fff", fontSize: 16 },
  pageIndicator: { color: "#fff", fontSize: 16 },
});
