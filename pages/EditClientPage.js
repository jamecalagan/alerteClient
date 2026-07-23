import React, { useState, useEffect, useRef } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Text,
  Image,
  Animated,
  Easing,
  Alert,
  Modal,
  ScrollView,
} from "react-native";
import { supabase } from "../supabaseClient";
import AlertBox from "../components/AlertBox";
import * as Print from "expo-print";

export default function EditClientPage({ route, navigation }) {
  const { client } = route.params;

  const [checkupExists, setCheckupExists] = useState(false);
  useEffect(() => {
    const checkIfCheckupExists = async () => {
      const { data } = await supabase
        .from("checkup_reports")
        .select("id")
        .eq("client_phone", client.phone)
        .limit(1);
      setCheckupExists(data && data.length > 0);
    };
    checkIfCheckupExists();
  }, []);

  const [name, setName] = useState(client.name || "");
  const [phone, setPhone] = useState(client.phone || "");
  const [email, setEmail] = useState(client.email || "");
  const [etiquetteImprimee, setEtiquetteImprimee] = useState(false);

  const [interventions, setInterventions] = useState(
    client.interventions || []
  );
const [estimateVisible, setEstimateVisible] = useState(false);
const [estimateLoading, setEstimateLoading] = useState(false);
const [estimateResult, setEstimateResult] = useState(null);
const [estimatedIntervention, setEstimatedIntervention] =
  useState(null);
  const BlinkingIcon = ({ source }) => {
    const opacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
            easing: Easing.linear,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }, []);
    return (
      <Animated.Image
        source={source}
        style={{ width: 20, height: 20, tintColor: "#f54242", opacity }}
      />
    );
  };

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [onConfirmAction, setOnConfirmAction] = useState(null);

  const showAlert = (title, message, onConfirm = null) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setOnConfirmAction(() => onConfirm);
    setAlertVisible(true);
  };

 useEffect(() => {
  // 🔹 On charge tout de suite les données complètes (avec password)
  loadClientData();

  // 🔹 Et on garde le listener pour les retours sur la page
  const unsubscribe = navigation.addListener("focus", loadClientData);
  return unsubscribe;
}, [navigation]);

  const loadClientData = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select(
        `
        *,
        interventions(
          id, status, password, deviceType, brand, model, chargeur, description, cost,
          solderestant, createdAt, updatedAt, commande, photos, notifiedBy, accept_screen_risk,
          paymentStatus, reference, serial_number, partialPayment, devis_cost, remarks,
          imprimee, print_etiquette, commande_effectuee,
          is_estimate, estimate_min, estimate_max, estimate_type, estimate_accepted,
		  repair_cause, repair_action, repair_duration, repair_comment
        )
      `
      )
      .eq("id", client.id);

if (error) {
  console.error("❌ Chargement client :", error);

  showAlert(
    "Erreur",
    error.message || "Erreur lors du chargement du client"
  );

  return;
}

    if (data && data.length > 0) {
      const updatedClient = data[0];
      const filteredInterventions = (updatedClient.interventions || []).filter(
        (intervention) => intervention.status !== "Récupéré"
      );

      setName(updatedClient.name || "");
      setPhone(updatedClient.phone || "");
      setEmail(updatedClient.email || "");
      setInterventions(filteredInterventions || []);

      const anyNotPrinted = (filteredInterventions || []).some(
        (i) => !i.print_etiquette
      );
      setEtiquetteImprimee(!anyNotPrinted);
    }
  };

  const handleSaveClient = async () => {
    if (!name || !phone) {
      showAlert(
        "Erreur",
        "Le nom et le numéro de téléphone doivent être remplis."
      );
      return;
    }

    try {
      const payload = {
        name,
        phone,
        email: (email || "").trim() || null,
        updatedAt: new Date().toISOString(),
      };

      const { data: rows, error } = await supabase
        .from("clients")
        .update(payload)
        .eq("id", client.id)
        .select("id");

      if (error) throw error;

      if (!rows || rows.length === 0) {
        showAlert("Aucune ligne modifiée", "Aucune ligne mise à jour (RLS ?).");
        return;
      }

      showAlert("Succès", "Client modifié avec succès.");
      navigation.goBack();
    } catch (e) {
      showAlert(
        "Erreur",
        "Erreur lors de la modification du client : " + e.message
      );
    }
  };

  const updateEmailOnly = async () => {
    try {
      const e = (email || "").trim();
      const { data: rows, error } = await supabase
        .from("clients")
        .update({ email: e || null, updatedAt: new Date().toISOString() })
        .eq("id", client.id)
        .select("id, email");

      if (error) {
        showAlert("Erreur SQL", error.message);
        return;
      }

      if (!rows || rows.length === 0) {
        showAlert("Aucune ligne modifiée", "Aucune ligne mise à jour (RLS ?).");
        return;
      }

      setEmail(rows[0]?.email || "");
      showAlert("OK", "Adresse email mise à jour.");
    } catch (e) {
      showAlert("Erreur", e.message || "Mise à jour impossible.");
    }
  };

  function formatWithSpaces(value) {
    const str = value.toString();
    return str.replace(/(\d{2})(?=\d)/g, "$1 ");
  }
  const formattedPhone = formatWithSpaces(phone);

  function formatDateFR(dateString) {
    if (!dateString) return "Date inconnue";
    return new Date(dateString).toLocaleDateString("fr-FR");
  }

  const normalizeEstimateText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getEstimateWords = (value) => {
  const ignoredWords = new Set([
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "de",
    "du",
    "et",
    "ou",
    "avec",
    "sans",
    "sur",
    "dans",
    "pour",
    "plus",
    "pas",
    "ne",
    "se",
    "est",
    "sont",
    "pc",
    "ordinateur",
    "appareil",
    "probleme",
    "panne",
  ]);

  return normalizeEstimateText(value)
    .split(" ")
    .filter(
      (word) =>
        word.length >= 3 &&
        !ignoredWords.has(word)
    );
};

