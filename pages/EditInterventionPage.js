import React, { useState, useEffect } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
  TouchableWithoutFeedback,
  Alert,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "../supabaseClient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

// ———————————————————————————————————————————
// Helpers
// ———————————————————————————————————————————
const normalizeNumber = (v) => {
  if (v === null || v === undefined) return "";
  return String(v).replace(",", ".").trim();
};

const fileExists = async (p) => {
  try {
    const i = await FileSystem.getInfoAsync(p);
    return i.exists;
  } catch {
    return false;
  }
};
// Extrait une string exploitable depuis n'importe quelle forme
const extractRefString = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    // adapte si besoin selon ta BDD
    return v.path || v.url || v.uri || "";
  }
  return "";
};

// Récupère le path bucket "images/..." (public ou signé)
const pathFromSupabaseUrl = (url) => {
  try {
    // gère /object/public/images/... ET /object/sign/images/... (avec ?token)
    const m = url.match(/\/storage\/v1\/object\/(public|sign)\/images\/(.+?)(\?|$)/);
    return m ? m[2] : null; // sans le "images/"
  } catch {
    return null;
  }
};

// Convertit un id Picker vers un type DB
// - si l'id est purement numérique → Number
// - sinon (UUID/texte) → string inchangée
const toDBId = (v) => (typeof v === "string" && /^\d+$/.test(v) ? parseInt(v, 10) : v);

