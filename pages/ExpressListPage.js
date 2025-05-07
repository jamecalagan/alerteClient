import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import { useCallback } from 'react';
const ExpressListPage = () => {
  const [expressList, setExpressList] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [selectedItems, setSelectedItems] = useState([]);
  const navigation = useNavigation();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [totalPages, setTotalPages] = useState(1);
  const [focusedField, setFocusedField] = useState(null);

  useFocusEffect(
	useCallback(() => {
	  fetchExpressList(page);
	}, [page])
  );
  useEffect(() => {
    fetchExpressList(page);
  }, [page]);

  const fetchExpressList = async (currentPage = 1) => {
	console.log("🧾 Liste Express avec billing :", data);
	console.log("🧾 Express avec billing lié :", JSON.stringify(data, null, 2));
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

	const { data, error, count } = await supabase
	.from("express")
	.select("*, billing:billing(*)")
	.order("created_at", { ascending: false })
	.range(from, to);

    if (error) {
      console.error("Erreur récupération:", error);
    } else {
      setExpressList(data);
      setTotalPages(Math.max(1, Math.ceil((count || 0) / pageSize)));
    }
  };

  const filteredList = expressList.filter((item) => {
    const matchesSearch = `${item.name} ${item.phone}`
      .toLowerCase()
      .includes(searchText.toLowerCase());
    const matchesType = filterType === "all" || item.type === filterType;
    return matchesSearch && matchesType;
  });

  const toggleSelectItem = (id) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter((itemId) => itemId !== id));
    } else {
      setSelectedItems([id]); // une seule sélection à la fois
    }
  };

  const handleDelete = (id) => {
    Alert.alert("Confirmation", "Supprimer cette fiche ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await supabase.from("express").delete().eq("id", id);
          fetchExpressList();
          setSelectedItems([]);
        },
      },
    ]);
  };

  const selectedItem = expressList.find((i) => i.id === selectedItems[0]);

  const goToPrint = (item) => {
    navigation.navigate("PrintExpressPage", { ...item });
  };

  const goToInvoice = (item) => {
    navigation.navigate("BillingPage", { expressData: item });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Fiches Dépannage Express</Text>

	  <View style={{ marginBottom: 16 }}>
  <Text
    style={[
      styles.floatingLabel,
      (focusedField === "search" || searchText) && styles.floatingLabelFocused,
    ]}
  >
    Rechercher un client ou téléphone
  </Text>

  <TextInput
    value={searchText}
    onChangeText={setSearchText}
    onFocus={() => setFocusedField("search")}
    onBlur={() => setFocusedField(null)}
    style={[
      styles.searchInput,
      focusedField === "search" && styles.searchInputFocused,
    ]}
    placeholder=""
  />
</View>


      <View style={styles.filterRow}>
        {["all", "reparation", "logiciel", "video"].map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.filterButton,
              filterType === type && styles.filterActive,
            ]}
            onPress={() => setFilterType(type)}
          >
            <Text style={styles.filterText}>
              {type === "all" ? "Tous" : type}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* En-têtes tableau */}
	  <View style={styles.headerRow}>
  <Text style={[styles.headerCell, styles.headerBorder]}>Nom</Text>
  <Text style={[styles.headerCell, styles.headerBorder]}>Téléphone</Text>
  <Text style={[styles.headerCell, styles.headerBorder]}>Date</Text>
  <Text style={[styles.headerCell, styles.headerBorder]}>Type</Text>
  <Text style={styles.headerCell}>Prix</Text>
