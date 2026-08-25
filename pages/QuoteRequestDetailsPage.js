import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";
import * as Print from "expo-print";
import * as MailComposer from "expo-mail-composer";
import * as FileSystem from 'expo-file-system/legacy';
import CustomAlert from "../components/CustomAlert";
import BackButton from "../components/BackButton";

import * as Sharing from "expo-sharing";

const W = Dimensions.get("window").width;

// Identité société
const COMPANY = {
  name: "AVENIR INFORMATIQUE",
  address: "16, place de l'Hôtel de Ville, 93700 Drancy",
  phone: "01 41 60 18 18",
  siret: "422 240 457 00016",
  rcs: "Bobigny B422 240 457",
  vat: "N/Id CEE FR32422240457",
  logo: "https://www.avenir-informatique.fr/logo.webp",
};

export default function QuoteRequestDetailsPage() {
  const route = useRoute();
  const navigation = useNavigation();
  const id = route.params?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [req, setReq] = useState(null);
  const [error, setError] = useState(null);

  // Logo fallback si le .webp ne s'affiche pas
  const [logoBroken, setLogoBroken] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  // Choix "avec/sans miniatures"
  const [pickModeState, setPickModeState] = useState({
    visible: false,
    title: "",
    onChoice: null,
  });

  // Visionneuse photo
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);

  const load = async () => {
    if (!id) {
      setError("Identifiant de demande manquant.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("quote_requests")
        .select(
          `id, created_at, status, source,
           client_name, phone, email,
           device_type, brand, model, serial,
           problem, condition, accessories, notes,
           photos_count, photos, quote_id`
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      setReq(data);
    } catch (e) {
      setError(e?.message || "Impossible de charger la demande.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const openViewer = (index) => { setViewerIdx(index); setViewerOpen(true); };
  const prevPhoto = () => setViewerIdx((i) => Math.max(0, i - 1));
  const nextPhoto = () => setViewerIdx((i) => Math.min((req?.photos?.length || 1) - 1, i + 1));

  const editRequest = () => { if (req) navigation.navigate("QuoteRequestEditPage", { id: req.id }); };

  const prepareQuote = async () => {
    if (!req) return;
    try {
      if ((req.status || "") === "nouvelle") {
        await supabase.from("quote_requests").update({ status: "préparée" }).eq("id", req.id);
      }
    } catch (e) { console.log("⚠️ maj status préparée:", e); }
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

  const editExistingQuote = () => {
    if (!req?.quote_id) {
      showAlert("Aucun devis lié", "Cette demande n’est pas encore convertie.");
      return;
    }
    navigation.navigate("QuoteEditPage", { id: req.quote_id });
  };

  /* ───────────── PDF A5 / MAIL / IMPRESSION — charte classique ───────────── */

  const formatDateTime = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("fr-FR", {
        day: "2-digit", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    } catch { return iso || "—"; }
  };

  const escapeHtml = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /** includePhotos = false (sans) | true (miniatures limitées à 3) */
  const buildPdfHtml = (r, includePhotos) => {
    const photos = Array.isArray(r.photos) ? r.photos : [];
    const mini = includePhotos ? photos.slice(0, 3) : [];

    const photosHtml = mini.length
      ? `
      <div class="section">
        <strong>Photos (${r.photos_count || photos.length})</strong><br/>
        <div class="photos">
          ${mini.map((u) => `<div class="ph"><img src="${u}" /></div>`).join("")}
        </div>
      </div>`
      : "";

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>Demande de devis - ${escapeHtml(r.client_name || "")}</title>
<style>
  @page { size: A5; margin: 10mm; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, sans-serif; font-size: 10px; padding: 15px; max-width: 595px; margin: auto; }
  h2 { text-align: center; margin-bottom: 10px; }
  .header-logo { text-align: center; margin-bottom: 10px; }
  .header-logo img { height: 40px; }
  .section { margin-bottom: 12px; border: 1px solid #ccc; padding: 8px; border-radius: 6px; background: #f7f7f7; }
  .lbl { font-weight: 700; }
  .line { margin: 3px 0; }
  .meta { color: #555; margin-bottom: 6px; text-align: center; }
  .photos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .ph { width: 31%; }
  .ph img { width: 50%; height: auto; border: 1px solid #ccc; border-radius: 4px; }
  .footer { margin-top: 20px; background: #f0f0f0; padding: 8px; font-size: 8px; text-align: center; color: #555; }
</style>
</head>
<body>

  <div class="header-logo">
    <img src="${COMPANY.logo}" alt="Logo" />
  </div>
  <h2>Demande de devis — Prise d’informations</h2>

  <div class="meta">
    Créée le ${formatDateTime(r.created_at)} · Statut : <strong>${escapeHtml(r.status || "—")}</strong>
    ${r.source ? `· Source : ${escapeHtml(r.source)}` : ""}
  </div>

  <div class="section">
    <div class="line"><span class="lbl">Client :</span> ${escapeHtml(r.client_name || "—")}</div>
    <div class="line"><span class="lbl">Téléphone :</span> ${escapeHtml(r.phone || "—")}</div>
    <div class="line"><span class="lbl">E-mail :</span> ${escapeHtml(r.email || "—")}</div>
  </div>

  <div class="section">
    <div class="line"><span class="lbl">Type :</span> ${escapeHtml(r.device_type || "—")}</div>
    <div class="line"><span class="lbl">Marque :</span> ${escapeHtml(r.brand || "—")}</div>
    <div class="line"><span class="lbl">Modèle :</span> ${escapeHtml(r.model || "—")}</div>
    <div class="line"><span class="lbl">N° Série / IMEI :</span> ${escapeHtml(r.serial || "—")}</div>
  </div>

  <div class="section">
    <div class="line"><span class="lbl">Panne constatée :</span><br/>${escapeHtml(r.problem || "—")}</div>
    <div class="line"><span class="lbl">État général :</span><br/>${escapeHtml(r.condition || "—")}</div>
    <div class="line"><span class="lbl">Accessoires fournis :</span> ${escapeHtml(r.accessories || "—")}</div>
    <div class="line"><span class="lbl">Remarques :</span><br/>${escapeHtml(r.notes || "—")}</div>
  </div>

  ${photosHtml}

  <div class="footer">
    <p><strong>${COMPANY.name}</strong> - ${COMPANY.address}</p>
    <p>Tél : ${COMPANY.phone} - SIRET : ${COMPANY.siret}</p>
    <p>R.C.S : ${COMPANY.rcs} - ${COMPANY.vat}</p>
  </div>

</body>
</html>`;
  };

  const generatePdfFile = async (includePhotos) => {
    if (!req) return null;
    const html = buildPdfHtml(req, includePhotos);
    const { uri } = await Print.printToFileAsync({ html });
    const safeName = (req.client_name || "Client").replace(/[^\w-]+/g, "_");
    const fileName = `Demande_Devis_A5_${safeName}_${req.id}.pdf`;
    const dest = `${FileSystem.documentDirectory}${fileName}`;
    try { await FileSystem.copyAsync({ from: uri, to: dest }); return dest; }
    catch { return uri; }
  };

  const pickMode = (title, onChoice) => {
    setPickModeState({ visible: true, title, onChoice });
  };

  const emailPdfPickMode = () => pickMode("PDF A5 – Envoi par e-mail", emailPdf);
  const printPdfPickMode = () => pickMode("PDF A5 – Impression", printPdf);
  const savePdfPickMode = () => pickMode("PDF A5 – Partager/Enregistrer", savePdfAndShare);

  const emailPdf = async (includePhotos) => {
    try {
      const fileUri = await generatePdfFile(includePhotos);
      if (!fileUri) return;
      const available = await MailComposer.isAvailableAsync();
      const subject = `Demande de devis – ${req?.client_name || ""}`;
      const body = `Bonjour,\n\nVeuillez trouver ci-joint la prise d'informations concernant votre demande de devis.\n\nCordialement,\n${COMPANY.name}`;
      if (available) {
        await MailComposer.composeAsync({
          recipients: req?.email ? [req.email] : [],
          subject,
          body,
          attachments: [fileUri],
        });
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: "application/pdf", dialogTitle: subject });
      } else {
        showAlert("Indisponible", "Aucun client mail ou partage disponible sur cet appareil.");
      }
    } catch (e) {
      console.log("emailPdf error:", e);
      showAlert("Erreur", "Impossible de préparer l’e-mail.");
    }
  };

  const printPdf = async (includePhotos) => {
    try {
      const html = buildPdfHtml(req, includePhotos);
      await Print.printAsync({ html });
    } catch (e) {
      console.log("printPdf error:", e);
      showAlert("Erreur", "Impression impossible.");
    }
  };

  const savePdfAndShare = async (includePhotos) => {
    try {
      const fileUri = await generatePdfFile(includePhotos);
      if (!fileUri) return;
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: "application/pdf", dialogTitle: "Partager / Enregistrer" });
      } else {
        showAlert("Partage indisponible", `PDF enregistré : ${fileUri}`);
      }
    } catch (e) {
      console.log("share error:", e);
      showAlert("Erreur", "Partage impossible.");
    }
  };

  /* ───────────── RENDU ───────────── */

  if (!id) {
    return (
      <View style={styles.center}>
        <Text style={{ marginBottom: 12, textAlign: "center" }}>Identifiant de demande manquant.</Text>
        <BackButton onPress={() => navigation.goBack()} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 8 }}>Chargement…</Text>
      </View>
    );
  }

  if (error || !req) {
    return (
      <View style={styles.center}>
        <Text style={{ marginBottom: 12, textAlign: "center" }}>{error || "Demande introuvable."}</Text>
        <TouchableOpacity style={[styles.gridBtn, styles.btnSecondary, { width: 180 }]} onPress={load}>
          <Text style={styles.gridBtnText}>↻ Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const photos = Array.isArray(req.photos) ? req.photos : [];
  const cover = photos[0] || null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* En-tête : LOGO CENTRÉ */}
      <View style={styles.header}>
        <View style={styles.logoBar}>
          {!logoBroken ? (
            <Image
              source={{ uri: COMPANY.logo }}
              style={styles.logoImg}
              resizeMode="contain"
              onError={() => setLogoBroken(true)}
            />
          ) : (
            <Text style={styles.logoFallback}>{COMPANY.name}</Text>
          )}
        </View>

        <View style={styles.headerText}>
          <Text style={styles.title}>Demande de devis — Prise d’informations</Text>
          <Text style={styles.meta}>
            Créée le {formatDateTime(req.created_at)}{req.source ? ` · Source : ${req.source}` : ""}
          </Text>
        </View>
      </View>

      {/* Couverture centrée 50% */}
      {cover ? (
        <View style={styles.coverWrap}>
          <Image source={{ uri: cover }} style={styles.coverImg} resizeMode="cover" />
        </View>
      ) : null}

      {/* Cartes d'infos */}
      <View style={styles.group}>
        <Text style={styles.legend}>Client</Text>
        <Row label="Nom" value={req.client_name} />
        <Row label="Téléphone" value={req.phone} />
        <Row label="E-mail" value={req.email} />
      </View>

      <View style={styles.group}>
        <Text style={styles.legend}>Appareil</Text>
        <Row label="Type" value={req.device_type} />
        <Row label="Marque" value={req.brand} />
        <Row label="Modèle" value={req.model} />
        <Row label="N° Série / IMEI" value={req.serial} />
      </View>

      <View style={styles.group}>
        <Text style={styles.legend}>Technique</Text>
        <Row label="Panne constatée" value={req.problem} multiline />
        <Row label="État général" value={req.condition} multiline />
        <Row label="Accessoires fournis" value={req.accessories} />
        <Row label="Remarques" value={req.notes} multiline />
      </View>

      {/* Photos à l’écran */}
      <View style={styles.group}>
        <Text style={styles.legend}>Photos ({req.photos_count || 0})</Text>
        {photos.length > 0 ? (
          <View style={styles.grid}>
            {photos.map((u, i) => (
              <TouchableOpacity key={u + i} style={styles.thumbWrap} onPress={() => openViewer(i)}>
                <Image source={{ uri: u }} style={styles.thumb} />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={{ color: "#6b7280" }}>Aucune photo.</Text>
        )}
      </View>

      {/* Actions (2×2) */}
      <View style={styles.actionsGrid}>
        <TouchableOpacity style={[styles.gridBtn, styles.btnNeutral]} onPress={editRequest}>
          <Text style={styles.gridBtnTextDark}>✏️ Modifier la demande</Text>
        </TouchableOpacity>

        {!req.quote_id ? (
          <TouchableOpacity style={[styles.gridBtn, styles.btnPrimary]} onPress={prepareQuote}>
            <Text style={styles.gridBtnText}>🧾 Préparer le devis</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.gridBtn, styles.btnSecondary]} onPress={editExistingQuote}>
            <Text style={styles.gridBtnText}>✏️ Modifier le devis</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.gridBtn, styles.btnPrimary]} onPress={emailPdfPickMode}>
          <Text style={styles.gridBtnText}>✉️ Envoyer PDF (A5)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.gridBtn, styles.btnSecondary]} onPress={printPdfPickMode}>
          <Text style={styles.gridBtnText}>🖨️ Imprimer (A5)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsGrid}>
        <TouchableOpacity style={[styles.gridBtn, styles.btnLight]} onPress={savePdfPickMode}>
          <Text style={styles.gridBtnTextLight}>Partager / Enregistrer PDF</Text>
        </TouchableOpacity>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      {/* Footer harmonisé */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          <Text style={{ fontWeight: "800" }}>{COMPANY.name}</Text> — {COMPANY.address}
        </Text>
        <Text style={styles.footerText}>Tél : {COMPANY.phone} — SIRET : {COMPANY.siret}</Text>
        <Text style={styles.footerText}>R.C.S : {COMPANY.rcs} — {COMPANY.vat}</Text>
      </View>

      {/* Visionneuse */}
      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewer}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerOpen(false)}>
            <Text style={styles.viewerCloseText}>✕</Text>
          </TouchableOpacity>

          {photos.length > 1 && (
            <TouchableOpacity style={[styles.navBtn, { left: 8 }]} onPress={prevPhoto} disabled={viewerIdx === 0}>
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
          )}

          <Image source={{ uri: photos[viewerIdx] }} style={styles.viewerImg} resizeMode="contain" />

          {photos.length > 1 && (
            <TouchableOpacity
              style={[styles.navBtn, { right: 8 }]}
              onPress={nextPhoto}
              disabled={viewerIdx >= photos.length - 1}
            >
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>

      <Modal
        visible={pickModeState.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickModeState((prev) => ({ ...prev, visible: false }))}
      >
        <TouchableOpacity
          style={styles.pickModeOverlay}
          activeOpacity={1}
          onPress={() => setPickModeState((prev) => ({ ...prev, visible: false }))}
        >
          <TouchableOpacity style={styles.pickModeCard} activeOpacity={1}>
            <Text style={styles.pickModeTitle}>{pickModeState.title}</Text>
            <Text style={styles.pickModeSubtitle}>Inclure des miniatures ?</Text>

            <TouchableOpacity
              style={styles.pickModeOption}
              activeOpacity={0.75}
              onPress={() => {
                const onChoice = pickModeState.onChoice;
                setPickModeState((prev) => ({ ...prev, visible: false }));
                if (onChoice) onChoice(false);
              }}
            >
              <Text style={styles.pickModeOptionText}>Sans photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pickModeOption}
              activeOpacity={0.75}
              onPress={() => {
                const onChoice = pickModeState.onChoice;
                setPickModeState((prev) => ({ ...prev, visible: false }));
                if (onChoice) onChoice(true);
              }}
            >
              <Text style={styles.pickModeOptionText}>Avec miniatures</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pickModeCancel}
              activeOpacity={0.75}
              onPress={() => setPickModeState((prev) => ({ ...prev, visible: false }))}
            >
              <Text style={styles.pickModeCancelText}>Annuler</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </ScrollView>
  );
}

