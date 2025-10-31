// pages/QuoteRequestsListPage.js
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useIsFocused } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const STORAGE_BUCKET = "quote-request-photos";
const QUOTES_PDF_BUCKET = "quotes-pdf";

/** Extrait le path Storage depuis une URL publique du bucket images */
const pathFromPublicUrl = (url) => {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/public\/quote-request-photos\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

/** Civilité traditionnelle */
const withCivilite = (name) => {
  const n = (name || "").trim();
  return n ? `M. ${n}` : "—";
};

/** Public URL pour un path Storage (PDF) */
const publicUrlFromStoragePath = (path) => {
  if (!path) return null;
  const { data } = supabase.storage.from(QUOTES_PDF_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
};

/** Récupère l’URL publique du PDF d’un devis */
const fetchQuotePdfPublicUrl = async (quoteId) => {
  if (!quoteId) return null;
  const { data, error } = await supabase
    .from("quotes")
    .select("pdf_url, pdf_storage_path")
    .eq("id", quoteId)
    .single();

  if (error) {
    console.log("⚠️ fetchQuotePdfPublicUrl:", error);
    return null;
  }

  if (data?.pdf_url && String(data.pdf_url).startsWith("http")) {
    return data.pdf_url;
  }
  if (data?.pdf_storage_path) {
    return publicUrlFromStoragePath(data.pdf_storage_path);
  }
  return null;
};

/** Message SMS (incluant lien PDF si fourni) */
const buildSmsBody = (req, pdfUrl) => {
  const who = req.client_name ? `Bonjour M. ${req.client_name},` : `Bonjour,`;
  const deviceParts = [req.device_type, req.brand, req.model].filter(Boolean).join(" ");
  const refTxt = req.quote_id ? ` (réf. devis ${req.quote_id})` : "";
  const base =
    `${who} votre devis${refTxt} est prêt chez AVENIR INFORMATIQUE` +
    `${deviceParts ? ` pour ${deviceParts}` : ""}. `;
  return pdfUrl
    ? `${base}Voici le lien : ${pdfUrl}\nMerci de nous répondre pour valider.`
    : `${base}Merci de nous répondre pour valider ou pour toute question.`;
};

export default function QuoteRequestsListPage({ navigation }) {
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("toutes"); // "toutes" | "nouvelle" | "préparée" | "convertie"
  const [deletingId, setDeletingId] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("quote_requests")
        .select(
          `id, created_at, status, source,
           client_name, phone, email,
           device_type, brand, model, serial,
           problem, condition, accessories, notes,
           photos_count, photos, quote_id,
           sms_notified_at, sms_notify_count, notified_by,
           sms_last_pdf_url`
        )
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (e) {
      console.log("❌ loadRequests:", e);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) loadRequests();
  }, [isFocused, loadRequests]);

  const filtered = requests.filter((r) => {
    const okStatus = statusFilter === "toutes" ? true : (r.status || "") === statusFilter;
    if (!okStatus) return false;

    const q = query.trim().toLowerCase();
    if (!q) return true;

    const hay = [
      r.client_name, r.phone, r.email,
      r.device_type, r.brand, r.model, r.serial,
      r.problem, r.status,
    ].filter(Boolean).join(" ").toLowerCase();

    return hay.includes(q);
  });

  /** Envoi / Renvoi du SMS + persist BDD (et inclusion du PDF si dispo) */
  const notifyBySMS = async (req) => {
    if (!req?.phone) {
      Alert.alert("Information manquante", "Aucun numéro de téléphone n’est renseigné.");
      return;
    }
    try {
      // Lien PDF si devis lié
      let pdfUrl = req.sms_last_pdf_url || null;
      if (!pdfUrl && req.quote_id) {
        pdfUrl = await fetchQuotePdfPublicUrl(req.quote_id);
      }

      const body = buildSmsBody(req, pdfUrl);
      const smsUrl = `sms:${encodeURIComponent(req.phone)}${body ? `?body=${encodeURIComponent(body)}` : ""}`;

      const can = await Linking.canOpenURL("sms:");
      if (can) {
        await Linking.openURL(smsUrl);
      } else {
        await Clipboard.setStringAsync(String(req.phone));
        Alert.alert("Numéro copié", "Le numéro a été copié. Ouverture de Messages Web…");
        await Linking.openURL("https://messages.google.com/web");
      }

      // Persist
      const now = new Date().toISOString();
      const newCount = (Number(req.sms_notify_count) || 0) + 1;

      const { error: updErr } = await supabase
        .from("quote_requests")
        .update({
          sms_notified_at: now,
          sms_notify_count: newCount,
          notified_by: "SMS",
          sms_last_pdf_url: pdfUrl || null,
        })
        .eq("id", req.id);

      if (updErr) {
        console.error("⚠️ update sms fields:", updErr);
        Alert.alert("Avertissement", "SMS envoyé, mais impossible d’enregistrer l’indication en base.");
      } else {
        await loadRequests();
      }
    } catch (e) {
      console.log("❌ notifyBySMS:", e);
      try { await Clipboard.setStringAsync(String(req.phone ?? "")); } catch {}
      Alert.alert(
        "Impossible d’ouvrir l’envoi SMS",
        "Le numéro a été copié dans le presse-papiers. Vous pouvez l’utiliser dans votre application de messagerie."
      );
    }
  };

  // Actions existantes
  const prepareQuote = async (req) => {
    try {
      if ((req.status || "") === "nouvelle") {
        await supabase.from("quote_requests").update({ status: "préparée" }).eq("id", req.id);
      }
    } catch (e) {
      console.log("⚠️ maj status préparée:", e);
    }

    navigation.navigate("QuoteEditPage", {
      presetFromIntake: {
        clientName: req.client_name,
        phone: req.phone,
        email: req.email,
        deviceType: req.device_type,
        brand: req.brand,
        model: req.model,
        serial: req.serial,
        problem: req.problem,
        condition: req.condition,
        accessories: req.accessories,
        notes: req.notes,
        quoteRequestId: req.id,
        createdAt: req.created_at,
        source: req.source,
      },
    });
  };

  const editExistingQuote = (req) => {
    if (!req.quote_id) return;
    navigation.navigate("QuoteEditPage", { id: req.quote_id });
  };

  const editRequest = (req) => {
    navigation.navigate("QuoteRequestEditPage", { id: req.id });
  };

  const deleteRequest = (req) => {
    const warning = req.quote_id
      ? "Cette demande est liée à un devis existant. Le devis NE sera pas supprimé.\n\nSupprimer quand même la demande ?"
      : "Supprimer définitivement cette demande de devis ?";
    Alert.alert("Supprimer la demande", warning, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => doDelete(req) },
    ]);
  };

  const doDelete = async (req) => {
    setDeletingId(req.id);
    try {
      // 1) supprimer les photos du bucket
      const urls = Array.isArray(req.photos) ? req.photos : [];
      const paths = urls.map(pathFromPublicUrl).filter(Boolean);
      if (paths.length > 0) {
        const { error: remErr } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
        if (remErr) console.log("⚠️ remove storage error:", remErr);
      }
      // 2) supprimer la ligne de la table
      const { error: delErr } = await supabase.from("quote_requests").delete().eq("id", req.id);
      if (delErr) {
        Alert.alert("Erreur", "Impossible de supprimer : " + delErr.message);
        return;
      }
      await loadRequests();
    } catch (e) {
      console.log("❌ doDelete:", e);
      Alert.alert("Erreur", "Une erreur est survenue pendant la suppression.");
    } finally {
      setDeletingId(null);
    }
  };

  /* ───────── UI ───────── */
  const RenderItem = ({ item }) => {
    const hasQuote = !!item.quote_id;
    const firstPhoto = Array.isArray(item.photos) && item.photos.length > 0 ? item.photos[0] : null;
    const showSmsZone = !item.email && !!item.phone; // zone dédiée au SMS
    const notifiedAt = item.sms_notified_at;         // champ persistant
    const count = Number(item.sms_notify_count) || 0;

    return (
      <View style={styles.card}>
        {/* En-tête */}
        <View style={styles.headerRow}>
          {firstPhoto ? (
            <Image source={{ uri: firstPhoto }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={{ color: "#9ca3af", fontSize: 11 }}>Aucune photo</Text>
            </View>
          )}

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.titleLine}>
              {withCivilite(item.client_name)} {item.phone ? `· ${item.phone}` : ""} {item.email ? `· ${item.email}` : ""}
            </Text>
            <Text style={styles.subLine}>
              {item.device_type || "—"} {item.brand ? `· ${item.brand}` : ""} {item.model ? `· ${item.model}` : ""}
              {item.serial ? ` · SN/IMEI: ${item.serial}` : ""}
            </Text>
            {item.problem ? <Text style={styles.problem}>Panne : {item.problem}</Text> : null}

            <View style={styles.metaRow}>
              <StatusPill status={item.status} />
              {typeof item.photos_count === "number" && item.photos_count > 0 && (
                <View style={[styles.pill, { backgroundColor: "#e5f3ff", borderColor: "#b6dcff" }]}>
                  <Text style={[styles.pillText, { color: "#0b6bcb" }]}>{item.photos_count} photo(s)</Text>
                </View>
              )}
              {item.quote_id && (
                <View style={[styles.pill, { backgroundColor: "#f3f4f6", borderColor: "#e5e7eb" }]}>
                  <Text style={[styles.pillText, { color: "#374151" }]}>Devis lié</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsGrid}>
          <TouchableOpacity style={[styles.gridBtn, styles.btnNeutral]} onPress={() => editRequest(item)}>
            <Text style={styles.gridBtnTextDark}>✏️ Modifier la demande</Text>
          </TouchableOpacity>

          {!hasQuote ? (
            <TouchableOpacity style={[styles.gridBtn, styles.btnPrimary]} onPress={() => prepareQuote(item)}>
              <Text style={styles.gridBtnText}>🧾 Préparer le devis</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.gridBtn, styles.btnSecondary]} onPress={() => editExistingQuote(item)}>
              <Text style={styles.gridBtnText}>✏️ Modifier le devis</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.gridBtn, styles.btnLight]}
            onPress={() => navigation.navigate("QuoteRequestDetailsPage", { id: item.id })}
          >
            <Text style={styles.gridBtnTextLight}>Détails</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.gridBtn, styles.btnDanger, deletingId === item.id && { opacity: 0.6 }]}
            onPress={() => deleteRequest(item)}
            disabled={deletingId === item.id}
          >
            <Text style={styles.gridBtnText}>{deletingId === item.id ? "Suppression..." : "🗑️ Supprimer"}</Text>
          </TouchableOpacity>

          {/* 📲 Zone SMS : bouton initial OU indication + renvoi (persistants) */}
          {showSmsZone && !notifiedAt && (
            <TouchableOpacity style={[styles.gridBtn, styles.btnSms]} onPress={() => notifyBySMS(item)}>
              <Text style={styles.gridBtnText}>📲 Notifier par SMS</Text>
            </TouchableOpacity>
          )}

          {showSmsZone && notifiedAt && (
            <View style={[styles.gridBtn, styles.smsInfoWrap]}>
              <View style={styles.smsInfoLeft}>
                <Text style={styles.smsInfoTitle}>📨 SMS notifié</Text>
                <Text style={styles.smsInfoSub}>
                  {new Date(notifiedAt).toLocaleString()} · {count} envoi{count > 1 ? "s" : ""} · {item.notified_by || "—"}
                </Text>
                {item.quote_id ? <Text style={styles.smsInfoSub}>📎 Lien PDF inclus (si disponible)</Text> : null}
              </View>
              <TouchableOpacity style={styles.btnSmsGhost} onPress={() => notifyBySMS(item)}>
                <Text style={styles.btnSmsGhostText}>↻ Renotifier</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      {/* Filtres */}
      <View style={styles.segment}>
        {["toutes", "nouvelle", "préparée", "convertie"].map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => setStatusFilter(k)}
            style={[styles.segBtn, statusFilter === k && styles.segBtnActive]}
          >
            <Text style={{ color: statusFilter === k ? "#fff" : "#374151", fontWeight: "700", textTransform: "capitalize" }}>
              {k}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recherche */}
      <TextInput
        style={styles.search}
        placeholder="Recherche (nom, téléphone, appareil, statut…)"
        value={query}
        onChangeText={setQuery}
      />

      {/* Liste */}
      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={RenderItem}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ color: "#6b7280" }}>Aucune demande.</Text>
            </View>
          }
          onRefresh={loadRequests}
          refreshing={loading}
        />
      )}
    </View>
  );
}

