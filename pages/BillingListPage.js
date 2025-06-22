import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    Alert,
    TextInput,
    FlatList,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
const pageSize = 3;

export default function BillingListPage() {
    const [bills, setBills] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [showDeleted, setShowDeleted] = useState(false);
    const [activeCount, setActiveCount] = useState(0);
    const [deletedCount, setDeletedCount] = useState(0);
    const navigation = useNavigation();
    const [selectedIds, setSelectedIds] = useState([]);
    const [searchText, setSearchText] = useState("");
    const [filteredBills, setFilteredBills] = useState([]);

    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        fetchBills();
    }, [showDeleted]);

    const fetchBills = async () => {
        const { data, error } = await supabase
            .from("billing")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Erreur chargement factures:", error);
            return;
        }

        const actives = data.filter((bill) => !bill.deleted);
        const deleted = data.filter((bill) => bill.deleted);

        setActiveCount(actives.length);
        setDeletedCount(deleted.length);
        setBills(showDeleted ? deleted : actives);
        setFilteredBills(showDeleted ? deleted : actives);

        setCurrentPage(1); // reset page on toggle
    };
    const handleSearch = (text) => {
        setSearchText(text);
        setIsSearching(text.length > 0);

        const source = showDeleted
            ? bills.filter((b) => b.deleted)
            : bills.filter((b) => !b.deleted);

        const filtered = source.filter(
            (bill) =>
                bill.clientname.toLowerCase().includes(text.toLowerCase()) ||
                bill.invoicenumber.toLowerCase().includes(text.toLowerCase())
        );

        setFilteredBills(filtered);
        setCurrentPage(1);
    };

    const paginatedBills = bills.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    const totalPages = Math.max(1, Math.ceil(bills.length / pageSize));

    const deleteBill = async (id) => {
        Alert.alert("Confirmation", "Supprimer cette facture ?", [
            { text: "Annuler", style: "cancel" },
            {
                text: "Supprimer",
                style: "destructive",
                onPress: async () => {
                    const { error } = await supabase
                        .from("billing")
                        .update({ deleted: true })
                        .eq("id", id);
                    if (error) {
                        console.error("Erreur suppression:", error);
                    } else {
                        fetchBills();
                    }
                },
            },
        ]);
    };

    const restoreBill = async (id) => {
        const { error } = await supabase
            .from("billing")
            .update({ deleted: false })
            .eq("id", id);
        if (!error) fetchBills();
    };
    const toggleSelection = (id) => {
        setSelectedIds((prev) =>
            prev.includes(id)
                ? prev.filter((item) => item !== id)
                : [...prev, id]
        );
    };
	const billsToDisplay = isSearching
  ? filteredBills.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  : paginatedBills;
    return (
        <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 120 }]}>
                <Text style={styles.title}>📄 Liste des factures</Text>

                <View style={styles.searchWrapper}>
                    <Text
                        style={[
                            styles.floatingLabel,
                            isSearching && styles.floatingLabelActive,
                        ]}
                    >
                        Rechercher facture ou client
                    </Text>
                    <View
                        style={[
                            styles.inputContainer,
                            isSearching && styles.inputContainerActive,
                        ]}
                    >
                        <TextInput
                            style={styles.searchInputStyled}
                            value={searchText}
                            onChangeText={handleSearch}
                            placeholder="Ex: Dupont, FAC-123"
                            placeholderTextColor="#aaa"
                            onFocus={() => setIsSearching(true)}
                            onBlur={() => {
                                if (!searchText) setIsSearching(false);
                            }}
                        />
                    </View>
                </View>

                <View style={styles.toggleRow}>
                    <TouchableOpacity
                        onPress={() => setShowDeleted(false)}
                        style={[styles.toggleButton, !showDeleted && styles.toggleActive]}
                    >
                        <Text style={styles.toggleText}>✅ Actives ({activeCount})</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setShowDeleted(true)}
                        style={[styles.toggleButton, showDeleted && styles.toggleActive]}
                    >
                        <Text style={styles.toggleText}>🗑️ Supprimées ({deletedCount})</Text>
                    </TouchableOpacity>
                </View>

                {billsToDisplay.map((bill) => (
                    <TouchableOpacity
                        key={bill.id}
                        onPress={() => toggleSelection(bill.id)}
                        activeOpacity={0.8}
                        style={[
                            styles.card,
                            selectedIds.includes(bill.id) && styles.cardSelected,
                        ]}
                    >
                        <TouchableOpacity
                            onPress={() => toggleSelection(bill.id)}
                            style={{
                                alignSelf: "flex-end",
                                marginBottom: 8,
                                padding: 6,
                            }}
                        >
                            <Text style={{ fontSize: 16 }}>
                                {selectedIds.includes(bill.id) ? "✅" : "☐"}
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.label}>Client : {bill.clientname}</Text>
                        <Text style={styles.label}>Facture N° : {bill.invoicenumber}</Text>
                        <Text style={styles.label}>
                            Date : {new Date(bill.invoicedate).toLocaleDateString()}
                        </Text>
                        <Text style={styles.label}>
                            Total TTC : {parseFloat(bill.totalttc).toFixed(2)} €
                        </Text>

                        {showDeleted ? (
                            <View style={styles.deletedButtonsRow}>
                                <TouchableOpacity
                                    style={[styles.button, styles.restoreButton]}
                                    onPress={() => restoreBill(bill.id)}
                                >
                                    <Text style={styles.buttonText}>♻ Restaurer</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.button, styles.permanentDeleteButton]}
                                    onPress={() => {
                                        Alert.alert(
                                            "Suppression définitive",
                                            "Cette action est irréversible. Supprimer définitivement cette facture ?",
                                            [
                                                { text: "Annuler", style: "cancel" },
                                                {
                                                    text: "Supprimer",
                                                    style: "destructive",
                                                    onPress: async () => {
                                                        const { error } = await supabase
                                                            .from("billing")
                                                            .delete()
                                                            .eq("id", bill.id);

                                                        if (error) {
                                                            console.error(
                                                                "Erreur suppression définitive :",
                                                                error
                                                            );
                                                            alert("Erreur lors de la suppression !");
                                                        } else {
                                                            alert("✅ Facture supprimée définitivement");
                                                            fetchBills();
                                                        }
                                                    },
                                                },
                                            ]
                                        );
                                    }}
                                >
                                    <Text style={styles.buttonText}>❌ Supprimer</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: "#6c757d" }]}
                                    onPress={() =>
                                        navigation.navigate("BillingEditPage", { id: bill.id })
                                    }
                                >
                                    <Text style={styles.buttonText}>✏️ Modifier / 🖨️ Imprimer</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: "#dc3545" }]}
                                    onPress={() => deleteBill(bill.id)}
                                >
                                    <Text style={styles.buttonText}>🗑️ Supprimer</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </TouchableOpacity>
                ))}

                <View style={styles.pagination}>
                    <TouchableOpacity
                        style={[styles.pageButton, currentPage === 1 && styles.disabled]}
                        onPress={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                    >
                        <Text style={styles.pageText}>⏪ Précédent</Text>
                    </TouchableOpacity>
                    <Text style={styles.pageIndicator}>
                        Page {currentPage}/{totalPages}
                    </Text>
                    <TouchableOpacity
                        style={[
                            styles.pageButton,
                            currentPage === totalPages && styles.disabled,
                        ]}
                        onPress={() =>
                            setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                        }
                        disabled={currentPage === totalPages}
                    >
                        <Text style={styles.pageText}>Suivant ⏩</Text>
                    </TouchableOpacity>
                </View>

                {selectedIds.length > 0 && (
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: "#dc3545", marginTop: 16 }]}
                        onPress={() => {
                            Alert.alert(
                                "Suppression groupée",
                                `Supprimer ${selectedIds.length} facture(s) ?`,
                                [
                                    { text: "Annuler", style: "cancel" },
                                    {
                                        text: "Supprimer",
                                        style: "destructive",
                                        onPress: async () => {
                                            const { error } = await supabase
                                                .from("billing")
                                                .update({ deleted: true })
                                                .in("id", selectedIds);

                                            if (error) {
                                                console.error("Erreur suppression multiple :", error);
                                                alert("Erreur lors de la suppression !");
                                            } else {
                                                alert("✅ Factures supprimées");
                                                setSelectedIds([]);
                                                fetchBills();
                                            }
                                        },
                                    },
                                ]
                            );
                        }}
                    >
                        <Text style={styles.buttonText}>
                            🗑️ Supprimer sélection ({selectedIds.length})
                        </Text>
                    </TouchableOpacity>
                )}
            </ScrollView>


            <TouchableOpacity
                style={styles.returnButtonFixed}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.buttonText}>⬅ Retour</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16 },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        color: "#222",
        textAlign: "center",
    },

    toggleRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginBottom: 16,
    },
    toggleButton: {
        flex: 1,
        backgroundColor: "#888",
        paddingVertical: 10,
        borderRadius: 8,
        marginHorizontal: 4,
        alignItems: "center",
    },
    toggleActive: {
        backgroundColor: "#000",
    },
    toggleText: {
        color: "#fff",
        fontWeight: "bold",
    },
    card: {
        backgroundColor: "#ffffff",
        padding: 16,
        borderRadius: 12,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 3,
        borderWidth: 1,
        borderColor: "#e0e0e0",
    },

    label: { fontSize: 14, marginBottom: 4 },
    buttonRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 10,
        gap: 8,
    },
    button: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: "center",
        backgroundColor: "#007bff", // par défaut
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 2,
    },

    buttonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 13,
    },
    pagination: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 20,
        paddingHorizontal: 16,
    },

    pageButton: {
        backgroundColor: "#444",
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
    },
    pageButtonText: {
        color: "#fff",
        fontWeight: "bold",
    },
    pageInfo: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#333",
    },
    pageText: { color: "#fff", fontSize: 16 },
    pageIndicator: { fontSize: 16, fontWeight: "bold" },
    disabled: { backgroundColor: "#ccc" },
    returnButton: {
        backgroundColor: "#6c757d",
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
        marginTop: 20,
    },
    buttonBack: {
        backgroundColor: "#68693e",
        padding: 14,
        borderRadius: 8,
        marginTop: 30,
        alignItems: "center",
        width: "100%",
    },
    deletedButtonsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 10,
        gap: 10,
    },

    restoreButton: {
        flex: 1,
        backgroundColor: "#28a745",
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: "center",
    },

    permanentDeleteButton: {
        flex: 1,
        backgroundColor: "#8b0000",
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: "center",
    },

    cardSelected: {
        borderWidth: 3,
        borderColor: "#ff5252", // rouge vif
    },
    searchWrapper: {
        marginBottom: 20,
        paddingHorizontal: 4,
        position: "relative",
    },

    floatingLabel: {
        position: "absolute",
        top: -10,
        left: 16,
        backgroundColor: "#fff",
        paddingHorizontal: 4,
        fontSize: 14,
        color: "#777",
        zIndex: 2,
    },

    floatingLabelActive: {
        color: "#007bff",
        fontWeight: "bold",
    },

    inputContainer: {
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        backgroundColor: "#fff",
        paddingHorizontal: 12,
        paddingVertical: 4,
    },

    inputContainerActive: {
        borderColor: "#007bff",
        borderWidth: 2,
    },

    searchInputStyled: {
        fontSize: 16,
        paddingVertical: 8,
        color: "#333",
    },
    returnButtonFixed: {
        position: "absolute",
        bottom: 16,
        left: 16,
        right: 16,
        backgroundColor: "#6c757d",
        padding: 14,
        borderRadius: 8,
        alignItems: "center",
        zIndex: 100,
    },
});
