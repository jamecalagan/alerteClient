import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import * as Print from "expo-print";
import { useRoute } from "@react-navigation/native";
import CustomAlert from "../components/CustomAlert";

// Normalise la signature pour <Image> et pour <img src="...">
const normalizeSignatureUri = (sig) => {
  if (!sig) return null;
  const s = String(sig).trim();

  // Déjà sous forme exploitable
  if (
    s.startsWith("data:image") ||
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("file:")
  ) {
    return s;
  }

  // Base64 brut -> on ajoute le préfixe
  return `data:image/png;base64,${s}`;
};

export default function PrintPage() {
  const route = useRoute();
  const routeParams = route.params || {};
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const {
    clientInfo,
    receiverName,
    guaranteeText,
    signature, // ce qu'on essaye d'utiliser en priorité
    productInfo,
    description,
  } = routeParams;

  console.log("🔎 PrintPage route.params =", routeParams);

  // On tente plusieurs sources possibles pour la signature
  const rawSignature =
    signature ??
    clientInfo?.signatureIntervention ?? // au cas où tu passes le client complet avec la colonne
    routeParams.signatureIntervention ??
    routeParams.signatureDataUrl ??
    null;

  const signatureUri = normalizeSignatureUri(rawSignature);

  console.log(
    "🔎 PrintPage signatureUri (début) =",
    signatureUri ? signatureUri.slice(0, 40) : "null"
  );

  const handlePrint = async () => {
    try {
      const htmlContent = `
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            margin: 10mm;
            color: #000;
          }
          h4 {
            text-align: center;
            margin-bottom: 10px;
          }
          p {
            margin: 4px 0;
            text-align: justify;
          }
          .signature {
            margin-top: 20px;
            text-align: center;
          }
          .footer {
            margin-top: 25px;
            font-size: 8px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <h4>Restitution du matériel</h4>
        <p><strong>Client :</strong> ${clientInfo?.name || "N/A"}</p>
        <p><strong>Fiche N° :</strong> ${clientInfo?.ficheNumber || "N/A"}</p>
        <p><strong>Nom du réceptionnaire :</strong> ${
          receiverName || "__________________"
        }</p>
        <p><strong>Produit :</strong> ${productInfo?.deviceType || "N/A"} ${
        productInfo?.brand || ""
      } ${productInfo?.model || ""}</p>
        <p><strong>Problème signalé :</strong> ${
          productInfo?.description || "Non renseigné."
        }</p>
        <p><strong>Remarques :</strong> ${
          guaranteeText || "Aucune remarque."
        }</p>

        <p><strong>1. Garantie commerciale – durée et portée :</strong><br/>
        Le matériel restitué est couvert par une garantie commerciale d’une durée de trois (3) mois à compter de la date de restitution.<br/>
        Cette garantie ne s’applique qu’à la panne initialement identifiée et réparée. Toute autre anomalie ou défaillance ultérieure, non directement liée à l’intervention initiale, est expressément exclue de cette garantie.<br/>
        Les réparations consécutives à une oxydation ou à une exposition à un liquide ne sont pas couvertes, en raison du caractère aléatoire et non maîtrisable de ce type de dysfonctionnement.</p>

        <p><strong>2. Délais de réclamation :</strong><br/>
        Le client dispose d’un délai de dix (10) jours calendaires à compter de la date de restitution pour formuler toute réclamation.<br/>
        Aucune demande ne pourra être recevable au-delà de ce délai, sauf disposition légale contraire.</p>

        <p><strong>3. Exclusions de garantie :</strong><br/>
        La garantie est automatiquement réputée caduque en cas :
        <ul style="margin-top: 4px; margin-bottom: 4px;">
          <li>de mauvaise utilisation du matériel,</li>
          <li>de dommages physiques (chocs, fissures, etc.),</li>
          <li>d’exposition à des liquides,</li>
          <li>ou d’intervention effectuée par un tiers non autorisé par AVENIR INFORMATIQUE.</li>
        </ul>
        </p>

        <p><strong>4. Responsabilité relative aux données personnelles :</strong><br/>
        Il appartient exclusivement au client de procéder à la sauvegarde préalable de ses données.<br/>
        AVENIR INFORMATIQUE décline toute responsabilité en cas de perte totale ou partielle de données, quelle qu’en soit la cause, y compris lors de l’intervention technique.</p>

        <p><strong>5. Attestation de restitution :</strong><br/>
        Je soussigné(e), M./Mme ${
          receiverName || clientInfo?.name || "________________________"
        }, atteste avoir récupéré le matériel mentionné et reconnais avoir été informé(e) de l’ensemble des conditions de garantie susmentionnées.<br/>
        Je reconnais également que le matériel a été testé et présenté comme fonctionnel par le personnel d’AVENIR INFORMATIQUE, au moment de la remise.</p>

        <p><strong>Fait à :</strong> Drancy<br/>
        <strong>Le :</strong> ${new Date().toLocaleDateString("fr-FR")}</p>

        <div class="signature">
          <h5>Signature du client :</h5>
          ${
            signatureUri
              ? `<img src="${signatureUri}" style="width: 45%; height: auto;" />`
              : "<p>___________________________</p>"
          }
        </div>

        <p style="font-size:7px; color:#666; text-align:justify; margin-top:15px;">
          Conformément au RGPD, vos données personnelles (dont votre signature) sont
          conservées par AVENIR INFORMATIQUE à des fins de preuve commerciale, pour une
          durée conforme aux obligations légales. Vous disposez d'un droit d'accès, de
          rectification et de suppression de vos données auprès de nos services.
        </p>

        <div class="footer">
          AVENIR INFORMATIQUE - 16, place de l’Hôtel de Ville - 93700 Drancy<br/>
          Tél : 01 41 60 18 18
        </div>
      </body>
    </html>
      `;

      await Print.printAsync({
        html: htmlContent,
      });

      showAlert("Succès", "Le document a été envoyé à l'imprimante.");
    } catch (error) {
      showAlert("Erreur", "Une erreur est survenue lors de l'impression.");
      console.error("Erreur d'impression :", error);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Restitution du matériel</Text>
      <Text style={styles.text}>Client : {clientInfo?.name || "N/A"}</Text>
      <Text style={styles.text}>
        Fiche N° : {clientInfo?.ficheNumber || "N/A"}
      </Text>
      <Text style={styles.text}>
        Nom du réceptionnaire : {receiverName || "__________________"}
      </Text>
      <Text style={styles.text}>
        Produit : {productInfo?.deviceType || "N/A"} {productInfo?.brand || ""}{" "}
        {productInfo?.model || ""}
      </Text>
      <Text style={styles.text}>
        Problème : {productInfo?.description || "Aucune description."}
      </Text>
      <Text style={styles.text}>
        Remarques : {guaranteeText || "Aucune remarque."}
      </Text>

      <Text style={styles.fixedText}>
        Je soussigné(e), M./Mme{" "}
        {receiverName || clientInfo?.name || "________________________"}, atteste
        avoir récupéré le matériel mentionné et reconnais avoir été informé(e)
        des conditions suivantes :
        {"\n\n"}
        <Text style={styles.boldText}>
          1. Garantie commerciale – durée et portée :
        </Text>
        {"\n"}Le matériel restitué est couvert par une garantie commerciale
        d’une durée de trois (3) mois à compter de la date de restitution.
        {"\n"}Cette garantie ne s’applique qu’à la panne initialement identifiée
        et réparée. Toute autre anomalie ou défaillance ultérieure, non
        directement liée à l’intervention initiale, est expressément exclue de
        cette garantie.
        {"\n"}Les réparations consécutives à une oxydation ou à une exposition à
        un liquide ne sont pas couvertes, en raison du caractère aléatoire et
        non maîtrisable de ce type de dysfonctionnement.
        {"\n\n"}
        <Text style={styles.boldText}>2. Délais de réclamation :</Text>
        {"\n"}Le client dispose d’un délai de dix (10) jours calendaires à
        compter de la date de restitution pour formuler toute réclamation.
        {"\n"}Aucune demande ne pourra être recevable au-delà de ce délai, sauf
        disposition légale contraire.
        {"\n\n"}
        <Text style={styles.boldText}>3. Exclusions de garantie :</Text>
        {"\n"}La garantie est automatiquement réputée caduque en cas :
        {"\n"}• de mauvaise utilisation du matériel,
        {"\n"}• de dommages physiques (chocs, fissures, etc.),
        {"\n"}• d’exposition à des liquides,
        {"\n"}• ou d’intervention effectuée par un tiers non autorisé par
        AVENIR INFORMATIQUE.
        {"\n\n"}
        <Text style={styles.boldText}>
          4. Responsabilité relative aux données personnelles :
        </Text>
        {"\n"}Il appartient exclusivement au client de procéder à la sauvegarde
        préalable de ses données.
        {"\n"}AVENIR INFORMATIQUE décline toute responsabilité en cas de perte
        totale ou partielle de données, quelle qu’en soit la cause, y compris
        lors de l’intervention technique.
        {"\n\n"}Fait à : Drancy
        {"\n"}Le : {new Date().toLocaleDateString("fr-FR")}
        {"\n\n"}Signature du client :
      </Text>

      <View style={styles.signatureContainer}>
        {signatureUri ? (
          <Image
            source={{ uri: signatureUri }}
            style={styles.signatureImage}
            resizeMode="contain"
          />
        ) : (
          <Text>Aucune signature fournie.</Text>
        )}
      </View>

      <TouchableOpacity style={styles.printButton} onPress={handlePrint}>
        <Text style={styles.printButtonText}>Imprimer</Text>
      </TouchableOpacity>

      <Text
        style={{
          fontSize: 10,
          textAlign: "justify",
          color: "#888",
          marginTop: 30,
        }}
      >
        Conformément au RGPD, vos données personnelles (dont votre signature) sont
        conservées par AVENIR INFORMATIQUE à des fins de preuve commerciale, pour
        une durée conforme aux obligations légales. Vous disposez d'un droit
        d'accès, de rectification et de suppression de vos données auprès de nos
        services.
      </Text>

      <Text
        style={{
          fontSize: 10,
          textAlign: "center",
          color: "#555",
          marginTop: 20,
        }}
      >
        AVENIR INFORMATIQUE – 16, place de l&apos;Hôtel de Ville – 93700 Drancy
        – Tel : 01 41 60 18 18
      </Text>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  text: {
    fontSize: 15,
    marginBottom: 5,
    color: "#333",
  },
  fixedText: {
    fontSize: 15,
    lineHeight: 20,
    color: "#333",
    marginTop: 10,
  },
  boldText: { fontWeight: "bold" },
  signatureContainer: {
    marginTop: 40,
    borderWidth: 1,
    borderColor: "#ccc",
    height: 150,
  },
  signatureImage: { width: "100%", height: "100%" },
  printButton: {
    marginTop: 40,
    paddingVertical: 8,
    backgroundColor: "#007BFF",
    borderRadius: 4,
    alignItems: "center",
    width: "50%",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  printButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
