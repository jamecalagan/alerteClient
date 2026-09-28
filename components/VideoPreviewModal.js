import React from "react";
import { Modal, View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

// Lecteur vidéo plein écran réutilisable — utilisé pour visualiser les
// vidéos de dépôt/restitution importées depuis la vidéosurveillance
// (preuve en cas de litige avec un client).
export default function VideoPreviewModal({ visible, uri, onClose }) {
  const player = useVideoPlayer(visible ? uri : null, (p) => {
    p.play();
  });

  if (!visible || !uri) return null;

  return (
    <Modal visible={visible} transparent onRequestClose={onClose}>
      <View style={styles.background}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <VideoView
          style={styles.video}
          player={player}
          allowsFullscreen
          allowsPictureInPicture
          nativeControls
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
  },
  video: {
    width: "95%",
    height: "70%",
  },
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  closeBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
