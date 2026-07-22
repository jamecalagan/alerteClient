import React from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export default function ImageSearchScreen({ route }) {
  const query = route?.params?.query || "";

  const url = query
    ? `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`
    : "https://www.google.com/imghp";
  return (
    <View style={styles.container}>
      <WebView source={{ uri: url }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