export default function EditInterventionPage({ route, navigation }) {
  const { clientId } = route.params || {};
  const { interventionId } = route.params;

  // Champs intervention
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [serial_number, setSerial_number] = useState("");
  const [commande, setCommande] = useState("");
  const [remarks, setRemarks] = useState("");
  const [chargeur, setChargeur] = useState("Non");
  const [acceptScreenRisk, setAcceptScreenRisk] = useState(false);

  // Paiement / coût
  const [cost, setCost] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("non_regle");
  const [partialPayment, setPartialPayment] = useState("");
  const [solderestant, setSolderestant] = useState("");
  const [noCostButRestitution, setNoCostButRestitution] = useState(false);
  const [status, setStatus] = useState("default");
  const [devisCost, setDevisCost] = useState(""); // montant fixe de devis (optionnel)

  // 🧮 Fourchette de devis
  const [estimateMin, setEstimateMin] = useState("");
  const [estimateMax, setEstimateMax] = useState("");
  const [estimateType, setEstimateType] = useState("PLAFOND"); // 'PLAFOND' | 'INDICATIF'

  // Sélections liées produit (IDs en STRING pour cohérence Picker)
  const [deviceType, setDeviceType] = useState(""); // String(article_id)
  const [brand, setBrand] = useState(""); // String(marque_id)
  const [model, setModel] = useState(""); // String(modele_id)

  // Listes (ids normalisés en string)
  const [articles, setArticles] = useState([]); // [{id: string, nom}]
  const [brands, setBrands] = useState([]); // idem
  const [models, setModels] = useState([]); // idem

  // Média
  const [photos, setPhotos] = useState([]);
  const [labelPhoto, setLabelPhoto] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  // Divers UI
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertTitle, setAlertTitle] = useState("");
  const [clientName, setClientName] = useState("");

  // Chargement initial : forcer l'ordre Articles → Intervention (pour que les Pickers aient des options)
  useEffect(() => {
    (async () => {
      await loadArticles();
      await loadIntervention();
    })();
  }, []);

  useEffect(() => {
    const fetchClientName = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .single();
      if (!error && data) setClientName(data.name);
    };
    if (clientId) fetchClientName();
  }, [clientId]);

  // ———————————————————————————————————————————
  // Chargements listes (ids convertis en string)
  // ———————————————————————————————————————————
  const loadArticles = async () => {
    const { data, error } = await supabase
      .from("article")
      .select("id, nom")
      .order("nom");
    if (!error && data) {
      setArticles(data.map((a) => ({ id: String(a.id), nom: a.nom })));
    }
  };

  const loadBrands = async (articleId) => {
    const { data, error } = await supabase
      .from("marque")
      .select("id, nom")
      .eq("article_id", toDBId(articleId))
      .order("nom");
    if (!error && data) setBrands(data.map((b) => ({ id: String(b.id), nom: b.nom })));
  };

  const loadModels = async (brandId) => {
    const { data, error } = await supabase
      .from("modele")
      .select("id, nom")
      .eq("marque_id", toDBId(brandId))
      .order("nom");
    if (!error && data) setModels(data.map((m) => ({ id: String(m.id), nom: m.nom })));
  };

  // ———————————————————————————————————————————
  // Charger l'intervention + hydrater en respectant l'ordre
  // ———————————————————————————————————————————
  const loadIntervention = async () => {
    try {
      const [{ data: inter, error: errInter }, { data: client, error: errCli }] = await Promise.all([
        supabase
          .from("interventions")
          .select("article_id, marque_id, modele_id, deviceType, brand, model, reference, description, cost, partialPayment, solderestant, status, commande, createdAt, serial_number, password, chargeur, photos, label_photo, remarks, paymentStatus, accept_screen_risk, devis_cost, is_estimate, estimate_min, estimate_max, estimate_type, estimate_accepted, estimate_accepted_at")
          .eq("id", interventionId)
          .single(),
        supabase
          .from("clients")
          .select("ficheNumber")
          .eq("id", clientId)
          .single(),
      ]);

      if (errInter || errCli) {
        console.error("❌ Supabase :", errInter || errCli);
        return;
      }

      // Résolution locales
      const localBase = FileSystem.documentDirectory + `backup/${client.ficheNumber}/`;
      const urlToLocal = async (url, type = "photo", index = 0) => {
        if (!url) return null;
        const filename = type === "label" ? `etiquette_${interventionId}.jpg` : `photo_${interventionId}_${index + 1}.jpg`;
        const localUri = localBase + filename;
        const exists = await fileExists(localUri);
        return exists ? localUri : url;
      };
      const photosArray = Array.isArray(inter.photos) ? inter.photos : [];
      const photosResolved = await Promise.all(photosArray.map((u, idx) => urlToLocal(u, "photo", idx)));
      const labelResolved = await urlToLocal(inter.label_photo, "label");

      // Hydratation simple
      setReference(inter.reference || "");
      setDescription(inter.description || "");
      setCost(inter.cost != null ? String(inter.cost) : "");
      setDevisCost(inter.devis_cost != null ? String(inter.devis_cost) : "");
      setSolderestant(inter.solderestant != null ? String(inter.solderestant) : "");
      setPartialPayment(inter.partialPayment != null ? String(inter.partialPayment) : "");
      setStatus(inter.status || "default");
      setSerial_number(inter.serial_number || "");
      setPassword(inter.password || "");
      setPhotos(photosResolved);
      setLabelPhoto(labelResolved);
      setCommande(inter.commande || "");
      setRemarks(inter.remarks || "");
      setPaymentStatus(inter.paymentStatus || "non_regle");
      setChargeur(inter.chargeur ? "Oui" : "Non");
      setAcceptScreenRisk(!!inter.accept_screen_risk);

      // Fourchette
      setEstimateMin(inter.estimate_min != null ? String(inter.estimate_min) : "");
      setEstimateMax(inter.estimate_max != null ? String(inter.estimate_max) : "");
      setEstimateType(inter.estimate_type || "PLAFOND");
// ——— Fallback si les IDs sont nuls mais qu'on a les libellés texte ———
try {
  // Article par nom
  if ((inter.article_id == null || inter.article_id === "") && inter.deviceType) {
    const { data: artRow } = await supabase
      .from("article")
      .select("id")
      .ilike("nom", inter.deviceType) // ou .eq("nom", inter.deviceType) si nom exact
      .limit(1)
      .maybeSingle();
    if (artRow?.id) inter.article_id = artRow.id;
  }

  // Marque par nom + article_id
  if ((inter.marque_id == null || inter.marque_id === "") && inter.brand && inter.article_id != null) {
    const { data: marRow } = await supabase
      .from("marque")
      .select("id")
      .eq("article_id", toDBId(inter.article_id))
      .ilike("nom", inter.brand)
      .limit(1)
      .maybeSingle();
    if (marRow?.id) inter.marque_id = marRow.id;
  }

  // Modèle par nom + marque_id
  if ((inter.modele_id == null || inter.modele_id === "") && inter.model && inter.marque_id != null) {
    const { data: modRow } = await supabase
      .from("modele")
      .select("id")
      .eq("marque_id", toDBId(inter.marque_id))
      .ilike("nom", inter.model)
      .limit(1)
      .maybeSingle();
    if (modRow?.id) inter.modele_id = modRow.id;
  }
} catch (e) {
  console.log("⚠️ Fallback nom→ID : ", e?.message || e);
}

      // ——— Hydratation pickers en respectant les dépendances ———
      // Article → charger marques puis poser valeur
      if (inter.article_id != null) {
        const art = String(inter.article_id);
        setDeviceType(art);
        await loadBrands(art);
      } else {
        setDeviceType("");
        setBrands([]);
      }

      // Marque → charger modèles puis poser valeur
      if (inter.marque_id != null) {
        const mar = String(inter.marque_id);
        setBrand(mar);
        await loadModels(mar);
      } else {
        setBrand("");
        setModels([]);
      }

      // Modèle en dernier (liste déjà chargée)
      setModel(inter.modele_id != null ? String(inter.modele_id) : "");

      // 🔎 Debug
      console.log("📦 Inter article_id:", inter.article_id, "→ state:", String(inter.article_id));
      console.log("📦 Inter marque_id:", inter.marque_id, "→ state:", String(inter.marque_id));
      console.log("📦 Inter modele_id:", inter.modele_id, "→ state:", String(inter.modele_id));
    } catch (e) {
      console.error("❌ Erreur loadIntervention :", e);
    }
  };

  // ———————————————————————————————————————————
  // Photos
  // ———————————————————————————————————————————
  const uploadImageToStorage = async (fileUri, interventionId, isLabel = false) => {
    try {
      const folder = isLabel ? "etiquettes" : "supplementaires";
      const fileName = `${Date.now()}.jpg`;
      const filePath = `${folder}/${interventionId}/${fileName}`;
      const file = { uri: fileUri, name: fileName, type: "image/jpeg" };
      const { error } = await supabase.storage
        .from("images")
        .upload(filePath, file, { upsert: true, contentType: "image/jpeg" });
      if (error) {
        console.error("❌ Erreur upload Supabase:", error.message);
        return null;
      }
      const { data } = supabase.storage.from("images").getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.error("❌ Erreur dans uploadImageToStorage :", error);
      return null;
    }
  };

