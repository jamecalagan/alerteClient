// pages/PcComponentsTablePage.js
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  SafeAreaView,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRoute } from "@react-navigation/native";

// ----------------------------
//  Templates de composants
// ----------------------------

const GAMER_COMPONENTS = [
  { id: "case", category: "Boîtier", hint: "Ex : moyen tour RGB, vitre latérale…" },
  { id: "motherboard", category: "Carte mère", hint: "Ex : chipset gaming, ATX/mATX…" },
  { id: "cpu", category: "Processeur", hint: "Ex : i5 / Ryzen 5, X cœurs, fréquence…" },
  { id: "ram", category: "Mémoire RAM", hint: "Ex : 16/32 Go, fréquence, CL…" },
  { id: "gpu", category: "Carte graphique", hint: "Ex : RTX / RX, quantité de VRAM…" },
  { id: "ssd", category: "SSD principal", hint: "Ex : NVMe 1 To, gamme, vitesses…" },
  {
    id: "hdd",
    category: "Stockage secondaire",
    hint: 'Ex : HDD 2 To pour données (optionnel)…',
  },
  {
    id: "psu",
    category: "Alimentation",
    hint: "Ex : 650/750 W, 80+ Gold, modulaire…",
  },
  {
    id: "cooling",
    category: "Refroidissement CPU",
    hint: "Ex : ventirad / AIO, taille, LEDs…",
  },
  {
    id: "fans",
    category: "Ventilation boîtier",
    hint: "Ex : nombre de ventilateurs, 120/140 mm…",
  },
  {
    id: "assembly",
    category: "Prestation montage",
    hint: "Ex : montage complet, câblage, tests…",
  },
  {
    id: "os",
    category: "Installation système",
    hint: "Ex : installation Windows, mises à jour…",
  },
  {
    id: "drivers",
    category: "Configuration / pilotes",
    hint: "Ex : pilotes, logiciels indispensables, tests…",
  },
];

const OFFICE_COMPONENTS = [
  {
    id: "case_office",
    category: "Boîtier",
    hint: "Ex : boîtier sobre, format µATX / mini tour…",
  },
  {
    id: "motherboard_office",
    category: "Carte mère",
    hint: "Ex : carte mère µATX, chipset entrée de gamme…",
  },
  {
    id: "cpu_office",
    category: "Processeur",
    hint: "Ex : i3 / Ryzen 3 ou équivalent, faible conso…",
  },
  {
    id: "ram_office",
    category: "Mémoire RAM",
    hint: "Ex : 8/16 Go, DDR4/DDR5, fréquence classique…",
  },
  {
    id: "graphics_office",
    category: "Solution graphique",
    hint: "Ex : graphique intégrée ou petite carte dédiée…",
  },
  {
    id: "ssd_office",
    category: "SSD système",
    hint: "Ex : SSD 500 Go ou 1 To pour système et données…",
  },
  {
    id: "hdd_office",
    category: "Stockage supplémentaire",
    hint: "Ex : HDD 1/2 To pour sauvegardes (optionnel)…",
  },
  {
    id: "psu_office",
    category: "Alimentation",
    hint: "Ex : 400–500 W, 80+ Bronze, silencieuse…",
  },
  {
    id: "cooling_office",
    category: "Refroidissement",
    hint: "Ex : ventirad d’origine ou silencieux…",
  },
  {
    id: "optical_office",
    category: "Lecteur optique",
    hint: "Ex : graveur DVD / lecteur externe (si demandé)…",
  },
  {
    id: "assembly_office",
    category: "Prestation montage",
    hint: "Montage de l’unité centrale, câblage propre…",
  },
  {
    id: "os_office",
    category: "Installation système",
    hint: "Installation Windows / Linux + mises à jour…",
  },
  {
    id: "soft_office",
    category: "Logiciels bureautiques",
    hint: "Ex : suite bureautique, antivirus, outils divers…",
  },
];

const TEMPLATES = {
  gamer: GAMER_COMPONENTS,
  bureau: OFFICE_COMPONENTS,
};

