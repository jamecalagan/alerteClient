import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const ExpressListPage = () => {
  const [expressList, setExpressList] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const navigation = useNavigation();

  useEffect(() => {
    fetchExpressList();
  }, []);

  const fetchExpressList = async () => {
    const { data, error } = await supabase
      .from("express")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error) setExpressList(data);
    else console.error("Erreur de récupération:", error);
  };

  const filteredList = expressList.filter((item) => {
    const matchesSearch = `${item.name} ${item.phone}`.toLowerCase().includes(searchText.toLowerCase());
    const matchesType = filterType === "all" || item.type === filterType;
    return matchesSearch && matchesType;
  });

  const goToPrint = (item) => {
    navigation.navigate("PrintExpressPage", {
      name: item.name,
      phone: item.phone,
      device: item.device,
      description: item.description,
      price: item.price,
      date: new Date(item.created_at).toLocaleDateString(),
      signature: item.signature,
      cassettecount: item.cassettecount,
      cassettetype: item.cassettetype,
      outputtype: item.outputtype,
      softwaretype: item.softwaretype,
      type: item.type
    });
  };

  const handleDelete = async (id) => {
    Alert.alert(
      "Confirmation",
      "Souhaitez-vous vraiment supprimer cette fiche ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("express").delete().eq("id", id);
            if (error) {
              Alert.alert("Erreur", "La suppression a échoué.");
            } else {
              fetchExpressList();
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Fiches Dépannage Express</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Recherche nom ou téléphone"
        value={searchText}
        onChangeText={setSearchText}
      />

      <View style={styles.filterRow}>
        {['all', 'reparation', 'logiciel', 'video'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterButton, filterType === type && styles.filterActive]}
            onPress={() => setFilterType(type)}
          >
            <Text style={styles.filterText}>{type === 'all' ? 'Tous' : type}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredList.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.details}>📞 {item.phone}</Text>
          <Text style={styles.details}>💶 {item.price} €</Text>
          <Text style={styles.details}>🕒 {new Date(item.created_at).toLocaleString()}</Text>
          <Text style={styles.details}>📂 Type : {item.type}</Text>

          {item.device ? <Text style={styles.details}>🖥️ Matériel : {item.device}</Text> : null}
          {item.description ? <Text style={styles.details}>📝 {item.description}</Text> : null}
          {item.softwaretype ? <Text style={styles.details}>🧰 Dépannage : {item.softwaretype}</Text> : null}
          {item.cassettecount ? (
            <>
              <Text style={styles.details}>📼 Cassettes : {item.cassettecount} x {item.cassettetype}</Text>
              <Text style={styles.details}>💾 Support : {item.outputtype}</Text>
            </>
          ) : null}

		  <View style={styles.buttonRow}>
  <TouchableOpacity style={styles.printButton} onPress={() => goToPrint(item)}>
    <Text style={styles.printText}>🖨️ Imprimer</Text>
  </TouchableOpacity>

  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item.id)}>
    <Text style={styles.deleteText}>🗑️ Supprimer</Text>
  </TouchableOpacity>

  <TouchableOpacity style={styles.invoiceButton} onPress={() => navigation.navigate('BillingPage', { expressData: item })}>
    <Text style={styles.invoiceText}>🧾 Imprimer facture</Text>
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
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 8,
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#ddd",
  },
  filterActive: {
    backgroundColor: "#296494",
  },
  filterText: {
    color: "#fff",
    fontWeight: "bold",
    textTransform: "capitalize",
  },
  card: {
    backgroundColor: "#f2f2f2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  name: {
    fontSize: 18,
    fontWeight: "bold",
  },
  details: {
    fontSize: 14,
    marginTop: 2,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 10,
  },
  printButton: {
    flex: 1,
    backgroundColor: "#2c7",
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
    marginRight: 5,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: "#c00",
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
    marginLeft: 5,
  },
  printText: {
    color: "white",
    fontWeight: "bold",
  },
  deleteText: {
    color: "white",
    fontWeight: "bold",
  },
  invoiceButton: {
  backgroundColor: "#007bff",
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 8,
},
invoiceText: {
  color: "#fff",
  fontWeight: "bold",
},
});

export default ExpressListPage;