import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, ScrollView, StyleSheet, TouchableOpacity, FlatList } from "react-native";
import { useNavigation, useRoute  } from "@react-navigation/native";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";

const BillingPage = () => {
	const navigation = useNavigation();
	const route = useRoute();
	const { expressData } = route.params || {}; // récupérer les données
	const [clientSuggestions, setClientSuggestions] = useState([]);
	const [focusedField, setFocusedField] = useState(null);
	const [clientname, setClientName] = useState(expressData?.clientname || "");
	const [clientphone, setClientPhone] = useState(expressData?.clientphone || "");
	const [client_address, setClientAddress] = useState(expressData?.client_address || "");
	const [invoicenumber, setInvoiceNumber] = useState(""); // ← celui-là reste vide car il sera généré
	const [invoicedate, setInvoiceDate] = useState(new Date().toLocaleDateString());
	const [paymentmethod, setPaymentMethod] = useState(expressData?.paymentmethod || "");
	const [acompte, setAcompte] = useState(expressData?.acompte || "");
	const [lines, setLines] = useState(
	  expressData
		? [{ 
			designation: expressData?.designation || "", 
			quantity: "1", 
			price: expressData?.price || "" 
		  }]
		: [{ designation: "", quantity: "1", price: "" }]
	);
	const [isSaved, setIsSaved] = useState(false);
	
  
	useEffect(() => {
		generateInvoiceNumber();
	  
		if (expressData) {
		  setClientName(expressData.name || expressData.clientname || "");
		  setClientPhone(expressData.phone || expressData.clientphone || "");
		  setClientAddress(expressData.client_address || "");
	  
		  setLines([
			{
				designation: expressData.description?.trim() || "Prestation",
				quantity: expressData.quantity ? expressData.quantity.toString() : "1",
				price: expressData.price ? expressData.price.toString() : "0",
			  }
		  ]);
	  
		  setPaymentMethod(expressData.paymentmethod || "");
		  setAcompte(expressData.acompte || "");
		}
	  }, []);
	  
	  
	  

  const generateInvoiceNumber = async () => {
    const { data, error } = await supabase
      .from("billing")
      .select("invoicenumber")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Erreur de récupération du dernier numéro:", error);
      return;
    }

    if (data && data.length > 0) {
      const lastNumber = data[0].invoicenumber;
      const match = lastNumber.match(/\d+$/);
      if (match) {
        const newNumber = (parseInt(match[0]) + 1).toString().padStart(match[0].length, "0");
        setInvoiceNumber(`FAC-AI${newNumber}`);
      } else {
        setInvoiceNumber("FAC-AI20252604");
      }
    } else {
      setInvoiceNumber("FAC-AI20252604");
    }
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
    if (!clientname.trim()) {
      alert("❌ Merci d'entrer le nom du client.");
      return;
    }
    if (!clientphone.trim()) {
      alert("❌ Merci d'entrer le numéro de téléphone.");
      return;
    }
    if (!paymentmethod.trim()) {
      alert("❌ Merci de sélectionner un mode de paiement.");
      return;
    }
    if (lines.length === 0 || lines.some(line => !line.designation.trim() || !line.quantity.trim() || !line.price.trim())) {
      alert("❌ Merci de remplir toutes les lignes de prestation (désignation, quantité et prix).");
      return;
    }

	let rows = '';

	if (expressData?.type === "video") {
	  // Cas du transfert vidéo
	  const quantity = parseFloat(expressData.cassettecount || 1);
	  const totalPriceTTC = parseFloat(expressData.price || 0);
	  const priceTTCUnit = totalPriceTTC / quantity;
	  const priceHTUnit = priceTTCUnit / 1.2;
	
	  rows = `
		<tr>
		  <td style="border: 1px solid #000; padding: 6px;">${expressData.description}</td>
		  <td style="border: 1px solid #000; padding: 6px; text-align: center;">${quantity}</td>
		  <td style="border: 1px solid #000; padding: 6px; text-align: right;">${priceHTUnit.toFixed(2)} €</td>
		  <td style="border: 1px solid #000; padding: 6px; text-align: right;">${totalPriceTTC.toFixed(2)} €</td>
		</tr>
	  `;
	} else {
	  // Cas normal (réparation, dépannage logiciel...)
	  rows = lines.map(line => {
		const quantity = parseFloat(line.quantity || 1);
		const totalPriceTTC = parseFloat(line.price || 0);
		const priceTTCUnit = totalPriceTTC / quantity;
		const priceHTUnit = priceTTCUnit / 1.2;
	
		return `
		  <tr>
			<td style="border: 1px solid #000; padding: 6px;">${line.designation}</td>
			<td style="border: 1px solid #000; padding: 6px; text-align: center;">${quantity}</td>
			<td style="border: 1px solid #000; padding: 6px; text-align: right;">${priceHTUnit.toFixed(2)} €</td>
			<td style="border: 1px solid #000; padding: 6px; text-align: right;">${totalPriceTTC.toFixed(2)} €</td>
		  </tr>
		`;
	  }).join('');
	}
	
	  
	  

	const html = `
	<html>
	  <body style="font-family: Arial, sans-serif; padding: 10px; margin: 0; background: #fff;">
	
		<div style="max-width: 480px; height: 100%; min-height: 720px; margin: auto; display: flex; flex-direction: column; justify-content: space-between;">
	
		  <!-- Haut -->
		  <div>
			<div style="text-align: center; margin-bottom: 10px;">
			  <img src="https://www.avenir-informatique.fr/logo.webp" style="height: 40px;" />
			</div>
	
			<h2 style="text-align:center; font-size: 16px; margin: 10px 0;">FACTURE</h2>
	
			<div style="font-size: 9px; margin-bottom: 8px;">
			  <p><strong>Client :</strong> ${clientname}<br/>
			  <strong>Téléphone :</strong> ${clientphone}<br/>
			  <strong>Adresse :</strong> ${client_address || "Non renseignée"}</p>
			</div>
	
			<div style="font-size: 9px; margin-bottom: 10px;">
			  <p><strong>Facture N° :</strong> ${invoicenumber}<br/>
			  <strong>Date :</strong> ${invoicedate}</p>
			</div>
	
<table width="100%" style="border-collapse: collapse; margin-top: 20px; font-size: 9px;">
  <thead style="background-color: #d3d3d3;">
    <tr>
      <th style="border: 1px solid #000; padding: 6px;">Désignation</th>
      <th style="border: 1px solid #000; padding: 6px;">Qté</th>
      <th style="border: 1px solid #000; padding: 6px;">P.U. HT</th>
      <th style="border: 1px solid #000; padding: 6px;">Montant TTC</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>

	
			<div style="font-size: 9px; margin-top: 15px;">
			  <p style="text-align: right;">TVA (20%) : ${totaltva.toFixed(2)} €</p>
			  <p style="text-align: right;">Total TTC : ${totalttc.toFixed(2)} €</p>
			  <p style="text-align: right;">Acompte versé : ${parseFloat(acompte || 0).toFixed(2)} €</p>
			</div>
	
			<div style="background: #e0f7fa; padding: 8px; border-radius: 6px; margin-top: 10px;">
			  <h3 style="text-align: right; margin: 0; font-size: 10px; color: #00796b;">
				Net à payer : ${(totalttc - parseFloat(acompte || 0)).toFixed(2)} €
			  </h3>
			</div>
	
			<p style="text-align: right; margin-top: 8px; font-size: 9px;">
			  <strong>Mode de paiement :</strong> ${paymentmethod || "....................................."}
			</p>
		  </div>
	
		  <!-- Bas -->
		  <div style="margin-top: 20px; background: #f0f0f0; padding: 8px; font-size: 8px; text-align: center; color: #555;">
			<p><strong>AVENIR INFORMATIQUE</strong> - 16, place de l'Hôtel de Ville, 93700 Drancy</p>
			<p>Tél : 01 41 60 18 18 - SIRET : 422 240 457 00016</p>
			<p>R.C.S : Bobigny B422 240 457 - N/Id CEE FR32422240457</p>
	
			<p style="margin-top: 6px;">
			  Clause de réserve de propriété : les marchandises restent la propriété du vendeur jusqu'au paiement intégral.<br/>
			  En cas de litige, le tribunal de Bobigny est seul compétent. TVA non applicable, art. 293B du CGI.
			</p>
		  </div>
	
		</div>
	
	  </body>
	</html>
	`;
	
    await Print.printAsync({ html });
  };

  const handleSave = async () => {
	if (!clientname.trim() || !clientphone.trim() || lines.length === 0) {
	  alert("❌ Remplissez correctement la fiche.");
	  return;
	}
  
	try {
	  const { error } = await supabase.from("billing").insert([{
		clientname,
		clientphone,
		client_address,
		invoicenumber,
		invoicedate: new Date(invoicedate.split("/").reverse().join("-")),
		paymentmethod,
		acompte: acompte === "" ? 0 : parseFloat(acompte),
		lines,
		totalht: isNaN(totalht) ? 0 : totalht,
		totaltva: isNaN(totaltva) ? 0 : totaltva,
		totalttc: isNaN(totalttc) ? 0 : totalttc,
		created_at: new Date()
	  }]);
  
	  if (error) throw error;
	  alert("✅ Facture enregistrée avec succès");
	  setIsSaved(true);
	} catch (error) {
	  console.error("Erreur de sauvegarde:", error);
	  alert("❌ Erreur lors de la sauvegarde");
	}
  };
  

  const removeLine = (indexToRemove) => {
    const newLines = lines.filter((_, index) => index !== indexToRemove);
    setLines(newLines);
  };

  const searchClients = async (text) => {
    setClientName(text);
    if (text.length < 2) {
      setClientSuggestions([]);
      return;
    }
    const { data, error } = await supabase
      .from("clients")
      .select("name, phone")
      .ilike("name", `${text}%`);

    if (!error) setClientSuggestions(data || []);
  };

  const selectClient = (client) => {
    setClientName(client.name);
    setClientPhone(client.phone || "");
    setClientSuggestions([]);
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Facture client</Text>

	  <TextInput
  placeholder="Nom du client"
  value={clientname}
  onChangeText={searchClients}
  style={[styles.input, focusedField === "name" && styles.inputFocused]}
  onFocus={() => setFocusedField("name")}
  onBlur={() => setFocusedField(null)}
/>
{clientSuggestions.length > 0 && (
  <View style={styles.suggestionContainer}>
    {clientSuggestions.map((item, index) => (
      <TouchableOpacity key={index} onPress={() => selectClient(item)} style={styles.suggestionItem}>
        <Text style={styles.suggestionText}>
          {item.name} - {item.phone}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
)}

<TextInput
  placeholder="Téléphone"
  value={clientphone}
  onChangeText={setClientPhone}
  style={[styles.input, focusedField === "phone" && styles.inputFocused]}
  keyboardType="phone-pad"
  onFocus={() => setFocusedField("phone")}
  onBlur={() => setFocusedField(null)}
/>

<TextInput
  placeholder="Adresse"
  value={client_address}
  onChangeText={setClientAddress}
  style={[styles.input, focusedField === "address" && styles.inputFocused]}
  onFocus={() => setFocusedField("address")}
  onBlur={() => setFocusedField(null)}
/>

<TextInput
  placeholder="Numéro de facture"
  value={invoicenumber}
  onChangeText={setInvoiceNumber}
  style={[styles.input, focusedField === "invoice" && styles.inputFocused]}
  onFocus={() => setFocusedField("invoice")}
  onBlur={() => setFocusedField(null)}
/>

<TextInput
  placeholder="Date"
  value={invoicedate}
  onChangeText={setInvoiceDate}
  style={[styles.input, focusedField === "date" && styles.inputFocused]}
  onFocus={() => setFocusedField("date")}
  onBlur={() => setFocusedField(null)}
/>

<TextInput
  placeholder="Acompte versé (€)"
  value={acompte}
  onChangeText={setAcompte}
  style={[styles.input, focusedField === "acompte" && styles.inputFocused]}
  keyboardType="numeric"
  onFocus={() => setFocusedField("acompte")}
  onBlur={() => setFocusedField(null)}
/>



	  <Text style={styles.subtitle}>Prestations :</Text>

	  {lines.map((line, index) => (
  <View key={index} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
    <TextInput
      placeholder="Désignation"
      value={line.designation}
      onChangeText={(text) => updateLine(index, "designation", text)}
      style={[
        styles.input,
        { flex: 2 },
        focusedField === `designation-${index}` && styles.inputFocused
      ]}
      onFocus={() => setFocusedField(`designation-${index}`)}
      onBlur={() => setFocusedField(null)}
    />
    <TextInput
      placeholder="Qté"
      value={line.quantity}
      onChangeText={(text) => updateLine(index, "quantity", text)}
      style={[
        styles.input,
        { flex: 1 },
        focusedField === `quantity-${index}` && styles.inputFocused
      ]}
      keyboardType="numeric"
      onFocus={() => setFocusedField(`quantity-${index}`)}
      onBlur={() => setFocusedField(null)}
    />
    <TextInput
      placeholder="P.U. TTC"
      value={line.price}
      onChangeText={(text) => updateLine(index, "price", text)}
      style={[
        styles.input,
        { flex: 1 },
        focusedField === `price-${index}` && styles.inputFocused
      ]}
      keyboardType="numeric"
      onFocus={() => setFocusedField(`price-${index}`)}
      onBlur={() => setFocusedField(null)}
    />
<TouchableOpacity
  onPress={() => removeLine(index)}
  style={styles.deleteButton}
>
  <Text style={styles.deleteButtonText}>🗑️</Text>
</TouchableOpacity>
  </View>
))}

<View style={styles.addButtonContainer}>
  <TouchableOpacity 
    style={styles.addButton}
    onPress={() => setLines([...lines, { designation: "", quantity: "1", price: "" }])}
  >
    <Text style={styles.addButtonText}>➕ Ajouter une ligne</Text>
  </TouchableOpacity>
</View>


<Text style={styles.subtitle}>Mode de paiement :</Text>

<View style={styles.paymentRow}>
  <TouchableOpacity
    style={[
      styles.paymentButton,
      paymentmethod === "CB" && styles.paymentButtonSelected
    ]}
    onPress={() => setPaymentMethod("CB")}
  >
    <Text style={styles.paymentButtonText}>
      💳 CARTE BANCAIRE
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[
      styles.paymentButton,
      paymentmethod === "Espèces" && styles.paymentButtonSelected
    ]}
    onPress={() => setPaymentMethod("Espèces")}
  >
    <Text style={styles.paymentButtonText}>
      💵 ESPÈCES
    </Text>
  </TouchableOpacity>
</View>


<View style={styles.buttonRow}>
  <TouchableOpacity
    style={[styles.actionButton, { backgroundColor: isSaved ? "#28a745" : "#ccc" }]}
    onPress={handlePrint}
    disabled={!isSaved}
  >
    <Text style={styles.buttonText}>🖨️ Imprimer</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.actionButton, { backgroundColor: "#007bff" }]}
    onPress={handleSave}
  >
    <Text style={styles.buttonText}>💾 Sauvegarder</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.actionButton, { backgroundColor: "#555" }]}
    onPress={() => navigation.navigate('BillingListPage')}
  >
    <Text style={styles.buttonText}>📄 Liste des Factures</Text>
  </TouchableOpacity>
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
  suggestionContainer: {
  backgroundColor: "#fff",
  borderWidth: 1,
  borderColor: "#ccc",
  borderRadius: 8,
  marginBottom: 10,
  paddingVertical: 5,
  elevation: 3, // petite ombre pour bien démarquer
},

