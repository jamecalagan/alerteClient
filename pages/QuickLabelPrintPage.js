import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
} from "react-native";
import { supabase } from "../supabaseClient";
import * as Print from "expo-print";
import { useRoute } from "@react-navigation/native";

export default function QuickLabelPrintPage({ navigation }) {
    const route = useRoute();

    const emptyForm = {
        name: "",
        phone: "",
        password: "",
        device: "",
        model: "",
        note: "",
    };
    const [form, setForm] = useState(emptyForm);
    const [allClients, setAllClients] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [labels, setLabels] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const isEditing = editingId !== null;

    const [autoPrinted, setAutoPrinted] = useState(false); // 👉 pour ne pas imprimer plusieurs fois

    useEffect(() => {
        fetchLabels();
        fetchClients();
    }, []);

    // Pré-remplissage depuis ExpressVideoPage
    useEffect(() => {
        const initialLabel = route.params?.initialLabel;
        if (initialLabel) {
            setForm((prev) => ({
                ...prev,
                ...initialLabel,
            }));
        }
    }, [route.params?.initialLabel]);

    // Si autoPrint demandé : dès que nom + tél sont là, on lance handleSave une fois
    useEffect(() => {
        const autoPrint = route.params?.autoPrint;
        if (autoPrint && !autoPrinted && form.name && form.phone) {
            setAutoPrinted(true);
            handleSave();
        }
    }, [route.params?.autoPrint, autoPrinted, form.name, form.phone]);

    const fetchClients = async () => {
        const results = [];
        const tables = ["clients", "intervention", "orders", "express"];

        for (const table of tables) {
            const { data, error } = await supabase
                .from(table)
                .select("name, phone");

            if (!error && data) {
                results.push(...data.filter((c) => c.name && c.phone));
            }
        }

        const unique = [];
        const seen = new Set();

        results.forEach((c) => {
            const key = `${c.name}_${c.phone}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(c);
            }
        });

        setAllClients(unique);
    };

    const fetchLabels = async () => {
        const { data, error } = await supabase
            .from("quick_labels")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) console.log(error);
        else setLabels(data);
    };

    const handleInputChange = (key, value) => {
        setForm({ ...form, [key]: value });
    };

    const generateHTML = (label) => {
        const today = new Date().toLocaleDateString("fr-FR");
        return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; font-size: 14px; padding: 20px; }
          .row { margin-bottom: 6px; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="row"><span class="bold">Date :</span> ${today}</div>
          <div class="row"><span class="bold">Nom :</span> ${label.name}</div>
          <div class="row"><span class="bold">Téléphone :</span> ${
              label.phone
          }</div>
          ${
              label.password
                  ? `<div class="row"><span class="bold">Mot de passe :</span> ${label.password}</div>`
                  : ""
          }
          ${
              label.device
                  ? `<div class="row"><span class="bold">Appareil :</span> ${label.device}</div>`
                  : ""
          }
          ${
              label.model
                  ? `<div class="row"><span class="bold">Modèle :</span> ${label.model}</div>`
                  : ""
          }
          ${
              label.note
                  ? `<div class="row"><span class="bold">Note :</span> ${label.note}</div>`
                  : ""
          }
        </div>
      </body>
    </html>
  `;
    };

    const printLabel = async (label) => {
        try {
            await Print.printAsync({ html: generateHTML(label) });

            if (label.id) {
                await supabase
                    .from("quick_labels")
                    .update({ printed: true })
                    .eq("id", label.id);
                fetchLabels();
            } else {
                console.log("⚠️ Aucune ID trouvée pour cette étiquette.");
            }
        } catch (err) {
            Alert.alert("Erreur impression", err.message);
        }
    };

    const handleSave = async () => {
        if (!form.name || !form.phone) {
            Alert.alert("Champs requis", "Nom et téléphone sont obligatoires.");
            return;
        }

        let query = supabase
            .from("quick_labels")
            .select("*")
            .eq("name", form.name)
            .eq("phone", form.phone);

        if (isEditing) query = query.neq("id", editingId);

        const { data: existing, error: checkError } = await query;
        if (checkError) {
            Alert.alert("Erreur", "Vérification impossible.");
            return;
        }
        if (existing.length > 0) {
            Alert.alert(
                "Doublon",
                "Une étiquette avec ce nom et ce téléphone existe déjà."
            );
            return;
        }

        let finalLabel = null;

        if (isEditing) {
            const { error: updateError } = await supabase
                .from("quick_labels")
                .update(form)
                .eq("id", editingId);

            if (updateError) {
                Alert.alert("Erreur", "Mise à jour impossible.");
                return;
            }

            finalLabel = { ...form, id: editingId };
        } else {
            const { data: inserted, error: insertError } = await supabase
                .from("quick_labels")
                .insert([form])
                .select()
                .single();

            if (insertError) {
                Alert.alert("Erreur", "Enregistrement impossible.");
                return;
            }

            finalLabel = inserted;
        }

        await printLabel(finalLabel);
        fetchLabels();
        setForm(emptyForm);
        setEditingId(null);
    };

    const startEdit = (label) => {
        setForm({
            name: label.name,
            phone: label.phone,
            password: label.password || "",
            device: label.device || "",
            model: label.model || "",
            note: label.note || "",
        });
        setEditingId(label.id);
    };

    const cancelEdit = () => {
        setForm(emptyForm);
        setEditingId(null);
    };

    const confirmDelete = (id) => {
        Alert.alert(
            "Supprimer cette étiquette ?",
            "Cette action est irréversible.",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    style: "destructive",
                    onPress: () => deleteLabel(id),
                },
            ]
        );
    };

    const deleteLabel = async (id) => {
        const { error } = await supabase
            .from("quick_labels")
            .delete()
            .eq("id", id);
        if (error) {
            Alert.alert("Erreur", "La suppression a échoué.");
            return;
        }
        fetchLabels();
    };

    const formatPhone = (phone) => {
        return (
            phone
                .replace(/\D/g, "")
                .match(/.{1,2}/g)
                ?.join(" ") || ""
        );
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>🎫 Étiquette rapide</Text>

            <TextInput
                style={styles.input}
                placeholder="Nom"
                value={form.name}
                onChangeText={(t) => {
                    setForm({ ...form, name: t });
                    setShowSuggestions(true);
                }}
            />

            {showSuggestions && form.name.length >= 2 && (
                <View style={styles.suggestionBox}>
                    {allClients
                        .filter((c) =>
                            c.name
                                .toLowerCase()
                                .includes(form.name.toLowerCase())
                        )
                        .map((client) => (
                            <TouchableOpacity
                                key={`${client.name}_${client.phone}`}
                                onPress={() => {
                                    setForm({
                                        ...form,
                                        name: client.name,
                                        phone: client.phone,
                                    });
                                    setShowSuggestions(false);
                                }}
                            >
                                <Text style={styles.suggestionItem}>
                                    {client.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                </View>
            )}

            <TextInput
                style={styles.input}
                placeholder="Téléphone"
                value={form.phone}
                onChangeText={(t) => handleInputChange("phone", t)}
                keyboardType="phone-pad"
            />
            <TextInput
                style={styles.input}
                placeholder="Mot de passe (facultatif)"
                value={form.password}
                onChangeText={(t) => handleInputChange("password", t)}
            />
            <TextInput
                style={styles.input}
                placeholder="Appareil"
                value={form.device}
                onChangeText={(t) => handleInputChange("device", t)}
            />
            <TextInput
                style={styles.input}
                placeholder="Modèle"
                value={form.model}
                onChangeText={(t) => handleInputChange("model", t)}
            />
            <TextInput
                style={styles.textarea}
                placeholder="Note (facultatif)"
                multiline
                value={form.note}
                onChangeText={(t) => handleInputChange("note", t)}
            />

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.buttonText}>
                    {isEditing
                        ? "💾 Mettre à jour & imprimer"
                        : "🖨️ Enregistrer & imprimer"}
                </Text>
            </TouchableOpacity>

            {isEditing && (
                <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={cancelEdit}
                >
                    <Text style={styles.cancelText}>
                        Annuler la modification
                    </Text>
                </TouchableOpacity>
            )}

            <Text style={styles.subTitle}>🗂 Étiquettes enregistrées</Text>

            {labels.map((lbl) => (
                <View key={lbl.id} style={styles.labelCard}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.labelLine}>
                            <Text style={styles.bold}>Nom :</Text>{" "}
                            {lbl.name.toUpperCase()}
                        </Text>
                        <Text style={styles.labelLine}>
                            <Text style={styles.bold}>Tél :</Text>{" "}
                            {formatPhone(lbl.phone)}
                        </Text>
                        {lbl.device ? (
                            <Text style={styles.labelLine}>
                                <Text style={styles.bold}>Appareil :</Text>{" "}
                                {lbl.device}
                            </Text>
                        ) : null}
                        {lbl.model ? (
                            <Text style={styles.labelLine}>
                                <Text style={styles.bold}>Modèle :</Text>{" "}
                                {lbl.model}
                            </Text>
                        ) : null}
                        {lbl.note ? (
                            <Text style={styles.labelLine}>
                                <Text style={styles.bold}>Description :</Text>{" "}
                                {lbl.note}
                            </Text>
                        ) : null}
                        {lbl.created_at ? (
                            <Text style={styles.labelLine}>
                                <Text style={styles.bold}>Date :</Text>{" "}
                                {new Date(lbl.created_at).toLocaleDateString(
                                    "fr-FR"
                                )}
                            </Text>
                        ) : null}
                        {lbl.printed && (
                            <Text style={styles.labelLine}>
                                <Text style={{ color: "#001d07" }}>
                                    ✅ Déjà imprimée
                                </Text>
                            </Text>
                        )}
                    </View>

                    <View style={styles.cardButtons}>
                        <TouchableOpacity
                            style={styles.smallBtn}
                            onPress={() => startEdit(lbl)}
                        >
                            <Text style={styles.smallTxt}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.smallBtn}
                            onPress={() => printLabel(lbl)}
                        >
                            <Text style={styles.smallTxt}>🖨️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.smallBtn,
                                { backgroundColor: "#a94442" },
                            ]}
                            onPress={() => confirmDelete(lbl.id)}
                        >
                            <Text style={styles.smallTxt}>🗑️</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
            <View style={{ alignItems: "center", marginTop: 16 }}>
                <TouchableOpacity
                    style={[
                        styles.optionButton,
                        styles.shadowBox,
                        { backgroundColor: "#a7a7a7", width: "60%" },
                    ]}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.buttonText}>⬅ Retour</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        backgroundColor: "#e9e9e9",
    },
    title: {
        fontSize: 20,
        marginBottom: 10,
        color: "#252525",
        textAlign: "center",
    },
    subTitle: {
        fontSize: 16,
        marginTop: 30,
        marginBottom: 10,
        color: "#252525",
        borderBottomWidth: 1,
        borderBottomColor: "#444",
        paddingBottom: 4,
    },
    input: {
        backgroundColor: "#fff",
        padding: 10,
        marginBottom: 10,
        borderRadius: 8,
    },
    textarea: {
        backgroundColor: "#fff",
        padding: 10,
        height: 80,
        textAlignVertical: "top",
        borderRadius: 8,
        marginBottom: 10,
    },
    saveButton: {
        backgroundColor: "#046b1e",
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
    },
    cancelButton: {
        marginTop: 8,
        alignItems: "center",
    },
    buttonText: {
        color: "#fff",
        fontSize: 16,
    },
    cancelText: {
        color: "#222121",
        fontSize: 14,
    },
    labelCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#bebebe",
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
    },
    labelLine: {
        color: "#252525",
        marginBottom: 2,
    },
    bold: { fontWeight: "bold", color: "#202020" },
    cardButtons: {
        flexDirection: "row",
        marginLeft: 12,
    },
    smallBtn: {
        backgroundColor: "#afafaf",
        padding: 6,
        borderRadius: 6,
        marginLeft: 6,
    },
    smallTxt: { color: "#ffffff", fontSize: 16 },
    optionButton: {
        width: 310,
        paddingVertical: 15,
        backgroundColor: "#3e4c69",
        borderRadius: 50,
        alignItems: "center",
        marginTop: 20,
    },
    optionText: {
        fontSize: 18,
        color: "#ffffff",
    },
    shadowBox: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    suggestionBox: {
        backgroundColor: "#fff",
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        maxHeight: 150,
        marginBottom: 10,
        elevation: 4,
    },
    suggestionItem: {
        paddingVertical: 10,
        borderBottomColor: "#ccc",
        borderBottomWidth: 1,
        color: "#222",
    },
});
