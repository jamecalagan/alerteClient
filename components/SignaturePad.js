import React, { useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import Signature from "react-native-signature-canvas";

// Cadre de signature avec boutons natifs "Effacer" / "Valider" (le pied de
// cadre du composant est masqué : il était coupé à l'affichage).
// onBegin/onEnd servent à bloquer le défilement de la page pendant la signature.
export default function SignaturePad({ onSigned, onEmpty, onBegin, onEnd, height = 240 }) {
  const sigRef = useRef(null);

  return (
    <View>
      <View style={[styles.canvas, { height }]}>
        <Signature
          ref={sigRef}
          onBegin={onBegin}
          onEnd={onEnd}
          onOK={(sig) =>
            onSigned?.(sig.startsWith("data:image") ? sig : `data:image/png;base64,${sig}`)
          }
          onEmpty={onEmpty}
          descriptionText=""
          webStyle={`
            .m-signature-pad { box-shadow: none; border: none; width: 100%; height: 100%; margin: 0; }
            .m-signature-pad--body { border: none; }
            .m-signature-pad--footer { display: none; margin: 0; }
            body, html { width: 100%; height: 100%; margin: 0; padding: 0; }
          `}
        />
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: "#e2e8f0" }]}
          onPress={() => sigRef.current?.clearSignature()}
        >
          <Text style={[styles.btnText, { color: "#334155" }]}>Effacer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: "#4338ca" }]}
          onPress={() => sigRef.current?.readSignature()}
        >
          <Text style={styles.btnText}>✓ Valider la signature</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
