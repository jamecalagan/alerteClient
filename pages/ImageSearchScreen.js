import React from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import BackButton from "../components/BackButton";

export default function ImageSearchScreen({ route, navigation }) {
  const query = route?.params?.query || "";

  const url = query
    ? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`
    : "https://www.google.com/imghp";
  return (
    <View style={styles.container}>
      <WebView source={{ uri: url }} />
      <BackButton onPress={() => navigation.goBack()} style={styles.backButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 12,
  },
});
