import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";

const ExpressTypeSelectorPage = () => {
  const navigation = useNavigation();

  const goToExpress = (type) => {
    navigation.navigate("ExpressClientPage", { type });
  };

  return (
	<View style={styles.container}>
  <Text style={styles.title}>Choisir un type de fiche express</Text>

  {/* Groupe des boutons de création */}
  <View style={styles.creationGroup}>
    <TouchableOpacity style={styles.button} onPress={() => goToExpress("logiciel")}>
      <Text style={styles.buttonText}>🖥 Dépannage système express</Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.button} onPress={() => goToExpress("reparation")}>
      <Text style={styles.buttonText}>🛠 Réparation matériel express</Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.button} onPress={() => goToExpress("video")}>
      <Text style={styles.buttonText}>🎬 Transfert vidéo</Text>
    </TouchableOpacity>
  </View>

  {/* Séparateur */}
  <View style={styles.separator} />

  {/* Groupe des autres boutons */}
  <View style={styles.otherGroup}>
    <TouchableOpacity style={styles.secondaryButtonFiche} onPress={() => navigation.navigate("ExpressListPage")}>
      <Text style={styles.buttonTextFiche}>📄 Voir les fiches enregistrées</Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.secondaryButtonFact} onPress={() => navigation.navigate("BillingPage")}>
      <Text style={styles.buttonText}>🧾 Créer une facture</Text>
    </TouchableOpacity>
  </View>
</View>

  );
  
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
  },
  button: {
    backgroundColor: "#296494",
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  secondaryButtonFiche: {
    backgroundColor: "#f3ae54",
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  secondaryButtonFact: {
    backgroundColor: "#3a8f56",
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
  },
  buttonTextFiche: {
    color: "black",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
  },
  creationGroup: {
  marginBottom: 20,
},

separator: {
  height: 2,
  backgroundColor: "#ccc",
  marginVertical: 20,
  borderRadius: 5,
},

otherGroup: {
  gap: 10,
},

secondaryButton: {
  backgroundColor: "#555",
  padding: 12,
  borderRadius: 10,
  marginBottom: 10,
},
});

export default ExpressTypeSelectorPage;
