import React, { useState, useEffect } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Keyboard,
  Image,
  TouchableOpacity,
  Text,
  Platform,
  UIManager,
  Modal,
  TouchableWithoutFeedback,
  StatusBar,
} from "react-native";
import { supabase } from "../supabaseClient";
import CustomAlert from "../components/CustomAlert";
import BottomMenu from "../components/BottomMenu";
import { MaterialIcons } from "@expo/vector-icons";
import { isValidEmail } from "../utils/validateEmail";
import AddressAutocomplete from "../components/AddressAutocomplete";
import AlertBox from "../components/AlertBox";
import { formatClientAddress } from "../utils/formatClientAddress";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DRAFT_KEY = "addClientDraft";
// ——— Helpers ———
const onlyDigits10 = (s = "") => String(s).replace(/\D/g, "").slice(0, 10);

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AddClientPage({ navigation, route }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [confirmKind, setConfirmKind] = useState(null); // "client" | "commande" : création en attente de confirmation

  // Brouillon : les champs saisis sont conservés sur la tablette (même si
  // l'appli est fermée ou plante) et ne sont effacés qu'après un
  // enregistrement réussi du client.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (raw && !cancelled) {
          const draft = JSON.parse(raw);
          setName(draft.name || "");
          setPhone(draft.phone || "");
          setEmail(draft.email || "");
          setAddress(draft.address || "");
          setPostalCode(draft.postalCode || "");
          setCity(draft.city || "");
        }
      } catch {
        // brouillon illisible : on repart d'un formulaire vide
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const isEmpty = !name && !phone && !email && !address && !postalCode && !city;
    if (isEmpty) {
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
    } else {
      AsyncStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ name, phone, email, address, postalCode, city })
      ).catch(() => {});
    }
  }, [draftReady, name, phone, email, address, postalCode, city]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertTitle, setAlertTitle] = useState("");
  const [focusedField, setFocusedField] = useState(null);

  // ——— Modale “Client banni” ———
  const [bannedModalVisible, setBannedModalVisible] = useState(false);
  const [bannedMatch, setBannedMatch] = useState(null); // {id, name, phone, ban_reason}