export default function PcComponentsTablePage({ navigation }) {
  const route = useRoute();
  // Permet éventuellement de passer profile: "gamer" ou "bureau" plus tard
  const initialProfile = route.params?.profile === "bureau" ? "bureau" : "gamer";

  const [profile, setProfile] = useState(initialProfile);

  const [rows, setRows] = useState(
    TEMPLATES[initialProfile].map((c) => ({
      ...c,
      brand: "",
      model: "",
      details: "",
    }))
  );
  const [selectedIds, setSelectedIds] = useState([]);

  const handleChangeProfile = (newProfile) => {
    if (newProfile === profile) return;
    // On réinitialise la page pour changer de type de PC
    setProfile(newProfile);
    setRows(
      TEMPLATES[newProfile].map((c) => ({
        ...c,
        brand: "",
        model: "",
        details: "",
      }))
    );
    setSelectedIds([]);
  };

  const toggleSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleChangeField = (id, field, value) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  };

  // Texte final pour le devis
  const selectionText = useMemo(() => {
    return rows
      .filter((row) => selectedIds.includes(row.id))
      .map((row) => {
        const brand = row.brand?.trim();
        const model = row.model?.trim();
        const details = row.details?.trim();

        const partsLabel = [];
        if (brand) partsLabel.push(brand);
        if (model) partsLabel.push(model);
        const label = partsLabel.join(" ");

        if (!label && !details) {
          return `- ${row.category}`;
        }
        if (label && !details) {
          return `- ${row.category} : ${label}`;
        }
        if (!label && details) {
          return `- ${row.category} : ${details}`;
        }
        return `- ${row.category} : ${label} - ${details}`;
      })
      .join("\n");
  }, [rows, selectedIds]);

  const handleCopyToClipboard = async () => {
    if (!selectionText.trim()) {
      Alert.alert(
        "Aucune sélection",
        "Coche au moins un composant et remplis les champs avant de copier."
      );
      return;
    }

    try {
      await Clipboard.setStringAsync(selectionText);
      Alert.alert(
        "Texte copié",
        "La liste détaillée est copiée.\nTu peux la coller dans le champ prestations / produits de ton devis."
      );
    } catch (e) {
      Alert.alert(
        "Erreur",
        "Impossible de copier automatiquement. Tu peux sélectionner le texte dans la zone en bas et le copier manuellement."
      );
    }
  };

  const title =
    profile === "gamer"
      ? "Préparation PC Gamer"
      : "Préparation PC Bureautique";

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Titre */}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          Coche les lignes à inclure puis remplis{" "}
          <Text style={styles.bold}>Marque / Modèle / Détails</Text>.
          Ensuite, copie le résultat pour le coller dans ton devis.
        </Text>

        {/* Sélecteur de profil */}
        <View style={styles.profileRow}>
          <TouchableOpacity
            style={[
              styles.profileButton,
              profile === "gamer" && styles.profileButtonActive,
            ]}
            onPress={() => handleChangeProfile("gamer")}
          >
            <Text
              style={[
                styles.profileButtonText,
                profile === "gamer" && styles.profileButtonTextActive,
              ]}
            >
              PC Gamer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.profileButton,
              profile === "bureau" && styles.profileButtonActive,
            ]}
            onPress={() => handleChangeProfile("bureau")}
          >
            <Text
              style={[
                styles.profileButtonText,
                profile === "bureau" && styles.profileButtonTextActive,
              ]}
            >
              PC Bureautique
            </Text>
          </TouchableOpacity>
        </View>

        {/* Entête du tableau */}
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.headerCheck]}>Inclure</Text>
          <Text style={[styles.headerCell, styles.headerCategory]}>
            Catégorie
          </Text>
          <Text style={[styles.headerCell, styles.headerDetails]}>
            Détails (marque, modèle, détails)
          </Text>
        </View>

        {/* Corps du tableau */}
        <ScrollView style={styles.tableBody}>
          {rows.map((row) => {
            const isSelected = selectedIds.includes(row.id);
            return (
              <View key={row.id} style={styles.row}>
                {/* Case à cocher */}
                <TouchableOpacity
                  style={styles.checkCell}
                  onPress={() => toggleSelection(row.id)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxChecked,
                    ]}
                  >
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </TouchableOpacity>

                {/* Catégorie */}
                <View style={styles.categoryCell}>
                  <Text style={styles.categoryText}>{row.category}</Text>
                </View>

                {/* Zones de saisie */}
                <View style={styles.detailsCell}>
                  <View style={styles.inputRow}>
                    <Text style={styles.label}>Marque :</Text>
                    <TextInput
                      style={styles.input}
                      value={row.brand}
                      onChangeText={(text) =>
                        handleChangeField(row.id, "brand", text)
                      }
                      placeholder="Ex : ASUS, MSI, Dell, HP…"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <View style={styles.inputRow}>
                    <Text style={styles.label}>Modèle :</Text>
                    <TextInput
                      style={styles.input}
                      value={row.model}
                      onChangeText={(text) =>
                        handleChangeField(row.id, "model", text)
                      }
                      placeholder="Ex : TUF B650, Optiplex, etc."
                      placeholderTextColor="#9ca3af"
                    />
                  </View>

                  <View style={styles.inputRowColumn}>
                    <Text style={styles.label}>Détails :</Text>
                    <TextInput
                      style={[styles.input, styles.inputMultiline]}
                      value={row.details}
                      onChangeText={(text) =>
                        handleChangeField(row.id, "details", text)
                      }
                      placeholder={row.hint}
                      placeholderTextColor="#9ca3af"
                      multiline
                      textAlignVertical="top"
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Boutons d'action */}
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={clearSelection}
          >
            <Text style={styles.buttonSecondaryText}>Tout décocher</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={handleCopyToClipboard}
          >
            <Text style={styles.buttonPrimaryText}>Copier la sélection</Text>
          </TouchableOpacity>
        </View>

        {/* Prévisualisation du texte final */}
        <Text style={styles.previewLabel}>Texte généré pour le devis :</Text>
        <TextInput
          style={styles.previewBox}
          value={selectionText}
          editable={false}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.previewHelp}>
          Tu peux aussi sélectionner ce texte manuellement, puis le coller dans
          ton champ prestations / produits.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f2f4f8",
  },
  container: {
    flex: 1,
    padding: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
    color: "#1b3b6f",
  },
  subtitle: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 10,
  },
  bold: {
    fontWeight: "700",
  },
  profileRow: {
    flexDirection: "row",
    marginBottom: 8,
    marginTop: 4,
  },
  profileButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "#eef2ff",
    alignItems: "center",
    marginRight: 4,
  },
  profileButtonActive: {
    backgroundColor: "#4f46e5",
    borderColor: "#4338ca",
  },
  profileButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3730a3",
  },
  profileButtonTextActive: {
    color: "#ffffff",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e0e7ff",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  headerCell: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  headerCheck: {
    width: 60,
    textAlign: "center",
  },
  headerCategory: {
    width: 90,
  },
  headerDetails: {
    flex: 1,
    paddingLeft: 4,
  },
  tableBody: {
    marginTop: 6,
    marginBottom: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#ffffff",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  checkCell: {
    width: 60,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f9fafb",
  },
  checkboxChecked: {
    backgroundColor: "#2563eb",
    borderColor: "#1d4ed8",
  },
  checkmark: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  categoryCell: {
    width: 90,
    justifyContent: "flex-start",
    paddingTop: 6,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  detailsCell: {
    flex: 1,
    paddingLeft: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  inputRowColumn: {
    marginBottom: 4,
  },
  label: {
    width: 80,
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    flex: 1,
    minHeight: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    backgroundColor: "#f9fafb",
  },
  inputMultiline: {
    minHeight: 46,
  },
  buttonsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: "#9ca3af",
    backgroundColor: "#fef3c7",
  },
  buttonSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400e",
  },
  buttonPrimary: {
    backgroundColor: "#2563eb",
  },
  buttonPrimaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  separator: {
    width: 8,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  previewBox: {
    minHeight: 110,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#9ca3af",
    backgroundColor: "#ffffff",
    padding: 8,
    fontSize: 12,
  },
  previewHelp: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
  },
});
