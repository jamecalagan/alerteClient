import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

const ExpressTypeSelectorPage = () => {
  const navigation = useNavigation();

  const topButtons = ["logiciel", "reparation", "video", "demande_devis", "devis", "pc"];

  const gridButtons = [
    { bg: "#555", text: "Voir toutes les commandes", route: "AllOrdersPage" },
    { bg: "#0b7285", text: "Liste des devis", route: "QuoteListPage" },
    { bg: "#166534", text: "Créer une facture", route: "BillingPage" },
    { bg: "#4338ca", text: "Liste des factures", route: "BillingListPage" },
    { bg: "#690759", text: "Créer une affiche", route: "ProductFormScreen" },
    { bg: "#34568B", text: "Liste des affiches", route: "FlyerList" },
    { bg: "#f3ae54", text: "Fiches express enregistrées", route: "ExpressListPage" },
    { bg: "#f84903", text: "Créer une étiquette client", route: "QuickLabelPrintPage" },
    { bg: "#129b00", text: "Clients notifiés", route: "ClientNotificationsPage" },
    { bg: "#2b8a3e", text: "Messagerie SMS", action: () => Linking.openURL("sms:") },
    { bg: "#7f0883", text: "Fiches de contrôle", route: "CheckupListPage" },
	{ bg: "#6b4e16", text: "Liste des demandes de devis", route: "QuoteRequestsListPage" },
  ];

  const buttonPropsByType = {
    logiciel: { icon: "🖥", label: "Dépannage", color: "#1b2a41" },
    reparation: { icon: "🛠", label: "Réparation", color: "#14532d" },
    video: { icon: "🎬", label: "Transfert vidéo", color: "#7a5c00" },
    demande_devis: { icon: "📝", label: "Demande devis", color: "#6b4e16" },
    devis: { icon: "🧾", label: "Devis", color: "#351f32" },
    pc: { icon: "🖥️", label: "Devis PC", color: "#0f172a" },
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
    <View style={styles.container}>
      <Text style={styles.title}>Créations rapides</Text>

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
                style={[styles.squareButton, { backgroundColor: props.color }]}
                onPress={() => goTo(type)}
              >
                <Text style={styles.buttonIcon}>{props.icon}</Text>
                <Text style={styles.buttonLabel}>{props.label}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      <View style={styles.separator} />

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
                style={[styles.optionButton, styles.shadowBox, { backgroundColor: cfg.bg }]}
                onPress={() => {
                  if (cfg.action) cfg.action();
                  else if (cfg.route) navigation.navigate(cfg.route);
                }}
              >
                <Text style={styles.optionText}>{cfg.text}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      <View style={{ alignItems: "center", marginTop: 16 }}>
        <TouchableOpacity
          style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#6b7280", width: "60%" }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>⬅ Retour</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#ffffff" },
  title: { fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 18, color: "#0f172a" },
  separator: { height: 2, backgroundColor: "#d1d5db", marginVertical: 16, borderRadius: 5 },
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
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
    marginVertical: 8,
  },
  buttonIcon: { fontSize: 26, marginBottom: 6 },
  buttonLabel: { fontSize: 12, fontWeight: "bold", color: "white", textAlign: "center" },
  optionButton: {
    width: 310,
    paddingVertical: 14,
    backgroundColor: "#3e4c69",
    borderRadius: 50,
    alignItems: "center",
    marginTop: 16,
  },
  optionText: { fontSize: 16, color: "#ffffff", fontWeight: "600" },
  shadowBox: {
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
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
    marginTop: 8,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});

export default ExpressTypeSelectorPage;