const validateFields = () => {
  if (!name || !phone) {
    setAlertTitle("Erreur");
    setAlertMessage("Le nom et le numéro de téléphone doivent être remplis.");
    setAlertVisible(true);
    return false;
  }
  if (phone.length !== 10) { // phone est déjà digits-only
    setAlertTitle("Erreur");
    setAlertMessage("Le numéro de téléphone doit contenir exactement 10 chiffres.");
    setAlertVisible(true);
    return false;
  }
  if (email && !isValidEmail(email)) {
    setAlertTitle("Erreur");
    setAlertMessage("Veuillez saisir une adresse e-mail valide.");
    setAlertVisible(true);
    return false;
  }
  return true;
};

  const findExistingClientByNamePhone = async (nameValue, phoneValue) => {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, phone, banned, ban_reason")
      .eq("name", nameValue)
      .eq("phone", phoneValue)
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  };

  const getNextFicheNumber = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("ficheNumber")
      .order("ficheNumber", { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data ? data.ficheNumber + 1 : 6001;
  };

  // Confirmation avant création : évite d'enregistrer un client (et de vider
  // le formulaire) en appuyant sur le mauvais bouton ou avec une faute de saisie.
  const askConfirm = (kind) => {
    if (isSubmitting) return;
    if (!validateFields()) return;
    setConfirmKind(kind);
  };

  const confirmRecap = () => {
    const addressLine = formatClientAddress({
      address,
      postal_code: postalCode,
      city,
    });
    return [
      `Nom : ${name}`,
      `Téléphone : ${phone}`,
      email ? `E-mail : ${email}` : null,
      addressLine ? `Adresse : ${addressLine}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const clearForm = () => {
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setPostalCode("");
    setCity("");
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  };

  const handleAddClient = async () => {
    if (!validateFields()) return;
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const existing = await findExistingClientByNamePhone(name, phone);

      if (existing) {
        if (existing.banned === true) {
          setBannedMatch(existing);
          setBannedModalVisible(true);
          return;
        }
        setAlertTitle("Client existant");
        setAlertMessage("Un client avec ce nom et ce numéro de téléphone existe déjà.");
        setAlertVisible(true);
        return;
      }

      const newFicheNumber = await getNextFicheNumber();

      const { data: insertedData, error: insertError } = await supabase
        .from("clients")
        .insert([
          {
            name,
            phone,
            email: email || null,
            address: address.trim() || null,
            postal_code: postalCode || null,
            city: city.trim() || null,
            ficheNumber: newFicheNumber,
            createdAt: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (insertError || !insertedData) {
        setAlertTitle("Erreur");
        setAlertMessage("Erreur lors de l'insertion du nouveau client.");
        setAlertVisible(true);
        return;
      }

      clearForm();
      Keyboard.dismiss();
      navigation.navigate("AddIntervention", { clientId: insertedData.id });
    } catch (error) {
      setAlertTitle("Erreur");
      setAlertMessage("Une erreur inattendue est survenue.");
      setAlertVisible(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCommandeClient = async () => {
    if (!validateFields()) return;
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const existing = await findExistingClientByNamePhone(name, phone);

      if (existing) {
        if (existing.banned === true) {
          setBannedMatch(existing);
          setBannedModalVisible(true);
          return;
        }
        setAlertTitle("Client existant");
        setAlertMessage("Ce client existe déjà.");
        setAlertVisible(true);
        return;
      }

      const newFicheNumber = await getNextFicheNumber();

      const { data: insertedData, error: insertError } = await supabase
        .from("clients")
        .insert([
          {
            name,
            phone,
            email: email || null,
            address: address.trim() || null,
            postal_code: postalCode || null,
            city: city.trim() || null,
            ficheNumber: newFicheNumber,
            createdAt: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (insertError || !insertedData) {
        setAlertTitle("Erreur");
        setAlertMessage("Erreur lors de l'insertion.");
        setAlertVisible(true);
        return;
      }

      clearForm();
      Keyboard.dismiss();
      navigation.navigate("OrdersPage", {
        clientId: insertedData.id,
        clientName: insertedData.name,
        clientPhone: insertedData.phone,
        clientNumber: insertedData.ficheNumber,
        openFormOnEntry: true,
      });
    } catch (error) {
      setAlertTitle("Erreur");
      setAlertMessage("Une erreur inattendue est survenue.");
      setAlertVisible(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseAlert = () => {
    setAlertVisible(false);
    Keyboard.dismiss();
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      if (route.params?.reloadClients) {
        // rafraîchissements éventuels
      }
    });
    return unsubscribe;
  }, [navigation, route.params]);
const handlePhoneChange = (t) => {
  const digits = String(t).replace(/\D/g, "");
  // si on essaye de dépasser alors qu’on était déjà à 10 → alerte une seule fois
  if (digits.length > 10 && phone.length === 10) {
    setAlertTitle("Limite atteinte");
    setAlertMessage("10 chiffres maximum.");
    setAlertVisible(true);
  }
  setPhone(digits.slice(0, 10));
};

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.headerIconCircle}>
            <MaterialIcons name="person-add-alt-1" size={30} color="#4f46e5" />
          </View>
          <Text style={styles.title}>Ajouter un client</Text>
          <Text style={styles.subtitle}>
            Renseigne les coordonnées pour créer une nouvelle fiche
          </Text>

          {/* Nom */}
          <View style={[styles.inputContainer, focusedField === "name" && styles.inputFocused]}>
            <Image source={require("../assets/icons/person.png")} style={styles.checkIcon} />
            <TextInput
              style={styles.input}
              placeholder="Nom du client"
              value={name}
              onChangeText={setName}
              autoCapitalize="characters"
              placeholderTextColor="#94a3b8"
              onFocus={() => setFocusedField("name")}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Téléphone */}
          <View style={[styles.inputContainer, focusedField === "phone" && styles.inputFocused]}>
            <Image source={require("../assets/icons/call.png")} style={styles.checkIcon} />
            <TextInput
              style={styles.input}
              placeholder="Numéro de téléphone"
              value={phone}
              onChangeText={handlePhoneChange}   // ← utilise le handler
              keyboardType="number-pad"
              // ❌ ne pas mettre maxLength ici, on veut détecter la tentative de 11e chiffre
              placeholderTextColor="#94a3b8"
              onFocus={() => setFocusedField("phone")}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Email */}
          <View style={[styles.inputContainer, focusedField === "email" && styles.inputFocused]}>
            <Image source={require("../assets/icons/mail.png")} style={styles.checkIcon} />
            <TextInput
              style={styles.input}
              placeholder="Adresse e-mail (optionnel)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              placeholderTextColor="#94a3b8"
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Adresse */}
          <AddressAutocomplete
            address={address}
            postalCode={postalCode}
            city={city}
            onChangeAddress={setAddress}
            onChangePostalCode={setPostalCode}
            onChangeCity={setCity}
          />

          {/* Boutons */}
          <TouchableOpacity
            style={styles.button}
            onPress={() => askConfirm("client")}
            disabled={loading || isSubmitting}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>
              {loading ? "En cours..." : "Enregistrer le client"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={() => askConfirm("commande")}
            disabled={loading || isSubmitting}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonSecondaryText}>
              {loading ? "En cours..." : "Créer une commande"}
            </Text>
          </TouchableOpacity>
        </View>

        <AlertBox
          visible={!!confirmKind}
          title={
            confirmKind === "commande"
              ? "Créer ce client et sa commande ?"
              : "Créer ce client et son intervention ?"
          }
          message={confirmRecap()}
          cancelText="Corriger"
          confirmText="Créer"
          onClose={() => setConfirmKind(null)}
          onConfirm={() => {
            const kind = confirmKind;
            setConfirmKind(null);
            if (kind === "commande") handleAddCommandeClient();
            else handleAddClient();
          }}
        />

        <CustomAlert
          visible={alertVisible}
          title={alertTitle}
          message={alertMessage}
          onClose={handleCloseAlert}
        />
      </View>

      {/* —— Modale PRO “Client banni” —— */}
      <Modal
        visible={bannedModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBannedModalVisible(false)}
      >
        {/* Ferme en tapant en dehors */}
        <TouchableWithoutFeedback onPress={() => setBannedModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={styles.modalCardRed}>
                <View style={styles.iconCircleRed}>
                  <MaterialIcons name="block" size={30} color="#DC2626" />
                </View>

                <Text style={styles.modalTitle}>Client banni</Text>

                <Text style={styles.modalBodyText}>
                  Ce client existe déjà et est <Text style={{ fontWeight: "700" }}>BANNI</Text>.{"\n"}
                  <Text style={{ fontWeight: "700" }}>
                    Nom :
                  </Text>{" "}
                  {bannedMatch?.name || "—"}{"\n"}
                  <Text style={{ fontWeight: "700" }}>
                    Téléphone :
                  </Text>{" "}
                  {bannedMatch?.phone || "—"}
                </Text>

                {!!bannedMatch?.ban_reason && (
                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonTitle}>Raison déclarée</Text>
                    <Text style={styles.reasonText}>{bannedMatch.ban_reason}</Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalBtnSecondary}
                    onPress={() => setBannedModalVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.modalBtnSecondaryText}>Fermer</Text>
                  </TouchableOpacity>

                  {/* Accès direct à la fiche si besoin */}
                  {bannedMatch?.id ? (
                    <TouchableOpacity
                      style={styles.modalBtnPrimary}
                      onPress={() => {
                        setBannedModalVisible(false);
                        navigation.navigate("ClientInterventionsPage", {
                          clientId: bannedMatch.id,
                        });
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnPrimaryText}>Voir la fiche</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <Text style={styles.modalFootNote}>
                  Création de fiche impossible pour un client banni.
                </Text>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <BottomMenu navigation={navigation} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#eef2ff",
    paddingTop: StatusBar.currentHeight || 0,
  },
  container: { flex: 1, padding: 20, justifyContent: "center" },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#312e81",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  headerIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#e0e7ff",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 22, fontWeight: "800", color: "#0f172a",
    textAlign: "center", marginBottom: 4,
  },
  subtitle: {
    fontSize: 13, color: "#64748b",
    textAlign: "center", marginBottom: 24,
  },

  inputContainer: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#c7d2fe",
    borderRadius: 14, backgroundColor: "#f8fafc",
    paddingHorizontal: 14, marginBottom: 14, height: 50,
  },
  inputFocused: {
    borderColor: "#4f46e5", backgroundColor: "#ffffff",
  },
  input: { flex: 1, fontSize: 16, color: "#0f172a", paddingVertical: 8 },

  button: {
    backgroundColor: "#4f46e5", paddingVertical: 15, paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    marginTop: 8,
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },

  buttonSecondary: {
    backgroundColor: "#ffffff", paddingVertical: 15, paddingHorizontal: 20,
    borderRadius: 14, borderWidth: 1.5, borderColor: "#4f46e5",
    alignItems: "center", justifyContent: "center", marginTop: 10,
  },
  buttonSecondaryText: { color: "#4f46e5", fontSize: 16, fontWeight: "700" },

  checkIcon: { width: 20, height: 20, tintColor: "#6366f1", marginRight: 10 },

  // —— Modale rouge (pro) ——
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    padding: 16,
  },
  modalCardRed: {
    width: 380,
    maxWidth: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  iconCircleRed: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: "#FEE2E2",
    justifyContent: "center", alignItems: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 19, fontWeight: "700", color: "#111827", marginBottom: 10, textAlign: "center",
  },
  modalBodyText: {
    color: "#374151", lineHeight: 20, marginBottom: 10, textAlign: "center",
  },
  reasonBox: {
    width: "100%",
    borderWidth: 1, borderColor: "#fca5a5", backgroundColor: "#fef2f2",
    borderRadius: 14, padding: 12, marginBottom: 14,
  },
  reasonTitle: { fontWeight: "800", color: "#991b1b", marginBottom: 4 },
  reasonText: { color: "#7f1d1d" },

  modalActions: {
    flexDirection: "row", justifyContent: "space-between", width: "100%", gap: 10,
  },
  modalBtnSecondary: {
    flex: 1, backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#E5E7EB",
    paddingVertical: 13, borderRadius: 14, alignItems: "center",
  },
  modalBtnSecondaryText: { color: "#374151", fontWeight: "700", fontSize: 15 },
  modalBtnPrimary: {
    flex: 1, backgroundColor: "#DC2626",
    paddingVertical: 13, borderRadius: 14, alignItems: "center",
  },
  modalBtnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  modalFootNote: {
    textAlign: "center", color: "#991b1b", marginTop: 12, fontStyle: "italic", fontSize: 12,
  },
});
