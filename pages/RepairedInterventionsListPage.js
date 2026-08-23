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
  ActivityIndicator,
} from "react-native";
import * as Animatable from "react-native-animatable";
import { supabase } from "../supabaseClient";
import BottomNavigation from "../components/BottomNavigation";
import { useRoute, useFocusEffect } from "@react-navigation/native";
import AlertBox from "../components/AlertBox";
import CustomAlert from "../components/CustomAlert";
import { Ionicons } from "@expo/vector-icons";

export default function RepairedInterventionsListPage({ navigation }) {
  const [allInterventions, setAllInterventions] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
const [isUpdating, setIsUpdating] = useState(false);
  const [bulkRestitutionConfirmVisible, setBulkRestitutionConfirmVisible] = useState(false);
  const [interventionIdToArchive, setInterventionIdToArchive] = useState(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };
  const route = useRoute();

  const initialFilter = route.params?.initialFilter ?? "Réparé";
  const [filter, setFilter] = useState(initialFilter);

  useEffect(() => {
    if (initialFilter && (initialFilter === "Réparé" || initialFilter === "Non réparable")) {
      setFilter(initialFilter);
    }
  }, [initialFilter]);

  /* ───────────────── Chargement BDD ───────────────── */
  const loadInterventions = React.useCallback(async () => {
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
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadInterventions();
    }, [loadInterventions])
  );

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
  setBulkRestitutionConfirmVisible(true);
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

    showAlert(
      "Restitution enregistrée",
      `${idsToUpdate.length} fiche${
        idsToUpdate.length > 1 ? "s ont" : " a"
      } été passée${idsToUpdate.length > 1 ? "s" : ""} en « Récupéré ».`
    );
  } catch (error) {
    console.error("Erreur restitution multiple :", error);

    showAlert(
      "Erreur",
      "Impossible de passer les fiches sélectionnées en Récupéré."
    );
  } finally {
    setIsUpdating(false);
  }
};
  /* ───────────────── Archiver ───────────────── */
  const handleArchive = (interventionId) => {
    setInterventionIdToArchive(interventionId);
  };

  const confirmArchive = async () => {
    const interventionId = interventionIdToArchive;
    setInterventionIdToArchive(null);
    try {
      const { error } = await supabase
        .from("interventions")
        .update({ archived: true, archived_at: new Date().toISOString() })
        .eq("id", interventionId);

      if (error) {
        console.error("Archive error:", error);
        showAlert("Erreur", "Impossible d’archiver la fiche.");
        return;
      }

      // Retire la fiche de la liste locale
      setAllInterventions((prev) => prev.filter((x) => x.id !== interventionId));
      showAlert("Archivée", "La fiche a été déplacée dans les archives.");
    } catch (e) {
      console.error(e);
      showAlert("Erreur", "Une erreur est survenue.");
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
      {/* ───── en-tête ───── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Produits réparés</Text>
        <TouchableOpacity
          style={styles.archivesLink}
          onPress={() => navigation.navigate("ArchivesInterventionsPage")}
          activeOpacity={0.85}
        >
          <Ionicons name="archive-outline" size={15} color="#fff" />
          <Text style={styles.archivesLinkText}>Archives</Text>
        </TouchableOpacity>
      </View>

      {/* ───── segment de filtre ───── */}
      <View style={styles.segment}>
        {["Réparé", "Non réparable"].map((lbl) => (
          <TouchableOpacity
            key={lbl}
            style={[styles.segBtn, filter === lbl && styles.segBtnActive]}
            onPress={() => setFilter(lbl)}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.segBtnText,
                filter === lbl && styles.segBtnTextActive,
              ]}
            >
              {lbl}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ───── recherche + suggestions ───── */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#94a3b8" style={styles.searchIcon} />
        <TextInput
          style={styles.search}
          placeholder="Recherche nom, fiche, type…"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>
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
          activeOpacity={0.8}
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
          activeOpacity={0.85}
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
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-done-circle-outline" size={40} color="#cbd5e1" />
            <Text style={styles.emptyStateText}>Aucune fiche à afficher</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const client = item.clients || null;
          const ficheNum = client?.ficheNumber ?? "—";
          const clientName = client?.name ?? "Client inconnu";
          const clientPhone = formatPhoneNumber(client?.phone) || "—";
          const deviceLine = [item.deviceType, item.brand].filter(Boolean).join(" ") || "—";
          const isNonReparable = item.status === "Non réparable";
          const selected = isSelected(item.id);
          return (
            <Animatable.View
              animation="fadeInUp"
              duration={350}
              delay={Math.min(index, 8) * 60}
              style={[
                styles.card,
                isNonReparable && styles.cardDanger,
                selected && styles.cardSelected,
              ]}
            >
              <TouchableOpacity
                onPress={() => handleCardPress(item)}
                onLongPress={() => handleCardLongPress(item)}
                delayLongPress={350}
                activeOpacity={0.85}
              >
                <View style={styles.cardTopRow}>
                  <View style={styles.ficheBadge}>
                    <Text style={styles.ficheBadgeText}>N° {ficheNum}</Text>
                  </View>
                  {isNonReparable && (
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusBadgeText}>Non réparable</Text>
                    </View>
                  )}
                  <View
                    style={[styles.checkbox, selected && styles.checkboxSelected]}
                  >
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </View>

                <Text style={styles.clientName} numberOfLines={1}>
                  {clientName}
                </Text>
                <Text style={styles.clientPhone}>{clientPhone}</Text>

                <View style={styles.deviceRow}>
                  <Ionicons name="hardware-chip-outline" size={15} color="#64748b" />
                  <Text style={styles.deviceText} numberOfLines={1}>
                    {deviceLine}
                  </Text>
                </View>

                <View style={styles.notifRow}>
                  {item.notifiedBy === "SMS" ? (
                    <View style={[styles.notifPill, styles.notifPillOk]}>
                      <Image
                        source={require("../assets/icons/sms.png")}
                        style={[styles.notifIcon, { tintColor: "#077907" }]}
                      />
                      <Text style={[styles.notifPillText, { color: "#077907" }]}>
                        SMS envoyé
                      </Text>
                    </View>
                  ) : item.notifiedBy === "Téléphone" ? (
                    <View style={[styles.notifPill, styles.notifPillInfo]}>
                      <Image
                        source={require("../assets/icons/call.png")}
                        style={[styles.notifIcon, { tintColor: "#3579ff" }]}
                      />
                      <Text style={[styles.notifPillText, { color: "#3579ff" }]}>
                        Appelé
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.notifPill, styles.notifPillAlert]}>
                      <Blinking
                        src={require("../assets/icons/notifications_off.png")}
                        tint="#dc2626"
                      />
                      <Text style={[styles.notifPillText, { color: "#dc2626" }]}>
                        Non notifié
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              {/* 👇 Bouton ARCHIVER visible uniquement pour "Non réparable" */}
              {isNonReparable && (
                <TouchableOpacity
                  style={styles.archiveBtn}
                  onPress={() => handleArchive(item.id)}
                  activeOpacity={0.9}
                >
                  <Image
                    source={require("../assets/icons/archive.png")}
                    style={{ width: 16, height: 16, marginRight: 8, tintColor: "#ffffff" }}
                  />
                  <Text style={styles.archiveBtnText}>Archiver</Text>
                </TouchableOpacity>
              )}
            </Animatable.View>
          );
        }}
      />

      <BottomNavigation navigation={navigation} currentRoute="RepairedInterventionsListPage" />

      <AlertBox
        visible={bulkRestitutionConfirmVisible}
        title="Confirmer la restitution"
        message={`Passer ${selectedIds.length} fiche${selectedIds.length > 1 ? "s" : ""} sélectionnée${selectedIds.length > 1 ? "s" : ""} au statut « Récupéré » ?`}
        cancelText="Annuler"
        confirmText="Confirmer"
        onClose={() => setBulkRestitutionConfirmVisible(false)}
        onConfirm={() => {
          setBulkRestitutionConfirmVisible(false);
          handleBulkRestitution();
        }}
      />

      <AlertBox
        visible={!!interventionIdToArchive}
        title="Archiver la fiche"
        message="Confirmer l’archive de cette fiche (Non réparable) ?"
        cancelText="Annuler"
        confirmText="Archiver"
        onClose={() => setInterventionIdToArchive(null)}
        onConfirm={confirmArchive}
      />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}

