import React, { useState, useEffect, useRef } from "react";
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
import BackButton from "../components/BackButton";

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

    // === Confirmation avant de quitter avec des modifications non enregistrées ===
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [pendingLeaveAction, setPendingLeaveAction] = useState(null);
    const skipDirtyRef = useRef(true); // true au montage et pendant le chargement d'une fiche existante

    useEffect(() => {
        if (skipDirtyRef.current) {
            skipDirtyRef.current = false;
            return;
        }
        setHasUnsavedChanges(true);
    }, [name, phone, description, cassetteCounts, unitPrice, outputtype, supportFournis, isPaid]);

    useEffect(() => {
        const unsubscribe = navigation.addListener("beforeRemove", (e) => {
            if (!hasUnsavedChanges) return;
            e.preventDefault();
            setPendingLeaveAction(() => () => navigation.dispatch(e.data.action));
        });
        return unsubscribe;
    }, [navigation, hasUnsavedChanges]);

    useEffect(() => {
        if (isEdit && editData.price && editData.cassettecount) {
            skipDirtyRef.current = true; // le calcul initial ne doit pas marquer la fiche comme modifiée
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

                setHasUnsavedChanges(false);
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

                setHasUnsavedChanges(false);

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

                        <Text style={styles.label}>Nombre de cassettes</Text>
                        <View style={styles.cassetteRow}>
                            {Object.keys(cassetteCounts).map((key) => (
                                <View key={key} style={styles.cassetteItem}>
                                    <Text style={styles.cassetteLabel}>{key}</Text>
                                    <TextInput
                                        style={styles.cassetteInput}
                                        keyboardType="numeric"
                                        placeholder="0"
                                        placeholderTextColor="#cbd5e1"
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
                        </View>

                        <Text style={styles.label}>Prix unitaire (€)</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="decimal-pad"
                            value={unitPrice}
                            onChangeText={setUnitPrice}
                        />

                        <Text style={styles.label}>Support de sortie</Text>
                        <View style={styles.supportRow}>
                            {["Clé USB", "CD", "DVD", "Disque dur"].map((option) => (
                                <TouchableOpacity
                                    key={option}
                                    style={[
                                        styles.supportChip,
                                        outputtype === option && styles.supportChipSelected,
                                    ]}
                                    onPress={() => setOutputtype(option)}
                                >
                                    <Text
                                        style={[
                                            styles.supportChipText,
                                            outputtype === option &&
                                                styles.supportChipTextSelected,
                                        ]}
                                    >
                                        {option}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

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
  <BackButton onPress={() => navigation.goBack()} />

  {/* 2 — Enregistrer */}
  <TouchableOpacity
    style={[styles.actionButton, styles.actionButtonPrimary]}
    onPress={handleSubmit}
  >
    <Text style={styles.actionButtonText}>Enregistrer</Text>
  </TouchableOpacity>

  {/* 3 — Réglée / Remettre en dû (toujours présent pour garder la grille 2×2) */}
  <TouchableOpacity
    style={[
      styles.actionButton,
      isPaid ? styles.actionButtonWarning : styles.actionButtonSuccess,
      (!isEdit || !editData?.id) && styles.actionButtonDisabled,
    ]}
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
        setHasUnsavedChanges(false);
        showAlert(
          "OK",
          `Fiche ${!isPaid ? "marquée réglée" : "remise en dû"}.`
        );
      }
    }}
  >
    <Text style={styles.actionButtonText}>
      {isPaid ? "Remettre en dû" : "Marquer réglée"}
    </Text>
  </TouchableOpacity>

  {/* 4 — Étiquette rapide */}
  <TouchableOpacity
    style={[styles.actionButton, styles.actionButtonAccent]}
    onPress={handleGoToQuickLabel}
  >
    <Text style={styles.actionButtonText}>Étiquette rapide</Text>
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

            <CustomAlert
                visible={!!pendingLeaveAction}
                title="Modifications non enregistrées"
                message="Vous allez perdre les informations saisies dans cette fiche. Voulez-vous vraiment quitter ?"
                onClose={() => setPendingLeaveAction(null)}
                onConfirm={() => {
                    const action = pendingLeaveAction;
                    setHasUnsavedChanges(false);
                    setPendingLeaveAction(null);
                    action?.();
                }}
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
        fontSize: 13,
        marginBottom: 6,
        marginTop: 12,
        color: "#475569",
    },
    input: {
        borderWidth: 1,
        borderColor: "#e2e8f0",
        backgroundColor: "#f8fafc",
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 10,
        width: "100%",
        fontSize: 15,
        color: "#1e293b",
    },
    textArea: {
        borderWidth: 1,
        borderColor: "#e2e8f0",
        backgroundColor: "#f8fafc",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        minHeight: 80,
        textAlignVertical: "top",
        width: "100%",
        fontSize: 15,
        color: "#1e293b",
    },
    cassetteRow: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 10,
    },
    cassetteItem: {
        flex: 1,
        alignItems: "center",
    },
    cassetteLabel: {
        fontSize: 12,
        fontWeight: "700",
        color: "#64748b",
        marginBottom: 6,
        textAlign: "center",
    },
    cassetteInput: {
        width: "100%",
        textAlign: "center",
        borderWidth: 1,
        borderColor: "#e2e8f0",
        backgroundColor: "#f8fafc",
        borderRadius: 12,
        paddingVertical: 10,
        fontSize: 16,
        fontWeight: "700",
        color: "#1e293b",
    },
    supportRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 8,
    },
    supportChip: {
        paddingVertical: 9,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#cbd5e1",
        backgroundColor: "#f8fafc",
    },
    supportChipSelected: {
        backgroundColor: "#dbeafe",
        borderColor: "#3b82f6",
    },
    supportChipText: {
        fontSize: 14,
        color: "#334155",
        fontWeight: "500",
    },
    supportChipTextSelected: {
        color: "#1d4ed8",
        fontWeight: "700",
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
  flexWrap: "wrap",
  gap: 10,
  marginTop: 22,
  paddingTop: 18,
  borderTopWidth: 1,
  borderTopColor: "#e2e8f0",
},

actionButton: {
  flexGrow: 1,
  flexBasis: "47%",
  paddingVertical: 13,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
},

actionButtonPrimary: {
  backgroundColor: "#2563eb",
},

actionButtonSuccess: {
  backgroundColor: "#16a34a",
},

actionButtonWarning: {
  backgroundColor: "#ea580c",
},

actionButtonAccent: {
  backgroundColor: "#7c3aed",
},

actionButtonDisabled: {
  backgroundColor: "#cbd5e1",
},

actionButtonText: {
  fontSize: 14,
  fontWeight: "700",
  color: "#ffffff",
  textAlign: "center",
},

});
