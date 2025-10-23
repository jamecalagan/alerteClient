import React, { useState, useEffect } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Keyboard,
  Image,
  TouchableOpacity,
  Text,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  TouchableWithoutFeedback,
  Alert,
} from "react-native";
import { supabase } from "../supabaseClient";
import CustomAlert from "../components/CustomAlert";
import BottomNavigation from "../components/BottomNavigation";
import { MaterialIcons } from "@expo/vector-icons";
// ——— Helpers ———
const onlyDigits10 = (s = "") => String(s).replace(/\D/g, "").slice(0, 10);

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AddClientPage({ navigation, route }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
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

      setName(""); setPhone(""); setEmail("");
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

      setName(""); setPhone(""); setEmail("");
      Keyboard.dismiss();
      navigation.navigate("OrdersPage", {
        clientId: insertedData.id,
        clientName: insertedData.name,
        clientPhone: insertedData.phone,
        clientNumber: insertedData.ficheNumber,
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
    Alert.alert("Limite atteinte", "10 chiffres maximum.");
  }
  setPhone(digits.slice(0, 10));
};

  return (
    <View style={styles.screen}>
      <View style={styles.container}>
        <Text style={styles.title}>Ajouter un client</Text>

        {/* Nom */}
        <View style={[styles.inputContainer, focusedField === "name" && styles.inputFocused]}>
          <Image source={require("../assets/icons/person.png")} style={styles.checkIcon} />
          <TextInput
            style={styles.input}
            placeholder="Nom du client"
            value={name}
            onChangeText={setName}
            autoCapitalize="characters"
            placeholderTextColor="#888787"
            onFocus={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setFocusedField("name");
            }}
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
    placeholderTextColor="#888787"
    onFocus={() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFocusedField("phone");
    }}
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
            placeholderTextColor="#888787"
            onFocus={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setFocusedField("email");
            }}
            onBlur={() => setFocusedField(null)}
          />
        </View>

        {/* Boutons */}
        <TouchableOpacity
          style={styles.button}
          onPress={handleAddClient}
          disabled={loading || isSubmitting}
        >
          <Text style={styles.buttonText}>
            {loading ? "En cours..." : "Enregistrer le client"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={handleAddCommandeClient}
          disabled={loading || isSubmitting}
        >
          <Text style={styles.buttonText}>
            {loading ? "En cours..." : "Créer une commande"}
          </Text>
        </TouchableOpacity>

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
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>

        <View style={styles.modalCardRed}>
          <View style={styles.modalHeader}>
            <MaterialIcons name="block" size={22} color="#7f1d1d" />
            <Text style={styles.modalTitle}>Client banni</Text>
          </View>

          <Text style={styles.modalBodyText}>
            Ce client existe déjà et est **BANNI**.{"\n"}
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
              >
                <Text style={styles.modalBtnPrimaryText}>Voir la fiche</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.modalFootNote}>
            Création de fiche impossible pour un client banni.
          </Text>
        </View>
      </Modal>

      <BottomNavigation navigation={navigation} currentRoute={route.name} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24, fontWeight: "bold", color: "#383838",
    textAlign: "center", marginBottom: 30, textTransform: "uppercase", letterSpacing: 1,
  },
  screen: { flex: 1, backgroundColor: "#e0e0e0" },
  container: { flex: 1, padding: 20, justifyContent: "center" },

  inputContainer: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#585858",
    borderRadius: 8, backgroundColor: "#cacaca",
    paddingHorizontal: 10, marginBottom: 15, height: 45,
  },
  inputFocused: { borderColor: "#242424", backgroundColor: "#ffffff", height: 60 },
  input: { flex: 1, fontSize: 18, color: "#242424", paddingVertical: 8 },

  button: {
    backgroundColor: "#0c0f18", paddingVertical: 14, paddingHorizontal: 20,
    borderRadius: 10, borderWidth: 1, borderColor: "#242424",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 6, marginVertical: 5,
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "bold", letterSpacing: 0.5 },
  checkIcon: { width: 20, height: 20, tintColor: "#888787", marginRight: 10 },

  // —— Modale rouge (pro) ——
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCardRed: {
    position: "absolute",
    top: "20%", left: 16, right: 16,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#b91c1c",   // rouge soutenu autour de la modale
    padding: 14,
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", marginBottom: 8,
  },
  modalTitle: {
    marginLeft: 8, fontSize: 18, fontWeight: "800", color: "#7f1d1d",
  },
  modalBodyText: {
    color: "#111827", lineHeight: 20, marginBottom: 10,
  },
  reasonBox: {
    borderWidth: 1, borderColor: "#fca5a5", backgroundColor: "#fef2f2",
    borderRadius: 8, padding: 10, marginBottom: 12,
  },
  reasonTitle: { fontWeight: "800", color: "#991b1b", marginBottom: 4 },
  reasonText: { color: "#7f1d1d" },

  modalActions: {
    flexDirection: "row", justifyContent: "space-between", gap: 10,
  },
  modalBtnSecondary: {
    flex: 1, backgroundColor: "#e5e7eb", borderWidth: 1, borderColor: "#d1d5db",
    paddingVertical: 12, borderRadius: 10, alignItems: "center",
  },
  modalBtnSecondaryText: { color: "#1f2937", fontWeight: "700" },
  modalBtnPrimary: {
    flex: 1, backgroundColor: "#7f1d1d",
    paddingVertical: 12, borderRadius: 10, alignItems: "center",
  },
  modalBtnPrimaryText: { color: "#fff", fontWeight: "800" },

  modalFootNote: {
    textAlign: "center", color: "#991b1b", marginTop: 10, fontStyle: "italic",
  },
});
