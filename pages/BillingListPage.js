import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Button } from "react-native";
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
      .select("id, clientname, invoicenumber, invoicedate, totalttc")
      .order("invoicedate", { ascending: false });

    if (error) {
      console.error("Erreur de chargement des factures:", error);
    } else {
      setBills(data);
    }
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
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
		  <Button
  title="🖨️ Réimprimer"
  onPress={() => navigation.navigate("BillingEditPage", { id: bill.id, print: true })}
/>

            <Button
              title="✏️ Modifier"
              color="#555"
              onPress={() => navigation.navigate("BillingEditPage", { id: bill.id })}
            />
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
});

export default BillingListPage;
