import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    Image,
} from "react-native";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";

export default function OngoingAmountsPage({ navigation }) {
    const [clientsDue, setClientsDue] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [grandTotal, setGrandTotal] = useState(0);
    const [showOnHold, setShowOnHold] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 4;

    const loadData = async () => {
        setIsLoading(true);
        try {
            const { data: interventions, error: errInt } = await supabase
                .from("interventions")
                .select("id, solderestant, client_id, status, brand, model, description, updatedAt, on_hold, clients(name, ficheNumber)")
                .neq("status", "Récupéré")
                .neq("status", "Non réparable")
                .gt("solderestant", 0);

            if (errInt) throw errInt;

            const { data: orders, error: errOrd } = await supabase
                .from("orders")
                .select("id, product, model, price, deposit, paid, ordered, received, deleted, createdat, client_id, on_hold, clients(name, ficheNumber)")
                .eq("deleted", false)
                .or("paid.eq.false,paid.is.null");

            if (errOrd) throw errOrd;

            const map = new Map();

            const addToClient = (row) => {
                if (!row) return;
                const { client_id, amountDue, clientName, ficheNumber, on_hold } = row;
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
                if (!on_hold) {
                    obj.totalDue += amountDue;
                }
                obj.details.push(row);
            };

            (interventions || []).forEach((i) => {
                addToClient({
                    id: i.id,
                    source: "intervention",
                    client_id: i.client_id,
                    clientName: i.clients?.name ?? "Inconnu",
                    ficheNumber: i.clients?.ficheNumber,
                    amountDue: i.solderestant ?? 0,
                    description: i.description,
                    status: i.status,
					brand: i.brand,
					model: i.model,
                    updatedAt: i.updatedAt ?? new Date().toISOString(),
                    on_hold: !!i.on_hold,
                });
            });

            (orders || []).forEach((o) => {
                const remaining = (o.price || 0) - (o.deposit || 0);
                if (remaining <= 0) return;

                let orderStatus = "En cours";
                if (o.received) orderStatus = "Reçue";
                else if (o.ordered) orderStatus = "Commandée";

                addToClient({
                    id: o.id,
                    source: "order",
                    client_id: o.client_id,
                    clientName: o.clients?.name ?? "Inconnu",
                    ficheNumber: o.clients?.ficheNumber,
                    amountDue: remaining,
                    label: `Commande #${o.id}`,
                    description: `Commande #${o.id}`,
                    status: orderStatus,
					brand: o.brand ?? "Inconnu",
					model: o.model ?? "Inconnu",
                    updatedAt: o.createdat ?? new Date().toISOString(),
                    on_hold: !!o.on_hold,
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

    const toggleOnHold = async (detail) => {
        const table = detail.source === "order" ? "orders" : "interventions";
        const nextValue = !detail.on_hold;

        const { error } = await supabase
            .from(table)
            .update({ on_hold: nextValue })
            .eq("id", detail.id);

        if (error) {
            console.error("Erreur mise de côté :", error);
            return;
        }

        setClientsDue((prev) =>
            prev.map((client) => {
                if (client.clientId !== detail.client_id) return client;
                const details = client.details.map((d) =>
                    d.source === detail.source && d.id === detail.id
                        ? { ...d, on_hold: nextValue }
                        : d
                );
                const totalDue = details.reduce(
                    (sum, d) => (d.on_hold ? sum : sum + d.amountDue),
                    0
                );
                return { ...client, details, totalDue };
            })
        );
    };

    const onHoldCount = clientsDue.reduce(
        (sum, c) => sum + c.details.filter((d) => d.on_hold).length,
        0
    );

    const displayedClients = showOnHold
        ? clientsDue
        : clientsDue
              .map((c) => ({ ...c, details: c.details.filter((d) => !d.on_hold) }))
              .filter((c) => c.details.length > 0);

    const totalPages = Math.max(1, Math.ceil(displayedClients.length / PAGE_SIZE));
    const paginatedClients = displayedClients.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [showOnHold, clientsDue]);

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
                        data={paginatedClients}
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
                                    <View
                                        key={index}
                                        style={{ marginTop: 8, opacity: detail.on_hold ? 0.5 : 1 }}
                                    >
                                        <Text style={styles.detailText}>{detail.description}</Text>
                                        <Text style={styles.detailText}>Statut : {detail.status}</Text>
										<Text style={styles.detailText}>Marque : {detail.brand} {detail.model}</Text>
                                        <Text style={styles.detailText}>Mise à jour : {new Date(detail.updatedAt).toLocaleString("fr-FR")}</Text>
                                        {detail.on_hold && (
                                            <Text style={styles.onHoldTag}>Mise de côté</Text>
                                        )}
                                        <TouchableOpacity
                                            onPress={() => toggleOnHold(detail)}
                                            style={styles.onHoldBtn}
                                        >
                                            <Text style={styles.onHoldBtnText}>
                                                {detail.on_hold ? "Réactiver" : "Mettre de côté"}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    />

                    {displayedClients.length > PAGE_SIZE && (
                        <View style={styles.pager}>
                            <TouchableOpacity
                                style={[styles.pagerBtn, currentPage <= 1 && styles.pagerBtnDisabled]}
                                disabled={currentPage <= 1}
                                onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                                onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            >
                                <Image
                                    source={require("../assets/icons/chevrond.png")}
                                    style={[
                                        styles.pagerIcon,
                                        { tintColor: currentPage >= totalPages ? "#cbd5e1" : "#4338ca" },
                                    ]}
                                />
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.totalContainer}>
                        <Text style={styles.totalText}>Montant total dû : {grandTotal} €</Text>
                    </View>
                    {onHoldCount > 0 && (
                        <TouchableOpacity
                            onPress={() => setShowOnHold((v) => !v)}
                            style={styles.showOnHoldLink}
                        >
                            <Text style={styles.showOnHoldLinkText}>
                                {showOnHold
                                    ? "Masquer les mises de côté"
                                    : `Afficher aussi les ${onHoldCount} mise${onHoldCount > 1 ? "s" : ""} de côté`}
                            </Text>
                        </TouchableOpacity>
                    )}
                </>
            )}
            <BackButton onPress={() => navigation.goBack()} />
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
    onHoldTag: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: "700",
        color: "#475569",
    },
    onHoldBtn: {
        alignSelf: "flex-start",
        marginTop: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#0d9488",
        backgroundColor: "#f0fdfa",
    },
    onHoldBtnText: {
        fontSize: 12,
        fontWeight: "700",
        color: "#0d9488",
    },
    showOnHoldLink: {
        marginTop: 12,
        alignItems: "center",
    },
    showOnHoldLinkText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#0d9488",
    },
    pager: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginTop: 14,
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
});