const calculateDescriptionSimilarity = (
  currentDescription,
  oldDescription
) => {
  const currentWords = new Set(
    getEstimateWords(currentDescription)
  );

  const oldWords = new Set(
    getEstimateWords(oldDescription)
  );

  if (
    currentWords.size === 0 ||
    oldWords.size === 0
  ) {
    return 0;
  }

  let commonWords = 0;

  currentWords.forEach((word) => {
    if (oldWords.has(word)) {
      commonWords += 1;
    }
  });

  const allWords = new Set([
    ...currentWords,
    ...oldWords,
  ]);

  return commonWords / allWords.size;
};

const getRepairSimilarityScore = (
  currentIntervention,
  previousIntervention
) => {
  let score = 0;

  const currentType = normalizeEstimateText(
    currentIntervention?.deviceType
  );
  const oldType = normalizeEstimateText(
    previousIntervention?.deviceType
  );

  const currentBrand = normalizeEstimateText(
    currentIntervention?.brand
  );
  const oldBrand = normalizeEstimateText(
    previousIntervention?.brand
  );

  const currentModel = normalizeEstimateText(
    currentIntervention?.model
  );
  const oldModel = normalizeEstimateText(
    previousIntervention?.model
  );

  if (
    currentType &&
    oldType &&
    currentType === oldType
  ) {
    score += 20;
  }

  if (
    currentBrand &&
    oldBrand &&
    currentBrand === oldBrand
  ) {
    score += 25;
  }

  if (currentModel && oldModel) {
    if (currentModel === oldModel) {
      score += 50;
    } else if (
      currentModel.includes(oldModel) ||
      oldModel.includes(currentModel)
    ) {
      score += 30;
    }
  }

  const descriptionSimilarity =
    calculateDescriptionSimilarity(
      currentIntervention?.description,
      previousIntervention?.description
    );

  score += Math.round(descriptionSimilarity * 50);

  return score;
};

const getMedian = (numbers) => {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return 0;
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
};

const getPercentile = (numbers, percentile) => {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return 0;
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const position =
    (sorted.length - 1) * percentile;

  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  const weight = position - lowerIndex;

  return (
    sorted[lowerIndex] * (1 - weight) +
    sorted[upperIndex] * weight
  );
};

