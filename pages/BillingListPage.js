// pages/BillingListPage.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const pageSize = 3;

export default function BillingListPage() {
  const [bills, setBills] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showDeleted, setShowDeleted] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);
  const navigation = useNavigation();
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [filteredBills, setFilteredBills] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetchBills();
  }, [showDeleted]);

  const fetchBills = async () => {
    const { data, error } = await supabase
      .from("billing")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erreur chargement factures:", error);
      return;
    }

    const actives = data.filter((bill) => !bill.deleted);
    const deleted = data.filter((bill) => bill.deleted);

    setActiveCount(actives.length);
    setDeletedCount(deleted.length);

    const base = showDeleted ? deleted : actives;
    setBills(base);
    setFilteredBills(base);
    setCurrentPage(1);
    setSelectedIds([]);
  };

  const handleSearch = (text) => {
    setSearchText(text);
    const hasText = text.trim().length > 0;
    setIsSearching(hasText);

    const base = showDeleted
      ? bills.filter((b) => b.deleted)
      : bills.filter((b) => !b.deleted || showDeleted); // bills contient déjà le bon set

    if (!hasText) {
      setFilteredBills(base);
      setCurrentPage(1);
      return;
    }

    const lower = text.toLowerCase();
    const filtered = base.filter(
      (bill) =>
        (bill.clientname || "")
          .toLowerCase()
          .includes(lower) ||
        (bill.invoicenumber || "")
          .toLowerCase()
          .includes(lower)
    );

    setFilteredBills(filtered);
    setCurrentPage(1);
  };

  // Source pour la pagination : recherche ou liste normale
  const listSource = isSearching ? filteredBills : bills;
  const totalPages = Math.max(1, Math.ceil(listSource.length / pageSize));

  const billsToDisplay = listSource.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const deleteBill = async (id) => {
    Alert.alert("Confirmation", "Supprimer cette facture ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("billing")
            .update({ deleted: true })
            .eq("id", id);
          if (error) {
            console.error("Erreur suppression:", error);
          } else {
            fetchBills();
          }
        },
      },
    ]);
  };

  const restoreBill = async (id) => {
    const { error } = await supabase
      .from("billing")
      .update({ deleted: false })
      .eq("id", id);
    if (!error) fetchBills();
  };

  const toggleSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const confirmPermanentDelete = (bill) => {
    Alert.alert(
      "Suppression définitive",
      "Cette action est irréversible. Supprimer définitivement cette facture ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("billing")
              .delete()
              .eq("id", bill.id);

            if (error) {
              console.error("Erreur suppression définitive :", error);
              Alert.alert("Erreur", "Erreur lors de la suppression.");
            } else {
              Alert.alert("Information", "Facture supprimée définitivement.");
              fetchBills();
            }
          },
        },
      ]
    );
  };

  const handleBulkDelete = () => {
    Alert.alert(
      "Suppression groupée",
      `Supprimer ${selectedIds.length} facture(s) ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("billing")
              .update({ deleted: true })
              .in("id", selectedIds);

            if (error) {
              console.error("Erreur suppression multiple :", error);
              Alert.alert("Erreur", "Erreur lors de la suppression.");
            } else {
              Alert.alert("Information", "Factures supprimées.");
              setSelectedIds([]);
              fetchBills();
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingBottom: 120 },
        ]}
      >
        <Text style={styles.title}>Liste des factures</Text>

        {/* Recherche */}
        <View style={styles.searchWrapper}>
          <Text
            style={[
              styles.floatingLabel,
              (isSearching || searchText) && styles.floatingLabelActive,
            ]}
          >
            Rechercher facture ou client
          </Text>
          <View
            style={[
              styles.inputContainer,
              (isSearching || searchText) && styles.inputContainerActive,
            ]}
          >
            <TextInput
              style={styles.searchInputStyled}
              value={searchText}
              onChangeText={handleSearch}
              placeholder="Ex : Dupont, FAC-123"
              placeholderTextColor="#9ca3af"
              onFocus={() => setIsSearching(true)}
              onBlur={() => {
                if (!searchText) setIsSearching(false);
              }}
            />
          </View>
        </View>

        {/* Actives / Supprimées */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            onPress={() => setShowDeleted(false)}
            style={[
              styles.toggleButton,
              !showDeleted && styles.toggleActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                !showDeleted && styles.toggleTextActive,
              ]}
            >
              Actives ({activeCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowDeleted(true)}
            style={[
              styles.toggleButton,
              showDeleted && styles.toggleActive,
            ]}
          >
            <Text
              style={[
                styles.toggleText,
                showDeleted && styles.toggleTextActive,
              ]}
            >
              Supprimées ({deletedCount})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Liste des factures */}
        {billsToDisplay.map((bill) => {
          const isSelected = selectedIds.includes(bill.id);
          const totalTtc = parseFloat(bill.totalttc || 0).toFixed(2);
          const dateStr = bill.invoicedate
            ? new Date(bill.invoicedate).toLocaleDateString()
            : "—";

          return (
            <View
              key={bill.id}
              style={[
                styles.card,
                isSelected && styles.cardSelected,
              ]}
            >
              {/* En-tête carte */}
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.cardClient}>
                    {bill.clientname || "Client inconnu"}
                  </Text>
                  <Text style={styles.cardInvoice}>
                    Facture n° {bill.invoicenumber || "—"}
                  </Text>
                </View>

                <View style={styles.cardHeaderRight}>
                  <TouchableOpacity
                    onPress={() => toggleSelection(bill.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        isSelected && styles.checkboxChecked,
                      ]}
                    >
                      {isSelected && (
                        <Text style={styles.checkboxTick}>✓</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.cardTotal}>{totalTtc} €</Text>
                </View>
              </View>

              {/* Métadonnées */}
              <View style={styles.cardMetaRow}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Date</Text>
                  <Text style={styles.metaValue}>{dateStr}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Statut</Text>
                  <Text
                    style={[
                      styles.metaValue,
                      showDeleted ? styles.metaDeleted : styles.metaActive,
                    ]}
                  >
                    {showDeleted ? "Supprimée" : "Active"}
                  </Text>
                </View>
              </View>

              {/* Séparateur actions */}
              <View style={styles.cardDivider} />

              {/* Actions */}
              {showDeleted ? (
                <View style={styles.actionsTextRow}>
                  <TouchableOpacity
                    onPress={() => restoreBill(bill.id)}
                  >
                    <Text style={styles.actionsTextPrimary}>
                      Restaurer
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.actionsDivider}>|</Text>

                  <TouchableOpacity
                    onPress={() => confirmPermanentDelete(bill)}
                  >
                    <Text style={styles.actionsTextDanger}>
                      Supprimer définitivement
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.actionsTextRow}>
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate("BillingEditPage", {
                        id: bill.id,
                      })
                    }
                  >
                    <Text style={styles.actionsTextPrimary}>
                      Modifier / Imprimer
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.actionsDivider}>|</Text>

                  <TouchableOpacity
                    onPress={() => deleteBill(bill.id)}
                  >
                    <Text style={styles.actionsTextDanger}>
                      Supprimer
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Pagination */}
        <View style={styles.pagination}>
          <TouchableOpacity
            style={[
              styles.pageButton,
              currentPage === 1 && styles.pageButtonDisabled,
            ]}
            onPress={() =>
              setCurrentPage((prev) => Math.max(prev - 1, 1))
            }
            disabled={currentPage === 1}
          >
            <Text
              style={[
                styles.pageButtonText,
                currentPage === 1 && styles.pageButtonTextDisabled,
              ]}
            >
              Précédent
            </Text>
          </TouchableOpacity>

          <Text style={styles.pageIndicator}>
            Page {currentPage}/{totalPages}
          </Text>

          <TouchableOpacity
            style={[
              styles.pageButton,
              currentPage === totalPages &&
                styles.pageButtonDisabled,
            ]}
            onPress={() =>
              setCurrentPage((prev) =>
                Math.min(prev + 1, totalPages)
              )
            }
            disabled={currentPage === totalPages}
          >
            <Text
              style={[
                styles.pageButtonText,
                currentPage === totalPages &&
                  styles.pageButtonTextDisabled,
              ]}
            >
              Suivant
            </Text>
          </TouchableOpacity>
        </View>

        {/* Suppression groupée */}
        {selectedIds.length > 0 && (
          <View style={styles.bulkBlock}>
            <View style={styles.cardDivider} />
            <TouchableOpacity onPress={handleBulkDelete}>
              <Text style={styles.bulkDeleteText}>
                Supprimer la sélection ({selectedIds.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bouton retour fixe */}
      <TouchableOpacity
        style={styles.returnButtonFixed}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.returnButtonText}>Retour</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 16,
    color: "#111827",
    textAlign: "center",
  },

  /* Recherche */
  searchWrapper: {
    marginBottom: 16,
    paddingHorizontal: 4,
    position: "relative",
  },
  floatingLabel: {
    position: "absolute",
    top: -10,
    left: 16,
    backgroundColor: "#ffffff",
    paddingHorizontal: 4,
    fontSize: 13,
    color: "#6b7280",
    zIndex: 2,
  },
  floatingLabelActive: {
    color: "#6b4e16",
    fontWeight: "700",
  },
  inputContainer: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  inputContainerActive: {
    borderColor: "#6b4e16",
    borderWidth: 2,
  },
  searchInputStyled: {
    fontSize: 15,
    paddingVertical: 8,
    color: "#111827",
  },

  /* Toggle actif / supprimé */
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
  },
  toggleActive: {
    backgroundColor: "#6b4e16",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  toggleTextActive: {
    color: "#ffffff",
  },

  /* Carte facture */
  card: {
    backgroundColor: "#ffffff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  cardSelected: {
    borderColor: "#b91c1c",
    borderWidth: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  cardClient: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  cardInvoice: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
  cardHeaderRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  cardTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },

  /* Checkbox sélection */
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#9ca3af",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxChecked: {
    backgroundColor: "#6b4e16",
    borderColor: "#6b4e16",
  },
  checkboxTick: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  /* Métadonnées carte */
  cardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  metaItem: {
    flexDirection: "column",
  },
  metaLabel: {
    fontSize: 11,
    color: "#6b7280",
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  metaActive: {
    color: "#15803d",
  },
  metaDeleted: {
    color: "#b91c1c",
  },

  cardDivider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 6,
  },

  /* Actions texte */
  actionsTextRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  actionsTextPrimary: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  actionsTextDanger: {
    fontSize: 13,
    fontWeight: "600",
    color: "#b91c1c",
  },
  actionsDivider: {
    fontSize: 12,
    color: "#9ca3af",
  },

  /* Pagination */
  pagination: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  pageButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
  },
  pageButtonDisabled: {
    backgroundColor: "#f3f4f6",
  },
  pageButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
  },
  pageButtonTextDisabled: {
    color: "#9ca3af",
  },
  pageIndicator: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },

  /* Suppression groupée */
  bulkBlock: {
    marginTop: 12,
  },
  bulkDeleteText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#b91c1c",
    textAlign: "right",
  },

  /* Bouton retour fixe */
  returnButtonFixed: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: "#6b4e16",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    zIndex: 100,
  },
  returnButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
