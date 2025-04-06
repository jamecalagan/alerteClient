import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image } from "react-native";
import Signature from "react-native-signature-canvas";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";

export default function CommandePreviewPage({ route }) {
  const { order } = route.params || {};
  const client = order.client;
  const [signature, setSignature] = useState(order?.signatureclient || null);
  const [isSignatureValidated, setIsSignatureValidated] = useState(!!order?.signatureclient);
  const [isPrinted, setIsPrinted] = useState(order?.printed || false);
  const signatureRef = useRef();

  const handleOK = async (sig) => {
    setSignature(sig);
    setIsSignatureValidated(true);
    const { error } = await supabase
      .from("orders")
      .update({ signatureclient: sig })
      .eq("id", order.id);
    if (error) {
      console.error("❌ Erreur lors de la sauvegarde de la signature:", error);
    }
  };

  const handlePrint = async () => {
    if (!signature) {
      Alert.alert("Signature requise", "Veuillez faire signer la commande avant impression.");
      return;
    }

    const formatMontant = (valeur) => {
      return `${valeur.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
    };

    const dateDuJour = new Date().toLocaleDateString("fr-FR");

    const htmlContent = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            @page { size: A5; margin: 15mm; }
            body { font-family: Arial, sans-serif; font-size: 12px; color: #333; }
            .container { padding: 10px; }
            h1 { text-align: center; color: #2E7D32; font-size: 18px; }
            .section { margin-bottom: 15px; border: 1px solid #ccc; padding: 10px; border-radius: 6px; }
            .section-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; }
            .field { margin-bottom: 5px; }
            .label { font-weight: bold; display: inline-block; width: 120px; }
            .signature img { margin-top: 10px; max-width: 180px; height: auto; }
            .footer-note { text-align: center; font-size: 10px; margin-top: 25px; color: #777; }
            .header { text-align: center; margin-bottom: 20px; }
            .company-name { font-size: 16px; font-weight: bold; color: #252525; }
            .company-details { font-size: 11px; color: #555; line-height: 1.4; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="company-name">AVENIR INFORMATIQUE</div>
              <div class="company-details">
                16 place de l'Hôtel de Ville<br />93700 Drancy<br />Tél. : 01 41 60 18 18
              </div>
            </div>
            <h1>Bon de Commande</h1>
            <div class="section">
              <div class="section-title">Client</div>
              <div class="field"><span class="label">Nom :</span> ${client.name}</div>
              <div class="field"><span class="label">Fiche n° :</span> ${client.ficheNumber}</div>
            </div>
            <div class="section">
              <div class="section-title">Produit</div>
              <div class="field"><span class="label">Type :</span> ${order.deviceType}</div>
              <div class="field"><span class="label">Marque :</span> ${order.brand}</div>
              <div class="field"><span class="label">Modèle :</span> ${order.model}</div>
            </div>
            <div class="section">
              <div class="section-title">Paiement</div>
              <div class="field"><span class="label">Prix total :</span> ${formatMontant(order.cost)}</div>
              <div class="field"><span class="label">Acompte :</span> ${formatMontant(order.acompte || 0)}</div>
              <div class="field"><span class="label">Reste à payer :</span> ${formatMontant(order.cost - (order.acompte || 0))}</div>
            </div>
            <div class="signature">
              <div><strong>Signature du client :</strong></div>
              <img src="${signature}" alt="Signature du client" />
            </div>
            <div class="footer-note">
              Commande validée le : ${dateDuJour}
            </div>
          </div>
        </body>
      </html>
    `;

    await Print.printAsync({ html: htmlContent });

    const { error } = await supabase
      .from("orders")
      .update({ printed: true })
      .eq("id", order.id);

    if (!error) setIsPrinted(true);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Aperçu de la Commande</Text>
      <Text style={styles.label}>Nom du client : {client.name}</Text>
      <Text style={styles.label}>Numéro de fiche : {client.ficheNumber}</Text>
      <Text style={styles.label}>Produit : {order.deviceType}</Text>
      <Text style={styles.label}>Marque : {order.brand}</Text>
      <Text style={styles.label}>Modèle : {order.model}</Text>
      <Text style={styles.label}>Prix : {order.cost} €</Text>
      <Text style={styles.label}>Acompte : {order.acompte || 0} €</Text>
      <Text style={styles.label}>Montant restant dû : {order.cost - (order.acompte || 0)} €</Text>

      <View style={styles.signatureBox}>
        <Text style={styles.label}>Signature du client :</Text>
        {signature ? (
          <>
            <Image
              source={{ uri: signature }}
              style={styles.signatureImage}
              resizeMode="contain"
            />
            {isSignatureValidated && (
              <Text style={styles.validatedText}>✅ Signature validée</Text>
            )}
            {isPrinted && (
              <Text style={styles.printedText}>🖨️ Commande imprimée</Text>
            )}
          </>
        ) : (
          <View style={{ height: 400, width: '100%' }}>
            <Signature
              ref={signatureRef}
              onOK={handleOK}
              onEmpty={() => console.log("🛑 Signature vide")}
              descriptionText="Signez ci-dessous"
              clearText="Effacer"
              confirmText="Valider"
              webStyle={`
                .m-signature-pad { box-shadow: none; border: 1px solid #ccc; width: 80% !important; height: 80% !important; }
                .m-signature-pad--footer { display: flex; justify-content: space-between; }
              `}
            />
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.button} onPress={handlePrint}>
        <Text style={styles.buttonText}>🖨️ Imprimer la commande</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
  label: { fontSize: 18, marginBottom: 10 },
  button: { backgroundColor: "#4CAF50", padding: 15, borderRadius: 10, marginTop: 30, alignItems: "center" },
  buttonText: { color: "white", fontSize: 18, fontWeight: "bold" },
  signatureBox: { marginTop: 40, marginBottom: 20 },
  signatureImage: { width: '100%', height: 200, borderColor: '#ccc', borderWidth: 1, marginTop: 10 },
  validatedText: { textAlign: 'center', marginTop: 10, fontSize: 16, color: 'green', fontWeight: 'bold' },
  printedText: { textAlign: 'center', marginTop: 5, fontSize: 16, color: '#2196F3', fontWeight: 'bold' },
});