const deletePhoto = (photoRefRaw) => {
  const photoRef = extractRefString(photoRefRaw); // <-- SÉCURISATION

  Alert.alert(
    "Supprimer cette image ?",
    "Cette action est définitive et supprimera l'image du stockage et de la fiche.",
    [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            if (!photoRef) {
              console.warn("⚠️ deletePhoto: ref vide/indéfinie, on retire juste du state.");
            }

            let path = null;

            if (photoRef && photoRef.startsWith("http")) {
              // URL publique ou signée → extraire le chemin
              path = pathFromSupabaseUrl(photoRef);
            } else if (photoRef && photoRef.startsWith("file://")) {
              // Fichier local uniquement → rien à supprimer côté cloud
              path = null;
            } else if (photoRef) {
              // Chemin de bucket direct, ex: "supplementaires/123/xxx.jpg"
              path = photoRef;
            }

            if (path) {
              const { error } = await supabase.storage.from("images").remove([path]);
              if (error) {
                console.error("❌ Erreur Supabase lors de la suppression :", error.message);
                // on continue quand même pour retirer du state/BDD
              }
            }

            // Mettre à jour le state (compare via string normalisée)
            setPhotos((prev) => prev.filter((p) => extractRefString(p) !== photoRef));

            // Mettre à jour la BDD
            const newPhotos = photos.filter((p) => extractRefString(p) !== photoRef);
            const { error: updateError } = await supabase
              .from("interventions")
              .update({ photos: newPhotos })
              .eq("id", interventionId);

            if (updateError) {
              console.error("❌ Erreur mise à jour BDD :", updateError.message);
            }
          } catch (e) {
            console.error("❌ Erreur générale lors de la suppression :", e);
          }
        },
      },
    ]
  );
};


  // ———————————————————————————————————————————
  // Handlers Pickers
  // ———————————————————————————————————————————
  const handleDeviceTypeChange = async (value) => {
    setDeviceType(value);
    setBrand("");
    setModel("");
    setBrands([]);
    setModels([]);
    if (value) await loadBrands(value);
  };

  const handleBrandChange = async (value) => {
    setBrand(value);
    setModel("");
    setModels([]);
    if (value) await loadModels(value);
  };

  const handleModelChange = (value) => setModel(value);

  // ———————————————————————————————————————————
  // Caméra
  // ———————————————————————————————————————————
  const pickLabelImage = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.5,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        const compressedImage = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 800 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        const url = await uploadImageToStorage(compressedImage.uri, interventionId, true);
        if (url) setLabelPhoto(url);
      }
    } catch (error) {
      console.error("Erreur capture étiquette :", error);
    }
  };

  const pickAdditionalImage = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.5,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        const compressedImage = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 800 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        const url = await uploadImageToStorage(compressedImage.uri, interventionId, false);
        if (url) setPhotos((prev) => [...prev, url]);
      }
    } catch (error) {
      console.error("Erreur capture image :", error);
    }
  };

  // ———————————————————————————————————————————
  // Sauvegarde
  // ———————————————————————————————————————————
  const handleSaveIntervention = async () => {
    const errors = [];
    if (!reference) errors.push("Référence");
    if (!deviceType) errors.push("Type de produit");
    if (!brand) errors.push("Marque");
    if (!model) errors.push("Modèle");
    if (!description) errors.push("Description");
    if (!status || status === "default") errors.push("Statut");

    if (status !== "Devis en cours" && !cost && !noCostButRestitution) {
      errors.push("Coût de la réparation");
    }

    if (status === "Devis en cours") {
      const min = parseFloat(normalizeNumber(estimateMin));
      const max = parseFloat(normalizeNumber(estimateMax));
      if (isNaN(min) || isNaN(max)) errors.push("Fourchette de devis (de/à)");
      else if (min < 0 || max < 0) errors.push("Fourchette de devis : valeurs positives requises");
      else if (min > max) errors.push("Fourchette de devis : 'De' doit être ≤ 'À'");
    }

    if (!labelPhoto) errors.push("Photo d’étiquette");

    if (
      paymentStatus === "reglement_partiel" &&
      (!partialPayment || parseFloat(partialPayment) > parseFloat(cost || 0))
    ) {
      errors.push("Acompte valide");
    }

    if (errors.length > 0) {
      const message = "Champs manquants ou incorrects :\n\n" + errors.join("\n");
      Alert.alert("Erreur", message);
      return;
    }

    // Montants
    const costValue = parseFloat(cost) || 0;
    const partialPaymentValue = parseFloat(partialPayment) || 0;
    const solderestantValue =
      paymentStatus === "reglement_partiel"
        ? Math.max(costValue - partialPaymentValue, 0)
        : paymentStatus === "solde"
        ? 0
        : costValue;

    const isEstimateMode = status === "Devis en cours";

    const updatedIntervention = {
      // 🔗 IDs conservés (conversion en nombre si besoin)
      article_id: toDBId(deviceType),
      marque_id: toDBId(brand),
      modele_id: toDBId(model),
      reference,
      description,
      cost: costValue,
      solderestant: solderestantValue || 0,
      partialPayment: partialPaymentValue || null,
      no_cost_but_restitution: noCostButRestitution,
      status,
      password,
      serial_number,
      photos,
      commande,
      remarks,
      paymentStatus,
      chargeur: chargeur === "Oui",
      accept_screen_risk: acceptScreenRisk,
      label_photo: labelPhoto,
      updatedAt: new Date().toISOString(),
      // Fourchette
      estimate_min: isEstimateMode ? parseFloat(normalizeNumber(estimateMin)) : null,
      estimate_max: isEstimateMode ? parseFloat(normalizeNumber(estimateMax)) : null,
      estimate_type: isEstimateMode ? estimateType : null,
      is_estimate: isEstimateMode,
      estimate_accepted: isEstimateMode && estimateType === "PLAFOND" ? true : null,
      estimate_accepted_at: isEstimateMode && estimateType === "PLAFOND" ? new Date().toISOString() : null,
    };

    const formattedDevisCost = isEstimateMode && devisCost ? parseFloat(devisCost) : null;
    if (isEstimateMode) updatedIntervention.devis_cost = formattedDevisCost;

    try {
      const { error } = await supabase
        .from("interventions")
        .update(updatedIntervention)
        .eq("id", interventionId);
      if (error) throw error;
      setAlertTitle("Succès");
      setAlertMessage("Intervention mise à jour avec succès.");
      setAlertVisible(true);
    } catch (error) {
      setAlertTitle("Erreur");
      setAlertMessage("Erreur lors de la mise à jour de l'intervention.");
      setAlertVisible(true);
      console.error("Erreur lors de la mise à jour de l'intervention :", error);
    }
  };

  const closeAlert = () => {
    setAlertVisible(false);
    if (alertTitle === "Succès") navigation.goBack();
  };

  // Propagation devis accepté → pré-remplir coût si vide
  useEffect(() => {
    if (status === "Devis accepté" && devisCost && !cost) {
      setCost(devisCost);
    }
  }, [status, devisCost]);

  // ———————————————————————————————————————————
  // UI
  // ———————————————————————————————————————————
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
      keyboardVerticalOffset={0}
    >
      {clientName ? (
        <Text style={styles.clientName}>{`Client: ${clientName}`}</Text>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Type de produit */}
        <Text style={styles.label}>Type de produit</Text>
        <Picker
          selectedValue={deviceType}
          style={styles.input}
          onValueChange={handleDeviceTypeChange}
        >
          <Picker.Item label="Sélectionnez un type de produit..." value="" />
          {articles.map((a) => (
            <Picker.Item key={a.id} label={a.nom} value={a.id} />
          ))}
        </Picker>

        {/* Marque */}
        <Text style={styles.label}>Marque du produit</Text>
        <Picker
          selectedValue={brand}
          style={styles.input}
          enabled={!!deviceType}
          onValueChange={handleBrandChange}
        >
          <Picker.Item label="Sélectionnez une marque..." value="" />
          {brands.map((b) => (
            <Picker.Item key={b.id} label={b.nom} value={b.id} />
          ))}
        </Picker>

        {/* Modèle */}
        <Text style={styles.label}>Modèle du produit</Text>
        <Picker
          selectedValue={model}
          style={styles.input}
          enabled={!!brand}
          onValueChange={handleModelChange}
        >
          <Picker.Item label="Sélectionnez un modèle..." value="" />
          {models.map((m) => (
            <Picker.Item key={m.id} label={m.nom} value={m.id} />
          ))}
        </Picker>

        {/* Référence */}
        <View style={styles.referenceContainer}>
          <TextInput
            style={styles.referenceInput}
            value={reference.toUpperCase()}
            onChangeText={(t) => setReference(t.toUpperCase())}
            autoCapitalize="characters"
            placeholderTextColor="#d1d0d0"
            placeholder="Référence du produit"
          />
        </View>

        {/* Médias */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, alignSelf: "center" }}>
          <TouchableOpacity style={styles.buttonLabel} onPress={pickLabelImage}>
            <Text style={styles.buttonTextLabel}>Prendre une photo de l'étiquette</Text>
            <Image source={require("../assets/icons/photo1.png")} style={[styles.iconRight, { tintColor: "#ececec" }]} />
          </TouchableOpacity>
          {labelPhoto ? (
            <TouchableOpacity onPress={() => setSelectedImage(labelPhoto)}>
              <View style={{ position: "relative", marginLeft: 10, borderRadius: 5, overflow: "hidden" }}>
                <Image source={{ uri: labelPhoto }} style={{ width: 60, height: 60, borderWidth: 2, borderColor: "green", borderRadius: 5 }} />
                <Text style={{ position: "absolute", bottom: 3, right: 4, backgroundColor: labelPhoto.startsWith("http") ? "rgba(217,83,79,0.9)" : "rgba(92,184,92,0.9)", color: "#fff", fontSize: 10, paddingHorizontal: 4, borderRadius: 3 }}>{labelPhoto.startsWith("http") ? "Cloud" : "Local"}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Description */}
        <Text style={styles.label}>Description de la panne</Text>
        <TextInput
          style={styles.input}
          value={description.toUpperCase()}
          onChangeText={(t) => setDescription(t.toUpperCase())}
          multiline
          autoCapitalize="characters"
        />

        {/* Mot de passe */}
        <Text style={styles.label}>Mot de passe (si applicable)</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} />

        {/* Coût */}
        <Text style={styles.label}>Coût de la réparation (€)</Text>
        <TextInput
          style={styles.input}
          value={cost ? String(cost) : ""}
          onChangeText={setCost}
          keyboardType="numeric"
          editable={status !== "Devis en cours"}
          placeholder={status === "Devis en cours" ? "Indisponible en mode Devis" : "Entrez le coût"}
        />

        {/* Cases / Paiement */}
        <View>
          <View style={[styles.checkboxContainer, { marginBottom: 20 }]}>
            <TouchableOpacity onPress={() => setAcceptScreenRisk((prev) => !prev)} style={styles.checkboxRow}>
              <View style={styles.checkbox}>{acceptScreenRisk && (<Image source={require("../assets/icons/checked.png")} style={{ width: 20, height: 20, tintColor: "#007bff" }} resizeMode="contain" />)}</View>
              <Text style={styles.checkboxLabel}>J'accepte le démontage de l'écran de mon produit malgré le risque de casse.</Text>
            </TouchableOpacity>
          </View>

          <View className="checkboxes" style={styles.checkboxContainer}>
            <TouchableOpacity onPress={() => { setPaymentStatus("non_regle"); setPartialPayment(""); setNoCostButRestitution(false); }} style={styles.checkboxRow}>
              <View style={styles.checkbox}>{paymentStatus === "non_regle" && (<Image source={require("../assets/icons/checked.png")} style={{ width: 20, height: 20, tintColor: "#fc0707" }} resizeMode="contain" />)}</View>
              <Text style={styles.checkboxLabel}>Non réglé</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() =>{ setPaymentStatus("reglement_partiel"); setNoCostButRestitution(false); }} style={styles.checkboxRow}>
              <View style={styles.checkbox}>{paymentStatus === "reglement_partiel" && (<Image source={require("../assets/icons/checked.png")} style={{ width: 20, height: 20, tintColor: "#e4a907" }} resizeMode="contain" />)}</View>
              <Text style={styles.checkboxLabel}>Règlement partiel</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setPaymentStatus("solde"); setNoCostButRestitution(false); }} style={styles.checkboxRow}>
              <View style={styles.checkbox}>{paymentStatus === "solde" && (<Image source={require("../assets/icons/checked.png")} style={{ width: 20, height: 20, tintColor: "#4CAF50" }} resizeMode="contain" />)}</View>
              <Text style={styles.checkboxLabel}>Soldé</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { const newValue = !noCostButRestitution; setNoCostButRestitution(newValue); if (newValue) { setPaymentStatus(""); setPartialPayment(""); } }} style={styles.checkboxRow}>
              <View style={styles.checkbox}>{noCostButRestitution && (<Image source={require("../assets/icons/checked.png")} style={{ width: 20, height: 20, tintColor: "#6a1b9a" }} resizeMode="contain" />)}</View>
              <Text style={styles.checkboxLabel}>rien à payer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Acompte */}
        {paymentStatus === "reglement_partiel" && (
          <>
            <Text style={styles.label}>Acompte (€)</Text>
            <TextInput style={styles.input} value={partialPayment ? String(partialPayment) : ""} onChangeText={setPartialPayment} keyboardType="numeric" placeholder="Entrez l'acompte" />
            <Text style={styles.interventionText}>Solde restant dû : { (Math.max((parseFloat(cost)||0) - (parseFloat(partialPayment)||0), 0)).toFixed(2) } €</Text>
          </>
        )}

        {/* Statut & devis */}
        <View style={[styles.rowFlexContainer, status === "En attente de pièces" && { paddingHorizontal: 20 }]}>
          <View style={styles.fullwidthContainer}>
            <Text style={styles.label}>Statut</Text>
            <Picker selectedValue={status} style={styles.input} onValueChange={(itemValue) => { setStatus(itemValue); if (itemValue === "Devis en cours") setCost(""); }}>
              <Picker.Item label="Sélectionnez un statut..." value="default" />
              <Picker.Item label="En attente de pièces" value="En attente de pièces" />
              <Picker.Item label="Devis en cours" value="Devis en cours" />
              <Picker.Item label="Devis accepté" value="Devis accepté" />
              <Picker.Item label="Réparation en cours" value="Réparation en cours" />
              <Picker.Item label="Réparé" value="Réparé" />
              <Picker.Item label="Non réparable" value="Non réparable" />
            </Picker>

            <Text style={styles.label}>Montant du devis (si besoin)</Text>
            {status === "Devis en cours" && (
              <TextInput style={styles.input} placeholder="Montant du devis (€)" placeholderTextColor="#000000" keyboardType="numeric" value={devisCost} onChangeText={setDevisCost} />
            )}

            {/* Fourchette de devis */}
            {status === "Devis en cours" && (
              <>
                <Text style={styles.label}>Fourchette de devis (€)</Text>
                <View style={{ width: "90%", alignSelf: "center", flexDirection: "row", gap: 10 }}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="De ..." placeholderTextColor="#202020" keyboardType="numeric" value={estimateMin} onChangeText={(t) => setEstimateMin(normalizeNumber(t))} />
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="À ..." placeholderTextColor="#202020" keyboardType="numeric" value={estimateMax} onChangeText={(t) => setEstimateMax(normalizeNumber(t))} />
                </View>
                <Text style={styles.label}>Type de fourchette</Text>
                <View style={{ width: "100%", alignSelf: "center" }}>
                  <Picker selectedValue={estimateType} style={styles.input} onValueChange={setEstimateType}>
                    <Picker.Item label="Fourchette plafonnée (acceptée d’office)" value="PLAFOND" />
                    <Picker.Item label="Fourchette indicative (à confirmer)" value="INDICATIF" />
                  </Picker>
                </View>
                <Text style={[styles.interventionText, { width: "90%", alignSelf: "center" }]}>Si “plafond” est choisi, le client accepte un montant maximum garanti (vous facturez ≤ {estimateMax || "…"} €).</Text>
              </>
            )}

            {status !== "Devis en cours" && (
              <View style={styles.halfWidthContainer}>
                <Text style={styles.label}>Coût de la réparation (€)</Text>
                <TextInput style={styles.input} value={cost} onChangeText={setCost} keyboardType="numeric" placeholder="Coût total (€)" placeholderTextColor="#202020" />
              </View>
            )}
          </View>

          {status === "En attente de pièces" && (
            <View style={styles.halfWidthContainer}>
              <Text style={styles.label}>Commande</Text>
              <TextInput style={styles.input} value={commande.toUpperCase()} onChangeText={(t) => setCommande(t.toUpperCase())} autoCapitalize="characters" />
            </View>
          )}
        </View>

        {/* Remarques & chargeur */}
        <Text style={styles.label}>Remarques</Text>
        <TextInput style={styles.input} value={remarks} onChangeText={setRemarks} placeholder="Ajoutez des remarques ici..." multiline />

        <Text style={styles.label}>Chargeur</Text>
        <Picker selectedValue={chargeur} style={styles.input} onValueChange={setChargeur}>
          <Picker.Item label="Non" value="Non" />
          <Picker.Item label="Oui" value="Oui" />
        </Picker>

