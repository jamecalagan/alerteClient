import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
    TextInput,
    Image,
    StatusBar,
} from "react-native";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";

const PAGE_SIZE = 6;

const CURRENCY = (n) =>
    Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const formatPhone = (phone) =>
    phone ? String(phone).replace(/(\d{2})(?=\d)/g, "$1 ").trim() : "—";

const fmtDate = (v) => {
    if (!v) return "—";
    try {
        return new Date(v).toLocaleDateString("fr-FR");
    } catch {
        return "—";
    }
};

export default function DepositsPage({ navigation }) {
    const [clientsList, setClientsList] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const { data: interventions, error: errInt } = await supabase
                .from("interventions")
                .select(
                    "id, client_id, deviceType, brand, model, partialPayment, cost, solderestant, paymentStatus, createdAt, clients(name, ficheNumber, phone)"
                )
                .gt("partialPayment", 0);

            if (errInt) throw errInt;

            const { data: orders, error: errOrd } = await supabase
                .from("orders")
                .select(
                    "id, client_id, product, deposit, price, paid, createdat, clients(name, ficheNumber, phone)"
                )
                .gt("deposit", 0)
                .or("deleted.eq.false,deleted.is.null");

            if (errOrd) throw errOrd;

            const map = new Map();

            const addRow = (row) => {
                if (!map.has(row.client_id)) {
                    map.set(row.client_id, {
                        clientId: row.client_id,
                        clientName: row.clientName,
                        ficheNumber: row.ficheNumber,
                        phone: row.phone,
                        totalDeposit: 0,
                        details: [],
                    });
                }
                const obj = map.get(row.client_id);
                obj.totalDeposit += row.amount;
                obj.details.push(row);
            };

            (interventions || []).forEach((i) => {
                addRow({
                    source: "intervention",
                    client_id: i.client_id,
                    clientName: i.clients?.name ?? "Inconnu",
                    ficheNumber: i.clients?.ficheNumber,
                    phone: i.clients?.phone,
                    amount: i.partialPayment || 0,
                    label: [i.deviceType, i.brand, i.model].filter(Boolean).join(" "),
                    total: i.cost,
                    remaining: i.solderestant,
                    status: i.paymentStatus,
                    date: i.createdAt,
                });
            });

            (orders || []).forEach((o) => {
                addRow({
                    source: "order",
                    client_id: o.client_id,
                    clientName: o.clients?.name ?? "Inconnu",
                    ficheNumber: o.clients?.ficheNumber,
                    phone: o.clients?.phone,
                    amount: o.deposit || 0,
                    label: o.product,
                    total: o.price,
                    remaining: (o.price || 0) - (o.deposit || 0),
                    status: o.paid ? "solde" : "non_regle",
                    date: o.createdat,
                });
            });

            const aggregated = Array.from(map.values()).sort(
                (a, b) => b.totalDeposit - a.totalDeposit
            );
            setClientsList(aggregated);
        } catch (error) {
            console.error("Erreur chargement acomptes :", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const filtered = clientsList.filter((c) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase().replace(",", ".");
        const matchesText =
            c.clientName?.toLowerCase().includes(q) ||
            String(c.ficheNumber ?? "").includes(q) ||
            String(c.phone ?? "").includes(q);
        const matchesAmount =
            (c.totalDeposit || 0).toFixed(2).includes(q) ||
            c.details.some((d) => (d.amount || 0).toFixed(2).includes(q));
        return matchesText || matchesAmount;
    });

    const grandTotal = filtered.reduce((sum, c) => sum + c.totalDeposit, 0);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginatedClients = filtered.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [search, clientsList]);

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Acomptes reçus</Text>
            <Text style={styles.subheader}>
                Clients ayant versé un acompte sur une intervention ou une commande
            </Text>

            <TextInput
                style={styles.search}
                placeholder="Rechercher (nom, fiche, téléphone, montant)"
                placeholderTextColor="#94a3b8"
                value={search}
                onChangeText={setSearch}
            />

            {isLoading ? (
                <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 30 }} />
            ) : filtered.length === 0 ? (
                <Text style={styles.noRowsText}>Aucun acompte trouvé.</Text>
            ) : (
                <FlatList
                    data={paginatedClients}
                    keyExtractor={(item) => String(item.clientId)}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.clientTitle}>{item.clientName}</Text>
                                    <Text style={styles.clientSub}>
                                        {item.ficheNumber ? `Fiche n° ${item.ficheNumber}` : ""}
                                        {item.phone ? `  ·  ${formatPhone(item.phone)}` : ""}
                                    </Text>
                                </View>
                                <Text style={styles.depositAmount}>
                                    {CURRENCY(item.totalDeposit)}
                                </Text>
                            </View>

                            {item.details.map((d, index) => (
                                <View key={index} style={styles.detailRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.detailLabel}>
                                            {d.source === "order" ? "Commande" : "Intervention"} — {d.label || "—"}
                                        </Text>
                                        <Text style={styles.detailSub}>
                                            {fmtDate(d.date)} · Total {CURRENCY(d.total)}
                                            {d.remaining > 0
                                                ? ` · Reste ${CURRENCY(d.remaining)}`
                                                : " · Soldé"}
                                        </Text>
                                    </View>
                                    <Text style={styles.detailAmount}>{CURRENCY(d.amount)}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                />
            )}

            {!isLoading && filtered.length > PAGE_SIZE && (
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

            {!isLoading && filtered.length > 0 && (
                <View style={styles.totalContainer}>
                    <Text style={styles.totalText}>
                        Total des acomptes : {CURRENCY(grandTotal)}
                    </Text>
                </View>
            )}

            <BackButton onPress={() => navigation.goBack()} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        paddingTop: 20 + (StatusBar.currentHeight || 0),
        backgroundColor: "#eef2ff",
    },
    header: {
        fontSize: 24,
        fontWeight: "800",
        color: "#0f172a",
        textAlign: "center",
    },
    subheader: {
        fontSize: 13,
        color: "#64748b",
        textAlign: "center",
        marginTop: 4,
        marginBottom: 16,
    },
    search: {
        borderWidth: 1.5,
        borderColor: "#c7d2fe",
        borderRadius: 14,
        backgroundColor: "#ffffff",
        paddingHorizontal: 14,
        height: 46,
        fontSize: 15,
        color: "#0f172a",
        marginBottom: 16,
    },
    card: {
        backgroundColor: "#ffffff",
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        shadowColor: "#312e81",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    clientTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
    clientSub: { fontSize: 13, color: "#64748b", marginTop: 2 },
    depositAmount: { fontSize: 18, fontWeight: "800", color: "#059669" },
    detailRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: 8,
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: "#e0e7ff",
    },
    detailLabel: { fontSize: 14, color: "#1e293b", fontWeight: "600" },
    detailSub: { fontSize: 12, color: "#64748b", marginTop: 2 },
    detailAmount: { fontSize: 14, fontWeight: "700", color: "#334155", marginLeft: 10 },
    noRowsText: { fontSize: 16, color: "#64748b", textAlign: "center", marginTop: 50 },
    totalContainer: {
        marginTop: 8,
        marginBottom: 12,
        padding: 15,
        backgroundColor: "#ffffff",
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: "#a5b4fc",
    },
    totalText: {
        fontSize: 18,
        fontWeight: "800",
        color: "#3730a3",
        textAlign: "center",
    },
    pager: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginTop: 4,
        marginBottom: 4,
    },
    pagerBtn: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#ffffff",
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
        color: "#334155",
    },
});
