// pages/BillingListPage.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { supabase } from "../supabaseClient";
import AlertBox from "../components/AlertBox";
import CustomAlert from "../components/CustomAlert";

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
  const [confirmDialog, setConfirmDialog] = useState({
    visible: false,
    title: "",
    message: "",
    onConfirm: null,
  });
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const openConfirm = (title, message, onConfirm) => {
    setConfirmDialog({ visible: true, title, message, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmDialog((prev) => ({ ...prev, visible: false }));
  };

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };
  const [filteredBills, setFilteredBills] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [periodFilter, setPeriodFilter] = useState("month");
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  useEffect(() => {
    fetchBills();
  }, [showDeleted]);

  useEffect(() => {
    setCurrentPage(1);
  }, [unpaidOnly]);

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

  // —— Total de la période (pour les déclarations de TVA) ——
  const matchesPeriod = (dateStr, period) => {
    if (period === "all") return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d)) return false;
    const now = new Date();
    if (period === "month") {
      return (
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    }
    if (period === "quarter") {
      return (
        Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3) &&
        d.getFullYear() === now.getFullYear()
      );
    }
    if (period === "year") {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  };

  const periodBills = bills.filter((b) => matchesPeriod(b.invoicedate, periodFilter));
  const periodTotals = periodBills.reduce(
    (acc, b) => ({
      ht: acc.ht + (parseFloat(b.totalht) || 0),
      tva: acc.tva + (parseFloat(b.totaltva) || 0),
      ttc: acc.ttc + (parseFloat(b.totalttc) || 0),
    }),
    { ht: 0, tva: 0, ttc: 0 }
  );

  const exportPeriodCsv = async () => {
    if (periodBills.length === 0) {
      showAlert("Export impossible", "Aucune facture sur cette période.");
      return;
    }

    const escapeCsv = (value) => {
      const str = String(value ?? "");
      return /[",;\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const header = [
      "Numéro",
      "Date",
      "Client",
      "Téléphone",
      "Total HT",
      "TVA",
      "Total TTC",
      "Acompte",
      "Payée",
      "Mode de paiement",
    ];

    const rows = periodBills.map((b) => [
      b.invoicenumber || "",
      b.invoicedate ? new Date(b.invoicedate).toLocaleDateString("fr-FR") : "",
      b.clientname || "",
      b.clientphone || "",
      (parseFloat(b.totalht) || 0).toFixed(2),
      (parseFloat(b.totaltva) || 0).toFixed(2),
      (parseFloat(b.totalttc) || 0).toFixed(2),
      (parseFloat(b.acompte) || 0).toFixed(2),
      b.paid ? "Oui" : "Non",
      b.paymentmethod || "",
    ]);

    // Séparateur ";" et BOM UTF-8 : convention Excel en locale française
    const csvContent =
      "﻿" +
      [header, ...rows].map((r) => r.map(escapeCsv).join(";")).join("\n");

    const fileName = `Factures_${periodFilter}_${Date.now()}.csv`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;

    try {
      await FileSystem.writeAsStringAsync(fileUri, csvContent);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/csv",
          dialogTitle: "Exporter les factures",
        });
      } else {
        showAlert(
          "Export",
          "Fichier créé mais le partage n'est pas disponible sur cet appareil."
        );
      }
    } catch (e) {
      console.error("Erreur export CSV:", e);
      showAlert("Erreur", "Impossible de créer le fichier d'export.");
    }
  };

  // —— Factures impayées ——
  const unpaidBills = bills.filter((b) => !b.paid);
  const unpaidTotal = unpaidBills.reduce(
    (sum, b) => sum + (parseFloat(b.totalttc) || 0),
    0
  );

  // Source pour la pagination : recherche ou liste normale
  const searchSource = isSearching ? filteredBills : bills;
  const listSource = unpaidOnly
    ? searchSource.filter((b) => !b.paid)
    : searchSource;
  const totalPages = Math.max(1, Math.ceil(listSource.length / pageSize));

  const billsToDisplay = listSource.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const deleteBill = (id) => {
    openConfirm("Confirmation", "Supprimer cette facture ?", async () => {
      const { error } = await supabase
        .from("billing")
        .update({ deleted: true })
        .eq("id", id);
      if (error) {
        console.error("Erreur suppression:", error);
      } else {
        fetchBills();
      }
    });
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
    openConfirm(
      "Suppression définitive",
      "Cette action est irréversible. Supprimer définitivement cette facture ?",
      async () => {
        const { error } = await supabase
          .from("billing")
          .delete()
          .eq("id", bill.id);

        if (error) {
          console.error("Erreur suppression définitive :", error);
          showAlert("Erreur", "Erreur lors de la suppression.");
        } else {
          showAlert("Information", "Facture supprimée définitivement.");
          fetchBills();
        }
      }
    );
  };

  const handleBulkDelete = () => {
    openConfirm(
      "Suppression groupée",
      `Supprimer ${selectedIds.length} facture(s) ?`,
      async () => {
        const { error } = await supabase
          .from("billing")
          .update({ deleted: true })
          .in("id", selectedIds);

        if (error) {
          console.error("Erreur suppression multiple :", error);
          showAlert("Erreur", "Erreur lors de la suppression.");
        } else {
          showAlert("Information", "Factures supprimées.");
          setSelectedIds([]);
          fetchBills();
        }
      }
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

        {/* Total de la période (TVA / CA) */}
        <View style={styles.periodBlock}>
          <View style={styles.periodTabsRow}>
            {[
              { key: "month", label: "Ce mois" },
              { key: "quarter", label: "Ce trimestre" },
              { key: "year", label: "Cette année" },
              { key: "all", label: "Tout" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setPeriodFilter(opt.key)}
                style={[
                  styles.periodTab,
                  periodFilter === opt.key && styles.periodTabActive,
                ]}
              >
                <Text
                  style={[
                    styles.periodTabText,
                    periodFilter === opt.key && styles.periodTabTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.periodTotalsRow}>
            <View style={styles.periodTotalItem}>
              <Text style={styles.periodTotalLabel}>Total HT</Text>
              <Text style={styles.periodTotalValue}>
                {periodTotals.ht.toFixed(2)} €
              </Text>
            </View>
            <View style={styles.periodTotalItem}>
              <Text style={styles.periodTotalLabel}>TVA collectée</Text>
              <Text style={styles.periodTotalValue}>
                {periodTotals.tva.toFixed(2)} €
              </Text>
            </View>
            <View style={styles.periodTotalItem}>
              <Text style={styles.periodTotalLabel}>Total TTC</Text>
              <Text style={styles.periodTotalValue}>
                {periodTotals.ttc.toFixed(2)} €
              </Text>
            </View>
          </View>
          <Text style={styles.periodCount}>
            {periodBills.length} facture{periodBills.length > 1 ? "s" : ""}
            {showDeleted ? " supprimée(s)" : " active(s)"} sur la période
          </Text>

          <TouchableOpacity
            style={styles.exportButton}
            onPress={exportPeriodCsv}
          >
            <Text style={styles.exportButtonText}>
              📤 Exporter (CSV)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Factures impayées */}
        {unpaidBills.length > 0 && (
          <TouchableOpacity
            style={[
              styles.unpaidBanner,
              unpaidOnly && styles.unpaidBannerActive,
            ]}
            onPress={() => setUnpaidOnly((v) => !v)}
          >
            <Text style={styles.unpaidBannerText}>
              ⚠️ {unpaidBills.length} facture{unpaidBills.length > 1 ? "s" : ""} impayée
              {unpaidBills.length > 1 ? "s" : ""} — {unpaidTotal.toFixed(2)} €
            </Text>
            <Text style={styles.unpaidBannerHint}>
              {unpaidOnly ? "Appuyer pour tout afficher" : "Appuyer pour filtrer"}
            </Text>
          </TouchableOpacity>
        )}

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
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Paiement</Text>
                  <Text
                    style={[
                      styles.metaValue,
                      bill.paid ? styles.metaActive : styles.metaDeleted,
                    ]}
                  >
                    {bill.paid ? "Payée" : "Impayée"}
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

      <AlertBox
        visible={confirmDialog.visible}
        title={confirmDialog.title}
        message={confirmDialog.message}
        cancelText="Annuler"
        confirmText="Supprimer"
        onClose={closeConfirm}
        onConfirm={() => {
          closeConfirm();
          if (confirmDialog.onConfirm) confirmDialog.onConfirm();
        }}
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

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 16,
    color: "#111827",
    textAlign: "center",
  },

  /* Total période */
  periodBlock: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 16,
  },
  periodTabsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
  },
  periodTabActive: {
    backgroundColor: "#111827",
  },
  periodTabText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  periodTabTextActive: {
    color: "#ffffff",
  },
  periodTotalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  periodTotalItem: {
    alignItems: "center",
    flex: 1,
  },
  periodTotalLabel: {
    fontSize: 11,
    color: "#6b7280",
    marginBottom: 2,
  },
  periodTotalValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  periodCount: {
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 8,
  },
  exportButton: {
    marginTop: 10,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  exportButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },

  /* Factures impayées */
  unpaidBanner: {
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  unpaidBannerActive: {
    backgroundColor: "#FDE68A",
    borderColor: "#B45309",
  },
  unpaidBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
    textAlign: "center",
  },
  unpaidBannerHint: {
    fontSize: 11,
    color: "#92400E",
    textAlign: "center",
    marginTop: 2,
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
