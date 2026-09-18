import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  StatusBar,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import * as Print from "expo-print";
import { useFocusEffect } from "@react-navigation/native";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";

/**
 * Liste des fiches de contrôle avec:
 *  •recherche par nom ou téléphone
 *  •suggestions cliquables (auto‑complétion)
 *  •historique des 5 dernières recherches (cliquables)
 */
export default function CheckupListPage() {
  const [checkups, setCheckups] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [searchHistory, setSearchHistory] = useState([]); // max 5 entrées
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
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
      setAlertTitle("Erreur");
      setAlertMessage("Impossible de charger les fiches.");
      setAlertVisible(true);
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
        (item.client_name || "").toLowerCase().includes(lower) ||
        (item.client_phone || "").toLowerCase().includes(lower)
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
    <TouchableOpacity
      onPress={() => reprint(item)}
      style={[styles.iconButton, styles.iconButtonPrint]}
    >
      <Image
        source={require("../assets/icons/print.png")}
        style={[styles.icon, styles.iconPrint]}
      />
    </TouchableOpacity>
    <TouchableOpacity
      onPress={() =>
        navigation.navigate("CheckupPage", {
          isEdit: true,
          checkup: item,
        })
      }
      style={[styles.iconButton, styles.iconButtonEdit]}
    >
      <Image
        source={require("../assets/icons/edit.png")}
        style={[styles.icon, styles.iconEdit]}
      />
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

      <BackButton onPress={() => navigation.goBack()} style={{ marginTop: 12 }} />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 20 + (StatusBar.currentHeight || 0),
    backgroundColor: "#eef2ff",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
    color: "#0f172a",
  },
  searchInput: {
    borderWidth: 1.5,
    borderColor: "#c7d2fe",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 10,
    marginBottom: 5,
    color: "#0f172a",
  },
  suggestionsBox: {
    maxHeight: 160,
    borderWidth: 1.5,
    borderColor: "#c7d2fe",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    marginBottom: 10,
  },
  suggestionText: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e7ff",
    color: "#0f172a",
  },
  itemContainer: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    padding: 10,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e0e7ff",
    shadowColor: "#312e81",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  name: { fontWeight: "bold", fontSize: 16, color: "#0f172a" },
  iconButton: {
    marginLeft: 10,
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  iconButtonPrint: {
    backgroundColor: "#d1fae5",
    borderColor: "#6ee7b7",
  },
  iconButtonEdit: {
    backgroundColor: "#e0e7ff",
    borderColor: "#c7d2fe",
  },
  icon: { width: 20, height: 20 },
  iconPrint: { tintColor: "#065f46" },
  iconEdit: { tintColor: "#3730a3" },
  separator: {
    height: 1,
    backgroundColor: "#e0e7ff",
    marginVertical: 8,
  },
});
