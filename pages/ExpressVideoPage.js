import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    FlatList,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import CustomAlert from "../components/CustomAlert";

export default function ExpressVideoPage() {
    const navigation = useNavigation();
    const route = useRoute();

    const isEdit = route.params?.isEdit || false;
    const editData = route.params?.expressData || {};
    const [isPaid, setIsPaid] = useState(
        editData?.paid === true || editData?.paymentStatus === "paid"
    );
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState("");
    const [alertMessage, setAlertMessage] = useState("");

    const showAlert = (title, message) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertVisible(true);
    };

    const [searchText, setSearchText] = useState(editData.name || "");
    const [filteredClients, setFilteredClients] = useState([]);
    const [name, setName] = useState(editData.name || "");
    const [phone, setPhone] = useState(editData.phone || "");
    const [description, setDescription] = useState(
        editData.description || "Transfert d’anciennes cassettes vidéo"
    );
    const [cassetteCounts, setCassetteCounts] = useState(() => {
        const initial = { VHS: "", Hi8: "", DV: "", "VHS-C": "" };
        if (editData.cassettecount) {
            const parts = editData.cassettecount.split(", ");
            parts.forEach((item) => {
                const [count, type] = item.split(" ");
                if (initial[type] !== undefined) initial[type] = count;
            });
        }
        return initial;
    });
    const [unitPrice, setUnitPrice] = useState("");
    const [outputtype, setOutputtype] = useState(editData.outputtype || "");
    const [supportFournis, setSupportFournis] = useState(
        editData.support_fournis === true
    );

    useEffect(() => {
        if (isEdit && editData.price && editData.cassettecount) {
            const cassetteTotal = editData.cassettecount
                .split(", ")
                .reduce((acc, val) => acc + parseInt(val, 10), 0);

            let correctedPrice = parseFloat(editData.price || 0);

            const isSupportFournis =
                editData.support_fournis === true ||
                editData.support_fournis === "true";

            if (isSupportFournis && editData.outputtype === "Clé USB")
                correctedPrice -= 20;
            if (isSupportFournis && editData.outputtype === "Disque dur")
                correctedPrice -= 45;

            if (cassetteTotal > 0) {
                setUnitPrice((correctedPrice / cassetteTotal).toFixed(2));
            }
        }
    }, []);

    const filterClients = async (text) => {
        setSearchText(text);
        setName(text);
        if (text.trim() === "") {
            setFilteredClients([]);
            return;
        }

        const { data, error } = await supabase
            .from("clients")
            .select("name, phone")
            .or(`name.ilike.%${text}%,phone.ilike.%${text}%`);

        if (!error && data) {
            setFilteredClients(data);
        }
    };

    const handleSelectClient = (client) => {
        setName(client.name);
        setPhone(client.phone);
        setSearchText(client.name);
        setFilteredClients([]);
    };

    const calculateFinalPrice = () => {
        let totalCassettes = 0;
        Object.values(cassetteCounts).forEach((val) => {
            const count = parseInt(val, 10);
            if (!isNaN(count)) totalCassettes += count;
        });
        let basePrice = parseFloat(unitPrice || 0) * totalCassettes;

        if (supportFournis) {
            if (outputtype === "Clé USB") basePrice += 20;
            if (outputtype === "Disque dur") basePrice += 45;
        }

        return basePrice.toFixed(2);
    };

    // 👉 Bouton "Étiquette rapide" : prépare les données + autoPrint
    const handleGoToQuickLabel = () => {
        if (!name || !phone) {
            showAlert(
                "Information manquante",
                "Veuillez saisir au minimum le nom et le téléphone."
            );
            return;
        }

        const cassetteSummary = Object.entries(cassetteCounts)
            .filter(([_, count]) => {
                const v = parseInt(String(count).trim(), 10);
                return Number.isFinite(v) && v > 0;
            })
            .map(([type, count]) => `${parseInt(String(count).trim(), 10)} ${type}`)
            .join(", ");

        const noteParts = [];
        if (description) noteParts.push(description);
        if (cassetteSummary) noteParts.push(cassetteSummary);
        const note = noteParts.join(" - ");

        navigation.navigate("QuickLabelPrintPage", {
            initialLabel: {
                name: String(name).trim(),
                phone: String(phone).trim(),
                device: "Transfert vidéo",
                model: outputtype || "",
                note,
            },
            autoPrint: true,
        });
    };

    const handleSubmit = async () => {
        try {
            if (!name || !phone || !description || !unitPrice) {
                showAlert(
                    "Erreur",
                    "Veuillez remplir tous les champs obligatoires."
                );
                return;
            }

            const cassetteSummary = Object.entries(cassetteCounts)
                .filter(([_, count]) => {
                    const v = parseInt(String(count).trim(), 10);
                    return Number.isFinite(v) && v > 0;
                })
                .map(([type, count]) => `${parseInt(count, 10)} ${type}`)
                .join(", ");

            let totalCassettes = 0;
            for (const val of Object.values(cassetteCounts)) {
                const v = parseInt(String(val).trim(), 10);
                if (Number.isFinite(v)) totalCassettes += v;
            }
            const pu = parseFloat(String(unitPrice).replace(",", "."));
            let basePrice = Number.isFinite(pu) ? pu * totalCassettes : 0;

            if (supportFournis) {
                if (outputtype === "Clé USB") basePrice += 20;
                if (outputtype === "Disque dur") basePrice += 45;
            }
            const finalPrice =
                Math.round((basePrice + Number.EPSILON) * 100) / 100;

            const updateData = {
                name: String(name).trim(),
                phone: String(phone).trim(),
                type: "video",
                description: String(description).trim(),
                price: finalPrice,
                cassettecount: cassetteSummary,
                cassettetype: "multiple",
                outputtype: outputtype || null,
                support_fournis: !!supportFournis,
                paid: !!isPaid,
            };

            if (isEdit && editData?.id) {
                const { data, error } = await supabase
                    .from("express")
                    .update(updateData)
                    .eq("id", editData.id)
                    .select("id");

                if (error) {
                    console.error("Update express error:", error);
                    showAlert("Erreur", error.message);
                    return;
                }

                showAlert("✅", "Fiche modifiée avec succès.");
                navigation.navigate("ExpressListPage", { refresh: Date.now() });
            } else {
                const { data, error } = await supabase
                    .from("express")
                    .insert([{ ...updateData, created_at: new Date().toISOString() }])
                    .select("id");

                if (error) {
                    console.error("Insert express error:", error);
                    showAlert("Erreur", error.message);
                    return;
                }

                const insertedId = data?.[0]?.id;
                navigation.navigate("PrintExpressPage", {
                    id: insertedId,
                    name,
                    phone,
                    type: "video",
                    description: updateData.description,
                    price: finalPrice,
                    cassettecount: cassetteSummary,
                    cassettetype: "multiple",
                    outputtype,
                    support_fournis: !!supportFournis,
                    supportLabel:
                        supportFournis &&
                        (outputtype === "Clé USB" || outputtype === "Disque dur")
                            ? `${outputtype} (fourni par la boutique +${
                                  outputtype === "Clé USB" ? "20" : "45"
                              }€)`
                            : outputtype,
                    date: new Date().toLocaleDateString(),
                });
            }
        } catch (e) {
            console.error("handleSubmit fatal:", e);
            showAlert("Erreur", "Impossible d’enregistrer la fiche.");
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
        >
            <FlatList
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.container}
                data={searchText.length >= 2 ? filteredClients : []}
                keyExtractor={(item, index) => index.toString()}
                ListHeaderComponent={
                    <View>
                        <Text style={styles.title}>
                            Fiche Express - Vidéo {isEdit && "(modification)"}
                        </Text>

                        <Text style={styles.label}>Nom ou téléphone</Text>
                        <TextInput
                            style={styles.input}
                            value={searchText}
                            onChangeText={filterClients}
                        />
                    </View>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity
                        onPress={() => handleSelectClient(item)}
                        style={{ width: "100%" }}
                    >
                        <Text style={styles.suggestionItem}>
                            {item.name} - {item.phone}
                        </Text>
                    </TouchableOpacity>
                )}
                ListFooterComponent={
                    <View>
                        <Text style={styles.label}>Téléphone</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="phone-pad"
                            value={phone}
                            onChangeText={setPhone}
                        />

                        <Text style={styles.label}>Description</Text>
                        <TextInput
                            style={styles.textArea}
                            multiline
                            value={description}
                            onChangeText={setDescription}
                        />

                        {Object.keys(cassetteCounts).map((key) => (
                            <View key={key} style={{ marginBottom: 6 }}>
                                <Text
                                    style={[
                                        styles.label,
                                        { marginBottom: 2, marginTop: 6 },
                                    ]}
                                >
                                    Nombre de {key}
                                </Text>
                                <TextInput
                                    style={[styles.input, { marginBottom: 6 }]}
                                    keyboardType="numeric"
                                    value={cassetteCounts[key]}
                                    onChangeText={(val) =>
                                        setCassetteCounts({
                                            ...cassetteCounts,
                                            [key]: val,
                                        })
                                    }
                                />
                            </View>
                        ))}

                        <Text style={styles.label}>Prix unitaire (€)</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="decimal-pad"
                            value={unitPrice}
                            onChangeText={setUnitPrice}
                        />

                        <Text style={styles.label}>Support de sortie</Text>
                        {["Clé USB", "CD", "DVD", "Disque dur"].map((option) => (
                            <TouchableOpacity
                                key={option}
                                style={[
                                    styles.supportOption,
                                    outputtype === option && styles.supportSelected,
                                ]}
                                onPress={() => setOutputtype(option)}
                            >
                                <Text>
                                    {outputtype === option ? "✅ " : "▫️ "}
                                    {option}
                                </Text>
                            </TouchableOpacity>
                        ))}

                        {(outputtype === "Clé USB" ||
                            outputtype === "Disque dur") && (
                            <TouchableOpacity
                                onPress={() => setSupportFournis(!supportFournis)}
                                style={{ marginTop: 10 }}
                            >
                                <Text>
                                    {supportFournis ? "☑️" : "⬜"} Support fourni par
                                    la boutique
                                </Text>
                            </TouchableOpacity>
                        )}

                        <View style={{ marginTop: 14, marginBottom: 6 }}>
                            <Text style={styles.label}>Facture réglée</Text>
                            <TouchableOpacity
                                onPress={() => setIsPaid(!isPaid)}
                                style={{
                                    padding: 10,
                                    borderWidth: 1,
                                    borderColor: "#aaa",
                                    borderRadius: 8,
                                    backgroundColor: isPaid
                                        ? "#d4edda"
                                        : "#f8d7da",
                                    alignItems: "center",
                                }}
                            >
                                <Text style={{ fontWeight: "600" }}>
                                    {isPaid
                                        ? "✅ Oui, marquer comme réglée"
                                        : "⬜ Non, encore due"}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.label}>
                            Montant total calculé : {calculateFinalPrice()} €
                        </Text>

