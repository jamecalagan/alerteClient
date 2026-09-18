import React, { useEffect, useState } from "react";
import { Text, View, TouchableOpacity, StyleSheet, StatusBar } from "react-native";
import { WebView } from "react-native-webview";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Print from "expo-print";
import { supabase } from "../supabaseClient";
import * as Sharing from "expo-sharing";
import * as MailComposer from "expo-mail-composer";
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";

const QuotePrintPage = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { id } = route.params;
  const [quote, setQuote] = useState(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

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
      showAlert("Erreur", "Impossible de charger le devis");
      console.error(error);
    } else {
      setQuote(data);
    }
  };

  const buildQuoteHtml = () => {
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
          const brandModel = [item.brand, item.model]
            .filter((v) => v && String(v).trim())
            .join(" - ");
          const baseDesignation = item.label
            ? `${item.label} — ${item.description || ""}`
            : item.description || "";
          const designation = brandModel
            ? `${baseDesignation} — ${brandModel}`
            : baseDesignation;

          return `
            <tr>
              <td class="td desc">${designation}</td>
              <td class="td num c">${qty}</td>
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

          const brandModel = [item.brand, item.model]
            .filter((v) => v && String(v).trim())
            .join(" - ");
          const baseDesignation = item.label
            ? `${item.label} — ${item.description}`
            : item.description;
          const designation = brandModel
            ? `${baseDesignation} — ${brandModel}`
            : baseDesignation;

          return `
            <tr>
              <td class="td desc">${designation}</td>
              <td class="td num c">${qty}</td>
              <td class="td num r">${puHT.toFixed(2)} €</td>
              <td class="td num r"><strong>${totalTTC.toFixed(2)} €</strong></td>
            </tr>
          `;
        })
        .join("");
    }

    // Lignes vides pour combler l'espace en bas de page (esthétique A5)
    // Page A5 : peu de hauteur disponible, on limite fortement le nombre
    // de lignes de remplissage pour garantir que tout tienne sur une page.
    const MIN_ROWS = 3;
    const columnsCount = useGlobal ? 2 : 4;
    const fillerCount = Math.max(0, MIN_ROWS - quote.items.length);
    if (fillerCount > 0) {
      rowsHtml += `<tr>${Array(columnsCount)
        .fill('<td class="td">&nbsp;</td>')
        .join("")}</tr>`.repeat(fillerCount);
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
        <tr><td class="label">Coût total TTC</td><td class="r">${globalTotal.toFixed(2)} €</td></tr>
        <tr><td class="label">Acompte</td><td class="r">-${acompte.toFixed(2)} €</td></tr>
        <tr><td class="label"><strong>Total à payer</strong></td><td class="r"><strong>${globalFinal.toFixed(2)} €</strong></td></tr>
      `
      : `
        <tr><td class="label">Total HT</td><td class="r">${totalHT.toFixed(2)} €</td></tr>
        <tr><td class="label">Remise (${quote.discount}%)</td><td class="r">-${remise.toFixed(2)} €</td></tr>
        <tr><td class="label">TVA (20%)</td><td class="r">${tva.toFixed(2)} €</td></tr>
        <tr><td class="label"><strong>Total TTC</strong></td><td class="r"><strong>${totalTTCApresRemise.toFixed(2)} €</strong></td></tr>
        <tr><td class="label">Acompte</td><td class="r">-${acompte.toFixed(2)} €</td></tr>
        <tr><td class="label"><strong>Total à payer</strong></td><td class="r"><strong>${totalFinal.toFixed(2)} €</strong></td></tr>
      `;

    const tableHeader = useGlobal
      ? `
        <tr>
          <th class="th desc">Désignation</th>
          <th class="th c col-qty">Qté</th>
        </tr>`
      : `
        <tr>
          <th class="th desc">Désignation</th>
          <th class="th c col-qty">Qté</th>
          <th class="th r col-pu">PU HT</th>
          <th class="th r col-total">Total TTC</th>
        </tr>`;

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          @page { size: A5; margin: 8mm; }
          body { font-family: Arial, Helvetica, sans-serif; color:#000; font-size: 10px; }
          .wrap { max-width: 100%; margin: 0 auto; }

          .header { text-align: center; margin-bottom: 6px; }
          .header img { height: 36px; }
          .title { font-size: 15px; font-weight: 700; margin: 4px 0 6px 0; letter-spacing: 1px; }

          .meta { display:flex; gap: 8px; margin: 0 0 8px 0; }
          .card { border:1px solid #000; border-radius:5px; padding:5px 7px; flex:1; }
          .card h3 { margin:0 0 3px 0; font-size:10px; }
          .card p { margin:1px 0; font-size:9px; }

          table { width:100%; border-collapse: collapse; }
          .th, .td { border:1px solid #000; padding:4px; font-size: 9px; }
          thead .th { background:#e5e5e5; font-weight:bold; }
          .desc { width:100%; }
          .num { white-space: nowrap; }
          .c { text-align:center; }
          .r { text-align:right; }
          .col-qty { width:30px; }
          .col-pu { width:55px; }
          .col-total { width:65px; }

          .totals { margin-top: 6px; display:flex; justify-content:flex-end; }
          .totals table { width: 260px; border-collapse: collapse; font-size: 9px; }
          .totals td { border:1px solid #000; padding:4px; }
          .totals .label { background:#f7f7f7; }

          .net { margin-top: 4px; text-align: right; font-size: 11px; font-weight: bold; padding: 4px 0; }

          .mentions { font-size: 7px; color:#555; margin-top: 6px; text-align: justify; line-height: 1.25; }

          .footer {
            position: fixed;
            left: 0; right: 0; bottom: 6mm;
            text-align: center;
            font-size: 7px; color:#444; line-height: 1.25;
          }

          /* Aperçu à l'écran uniquement : remplit toute la largeur et
             toute la hauteur de l'écran, sans jamais s'appliquer à
             l'impression/PDF réels (canvas déjà contraint à 420x595pt).
             Placé en dernier pour bien surcharger les règles de base
             ci-dessus (même spécificité : la dernière déclarée gagne). */
          @media screen {
            body { padding: 0; font-size: 13px; }
            .wrap {
              position: relative;
              max-width: 100%;
              min-height: 100vh;
              padding: 20px;
              padding-bottom: 56px;
              box-sizing: border-box;
            }

            .header img { height: 56px; }
            .title { font-size: 22px; margin: 6px 0 14px 0; }

            .meta { gap: 16px; margin-bottom: 20px; }
            .card { padding: 12px 14px; }
            .card h3 { font-size: 15px; margin-bottom: 8px; }
            .card p { font-size: 13px; margin: 3px 0; }

            .th, .td { padding: 10px; font-size: 13px; }
            .col-qty { width: 90px; }
            .col-pu { width: 120px; }
            .col-total { width: 150px; }

            .totals { margin-top: 16px; }
            .totals table { width: 380px; font-size: 13px; }
            .totals td { padding: 10px; }

            .net { margin-top: 10px; font-size: 16px; padding: 12px 0; }

            .mentions { font-size: 11px; margin-top: 18px; line-height: 1.5; }

            .footer {
              position: absolute;
              left: 20px;
              right: 20px;
              bottom: 16px;
              margin-top: 0;
              font-size: 11px;
              line-height: 1.5;
            }
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="header">
            <img src="https://www.avenir-informatique.fr/logo.webp" alt="Avenir Informatique" />
            <div class="title">DEVIS</div>
          </div>

          <div class="meta">
            <div class="card">
              <h3>Client</h3>
              <p><strong>${quote.name}</strong></p>
              <p>Téléphone : ${quote.phone || "—"}</p>
              <p>E-mail : ${quote.email || "—"}</p>
            </div>
            <div class="card">
              <h3>Détails</h3>
              <p>Numéro : <strong>${quote.quote_number || "—"}</strong></p>
              <p>Date : ${dateCreated}</p>
              <p>Valable jusqu'au : ${dateValid || "—"}</p>
            </div>
          </div>

          <table>
            <thead>
              ${tableHeader}
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="totals">
            <table>
              ${totauxHtml}
            </table>
          </div>

          <div class="net">
            Total à payer : ${(useGlobal ? globalFinal : totalFinal).toFixed(2)} €
          </div>

          <div class="mentions">
            <p><strong>Conditions :</strong> Ce devis est valable 30 jours à compter de sa date d'émission. Toute commande de matériel est considérée comme ferme et non remboursable une fois validée. Les composants listés sont soumis à disponibilité chez les fournisseurs. Le client reconnaît avoir été informé que les pièces bénéficient des garanties constructeur, et qu'un acompte peut être requis avant toute commande.</p>
            <p><strong>Acceptation :</strong> La signature du présent devis vaut bon pour accord sur les prestations listées ainsi que leurs conditions de réalisation.</p>
            <p><strong>Signature du client :</strong></p>
          </div>

          <div class="footer">
            <strong>AVENIR INFORMATIQUE</strong> — 16, place de l'Hôtel de Ville, 93700 Drancy — Tél : 01 41 60 18 18 — SIRET : 422 240 457 00016<br/>
            RCS Bobigny B422 240 457 — N° TVA intracommunautaire : FR32422240457
          </div>
        </div>
      </body>
      </html>
    `;

    return html;
  };

  const handlePrint = async () => {
    if (!quote) return;

    // Taille A5 en points (148 x 210 mm) passée directement à l'API d'impression :
    // le @page CSS seul est souvent ignoré par la boîte de dialogue native Android.
    await Print.printAsync({ html: buildQuoteHtml(), width: 420, height: 595 });
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

      const html = buildQuoteHtml();

      const { uri } = await Print.printToFileAsync({
        html,
        width: 420,
        height: 595,
      });
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

        showAlert(
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

        showAlert("✅ Partage terminé", "Le devis a bien été partagé.");
      }
    } catch (error) {
      console.error("❌ Erreur génération PDF :", error);
      showAlert("Erreur", "Impossible de générer ou partager le PDF.");
    }
  };

  return (
    <View style={styles.screen}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: buildQuoteHtml() }}
        style={styles.webview}
      />

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.pillButton, styles.pillButtonPrint]}
          onPress={handlePrint}
        >
          <Ionicons name="print-outline" size={16} color="#3730a3" />
          <Text style={[styles.pillButtonText, { color: "#3730a3" }]}>
            Imprimer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pillButton, styles.pillButtonSend]}
          onPress={handleDownloadPdf}
        >
          <Ionicons name="share-outline" size={16} color="#065f46" />
          <Text style={[styles.pillButtonText, { color: "#065f46" }]}>
            Envoyer PDF
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pillButton, styles.pillButtonBill]}
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
          <Ionicons name="card-outline" size={16} color="#92400e" />
          <Text style={[styles.pillButtonText, { color: "#92400e" }]}>
            Facturer
          </Text>
        </TouchableOpacity>
      </View>

      <BackButton onPress={() => navigation.goBack()} style={{ marginHorizontal: 16, marginBottom: 12 }} />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#eef2ff",
    paddingTop: StatusBar.currentHeight || 0,
  },
  webview: { flex: 1 },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 8,
  },
  pillButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  pillButtonPrint: {
    backgroundColor: "#e0e7ff",
    borderColor: "#c7d2fe",
  },
  pillButtonSend: {
    backgroundColor: "#d1fae5",
    borderColor: "#6ee7b7",
  },
  pillButtonBill: {
    backgroundColor: "#fef3c7",
    borderColor: "#fcd34d",
  },
  pillButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
});

export default QuotePrintPage;
