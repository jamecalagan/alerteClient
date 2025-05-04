import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    FlatList,
    TextInput,
    TouchableOpacity,
    StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const QuoteListPage = () => {
    const [quotes, setQuotes] = useState([]);
    const [search, setSearch] = useState("");
    const navigation = useNavigation();
    const [showConfirm, setShowConfirm] = useState(false);
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        fetchQuotes();
    }, []);

    const fetchQuotes = async () => {
        const { data, error } = await supabase
            .from("quotes")
            .select("*")
            .order("created_at", { ascending: false });

        if (!error) setQuotes(data);
        else console.error("Erreur chargement devis :", error);
    };

    const filteredQuotes = quotes.filter(
        (q) =>
            q.name.toLowerCase().includes(search.toLowerCase()) ||
            q.quote_number.toLowerCase().includes(search.toLowerCase())
    );

    const formatDate = (dateStr) =>
        new Date(dateStr).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    const deleteQuote = async (id) => {
        console.log("Suppression directe pour :", id);

        const { error } = await supabase.from("quotes").delete().eq("id", id);

        if (error) {
            console.error("Erreur Supabase :", error);
        } else {
            console.log("✅ Devis supprimé !");
            fetchQuotes();
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>📄 Liste des devis</Text>

            <TextInput
                style={styles.input}
                placeholder="🔍 Rechercher un client ou un n° de devis"
                value={search}
                onChangeText={setSearch}
            />

            <FlatList
                data={filteredQuotes}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <Text style={styles.number}>
                            🧾 {item.quote_number}
                        </Text>
                        <Text style={styles.client}>👤 {item.name}</Text>
                        <Text style={styles.date}>
                            🗓️ {formatDate(item.created_at)} • Valide jusqu’au{" "}
                            {formatDate(item.valid_until)}
                        </Text>

                        <View
                            style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 6,
                                marginTop: 6,
                            }}
                        >
                            {item.deja_imprime && (
                                <Text
                                    style={[
                                        styles.statusLabel,
                                        { backgroundColor: "#007bff" },
                                    ]}
                                >
                                    🖨️ Imprimé
                                </Text>
                            )}

                            {item.deja_envoye && (
                                <Text
                                    style={[
                                        styles.statusLabel,
                                        { backgroundColor: "#28a745" },
                                    ]}
                                >
                                    📤 Envoyé
                                </Text>
                            )}

                            {!item.deja_imprime && !item.deja_envoye && (
                                <Text
                                    style={[
                                        styles.statusLabel,
                                        {
                                            backgroundColor: "#68685c",
                                            color: "#fff",
                                        },
                                    ]}
                                >
                                    ⚠️ Non traité
                                </Text>
                            )}
                        </View>

                        <Text style={styles.total}>
                            💶 {parseFloat(item.total).toFixed(2)} € TTC
                        </Text>

                        <View style={styles.actionRow}>
                            <TouchableOpacity
                                style={[
                                    styles.actionButton,
                                    { backgroundColor: "#007bff" },
                                ]}
                                onPress={() =>
                                    navigation.navigate("QuotePrintPage", {
                                        id: item.id,
                                    })
                                }
                            >
                                <Text style={styles.buttonText}>
                                    🖨️ Imprimer
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.actionButton,
                                    { backgroundColor: "#28a745" },
                                ]}
                                onPress={() =>
                                    navigation.navigate("QuoteEditPage", {
                                        id: item.id,
                                    })
                                }
                            >
                                <Text style={styles.buttonText}>
                                    ✏️ Modifier
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.actionButton,
                                    { backgroundColor: "#dc3545" },
                                ]}
                                onPress={() => {
                                    setSelectedId(item.id);
                                    setShowConfirm(true);
                                }}
                            >
                                <Text style={styles.buttonText}>
                                    🗑️ Supprimer
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    <Text
                        style={{
                            textAlign: "center",
                            marginTop: 20,
                            color: "#999",
                        }}
                    >
                        Aucun devis enregistré.
                    </Text>
                }
            />
			<TouchableOpacity
  style={styles.returnButton}
  onPress={() => navigation.goBack()}
>
  <Text style={styles.buttonText}>⬅ Retour</Text>
</TouchableOpacity>

            {showConfirm && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={{ fontSize: 16, marginBottom: 20 }}>
                            Supprimer ce devis ?
                        </Text>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[
                                    styles.modalButton,
                                    { backgroundColor: "#6c757d" },
                                ]}
                                onPress={() => setShowConfirm(false)}
                            >
                                <Text style={styles.buttonText}>Annuler</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.modalButton,
                                    { backgroundColor: "#dc3545" },
                                ]}
                                onPress={async () => {
                                    const { error } = await supabase
                                        .from("quotes")
                                        .delete()
                                        .eq("id", selectedId);

                                    if (!error) {
                                        fetchQuotes();
                                    }
                                    setShowConfirm(false);
                                    setSelectedId(null);
                                }}
                            >
                                <Text style={styles.buttonText}>Supprimer</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { padding: 16, flex: 1 },
    title: {
        fontSize: 22,
        fontWeight: "bold",
        marginBottom: 16,
        textAlign: "center",
    },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 16,
    },
    card: {
        backgroundColor: "#f9f9f9",
        borderWidth: 1,
        borderColor: "#ddd",
        padding: 16,
        borderRadius: 10,
        marginBottom: 12,
    },
    number: {
        fontWeight: "bold",
        fontSize: 16,
        marginBottom: 4,
        color: "#333",
    },
    client: {
        fontSize: 15,
        marginBottom: 4,
    },
    date: {
        fontSize: 13,
        color: "#666",
    },
    total: {
        marginTop: 6,
        fontWeight: "bold",
        fontSize: 14,
        textAlign: "right",
    },
    actionRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 10,
        gap: 8,
    },

    actionButton: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 6,
        alignItems: "center",
    },

    buttonText: {
        color: "#fff",
        fontWeight: "bold",
    },
    modalOverlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 999,
    },

    modalContent: {
        backgroundColor: "white",
        padding: 24,
        borderRadius: 10,
        width: "80%",
        elevation: 10,
        alignItems: "center",
    },

    modalButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 10,
    },

    modalButton: {
        flex: 1,
        padding: 12,
        borderRadius: 6,
        alignItems: "center",
    },
    statusLabel: {
        alignSelf: "flex-start",
        color: "#fff",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        fontSize: 12,
        marginTop: 8,
    },
	returnButton: {
  backgroundColor: "#6c757d",
  padding: 12,
  borderRadius: 8,
  alignItems: "center",
  marginTop: 20,
  marginHorizontal: 16,
},
buttonText: {
  color: "#fff",
  fontWeight: "bold",
  fontSize: 14,
},

});

export default QuoteListPage;
