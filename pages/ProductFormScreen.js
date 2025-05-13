import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Picker } from "@react-native-picker/picker";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

export default function ProductFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const editingFlyer = route.params?.product || null;

  const [form, setForm] = useState({
    title: "",
    brand: "",
    model: "",
    condition: "",
    cpu: "",
    ram: "",
    storage: "",
    screen: "",
    warranty: "",
    price: "",
    imageUrl: "",
    extra: "",
    id: null,
  });

  useEffect(() => {
    if (editingFlyer) {
      console.log("📦 Fiche chargée :", editingFlyer);
      setForm((prev) => ({ ...prev, ...editingFlyer }));
    }
  }, []);

  const handleChange = (key, value) => {
    setForm({ ...form, [key]: value });
  };

  const pickImageFromDevice = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission refusée", "Impossible d’accéder à la galerie.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setForm({ ...form, imageUrl: `data:image/jpeg;base64,${base64}` });
    }
  };

  const handleSubmit = async () => {
    console.log("🔍 form.id au moment du submit :", form.id);

    if (!form.title || !form.price || !form.imageUrl) {
      Alert.alert("Champs manquants", "Le titre, le prix et l'image sont requis.");
      return;
    }

    if (form?.id && typeof form.id === "string" && form.id.length > 10) {
      console.log("✏️ MODE UPDATE avec ID :", form.id);

      const dataToUpdate = { ...form };
      delete dataToUpdate.id;

      console.log("📤 Données envoyées à UPDATE :", dataToUpdate);

      const { error } = await supabase
        .from("flyers")
        .update(dataToUpdate)
        .eq("id", form.id);

      if (error) {
        console.error("❌ Erreur UPDATE :", error);
        Alert.alert("Erreur UPDATE", error.message);
        return;
      }

      navigation.navigate("ProductFlyer", { product: { id: form.id, ...dataToUpdate } });
      return;
    }

    // INSERT
    console.log("🆕 MODE INSERT - ID doit être exclu");

	const dataToInsert = JSON.parse(JSON.stringify(form));
	delete dataToInsert.id;

    console.log("📦 Données envoyées à INSERT :", dataToInsert);

    const { data, error } = await supabase
      .from("flyers")
      .insert([dataToInsert])
      .select()
      .single();

    if (error) {
      console.error("❌ Erreur INSERT :", error);
      Alert.alert("Erreur INSERT", error.message);
      return;
    }

    navigation.navigate("ProductFlyer", { product: data });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>
        {form.id ? "✏️ Modifier l'affiche" : "📝 Nouvelle affiche produit"}
      </Text>

      {["title", "brand", "model", "cpu", "ram", "storage", "screen", "warranty", "price"].map((key) => (
        <TextInput
          key={key}
          placeholder={key.charAt(0).toUpperCase() + key.slice(1)}
          style={styles.input}
          value={form[key]}
          onChangeText={(text) => handleChange(key, text)}
        />
      ))}

      <Text style={styles.label}>État du produit</Text>
      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={form.condition}
          onValueChange={(value) => handleChange("condition", value)}
          style={styles.picker}
        >
          <Picker.Item label="-- Sélectionner l'état --" value="" />
          <Picker.Item label="Neuf" value="Neuf" />
          <Picker.Item label="Très bon état" value="Très bon état" />
          <Picker.Item label="Bon état" value="Bon état" />
          <Picker.Item label="Correct" value="Correct" />
          <Picker.Item label="À réparer" value="À réparer" />
        </Picker>
      </View>

      <Text style={styles.label}>Informations supplémentaires</Text>
      <TextInput
        placeholder="Description ou caractéristiques..."
        style={[styles.input, styles.textarea]}
        multiline
        value={form.extra}
        onChangeText={(text) => handleChange("extra", text)}
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#0077cc" }]}
        onPress={() => Linking.openURL("https://www.google.com/imghp")}
      >
        <Text style={styles.buttonText}>🔎 Rechercher une image sur Google</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: "#444" }]}
        onPress={pickImageFromDevice}
      >
        <Text style={styles.buttonText}>🖼️ Choisir une image depuis la tablette</Text>
      </TouchableOpacity>

      {form.imageUrl !== "" && (
        <View style={{ marginTop: 10, alignItems: "center" }}>
          <Image
            source={{ uri: form.imageUrl }}
            style={{ width: "100%", height: 200, borderRadius: 8 }}
            resizeMode="contain"
          />
          <TouchableOpacity
            onPress={() => handleChange("imageUrl", "")}
            style={[styles.button, { backgroundColor: "#b00020", marginTop: 10 }]}
          >
            <Text style={styles.buttonText}>🗑️ Supprimer l'image</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>🖨️ Générer l'affiche</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    fontSize: 16,
    minHeight: 50,
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 20,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
  },
  picker: {
    height: 50,
    fontSize: 16,
  },
  textarea: {
    textAlignVertical: "top",
    minHeight: 120,
  },
  button: {
    backgroundColor: "#4caf50",
    padding: 14,
    borderRadius: 8,
    marginTop: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});