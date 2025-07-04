import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    TextInput,
    Alert,
    StyleSheet,
    Image,
	Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import EyeIcon from "../assets/icons/eye.png";
import EyeSlashIcon from "../assets/icons/eye-slash.png";
export default function OrdersPage({ route, navigation, order }) {
    const { clientId, clientName, clientPhone, clientNumber } =
        route.params || {};
    const [signature, setSignature] = useState(order?.signatureclient || null);
    const [orders, setOrders] = useState([]);
    const [expandedOrders, setExpandedOrders] = useState([]);

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
        if (clientId) {
            setNewOrder((prev) => ({ ...prev, client_id: clientId }));
        }
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

  // 🔑  ICI : force toutes les valeurs suspectes en vrai booléen
  const toBool = (v) => v === true || v === "true" || v === 1;

  setOrders(
    (data || []).map((order) => ({
      ...order,
      originalSerial: order.serial || "",
      billing: order.billing || null,
      notified: toBool(order.notified),
      received: toBool(order.received),
      paid: toBool(order.paid),
      ordered: toBool(order.ordered),
      recovered: toBool(order.recovered),
      saved: toBool(order.saved),
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
                    serial: newOrder.serial || "", // 👈 important pour l'enregistrement
                    price: parseFloat(priceToSend),
                    deposit: parseFloat(depositToSend) || 0,
                    paid: false,
                    client_id: clientId,
                },
            ]);

            if (error) throw error;

            setNewOrder({
                product: "",
                brand: "",
                model: "",
                serial: "", // 👈 n'oublie pas de le réinitialiser ici
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
            Alert.alert(
                "Suppression impossible",
                "Impossible de supprimer une commande ni payée ni sauvegardée."
            );
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
                            const { error } = await supabase
                                .from("orders")
                                .delete()
                                .eq("id", order.id);
                            if (error) throw error;
                            loadOrders();
                        } catch (error) {
                            console.error(
                                "❌ Erreur lors de la suppression de la commande:",
                                error
                            );
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
            `Confirmez-vous le paiement complet de ${
                order.price - (order.deposit || 0)
            } € ?`,
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Confirmer",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("orders")
                                .update({ paid: true }) // 🛑 on ne touche plus au deposit ici
                                .eq("id", order.id);

                            if (error) throw error;

                            loadOrders();
                        } catch (error) {
                            console.error(
                                "❌ Erreur lors de la mise à jour du paiement:",
                                error
                            );
                        }
                    },
                    style: "default",
                },
            ],
            { cancelable: true }
        );
    };

    const handleSaveOrder = async (order) => {
        if (!order.paid || !order.recovered) {
            Alert.alert(
                "Erreur",
                "Vous devez d'abord marquer la commande comme payée et récupérée avant de la sauvegarder."
            );
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
                            console.error(
                                "❌ Erreur lors de la sauvegarde:",
                                error
                            );
                        }
                    },
                },
            ]
        );
    };

    const toggleExpand = (id) => {
        if (expandedOrders.includes(id)) {
            setExpandedOrders(expandedOrders.filter((item) => item !== id));
        } else {
            setExpandedOrders([...expandedOrders, id]);
        }
    };
    const handleMarkAsRecovered = async (order) => {
        Alert.alert(
            "Commande récupérée",
            "Confirmez-vous que le client a récupéré cette commande ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Confirmer",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("orders")
                                .update({ recovered: true })
                                .eq("id", order.id);

                            if (error) throw error;

                            loadOrders(); // Recharger les commandes
                        } catch (error) {
                            console.error(
                                "❌ Erreur lors de la récupération de commande:",
                                error
                            );
                        }
                    },
                },
            ]
        );
    };

    const handleMarkAsOrdered = (order) => {
        Alert.alert(
            "Commande passée",
            "Confirmez-vous que cette commande a été passée au fournisseur ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Confirmer",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("orders")
                                .update({ ordered: true })
                                .eq("id", order.id);

                            if (error) throw error;
                            loadOrders();
                        } catch (error) {
                            console.error(
                                "❌ Erreur marquage commande passée :",
                                error
                            );
                        }
                    },
                },
            ],
            { cancelable: true }
        );
    };

    const handleMarkAsReceived = (order) => {
        Alert.alert(
            "Commande reçue",
            "Confirmez-vous que cette commande a été reçue du fournisseur ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Confirmer",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("orders")
                                .update({ received: true })
                                .eq("id", order.id);

                            if (error) throw error;
                            loadOrders();
                        } catch (error) {
                            console.error(
                                "❌ Erreur marquage commande reçue :",
                                error
                            );
                        }
                    },
                },
            ],
            { cancelable: true }
        );
    };
