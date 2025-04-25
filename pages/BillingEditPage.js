import React, { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, Button, StyleSheet } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import * as Print from "expo-print";

const BillingEditPage = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params || {};

  const [invoice, setInvoice] = useState(null);

  useEffect(() => {
    if (id) fetchInvoice();
  }, [id]);

  const fetchInvoice = async () => {
    const { data, error } = await supabase
      .from("billing")
      .select("*")
      .eq("id", id)
      .single();

    if (error) return alert("Erreur de chargement");
    setInvoice(data);
  };

  const updateInvoice = async () => {
    const { error } = await supabase
      .from("billing")
      .update(invoice)
      .eq("id", id);

    if (error) return alert("Erreur de sauvegarde");
    alert("✅ Facture mise à jour");
    navigation.goBack();
  };

  if (!invoice) return <Text style={{ padding: 20 }}>Chargement...</Text>;
  const handlePrint = async () => {
	if (!invoice) return;
  
	const rows = invoice.lines?.map(
	  (line) => `
		<tr>
		  <td style="font-size: 10px;">${line.designation}</td>
		  <td style="text-align:center;">${line.quantity}</td>
		  <td style="text-align:right;">${(parseFloat(line.price) / 1.2).toFixed(2)} €</td>
		  <td style="text-align:right;">${(parseFloat(line.price) * parseFloat(line.quantity)).toFixed(2)} €</td>
		</tr>
	  `
	).join("") || "";
  
	const ttc = invoice.totalttc || 0;
	const acompte = parseFloat(invoice.acompte || 0);
	const tva = invoice.totaltva || 0;
  
	const html = `
	  <html>
		<body style="font-family: Arial; padding: 20px; font-size: 10px;">
		  <div style="text-align: center; margin-bottom: 10px;">
			<img src="https://www.avenir-informatique.fr/logo.webp" style="height: 40px;" />
		  </div>
  
		  <h2 style="text-align:center; margin-top: 10px; font-size: 14px;">FACTURE</h2>
  
		  <p><strong>Client :</strong> ${invoice.clientname}<br/>
		  <strong>Téléphone :</strong> ${invoice.clientphone}<br/>
		  <strong>Adresse :</strong> ${invoice.client_address}</p>
  
		  <p><strong>Facture N° :</strong> ${invoice.invoicenumber}<br/>
		  <strong>Date :</strong> ${invoice.invoicedate}</p>
  
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
  
		  <h3 style="text-align: right;">TVA (20%) : ${tva.toFixed(2)} €</h3>
		  <h3 style="text-align: right;">Total TTC : ${ttc.toFixed(2)} €</h3>
		  <h3 style="text-align: right;">Acompte versé : ${acompte.toFixed(2)} €</h3>
		  <h3 style="text-align: right;">Net à payer : ${(ttc - acompte).toFixed(2)} €</h3>
		  <h3 style="text-align: right;">Mode de paiement : ${invoice.paymentmethod || "....................................."}</h3>
  
		  <p style="font-size: 9px; text-align: center; margin-top: 40px;">
			<strong>AVENIR INFORMATIQUE</strong> - 16, place de l'Hôtel de Ville, 93700 Drancy<br/>
			Tél : 01 41 60 18 18 - SIRET : 523 456 789 00012<br/>
			R.C.S : Bobigny B422 240 457 - N/Id CEE FR32422240457<br/>
			Clause de réserve de propriété : les marchandises restent la propriété du vendeur jusqu'au paiement intégral.
		  </p>
		  <p style="margin-top: 10px; font-size: 10px; text-align: center;">
			En cas de litige, le tribunal de Bobigny est seul compétent. TVA non applicable, art. 293B du CGI.
		  </p>
		</body>
	  </html>
	`;
  
	await Print.printAsync({ html });
  };
  
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Modifier la facture</Text>

      <TextInput
        style={styles.input}
        placeholder="Nom du client"
        value={invoice.clientname}
        onChangeText={(text) => setInvoice({ ...invoice, clientname: text })}
      />
      <TextInput
        style={styles.input}
        placeholder="Téléphone"
        value={invoice.clientphone}
        onChangeText={(text) => setInvoice({ ...invoice, clientphone: text })}
      />
      <TextInput
        style={styles.input}
        placeholder="Adresse"
        value={invoice.client_address}
        onChangeText={(text) => setInvoice({ ...invoice, client_address: text })}
      />
      <TextInput
        style={styles.input}
        placeholder="Mode de paiement"
        value={invoice.paymentmethod}
        onChangeText={(text) => setInvoice({ ...invoice, paymentmethod: text })}
      />

      <Button title="💾 Sauvegarder" onPress={updateInvoice} />

	  <Button title="🖨️ Réimprimer cette facture" onPress={handlePrint} />


    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    backgroundColor: "#fff",
  },
});

export default BillingEditPage;
