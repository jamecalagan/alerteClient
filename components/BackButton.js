import React from "react";
import { TouchableOpacity, Text, Image, StyleSheet } from "react-native";

// Bouton "Retour" unifié, réutilisé sur toutes les pages à la place des
// styles disparates (tailles/couleurs différentes) qui existaient avant.
export default function BackButton({ onPress, label = "Retour", style }) {
  return (
    <TouchableOpacity
      style={[styles.backButton, style]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Image
        source={require("../assets/icons/chevrong.png")}
        style={styles.backIcon}
      />
      <Text style={styles.backButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    backgroundColor: "#334155",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  backIcon: {
    width: 16,
    height: 16,
    marginRight: 8,
    tintColor: "#ffffff",
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
