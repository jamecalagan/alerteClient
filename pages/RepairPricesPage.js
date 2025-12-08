import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Picker } from "@react-native-picker/picker";
import { supabase } from "../supabaseClient";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
/**
 * ------------------------------------------------------------
 * RepairPricesPage.js — v2.1
 * ------------------------------------------------------------
 * Correctifs :
 *   • Ajout import Alert (manquant → bloquait les actions)
 *   • onPress sur la carte => édition (plus besoin d’appui long)
 *   • deleteRepair affiche l’erreur Supabase le cas échéant
 *   • Styling inchangé
 * ------------------------------------------------------------
 */

export default function RepairPricesPage() {
	const navigation = useNavigation();
  const [productTypes, setProductTypes] = useState([]);
  const [selectedType, setSelectedType] = useState("");
  const [repairs, setRepairs] = useState([]);
  const [loading, setLoading] = useState(true);
const [searchRef, setSearchRef]   = useState("");
const [searchPart, setSearchPart] = useState("");
  /* -------------------- Modal state ----------------------- */
  const [modalVisible, setModalVisible] = useState(false);
  const [currentItem, setCurrentItem] = useState(null); // null = ajout
  const [form, setForm] = useState({ issue: "", symptoms: "", price_min: "", price_max: "" });

  const resetForm = () => setForm({ issue: "", symptoms: "", price_min: "", price_max: "" });

  const openModal = (item = null) => {
    setCurrentItem(item);
    if (item) {
      setForm({
        issue: item.issue,
        symptoms: item.symptoms ?? "",
        price_min: item.price_min.toString(),
        price_max: item.price_max.toString(),
      });
    } else {
      resetForm();
    }
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setCurrentItem(null);
    resetForm();
  };

  /* -------------------- Fetch helpers --------------------- */
const fetchProductTypes = async () => {
  try {
    const { data, error } = await supabase
      .from("repair_prices")
      .select("product_type");

    if (error) throw error;

    const types = [...new Set(data.map((d) => d.product_type))].sort(); // <- Ajout de .sort()
    setProductTypes(types);
    if (!selectedType && types.length) setSelectedType(types[0]);
  } catch (e) {
    Alert.alert("Erreur", "Impossible de charger les types de produit");
  }
};


  const fetchRepairs = async (type) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("repair_prices")
        .select("id, issue, symptoms, price_min, price_max")
        .eq("product_type", type)
        .order("issue", { ascending: true });

      if (error) throw error;
      setRepairs(data);
    } catch (e) {
      Alert.alert("Erreur", "Impossible de charger les barèmes");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- insert / update ----------------------- */
  const saveRepair = async () => {
    const { issue, symptoms, price_min, price_max } = form;
    if (!issue || !price_min || !price_max) {
      Alert.alert("Champs manquants", "Issue et tarifs obligatoires");
      return;
    }
    try {
      if (currentItem) {
        const { error } = await supabase
          .from("repair_prices")
          .update({ issue, symptoms, price_min: +price_min, price_max: +price_max })
          .eq("id", currentItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("repair_prices").insert({
          product_type: selectedType,
          issue,
          symptoms,
          price_min: +price_min,
          price_max: +price_max,
        });
        if (error) throw error;
      }
      closeModal();
      fetchRepairs(selectedType);
    } catch (e) {
      Alert.alert("Erreur", "Sauvegarde impossible : " + e.message);
    }
  };

  /* ------------------------ delete ------------------------ */
  const deleteRepair = async (id) => {
    Alert.alert("Confirmer", "Supprimer cette entrée ?", [
      { text: "Annuler" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("repair_prices").delete().eq("id", id);
          if (error) {
            Alert.alert("Erreur", "Suppression impossible : " + error.message);
            return;
          }
          fetchRepairs(selectedType);
        },
      },
    ]);
  };

  /* ----------------------- effects ------------------------ */
  useEffect(() => {
    fetchProductTypes();
  }, []);

  useEffect(() => {
    if (selectedType) fetchRepairs(selectedType);
  }, [selectedType]);

  /* ----------------------- render ------------------------- */
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={{ flex: 1 }}
  >

    <SafeAreaView style={styles.container}>
      {/* Sélecteur produit */}
		<View style={{ marginTop: 20, marginHorizontal: 10, backgroundColor: "#F0F0F0", borderRadius: 8 }}>
			<Picker
				selectedValue={selectedType}
				onValueChange={(val) => setSelectedType(val)}
			>
				{productTypes.map((pt) => (
				<Picker.Item key={pt} label={pt} value={pt} />
				))}
			</Picker>
			</View>


      {/* Liste des interventions */}
      <FlatList
        data={repairs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => openModal(item)} style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.issue}>{item.issue}</Text>
              {item.symptoms ? <Text style={styles.symptoms}>{item.symptoms}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.price}>{item.price_min} € – {item.price_max} €</Text>
              <TouchableOpacity onPress={() => deleteRepair(item.id)}>
                <MaterialIcons name="delete" size={20} color="#e74c3c" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListFooterComponent={<View style={{ height: 80 }} />}
      />
	{/* Formulaire de recherche en ligne */}