/* ————— Petits composants ————— */

function Row({ label, value, multiline }) {
  const has = !!(value && String(value).trim());
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, multiline && { lineHeight: 20 }]}>
        {has ? String(value) : "—"}
      </Text>
    </View>
  );
}

function StatusText({ status }) {
  const map = {
    nouvelle: { color: "#1d4ed8", label: "Nouvelle" },
    préparée: { color: "#c2410c", label: "Préparée" },
    convertie: { color: "#065f46", label: "Convertie" },
  };
  const s = map[status] || { color: "#374151", label: status || "—" };
  return <Text style={{ color: s.color, fontWeight: "700" }}>{s.label}</Text>;
}

/* ————— Styles écran harmonisés + logo centré ————— */
const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  pickModeOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  pickModeCard: {
    width: 340,
    maxWidth: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  pickModeTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 4,
  },
  pickModeSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 16,
  },
  pickModeOption: {
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    marginBottom: 10,
  },
  pickModeOptionText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  pickModeCancel: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 4,
  },
  pickModeCancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },

  header: { marginBottom: 10 },
  logoBar: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logoImg: { width: 160, height: 52 }, // visible, centré
  logoFallback: {
    fontWeight: "800",
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#f7f7f7",
    borderWidth: 1,
    borderColor: "#ccc",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  headerText: { alignItems: "center" },

  title: { fontSize: 18, fontWeight: "800", color: "#0f172a", textAlign: "center" },
  meta: { color: "#555", marginTop: 2, fontSize: 12, textAlign: "center" },

  // Couverture centrée, largeur 50%
  coverWrap: { alignItems: "center", marginBottom: 10 },
  coverImg: {
    width: "50%",            // ← demandé
    aspectRatio: 4 / 3,
    borderRadius: 6,
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#ccc",
  },

  group: {
    backgroundColor: "#f7f7f7",
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  legend: { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 6 },
  label: { fontSize: 11, fontWeight: "700", color: "#374151" },
  value: {
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 4,
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbWrap: {
    width: (W - 16 * 2 - 8 * 2) / 3,
    aspectRatio: 1,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  thumb: { width: "100%", height: "100%" },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8, marginTop: 12 },
  gridBtn: { width: "48%", height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  gridBtnText: { color: "#fff", fontSize: 14, fontWeight: "800", textAlign: "center" },
  gridBtnTextLight: { color: "#1f2937", fontSize: 14, fontWeight: "800", textAlign: "center" },
  gridBtnTextDark: { color: "#111827", fontSize: 14, fontWeight: "800", textAlign: "center" },

  btnPrimary: { backgroundColor: "#6b4e16" },
  btnSecondary: { backgroundColor: "#0b6bcb" },
  btnNeutral: { backgroundColor: "#f3f3f3", borderWidth: 1, borderColor: "#ccc" },
  btnLight: { backgroundColor: "#f0f0f0", borderWidth: 1, borderColor: "#ccc" },

  footer: {
    marginTop: 14,
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  footerText: { color: "#555", fontSize: 11 },

  viewer: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.95)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: W, height: "80%", borderRadius: 16 },
  viewerClose: {
    position: "absolute", top: 48, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center", justifyContent: "center",
  },
  viewerCloseText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  navBtn: {
    position: "absolute", top: "50%", marginTop: -22,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    alignItems: "center", justifyContent: "center",
  },
  navBtnText: { color: "#fff", fontSize: 26, lineHeight: 28, fontWeight: "700" },
});
