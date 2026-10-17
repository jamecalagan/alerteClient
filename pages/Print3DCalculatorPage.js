import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { MaterialIcons } from "@expo/vector-icons";
import BackButton from "../components/BackButton";
import AlertBox from "../components/AlertBox";

// Calculateur de prix — impression 3D (Bambu Lab P2S, modélisation Fusion 360).
// Outil de comptoir uniquement : rien n'est enregistré en base. Les tarifs sont réglables
// dans l'écran (section « Réglages des tarifs ») et gardés sur la tablette (AsyncStorage).
// Tarifs de départ proposés le 17/10/2026, à affiner.

const STORAGE_KEY = "calc3d_reglages_v1";

const REGLAGES_DEFAUT = {
  modelSimple: "15", // forfait modélisation pièce simple (cache, entretoise, pied)
  modelMoyenne: "35", // forfait pièce moyenne (clip de charnière, trappe, boîtier)
  modelHeure: "45", // tarif horaire modélisation pièce complexe
  machineHeure: "2", // € par heure d'impression (usure, électricité, échecs)
  multiplicateur: "2.5", // coefficient appliqué au prix de revient de la matière
  finition: "5", // forfait finition / essai (supports, ponçage, ajustement)
  minimum: "12", // minimum par commande
  // Prix de revient de la matière, € par gramme
  PLA: "0.025",
  PETG: "0.025",
  ABS: "0.03",
  ASA: "0.035",
  TPU: "0.045",
  "PA / PC": "0.07",
  "Chargé carbone": "0.09",
};

const MATIERES = ["PLA", "PETG", "ABS", "ASA", "TPU", "PA / PC", "Chargé carbone"];

const TYPES = [
  { key: "fichier", label: "Fichier fourni par le client" },
  { key: "simple", label: "Pièce simple" },
  { key: "moyenne", label: "Pièce moyenne" },
  { key: "complexe", label: "Pièce complexe (à l'heure)" },
];

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const eur = (n) => Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const clean = (t) => t.replace(/[^0-9.,]/g, "");

