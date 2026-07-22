import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Animated,
  Easing,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as Animatable from "react-native-animatable";
import { supabase } from "../supabaseClient";
import BottomNavigation from "../components/BottomNavigation";
import { useRoute } from "@react-navigation/native";

export default function RepairedInterventionsListPage({ navigation }) {
  const [allInterventions, setAllInterventions] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
const [isUpdating, setIsUpdating] = useState(false);
  const route = useRoute();

  const initialFilter = route.params?.initialFilter ?? "Réparé";
  const [filter, setFilter] = useState(initialFilter);

  useEffect(() => {
    if (initialFilter && (initialFilter === "Réparé" || initialFilter === "Non réparable")) {
      setFilter(initialFilter);
    }
  }, [initialFilter]);

  /* ───────────────── Chargement BDD ───────────────── */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("interventions")
        .select(
          `
          id, status, notifiedBy, deviceType, brand, model, archived, archived_at,
          clients (name, ficheNumber, phone)
        `
        )
        .in("status", ["Réparé", "Non réparable"])
        .eq("archived", false)                 // 👈 ne charge pas les archivées ici
        .order("updatedAt", { ascending: false });

      if (!error) {
        setAllInterventions(data || []);
      } else {
        console.error("Erreur chargement :", error);
      }
    })();
  }, []);

  /* ───────────────── Filtres / recherche ───────────────── */
  useEffect(() => {
    const base = allInterventions.filter((it) => it.status === filter);

    const q = search.trim().toLowerCase();
    const res = q
      ? base.filter((it) => {
          const nom = it.clients?.name?.toLowerCase() || "";
          const fiche = (it.clients?.ficheNumber || "").toString();
          const type = (it.deviceType || "").toLowerCase();
          return nom.includes(q) || fiche.includes(q) || type.includes(q);
        })
      : base;

    setFiltered(res);

    if (q.length > 0) {
      const uniq = new Set();
      const sugg = base
        .flatMap((it) => [
          it.clients?.name,
          it.clients?.ficheNumber?.toString(),
          it.deviceType,
        ])
        .filter(Boolean)
        .filter((v) => v.toString().toLowerCase().includes(q))
        .filter((v) => {
          if (uniq.has(v)) return false;
          uniq.add(v);
          return true;
        })
        .slice(0, 6);
      setSuggestions(sugg);
    } else {
      setSuggestions([]);
    }
  }, [allInterventions, filter, search]);
/* ───────────────── Sélection multiple ───────────────── */

const isSelected = (id) => selectedIds.includes(id);

const toggleSelection = (id) => {
  setSelectedIds((prev) =>
    prev.includes(id)
      ? prev.filter((selectedId) => selectedId !== id)
      : [...prev, id]
  );
};

const handleCardPress = (item) => {
  if (selectedIds.length > 0) {
    toggleSelection(item.id);
    return;
  }

  navigation.navigate("RepairedInterventionsPage", {
    selectedInterventionId: item.id,
  });
};

const handleCardLongPress = (item) => {
  toggleSelection(item.id);
};

const handleSelectAllVisible = () => {
  const visibleIds = filtered.map((item) => item.id);

  const allVisibleSelected =
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedIds.includes(id));

  if (allVisibleSelected) {
    setSelectedIds((prev) =>
      prev.filter((id) => !visibleIds.includes(id))
    );
  } else {
    setSelectedIds((prev) => [
      ...new Set([...prev, ...visibleIds]),
    ]);
  }
};

const confirmBulkRestitution = () => {
  if (selectedIds.length === 0 || isUpdating) return;

  const count = selectedIds.length;

  Alert.alert(
    "Confirmer la restitution",
    `Passer ${count} fiche${count > 1 ? "s" : ""} sélectionnée${
      count > 1 ? "s" : ""
    } au statut « Récupéré » ?`,
    [
      {
        text: "Annuler",
        style: "cancel",
      },
      {
        text: "Confirmer",
        onPress: handleBulkRestitution,
      },
    ],
    { cancelable: true }
  );
};