/* ───────── Composants auxiliaires ───────── */

function StatusPill({ status }) {
  const map = {
    nouvelle: { bg: "#eff6ff", brd: "#dbeafe", fg: "#1d4ed8", label: "Nouvelle" },
    préparée: { bg: "#fff7ed", brd: "#ffedd5", fg: "#c2410c", label: "Préparée" },
    convertie: { bg: "#ecfdf5", brd: "#d1fae5", fg: "#065f46", label: "Convertie" },
  };
  const s = map[status] || { bg: "#f3f4f6", brd: "#e5e7eb", fg: "#374151", label: status || "—" };
  return (
    <View style={[styles.pill, { backgroundColor: s.bg, borderColor: s.brd }]}>
      <Text style={[styles.pillText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

/* ───────── Styles ───────── */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff", padding: 12 },
  segment: { flexDirection: "row", gap: 6, marginBottom: 10 },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
  },
  segBtnActive: { backgroundColor: "#6b4e16" },
  search: {
    backgroundColor: "#fff",
    borderColor: "#d1d5db",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },

  card: {
    backgroundColor: "#f7f7f7",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 12,
  },

  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  thumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: "#e5e7eb" },
  thumbPlaceholder: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },

  titleLine: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  subLine: { fontSize: 13, color: "#374151", marginTop: 2 },
  problem: { fontSize: 12, color: "#6b7280", marginTop: 4 },

  metaRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  pill: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: { fontSize: 12, fontWeight: "700" },

  actionsRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  btn: { flexGrow: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  btnPrimary: { backgroundColor: "#6b4e16" },
  btnSecondary: { backgroundColor: "#0b6bcb" },
  btnNeutral: { backgroundColor: "#04f892" },
  btnLight: { backgroundColor: "#e5e7eb" },
  btnDanger: { backgroundColor: "#b91c1c" },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  btnTextDark: { color: "#111827", fontSize: 14, fontWeight: "800" },
  btnTextLight: { color: "#1f2937", fontSize: 14, fontWeight: "800" },

  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 12,
  },
  gridBtn: {
    width: "48%",
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  gridBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  gridBtnTextLight: { color: "#1f2937", fontSize: 14, fontWeight: "800" },
  gridBtnTextDark: { color: "#111827", fontSize: 14, fontWeight: "800" },

  // SMS
  btnSms: { backgroundColor: "#2563eb" },

  // Indicateurs
  smsInfoWrap: {
    width: "100%",
    height: 56,
    borderRadius: 10,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    justifyContent: "space-between",
  },
  smsInfoLeft: { flexDirection: "column" },
  smsInfoTitle: { color: "#065f46", fontWeight: "800", fontSize: 14 },
  smsInfoSub: { color: "#047857", fontWeight: "600", fontSize: 12 },

  pillDanger: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },

  // Petit bouton pour renvoyer
  btnSmsGhost: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#34d399",
    backgroundColor: "#ffffff",
  },
  btnSmsGhostText: { color: "#065f46", fontWeight: "800", fontSize: 12 },
});
