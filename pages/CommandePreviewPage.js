import React, { useRef, useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image } from "react-native";
import Signature from "react-native-signature-canvas";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";

export default function CommandePreviewPage({ route }) {
  const { order } = route.params || {};
  const client = order?.client || {};

  // ===== Utilitaires =====
  const sanitizeNumber = (v) => {
    if (v == null) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    const s = String(v).replace(/[^0-9.,-]/g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };
  const formatMontant = (valeur) => {
    const n = Number(valeur || 0);
    const fixed = n.toFixed(2);
    const [int, dec] = fixed.split(".");
    const intSpaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return `${intSpaced},${dec} €`;
  };

  // ===== Quantité / Prix unitaire / Total (robustes) =====
  const qty = useMemo(() => {
    const q = parseInt(order?.quantity ?? order?.qty ?? 1, 10);
    return Number.isFinite(q) && q > 0 ? q : 1;
  }, [order?.quantity, order?.qty]);

  const unitFromProps = useMemo(() => sanitizeNumber(order?.price ?? order?.unitPrice), [order?.price, order?.unitPrice]);
  const totalFromProps = useMemo(() => sanitizeNumber(order?.total ?? order?.cost), [order?.total, order?.cost]);

  // Règle:
  // 1) si prix unitaire fourni → total = unit * qty
  // 2) sinon si total fourni → unit = total / qty
  const unit = useMemo(() => {
    if (unitFromProps > 0) return unitFromProps;
    if (totalFromProps > 0) return totalFromProps / qty;
    return 0;
  }, [unitFromProps, totalFromProps, qty]);

  const total = useMemo(() => {
    if (unitFromProps > 0) return unitFromProps * qty;
    if (totalFromProps > 0) return totalFromProps;
    return 0;
  }, [unitFromProps, totalFromProps, qty]);

  const acompte = useMemo(() => sanitizeNumber(order?.acompte ?? order?.deposit), [order?.acompte, order?.deposit]);
  const reste = useMemo(() => Math.max(0, total - acompte), [total, acompte]);

  // ===== Signature =====
  // Important : ne pas utiliser order.signature (n'existe pas) → on garde order.signatureclient
  const [signatureData, setSignatureData] = useState(order?.signatureclient || null);
  const [isPrinted, setIsPrinted] = useState(order?.printed || false);
  const signatureRef = useRef();

  const handleOK = async (sig) => {
    setSignatureData(sig);
    try {
      const { error } = await supabase.from("orders").update({ signatureclient: sig }).eq("id", order.id);
      if (error) throw error;
    } catch (e) {
      console.error("❌ Sauvegarde signature:", e);
    }
  };

  const handlePrint = async () => {
    if (!signatureData) {
      Alert.alert("Signature requise", "Veuillez faire signer la commande avant impression.");
      return;
    }

    const dateDuJour = new Date().toLocaleDateString("fr-FR");

    const htmlContent = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            @page { size: A5; margin: 12mm; }
            body { font-family: Arial, sans-serif; font-size: 12px; color: #333; }
            .container { padding: 4px; }
            h1 { text-align: center; color: #222; font-size: 18px; margin: 6px 0 10px; }
            .header { text-align: center; margin-bottom: 8px; }
            .company-name { font-size: 14px; font-weight: bold; color: #252525; }
            .company-details { font-size: 10px; color: #555; line-height: 1.3; }
            .row { display: flex; gap: 10px; }
            .col { flex: 1; }
            .section { margin-bottom: 8px; border: 1px solid #ccc; padding: 8px; border-radius: 6px; }
            .section-title { font-size: 13px; font-weight: bold; margin-bottom: 6px; }
            .field { margin-bottom: 4px; display: flex; }
            .label { font-weight: bold; width: 100px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
            th { background: #f2f2f2; }
            .right { text-align: right; }
            .signature { margin-top: 8px; }
            .signature img { margin-top: 6px; max-width: 180px; height: auto; border: 1px solid #ddd; border-radius: 4px; }
            .footer-note { text-align: center; font-size: 10px; margin-top: 8px; color: #777; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="company-name">AVENIR INFORMATIQUE</div>
              <div class="company-details">
                16 place de l'Hôtel de Ville – 93700 Drancy<br/>
                Tél. : 01 41 60 18 18
              </div>
            </div>

            <h1>Bon de Commande</h1>

            <div class="row">
              <div class="col section">
                <div class="section-title">Client</div>
                <div class="field"><div class="label">Nom :</div><div>${client.name || ""}</div></div>
                <div class="field"><div class="label">Fiche n° :</div><div>${client.ficheNumber || ""}</div></div>
                <div class="field"><div class="label">Date :</div><div>${dateDuJour}</div></div>
              </div>
              <div class="col section">
                <div class="section-title">Produit</div>
                <div class="field"><div class="label">Type :</div><div>${order?.deviceType || ""}</div></div>
                <div class="field"><div class="label">Marque :</div><div>${order?.brand || ""}</div></div>
                <div class="field"><div class="label">Modèle :</div><div>${order?.model || ""}</div></div>
                <div class="field"><div class="label">Quantité :</div><div>${qty}</div></div>
              </div>
            </div>

            <div class="section">
              <table>
                <thead>
                  <tr>
                    <th>Désignation</th>
                    <th class="right">Qté</th>
                    <th class="right">Prix unit.</th>
                    <th class="right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>${[order?.deviceType, order?.brand, order?.model].filter(Boolean).join(" ")}</td>
                    <td class="right">${qty}</td>
                    <td class="right">${formatMontant(unit)}</td>
                    <td class="right">${formatMontant(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="row">
                <div class="col">
                  <div class="field"><div class="label">Acompte :</div><div>${formatMontant(acompte)}</div></div>
                  <div class="field"><div class="label">Reste à payer :</div><div><strong>${formatMontant(reste)}</strong></div></div>
                </div>
                <div class="col signature">
                  <div><strong>Signature du client :</strong></div>
                  ${signatureData ? `<img src="${signatureData}" alt="Signature du client" />` : ""}
                </div>
              </div>
            </div>

            <div class="footer-note">Merci de votre confiance.</div>
          </div>
        </body>
      </html>
    `;

    try {
      await Print.printAsync({ html: htmlContent });
      const { error } = await supabase.from("orders").update({ printed: true }).eq("id", order.id);
      if (!error) setIsPrinted(true);
    } catch (e) {
      console.error("❌ Impression:", e);
      Alert.alert("Erreur", "Impossible d'imprimer ce document.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Aperçu de la Commande</Text>

      <Text style={styles.label}>Nom du client : {client.name}</Text>
      <Text style={styles.label}>Numéro de fiche : {client.ficheNumber}</Text>

      <Text style={styles.label}>Produit : {order?.deviceType}</Text>
      <Text style={styles.label}>Marque : {order?.brand}</Text>
      <Text style={styles.label}>Modèle : {order?.model}</Text>

      <Text style={styles.label}>Quantité : {qty}</Text>
      <Text style={styles.label}>Prix unitaire : {formatMontant(unit)}</Text>
      <Text style={styles.label}>Total : {formatMontant(total)}</Text>

      <Text style={styles.label}>Acompte : {formatMontant(acompte)}</Text>
      <Text style={styles.label}>Montant restant dû : {formatMontant(reste)}</Text>

      <View style={styles.signatureBox}>
        <Text style={styles.label}>Signature du client :</Text>
        {signatureData ? (
          <>
            <Image source={{ uri: signatureData }} style={styles.signatureImage} resizeMode="contain" />
            {isPrinted && <Text style={styles.printedText}>🖨️ Commande imprimée</Text>}
          </>
        ) : (
          <View style={{ height: 360, width: '100%' }}>
            <Signature
              ref={signatureRef}
              onOK={handleOK}
              onEmpty={() => console.log("🛑 Signature vide")}
              descriptionText="Signez ci-dessous"
              clearText="Effacer"
              confirmText="Valider"
              webStyle={`
                .m-signature-pad { box-shadow: none; border: 2px solid #2ecc71; width: 100% !important; height: 80% !important; }
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
  container: {
    padding: 24,
    backgroundColor: "#f9f9f9",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 24,
    textAlign: "center",
    color: "#2c3e50",
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    color: "#34495e",
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderColor: "#ccc",
  },
  button: {
    backgroundColor: "#2ecc71",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 30,
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  buttonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "bold",
  },
  signatureBox: {
    marginTop: 40,
    marginBottom: 30,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  signatureImage: {
    width: 220,
    height: 120,
    borderRadius: 6,
    borderColor: "#bbb",
    borderWidth: 1,
    marginTop: 10,
  },
  printedText: {
    textAlign: "center",
    marginTop: 6,
    fontSize: 15,
    color: "#2980b9",
    fontWeight: "bold",
  },
});