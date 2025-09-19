import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Alert,
    FlatList,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

export default function ExpressRepairPage() {
    const navigation = useNavigation();
    const route = useRoute();
    const isEdit = route.params?.isEdit || false;
    const editData = route.params?.expressData || {};

    const [searchText, setSearchText] = useState("");
    const [filteredClients, setFilteredClients] = useState([]);

    const [name, setName] = useState(editData.name || "");
    const [phone, setPhone] = useState(editData.phone || "");
    const [device, setDevice] = useState(editData.device || "");
    const [problem, setProblem] = useState(editData.description ?? "");

    const [price, setPrice] = useState(
        editData.price ? String(editData.price) : ""
    );
    const [date, setDate] = useState(
        editData.date || new Date().toISOString().split("T")[0]
    );

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

        if (!error) {
            setFilteredClients(data);
        }
    };

    const handleSelectClient = (client) => {
        setName(client.name);
        setPhone(client.phone);
        setSearchText(client.name);
        setFilteredClients([]);
    };

const handleSubmit = async () => {
  if (!name || !phone || !device || !problem || !price) {
    Alert.alert("Erreur", "Veuillez remplir tous les champs obligatoires.");
    return;
  }

  // Prix → nombre (souvent requis en SQL)
  const numericPrice = Number(String(price).replace(",", "."));
  if (Number.isNaN(numericPrice)) {
    Alert.alert("Erreur", "Le montant est invalide.");
    return;
  }

  const baseData = {
    name,
    phone,
    type: "réparation",
    device,
    description: problem,
    price: numericPrice,
    // ❌ pas de 'date' ici : la table 'express' n'a pas cette colonne
  };

  try {
    if (isEdit && editData?.id) {
      // ----- MODIFICATION -----
      const { data, error } = await supabase
        .from("express")
        .update(baseData)
        .eq("id", editData.id)
        .select("id, created_at")
        .single();

      if (error) throw error;

      const displayDate = data?.created_at
        ? new Date(data.created_at).toLocaleDateString("fr-FR")
        : new Date().toLocaleDateString("fr-FR");

      navigation.navigate("PrintExpressPage", {
        id: data.id,
        name,
        phone,
        device,
        description: problem,
        price: numericPrice,
        type: "réparation",
        date: new Date().toLocaleDateString(),
      });
    } else {
      // ----- CREATION -----
      const { data, error } = await supabase
        .from("express")
        .insert([{ ...baseData, created_at: new Date() }]) // comme ta page Vidéo
        .select("id, created_at");

      if (error) throw error;

      const row = data?.[0] || {};
      const displayDate = row.created_at
        ? new Date(row.created_at).toLocaleDateString("fr-FR")
        : new Date().toLocaleDateString("fr-FR");

      navigation.navigate("PrintExpressPage", {
        id: row.id,
        name,
        phone,
        device,
        description: problem,
        price: numericPrice,
        type: "réparation",
        displayDate, // ✅ pour l’affichage uniquement
      });
    }
  } catch (e) {
    Alert.alert("Erreur", e?.message || "Impossible d’enregistrer.");
  }
};


    useEffect(() => {
        if (isEdit && editData) {
            setName(editData.name || "");
            setPhone(editData.phone || "");
            setDevice(editData.device || "");
            setProblem(editData.description ?? "");
            setPrice(editData.price ? String(editData.price) : "");
            setDate(editData.date || new Date().toISOString().split("T")[0]);
        }
    }, []);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
        >
            <FlatList
                ListHeaderComponent={
                    <View>
                        <Text style={styles.title}>
                            Fiche Express - Réparation
                        </Text>

                        <Text style={styles.label}>Nom ou téléphone</Text>
                        <TextInput
                            style={styles.input}
                            value={searchText || name}
                            onChangeText={filterClients}
                        />
                    </View>
                }
                data={searchText.length >= 2 ? filteredClients : []}
                keyExtractor={(item, index) => index.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        onPress={() => handleSelectClient(item)}
                        style={styles.suggestionItemWrapper}
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

                        <Text style={styles.label}>Appareil</Text>
                        <TextInput
                            style={styles.input}
                            value={device}
                            onChangeText={setDevice}
                        />

                        <Text style={styles.label}>Problème constaté</Text>
                        <TextInput
                            style={styles.textArea}
                            multiline
                            value={problem}
                            onChangeText={setProblem}
                        />

                        <Text style={styles.label}>Montant total (€)</Text>
                        <TextInput
                            style={styles.input}
                            keyboardType="decimal-pad"
                            value={price}
                            onChangeText={setPrice}
                        />

                        <TouchableOpacity
                            style={styles.button}
                            onPress={handleSubmit}
                        >
                            <Text style={styles.buttonText}>
                                🖋️ Faire signer la fiche
                            </Text>
                        </TouchableOpacity>

                        <View style={{ alignItems: "center", marginTop: 16 }}>
                            <TouchableOpacity
                                style={[
                                    styles.optionButton,
                                    styles.shadowBox,
                                    {
                                        backgroundColor: "#a7a7a7",
                                        width: "60%",
                                    },
                                ]}
                                onPress={() => navigation.goBack()}
                            >
                                <Text style={styles.buttonText}>⬅ Retour</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                }
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.container}
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
        marginTop: 12,
        color: "#333",
    },
    input: {
        width: "100%",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 6,
        padding: 10,
        marginBottom: 8,
    },
    textArea: {
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 6,
        padding: 10,
        marginBottom: 12,
        minHeight: 80,
        textAlignVertical: "top",
    },
    button: {
        backgroundColor: "#007bff",
        padding: 14,
        borderRadius: 10,
        alignItems: "center",
        marginTop: 20,
    },
    buttonText: { color: "white", fontWeight: "bold", fontSize: 16 },
    suggestionItemWrapper: {
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
    optionButton: {
        width: 310,
        paddingVertical: 15,
        backgroundColor: "#3e4c69",
        borderRadius: 50,
        alignItems: "center",
        marginTop: 20,
    },
    shadowBox: {
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
});
