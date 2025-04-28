import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const ExpressListPage = () => {
  const [expressList, setExpressList] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [selectedItems, setSelectedItems] = useState([]); // 🆕
  const navigation = useNavigation();
  const [page, setPage] = useState(1); // page actuelle
  const [pageSize] = useState(10); // nombre d'éléments par page
  const [totalPages, setTotalPages] = useState(1); // nombre total de pages
  useEffect(() => {
	fetchExpressList(page);
  }, [page]);
  

  const fetchExpressList = async (currentPage = 1) => {
	const from = (currentPage - 1) * pageSize;
	const to = from + pageSize - 1;
  
	const { data: totalData, error: countError } = await supabase
	  .from("express")
	  .select("*", { count: "exact", head: true });
  
	if (countError) {
	  console.error("Erreur de récupération du total:", countError);
	  return;
	}
  
	const total = totalData?.length || 0;
	setTotalPages(Math.max(1, Math.ceil(total / pageSize)));
  
	const { data, error } = await supabase
	  .from("express")
	  .select("*")
	  .order("created_at", { ascending: false })
	  .range(from, to);
  
	if (error) {
	  console.error("Erreur de récupération des fiches:", error);
	} else {
	  setExpressList(data);
	}
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
      type: item.type,
    });
  };

  const toggleSelectItem = (id) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  const deleteSelectedItems = () => {
    if (selectedItems.length === 0) {
      alert("❌ Sélectionnez au moins une fiche à supprimer.");
      return;
    }

    Alert.alert(
      "Confirmation",
      `Supprimer ${selectedItems.length} fiche(s) sélectionnée(s) ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer", style: "destructive", onPress: async () => {
            const { error } = await supabase
              .from("express")
              .delete()
              .in("id", selectedItems);

            if (error) {
              console.error("Erreur suppression:", error);
              alert("Erreur lors de la suppression !");
            } else {
              alert("✅ Suppression réussie !");
              setSelectedItems([]);
              fetchExpressList();
            }
          }
        }
      ]
    );
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

      {selectedItems.length > 0 && (
        <TouchableOpacity style={styles.deleteSelectedButton} onPress={deleteSelectedItems}>
          <Text style={styles.deleteSelectedText}>🗑️ Supprimer la sélection ({selectedItems.length})</Text>
        </TouchableOpacity>
      )}

      {filteredList.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.card,
            selectedItems.includes(item.id) && { backgroundColor: "#d1e7dd" }, // ✅ fond vert clair si sélectionné
          ]}
          onPress={() => toggleSelectItem(item.id)}
        >
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
        </TouchableOpacity>
		
      ))}
	  <View style={styles.paginationRow}>
  <TouchableOpacity
    style={[styles.pageButton, page === 1 && styles.disabledButton]}
    onPress={() => page > 1 && setPage(page - 1)}
    disabled={page === 1}
  >
    <Text style={styles.pageButtonText}>⏪ Précédent</Text>
  </TouchableOpacity>

  <Text style={styles.pageIndicator}>
    Page {page} / {totalPages}
  </Text>

  <TouchableOpacity
    style={[styles.pageButton, page === totalPages && styles.disabledButton]}
    onPress={() => page < totalPages && setPage(page + 1)}
    disabled={page === totalPages}
  >
    <Text style={styles.pageButtonText}>Suivant ⏩</Text>
  </TouchableOpacity>
</View>

{/* Bouton retour déplacé clairement ici, juste après la pagination */}
<View style={{ alignItems: "center", marginTop: 20 }}>
  <TouchableOpacity
    style={styles.button}
    onPress={() => navigation.goBack()}
  >
    <Text style={styles.buttonText}>⬅ Retour</Text>
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
  deleteSelectedButton: {
    backgroundColor: "#dc3545",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 15,
  },
  deleteSelectedText: {
    color: "#fff",
    fontWeight: "bold",
  },
  card: {
    backgroundColor: "#dbdada",
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
  },
  deleteButton: {
    flex: 1,
    backgroundColor: "#c00",
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
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
    alignItems: "center",
  },
  invoiceText: {
    color: "#fff",
    fontWeight: "bold",
  },
  paginationRow: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  marginVertical: 20,
  gap: 10,
},

pageButton: {
  backgroundColor: "#296494",
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 6,
},

disabledButton: {
  backgroundColor: "#aaa",
},

pageButtonText: {
  color: "white",
  fontWeight: "bold",
  fontSize: 14,
},

pageIndicator: {
  fontSize: 14,
  fontWeight: "bold",
},
button: {
    backgroundColor: "#3e4c69",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
	width: "100%",
  },
  buttonText: {
    fontSize: 18,
    color: "#fff",
  },

});

export default ExpressListPage;
