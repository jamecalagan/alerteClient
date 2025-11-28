import React, { useEffect, useState } from "react";
import { ScrollView, Text, View, Alert, TouchableOpacity } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";

const QuotePrintPage = () => {
  const navigation = useNavigation();
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

    const useGlobal = quote.use_global_total === true;
    const globalTotal =
      useGlobal && quote.global_total != null
        ? parseFloat(quote.global_total) || 0
        : 0;

    const dateCreated = new Date(quote.created_at).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const dateValid = quote.valid_until
      ? new Date(quote.valid_until).toLocaleDateString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";

    // --- Lignes du tableau ---
    let rowsHtml = "";
    if (useGlobal) {
      // Mode "coût total" : uniquement désignation + quantité
      rowsHtml = quote.items
        .map((item) => {
          const qty = parseFloat(item.quantity) || 0;
          const designation = item.label
            ? `${item.label} — ${item.description || ""}`
            : item.description || "";

          return `
            <tr>
              <td style="border: 1px solid #ccc; padding: 4px;">${designation}</td>
              <td style="border: 1px solid #ccc; padding: 4px; text-align: center;">${qty}</td>
            </tr>
          `;
        })
        .join("");
    } else {
      // Mode classique : prix détaillés
      rowsHtml = quote.items
        .map((item) => {
          const qty = parseFloat(item.quantity) || 0;
          const puTTC = parseFloat(item.unitPrice) || 0;
          const puHT = puTTC / 1.2;
          const totalTTC = qty * puTTC;
          const tva = totalTTC - puHT * qty;

          const designation = item.label
            ? `${item.label} — ${item.description}`
            : item.description;

          return `
            <tr>
              <td style="border: 1px solid #ccc; padding: 4px;">${designation}</td>
              <td style="border: 1px solid #ccc; padding: 4px;">${qty}</td>
              <td style="border: 1px solid #ccc; padding: 4px;">${puHT.toFixed(
                2
              )} €</td>
              <td style="border: 1px solid #ccc; padding: 4px;">${tva.toFixed(
                2
              )} €</td>
              <td style="border: 1px solid #ccc; padding: 4px;">${totalTTC.toFixed(
                2
              )} €</td>
            </tr>
          `;
        })
        .join("");
    }

    // --- Totaux ---
    const totalTTC = quote.items.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const unitTTC = parseFloat(item.unitPrice) || 0;
      return sum + qty * unitTTC;
    }, 0);

    const totalHT = totalTTC / 1.2;
    const remise = (quote.discount / 100) * totalHT;
    const htAfterRemise = totalHT - remise;
    const tva = htAfterRemise * 0.2;
    const totalTTCApresRemise = htAfterRemise + tva;
    const acompte = parseFloat(quote.deposit || 0);
    const totalFinal = totalTTCApresRemise - acompte;

    const globalFinal = useGlobal ? globalTotal - acompte : 0;

    const totauxHtml = useGlobal
      ? `
        <tr><td><strong>Coût total TTC :</strong> ${globalTotal.toFixed(
          2
        )} €</td></tr>
        <tr><td><strong>Acompte :</strong> -${acompte.toFixed(2)} €</td></tr>
        <tr><td><strong>Total à payer :</strong> ${globalFinal.toFixed(
          2
        )} €</td></tr>
      `
      : `
        <tr><td><strong>Total TTC saisi :</strong> ${totalTTC.toFixed(
          2
        )} €</td></tr>
        <tr><td><strong>Total HT :</strong> ${totalHT.toFixed(2)} €</td></tr>
        <tr><td><strong>Remise (${quote.discount}%):</strong> -${remise.toFixed(
          2
        )} €</td></tr>
        <tr><td><strong>TVA (20%) :</strong> ${tva.toFixed(2)} €</td></tr>
        <tr><td><strong>Total TTC après remise :</strong> ${totalTTCApresRemise.toFixed(
          2
        )} €</td></tr>
        <tr><td><strong>Acompte :</strong> -${acompte.toFixed(2)} €</td></tr>
        <tr><td><strong>Total à payer :</strong> ${totalFinal.toFixed(
          2
        )} €</td></tr>
      `;

    const tableHeader = useGlobal
      ? `
        <tr>
          <th>Désignation</th>
          <th>Qté</th>
        </tr>`
      : `
        <tr>
          <th>Désignation</th>
          <th>Qté</th>
          <th>PU HT</th>
          <th>TVA</th>
          <th>Total TTC</th>
        </tr>`;

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            font-size: 10px;
            padding: 15px;
            max-width: 595px;
            margin: auto;
          }
          h2 {
            text-align: center;
            margin-bottom: 10px;
          }
          .header-logo {
            text-align: center;
            margin-bottom: 10px;
          }
          .header-logo img {
            height: 40px;
          }
          .section {
            margin-bottom: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
            margin-top: 8px;
          }
          th, td {
            border: 1px solid #ccc;
            padding: 4px;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
          }
          .totaux {
            margin-top: 10px;
            font-size: 9px;
          }
          .totaux td {
            padding: 3px 4px;
          }
          .mentions {
            font-size: 8px;
            color: #555;
            margin-top: 15px;
            text-align: justify;
            line-height: 1.3;
          }
          .footer {
            margin-top: 25px;
            font-size: 8px;
            text-align: center;
          }
          .signature {
            margin-top: 30px;
          }
          .signature-line {
            margin-top: 25px;
            border-top: 1px solid #000;
            width: 200px;
          }
        </style>
      </head>
      <body>
      
        <div class="header-logo">
          <img src="https://www.avenir-informatique.fr/logo.webp" alt="Logo" />
        </div>
      
        <h2>Devis</h2>
      
        <div class="section">
          <strong>Client :</strong> ${quote.name}<br/>
          <strong>Téléphone :</strong> ${quote.phone || "N/A"}<br/>
          <strong>Date :</strong> ${dateCreated}<br/>
          <strong>Valide jusqu’au :</strong> ${dateValid}<br/>
          <strong>N° Devis :</strong> ${quote.quote_number}
        </div>
      
        <table>
          <thead>
            ${tableHeader}
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      
        <table class="totaux">
          ${totauxHtml}
        </table>
      
        <div class="mentions">
          <p><strong>Conditions :</strong> Ce devis est valable 30 jours à compter de sa date d’émission. Toute commande de matériel est considérée comme ferme et non remboursable une fois validée. Les composants listés sont soumis à disponibilité chez les fournisseurs. L’assemblage est effectué selon les standards professionnels. Le client reconnaît avoir été informé que les pièces bénéficient des garanties constructeur, et qu’un acompte peut être requis avant toute commande.</p>
          <p><strong>Acceptation :</strong> La signature du présent devis vaut bon pour accord sur les prestations listées ainsi que leurs conditions de réalisation.</p>
        </div>
      
        <div class="signature">
          <p><strong>Signature du client :</strong></p>
          <div class="signature-line"></div>
        </div>
      
        <div style="margin-top: 20px; background: #f0f0f0; padding: 8px; font-size: 8px; text-align: center; color: #555;">
          <p><strong>AVENIR INFORMATIQUE</strong> - 16, place de l'Hôtel de Ville, 93700 Drancy</p>
          <p>Tél : 01 41 60 18 18 - SIRET : 422 240 457 00016</p>
          <p>R.C.S : Bobigny B422 240 457 - N/Id CEE FR32422240457</p>
        </div>
      
      </body>
      </html>
    `;

    await Print.printAsync({ html });
    await supabase
      .from("quotes")
      .update({ deja_imprime: true })
      .eq("id", quote.id);
  };

  if (!quote)
    return <Text style={{ padding: 20 }}>Chargement du devis...</Text>;

  const handleDownloadPdf = async () => {
    try {
      console.log("📥 Bouton Télécharger cliqué");

      const useGlobal = quote.use_global_total === true;
      const globalTotal =
        useGlobal && quote.global_total != null
          ? parseFloat(quote.global_total) || 0
          : 0;

      const dateCreated = new Date(quote.created_at).toLocaleDateString(
        "fr-FR",
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        }
      );

      const dateValid = quote.valid_until
        ? new Date(quote.valid_until).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";

      let rowsHtml = "";
      if (useGlobal) {
        rowsHtml = quote.items
          .map((item) => {
            const qty = parseFloat(item.quantity) || 0;
            const designation = item.label
              ? `${item.label} — ${item.description || ""}`
              : item.description || "";

            return `
              <tr>
                <td style="border: 1px solid #ccc; padding: 3px;">${designation}</td>
                <td style="border: 1px solid #ccc; padding: 3px; text-align: center;">${qty}</td>
              </tr>
            `;
          })
          .join("");
      } else {
        rowsHtml = quote.items
          .map((item) => {
            const qty = parseFloat(item.quantity) || 0;
            const puTTC = parseFloat(item.unitPrice) || 0;
            const puHT = puTTC / 1.2;
            const totalTTC = qty * puTTC;
            const tva = totalTTC - puHT * qty;

            const designation = item.label
              ? `${item.label} — ${item.description}`
              : item.description || "";

            return `
              <tr>
                <td style="border: 1px solid #ccc; padding: 3px;">${designation}</td>
                <td style="border: 1px solid #ccc; padding: 3px; text-align: center;">${qty}</td>
                <td style="border: 1px solid #ccc; padding: 3px; text-align: right;">${puHT.toFixed(
                  2
                )} €</td>
                <td style="border: 1px solid #ccc; padding: 3px; text-align: right;">${tva.toFixed(
                  2
                )} €</td>
                <td style="border: 1px solid #ccc; padding: 3px; text-align: right;">${totalTTC.toFixed(
                  2
                )} €</td>
              </tr>
            `;
          })
          .join("");
      }

      const totalTTC = quote.items.reduce((sum, item) => {
        const qty = parseFloat(item.quantity) || 0;
        const unitTTC = parseFloat(item.unitPrice) || 0;
        return sum + qty * unitTTC;
      }, 0);

      const totalHT = totalTTC / 1.2;
      const remise = (quote.discount / 100) * totalHT;
      const htAfterRemise = totalHT - remise;
      const tva = htAfterRemise * 0.2;
      const totalTTCApresRemise = htAfterRemise + tva;
      const acompte = parseFloat(quote.deposit || 0);
      const totalFinal = totalTTCApresRemise - acompte;
      const globalFinal = useGlobal ? globalTotal - acompte : 0;

      const totauxHtml = useGlobal
        ? `
          <tr><td><strong>Coût total TTC :</strong> ${globalTotal.toFixed(
            2
          )} €</td></tr>
          <tr><td><strong>Acompte :</strong> -${acompte.toFixed(2)} €</td></tr>
          <tr><td><strong>Total à payer :</strong> ${globalFinal.toFixed(
            2
          )} €</td></tr>
        `
        : `
          <tr><td><strong>Total TTC saisi :</strong> ${totalTTC.toFixed(
            2
          )} €</td></tr>
          <tr><td><strong>Total HT :</strong> ${totalHT.toFixed(2)} €</td></tr>
          <tr><td><strong>Remise (${quote.discount}%):</strong> -${remise.toFixed(
            2
          )} €</td></tr>
          <tr><td><strong>TVA (20%) :</strong> ${tva.toFixed(2)} €</td></tr>
          <tr><td><strong>Total TTC après remise :</strong> ${totalTTCApresRemise.toFixed(
            2
          )} €</td></tr>
          <tr><td><strong>Acompte :</strong> -${acompte.toFixed(2)} €</td></tr>
          <tr><td><strong>Total à payer :</strong> ${totalFinal.toFixed(
            2
          )} €</td></tr>
        `;

      const tableHeader = useGlobal
        ? `
          <tr>
            <th>Désignation</th>
            <th>Qté</th>
          </tr>`
        : `
          <tr>
            <th>Désignation</th>
            <th>Qté</th>
            <th>PU HT</th>
            <th>TVA</th>
            <th>Total TTC</th>
          </tr>`;

      const html = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <style>
            body {
              font-family: Arial, sans-serif;
              font-size: 10px;
              padding: 15px;
              max-width: 595px;
              margin: auto;
            }
            h2 {
              text-align: center;
              margin-bottom: 10px;
            }
            .header-logo {
              text-align: center;
              margin-bottom: 10px;
            }
            .header-logo img {
              height: 40px;
            }
            .section {
              margin-bottom: 12px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 9px;
              margin-top: 8px;
            }
            th, td {
              border: 1px solid #ccc;
              padding: 4px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
            }
            .totaux {
              margin-top: 10px;
              font-size: 9px;
            }
            .totaux td {
              padding: 3px 4px;
            }
            .mentions {
              font-size: 8px;
              color: #555;
              margin-top: 15px;
              text-align: justify;
              line-height: 1.3;
            }
            .footer {
              margin-top: 25px;
              font-size: 8px;
              text-align: center;
            }
            .signature {
              margin-top: 30px;
            }
            .signature-line {
              margin-top: 25px;
              border-top: 1px solid #000;
              width: 200px;
            }
          </style>
        </head>
        <body>
        
          <div class="header-logo">
            <img src="https://www.avenir-informatique.fr/logo.webp" alt="Logo" />
          </div>
        
          <h2>Devis</h2>
        
          <div class="section">
            <strong>Client :</strong> ${quote.name}<br/>
            <strong>Téléphone :</strong> ${quote.phone || "N/A"}<br/>
            <strong>Date :</strong> ${dateCreated}<br/>
            <strong>Valide jusqu’au :</strong> ${dateValid}<br/>
            <strong>N° Devis :</strong> ${quote.quote_number}
          </div>
        
          <table>
            <thead>
              ${tableHeader}
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        
          <table class="totaux">
            ${totauxHtml}
          </table>
        
          <div class="mentions">
            <p><strong>Conditions :</strong> Ce devis est valable 30 jours à compter de sa date d’émission. Toute commande de matériel est considérée comme ferme et non remboursable une fois validée. Les composants listés sont soumis à disponibilité chez les fournisseurs. L’assemblage est effectué selon les standards professionnels. Le client reconnaît avoir été informé que les pièces bénéficient des garanties constructeur, et qu’un acompte peut être requis avant toute commande.</p>
            <p><strong>Acceptation :</strong> La signature du présent devis vaut bon pour accord sur les prestations listées ainsi que leurs conditions de réalisation.</p>
          </div>
        
          <div class="signature">
            <p><strong>Signature du client :</strong></p>
            <div class="signature-line"></div>
          </div>
        
          <div style="margin-top: 20px; background: #f0f0f0; padding: 8px; font-size: 8px; text-align: center; color: #555;">
            <p><strong>AVENIR INFORMATIQUE</strong> - 16, place de l'Hôtel de Ville, 93700 Drancy</p>
            <p>Tél : 01 41 60 18 18 - SIRET : 422 240 457 00016</p>
            <p>R.C.S : Bobigny B422 240 457 - N/Id CEE FR32422240457</p>
          </div>
        
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      console.log("✅ PDF généré :", uri);

      if (quote.email) {
        await MailComposer.composeAsync({
          recipients: [quote.email],
          subject: `Votre devis ${quote.quote_number || ""}`,
          body: "Veuillez trouver ci-joint votre devis au format PDF.",
          attachments: [uri],
        });

        await supabase
          .from("quotes")
          .update({ deja_envoye: true })
          .eq("id", quote.id);

        Alert.alert(
          "✅ E-mail prêt",
          `Le devis a été ouvert dans votre application mail.`
        );
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Partager ou enregistrer le devis",
        });

        await supabase
          .from("quotes")
          .update({ deja_envoye: true })
          .eq("id", quote.id);

        Alert.alert("✅ Partage terminé", "Le devis a bien été partagé.");
      }
    } catch (error) {
      console.error("❌ Erreur génération PDF :", error);
      Alert.alert("Erreur", "Impossible de générer ou partager le PDF.");
    }
  };

  return (
    <ScrollView style={{ padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 10 }}>
        Aperçu du devis
      </Text>
      <Text>Client : {quote.name}</Text>
      <Text>Téléphone : {quote.phone}</Text>
      {quote.email && <Text>Email : {quote.email}</Text>}

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
        {quote.valid_until
          ? new Date(Date.parse(quote.valid_until)).toLocaleDateString(
              "fr-FR",
              {
                day: "numeric",
                month: "long",
                year: "numeric",
              }
            )
          : ""}
      </Text>

      <Text style={{ marginTop: 10 }}>
        Nombre de lignes : {quote.items.length}
      </Text>

      <View style={{ flexDirection: "row", marginTop: 30, gap: 10 }}>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "#007bff",
            padding: 12,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={handlePrint}
        >
          <Text
            style={{
              color: "#fff",
              fontWeight: "bold",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            🖨️ Imprimer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "#28a745",
            padding: 12,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={handleDownloadPdf}
        >
          <Text
            style={{
              color: "#fff",
              fontWeight: "bold",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            📥 Envoyer PDF
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "#ffc107",
            padding: 12,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
          }}
onPress={() =>
  navigation.navigate("BillingPage", {
    fromQuote: true,
    // Infos client avec les mêmes clés que partout ailleurs
    clientName: quote.name,
    clientPhone: quote.phone,
    clientEmail: quote.email || null,

    // Référence devis
    quoteNumber: quote.quote_number,

    // Lignes d’origine (si tu en as besoin côté facture)
    items: quote.items,

    // Total TTC utilisé pour la facture :
    // - si devis SANS détails → on prend le coût global
    // - sinon → le total classique
    totalttc:
      quote.use_global_total === true && quote.global_total != null
        ? Number(quote.global_total)
        : Number(quote.total),

    remarks: quote.remarks || "",

    // Indicateur pour la facture
    useGlobalTotal: quote.use_global_total === true,
    globalTotal:
      quote.use_global_total === true && quote.global_total != null
        ? Number(quote.global_total)
        : null,
  })
}

        >
          <Text
            style={{ color: "#000", fontWeight: "bold", fontSize: 12 }}
          >
            💳 Facturer ce devis
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default QuotePrintPage;
