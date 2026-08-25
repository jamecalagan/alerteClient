import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import Signature from "react-native-signature-canvas";
import { supabase } from "../supabaseClient";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";

export default function SignaturePage({ route, navigation }) {
  const { clientId, interventionId } = route.params || {};

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertOnClose, setAlertOnClose] = useState(null);

  const showAlert = (title, message, onCloseAction = null) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertOnClose(() => onCloseAction);
    setAlertVisible(true);
  };

  // Signature dessinée sur la tablette (data:image/png;base64,....)
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);

  // Signature déjà en BDD (dépôt), peut être data:image ou URL
  const [existingSignature, setExistingSignature] = useState(null);

  const [guaranteeText, setGuaranteeText] = useState("");
  const [clientInfo, setClientInfo] = useState(null);

  const [receiverName, setReceiverName] = useState("");
  const [description, setDescription] = useState("");
  const [isSigning, setIsSigning] = useState(false);

  const ref = useRef(null);

  const isValidUUID = (id) =>
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
      id || ""
    );

  useEffect(() => {
    if (!interventionId || !isValidUUID(interventionId)) {
      console.error("Erreur : interventionId invalide ou manquant.");
      return;
    }

    const loadClientAndIntervention = async () => {
      try {
        const { data, error } = await supabase
          .from("interventions")
          .select("*, clients(name, ficheNumber, phone)")
          .eq("id", interventionId)
          .single();

        if (error) throw error;

        setClientInfo(data);

        // Signature de dépôt existante en BDD (colonne dédiée, jamais la colonne
        // "signature" qui sert maintenant à la restitution)
        const sigDb = data?.signatureIntervention || null;

        if (sigDb) {
          setExistingSignature(String(sigDb));
        }

        if (data?.guarantee) setGuaranteeText((prev) => prev || data.guarantee);
        if (data?.receiver_name)
          setReceiverName((prev) => prev || data.receiver_name);

        console.log("🔎 Signature DB:", {
          has_signatureIntervention: !!data?.signatureIntervention,
          signatureIntervention_len: data?.signatureIntervention
            ? String(data.signatureIntervention).length
            : 0,
        });
      } catch (e) {
        console.error("Erreur chargement infos :", e);
      }
    };

    loadClientAndIntervention();
  }, [interventionId]);

  // Quand l’utilisateur valide la signature dans le canvas
  const handleSignature = (sig) => {
    // sig = "data:image/png;base64,...."
    setSignatureDataUrl(sig);
  };

  const handleClearSignature = () => {
    ref.current?.clearSignature();
    setSignatureDataUrl(null);
  };

  const webStyle = `
    .m-signature-pad--footer {display: none; margin: 0px;}
    body,html { width: 100%; height: 100%; margin: 0; padding: 0; }
    .m-signature-pad {
      box-shadow: none; border: 1px solid black; width: 100%; height: 100%; margin: 0 auto;
    }
  `;

  /**
   * 1️⃣ Capturer & confirmer : on enregistre en BDD et on revient
   * On stocke la signature telle quelle (data:image/png;base64,...) dans signature
   * (colonne dédiée à la restitution, distincte de signatureIntervention qui reste le dépôt)
   */
  const handleCaptureAndConfirmSignature = async () => {
    try {
      if (!signatureDataUrl) {
        showAlert("Erreur", "Veuillez fournir une signature.");
        return;
      }

      const { error } = await supabase
        .from("interventions")
        .update({
          status: "Récupéré",
          signature: signatureDataUrl, // ⬅️ signature de restitution, distincte du dépôt
          signature_at: new Date().toISOString(),
          guarantee: guaranteeText,
          receiver_name: receiverName,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", interventionId);

      if (error) throw error;

      showAlert(
        "Succès",
        "La signature et la garantie ont été enregistrées.",
        () => navigation.navigate("RepairedInterventionsListPage")
      );
    } catch (e) {
      console.error("Erreur confirmation signature :", e);
      showAlert(
        "Erreur",
        "Une erreur est survenue lors de l'enregistrement de la signature."
      );
    }
  };

  /**
   * 2️⃣ Capturer & imprimer : on enregistre en BDD puis on va sur PrintPage
   */
  const handleSaveAndNavigateToPrint = async () => {
    try {
      if (!signatureDataUrl) {
        showAlert("Erreur", "Veuillez fournir une signature.");
        return;
      }

      const { error } = await supabase
        .from("interventions")
        .update({
          status: "Récupéré",
          signature: signatureDataUrl, // ⬅️ signature de restitution, distincte du dépôt
          signature_at: new Date().toISOString(),
          guarantee: guaranteeText,
          receiver_name: receiverName,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", interventionId);

      if (error) throw error;

      navigation.navigate("PrintPage", {
        clientInfo: {
          name: clientInfo?.clients?.name || "",
          ficheNumber: clientInfo?.clients?.ficheNumber || "",
          phone: clientInfo?.clients?.phone || "",
        },
        receiverName,
        guaranteeText,
        signature: signatureDataUrl, // on passe la même valeur au print
        description,
        productInfo: {
          deviceType: clientInfo?.deviceType || "",
          brand: clientInfo?.brand || "",
          model: clientInfo?.model || "",
          reference: clientInfo?.reference || "",
          cost: clientInfo?.cost || "",
          remarks: clientInfo?.remarks || "",
          date: clientInfo?.updatedAt || "",
          description: clientInfo?.description || "",
        },
      });
    } catch (e) {
      console.error("Erreur sauvegarde + impression :", e);
      showAlert(
        "Erreur",
        "Une erreur est survenue lors de la sauvegarde et l'impression."
      );
    }
  };

  /**
   * 3️⃣ Imprimer en utilisant la signature dépôt déjà existante
   */
  const handlePrintWithExistingSignature = () => {
    if (!existingSignature) {
      showAlert(
        "Aucune signature",
        "Aucune signature dépôt n’a été trouvée sur cette fiche."
      );
      return;
    }

    navigation.navigate("PrintPage", {
      clientInfo: {
        name: clientInfo?.clients?.name || "",
        ficheNumber: clientInfo?.clients?.ficheNumber || "",
        phone: clientInfo?.clients?.phone || "",
      },
      receiverName,
      guaranteeText,
      signature: existingSignature, // URL ou data:image
      description,
      productInfo: {
        deviceType: clientInfo?.deviceType || "",
        brand: clientInfo?.brand || "",
        model: clientInfo?.model || "",
        reference: clientInfo?.reference || "",
        cost: clientInfo?.cost || "",
        remarks: clientInfo?.remarks || "",
        date: clientInfo?.updatedAt || "",
        description: clientInfo?.description || "",
      },
      useExistingSignature: true,
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!isSigning}
        >
          <Text style={styles.title}>Garantie et restitution</Text>

          {clientInfo?.clients && (
            <View style={styles.infoContainer}>
              <Text style={styles.infoText}>
                Client: {clientInfo.clients.name}
              </Text>
              <Text style={styles.infoText}>
                Fiche N°: {clientInfo.clients.ficheNumber}
              </Text>
              <Text style={styles.infoText}>
                Type d&apos;appareil: {clientInfo.deviceType}{" "}
                {clientInfo.brand} {clientInfo.model}
              </Text>
              <Text style={styles.infoText}>
                Description: {clientInfo.description}
              </Text>
              <Text style={styles.infoText}>
                Coût: {clientInfo.cost} €
              </Text>
            </View>
          )}

          {/* Signature dépôt détectée */}
          {existingSignature && (
            <View style={styles.existingSigBox}>
              <Text style={styles.existingSigTitle}>
                Signature déjà enregistrée (dépôt)
              </Text>
              <Image
                source={{ uri: existingSignature }}
                style={styles.existingSigImage}
                resizeMode="contain"
              />
              <TouchableOpacity
                style={styles.buttonGrey}
                onPress={handlePrintWithExistingSignature}
              >
                <Text style={styles.buttonText}>
                  Imprimer restitution (signature existante)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Remarques / garantie"
            value={guaranteeText}
            onChangeText={setGuaranteeText}
          />
          <TextInput
            style={styles.input}
            placeholder="Nom de la personne récupérant le matériel"
            value={receiverName}
            onChangeText={setReceiverName}
          />

          <Text style={styles.fixedText}>
            Je soussigné(e), M./Mme{" "}
            {receiverName || clientInfo?.clients?.name || "____________________"}
            , atteste avoir récupéré le matériel mentionné et reconnais avoir été
            informé(e) des conditions suivantes :
            {"\n\n"}
            <Text style={styles.boldText}>
              1. Garantie commerciale – durée et portée :
            </Text>
            {"\n"}Le matériel restitué est couvert par une garantie commerciale
            de trois (3) mois à compter de la date de restitution. Cette
            garantie ne s’applique qu’à la panne initialement identifiée et
            réparée. Toute autre anomalie ultérieure est exclue. Les réparations
            liées à une oxydation / liquide ne sont pas couvertes.
            {"\n\n"}
            <Text style={styles.boldText}>2. Délais de réclamation :</Text>
            {"\n"}Le client dispose de dix (10) jours calendaires pour toute
            réclamation.
            {"\n\n"}
            <Text style={styles.boldText}>3. Exclusions de garantie :</Text>
            {"\n"}La garantie devient caduque en cas de mauvaise utilisation,
            choc, liquide, ou intervention tierce.
            {"\n\n"}
            <Text style={styles.boldText}>4. Responsabilité données :</Text>
            {"\n"}Le client reste responsable de ses sauvegardes.
            {"\n\n"}Fait à : Drancy
            {"\n"}Le : {new Date().toLocaleDateString("fr-FR")}
            {"\n"}Signature du client :
          </Text>

          <View style={{ height: 300, marginTop: 10, marginBottom: 10 }}>
            <Signature
              ref={ref}
              onOK={handleSignature}
              onBegin={() => setIsSigning(true)}
              onEnd={() => {
                ref.current?.readSignature();
                setIsSigning(false);
              }}
              descriptionText="Signature"
              confirmText="Confirmer"
              webStyle={webStyle}
            />
          </View>

          <BackButton onPress={() => navigation.goBack()} style={{ marginTop: 10 }} />

          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={styles.button}
              onPress={handleCaptureAndConfirmSignature}
            >
              <Text style={styles.buttonText}>Capturer et Confirmer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.buttonGreen}
              onPress={handleSaveAndNavigateToPrint}
            >
              <Text style={styles.buttonText}>Capturer et Imprimer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.clearButton]}
              onPress={handleClearSignature}
            >
              <Text style={styles.buttonText}>Effacer la signature</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => {
          setAlertVisible(false);
          if (alertOnClose) alertOnClose();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f2f2f2" },
  fixedText: { fontSize: 16, lineHeight: 18, color: "#000" },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  infoContainer: { marginBottom: 10 },
  infoText: { fontSize: 16, color: "#333", marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
    backgroundColor: "#fff",
  },
  buttonsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  button: {
    backgroundColor: "#007BFF",
    padding: 15,
    borderRadius: 2,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
    marginVertical: 20,
  },
  buttonGreen: {
    backgroundColor: "#028d0e",
    padding: 15,
    borderRadius: 2,
    alignItems: "center",
    flex: 1,
    marginHorizontal: 5,
    marginVertical: 20,
  },
  clearButton: { backgroundColor: "#FF6347" },
  buttonGrey: {
    backgroundColor: "#555",
    padding: 12,
    borderRadius: 2,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: { color: "#fff", fontWeight: "bold", textAlign: "center" },
  boldText: { fontSize: 16, color: "#000000", fontWeight: "bold" },

  existingSigBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  existingSigTitle: {
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#000",
    textAlign: "center",
  },
  existingSigImage: {
    width: "100%",
    height: 120,
    borderWidth: 1,
    borderColor: "#000",
    backgroundColor: "#fafafa",
  },
});
