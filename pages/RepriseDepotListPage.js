import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import AlertBox from "../components/AlertBox";
import BackButton from "../components/BackButton";
import { formatDepotNumber, describeItem, isDepotDone, STATUS_LABELS } from "../utils/repriseDepot";

const FILTERS = [
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminés" },
  { value: "all", label: "Tous" },
];

const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function RepriseDepotListPage({ navigation }) {
  const [depots, setDepots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("en_cours");
  const [alert, setAlert] = useState(null);

  const loadDepots = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reprise_depots")
        .select("id, numero, created_at, client_name, client_phone, items, deposit_signature")
        .or("deleted.is.null,deleted.eq.false")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDepots(data || []);
    } catch (e) {
      console.error("❌ Chargement dépôts :", e);
      setAlert({
        title: "Erreur",
        message:
          "Impossible de charger les dépôts. " +
          (e?.message || "") +
          "\n\nSi la table n'existe pas encore, exécutez scripts/sql/reprise_depots.sql dans Supabase.",
      });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadDepots();
    }, [])
  );

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return depots.filter((d) => {
      const items = Array.isArray(d.items) ? d.items : [];
      const done = isDepotDone(items);
      if (filter === "en_cours" && done) return false;
      if (filter === "termine" && !done) return false;
      if (!q) return true;
      return [
        formatDepotNumber(d.numero),
        d.client_name,
        d.client_phone,
        ...items.map(describeItem),
      ].some((v) => normalize(v).includes(q));
    });
  }, [depots, search, filter]);

  const renderItem = ({ item: d }) => {
    const items = Array.isArray(d.items) ? d.items : [];
    const done = isDepotDone(items);
    const counts = items.reduce((acc, it) => {
      const s = it.status || "en_test";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate("RepriseDepotEditPage", { depotId: d.id })}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardNumber}>{formatDepotNumber(d.numero)}</Text>
          <Text style={[styles.pill, done ? styles.pillDone : styles.pillOpen]}>
            {done ? "Terminé" : "En cours"}
          </Text>
        </View>
        <Text style={styles.cardClient}>
          {(d.client_name || "").toUpperCase()} — {d.client_phone || "—"}
        </Text>
        {items.map((it) => (
          <Text key={it.key} style={styles.cardItem} numberOfLines={1}>
            • {describeItem(it)} —{" "}
            <Text
              style={{
                fontWeight: "700",
                color:
                  it.status === "accepte" ? "#15803d" : it.status === "refuse" ? "#b91c1c" : "#b45309",
              }}
            >
              {STATUS_LABELS[it.status] || "En test"}
              {it.status === "accepte" && it.reprise_id ? " (reprise faite)" : ""}
              {it.status === "refuse" && it.returned ? " (rendu)" : ""}
            </Text>
          </Text>
        ))}
        <Text style={styles.cardSub}>
          {d.created_at ? new Date(d.created_at).toLocaleDateString("fr-FR") : ""} · {items.length} appareil
          {items.length > 1 ? "s" : ""}
          {counts.en_test ? ` · ${counts.en_test} en test` : ""}
          {d.deposit_signature ? "" : " · ⚠️ non signé"}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>📥 Dépôts pour test</Text>

      <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("RepriseDepotEditPage")}>
        <Text style={styles.newBtnText}>＋ Nouveau bon de dépôt</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Rechercher (n°, client, téléphone, appareil…)"
        placeholderTextColor="#94a3b8"
      />

      <View style={styles.filtersRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.linkChip} onPress={() => navigation.navigate("RepriseListPage")}>
          <Text style={styles.linkChipText}>♻️ Reprises</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4338ca" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.emptyText}>Aucun dépôt.</Text>}
        />
      )}

      <View style={{ alignItems: "center", marginBottom: 12 }}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <AlertBox
        visible={!!alert}
        title={alert?.title || ""}
        message={alert?.message || ""}
        onClose={() => setAlert(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#eef2ff", paddingHorizontal: 16, paddingTop: (StatusBar.currentHeight || 0) + 12 },
  title: { fontSize: 20, fontWeight: "800", color: "#1e1b4b", textAlign: "center", marginBottom: 10 },
  newBtn: { backgroundColor: "#4338ca", borderRadius: 999, paddingVertical: 13, alignItems: "center", marginBottom: 10 },
  newBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  search: {
    borderWidth: 1,
    borderColor: "#c7d2fe",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
    fontSize: 15,
    color: "#111827",
  },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 10 },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "#fff",
  },
  filterChipActive: { backgroundColor: "#4338ca", borderColor: "#4338ca" },
  filterText: { color: "#3730a3", fontWeight: "600" },
  filterTextActive: { color: "#fff" },
  linkChip: { marginLeft: "auto", paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#e0e7ff" },
  linkChipText: { color: "#3730a3", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#e0e7ff" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardNumber: { fontWeight: "800", color: "#4338ca" },
  pill: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, overflow: "hidden", fontWeight: "700", fontSize: 12 },
  pillOpen: { backgroundColor: "#fef3c7", color: "#b45309" },
  pillDone: { backgroundColor: "#dcfce7", color: "#15803d" },
  cardClient: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginTop: 4 },
  cardItem: { color: "#334155", fontSize: 13, marginTop: 2 },
  cardSub: { color: "#64748b", fontSize: 12, marginTop: 4 },
  emptyText: { textAlign: "center", color: "#64748b", marginTop: 30 },
});
