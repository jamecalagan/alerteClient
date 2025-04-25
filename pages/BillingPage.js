import React, { useState } from "react";
import { View, Text, TextInput, Button, ScrollView, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";

const BillingPage = () => {
  const navigation = useNavigation();
  const [clientname, setClientName] = useState("");
  const [clientphone, setClientPhone] = useState("");
  const [client_address, setClientAddress] = useState("");
  const [invoicenumber, setInvoiceNumber] = useState("FAC-001");
  const [invoicedate, setInvoiceDate] = useState(new Date().toLocaleDateString());
  const [paymentmethod, setPaymentMethod] = useState("");
  const [acompte, setAcompte] = useState("");
  const [lines, setLines] = useState([
    { designation: "", quantity: "1", price: "0" },
  ]);

  const addLine = () => {
    setLines([...lines, { designation: "", quantity: "1", price: "0" }]);
  };

  const updateLine = (index, field, value) => {
    const newLines = [...lines];
    newLines[index][field] = value;
    setLines(newLines);
  };

  const totalttc = lines.reduce(
    (total, line) => total + parseFloat(line.quantity) * parseFloat(line.price),
    0
  );
  const tvaRate = 0.2;
  const totalht = totalttc / (1 + tvaRate);
  const totaltva = totalttc - totalht;

  const handlePrint = async () => {
    const rows = lines
      .map(
        (line) =>
          `<tr>
            <td style="font-size: 10px;">${line.designation}</td>
            <td style="text-align:center;">${line.quantity}</td>
            <td style="text-align:right;">${(parseFloat(line.price) / 1.2).toFixed(2)} €</td>
            <td style="text-align:right;">${(parseFloat(line.quantity) * parseFloat(line.price)).toFixed(2)} €</td>
          </tr>`
      )
      .join("");

    const html = `
      <html>
        <body style="font-family: Arial; padding: 20px; font-size: 10px;">
          <div style="text-align: center; margin-bottom: 10px;">
            <img src="https://www.avenir-informatique.fr/logo.webp" alt="Logo de la société" style="height: 40px;"/>
          </div>

          <h2 style="text-align:center; margin-top: 10px; font-size: 14px;">FACTURE</h2>

          <p><strong>Client :</strong> ${clientname}<br/>
          <strong>Téléphone :</strong> ${clientphone}<br/>
          <strong>Adresse :</strong> ${client_address}</p>

          <p><strong>Facture N° :</strong> ${invoicenumber}<br/>
          <strong>Date :</strong> ${invoicedate}</p>

          <table width="100%" border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr>
                <th style="font-size: 10px;">Désignation</th>
                <th>Qté</th>
                <th style="font-size: 10px;">P.U. HT</th>
                <th>Montant TTC</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

<h3 style="text-align: right;">TVA (20%) : ${totaltva.toFixed(2)} €</h3>
<h3 style="text-align: right;">Total TTC : ${totalttc.toFixed(2)} €</h3>
<h3 style="text-align: right;">Acompte versé : ${parseFloat(acompte || 0).toFixed(2)} €</h3>
<h3 style="text-align: right;">Net à payer : ${(totalttc - parseFloat(acompte || 0)).toFixed(2)} €</h3>
<h3 style="text-align: right;">Mode de paiement : ${paymentmethod || "....................................."}</h3>

          <p style="font-size: 9px; text-align: center; margin-top: 40px;">
  <strong>AVENIR INFORMATIQUE</strong> - 16, place de l'Hôtel de Ville, 93700 Drancy<br/>
  Tél : 01 41 60 18 18 - SIRET : 523 456 789 00012<br/>
  R.C.S : Bobigny B422 240 457 - N/Id CEE FR32422240457<br/>
  Clause de réserve de propriété : les marchandises restent la propriété du vendeur jusqu'au paiement intégral.
</p>
<p style="margin-top: 10px; font-size: 10px; text-align: justify;">
  En cas de litige, le tribunal de Bobigny est seul compétent. TVA non applicable, art. 293B du CGI.
</p>

        </body>
      </html>
    `;

    await Print.printAsync({ html });
  };

  const handleSave = async () => {
    try {
		const { error } = await supabase.from("billing").insert([
			{
			  clientname,
			  clientphone,
			  client_address,
			  invoicenumber,
			  invoicedate: new Date(invoicedate.split("/").reverse().join("-")),
			  paymentmethod,
			  acompte,
			  lines,
			  totalht,
			  totaltva,
			  totalttc,
			  created_at: new Date()
			},
		  ]);
      if (error) throw error;
      alert("✅ Facture enregistrée avec succès");
    } catch (error) {
      console.error("Erreur de sauvegarde:", error);
      alert("❌ Erreur lors de la sauvegarde");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Facture client</Text>

      <TextInput placeholder="Nom du client" value={clientname} onChangeText={setClientName} style={styles.input} />
      <TextInput placeholder="Téléphone" value={clientphone} onChangeText={setClientPhone} style={styles.input} keyboardType="phone-pad" />
      <TextInput placeholder="Adresse" value={client_address} onChangeText={setClientAddress} style={styles.input} />
      <TextInput placeholder="Numéro de facture" value={invoicenumber} onChangeText={setInvoiceNumber} style={styles.input} />
      <TextInput placeholder="Date" value={invoicedate} onChangeText={setInvoiceDate} style={styles.input} />
      <TextInput placeholder="Acompte versé (€)" value={acompte} onChangeText={setAcompte} style={styles.input} keyboardType="numeric" />

      <Text style={styles.subtitle}>Prestations :</Text>
      {lines.map((line, index) => (
        <View key={index} style={styles.lineRow}>
          <TextInput
            placeholder="Désignation"
            value={line.designation}
            onChangeText={(text) => updateLine(index, "designation", text)}
            style={[styles.input, { flex: 2 }]}
          />
          <TextInput
            placeholder="Qté"
            value={line.quantity}
            onChangeText={(text) => updateLine(index, "quantity", text)}
            style={[styles.input, { flex: 1 }]}
            keyboardType="numeric"
          />
          <TextInput
            placeholder="P.U. TTC"
            value={line.price}
            onChangeText={(text) => updateLine(index, "price", text)}
            style={[styles.input, { flex: 1 }]}
            keyboardType="numeric"
          />
        </View>
      ))}

      <Button title="+ Ajouter une ligne" onPress={addLine} />

      <Text style={styles.subtitle}>Mode de paiement :</Text>
      <View style={{ flexDirection: "row", gap: 20, marginBottom: 20 }}>
        <Button title="CB" onPress={() => setPaymentMethod("CB")} color={paymentmethod === "CB" ? "green" : undefined} />
        <Button title="Espèces" onPress={() => setPaymentMethod("Espèces")} color={paymentmethod === "Espèces" ? "green" : undefined} />
      </View>

      <View style={{ marginTop: 20 }}>
        <Button title="🖨️ Imprimer la facture" onPress={handlePrint} />
      </View>

      <View style={{ marginTop: 10 }}>
        <Button title="💾 Sauvegarder la facture" onPress={handleSave} color="#007bff" />
      </View>

      <View style={{ marginTop: 10 }}>
        <Button title="📄 Voir les factures" onPress={() => navigation.navigate('BillingListPage')} color="#555" />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
  subtitle: { fontSize: 16, fontWeight: "bold", marginTop: 20, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 5,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  lineRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
});

export default BillingPage;