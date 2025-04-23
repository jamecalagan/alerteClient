import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const ExpressClientPage = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const type = route.params?.type || "reparation";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [device, setDevice] = useState("");
  const [description, setDescription] = useState(type === "video" ? " Transfert vidéo d'anciennes cassettes" : "");

  const [price, setPrice] = useState("");
  const [cassettecount, setCassetteCount] = useState("");
  const [cassettetype, setCassetteType] = useState("");
  const [outputtype, setOutputType] = useState("");
  const [softwaretype, setSoftwareType] = useState("");

  const handleSubmit = async () => {
    if (!name || !phone || !price || (type === "reparation" && (!device || !description)) || (type === "logiciel" && (!softwaretype || !description)) || (type === "video" && (!cassettecount || !cassettetype || !outputtype))) {
      alert("Merci de remplir tous les champs obligatoires selon le type de prestation.");
      return;
    }

    const { data, error } = await supabase.from("express").insert([
      {
        name,
        phone,
        type,
        device,
        description,
        price,
        cassettecount,
        cassettetype,
        outputtype,
        softwaretype,
        created_at: new Date(),
      },
    ]).select();

    if (data) {
      navigation.navigate("PrintExpressPage", {
        id: data[0].id,
        name,
        phone,
        device,
        description,
        price,
        date: new Date().toLocaleDateString(),
        type,
        cassettecount,
        cassettetype,
        outputtype,
        softwaretype,
      });
    } else {
      alert("Erreur lors de l'enregistrement : " + error.message);
    }
  };


  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Fiche Express - {type === "logiciel" ? "Dépannage système" : type === "video" ? "Transfert vidéo" : "Réparation matériel"}</Text>

      <TextInput style={styles.input} placeholder="Nom" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      {type === "reparation" && (
        <>
          <TextInput style={styles.input} placeholder="Matériel" value={device} onChangeText={setDevice} />
          <TextInput style={styles.textArea} placeholder="Description du problème" value={description} onChangeText={setDescription} multiline />
        </>
      )}

      {type === "logiciel" && (
        <>
          <Text style={styles.label}>Type de dépannage :</Text>
          <TouchableOpacity style={styles.radioOption} onPress={() => setSoftwareType("Installation")}> 
            <Text>{softwaretype === "Installation" ? "🔘" : "⚪"} Installation</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.radioOption} onPress={() => setSoftwareType("Maintenance")}> 
            <Text>{softwaretype === "Maintenance" ? "🔘" : "⚪"} Maintenance</Text>
          </TouchableOpacity>
          <TextInput style={styles.textArea} placeholder="Détails" value={description} onChangeText={setDescription} multiline />
        </>
      )}

      {type === "video" && (
        <>
          <TextInput style={styles.textArea} placeholder="Prestation: Transfert vidéo d'anciennes cassettes'" value={description} onChangeText={setDescription} multiline />
          <TextInput style={styles.input} placeholder="Nombre de cassettes" value={cassettecount} onChangeText={setCassetteCount} keyboardType="numeric" />
          <Text style={styles.label}>Type de cassette :</Text>
          {["VHS", "Hi8", "DV"].map((type) => (
            <TouchableOpacity key={type} style={styles.radioOption} onPress={() => setCassetteType(type)}>
              <Text>{cassettetype === type ? "🔘" : "⚪"} {type}</Text>
            </TouchableOpacity>
          ))}

          <Text style={styles.label}>Support souhaité :</Text>
          {["Clé USB", "CD", "DVD", "Disque dur"].map((output) => (
            <TouchableOpacity key={output} style={styles.radioOption} onPress={() => setOutputType(output)}>
              <Text>{outputtype === output ? "🔘" : "⚪"} {output}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}

      <TextInput style={styles.input} placeholder="Montant (€)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

      <Button title="Imprimer la fiche" onPress={handleSubmit} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 20 },
  input: { borderWidth: 1, borderColor: "#ccc", padding: 10, marginBottom: 15, borderRadius: 5 },
  textArea: { borderWidth: 1, borderColor: "#ccc", padding: 10, marginBottom: 15, borderRadius: 5, height: 100, textAlignVertical: "top" },
  label: { fontWeight: "bold", marginTop: 10 },
  radioOption: { flexDirection: "row", alignItems: "center", marginVertical: 5 },
});

export default ExpressClientPage;