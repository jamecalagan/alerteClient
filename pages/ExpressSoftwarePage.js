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

export default function ExpressSoftwarePage() {
  const navigation = useNavigation();
  const route = useRoute();
  const isEdit = route.params?.isEdit || false;
  const editData = route.params?.expressData || {};

  const [searchText, setSearchText] = useState("");
  const [filteredClients, setFilteredClients] = useState([]);

  const [name, setName] = useState(editData.name || "");
  const [phone, setPhone] = useState(editData.phone || "");
  const [softwaretype, setSoftwaretype] = useState(editData.softwaretype || "");
  const [description, setDescription] = useState(editData.description || "");
  const [licence, setLicence] = useState(editData.licence || "");
  const [price, setPrice] = useState(editData.price ? String(editData.price) : "");

  const [date, setDate] = useState(editData.date || new Date().toISOString().split("T")[0]);
useEffect(() => {
  if (isEdit && editData) {
    setName(editData.name || "");
    setPhone(editData.phone || "");
    setSoftwaretype(editData.softwaretype || "");
    setDescription(editData.description || "");
    setLicence(editData.licence || "");
    setPrice(editData.price ? String(editData.price) : "");
    setDate(editData.date || new Date().toISOString().split("T")[0]);
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
    if (!name || !phone || !softwaretype || !description || !price) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs obligatoires.");
      return;
    }

    const dataToSave = {
      name,
      phone,
      type: "logiciel",
      softwaretype,
      licence,
      description,
      price,
      date,
    };

    let result;
    if (isEdit && editData?.id) {
      result = await supabase
        .from("express")
        .update(dataToSave)
        .eq("id", editData.id)
        .select();
    } else {
      result = await supabase
        .from("express")
        .insert([dataToSave])
        .select();
    }

    const { data, error } = result;

    if (error) {
      Alert.alert("Erreur", error.message);
      return;
    }

    const insertedId = data?.[0]?.id;

    navigation.navigate("PrintExpressPage", {
      id: insertedId,
      name,
      phone,
      softwaretype,
      licence,
      description,
      price,
      type: "logiciel",
      date: new Date().toLocaleDateString(),
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <FlatList
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Fiche Express - Logiciel</Text>

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

            <Text style={styles.label}>Type de prestation</Text>
            <TextInput
              style={styles.input}
              value={softwaretype}
              onChangeText={setSoftwaretype}
            />

            <Text style={styles.label}>Désignation de la prestation</Text>
            <TextInput
              style={styles.textArea}
              multiline
              value={description}
              onChangeText={setDescription}
            />

            <Text style={styles.label}>Clé de licence</Text>
            <TextInput
              style={styles.input}
              value={licence}
              onChangeText={setLicence}
            />

            <Text style={styles.label}>Montant total (€)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
            />

            <TouchableOpacity style={styles.button} onPress={handleSubmit}>
              <Text style={styles.buttonText}>🖋️ Faire signer la fiche</Text>
            </TouchableOpacity>

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
