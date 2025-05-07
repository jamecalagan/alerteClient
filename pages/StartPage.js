import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

const pages = [
  { label: "🏠 Accueil", route: "HomePage", color: "#4e73df" },

  { label: "📋 Fiches express", route: "ExpressTypeSelectorPage", color: "#858796" },

  { label: "🔍 Recherche Clients", route: "SearchClientsPage", color: "#6f42c1" },
  { label: "🗑️ Nettoyage images", route: "ImageCleanup", color: "#d63384" },
  { label: "🧹 CleanUp Bucket", route: "CleanUpBucketPage", color: "#6610f2" },
  { label: "📥 Sauvegarde images", route: "ImageBackup", color: "#0dcaf0" },
  { label: "📤 Migration images", route: "MigrateOldImagesPage", color: "#198754" },
];

const StartPage = () => {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚀 Menu de démarrage</Text>
      <View style={styles.buttonWrapper}>
        {pages.map((page, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.button, { backgroundColor: page.color }]}
            onPress={() => navigation.navigate(page.route)}
          >
            <Text style={styles.buttonText}>{page.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f2f5",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  buttonWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    width: 280,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});

export default StartPage;
