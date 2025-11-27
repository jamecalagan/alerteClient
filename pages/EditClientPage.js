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
          is_estimate, estimate_min, estimate_max, estimate_type, estimate_accepted
        )
      `
      )
      .eq("id", client.id);

    if (error) {
      showAlert("Erreur", "Erreur lors du chargement du client");
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

  const getStatusStyle = (status) => {
    switch (status) {
      case "En attente de pièces":
        return { borderColor: "#270381", borderWidth: 2 };
      case "Devis accepté":
        return { borderColor: "#FFD700", borderWidth: 2 };
      case "Réparation en cours":
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
      case "Réparation en cours":
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
                          'Êtes-vous sûr de vouloir passer le statut à "Réparation en cours" ?',
                          async () => {
                            try {
                              const { error } = await supabase
                                .from("interventions")
                                .update({ status: "Réparation en cours" })
                                .eq("id", item.id);
                              if (error) return;

                              const updatedInterventions = interventions.map(
                                (intervention) =>
                                  intervention.id === item.id
                                    ? {
                                        ...intervention,
                                        status: "Réparation en cours",
                                      }
                                    : intervention
                              );
                              setInterventions(updatedInterventions);
                              showAlert(
                                "Succès",
                                'Statut mis à jour à "Réparation en cours".'
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
});