{/* Galerie */}
{Array.isArray(photos) && photos.filter(Boolean).length > 0 && (
  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
    {photos
      .filter(Boolean)
      .map((item, index) => {
        const refStr = extractRefString(item);
        return (
          <View key={index}>
            <ResolvedImage
              refOrPath={refStr}
              size={100}
              onPress={(uri) => setSelectedImage(uri)}
            />

            <Text
              style={{
                position: "absolute",
                bottom: 9,
                right: 11,
                backgroundColor: refStr.startsWith("file://")
                  ? "rgba(92,184,92,0.9)"
                  : "rgba(217,83,79,0.9)",
                color: "#fff",
                fontSize: 10,
                paddingHorizontal: 4,
                borderRadius: 3,
              }}
            >
              {refStr.startsWith("file://") ? "Local" : "Cloud"}
            </Text>

            <TouchableOpacity
              style={{ position: "absolute", top: 5, right: 5 }}
              onPress={() => deletePhoto(item)}  // on peut passer l'objet d'origine
            >
              <Text style={{ color: "red", fontWeight: "bold" }}>X</Text>
            </TouchableOpacity>
          </View>
        );
      })}
  </View>
)}


        {selectedImage && (
          <Modal visible={true} transparent={true} onRequestClose={() => setSelectedImage(null)}>
            <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
              <View style={styles.modalBackground}>
                <Image source={{ uri: selectedImage }} style={styles.fullImage} />
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        )}

        {/* Actions */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.iconButton, styles.button]} onPress={pickAdditionalImage}>
            <Image source={require("../assets/icons/photo1.png")} style={[styles.checkIcon, { width: 22, height: 22, tintColor: "#f0f0f0", marginRight: 10 }]} />
            <Text style={styles.buttonText}>Prendre une autre photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconButton, styles.saveButton]} onPress={handleSaveIntervention}>
            <Image source={require("../assets/icons/save.png")} style={[styles.checkIcon, { width: 20, height: 20, tintColor: "#fcfcfc", marginRight: 10 }]} />
            <Text style={styles.buttonText}>Sauvegarder l'intervention</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modale info */}
      <Modal transparent={true} visible={alertVisible} animationType="fade" onRequestClose={closeAlert}>
        <View style={styles.modalOverlay}>
          <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>{alertTitle}</Text>
            <Text style={styles.alertMessage}>{alertMessage}</Text>
            <TouchableOpacity style={styles.modalButton} onPress={closeAlert}>
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
// ———————————————————————————————————————————
// Helper: retourne une URI affichable (local → direct, http → direct, bucket → URL signée)
// ———————————————————————————————————————————
const getDisplayUri = async (refOrPath) => {
  if (!refOrPath) return null;

  // file:// local
  if (typeof refOrPath === "string" && refOrPath.startsWith("file://")) {
    try {
      const info = await FileSystem.getInfoAsync(refOrPath);
      return info.exists && !info.isDirectory ? refOrPath : null;
    } catch {
      return null;
    }
  }

  // http(s) déjà prêt
  if (typeof refOrPath === "string" && /^https?:\/\//i.test(refOrPath)) {
    return refOrPath;
  }

  // Objet {url|path|uri} → on extrait une chaîne
  if (refOrPath && typeof refOrPath === "object") {
    const s = refOrPath.url || refOrPath.path || refOrPath.uri || "";
    if (!s) return null;
    return getDisplayUri(s);
  }

  // Sinon: chemin de bucket "images", ex: "supplementaires/<id>/<file>.jpg"
  try {
    const { data, error } = await supabase
      .storage
      .from("images")
      .createSignedUrl(refOrPath, 3600); // 1h
    if (!error && data?.signedUrl) return data.signedUrl;

    const { data: pub } = supabase.storage.from("images").getPublicUrl(refOrPath);
    return pub?.publicUrl || null;
  } catch {
    return null;
  }
};

