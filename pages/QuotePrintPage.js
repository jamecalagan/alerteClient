import React, { useEffect, useState } from "react";
import { ScrollView, Text, View, Alert, TouchableOpacity } from "react-native";
import { useRoute } from "@react-navigation/native";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";

const QuotePrintPage = () => {
  const route = useRoute();
  const { id } = route.params;
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    fetchQuote();
  }, []);

  const fetchQuote = async () => {
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      Alert.alert("Erreur", "Impossible de charger le devis");
      console.error(error);
    } else {
      setQuote(data);
    }
  };

  const handlePrint = async () => {
    if (!quote) return;

    const rowsHtml = quote.items.map((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const puTTC = parseFloat(item.unitPrice) || 0;
      const totalTTC = qty * puTTC;
      const puHT = puTTC / 1.2;
      const totalHT = puHT * qty;
      const tva = totalTTC - totalHT;

      return `
        <tr>
          <td>${item.description}</td>
          <td style="text-align: center;">${qty}</td>
          <td style="text-align: right;">${puHT.toFixed(2)} €</td>
          <td style="text-align: right;">${tva.toFixed(2)} €</td>
          <td style="text-align: right;">${totalTTC.toFixed(2)} €</td>
        </tr>
      `;
    }).join("");

    const totalTTC = quote.items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const pu = parseFloat(item.unitPrice) || 0;
      return sum + qty * pu;
    }, 0);

    const totalHT = totalTTC / 1.2;
    const totalTVA = totalTTC - totalHT;
    const remise = (quote.discount / 100) * totalHT;
    const acompte = parseFloat(quote.deposit || 0);
    const totalFinal = totalTTC - remise - acompte;

	const html = `
	<html>
	<head>
	  <style>
		body {
		  font-family: 'Helvetica', Arial, sans-serif;
		  font-size: 12px;
		  color: #222;
		  padding: 20px;
		}
		  img {
  display: block;
}
		h2 {
		  text-align: center;
		  color: #007bff;
		  margin-bottom: 30px;
		}
		table {
		  width: 100%;
		  border-collapse: collapse;
		  margin-top: 10px;
		}
		th, td {
		  border: 1px solid #ccc;
		  padding: 8px;
		}
		th {
		  background-color: #f5f5f5;
		  text-align: left;
		}
		td:last-child, th:last-child {
		  text-align: right;
		}
		.totaux td {
		  border: none;
		  text-align: right;
		  padding: 6px 0;
		}
		.signature {
		  margin-top: 40px;
		}
		.remarks {
		  margin-top: 20px;
		  font-style: italic;
		  color: #444;
		}
	  </style>
	</head>
	<body>
<div style="text-align: center; margin-bottom: 10px;">
  <img 
    src="https://www.avenir-informatique.fr/logo.webp" 
    style="height: 40px; display: block; margin: 0 auto;" 
    alt="Logo Avenir Informatique"
  />
</div>


</div>
	  <h2>DEVIS N° ${quote.quote_number}</h2>
	
	  <p>
		<strong>Client :</strong> ${quote.name}<br/>
		<strong>Téléphone :</strong> ${quote.phone || "N/A"}<br/>
<strong>Date :</strong> ${new Date(quote.created_at).toLocaleDateString("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
})}<br/>
<strong>Valide jusqu'au :</strong> ${new Date(quote.valid_until).toLocaleDateString("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
})}

	  </p>
	
	  <table>
		<thead>
		  <tr>
			<th>Désignation</th>
			<th style="text-align:center;">Qté</th>
			<th>PU HT</th>
			<th>TVA</th>
			<th>Total TTC</th>
		  </tr>
		</thead>
		<tbody>
		  ${rowsHtml}
		</tbody>
	  </table>
	
	  <table class="totaux">
		<tr><td><strong>Total HT :</strong> ${totalHT.toFixed(2)} €</td></tr>
		<tr><td><strong>TVA (20%) :</strong> ${totalTVA.toFixed(2)} €</td></tr>
		<tr><td><strong>Total TTC :</strong> ${totalTTC.toFixed(2)} €</td></tr>
		<tr><td><strong>Remise :</strong> -${remise.toFixed(2)} €</td></tr>
		<tr><td><strong>Acompte versé :</strong> -${acompte.toFixed(2)} €</td></tr>
		<tr><td><strong>Total à payer :</strong> ${totalFinal.toFixed(2)} €</td></tr>
	  </table>
	
	  ${quote.remarks ? `<p class="remarks"><strong>Remarques :</strong><br/>${quote.remarks}</p>` : ""}
	
	  <div class="signature">
		<p><strong>Signature du client :</strong></p>
		${quote.signature
		  ? `<img src="${quote.signature}" style="width: 250px; height: auto; margin-top: 10px;" />`
		  : "<p>________________________</p>"}
	  </div>
	  <div style="margin-top: 50px; font-size: 11px; text-align: center; color: #555;">
  <p>AVENIR INFORMATIQUE – 16, place de l’Hôtel de Ville – 93700 Drancy</p>
  <p>Tel : 01 41 60 18 18 – contact@avenir-informatique.fr</p>
</div>
	</body>
	</html>
	`;
	

    await Print.printAsync({ html });
  };

  if (!quote) return <Text style={{ padding: 20 }}>Chargement du devis...</Text>;

  return (
    <ScrollView style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>
        Aperçu du devis
      </Text>
      <Text>Client : {quote.name}</Text>
      <Text>Téléphone : {quote.phone}</Text>
      <Text>
  Date :{" "}
  {new Date(quote.created_at).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}
</Text>

<Text>
  Valide jusqu'au :{" "}
  {new Date(Date.parse(quote.valid_until)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}
</Text>


      <Text style={{ marginTop: 10 }}>Nombre de lignes : {quote.items.length}</Text>

      <TouchableOpacity
        style={{
          marginTop: 30,
          backgroundColor: "#007bff",
          padding: 12,
          borderRadius: 8,
          alignItems: "center",
        }}
        onPress={handlePrint}
      >
        <Text style={{ color: "#fff", fontWeight: "bold" }}>🖨️ Imprimer le devis</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default QuotePrintPage;
