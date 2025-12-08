import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, Image, StyleSheet, Alert, Platform,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from "../supabaseClient";

const STORAGE_BUCKET = "quote-request-photos";

const deriveStorageBaseUrl = () => {
  try {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl("probe.txt");
    const pub = data?.publicUrl || "";
    const idx = pub.indexOf("/storage/v1/object");
    return idx > 0 ? pub.slice(0, idx) : "";
  } catch {
    return "";
  }
};
const STORAGE_BASE_URL = deriveStorageBaseUrl();

const pathFromPublicUrl = (url) => {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/public\/quote-request-photos\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

export default function QuoteRequestEditPage() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const id = params?.id ?? null;

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
  const [status, setStatus] = useState("nouvelle");

  // Photos
  const [remotePhotos, setRemotePhotos] = useState([]);
  const [localPhotos, setLocalPhotos] = useState([]);
  const [removedPaths, setRemovedPaths] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchRequest = async () => {
    if (!id) {
      setLoadError("Identifiant de demande manquant (params.id).");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    console.log("▶️ QuoteRequestEditPage params:", params);
    console.log("▶️ Editing request id:", id);
    try {
      const { data, error } = await supabase.from("quote_requests").select("*").eq("id", id).single();
      if (error) throw error;
      setClientName(data.client_name || "");
      setPhone(data.phone || "");
      setEmail(data.email || "");
      setDeviceType(data.device_type || "");
      setBrand(data.brand || "");
      setModel(data.model || "");
      setSerial(data.serial || "");
      setProblem(data.problem || "");
      setConditionText(data.condition || "");
      setAccessories(data.accessories || "");
      setNotes(data.notes || "");
      setStatus(data.status || "nouvelle");
      setRemotePhotos(Array.isArray(data.photos) ? data.photos : []);
    } catch (e) {
      console.log("❌ Load request error:", e);
      setLoadError(e?.message || "Impossible de charger la demande.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequest(); }, [id]);

  const takePhoto = async () => {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (camPerm.status !== "granted") {
      Alert.alert("Permission refusée", "Autorise l'appareil photo pour prendre des photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7, allowsEditing: false, base64: false, exif: false,
    });
    if (!result.canceled && result.assets?.length) {
      const a = result.assets[0];
      const resized = await ImageManipulator.manipulateAsync(
        a.uri, [{ resize: { width: 1280 } }], { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      setLocalPhotos((prev) => [...prev, { uri: resized.uri }]);
    }
  };

  const removeRemotePhoto = (url) => {
    const p = pathFromPublicUrl(url);
    if (p) setRemovedPaths((prev) => [...prev, p]);
    setRemotePhotos((prev) => prev.filter((u) => u !== url));
  };
  const removeLocalPhoto = (idx) => setLocalPhotos((prev) => prev.filter((_, i) => i !== idx));

  const uploadLocalPhotos = async () => {
    if (localPhotos.length === 0) return [];
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const userId = session?.user?.id || "anon";
      if (!token || !STORAGE_BASE_URL) return [];

      const urls = [];
      for (let i = 0; i < localPhotos.length; i++) {
        const path = `${userId}/${id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const uploadUrl = `${STORAGE_BASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`;
        const res = await FileSystem.uploadAsync(uploadUrl, localPhotos[i].uri, {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            "Content-Type": "image/jpeg",
            "x-upsert": "false",
            "Authorization": `Bearer ${token}`,
          },
        });
        if (res.status === 200 || res.status === 201) {
          const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
          urls.push(pub.publicUrl);
        } else {
          console.log("❌ Upload échec", res.status, res.body);
        }
      }
      return urls;
    } finally {
      setUploading(false);
    }
  };

  const deleteRemovedRemote = async () => {
    if (removedPaths.length === 0) return;
    try { await supabase.storage.from(STORAGE_BUCKET).remove(removedPaths); }
    catch (e) { console.log("⚠️ Suppression storage échouée:", e); }
  };

  const handleSave = async () => {
    if (!clientName.trim()) {
      Alert.alert("Information manquante", "Indique au moins le nom du client.");
      return;
    }
    setSaving(true);
    try {
      const newUrls = await uploadLocalPhotos();
      await deleteRemovedRemote();
      const finalPhotos = [...remotePhotos, ...newUrls];

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
        status,
        photos: finalPhotos,
        photos_count: finalPhotos.length,
      };

      const { error } = await supabase.from("quote_requests").update(payload).eq("id", id);
      if (error) {
        Alert.alert("Erreur", "Mise à jour impossible : " + error.message);
        return;
      }
      Alert.alert("✅ Demande mise à jour");
      setLocalPhotos([]); setRemovedPaths([]);
    } catch (e) {
      console.log(e);
      Alert.alert("Erreur", "Une erreur est survenue.");
    } finally {
      setSaving(false);
    }
  };

  if (!id) {
    return (
      <View style={{ flex:1, alignItems:"center", justifyContent:"center", padding:16 }}>
        <Text style={{ textAlign:"center", marginBottom:12 }}>
          Impossible d’ouvrir l’édition : identifiant de demande manquant.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ backgroundColor:"#6b4e16", padding:12, borderRadius:8 }}>
          <Text style={{ color:"#fff", fontWeight:"800" }}>⬅ Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return <View style={{ flex:1, alignItems:"center", justifyContent:"center" }}><Text>Chargement…</Text></View>;
  }

  if (loadError) {
    return (
      <View style={{ flex:1, alignItems:"center", justifyContent:"center", padding:16 }}>
        <Text style={{ textAlign:"center", marginBottom:12 }}>
          {loadError}
        </Text>
        <TouchableOpacity onPress={fetchRequest} style={{ backgroundColor:"#0b6bcb", padding:12, borderRadius:8, marginBottom:8 }}>
          <Text style={{ color:"#fff", fontWeight:"800" }}>↻ Réessayer</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ backgroundColor:"#6b4e16", padding:12, borderRadius:8 }}>
          <Text style={{ color:"#fff", fontWeight:"800" }}>⬅ Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      enableOnAndroid
      extraScrollHeight={24}
      extraHeight={Platform.select({ ios: 0, android: 120 })}
      keyboardOpeningTime={0}
      contentContainerStyle={{ padding: 16, backgroundColor: "#fff", paddingBottom: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Modifier la demande de devis</Text>

      {/* Client */}
      <View style={styles.group}>
        <Text style={styles.legend}>Client</Text>
        <Text style={styles.label}>Nom / Prénom</Text>
        <TextInput style={styles.input} value={clientName} onChangeText={setClientName} autoCapitalize="characters" />
        <Text style={styles.label}>Téléphone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Text style={styles.label}>Adresse e-mail</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      </View>

      {/* Appareil */}
      <View style={styles.group}>
        <Text style={styles.legend}>Appareil</Text>
        <Text style={styles.label}>Type d’appareil</Text>
        <TextInput style={styles.input} value={deviceType} onChangeText={setDeviceType} />
        <Text style={styles.label}>Marque</Text>
        <TextInput style={styles.input} value={brand} onChangeText={setBrand} />
        <Text style={styles.label}>Modèle</Text>
        <TextInput style={styles.input} value={model} onChangeText={setModel} />
        <Text style={styles.label}>N° Série / IMEI</Text>
        <TextInput style={styles.input} value={serial} onChangeText={setSerial} />
      </View>

      {/* Technique */}
      <View style={styles.group}>
        <Text style={styles.legend}>Technique</Text>
        <Text style={styles.label}>Panne constatée</Text>
        <TextInput style={[styles.input, styles.multiline]} value={problem} onChangeText={setProblem} multiline />
        <Text style={styles.label}>État général</Text>
        <TextInput style={[styles.input, styles.multiline]} value={conditionText} onChangeText={setConditionText} multiline />
        <Text style={styles.label}>Accessoires fournis</Text>
        <TextInput style={styles.input} value={accessories} onChangeText={setAccessories} />
        <Text style={styles.label}>Remarques</Text>
        <TextInput style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes} multiline />
      </View>

      {/* Photos */}
      <View style={styles.group}>
        <Text style={styles.legend}>Photos</Text>

        <View style={styles.photoActionsRow}>
          <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
            <Text style={styles.photoButtonText}>Prendre une photo</Text>
          </TouchableOpacity>
        </View>

        {(remotePhotos.length + localPhotos.length) > 0 ? (
          <View style={styles.photosGrid}>
            {remotePhotos.map((u) => (
              <View key={u} style={styles.photoWrap}>
                <Image source={{ uri: u }} style={styles.photo} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => removeRemotePhoto(u)}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            {localPhotos.map((p, idx) => (
              <View key={`${p.uri}-${idx}`} style={styles.photoWrap}>
                <Image source={{ uri: p.uri }} style={styles.photo} />
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => removeLocalPhoto(idx)}
                >
                  <Text style={{ color: "#fff", fontWeight: "900" }}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: "#6b7280" }}>Aucune photo.</Text>
        )}
      </View>


      {/* Actions */}
      <View style={styles.actionsBlock}>
        <View style={styles.actionsSeparator} />

        <View style={styles.actionsTextRow}>
          <TouchableOpacity
            disabled={saving || uploading}
            onPress={handleSave}
          >
            <Text
              style={[
                styles.actionsTextPrimary,
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

          <Text style={styles.actionsDivider}>|</Text>

          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.actionsText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>


      <View style={{ height: 16 }} />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 10, color: "#0f172a" },
  group: { backgroundColor: "#f7f7f7", borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#e5e7eb" },
  legend: { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 6 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 8, marginBottom: 6, color: "#111827" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#d1d5db", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#111827" },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoWrap: { width: "30%", aspectRatio: 1, borderRadius: 10, overflow: "hidden", position: "relative", backgroundColor: "#e5e7eb" },
  photo: { width: "100%", height: "100%" },
  photoRemove: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 12, paddingHorizontal: 6, paddingVertical: 0 },
  btn: { width: "100%", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  btnPrimary: { backgroundColor: "#6b4e16" },
  btnLight: { backgroundColor: "#e5e7eb" },
  btnText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  btnTextLight: { color: "#1f2937", fontSize: 15, fontWeight: "700" },
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

  actionsBlock: {
    marginTop: 12,
  },
  actionsSeparator: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginBottom: 4,
  },
  actionsTextRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 4,
  },
  actionsText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563eb",
  },
  actionsTextPrimary: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  actionsTextDisabled: {
    color: "#9ca3af",
  },
  actionsDivider: {
    fontSize: 12,
    color: "#9ca3af",
  },

});
