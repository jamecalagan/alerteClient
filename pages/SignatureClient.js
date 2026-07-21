import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  SafeAreaView,
  ScrollView,
  Dimensions,
} from "react-native";
import SignatureScreen from "react-native-signature-canvas";
import { supabase } from "../supabaseClient";
import { useNavigation, useRoute } from "@react-navigation/native";

// ———————————————————————————————————————————
// Aide : formatage (identique à ClientPreviewPage)
// ———————————————————————————————————————————
const CURRENCY = (n) => {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
};

const fmtDate = (v) => {
  if (!v) return "";
  try {
    return new Date(v).toLocaleDateString("fr-FR");
  } catch {
    return String(v);
  }
};

const formatPhoneNumber = (phone) => {
  if (!phone) return "";
  return String(phone).replace(/(\d{2})(?=\d)/g, "$1 ").trim();
};

export default function SignatureClient() {
  const ref = useRef(null);
  const navigation = useNavigation();
  const route = useRoute();

  const { interventionId } = route.params; // obligatoire

  const [loading, setLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState(null); // { name, phone, ficheNumber, createdAt }
  const [itv, setItv] = useState(null); // intervention

  const { width, height } = Dimensions.get("window");

  // Hauteur de la zone de signature (stable, pas trop petite)
  const signatureHeight = useMemo(() => {
    const isPortrait = height >= width;
    // Ajuste si tu veux : l’idée = garder une zone confortable sans scroller dedans.
    return isPortrait ? 260 : 220;
  }, [width, height]);

  const fetchInterventionAndClient = async () => {
    try {
      setLoading(true);

      const { data: intervention, error: itvError } = await supabase
        .from("interventions")
        .select(
          `
          id,
          client_id,
          deviceType,
          brand,
          model,
          reference,
          serial_number,
          description,
          cost,
          partialPayment,
          solderestant,
          devis_cost,
          password,
          chargeur,
          signatureIntervention,
          accept_screen_risk,
          remarks,
          createdAt,
          is_estimate,
          estimate_min,
          estimate_max,
          estimate_type,
          estimate_accepted_at
        `
        )
        .eq("id", interventionId)
        .single();

      if (itvError) throw itvError;
      if (!intervention) throw new Error("Intervention introuvable.");

      setItv(intervention);

      // On récupère le client via client_id (comme ta relation client -> interventions)
      const clientId = intervention.client_id;
      if (!clientId) {
        // Si ton schéma n’a pas client_id dans interventions, dis-moi : on adaptera en jointure autrement.
        throw new Error(
          "client_id manquant dans l’intervention. Vérifie ta table interventions."
        );
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("name, phone, createdAt, ficheNumber")
        .eq("id", clientId)
        .single();

      if (clientError) throw clientError;
      setClientInfo(client);
    } catch (e) {
      console.error("Erreur chargement signature page :", e);
      Alert.alert(
        "Erreur",
        "Impossible de charger les informations de la fiche."
      );
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInterventionAndClient();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interventionId]);

  const buildPriceLine = (intervention) => {
    if (!intervention) return "";
    const {
      is_estimate,
      estimate_type,
      estimate_min,
      estimate_max,
      estimate_accepted_at,
      cost,
    } = intervention;

    const min = estimate_min != null ? Number(estimate_min) : null;
    const max = estimate_max != null ? Number(estimate_max) : null;

    if (is_estimate) {
      if (estimate_type === "PLAFOND") {
        return `De ${CURRENCY(min)} à ${CURRENCY(max)} (plafond accepté${
          estimate_accepted_at ? ` le ${fmtDate(estimate_accepted_at)}` : ""
        })`;
      }
      return `De ${CURRENCY(min)} à ${CURRENCY(max)}`;
    }
    return `Montant total : ${CURRENCY(cost)}`;
  };

  const handleSignature = async (signature) => {
    try {
      const { error } = await supabase
        .from("interventions")
        .update({ signatureIntervention: signature })
        .eq("id", interventionId);

      if (error) throw error;

      Alert.alert("Succès", "Signature enregistrée avec succès.");
      navigation.goBack();
    } catch (error) {
      console.error("Erreur sauvegarde signature:", error);
      Alert.alert("Erreur", "Erreur lors de la sauvegarde de la signature.");
    }
  };

  const handleClear = () => ref.current?.clearSignature();
  const handleCancel = () => navigation.goBack();
  const handleSave = () => ref.current?.readSignature();

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const ficheDate = itv?.createdAt ?? clientInfo?.createdAt;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Infos utiles (repris de ClientPreviewPage) */}
        <ScrollView
          style={styles.topBlock}
          contentContainerStyle={styles.topBlockContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Récapitulatif avant signature</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Client</Text>
            <Text style={styles.line}>
              <Text style={styles.label}>Fiche n° :</Text>{" "}
              {clientInfo?.ficheNumber ?? "—"}
            </Text>
            <Text style={styles.line}>
              <Text style={styles.label}>Date :</Text> {fmtDate(ficheDate)}
            </Text>
            <Text style={styles.line}>
              <Text style={styles.label}>Nom :</Text> {clientInfo?.name ?? "—"}
            </Text>
            <Text style={styles.line}>
              <Text style={styles.label}>Téléphone :</Text>{" "}
              {formatPhoneNumber(clientInfo?.phone)}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Matériel</Text>
            <Text style={styles.line}>
              <Text style={styles.label}>Type :</Text> {itv?.deviceType ?? "—"}
            </Text>
            <Text style={styles.line}>
              <Text style={styles.label}>Marque :</Text> {itv?.brand ?? "—"}
            </Text>
            <Text style={styles.line}>
              <Text style={styles.label}>Modèle :</Text> {itv?.model ?? "—"}
            </Text>
            <Text style={styles.line}>
              <Text style={styles.label}>N° série :</Text>{" "}
              {itv?.reference ?? itv?.serial_number ?? "—"}
            </Text>
            <Text style={styles.line}>
              <Text style={styles.label}>Chargeur :</Text>{" "}
              {itv?.chargeur ? "Oui" : "Non"}
            </Text>
            <Text style={styles.line}>
              <Text style={styles.label}>Mot de passe :</Text>{" "}
              {itv?.password ?? "—"}
            </Text>

            {itv?.accept_screen_risk ? (
              <Text style={styles.acceptRiskText}>
                ✅ Risque écran accepté (tactile / LCD) — Produit : {itv.deviceType}
              </Text>
            ) : null}

            {itv?.remarks ? (
              <View style={styles.remarkBox}>
                <Text style={styles.remarkTitle}>Remarque technicien</Text>
                <Text style={styles.remarkText}>{itv.remarks}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Problème & Prix</Text>

            <Text style={styles.problemText}>{itv?.description ?? "—"}</Text>

            <Text style={styles.priceText}>{buildPriceLine(itv)}</Text>

            {!itv?.is_estimate && itv?.partialPayment ? (
              <Text style={styles.subPriceText}>
                Acompte : {CURRENCY(itv.partialPayment)}
              </Text>
            ) : null}

            {!itv?.is_estimate && itv?.solderestant ? (
              <Text style={styles.remainingText}>
                Reste dû : {CURRENCY(itv.solderestant)}
              </Text>
            ) : null}
          </View>

          <Text style={styles.locationLine}>
            Fait à : Drancy, le : {new Date().toLocaleDateString("fr-FR")}
          </Text>

          <Text style={styles.hint}>
            Signez dans le cadre ci-dessous.
          </Text>
        </ScrollView>

        {/* Zone signature */}
        <View style={[styles.signatureWrap, { height: signatureHeight }]}>
          <SignatureScreen
            ref={ref}
            onOK={handleSignature}
            onEmpty={() => Alert.alert("Erreur", "La signature est vide.")}
            descriptionText="Signez ici"
            clearText="Effacer"
            confirmText="Enregistrer"
            webStyle={`
              .m-signature-pad--footer {display: none; margin: 0px;}
              body,html { width: 100%; height: 100%; margin: 0; padding: 0; }
              .m-signature-pad {
                box-shadow: none;
                border: 3px solid black;
                width: 100%;
                height: 100%;
                margin: 0 auto;
              }
            `}
            style={styles.signature}
          />
        </View>

        {/* Boutons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.buttonClear} onPress={handleClear}>
            <Text style={styles.buttonText}>Effacer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.buttonCancel} onPress={handleCancel}>
            <Text style={styles.buttonText}>Annuler</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.buttonSave} onPress={handleSave}>
            <Text style={styles.buttonText}>Sauvegarder</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 10,
    marginTop: 60,
  },

  topBlock: { flex: 1 },
  topBlockContent: { paddingBottom: 10 },

  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111",
    marginBottom: 10,
  },

  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fafafa",
    marginBottom: 10,
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 6,
    color: "#2c3e50",
  },

  line: {
    fontSize: 14,
    marginBottom: 2,
    color: "#111",
  },

  label: { fontWeight: "bold" },

  problemText: {
    fontSize: 14,
    color: "#111",
    marginBottom: 8,
  },

  priceText: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#111",
    marginTop: 4,
  },

  subPriceText: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 4,
    color: "#111",
  },

  remainingText: {
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 4,
    color: "green",
  },

  acceptRiskText: {
    fontSize: 13,
    color: "green",
    fontWeight: "bold",
    marginTop: 8,
  },

  remarkBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#cfcfcf",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#fff",
  },

  remarkTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#b00000",
    marginBottom: 4,
  },

  remarkText: { fontSize: 13, color: "#111" },

  locationLine: {
    fontSize: 13,
    color: "#333",
    marginTop: 2,
    marginBottom: 8,
    fontWeight: "600",
  },

  hint: {
    fontSize: 13,
    color: "#555",
    marginBottom: 6,
  },

  signatureWrap: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
  },

  signature: {
    flex: 1,
  },

  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 12,
  },

  buttonClear: {
    backgroundColor: "#fff",
    padding: 10,
    borderWidth: 1,
    borderRadius: 5,
    width: "30%",
    alignItems: "center",
    elevation: 5,
  },

  buttonCancel: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 5,
    borderWidth: 3,
    borderColor: "#e90808",
    width: "30%",
    alignItems: "center",
    elevation: 5,
  },

  buttonSave: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 5,
    borderWidth: 3,
    borderColor: "#124902",
    width: "30%",
    alignItems: "center",
    elevation: 5,
  },

  buttonText: {
    color: "#202020",
    fontWeight: "bold",
  },
});