/* ───────────────── styles ───────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
  },
  archivesLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#334155",
    borderRadius: 20,
  },
  archivesLinkText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  segment: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  segBtnActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segBtnText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
  segBtnTextActive: { color: "#0f172a" },

  searchWrap: {
    position: "relative",
    justifyContent: "center",
    marginBottom: 4,
  },
  searchIcon: {
    position: "absolute",
    left: 14,
    zIndex: 1,
  },
  search: {
    backgroundColor: "#fff",
    paddingHorizontal: 40,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 15,
    color: "#0f172a",
  },
  suggestBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    marginTop: 6,
    overflow: "hidden",
  },
  suggestItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    fontSize: 14,
    color: "#334155",
  },

  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  selectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
  },
  selectionCount: {
    flex: 1,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  restituteBtn: {
    minWidth: 105,
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#15803d",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  restituteBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 13,
  },
  disabledBtn: {
    backgroundColor: "#cbd5e1",
    opacity: 0.8,
  },
  selectionHint: {
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 10,
    marginLeft: 2,
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
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

  listContent: { paddingBottom: 90, paddingTop: 4 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#94a3b8",
    fontWeight: "600",
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardDanger: {
    borderLeftWidth: 4,
    borderLeftColor: "#dc2626",
  },
  cardSelected: {
    backgroundColor: "#eff6ff",
    borderWidth: 1.5,
    borderColor: "#2563eb",
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  ficheBadge: {
    backgroundColor: "#eef2ff",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  ficheBadgeText: {
    color: "#4338ca",
    fontWeight: "700",
    fontSize: 12,
  },
  statusBadge: {
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  statusBadgeText: {
    color: "#b91c1c",
    fontWeight: "700",
    fontSize: 11,
  },

  clientName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f172a",
    marginTop: 2,
  },
  clientPhone: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },

  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  deviceText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
  },

  notifRow: {
    flexDirection: "row",
    marginTop: 10,
  },
  notifPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  notifPillOk: { backgroundColor: "#dcfce7" },
  notifPillInfo: { backgroundColor: "#dbeafe" },
  notifPillAlert: { backgroundColor: "#fee2e2" },
  notifPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  notifIcon: { width: 16, height: 16 },

  archiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#991B1B",
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  archiveBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