function Chip({ label, on, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Champ({ label, value, onChange, suffix, width = 90, placeholder = "0" }) {
  return (
    <View style={styles.champ}>
      <Text style={styles.champLabel}>{label}</Text>
      <View style={styles.champRow}>
        <TextInput
          style={[styles.input, { width }]}
          value={value}
          onChangeText={(t) => onChange(clean(t))}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export default function Print3DCalculatorPage({ navigation }) {
  const [reglages, setReglages] = useState(REGLAGES_DEFAUT);
  const [voirReglages, setVoirReglages] = useState(false);
  const [alerte, setAlerte] = useState(null);

  // Saisie de la pièce
  const [designation, setDesignation] = useState("");
  const [type, setType] = useState("moyenne");
  const [heuresModel, setHeuresModel] = useState("");
  const [modeleExistant, setModeleExistant] = useState(false);
  const [heures, setHeures] = useState("");
  const [minutes, setMinutes] = useState("");
  const [poids, setPoids] = useState("");
  const [matiere, setMatiere] = useState("PETG");
  const [quantite, setQuantite] = useState("1");
  const [finition, setFinition] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setReglages({ ...REGLAGES_DEFAUT, ...JSON.parse(raw) });
      })
      .catch(() => {});
  }, []);

  const majReglage = (cle, valeur) => {
    const suivant = { ...reglages, [cle]: valeur };
    setReglages(suivant);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(suivant)).catch(() => {});
  };

  const calcul = useMemo(() => {
    const qte = Math.max(1, Math.floor(num(quantite)) || 1);
    const dureeH = num(heures) + num(minutes) / 60; // par pièce
    let modelisation = 0;
    if (!modeleExistant) {
      if (type === "simple") modelisation = num(reglages.modelSimple);
      else if (type === "moyenne") modelisation = num(reglages.modelMoyenne);
      else if (type === "complexe") modelisation = num(heuresModel) * num(reglages.modelHeure);
    }
    const impression = dureeH * qte * num(reglages.machineHeure);
    const matiereCout = num(poids) * qte * num(reglages[matiere]) * num(reglages.multiplicateur);
    const finitionCout = finition ? num(reglages.finition) : 0;
    const sousTotal = modelisation + impression + matiereCout + finitionCout;
    const minimum = num(reglages.minimum);
    const total = Math.ceil(Math.max(sousTotal, minimum)); // arrondi à l'euro supérieur
    return {
      qte,
      dureeH,
      modelisation,
      impression,
      matiereCout,
      finitionCout,
      sousTotal,
      minimumApplique: sousTotal < minimum,
      total,
      parPiece: total / qte,
    };
  }, [reglages, type, heuresModel, modeleExistant, heures, minutes, poids, matiere, quantite, finition]);

  const dureeTexte = () => {
    const h = Math.floor(calcul.dureeH);
    const m = Math.round((calcul.dureeH - h) * 60);
    return `${h} h ${String(m).padStart(2, "0")}`;
  };

  const copierDevis = async () => {
    const texte =
      `Devis impression 3D${designation ? ` : ${designation}` : ""}\n` +
      `${calcul.qte > 1 ? `Quantité : ${calcul.qte}\n` : ""}` +
      `Matière : ${matiere}\n` +
      `Prix : ${eur(calcul.total)} TTC${calcul.qte > 1 ? ` (${eur(calcul.parPiece)} la pièce)` : ""}\n` +
      `Avenir Informatique — 01 41 60 18 18`;
    await Clipboard.setStringAsync(texte);
    setAlerte({ titre: "Copié", message: "Le devis est copié : collez-le dans un SMS ou une fiche." });
  };

  const reinitialiser = () => {
    setDesignation("");
    setHeuresModel("");
    setModeleExistant(false);
    setHeures("");
    setMinutes("");
    setPoids("");
    setQuantite("1");
    setFinition(true);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <MaterialIcons name="view-in-ar" size={26} color="#4338ca" />
            <Text style={styles.title}>Calculateur impression 3D</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>La pièce</Text>
            <TextInput
              style={[styles.input, { width: "100%" }]}
              value={designation}
              onChangeText={setDesignation}
              placeholder="Désignation (ex : clip de charnière HP 15)"
              placeholderTextColor="#94a3b8"
            />

            <Text style={styles.sub}>Modélisation</Text>
            <View style={styles.chips}>
              {TYPES.map((t) => (
                <Chip key={t.key} label={t.label} on={type === t.key} onPress={() => setType(t.key)} />
              ))}
            </View>
            {type === "complexe" ? (
              <Champ label="Temps de modélisation" value={heuresModel} onChange={setHeuresModel} suffix="h" />
            ) : null}
            {type !== "fichier" ? (
              <View style={styles.switchRow}>
                <Switch value={modeleExistant} onValueChange={setModeleExistant} />
                <Text style={styles.switchText}>Modèle déjà fait (pièce déjà modélisée) : pas de modélisation facturée</Text>
              </View>
            ) : null}

            <Text style={styles.sub}>Impression (Bambu Studio)</Text>
            <View style={styles.row}>
              <Champ label="Durée par pièce" value={heures} onChange={setHeures} suffix="h" width={70} />
              <Champ label=" " value={minutes} onChange={setMinutes} suffix="min" width={70} />
              <Champ label="Poids par pièce" value={poids} onChange={setPoids} suffix="g" width={80} />
              <Champ label="Quantité" value={quantite} onChange={setQuantite} width={60} placeholder="1" />
            </View>

            <Text style={styles.sub}>Matière</Text>
            <View style={styles.chips}>
              {MATIERES.map((m) => (
                <Chip key={m} label={m} on={matiere === m} onPress={() => setMatiere(m)} />
              ))}
            </View>

            <View style={styles.switchRow}>
              <Switch value={finition} onValueChange={setFinition} />
              <Text style={styles.switchText}>Finition et essai (supports, ponçage, ajustement)</Text>
            </View>
          </View>

          <View style={[styles.card, styles.result]}>
            <Text style={styles.section}>Prix</Text>
            <Ligne label={modeleExistant ? "Modélisation (modèle déjà fait)" : "Modélisation"} valeur={calcul.modelisation} />
            <Ligne
              label={`Impression (${dureeTexte()}${calcul.qte > 1 ? ` × ${calcul.qte}` : ""})`}
              valeur={calcul.impression}
            />
            <Ligne label={`Matière (${matiere})`} valeur={calcul.matiereCout} />
            {finition ? <Ligne label="Finition et essai" valeur={calcul.finitionCout} /> : null}
            {calcul.minimumApplique ? (
              <Text style={styles.minimum}>Minimum de commande appliqué : {eur(num(reglages.minimum))}</Text>
            ) : null}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>À annoncer au client</Text>
              <Text style={styles.totalValue}>{eur(calcul.total)}</Text>
            </View>
            {calcul.qte > 1 ? (
              <Text style={styles.parPiece}>soit {eur(calcul.parPiece)} la pièce</Text>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.btn} onPress={copierDevis}>
                <MaterialIcons name="content-copy" size={18} color="#fff" />
                <Text style={styles.btnText}>Copier le devis</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnGris]} onPress={reinitialiser}>
                <MaterialIcons name="refresh" size={18} color="#334155" />
                <Text style={[styles.btnText, { color: "#334155" }]}>Nouvelle pièce</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.reglagesHead} onPress={() => setVoirReglages((v) => !v)}>
            <MaterialIcons name={voirReglages ? "expand-less" : "expand-more"} size={22} color="#334155" />
            <Text style={styles.reglagesTitle}>Réglages des tarifs</Text>
          </TouchableOpacity>
          {voirReglages ? (
            <View style={styles.card}>
              <Text style={styles.sub}>Modélisation</Text>
              <View style={styles.row}>
                <Champ label="Pièce simple" value={reglages.modelSimple} onChange={(v) => majReglage("modelSimple", v)} suffix="€" />
                <Champ label="Pièce moyenne" value={reglages.modelMoyenne} onChange={(v) => majReglage("modelMoyenne", v)} suffix="€" />
                <Champ label="Complexe" value={reglages.modelHeure} onChange={(v) => majReglage("modelHeure", v)} suffix="€/h" />
              </View>
              <Text style={styles.sub}>Impression et commande</Text>
              <View style={styles.row}>
                <Champ label="Machine" value={reglages.machineHeure} onChange={(v) => majReglage("machineHeure", v)} suffix="€/h" />
                <Champ label="Finition" value={reglages.finition} onChange={(v) => majReglage("finition", v)} suffix="€" />
                <Champ label="Minimum" value={reglages.minimum} onChange={(v) => majReglage("minimum", v)} suffix="€" />
                <Champ label="Coef. matière" value={reglages.multiplicateur} onChange={(v) => majReglage("multiplicateur", v)} suffix="×" />
              </View>
              <Text style={styles.sub}>Prix de revient de la matière (€ par gramme)</Text>
              <View style={styles.row}>
                {MATIERES.map((m) => (
                  <Champ key={m} label={m} value={reglages[m]} onChange={(v) => majReglage(m, v)} suffix="€/g" width={70} />
                ))}
              </View>
              <TouchableOpacity
                style={[styles.btn, styles.btnGris, { marginTop: 10 }]}
                onPress={() => {
                  setReglages(REGLAGES_DEFAUT);
                  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
                }}
              >
                <Text style={[styles.btnText, { color: "#334155" }]}>Revenir aux tarifs de départ</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <BackButton onPress={() => navigation.goBack()} />
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertBox
        visible={!!alerte}
        title={alerte?.titre || ""}
        message={alerte?.message || ""}
        onClose={() => setAlerte(null)}
      />
    </SafeAreaView>
  );
}