const openRepairEstimate = async (intervention) => {
  setEstimatedIntervention(intervention);
  setEstimateVisible(true);
  setEstimateLoading(true);
  setEstimateResult(null);

  try {
    const { data, error } = await supabase
      .from("interventions")
      .select(
        `
        id,
        client_id,
        deviceType,
        brand,
        model,
        description,
        cost,
        devis_cost,
        status,
        createdAt,
        clients(
          id,
          name,
          ficheNumber
        )
        `
      )
      .neq("id", intervention.id)
      .not("cost", "is", null)
      .gt("cost", 0)
      .limit(1000);

    if (error) {
      throw error;
    }

    const scoredInterventions = (data || [])
      .map((previousIntervention) => {
        const score = getRepairSimilarityScore(
          intervention,
          previousIntervention
        );

        const cost = Number(
          previousIntervention.cost || 0
        );

        return {
          ...previousIntervention,
          score,
          numericCost: cost,
        };
      })
      .filter(
        (previousIntervention) =>
          previousIntervention.score >= 25 &&
          Number.isFinite(
            previousIntervention.numericCost
          ) &&
          previousIntervention.numericCost > 0
      )
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return (
          new Date(b.createdAt || 0) -
          new Date(a.createdAt || 0)
        );
      });

    /*
     * Les statistiques sont calculées sur les 30 cas
     * les plus proches, pour éviter que des réparations
     * trop différentes faussent le résultat.
     */
    const statisticalCases =
      scoredInterventions.slice(0, 30);

    const prices = statisticalCases
      .map((row) => row.numericCost)
      .sort((a, b) => a - b);

    if (prices.length === 0) {
      setEstimateResult({
        count: 0,
        similarCases: [],
      });

      return;
    }

    const total = prices.reduce(
      (sum, price) => sum + price,
      0
    );

    const average = total / prices.length;
    const median = getMedian(prices);
    const usualMin = getPercentile(prices, 0.25);
    const usualMax = getPercentile(prices, 0.75);

    const bestScore =
      statisticalCases[0]?.score || 0;

    let confidence = "Faible";

    if (prices.length >= 10 && bestScore >= 70) {
      confidence = "Bonne";
    } else if (
      prices.length >= 5 &&
      bestScore >= 45
    ) {
      confidence = "Moyenne";
    }

    setEstimateResult({
      count: prices.length,
      average,
      median,
      minimum: prices[0],
      maximum: prices[prices.length - 1],
      usualMin,
      usualMax,
      confidence,
      similarCases: scoredInterventions.slice(0, 10),
    });
  } catch (error) {
    console.error(
      "❌ Estimation réparation :",
      error
    );

    setEstimateResult({
      error:
        error?.message ||
        "Impossible de calculer l’estimation.",
      count: 0,
      similarCases: [],
    });
  } finally {
    setEstimateLoading(false);
  }
};

  const getStatusStyle = (status) => {
    switch (status) {
      case "En attente de pièces":
        return { borderColor: "#270381", borderWidth: 2 };
      case "Devis accepté":
        return { borderColor: "#FFD700", borderWidth: 2 };
      case "Intervention en cours":
        return { borderColor: "#528fe0", borderWidth: 2 };
      case "Réparé":
        return { borderColor: "#98fb98", borderWidth: 2 };
      case "Non réparable":
        return { borderColor: "#e9967a", borderWidth: 2 };
      case "Devis en cours":
        return { borderColor: "#f37209", borderWidth: 2 };
      default:
        return { borderColor: "#e0e0e0", borderWidth: 2 };
    }
  };

  const getStatusBadgeColors = (status) => {
    switch (status) {
      case "En attente de pièces":
        return { bgColor: "#ede9ff", textColor: "#4c1d95" };
      case "Devis accepté":
        return { bgColor: "#fef3c7", textColor: "#92400e" };
      case "Intervention en cours":
        return { bgColor: "#dbeafe", textColor: "#1d4ed8" };
      case "Réparé":
        return { bgColor: "#dcfce7", textColor: "#166534" };
      case "Non réparable":
        return { bgColor: "#fee2e2", textColor: "#b91c1c" };
      case "Devis en cours":
        return { bgColor: "#fff7ed", textColor: "#9a3412" };
      default:
        return { bgColor: "#e5e7eb", textColor: "#374151" };
    }
  };

  const handleDeleteIntervention = (interventionId) => {
    showAlert(
      "Confirmer la suppression",
      "Êtes-vous sûr de vouloir supprimer cette intervention ?",
      async () => {
        try {
          const { error } = await supabase
            .from("interventions")
            .delete()
            .eq("id", interventionId);
          if (error) throw error;
          loadClientData();
          showAlert("Succès", "Intervention supprimée avec succès.");
        } catch (error) {
          showAlert(
            "Erreur",
            "Erreur lors de la suppression de l'intervention"
          );
        }
      }
    );
  };

  const handlePrint = async () => {
    try {
      for (const intervention of interventions) {
        const htmlContent = `
          <html>
            <head>
              <style>
                body { width: 62mm; font-family: Arial, sans-serif; margin: 0; padding: 2px; font-size: 10px; box-sizing: border-box; }
                p { margin: 0; line-height: 1.2; }
                .label-section { display: flex; justify-content: space-between; margin-bottom: 5px; }
                .bold { font-weight: bold; }
                .small-text { font-size: 11px; }
              </style>
            </head>
            <body>
              <div class="label-section"><p class="bold">Numéro Client :</p><p>${
                client.ficheNumber
              }</p></div>
              <div class="label-section"><p class="bold">Nom :</p><p>${name}</p></div>
              <div class="label-section"><p class="bold">Téléphone :</p><p>${formatWithSpaces(
                phone
              )}</p></div>
              <div class="label-section"><p class="bold">Mot de passe :</p><p>${
                intervention.password || "N/A"
              }</p></div>
              <div class="label-section"><p class="bold">Marque :</p><p>${
                intervention.brand
              }</p></div>
              <div class="label-section"><p class="bold">Modèle :</p><p>${
                intervention.model
              }</p></div>
              <div class="label-section"><p class="bold">Description :</p><p>${
                intervention.description || "N/A"
              }</p></div>
              <div class="label-section"><p class="bold">Coût :</p><p>${
                intervention.cost || "0"
              } €</p></div>
              <div class="label-section"><p class="bold">Chargeur :</p><p>${
                intervention.chargeur ? "Oui" : "Non"
              }</p></div>
              <div class="label-section"><p class="bold">Date :</p><p>${formatDateFR(
                intervention?.createdAt
              )}</p></div>
            </body>
          </html>
        `;
        await Print.printAsync({ html: htmlContent });

        if (!intervention.print_etiquette) {
          await supabase
            .from("interventions")
            .update({ print_etiquette: true })
            .eq("id", intervention.id);
        }
      }
      await loadClientData();
    } catch (error) {
      console.error("Erreur lors de l'impression :", error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Interventions</Text>

      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(text) => setName(text.toUpperCase())}
        autoCapitalize="characters"
      />

      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      <View style={styles.emailRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          placeholderTextColor="#888787"
          placeholder="Adresse e-mail (optionnel)"
          autoCapitalize="none"
        />

        <TouchableOpacity
          onPress={updateEmailOnly}
          style={styles.smallIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Enregistrer uniquement l’adresse e-mail"
        >
          <Image
            source={require("../assets/icons/save.png")}
            style={styles.smallIcon}
          />
        </TouchableOpacity>
      </View>

      {interventions.length > 0 ? (
        <FlatList
          data={interventions}
          keyExtractor={(item, idx) => idx.toString()}
          renderItem={({ item, index }) => {
            const statusBorderStyle = getStatusStyle(item.status);
            const { bgColor, textColor } = getStatusBadgeColors(item.status);

            const paymentLabel =
              item.paymentStatus === "paid"
                ? "Réglé"
                : item.paymentStatus === "reglement_partiel"
                ? "Règlement partiel"
                : item.paymentStatus || "Non précisé";

            const hasEstimateRange =
              item?.is_estimate &&
              typeof item?.estimate_min === "number" &&
              typeof item?.estimate_max === "number";

            const Row = ({ label, value, valueStyle }) => {
              if (!value && value !== 0) return null;
              return (
                <View style={styles.tableRow}>
                  <Text style={styles.tableLabel}>{label}</Text>
                  <Text
                    style={[styles.tableValue, valueStyle]}
                    numberOfLines={2}
                  >
                    {value}
                  </Text>
                </View>
              );
            };

            return (
              <TouchableOpacity
                style={[styles.interventionCard, statusBorderStyle]}
                onPress={() =>
                  navigation.navigate("EditIntervention", {
                    clientId: client.id,
                    interventionId: item.id,
                  })
                }
              >
                {/* En-tête */}
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.cardTitle}>
                      Fiche intervention n° {index + 1}
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Créée le {formatDateFR(item.createdAt)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: bgColor },
                    ]}
                  >
                    <Text
                      style={[styles.statusBadgeText, { color: textColor }]}
                      numberOfLines={1}
                    >
                      {item.status || "Statut inconnu"}
                    </Text>
                  </View>
                </View>

                {/* Tableau */}
                <View style={styles.table}>
                  <Row
                    label="Appareil"
                    value={item.deviceType || "Non renseigné"}
                  />
                  <Row
                    label="Marque"
                    value={item.brand || "Non renseignée"}
                  />
                  <Row
                    label="Modèle"
                    value={item.model || "Non renseigné"}
                  />
                  {item.serial_number && (
                    <Row label="N° de série" value={item.serial_number} />
                  )}
                  <Row
                    label="Référence"
                    value={item.reference || "Non renseignée"}
                  />
                  <Row
                    label="Description"
                    value={item.description || "Aucune description"}
                  />
                  <Row
                    label="Chargeur"
                    value={item.chargeur ? "Oui" : "Non"}
                  />
                  <Row
                    label="Mot de passe"
                    value={item.password || "Non communiqué"}
                  />
                  <Row
                    label="Montant devis"
                    value={`${item.devis_cost || 0} €`}
                  />
                  {item.cost && (
                    <Row
                      label="Total TTC"
                      value={`${item.cost} €`}
                      valueStyle={styles.tableValueStrong}
                    />
                  )}
                  <Row label="Règlement" value={paymentLabel} />
                  {item.paymentStatus === "reglement_partiel" &&
                    item.partialPayment && (
                      <Row
                        label="Acompte"
                        value={`${item.partialPayment} €`}
                      />
                    )}
                  {item.solderestant && (
                    <Row
                      label="Reste dû"
                      value={`${item.solderestant} €`}
                      valueStyle={styles.resteValue}
                    />
                  )}
                  {hasEstimateRange && (
                    <Row
                      label="Estimation"
                      value={
                        item.estimate_type === "PLAFOND"
                          ? `Approuvée : de ${item.estimate_min} € à ${item.estimate_max} €`
                          : `Indicative : de ${item.estimate_min} € à ${item.estimate_max} €`
                      }
                    />
                  )}
				  {item.repair_cause && (
  <Row
    label="Cause principale"
    value={item.repair_cause}
    valueStyle={styles.repairCauseValue}
  />
)}

{item.repair_action && (
  <Row
    label="Réparation"
    value={item.repair_action}
    valueStyle={styles.repairActionValue}
  />
)}

{item.repair_duration && (
  <Row
    label="Temps passé"
    value={item.repair_duration}
  />
)}

{item.repair_comment && (
  <Row
    label="Compte rendu"
    value={item.repair_comment}
  />
)}
                  <Row
                    label="Remarques"
                    value={item.remarks || "Aucune"}
                  />
                  {item.accept_screen_risk && (
                    <Row
                      label="Risque écran"
                      value="Accepté par le client"
                      valueStyle={styles.acceptText}
                    />
                  )}
                  <Row
                    label="Date dépôt"
                    value={formatDateFR(item.createdAt)}
                  />
                </View>

                {/* Bloc commande / pièces */}
                {item.status === "En attente de pièces" && (
                  <>
                    <View style={styles.table}>
                      <Row
                        label="Produit en commande"
                        value={item.commande || "Non précisé"}
                      />
                    </View>

                    <TouchableOpacity
                      style={{
                        backgroundColor: item.commande_effectuee
                          ? "#d6d6d6"
                          : "#fffde7",
                        borderWidth: 1,
                        borderColor: item.commande_effectuee
                          ? "#999"
                          : "#f9a825",
                        padding: 10,
                        borderRadius: 8,
                        marginTop: 8,
                        opacity: item.commande_effectuee ? 0.6 : 1,
                      }}
                      disabled={item.commande_effectuee}
                      onPress={() => {
                        const newValue = true;
                        showAlert(
                          "Confirmer",
                          "Marquer ce produit comme commandé ?",
                          async () => {
                            const { error } = await supabase
                              .from("interventions")
                              .update({ commande_effectuee: newValue })
                              .eq("id", item.id);
                            if (!error) {
                              const updatedInterventions = interventions.map(
                                (i) =>
                                  i.id === item.id
                                    ? { ...i, commande_effectuee: newValue }
                                    : i
                              );
                              setInterventions(updatedInterventions);
                            }
                          }
                        );
                      }}
                    >
                      <Text
                        style={{
                          textAlign: "center",
                          color: item.commande_effectuee ? "#666" : "#f57f17",
                          fontWeight: "bold",
                        }}
                      >
                        {item.commande_effectuee
                          ? "✅ Produit commandé"
                          : "Produit commandé ?"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.commandeRecuButton}
                      onPress={() => {
                        showAlert(
                          "Confirmer la réception de la commande",
                          'Êtes-vous sûr de vouloir passer le statut à "Intervention en cours" ?',
                          async () => {
                            try {
                              const { error } = await supabase
                                .from("interventions")
                                .update({ status: "Intervention en cours" })
                                .eq("id", item.id);
                              if (error) return;

                              const updatedInterventions = interventions.map(
                                (intervention) =>
                                  intervention.id === item.id
                                    ? {
                                        ...intervention,
                                        status: "Intervention en cours",
                                      }
                                    : intervention
                              );
                              setInterventions(updatedInterventions);
                              showAlert(
                                "Succès",
                                'Statut mis à jour à "Intervention en cours".'
                              );
                            } catch (error) {}
                          }
                        );
                      }}
                    >
                      <Text style={styles.commandeRecuButtonText}>
                        Commande reçue ?
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* Barre d'actions en bas */}
                <View style={styles.cardActions}>
				<TouchableOpacity
  style={styles.cardActionItem}
  onPress={(event) => {
    event?.stopPropagation?.();
    openRepairEstimate(item);
  }}
>
  <Text style={styles.estimateActionIcon}>
    📊
  </Text>

  <Text style={styles.cardActionText}>
    Estimation
  </Text>
</TouchableOpacity>

<View style={styles.actionSeparator} />
                  <TouchableOpacity
                    onPress={() => handleDeleteIntervention(item.id)}
                    style={styles.cardActionItem}
                  >
                    <Image
                      source={require("../assets/icons/trash.png")}
                      style={{ width: 18, height: 18, tintColor: "#b91c1c" }}
                    />
                    <Text style={styles.cardActionTextDanger}>Supprimer</Text>
                  </TouchableOpacity>

                  <View style={styles.actionSeparator} />

                  <TouchableOpacity
                    style={styles.cardActionItem}
                    onPress={() => {
                      if (checkupExists) {
                        Alert.alert(
                          "Fiche déjà créée",
                          "Une fiche de contrôle existe déjà pour ce client."
                        );
                        return;
                      }
                      const currentIntervention =
                        Array.isArray(interventions) &&
                        interventions.length > 0
                          ? interventions[0]
                          : null;

                      navigation.navigate("CheckupPage", {
                        clientName: client.name,
                        clientPhone: client.phone,
                        clientDate: new Date().toLocaleDateString("fr-FR"),
                        deviceType:
                          currentIntervention?.deviceType || "PC Portable",
                            // ✅ on récupère la signature directement depuis l’intervention
  clientSignature: currentIntervention?.signatureIntervention || null,

  // (optionnel mais recommandé) pour un fallback côté CheckupPage
  interventionId: currentIntervention?.id || null,
                      });
                    }}
                  >
                    <Image
                      source={require("../assets/icons/checklist.png")}
                      style={{ width: 18, height: 18, tintColor: "#2563eb" }}
                    />
                    <Text style={styles.cardActionText}>Fiche contrôle</Text>
                  </TouchableOpacity>

                  <View style={styles.actionSeparator} />

                  <TouchableOpacity
                    style={styles.cardActionItem}
                    onPress={handlePrint}
                  >
                    {!etiquetteImprimee ? (
                      <BlinkingIcon
                        source={require("../assets/icons/print.png")}
                      />
                    ) : (
                      <Image
                        source={require("../assets/icons/print.png")}
                        style={{ width: 20, height: 20, tintColor: "#047857" }}
                      />
                    )}
                    <Text style={styles.cardActionText}>Imprimer</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <Text style={styles.buttonTextNo}>Aucune intervention trouvée.</Text>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.iconButton, styles.addButton]}
          onPress={() =>
            navigation.navigate("AddIntervention", { clientId: client.id })
          }
        >
          <Image
            source={require("../assets/icons/plus.png")}
            style={{
              width: 20,
              height: 20,
              tintColor: "#888787",
              marginRight: 10,
            }}
          />
          <Text style={styles.buttonText}>Ajouter une intervention</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, styles.addButton]}
          onPress={handleSaveClient}
        >
          <Image
            source={require("../assets/icons/save.png")}
            style={{
              width: 20,
              height: 20,
              tintColor: "#888787",
              marginRight: 10,
            }}
          />
          <Text style={styles.buttonText}>Sauvegarder</Text>
        </TouchableOpacity>
      </View>
<Modal
  visible={estimateVisible}
  transparent
  animationType="fade"
  onRequestClose={() =>
    setEstimateVisible(false)
  }
>
  <View style={styles.estimateOverlay}>
    <View style={styles.estimateModal}>
      <View style={styles.estimateHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.estimateTitle}>
            📊 Estimation réparation
          </Text>

          <Text style={styles.estimateSubtitle}>
            {[
              estimatedIntervention?.deviceType,
              estimatedIntervention?.brand,
              estimatedIntervention?.model,
            ]
              .filter(Boolean)
              .join(" · ") || "Appareil non renseigné"}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.estimateCloseButton}
          onPress={() =>
            setEstimateVisible(false)
          }
        >
          <Text style={styles.estimateCloseText}>
            ✕
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 20,
        }}
      >
        {!!estimatedIntervention?.description && (
          <View style={styles.estimateDescriptionBox}>
            <Text style={styles.estimateSmallLabel}>
              Problème renseigné
            </Text>

            <Text style={styles.estimateDescription}>
              {estimatedIntervention.description}
            </Text>
          </View>
        )}

        {estimateLoading ? (
          <View style={styles.estimateEmptyBox}>
            <Text style={styles.estimateLoadingText}>
              Analyse des anciennes réparations…
            </Text>
          </View>
        ) : estimateResult?.error ? (
          <View style={styles.estimateEmptyBox}>
            <Text style={styles.estimateErrorText}>
              {estimateResult.error}
            </Text>
          </View>
        ) : estimateResult?.count === 0 ? (
          <View style={styles.estimateEmptyBox}>
            <Text style={styles.estimateEmptyTitle}>
              Aucun cas suffisamment proche
            </Text>

            <Text style={styles.estimateEmptyText}>
              Renseigne au minimum le type, la marque,
              le modèle ou une description plus précise.
            </Text>
          </View>
        ) : estimateResult ? (
          <>
            <View style={styles.estimateConfidenceRow}>
              <Text style={styles.estimateConfidenceLabel}>
                Fiabilité de l’estimation
              </Text>

              <Text
                style={[
                  styles.estimateConfidenceBadge,
                  estimateResult.confidence === "Bonne"
                    ? styles.estimateConfidenceGood
                    : estimateResult.confidence ===
                      "Moyenne"
                    ? styles.estimateConfidenceMedium
                    : styles.estimateConfidenceLow,
                ]}
              >
                {estimateResult.confidence}
              </Text>
            </View>

            <View style={styles.estimateMainBox}>
              <Text style={styles.estimateSmallLabel}>
                Fourchette habituelle
              </Text>

              <Text style={styles.estimateMainPrice}>
                {Math.round(
                  estimateResult.usualMin
                )}{" "}
                € à{" "}
                {Math.round(
                  estimateResult.usualMax
                )}{" "}
                €
              </Text>

              <Text style={styles.estimateCaseCount}>
                Basée sur {estimateResult.count} réparation
                {estimateResult.count > 1 ? "s" : ""} similaire
                {estimateResult.count > 1 ? "s" : ""}
              </Text>
            </View>

            <View style={styles.estimateStatsGrid}>
              <View style={styles.estimateStatBox}>
                <Text style={styles.estimateStatLabel}>
                  Médiane
                </Text>
                <Text style={styles.estimateStatValue}>
                  {Math.round(
                    estimateResult.median
                  )}{" "}
                  €
                </Text>
              </View>

              <View style={styles.estimateStatBox}>
                <Text style={styles.estimateStatLabel}>
                  Moyenne
                </Text>
                <Text style={styles.estimateStatValue}>
                  {Math.round(
                    estimateResult.average
                  )}{" "}
                  €
                </Text>
              </View>

              <View style={styles.estimateStatBox}>
                <Text style={styles.estimateStatLabel}>
                  Minimum
                </Text>
                <Text style={styles.estimateStatValue}>
                  {Math.round(
                    estimateResult.minimum
                  )}{" "}
                  €
                </Text>
              </View>

              <View style={styles.estimateStatBox}>
                <Text style={styles.estimateStatLabel}>
                  Maximum
                </Text>
                <Text style={styles.estimateStatValue}>
                  {Math.round(
                    estimateResult.maximum
                  )}{" "}
                  €
                </Text>
              </View>
            </View>

            <Text style={styles.similarCasesTitle}>
              Cas les plus proches
            </Text>

            {estimateResult.similarCases.map(
              (similarCase, similarIndex) => {
                const linkedClient =
                  Array.isArray(similarCase.clients)
                    ? similarCase.clients[0]
                    : similarCase.clients;

                return (
                  <View
                    key={String(similarCase.id)}
                    style={styles.similarCaseCard}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.similarCaseDevice}>
                        {[
                          similarCase.deviceType,
                          similarCase.brand,
                          similarCase.model,
                        ]
                          .filter(Boolean)
                          .join(" · ") ||
                          `Cas ${similarIndex + 1}`}
                      </Text>

                      <Text
                        style={styles.similarCaseDescription}
                        numberOfLines={2}
                      >
                        {similarCase.description ||
                          "Description non renseignée"}
                      </Text>

                      <Text style={styles.similarCaseClient}>
                        {linkedClient?.name
                          ? `${linkedClient.name}${
                              linkedClient.ficheNumber
                                ? ` · Fiche ${linkedClient.ficheNumber}`
                                : ""
                            }`
                          : formatDateFR(
                              similarCase.createdAt
                            )}
                      </Text>
                    </View>

                    <View style={styles.similarCaseRight}>
                      <Text style={styles.similarCasePrice}>
                        {Math.round(
                          similarCase.numericCost
                        )}{" "}
                        €
                      </Text>

                      <Text style={styles.similarCaseScore}>
                        Correspondance :{" "}
                        {similarCase.score}
                      </Text>
                    </View>
                  </View>
                );
              }
            )}

            <Text style={styles.estimateWarning}>
              Estimation statistique basée sur les prix
              enregistrés dans l’atelier. Elle ne remplace
              pas le diagnostic ni le devis final.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  </View>
</Modal>
      <AlertBox
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        confirmText="Confirmer"
        cancelText="Annuler"
        onConfirm={() => {
          setAlertVisible(false);
          if (onConfirmAction) onConfirmAction();
        }}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#e0e0e0" },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    color: "#2c3e50",
  },
  input: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#585858",
    borderRadius: 8,
    backgroundColor: "#cacaca",
    paddingHorizontal: 10,
    marginBottom: 15,
    height: 45,
    fontSize: 18,
    color: "#333",
  },

  interventionCard: {
    padding: 16,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#1f2933",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#7b8794",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },

  table: {
    marginTop: 8,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#f9fafb",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
  },
  tableLabel: {
    width: 120,
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "600",
  },
  tableValue: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  tableValueStrong: {
    fontWeight: "700",
  },
  resteValue: {
    color: "#c0392b",
    fontWeight: "700",
  },

  addButton: {
    backgroundColor: "#0c0f18",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#4a90e2",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
    marginVertical: 5,
  },
  addButtonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  saveButton: {
    backgroundColor: "#28a745",
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#007bff",
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderColor: "#007bff",
    justifyContent: "center",
    flex: 1,
    marginHorizontal: 6,
  },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  buttonTextNo: {
    fontSize: 17,
    color: "#888787",
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 20,
  },

  commandeRecuButton: {
    backgroundColor: "#e8f5e9",
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#07a252",
  },
  commandeRecuButtonText: {
    color: "#07a252",
    fontWeight: "600",
    textAlign: "center",
    fontSize: 16,
  },

  acceptText: {
    fontSize: 15,
    color: "#e67e22",
    fontWeight: "bold",
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  smallIconBtn: {
    width: 40,
    height: 40,
    marginLeft: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4a90e2",
    backgroundColor: "#0c0f18",
    alignItems: "center",
    justifyContent: "center",
  },
  smallIcon: {
    width: 18,
    height: 18,
    tintColor: "#ffffff",
  },

  // Barre d'actions en bas de la fiche
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  cardActionItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardActionText: {
    marginLeft: 6,
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },
  cardActionTextDanger: {
    marginLeft: 6,
    fontSize: 14,
    color: "#b91c1c",
    fontWeight: "700",
  },
  actionSeparator: {
    width: 1,
    height: 24,
    backgroundColor: "#e5e7eb",
  },
  estimateActionIcon: {
  fontSize: 18,
},

estimateOverlay: {
  flex: 1,
  backgroundColor: "rgba(0,0,0,0.65)",
  justifyContent: "center",
  alignItems: "center",
  padding: 18,
},

estimateModal: {
  width: "100%",
  maxWidth: 720,
  maxHeight: "90%",
  backgroundColor: "#ffffff",
  borderRadius: 16,
  padding: 18,
  borderWidth: 1,
  borderColor: "#cbd5e1",
},

estimateHeader: {
  flexDirection: "row",
  alignItems: "flex-start",
  marginBottom: 14,
},

estimateTitle: {
  fontSize: 22,
  fontWeight: "bold",
  color: "#1f2937",
},

estimateSubtitle: {
  marginTop: 3,
  fontSize: 14,
  color: "#64748b",
},

estimateCloseButton: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: "#e5e7eb",
  justifyContent: "center",
  alignItems: "center",
  marginLeft: 10,
},

estimateCloseText: {
  fontSize: 18,
  color: "#374151",
  fontWeight: "bold",
},

estimateDescriptionBox: {
  backgroundColor: "#f8fafc",
  borderWidth: 1,
  borderColor: "#e2e8f0",
  borderRadius: 10,
  padding: 12,
  marginBottom: 12,
},

estimateSmallLabel: {
  fontSize: 12,
  fontWeight: "700",
  color: "#64748b",
  textTransform: "uppercase",
},

estimateDescription: {
  marginTop: 5,
  fontSize: 16,
  color: "#1f2937",
},

estimateEmptyBox: {
  paddingVertical: 36,
  paddingHorizontal: 16,
  alignItems: "center",
},

estimateLoadingText: {
  fontSize: 17,
  color: "#475569",
  fontWeight: "600",
},

estimateErrorText: {
  fontSize: 16,
  color: "#b91c1c",
  textAlign: "center",
},

estimateEmptyTitle: {
  fontSize: 18,
  color: "#1f2937",
  fontWeight: "bold",
  textAlign: "center",
},

estimateEmptyText: {
  marginTop: 8,
  fontSize: 15,
  color: "#64748b",
  textAlign: "center",
},

estimateConfidenceRow: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 10,
},