const notifyClientBySMS = async () => {
    if (!clientId || !clientPhone) {
        Alert.alert("Erreur", "Client non identifié ou numéro manquant.");
        return;
    }

    const message = `Bonjour, votre commande est disponible. N'oubliez pas le bon de restitution, merci\n\nAVENIR INFORMATIQUE`;
    const encoded = encodeURIComponent(message);

    Alert.alert(
        "Notifier par SMS",
        `Envoyer un SMS à ${clientName} ?`,
        [
            { text: "Annuler", style: "cancel" },
            {
                text: "Envoyer",
                onPress: async () => {
                    try {
                        const { error } = await supabase
                            .from("orders")
                            .update({ notified: true })
                            .eq("client_id", clientId)
                            .order("createdat", { ascending: false })
                            .limit(1);

                        if (error) throw error;

                        Linking.openURL(`sms:${clientPhone}?body=${encoded}`);

                        Alert.alert("✅ Notification enregistrée !");
                    } catch (err) {
                        console.error("Erreur notification :", err);
                        Alert.alert("Erreur", "Échec de l'enregistrement.");
                    }
                },
            },
        ]
    );
};
const notifyOrderBySMS = async (order) => {
  if (!clientPhone) {
    Alert.alert("Erreur", "Numéro de téléphone manquant.");
    return;
  }

  const message = `Bonjour, votre commande ${order.product} est prête. Merci et à bientôt.\n\nAVENIR INFORMATIQUE`;
  const encoded = encodeURIComponent(message);

  try {
    // ➜ enregistre la notification en BD
    const { error } = await supabase
      .from("orders")
      .update({ notified: true })
      .eq("id", order.id);

    if (error) throw error;

    // ➜ ouvre l’app SMS
    Linking.openURL(`sms:${clientPhone}?body=${encoded}`);
    Alert.alert("✅ Notification envoyée !");
    loadOrders();        // rafraîchit la liste
  } catch (err) {
    console.error("Erreur notification :", err);
    Alert.alert("Erreur", "Impossible d’enregistrer la notification.");
  }
};

    return (
        <View style={styles.container}>
            <Text style={styles.header}>
                Crér une commande pour: {clientName}
            </Text>

            <View style={styles.formContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Produit"
                    placeholderTextColor="#000"
                    value={newOrder.product}
                    onChangeText={(text) =>
                        setNewOrder({ ...newOrder, product: text })
                    }
                />
                <TextInput
                    style={styles.input}
                    placeholder="Marque"
                    placeholderTextColor="#000"
                    value={newOrder.brand}
                    onChangeText={(text) =>
                        setNewOrder({ ...newOrder, brand: text })
                    }
                />
                <TextInput
                    style={styles.input}
                    placeholder="Modèle"
                    placeholderTextColor="#000"
                    value={newOrder.model}
                    onChangeText={(text) =>
                        setNewOrder({ ...newOrder, model: text })
                    }
                />
                <TextInput
                    style={styles.input}
                    placeholder="Prix (€)"
                    placeholderTextColor="#000"
                    keyboardType="numeric"
                    value={newOrder.price}
                    onChangeText={(text) =>
                        setNewOrder({ ...newOrder, price: text })
                    }
                />
                <TextInput
                    style={styles.input}
                    placeholder="Acompte (€)"
                    placeholderTextColor="#000"
                    keyboardType="numeric"
                    value={newOrder.deposit}
                    onChangeText={(text) =>
                        setNewOrder({ ...newOrder, deposit: text })
                    }
                />
                <View style={{ alignItems: "center" }}>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={handleCreateOrder}
                    >
                        <Text style={styles.button}>
                            ➕ Ajouter une commande
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <FlatList
                data={orders}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => {
                    console.log("📦 billing pour", item.id, "=>", item.billing);
                    const isExpanded = expandedOrders.includes(item.id);

                    return (
                        <View style={styles.orderCard}>

                            <Text style={styles.cardText}>
                                💾 Commande sauvegardée
                            </Text>
                            {/* ✅ Pastilles de statut Commande passée et reçue */}
                            <View
                                style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                    marginTop: 8,
                                    gap: 8,
                                }}
                            >
                                {item.ordered && (
                                    <View
                                        style={{
                                            backgroundColor: "#cfcfcf",
                                            padding: 5,
                                            borderRadius: 5,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: "#92400e",
                                                fontWeight: "bold",
                                            }}
                                        >
                                            🚚 Commande passée
                                        </Text>
                                    </View>
                                )}
                                {item.received && (
                                    <View
                                        style={{
                                            backgroundColor: "#bbf7d0",
                                            padding: 5,
                                            borderRadius: 5,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: "#166534",
                                                fontWeight: "bold",
                                            }}
                                        >
                                            📦 Commande reçue
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <View
                                style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <Text style={styles.cardTitle}>
                                    {item.product}
                                </Text>

                                {item.saved && (
                                    <TouchableOpacity
                                        onPress={() => toggleExpand(item.id)}
                                    >
                                        <Image
                                            source={
                                                isExpanded
                                                    ? EyeSlashIcon
                                                    : EyeIcon
                                            }
                                            style={{
                                                width: 24,
                                                height: 24,
                                                tintColor: "#ccc",
                                            }}
                                        />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* ✅ Commande récupérée */}
                            {item.recovered && (
                                <View
                                    style={{
                                        backgroundColor: "#d1fae5",
                                        padding: 5,
                                        borderRadius: 4,
                                        marginTop: 8,
                                    }}
                                >
                                    <Text
                                        style={{
                                            color: "#065f46",
                                            fontWeight: "bold",
                                        }}
                                    >
                                        ✅ Commande récupérée par le client
                                    </Text>
                                </View>
                            )}

                            <Text style={styles.cardText}>
                                💳 Montant :{" "}
                                <Text style={styles.cardValue}>
                                    {item.price} €
                                </Text>
                            </Text>
                            {item.paid_at && (
                                <Text style={styles.cardText}>
                                    📅 Payée le :{" "}
                                    <Text style={styles.cardValue}>
                                        {new Date(
                                            item.paid_at
                                        ).toLocaleDateString()}
                                    </Text>
                                </Text>
                            )}
							
							{item.saved && !isExpanded && (
							<TouchableOpacity
								style={{
								alignSelf: "flex-end",
								marginTop: 10,
								backgroundColor: "#444",
								paddingVertical: 6,
								paddingHorizontal: 12,
								borderRadius: 4,
								}}
								onPress={() => toggleExpand(item.id)}
							>
								<Text style={{ color: "#fff", fontWeight: "bold" }}> Ouvrir</Text>
							</TouchableOpacity>
							)}
                            {/* Affichage étendu */}
                            {(!item.saved || isExpanded) && (
                                <>
                                    <Text style={styles.cardText}>
                                        🔸 Produit:{" "}
                                        <Text style={styles.cardValue}>
                                            {item.product}
                                        </Text>
                                    </Text>
                                    <Text style={styles.cardText}>
                                        🔸 Marque:{" "}
                                        <Text style={styles.cardValue}>
                                            {item.brand}
                                        </Text>
                                    </Text>
                                    <Text style={styles.cardText}>
                                        🔸 Modèle:{" "}
                                        <Text style={styles.cardValue}>
                                            {item.model}
                                        </Text>
                                    </Text>
                                    <Text style={styles.cardText}>
                                        🔸 Acompte:{" "}
                                        <Text style={styles.cardValue}>
                                            {item.deposit} €
                                        </Text>
                                    </Text>
                                    <Text style={styles.cardText}>
                                        🔸 Montant restant dû :{" "}
                                        <Text
                                            style={[
                                                styles.cardValue,
                                                {
                                                    color: item.paid
                                                        ? "#00ff00"
                                                        : "#ff5555",
                                                },
                                            ]}
                                        >
                                            {item.price - (item.deposit || 0)} €
                                        </Text>
                                    </Text>
                                    <Text style={styles.cardText}>
                                        📅 Créée le :{" "}
                                        <Text style={styles.cardValue}>
                                            {new Date(
                                                item.createdat
                                            ).toLocaleDateString()}
                                        </Text>
                                    </Text>
                                    <Text style={styles.cardText}>
                                        💳 Statut :{" "}
                                        <Text
                                            style={[
                                                styles.cardValue,
                                                {
                                                    color: item.paid
                                                        ? "lightgreen"
                                                        : "tomato",
                                                },
                                            ]}
                                        >
                                            {item.paid
                                                ? "✅ Payé"
                                                : "❌ Non payé"}
                                        </Text>
                                    </Text>
                                    {item.received && (
                                        <View
                                            style={{
                                                flexDirection: "row",
                                                alignItems: "center",
                                                marginTop: 10,
                                                backgroundColor:
                                                    item.serial ===
                                                        item.originalSerial &&
                                                    item.serial !== ""
                                                        ? "#e6ffe6"
                                                        : "#fff",
                                                padding: 8,
                                                borderRadius: 8,
                                                borderWidth: 1,
                                                borderColor: "#888",
                                            }}
                                        >
                                            <TextInput
                                                placeholder="Numéro de série"
                                                value={item.serial || ""}
                                                onChangeText={(text) => {
                                                    setOrders((prev) =>
                                                        prev.map((o) =>
                                                            o.id === item.id
                                                                ? {
                                                                      ...o,
                                                                      serial: text,
                                                                  }
                                                                : o
                                                        )
                                                    );
                                                }}
                                                editable={
                                                    !item.originalSerial ||
                                                    item.serial !==
                                                        item.originalSerial
                                                }
                                                style={{
                                                    flex: 1,
                                                    fontSize: 16,
                                                    color: "#000",
                                                    padding: 6,
                                                }}
                                            />

                                            <TouchableOpacity
                                                disabled={
                                                    item.serial ===
                                                    item.originalSerial
                                                }
                                                onPress={async () => {
                                                    try {
                                                        const { error } =
                                                            await supabase
                                                                .from("orders")
                                                                .update({
                                                                    serial: item.serial,
                                                                })
                                                                .eq(
                                                                    "id",
                                                                    item.id
                                                                );

                                                        if (error) throw error;

                                                        Alert.alert(
                                                            "✅ Numéro de série sauvegardé"
                                                        );
                                                        loadOrders();
                                                    } catch (e) {
                                                        console.error(
                                                            "❌ Erreur sauvegarde numéro de série :",
                                                            e
                                                        );
                                                        Alert.alert(
                                                            "Erreur",
                                                            "Impossible de sauvegarder le numéro."
                                                        );
                                                    }
                                                }}
                                                style={{
                                                    backgroundColor:
                                                        item.serial ===
                                                        item.originalSerial
                                                            ? "#ccc"
                                                            : "#4da6ff",
                                                    paddingVertical: 8,
                                                    paddingHorizontal: 12,
                                                    borderRadius: 6,
                                                    marginLeft: 8,
                                                }}
                                            >
                                                <Text
                                                    style={{
                                                        color:
                                                            item.serial ===
                                                            item.originalSerial
                                                                ? "#666"
                                                                : "#fff",
                                                        fontWeight: "bold",
                                                        fontSize: 14,
                                                    }}
                                                >
                                                    Valider
                                                </Text>
                                            </TouchableOpacity>

                                            {item.serial ===
                                                item.originalSerial &&
                                                item.serial !== "" && (
                                                    <Text
                                                        style={{
                                                            fontSize: 20,
                                                            marginLeft: 8,
                                                            color: "green",
                                                        }}
                                                    >
                                                        ✅
                                                    </Text>
                                                )}
                                        </View>
                                    )}

                                    {/* ✅ Boutons Imprimer + Marquer récupérée alignés */}
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            flexWrap: "wrap",
                                            justifyContent: "space-between",
                                            marginTop: 10,

                                        }}
                                    >
                                        {/* Ligne 3 : Bouton Imprimer */}
                                        <TouchableOpacity
                                            style={[styles.squareButton]}
                                            onPress={() => {
                                                const remaining =
                                                    item.price -
                                                    (item.deposit || 0);
                                                const order = {
                                                    id: item.id,
                                                    client: {
                                                        id: clientId,
                                                        name: clientName,
                                                        ficheNumber:
                                                            clientNumber,
                                                    },
                                                    deviceType: item.product,
                                                    brand: item.brand,
                                                    model: item.model,
                                                    cost: item.price,
                                                    acompte: item.deposit,
                                                    remaining: remaining,
                                                    signatureclient:
                                                        item.signatureclient,
                                                    printed: item.printed,
                                                };
                                                navigation.navigate(
                                                    "CommandePreviewPage",
                                                    { order }
                                                );
                                            }}
                                        >
                                            <Text
                                                style={styles.squareButtonText}
                                            >
                                                🖨️ Imprimer
                                            </Text>
                                        </TouchableOpacity>
                                        {/* Ligne 2 */}
                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.ordered && {
                                                    backgroundColor: "#ccc",
                                                },
                                            ]}
                                            onPress={() =>
                                                !item.ordered &&
                                                handleMarkAsOrdered(item)
                                            }
                                            disabled={item.ordered}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.ordered && {
                                                        color: "#666",
                                                    },
                                                ]}
                                            >
                                                {item.ordered
                                                    ? "✅ Commande passée"
                                                    : "📦 Commande passée"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.received && {
                                                    backgroundColor: "#ccc",
                                                },
                                            ]}
                                            onPress={() =>
                                                !item.received &&
                                                handleMarkAsReceived(item)
                                            }
                                            disabled={item.received}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.received && {
                                                        color: "#666",
                                                    },
                                                ]}
                                            >
                                                {item.received
                                                    ? "✅ Reçue"
                                                    : "📦 Commande reçue"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.paid && {
                                                    backgroundColor: "#ccc",
                                                },
                                            ]}
                                            onPress={() =>
                                                !item.paid &&
                                                handleMarkAsPaid(item)
                                            }
                                            disabled={item.paid}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.paid && {
                                                        color: "#666",
                                                    },
                                                ]}
                                            >
                                                {item.paid
                                                    ? "✅ Payé"
                                                    : "💰 Paiement reçu"}
                                            </Text>
                                        </TouchableOpacity>

                                        {(item.billing?.length ?? 0) === 0 ? (
                                            <TouchableOpacity
                                                style={styles.squareButton}
                                                onPress={() =>
                                                    navigation.navigate(
                                                        "BillingPage",
                                                        {
                                                            expressData: {
                                                                order_id:
                                                                    item.id,
                                                                clientname:
                                                                    clientName,
                                                                clientphone:
                                                                    clientPhone,
                                                                product:
                                                                    item.product,
                                                                brand: item.brand,
                                                                model: item.model,
                                                                price: item.price?.toString(),
                                                                quantity: "1",
                                                                description: `${item.product} ${item.brand} ${item.model}`,
                                                                acompte:
                                                                    item.deposit?.toString() ||
                                                                    "0",
                                                                paymentmethod:
                                                                    item.paymentmethod ||
                                                                    "",
                                                                serial:
                                                                    item.serial ||
                                                                    "",
                                                                paid:
                                                                    item.paid ||
                                                                    false,
                                                            },
                                                        }
                                                    )
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.squareButtonText
                                                    }
                                                >
                                                    🧾 Créer Facture
                                                </Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <View
                                                style={
                                                    styles.squareButtonDisabled
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.squareButtonText
                                                    }
                                                >
                                                    ✅ Facture créée
                                                </Text>
                                            </View>
                                        )}
                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.recovered && {
                                                    backgroundColor: "#ccc",
                                                },
                                            ]}
                                            onPress={() =>
                                                !item.recovered &&
                                                handleMarkAsRecovered(item)
                                            }
                                            disabled={item.recovered}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.recovered && {
                                                        color: "#666",
                                                    },
                                                ]}
                                            >
                                                {item.recovered
                                                    ? "✅ Récupérée"
                                                    : "📦 Commande récupérée"}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.saved && {
                                                    backgroundColor: "#ccc",
                                                },
                                            ]}
                                            disabled={item.saved}
                                            onPress={() =>
                                                handleSaveOrder(item)
                                            }
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.saved && {
                                                        color: "#666",
                                                    },
                                                ]}
                                            >
                                                {item.saved
                                                    ? "✅ Sauvegardée"
                                                    : "💾 Sauvegarder"}
                                            </Text>
                                        </TouchableOpacity>



                                        <TouchableOpacity
                                            style={[styles.squareButton]}
                                            onPress={() =>
                                                handleDeleteOrder(item)
                                            }
                                        >
                                            <Text
                                                style={styles.squareButtonText}
                                            >
                                                🗑 Supprimer
                                            </Text>
                                        </TouchableOpacity>
{/* 📩 Notifier */}
<TouchableOpacity
  style={[
    styles.squareButton,
    // gris & inactif si la commande n’est pas reçue OU déjà notifiée
    (!item.received || item.notified) && { backgroundColor: "#ccc" },
  ]}
  disabled={!item.received || item.notified}
  onPress={() => notifyOrderBySMS(item)}
