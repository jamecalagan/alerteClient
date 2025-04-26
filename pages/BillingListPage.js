import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Button, Alert, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const BillingListPage = () => {
  const [bills, setBills] = useState([]);
  const navigation = useNavigation();

  useEffect(() => {
	const unsubscribe = navigation.addListener('focus', fetchBills);
	return unsubscribe;
  }, [navigation]);
  

  const fetchBills = async () => {
	const { data, error } = await supabase
	  .from("billing")
	  .select("*") // ← on récupère TOUT maintenant
	  .order("created_at", { ascending: false });
  
	if (error) {
	  console.error("Erreur de chargement des factures:", error);
	} else {
	  setBills(data);
	}
  };
  const deleteBill = async (id) => {
	Alert.alert(
	  "Confirmation",
	  "Êtes-vous sûr de vouloir supprimer cette facture ?",
	  [
		{ text: "Annuler", style: "cancel" },
		{ text: "Supprimer", style: "destructive", onPress: async () => {
		  const { error } = await supabase.from("billing").delete().eq("id", id);
		  if (error) {
			console.error("Erreur de suppression:", error);
			alert("Erreur lors de la suppression !");
		  } else {
			alert("✅ Facture supprimée");
			fetchBills();
		  }
		}},
	  ]
	);
  };
  
  

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Factures enregistrées</Text>
      {bills.map((bill) => (
        <View key={bill.id} style={styles.card}>
          <Text style={styles.label}>Client : {bill.clientname}</Text>
          <Text style={styles.label}>Facture N° : {bill.invoicenumber}</Text>
          <Text style={styles.label}>Date : {new Date(bill.invoicedate).toLocaleDateString()}</Text>
          <Text style={styles.label}>Total TTC : {parseFloat(bill.totalttc).toFixed(2)} €</Text>
		  <View style={styles.buttonRow}>
  <TouchableOpacity style={[styles.button, { backgroundColor: "#007bff" }]} onPress={() => navigation.navigate("BillingEditPage", { id: bill.id, print: true })}>
    <Text style={styles.buttonText}>🖨️ Imprimer</Text>
  </TouchableOpacity>
  <TouchableOpacity style={[styles.button, { backgroundColor: "#555" }]} onPress={() => navigation.navigate("BillingEditPage", { id: bill.id })}>
    <Text style={styles.buttonText}>✏️ Modifier</Text>
  </TouchableOpacity>
  <TouchableOpacity style={[styles.button, { backgroundColor: "#dc3545" }]} onPress={() => deleteBill(bill.id)}>
    <Text style={styles.buttonText}>🗑️ Supprimer</Text>
  </TouchableOpacity>
</View>


        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    marginBottom: 4,
  },
  buttonRow: {
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
  marginTop: 10,
  gap: 10,
},
button: {
  flex: 1,
  paddingVertical: 10,
  borderRadius: 8,
  alignItems: "center",
},
buttonText: {
  color: "#fff",
  fontWeight: "bold",
  fontSize: 12,
},

});

export default BillingListPage;
