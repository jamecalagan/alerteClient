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

export default function ExpressVideoPage() {
  const navigation = useNavigation();
  const route = useRoute();

  const isEdit = route.params?.isEdit || false;
  const editData = route.params?.expressData || {};
const [isPaid, setIsPaid] = useState(
  editData?.paid === true || editData?.paymentStatus === "paid"
);

  const [searchText, setSearchText] = useState(editData.name || "");
  const [filteredClients, setFilteredClients] = useState([]);
  const [name, setName] = useState(editData.name || "");
  const [phone, setPhone] = useState(editData.phone || "");
  const [description, setDescription] = useState(editData.description || "Transfert d’anciennes cassettes vidéo");
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
  const [supportFournis, setSupportFournis] = useState(editData.support_fournis === true);

  useEffect(() => {
    if (isEdit && editData.price && editData.cassettecount) {
      const cassetteTotal = editData.cassettecount
        .split(", ")
        .reduce((acc, val) => acc + parseInt(val), 0);

      let correctedPrice = parseFloat(editData.price || 0);

      const isSupportFournis = editData.support_fournis === true || editData.support_fournis === "true";

      if (isSupportFournis && editData.outputtype === "Clé USB") correctedPrice -= 20;
      if (isSupportFournis && editData.outputtype === "Disque dur") correctedPrice -= 45;

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

  const calculateFinalPrice = () => {
    let totalCassettes = 0;
    Object.values(cassetteCounts).forEach((val) => {
      const count = parseInt(val);
      if (!isNaN(count)) totalCassettes += count;
    });
    let basePrice = parseFloat(unitPrice || 0) * totalCassettes;

    if (supportFournis) {
      if (outputtype === "Clé USB") basePrice += 20;
      if (outputtype === "Disque dur") basePrice += 45;
    }

    return basePrice.toFixed(2);
  };

  const handleSubmit = async () => {
    if (!name || !phone || !description || !unitPrice) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs obligatoires.");
      return;
    }

    const cassetteSummary = Object.entries(cassetteCounts)
      .filter(([_, count]) => parseInt(count))
      .map(([type, count]) => `${count} ${type}`)
      .join(", ");

    const finalPrice = calculateFinalPrice();

const updateData = {
  name,
  phone,
  type: "video",
  description,
  price: finalPrice,
  cassettecount: cassetteSummary,
  cassettetype: "multiple",
  outputtype,
  support_fournis: supportFournis,
  paid: isPaid,                 // ← ajout essentiel
  // paymentStatus: isPaid ? "paid" : "unpaid", // ← dé-commente si tu utilises une chaîne
};

    const supportLabel =
      supportFournis && (outputtype === "Clé USB" || outputtype === "Disque dur")
        ? `${outputtype} (fourni par la boutique +${outputtype === "Clé USB" ? "20" : "45"}€)`
        : outputtype;

    if (isEdit && editData.id) {
      const { error } = await supabase
        .from("express")
        .update(updateData)
        .eq("id", editData.id);

      if (error) {
        Alert.alert("Erreur", error.message);
        return;
      }

      Alert.alert("✅", "Fiche modifiée avec succès.");
      navigation.goBack();
    } else {
      const { data, error } = await supabase
        .from("express")
        .insert([{ ...updateData, created_at: new Date() }])
        .select("id");

      if (error) {
        Alert.alert("Erreur", error.message);
        return;
      }

      const insertedId = data?.[0]?.id;

      navigation.navigate("PrintExpressPage", {
        id: insertedId,
        name,
        phone,
        type: "video",
        description,
        price: finalPrice,
        cassettecount: cassetteSummary,
        cassettetype: "multiple",
        outputtype,
        support_fournis: supportFournis,
        supportLabel,
        date: new Date().toLocaleDateString(),
      });
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
        data={searchText.length >= 2 ? filteredClients : []}
        keyExtractor={(item, index) => index.toString()}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>Fiche Express - Vidéo {isEdit && "(modification)"}</Text>

            <Text style={styles.label}>Nom ou téléphone</Text>
            <TextInput
              style={styles.input}
              value={searchText}
              onChangeText={filterClients}
            />
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => handleSelectClient(item)} style={{ width: "100%" }}>
            <Text style={styles.suggestionItem}>{item.name} - {item.phone}</Text>
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
    <Text style={[styles.label, { marginBottom: 2, marginTop: 6 }]}>Nombre de {key}</Text>
    <TextInput
      style={[styles.input, { marginBottom: 6 }]}
      keyboardType="numeric"
      value={cassetteCounts[key]}
      onChangeText={(val) => setCassetteCounts({ ...cassetteCounts, [key]: val })}
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
                style={[styles.supportOption, outputtype === option && styles.supportSelected]}
                onPress={() => setOutputtype(option)}
              >
                <Text>{outputtype === option ? "✅ " : "▫️ "}{option}</Text>
              </TouchableOpacity>
            ))}

            {(outputtype === "Clé USB" || outputtype === "Disque dur") && (
              <TouchableOpacity onPress={() => setSupportFournis(!supportFournis)} style={{ marginTop: 10 }}>
                <Text>{supportFournis ? "☑️" : "⬜"} Support fourni par la boutique</Text>
              </TouchableOpacity>
            )}
{/* Statut de paiement */}
<View style={{ marginTop: 14, marginBottom: 6 }}>
  <Text style={styles.label}>Facture réglée</Text>
  <TouchableOpacity
    onPress={() => setIsPaid(!isPaid)}
    style={{
      padding: 10,
      borderWidth: 1,
      borderColor: "#aaa",
      borderRadius: 8,
      backgroundColor: isPaid ? "#d4edda" : "#f8d7da",
      alignItems: "center",
    }}
  >
    <Text style={{ fontWeight: "600" }}>
      {isPaid ? "✅ Oui, marquer comme réglée" : "⬜ Non, encore due"}
    </Text>
  </TouchableOpacity>
</View>

            <Text style={styles.label}>Montant total calculé : {calculateFinalPrice()} €</Text>

{/*             <TouchableOpacity style={styles.button} onPress={handleSubmit}>
              <Text style={styles.buttonText}>{isEdit ? "💾 Enregistrer" : "🖋️ Faire signer la fiche"}</Text>
            </TouchableOpacity> */}
<View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 20 }}>
  <TouchableOpacity
    onPress={() => navigation.goBack()}
    style={[styles.button, { flex: 1, backgroundColor: "#6c757d", marginRight: 8 }]}
  >
    <Text style={styles.buttonText}>⬅️ Retour</Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={handleSubmit}
    style={[styles.button, { flex: 1, backgroundColor: "#007bff", marginLeft: 8 }]}
  >
    <Text style={styles.buttonText}>💾 Enregistrer</Text>
  </TouchableOpacity>
  {isEdit && editData?.id && (
  <TouchableOpacity
    onPress={async () => {
      const { error } = await supabase
        .from("express")
        .update({ paid: !isPaid })
        .eq("id", editData.id);
      if (error) {
        Alert.alert("Erreur", error.message);
      } else {
        setIsPaid(!isPaid);
        Alert.alert("OK", `Fiche ${!isPaid ? "marquée réglée" : "remise en dû"}.`);
      }
    }}
    style={[styles.button, { backgroundColor: isPaid ? "#6c757d" : "#28a745" }]}
  >
    <Text style={styles.buttonText}>
      {isPaid ? "💱 Remettre en dû" : "✅ Marquer comme réglée"}
    </Text>
  </TouchableOpacity>
)}
</View>

          </View>
        }
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
  marginTop: 10, // tu peux réduire à 6 si tu veux encore moins
  color: "#333",
},
input: {
  borderWidth: 1,
  borderColor: "#ccc",
  borderRadius: 6,
  padding: 8,
  marginBottom: 10, // réduit ici aussi si besoin
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
});
