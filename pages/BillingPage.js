import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    Button,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    FlatList,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";
const handlePrintGuard = () => {
    Alert.alert(
        "Paiement incomplet",
        "Le client doit avoir réglé la totalité avant d'imprimer la facture."
    );
};

const BillingPage = () => {
    const navigation = useNavigation();
    const route = useRoute();
	const expressData = route.params?.expressData || {};
	const order_id = expressData.order_id || null; 
	const express_id = expressData.express_id || null;
	const [quoteNumber, setQuoteNumber] = useState(null);

    const [clientSuggestions, setClientSuggestions] = useState([]);
    const [focusedField, setFocusedField] = useState(null);
    const [clientname, setClientName] = useState("");
    const [clientphone, setClientPhone] = useState("");
    const [client_address, setClientAddress] = useState("");
    const [invoicenumber, setInvoiceNumber] = useState("");
    const [invoicedate, setInvoiceDate] = useState(new Date().toLocaleDateString());
    const [paymentmethod, setPaymentMethod] = useState("");
    const [acompte, setAcompte] = useState("");
    const [paid, setPaid] = useState(false);
    const [lines, setLines] = useState([
        { designation: "", quantity: "1", price: "", serial: "" }
    ]);
    const [isSaved, setIsSaved] = useState(false);
	useEffect(() => {
		if (route.params?.fromQuote) {
		  setQuoteNumber(route.params.quoteNumber || null);
		  const {
			name,
			phone,
			items,
			remarks,
			totalttc,
		  } = route.params;
	  
		  console.log("✅ Facture depuis devis :", route.params);
	  
		  setClientName(name || "");
		  setClientPhone(phone || "");
	  
		  setLines(
			items.map((item) => ({
			  designation: item.label
				? `${item.label} — ${item.description}`
				: item.description,
			  quantity: item.quantity || "1",
			  price: item.unitPrice || "",
			  serial: "",
			}))
		  );
	  
		  generateInvoiceNumber(); // ✅ AJOUT ICI
		} else if (expressData) {
		  if (expressData?.invoicenumber) {
			setInvoiceNumber(expressData.invoicenumber);
		  } else {
			generateInvoiceNumber();
		  }
	  
		  setClientName(expressData.name || expressData.clientname || "");
		  setClientPhone(expressData.phone || expressData.clientphone || "");
		  setClientAddress(expressData.client_address || "");
		  setLines([
			{
			  designation: expressData.description?.trim() || "Prestation",
			  quantity: expressData.quantity ? expressData.quantity.toString() : "1",
			  price: expressData.price ? expressData.price.toString() : "0",
			  serial: expressData.serial || "",
			},
		  ]);
		  setPaymentMethod(expressData.paymentmethod || "");
		  setAcompte(
			expressData.acompte !== undefined && !isNaN(expressData.acompte)
			  ? expressData.acompte.toString()
			  : ""
		  );
		  setPaid(expressData.paid || false);
		} else {
		  generateInvoiceNumber();
		}
	  
		setIsSaved(false);
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
                const newNumber = (parseInt(match[0]) + 1)
                    .toString()
                    .padStart(match[0].length, "0");
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
        (total, line) =>
            total + parseFloat(line.quantity) * parseFloat(line.price),
        0
    );
    const tvaRate = 0.2;
    const totalht = totalttc / (1 + tvaRate);
    const totaltva = totalttc - totalht;

	const handlePrint = async () => {
		const expressData = route.params?.expressData || {};
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
		  alert("❌ Merci de remplir toutes les lignes (désignation, quantité et prix).");
		  return;
		}
	  
		let rows = '';
	  
		if (expressData?.type === "video") {
		  const quantity = parseFloat(expressData.cassettecount || 1);
		  const totalPriceTTC = parseFloat(expressData.price || 0);
		  const priceTTCUnit = totalPriceTTC / quantity;
		  const priceHTUnit = priceTTCUnit / 1.2;
	  
		  rows = `
			<tr>
			  <td style="border: 1px solid #000; padding: 6px;">${expressData.description || ""}</td>
			  <td style="border: 1px solid #000; padding: 6px; text-align: center;">${quantity}</td>
			  <td style="border: 1px solid #000; padding: 6px; text-align: right;">${priceHTUnit.toFixed(2)} €</td>
			  <td style="border: 1px solid #000; padding: 6px; text-align: right;">${totalPriceTTC.toFixed(2)} €</td>
			</tr>
		  `;
		} else {
		  rows = lines.map(line => {
			const quantity = parseFloat(line.quantity || "1");
			const totalPriceTTC = parseFloat(line.price || "0");
			const priceTTCUnit = totalPriceTTC / quantity;
			const priceHTUnit = priceTTCUnit / 1.2;
	  
			return `
			  <tr>
				<td style="border: 1px solid #000; padding: 6px;">
				  ${line.designation || ""}${line.serial ? ` (SN: ${line.serial})` : ""}
				</td>
				<td style="border: 1px solid #000; padding: 6px; text-align: center;">${quantity}</td>
				<td style="border: 1px solid #000; padding: 6px; text-align: right;">${priceHTUnit.toFixed(2)} €</td>
				<td style="border: 1px solid #000; padding: 6px; text-align: right;">${totalPriceTTC.toFixed(2)} €</td>
			  </tr>
			`;
		  }).join('');
		}
	  
		const netToPay = totalttc - parseFloat(acompte || 0);
	  
		const html = `
		  <html>
			<body style="font-family: Arial, sans-serif; padding: 10px;">
			  <div style="max-width: 480px; margin: auto;">
	  
				<div style="text-align: center; margin-bottom: 10px;">
				  <img src="https://www.avenir-informatique.fr/logo.webp" style="height: 40px;" />
				</div>
	  
				<h2 style="text-align:center;">FACTURE</h2>
	  
				<div style="font-size: 9px; margin-bottom: 8px;">
				  <p><strong>Client :</strong> ${clientname}<br/>
				  <strong>Téléphone :</strong> ${clientphone}<br/>
				  <strong>Adresse :</strong> ${client_address || "Non définie"}</p>
				</div>
	  
				<div style="font-size: 9px; margin-bottom: 10px;">
				  <p><strong>Facture N° :</strong> ${invoicenumber}<br/>
				  ${quoteNumber ? `<p><strong>Devis d'origine :</strong> ${quoteNumber}</p>` : ""}
				  <strong>Date :</strong> ${invoicedate}</p>
				</div>
	  
				<table width="100%" style="border-collapse: collapse; font-size: 9px;">
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
  ${acompte && parseFloat(acompte) > 0 ? `
    <p style="text-align: right;">Acompte versé : ${parseFloat(acompte).toFixed(2)} €</p>
  ` : ""}
</div>


	  
				<div style="background: #e0f7fa; padding: 8px; border-radius: 6px; margin-top: 10px;">
				  <h3 style="text-align: right; font-size: 10px; color: #00796b;">
					Net à payer : ${netToPay <= 0 ? totalttc.toFixed(2) : netToPay.toFixed(2)} €
				  </h3>
				</div>
	  
${paid ? `
  <p style="text-align: center; margin-top: 10px; color: green; font-weight: bold;">
    ✅ FACTURE RÉGLÉE
  </p>
` : `
  <p style="text-align: center; margin-top: 10px; color: red; font-weight: bold;">
    ⚠️ FACTURE NON RÉGLÉE
  </p>
`}

	  
				<p style="text-align: right; margin-top: 8px; font-size: 9px;">
				  <strong>Mode de paiement :</strong> ${paymentmethod || "Non défini"}
				</p>
	  
				<div style="margin-top: 20px; font-size: 8px; text-align: center;">
				  <p><strong>AVENIR INFORMATIQUE</strong> - 16, place de l'Hôtel de Ville, 93700 Drancy</p>
				  <p>Tél : 01 41 60 18 18 - SIRET : 422 240 457 00016</p>
				  <p>TVA non applicable, art. 293B du CGI.</p>
				</div>
	  
			  </div>
			</body>
		  </html>
		`;
	  
		await Print.printAsync({ html });
	  };
	  

	 const handleSave = async () => {
    console.log("🟡 Tentative de sauvegarde de la facture...");

    // Vérifications
    if (!clientname.trim()) {
        alert("❌ Le nom du client est requis.");
        return;
    }
    if (!clientphone.trim()) {
        alert("❌ Le téléphone du client est requis.");
        return;
    }
    if (!paymentmethod.trim()) {
        alert("❌ Le mode de paiement est requis.");
        return;
    }
    if (
        lines.length === 0 ||
        lines.some(
            (line) =>
                !line.designation.trim() ||
                !line.quantity.trim() ||
                !line.price.trim()
        )
    ) {
        alert("❌ Remplissez correctement toutes les lignes de prestation.");
        return;
    }

    try {
        // Vérifie si une facture existe déjà avec le même numéro
        const { data: existing, error: fetchError } = await supabase
            .from("billing")
            .select("id")
            .eq("invoicenumber", invoicenumber)
            .maybeSingle();

        if (fetchError) {
            console.error("❌ Erreur vérification invoice :", fetchError);
            alert("❌ Erreur lors de la vérification de la facture.");
            return;
        }

        const factureData = {
            clientname,
            clientphone,
			express_id: express_id, 
            client_address,
            invoicenumber,
            invoicedate: new Date(invoicedate.split("/").reverse().join("-")),
            paymentmethod,
            acompte: acompte === "" ? 0 : parseFloat(acompte),
            lines,
            totalht: isNaN(totalht) ? 0 : totalht,
            totaltva: isNaN(totaltva) ? 0 : totaltva,
            totalttc: isNaN(totalttc) ? 0 : totalttc,
            created_at: new Date(),
            paid,
            order_id: order_id || null,
			express_id: express_id || null,
        };

        let saveError;

        if (existing) {
            const { error } = await supabase
                .from("billing")
                .update(factureData)
                .eq("id", existing.id);
            saveError = error;
        } else {
            const { error } = await supabase
                .from("billing")
                .insert([factureData]);
            saveError = error;
        }

        if (saveError) {
            console.error("❌ Erreur sauvegarde :", saveError);
            alert("❌ Erreur lors de la sauvegarde de la facture.");
        } else {
            alert("✅ Facture enregistrée avec succès.");
            setIsSaved(true);
        }
    } catch (error) {
        console.error("❌ Erreur inattendue :", error);
        alert("❌ Erreur inattendue lors de la sauvegarde.");
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
        <ScrollView
            style={styles.container}
            keyboardShouldPersistTaps="handled"
        >
            <Text style={styles.title}>Facture client</Text>

            {/* Nom du client */}
            <View style={{ marginBottom: 20 }}>
                <Text
                    style={[
                        styles.floatingLabel,
                        (focusedField === "name" || clientname) &&
                            styles.floatingLabelFocused,
                    ]}
                >
                    Nom du client
                </Text>
                <TextInput
                    value={clientname}
                    onChangeText={searchClients}
                    style={[
                        styles.input,
                        (focusedField === "name" || clientname) && {
                            paddingTop: 18,
                        },
                        focusedField === "name" && styles.inputFocused,
                    ]}
                    onFocus={() => setFocusedField("name")}
                    onBlur={() => setFocusedField(null)}
                />
                {clientSuggestions.length > 0 && (
                    <View style={styles.suggestionContainer}>
                        {clientSuggestions.map((item, index) => (
                            <TouchableOpacity
                                key={index}
                                onPress={() => selectClient(item)}
                                style={styles.suggestionItem}
                            >
                                <Text style={styles.suggestionText}>
                                    {item.name} - {item.phone}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </View>

            {/* Téléphone */}
            <View style={{ marginBottom: 20 }}>
                <Text
                    style={[
                        styles.floatingLabel,
                        (focusedField === "phone" || clientphone) &&
                            styles.floatingLabelFocused,
                    ]}
                >
                    Téléphone
                </Text>
                <TextInput
                    value={clientphone}
                    onChangeText={setClientPhone}
                    style={[
                        styles.input,
                        (focusedField === "phone" || clientphone) && {
                            paddingTop: 18,
                        },
                        focusedField === "phone" && styles.inputFocused,
                    ]}
                    keyboardType="phone-pad"
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => setFocusedField(null)}
                />
            </View>

            {/* Adresse */}
            <View style={{ marginBottom: 20 }}>
                <Text
                    style={[
                        styles.floatingLabel,
                        (focusedField === "address" || client_address) &&
                            styles.floatingLabelFocused,
                    ]}
                >
                    Adresse
                </Text>
                <TextInput
                    value={client_address}
                    onChangeText={setClientAddress}
                    style={[
                        styles.input,
                        (focusedField === "address" || client_address) && {
                            paddingTop: 18,
                        },
                        focusedField === "address" && styles.inputFocused,
                    ]}
                    onFocus={() => setFocusedField("address")}
                    onBlur={() => setFocusedField(null)}
                />
            </View>

            {/* Numéro de facture */}
            <View style={{ marginBottom: 20 }}>
                <Text
                    style={[
                        styles.floatingLabel,
                        (focusedField === "invoice" || invoicenumber) &&
                            styles.floatingLabelFocused,
                    ]}
                >
                    Numéro de facture
                </Text>
                <TextInput
                    value={invoicenumber}
                    onChangeText={setInvoiceNumber}
                    style={[
                        styles.input,
                        (focusedField === "invoice" || invoicenumber) && {
                            paddingTop: 18,
                        },
                        focusedField === "invoice" && styles.inputFocused,
                    ]}
                    onFocus={() => setFocusedField("invoice")}
                    onBlur={() => setFocusedField(null)}
                />
            </View>
			{quoteNumber && (
  <Text style={{ fontStyle: "italic", color: "#555", marginBottom: 10 }}>
    📎 Issu du devis : {quoteNumber}
  </Text>
)}

            {/* Date */}
            <View style={{ marginBottom: 20 }}>
                <Text
                    style={[
                        styles.floatingLabel,
                        (focusedField === "date" || invoicedate) &&
                            styles.floatingLabelFocused,
                    ]}
                >
                    Date
                </Text>
                <TextInput
                    value={invoicedate}
                    onChangeText={setInvoiceDate}
                    style={[
                        styles.input,
                        (focusedField === "date" || invoicedate) && {
                            paddingTop: 18,
                        },
                        focusedField === "date" && styles.inputFocused,
                    ]}
                    onFocus={() => setFocusedField("date")}
                    onBlur={() => setFocusedField(null)}
                />
            </View>

            {/* Acompte versé (€) */}
            <View style={{ marginBottom: 20 }}>
                {parseFloat(acompte || 0) < totalttc ? (
                    <>
                        <Text
                            style={[
                                styles.floatingLabel,
                                (focusedField === "acompte" || acompte) &&
                                    styles.floatingLabelFocused,
                            ]}
                        >
                            Acompte versé (€)
                        </Text>
                        <TextInput
                            value={acompte}
                            onChangeText={setAcompte}
                            style={[
                                styles.input,
                                (focusedField === "acompte" || acompte) && {
                                    paddingTop: 18,
                                },
                                focusedField === "acompte" &&
                                    styles.inputFocused,
                            ]}
                            keyboardType="numeric"
                            onFocus={() => setFocusedField("acompte")}
                            onBlur={() => setFocusedField(null)}
                        />
                    </>
                ) : (
					<View style={{ marginBottom: 20 }}>
    <Text
        style={[
            styles.floatingLabel,
            (focusedField === "acompte" || acompte) &&
                styles.floatingLabelFocused,
        ]}
    >
        Acompte versé (€)
    </Text>
    <TextInput
        value={acompte}
        onChangeText={setAcompte}
        style={[
            styles.input,
            (focusedField === "acompte" || acompte) && {
                paddingTop: 18,
            },
            focusedField === "acompte" && styles.inputFocused,
        ]}
        keyboardType="numeric"
        placeholder="0"
        onFocus={() => setFocusedField("acompte")}
        onBlur={() => setFocusedField(null)}
    />
</View>
                )}
            </View>

            <Text style={styles.subtitle}>Prestations :</Text>

            {lines.map((line, index) => (
                <View key={index} style={{ marginBottom: 15 }}>
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <TextInput
                            placeholder="Désignation"
                            value={line.designation}
                            onChangeText={(text) =>
                                updateLine(index, "designation", text)
                            }
                            style={[
                                styles.input,
                                { flex: 2 },
                                focusedField === `designation-${index}` &&
                                    styles.inputFocused,
                            ]}
                            onFocus={() =>
                                setFocusedField(`designation-${index}`)
                            }
                            onBlur={() => setFocusedField(null)}
                        />
                        <TextInput
                            placeholder="Qté"
                            value={line.quantity}
                            onChangeText={(text) =>
                                updateLine(index, "quantity", text)
                            }
                            style={[
                                styles.input,
                                { flex: 1 },
                                focusedField === `quantity-${index}` &&
                                    styles.inputFocused,
                            ]}
                            keyboardType="numeric"
                            onFocus={() => setFocusedField(`quantity-${index}`)}
                            onBlur={() => setFocusedField(null)}
                        />
                        <TextInput
                            placeholder="P.U. TTC"
                            value={line.price}
                            onChangeText={(text) =>
                                updateLine(index, "price", text)
                            }
                            style={[
                                styles.input,
                                { flex: 1 },
                                focusedField === `price-${index}` &&
                                    styles.inputFocused,
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

                    <TextInput
                        placeholder="Numéro de série"
                        value={line.serial || ""}
                        onChangeText={(text) =>
                            updateLine(index, "serial", text)
                        }
                        style={[
                            styles.input,
                            focusedField === `serial-${index}` &&
                                styles.inputFocused,
                            { marginTop: 4 },
                        ]}
                        onFocus={() => setFocusedField(`serial-${index}`)}
                        onBlur={() => setFocusedField(null)}
                    />
                </View>
            ))}

            <View style={styles.addButtonContainer}>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() =>
                        setLines([
                            ...lines,
                            {
                                designation: "",
                                quantity: "1",
                                price: "",
                                serial: "", // ✅ Ajout du champ serial ici
                            },
                        ])
                    }
                >
                    <Text style={styles.addButtonText}>
                        ➕ Ajouter une ligne
                    </Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.subtitle}>Mode de paiement :</Text>

            <View style={styles.paymentRow}>
                <TouchableOpacity
                    style={[
                        styles.paymentButton,
                        paymentmethod === "CB" && styles.paymentButtonSelected,
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
                        paymentmethod === "Espèces" &&
                            styles.paymentButtonSelected,
                    ]}
                    onPress={() => setPaymentMethod("Espèces")}
                >
                    <Text style={styles.paymentButtonText}>💵 ESPÈCES</Text>
                </TouchableOpacity>
            </View>
			<View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
  <TouchableOpacity
    onPress={() => setPaid(!paid)}
    style={{
      backgroundColor: paid ? "#28a745" : "#ccc",
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 6,
    }}
  >
    <Text style={{ color: "#fff", fontWeight: "bold" }}>
      {paid ? "✅ Payée" : "Marquer comme payée"}
    </Text>
  </TouchableOpacity>
</View>

			{isSaved ? (
  <Text style={{ textAlign: "center", color: "#28a745", fontWeight: "bold", marginBottom: 8 }}>
    ✅ Facture enregistrée et prête à être imprimée
  </Text>
) : (
  <Text style={{ textAlign: "center", color: "#888", marginBottom: 8 }}>
    🔒 Veuillez sauvegarder la facture avant impression
  </Text>
)}

            <View style={styles.buttonRow}>
			<TouchableOpacity
  style={[
    styles.actionButton,
    {
      backgroundColor: isSaved && paid ? "#28a745" : "#ccc",
    },
  ]}
  onPress={() => {
    if (!paid) {
      alert("❌ Impossible d'imprimer : la facture n'est pas encore payée.");
      return;
    }
    if (!isSaved) {
      alert("❌ Merci de sauvegarder la facture avant d'imprimer.");
      return;
    }
    handlePrint();
  }}
  disabled={!isSaved || !paid}
>
  <Text style={styles.buttonText}>🖨️ Imprimer</Text>
</TouchableOpacity>




                <TouchableOpacity
                    style={[
                        styles.actionButton,
                        { backgroundColor: "#007bff" },
                    ]}
                    onPress={handleSave}
                >
                    <Text style={styles.buttonText}>💾 Sauvegarder</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: "#555" }]}
                    onPress={() => navigation.navigate("BillingListPage")}
                >
                    <Text style={styles.buttonText}>📄 Liste des Factures</Text>
                </TouchableOpacity>
            </View>
            <View style={{ alignItems: "center", marginTop: 20 }}>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.buttonText}>⬅ Retour</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: { padding: 20 },
    title: {
        fontSize: 22,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
    },
    subtitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginTop: 20,
        marginBottom: 10,
    },
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
        height: 36, // 🔥 même hauteur que ton TextInput + padding
        width: 36, // 🔥 carré
        marginTop: 0, // 🛠️ pour éviter de descendre
        alignSelf: "center", // 🔥 centre verticalement
        marginLeft: 8, // 👈 petit espace entre le champ et le bouton
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
    button: {
        backgroundColor: "#3e4c69",
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
        marginTop: 10,
        width: "100%",
    },
    floatingLabel: {
        position: "absolute",
        left: 10,
        top: 12,
        fontSize: 14,
        color: "#888",
        zIndex: 1,
    },

    floatingLabelFocused: {
        top: -10,
        left: 8,
        fontSize: 12,
        color: "#007bff",
        backgroundColor: "#eef6ff",
        paddingHorizontal: 5,
        borderRadius: 4,
    },
});

export default BillingPage;
