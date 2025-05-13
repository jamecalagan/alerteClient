import React, { useRef, useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const QuoteEditPage = () => {
    const navigation = useNavigation();
    const suppressRef = useRef(false);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [items, setItems] = useState([
        { description: "", quantity: "1", unitPrice: "", total: "" },
    ]);
    const [remarks, setRemarks] = useState("");
    const [quoteNumber, setQuoteNumber] = useState("");
    const [validUntil, setValidUntil] = useState("");
    const [discount, setDiscount] = useState("0");
    const [deposit, setDeposit] = useState("0");
    const [status, setStatus] = useState("en_attente");
    const [isSaved, setIsSaved] = useState(false);
    const [quoteId, setQuoteId] = useState(null);
    const [focusedField, setFocusedField] = useState(null);
    const [clientSuggestions, setClientSuggestions] = useState([]);
    const route = useRoute();
    const editingId = route.params?.id || null;
    const [email, setEmail] = useState("");
    useEffect(() => {
        if (editingId) {
            loadQuoteForEdit(editingId);
        }
    }, [editingId]);

    useEffect(() => {
        if (!validUntil) {
            const today = new Date();
            const future = new Date(today.setDate(today.getDate() + 30));
            const formatted = future.toISOString().split("T")[0];
            setValidUntil(formatted);
        }
    }, []);

    useEffect(() => {
        generateQuoteNumber();
    }, []);
    useEffect(() => {
        if (route.params?.preset === "pc") {
            setItems([
                {
                    label: "Boîtier PC",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    total: "",
                },
                {
                    label: "Carte mère",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    total: "",
                },
                {
                    label: "Processeur (CPU)",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    total: "",
                },
                {
                    label: "Mémoire RAM",
                    description: "",
                    quantity: "2",
                    unitPrice: "",
                    total: "",
                },
                {
                    label: "Disque SSD / NVMe",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    total: "",
                },
                {
                    label: "Carte graphique (GPU)",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    total: "",
                },
                {
                    label: "Alimentation (PSU)",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    total: "",
                },
                {
                    label: "Refroidissement",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    total: "",
                },
                {
                    label: "Montage & tests",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    total: "",
                },
                {
                    label: "Installation système",
                    description: "",
                    quantity: "1",
                    unitPrice: "",
                    total: "",
                },
            ]);
        }
    }, []);

    const generateQuoteNumber = async () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const prefix = `DEV-AI-${year}-${month}`;

        const { data, error } = await supabase
            .from("quotes")
            .select("quote_number")
            .ilike("quote_number", `${prefix}-%`);

        if (!error) {
            const numbers = data.map((q) => {
                const parts = q.quote_number?.split("-");
                return parts ? parseInt(parts[4]) : 0;
            });
            const max = numbers.length > 0 ? Math.max(...numbers) : 0;
            const nextNumber = String(max + 1).padStart(4, "0");
            setQuoteNumber(`${prefix}-${nextNumber}`);
        }
    };

    useEffect(() => {
        if (suppressRef.current) {
            suppressRef.current = false;
            return;
        }

        if (name.length >= 2) {
            searchClients(name);
        } else {
            setClientSuggestions([]);
        }
    }, [name]);

    const searchClients = async (text) => {
        setName(text);

        if (text.length < 2) {
            setClientSuggestions([]);
            return;
        }

        const [clientsRes, quotesRes] = await Promise.all([
            supabase
                .from("clients")
                .select("name, phone")
                .ilike("name", `${text}%`),
            supabase
                .from("quotes")
                .select("name, phone")
                .ilike("name", `${text}%`),
        ]);

        const clients = clientsRes.data || [];
        const quotes = quotesRes.data || [];

        // Fusionner les résultats et éliminer les doublons
        const merged = [...clients, ...quotes];
        const unique = [];
        const seen = new Set();

        for (const item of merged) {
            const key = `${item.name}-${item.phone || ""}`;
            if (!seen.has(key)) {
                unique.push(item);
                seen.add(key);
            }
        }

        setClientSuggestions(unique);
    };

    const selectClient = (client) => {
        suppressRef.current = true;
        setName(client.name);
        setPhone(client.phone || "");
        setClientSuggestions([]);
    };

    const updateItem = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;

        const qty = parseFloat(newItems[index].quantity) || 0;
        const puTTC = parseFloat(newItems[index].unitPrice) || 0;
        const totalTTC = qty * puTTC;

        newItems[index].total = totalTTC.toFixed(2); // total TTC affiché
        setItems(newItems);
    };

    const addItem = () => {
        setItems([
            ...items,
            { description: "", quantity: "1", unitPrice: "", total: "" },
        ]);
    };

    const removeItem = (index) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    // Le prix total TTC saisi (cumul des lignes)
    const getTotalTTC = () => {
        return items.reduce((sum, item) => {
            const qty = parseFloat(item.quantity) || 0;
            const unitTTC = parseFloat(item.unitPrice) || 0;
            return sum + qty * unitTTC;
        }, 0);
    };

    // On extrait le HT à partir du TTC (TTC = HT * 1.2 → donc HT = TTC / 1.2)
    const getTotalHT = () => {
        return getTotalTTC() / 1.2;
    };

    // La remise est appliquée sur le HT
    const getDiscountValue = () => {
        return getTotalHT() * (parseFloat(discount) / 100);
    };

    // TVA recalculée après remise
    const getTVA = (taux = 20) => {
        const htAfterDiscount = getTotalHT() - getDiscountValue();
        return htAfterDiscount * (taux / 100);
    };

    // Total TTC après remise
    const getTotalTTCApresRemise = () => {
        return getTotalHT() - getDiscountValue() + getTVA();
    };

    // Total à payer après acompte
    const getTotalDue = () => {
        return getTotalTTCApresRemise() - parseFloat(deposit || 0);
    };

    const handleSave = async () => {
        if (!name || items.length === 0) {
            Alert.alert(
                "Erreur",
                "Le nom du client et au moins une ligne de devis sont requis."
            );
            return;
        }

        const quoteData = {
            name,
            phone,
            email,
            items,
            remarks,
            total: getTotalTTC().toFixed(2),
            quote_number: quoteNumber,
            valid_until: validUntil,
            discount: parseFloat(discount || 0),
            deposit: parseFloat(deposit || 0),
            status,
        };

        if (editingId) {
            const { error } = await supabase
                .from("quotes")
                .update(quoteData)
                .eq("id", editingId);

            if (error) {
                Alert.alert("Erreur", error.message);
            } else {
                setIsSaved(true);
                setQuoteId(editingId);
                Alert.alert("✅ Devis modifié");
            }
        } else {
            const { data, error } = await supabase
                .from("quotes")
                .insert([{ ...quoteData, created_at: new Date() }])
                .select();

            if (error) {
                Alert.alert("Erreur", error.message);
            } else {
                setIsSaved(true);
                setQuoteId(data[0].id);
                Alert.alert("✅ Devis enregistré");
            }
        }
    };

    const handlePrint = () => {
        if (!isSaved || !quoteId) {
            Alert.alert("Enregistrez d'abord le devis avant d'imprimer.");
            return;
        }
        navigation.navigate("QuotePrintPage", { id: quoteId });
    };
    const loadQuoteForEdit = async (id) => {
        const { data, error } = await supabase
            .from("quotes")
            .select("*")
            .eq("id", id)
            .single();

        if (!error && data) {
            setName(data.name);
            setPhone(data.phone || "");
            setEmail(data.email || "");
            setItems(data.items || []);
            setRemarks(data.remarks || "");
            setQuoteNumber(data.quote_number || "");
            setValidUntil(data.valid_until || "");
            setDiscount(data.discount?.toString() || "0");
            setDeposit(data.deposit?.toString() || "0");
            setStatus(data.status || "en_attente");
            setQuoteId(data.id);
            setIsSaved(true);
        } else {
            Alert.alert("Erreur", "Impossible de charger le devis.");
        }
    };

    return (
        <View style={{ flex: 1 }}>
            <ScrollView
                contentContainerStyle={[
                    styles.container,
                    { paddingBottom: 120 },
                ]}
            >
                <Text style={styles.title}>📝 Nouveau Devis</Text>

                <Text style={styles.label}>Numéro de devis</Text>
                <TextInput
                    style={styles.input}
                    value={quoteNumber}
                    onChangeText={setQuoteNumber}
                    placeholder="DEV-2024-0001"
                />

                <Text style={styles.label}>Valable jusqu'au</Text>
                <TextInput
                    style={styles.input}
                    value={validUntil}
                    onChangeText={setValidUntil}
                    placeholder="2024-12-31"
                />

                <Text style={styles.label}>Nom du client</Text>
                <TextInput
                    style={[
                        styles.input,
                        focusedField === "name" && styles.inputFocused,
                    ]}
                    value={name}
                    onChangeText={setName}
                    onFocus={() => setFocusedField("name")}
                    onBlur={() => setFocusedField(null)}
                />

                {clientSuggestions.length > 0 && (
                    <View style={styles.suggestionBox}>
                        {clientSuggestions.map((item, index) => (
                            <TouchableOpacity
                                key={index}
                                onPress={() => selectClient(item)}
                                style={styles.suggestionItem}
                            >
                                <Text>
                                    {item.name} - {item.phone}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                <Text style={styles.label}>Téléphone</Text>
                <TextInput
                    style={[
                        styles.input,
                        focusedField === "phone" && styles.inputFocused,
                    ]}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => setFocusedField(null)}
                />
                <Text style={styles.label}>Adresse e-mail</Text>
                <TextInput
                    style={[
                        styles.input,
                        focusedField === "email" && styles.inputFocused,
                    ]}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="exemple@client.com"
                />

                <Text style={styles.subtitle}>Prestations / Produits :</Text>

                {items.map((item, index) => (
                    <View key={index} style={styles.itemRow}>
                        {/* Label au-dessus de la ligne */}
                        {item.label && (
                            <Text style={styles.itemLabel}>{item.label}</Text>
                        )}

                        {/* Ligne avec les 3 champs + bouton supprimer */}
                        <View style={styles.rowLine}>
                            <TextInput
                                style={[styles.input, { flex: 2 }]}
                                placeholder="Marque / modèle / détails"
                                value={item.description}
                                onChangeText={(text) =>
                                    updateItem(index, "description", text)
                                }
                            />

                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Qté"
                                keyboardType="numeric"
                                value={item.quantity}
                                onChangeText={(text) =>
                                    updateItem(index, "quantity", text)
                                }
                            />

                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Prix"
                                keyboardType="decimal-pad"
                                value={item.unitPrice}
                                onChangeText={(text) =>
                                    updateItem(index, "unitPrice", text)
                                }
                            />

                            <TouchableOpacity onPress={() => removeItem(index)}>
                                <Text style={styles.removeButton}>❌</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}

                <TouchableOpacity style={styles.addButton} onPress={addItem}>
                    <Text style={styles.addButtonText}>
                        ➕ Ajouter une ligne
                    </Text>
                </TouchableOpacity>

                <Text style={styles.label}>Remise globale (%)</Text>
                <TextInput
                    style={styles.input}
                    value={discount}
                    onChangeText={setDiscount}
                    keyboardType="decimal-pad"
                    placeholder="ex : 10"
                />

                <Text style={styles.label}>Acompte versé (€)</Text>
                <TextInput
                    style={styles.input}
                    value={deposit}
                    onChangeText={setDeposit}
                    keyboardType="decimal-pad"
                    placeholder="ex : 100"
                />

                <Text style={styles.total}>
                    Total HT : {getTotalHT().toFixed(2)} €
                </Text>
                <Text style={styles.total}>
                    Remise : -{getDiscountValue().toFixed(2)} €
                </Text>
                <Text style={styles.total}>
                    TVA (20%) : {getTVA().toFixed(2)} €
                </Text>
                <Text style={styles.total}>
                    Total TTC : {getTotalTTC().toFixed(2)} €
                </Text>
                <Text style={styles.total}>
                    Acompte : -{parseFloat(deposit || 0).toFixed(2)} €
                </Text>
                <Text style={styles.total}>
                    Total à payer : {getTotalDue().toFixed(2)} €
                </Text>

                <Text style={styles.label}>
                    Remarques ou conditions particulières
                </Text>
                <TextInput
                    style={[styles.input, { height: 80 }]}
                    multiline
                    value={remarks}
                    onChangeText={setRemarks}
                />

                <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSave}
                >
                    <Text style={styles.saveButtonText}>
                        💾 Enregistrer le devis
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.printButton,
                        { backgroundColor: isSaved ? "#28a745" : "#ccc" },
                    ]}
                    onPress={handlePrint}
                    disabled={!isSaved}
                >
                    <Text style={styles.saveButtonText}>🖨️ Imprimer</Text>
                </TouchableOpacity>
				<TouchableOpacity
                style={styles.returnButtonFixed}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.buttonText}>⬅ Retour</Text>
            </TouchableOpacity>
            </ScrollView>

        </View>
    );
};

const styles = StyleSheet.create({
    container: { padding: 20 },
    title: {
        fontSize: 22,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
    },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        marginBottom: 10,
        borderRadius: 6,
        backgroundColor: "#fff",
        fontSize: 16,
    },
    inputFocused: {
        borderColor: "#007bff",
        backgroundColor: "#eef6ff",
        fontSize: 18,
        height: 55,
    },
    label: { fontWeight: "bold", marginBottom: 5, marginTop: 10 },
    subtitle: {
        fontSize: 18,
        fontWeight: "bold",
        marginTop: 10,
        marginBottom: 10,
    },
    itemRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginBottom: 10,
    },
    removeButton: { fontSize: 20, marginLeft: 8 },
    addButton: {
        backgroundColor: "#007bff",
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
        marginVertical: 10,
    },
    addButtonText: { color: "#fff", fontWeight: "bold" },
    total: { fontSize: 18, fontWeight: "bold", marginVertical: 5 },
    saveButton: {
        backgroundColor: "#007bff",
        padding: 14,
        borderRadius: 8,
        alignItems: "center",
        marginVertical: 10,
    },
    printButton: {
        padding: 14,
        borderRadius: 8,
        alignItems: "center",
        marginBottom: 30,
    },
    saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
    suggestionBox: {
        backgroundColor: "#f9f9f9",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 5,
        marginBottom: 10,
    },
    suggestionItem: {
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    itemRow: {
        marginBottom: 12,
    },

    itemLabel: {
        fontWeight: "bold",
        fontSize: 13,
        marginBottom: 4,
        color: "#333",
    },

    rowLine: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
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
    buttonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 13,
    },
});

export default QuoteEditPage;
