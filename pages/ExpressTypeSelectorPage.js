import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import BackButton from "../components/BackButton";

const ExpressTypeSelectorPage = () => {
  const navigation = useNavigation();

  const topButtons = ["logiciel", "reparation", "video", "demande_devis", "devis", "pc"];

  const gridButtons = [
    { bg: "#4f46e5", text: "Liste des devis", route: "QuoteListPage" },
    { bg: "#0284c7", text: "Liste des commandes", route: "AllOrdersPage" },
    { bg: "#d97706", text: "Liste des demandes de devis", route: "QuoteRequestsListPage" },
    { bg: "#d97706", text: "Liste fiches express", route: "ExpressListPage" },

    { bg: "#059669", text: "Créer une facture", route: "BillingPage" },
    { bg: "#059669", text: "Liste des factures", route: "BillingListPage" },
    { bg: "#7c3aed", text: "Créer une affiche", route: "ProductFormScreen" },
    { bg: "#7c3aed", text: "Les affiches", route: "FlyerList" },
    { bg: "#7c3aed", text: "Créer une étiquette client", route: "QuickLabelPrintPage" },

    { bg: "#e11d48", text: "Liste fiches de contrôle", route: "CheckupListPage" },

    { bg: "#0d9488", text: "Messagerie SMS", action: () => Linking.openURL("sms:") },
    { bg: "#0d9488", text: "Liste des clients notifiés", route: "ClientNotificationsPage" },
  ];

  const buttonPropsByType = {
    logiciel: { icon: "🖥", label: "Logiciel", bg: "#e0e7ff", color: "#3730a3" },
    reparation: { icon: "🛠", label: "Réparation", bg: "#d1fae5", color: "#065f46" },
    video: { icon: "🎬", label: "Transfert vidéo", bg: "#fef3c7", color: "#92400e" },
    demande_devis: { icon: "📝", label: "Demande devis", bg: "#dbeafe", color: "#1e40af" },
    devis: { icon: "🧾", label: "Devis", bg: "#ede9fe", color: "#5b21b6" },
    pc: { icon: "🖥️", label: "Devis PC", bg: "#e2e8f0", color: "#334155" },
  };

  const goTo = (type) => {
    switch (type) {
      case "logiciel":
        navigation.navigate("ExpressSoftwarePage"); break;
      case "reparation":
        navigation.navigate("ExpressRepairPage"); break;
      case "video":
        navigation.navigate("ExpressVideoPage"); break;
      case "demande_devis":
        navigation.navigate("QuoteIntakePage"); break;
      case "devis":
        navigation.navigate("QuoteEditPage"); break;
      case "pc":
        navigation.navigate("QuoteEditPage", { preset: "pc" }); break;
      default: break;
    }
  };

  // Animations robustes (longueurs dynamiques)
  const topButtonAnimations = useRef(
    Array.from({ length: topButtons.length }, () => new Animated.Value(0))
  ).current;

  const gridAnimations = useRef(
    Array.from({ length: gridButtons.length }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    Animated.stagger(
      80,
      topButtonAnimations.map((anim, i) =>
        Animated.spring(anim, {
          toValue: 1,
          delay: i * 80,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [topButtonAnimations]);

  useEffect(() => {
    Animated.stagger(
      40,
      gridAnimations.map((anim, i) =>
        Animated.spring(anim, {
          toValue: 1,
          delay: i * 40,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [gridAnimations]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Créations Express</Text>
      <Text style={styles.subtitle}>Choisis un type de fiche à créer</Text>

      <View style={styles.creationRow}>
        {topButtons.map((type, index) => {
          const anim = topButtonAnimations[index];
          const props = buttonPropsByType[type];
          const translateY = anim
            ? anim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] })
            : 0;

          return (
            <Animated.View
              key={type}
              style={{ opacity: anim || 1, transform: [{ translateY }] }}
            >
              <TouchableOpacity
                style={[styles.squareButton, { backgroundColor: props.bg }]}
                onPress={() => goTo(type)}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonIcon}>{props.icon}</Text>
                <Text style={[styles.buttonLabel, { color: props.color }]}>
                  {props.label}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      <View style={styles.separator} />
      <Text style={styles.sectionTitle}>Autres outils</Text>

      <View style={styles.gridContainer}>
        {gridButtons.map((cfg, idx) => {
          const anim = gridAnimations[idx];
          const translateY = anim
            ? anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] })
            : 0;

          return (
            <Animated.View
              key={`${cfg.text}-${idx}`}
              style={[styles.gridItem, { opacity: anim || 1, transform: [{ translateY }] }]}
            >
              <TouchableOpacity
                style={[styles.optionButton, { borderLeftColor: cfg.bg }]}
                onPress={() => {
                  if (cfg.action) cfg.action();
                  else if (cfg.route) navigation.navigate(cfg.route);
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.optionDot, { backgroundColor: cfg.bg }]} />
                <Text style={styles.optionText}>{cfg.text}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      <View style={{ alignItems: "center", marginTop: 16, marginBottom: 24 }}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#eef2ff" },
  container: { flexGrow: 1, padding: 20, paddingTop: 32 },
  title: { fontSize: 24, fontWeight: "800", textAlign: "center", color: "#0f172a" },
  subtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    textAlign: "center",
    marginBottom: 12,
  },
  separator: { height: 1, backgroundColor: "#c7d2fe", marginTop: 16, marginBottom: 16 },
  creationRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    marginHorizontal: -8,
  },
  squareButton: {
    width: 96,
    height: 96,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
    marginVertical: 8,
    shadowColor: "#312e81",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  buttonIcon: { fontSize: 26, marginBottom: 6 },
  buttonLabel: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  optionButton: {
    width: 310,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderLeftWidth: 4,
    marginTop: 10,
    shadowColor: "#312e81",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  optionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  optionText: { fontSize: 15, color: "#1e293b", fontWeight: "600" },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 12,
    alignSelf: "center",
    width: "100%",
    marginHorizontal: -6,
  },
  gridItem: {
    width: "46%",
    marginBottom: 8,
    paddingHorizontal: 6,
    alignItems: "center",
  },
});

export default ExpressTypeSelectorPage;