<View style={styles.actionsRow}>
  {/* 1 — Retour */}
  <TouchableOpacity
    style={styles.actionItem}
    onPress={() => navigation.goBack()}
  >
    <Text style={styles.actionText}>Retour</Text>
  </TouchableOpacity>

  {/* 2 — Enregistrer */}
  <TouchableOpacity
    style={[styles.actionItem, styles.actionItemWithLeftBorder]}
    onPress={handleSubmit}
  >
    <Text style={styles.actionText}>Enregistrer</Text>
  </TouchableOpacity>

  {/* 3 — Réglée / Remettre en dû (toujours présent pour garder 25 %) */}
  <TouchableOpacity
    style={[styles.actionItem, styles.actionItemWithLeftBorder]}
    disabled={!isEdit || !editData?.id}
    onPress={async () => {
      if (!isEdit || !editData?.id) return; // sécurité
      const { error } = await supabase
        .from("express")
        .update({ paid: !isPaid })
        .eq("id", editData.id);

      if (error) {
        showAlert("Erreur", error.message);
      } else {
        setIsPaid(!isPaid);
        showAlert(
          "OK",
          `Fiche ${!isPaid ? "marquée réglée" : "remise en dû"}.`
        );
      }
    }}
  >
    <Text
      style={[
        styles.actionText,
        (!isEdit || !editData?.id) && styles.actionTextDisabled,
      ]}
    >
      {isPaid ? "Remettre en dû" : "Marquer comme réglée"}
    </Text>
  </TouchableOpacity>

  {/* 4 — Étiquette rapide */}
  <TouchableOpacity
    style={[styles.actionItem, styles.actionItemWithLeftBorder]}
    onPress={handleGoToQuickLabel}
  >
    <Text style={styles.actionText}>Étiquette rapide</Text>
  </TouchableOpacity>
