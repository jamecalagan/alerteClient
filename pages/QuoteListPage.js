import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  RefreshControl,
  StatusBar,
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../supabaseClient";
import BackButton from "../components/BackButton";

const QuoteListPage = () => {
  const navigation = useNavigation();

  // UI état
  const [quotes, setQuotes] = useState([]);
  const [search, setSearch] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const inputHeight = useRef(new Animated.Value(42)).current;
  const [refreshing, setRefreshing] = useState(false);

  // Map des demandes reliées : quote_id -> { id, status }
  const [requestByQuoteId, setRequestByQuoteId] = useState({});

  // Anim champ recherche
  const handleFocus = () => {
    setIsSearchFocused(true);
    Animated.timing(inputHeight, { toValue: 55, duration: 150, useNativeDriver: false }).start();
  };
  const handleBlur = () => {
    setIsSearchFocused(false);
    Animated.timing(inputHeight, { toValue: 42, duration: 150, useNativeDriver: false }).start();
  };

  // Chargement
  const fetchQuotes = async () => {
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur chargement devis :", error);
      setQuotes([]);
      return;
    }
    setQuotes(data || []);

    // Récupère les demandes liées à un devis
    const { data: reqs, error: err2 } = await supabase
      .from("quote_requests")
      .select("id, quote_id, status")
      .not("quote_id", "is", null);

    if (!err2 && reqs) {
      const map = {};
      for (const r of reqs) {
        if (r.quote_id) map[r.quote_id] = { id: r.id, status: r.status };
      }
      setRequestByQuoteId(map);
    } else {
      setRequestByQuoteId({});
    }
  };

  // Premier chargement
  useEffect(() => {
    fetchQuotes();
  }, []);

  // Recharger à chaque retour sur l’écran
  useFocusEffect(
    useCallback(() => {
      fetchQuotes();
    }, [])
  );

  // Pull-to-refresh
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchQuotes();
    setRefreshing(false);
  };

  // Filtre simple (nom, numéro, téléphone, email)
  const filteredQuotes = quotes.filter((q) => {
    const needle = search.toLowerCase();
    return (
      (q.name || "").toLowerCase().includes(needle) ||
      (q.quote_number || "").toLowerCase().includes(needle) ||
      (q.phone || "").toLowerCase().includes(needle) ||
      (q.email || "").toLowerCase().includes(needle)
    );
  });

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const deleteQuote = async (id) => {
    const { error } = await supabase.from("quotes").delete().eq("id", id);
    if (error) console.error("Erreur suppression devis :", error);
    else fetchQuotes();
  };

  // Rendu d'une carte devis
  const renderItem = ({ item }) => {
    const linkedReq = requestByQuoteId[item.id]; // { id, status } si lié
    const shortReqId = linkedReq?.id ? linkedReq.id.slice(0, 8) : null;

    return (
      <View style={styles.card}>
        {/* En-tête : numéro + dates + total */}
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardNumber}>
               {item.quote_number || "—"}
            </Text>
            <Text style={styles.cardDate}>
               {formatDate(item.created_at)} • valide jusqu’au{" "}
              {formatDate(item.valid_until)}
            </Text>
          </View>

          <View style={styles.cardAmountPill}>
            <Text style={styles.cardAmountLabel}>Total TTC</Text>
            <Text style={styles.cardAmountValue}>
              {parseFloat(item.total || 0).toFixed(2)} €
            </Text>
          </View>
        </View>

        {/* Bloc client sous forme de petit tableau */}
        <View style={styles.cardClientBlock}>
          <View style={styles.cardClientRow}>
            <Text style={styles.cardClientLabelCol}>Client:</Text>
            <Text style={styles.cardClientValue}>
              {item.name || "Client inconnu"}
            </Text>
          </View>

          {item.phone ? (
            <View style={styles.cardClientRow}>
              <Text style={styles.cardClientLabelCol}>Tél:</Text>
              <Text style={styles.cardClientValue}>{item.phone}</Text>
            </View>
          ) : null}

          {item.email ? (
            <View style={styles.cardClientRow}>
              <Text style={styles.cardClientLabelCol}>E-mail:</Text>
              <Text
                style={styles.cardClientValue}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.email}
              </Text>
            </View>
          ) : null}
        </View>



        {/* Statuts / badges */}
        <View style={styles.labelsRow}>
          {item.deja_imprime ? (
            <Text style={[styles.statusLabel, styles.statusPrinted]}>
              🖨️ Imprimé
            </Text>
          ) : null}

          {item.deja_envoye ? (
            <Text style={[styles.statusLabel, styles.statusSent]}>
              ✉️ Envoyé
            </Text>
          ) : null}

          {!item.deja_imprime && !item.deja_envoye ? (
            <Text style={[styles.statusLabel, styles.statusPending]}>
              ⚠️ Non traité
            </Text>
          ) : null}

          {linkedReq ? (
            <Text style={[styles.statusLabel, styles.statusLinked]}>
              📝 Demande liée • #{shortReqId}
            </Text>
          ) : null}
        </View>
        {/* Séparation horizontale */}
        <View style={styles.cardActionsSeparator} />

        <View style={styles.actionButtonRow}>
          <TouchableOpacity
            style={[styles.pillButton, styles.pillButtonView]}
            onPress={() =>
              navigation.navigate("QuotePrintPage", { id: item.id })
            }
          >
            <Ionicons name="eye-outline" size={14} color="#3730a3" />
            <Text style={[styles.pillButtonText, { color: "#3730a3" }]}>
              Visualiser
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pillButton, styles.pillButtonEdit]}
            onPress={() => navigation.navigate("QuoteEditPage", { id: item.id })}
          >
            <Ionicons name="create-outline" size={14} color="#065f46" />
            <Text style={[styles.pillButtonText, { color: "#065f46" }]}>
              Modifier
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pillButton, styles.pillButtonDelete]}
            onPress={() => {
              setSelectedId(item.id);
              setShowConfirm(true);
            }}
          >
            <Ionicons name="trash-outline" size={14} color="#b91c1c" />
            <Text style={[styles.pillButtonText, { color: "#b91c1c" }]}>
              Supprimer
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📄 Liste des devis</Text>

      {/* Recherche avec label flottant */}
      <View style={{ marginBottom: 8, position: "relative" }}>
        <Text
          style={[
            styles.floatingLabel,
            (isSearchFocused || search.length > 0) && styles.floatingLabelFocused,
          ]}
        >
          🔍 Rechercher (client, n° devis, tel, email)
        </Text>

        <Animated.View style={{ height: inputHeight }}>
          <TextInput
            style={[styles.input, { height: "100%" }, isSearchFocused && styles.inputFocused]}
            value={search}
            onChangeText={setSearch}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </Animated.View>
      </View>

      <FlatList
        data={filteredQuotes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.empty}>Aucun devis enregistré.</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />

      <BackButton onPress={() => navigation.goBack()} />

      {/* Confirmation suppression */}
      {showConfirm && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 16, marginBottom: 20, color: "#0f172a" }}>
              Supprimer ce devis ?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowConfirm(false)}
              >
                <Text style={[styles.buttonText, { color: "#334155" }]}>
                  Annuler
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonDanger]}
                onPress={async () => {
                  await deleteQuote(selectedId);
                  setShowConfirm(false);
                  setSelectedId(null);
                }}
              >
                <Text style={[styles.buttonText, { color: "#b91c1c" }]}>
                  Supprimer
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flex: 1,
    backgroundColor: "#eef2ff",
    paddingTop: 16 + (StatusBar.currentHeight || 0),
  },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12, textAlign: "center", color: "#0f172a" },
  input: {
    borderWidth: 1.5, borderColor: "#c7d2fe", borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
    fontSize: 15, backgroundColor: "#ffffff", color: "#0f172a",
  },
  inputFocused: { height: 50, fontSize: 16, borderColor: "#4f46e5", backgroundColor: "#ffffff" },
  floatingLabel: { position: "absolute", top: 12, left: 12, fontSize: 13, color: "#6366f1", zIndex: 1 },
  floatingLabelFocused: { top: -10, left: 10, fontSize: 12, color: "#3730a3", backgroundColor: "#eef2ff", paddingHorizontal: 4, borderRadius: 4 },

  number: { fontWeight: "600", fontSize: 16, marginBottom: 4, color: "#2c2c2c" },
  client: { fontSize: 15, marginBottom: 4, color: "#444" },
  meta: { fontSize: 13, color: "#555", marginBottom: 2 },
  date: { fontSize: 13, color: "#777" },
  total: { marginTop: 6, fontWeight: "600", fontSize: 15, textAlign: "right", color: "#111" },
  empty: { textAlign: "center", marginTop: 20, color: "#6366f1" },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "center", alignItems: "center", zIndex: 999 },
  modalContent: { backgroundColor: "#ffffff", padding: 24, borderRadius: 16, width: "85%", elevation: 8, alignItems: "center" },
  modalButtons: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 16 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", borderWidth: 1.5 },
  modalButtonCancel: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1" },
  modalButtonDanger: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },
    card: {
    borderRadius: 16,
    backgroundColor: "#ffffff",
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e0e7ff",
    shadowColor: "#312e81",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  cardNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#312e81",
  },
  cardDate: {
    marginTop: 2,
    fontSize: 11,
    color: "#6b7280",
  },
  cardAmountPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    alignItems: "flex-end",
    minWidth: 90,
  },
  cardAmountLabel: {
    fontSize: 10,
    color: "#4f46e5",
  },
  cardAmountValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#3730a3",
  },
  cardClient: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  cardMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  metaChip: {
    fontSize: 11,
    color: "#374151",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
  },
