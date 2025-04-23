import React, { useRef, useState, useEffect} from "react";
import { View, Text, StyleSheet, Button, ScrollView, Alert, Image } from "react-native";
import { useRoute } from "@react-navigation/native";
import Signature from "react-native-signature-canvas";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";

const PrintExpressPage = () => {
  const route = useRoute();
  const {
    name,
    phone,
    device,
    description,
    price,
    date,
    signature,
    cassettecount,
    cassettetype,
    outputtype,
    softwaretype,
    type
  } = route.params;

  const [signatureData, setSignatureData] = useState(null);
  const sigRef = useRef();

  useEffect(() => {
	if (route.params?.signature) {
	  setSignatureData(route.params.signature);
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
		Alert.alert("Erreur", "Veuillez valider la signature avant de sauvegarder.");
		return;
	  }

    try {
      const { error } = await supabase.from("express").insert({
        name,
        phone,
        device,
        description,
        price,
        signature: signatureData || null,
        cassettecount,
        cassettetype,
        outputtype,
        softwaretype,
        type,
        created_at: new Date()
      });

      if (error) throw error;
      Alert.alert("✅ Sauvegarde réussie", "La fiche a été enregistrée.");
    } catch (error) {
      console.error("❌ Erreur de sauvegarde :", error);
      Alert.alert("Erreur", "La sauvegarde a échoué.");
    }
  };

  const handlePrint = async () => {
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
          <p><strong>Téléphone :</strong> ${phone || 'N/A'}</p>
          <p><strong>Matériel :</strong> ${device}</p>
		            ${type === 'logiciel' ? `<p><strong>Prestation :</strong> ${softwaretype}</p>` : ''}
          <p><strong>Description :</strong>${description}</p>

          ${type === 'video' ? `<p><strong>Cassettes :</strong> ${cassettecount} (${cassettetype}) → ${outputtype}</p>` : ''}
          <p><strong>Montant à réglé :</strong> ${price} €</p>

          <hr style="margin: 15px 0;" />

<div style="font-size: 10px; text-align: justify;">
  <p>Je soussigné(e), M. ${name || "________________________"}, certifie avoir pris connaissance que le matériel, qu'il soit réparé ou jugé non réparable, devra être récupéré dans un délai maximum de 30 jours. Au-delà de ce délai, le matériel sera considéré comme abandonné et pourra être détruit ou jeté sans recours possible.</p>

  <p>
    1. Le client reconnaît avoir déposé le matériel de son plein gré pour analyse ou réparation.<br/>
    2. L’entreprise décline toute responsabilité en cas de perte de données. Il appartient au client de procéder à ses sauvegardes.<br/>
    3. En cas d’impossibilité de réparation, seul un diagnostic pourra être facturé.<br/>
    4. Les pièces remplacées peuvent ne pas être restituées sauf demande expresse.<br/>
    5. Aucun matériel ne sera restitué sans le paiement complet de la prestation.<br/>
    6. Le matériel non réclamé dans un délai de 3 mois sera considéré comme abandonné.<br/>
    7. Pour les prestations de transfert vidéo, la qualité dépend de l’état des cassettes. Aucun remboursement ne sera accordé pour les défauts dus aux supports originaux.<br/>
    8. Les conversions sont livrées sur le support choisi par le client.<br/>
    9. La signature du client vaut acceptation des conditions mentionnées ci-dessus.
  </p>

  <p>En signant ce document, vous acceptez les conditions ci-dessus.</p>
</div>


          <br/><br/>
          <p><strong>Signature client :</strong></p>
          ${signatureData ? `<img src="${signatureData}" style="width: 200px; height: auto;" />` : '<p>______________________________</p>'}

          <br/><br/>
          <div style="text-align: center; font-size: 10px;">
            <p><strong>AVENIR INFORMATIQUE</strong></p>
            <p>16, place de l'Hôtel de Ville 93700 Drancy</p>
            <p>Tel : 01 41 60 18 18</p>
          </div>
        </body>
      </html>
    `;

    await Print.printAsync({ html: htmlContent });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
          <Text style={styles.label}>Support : {outputtype}</Text>
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

	  <Text style={[styles.label, { marginTop: 20 }]}>Signature du client :</Text>

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
          background-color: #007bff;
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

      <View style={{ marginTop: 20 }}>
        <Button title="Sauvegarder dans la base" onPress={saveToSupabase} />
      </View>

      <View style={{ marginTop: 20 }}>
        <Button
          title="Imprimer cette fiche"
          onPress={handlePrint}
          disabled={!signatureData}
        />
      </View>
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
});

export default PrintExpressPage;