import React, { useRef, useEffect, useState } from "react";
import {
    View,
    Text,
    FlatList,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Animated,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const QuoteListPage = () => {
    const [quotes, setQuotes] = useState([]);
    const [search, setSearch] = useState("");
    const navigation = useNavigation();
    const [showConfirm, setShowConfirm] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const inputHeight = useRef(new Animated.Value(42)).current;
    useEffect(() => {
        fetchQuotes();
    }, []);
    const handleFocus = () => {
        setIsSearchFocused(true);
        Animated.timing(inputHeight, {
            toValue: 55,
            duration: 150,
            useNativeDriver: false,
        }).start();
    };

    const handleBlur = () => {
        setIsSearchFocused(false);
        Animated.timing(inputHeight, {
            toValue: 42,
            duration: 150,
            useNativeDriver: false,
        }).start();
    };

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

            <View style={{ marginBottom: 16, position: "relative" }}>
                {/** Label flottant */}
                <Text
                    style={[
                        styles.floatingLabel,
                        (isSearchFocused || search.length > 0) &&
                            styles.floatingLabelFocused,
                    ]}
                >
                    🔍 Rechercher un client ou un n° de devis
                </Text>

                <View style={{ marginBottom: 16, position: "relative" }}>
                    <Text
                        style={[
                            styles.floatingLabel,
                            (isSearchFocused || search.length > 0) &&
                                styles.floatingLabelFocused,
                        ]}
                    >
                        🔍 Rechercher un client ou un n° de devis
                    </Text>

                    <Animated.View style={{ height: inputHeight }}>
                        <TextInput
                            style={[
                                styles.input,
                                { height: "100%" },
                                isSearchFocused && styles.inputFocused,
                            ]}
                            value={search}
                            onChangeText={setSearch}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                        />
                    </Animated.View>
                </View>
            </View>

            <FlatList
                data={filteredQuotes}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <View style={styles.card}>
                        <Text style={styles.number}>
                            🧾 {item.quote_number}
                        </Text>
                        <Text style={styles.client}>👤 {item.name}</Text>
                        {item.email && (
                            <Text
                                style={{
                                    fontSize: 13,
                                    color: "#555",
                                    marginBottom: 4,
                                }}
                            >
                                📧 {item.email}
                            </Text>
                        )}

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
                                        { backgroundColor: "#565657" },
                                    ]}
                                >
                                    🖨️ Imprimé
                                </Text>
                            )}

                            {item.deja_envoye && (
                                <Text
                                    style={[
                                        styles.statusLabel,
                                        { backgroundColor: "#045015" },
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
                                    { backgroundColor: "#828283" },
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
                                    { backgroundColor: "#505050" },
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
  container: { padding: 16, flex: 1, backgroundColor: "#f4f4f4" },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
    color: "#2e2e2e",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    fontSize: 15,
    backgroundColor: "#fff",
    color: "#333",
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dcdcdc",
    padding: 16,
    borderRadius: 10,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  number: {
    fontWeight: "600",
    fontSize: 16,
    marginBottom: 4,
    color: "#2c2c2c",
  },
  client: {
    fontSize: 15,
    marginBottom: 4,
    color: "#444",
  },
  date: {
    fontSize: 13,
    color: "#777",
  },
  total: {
    marginTop: 6,
    fontWeight: "600",
    fontSize: 15,
    textAlign: "right",
    color: "#111",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
    backgroundColor: "#999999",
  },
  buttonText: {
    color: "#f5f5f5",
    fontWeight: "500",
    fontSize: 14,
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
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 10,
    width: "85%",
    elevation: 8,
    alignItems: "center",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
    backgroundColor: "#b0b0b0",
  },
  statusLabel: {
    alignSelf: "flex-start",
    backgroundColor: "#888",
    color: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 12,
    marginTop: 8,
  },
  returnButton: {
    backgroundColor: "#888888",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
    marginHorizontal: 16,
  },
  floatingLabel: {
    position: "absolute",
    top: 12,
    left: 12,
    fontSize: 13,
    color: "#888",
    zIndex: 1,
  },
  floatingLabelFocused: {
    top: -10,
    left: 10,
    fontSize: 12,
    color: "#444",
    backgroundColor: "#f9f9f9",
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  inputFocused: {
    height: 50,
    fontSize: 16,
    borderColor: "#888",
    backgroundColor: "#f0f0f0",
  },
});

export default QuoteListPage;

