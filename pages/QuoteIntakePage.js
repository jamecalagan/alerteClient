import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { supabase } from "../supabaseClient";

const DEBOUNCE_MS = 220;
const STORAGE_BUCKET = "quote-request-photos";

/** Déduit https://xxxx.supabase.co sans requête réseau */
const deriveStorageBaseUrl = () => {
  try {
    const { data } = supabase
      .storage
      .from(STORAGE_BUCKET)
      .getPublicUrl("probe.txt"); // n'effectue pas d'appel réseau
    const pub = data?.publicUrl || "";
    const idx = pub.indexOf("/storage/v1/object");
    return idx > 0 ? pub.slice(0, idx) : "";
  } catch {
    return "";
  }
};
const STORAGE_BASE_URL = deriveStorageBaseUrl();

const QuoteIntakePage = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Champs
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [problem, setProblem] = useState("");
  const [conditionText, setConditionText] = useState("");
  const [accessories, setAccessories] = useState("");
  const [notes, setNotes] = useState("");

  // Suggestions client
  const [clientSuggestions, setClientSuggestions] = useState([]);
  const searchTimer = useRef(null);

  // Email à renseigner si client existant sans email
  const [emailNeedsAttention, setEmailNeedsAttention] = useState(false);

  // Photos locales (URI file://)
  const [photos, setPhotos] = useState([]); // [{ uri }]
  const [uploading, setUploading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState(null);

  const resetForm = () => {
    setClientName("");
    setPhone("");
    setEmail("");
    setDeviceType("");
    setBrand("");
    setModel("");
    setSerial("");
    setProblem("");
    setConditionText("");
    setAccessories("");
    setNotes("");
    setLastSavedId(null);
    setClientSuggestions([]);
    setEmailNeedsAttention(false);
    setPhotos([]);
  };

  /* ───────────── Auto-complétion clients ───────────── */
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const needle = clientName?.trim();
    if (!needle || needle.length < 2) {
      setClientSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      fetchClientSuggestions(needle).catch(() => setClientSuggestions([]));
    }, DEBOUNCE_MS);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [clientName]);

  const fetchClientSuggestions = async (text) => {
    const like = `%${text}%`;
    const { data: c1, error: e1 } = await supabase
      .from("clients")
      .select("name, phone, email")
      .or(`name.ilike.${like},phone.ilike.${like}`)
      .limit(8);
    const { data: c2 } = await supabase
      .from("quotes")
      .select("name, phone, email")
      .or(`name.ilike.${like},phone.ilike.${like}`)
      .limit(8);
    const arr1 = e1 ? [] : (c1 || []);
    const arr2 = c2 || [];
    const merged = [...arr1, ...arr2];
    const unique = [];
    const seen = new Set();
    for (const it of merged) {
      const key = `${(it.name || "").trim().toUpperCase()}|${(it.phone || "").trim()}`;
      if (!seen.has(key)) {
        unique.push({ name: it.name || "", phone: it.phone || "", email: it.email || "" });
        seen.add(key);
      }
      if (unique.length >= 8) break;
    }
    setClientSuggestions(unique);
  };

  const pickClient = (sugg) => {
    setClientName(sugg.name || "");
    if (sugg.phone) setPhone(sugg.phone);
    setEmail(sugg.email || "");
    setEmailNeedsAttention(!sugg.email);
    setClientSuggestions([]);
  };

  const onEmailChange = (val) => {
    setEmail(val);
    if (val && emailNeedsAttention) setEmailNeedsAttention(false);
  };

  /* ───────────── Photos: prise & gestion ───────────── */
  const requestCameraAndOpen = async () => {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (camPerm.status !== "granted") {
      Alert.alert("Permission refusée", "Autorise l'appareil photo pour prendre des photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
      base64: false, // ← pas de base64
      exif: false,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const a = result.assets[0];
      // Redimensionner pour économiser la bande passante
      const resized = await ImageManipulator.manipulateAsync(
        a.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhotos((prev) => [...prev, { uri: resized.uri }]);
    }
  };

  const removePhoto = (idx) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  /** Upload binaire direct vers Supabase Storage via REST (pas de base64) */
  const uploadAllPhotos = async (requestId) => {
    if (photos.length === 0) return [];
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || "anon";
      const token = session?.access_token;

      if (!STORAGE_BASE_URL) {
        console.log("❌ STORAGE_BASE_URL introuvable");
        return [];
      }
      if (!token) {
        Alert.alert("Session requise", "Connecte-toi pour téléverser des photos.");
        return [];
      }

      const uploadedUrls = [];

      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        const path = `${userId}/${requestId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const uploadUrl = `${STORAGE_BASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;

        const res = await FileSystem.uploadAsync(uploadUrl, p.uri, {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            "Content-Type": "image/jpeg",
            "x-upsert": "false",
            "Authorization": `Bearer ${token}`,
          },
        });

        if (res.status !== 200 && res.status !== 201) {
          console.log("❌ Upload échec", res.status, res.body);
          continue; // on n'interrompt pas tout pour une photo en échec
        }

        // URL publique (si bucket public)
        const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
        uploadedUrls.push(pub.publicUrl);
      }

      return uploadedUrls;
    } finally {
      setUploading(false);
    }
  };

  /* ───────────── Enregistrement ───────────── */
  const handleSaveRequest = async () => {
    if (!clientName.trim()) {
      Alert.alert("Information manquante", "Indique au moins le nom du client.");
      return;
    }

    setSaving(true);
    try {
      // 1) Créer la demande (sans photos)
      const payload = {
        client_name: clientName.trim().toUpperCase(),
        phone: phone.trim(),
        email: email.trim(),
        device_type: deviceType.trim(),
        brand: brand.trim(),
        model: model.trim(),
        serial: serial.trim(),
        problem: problem.trim(),
        condition: conditionText.trim(),
        accessories: accessories.trim(),
        notes: notes.trim(),
        source: "QuoteIntakePage",
        status: "nouvelle",
      };

      const { data: created, error } = await supabase
        .from("quote_requests")
        .insert(payload)
        .select()
        .single();

      if (error) {
        Alert.alert("Erreur", "Sauvegarde impossible : " + error.message);
        return;
      }

      setLastSavedId(created.id);

      // 2) Uploader les photos (si présentes), puis mettre à jour la demande
      let uploadedUrls = [];
      if (photos.length > 0) {
        uploadedUrls = await uploadAllPhotos(created.id);
        if (uploadedUrls.length > 0) {
          const { error: upErr } = await supabase
            .from("quote_requests")
            .update({ photos: uploadedUrls, photos_count: uploadedUrls.length })
            .eq("id", created.id);
          if (upErr) console.log("Update photos_count/urls erreur:", upErr);
        }
      }

      Alert.alert(
        "✅ Demande enregistrée",
        uploadedUrls.length > 0
          ? `La prise d’infos a été archivée (avec ${uploadedUrls.length} photo(s)).`
          : "La prise d’infos a été archivée (sans photo)."
      );
    } catch (e) {
      console.log(e);
      Alert.alert("Erreur", "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  };

  /* ───────────── UI ───────────── */
  return (
    <KeyboardAwareScrollView
      enableOnAndroid
      extraScrollHeight={24}
      extraHeight={Platform.select({ ios: 0, android: 120 })}
      keyboardOpeningTime={0}
      contentContainerStyle={[styles.container, { paddingBottom: 24 + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Demande de devis — Prise d’informations</Text>
      <Text style={styles.subtitle}>
        Renseigne uniquement les informations du produit à réparer. Aucun prix n’est saisi ici.
      </Text>

      {/* Client */}
      <View style={styles.group}>
        <Text style={styles.legend}>Client</Text>

        <Text style={styles.label}>Nom / Prénom</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex. JEAN DUPONT"
          value={clientName}
          onChangeText={(t) => {
            setClientName(t);
            if (emailNeedsAttention) setEmailNeedsAttention(false);
          }}
          autoCapitalize="characters"
        />

        {/* Suggestions nom/tel/email */}
        {clientSuggestions.length > 0 && (
          <View style={styles.suggestionBox}>
            {clientSuggestions.map((s, idx) => (
              <TouchableOpacity
                key={`${s.name}-${s.phone}-${idx}`}
                style={styles.suggestionItem}
                onPress={() => pickClient(s)}
              >
                <Text style={styles.suggestionText}>
                  {s.name || "—"}{s.phone ? `  ·  ${s.phone}` : ""}{s.email ? `  ·  ${s.email}` : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Téléphone</Text>
        <TextInput
          style={styles.input}
          placeholder="06 xx xx xx xx"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <Text style={styles.label}>Adresse e-mail</Text>
        <TextInput
          style={[styles.input, emailNeedsAttention && styles.inputError]}
          placeholder="exemple@client.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={onEmailChange}
          onBlur={() => {
            if (!email) setEmailNeedsAttention(true);
          }}
        />
        {emailNeedsAttention && (
          <Text style={styles.helperError}>Email manquant pour ce client — pensez à le saisir.</Text>
        )}
      </View>

      {/* Appareil */}
      <View style={styles.group}>
        <Text style={styles.legend}>Appareil</Text>

        <Text style={styles.label}>Type d’appareil</Text>
        <TextInput
          style={styles.input}
          placeholder="PC portable, PC fixe, Smartphone, Console…"
          value={deviceType}
          onChangeText={setDeviceType}
        />

        <Text style={styles.label}>Marque</Text>
        <TextInput
          style={styles.input}
          placeholder="ASUS, HP, Apple, Samsung…"
          value={brand}
          onChangeText={setBrand}
        />

        <Text style={styles.label}>Modèle</Text>
        <TextInput
          style={styles.input}
          placeholder="A515-56, iPhone 12, PS5…"
          value={model}
          onChangeText={setModel}
        />

        <Text style={styles.label}>N° Série / IMEI</Text>
        <TextInput
          style={styles.input}
          placeholder="S/N ou IMEI"
          value={serial}
          onChangeText={setSerial}
        />
      </View>

      {/* Technique */}
      <View style={styles.group}>
        <Text style={styles.legend}>Technique</Text>

        <Text style={styles.label}>Panne constatée</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Décris précisément le problème"
          value={problem}
          onChangeText={setProblem}
          multiline
        />

        <Text style={styles.label}>État général</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Rayures, chocs, liquide, etc."
          value={conditionText}
          onChangeText={setConditionText}
          multiline
        />

        <Text style={styles.label}>Accessoires fournis</Text>
        <TextInput
          style={styles.input}
          placeholder="Chargeur, câble, housse, carte SD…"
          value={accessories}
          onChangeText={setAccessories}
        />

        <Text style={styles.label}>Remarques</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Observations, urgences, contexte…"
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </View>

      {/* Photos */}
      <View style={styles.group}>
        <Text style={styles.legend}>Photos du produit</Text>

        <View style={styles.photoActionsRow}>
          <TouchableOpacity
            style={styles.photoButton}
            onPress={requestCameraAndOpen}
          >
            <Text style={styles.photoButtonText}>Prendre une photo</Text>
          </TouchableOpacity>
        </View>


        {photos.length > 0 ? (
          <View style={styles.photosGrid}>
            {photos.map((p, idx) => (
              <View key={`${p.uri}-${idx}`} style={styles.photoWrap}>
                <Image source={{ uri: p.uri }} style={styles.photo} />
                <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(idx)}>
                  <Text style={{ color: "#fff", fontWeight: "900" }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: "#6b7280" }}>Aucune photo pour l’instant.</Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionsBlock}>
        <View style={styles.actionsSeparator} />

        <View style={styles.actionsTextRow}>
          <TouchableOpacity
            disabled={saving || uploading}
            onPress={handleSaveRequest}
          >
            <Text
              style={[
                styles.actionsText,
                (saving || uploading) && styles.actionsTextDisabled,
              ]}
            >
              {saving
                ? "Enregistrement..."
                : uploading
                ? "Téléversement..."
                : "Enregistrer la demande"}
            </Text>
          </TouchableOpacity>
</View>
        {lastSavedId ? (
          <View style={{ width: "100%", gap: 8 }}>
            <TouchableOpacity
              style={[styles.btn, styles.btnLight]}
              onPress={() => navigation.navigate("QuoteRequestsListPage")}
            >
              <Text style={styles.btnTextLight}>Voir les demandes</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnLight]} onPress={resetForm}>
              <Text style={styles.btnTextLight}>Nouvelle demande</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={[styles.btn, styles.btnLight]} onPress={() => navigation.goBack()}>
            <Text style={styles.btnTextLight}>Annuler</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 16 }} />
    </KeyboardAwareScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 6, color: "#0f172a" },
  subtitle: { fontSize: 13, textAlign: "center", color: "#374151", marginBottom: 14 },
  group: { backgroundColor: "#f7f7f7", borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#e5e7eb" },
  legend: { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 6 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 8, marginBottom: 6, color: "#111827" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d1d5db", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#111827" },
  inputError: { borderColor: "#dc2626", backgroundColor: "#fff5f5" },
  helperError: { color: "#b91c1c", marginTop: 4, fontSize: 12 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  actions: { marginTop: 6, marginBottom: 24, alignItems: "center", gap: 10 },
  btn: { width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: "#6b4e16" },
  btnLight: { backgroundColor: "#e5e7eb" },
  btnText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  btnTextLight: { color: "#1f2937", fontSize: 15, fontWeight: "700" },

  // Suggestions
  suggestionBox: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    marginTop: 6,
    marginBottom: 6,
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#efefef",
  },
  suggestionText: { color: "#111827", fontSize: 14 },

  // Photos
  photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoWrap: { width: "30%", aspectRatio: 1, borderRadius: 10, overflow: "hidden", position: "relative", backgroundColor: "#e5e7eb" },
  photo: { width: "100%", height: "100%" },
  photoRemove: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12, paddingHorizontal: 6, paddingVertical: 0 },
    photoActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 8,
  },
  photoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
  },
  photoButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },

  actionsRow: {
    marginTop: 16,
  },
  primaryActionButton: {
    height: 40,
    borderRadius: 999,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  primaryActionDisabled: {
    backgroundColor: "#9ca3af",
  },
  primaryActionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
  actionsBlock: {
    marginTop: 12,
  },
  actionsSeparator: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginBottom: 10,
  },
  actionsTextRow: {
    flexDirection: "row",
    justifyContent: "flex-center",
    marginBottom: 20,
  },
  actionsText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },
  actionsTextDisabled: {
    color: "#9ca3af",
  },

});

export default QuoteIntakePage;
