import React from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import {
  INTAKE_FUNCTIONS,
  INTAKE_STATES,
  INTAKE_STATE_ORDER,
  INTAKE_PHYSICAL,
  normalizeIntake,
} from "../utils/intakeCheck";

// Bloc « État à la réception » de la fiche de prise en charge (AddInterventionPage, EditInterventionPage).
// value : objet intake_check (voir utils/intakeCheck.js) ; onChange(nouvelObjet).
// Toucher une fonction fait tourner son état : (vide) → OK → En panne → Non testable → (vide).
export default function IntakeCheck({ value, onChange }) {
  const v = normalizeIntake(value);
  const set = (patch) => onChange?.({ ...v, ...patch });

  const setPowersOn = (on) => {
    if (v.powers_on === on) return set({ powers_on: null });
    if (on === false) {
      // Ne s'allume pas : toutes les fonctions passent en « Non testable »
      const functions = {};
      INTAKE_FUNCTIONS.forEach((f) => {
        if (f.key !== "autre" || v.autre_label) functions[f.key] = "nt";
      });
      return set({ powers_on: false, functions });
    }
    return set({ powers_on: true });
  };

  const cycle = (key) => {
    const cur = v.functions[key] || null;
    const next = INTAKE_STATE_ORDER[(INTAKE_STATE_ORDER.indexOf(cur) + 1) % INTAKE_STATE_ORDER.length];
    const functions = { ...v.functions };
    if (next) functions[key] = next;
    else delete functions[key];
    set({ functions });
  };

  const togglePhysical = (key) =>
    set({
      physical: v.physical.includes(key) ? v.physical.filter((k) => k !== key) : [...v.physical, key],
    });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>État à la réception</Text>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.choice, v.powers_on === true && styles.choiceOn]}
          onPress={() => setPowersOn(true)}
        >
          <Text style={[styles.choiceText, v.powers_on === true && styles.choiceTextOn]}>
            L’appareil s’allume
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.choice, v.powers_on === false && styles.choiceOff]}
          onPress={() => setPowersOn(false)}
        >
          <Text style={[styles.choiceText, v.powers_on === false && styles.choiceTextOn]}>
            Ne s’allume pas
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>Touchez une fonction pour changer son état : OK, En panne, Non testable.</Text>
      <View style={styles.grid}>
        {INTAKE_FUNCTIONS.map((f) => {
          const st = v.functions[f.key];
          const s = st ? INTAKE_STATES[st] : null;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.fn, s && { backgroundColor: s.bg, borderColor: s.color }]}
              onPress={() => cycle(f.key)}
            >
              <Text style={styles.fnLabel} numberOfLines={1}>
                {f.label}
              </Text>
              <Text style={[styles.fnState, s && { color: s.color }]}>{s ? s.label : "—"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {v.functions.autre ? (
        <TextInput
          style={styles.input}
          value={v.autre_label}
          onChangeText={(t) => set({ autre_label: t })}
          placeholder="Préciser la fonction « Autre »"
          placeholderTextColor="#64748b"
        />
      ) : null}

      <Text style={styles.subtitle}>État physique</Text>
      <View style={styles.chips}>
        {INTAKE_PHYSICAL.map((p) => {
          const on = v.physical.includes(p.key);
          return (
            <TouchableOpacity
              key={p.key}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => togglePhysical(p.key)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {on ? "✓ " : ""}
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#f8fafc",
    marginVertical: 10,
  },
  title: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  subtitle: { fontSize: 14, fontWeight: "700", color: "#0f172a", marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 12, color: "#64748b", marginTop: 10, marginBottom: 6 },
  row: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  choiceOn: { backgroundColor: "#15803d", borderColor: "#15803d" },
  choiceOff: { backgroundColor: "#b91c1c", borderColor: "#b91c1c" },
  choiceText: { fontWeight: "700", color: "#334155" },
  choiceTextOn: { color: "#fff" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fn: {
    width: "48.5%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fnLabel: { flex: 1, color: "#0f172a", fontWeight: "600", marginRight: 6 },
  fnState: { color: "#94a3b8", fontWeight: "800", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
    backgroundColor: "#fff",
    color: "#0f172a",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: "#1e293b", borderColor: "#1e293b" },
  chipText: { color: "#334155", fontWeight: "600" },
  chipTextOn: { color: "#fff" },
});
