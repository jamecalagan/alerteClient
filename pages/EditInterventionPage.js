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
  Pressable,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "../supabaseClient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";


// -------- Helpers string image (version unique) --------
const stripQuotes = (s) =>
  typeof s === "string" &&
  s.length >= 2 &&
  ((s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'")))
    ? s.slice(1, -1)
    : s;

const extractRefString = (v) => {
  if (!v) return "";
  if (typeof v === "string") return stripQuotes(v).trim();
  if (typeof v === "object") {
    const s = v.path || v.url || v.uri || "";
    return stripQuotes(String(s)).trim();
  }
  return "";
};
// ——— Helpers anti-doublons (affichage only) ———
const _stripQuotes = (s) =>
  typeof s === "string" &&
  s.length >= 2 &&
  ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    ? s.slice(1, -1)
    : s;

const _cleanRef = (raw) => {
  if (!raw) return "";
  let s = typeof raw === "string" ? raw : (raw.url || raw.path || raw.uri || "");
  s = String(s);
  s = _stripQuotes(s).trim().replace(/\\+$/g, ""); // supprime backslashes fin
  const q = s.indexOf("?");                        // supprime ?token=...
  if (q > -1) s = s.slice(0, q);
  return s;
};

// Extrait une clé stable relative au bucket "images"
const _bucketKey = (s) => {
  const x = _cleanRef(s);
  if (!x) return "";
  const m = x.match(/\/storage\/v1\/object\/(?:public|sign)\/images\/(.+)$/i);
  if (m && m[1]) return m[1];
  if (x.toLowerCase().startsWith("images/")) return x.slice(7);
  return x; // ex: "supplementaires/.../file.jpg" ou "etiquettes/..."
};

// Retire doublons + enlève l’étiquette si présente dans la liste
const _uniqPhotosForView = (arr, labelRef = null) => {
  const seen = new Set();
  const labelKey = labelRef ? _bucketKey(labelRef) : null;
  const out = [];
  for (const it of (arr || [])) {
    const key = _bucketKey(it);
    if (!key) continue;
    if (labelKey && key === labelKey) continue; // exclure l'étiquette
    if (seen.has(key)) continue;                // enlever doublon
    seen.add(key);
    out.push(_cleanRef(it));
  }
  return out;
};

// détecte une URI locale
const isLocalRef = (s) => typeof s === "string" && s.startsWith("file://");

// upload dans Supabase Storage (bucket "images")
const uploadImageToStorage = async (uri, interventionId, isLabel = false) => {
  const folder = isLabel ? "etiquettes" : "supplementaires";
  const fileName = `${Date.now()}.jpg`;
  const filePath = `${folder}/${interventionId}/${fileName}`;

  const file = { uri, name: fileName, type: "image/jpeg" };
  const { error } = await supabase.storage
    .from("images")
    .upload(filePath, file, { upsert: true, contentType: "image/jpeg" });

  if (error) {
    console.error("Upload error:", error);
    return null;
  }
  const { data } = supabase.storage.from("images").getPublicUrl(filePath);
  return data?.publicUrl || null;
};
// Upload tous les file:// → Supabase et renvoie des URLs cloud
const uploadAllLocalsBeforeSave = async () => {
  const uploadedPhotos = [];
  for (const p of photos) {
    const ref = extractRefString(p);
    const url = await ensureUploaded(ref, interventionId, false); // false = photo supplémentaire
    if (url) uploadedPhotos.push(url);
  }
  const labelRef = extractRefString(labelPhoto);
  const labelUrl = await ensureUploaded(labelRef, interventionId, true); // true = étiquette
  return { uploadedPhotos, labelUrl };
};

// si local => upload et renvoie l’URL, sinon renvoie tel quel
const ensureUploaded = async (uri, interventionId, isLabel = false) => {
  if (!uri) return null;
  if (isLocalRef(uri)) {
    return await uploadImageToStorage(uri, interventionId, isLabel);
  }
  return uri;
};

const isHttpRef = (s) => typeof s === "string" && /^https?:\/\//i.test(s);
const isBucketRef = (s) =>
  typeof s === "string" && !isLocalRef(s) && !isHttpRef(s); // ex: "supplementaires/..."

// On ne conserve en BDD QUE des refs cloud (http ou chemin bucket), jamais du file://
const normalizePhotosForDB = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => (typeof x === "string" ? x : x?.ref || x?.uri || ""))
    .filter((s) => s && (isHttpRef(s) || isBucketRef(s)));
};

// Si on n'a qu'un file:// pour l'étiquette, on n'écrase PAS la BDD.
const normalizeLabelForDB = (current, previous) => {
  const s =
    typeof current === "string" ? current : current?.ref || current?.uri || "";
  if (!s) return previous || null;
  return isLocalRef(s) ? previous || null : s;
};

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

// Récupère le path bucket "images/..." (public ou signé)
const pathFromSupabaseUrl = (url) => {
  try {
    // gère /object/public/images/... ET /object/sign/images/... (avec ?token)
    const m = url.match(
      /\/storage\/v1\/object\/(public|sign)\/images\/(.+?)(\?|$)/
    );
    return m ? m[2] : null; // sans le "images/"
  } catch {
    return null;
  }
};

