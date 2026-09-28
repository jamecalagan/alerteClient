import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

// API Adresse officielle (Base Adresse Nationale, hébergée par l'IGN via la
// Géoplateforme) : gratuite, sans clé. L'ancien domaine
// api-adresse.data.gouv.fr est arrêté depuis janvier 2026.
const GEOCODING_URL = "https://data.geopf.fr/geocodage/search/";

// Champ adresse avec autocomplétion + code postal + ville. Choisir une
// suggestion remplit les trois champs ; la saisie manuelle reste possible
// (adresse hors France, connexion absente, adresse introuvable).
export default function AddressAutocomplete({
  address,
  postalCode,
  city,
  onChangeAddress,
  onChangePostalCode,
  onChangeCity,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [focused, setFocused] = useState(null);
  const timerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleAddressChange = (text) => {
    onChangeAddress(text);
    clearTimeout(timerRef.current);

    if (text.trim().length < 3) {
      requestIdRef.current += 1;
      setSuggestions([]);
      return;
    }

    timerRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      try {
        const response = await fetch(
          `${GEOCODING_URL}?q=${encodeURIComponent(text.trim())}&autocomplete=1&limit=5`
        );
        if (!response.ok) return;
        const json = await response.json();
        if (requestId !== requestIdRef.current) return; // réponse périmée
        setSuggestions(
          (json.features || [])
            .map((feature) => feature.properties)
            .filter((props) => props && props.name)
        );
      } catch {
        // hors ligne / API indisponible : la saisie manuelle reste possible
      }
    }, 300);
  };

  const selectSuggestion = (props) => {
    clearTimeout(timerRef.current);
    requestIdRef.current += 1;
    onChangeAddress(props.name || "");
    onChangePostalCode(props.postcode || "");
    onChangeCity(props.city || "");
    setSuggestions([]);
  };

  return (
    <View>
      <View style={[styles.inputContainer, focused === "address" && styles.inputFocused]}>
        <MaterialIcons name="place" size={20} color="#6366f1" style={styles.icon} />
        <TextInput
          style={styles.input}
          placeholder="Adresse (optionnel)"
          placeholderTextColor="#94a3b8"
          value={address}
          onChangeText={handleAddressChange}
          onFocus={() => setFocused("address")}
          onBlur={() => setFocused(null)}
        />
      </View>

      {suggestions.length > 0 && (
        <View style={styles.suggestionsBox}>
          {suggestions.map((props, index) => (
            <TouchableOpacity
              key={`${props.id || props.label}-${index}`}
              style={[
                styles.suggestionRow,
                index === suggestions.length - 1 && styles.suggestionRowLast,
              ]}
              activeOpacity={0.7}
              onPress={() => selectSuggestion(props)}
            >
              <Text style={styles.suggestionText} numberOfLines={1}>
                {props.label || props.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.row}>
        <View
          style={[
            styles.inputContainer,
            styles.postalContainer,
            focused === "postal" && styles.inputFocused,
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder="Code postal"
            placeholderTextColor="#94a3b8"
            value={postalCode}
            onChangeText={(text) => onChangePostalCode(text.replace(/\D/g, "").slice(0, 5))}
            keyboardType="number-pad"
            onFocus={() => setFocused("postal")}
            onBlur={() => setFocused(null)}
          />
        </View>
        <View
          style={[
            styles.inputContainer,
            styles.cityContainer,
            focused === "city" && styles.inputFocused,
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder="Ville"
            placeholderTextColor="#94a3b8"
            value={city}
            onChangeText={onChangeCity}
            onFocus={() => setFocused("city")}
            onBlur={() => setFocused(null)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#c7d2fe",
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    marginBottom: 14,
    height: 50,
  },
  inputFocused: {
    borderColor: "#4f46e5",
    backgroundColor: "#ffffff",
  },
  icon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: "#0f172a", paddingVertical: 8 },

  suggestionsBox: {
    marginTop: -8,
    marginBottom: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: "#c7d2fe",
    borderRadius: 14,
    overflow: "hidden",
  },
  suggestionRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e7ff",
  },
  suggestionRowLast: { borderBottomWidth: 0 },
  suggestionText: { fontSize: 14, color: "#312e81", fontWeight: "600" },

  row: { flexDirection: "row", gap: 10 },
  postalContainer: { width: 130 },
  cityContainer: { flex: 1 },
});