const handleBulkRestitution = async () => {
  if (selectedIds.length === 0 || isUpdating) return;

  const idsToUpdate = [...selectedIds];

  setIsUpdating(true);

  try {
    const { error } = await supabase
      .from("interventions")
      .update({
        status: "Récupéré",
        updatedAt: new Date().toISOString(),
      })
      .in("id", idsToUpdate);

    if (error) throw error;

    setAllInterventions((prev) =>
      prev.filter((item) => !idsToUpdate.includes(item.id))
    );

    setSelectedIds([]);

    Alert.alert(
      "Restitution enregistrée",
      `${idsToUpdate.length} fiche${
        idsToUpdate.length > 1 ? "s ont" : " a"
      } été passée${idsToUpdate.length > 1 ? "s" : ""} en « Récupéré ».`
    );
  } catch (error) {
    console.error("Erreur restitution multiple :", error);

    Alert.alert(
      "Erreur",
      "Impossible de passer les fiches sélectionnées en Récupéré."
    );
  } finally {
    setIsUpdating(false);
  }
};
  /* ───────────────── Archiver ───────────────── */
  const handleArchive = async (interventionId) => {
    try {
      const confirm = await new Promise((resolve) => {
        Alert.alert(
          "Archiver la fiche",
          "Confirmer l’archive de cette fiche (Non réparable) ?",
          [
            { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
            { text: "Archiver", style: "destructive", onPress: () => resolve(true) },
          ],
          { cancelable: true }
        );
      });
      if (!confirm) return;

      const { error } = await supabase
        .from("interventions")
        .update({ archived: true, archived_at: new Date().toISOString() })
        .eq("id", interventionId);

      if (error) {
        console.error("Archive error:", error);
        Alert.alert("Erreur", "Impossible d’archiver la fiche.");
        return;
      }

      // Retire la fiche de la liste locale
      setAllInterventions((prev) => prev.filter((x) => x.id !== interventionId));
      Alert.alert("Archivée", "La fiche a été déplacée dans les archives.");
    } catch (e) {
      console.error(e);
      Alert.alert("Erreur", "Une erreur est survenue.");
    }
  };

  /* ───────────────── Rendu ───────────────── */
  const Blinking = ({ src, tint }) => {
    const opacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true, easing: Easing.linear }),
          Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.linear }),
        ])
      ).start();
    }, []);
    return <Animated.Image source={src} style={{ width: 24, height: 24, tintColor: tint, opacity }} />;
  };

  const formatPhoneNumber = (n) => n?.replace(/(\d{2})(?=\d)/g, "$1 ") || "";

  return (
    <View style={styles.container}>
      {/* ───── boutons haut de page ───── */}
      <View style={styles.topRow}>
        <View style={styles.segment}>
          {["Réparé", "Non réparable"].map((lbl) => (
            <TouchableOpacity
              key={lbl}
              style={[styles.segBtn, filter === lbl && styles.segBtnActive]}
              onPress={() => setFilter(lbl)}
            >
              <Text style={{ color: filter === lbl ? "#fff" : "#444" }}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* (Optionnel) Bouton vers la page des archives si tu l’ajoutes au routeur */}
        <TouchableOpacity
          style={styles.archivesLink}
          onPress={() => navigation.navigate("ArchivesInterventionsPage")}
        >
          <Text style={styles.archivesLinkText}>Voir archives</Text>
        </TouchableOpacity>
      </View>

      {/* ───── recherche + suggestions ───── */}
      <TextInput
        style={styles.search}
        placeholder="Recherche nom, fiche, type…"
        value={search}
        onChangeText={setSearch}
      />
      {suggestions.length > 0 && (
        <View style={styles.suggestBox}>
          {suggestions.map((s) => (
            <TouchableOpacity key={String(s)} onPress={() => setSearch(String(s))}>
              <Text style={styles.suggestItem}>{String(s)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
<View style={styles.selectionBar}>
  <TouchableOpacity
    style={styles.selectAllBtn}
    onPress={handleSelectAllVisible}
    disabled={filtered.length === 0 || isUpdating}
  >
    <View
      style={[
        styles.checkbox,
        filtered.length > 0 &&
          filtered.every((item) => selectedIds.includes(item.id)) &&
          styles.checkboxSelected,
      ]}
    >
      {filtered.length > 0 &&
        filtered.every((item) => selectedIds.includes(item.id)) && (
          <Text style={styles.checkmark}>✓</Text>
        )}
    </View>

    <Text style={styles.selectAllText}>
      {filtered.length > 0 &&
      filtered.every((item) => selectedIds.includes(item.id))
        ? "Tout désélectionner"
        : "Tout sélectionner"}
    </Text>
  </TouchableOpacity>

  <Text style={styles.selectionCount}>
    {selectedIds.length} sélectionnée
    {selectedIds.length > 1 ? "s" : ""}
  </Text>

  <TouchableOpacity
    style={[
      styles.restituteBtn,
      (selectedIds.length === 0 || isUpdating) && styles.disabledBtn,
    ]}
    onPress={confirmBulkRestitution}
    disabled={selectedIds.length === 0 || isUpdating}
  >
    {isUpdating ? (
      <ActivityIndicator size="small" color="#fff" />
    ) : (
      <Text style={styles.restituteBtnText}>
        Restituer ({selectedIds.length})
      </Text>
    )}
  </TouchableOpacity>
</View>

<Text style={styles.selectionHint}>
  Appui long sur une fiche pour la sélectionner.
</Text>
      {/* ───── liste ───── */}
      <FlatList
        data={filtered}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={{ paddingBottom: 80 }}
        renderItem={({ item, index }) => {
          const client = item.clients || null;
          const ficheNum = client?.ficheNumber ?? "—";
          const clientName = client?.name ?? "Client inconnu";
          const clientPhone = formatPhoneNumber(client?.phone) || "—";
          const deviceLine = [item.deviceType, item.brand].filter(Boolean).join(" ") || "—";
			const selected = isSelected(item.id);
          return (
            <Animatable.View
              animation="zoomIn"
              duration={400}
              delay={index * 120}
              style={[
  styles.card,
  item.status === "Non réparable" && { borderColor: "red" },
  selected && styles.cardSelected,
]}
            >
             <TouchableOpacity
  onPress={() => handleCardPress(item)}
  onLongPress={() => handleCardLongPress(item)}
  delayLongPress={350}
  activeOpacity={0.8}
>
                <Text style={styles.line}>Fiche N° {ficheNum}</Text>
				<View style={styles.cardHeader}>
  <View
    style={[
      styles.checkbox,
      selected && styles.checkboxSelected,
    ]}
  >
    {selected && <Text style={styles.checkmark}>✓</Text>}
  </View>

  <View style={styles.cardContent}></View>
                <Text style={styles.line}>
                  {clientName} – {clientPhone}
                </Text>
                <Text style={styles.line}>{deviceLine}</Text>

                <View style={{ flexDirection: "row", marginTop: 6, alignItems: "center" }}>
                  <Text style={styles.line}>Notif.</Text>
                  {item.notifiedBy === "SMS" && (
                    <Image
                      source={require("../assets/icons/sms.png")}
                      style={{ width: 24, height: 24, tintColor: "#077907", marginLeft: 6 }}
                    />
                  )}
                  {item.notifiedBy === "Téléphone" && (
                    <Image
                      source={require("../assets/icons/call.png")}
                      style={{ width: 24, height: 24, tintColor: "#3579ff", marginLeft: 6 }}
                    />
                  )}
                  {!item.notifiedBy && (
                    <Blinking src={require("../assets/icons/notifications_off.png")} tint="#ff3b30" />
                  )}
                </View>
				  </View>

              </TouchableOpacity>

              {/* 👇 Bouton ARCHIVER visible uniquement pour "Non réparable" */}
              {item.status === "Non réparable" && (
                <View style={styles.cardFooter}>
                  <TouchableOpacity
                    style={styles.archiveBtn}
                    onPress={() => handleArchive(item.id)}
                    activeOpacity={0.9}
                  >
                    <Image
                      source={require("../assets/icons/archive.png")}
                      style={{ width: 18, height: 18, marginRight: 8, tintColor: "#ffffff" }}
                    />
                    <Text style={styles.archiveBtnText}>Archiver</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Animatable.View>
          );
        }}
      />

      <BottomNavigation navigation={navigation} currentRoute="RepairedInterventionsListPage" />
    </View>
  );
}

/* ───────────────── styles ───────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e0e0e0", padding: 16 },
  topRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  segment: { flexDirection: "row", marginBottom: 12, flex: 1 },
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 6,
    backgroundColor: "#d1d1d1",
    alignItems: "center",
  },
  segBtnActive: { backgroundColor: "#242424" },
  archivesLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#365314",
    borderRadius: 6,
    marginLeft: 8,
  },
  archivesLinkText: { color: "#fff", fontWeight: "700" },
  search: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#888",
    fontSize: 16,
    marginBottom: 4,
    marginTop: 6,
  },
  suggestBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 4,
    marginBottom: 6,
  },
  suggestItem: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    fontSize: 15,
  },
  card: {
    backgroundColor: "#f0f0f0",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#888",
    padding: 14,
    marginBottom: 10,
    elevation: 2,
  },
  line: { fontSize: 15, color: "#242424" },
  cardFooter: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  archiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#991B1B",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  archiveBtnText: { color: "#fff", fontWeight: "700" },
  selectionBar: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#ffffff",
  borderWidth: 1,
  borderColor: "#999",
  borderRadius: 8,
  padding: 8,
  marginTop: 8,
  marginBottom: 4,
},

selectAllBtn: {
  flexDirection: "row",
  alignItems: "center",
},

selectAllText: {
  fontSize: 13,
  fontWeight: "600",
  color: "#242424",
},

selectionCount: {
  flex: 1,
  textAlign: "center",
  fontSize: 13,
  fontWeight: "700",
  color: "#242424",
},

restituteBtn: {
  minWidth: 105,
  minHeight: 38,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "#15803d",
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 6,
},

restituteBtnText: {
  color: "#ffffff",
  fontWeight: "700",
  fontSize: 13,
},

disabledBtn: {
  backgroundColor: "#999999",
  opacity: 0.7,
},

selectionHint: {
  fontSize: 12,
  color: "#555555",
  marginBottom: 8,
  marginLeft: 2,
},

checkbox: {
  width: 24,
  height: 24,
  borderRadius: 5,
  borderWidth: 2,
  borderColor: "#777777",
  backgroundColor: "#ffffff",
  justifyContent: "center",
  alignItems: "center",
  marginRight: 10,
},

checkboxSelected: {
  backgroundColor: "#15803d",
  borderColor: "#15803d",
},

checkmark: {
  color: "#ffffff",
  fontSize: 16,
  fontWeight: "bold",
},

cardSelected: {
  backgroundColor: "#dbeafe",
  borderColor: "#2563eb",
  borderWidth: 2,
},

cardHeader: {
  flexDirection: "row",
  alignItems: "flex-start",
},

cardContent: {
  flex: 1,
},
});