estimateConfidenceLabel: {
  fontSize: 14,
  color: "#475569",
  fontWeight: "600",
},

estimateConfidenceBadge: {
  overflow: "hidden",
  paddingHorizontal: 12,
  paddingVertical: 5,
  borderRadius: 999,
  fontSize: 13,
  fontWeight: "bold",
},

estimateConfidenceGood: {
  backgroundColor: "#dcfce7",
  color: "#166534",
},

estimateConfidenceMedium: {
  backgroundColor: "#fef3c7",
  color: "#92400e",
},

estimateConfidenceLow: {
  backgroundColor: "#fee2e2",
  color: "#991b1b",
},

estimateMainBox: {
  backgroundColor: "#eff6ff",
  borderWidth: 1,
  borderColor: "#93c5fd",
  borderRadius: 12,
  padding: 16,
  alignItems: "center",
  marginBottom: 12,
},

estimateMainPrice: {
  marginTop: 4,
  fontSize: 28,
  color: "#1d4ed8",
  fontWeight: "bold",
},

estimateCaseCount: {
  marginTop: 5,
  fontSize: 13,
  color: "#475569",
},

estimateStatsGrid: {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
  marginHorizontal: -4,
},

estimateStatBox: {
  width: "48%",
  backgroundColor: "#f8fafc",
  borderWidth: 1,
  borderColor: "#e2e8f0",
  borderRadius: 10,
  padding: 12,
  marginHorizontal: 4,
  marginBottom: 8,
},

