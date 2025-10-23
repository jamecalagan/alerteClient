// components/BanToggleButton.js
import React from "react";
import { Alert, TouchableOpacity, Text } from "react-native";
import { supabase } from "../supabaseClient";

export default function BanToggleButton({ client, onToggled }) {
  const toggleBan = async () => {
    try {
      if (!client?.id) return;

      if (client.banned) {
        const { error } = await supabase
          .rpc("set_client_ban", { p_client_id: client.id, p_banned: false });
        if (error) throw error;
        Alert.alert("OK", "Client débanni.");
      } else {
        const reason = "Mauvaise foi récurrente / refus conditions de service";
        const { error } = await supabase
          .rpc("set_client_ban", { p_client_id: client.id, p_banned: true, p_reason: reason });
        if (error) throw error;
        Alert.alert("OK", "Client banni.");
      }

      // préviens le parent pour rafraîchir l’écran / recharger le client
      onToggled && onToggled();
    } catch (e) {
      console.error(e);
      Alert.alert("Erreur", "Impossible de mettre à jour l’état banni.");
    }
  };

  return (
    <TouchableOpacity
      onPress={toggleBan}
      style={{
        backgroundColor: client?.banned ? "#7f1d1d" : "#0f766e",
        padding: 12,
        borderRadius: 10,
        alignSelf: "flex-start",
      }}
      activeOpacity={0.8}
    >
      <Text style={{ color: "white", fontWeight: "700" }}>
        {client?.banned ? "Débannir le client" : "Bannir le client"}
      </Text>
    </TouchableOpacity>
  );
}