function Ligne({ label, valeur }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneLabel}>{label}</Text>
      <Text style={styles.ligneValeur}>{eur(valeur)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f1f5f9" },
  container: { padding: 16, paddingBottom: 60, maxWidth: 900, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginBottom: 12,
  },
  result: { borderColor: "#c7d2fe" },
  section: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 8 },
  sub: { fontSize: 14, fontWeight: "700", color: "#334155", marginTop: 12, marginBottom: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: "#4338ca", borderColor: "#4338ca" },
  chipText: { color: "#334155", fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  champ: { marginTop: 4 },
  champLabel: { fontSize: 12, color: "#64748b", marginBottom: 3 },
  champRow: { flexDirection: "row", alignItems: "center" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    color: "#0f172a",
  },
  suffix: { marginLeft: 6, color: "#334155", fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  switchText: { flex: 1, color: "#334155" },
  ligne: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  ligneLabel: { color: "#334155", flex: 1, marginRight: 8 },
  ligneValeur: { color: "#0f172a", fontWeight: "600" },
  minimum: { color: "#b45309", fontWeight: "700", marginTop: 4 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    marginTop: 8,
    paddingTop: 10,
  },
  totalLabel: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  totalValue: { fontSize: 26, fontWeight: "900", color: "#4338ca" },
  parPiece: { textAlign: "right", color: "#64748b" },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#4338ca",
    borderRadius: 999,
    paddingVertical: 11,
  },
  btnGris: { backgroundColor: "#e2e8f0" },
  btnText: { color: "#fff", fontWeight: "800" },
  reglagesHead: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  reglagesTitle: { fontSize: 15, fontWeight: "700", color: "#334155" },
});
