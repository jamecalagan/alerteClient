import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from "react-native";

export default function ProductSearchEngine() {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");

  const handleSearch = (type) => {
    if (!brand || !model) {
      Alert.alert("Erreur", "Merci de saisir une marque et un modèle.");
      return;
    }

    const query = encodeURIComponent(`${brand} ${model}`);

    let url = "";
    if (type === "google") {
      url = `https://www.google.com/search?q=${query}+fiche+technique`;
    } else if (type === "amazon") {
      url = `https://www.amazon.fr/s?k=${query}`;
    } else if (type === "images") {
      url = `https://www.google.com/search?tbm=isch&q=${query}`;
    }

    Linking.openURL(url);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔍 Recherche de produit</Text>

      <TextInput
        placeholder="Marque (ex: Samsung)"
        value={brand}
        onChangeText={setBrand}
        style={styles.input}
      />
      <TextInput
        placeholder="Modèle ou référence (ex: Galaxy S22)"
        value={model}
        onChangeText={setModel}
        style={styles.input}
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#4285F4" }]}
        onPress={() => handleSearch("google")}
      >
        <Text style={styles.buttonText}>🔍 Rechercher sur Google</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#FF9900" }]}
        onPress={() => handleSearch("amazon")}
      >
        <Text style={styles.buttonText}>🛒 Voir sur Amazon</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#34A853" }]}
        onPress={() => handleSearch("images")}
      >
        <Text style={styles.buttonText}>🖼️ Voir sur Google Images</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    flex: 1,
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    marginBottom: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  button: {
    padding: 14,
    borderRadius: 10,
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    textAlign: "center",
  },
});