suggestionItem: {
  paddingVertical: 10,
  paddingHorizontal: 15,
  borderBottomWidth: 1,
  borderBottomColor: "#eee",
},

suggestionText: {
  fontSize: 14,
},
noResult: {
  textAlign: "center",
  color: "gray",
  marginBottom: 10,
},
buttonRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  marginTop: 20,
},
actionButton: {
  flex: 1,
  marginHorizontal: 5,
  paddingVertical: 12,
  borderRadius: 10,
  alignItems: "center",
},
buttonText: {
  color: "#fff",
  fontWeight: "bold",
  fontSize: 14,
},
deleteButton: {
  backgroundColor: "#dc3545",
  borderRadius: 8,
  justifyContent: "center",
  alignItems: "center",
  height: 36,         // 🔥 même hauteur que ton TextInput + padding
  width: 36,          // 🔥 carré
  marginTop: 0,       // 🛠️ pour éviter de descendre
  alignSelf: "center", // 🔥 centre verticalement
  marginLeft: 8,       // 👈 petit espace entre le champ et le bouton
},
deleteButtonText: {
  color: "white",
  fontSize: 22,
  fontWeight: "bold",
},
input: {
  borderWidth: 1,
  borderColor: "#ccc",
  padding: 8,
  borderRadius: 5,
  marginBottom: 10,
  fontSize: 14,
  backgroundColor: "#fff",
  height: 42,
},
inputFocused: {
  borderColor: "#007bff",
  backgroundColor: "#eef6ff",
  fontSize: 18,
  height: 55,
},
paymentRow: {
  flexDirection: "row",
  justifyContent: "center",
  gap: 10,
  marginVertical: 20,
},

paymentButton: {
  flex: 1,
  backgroundColor: "#ddd",
  paddingVertical: 12,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
  elevation: 3, // Petite ombre
},

paymentButtonSelected: {
  backgroundColor: "#28a745", // Vert si sélectionné
},

paymentButtonText: {
  color: "#000",
  fontWeight: "bold",
  fontSize: 14,
  textTransform: "uppercase",
},
addButtonContainer: {
  marginVertical: 10,
  alignItems: "center",
},

addButton: {
  backgroundColor: "#4da6ff", // Bleu clair
  paddingVertical: 12,
  paddingHorizontal: 20,
  borderRadius: 8,
  alignItems: "center",
  elevation: 3,
},

addButtonText: {
  color: "#fff",
  fontSize: 16,
  fontWeight: "bold",
},


});

export default BillingPage;