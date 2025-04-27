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

  <View style={styles.creationRow}>
  <TouchableOpacity
    style={[styles.squareButton, { backgroundColor: "#007bff" }]}
    onPress={() => goToExpress("logiciel")}
  >
    <Text style={styles.buttonIcon}>🖥</Text>
    <Text style={styles.buttonLabel}>Dépannage</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.squareButton, { backgroundColor: "#28a745" }]}
    onPress={() => goToExpress("reparation")}
  >
    <Text style={styles.buttonIcon}>🛠</Text>
    <Text style={styles.buttonLabel}>Réparation</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.squareButton, { backgroundColor: "#ffc107" }]}
    onPress={() => goToExpress("video")}
  >
    <Text style={styles.buttonIcon}>🎬</Text>
    <Text style={styles.buttonLabel}>Vidéo</Text>
  </TouchableOpacity>
</View>

<View style={styles.separator} />

<View style={styles.otherGroup}>
  <TouchableOpacity
    style={[styles.longButton, { backgroundColor: "#f3ae54" }]}
    onPress={() => navigation.navigate("ExpressListPage")}
  >
    <Text style={styles.buttonTextFiche}>📄 Voir les fiches enregistrées</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.longButton, { backgroundColor: "#3a8f56" }]}
    onPress={() => navigation.navigate("BillingPage")}
  >
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
  color: "#fff",
  fontWeight: "bold",
  fontSize: 16,
},
buttonTextFiche: {
  color: "#000",
  fontWeight: "bold",
  fontSize: 16,
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
  alignItems: "center",
  gap: 15,
},

secondaryButton: {
  backgroundColor: "#555",
  padding: 12,
  borderRadius: 10,
  marginBottom: 10,
},
creationRow: {
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
  gap: 20,
  marginBottom: 20,
},

squareButton: {
  width: 90, // largeur carrée
  height: 90,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
},
buttonIcon: {
  fontSize: 26,
  marginBottom: 5,
},

buttonLabel: {
  fontSize: 12,
  fontWeight: "bold",
  color: "white",
  textAlign: "center",
},
longButton: {
  width: 310, // la somme de (90 * 3 + 2 gaps de 20px) = 310px !
  paddingVertical: 16,
  borderRadius: 12,
  alignItems: "center",
},

});

export default ExpressTypeSelectorPage;
