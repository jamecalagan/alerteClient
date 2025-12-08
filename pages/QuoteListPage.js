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
} from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

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
              📤 Envoyé
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

        <View style={styles.actionTextRow}>
          <TouchableOpacity
            style={styles.actionTextCol}
            onPress={() =>
              navigation.navigate("QuotePrintPage", { id: item.id })
            }
          >
            <Text style={styles.actionTextLink}>Imprimer</Text>
          </TouchableOpacity>

          <View style={styles.actionTextVertical} />

          <TouchableOpacity
            style={styles.actionTextCol}
            onPress={() => navigation.navigate("QuoteEditPage", { id: item.id })}
          >
            <Text style={styles.actionTextLink}>Modifier</Text>
          </TouchableOpacity>

          <View style={styles.actionTextVertical} />

          <TouchableOpacity
            style={styles.actionTextCol}
            onPress={() => {
              setSelectedId(item.id);
              setShowConfirm(true);
            }}
          >
            <Text style={[styles.actionTextLink, styles.actionTextDanger]}>
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

      <TouchableOpacity style={styles.returnButton} onPress={() => navigation.goBack()}>
        <Text style={styles.buttonText}>⬅ Retour</Text>
      </TouchableOpacity>

      {/* Confirmation suppression */}
      {showConfirm && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={{ fontSize: 16, marginBottom: 20 }}>Supprimer ce devis ?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#6c757d" }]}
                onPress={() => setShowConfirm(false)}
              >
                <Text style={styles.buttonText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#dc3545" }]}
                onPress={async () => {
                  await deleteQuote(selectedId);
                  setShowConfirm(false);
                  setSelectedId(null);
                }}
              >
                <Text style={styles.buttonText}>Supprimer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, flex: 1, backgroundColor: "#f4f4f4" },
  title: { fontSize: 22, fontWeight: "600", marginBottom: 12, textAlign: "center", color: "#2e2e2e" },
  input: {
    borderWidth: 1, borderColor: "#ccc", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
    fontSize: 15, backgroundColor: "#fff", color: "#333",
  },
  inputFocused: { height: 50, fontSize: 16, borderColor: "#888", backgroundColor: "#f0f0f0" },
  floatingLabel: { position: "absolute", top: 12, left: 12, fontSize: 13, color: "#888", zIndex: 1 },
  floatingLabelFocused: { top: -10, left: 10, fontSize: 12, color: "#444", backgroundColor: "#f9f9f9", paddingHorizontal: 4, borderRadius: 4 },

  card: {
    backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dcdcdc",
    padding: 16, borderRadius: 10, marginBottom: 14,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  number: { fontWeight: "600", fontSize: 16, marginBottom: 4, color: "#2c2c2c" },
  client: { fontSize: 15, marginBottom: 4, color: "#444" },
  meta: { fontSize: 13, color: "#555", marginBottom: 2 },
  date: { fontSize: 13, color: "#777" },
  labelsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  statusLabel: { alignSelf: "flex-start", backgroundColor: "#888", color: "#fff", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 12, marginTop: 8 },
  total: { marginTop: 6, fontWeight: "600", fontSize: 15, textAlign: "right", color: "#111" },
  actionRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, gap: 10 },
  actionButton: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: "center", backgroundColor: "#999999" },
  buttonText: { color: "#f5f5f5", fontWeight: "500", fontSize: 14 },
  empty: { textAlign: "center", marginTop: 20, color: "#999" },
  returnButton: { backgroundColor: "#888888", padding: 12, borderRadius: 8, alignItems: "center", marginTop: 8, marginHorizontal: 16 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", zIndex: 999 },
  modalContent: { backgroundColor: "#fff", padding: 24, borderRadius: 10, width: "85%", elevation: 8, alignItems: "center" },
  modalButtons: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginTop: 16 },
  modalButton: { flex: 1, padding: 12, borderRadius: 6, alignItems: "center", backgroundColor: "#b0b0b0" },
    card: {
    borderRadius: 10,
    backgroundColor: "#ffffff",
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
    color: "#111827",
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
    alignItems: "flex-end",
    minWidth: 90,
  },
  cardAmountLabel: {
    fontSize: 10,
    color: "#4b5563",
  },
  cardAmountValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1d4ed8",
  },
  cardClientBlock: {
    marginTop: 4,
    marginBottom: 4,
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
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 999,
  color: "#f9fafb",
  overflow: "hidden",
  marginBottom: 6,
  textAlignVertical: "center", // 👈 Android : centre verticalement
  includeFontPadding: false,   // 👈 enlève le padding haut/bas du font
  lineHeight: 15,              // 👈 proche du fontSize pour un centrage visuel
},

  statusPrinted: {
    backgroundColor: "#4b5563",
  },
  statusSent: {
    backgroundColor: "#15803d",
  },
  statusPending: {
    backgroundColor: "#b45309",
  },
  statusLinked: {
    backgroundColor: "#6b4e16",
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
    borderTopColor: "#e5e7eb",
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
  actionTextRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  actionTextCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  actionTextVertical: {
    width: 1,
    height: 16,
    backgroundColor: "#e5e7eb",
  },
  actionTextLink: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563eb",
  },
  actionTextDanger: {
    color: "#b91c1c",
  },
  cardActionsSeparator: {
    marginTop: 6,
    marginBottom: 4,
    height: 1,
    backgroundColor: "#e5e7eb", // gris clair visible
  },

});

export default QuoteListPage;