labelsRow: {
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",   // 👈 centre verticalement les badges dans la ligne
  gap: 6,
  marginTop: 4,
  marginBottom: 6,
},
statusLabel: {
  fontSize: 11,
  fontWeight: "700",
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 999,
  borderWidth: 1,
  overflow: "hidden",
  marginBottom: 6,
  textAlignVertical: "center", // 👈 Android : centre verticalement
  includeFontPadding: false,   // 👈 enlève le padding haut/bas du font
  lineHeight: 15,              // 👈 proche du fontSize pour un centrage visuel
},

  statusPrinted: {
    backgroundColor: "#e2e8f0",
    borderColor: "#cbd5e1",
    color: "#334155",
  },
  statusSent: {
    backgroundColor: "#dcfce7",
    borderColor: "#86efac",
    color: "#15803d",
  },
  statusPending: {
    backgroundColor: "#fef3c7",
    borderColor: "#fcd34d",
    color: "#b45309",
  },
  statusLinked: {
    backgroundColor: "#ede9fe",
    borderColor: "#c4b5fd",
    color: "#6d28d9",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    height: 34,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  actionButtonLight: {
    backgroundColor: "#e5e7eb",
  },
  actionButtonDark: {
    backgroundColor: "#4b5563",
  },
  actionButtonDanger: {
    backgroundColor: "#b91c1c",
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#f9fafb",
  },
  cardClientLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
  },
  cardClientName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginTop: 2,
  },
  metaLabel: {
    fontWeight: "600",
    color: "#374151",
  },
  cardClientBlock: {
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: "#e0e7ff",
  },
  cardClientRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
  },
  cardClientLabelCol: {
    width: 60,
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
  },
  cardClientValue: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
  },
  actionButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexGrow: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  pillButtonView: {
    backgroundColor: "#e0e7ff",
    borderColor: "#c7d2fe",
  },
  pillButtonEdit: {
    backgroundColor: "#d1fae5",
    borderColor: "#6ee7b7",
  },
  pillButtonDelete: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
  },
  pillButtonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  cardActionsSeparator: {
    marginTop: 6,
    marginBottom: 4,
    height: 1,
    backgroundColor: "#e0e7ff",
  },

});

export default QuoteListPage;
