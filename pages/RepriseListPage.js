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
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";
import AlertBox from "../components/AlertBox";
import BackButton from "../components/BackButton";
import { formatRepriseNumber, formatEuro, toNum } from "../utils/reprise";

const FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "en_stock", label: "En stock" },
  { value: "revendu", label: "Revendues" },
];

const normalize = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export default function RepriseListPage({ navigation }) {
  const [reprises, setReprises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [alert, setAlert] = useState(null);

  const loadReprises = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reprises")
        .select(
          "id, numero, created_at, seller_name, seller_phone, id_type, id_number, device_type, brand, model, serial_number, reprise_type, price, payment_method, resale_status, resale_price, resale_date, signature"
        )
        .or("deleted.is.null,deleted.eq.false")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReprises(data || []);
    } catch (e) {
      console.error("❌ Chargement reprises :", e);
      setAlert({
        title: "Erreur",
        message:
          "Impossible de charger les reprises. " +
          (e?.message || "") +
          "\n\nSi la table n'existe pas encore, exécutez scripts/sql/reprises.sql dans Supabase.",
      });
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadReprises();
    }, [])
  );

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return reprises.filter((r) => {
      if (filter !== "all" && r.resale_status !== filter) return false;
      if (!q) return true;
      return [
        formatRepriseNumber(r.numero),
        r.seller_name,
        r.seller_phone,
        r.device_type,
        r.brand,
        r.model,
        r.serial_number,
      ].some((v) => normalize(v).includes(q));
    });
  }, [reprises, search, filter]);

  const stats = useMemo(() => {
    const inStock = reprises.filter((r) => r.resale_status !== "revendu");
    const sold = reprises.filter((r) => r.resale_status === "revendu");
    return {
      inStockCount: inStock.length,
      inStockValue: inStock.reduce((s, r) => s + toNum(r.price), 0),
      soldCount: sold.length,
      soldMargin: sold.reduce(
        (s, r) => s + (r.resale_price != null ? toNum(r.resale_price) - toNum(r.price) : 0),
        0
      ),
    };
  }, [reprises]);

  // Liste imprimable (base pour le registre des objets achetés).
  const printList = async () => {
    const rows = filtered
      .slice()
      .reverse()
      .map(
        (r) => `<tr>
          <td>${esc(formatRepriseNumber(r.numero))}</td>
          <td>${r.created_at ? new Date(r.created_at).toLocaleDateString("fr-FR") : ""}</td>
          <td>${esc(r.seller_name)}<br/>${esc(r.seller_phone)}</td>
          <td>${esc(r.id_type)}<br/>${esc(r.id_number)}</td>
          <td>${esc([r.device_type, r.brand, r.model].filter(Boolean).join(" "))}</td>
          <td>${esc(r.serial_number)}</td>
          <td style="text-align:right;">${formatEuro(r.price)}</td>
          <td>${r.reprise_type === "deduction" ? "Déduction" : esc(r.payment_method)}</td>
          <td>${r.resale_status === "revendu" ? `Revendu ${esc(r.resale_date)}` : "En stock"}</td>
        </tr>`
      )
      .join("");
    const html = `<html><body style="font-family: Arial; font-size: 9px;">
      <h3 style="text-align:center;">AVENIR INFORMATIQUE — Liste des reprises de matériel</h3>
      <p style="text-align:center;">Imprimée le ${new Date().toLocaleDateString("fr-FR")} — ${filtered.length} reprise(s)</p>
      <table border="1" cellspacing="0" cellpadding="3" style="width:100%;border-collapse:collapse;">
        <tr style="background:#eef2ff;">
          <th>N°</th><th>Date</th><th>Vendeur</th><th>Pièce d'identité</th><th>Matériel</th>
          <th>N° série / IMEI</th><th>Montant</th><th>Paiement</th><th>Revente</th>
        </tr>
        ${rows}
      </table>
    </body></html>`;
    try {
      await Print.printAsync({ html });
    } catch (e) {
      console.error("❌ Impression liste reprises :", e);
    }
  };

  const renderItem = ({ item: r }) => {
    const sold = r.resale_status === "revendu";
    const margin = sold && r.resale_price != null ? toNum(r.resale_price) - toNum(r.price) : null;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate("RepriseEditPage", { repriseId: r.id })}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardNumber}>{formatRepriseNumber(r.numero)}</Text>
          <Text style={[styles.pill, sold ? styles.pillSold : styles.pillStock]}>
            {sold ? "Revendu" : "En stock"}
          </Text>
        </View>
        <Text style={styles.cardDevice}>
          {[r.device_type, r.brand, r.model].filter(Boolean).join(" ") || "Matériel"}
        </Text>
        <Text style={styles.cardSub}>
          {(r.seller_name || "").toUpperCase()} — {r.seller_phone || "—"}
        </Text>
        <View style={styles.cardBottom}>
          <Text style={styles.cardSub}>
            {r.created_at ? new Date(r.created_at).toLocaleDateString("fr-FR") : ""} ·{" "}
            {r.reprise_type === "deduction" ? "Déduction" : `Rachat ${r.payment_method || ""}`}
            {r.signature ? "" : " · ⚠️ non signée"}
          </Text>
          <Text style={styles.cardPrice}>{formatEuro(r.price)}</Text>
        </View>
        {margin != null ? (
          <Text style={[styles.cardMargin, { color: margin >= 0 ? "#15803d" : "#b91c1c" }]}>
            Revendu {formatEuro(r.resale_price)} · marge {formatEuro(margin)}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>♻️ Reprises de matériel</Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.inStockCount}</Text>
          <Text style={styles.statLabel}>en stock ({formatEuro(stats.inStockValue)})</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.soldCount}</Text>
          <Text style={styles.statLabel}>revendues · marge {formatEuro(stats.soldMargin)}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.newBtn}
        onPress={() => navigation.navigate("RepriseEditPage")}
      >
        <Text style={styles.newBtnText}>＋ Nouvelle reprise</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Rechercher (n°, vendeur, téléphone, modèle, IMEI…)"
        placeholderTextColor="#94a3b8"
      />

      <View style={styles.filtersRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.printChip} onPress={printList}>
          <Text style={styles.printChipText}>🖨️ Imprimer la liste</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#4338ca" style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Aucune reprise pour le moment.</Text>
          }
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
  screen: {
    flex: 1,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 16,
    paddingTop: (StatusBar.currentHeight || 0) + 12,
  },
  title: { fontSize: 20, fontWeight: "800", color: "#1e1b4b", textAlign: "center", marginBottom: 10 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  statBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e0e7ff",
    alignItems: "center",
  },
  statValue: { fontSize: 22, fontWeight: "900", color: "#312e81" },
  statLabel: { fontSize: 12, color: "#475569", textAlign: "center" },
  newBtn: {
    backgroundColor: "#4338ca",
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 10,
  },
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
  printChip: {
    marginLeft: "auto",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#e0e7ff",
  },
  printChipText: { color: "#3730a3", fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardNumber: { fontWeight: "800", color: "#4338ca" },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: "hidden",
    fontWeight: "700",
    fontSize: 12,
  },
  pillStock: { backgroundColor: "#e0e7ff", color: "#3730a3" },
  pillSold: { backgroundColor: "#dcfce7", color: "#15803d" },
  cardDevice: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginTop: 4 },
  cardSub: { color: "#475569", fontSize: 13, marginTop: 2 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  cardPrice: { fontWeight: "900", color: "#000", fontSize: 15 },
  cardMargin: { marginTop: 4, fontWeight: "700" },
  emptyText: { textAlign: "center", color: "#64748b", marginTop: 30 },
});