// Convertit un id Picker vers un type DB
// - si l'id est purement numérique → Number
// - sinon (UUID/texte) → string inchangée
const toDBId = (v) =>
  typeof v === "string" && /^\d+$/.test(v) ? parseInt(v, 10) : v;

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
  const [labelPhotoDB, setLabelPhotoDB] = useState(null);
  // Divers UI
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertTitle, setAlertTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const repairBrokenPhotoUrlsForCurrentIntervention = async () => {
    try {
      const { data: inter, error } = await supabase
        .from("interventions")
        .select("id, photos, label_photo")
        .eq("id", interventionId)
        .maybeSingle();

      if (error || !inter) {
        Alert.alert("Erreur", "Impossible de lire la fiche.");
        return;
      }

      // regex : récupère la première occurrence d’un file:// dans la chaîne
      const extractLocalFromBrokenUrl = (s) => {
        if (typeof s !== "string") return null;
        const m = s.match(/file:\/\/\/[^"\\]+/);
        return m ? m[0] : null;
      };

      const reupload = async (localUri, isLabel = false) => {
        try {
          // vérifier existence
          const info = await FileSystem.getInfoAsync(localUri);
          if (!info.exists || info.isDirectory) return null;

          // (optionnel) recompression
          let src = localUri;
          try {
            const comp = await ImageManipulator.manipulateAsync(
              localUri,
              [{ resize: { width: 1200 } }],
              { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
            );
            src = comp.uri;
          } catch {}

          const folder = isLabel ? "etiquettes" : "supplementaires";
          const fileName = `${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}.jpg`;
          const path = `${folder}/${interventionId}/${fileName}`;
          const file = { uri: src, name: fileName, type: "image/jpeg" };

          const { error: upErr } = await supabase.storage
            .from("images")
            .upload(path, file, { upsert: true, contentType: "image/jpeg" });
          if (upErr) return null;

          const { data: pub } = supabase.storage
            .from("images")
            .getPublicUrl(path);
          return pub?.publicUrl || null;
        } catch {
          return null;
        }
      };

      // 1) photos
      const oldPhotos = Array.isArray(inter.photos) ? inter.photos : [];
      const newPhotos = [];
      let changed = false;

      for (const p of oldPhotos) {
        const s = typeof p === "string" ? p : p?.url || p?.path || p?.uri || "";
        if (!s) continue;

        // cas “cassé” : URL http qui contient… un file:// dedans
        if (/^https?:\/\//i.test(s) && s.includes("file://")) {
          const local = extractLocalFromBrokenUrl(s);
          if (local) {
            const url = await reupload(local, false);
            if (url) {
              newPhotos.push(url);
              changed = true;
              continue;
            }
          }
          // si on ne peut pas réparer, on laisse pour traitement manuel
          newPhotos.push(s);
        } else if (s.startsWith("file://")) {
          // vrai file:// pur → réupload
          const url = await reupload(s, false);
          newPhotos.push(url || s);
          if (url) changed = true;
        } else {
          // déjà OK
          newPhotos.push(s);
        }
      }

      // 2) label
      let newLabel = inter.label_photo ?? null;
      if (typeof newLabel === "string") {
        if (newLabel.includes("file://")) {
          const local = extractLocalFromBrokenUrl(newLabel) || newLabel;
          if (local.startsWith("file://")) {
            const url = await reupload(local, true);
            if (url) {
              newLabel = url;
              changed = true;
            }
          }
        } else if (newLabel.startsWith("file://")) {
          const url = await reupload(newLabel, true);
          if (url) {
            newLabel = url;
            changed = true;
          }
        }
      }

      if (!changed) {
        Alert.alert("Info", "Rien à réparer pour cette fiche.");
        return;
      }

      const { error: updErr } = await supabase
        .from("interventions")
        .update({
          photos: newPhotos,
          label_photo: newLabel,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", interventionId);

      if (updErr) {
        Alert.alert("Erreur", "La base n’a pas pu être mise à jour.");
        return;
      }

      setPhotos(newPhotos);
      setLabelPhoto(newLabel);
      Alert.alert("OK", "Photos réparées (cloud) pour cette fiche.");
    } catch (e) {
      console.error("repairBrokenPhotoUrlsForCurrentIntervention:", e);
      Alert.alert("Erreur", "Problème pendant la réparation.");
    }
  };

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
  // Répare la fiche: remplace chaque file:// par une URL publique Supabase
  const fixLocalPhotosForCurrentIntervention = async () => {
    try {
      const { data: inter, error } = await supabase
        .from("interventions")
        .select("id, photos, label_photo")
        .eq("id", interventionId)
        .maybeSingle();
      if (error || !inter) {
        Alert.alert("Erreur", "Impossible de lire la fiche.");
        return;
      }

      // Utilitaire pour uploader une image locale et renvoyer une URL publique
      const reuploadLocal = async (localUri, isLabel = false) => {
        try {
          // compress + upload (tu peux réutiliser ta fonction existante si tu veux)
          const fileName = `${Date.now()}.jpg`;
          const folder = isLabel ? "etiquettes" : "supplementaires";
          const path = `${folder}/${interventionId}/${fileName}`;
          const file = { uri: localUri, name: fileName, type: "image/jpeg" };
          const { error: upErr } = await supabase.storage
            .from("images")
            .upload(path, file, { upsert: true, contentType: "image/jpeg" });
          if (upErr) return null;
          const { data: pub } = supabase.storage
            .from("images")
            .getPublicUrl(path);
          return pub?.publicUrl || null;
        } catch {
          return null;
        }
      };

      // 1) Photos
      const oldPhotos = Array.isArray(inter.photos) ? inter.photos : [];
      const fixedPhotos = [];
      for (const p of oldPhotos) {
        const s = typeof p === "string" ? p : p?.url || p?.path || p?.uri || "";
        if (s && s.startsWith("file://")) {
          const url = await reuploadLocal(s, false);
          if (url) fixedPhotos.push(url);
        } else if (s) {
          fixedPhotos.push(s); // déjà cloud
        }
      }

      // 2) Étiquette
      let newLabel = inter.label_photo || null;
      if (
        newLabel &&
        typeof newLabel === "string" &&
        newLabel.startsWith("file://")
      ) {
        const url = await reuploadLocal(newLabel, true);
        if (url) newLabel = url;
      }

      // 3) MAJ BDD
      const { error: updErr } = await supabase
        .from("interventions")
        .update({
          photos: fixedPhotos,
          label_photo: newLabel,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", interventionId);
      if (updErr) {
        Alert.alert("Erreur", "Impossible de corriger la fiche en base.");
        return;
      }

      // 4) MAJ UI + reload
      setPhotos(fixedPhotos);
      setLabelPhoto(newLabel);
      Alert.alert("OK", "Les photos locales ont été basculées en cloud.");
    } catch (e) {
      console.error("fixLocalPhotosForCurrentIntervention:", e);
      Alert.alert("Erreur", "Problème pendant la correction.");
    }
  };

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
    if (!error && data)
      setBrands(data.map((b) => ({ id: String(b.id), nom: b.nom })));
  };

  const loadModels = async (brandId) => {
    const { data, error } = await supabase
      .from("modele")
      .select("id, nom")
      .eq("marque_id", toDBId(brandId))
      .order("nom");
    if (!error && data)
      setModels(data.map((m) => ({ id: String(m.id), nom: m.nom })));
  };

  // ———————————————————————————————————————————
  // Charger l'intervention + hydrater en respectant l'ordre
  // ———————————————————————————————————————————
  const loadIntervention = async () => {
    try {
      const [
        { data: inter, error: errInter },
        { data: client, error: errCli },
      ] = await Promise.all([
        supabase
          .from("interventions")
          .select(
            "article_id, marque_id, modele_id, deviceType, brand, model, reference, description, cost, partialPayment, solderestant, status, commande, createdAt, serial_number, password, chargeur, photos, label_photo, remarks, paymentStatus, accept_screen_risk, devis_cost, is_estimate, estimate_min, estimate_max, estimate_type, estimate_accepted, estimate_accepted_at"
          )
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
      const localBase =
        FileSystem.documentDirectory + `backup/${client.ficheNumber}/`;
      // Remplace ta version actuelle par celle-ci
      const urlToLocal = async (anyRef, type = "photo", index = 0) => {
        // 1) on extrait une chaîne exploitable (objets {url|path|uri} acceptés)
        const s = extractRefString(anyRef);
        if (!s) return null;

        // 2) on tente le fallback local (mêmes noms "déterministes" qu'avant)
        const filename =
          type === "label"
            ? `etiquette_${interventionId}.jpg`
            : `photo_${interventionId}_${index + 1}.jpg`;
        const localUri = localBase + filename;

        // 3) règles :
        // - si le local existe -> on affiche le local (rapide)
        // - sinon -> on renvoie la ref d'origine (http ou chemin bucket)
        const exists = await fileExists(localUri);
        if (exists) return localUri;

        // si c'est une URL http (publique ou signée) -> on renvoie l'URL
        if (s.startsWith("http")) return s;

        // sinon c'est un chemin de bucket "supplementaires/...": on renvoie tel quel
        // (ResolvedImage/getDisplayUri fera createSignedUrl au rendu)
        return s;
      };

      const photosArray = Array.isArray(inter.photos) ? inter.photos : [];
      const photosResolved = await Promise.all(
        photosArray.map((u, idx) => urlToLocal(u, "photo", idx))
      );
      const labelResolved = await urlToLocal(inter.label_photo, "label");

      // Hydratation simple
      setReference(inter.reference || "");
      setDescription(inter.description || "");
      setCost(inter.cost != null ? String(inter.cost) : "");
      setDevisCost(inter.devis_cost != null ? String(inter.devis_cost) : "");
      setSolderestant(
        inter.solderestant != null ? String(inter.solderestant) : ""
      );
      setPartialPayment(
        inter.partialPayment != null ? String(inter.partialPayment) : ""
      );
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
      setLabelPhotoDB(
        typeof inter?.label_photo === "string"
          ? inter.label_photo
          : inter?.label_photo?.ref || inter?.label_photo?.uri || null
      );
      // Fourchette
      setEstimateMin(
        inter.estimate_min != null ? String(inter.estimate_min) : ""
      );
      setEstimateMax(
        inter.estimate_max != null ? String(inter.estimate_max) : ""
      );
      setEstimateType(inter.estimate_type || "PLAFOND");
      // ——— Fallback si les IDs sont nuls mais qu'on a les libellés texte ———
      try {
        // Article par nom
        if (
          (inter.article_id == null || inter.article_id === "") &&
          inter.deviceType
        ) {
          const { data: artRow } = await supabase
            .from("article")
            .select("id")
            .ilike("nom", inter.deviceType) // ou .eq("nom", inter.deviceType) si nom exact
            .limit(1)
            .maybeSingle();
          if (artRow?.id) inter.article_id = artRow.id;
        }

        // Marque par nom + article_id
        if (
          (inter.marque_id == null || inter.marque_id === "") &&
          inter.brand &&
          inter.article_id != null
        ) {
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
        if (
          (inter.modele_id == null || inter.modele_id === "") &&
          inter.model &&
          inter.marque_id != null
        ) {
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
      console.log(
        "📦 Inter article_id:",
        inter.article_id,
        "→ state:",
        String(inter.article_id)
      );
      console.log(
        "📦 Inter marque_id:",
        inter.marque_id,
        "→ state:",
        String(inter.marque_id)
      );
      console.log(
        "📦 Inter modele_id:",
        inter.modele_id,
        "→ state:",
        String(inter.modele_id)
      );
    } catch (e) {
      console.error("❌ Erreur loadIntervention :", e);
    }
  };

  const deleteLabelPhoto = async (photoRefRaw) => {
    const photoRef = extractRefString(photoRefRaw);

    Alert.alert(
      "Supprimer l’étiquette ?",
      "Cette action supprimera l’étiquette du stockage et de la fiche.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              // Déterminer chemin cloud
              let path = null;
              if (photoRef && photoRef.startsWith("http")) {
                path = pathFromSupabaseUrl(photoRef);
              } else if (photoRef && !photoRef.startsWith("file://")) {
                path = photoRef;
              }

              // Supprimer du bucket
              if (path) {
                const { error: rmErr } = await supabase.storage
                  .from("images")
                  .remove([path]);
                if (rmErr)
                  console.error("Erreur suppression cloud :", rmErr.message);
              }

              // MAJ local
              setLabelPhoto(null);

              // MAJ BDD
              const { error: dbErr } = await supabase
                .from("interventions")
                .update({ label_photo: null })
                .eq("id", interventionId);

              if (dbErr) {
                console.error("Erreur MAJ BDD :", dbErr.message);
                Alert.alert("Erreur", "Impossible de mettre à jour la fiche.");
              }
            } catch (e) {
              console.error("Erreur générale suppression étiquette :", e);
              Alert.alert("Erreur", "Problème lors de la suppression.");
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
        const url = await uploadImageToStorage(
          compressedImage.uri,
          interventionId,
          true
        );
        if (url) setLabelPhoto(url);
        setLabelPhotoDB(url); // on mémorise la ref cloud pour la BDD
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
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const imageUri = result.assets[0].uri;

      const compressedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      const url = await uploadImageToStorage(
        compressedImage.uri,
        interventionId,
        false
      );
      if (!url) {
        Alert.alert("Erreur", "Upload impossible, photo non ajoutée.");
        return;
      }

      // État local
      let next = [];
      setPhotos((prev) => {
        next = [...prev, url];
        return next;
      });

      // MAJ BDD immédiate (uniquement cloud)
      const { error: dbErr } = await supabase
        .from("interventions")
        .update({ photos: next })
        .eq("id", interventionId);

      if (dbErr) {
        console.error("MAJ BDD (photos) :", dbErr.message);
        Alert.alert(
          "Erreur",
          "Photo ajoutée localement, base non mise à jour."
        );
      }
    } catch (e) {
      console.error("Erreur capture image :", e);
      Alert.alert("Erreur", "Impossible d'ajouter la photo.");
    }
  };

  // ———————————————————————————————————————————
  // Sauvegarde
  // ———————————————————————————————————————————
const handleSaveIntervention = async () => {
  console.log("▶️ handleSaveIntervention appelé");

  if (!interventionId) {
    setAlertTitle("Erreur");
    setAlertMessage("ID d'intervention manquant.");
    setAlertVisible(true);
    return;
  }
  if (selectedImage) setSelectedImage(null);

  // --- Validation de base
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
    setAlertTitle("Erreur");
    setAlertMessage("Champs manquants ou incorrects :\n\n" + errors.join("\n"));
    setAlertVisible(true);
    return;
  }

  // --- Montants
  const costValue = parseFloat(cost) || 0;
  const partialPaymentValue = parseFloat(partialPayment) || 0;
  const solderestantValue =
    paymentStatus === "reglement_partiel"
      ? Math.max(costValue - partialPaymentValue, 0)
      : paymentStatus === "solde"
      ? 0
      : costValue;

  const isEstimateMode = status === "Devis en cours";

  // --- IMPORTANT : upload de TOUTES les refs locales AVANT l’update
  // Photos
  const photosCloud = [];
  for (const p of Array.isArray(photos) ? photos : []) {
    const ref = extractRefString(p);
    if (!ref) continue;
    if (isLocalRef(ref)) {
      const url = await uploadImageToStorage(ref, interventionId, false);
      if (url) photosCloud.push(url);
    } else {
      photosCloud.push(ref);
    }
  }

  // Label
  let labelCloud = null;
  if (labelPhoto) {
    const ref = extractRefString(labelPhoto);
    if (isLocalRef(ref)) {
      labelCloud = await uploadImageToStorage(ref, interventionId, true);
    } else {
      labelCloud = ref;
    }
  }

  const updatedIntervention = {
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
    photos: photosCloud,     // ⬅️ uniquement CLOUD
    label_photo: labelCloud, // ⬅️ uniquement CLOUD
    commande,
    remarks,
    paymentStatus,
    chargeur: chargeur === "Oui",
    accept_screen_risk: acceptScreenRisk,
    // Fourchette
    estimate_min: isEstimateMode ? parseFloat(normalizeNumber(estimateMin)) : null,
    estimate_max: isEstimateMode ? parseFloat(normalizeNumber(estimateMax)) : null,
    estimate_type: isEstimateMode ? estimateType : null,
    is_estimate: isEstimateMode,
    estimate_accepted: isEstimateMode && estimateType === "PLAFOND" ? true : null,
    estimate_accepted_at: isEstimateMode && estimateType === "PLAFOND" ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
  };

  const formattedDevisCost =
    isEstimateMode && devisCost ? parseFloat(devisCost) : null;
  if (isEstimateMode) updatedIntervention.devis_cost = formattedDevisCost;

  console.log("🟦 Payload update:", updatedIntervention);

  try {
    const { data, error } = await supabase
      .from("interventions")
      .update(updatedIntervention)
      .eq("id", interventionId)
      .select();

    if (error) {
      console.log("❌ Supabase update error:", error);
      throw error;
    }
    if (!data || data.length === 0) {
      setAlertTitle("Erreur");
      setAlertMessage("Aucune fiche mise à jour (id introuvable ?).");
      setAlertVisible(true);
      return;
    }

    // ✅ Mets à jour l’état local avec les URLs cloud (pour voir tout de suite)
    setPhotos(photosCloud);
    setLabelPhoto(labelCloud);

    setAlertTitle("Succès");
    setAlertMessage("Intervention mise à jour avec succès.");
    setAlertVisible(true);
  } catch (err) {
    console.log("❌ Exception update:", err);
    setAlertTitle("Erreur");
    setAlertMessage("Erreur lors de la mise à jour de l'intervention.");
    setAlertVisible(true);
  }
};


  const deletePhoto = (photoRefRaw) => {
    const photoRef = extractRefString(photoRefRaw);
    Alert.alert(
      "Supprimer cette image ?",
      "Cette action supprimera l'image du stockage et de la fiche.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              let path = null;
              if (photoRef && photoRef.startsWith("http")) {
                path = pathFromSupabaseUrl(photoRef);
              } else if (photoRef && photoRef.startsWith("file://")) {
                path = null;
              } else if (photoRef) {
                path = photoRef;
              }

              if (path) {
                const { error: rmErr } = await supabase.storage
                  .from("images")
                  .remove([path]);
                if (rmErr) console.error("Suppression cloud :", rmErr.message);
              }

              let newPhotos = [];
              setPhotos((prev) => {
                newPhotos = prev.filter(
                  (p) => extractRefString(p) !== photoRef
                );
                return newPhotos;
              });

              const { error: dbErr } = await supabase
                .from("interventions")
                .update({
                  photos: normalizePhotosForDB(newPhotos),
                })
                .eq("id", interventionId);

              if (dbErr) {
                console.error("MAJ BDD :", dbErr.message);
                Alert.alert("Erreur", "Impossible de mettre à jour la base.");
              }
            } catch (e) {
              console.error("Erreur suppression :", e);
              Alert.alert("Erreur", "Problème pendant la suppression.");
            }
          },
        },
      ]
    );
  };

const closeAlert = () => {
  console.log("ℹ️ closeAlert, title=", alertTitle);
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,
            alignSelf: "center",
          }}
        >
          <TouchableOpacity style={styles.buttonLabel} onPress={pickLabelImage}>
            <Text style={styles.buttonTextLabel}>
              Prendre une photo de l'étiquette
            </Text>
            <Image
              source={require("../assets/icons/photo1.png")}
              style={[styles.iconRight, { tintColor: "#ececec" }]}
            />
          </TouchableOpacity>
          {labelPhoto ? (
            <View
              style={{
                marginLeft: 10,
                alignItems: "center",
              }}
            >
              {(() => {
                const labelRaw = extractRefString(labelPhotoDB ?? labelPhoto);
                const isLocal = isLocalRef(labelRaw);

                return (
                  <TouchableOpacity
                    onPress={() => setSelectedImage(labelPhoto)}
                    onLongPress={() => deleteLabelPhoto(labelRaw)}
                    delayLongPress={400}
                    activeOpacity={0.85}
                    style={[styles.thumbWrap, styles.labelWrap]}
                  >
                    {/* Affichage robuste */}
                    <ResolvedImage
                      refOrPath={labelPhoto}
                      size={80}
                      style={styles.labelOutline}
                    />

                  </TouchableOpacity>
                );
              })()}
            </View>
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
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />

        {/* Coût */}
        <Text style={styles.label}>Coût de la réparation (€)</Text>
        <TextInput
          style={styles.input}
          value={cost ? String(cost) : ""}
          onChangeText={setCost}
          keyboardType="numeric"
          editable={status !== "Devis en cours"}
          placeholder={
            status === "Devis en cours"
              ? "Indisponible en mode Devis"
              : "Entrez le coût"
          }
        />

        {/* Cases / Paiement */}
        <View>
          <View style={[styles.checkboxContainer, { marginBottom: 20 }]}>
            <TouchableOpacity
              onPress={() => setAcceptScreenRisk((prev) => !prev)}
              style={styles.checkboxRow}
            >
              <View style={styles.checkbox}>
                {acceptScreenRisk && (
                  <Image
                    source={require("../assets/icons/checked.png")}
                    style={{
                      width: 20,
                      height: 20,
                      tintColor: "#007bff",
                    }}
                    resizeMode="contain"
                  />
                )}
              </View>
              <Text style={styles.checkboxLabel}>
                J'accepte le démontage de l'écran de mon produit malgré le
                risque de casse.
              </Text>
            </TouchableOpacity>
          </View>

          <View className="checkboxes" style={styles.checkboxContainer}>
            <TouchableOpacity
              onPress={() => {
                setPaymentStatus("non_regle");
                setPartialPayment("");
                setNoCostButRestitution(false);
              }}
              style={styles.checkboxRow}
            >
              <View style={styles.checkbox}>
                {paymentStatus === "non_regle" && (
                  <Image
                    source={require("../assets/icons/checked.png")}
                    style={{
                      width: 20,
                      height: 20,
                      tintColor: "#fc0707",
                    }}
                    resizeMode="contain"
                  />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Non réglé</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setPaymentStatus("reglement_partiel");
                setNoCostButRestitution(false);
              }}
              style={styles.checkboxRow}
            >
              <View style={styles.checkbox}>
                {paymentStatus === "reglement_partiel" && (
                  <Image
                    source={require("../assets/icons/checked.png")}
                    style={{
                      width: 20,
                      height: 20,
                      tintColor: "#e4a907",
                    }}
                    resizeMode="contain"
                  />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Règlement partiel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setPaymentStatus("solde");
                setNoCostButRestitution(false);
              }}
              style={styles.checkboxRow}
            >
              <View style={styles.checkbox}>
                {paymentStatus === "solde" && (
                  <Image
                    source={require("../assets/icons/checked.png")}
                    style={{
                      width: 20,
                      height: 20,
                      tintColor: "#4CAF50",
                    }}
                    resizeMode="contain"
                  />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Soldé</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const newValue = !noCostButRestitution;
                setNoCostButRestitution(newValue);
                if (newValue) {
                  setPaymentStatus("");
                  setPartialPayment("");
                }
              }}
              style={styles.checkboxRow}
            >
              <View style={styles.checkbox}>
                {noCostButRestitution && (
                  <Image
                    source={require("../assets/icons/checked.png")}
                    style={{
                      width: 20,
                      height: 20,
                      tintColor: "#6a1b9a",
                    }}
                    resizeMode="contain"
                  />
                )}
              </View>
              <Text style={styles.checkboxLabel}>rien à payer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Acompte */}
        {paymentStatus === "reglement_partiel" && (
          <>
            <Text style={styles.label}>Acompte (€)</Text>
            <TextInput
              style={styles.input}
              value={partialPayment ? String(partialPayment) : ""}
              onChangeText={setPartialPayment}
              keyboardType="numeric"
              placeholder="Entrez l'acompte"
            />
            <Text style={styles.interventionText}>
              Solde restant dû :{" "}
              {Math.max(
                (parseFloat(cost) || 0) - (parseFloat(partialPayment) || 0),
                0
              ).toFixed(2)}{" "}
              €
            </Text>
          </>
        )}

        {/* Statut & devis */}
        <View
          style={[
            styles.rowFlexContainer,
            status === "En attente de pièces" && {
              paddingHorizontal: 20,
            },
          ]}
        >
          <View style={styles.fullwidthContainer}>
            <Text style={styles.label}>Statut</Text>
            <Picker
              selectedValue={status}
              style={styles.input}
              onValueChange={(itemValue) => {
                setStatus(itemValue);
                if (itemValue === "Devis en cours") setCost("");
              }}
            >
              <Picker.Item label="Sélectionnez un statut..." value="default" />
              <Picker.Item
                label="En attente de pièces"
                value="En attente de pièces"
              />
              <Picker.Item label="Devis en cours" value="Devis en cours" />
              <Picker.Item label="Devis accepté" value="Devis accepté" />
              <Picker.Item
                label="Réparation en cours"
                value="Réparation en cours"
              />
              <Picker.Item label="Réparé" value="Réparé" />
              <Picker.Item label="Non réparable" value="Non réparable" />
            </Picker>

            <Text style={styles.label}>Montant du devis (si besoin)</Text>
            {status === "Devis en cours" && (
              <TextInput
                style={styles.input}
                placeholder="Montant du devis (€)"
                placeholderTextColor="#000000"
                keyboardType="numeric"
                value={devisCost}
                onChangeText={setDevisCost}
              />
            )}

            {/* Fourchette de devis */}
            {status === "Devis en cours" && (
              <>
                <Text style={styles.label}>Fourchette de devis (€)</Text>
                <View
                  style={{
                    width: "90%",
                    alignSelf: "center",
                    flexDirection: "row",
                    gap: 10,
                  }}
                >
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="De ..."
                    placeholderTextColor="#202020"
                    keyboardType="numeric"
                    value={estimateMin}
                    onChangeText={(t) => setEstimateMin(normalizeNumber(t))}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="À ..."
                    placeholderTextColor="#202020"
                    keyboardType="numeric"
                    value={estimateMax}
                    onChangeText={(t) => setEstimateMax(normalizeNumber(t))}
                  />
                </View>
                <Text style={styles.label}>Type de fourchette</Text>
                <View
                  style={{
                    width: "100%",
                    alignSelf: "center",
                  }}
                >
                  <Picker
                    selectedValue={estimateType}
                    style={styles.input}
                    onValueChange={setEstimateType}
                  >
                    <Picker.Item
                      label="Fourchette plafonnée (acceptée d’office)"
                      value="PLAFOND"
                    />
                    <Picker.Item
                      label="Fourchette indicative (à confirmer)"
                      value="INDICATIF"
                    />
                  </Picker>
                </View>
                <Text
                  style={[
                    styles.interventionText,
                    { width: "90%", alignSelf: "center" },
                  ]}
                >
                  Si “plafond” est choisi, le client accepte un montant maximum
                  garanti (vous facturez ≤ {estimateMax || "…"} €).
                </Text>
              </>
            )}

            {status !== "Devis en cours" && (
              <View style={styles.halfWidthContainer}>
                <Text style={styles.label}>Coût de la réparation (€)</Text>
                <TextInput
                  style={styles.input}
                  value={cost}
                  onChangeText={setCost}
                  keyboardType="numeric"
                  placeholder="Coût total (€)"
                  placeholderTextColor="#202020"
                />
              </View>
            )}
          </View>

          {status === "En attente de pièces" && (
            <View style={styles.halfWidthContainer}>
              <Text style={styles.label}>Commande</Text>
              <TextInput
                style={styles.input}
                value={commande.toUpperCase()}
                onChangeText={(t) => setCommande(t.toUpperCase())}
                autoCapitalize="characters"
              />
            </View>
          )}
        </View>

        {/* Remarques & chargeur */}
        <Text style={styles.label}>Remarques</Text>
        <TextInput
          style={styles.input}
          value={remarks}
          onChangeText={setRemarks}
          placeholder="Ajoutez des remarques ici..."
          multiline
        />

        <Text style={styles.label}>Chargeur</Text>
        <Picker
          selectedValue={chargeur}
          style={styles.input}
          onValueChange={setChargeur}
        >
          <Picker.Item label="Non" value="Non" />
          <Picker.Item label="Oui" value="Oui" />
        </Picker>
        {/* <TouchableOpacity onPress={fixLocalPhotosForCurrentIntervention} style={{padding:8, backgroundColor:"#1976d2", borderRadius:6, alignSelf:"center"}}>
  <Text style={{color:"#fff", fontWeight:"700"}}>Corriger les photos locales → cloud</Text>
</TouchableOpacity> */}

        {/* Galerie (carrousel horizontal centré) */}
        {Array.isArray(photos) && photos.filter(Boolean).length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 8 }]}>
              Photos supplémentaires
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.galleryScroll}
              contentContainerStyle={styles.galleryContent}
            >
{/* Galerie */}
{Array.isArray(photos) && _uniqPhotosForView(photos, labelPhotoDB ?? labelPhoto).length > 0 && (
  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center" }}>
{_uniqPhotosForView(photos, labelPhotoDB ?? labelPhoto).map((refStr, index) => {
  return (
    <View key={`${_bucketKey(refStr)}-${index}`} style={{ margin: 6, alignItems: "center" }}>
      <Pressable
        onPress={() => setSelectedImage(refStr)}
        onLongPress={() => deletePhoto(refStr)}
        delayLongPress={400}
        style={styles.thumbWrap}
      >
        <ResolvedImage
          refOrPath={refStr}
          size={100}
          // le badge est désormais géré dedans, et l'image
          // disparaît si non résolue (pas de cadre vide)
        />
      </Pressable>
    </View>
  );
})}
  </View>
)}

            </ScrollView>
          </>
        )}

        {selectedImage && (
          <Modal
            visible={true}
            transparent={true}
            onRequestClose={() => setSelectedImage(null)}
          >
            <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
              <View style={styles.modalBackground}>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.fullImage}
                />
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        )}

        {/* Actions */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.iconButton, styles.button]}
            onPress={pickAdditionalImage}
          >
            <Image
              source={require("../assets/icons/photo1.png")}
              style={[
                styles.checkIcon,
                {
                  width: 22,
                  height: 22,
                  tintColor: "#f0f0f0",
                  marginRight: 10,
                },
              ]}
            />
            <Text style={styles.buttonText}>Prendre une autre photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, styles.saveButton]}
            onPress={handleSaveIntervention}
          >
            <Image
              source={require("../assets/icons/save.png")}
              style={[
                styles.checkIcon,
                {
                  width: 20,
                  height: 20,
                  tintColor: "#fcfcfc",
                  marginRight: 10,
                },
              ]}
            />
            <Text style={styles.buttonText}>Sauvegarder l'intervention</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modale info */}
      <Modal
        transparent={true}
        visible={alertVisible}
        animationType="fade"
        onRequestClose={closeAlert}
      >
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
// ———————————————————————————————————————————
// Helper: retourne une URI affichable (local → direct, http → direct, bucket → URL signée/public)
// Durci : supprime guillemets, espaces, backslashes de fin, garde ?token si présent
// ———————————————————————————————————————————
const getDisplayUri = async (refOrPath) => {
  // normalisation de base
  const stripQuotes = (s) =>
    typeof s === "string" &&
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'")))
      ? s.slice(1, -1)
      : s;

  let raw = refOrPath;
  if (raw && typeof raw === "object")
    raw = raw.path || raw.url || raw.uri || "";
  raw = stripQuotes(String(raw || "")).trim().replace(/\\+$/g, ""); // ⬅ backslashes de fin

  if (!raw) return null;

  // 1) local direct (et vérifie l’existence)
  if (raw.startsWith("file://")) {
    try {
      const info = await FileSystem.getInfoAsync(raw);
      return info.exists && !info.isDirectory ? raw : null;
    } catch {
      return null;
    }
  }

  // 2) déjà une URL http(s) (on la garde telle quelle, y compris ?token)
  if (/^https?:\/\//i.test(raw)) return raw;

  // 3) chemin bucket -> tente URL signée puis publique
  const clean = raw.replace(/^\/+/, ""); // enlève les "/" de tête
  const variants = clean.toLowerCase().startsWith("images/")
    ? [clean.slice("images/".length), clean]           // relatif + complet
    : [clean, "images/" + clean];                      // relatif + complet

  for (const p of variants) {
    try {
      const rel = p.toLowerCase().startsWith("images/")
        ? p.slice("images/".length)
        : p;

      // a) signée (si bucket privé)
      const { data: sdata, error: serr } = await supabase.storage
        .from("images")
        .createSignedUrl(rel, 3600); // 1h
      if (!serr && sdata?.signedUrl) return sdata.signedUrl;

      // b) publique (si bucket public)
      const { data: pub } = supabase.storage.from("images").getPublicUrl(rel);
      if (pub?.publicUrl) return pub.publicUrl;
    } catch {}
  }

  return null;
};

// ———————————————————————————————————————————
function ResolvedImage({
  refOrPath,
  size = 100,
  onPress,
  style,
  showBadge = true,
}) {
  const [uri, setUri] = React.useState(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setLoaded(false);
    (async () => {
      const u = await getDisplayUri(refOrPath);
      if (alive) setUri(u || null);
    })();
    return () => { alive = false; };
  }, [refOrPath]);

  const isLocal =
    typeof refOrPath === "string" && refOrPath.startsWith("file://");

  // Tant qu’on n’a pas d’URI résolue → ne rien rendre (pas de cadre, pas de badge)
  if (!uri) return null;

  const Img = (
    <View style={{ position: "relative" }}>
      <Image
        source={{ uri }}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false);
          setUri(null); // force disparition si l’URL ne charge pas
        }}
        style={[
          {
            width: size,
            height: size,
            margin: 5,
            borderRadius: 10,
            borderColor: loaded ? "#aaaaaa" : "transparent",
            borderWidth: loaded ? 2 : 0,
            backgroundColor: loaded ? "transparent" : "transparent",
          },
          style,
        ]}
        resizeMode="cover"
      />

      {/* Badge seulement si l’image a VRAIMENT chargé */}
      {loaded && showBadge && (
        <View
          style={{
            position: "absolute",
            bottom: 6,
            right: 6,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
            backgroundColor: isLocal
              ? "rgba(92,184,92,0.95)"
              : "rgba(217,83,79,0.95)",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
            {isLocal ? "Local" : "Cloud"}
          </Text>
        </View>
      )}
    </View>
  );

  return onPress ? <TouchableOpacity onPress={() => onPress(uri)}>{Img}</TouchableOpacity> : Img;
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#e0e0e0", paddingHorizontal: 20 },
  clientName: {
    fontSize: 20,
    fontWeight: "500",
    textAlign: "center",
    marginVertical: 10,
    color: "#242424",
  },
  input: {
    height: 50,
    padding: 10,
    marginBottom: 20,
    borderRadius: 10,
    backgroundColor: "#cacaca",
    width: "90%",
    alignSelf: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 5,
    color: "#242424",
    width: "90%",
    alignSelf: "center",
  },
  rowContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "95%",
    alignSelf: "center",
  },
  halfWidthContainer: { flex: 1 },
  referenceContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "90%",
    alignSelf: "center",
  },
  referenceInput: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#cacaca",
    width: "100%",
    fontSize: 16,
    marginBottom: 5,
    color: "#242424",
  },
  checkIcon: { marginLeft: 10 },
  thumbnail: { width: 100, height: 100, margin: 5, borderRadius: 10 },
  labelPhoto: { borderWidth: 3, borderColor: "green" },
  button: {
    backgroundColor: "#0c0f18",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  buttonText: { color: "#cfcdcd", fontWeight: "500" },
  saveButton: {
    backgroundColor: "#046d16",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  saveButtonText: { color: "#f1efef", fontSize: 16, fontWeight: "500" },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  alertBox: {
    width: 300,
    padding: 20,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 20,
    alignItems: "center",
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  alertMessage: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  modalBackground: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  fullImage: { width: "90%", height: "90%", resizeMode: "contain" },
  fullwidthContainer: { flex: 1, width: "48%" },
  rowFlexContainer: { flexDirection: "row", width: "100%" },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 40,
    gap: 10,
  },
  iconButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 2,
    justifyContent: "center",
    flex: 1,
    marginHorizontal: 5,
  },
  addButtonText: { color: "#888787", fontSize: 16, fontWeight: "bold" },
  modalButton: {
    backgroundColor: "#dddddd",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  modalButtonText: { color: "#202020", fontSize: 16, fontWeight: "bold" },
  autreInput: {
    borderWidth: 1,
    borderColor: "#888787",
    padding: 10,
    marginBottom: 20,
    borderRadius: 2,
    backgroundColor: "#191f2f",
    width: "90%",
    alignSelf: "center",
  },
  checkboxContainer: { flexDirection: "row", marginVertical: 10 },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
    marginRight: 10,
    marginLeft: 40,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: "#ccc",
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    backgroundColor: "#fff",
  },
  checkboxLabel: { color: "#242424", fontSize: 16, fontWeight: "500" },
  interventionText: {
    fontSize: 14,
    color: "#ff4500",
    fontWeight: "500",
    marginBottom: 15,
    width: "90%",
    alignSelf: "center",
  },
  buttonLabel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#191f2f",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexShrink: 1,
  },
  iconRight: { width: 41, height: 41 },
  buttonTextLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    marginRight: 8,
  },
  thumbWrap: {
    position: "relative",
    borderRadius: 6,
    overflow: "hidden",
  },
  badgeOverlay: {
    position: "absolute",
    bottom: 6,
    right: 6,
    zIndex: 999, // iOS
    elevation: 6, // Android
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  badgeLocalBg: { backgroundColor: "rgba(92,184,92,0.95)" }, // vert
  badgeCloudBg: { backgroundColor: "rgba(217,83,79,0.95)" }, // rouge
  labelWrap: { borderWidth: 2, borderColor: "green" },
  labelOutline: { borderColor: "green", borderWidth: 2 },
  galleryScroll: {
    width: "100%",
    alignSelf: "center",
  },

  // remplace l'ancienne galleryContent si tu l'avais déjà ajoutée
  galleryContent: {
    flexGrow: 1, // ← rempli toute la largeur dispo
    flexDirection: "row",
    justifyContent: "center", // ← centre sur l’axe principal (horizontal)
    alignItems: "center", // ← centre sur l’axe secondaire (vertical)
    paddingHorizontal: 10,
  },

  // tu peux garder ceux-ci tels quels (ou les ajouter si absents)
  thumbItem: {
    marginHorizontal: 6,
    alignItems: "center",
  },
});
