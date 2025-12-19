import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
} from "react-native";
import { supabase } from "../supabaseClient";

export default function OngoingAmountsPage({ navigation }) {
    const [clientsDue, setClientsDue] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [grandTotal, setGrandTotal] = useState(0);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const { data: interventions, error: errInt } = await supabase
                .from("interventions")
                .select("id, solderestant, client_id, status, brand, model, description, updatedAt, clients(name, ficheNumber)")
                .neq("status", "Récupéré")
                .neq("status", "Non réparable")
                .gt("solderestant", 0);

            if (errInt) throw errInt;

            const { data: orders, error: errOrd } = await supabase
                .from("orders")
                .select("id, product, model, price, deposit, paid, ordered, received, deleted, createdat, client_id, clients(name, ficheNumber)")
                .eq("deleted", false)
                .or("paid.eq.false,paid.is.null");

            if (errOrd) throw errOrd;

            const map = new Map();

            const addToClient = (row) => {
                if (!row) return;
                const { client_id, amountDue, clientName, ficheNumber } = row;
                if (!map.has(client_id)) {
                    map.set(client_id, {
                        clientId: client_id,
                        clientName,
                        ficheNumber,
                        totalDue: 0,
                        details: [],
                    });
                }
                const obj = map.get(client_id);
                obj.totalDue += amountDue;
                obj.details.push(row);
            };

            (interventions || []).forEach((i) => {
                addToClient({
                    client_id: i.client_id,
                    clientName: i.clients?.name ?? "Inconnu",
                    ficheNumber: i.clients?.ficheNumber,
                    amountDue: i.solderestant ?? 0,
                    description: i.description,
                    status: i.status,
					brand: i.brand,
					model: i.model,
                    updatedAt: i.updatedAt ?? new Date().toISOString(),
                });
            });

            (orders || []).forEach((o) => {
                const remaining = (o.price || 0) - (o.deposit || 0);
                if (remaining <= 0) return;

                let orderStatus = "En cours";
                if (o.received) orderStatus = "Reçue";
                else if (o.ordered) orderStatus = "Commandée";

                addToClient({
                    client_id: o.client_id,
                    clientName: o.clients?.name ?? "Inconnu",
                    ficheNumber: o.clients?.ficheNumber,
                    amountDue: remaining,
                    label: `Commande #${o.id}`,
                    status: orderStatus,
					brand: o.brand ?? "Inconnu",
					model: o.model ?? "Inconnu",
                    updatedAt: o.createdat ?? new Date().toISOString(),
                });
            });

            const aggregated = Array.from(map.values()).sort((a, b) => b.totalDue - a.totalDue);
            setClientsDue(aggregated);

            const total = aggregated.reduce((sum, c) => sum + c.totalDue, 0);
            setGrandTotal(total.toFixed(2));
        } catch (error) {
            console.error("Erreur lors du chargement des données :", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Sommes dues par client</Text>
            {isLoading ? (
                <ActivityIndicator size="large" color="#007BFF" />
            ) : clientsDue.length === 0 ? (
                <Text style={styles.noRowsText}>Aucune somme due pour le moment.</Text>
            ) : (
                <>
                    <FlatList
                        data={clientsDue}
                        keyExtractor={(item) => String(item.clientId)}
                        renderItem={({ item }) => (
                            <View
                                style={[
                                    styles.card,
                                    item.details.length > 1 && { borderColor: "#d42d2d", borderWidth: 2 },
                                ]}
                            >
                                <Text style={styles.clientTitle}>{item.clientName}</Text>
                                {item.ficheNumber && (
                                    <Text style={styles.clientText}>Fiche n° {item.ficheNumber}</Text>
                                )}
                                <Text style={styles.dueText}>{item.totalDue.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</Text>
                                <Text style={styles.detailHint}>({item.details.length} prestation(s))</Text>
                                {item.details.map((detail, index) => (
                                    <View key={index} style={{ marginTop: 8 }}>
                                        <Text style={styles.detailText}>{detail.description}</Text>
                                        <Text style={styles.detailText}>Statut : {detail.status}</Text>
										<Text style={styles.detailText}>Marque : {detail.brand} {detail.model}</Text>
                                        <Text style={styles.detailText}>Mise à jour : {new Date(detail.updatedAt).toLocaleString("fr-FR")}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    />
                    <View style={styles.totalContainer}>
                        <Text style={styles.totalText}>Montant total dû : {grandTotal} €</Text>
                    </View>
                </>
            )}
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                <Text style={styles.backButtonText}>Retour</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: "#e0e0e0",
    },
    header: {
        fontSize: 24,
        fontWeight: "500",
        marginBottom: 20,
        color: "#242424",
        textAlign: "center",
    },
    card: {
        backgroundColor: "#cacaca",
        padding: 15,
        marginBottom: 10,
        borderRadius: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    clientTitle: { fontSize: 18, fontWeight: "700", color: "#242424" },
    clientText: { fontSize: 14, color: "#242424", marginTop: 4 },
    dueText: { fontSize: 20, fontWeight: "700", color: "#b50000", marginTop: 8 },
    detailHint: { fontSize: 12, color: "#555", marginTop: 2 },
    detailText: { fontSize: 13, color: "#333" },
    totalContainer: {
        marginTop: 20,
        padding: 15,
        backgroundColor: "#191f2f",
        borderRadius: 2,
        borderWidth: 1,
        borderColor: "#888787",
    },
    totalText: { fontSize: 20, fontWeight: "500", color: "#ffffff", textAlign: "center" },
    noRowsText: { fontSize: 18, color: "#888787", textAlign: "center", marginTop: 50 },
    backButton: {
        marginTop: 20,
        padding: 15,
        backgroundColor: "#0c0f18",
        borderRadius: 2,
        borderWidth: 1,
        borderColor: "#888787",
        alignItems: "center",
    },
    backButtonText: { color: "#ffffff", fontWeight: "500", fontSize: 16 },
});