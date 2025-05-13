import React from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export default function ImageSearchScreen() {
  return (
    <View style={styles.container}>
      <WebView source={{ uri: "https://www.google.com/imghp" }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
