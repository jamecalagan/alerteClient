import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  TextInput,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import * as Print from "expo-print";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Liste des fiches de contrôle avec :
 *  • recherche par nom ou téléphone
 *  • suggestions cliquables (auto‑complétion)
 *  • historique des 5 dernières recherches (cliquables)
 */
export default function CheckupListPage() {
  const [checkups, setCheckups] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [searchHistory, setSearchHistory] = useState([]); // max 5 entrées
  const navigation = useNavigation();

  /* -------------------------------------------------- */
  /* Chargement des fiches                              */
  /* -------------------------------------------------- */
useFocusEffect(
  React.useCallback(() => {
    fetchCheckups();
  }, [])
);


  const fetchCheckups = async () => {
    const { data, error } = await supabase
      .from("checkup_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      Alert.alert("Erreur", "Impossible de charger les fiches.");
    } else {
      setCheckups(data);
      setFiltered(data);
    }
  };

  /* -------------------------------------------------- */
  /* Recherche + suggestions                            */
  /* -------------------------------------------------- */
  const addToHistory = (query) => {
    if (!query) return;
    setSearchHistory((prev) => {
      const exist = prev.find((q) => q.toLowerCase() === query.toLowerCase());
      if (exist) return prev; // déjà présent
      return [query, ...prev].slice(0, 5); // max 5 entrées
    });
  };

  const handleSearch = (text) => {
    setSearch(text);

    if (text.trim() === "") {
      setFiltered(checkups);
      return;
    }

    const lower = text.toLowerCase();
    const results = checkups.filter(
      (item) =>
        item.client_name.toLowerCase().includes(lower) ||
        item.client_phone.toLowerCase().includes(lower)
    );
    setFiltered(results);
  };

  const onSelectSuggestion = (query) => {
    setSearch(query);
    handleSearch(query);
    addToHistory(query);
  };

  /* -------------------------------------------------- */
  /* Impression                                         */
  /* -------------------------------------------------- */
  const reprint = async (item) => {
    const html = `
      <html>
        <head><style>
          body { font-family: Arial; font-size: 12px; padding: 20px; }
          h1 { text-align: center; font-size: 18px; }
          table { width: 100%; border-collapse: collapse; }
          td, th { border: 1px solid #000; padding: 4px; }
          .signature { margin-top: 20px; }
        </style></head>
        <body>
          <h1>Fiche de Contrôle - ${item.product_type}</h1>
          <p><strong>Client :</strong> ${item.client_name}</p>
          <p><strong>Téléphone :</strong> ${item.client_phone}</p>
          <p><strong>Date :</strong> ${item.client_date}</p>
          <table>
            <tr><th>Composant</th><th>État</th></tr>
            ${Object.entries(item.components || {})
              .map(([key, val]) => `<tr><td>${key}</td><td>${val}</td></tr>`)
              .join("")}
          </table>
          <p><strong>Remarques :</strong> ${item.remarks}</p>
          <div class="signature">
            <strong>Signature :</strong><br/>
            ${item.signature ? `<img src="${item.signature}" width="200" height="80" />` : "Non signée"}
          </div>
        </body>
      </html>
    `;
    const { uri } = await Print.printToFileAsync({ html });
    await Print.printAsync({ uri });
  };

  /* -------------------------------------------------- */
  /* Item de liste                                      */
  /* -------------------------------------------------- */
  const renderItem = ({ item }) => (
<View>
  <View style={styles.itemContainer}>
    <View style={{ flex: 1 }}>
      <Text style={styles.name}>{item.client_name}</Text>
      <Text>
        {item.product_type} – {item.client_date}
      </Text>
    </View>
    <TouchableOpacity onPress={() => reprint(item)} style={styles.iconButton}>
      <Image source={require("../assets/icons/print.png")} style={styles.icon} />
    </TouchableOpacity>
    <TouchableOpacity
      onPress={() =>
        navigation.navigate("CheckupPage", {
          isEdit: true,
          checkup: item,
        })
      }
      style={styles.iconButton}
    >
      <Image source={require("../assets/icons/edit.png")} style={styles.icon} />
    </TouchableOpacity>
  </View>
  <View style={styles.separator} />
</View>

  );

  /* -------------------------------------------------- */
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fiches de contrôle enregistrées</Text>

      {/* Barre de recherche */}
      <TextInput
        placeholder="🔍 Rechercher par nom ou téléphone"
        style={styles.searchInput}
        value={search}
        onChangeText={handleSearch}
      />

      {/* Suggestions / historique */}
      {(search.length > 0 ? filtered.slice(0, 6) : searchHistory).length > 0 && (
        <ScrollView
          style={styles.suggestionsBox}
          keyboardShouldPersistTaps="handled"
        >
          {(search.length > 0 ? filtered.slice(0, 6) : searchHistory).map(
            (item, idx) => {
              // item est un objet checkup si search, sinon string dans l'historique
              const key = search.length > 0 ? item.id : `h-${idx}`;
              const label =
                search.length > 0
                  ? `${item.client_name} – ${item.client_phone}`
                  : item;
              return (
                <TouchableOpacity key={key} onPress={() => onSelectSuggestion(label)}>
                  <Text style={styles.suggestionText}>{label}</Text>
                </TouchableOpacity>
              );
            }
          )}
        </ScrollView>
      )}

      {/* Liste */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 5,
  },
  suggestionsBox: {
    maxHeight: 160,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 10,
  },
  suggestionText: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemContainer: {
    flexDirection: "row",
    backgroundColor: "#f1f1f1",
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  name: { fontWeight: "bold", fontSize: 16 },
  iconButton: {
    marginLeft: 10,
    backgroundColor: "#007bff",
    padding: 6,
    borderRadius: 8,
  },
  icon: { width: 20, height: 20, tintColor: "#fff" },
  separator: {
  height: 1,
  backgroundColor: "#ccc",
  marginVertical: 8,
},

});