estimateStatLabel: {
  fontSize: 13,
  color: "#64748b",
},

estimateStatValue: {
  marginTop: 3,
  fontSize: 20,
  color: "#111827",
  fontWeight: "bold",
},

similarCasesTitle: {
  fontSize: 18,
  fontWeight: "bold",
  color: "#1f2937",
  marginTop: 12,
  marginBottom: 8,
},

similarCaseCard: {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#f9fafb",
  borderWidth: 1,
  borderColor: "#e5e7eb",
  borderRadius: 10,
  padding: 11,
  marginBottom: 8,
},

similarCaseDevice: {
  fontSize: 15,
  color: "#111827",
  fontWeight: "700",
},

similarCaseDescription: {
  marginTop: 3,
  fontSize: 14,
  color: "#475569",
},

similarCaseClient: {
  marginTop: 4,
  fontSize: 12,
  color: "#94a3b8",
},

similarCaseRight: {
  alignItems: "flex-end",
  marginLeft: 12,
},

similarCasePrice: {
  fontSize: 19,
  color: "#047857",
  fontWeight: "bold",
},

similarCaseScore: {
  marginTop: 4,
  fontSize: 11,
  color: "#64748b",
},

estimateWarning: {
  marginTop: 12,
  padding: 10,
  backgroundColor: "#fff7ed",
  borderWidth: 1,
  borderColor: "#fed7aa",
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 17,
  color: "#9a3412",
  textAlign: "center",
},
repairCauseValue: {
  color: "#7c3aed",
  fontWeight: "700",
},

repairActionValue: {
  color: "#047857",
  fontWeight: "700",
},
});
