import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    TextInput,
    Alert,
    StyleSheet,
} from "react-native";
import { supabase } from "../supabaseClient";

export default function OrdersPage({ route, navigation }) {
    const { clientId, clientName, clientPhone, clientNumber } = route.params || {};
    const [orders, setOrders] = useState([]);
    const [newOrder, setNewOrder] = useState({
        product: "",
        brand: "",
        model: "",
        price: "",
        deposit: "",
        paid: false,
        client_id: clientId,
    });

    useEffect(() => {
        loadOrders();
    }, [clientId]);

    const loadOrders = async () => {
        try {
            console.log(`📢 Chargement des commandes pour le client : ${clientId}`);
            const { data, error } = await supabase
                .from("orders")
                .select("*")
                .eq("client_id", clientId);

            if (error) throw error;
            setOrders(data || []);
            console.log("✅ Commandes récupérées :", data);
        } catch (error) {
            console.error("❌ Erreur lors du chargement des commandes:", error);
			console.log("📦 Commandes après chargement :", orders);
        }
    };

    const handleCreateOrder = async () => {
        try {
            if (!newOrder.product || !newOrder.price) {
                alert("Veuillez remplir au moins le produit et le prix !");
                return;
            }

            console.log("📤 Données envoyées à Supabase :", newOrder);

            const { error } = await supabase.from("orders").insert([
                {
                    product: newOrder.product,
                    brand: newOrder.brand || "",
                    model: newOrder.model || "",
                    price: newOrder.price,
                    deposit: newOrder.deposit || 0,
                    paid: false,
                    client_id: clientId,
                },
            ]);

            if (error) throw error;

            console.log("✅ Commande ajoutée avec succès :", newOrder);
            setNewOrder({
                product: "",
                brand: "",
                model: "",
                price: "",
                deposit: "",
                paid: false,
                client_id: clientId,
            });
            loadOrders();
        } catch (error) {
            console.error("❌ Erreur lors de l'ajout de la commande :", error);
        }
    };

	const handleDeleteOrder = async (orderId) => {
		try {
			const { error } = await supabase.from("orders").delete().eq("id", orderId);
			if (error) throw error;
			console.log(`🗑 Commande ${orderId} supprimée`);
			
			await loadOrders(); // 🔄 Rafraîchir la liste après suppression
		} catch (error) {
			console.error("❌ Erreur lors de la suppression de la commande :", error);
		}
	};
	

	const handleMarkAsPaid = async (orderId) => {
		try {
			const { error } = await supabase
				.from("orders")
				.update({ paid: true })
				.eq("id", orderId);
			
			if (error) throw error;
	
			console.log(`💰 Commande ${orderId} marquée comme payée`);
			
			await loadOrders(); // 🔄 Rafraîchir immédiatement la liste après la mise à jour
		} catch (error) {
			console.error("❌ Erreur lors de la mise à jour du paiement :", error);
		}
	};
	

    return (
        <View style={styles.container}>

            <Text style={styles.header}>Commandes pour {clientName}</Text>
			<Text style={styles.header}>Numéro de fiche: {clientNumber}</Text>
            <View style={styles.formContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Produit"
					placeholderTextColor="#000"
                    value={newOrder.product}
                    onChangeText={(text) => setNewOrder({ ...newOrder, product: text })}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Marque"
					placeholderTextColor="#000"
                    value={newOrder.brand}
                    onChangeText={(text) => setNewOrder({ ...newOrder, brand: text })}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Modèle"
					placeholderTextColor="#000"
                    value={newOrder.model}
                    onChangeText={(text) => setNewOrder({ ...newOrder, model: text })}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Prix (€)"
					placeholderTextColor="#000"
                    keyboardType="numeric"
                    value={newOrder.price}
                    onChangeText={(text) => setNewOrder({ ...newOrder, price: text })}
                />
                <TextInput
                    style={styles.input}
                    placeholder="Acompte (€)"
					placeholderTextColor="#000"
                    keyboardType="numeric"
                    value={newOrder.deposit}
                    onChangeText={(text) => setNewOrder({ ...newOrder, deposit: text })}
                />
                <TouchableOpacity style={styles.addButton} onPress={handleCreateOrder}>
                    <Text style={styles.button}>➕ Ajouter une commande</Text>
                </TouchableOpacity>
				<TouchableOpacity style={styles.addButton} onPress={() => navigation.goBack()}>
                <Text style={styles.button}>⬅ Retour</Text>
            </TouchableOpacity>
            </View>

            <FlatList
                data={orders}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.orderItem}>
                        <Text  style={styles.buttonOrderText}>Produit: {item.product}</Text>
                        <Text  style={styles.buttonOrderText}>Marque: {item.brand}</Text>
                        <Text  style={styles.buttonOrderText}>Modèle: {item.model}</Text>
                        <Text  style={styles.buttonOrderText}>Prix: {item.price} €</Text>
                        <Text  style={styles.buttonOrderText}>Acompte: {item.deposit} €</Text>
						<Text  style={styles.buttonOrderText}>Date de création: {new Date(item.createdat).toLocaleDateString()}</Text>
                        <Text  style={styles.buttonOrderText}>{item.paid ? "✅ Payé" : "❌ Non payé"}</Text>
						<View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
    <TouchableOpacity style={[styles.payButton, { flex: 1, marginRight: 5 }]} onPress={() => handleMarkAsPaid(item.id)}>
        <Text style={styles.paid}>💰 Marquer comme payé</Text>
    </TouchableOpacity>
    <TouchableOpacity style={[styles.deleteButton, { flex: 1, marginLeft: 5 }]} onPress={() => handleDeleteOrder(item.id)}>
        <Text style={styles.buttonDel}>🗑 Supprimer</Text>
    </TouchableOpacity>
</View>

                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#191f2f" },

    header: { fontSize: 18, fontWeight: "bold", color:"#888787", marginBottom: 10 },
    orderItem: { padding: 15, borderBottomWidth: 1, borderColor: "#888787" },
	input: {
        borderWidth: 1,
        borderColor: "#53669b",
        padding: 10,
        marginBottom: 20,
        borderRadius: 5,
        backgroundColor: "#808080",
        width: "90%",
        alignSelf: "center",
    },
	button: {
        flexDirection: "row",
		gap: 5,
		width: "100%",
        alignItems: "center",
        backgroundColor: "#191f2f",
        padding: 15,
        borderWidth: 1,
        borderRadius: 2,
        borderColor: "#888787",
        marginBottom: 20,
		fontSize: 18, fontWeight: "medium", color:"#888787",
    },
	paid: {
        flexDirection: "row",
		gap: 5,
		width: "100%",
        alignItems: "center",
        backgroundColor: "#191f2f",
        padding: 15,
        borderWidth: 1,
        borderRadius: 2,
        borderColor: "#00ff00",
        marginBottom: 20,
		fontSize: 18, fontWeight: "medium", color:"#888787",
    },
	buttonDel: {
        flexDirection: "row",
		gap: 5,
		width: "100%",
        alignItems: "center",
        backgroundColor: "#191f2f",
        padding: 15,
        borderWidth: 1,
        borderRadius: 2,
        borderColor: "#ff0000",
        marginBottom: 20,
		fontSize: 18, fontWeight: "medium", color:"#888787",
    },
	formContainer: { marginBottom: 20 },
	addButton: { padding: 10, borderRadius: 2, alignItems: "center" },

	buttonOrderText: { fontSize: 18, fontWeight: "bold", color:"#888787" },
});
