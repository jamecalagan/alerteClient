import React, { useState, useEffect, useLayoutEffect } from "react";
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

export default function ExpressRepairPage() {
  const navigation = useNavigation();
  const route = useRoute();
  const isEdit = route.params?.isEdit || false;
  const editData = route.params?.expressData || {};

  const [searchText, setSearchText] = useState("");
  const [filteredClients, setFilteredClients] = useState([]);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

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

  // Anti double-clic
  const [saving, setSaving] = useState(false);
const [isPaid, setIsPaid] = useState(
  editData?.paid === true || editData?.paymentStatus === "paid"
);

  // ———————————————————————————————————
  // Recherche clients
  // ———————————————————————————————————
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

  // ———————————————————————————————————
  // Sauvegarde (avec option d’enchaîner vers la signature)
  // ———————————————————————————————————
  const handleSubmit = async (goToSignature = false) => {
    if (saving) return;

    if (!name || !phone || !device || !problem || !price) {
      showAlert("Erreur", "Veuillez remplir tous les champs obligatoires.");
      return;
    }

    const numericPrice = Number(String(price).replace(",", "."));
    if (Number.isNaN(numericPrice)) {
      showAlert("Erreur", "Le montant est invalide.");
      return;
    }

    const baseData = {
      name: String(name).trim(),
      phone: String(phone).trim(),
      type: "reparation", // normalisé (sans accent)
      device: String(device).trim(),
      description: String(problem).trim(),
      price: numericPrice,
      paid: !!isPaid, // ← optionnel, pratique
      // ⚠️ pas de 'updated_at' (ta table ne l'a pas)
      // ⚠️ pas de 'date' (colonne absente dans 'express')
    };

    try {
      setSaving(true);

      if (isEdit && editData?.id) {
        // ----- MODIFICATION -----
        const { data, error } = await supabase
          .from("express")
          .update(baseData)                 // ✅ on n'envoie pas updated_at
          .eq("id", editData.id)
          .select("id, created_at")
          .single();

        if (error) throw error;

        const displayDate = data?.created_at
          ? new Date(data.created_at).toLocaleDateString("fr-FR")
          : new Date().toLocaleDateString("fr-FR");

        if (goToSignature) {
          // Enchaîner vers l’écran de signature/ impression
          navigation.navigate("PrintExpressPage", {
            id: data.id,
            name,
            phone,
            device,
            description: baseData.description,
            price: numericPrice,
            type: "reparation",
            date: displayDate,
          });
        } else {
          showAlert("Succès", "Fiche mise à jour.");
          navigation.navigate("ExpressListPage", { refresh: Date.now() });
        }
      } else {
        // ----- CREATION -----
        const { data, error } = await supabase
          .from("express")
          .insert([{ ...baseData, created_at: new Date().toISOString() }])
          .select("id, created_at");

        if (error) throw error;

        const row = data?.[0] || {};
        const displayDate = row.created_at
          ? new Date(row.created_at).toLocaleDateString("fr-FR")
          : new Date().toLocaleDateString("fr-FR");

        // En création, on enchaîne toujours vers la signature
        navigation.navigate("PrintExpressPage", {
          id: row.id,
          name,
          phone,
          device,
          description: baseData.description,
          price: numericPrice,
          type: "reparation",
          date: displayDate,
        });
      }
    } catch (e) {
      console.error("handleSubmit (reparation):", e);
      showAlert("Erreur", e?.message || "Impossible d’enregistrer.");
    } finally {
      setSaving(false);
    }
  };

  // ———————————————————————————————————
  // Bouton “Enregistrer” dans le header (en édition)
  // ———————————————————————————————————
  useLayoutEffect(() => {
    if (!isEdit) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => handleSubmit(false)}
          disabled={saving}
          style={{
            marginRight: 12,
            paddingVertical: 6,
            paddingHorizontal: 10,
            backgroundColor: saving ? "#9bbcff" : "#0d6efd",
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            {saving ? "…" : "Enregistrer"}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, isEdit, saving, name, phone, device, problem, price]);

  // ———————————————————————————————————
  // Pré-remplissage si édition
  // ———————————————————————————————————
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
              Fiche Express - Réparation {isEdit ? "(modification)" : ""}
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
            <TextInput style={styles.input} value={device} onChangeText={setDevice} />

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

            {/* 1) Bouton Faire signer (toujours) */}
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: saving ? "#9bbcff" : "#007bff" },
              ]}
              onPress={() => handleSubmit(true)}
              disabled={saving}
            >
              <Text style={styles.buttonText}>
                {saving ? "Préparation…" : "🖋️ Faire signer la fiche"}
              </Text>
            </TouchableOpacity>

            {/* 2) Bouton Enregistrer (en édition uniquement) */}
            {isEdit && (
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: saving ? "#9bbcff" : "#0d6efd" },
                ]}
                onPress={() => handleSubmit(false)}
                disabled={saving}
              >
                <Text style={styles.buttonText}>
                  {saving ? "Enregistrement…" : "💾 Enregistrer"}
                </Text>
              </TouchableOpacity>
 

            )}
             {isEdit && editData?.id && (
  <TouchableOpacity
    onPress={async () => {
      try {
        const { error } = await supabase
          .from("express")
          .update({ paid: !isPaid })
          .eq("id", editData.id);
        if (error) throw error;

        setIsPaid(!isPaid);
        showAlert(
          "OK",
          !isPaid ? "Fiche marquée réglée." : "Fiche remise en dû."
        );
      } catch (e) {
        console.error("toggle paid (repair):", e);
        showAlert("Erreur", "Impossible de mettre à jour le paiement.");
      }
    }}
    style={[
      styles.button,
      { backgroundColor: isPaid ? "#6c757d" : "#28a745" },
    ]}
  >
    <Text style={styles.buttonText}>
      {isPaid ? "💱 Remettre en dû" : "✅ Marquer comme réglée"}
    </Text>
  </TouchableOpacity>
)}
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
          </View>
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
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
