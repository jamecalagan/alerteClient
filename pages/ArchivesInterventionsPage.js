import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { supabase } from "../supabaseClient";

export default function ArchivesInterventionsPage({ navigation }) {
  const [items, setItems] = useState([]);

  const load = async () => {
    const { data, error } = await supabase
      .from("interventions")
      .select(`id, status, deviceType, brand, clients (name, ficheNumber)`)
      .eq("status", "Non réparable")
      .eq("archived", true)
      .order("archived_at", { ascending: false });
    if (!error) setItems(data || []);
  };

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    return unsub;
  }, [navigation]);

  const unarchive = async (id) => {
    const confirm = await new Promise((resolve) => {
      Alert.alert(
        "Restaurer",
        "Remettre cette fiche dans la liste active ?",
        [
          { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
          { text: "Restaurer", onPress: () => resolve(true) },
        ],
        { cancelable: true }
      );
    });
    if (!confirm) return;

    const { error } = await supabase
      .from("interventions")
      .update({ archived: false, archived_at: null })
      .eq("id", id);

    if (!error) {
      setItems((prev) => prev.filter((x) => x.id !== id));
      Alert.alert("OK", "Fiche restaurée.");
    } else {
      Alert.alert("Erreur", "Impossible de restaurer.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Archives – Non réparables</Text>
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.line}>
              Fiche N° {item.clients?.ficheNumber ?? "—"} – {item.clients?.name ?? "Client"}
            </Text>
            <Text style={styles.line}>
              {(item.deviceType || "") + (item.brand ? " " + item.brand : "")}
            </Text>
            <View style={{ alignItems: "flex-end", marginTop: 8 }}>
              <TouchableOpacity style={styles.btn} onPress={() => unarchive(item.id)}>
                <Text style={styles.btnText}>Restaurer</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e0e0e0", padding: 16 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 10, color: "#111827" },
  card: {
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#888",
    padding: 14,
    marginBottom: 10,
  },
  line: { fontSize: 15, color: "#242424" },
  btn: {
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  btnText: { color: "#fff", fontWeight: "700" },
});
