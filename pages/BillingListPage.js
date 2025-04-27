import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Button, Alert, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const BillingListPage = () => {
  const [bills, setBills] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 10; // 🔥 10 factures par page

  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchBills);
    return unsubscribe;
  }, [navigation, currentPage]);

  const fetchBills = async () => {
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
      .from("billing")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("Erreur de chargement des factures:", error);
    } else {
      setBills(data);
      setTotalPages(Math.max(1, Math.ceil((count || 0) / pageSize))); // 🔥 Corrige Page 1/0 ➔ minimum 1
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

      {/* 🔥 Pagination */}
      <View style={styles.pagination}>
        <TouchableOpacity
          style={[styles.pageButton, currentPage === 1 && { backgroundColor: "#ccc" }]}
          onPress={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
        >
          <Text style={styles.pageButtonText}>⏪ Précédent</Text>
        </TouchableOpacity>

        <Text style={styles.pageInfo}>
          Page {currentPage} / {totalPages}
        </Text>

        <TouchableOpacity
          style={[styles.pageButton, currentPage === totalPages && { backgroundColor: "#ccc" }]}
          onPress={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} 
          disabled={currentPage === totalPages}
        >
          <Text style={styles.pageButtonText}>Suivant ⏩</Text>
        </TouchableOpacity>
      </View>
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
  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    gap: 10,
  },
  pageButton: {
    backgroundColor: "#007bff",
    padding: 10,
    borderRadius: 8,
  },
  pageButtonText: {
    color: "#fff",
    fontSize: 18,
  },
  pageInfo: {
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default BillingListPage;
