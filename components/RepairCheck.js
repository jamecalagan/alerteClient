import React from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import { INTAKE_FUNCTIONS, INTAKE_STATES, normalizeIntake } from "../utils/intakeCheck";
import {
  REPAIR_STATES,
  REPAIR_STATE_ORDER,
  normalizeRepairCheck,
  repairQuoteLines,
  repairQuoteTotal,
  repairQuotePending,
} from "../utils/repairCheck";

// Bloc « Test après réparation » de la fiche de prise en charge (EditInterventionPage :
// fenêtre « Réparation terminée » et fiche de l'intervention au statut « Réparé »).
// value : objet repair_check (utils/repairCheck.js) ; onChange(nouvelObjet).
// intake (facultatif) : état au dépôt, rappelé sous chaque fonction (ex. « dépôt : Non testable »).
// Devis accepté : onCreateOrder(lignesPièces) ouvre la commande pré-remplie ;
// onAddToCost(lignes, montant) ajoute réparations sans pièce + main-d'œuvre au montant de l'intervention.
export default function RepairCheck({ value, onChange, intake, onCreateOrder, onAddToCost }) {
  const v = normalizeRepairCheck(value);
  const depot = normalizeIntake(intake);
  const set = (patch) => onChange?.({ ...v, ...patch });

  const cycle = (key) => {
    const cur = v.functions[key] || null;
    const next = REPAIR_STATE_ORDER[(REPAIR_STATE_ORDER.indexOf(cur) + 1) % REPAIR_STATE_ORDER.length];
    const functions = { ...v.functions };
    if (next) functions[key] = next;
    else delete functions[key];
    set({ functions });
  };

  const toutOk = () => {
    const functions = {};
    INTAKE_FUNCTIONS.forEach((f) => {
      if (f.key !== "autre" || depot.functions.autre) functions[f.key] = "ok";
    });
    set({ functions });
  };

  const defauts =
    !!v.other_defects.trim() || Object.values(v.functions).some((s) => s === "panne");
  // Lignes du devis : fonctions « En panne » + autres défauts, avec leur prix
  const lignesDevis = repairQuoteLines(v, depot);
  const totalDevis = repairQuoteTotal(v, depot);
  const reste = repairQuotePending(v, depot);
  const eur = (n) => Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const num = (t) => t.replace(/[^0-9.,]/g, "");

  const fmt = (iso) => {
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } catch {
      return "";
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Test après réparation</Text>
        <TouchableOpacity style={styles.allOk} onPress={toutOk}>
          <Text style={styles.allOkText}>Tout OK</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>Touchez une fonction : OK, En panne.</Text>

      <View style={styles.grid}>
        {INTAKE_FUNCTIONS.map((f) => {
          const st = v.functions[f.key];
          const s = st ? REPAIR_STATES[st] : null;
          const d = depot.functions[f.key];
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.fn, s && { backgroundColor: s.bg, borderColor: s.color }]}
              onPress={() => cycle(f.key)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.fnLabel} numberOfLines={1}>
                  {f.key === "autre" && depot.autre_label ? `Autre : ${depot.autre_label}` : f.label}
                </Text>
                {d ? (
                  <Text style={styles.fnDepot}>dépôt : {INTAKE_STATES[d].label}</Text>
                ) : null}
              </View>
              <Text style={[styles.fnState, s && { color: s.color }]}>{s ? s.label : "—"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.subtitle}>Autres défauts constatés</Text>
      <TextInput
        style={styles.input}
        value={v.other_defects}
        onChangeText={(t) => set({ other_defects: t })}
        placeholder="Ex : clavier ne répond plus, Wi-Fi ne se connecte pas…"
        placeholderTextColor="#64748b"
        multiline
      />

      {defauts ? (
        <View style={styles.notify}>
          <Text style={styles.subtitle}>Client prévenu</Text>
          {v.client_notified_at ? (
            <Text style={styles.notified}>
              Prévenu le {fmt(v.client_notified_at)}
              {v.notify_method ? ` par ${v.notify_method === "sms" ? "SMS" : "appel"}` : ""}
            </Text>
          ) : (
            <Text style={styles.notNotified}>Pas encore prévenu</Text>
          )}
          <View style={styles.row}>
            {[
              { key: "sms", label: "Prévenu par SMS" },
              { key: "appel", label: "Prévenu par appel" },
            ].map((m) => {
              const on = v.notify_method === m.key && !!v.client_notified_at;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.choice, on && styles.choiceOn]}
                  onPress={() =>
                    on
                      ? set({ notify_method: null, client_notified_at: null })
                      : set({ notify_method: m.key, client_notified_at: new Date().toISOString() })
                  }
                >
                  <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.subtitle}>Devis complémentaire</Text>
          <Text style={styles.hintQuote}>
            Reprend les fonctions « En panne » et les autres défauts : indiquez le prix à donner au client.
          </Text>
          {lignesDevis.map((l) => (
            <View key={l.key} style={styles.quoteLine}>
              <View style={styles.quoteRow}>
                <Text style={styles.quoteLabel} numberOfLines={2}>
                  {l.label}
                </Text>
                <TextInput
                  style={styles.quoteInput}
                  value={l.price}
                  onChangeText={(t) => set({ quote_prices: { ...v.quote_prices, [l.key]: num(t) } })}
                  placeholder={l.type === "piece" ? "Pièce" : "Prix"}
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.euro}>€</Text>
              </View>
              <View style={styles.typeRow}>
                {[
                  { key: "piece", label: "Pièce à commander" },
                  { key: "repair", label: "Réparation sans pièce" },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.typeChip, l.type === t.key && styles.typeChipOn]}
                    onPress={() => set({ quote_types: { ...v.quote_types, [l.key]: t.key } })}
                  >
                    <Text style={[styles.typeChipText, l.type === t.key && styles.typeChipTextOn]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                {l.type === "piece" ? (
                  <View style={styles.laborBox}>
                    <Text style={styles.laborLabel}>+ pose</Text>
                    <TextInput
                      style={styles.laborInput}
                      value={l.labor}
                      onChangeText={(t) => set({ quote_labor: { ...v.quote_labor, [l.key]: num(t) } })}
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      keyboardType="decimal-pad"
                    />
                    <Text style={styles.euro}>€</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
          {lignesDevis.length > 1 || lignesDevis.some((l) => l.laborValue) ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total du devis complémentaire</Text>
              <Text style={styles.totalValue}>
                {totalDevis.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </Text>
            </View>
          ) : null}
          <View style={[styles.row, { marginTop: 8 }]}>
            {[
              { val: null, label: "En attente" },
              { val: true, label: "Accepté" },
              { val: false, label: "Refusé" },
            ].map((a) => {
              const on = v.quote_accepted === a.val;
              return (
                <TouchableOpacity
                  key={String(a.val)}
                  style={[
                    styles.choice,
                    on && (a.val === false ? styles.choiceOff : a.val === true ? styles.choiceOn : styles.choiceWait),
                  ]}
                  onPress={() => set({ quote_accepted: a.val })}
                >
                  <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{a.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {v.quote_accepted === false ? (
            <Text style={styles.reminder}>
              Devis refusé : la réparation de la panne initiale reste due (clause signée au dépôt).
            </Text>
          ) : null}

          {/* Devis accepté : commander les pièces et ajouter le reste au montant de l'intervention */}
          {v.quote_accepted === true ? (
            <View style={styles.accepted}>
              {v.order_done ? (
                <Text style={styles.doneText}>
                  ✓ Pièces commandées le {fmt(v.order_done.at)}
                </Text>
              ) : null}
              {v.cost_added ? (
                <Text style={styles.doneText}>
                  ✓ {eur(v.cost_added.amount)} ajouté au montant le {fmt(v.cost_added.at)}
                </Text>
              ) : null}
              {reste.pieces.length ? (
                <TouchableOpacity style={styles.actionBtn} onPress={() => onCreateOrder?.(reste.pieces)}>
                  <Text style={styles.actionBtnText}>
                    Créer la commande ({reste.pieces.length} pièce{reste.pieces.length > 1 ? "s" : ""},{" "}
                    {eur(reste.pieces.reduce((s, l) => s + (l.value || 0), 0))})
                  </Text>
                </TouchableOpacity>
              ) : null}
              {reste.amount > 0 ? (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: "#0f766e" }]}
                  onPress={() => onAddToCost?.(reste.toCost, reste.amount)}
                >
                  <Text style={styles.actionBtnText}>
                    Ajouter {eur(reste.amount)} au montant de l’intervention
                  </Text>
                </TouchableOpacity>
              ) : null}
              {!reste.labels.length && (v.order_done || v.cost_added) ? (
                <Text style={styles.doneText}>Devis complémentaire entièrement traité.</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
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
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  subtitle: { fontSize: 14, fontWeight: "700", color: "#0f172a", marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 12, color: "#64748b", marginTop: 6, marginBottom: 6 },
  allOk: { backgroundColor: "#15803d", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  allOkText: { color: "#fff", fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fn: {
    width: "48.5%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
  },
  fnLabel: { color: "#0f172a", fontWeight: "600" },
  fnDepot: { color: "#64748b", fontSize: 11 },
  fnState: { color: "#94a3b8", fontWeight: "800", fontSize: 12, marginLeft: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
    color: "#0f172a",
  },
  notify: { borderTopWidth: 1, borderTopColor: "#e2e8f0", marginTop: 12 },
  notified: { color: "#15803d", fontWeight: "700", marginBottom: 6 },
  notNotified: { color: "#b91c1c", fontWeight: "700", marginBottom: 6 },
  row: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  choiceOn: { backgroundColor: "#15803d", borderColor: "#15803d" },
  choiceOff: { backgroundColor: "#b91c1c", borderColor: "#b91c1c" },
  choiceWait: { backgroundColor: "#475569", borderColor: "#475569" },
  choiceText: { fontWeight: "700", color: "#334155", fontSize: 13 },
  choiceTextOn: { color: "#fff" },
  reminder: { marginTop: 8, color: "#b91c1c", fontWeight: "700" },
  hintQuote: { fontSize: 12, color: "#64748b", marginBottom: 6 },
  quoteLine: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  quoteRow: { flexDirection: "row", alignItems: "center" },
  typeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 },
  typeChip: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  typeChipOn: { backgroundColor: "#1e293b", borderColor: "#1e293b" },
  typeChipText: { fontSize: 12, fontWeight: "600", color: "#334155" },
  typeChipTextOn: { color: "#fff" },
  laborBox: { flexDirection: "row", alignItems: "center", marginLeft: "auto" },
  laborLabel: { fontSize: 12, color: "#334155", fontWeight: "600", marginRight: 6 },
  laborInput: {
    width: 64,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    textAlign: "right",
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  accepted: { marginTop: 10, gap: 8 },
  doneText: { color: "#15803d", fontWeight: "700" },
  actionBtn: { backgroundColor: "#4338ca", borderRadius: 999, paddingVertical: 11, alignItems: "center" },
  actionBtnText: { color: "#fff", fontWeight: "800" },
  quoteLabel: { flex: 1, color: "#0f172a", fontWeight: "600", marginRight: 8 },
  quoteInput: {
    width: 90,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: "right",
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  euro: { marginLeft: 6, fontWeight: "700", color: "#0f172a" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingHorizontal: 10,
  },
  totalLabel: { fontWeight: "700", color: "#0f172a" },
  totalValue: { fontWeight: "800", color: "#b91c1c", fontSize: 16 },
});
