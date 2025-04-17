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
import EyeIcon from "../assets/icons/eye.png";
import EyeSlashIcon from "../assets/icons/eye-slash.png";
import { Image } from "react-native";

export default function OrdersPage({ route, navigation, order }) {
    const { clientId, clientName, clientPhone, clientNumber } = route.params || {};
    const [signature, setSignature] = useState(order?.signatureclient || null);
    const [orders, setOrders] = useState([]);
	const [expandedOrders, setExpandedOrders] = useState([]);

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
            const { data, error } = await supabase
                .from("orders")
                .select("*")
                .eq("client_id", clientId)
                .order("createdat", { ascending: false });

            if (error) throw error;

            setOrders(data || []);
        } catch (error) {
            console.error("❌ Erreur lors du chargement des commandes:", error);
        }
    };

    const handleCreateOrder = async () => {
        try {
            if (!newOrder.product || !newOrder.price) {
                alert("Veuillez remplir au moins le produit et le prix !");
                return;
            }

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
            console.error("❌ Erreur lors de l'ajout de la commande:", error);
        }
    };

    const handleDeleteOrder = async (order) => {
		if (!order.paid && !order.saved) {
			Alert.alert("Suppression impossible", "Impossible de supprimer une commande ni payée ni sauvegardée.");
			return;
		}
	
		Alert.alert(
			"Confirmation",
			"Êtes-vous sûr de vouloir supprimer cette commande ?",
			[
				{
					text: "Annuler",
					style: "cancel",
				},
				{
					text: "Supprimer",
					style: "destructive",
					onPress: async () => {
						try {
							const { error } = await supabase.from("orders").delete().eq("id", order.id);
							if (error) throw error;
							loadOrders();
						} catch (error) {
							console.error("❌ Erreur lors de la suppression de la commande:", error);
						}
					},
				},
			],
			{ cancelable: true }
		);
	};
	


    const handleMarkAsPaid = (order) => {
        Alert.alert(
            "Paiement complet",
            `Confirmez-vous le paiement complet de ${order.price - (order.deposit || 0)} € ?`,
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Confirmer",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("orders")
                                .update({ paid: true, deposit: order.price })
                                .eq("id", order.id);

                            if (error) throw error;

                            loadOrders();
                        } catch (error) {
                            console.error("❌ Erreur lors de la mise à jour du paiement:", error);
                        }
                    },
                    style: "default",
                },
            ],
            { cancelable: true }
        );
    };
	const handleSaveOrder = async (order) => {
		if (!order.paid) {
			Alert.alert("Erreur", "Vous devez d'abord marquer la commande comme payée avant de sauvegarder.");
			return;
		}
	
		Alert.alert(
			"Sauvegarder",
			"Confirmez-vous la sauvegarde définitive de cette commande ?",
			[
				{ text: "Annuler", style: "cancel" },
				{
					text: "Confirmer",
					onPress: async () => {
						try {
							const { error } = await supabase
								.from("orders")
								.update({
									saved: true,
									paid_at: new Date().toISOString(),
								})
								.eq("id", order.id);
	
							if (error) throw error;
	
							loadOrders();
						} catch (error) {
							console.error("❌ Erreur lors de la sauvegarde:", error);
						}
					},
				},
			]
		);
	};
	
	const toggleExpand = (id) => {
		if (expandedOrders.includes(id)) {
			setExpandedOrders(expandedOrders.filter(item => item !== id));
		} else {
			setExpandedOrders([...expandedOrders, id]);
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

	return (
    <View style={styles.orderCard}>
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
    <Text style={styles.cardTitle}>{item.product}</Text>

    {item.saved && (
        <TouchableOpacity onPress={() => toggleExpand(item.id)}>
            <Image
                source={isExpanded ? EyeSlashIcon : EyeIcon}
                style={{ width: 24, height: 24, tintColor: "#ccc" }}
            />
        </TouchableOpacity>
    )}
</View>


        <Text style={styles.cardText}>💾 Commande sauvegardée</Text>
        <Text style={styles.cardText}>💳 Montant : <Text style={styles.cardValue}>{item.price} €</Text></Text>
        {item.paid_at && (
            <Text style={styles.cardText}>📅 Payée le : <Text style={styles.cardValue}>{new Date(item.paid_at).toLocaleDateString()}</Text></Text>
        )}

            {/* Affichage étendu */}
            {(!item.saved || isExpanded) && (
                <>
                    <Text style={styles.cardText}>🔸 Marque: <Text style={styles.cardValue}>{item.brand}</Text></Text>
                    <Text style={styles.cardText}>🔸 Modèle: <Text style={styles.cardValue}>{item.model}</Text></Text>
                    <Text style={styles.cardText}>🔸 Acompte: <Text style={styles.cardValue}>{item.deposit} €</Text></Text>
                    <Text style={styles.cardText}>🔸 Montant restant dû : <Text style={[styles.cardValue, { color: item.paid ? "#00ff00" : "#ff5555" }]}>{item.price - (item.deposit || 0)} €</Text></Text>
                    <Text style={styles.cardText}>📅 Créée le: <Text style={styles.cardValue}>{new Date(item.createdat).toLocaleDateString()}</Text></Text>
                    <Text style={styles.cardText}>💳 Statut: <Text style={[styles.cardValue, { color: item.paid ? 'lightgreen' : 'tomato' }]}>{item.paid ? "✅ Payé" : "❌ Non payé"}</Text></Text>

                    {item.signatureclient && (
                        <View style={{ backgroundColor: '#e8f5e9', padding: 5, borderRadius: 4, marginTop: 8 }}>
                            <Text style={{ color: 'green', fontWeight: 'bold' }}>✅ Signée</Text>
                        </View>
                    )}
                    {item.printed && (
                        <View style={{ backgroundColor: '#e3f2fd', padding: 5, borderRadius: 4, marginTop: 8 }}>
                            <Text style={{ color: '#2196F3', fontWeight: 'bold' }}>🖨️ Commande imprimée</Text>
                        </View>
                    )}

                    {/* Boutons */}
                    <View style={{ alignItems: "center", marginVertical: 10 }}>
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={() => {
                                const remaining = item.price - (item.deposit || 0);
                                const order = {
                                    id: item.id,
                                    client: {
                                        id: clientId,
                                        name: clientName,
                                        ficheNumber: clientNumber,
                                    },
                                    deviceType: item.product,
                                    brand: item.brand,
                                    model: item.model,
                                    cost: item.price,
                                    acompte: item.deposit,
                                    remaining: remaining,
                                    signatureclient: item.signatureclient,
                                    printed: item.printed,
                                };
                                navigation.navigate("CommandePreviewPage", { order });
                            }}
                        >
                            <Text style={styles.button}>🖨️ Imprimer cette commande</Text>
                        </TouchableOpacity>
                    </View>

					{(!item.saved || isExpanded) && (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 10 }}>


        {!item.saved && (
            <>
			<TouchableOpacity
            style={[styles.pay, { flex: 1, alignItems: "center" }]}
            onPress={() => handleMarkAsPaid(item)}
        >
            <Text style={styles.paid}>💰 Payé</Text>
        </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.addButton, { flex: 1, alignItems: "center" }]}
                    onPress={() => handleSaveOrder(item)}
                >
                    <Text style={styles.buttonSave}>💾 Sauvegarder</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.buttonDell, { flex: 1, alignItems: "center" }]}
                    onPress={() => handleDeleteOrder(item)}
                >
                    <Text style={styles.buttonDel}>🗑 Supprimer</Text>
                </TouchableOpacity>
            </>
        )}

        <TouchableOpacity
            style={[styles.addButton, { flex: 1, alignItems: "center" }]}
            onPress={() => navigation.goBack()}
        >
            <Text style={styles.ReturnButton}>⬅ Retour</Text>
        </TouchableOpacity>
    </View>
)}

                </>
            )}

        </View>
    );
}}

            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: "#191f2f" },
    header: { fontSize: 18, fontWeight: "bold", color: "#888787", marginBottom: 10 },
    orderCard: {
        padding: 20,
        marginBottom: 20,
        backgroundColor: "#2a2f45",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#3e4c69",
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 10,
        color: "#fff",
    },
    cardText: {
        fontSize: 20,
        marginBottom: 5,
        color: "#ccc",
    },
    cardValue: {
        fontWeight: "bold",
        color: "#eee",
    },
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
        alignItems: "center",
        backgroundColor: "#191f2f",
        padding: 15,
        borderWidth: 1,
        borderRadius: 2,
        borderColor: "#888787",
        marginBottom: 20,
        marginTop: 20,
        fontSize: 18,
        fontWeight: "medium",
        color: "#888787",
    },
	buttonSave: {
		flexDirection: "row",
		gap: 5,
		width: "100%",
		alignItems: "center",
		backgroundColor: "#191f2f",
		padding: 15,
		borderWidth: 1,
		borderRadius: 2,
		borderColor: "#ff9900",
		marginBottom: 20,
		fontSize: 18,
		fontWeight: "medium",
		color: "#888787",
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
        fontSize: 18,
        fontWeight: "medium",
        color: "#888787",
    },
    ReturnButton: {
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
        fontSize: 18,
        fontWeight: "medium",
        color: "#888787",
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
        fontSize: 18,
        fontWeight: "medium",
        color: "#888787",
    },
    formContainer: { marginBottom: 20 },
    addButton: { width: "60%", padding: 10, borderRadius: 2, alignItems: "center" },
    buttonOrderText: { fontSize: 18, fontWeight: "bold", color: "#888787" },
});