>
  <Text
    style={[
      styles.squareButtonText,
      (!item.received || item.notified) && { color: "#666666" },
    ]}
  >
    {item.notified ? "✅ Notifié" : "📩 Notifier"}
  </Text>
</TouchableOpacity>



                                        <TouchableOpacity
                                            style={[styles.squareButton]}
                                            onPress={() => navigation.goBack()}
                                        >
                                            <Text
                                                style={styles.squareButtonText}
                                            >
                                                ⬅ Retour
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
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
    container: { flex: 1, padding: 20, backgroundColor: "#e0e0e0" },
    header: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#242424",
        marginBottom: 10,
    },
    orderCard: {
        padding: 20,
		paddingBottom: 10,
        backgroundColor: "#cacaca",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#3e4c69",
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 10,
        color: "#242424",
    },
    cardText: {
        fontSize: 16,
        marginBottom: 5,
        color: "#242424",
    },
    cardValue: {
        fontWeight: "bold",
        color: "#242424",
    },
    input: {
        borderWidth: 1,
        borderColor: "#53669b",
        padding: 10,
        marginBottom: 20,
        borderRadius: 5,
        backgroundColor: "#cacaca",
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
        marginBottom: 10,
        marginTop: 10,
        fontSize: 18,
        fontWeight: "medium",
        color: "#cacaca",
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
        marginBottom: 10,
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
        marginBottom: 10,
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
        marginBottom: 10,
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
        marginBottom: 10,
        fontSize: 18,
        fontWeight: "medium",
        color: "#888787",
    },
    formContainer: { marginBottom: 20 },
    addButton: {
        width: "60%",
        padding: 10,
        borderRadius: 2,
        alignItems: "center",
    },
    buttonOrderText: { fontSize: 18, fontWeight: "bold", color: "#888787" },
    buttonRecovered: {
        flexDirection: "row",
        gap: 5,
        alignItems: "center",
        backgroundColor: "#191f2f",
        padding: 15,
        borderWidth: 1,
        borderRadius: 2,
        borderColor: "#04a026",
        marginBottom: 20,
        marginTop: 20,
        fontSize: 18,
        fontWeight: "medium",
        color: "#888787",
    },
    squareButton: {
width: "30%",
		paddingVertical: 10,
        backgroundColor: "#191f2f",
        borderWidth: 1,
        borderColor: "#888787",
        borderRadius: 4,
        marginVertical: 8,
        alignItems: "center",
        justifyContent: "center",
    },
    squareButtonText: {
        color: "#888787",
        fontSize: 14,
        textAlign: "center",
    },
    squareButtonText: {
        color: "#fff",
        fontWeight: "bold",
        textAlign: "center",
    },
    squareButtonDisabled: {

width: "30%",
        backgroundColor: "#636262",
        borderWidth: 1,
        borderColor: "#888787",
        borderRadius: 4,
        marginVertical: 8,
        alignItems: "center",
        justifyContent: "center",
    },
});