</View>
	  <View style={styles.headerSeparator} />
      {/* Lignes tableau */}
      {filteredList.map((item) => (
        <TouchableOpacity
          key={item.id}
          onPress={() => toggleSelectItem(item.id)}
          style={[
            styles.tableRow,
            selectedItems.includes(item.id) && styles.rowSelected,
          ]}
        >
          <Text style={styles.cell}>{item.name}</Text>
          <Text style={styles.cell}>{item.phone}</Text>
          <Text style={styles.cell}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
          <Text style={styles.cell}>{item.type}</Text>
          <Text style={styles.cell}>{item.price} €</Text>
        </TouchableOpacity>
      ))}

      {/* Boutons d'action */}
      {selectedItem && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: "#28a745" }]}
            onPress={() => goToPrint(selectedItem)}
          >
            <Text style={styles.buttonText}>🖨️ Imprimer</Text>
          </TouchableOpacity>

		  {selectedItem.billing && selectedItem.billing.length > 0 ? (
  // facture déjà créée
  <TouchableOpacity
    style={[styles.actionButton, { backgroundColor: "#ccc", opacity: 0.6 }]}
    disabled={true}
  >
    <Text style={[styles.buttonText, { color: "#666" }]}>
      ✅ Facture déjà créée
    </Text>
  </TouchableOpacity>
) : (
  // bouton actif
  <TouchableOpacity
    style={[styles.actionButton, { backgroundColor: "#007bff" }]}
    onPress={() =>
      navigation.navigate("BillingPage", {
        expressData: {
          express_id: selectedItem.id,
          clientname: selectedItem.name,
          clientphone: selectedItem.phone,
          product: selectedItem.product,
          brand: selectedItem.brand,
          model: selectedItem.model,
          price: selectedItem.price,
          description: selectedItem.description,
          acompte: selectedItem.acompte,
          paymentmethod: selectedItem.paymentmethod,
          serial: selectedItem.serial,
          paid: selectedItem.paid,
          type: "express",
        },
      })
    }
  >
    <Text style={styles.buttonText}>🧾 Facturer</Text>
  </TouchableOpacity>
)}






          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: "#dc3545" }]}
            onPress={() => handleDelete(selectedItem.id)}
          >
            <Text style={styles.buttonText}>🗑️ Supprimer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pagination */}
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
          style={[
            styles.pageButton,
            page === totalPages && styles.disabledButton,
          ]}
          onPress={() => page < totalPages && setPage(page + 1)}
          disabled={page === totalPages}
        >
          <Text style={styles.pageButtonText}>Suivant ⏩</Text>
        </TouchableOpacity>
      </View>

      {/* Retour */}
      <TouchableOpacity
        style={styles.returnButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.buttonText}>⬅ Retour</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
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
tableRow: {
  flexDirection: "row",
  borderBottomWidth: 1,
  borderBottomColor: "#ddd", // plus discret mais visible
  paddingVertical: 10,
  paddingHorizontal: 5,
},
headerBorder: {
  borderRightWidth: 1,
  borderRightColor: "#ccc",
},
headerRow: {
  flexDirection: "row",
  backgroundColor: "#d4d4d4",
  borderRadius: 6,
  paddingVertical: 10,
  marginBottom: 4,
  borderWidth: 1,
  borderColor: "#ccc",
},
headerSeparator: {
  height: 2,
  backgroundColor: "#888", // gris foncé pour bien séparer
  marginBottom: 6,
},
headerCell: {
  flex: 1,
  textAlign: "center",
  fontWeight: "bold",
  fontSize: 14,
  color: "#333",
},
  cellHeader: {
    flex: 1,
    fontWeight: "bold",
    textAlign: "center",
    color: "#444",
  },
  cell: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
  },
  rowSelected: {
    backgroundColor: "#d1e7dd",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
    marginBottom: 10,
  },
  actionButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 30,
    gap: 10,
  },
  pageButton: {
    backgroundColor: "#296494",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  disabledButton: {
    backgroundColor: "#aaa",
  },
  pageButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  pageIndicator: {
    fontWeight: "bold",
    fontSize: 14,
    paddingHorizontal: 10,
  },
  returnButton: {
    backgroundColor: "#3e4c69",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  floatingLabel: {
  position: "absolute",
  left: 10,
  top: 12,
  fontSize: 14,
  color: "#888",
  zIndex: 1,
},

floatingLabelFocused: {
  top: -10,
  left: 8,
  fontSize: 12,
  color: "#007bff",
  backgroundColor: "#eef6ff",
  paddingHorizontal: 5,
  borderRadius: 4,
},

searchInputFocused: {
  height: 55,
  fontSize: 18,
  backgroundColor: "#eef6ff",
  borderColor: "#007bff",
},

});

export default ExpressListPage;
