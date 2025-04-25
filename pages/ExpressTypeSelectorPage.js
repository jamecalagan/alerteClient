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
  
	  <TouchableOpacity style={styles.button} onPress={() => goToExpress("logiciel")}>
		<Text style={styles.buttonText}>🖥 Dépannage système express</Text>
	  </TouchableOpacity>
  
	  <TouchableOpacity style={styles.button} onPress={() => goToExpress("reparation")}>
		<Text style={styles.buttonText}>🛠 Réparation matériel express</Text>
	  </TouchableOpacity>
  
	  <TouchableOpacity style={styles.button} onPress={() => goToExpress("video")}>
		<Text style={styles.buttonText}>🎬 Transfert vidéo</Text>
	  </TouchableOpacity>
  
	  <TouchableOpacity
		style={[styles.button, styles.secondaryButton]}
		onPress={() => navigation.navigate("ExpressListPage")}
	  >
		<Text style={styles.buttonText}>📄 Voir les fiches enregistrées</Text>
	  </TouchableOpacity>
  
	  <TouchableOpacity
		style={[styles.button, styles.secondaryButton]}
		onPress={() => navigation.navigate("BillingPage")}
	  >
		<Text style={styles.buttonText}>🧾 Créer une facture</Text>
	  </TouchableOpacity>
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
  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
  },
});

export default ExpressTypeSelectorPage;
