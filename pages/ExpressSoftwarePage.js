import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";
import { commonStyles } from "../themes/modernTheme";

const SOFTWARE_TYPE_OPTIONS = [
  "Installation antivirus",
  "Installation logiciel de bureau",
  "Installation système",
  "Mise à jour système",
  "Maintenance système",
  "Suppression de virus / logiciels malveillants",
  "Optimisation / nettoyage du PC",
  "Sauvegarde de données",
  "Récupération de données",
  "Transfert de données (ancien vers nouveau PC)",
  "Installation de pilotes (drivers)",
  "Configuration réseau / Wi-Fi",
  "Paramétrage messagerie / boîte mail",
  "Formation utilisateur",
];

const SOFTWARE_PRODUCT_OPTIONS = [
  "Kaspersky",
  "Bitdefender",
  "Norton",
  "McAfee",
  "Microsoft Windows 11",
  "Microsoft Windows 10",
  "Microsoft Office 365",
  "Microsoft Office 2021",
  "Adobe Photoshop",
  "Adobe Acrobat Reader",
  "LibreOffice",
  "Google Chrome",
  "Mozilla Firefox",
];

export default function ExpressSoftwarePage() {
  const navigation = useNavigation();
  const route = useRoute();
  const isEdit = route.params?.isEdit || false;
  const editData = route.params?.expressData || {};

  const [searchText, setSearchText] = useState("");
  const [filteredClients, setFilteredClients] = useState([]);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const [name, setName] = useState(editData.name || "");
  const [phone, setPhone] = useState(editData.phone || "");
  const [email, setEmail] = useState(editData.email || "");
  const [softwaretype, setSoftwaretype] = useState(editData.softwaretype || "");
  const [description, setDescription] = useState(editData.description || "");
  const [licence, setLicence] = useState(editData.licence || "");
  const [price, setPrice] = useState(editData.price ? String(editData.price) : "");
  const [date, setDate] = useState(editData.date || new Date().toISOString().split("T")[0]); // affichage local seulement
const [isPaid, setIsPaid] = useState(
  editData?.paid === true || editData?.paymentStatus === "paid"
);

  // Anti double-clic
  const [saving, setSaving] = useState(false);

  // Suggestions "Type de prestation" et "Nom du produit"
  const [typeSuggestions, setTypeSuggestions] = useState([]);
  const [showTypeSuggestions, setShowTypeSuggestions] = useState(false);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);

  const filterOptions = (options, text) => {
    const q = (text || "").trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  };

  const onSoftwaretypeChange = (text) => {
    setSoftwaretype(text);
    setTypeSuggestions(filterOptions(SOFTWARE_TYPE_OPTIONS, text));
    setShowTypeSuggestions(true);
  };

  const onDescriptionChange = (text) => {
    setDescription(text);
    setProductSuggestions(filterOptions(SOFTWARE_PRODUCT_OPTIONS, text));
    setShowProductSuggestions(true);
  };

  // === Confirmation avant de quitter avec des modifications non enregistrées ===
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState(null);
  const skipDirtyRef = useRef(true); // true au montage et pendant le chargement d'une fiche existante

  useEffect(() => {
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [name, phone, email, softwaretype, description, licence, price, isPaid]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      setPendingLeaveAction(() => () => navigation.dispatch(e.data.action));
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  useEffect(() => {
    if (isEdit && editData) {
      skipDirtyRef.current = true; // le chargement ne doit pas marquer la fiche comme modifiée
      setName(editData.name || "");
      setPhone(editData.phone || "");
      setEmail(editData.email || "");
      setSoftwaretype(editData.softwaretype || "");
      setDescription(editData.description || "");
      setLicence(editData.licence || "");
      setPrice(editData.price ? String(editData.price) : "");
      setDate(editData.date || new Date().toISOString().split("T")[0]);
    }
  }, []);

  // ———————————————————————————————————
  // Recherche clients
  // ———————————————————————————————————
  const filterClients = async (text) => {
    setSearchText(text);
    setName(text);
    if (text.trim() === "") {
      setFilteredClients([]);
      return;
    }

    const { data, error } = await supabase
      .from("clients")
      .select("name, phone")
      .or(`name.ilike.%${text}%,phone.ilike.%${text}%`);

    if (!error) {
      setFilteredClients(data);
    }
  };

  const handleSelectClient = (client) => {
    setName(client.name);
    setPhone(client.phone);
    setSearchText(client.name);
    setFilteredClients([]);
  };

  // ———————————————————————————————————
  // Soumission (création / édition) + option signature
  // ———————————————————————————————————
  const handleSubmit = async (goToSignature = true) => {
    if (saving) return;

    if (!name || !phone || !email || !softwaretype || !description || !price) {
      showAlert("Erreur", "Veuillez remplir tous les champs obligatoires.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showAlert("Erreur", "Veuillez saisir une adresse e-mail valide.");
      return;
    }

    const numericPrice = Number(String(price).replace(",", "."));
    if (Number.isNaN(numericPrice)) {
      showAlert("Erreur", "Le montant est invalide.");
      return;
    }

    const baseData = {
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: String(email).trim(),
      type: "logiciel",
      softwaretype: String(softwaretype).trim(),
      licence: String(licence || "").trim(),
      description: String(description).trim(),
      price: numericPrice,
      paid: !!isPaid, // ← optionnel
      // ⚠️ pas de 'updated_at' ni 'date' envoyés à la table 'express'
    };

    try {
      setSaving(true);

      if (isEdit && editData?.id) {
        // ----- MODIFICATION -----
        const { data, error } = await supabase
          .from("express")
          .update(baseData)
          .eq("id", editData.id)
          .select("id, created_at")
          .single();

        if (error) throw error;

        setHasUnsavedChanges(false);

        const displayDate = data?.created_at
          ? new Date(data.created_at).toLocaleDateString("fr-FR")
          : new Date().toLocaleDateString("fr-FR");

        if (goToSignature) {
          navigation.navigate("PrintExpressPage", {
            id: data.id,
            name,
            phone,
            softwaretype: baseData.softwaretype,
            licence: baseData.licence,
            description: baseData.description,
            price: numericPrice,
            type: "logiciel",
            date: displayDate,
          });
        } else {
          showAlert("Succès", "Fiche mise à jour.");
          navigation.navigate("ExpressListPage", { refresh: Date.now() });
        }
      } else {
        // ----- CREATION -----
        const { data, error } = await supabase
          .from("express")
          .insert([{ ...baseData, created_at: new Date().toISOString() }])
          .select("id, created_at");

        if (error) throw error;

        setHasUnsavedChanges(false);

        const row = data?.[0] || {};
        const displayDate = row.created_at
          ? new Date(row.created_at).toLocaleDateString("fr-FR")
          : new Date().toLocaleDateString("fr-FR");

        // En création, on va signer/imprimer directement
        navigation.navigate("PrintExpressPage", {
          id: row.id,
          name,
          phone,
          softwaretype: baseData.softwaretype,
          licence: baseData.licence,
          description: baseData.description,
          price: numericPrice,
          type: "logiciel",
          date: displayDate,
        });
      }
    } catch (e) {
      console.error("handleSubmit (logiciel):", e);
      showAlert("Erreur", e?.message || "Impossible d’enregistrer.");
    } finally {
      setSaving(false);
    }
  };

  // ———————————————————————————————————
  // Bouton “Enregistrer” dans le header (en édition)
  // ———————————————————————————————————
  useLayoutEffect(() => {
    if (!isEdit) return;
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => handleSubmit(false)}
          disabled={saving}
          style={{
            marginRight: 12,
            paddingVertical: 6,
            paddingHorizontal: 10,
            backgroundColor: saving ? "#9bbcff" : "#0d6efd",
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            {saving ? "…" : "Enregistrer"}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, isEdit, saving, name, phone, email, softwaretype, licence, description, price]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#f8fafc" }}
    >
      <FlatList
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>
              🖥️ Fiche Express — Logiciel {isEdit ? "(modification)" : ""}
            </Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Client</Text>
              <Text style={styles.label}>Nom ou téléphone</Text>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color="#94a3b8" style={styles.searchIcon} />
                <TextInput
                  style={[styles.input, styles.inputWithIcon]}
                  value={searchText || name}
                  onChangeText={filterClients}
                  placeholder="Rechercher un client..."
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>
          </View>
        }
        data={searchText.length >= 2 ? filteredClients : []}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleSelectClient(item)}
            style={styles.suggestionItemWrapper}
          >
            <View style={styles.suggestionBox}>
              <Text style={styles.suggestionItem}>
                {item.name} — {item.phone}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Coordonnées</Text>

              <Text style={styles.label}>Téléphone</Text>
              <TextInput
                style={styles.input}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />

              <Text style={styles.label}>Adresse e-mail *</Text>
              <TextInput
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                placeholder="exemple@client.com"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Prestation</Text>

              <Text style={styles.label}>Type de prestation</Text>
              <TextInput
                style={styles.input}
                value={softwaretype}
                onChangeText={onSoftwaretypeChange}
                onFocus={() => {
                  setTypeSuggestions(filterOptions(SOFTWARE_TYPE_OPTIONS, softwaretype));
                  setShowTypeSuggestions(true);
                }}
                onBlur={() => setTimeout(() => setShowTypeSuggestions(false), 150)}
                placeholder="Ex : Installation antivirus"
                placeholderTextColor="#94a3b8"
              />
              {showTypeSuggestions && typeSuggestions.length > 0 && (
                <View style={[styles.suggestionBox, { marginTop: 4 }]}>
                  {typeSuggestions.map((option) => (
                    <TouchableOpacity
                      key={option}
                      onPress={() => {
                        setSoftwaretype(option);
                        setShowTypeSuggestions(false);
                      }}
                    >
                      <Text style={styles.suggestionItem}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Nom du produit</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={onDescriptionChange}
                onFocus={() => {
                  setProductSuggestions(filterOptions(SOFTWARE_PRODUCT_OPTIONS, description));
                  setShowProductSuggestions(true);
                }}
                onBlur={() => setTimeout(() => setShowProductSuggestions(false), 150)}
                placeholder="Ex : Kaspersky, Microsoft Windows 11..."
                placeholderTextColor="#94a3b8"
              />
              {showProductSuggestions && productSuggestions.length > 0 && (
                <View style={[styles.suggestionBox, { marginTop: 4 }]}>
                  {productSuggestions.map((option) => (
                    <TouchableOpacity
                      key={option}
                      onPress={() => {
                        setDescription(option);
                        setShowProductSuggestions(false);
                      }}
                    >
                      <Text style={styles.suggestionItem}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Clé de licence</Text>
              <TextInput
                style={styles.input}
                value={licence}
                onChangeText={setLicence}
              />

              <Text style={styles.label}>Montant total (€)</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={price}
                onChangeText={setPrice}
              />
            </View>

            <View style={styles.actionsGrid}>
              {/* 1) Bouton Faire signer (toujours) */}
              <TouchableOpacity
                style={[
                  styles.gridBtn,
                  { backgroundColor: saving ? "#9bbcff" : "#2563eb" },
                ]}
                onPress={() => handleSubmit(true)}
                disabled={saving}
              >
                <Text style={styles.gridBtnText}>
                  {saving ? "Préparation…" : "🖋️ Faire signer"}
                </Text>
              </TouchableOpacity>

              {/* 2) Bouton Enregistrer (en édition uniquement) */}
              {isEdit && (
                <TouchableOpacity
                  style={[
                    styles.gridBtn,
                    { backgroundColor: saving ? "#9bbcff" : "#0d6efd" },
                  ]}
                  onPress={() => handleSubmit(false)}
                  disabled={saving}
                >
                  <Text style={styles.gridBtnText}>
                    {saving ? "Enregistrement…" : "💾 Enregistrer"}
                  </Text>
                </TouchableOpacity>
              )}

              {isEdit && editData?.id && (
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      const { error } = await supabase
                        .from("express")
                        .update({ paid: !isPaid })
                        .eq("id", editData.id);
                      if (error) throw error;

                      setIsPaid(!isPaid);
                      setHasUnsavedChanges(false);
                      showAlert(
                        "OK",
                        !isPaid ? "Fiche marquée réglée." : "Fiche remise en dû."
                      );
                    } catch (e) {
                      console.error("toggle paid (software):", e);
                      showAlert("Erreur", "Impossible de mettre à jour le paiement.");
                    }
                  }}
                  style={[
                    styles.gridBtn,
                    { backgroundColor: isPaid ? "#6c757d" : "#22c55e" },
                  ]}
                >
                  <Text style={styles.gridBtnText}>
                    {isPaid ? "💱 Remettre en dû" : "✅ Marquer réglée"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={{ alignItems: "center", marginTop: 8 }}>
              <BackButton onPress={() => navigation.goBack()} />
            </View>
          </View>
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.container}
      />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />

      <CustomAlert
        visible={!!pendingLeaveAction}
        title="Modifications non enregistrées"
        message="Vous allez perdre les informations saisies dans cette fiche. Voulez-vous vraiment quitter ?"
        onClose={() => setPendingLeaveAction(null)}
        onConfirm={() => {
          const action = pendingLeaveAction;
          setHasUnsavedChanges(false);
          setPendingLeaveAction(null);
          action?.();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  ...commonStyles,
  container: { ...commonStyles.container, paddingBottom: 32 },
  title: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 14,
    textAlign: "center",
    color: "#0f172a",
  },
  card: commonStyles.elevatedCard,
  cardTitle: commonStyles.elevatedCardTitle,
  label: {
    fontWeight: "600",
    fontSize: 12,
    marginBottom: 4,
    marginTop: 8,
    color: "#4b5563",
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f8fafc",
    fontSize: 15,
    color: "#111827",
  },
  searchWrap: {
    position: "relative",
    justifyContent: "center",
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    zIndex: 1,
  },
  inputWithIcon: {
    paddingLeft: 34,
  },
  actionsGrid: {
    gap: 8,
    marginTop: 4,
  },
  gridBtn: {
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  gridBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  suggestionItemWrapper: {
    width: "100%",
    paddingHorizontal: 16,
  },
  suggestionBox: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    marginTop: -8,
    marginBottom: 8,
    overflow: "hidden",
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#334155",
  },
});
