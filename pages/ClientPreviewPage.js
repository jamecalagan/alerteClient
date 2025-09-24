import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image,
    TouchableOpacity,
    Alert,
} from "react-native";
import { supabase } from "../supabaseClient";
import {
    useRoute,
    useNavigation,
    useFocusEffect,
} from "@react-navigation/native";
import * as Print from "expo-print";

// ———————————————————————————————————————————
// Aide : formatage
// ———————————————————————————————————————————
const CURRENCY = (n) => {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
};
const fmtDate = (v) => {
  if (!v) return "";
  try { return new Date(v).toLocaleDateString("fr-FR"); } catch { return String(v); }
};

export default function ClientPreviewPage() {
    const [clientInfo, setClientInfo] = useState(null);
    const route = useRoute();
    const navigation = useNavigation();

    const { clientId, interventionId } = route.params;

    // Chargement client + intervention
    const fetchClientInfo = async () => {
        try {
            const { data, error } = await supabase
                .from("clients")
                .select(
                    `
          name,
          phone,
          createdAt,
          ficheNumber,
          interventions (
            id,
            deviceType,
            brand,
            model,
            reference,
            serial_number,
            description,
            cost,
            partialPayment,
            solderestant,
            devis_cost,
            password,
            chargeur,
            signatureIntervention,
            accept_screen_risk,
            remarks,
            createdAt,
            is_estimate,
            estimate_min,
            estimate_max,
            estimate_type,
            estimate_accepted_at
          )
        `
                )
                .eq("id", clientId)
                .single();

            if (error) throw error;

            const selectedIntervention = data.interventions.find(
                (intervention) => intervention.id === interventionId
            );

            setClientInfo({
                ...data,
                latestIntervention: selectedIntervention,
            });
        } catch (error) {
            console.error("Erreur lors du chargement du client", error);
        }
    };

    useEffect(() => {
        fetchClientInfo();
    }, [clientId]);

    useFocusEffect(
        React.useCallback(() => {
            fetchClientInfo();
        }, [])
    );

    const formatPhoneNumber = (phone) => phone.replace(/(\d{2})(?=\d)/g, "$1 ").trim();

    if (!clientInfo) {
        return <Text>Chargement...</Text>;
    }

    const handleOpenSignaturePage = () => {
        navigation.navigate("SignatureClient", {
            interventionId: clientInfo.latestIntervention.id,
        });
    };

    // Bloc prix (HTML) selon fourchette ou prix final
    const buildPriceBlockHTML = (itv) => {
      if (!itv) return "";
      const { is_estimate, estimate_type, estimate_min, estimate_max, estimate_accepted_at, cost } = itv;
      const min = estimate_min != null ? Number(estimate_min) : null;
      const max = estimate_max != null ? Number(estimate_max) : null;

      if (is_estimate) {
        if (estimate_type === "PLAFOND") {
          return `<div class="cost"><strong>De ${CURRENCY(min)} à ${CURRENCY(max)} (plafond accepté${estimate_accepted_at ? ` le ${fmtDate(estimate_accepted_at)}` : ""})</strong></div>`;
        }
        return `<div class="cost"><strong>De ${CURRENCY(min)} à ${CURRENCY(max)}</strong></div>`;
      }
      return `<div class="cost"><strong>Montant total : ${CURRENCY(cost)}</strong></div>`;
    };

    const handlePrint = async () => {
        if (!clientInfo) {
            Alert.alert("Erreur", "Les informations du client ne sont pas disponibles.");
            return;
        }

        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${clientInfo.name} ${clientInfo.ficheNumber}`;
        const barcodeUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(clientInfo.name)}%20`;
        const itv = clientInfo.latestIntervention;
        const priceBlock = buildPriceBlockHTML(itv);

        const htmlContent = `
<html>
  <head>
    <style>
      @page { size: A5; margin: 10mm; }
      body { font-family: Arial, sans-serif; padding: 10px; margin: 0; font-size: 11px; }
      .section-title { font-size: 15px; font-weight: bold; margin-top: 4px; margin-bottom: 4px; color: #2C3E50; }
      .info { margin-bottom: 5px; font-size: 12px; font-weight: bold; }
      .info-recup { margin-bottom: 5px; font-size: 12px; font-weight: 500; color: red; }
      .cost { font-size: 12px; color: black; font-weight: bold; text-align: right; margin-top: 5px; margin-right: 5px; }
      .costAcompte { font-size: 12px; color: green; font-weight: bold; text-align: right; margin-top: 5px; margin-right: 5px; }
      .header { display: flex; justify-content: center; align-items: center; margin-bottom: 10px; }
      .logo { width: 140px; }
      .signature { width: 220px; height: 60px; margin-top: 10px; }
      .company-details { text-align: center; }
      .single-line-details { text-align: center; font-size: 12px; color: #333; }
      .terms-section { margin-top: 8px; padding: 4px; border-radius: 8px; }
      .terms-text, .terms-text-bottom { font-size: 7px; color: #333; margin-bottom: 4px; }
      .accept-risk { font-size: 12px; color: green; font-weight: bold; margin-top: 6px; }
      .flex-row { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
      .box { flex: 1; border: 1px solid #494848; padding: 8px; border-radius: 8px; }
      .boxClient { background-color: #dfdfdf; flex: 1; border: 1px solid #494848; padding: 8px; border-radius: 8px; }
      .alert { color: red; font-weight: bold; font-size: 10px; margin-bottom: 4px; }
    </style>
  </head>
  <body>
    <div class="header">
      <img src="https://www.avenir-informatique.fr/logo.webp" class="logo" alt="Logo de la société"/>
    </div>
    <div class="company-details">
      <p class="single-line-details">AVENIR INFORMATIQUE, 16 place de l'Hôtel de Ville 93700 Drancy,<br> Téléphone : 01 41 60 18 18</p>
    </div>

    <div class="flex-row">
      <div class="boxClient">
        <div class="info"><strong>Nom:</strong> ${clientInfo.name}</div>
        <div class="info"><strong>Téléphone:</strong> ${formatPhoneNumber(clientInfo.phone)}</div>
        <div class="info"><strong>Numéro de client:</strong> ${clientInfo.ficheNumber}</div>
        <div class="info"><strong>Date de création:</strong> ${new Date(clientInfo.createdAt).toLocaleDateString("fr-FR")}</div>
      </div>
      <div class="box">
        <div class="info"><strong>Type:</strong> ${itv.deviceType}</div>
        <div class="info"><strong>Marque:</strong> ${itv.brand}</div>
        <div class="info"><strong>Modèle:</strong> ${itv.model}</div>
        <div class="info"><strong>N° Série:</strong> ${itv.reference}</div>
        <div class="info"><strong>Mot de passe:</strong> ${itv.password}</div>
        <div class="info"><strong>Chargeur:</strong> ${itv.chargeur ? "Oui" : "Non"}</div>
      </div>
    </div>

    <div class="section-title">Détail du problème</div>
    <div class="box">
      <div class="terms-text-bottom"> ${itv.description}</div>
    </div>

    ${priceBlock}
    ${!itv.is_estimate && itv.partialPayment ? `<div class="cost">Acompte: ${CURRENCY(itv.partialPayment)}</div>` : ""}
    ${!itv.is_estimate && itv.solderestant ? `<div class="costAcompte">Montant restant dû: ${CURRENCY(itv.solderestant)}</div>` : ""}

    <div class="terms-section">
      <p class="terms-text-bottom">
        Je soussigné(e), M.${clientInfo.name || "________________________"} , certifie avoir pris connaissance que le matériel, qu'il soit réparé ou jugé non réparable, devra être récupéré dans un délai maximum de 30 jours. Au-delà de ce délai, le matériel sera considéré comme abandonné et pourra être détruit ou jeté sans recours possible.
      </p>
      <p class="terms-text">AVENIR INFORMATIQUE ne peut être tenu responsable de la perte de données sur disque dur ou tout autre support. Aucune réclamation ne sera prise en compte après le règlement de la facture.</p>
      <p class="terms-text">Les anciens supports sont systématiquement restitués. Si le client ne souhaite pas récupérer son ancien support, celui-ci sera archivé avec le numéro de la fiche correspondant pour une durée de 3 mois avant destruction.</p>
      <p class="terms-text">Nos forfaits varient en fonction des problèmes à résoudre, hors remplacement de matériel.</p>
      <p class="terms-text">En signant ce document, vous acceptez les conditions ci-dessus.</p>
      <p class="terms-text">Responsabilité en cas de perte de données : Le client est seul responsable de ses données personnelles et/ou professionnelles et de leur sauvegarde régulière.</p>
      ${itv.accept_screen_risk ? `<div class="accept-risk">J'accepte le risque de casse de l'ecran tactile ou lcd. Produit concerné ${itv.deviceType}.</div>` : ""}
      ${itv.remarks ? `<div class="box"><div class="alert">Remarque du technicien</div><div class="terms-text-bottom">${itv.remarks}</div></div>` : ""}
      <p class="info-recup">Ce document (ou sa photo) est à présenter (par vous ou par un tiers désigné) le jour de la récupération de votre matériel.</p>
    </div>

    <div class="section-title">Signature du Client</div>
    <div style="display: flex; justify-content: center; align-items: center; margin-top: 10px; gap: 30px;">
      ${clientInfo.latestIntervention.signatureIntervention
        ? `<img src="${clientInfo.latestIntervention.signatureIntervention}" class="signature" alt="Signature du client"/>`
        : "<p style='margin: 0;'>Aucune signature fournie</p>"}
      <img src="${barcodeUrl}" alt="Code-barres" style="width: 120px; height: 50px;" />
    </div>

  </body>
</html>
`;

        try {
            await Print.printAsync({ html: htmlContent });
        } catch (error) {
            Alert.alert("Erreur", "Erreur lors de l'impression : " + error.message);
        }
    };

    // ✅ Impression recto-verso intervention + checkup
    const handlePrintBoth = async () => {
      try {
        const { data: checkupData, error: checkupError } = await supabase
          .from("checkup_reports")
          .select("*")
          .eq("client_phone", clientInfo.phone)
          .limit(1)
          .single();

        if (checkupError || !checkupData) {
          Alert.alert("Erreur", "Fiche de contrôle non trouvée pour ce client.");
          return;
        }

        const intervention = clientInfo.latestIntervention;
        const formatPhone = (phone) => phone.replace(/(\d{2})(?=\d)/g, "$1 ").trim();

        const barcodeUrl = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(clientInfo.name)}%20`;

        // Bloc prix pour l'impression recto
        const min = intervention.estimate_min != null ? Number(intervention.estimate_min) : null;
        const max = intervention.estimate_max != null ? Number(intervention.estimate_max) : null;
        const priceLine = intervention.is_estimate
          ? (intervention.estimate_type === 'PLAFOND'
              ? `De ${CURRENCY(min)} à ${CURRENCY(max)} (plafond accepté${intervention.estimate_accepted_at ? ` le ${fmtDate(intervention.estimate_accepted_at)}` : ''})`
              : `De ${CURRENCY(min)} à ${CURRENCY(max)}`)
          : `Montant total : ${CURRENCY(intervention.cost)}`;

        const htmlContent = `
<html>
<head>
  <style>
    @page { size: A5; margin: 10mm; }
    body { font-family: Arial, sans-serif; padding: 10px; margin: 0; font-size: 11px; }
    .section-title { font-size: 15px; font-weight: bold; margin-top: 4px; margin-bottom: 4px; color: #2C3E50; }
    .info { margin-bottom: 5px; font-size: 12px; font-weight: bold; }
    .info-recup { margin-bottom: 5px; font-size: 12px; font-weight: 500; color: red; }
    .cost { font-size: 12px; color: black; font-weight: bold; text-align: right; margin-top: 5px; margin-right: 5px; }
    .costAcompte { font-size: 12px; color: green; font-weight: bold; text-align: right; margin-top: 5px; margin-right: 5px; }
    .header { display: flex; justify-content: center; align-items: center; margin-bottom: 10px; }
    .logo { width: 140px; }
    .signature { width: 220px; height: 60px; margin-top: 10px; }
    .company-details { text-align: center; }
    .single-line-details { text-align: center; font-size: 12px; color: #333; }
    .terms-section { margin-top: 8px; padding: 4px; border-radius: 8px; }
    .terms-text, .terms-text-bottom { font-size: 7px; color: #333; margin-bottom: 4px; }
    .accept-risk { font-size: 12px; color: green; font-weight: bold; margin-top: 6px; }
    .flex-row { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
    .box { flex: 1; border: 1px solid #494848; padding: 8px; border-radius: 8px; }
    .boxClient { background-color: #dfdfdf; flex: 1; border: 1px solid #494848; padding: 8px; border-radius: 8px; }
    .alert { color: red; font-weight: bold; font-size: 10px; margin-bottom: 4px; }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>

<!-- ✅ Page 1 : Fiche d'intervention -->
<div class="header">
  <img src="https://www.avenir-informatique.fr/logo.webp" class="logo" />
</div>
<div class="company-details">
  <p class="single-line-details">AVENIR INFORMATIQUE, 16 place de l'Hôtel de Ville 93700 Drancy,<br> Téléphone : 01 41 60 18 18</p>
</div>

<div class="flex-row">
  <div class="boxClient">
    <div class="info"><strong>Nom:</strong> ${clientInfo.name}</div>
    <div class="info"><strong>Téléphone:</strong> ${formatPhone(clientInfo.phone)}</div>
    <div class="info"><strong>Numéro de client:</strong> ${clientInfo.ficheNumber}</div>
    <div class="info"><strong>Date de création:</strong> ${new Date(clientInfo.createdAt).toLocaleDateString("fr-FR")}</div>
  </div>
  <div class="box">
    <div class="info"><strong>Type:</strong> ${intervention.deviceType}</div>
    <div class="info"><strong>Marque:</strong> ${intervention.brand}</div>
    <div class="info"><strong>Modèle:</strong> ${intervention.model}</div>
    <div class="info"><strong>N° Série:</strong> ${intervention.reference}</div>
    <div class="info"><strong>Mot de passe:</strong> ${intervention.password}</div>
    <div class="info"><strong>Chargeur:</strong> ${intervention.chargeur ? "Oui" : "Non"}</div>
  </div>
</div>

<div class="section-title">Détail du problème</div>
<div class="box"><div class="terms-text-bottom">${intervention.description}</div></div>

<div class="cost"><strong>${priceLine}</strong></div>
${!intervention.is_estimate && intervention.partialPayment ? `<div class="cost">Acompte: ${CURRENCY(intervention.partialPayment)}</div>` : ""}
${!intervention.is_estimate && intervention.solderestant ? `<div class="costAcompte">Montant restant dû: ${CURRENCY(intervention.solderestant)}</div>` : ""}

<div class="terms-section">
  <p class="terms-text-bottom">
    Je soussigné(e), M.${clientInfo.name || "________________________"} , certifie avoir pris connaissance que le matériel, qu'il soit réparé ou jugé non réparable, devra être récupéré dans un délai maximum de 30 jours. Au-delà de ce délai, le matériel sera considéré comme abandonné et pourra être détruit ou jeté sans recours possible.
  </p>
  <p class="terms-text">AVENIR INFORMATIQUE ne peut être tenu responsable de la perte de données sur disque dur ou tout autre support. Aucune réclamation ne sera prise en compte après le règlement de la facture.</p>
  <p class="terms-text">Les anciens supports sont systématiquement restitués. Si le client ne souhaite pas récupérer son ancien support, celui-ci sera archivé avec le numéro de la fiche correspondant pour une durée de 3 mois avant destruction.</p>
  <p class="terms-text">Nos forfaits varient en fonction des problèmes à résoudre, hors remplacement de matériel.</p>
  <p class="terms-text">En signant ce document, vous acceptez les conditions ci-dessus.</p>
  <p class="terms-text">Responsabilité en cas de perte de données : Le client est seul responsable de ses données personnelles et/ou professionnelles et de leur sauvegarde régulière.</p>
  ${intervention.accept_screen_risk ? `<div class="accept-risk">✅ J'accepte le risque de casse de l'écran – Produit : ${intervention.deviceType}</div>` : ""}
  ${intervention.remarks ? `<div class="box"><div class="alert">Remarque du technicien</div><div class="terms-text-bottom">${intervention.remarks}</div></div>` : ""}
  <p class="info-recup">Ce document (ou sa photo) est à présenter pour récupérer le matériel.</p>
</div>

<div class="section-title">Signature du Client</div>
<div style="display: flex; justify-content: center; align-items: center; margin-top: 10px; gap: 30px;">
  ${intervention.signatureIntervention ? `<img src="${intervention.signatureIntervention}" class="signature" />` : "<p style='margin: 0;'>Aucune signature fournie</p>"}
  <img src="${barcodeUrl}" style="width: 120px; height: 50px;" />
</div>

<!-- ✅ Page 2 : Fiche de contrôle -->
<div class="page-break"></div>
<div class="section-title">Fiche de Contrôle – ${checkupData.product_type}</div>

<div class="box"><strong>Client :</strong> ${checkupData.client_name}</div>
<div class="box"><strong>Date :</strong> ${checkupData.client_date}</div>

<table>
  <tr><th>Composant</th><th>État</th></tr>
  ${Object.entries(checkupData.components).map(([comp, etat]) => `<tr><td>${comp}</td><td>${etat}</td></tr>`).join("")}
</table>

<div class="box"><strong>Remarques générales :</strong><br/>${checkupData.remarks}</div>

<div class="section-title">Signature du Client</div>
<img src="${checkupData.signature}" style="width:200px;height:80px;"/>

</body>
</html>`;

        await Print.printAsync({ html: htmlContent });
      } catch (error) {
        Alert.alert("Erreur", "Impossible d'imprimer les deux fiches : " + error.message);
      }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.header}>
                <Image
                    source={require("../assets/logo_phone.png")}
                    style={styles.logo}
                />
                <View style={styles.companyDetails}>
                    <Text style={styles.companyName}>AVENIR INFORMATIQUE</Text>
                    <Text style={styles.companyAddress}>
                        16, place de l'Hôtel de Ville 93700 Drancy
                    </Text>
                    <Text style={styles.companyPhone}>01 41 60 18 18</Text>
                </View>
            </View>

            <View style={styles.clientSection}>
                <Text style={styles.ficheNumber}>
                    Numéro de Fiche: {clientInfo.ficheNumber}
                </Text>
                <Text>
                    Date de création: {new Date(clientInfo.createdAt).toLocaleDateString("fr-FR")}
                </Text>
                <Text style={styles.sectionTitle}>Informations du Client</Text>
                <Text style={styles.nameText}>Nom: {clientInfo.name}</Text>
                <Text style={styles.phoneText}>
                    Téléphone: {formatPhoneNumber(clientInfo.phone)}
                </Text>
            </View>

            {clientInfo.latestIntervention && (
                <View style={styles.deviceSection}>
                    <Text style={styles.sectionTitle}>Détails du Matériel</Text>
                    <Text>Type d'appareil: {clientInfo.latestIntervention.deviceType}</Text>
                    <Text>Marque: {clientInfo.latestIntervention.brand}</Text>
                    <Text>Modèle: {clientInfo.latestIntervention.model}</Text>
                    <Text>Numéro de série: {clientInfo.latestIntervention.reference}</Text>
                    <Text>Chargeur: {clientInfo.latestIntervention.chargeur ? "Oui" : "Non"}</Text>
                    {clientInfo.latestIntervention.accept_screen_risk && (
                        <Text style={styles.acceptRiskText}>
                            J'accepte le risque de casse de l'ecran tactile ou lcd. Produit concerné {clientInfo.latestIntervention.deviceType}.
                        </Text>
                    )}
                </View>
            )}

            {clientInfo.latestIntervention && (
                <View style={styles.repairSection}>
                    <Text style={styles.sectionTitle}>Détail du problème</Text>
                    <Text>{clientInfo.latestIntervention.description}</Text>

                    {/* 👉 Affichage prix selon fourchette ou prix final */}
                    {clientInfo.latestIntervention.is_estimate ? (
                      clientInfo.latestIntervention.estimate_type === 'PLAFOND' ? (
                        <Text style={styles.costText}>De {CURRENCY(clientInfo.latestIntervention.estimate_min)} à {CURRENCY(clientInfo.latestIntervention.estimate_max)} (plafond accepté{clientInfo.latestIntervention.estimate_accepted_at ? ` le ${fmtDate(clientInfo.latestIntervention.estimate_accepted_at)}` : ''})</Text>
                      ) : (
                        <Text style={styles.costText}>De {CURRENCY(clientInfo.latestIntervention.estimate_min)} à {CURRENCY(clientInfo.latestIntervention.estimate_max)}</Text>
                      )
                    ) : (
                      <>
                        <Text style={styles.costText}>Coût: {CURRENCY(clientInfo.latestIntervention.cost)}</Text>
                        {clientInfo.latestIntervention.partialPayment ? (
                          <Text style={styles.costTextAcompte}>Acompte: {CURRENCY(clientInfo.latestIntervention.partialPayment)}</Text>
                        ) : null}
                        {clientInfo.latestIntervention.solderestant ? (
                          <Text style={styles.costTextReste}>Montant restant dû: {CURRENCY(clientInfo.latestIntervention.solderestant)}</Text>
                        ) : null}
                      </>
                    )}

                    <Text>Mot de passe: {clientInfo.latestIntervention.password}</Text>
                </View>
            )}

            <View style={styles.termsSection}>
                <Text style={styles.termsText}>
                    Je soussigné(e), M.{clientInfo.name || "________________________"} , certifie
                    avoir pris connaissance que le matériel, qu'il soit réparé
                    ou jugé non réparable, devra être récupéré dans un délai
                    maximum de 30 jours. Au-delà de ce délai, le matériel sera
                    considéré comme abandonné et pourra être détruit ou jeté
                    sans recours possible.
                </Text>
                <Text style={styles.termsText}>
                    AVENIR INFORMATIQUE ne peut être tenu responsable de la
                    perte de données sur disque dur ou tout autre support.
                    Aucune réclamation ne sera prise en compte après le
                    règlement de la facture.
                </Text>
                <Text style={styles.termsText}>
                    Les anciens supports sont systématiquement restitués. Si le
                    client ne souhaite pas récupérer son ancien support,
                    celui-ci sera archivé avec le numéro de la fiche
                    correspondant pour une durée de 3 mois avant destruction.
                </Text>
                <Text style={styles.termsText}>
                    Nos forfaits varient en fonction des problèmes à résoudre,
                    hors remplacement de matériel.
                </Text>
                {clientInfo.latestIntervention.remarks ? (
                  <View style={styles.remarqueSection}>
                    <Text style={styles.sectionTitle}>Remarque du technicien</Text>
                    <Text>{clientInfo.latestIntervention.remarks}</Text>
                  </View>
                ) : null}
                <Text style={styles.termsText}>
                    Responsabilité en cas de perte de données : Le client est
                    seul responsable de ses données personnelles et/ou
                    professionnelles et de leur sauvegarde régulière.
                </Text>
                <Text style={styles.termsText}>
                    En cas de perte de données lors d’une prestation et/ou d’une
                    manipulation, qu’elle soit d’origine logicielle ou
                    matérielle, le client (particulier ou professionnel) ne
                    pourra prétendre à aucune indemnisation, qu'il ait ou non
                    une sauvegarde récente ou ancienne de ses données sur un
                    autre support.
                </Text>
                <Text style={styles.termsText}>
                    Toute intervention effectuée par le personnel d'AVENIR
                    INFORMATIQUE se fait sous l’entière responsabilité du
                    client. AVENIR INFORMATIQUE ne pourra en aucun cas être
                    tenue responsable de la perte éventuelle d’informations. Le
                    client reste donc seul responsable de ses données.
                </Text>
                <Text style={styles.termsText}>
                    En signant ce document, vous acceptez les conditions
                    ci-dessus.
                </Text>

                <View style={styles.signatureSection}>
                    <Text>Signature du client:</Text>
                    {clientInfo.latestIntervention.signatureIntervention ? (
                        <>
                            <Image
                                source={{ uri: clientInfo.latestIntervention.signatureIntervention }}
                                style={styles.signatureImage}
                            />

                            <View style={styles.codeContainer}>
                                <View style={styles.codeItem}>
                                    <Image
                                        source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${clientInfo.name} ${clientInfo.ficheNumber}` }}
                                        style={{ width: 100, height: 100 }}
                                    />
                                </View>
                                <View style={styles.codeItem}>
                                    <Image
                                        source={{ uri: `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(clientInfo.name)}%20` }}
                                        style={{ width: 150, height: 60 }}
                                    />
                                </View>
                            </View>
                            <TouchableOpacity style={styles.printButton} onPress={handlePrint}>
                                <Text style={styles.buttonText}>Imprimer</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.printButton, { backgroundColor: "#2c3e50" }]}
                              onPress={handlePrintBoth}
                            >
                              <Text style={styles.buttonText}>🖨️ Imprimer Recto-Verso</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <View style={styles.signatureBox}>
                                <Text>Aucune signature fournie</Text>
                            </View>
                            <TouchableOpacity style={styles.signButton} onPress={handleOpenSignaturePage}>
                                <Text style={styles.signButtonText}>Signer</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 20,
        backgroundColor: "#fff",
    },
    header: {
        flexDirection: "row",
        marginBottom: 20,
    },
    logo: {
        width: 80,
        height: 80,
        marginRight: 20,
    },
    companyDetails: {
        justifyContent: "center",
    },
    companyName: {
        fontSize: 18,
        fontWeight: "bold",
    },
    companyAddress: {
        marginTop: 5,
        fontSize: 14,
        color: "#555",
    },
    companyPhone: {
        marginTop: 5,
        fontSize: 14,
        color: "#555",
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 10,
        marginTop: 20,
    },
    clientSection: {
        marginBottom: 20,
    },
    ficheNumber: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 10,
    },
    phoneText: {
        fontWeight: "bold",
        fontSize: 16,
        marginTop: 10,
    },
    nameText: {
        fontWeight: "bold",
        fontSize: 20,
        marginTop: 2,
    },
    deviceSection: {
        marginBottom: 20,
    },
    repairSection: {
        marginBottom: 20,
    },
    signatureSection: {
        marginBottom: 20,
    },
    signatureBox: {
        height: 80,
        borderColor: "#000",
        borderWidth: 1,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 10,
    },
    signatureImage: {
        width: 300,
        height: 100,
        marginTop: 10,
    },
    signButton: {
        backgroundColor: "#007BFF",
        padding: 10,
        borderRadius: 5,
        marginTop: 10,
    },
    signButtonText: {
        color: "#fff",
        textAlign: "center",
        fontWeight: "bold",
    },
    printButton: {
        backgroundColor: "#28a745",
        padding: 10,
        borderRadius: 5,
        marginTop: 10,
    },
    buttonText: {
        color: "#fff",
        textAlign: "center",
        fontWeight: "bold",
    },
    costText: {
        fontSize: 18,
        fontWeight: "bold",
        marginTop: 10,
    },
    costTextAcompte: {
        fontSize: 18,
        fontWeight: "bold",
        marginTop: 5,
    },
    costTextReste: {
        fontSize: 22,
        fontWeight: "bold",
        color: "green",
        marginTop: 5,
    },
    termsSection: {
        marginBottom: 20,
    },
    termsText: {
        fontSize: 14,
        color: "#555",
        marginBottom: 5,
    },
    acceptRiskText: {
        fontSize: 16,
        color: "green",
        fontWeight: "bold",
        marginTop: 10,
    },
    codeContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 20,
    },
    codeItem: {
        alignItems: "center",
    },
    spacer: {
        width: 20,
    },
    qrTitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 5,
    },
    barcodeTitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 5,
    },
    remarqueSection: {
        marginBottom: 20,
    },
});
