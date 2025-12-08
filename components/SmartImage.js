// SmartImage.js  (version avec gestion d’erreur)
import React, { useEffect, useState } from "react";
import { Image, View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import * as FileSystem from 'expo-file-system/legacy';


const fileExists = async (uri) => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
};

export default function SmartImage({
  uri,
  size = 60,
  borderRadius = 8,
  borderWidth = 1,
  borderColor = "#49f760",
  style,
  onPress,
  ficheNumber = null,
  interventionId = null,
  index = 0,
  type = "photo",
  badge = true,
}) {
  const [sourceUri, setSourceUri] = useState(uri);   // l’URI réellement utilisée
  const [checked, setChecked]   = useState(false);   // vérif terminée ?
  const [hasError, setHasError] = useState(false);   // image KO ?

  /* ---------- 1) Tentative de copie locale ---------- */
  useEffect(() => {
    const tryLocal = async () => {
      if (!ficheNumber || !interventionId || !uri?.startsWith("http")) {
        setChecked(true);
        return;
      }

      const fileName =
        type === "label"
          ? `etiquette_${interventionId}.jpg`
          : `photo_${interventionId}_${index + 1}.jpg`;

      const candidates = [
        `${FileSystem.documentDirectory}backup/${ficheNumber}/${fileName}`,
        `${FileSystem.documentDirectory}Save picture alerte client/${ficheNumber}/${fileName}`,
      ];

      for (const localPath of candidates) {
        if (await fileExists(localPath)) {
          setSourceUri(localPath);
          break;
        }
      }
      setChecked(true);
    };
    tryLocal();
  }, [uri, ficheNumber, interventionId]);

  /* ---------- 2) Loader pendant la recherche ---------- */
  if (!checked) {
    return (
      <View style={[
          styles.loader,
          { width: size, height: size, borderRadius }]}
      >
        <ActivityIndicator />
      </View>
    );
  }

  /* ---------- 3) Contenu à afficher ---------- */
  const isCloud = sourceUri?.startsWith("http");

  const imageNode = hasError ? (
    // Remplacement par l’icône « cassée »
    <Image
      source={require("../assets/icons/broken-image.png")}
      style={[
        {
          width: size,
          height: size,
          borderRadius,
          borderWidth,
          borderColor: "#cc0000",
          backgroundColor: "#eee",
        },
        style,
      ]}
      resizeMode="contain"
    />
  ) : (
    <Image
      source={{ uri: sourceUri }}
      onError={() => setHasError(true)}
      style={[
        {
          width: size,
          height: size,
          borderRadius,
          borderWidth,
          borderColor,
        },
        style,
      ]}
    />
  );

  const badgeNode =
    badge && !hasError ? (
      <Text
        style={[
          styles.badge,
          {
            backgroundColor: isCloud
              ? "rgba(217,83,79,0.9)"   // rouge → cloud
              : "rgba(92,184,92,0.9)",  // vert  → local
          },
        ]}
      >
        {isCloud ? "Cloud" : "Local"}
      </Text>
    ) : null;

  const content = (
    <View style={{ position: "relative" }}>
      {imageNode}
      {badgeNode}
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    bottom: 3,
    right: 4,
    color: "#fff",
    fontSize: 10,
    paddingHorizontal: 4,
    borderRadius: 3,
    overflow: "hidden",
  },
  loader: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ddd",
  },
});
