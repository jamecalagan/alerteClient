import React, { useEffect, useRef, useState } from "react";
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
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import Signature from "react-native-signature-canvas";
import { WebView } from "react-native-webview";
import { supabase } from "../supabaseClient";
import AlertBox from "../components/AlertBox";
import BackButton from "../components/BackButton";
import AddressAutocomplete from "../components/AddressAutocomplete";
import {
  ID_TYPES,
  CONDITIONS,
  PAYMENT_METHODS,
  formatRepriseNumber,
  formatEuro,
  toNum,
  isLocalUri,
  uploadReprisePhoto,
  resolveReprisePhoto,
  buildRepriseHtml,
  A5_PRINT_SIZE,
} from "../utils/reprise";

// Plafond légal du paiement en espèces d'un professionnel à un particulier
// (rappel affiché seulement, à vérifier selon la réglementation en vigueur).
const CASH_LIMIT = 1000;

// Photo d'une reprise : chemin du bucket (résolu en URL signée) ou fichier local.
function ReprisePhoto({ source, size = 96, onPress, onLongPress }) {
  const [uri, setUri] = useState(isLocalUri(source) ? source : null);

  useEffect(() => {
    let cancelled = false;
    if (isLocalUri(source)) {
      setUri(source);
      return undefined;
    }
    resolveReprisePhoto(source).then((u) => {
      if (!cancelled) setUri(u);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <TouchableOpacity
      onPress={() => uri && onPress?.(uri)}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.photoTile, { width: size, height: size }]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: "100%", height: "100%" }} />
      ) : (
        <ActivityIndicator color="#4338ca" />
      )}
    </TouchableOpacity>
  );
}

