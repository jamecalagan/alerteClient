import React, { useRef, useState, useEffect} from "react";
import { View, Text, StyleSheet, Button, ScrollView, Image, TouchableOpacity } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import Signature from "react-native-signature-canvas";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";
import CustomAlert from "../components/CustomAlert";

const PrintExpressPage = () => {
  const route = useRoute();
  const {
  id,
  name,
  phone,
  device,
  description,
  price,
  date,
  type,
  cassettecount,
  cassettetype,
  outputtype,
  softwaretype,
  support_fournis, // ✅ ajout ici
} = route.params;
const support_fournisseur = support_fournis === true;
  const [signatureExists, setSignatureExists] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message || "");
    setAlertVisible(true);
  };
  const sigRef = useRef();
  const [isSigning, setIsSigning] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(true);
  useEffect(() => {
	if (route.params?.signature) {
	  setSignatureData(route.params.signature);
	  setSignatureExists(true);
	  setIsSaved(true);
  
	  setShowBanner(true); // 🎉 Active le bandeau
	  setTimeout(() => setShowBanner(false), 3000); // Bandeau disparaît après 3 secondes
	}
  }, [route.params?.signature]);
  
  
  

  const handleOK = (sig) => {
	const formatted = sig.startsWith("data:image")
	  ? sig
	  : `data:image/png;base64,${sig}`;
	setSignatureData(formatted);
	console.log("📌 Signature capturée :", formatted);
  };

  const saveToSupabase = async () => {
	if (!signatureData) {
	  showAlert("Erreur", "Veuillez valider la signature avant de sauvegarder.");
	  return;
	}
  
	try {
	  const { error } = await supabase
		.from("express")
		.update({ signature: signatureData })
		.eq("id", id);
  
	  if (error) throw error;
  
	  showAlert("✅ Signature sauvegardée !");
	  setIsSaved(true); // 🟢 Active l'impression juste après sauvegarde
	  setSignatureExists(true); // 🟢 En plus on dit que la signature existe
	} catch (error) {
	  console.error("❌ Erreur de sauvegarde :", error);
	  showAlert("Erreur", "La sauvegarde a échoué.");
	}
  };
  
  const wakeUpPrinter = async () => {
  try {
    await Print.printAsync({
      html: "<html><body style='height:1px;'></body></html>",
    });
    console.log("🟢 Imprimante réveillée");
  } catch (e) {
    console.log("⚠️ Échec réveil imprimante :", e.message);
  }
};

  

  const handlePrint = async () => {
	const conditionsText = `
	<div style="
	  background-color: #eef6ff;
	  padding: 10px;
	  border: 1px solid #007bff;
	  border-radius: 8px;
	  margin-top: 20px;
	  font-size: 7px;
	  line-height: 1.4;
	  max-height: 180px;
	  overflow: hidden;
	  text-align: justify;
	">
	  ${
		type === "video" 
		? `
		  <p style="font-weight: bold; text-align: center;">Conditions spécifiques au transfert vidéo 📼</p>
		  <p>7. La qualité dépend de l’état des cassettes originales. Aucun remboursement ne sera accordé pour des défauts présents sur le support source.</p>
		  <p>8. Les conversions sont fournies sur le support choisi par le client (clé USB, disque dur, etc.).</p>
		`
		: `
		  <p style="font-weight: bold; text-align: center;">Conditions générales de réparation 🛠️</p>
		  <p>1. Le client reconnaît avoir déposé le matériel de son plein gré pour analyse ou réparation.</p>
		  <p>2. L’entreprise décline toute responsabilité en cas de perte de données. Il appartient au client de procéder à ses sauvegardes.</p>
		  <p>3. En cas d’impossibilité de réparation, seul un diagnostic pourra être facturé.</p>
		  <p>4. Les pièces remplacées peuvent ne pas être restituées sauf demande expresse.</p>
		  <p>5. Aucun matériel ne sera restitué sans le paiement complet de la prestation.</p>
		  <p>6. Le matériel non réclamé dans un délai de 3 mois sera considéré comme abandonné.</p>
		  <p>9. La signature du client vaut acceptation des conditions mentionnées ci-dessus.</p>
		`
	  }
	</div>
	`;
	
  const supportLabel =
  type === "video" &&
  support_fournisseur &&
  (outputtype === "Clé USB" || outputtype === "Disque dur")
    ? ` (fourni par la boutique, ${outputtype === "Clé USB" ? "+20 €" : "+45 €"})`
    : "";

  

const htmlContent = `
<html>
  <body style="font-family: Arial; padding: 5px; font-size: 11px; max-width: 595px;">
    <h3 style="text-align: center;">
      ${
        type === "logiciel"
          ? "Fiche Express - Dépannage système"
          : type === "video"
          ? "Fiche Express - Transfert vidéo"
          : "Fiche Express - Réparation matériel"
      }
    </h3>

    <p><strong>Date :</strong> ${date}</p>
    <p><strong>Client :</strong> ${name}</p>
    <p><strong>Téléphone :</strong> ${phone || "N/A"}</p>
    ${type === "reparation" ? `<p><strong>Matériel :</strong> ${device || "N/A"}</p>` : ""}


    ${type === "logiciel" ? `<p><strong>Prestation :</strong> ${softwaretype}</p>` : ""}

    <p><strong>Description :</strong> ${description}</p>

${type === "video" ? `<p><strong>Cassettes :</strong> ${cassettecount} → ${outputtype}${supportLabel}</p>` : ""}

          <p><strong>Montant à réglé :</strong> ${price} €</p>

          <hr style="margin: 15px 0;" />

<div style="font-size: 10px; text-align: justify;">
  <p>Je soussigné(e), M. ${name || "________________________"}, certifie avoir pris connaissance que le matériel, qu'il soit réparé ou jugé non réparable, devra être récupéré dans un délai maximum de 30 jours. Au-delà de ce délai, le matériel sera considéré comme abandonné et pourra être détruit ou jeté sans recours possible.</p>

<p style="font-size: 9px; text-align: left; margin-top: 20px;">
  1. Le client reconnaît avoir déposé le matériel de son plein gré pour analyse ou réparation.<br/>
  2. L’entreprise décline toute responsabilité en cas de perte de données. Il appartient au client de procéder à ses sauvegardes.<br/>
  3. En cas d’impossibilité de réparation, seul un diagnostic pourra être facturé.<br/>
  4. Les pièces remplacées peuvent ne pas être restituées sauf demande expresse.<br/>
  5. Aucun matériel ne sera restitué sans le paiement complet de la prestation.<br/>
  6. Le matériel non réclamé dans un délai de 3 mois sera considéré comme abandonné.<br/>
  <span style="color: #007bff; font-weight: bold;">📼 7. Pour les prestations de transfert vidéo, la qualité dépend de l’état des cassettes. Aucun remboursement ne sera accordé pour les défauts dus aux supports originaux.</span><br/>
  <span style="color: #007bff; font-weight: bold;">📼 8. Les conversions sont livrées sur le support choisi par le client.</span><br/>
  9. La signature du client vaut acceptation des conditions mentionnées ci-dessus.
</p>
<p>En signant ce document, vous acceptez les conditions ci-dessus.</p>
</div>

          <p><strong>Signature client :</strong></p>
          ${signatureData ? `<img src="${signatureData}" style="width: 200px; height: auto;" />` : '<p>______________________________</p>'}

          <br/><br/>
          <div style="text-align: center; font-size: 10px;">
            <p><strong>AVENIR INFORMATIQUE</strong> 16, place de l'Hôtel de Ville 93700 Drancy Tel : 01 41 60 18 18</p>
          </div>
		  ${conditionsText}
        </body>
      </html>
    `;

    await wakeUpPrinter(); // 👈 réveille l’imprimante avant
await Print.printAsync({ html: htmlContent });
  };

  return (
    <ScrollView contentContainerStyle={styles.container} scrollEnabled={!isSigning}>
	{showBanner && (
  <View style={styles.banner}>
    <Text style={styles.bannerText}>✅ Signature déjà enregistrée. Prêt à imprimer !</Text>
  </View>
)}

      <Text style={styles.title}>
  {type === "logiciel" && "Fiche Express - Dépannage système"}
  {type === "reparation" && "Fiche Express - Réparation matériel"}
  {type === "video" && "Fiche Express - Transfert vidéo"}
</Text>

      <Text style={styles.label}>Date : {date}</Text>
      <Text style={styles.label}>Client : {name}</Text>
      {phone ? <Text style={styles.label}>Téléphone : {phone}</Text> : null}
      <Text style={styles.label}>Matériel : {device}</Text>
	  {type === 'logiciel' && <Text style={styles.label}>Prestation : {softwaretype}</Text>}
      <Text style={styles.label}>Description : {description}</Text>
      
{type === 'video' && (
  <>
    <Text style={styles.label}>Nombre de cassettes : {cassettecount}</Text>
    <Text style={styles.label}>Type : {cassettetype}</Text>
    <Text style={styles.label}>
      Support : {outputtype}
      {(support_fournisseur && (outputtype === "Clé USB" || outputtype === "Disque dur")) &&
        ` (fourni par la boutique, ${outputtype === "Clé USB" ? "+20€" : "+45€"})`}
    </Text>
  </>
)}

      <Text style={styles.label}>Montant à réglé : {price} €</Text>

      <View style={styles.termsSection}>
        <Text style={styles.termsText}>
          Je soussigné(e), M. {name || "________________________"}, certifie
          avoir pris connaissance que le matériel, qu'il soit réparé
          ou jugé non réparable, devra être récupéré dans un délai
          maximum de 30 jours. Au-delà de ce délai, le matériel sera
          considéré comme abandonné et pourra être détruit ou jeté
          sans recours possible.
        </Text>
		<Text style={styles.termsText}>
          1. Le client reconnaît avoir déposé le matériel de son plein gré pour analyse ou réparation.{"\n"}
          2. L’entreprise décline toute responsabilité en cas de perte de données. Il appartient au client de procéder à ses sauvegardes.{"\n"}
          3. En cas d’impossibilité de réparation, seul un diagnostic pourra être facturé.{"\n"}
          4. Les pièces remplacées peuvent ne pas être restituées sauf demande expresse.{"\n"}
          5. Aucun matériel ne sera restitué sans le paiement complet de la prestation.{"\n"}
          6. Le matériel non réclamé dans un délai de 3 mois sera considéré comme abandonné.{"\n"}
          7. Pour les prestations de transfert vidéo, la qualité dépend de l’état des cassettes. Aucun remboursement ne sera accordé pour les défauts dus aux supports originaux.{"\n"}
          8. Les conversions sont livrées sur le support choisi par le client.{"\n"}
          9. La signature du client vaut acceptation des conditions mentionnées ci-dessus.
        </Text>
        <Text style={styles.termsText}>
          En signant ce document, vous acceptez les conditions
          ci-dessus.
        </Text>
      </View>
	  <TouchableOpacity
  style={{
    backgroundColor: includeSignature ? "#28a745" : "#ccc",
    padding: 10,
    borderRadius: 8,
    marginVertical: 10,
    alignItems: "center",
  }}
  onPress={() => setIncludeSignature(!includeSignature)}
>
  <Text style={{ color: "#fff", fontWeight: "bold" }}>
    {includeSignature ? "✅ Inclure la signature" : "❌ Signature exclue"}
  </Text>
</TouchableOpacity>
{includeSignature && (
	<View style={styles.signatureBox}>
	  <Text style={[styles.label, { marginTop: 20 }]}>Signature du client :</Text>
	  </View>
	)}
{signatureData ? (
  <View style={{ alignItems: "center", marginTop: 10 }}>
    <Text style={styles.label}>Signature enregistrée :</Text>
    <Image
      source={{ uri: signatureData }}
      style={{
        width: 250,
        height: 100,
        resizeMode: "contain",
        borderWidth: 1,
        borderColor: "#ccc",
      }}
    />
  </View>
) : (
  <View style={{ height: 380, borderWidth: 1, borderColor: "#ccc" }}>
    <Signature
      ref={sigRef}
	  onBegin={() => setIsSigning(true)}        // 👈 On commence à signer
  onEnd={() => setIsSigning(false)}         // 👈 On arrête de signer
  onOK={handleOK}
      descriptionText="Signer ici"
      clearText="Effacer"
      confirmText="Valider"
      webStyle={`
        .m-signature-pad {
          box-shadow: none;
          border: 1px solid black;
          width: 100%;
          height: 100%;
          margin: 0 auto;
        }
        .m-signature-pad--footer {
          display: flex !important;
          justify-content: space-between;
          padding: 10px;
        }
        .m-signature-pad--footer .button {
          background-color: #24ad69;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          padding: 6px 12px;
        }
      `}
    />
    <Text style={{ color: 'red', fontSize: 12, marginTop: 5 }}>
      ⚠️ Cliquez sur « Valider » après avoir signé pour activer l'impression.
    </Text>
  </View>
)}

<View style={styles.buttonRow}>
  {!signatureExists && signatureData && (
    <TouchableOpacity
      style={[styles.actionButton, { backgroundColor: "#007bff" }]}
      onPress={saveToSupabase}
    >
      <Text style={styles.buttonText}>💾 Sauvegarder Signature</Text>
    </TouchableOpacity>
  )}

  <TouchableOpacity
    style={[
      styles.actionButton,
      { backgroundColor: includeSignature && !isSaved ? "#ccc" : "#28a745" },
    ]}
    onPress={handlePrint}
    disabled={includeSignature && !isSaved}
  >
    <Text style={styles.buttonText}>🖨️ Imprimer</Text>
  </TouchableOpacity>
</View>

<CustomAlert
  visible={alertVisible}
  title={alertTitle}
  message={alertMessage}
  onClose={() => setAlertVisible(false)}
/>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    marginBottom: 10,
  },
  termsSection: {
    marginTop: 10,
  },
  termsText: {
    fontSize: 16,
    marginBottom: 10,
    textAlign: "justify",
  },
saveButton: {
  paddingVertical: 14,
  paddingHorizontal: 20,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 20,
},

printButton: {
  paddingVertical: 14,
  paddingHorizontal: 20,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
},
buttonRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 40,
},

actionButton: {
  flex: 1,
  marginHorizontal: 5,
  paddingVertical: 14,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
},

buttonText: {
  color: "white",
  fontWeight: "bold",
  fontSize: 16,
},
banner: {
  backgroundColor: "#d4edda",
  padding: 10,
  borderRadius: 8,
  marginBottom: 15,
  alignItems: "center",
},

bannerText: {
  color: "#155724",
  fontWeight: "bold",
},

});

export default PrintExpressPage;