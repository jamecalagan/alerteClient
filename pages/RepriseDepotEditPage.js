import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Print from "expo-print";
import { WebView } from "react-native-webview";
import { supabase } from "../supabaseClient";
import AlertBox from "../components/AlertBox";
import BackButton from "../components/BackButton";
import SignaturePad from "../components/SignaturePad";
import CatalogFields from "../components/CatalogFields";
import { CONDITIONS, A5_PRINT_SIZE } from "../utils/reprise";
import {
  ITEM_STATUSES,
  formatDepotNumber,
  newDepotItem,
  describeItem,
  buildDepotHtml,
} from "../utils/repriseDepot";

function Chips({ options, value, onChange, small }) {
  return (
    <View style={styles.chipsRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const CONDITION_OPTIONS = CONDITIONS.map((c) => ({ value: c, label: c }));

export default function RepriseDepotEditPage({ route, navigation }) {
  const [depotId, setDepotId] = useState(route.params?.depotId || null);
  const [numero, setNumero] = useState(null);
  const [createdAt, setCreatedAt] = useState(null);
  const [loading, setLoading] = useState(!!route.params?.depotId);
  const [saving, setSaving] = useState(false);

  // Client
  const [clientId, setClientId] = useState(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [bannedInfo, setBannedInfo] = useState(null);

  // Appareils + remarques
  const [items, setItems] = useState([newDepotItem()]);
  const [notes, setNotes] = useState("");

  // Signatures
  const [depositSignature, setDepositSignature] = useState(null);
  const [depositSignedAt, setDepositSignedAt] = useState(null);
  const [returnSignature, setReturnSignature] = useState(null);
  const [returnedAt, setReturnedAt] = useState(null);
  const [isSigning, setIsSigning] = useState(false);

  // Alertes / confirmations / aperçu
  const [alert, setAlert] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [printPreviewHtml, setPrintPreviewHtml] = useState(null);
  const showAlert = (title, message) => setAlert({ title, message });

  // === Modifications non enregistrées ===
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const skipDirtyRef = useRef(true);
  const leavingRef = useRef(false);
  useEffect(() => {
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [clientName, clientPhone, clientEmail, items, notes, depositSignature, returnSignature]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (!hasUnsavedChanges || leavingRef.current) return;
      e.preventDefault();
      setConfirm({
        title: "Modifications non enregistrées",
        message:
          "Vous allez perdre les informations saisies sur ce bon de dépôt. Voulez-vous vraiment quitter ?",
        confirmText: "Quitter",
        onConfirm: () => {
          setHasUnsavedChanges(false);
          leavingRef.current = true;
          navigation.dispatch(e.data.action);
        },
      });
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  const applyRow = (data) => {
    skipDirtyRef.current = true;
    setDepotId(data.id);
    setNumero(data.numero);
    setCreatedAt(data.created_at);
    setClientId(data.client_id);
    setClientName(data.client_name || "");
    setClientPhone(data.client_phone || "");
    setClientEmail(data.client_email || "");
    setItems(Array.isArray(data.items) && data.items.length ? data.items : [newDepotItem()]);
    setNotes(data.notes || "");
    setDepositSignature(data.deposit_signature || null);
    setDepositSignedAt(data.deposit_signed_at || null);
    setReturnSignature(data.return_signature || null);
    setReturnedAt(data.returned_at || null);
    setTimeout(() => setHasUnsavedChanges(false), 0);
  };

  const loadDepot = async (id) => {
    const { data, error } = await supabase
      .from("reprise_depots")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    applyRow(data);
  };

  useEffect(() => {
    if (!route.params?.depotId) return;
    loadDepot(route.params.depotId)
      .catch((e) => {
        console.error("❌ Chargement dépôt :", e);
        showAlert("Erreur", "Impossible de charger le bon de dépôt.");
      })
      .finally(() => setLoading(false));
  }, [route.params?.depotId]);

  // Au retour d'une fiche de reprise créée depuis ce dépôt : relit le dépôt
  // pour afficher le lien vers la reprise (sauf modifications en cours).
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      if (depotId && !hasUnsavedChanges) {
        loadDepot(depotId).catch((e) => console.error("❌ Rechargement dépôt :", e));
      }
    }, [depotId, hasUnsavedChanges])
  );

  // === Client ===
  const searchClients = async (text) => {
    setClientName(text);
    setClientId(null);
    setBannedInfo(null);
    if (text.trim().length < 2) {
      setClientSuggestions([]);
      return;
    }
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, phone, email, ficheNumber, banned, ban_reason")
      .or(`name.ilike.%${text}%,phone.ilike.%${text}%`)
      .limit(8);
    if (!error) setClientSuggestions(data || []);
  };

  const selectClient = (c) => {
    setClientId(c.id);
    setClientName(c.name || "");
    setClientPhone(c.phone || "");
    setClientEmail(c.email || "");
    setClientSuggestions([]);
    setBannedInfo(c.banned ? c.ban_reason || "Client banni" : null);
  };

  // Client choisi, sinon client existant (même nom + téléphone), sinon création.
  const ensureClient = async () => {
    if (clientId) return clientId;
    const name = clientName.trim();
    const phone = clientPhone.trim();
    const { data: existing, error: findError } = await supabase
      .from("clients")
      .select("id")
      .eq("name", name)
      .eq("phone", phone)
      .limit(1);
    if (findError) throw findError;
    if (existing?.[0]?.id) return existing[0].id;

    const { data: last, error: lastError } = await supabase
      .from("clients")
      .select("ficheNumber")
      .order("ficheNumber", { ascending: false })
      .limit(1)
      .single();
    if (lastError && lastError.code !== "PGRST116") throw lastError;
    const nextFiche = last ? last.ficheNumber + 1 : 6001;

    const { data: created, error: createError } = await supabase
      .from("clients")
      .insert([
        {
          name,
          phone,
          email: clientEmail.trim() || null,
          ficheNumber: nextFiche,
          createdAt: new Date().toISOString(),
        },
      ])
      .select("id")
      .single();
    if (createError) throw createError;
    return created.id;
  };

  // === Appareils ===
  const updateItem = (key, patch) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const askRemoveItem = (it) => {
    if (it.reprise_id) {
      showAlert("Impossible", "Cet appareil a déjà une fiche de reprise : il ne peut pas être retiré.");
      return;
    }
    setConfirm({
      title: "Retirer cet appareil ?",
      message: `${describeItem(it)} sera retiré du bon de dépôt à l'enregistrement.`,
      confirmText: "Retirer",
      onConfirm: () => setItems((prev) => prev.filter((x) => x.key !== it.key)),
    });
  };

  const hasRefused = items.some((it) => it.status === "refuse");

  // === Enregistrement ===
  const validate = () => {
    const missing = [];
    if (!clientName.trim()) missing.push("Nom du client");
    if (!clientPhone.trim()) missing.push("Téléphone du client");
    const filled = items.filter((it) => (it.device_type || "").trim() || (it.model || "").trim());
    if (filled.length === 0) missing.push("Au moins un appareil (type ou modèle)");
    if (missing.length > 0) {
      showAlert("Champs manquants", missing.join("\n"));
      return false;
    }
    return true;
  };

  // Enregistre et renvoie la ligne à jour (null si échec).
  const saveDepot = async () => {
    if (saving || !validate()) return null;
    setSaving(true);
    try {
      const resolvedClientId = await ensureClient();
      const cleanItems = items
        .filter((it) => (it.device_type || "").trim() || (it.model || "").trim())
        .map((it) => ({
          ...it,
          device_type: (it.device_type || "").trim(),
          brand: (it.brand || "").trim(),
          model: (it.model || "").trim(),
          accessories: (it.accessories || "").trim(),
        }));

      const payload = {
        client_id: resolvedClientId,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        client_email: clientEmail.trim() || null,
        items: cleanItems,
        notes: notes.trim() || null,
        deposit_signature: depositSignature || null,
        deposit_signed_at: depositSignature ? depositSignedAt || new Date().toISOString() : null,
        return_signature: returnSignature || null,
        returned_at: returnSignature ? returnedAt || new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      const query = depotId
        ? supabase.from("reprise_depots").update(payload).eq("id", depotId)
        : supabase.from("reprise_depots").insert([payload]);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      applyRow(data);
      return data;
    } catch (e) {
      console.error("❌ Enregistrement dépôt :", e);
      showAlert("Erreur", "Impossible d'enregistrer le bon de dépôt. " + (e?.message || ""));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveAndBack = async () => {
    const row = await saveDepot();
    if (!row) return;
    leavingRef.current = true;
    navigation.navigate("RepriseDepotListPage");
  };

  const saveAndPreview = async () => {
    const row = await saveDepot();
    if (row) setPrintPreviewHtml(buildDepotHtml(row));
  };

  // Appareil accepté : enregistre le dépôt puis ouvre la fiche de reprise
  // pré-remplie (vendeur + matériel), liée à cet appareil.
  const createRepriseFor = async (it) => {
    const row = await saveDepot();
    if (!row) return;
    const saved = (row.items || []).find((x) => x.key === it.key);
    if (!saved) return;
    navigation.navigate("RepriseEditPage", {
      prefill: {
        client_id: row.client_id,
        seller_name: row.client_name,
        seller_phone: row.client_phone,
        seller_email: row.client_email,
        device_type: saved.device_type,
        brand: saved.brand,
        model: saved.model,
        condition: saved.condition,
        accessories: saved.accessories,
      },
      depotLink: { depotId: row.id, itemKey: saved.key },
    });
  };

  const askDelete = () => {
    setConfirm({
      title: "Supprimer le bon de dépôt ?",
      message: `Le bon ${formatDepotNumber(numero)} sera retiré de la liste des dépôts.`,
      confirmText: "Supprimer",
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from("reprise_depots")
            .update({ deleted: true, updated_at: new Date().toISOString() })
            .eq("id", depotId);
          if (error) throw error;
          leavingRef.current = true;
          navigation.goBack();
        } catch (e) {
          console.error("❌ Suppression dépôt :", e);
          showAlert("Erreur", "Impossible de supprimer le bon de dépôt.");
        }
      },
    });
  };

  if (loading) {
    return (
      <View style={[styles.screen, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#4338ca" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isSigning}
      >
        <Text style={styles.title}>📥 Dépôt pour test</Text>
        <Text style={styles.subtitle}>
          {depotId
            ? `${formatDepotNumber(numero)} — ${
                createdAt ? new Date(createdAt).toLocaleDateString("fr-FR") : ""
              }`
            : "Nouveau bon de dépôt"}
        </Text>

        {/* ===== Client ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Client</Text>
          <Text style={styles.label}>Nom (ou recherche d'un client existant) *</Text>
          <TextInput
            style={styles.input}
            value={clientName}
            onChangeText={searchClients}
            placeholder="Nom ou téléphone…"
            placeholderTextColor="#94a3b8"
          />
          {clientSuggestions.length > 0 && (
            <View style={styles.suggestions}>
              {clientSuggestions.map((c) => (
                <TouchableOpacity key={c.id} style={styles.suggestionItem} onPress={() => selectClient(c)}>
                  <Text style={styles.suggestionText}>
                    {c.name} — {c.phone} {c.ficheNumber ? `(fiche ${c.ficheNumber})` : ""}
                    {c.banned ? "  ⛔ BANNI" : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {clientId ? (
            <Text style={styles.linkedText}>✓ Lié à la fiche client existante</Text>
          ) : clientName.trim() ? (
            <Text style={styles.hintText}>Nouveau client : une fiche client sera créée à l'enregistrement.</Text>
          ) : null}
          {bannedInfo ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⛔ Client banni : {bannedInfo}</Text>
            </View>
          ) : null}
          <Text style={styles.label}>Téléphone *</Text>
          <TextInput style={styles.input} value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            value={clientEmail}
            onChangeText={setClientEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* ===== Appareils ===== */}
        {items.map((it, index) => (
          <View key={it.key} style={styles.card}>
            <View style={styles.itemHeader}>
              <Text style={styles.cardTitle}>Appareil {index + 1}</Text>
              {items.length > 1 ? (
                <TouchableOpacity onPress={() => askRemoveItem(it)}>
                  <Text style={styles.removeText}>Retirer</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <CatalogFields
              value={it}
              onChange={(patch) => updateItem(it.key, patch)}
              inputStyle={styles.input}
              labelStyle={styles.label}
            />
            <Text style={styles.label}>État au dépôt</Text>
            <Chips
              options={CONDITION_OPTIONS}
              value={it.condition}
              onChange={(v) => updateItem(it.key, { condition: it.condition === v ? "" : v })}
              small
            />
            <Text style={styles.label}>Accessoires laissés</Text>
            <TextInput
              style={styles.input}
              value={it.accessories}
              onChangeText={(t) => updateItem(it.key, { accessories: t })}
              placeholder="ex. chargeur, boîte, câble…"
              placeholderTextColor="#94a3b8"
            />

            {/* Résultat du test */}
            <Text style={styles.label}>Résultat du test</Text>
            <Chips
              options={ITEM_STATUSES}
              value={it.status || "en_test"}
              onChange={(v) => {
                if (it.reprise_id && v !== "accepte") {
                  showAlert("Impossible", "Cet appareil a déjà une fiche de reprise.");
                  return;
                }
                updateItem(it.key, { status: v, returned: v === "refuse" ? it.returned : false });
              }}
            />
            {it.status === "accepte" ? (
              it.reprise_id ? (
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => navigation.navigate("RepriseEditPage", { repriseId: it.reprise_id })}
                >
                  <Text style={styles.linkBtnText}>♻️ Voir la fiche de reprise</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.linkBtn, { backgroundColor: "#16a34a" }]}
                  onPress={() => createRepriseFor(it)}
                  disabled={saving}
                >
                  <Text style={[styles.linkBtnText, { color: "#fff" }]}>
                    ♻️ Créer la fiche de reprise
                  </Text>
                </TouchableOpacity>
              )
            ) : null}
            {it.status === "refuse" ? (
              <Text style={[styles.hintText, { color: it.returned ? "#15803d" : "#b45309" }]}>
                {it.returned ? "✓ Rendu au client" : "À rendre au client (signature en bas de page)"}
              </Text>
            ) : null}
          </View>
        ))}

        <TouchableOpacity style={styles.addItemBtn} onPress={() => setItems((prev) => [...prev, newDepotItem()])}>
          <Text style={styles.addItemText}>＋ Ajouter un appareil</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Remarques</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Informations utiles pour les tests…"
            placeholderTextColor="#94a3b8"
          />
        </View>

        {/* ===== Signature au dépôt ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Signature du client au dépôt</Text>
          {depositSignature ? (
            <View style={{ alignItems: "center" }}>
              <Image source={{ uri: depositSignature }} style={styles.signatureImage} />
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  setDepositSignature(null);
                  setDepositSignedAt(null);
                }}
              >
                <Text style={styles.secondaryBtnText}>Refaire la signature</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <SignaturePad
              onBegin={() => setIsSigning(true)}
              onEnd={() => setIsSigning(false)}
              onSigned={(sig) => {
                setDepositSignature(sig);
                setDepositSignedAt(new Date().toISOString());
              }}
              onEmpty={() => showAlert("Signature vide", "Faites signer le client dans le cadre avant de valider.")}
            />
          )}
        </View>

        {/* ===== Restitution du matériel refusé ===== */}
        {hasRefused ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Restitution du matériel refusé</Text>
            <Text style={styles.hintText}>
              {items
                .filter((it) => it.status === "refuse")
                .map((it) => `• ${describeItem(it)}`)
                .join("\n")}
            </Text>
            {returnSignature ? (
              <View style={{ alignItems: "center", marginTop: 8 }}>
                <Image source={{ uri: returnSignature }} style={styles.signatureImage} />
                <Text style={styles.linkedText}>
                  ✓ Récupéré{returnedAt ? ` le ${new Date(returnedAt).toLocaleDateString("fr-FR")}` : ""}
                </Text>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => {
                    setReturnSignature(null);
                    setReturnedAt(null);
                    setItems((prev) =>
                      prev.map((it) => (it.status === "refuse" ? { ...it, returned: false } : it))
                    );
                  }}
                >
                  <Text style={styles.secondaryBtnText}>Refaire la signature</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                <SignaturePad
                  onBegin={() => setIsSigning(true)}
                  onEnd={() => setIsSigning(false)}
                  onSigned={(sig) => {
                    setReturnSignature(sig);
                    setReturnedAt(new Date().toISOString());
                    setItems((prev) =>
                      prev.map((it) => (it.status === "refuse" ? { ...it, returned: true } : it))
                    );
                  }}
                  onEmpty={() =>
                    showAlert("Signature vide", "Faites signer le client dans le cadre avant de valider.")
                  }
                />
              </View>
            )}
          </View>
        ) : null}

        {/* ===== Actions ===== */}
        <TouchableOpacity
          style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          onPress={saveAndPreview}
          disabled={saving}
        >
          <Text style={styles.primaryBtnText}>
            {saving ? "Enregistrement…" : "🖨️ Enregistrer et aperçu avant impression"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: "#0d6efd" }, saving && { opacity: 0.6 }]}
          onPress={saveAndBack}
          disabled={saving}
        >
          <Text style={styles.primaryBtnText}>💾 Enregistrer</Text>
        </TouchableOpacity>
        {depotId ? (
          <TouchableOpacity style={styles.deleteBtn} onPress={askDelete}>
            <Text style={styles.deleteBtnText}>Supprimer le bon de dépôt</Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ alignItems: "center", marginTop: 8 }}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
      </ScrollView>

      {/* Aperçu avant impression */}
      <Modal visible={!!printPreviewHtml} animationType="slide" onRequestClose={() => setPrintPreviewHtml(null)}>
        <View style={styles.printPreviewScreen}>
          <Text style={styles.printPreviewTitle}>Aperçu — {formatDepotNumber(numero)}</Text>
          <WebView
            originWhitelist={["*"]}
            source={{ html: printPreviewHtml || "<html></html>" }}
            style={{ flex: 1, backgroundColor: "#fff" }}
          />
          <View style={styles.printPreviewActions}>
            <TouchableOpacity
              style={[styles.printPreviewBtn, { backgroundColor: "#e2e8f0" }]}
              onPress={() => setPrintPreviewHtml(null)}
            >
              <Text style={[styles.primaryBtnText, { color: "#334155" }]}>Fermer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printPreviewBtn, { backgroundColor: "#16a34a" }]}
              onPress={async () => {
                try {
                  await Print.printAsync({ html: printPreviewHtml, ...A5_PRINT_SIZE });
                } catch (e) {
                  console.error("❌ Impression dépôt :", e);
                  showAlert("Erreur", "Impossible de lancer l'impression.");
                }
              }}
            >
              <Text style={styles.primaryBtnText}>🖨️ Imprimer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AlertBox
        visible={!!alert}
        title={alert?.title || ""}
        message={alert?.message || ""}
        onClose={() => setAlert(null)}
      />
      <AlertBox
        visible={!!confirm}
        title={confirm?.title || ""}
        message={confirm?.message || ""}
        cancelText="Annuler"
        confirmText={confirm?.confirmText || "OK"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.onConfirm;
          setConfirm(null);
          action?.();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#eef2ff" },
  container: { padding: 16, paddingTop: (StatusBar.currentHeight || 0) + 12, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: "800", color: "#1e1b4b", textAlign: "center" },
  subtitle: { textAlign: "center", color: "#4338ca", fontWeight: "700", marginBottom: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e7ff",
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: "#312e81", marginBottom: 4 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  removeText: { color: "#dc2626", fontWeight: "700" },
  label: { fontWeight: "600", fontSize: 12, marginTop: 10, marginBottom: 4, color: "#4b5563" },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f8fafc",
    fontSize: 15,
    color: "#111827",
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  suggestions: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, marginTop: 4, backgroundColor: "#fff" },
  suggestionItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  suggestionText: { color: "#334155", fontSize: 14 },
  linkedText: { color: "#15803d", fontWeight: "700", marginTop: 6 },
  hintText: { color: "#64748b", fontSize: 13, marginTop: 6 },
  warningBox: { backgroundColor: "#fee2e2", borderColor: "#dc2626", borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8 },
  warningText: { color: "#b91c1c", fontWeight: "700" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "#fff",
  },
  chipSmall: { paddingVertical: 5, paddingHorizontal: 10 },
  chipActive: { backgroundColor: "#4338ca", borderColor: "#4338ca" },
  chipText: { color: "#3730a3", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  linkBtn: {
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "#e0e7ff",
  },
  linkBtnText: { color: "#3730a3", fontWeight: "800" },
  addItemBtn: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#6366f1",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  addItemText: { color: "#4338ca", fontWeight: "800", fontSize: 15 },
  signatureImage: {
    width: 280,
    height: 110,
    resizeMode: "contain",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  secondaryBtn: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#e0e7ff" },
  secondaryBtnText: { color: "#3730a3", fontWeight: "700" },
  primaryBtn: { backgroundColor: "#4338ca", borderRadius: 999, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  deleteBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  deleteBtnText: { color: "#dc2626", fontWeight: "700" },
  printPreviewScreen: { flex: 1, backgroundColor: "#eef2ff", paddingTop: (StatusBar.currentHeight || 0) + 8 },
  printPreviewTitle: { fontSize: 17, fontWeight: "800", color: "#1e1b4b", textAlign: "center", marginBottom: 8 },
  printPreviewActions: { flexDirection: "row", gap: 12, padding: 12 },
  printPreviewBtn: { flex: 1, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
});