</View>

                    </View>
                }
            />

            <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                onClose={() => setAlertVisible(false)}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 20 },
    title: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
    },
    label: {
        fontWeight: "600",
        marginBottom: 4,
        marginTop: 10,
        color: "#333",
    },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 6,
        padding: 8,
        marginBottom: 10,
        width: "100%",
    },
    textArea: {
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 6,
        padding: 10,
        marginBottom: 12,
        minHeight: 80,
        textAlignVertical: "top",
        width: "100%",
    },
    suggestionItem: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        width: "100%",
        borderBottomWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#f9f9f9",
    },
    button: {
        backgroundColor: "#007bff",
        padding: 14,
        borderRadius: 10,
        alignItems: "center",
        marginTop: 20,
    },
    buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
    supportOption: {
        padding: 10,
        marginVertical: 5,
        borderWidth: 1,
        borderColor: "#aaa",
        borderRadius: 8,
    },
    supportSelected: {
        backgroundColor: "#d1ecf1",
    },
    returnButton: {
        backgroundColor: "#a7a7a7",
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
        margin: 16,
    },
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
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    actionsRow: {
  flexDirection: "row",
  alignItems: "center",
  marginTop: 20,
  paddingTop: 10,
  borderTopWidth: 1,      // barre horizontale au-dessus
  borderTopColor: "#ccc",
},

actionItem: {
  flex: 1,                // ➜ 4 blocs = 4 × 25 %
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 4,
},

actionItemWithLeftBorder: {
  borderLeftWidth: 1,     // barre verticale entre les blocs
  borderLeftColor: "#ccc",
},

actionText: {
  fontSize: 14,
  fontWeight: "600",
  color: "#1f2933",
  textAlign: "center",
},

actionTextDisabled: {
  color: "#9ca3af",       // gris plus clair quand désactivé
},

});