// ———————————————————————————————————————————
function ResolvedImage({ refOrPath, size = 100, onPress }) {
  const [uri, setUri] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const u = await getDisplayUri(refOrPath);
      if (alive) setUri(u);
    })();
    return () => { alive = false; };
  }, [refOrPath]);

  // Placeholder si pas d'URI
  if (!uri) {
    return (
      <View
        style={{
          width: size,
          height: size,
          margin: 5,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#cfcfcf",
          borderColor: "#aaa",
          borderWidth: 1,
        }}
      >
        <Text style={{ fontSize: 10, color: "#555" }}>—</Text>
      </View>
    );
  }

  const Img = (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, margin: 5, borderRadius: 10, borderColor: "#aaaaaa", borderWidth: 2 }}
      resizeMode="cover"
    />
  );

  if (onPress) {
    return <TouchableOpacity onPress={() => onPress(uri)}>{Img}</TouchableOpacity>;
  }
  return Img;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e0e0e0", paddingHorizontal: 20 },
  clientName: { fontSize: 20, fontWeight: "500", textAlign: "center", marginVertical: 10, color: "#242424" },
  input: { height: 50, padding: 10, marginBottom: 20, borderRadius: 10, backgroundColor: "#cacaca", width: "90%", alignSelf: "center" },
  label: { fontSize: 16, fontWeight: "bold", marginBottom: 5, color: "#242424", width: "90%", alignSelf: "center" },
  rowContainer: { flexDirection: "row", justifyContent: "space-between", width: "95%", alignSelf: "center" },
  halfWidthContainer: { flex: 1 },
  referenceContainer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "90%", alignSelf: "center" },
  referenceInput: { padding: 10, borderRadius: 10, backgroundColor: "#cacaca", width: "100%", fontSize: 16, marginBottom: 5, color: "#242424" },
  checkIcon: { marginLeft: 10 },
  thumbnail: { width: 100, height: 100, margin: 5, borderRadius: 10 },
  labelPhoto: { borderWidth: 3, borderColor: "green" },
  button: { backgroundColor: "#0c0f18", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", flex: 1, alignSelf: "center", marginTop: 20, marginBottom: 20 },
  buttonText: { color: "#cfcdcd", fontWeight: "500" },
  saveButton: { backgroundColor: "#046d16", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", flex: 1, alignSelf: "center", marginTop: 20, marginBottom: 20 },
  saveButtonText: { color: "#f1efef", fontSize: 16, fontWeight: "500" },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.5)" },
  alertBox: { width: 300, padding: 20, backgroundColor: "rgba(255, 255, 255, 0.9)", borderRadius: 20, alignItems: "center" },
  alertTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 10, color: "#333" },
  alertMessage: { fontSize: 16, color: "#666", textAlign: "center", marginBottom: 20 },
  modalBackground: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0, 0, 0, 0.8)" },
  fullImage: { width: "90%", height: "90%", resizeMode: "contain" },
  fullwidthContainer: { flex: 1, width: "48%" },
  rowFlexContainer: { flexDirection: "row", width: "100%" },
  buttonContainer: { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingHorizontal: 40, gap: 10 },
  iconButton: { flexDirection: "row", alignItems: "center", backgroundColor: "#f0f0f0", borderWidth: 1, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 2, justifyContent: "center", flex: 1, marginHorizontal: 5 },
  addButtonText: { color: "#888787", fontSize: 16, fontWeight: "bold" },
  modalButton: { backgroundColor: "#dddddd", paddingVertical: 10, paddingHorizontal: 20, borderWidth: 1, borderRadius: 5, alignItems: "center", justifyContent: "center", alignSelf: "center", marginTop: 20, marginBottom: 20 },
  modalButtonText: { color: "#202020", fontSize: 16, fontWeight: "bold" },
  autreInput: { borderWidth: 1, borderColor: "#888787", padding: 10, marginBottom: 20, borderRadius: 2, backgroundColor: "#191f2f", width: "90%", alignSelf: "center" },
  checkboxContainer: { flexDirection: "row", marginVertical: 10 },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 5, marginRight: 10, marginLeft: 40 },
  checkbox: { width: 28, height: 28, borderWidth: 2, borderColor: "#ccc", borderRadius: 5, justifyContent: "center", alignItems: "center", marginRight: 10, backgroundColor: "#fff" },
  checkboxLabel: { color: "#242424", fontSize: 16, fontWeight: "500" },
  interventionText: { fontSize: 14, color: "#ff4500", fontWeight: "500", marginBottom: 15, width: "90%", alignSelf: "center" },
  buttonLabel: { flexDirection: "row", alignItems: "center", backgroundColor: "#191f2f", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, flexShrink: 1 },
  iconRight: { width: 41, height: 41 },
  buttonTextLabel: { color: "#fff", fontSize: 14, fontWeight: "bold", marginRight: 8 },
});