<View style={{ marginHorizontal: 20, marginTop: 10 }}>
  <Text style={{ fontWeight: "bold", marginBottom: 5 }}>
    Recherche de pièce en ligne
  </Text>
  <TextInput
    placeholder="Référence produit (ex: A1466, iPhone X, etc.)"
    value={form.ref || ""}
    onChangeText={(t) => setForm({ ...form, ref: t })}
    style={styles.input}
  />
  <TextInput
    placeholder="Nom de la pièce (ex: écran, batterie...)"
    value={form.part || ""}
    onChangeText={(t) => setForm({ ...form, part: t })}
    style={styles.input}
  />
  <View style={{ alignItems: "center", marginTop: 2 }}>
<TouchableOpacity
  style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#09a4fd", width: "60%"}]}
  onPress={() => {
if (!searchRef.trim() && !searchPart.trim()) {
  Alert.alert("Erreur", "Veuillez saisir une référence ou une pièce.");
  return;
}
    const query = encodeURIComponent(`${selectedType} ${searchRef} ${searchPart}`);
    Linking.openURL(`https://www.google.com/search?q=${query}`);
  }}
>
  <Text style={styles.buttonText}>🔍 Rechercher sur Google</Text>
</TouchableOpacity>
</View>

</View>
      {/* Bouton + (ajout) */}
      <TouchableOpacity style={styles.fab} onPress={() => openModal()}>
        <MaterialIcons name="add" size={30} color="#fff" />
      </TouchableOpacity>
	        {/* Bouton Retour */}
      <View style={{ alignItems: "center", marginTop: 5 }}>
        <TouchableOpacity
          style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#a7a7a7", width: "60%" }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Retour</Text>
        </TouchableOpacity>
      </View>

      {/* Modal Ajout / Édition */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalBack}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{currentItem ? "Modifier" : "Ajouter"} une intervention</Text>
            <TextInput
              placeholder="Intitulé (issue)"
              value={form.issue}
              onChangeText={(t) => setForm({ ...form, issue: t })}
              style={styles.input}
            />
            <TextInput
              placeholder="Symptômes (optionnel)"
              value={form.symptoms}
              onChangeText={(t) => setForm({ ...form, symptoms: t })}
              style={[styles.input, { height: 60 }]}
              multiline
            />
            <View style={styles.row}>
              <TextInput
                placeholder="Prix min"
                value={form.price_min}
                onChangeText={(t) => setForm({ ...form, price_min: t })}
                keyboardType="numeric"
                style={[styles.input, { flex: 1, marginRight: 5 }]}
              />
              <TextInput
                placeholder="Prix max"
                value={form.price_max}
                onChangeText={(t) => setForm({ ...form, price_max: t })}
                keyboardType="numeric"
                style={[styles.input, { flex: 1, marginLeft: 5 }]}
              />
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={styles.btn} onPress={saveRepair}>
                <Text style={styles.btnText}>Enregistrer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: "#aaa" }]} onPress={closeModal}>
                <Text style={styles.btnText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

	</SafeAreaView>
	</KeyboardAvoidingView>
  );
}

/* ------------------------- styles ------------------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingTop: 20, },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  picker: {
  backgroundColor: "#F0F0F0",
  marginHorizontal: 10,
  marginTop: 20,
  marginBottom: 10,
  borderRadius: 8,
},

  card: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    marginHorizontal: 10,
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  issue: { fontSize: 16, fontWeight: "600" },
  symptoms: { fontSize: 14, color: "#555" },
  price: { fontSize: 14, fontWeight: "700", color: "#2ECC71" },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: "#3498db",
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  modalBack: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  modalContent: { width: "90%", backgroundColor: "#fff", borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  input: { backgroundColor: "#f0f0f0", borderRadius: 6, padding: 10, marginVertical: 5 },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  btn: { flex: 1, backgroundColor: "#2ecc71", padding: 12, borderRadius: 6, alignItems: "center", marginHorizontal: 5 },
  btnText: { color: "#ffffff", fontWeight: "bold" },
      optionButton: {
        width: 310,
        paddingVertical: 15,
        backgroundColor: "#3e4c69",
        borderRadius: 50,
        alignItems: "center",
		marginBottom: 20,
    },
	  btnTextGoo: {   color: '#fff',
  fontWeight: 'bold',
  textAlign: 'center',
  fontSize: 16, },
    optionText: {
        fontSize: 18,
        color: "#ffffff",
    },
	    buttonText: {
        color: "#fff",
        fontWeight: "medium",
        fontSize: 18,
    },
});