function Chips({ options, value, onChange }) {
  return (
    <View style={styles.chipsRow}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(active ? "" : opt.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CheckRow({ label, value, onChange }) {
  return (
    <TouchableOpacity style={styles.checkRow} onPress={() => onChange(!value)}>
      <View style={[styles.checkbox, value && styles.checkboxOn]}>
        {value ? <Text style={styles.checkMark}>✓</Text> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const toOptions = (list) => list.map((v) => ({ value: v, label: v }));

// Saisie de date JJ/MM/AAAA : les "/" s'ajoutent automatiquement.
const formatDateInput = (text) => {
  const digits = String(text || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

// Propositions issues du catalogue (tables article / marque / modele, les
// mêmes que l'ajout d'intervention). La saisie libre reste possible.
function CatalogSuggestions({ visible, items, query, onSelect }) {
  if (!visible) return null;
  const q = norm(query);
  const list = items
    .filter((it) => norm(it.nom) !== q && norm(it.nom).includes(q))
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || ""))
    .slice(0, 12);
  if (list.length === 0) return null;
  return (
    <View style={styles.suggestions}>
      {list.map((it) => (
        <TouchableOpacity
          key={it.id}
          style={styles.suggestionItem}
          onPress={() => onSelect(it)}
        >
          <Text style={styles.suggestionText}>{it.nom}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function RepriseEditPage({ route, navigation }) {
  const [repriseId, setRepriseId] = useState(route.params?.repriseId || null);
  const [numero, setNumero] = useState(null);
  const [createdAt, setCreatedAt] = useState(null);
  const [loading, setLoading] = useState(!!route.params?.repriseId);
  const [saving, setSaving] = useState(false);

  // Vendeur
  const [clientId, setClientId] = useState(null);
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [sellerEmail, setSellerEmail] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [sellerPostalCode, setSellerPostalCode] = useState("");
  const [sellerCity, setSellerCity] = useState("");
  const [clientSuggestions, setClientSuggestions] = useState([]);
  const [bannedInfo, setBannedInfo] = useState(null);

  // Pièce d'identité
  const [idType, setIdType] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idIssueDate, setIdIssueDate] = useState("");
  const [idIssuer, setIdIssuer] = useState("");
  const [idPhoto, setIdPhoto] = useState(null);

  // Matériel
  const [deviceType, setDeviceType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [condition, setCondition] = useState("");
  const [accessories, setAccessories] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);

  // Catalogue pour les propositions type / marque / modèle
  const [catalogArticles, setCatalogArticles] = useState([]);
  const [catalogBrands, setCatalogBrands] = useState([]);
  const [catalogModels, setCatalogModels] = useState([]);
  const [focusedField, setFocusedField] = useState(null);
  // Ferme la liste d'un champ quitté, sans fermer celle du champ qui vient
  // de prendre le focus (le délai laisse le temps de toucher une proposition).
  const closeSuggestions = (field) => {
    setTimeout(() => {
      setFocusedField((current) => (current === field ? null : current));
    }, 200);
  };

  useEffect(() => {
    supabase
      .from("article")
      .select("id, nom")
      .then(({ data, error }) => {
        if (error) console.error("❌ Chargement types de matériel :", error);
        else setCatalogArticles(data || []);
      });
  }, []);

  // Marques du type choisi (quand le texte correspond à un type du catalogue)
  const matchedArticle = catalogArticles.find((a) => norm(a.nom) === norm(deviceType));
  useEffect(() => {
    if (!matchedArticle) {
      setCatalogBrands([]);
      return;
    }
    supabase
      .from("marque")
      .select("id, nom")
      .eq("article_id", matchedArticle.id)
      .then(({ data, error }) => {
        if (error) console.error("❌ Chargement marques :", error);
        else setCatalogBrands(data || []);
      });
  }, [matchedArticle?.id]);

  // Modèles de la marque choisie
  const matchedBrand = catalogBrands.find((b) => norm(b.nom) === norm(brand));
  useEffect(() => {
    if (!matchedBrand) {
      setCatalogModels([]);
      return;
    }
    supabase
      .from("modele")
      .select("id, nom")
      .eq("marque_id", matchedBrand.id)
      .then(({ data, error }) => {
        if (error) console.error("❌ Chargement modèles :", error);
        else setCatalogModels(data || []);
      });
  }, [matchedBrand?.id]);

  // Contrôles
  const [checkAccountRemoved, setCheckAccountRemoved] = useState(false);
  const [checkDataErased, setCheckDataErased] = useState(false);
  const [checkNotBlocked, setCheckNotBlocked] = useState(false);

  // Reprise
  const [repriseType, setRepriseType] = useState("rachat");
  const [price, setPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [deductionNote, setDeductionNote] = useState("");

  // Signature
  const [signature, setSignature] = useState(null);
  const [signedAt, setSignedAt] = useState(null);
  const [isSigning, setIsSigning] = useState(false);
  const sigRef = useRef(null);

  // Revente
  const [resaleStatus, setResaleStatus] = useState("en_stock");
  const [resalePrice, setResalePrice] = useState("");
  const [resaleDate, setResaleDate] = useState("");

  // Alertes / confirmations / aperçu photo
  const [alert, setAlert] = useState(null); // { title, message }
  const [confirm, setConfirm] = useState(null); // { title, message, confirmText, onConfirm }
  const [photoChoice, setPhotoChoice] = useState(null); // "photo" | "identite"
  const [previewUri, setPreviewUri] = useState(null);
  const [printPreviewHtml, setPrintPreviewHtml] = useState(null);
  const showAlert = (title, message) => setAlert({ title, message });

  // === Modifications non enregistrées ===
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const skipDirtyRef = useRef(true);
  useEffect(() => {
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [
    sellerName, sellerPhone, sellerEmail, sellerAddress, sellerPostalCode, sellerCity,
    idType, idNumber, idIssueDate, idIssuer, idPhoto,
    deviceType, brand, model, serialNumber, condition, accessories, notes, photos,
    checkAccountRemoved, checkDataErased, checkNotBlocked,
    repriseType, price, paymentMethod, deductionNote, signature,
    resaleStatus, resalePrice, resaleDate,
  ]);

  // Sortie volontaire (après suppression) : pas d'alerte de modifications.
  const leavingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (!hasUnsavedChanges || leavingRef.current) return;
      e.preventDefault();
      setConfirm({
        title: "Modifications non enregistrées",
        message:
          "Vous allez perdre les informations saisies sur cette fiche de reprise. Voulez-vous vraiment quitter ?",
        confirmText: "Quitter",
        onConfirm: () => {
          setHasUnsavedChanges(false);
          navigation.dispatch(e.data.action);
        },
      });
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  // === Chargement d'une fiche existante ===
  useEffect(() => {
    if (!route.params?.repriseId) return;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("reprises")
          .select("*")
          .eq("id", route.params.repriseId)
          .single();
        if (error) throw error;
        skipDirtyRef.current = true;
        setNumero(data.numero);
        setCreatedAt(data.created_at);
        setClientId(data.client_id);
        setSellerName(data.seller_name || "");
        setSellerPhone(data.seller_phone || "");
        setSellerEmail(data.seller_email || "");
        setSellerAddress(data.seller_address || "");
        setSellerPostalCode(data.seller_postal_code || "");
        setSellerCity(data.seller_city || "");
        setIdType(data.id_type || "");
        setIdNumber(data.id_number || "");
        setIdIssueDate(data.id_issue_date || "");
        setIdIssuer(data.id_issuer || "");
        setIdPhoto(data.id_photo || null);
        setDeviceType(data.device_type || "");
        setBrand(data.brand || "");
        setModel(data.model || "");
        setSerialNumber(data.serial_number || "");
        setCondition(data.condition || "");
        setAccessories(data.accessories || "");
        setNotes(data.notes || "");
        setPhotos(Array.isArray(data.photos) ? data.photos : []);
        setCheckAccountRemoved(!!data.check_account_removed);
        setCheckDataErased(!!data.check_data_erased);
        setCheckNotBlocked(!!data.check_not_blocked);
        setRepriseType(data.reprise_type || "rachat");
        setPrice(data.price != null ? String(data.price) : "");
        setPaymentMethod(data.payment_method || "");
        setDeductionNote(data.deduction_note || "");
        setSignature(data.signature || null);
        setSignedAt(data.signed_at || null);
        setResaleStatus(data.resale_status || "en_stock");
        setResalePrice(data.resale_price != null ? String(data.resale_price) : "");
        setResaleDate(data.resale_date || "");
        // Le chargement remplit ~30 états en plusieurs rendus : on ne
        // compte comme modifications que ce qui suit.
        setTimeout(() => setHasUnsavedChanges(false), 0);
      } catch (e) {
        console.error("❌ Chargement reprise :", e);
        showAlert("Erreur", "Impossible de charger la fiche de reprise.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [route.params?.repriseId]);

  // === Recherche client ===
  const searchClients = async (text) => {
    setSellerName(text);
    setClientId(null);
    setBannedInfo(null);
    if (text.trim().length < 2) {
      setClientSuggestions([]);
      return;
    }
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, phone, email, address, postal_code, city, ficheNumber, banned, ban_reason")
      .or(`name.ilike.%${text}%,phone.ilike.%${text}%`)
      .limit(8);
    if (!error) setClientSuggestions(data || []);
  };

  const selectClient = (c) => {
    setClientId(c.id);
    setSellerName(c.name || "");
    setSellerPhone(c.phone || "");
    setSellerEmail(c.email || "");
    setSellerAddress(c.address || "");
    setSellerPostalCode(c.postal_code || "");
    setSellerCity(c.city || "");
    setClientSuggestions([]);
    setBannedInfo(c.banned ? c.ban_reason || "Client banni" : null);
  };

  // Rattache la fiche à un client : celui choisi, sinon un client existant
  // (même nom + téléphone), sinon une nouvelle fiche client.
  const ensureClient = async () => {
    if (clientId) return clientId;
    const name = sellerName.trim();
    const phone = sellerPhone.trim();
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
          email: sellerEmail.trim() || null,
          address: sellerAddress.trim() || null,
          postal_code: sellerPostalCode || null,
          city: sellerCity.trim() || null,
          ficheNumber: nextFiche,
          createdAt: new Date().toISOString(),
        },
      ])
      .select("id")
      .single();
    if (createError) throw createError;
    return created.id;
  };

  // === Photos ===
  const addPhoto = async (kind, source) => {
    setPhotoChoice(null);
    try {
      let result;
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== "granted") {
          showAlert("Permission requise", "Autorisez l'appareil photo pour prendre une photo.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.7,
          exif: false,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (perm.status !== "granted") {
          showAlert("Permission requise", "Autorisez l'accès aux photos pour choisir une image.");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.7,
          exif: false,
        });
      }
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;
      if (kind === "identite") setIdPhoto(uri);
      else setPhotos((prev) => [...prev, uri]);
    } catch (e) {
      console.error("❌ Photo reprise :", e);
      showAlert("Erreur", "Impossible d'ajouter la photo.");
    }
  };

  const askRemovePhoto = (kind, source) => {
    setConfirm({
      title: "Retirer la photo ?",
      message: "La photo sera retirée de la fiche à l'enregistrement.",
      confirmText: "Retirer",
      onConfirm: () => {
        if (kind === "identite") setIdPhoto(null);
        else setPhotos((prev) => prev.filter((p) => p !== source));
      },
    });
  };

  // === Enregistrement ===
  const margin =
    resaleStatus === "revendu" && resalePrice !== "" && price !== ""
      ? toNum(resalePrice) - toNum(price)
      : null;

  const validate = () => {
    const missing = [];
    if (!sellerName.trim()) missing.push("Nom du vendeur");
    if (!sellerPhone.trim()) missing.push("Téléphone du vendeur");
    if (!idType) missing.push("Type de pièce d'identité");
    if (!idNumber.trim()) missing.push("Numéro de pièce d'identité");
    if (!deviceType.trim() && !model.trim()) missing.push("Type ou modèle du matériel");
    if (toNum(price) <= 0) missing.push("Montant de la reprise");
    if (repriseType === "rachat" && !paymentMethod) missing.push("Mode de paiement");
    if (missing.length > 0) {
      showAlert("Champs manquants", missing.join("\n"));
      return false;
    }
    return true;
  };

  const saveReprise = async ({ print = false } = {}) => {
    if (saving || !validate()) return;
    setSaving(true);
    try {
      const resolvedClientId = await ensureClient();

      const payload = {
        client_id: resolvedClientId,
        seller_name: sellerName.trim(),
        seller_phone: sellerPhone.trim(),
        seller_email: sellerEmail.trim() || null,
        seller_address: sellerAddress.trim() || null,
        seller_postal_code: sellerPostalCode || null,
        seller_city: sellerCity.trim() || null,
        id_type: idType,
        id_number: idNumber.trim(),
        id_issue_date: idIssueDate.trim() || null,
        id_issuer: idIssuer.trim() || null,
        device_type: deviceType.trim() || null,
        brand: brand.trim() || null,
        model: model.trim() || null,
        serial_number: serialNumber.trim() || null,
        condition: condition || null,
        accessories: accessories.trim() || null,
        notes: notes.trim() || null,
        check_account_removed: checkAccountRemoved,
        check_data_erased: checkDataErased,
        check_not_blocked: checkNotBlocked,
        reprise_type: repriseType,
        price: toNum(price),
        payment_method: repriseType === "rachat" ? paymentMethod : null,
        deduction_note: repriseType === "deduction" ? deductionNote.trim() || null : null,
        signature: signature || null,
        signed_at: signature ? signedAt || new Date().toISOString() : null,
        resale_status: resaleStatus,
        resale_price: resaleStatus === "revendu" && resalePrice !== "" ? toNum(resalePrice) : null,
        resale_date: resaleStatus === "revendu" ? resaleDate.trim() || null : null,
        updated_at: new Date().toISOString(),
      };

      let row;
      if (repriseId) {
        const { data, error } = await supabase
          .from("reprises")
          .update(payload)
          .eq("id", repriseId)
          .select("*")
          .single();
        if (error) throw error;
        row = data;
      } else {
        const { data, error } = await supabase
          .from("reprises")
          .insert([payload])
          .select("*")
          .single();
        if (error) throw error;
        row = data;
      }

      // Envoi des photos prises localement, puis enregistrement des chemins.
      const uploadedPhotos = [];
      for (const p of photos) {
        uploadedPhotos.push(isLocalUri(p) ? await uploadReprisePhoto(row.id, p, "materiel") : p);
      }
      const uploadedIdPhoto =
        idPhoto && isLocalUri(idPhoto)
          ? await uploadReprisePhoto(row.id, idPhoto, "identite")
          : idPhoto || null;

      const { data: finalRow, error: photosError } = await supabase
        .from("reprises")
        .update({ photos: uploadedPhotos, id_photo: uploadedIdPhoto })
        .eq("id", row.id)
        .select("*")
        .single();
      if (photosError) throw photosError;

      skipDirtyRef.current = true;
      setRepriseId(finalRow.id);
      setNumero(finalRow.numero);
      setCreatedAt(finalRow.created_at);
      setClientId(finalRow.client_id);
      setPhotos(uploadedPhotos);
      setIdPhoto(uploadedIdPhoto);
      setSignedAt(finalRow.signed_at);
      setTimeout(() => setHasUnsavedChanges(false), 0);

      if (print) {
        const photoUrls = (
          await Promise.all(uploadedPhotos.map((p) => resolveReprisePhoto(p)))
        ).filter(Boolean);
        // Aperçu avant impression (l'impression se lance depuis l'aperçu)
        setPrintPreviewHtml(buildRepriseHtml(finalRow, photoUrls));
      } else {
        // Retour à la liste des reprises (la fiche y apparaît)
        leavingRef.current = true;
        navigation.navigate("RepriseListPage");
      }
    } catch (e) {
      console.error("❌ Enregistrement reprise :", e);
      showAlert("Erreur", "Impossible d'enregistrer la reprise. " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const askDelete = () => {
    setConfirm({
      title: "Supprimer la reprise ?",
      message: `La fiche ${formatRepriseNumber(numero)} sera retirée de la liste des reprises.`,
      confirmText: "Supprimer",
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from("reprises")
            .update({ deleted: true, updated_at: new Date().toISOString() })
            .eq("id", repriseId);
          if (error) throw error;
          leavingRef.current = true;
          navigation.goBack();
        } catch (e) {
          console.error("❌ Suppression reprise :", e);
          showAlert("Erreur", "Impossible de supprimer la reprise.");
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isSigning}
      >
        <Text style={styles.title}>♻️ Reprise de matériel</Text>
        <Text style={styles.subtitle}>
          {repriseId
            ? `${formatRepriseNumber(numero)} — ${
                createdAt ? new Date(createdAt).toLocaleDateString("fr-FR") : ""
              }`
            : "Nouvelle fiche"}
        </Text>

        {/* ===== Vendeur ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Vendeur</Text>
          <Text style={styles.label}>Nom (ou recherche d'un client existant) *</Text>
          <TextInput
            style={styles.input}
            value={sellerName}
            onChangeText={searchClients}
            placeholder="Nom ou téléphone…"
            placeholderTextColor="#94a3b8"
          />
          {clientSuggestions.length > 0 && (
            <View style={styles.suggestions}>
              {clientSuggestions.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.suggestionItem}
                  onPress={() => selectClient(c)}
                >
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
          ) : sellerName.trim() ? (
            <Text style={styles.hintText}>
              Nouveau client : une fiche client sera créée à l'enregistrement.
            </Text>
          ) : null}
          {bannedInfo ? (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⛔ Client banni : {bannedInfo}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Téléphone *</Text>
          <TextInput
            style={styles.input}
            value={sellerPhone}
            onChangeText={setSellerPhone}
            keyboardType="phone-pad"
          />
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            value={sellerEmail}
            onChangeText={setSellerEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <AddressAutocomplete
            address={sellerAddress}
            postalCode={sellerPostalCode}
            city={sellerCity}
            onChangeAddress={setSellerAddress}
            onChangePostalCode={setSellerPostalCode}
            onChangeCity={setSellerCity}
          />
        </View>

        {/* ===== Pièce d'identité ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pièce d'identité</Text>
          <Text style={styles.label}>Type *</Text>
          <Chips options={toOptions(ID_TYPES)} value={idType} onChange={setIdType} />
          <Text style={styles.label}>Numéro *</Text>
          <TextInput
            style={styles.input}
            value={idNumber}
            onChangeText={setIdNumber}
            autoCapitalize="characters"
          />
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Délivrée le</Text>
              <TextInput
                style={styles.input}
                value={idIssueDate}
                onChangeText={(t) => setIdIssueDate(formatDateInput(t))}
                keyboardType="number-pad"
                maxLength={10}
                placeholder="JJ/MM/AAAA"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Par (autorité)</Text>
              <TextInput
                style={styles.input}
                value={idIssuer}
                onChangeText={setIdIssuer}
                placeholder="ex. Préfecture de …"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
          <Text style={styles.label}>Photo de la pièce (non imprimée)</Text>
          <View style={styles.photosRow}>
            {idPhoto ? (
              <ReprisePhoto
                source={idPhoto}
                size={120}
                onPress={setPreviewUri}
                onLongPress={() => askRemovePhoto("identite", idPhoto)}
              />
            ) : null}
            <TouchableOpacity style={styles.addPhotoTile} onPress={() => setPhotoChoice("identite")}>
              <Text style={styles.addPhotoText}>{idPhoto ? "Remplacer" : "＋ Photo"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== Matériel ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Matériel</Text>
          <Text style={styles.label}>Type de matériel *</Text>
          <TextInput
            style={styles.input}
            value={deviceType}
            onChangeText={setDeviceType}
            onFocus={() => setFocusedField("type")}
            onBlur={() => closeSuggestions("type")}
            placeholder="ex. Smartphone, PC portable, console…"
            placeholderTextColor="#94a3b8"
          />
          <CatalogSuggestions
            visible={focusedField === "type"}
            items={catalogArticles}
            query={deviceType}
            onSelect={(a) => {
              if (norm(a.nom) !== norm(deviceType)) {
                setBrand("");
                setModel("");
              }
              setDeviceType(a.nom);
              setFocusedField(null);
            }}
          />
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Marque</Text>
              <TextInput
                style={styles.input}
                value={brand}
                onChangeText={setBrand}
                onFocus={() => setFocusedField("brand")}
                onBlur={() => closeSuggestions("brand")}
                placeholder={matchedArticle ? "Choisir ou saisir…" : ""}
                placeholderTextColor="#94a3b8"
              />
              <CatalogSuggestions
                visible={focusedField === "brand"}
                items={catalogBrands}
                query={brand}
                onSelect={(b) => {
                  if (norm(b.nom) !== norm(brand)) setModel("");
                  setBrand(b.nom);
                  setFocusedField(null);
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Modèle</Text>
              <TextInput
                style={styles.input}
                value={model}
                onChangeText={setModel}
                onFocus={() => setFocusedField("model")}
                onBlur={() => closeSuggestions("model")}
                placeholder={matchedBrand ? "Choisir ou saisir…" : ""}
                placeholderTextColor="#94a3b8"
              />
              <CatalogSuggestions
                visible={focusedField === "model"}
                items={catalogModels}
                query={model}
                onSelect={(m) => {
                  setModel(m.nom);
                  setFocusedField(null);
                }}
              />
            </View>
          </View>
          <Text style={styles.label}>N° de série / IMEI</Text>
          <TextInput
            style={styles.input}
            value={serialNumber}
            onChangeText={setSerialNumber}
            autoCapitalize="characters"
          />
          <Text style={styles.label}>État</Text>
          <Chips options={toOptions(CONDITIONS)} value={condition} onChange={setCondition} />
          <Text style={styles.label}>Accessoires fournis</Text>
          <TextInput
            style={styles.input}
            value={accessories}
            onChangeText={setAccessories}
            placeholder="ex. chargeur, boîte, câble…"
            placeholderTextColor="#94a3b8"
          />
          <Text style={styles.label}>Remarques</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <Text style={styles.label}>Photos du matériel (appui long pour retirer)</Text>
          <View style={styles.photosRow}>
            {photos.map((p) => (
              <ReprisePhoto
                key={p}
                source={p}
                onPress={setPreviewUri}
                onLongPress={() => askRemovePhoto("photo", p)}
              />
            ))}
            <TouchableOpacity style={styles.addPhotoTile} onPress={() => setPhotoChoice("photo")}>
              <Text style={styles.addPhotoText}>＋ Photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== Contrôles ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contrôles avant reprise</Text>
          <CheckRow
            label="Compte iCloud / Google retiré"
            value={checkAccountRemoved}
            onChange={setCheckAccountRemoved}
          />
          <CheckRow
            label="Données personnelles effacées"
            value={checkDataErased}
            onChange={setCheckDataErased}
          />
          <CheckRow
            label="Appareil non bloqué (opérateur / IMEI)"
            value={checkNotBlocked}
            onChange={setCheckNotBlocked}
          />
        </View>

        {/* ===== Reprise ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Reprise</Text>
          <Chips
            options={[
              { value: "rachat", label: "Rachat (payé au vendeur)" },
              { value: "deduction", label: "Déduction (achat / réparation)" },
            ]}
            value={repriseType}
            onChange={(v) => setRepriseType(v || "rachat")}
          />
          <Text style={styles.label}>Montant de la reprise (€) *</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />
          {repriseType === "rachat" ? (
            <>
              <Text style={styles.label}>Mode de paiement *</Text>
              <Chips
                options={toOptions(PAYMENT_METHODS)}
                value={paymentMethod}
                onChange={setPaymentMethod}
              />
              {paymentMethod === "Espèces" && toNum(price) > CASH_LIMIT ? (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    ⚠️ Le paiement en espèces est plafonné ({CASH_LIMIT} € pour un particulier
                    résidant en France). Préférez un virement ou un chèque.
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.label}>Déduit de (achat, réparation, n° de facture…)</Text>
              <TextInput
                style={styles.input}
                value={deductionNote}
                onChangeText={setDeductionNote}
              />
            </>
          )}
        </View>

        {/* ===== Revente ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Suivi de revente</Text>
          <Chips
            options={[
              { value: "en_stock", label: "En stock" },
              { value: "revendu", label: "Revendu" },
            ]}
            value={resaleStatus}
            onChange={(v) => {
              const next = v || "en_stock";
              setResaleStatus(next);
              if (next === "revendu" && !resaleDate) {
                setResaleDate(new Date().toLocaleDateString("fr-FR"));
              }
            }}
          />
          {resaleStatus === "revendu" ? (
            <>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Prix de revente (€)</Text>
                  <TextInput
                    style={styles.input}
                    value={resalePrice}
                    onChangeText={setResalePrice}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Date de revente</Text>
                  <TextInput
                    style={styles.input}
                    value={resaleDate}
                    onChangeText={(t) => setResaleDate(formatDateInput(t))}
                    keyboardType="number-pad"
                    maxLength={10}
                    placeholder="JJ/MM/AAAA"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
              {margin != null ? (
                <Text style={[styles.marginText, { color: margin >= 0 ? "#15803d" : "#b91c1c" }]}>
                  Marge : {formatEuro(margin)}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>

        {/* ===== Signature ===== */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Attestation du vendeur</Text>
          <Text style={styles.attestation}>
            Je soussigné(e) {sellerName.trim() || "……………"} certifie être le propriétaire
            légitime du matériel décrit, qu'il n'est ni volé, ni gagé, ni loué, et le cède à
            AVENIR INFORMATIQUE pour le montant indiqué. Je reconnais avoir retiré ou fait
            retirer mes comptes et mes données personnelles de l'appareil.
          </Text>
          {signature ? (
            <View style={{ alignItems: "center" }}>
              <Image source={{ uri: signature }} style={styles.signatureImage} />
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => {
                  setSignature(null);
                  setSignedAt(null);
                }}
              >
                <Text style={styles.secondaryBtnText}>Refaire la signature</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.signaturePad}>
              <View style={styles.signatureCanvas}>
                <Signature
                  ref={sigRef}
                  onBegin={() => setIsSigning(true)}
                  onEnd={() => setIsSigning(false)}
                  onOK={(sig) => {
                    setSignature(sig.startsWith("data:image") ? sig : `data:image/png;base64,${sig}`);
                    setSignedAt(new Date().toISOString());
                  }}
                  onEmpty={() =>
                    showAlert("Signature vide", "Faites signer le vendeur dans le cadre avant de valider.")
                  }
                  descriptionText=""
                  webStyle={`
                    .m-signature-pad { box-shadow: none; border: none; width: 100%; height: 100%; margin: 0; }
                    .m-signature-pad--body { border: none; }
                    .m-signature-pad--footer { display: none; margin: 0; }
                    body, html { width: 100%; height: 100%; margin: 0; padding: 0; }
                  `}
                />
              </View>
              {/* Boutons natifs : ceux du composant (pied de cadre) étaient coupés */}
              <View style={styles.signatureActions}>
                <TouchableOpacity
                  style={[styles.signatureBtn, { backgroundColor: "#e2e8f0" }]}
                  onPress={() => sigRef.current?.clearSignature()}
                >
                  <Text style={[styles.signatureBtnText, { color: "#334155" }]}>Effacer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.signatureBtn, { backgroundColor: "#4338ca" }]}
                  onPress={() => sigRef.current?.readSignature()}
                >
                  <Text style={styles.signatureBtnText}>✓ Valider la signature</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ===== Actions ===== */}
        <TouchableOpacity
          style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          onPress={() => saveReprise({ print: true })}
          disabled={saving}
        >
          <Text style={styles.primaryBtnText}>
            {saving ? "Enregistrement…" : "🖨️ Enregistrer et aperçu avant impression"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: "#0d6efd" }, saving && { opacity: 0.6 }]}
          onPress={() => saveReprise()}
          disabled={saving}
        >
          <Text style={styles.primaryBtnText}>💾 Enregistrer</Text>
        </TouchableOpacity>
        {repriseId ? (
          <TouchableOpacity style={styles.deleteBtn} onPress={askDelete}>
            <Text style={styles.deleteBtnText}>Supprimer la reprise</Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ alignItems: "center", marginTop: 8 }}>
          <BackButton onPress={() => navigation.goBack()} />
        </View>
      </ScrollView>

      {/* Choix appareil photo / galerie */}
      <Modal
        visible={!!photoChoice}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoChoice(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {photoChoice === "identite" ? "Photo de la pièce d'identité" : "Photo du matériel"}
            </Text>
            <TouchableOpacity style={styles.modalOption} onPress={() => addPhoto(photoChoice, "camera")}>
              <Text style={styles.modalOptionText}>📷 Prendre une photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => addPhoto(photoChoice, "library")}>
              <Text style={styles.modalOptionText}>🖼️ Choisir dans la galerie</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setPhotoChoice(null)}>
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Aperçu avant impression */}
      <Modal
        visible={!!printPreviewHtml}
        animationType="slide"
        onRequestClose={() => setPrintPreviewHtml(null)}
      >
        <View style={styles.printPreviewScreen}>
          <Text style={styles.printPreviewTitle}>
            Aperçu — {formatRepriseNumber(numero)}
          </Text>
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
                  console.error("❌ Impression reprise :", e);
                  showAlert("Erreur", "Impossible de lancer l'impression.");
                }
              }}
            >
              <Text style={styles.primaryBtnText}>🖨️ Imprimer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Aperçu photo */}
      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.85)" }]}
          activeOpacity={1}
          onPress={() => setPreviewUri(null)}
        >
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.previewImage} />
          ) : null}
        </TouchableOpacity>
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
  container: {
    padding: 16,
    paddingTop: (StatusBar.currentHeight || 0) + 12,
    paddingBottom: 40,
  },
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
  row2: { flexDirection: "row", gap: 10 },
  suggestions: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: "#fff",
  },
  suggestionItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  suggestionText: { color: "#334155", fontSize: 14 },
  linkedText: { color: "#15803d", fontWeight: "700", marginTop: 6 },
  hintText: { color: "#64748b", fontSize: 12, marginTop: 6 },
  warningBox: {
    backgroundColor: "#fee2e2",
    borderColor: "#dc2626",
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
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
  chipActive: { backgroundColor: "#4338ca", borderColor: "#4338ca" },
  chipText: { color: "#3730a3", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  checkRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#6366f1",
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#4338ca", borderColor: "#4338ca" },
  checkMark: { color: "#fff", fontWeight: "900" },
  checkLabel: { fontSize: 15, color: "#1f2937" },
  photosRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoTile: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#c7d2fe",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoTile: {
    width: 96,
    height: 96,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#6366f1",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoText: { color: "#4338ca", fontWeight: "700" },
  marginText: { marginTop: 10, fontWeight: "800", fontSize: 15 },
  attestation: { color: "#334155", fontSize: 13, lineHeight: 19, marginBottom: 10, textAlign: "justify" },
  signaturePad: {},
  signatureCanvas: {
    height: 260,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  signatureActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  signatureBtn: { flex: 1, borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  signatureBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  signatureImage: {
    width: 280,
    height: 110,
    resizeMode: "contain",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#e0e7ff",
  },
  secondaryBtnText: { color: "#3730a3", fontWeight: "700" },
  primaryBtn: {
    backgroundColor: "#4338ca",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: { width: 360, maxWidth: "100%", backgroundColor: "#fff", borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#1e1b4b", textAlign: "center", marginBottom: 12 },
  modalOption: {
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    marginBottom: 8,
  },
  modalOptionText: { color: "#3730a3", fontWeight: "700", fontSize: 15 },
  modalCancel: { paddingVertical: 10, alignItems: "center" },
  modalCancelText: { color: "#64748b", fontWeight: "700" },
  previewImage: { width: "92%", height: "80%", resizeMode: "contain" },
  printPreviewScreen: {
    flex: 1,
    backgroundColor: "#eef2ff",
    paddingTop: (StatusBar.currentHeight || 0) + 8,
  },
  printPreviewTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1e1b4b",
    textAlign: "center",
    marginBottom: 8,
  },
  printPreviewActions: { flexDirection: "row", gap: 12, padding: 12 },
  printPreviewBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
});
