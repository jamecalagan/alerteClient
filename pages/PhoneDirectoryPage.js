import React, { useEffect, useMemo, useState } from "react";
import {
    View,
    Text,
    SectionList,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
    Image,
    StatusBar,
} from "react-native";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";

const PAGE_SIZE = 13;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const formatPhone = (phone) =>
    phone ? String(phone).replace(/(\d{2})(?=\d)/g, "$1 ").trim() : "—";

const firstLetterOf = (name) => {
    const cleaned = (name || "").trim().toUpperCase();
    const letter = cleaned.charAt(0);
    return ALPHABET.includes(letter) ? letter : "#";
};

export default function PhoneDirectoryPage({ navigation }) {
    const [clients, setClients] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedLetter, setSelectedLetter] = useState(null); // null = "Tous"
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from("clients")
                    .select("id, name, phone, email, ficheNumber")
                    .order("name", { ascending: true });

                if (error) throw error;
                setClients(data || []);
            } catch (e) {
                console.error("Erreur chargement répertoire :", e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const availableLetters = useMemo(
        () => new Set(clients.map((c) => firstLetterOf(c.name))),
        [clients]
    );

    const filteredClients = useMemo(() => {
        let list = clients;

        if (selectedLetter) {
            list = list.filter((c) => firstLetterOf(c.name) === selectedLetter);
        }

        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(
                (c) =>
                    c.name?.toLowerCase().includes(q) ||
                    String(c.phone ?? "").includes(q) ||
                    String(c.ficheNumber ?? "").includes(q)
            );
        }

        return list;
    }, [clients, search, selectedLetter]);

    const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
    const paginatedClients = filteredClients.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [search, selectedLetter, clients]);

    const sections = useMemo(() => {
        const map = new Map();
        paginatedClients.forEach((c) => {
            const letter = firstLetterOf(c.name);
            if (!map.has(letter)) map.set(letter, []);
            map.get(letter).push(c);
        });
        return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([title, data]) => ({ title, data }));
    }, [paginatedClients]);

    return (
        <View style={styles.screen}>
            <Text style={styles.header}>Répertoire téléphonique</Text>

            <TextInput
                style={styles.search}
                placeholder="Rechercher (nom, téléphone, fiche)"
                placeholderTextColor="#94a3b8"
                value={search}
                onChangeText={setSearch}
            />

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabsScroll}
                contentContainerStyle={styles.tabsContent}
            >
                <TouchableOpacity
                    onPress={() => setSelectedLetter(null)}
                    style={[styles.tab, !selectedLetter && styles.tabActive]}
                >
                    <Text
                        style={[
                            styles.tabText,
                            !selectedLetter && styles.tabTextActive,
                        ]}
                    >
                        Tous
                    </Text>
                </TouchableOpacity>

                {ALPHABET.map((letter) => {
                    const available = availableLetters.has(letter);
                    const isActive = selectedLetter === letter;
                    return (
                        <TouchableOpacity
                            key={letter}
                            onPress={() => available && setSelectedLetter(letter)}
                            disabled={!available}
                            style={[
                                styles.tab,
                                isActive && styles.tabActive,
                                !available && styles.tabDisabled,
                            ]}
                        >
                            <Text
                                style={[
                                    styles.tabText,
                                    isActive && styles.tabTextActive,
                                    !available && styles.tabTextDisabled,
                                ]}
                            >
                                {letter}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {isLoading ? (
                <ActivityIndicator size="large" color="#4f46e5" style={{ marginTop: 30 }} />
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    stickySectionHeadersEnabled
                    renderSectionHeader={({ section }) => (
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionHeaderText}>{section.title}</Text>
                        </View>
                    )}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.row}
                            activeOpacity={0.8}
                            onPress={() =>
                                navigation.navigate("ClientInterventionsPage", {
                                    clientId: item.id,
                                })
                            }
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={styles.rowName}>{item.name || "—"}</Text>
                                {item.ficheNumber != null && (
                                    <Text style={styles.rowFiche}>
                                        Fiche n° {item.ficheNumber}
                                    </Text>
                                )}
                            </View>
                            {item.phone ? (
                                <TouchableOpacity
                                    onLongPress={() =>
                                        Linking.openURL(`tel:${item.phone}`)
                                    }
                                    delayLongPress={350}
                                    style={styles.phonePill}
                                >
                                    <Text style={styles.phonePillText}>
                                        {formatPhone(item.phone)}
                                    </Text>
                                </TouchableOpacity>
                            ) : (
                                <Text style={styles.rowPhoneMissing}>—</Text>
                            )}
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                        <Text style={styles.emptyText}>Aucun client trouvé.</Text>
                    }
                />
            )}

            {!isLoading && filteredClients.length > PAGE_SIZE && (
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

            <BackButton onPress={() => navigation.goBack()} style={{ marginHorizontal: 20, marginBottom: 12 }} />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "#eef2ff",
        paddingTop: 16 + (StatusBar.currentHeight || 0),
    },
    header: {
        fontSize: 24,
        fontWeight: "800",
        color: "#0f172a",
        textAlign: "center",
        marginBottom: 12,
    },
    search: {
        borderWidth: 1.5,
        borderColor: "#c7d2fe",
        borderRadius: 14,
        backgroundColor: "#ffffff",
        marginHorizontal: 20,
        paddingHorizontal: 14,
        height: 46,
        fontSize: 15,
        color: "#0f172a",
        marginBottom: 12,
    },
    tabsScroll: { flexGrow: 0, marginBottom: 10 },
    tabsContent: {
        paddingHorizontal: 20,
        gap: 8,
    },
    tab: {
        minWidth: 40,
        height: 40,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: "#ffffff",
        borderWidth: 1.5,
        borderColor: "#c7d2fe",
        alignItems: "center",
        justifyContent: "center",
    },
    tabActive: {
        backgroundColor: "#4f46e5",
        borderColor: "#4f46e5",
    },
    tabDisabled: {
        backgroundColor: "#f1f5f9",
        borderColor: "#e2e8f0",
    },
    tabText: {
        fontSize: 15,
        fontWeight: "700",
        color: "#3730a3",
    },
    tabTextActive: {
        color: "#ffffff",
    },
    tabTextDisabled: {
        color: "#cbd5e1",
    },
    sectionHeader: {
        backgroundColor: "#eef2ff",
        paddingLeft: 20,
        paddingVertical: 4,
    },
    sectionHeaderText: {
        fontSize: 14,
        fontWeight: "800",
        color: "#3730a3",
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#ffffff",
        marginHorizontal: 20,
        marginTop: 6,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        shadowColor: "#312e81",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 1,
    },
    rowName: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
    rowFiche: { fontSize: 12, color: "#64748b", marginTop: 2 },
    rowPhoneMissing: { fontSize: 13, color: "#94a3b8" },
    phonePill: {
        borderWidth: 1,
        borderColor: "#16a34a",
        backgroundColor: "#dcfce7",
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    phonePillText: { fontSize: 13, fontWeight: "700", color: "#15803d" },
    emptyText: {
        textAlign: "center",
        color: "#64748b",
        marginTop: 40,
        fontSize: 15,
    },
    pager: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        marginTop: 4,
        marginBottom: 8,
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
