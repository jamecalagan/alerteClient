import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

export default function EditExpressPage() {
  const navigation = useNavigation();
  const route = useRoute();
  const { expressData } = route.params;

const [form, setForm] = useState({
  name: "",
  phone: "",
  product: "",
  brand: "",
  model: "",
  serial: "",
  description: "",
  price: "",
  acompte: "",
  paymentmethod: "",
  licence: "", // ✅ ici
});


  useEffect(() => {
    if (expressData) {
      setForm({
        name: expressData.name || "",
        phone: expressData.phone || "",
        product: expressData.product || "",
        brand: expressData.brand || "",
        model: expressData.model || "",
        serial: expressData.serial || "",
        description: expressData.description || "",
        price: expressData.price?.toString() || "",
        acompte: expressData.acompte?.toString() || "",
        paymentmethod: expressData.paymentmethod || "",
		licence: expressData.licence || "",
      });
    }
  }, [expressData]);

  const handleChange = (key, value) => {
    setForm({ ...form, [key]: value });
  };

  const handleUpdate = async () => {
    const { error } = await supabase
      .from("express")
      .update({
        ...form,
        price: parseFloat(form.price),
        acompte: parseFloat(form.acompte),
      })
      .eq("id", expressData.id);

    if (error) {
		console.log("❌ Supabase update error:", error);
      Alert.alert("Erreur", "Impossible de modifier la fiche.");
    } else {
      Alert.alert("Succès", "Fiche mise à jour !");
      navigation.goBack();
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>✏️ Modifier la fiche Express</Text>

      {[
        { key: "name", label: "Nom" },
        { key: "phone", label: "Téléphone" },
        { key: "product", label: "Appareil" },
        { key: "brand", label: "Marque" },
        { key: "model", label: "Modèle" },
        { key: "serial", label: "Numéro de série" },
        { key: "description", label: "Description" },
        { key: "price", label: "Prix" },
        { key: "acompte", label: "Acompte" },
        { key: "paymentmethod", label: "Méthode de paiement" },
      ].map(({ key, label }) => (
        <TextInput
          key={key}
          style={styles.input}
          placeholder={label}
          value={form[key]}
          onChangeText={(text) => handleChange(key, text)}
          keyboardType={["price", "acompte", "phone"].includes(key) ? "numeric" : "default"}
        />
      ))}
<TextInput
  style={styles.input}
  placeholder="Licence"
  value={form.licence}
  onChangeText={(text) => handleChange("licence", text)}
/>

      <TouchableOpacity style={styles.saveButton} onPress={handleUpdate}>
        <Text style={styles.buttonText}>💾 Enregistrer</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonText}>Annuler</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: "#f2f2f2",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  saveButton: {
    backgroundColor: "#28a745",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  cancelButton: {
    marginTop: 10,
    alignItems: "center",
  },
    button: {
    backgroundColor: "#575f59",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  cancelText: {
    color: "#333",
    fontSize: 14,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
