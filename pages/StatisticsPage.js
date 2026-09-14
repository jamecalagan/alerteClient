import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Dimensions,
} from "react-native";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";

const BAR_HUE = "#4f46e5";
const TOP_N_PRODUCTS = 10;
const TOP_N_TYPES = 8;

const normalize = (v) => (v || "").toString().trim();

const aggregate = (rows, keyFn) => {
    const map = new Map();
    rows.forEach((row) => {
        const key = keyFn(row);
        if (!key) return;
        map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
};

// Barre horizontale : une seule teinte (magnitude), longueur = valeur,
// bout arrondi, valeur affichée directement au bout de la barre.
const BarRow = ({ label, count, maxCount }) => {
    const screenWidth = Dimensions.get("window").width;
    const trackWidth = Math.min(screenWidth - 40, 600) - 140; // largeur dispo moins la colonne de libellé
    const widthPct = maxCount > 0 ? Math.max(4, (count / maxCount) * 100) : 0;

    return (
        <View style={styles.barRow}>
            <Text style={styles.barLabel} numberOfLines={1}>
                {label}
            </Text>
            <View style={[styles.barTrack, { width: trackWidth }]}>
                <View
                    style={[
                        styles.barFill,
                        { width: `${widthPct}%` },
                    ]}
                />
            </View>
            <Text style={styles.barValue}>{count}</Text>
        </View>
    );
};

const Section = ({ title, subtitle, data, topN }) => {
    const top = data.slice(0, topN);
    const maxCount = top.length > 0 ? top[0].count : 0;

    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSubtitle}>{subtitle}</Text>
            {top.length === 0 ? (
                <Text style={styles.emptyText}>Aucune donnée pour le moment.</Text>
            ) : (
                top.map((row) => (
                    <BarRow
                        key={row.label}
                        label={row.label}
                        count={row.count}
                        maxCount={maxCount}
                    />
                ))
            )}
        </View>
    );
};

export default function StatisticsPage({ navigation }) {
    const [isLoading, setIsLoading] = useState(true);
    const [byProduct, setByProduct] = useState([]);
    const [byType, setByType] = useState([]);
    const [totalRepaired, setTotalRepaired] = useState(0);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select("deviceType, brand, model, status")
                    .in("status", ["Réparé", "Récupéré"]);

                if (error) throw error;

                const rows = data || [];
                setTotalRepaired(rows.length);

                setByProduct(
                    aggregate(rows, (r) => {
                        const brand = normalize(r.brand);
                        const model = normalize(r.model);
                        if (!brand && !model) return null;
                        return [brand, model].filter(Boolean).join(" ");
                    })
                );

                setByType(
                    aggregate(rows, (r) => normalize(r.deviceType) || null)
                );
            } catch (e) {
                console.error("Erreur chargement statistiques :", e);
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, []);

    return (
        <View style={styles.screen}>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.header}>Statistiques des réparations</Text>
                <Text style={styles.subheader}>
                    Basé sur {totalRepaired} intervention{totalRepaired > 1 ? "s" : ""}{" "}
                    réparée{totalRepaired > 1 ? "s" : ""} (statut Réparé ou Récupéré)
                </Text>

                {isLoading ? (
                    <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 30 }} />
                ) : (
                    <>
                        <Section
                            title="Top produits réparés"
                            subtitle="Par marque et modèle"
                            data={byProduct}
                            topN={TOP_N_PRODUCTS}
                        />
                        <Section
                            title="Répartition par type de produit"
                            subtitle="Nombre de réparations par type d'appareil"
                            data={byType}
                            topN={TOP_N_TYPES}
                        />
                    </>
                )}
            </ScrollView>
            <BackButton onPress={() => navigation.goBack()} style={{ marginHorizontal: 20, marginBottom: 12 }} />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: "#eef2ff" },
    container: { padding: 20, paddingBottom: 10 },
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
        marginBottom: 20,
    },
    card: {
        backgroundColor: "#ffffff",
        borderRadius: 18,
        padding: 18,
        marginBottom: 16,
        shadowColor: "#312e81",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    cardTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a" },
    cardSubtitle: { fontSize: 12, color: "#64748b", marginTop: 2, marginBottom: 14 },
    emptyText: { fontSize: 14, color: "#94a3b8", textAlign: "center", paddingVertical: 10 },
    barRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 10,
    },
    barLabel: {
        width: 130,
        fontSize: 13,
        fontWeight: "600",
        color: "#334155",
        marginRight: 8,
    },
    barTrack: {
        height: 20,
        backgroundColor: "#eef2ff",
        borderRadius: 4,
        overflow: "hidden",
    },
    barFill: {
        height: "100%",
        backgroundColor: BAR_HUE,
        borderRadius: 4,
    },
    barValue: {
        marginLeft: 8,
        minWidth: 28,
        fontSize: 13,
        fontWeight: "700",
        color: "#3730a3",
        textAlign: "right",
    },
});
