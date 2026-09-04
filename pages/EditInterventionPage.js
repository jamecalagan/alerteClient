import React, { useState, useEffect, useRef } from "react";
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
    Pressable,
    FlatList,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "../supabaseClient";
import * as ImagePicker from "expo-image-picker";
import CustomAlert from "../components/CustomAlert";
import AlertBox from "../components/AlertBox";
import BackButton from "../components/BackButton";
import * as FileSystem from "expo-file-system/legacy";
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
    ((s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'")))
        ? s.slice(1, -1)
        : s;

const _cleanRef = (raw) => {
    if (!raw) return "";
    let s =
        typeof raw === "string" ? raw : raw.url || raw.path || raw.uri || "";
    s = String(s);
    s = _stripQuotes(s).trim().replace(/\\+$/g, ""); // supprime backslashes fin
    const q = s.indexOf("?"); // supprime ?token=...
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
    for (const it of arr || []) {
        const key = _bucketKey(it);
        if (!key) continue;
        if (labelKey && key === labelKey) continue; // exclure l'étiquette
        if (seen.has(key)) continue; // enlever doublon
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
const uploadAllLocalsBeforeSave = async (photos, interventionId, labelPhoto) => {
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

const normalizeNumber = (v) => {
    if (v === null || v === undefined) return "";
    return String(v).replace(",", ".").trim();
};

const REFERENCE_PHOTO_HINT = "Voir photo pour référence produit";

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
const REPAIR_CAUSES = [
    "BIOS",
    "Circuit de charge",
    "Alimentation",
    "Carte mère",
    "Court-circuit",
    "MOSFET",
    "Contrôleur EC",
    "GPU",
    "CPU",
    "Connecteur de charge",
    "Connecteur USB / USB-C",
    "Connecteur HDMI",
    "Écran / dalle",
    "Rétroéclairage",
    "Batterie",
    "SSD / disque dur",
    "Mémoire RAM",
    "Surchauffe",
    "Ventilateur",
    "Windows / logiciel",
    "Virus",
    "Pilote",
    "Données corrompues",
    "Clavier / touchpad",
    "Charnière / châssis",
    "Liquide / oxydation",
    "Entretien nécessaire",
    "Autre",
];

const REPAIR_ACTIONS = [
    "Flash / remplacement BIOS",
    "Réparation circuit de charge",
    "Réparation alimentation",
    "Réparation carte mère",
    "Suppression court-circuit",
    "Remplacement MOSFET",
    "Remplacement contrôleur",
    "Micro-soudure",
    "Remplacement connecteur de charge",
    "Remplacement connecteur USB / USB-C",
    "Remplacement connecteur HDMI",
    "Remplacement écran / dalle",
    "Réparation rétroéclairage",
    "Remplacement batterie",
    "Remplacement SSD / disque dur",
    "Remplacement mémoire RAM",
    "Nettoyage et pâte thermique",
    "Remplacement ventilateur",
    "Réinstallation Windows",
    "Réparation Windows",
    "Suppression virus",
    "Installation pilote",
    "Récupération de données",
    "Remplacement clavier / touchpad",
    "Réparation charnière / châssis",
    "Nettoyage oxydation",
    "Nettoyage / entretien",
    "Aucun dépannage effectué",
    "Autre",
];

const REPAIR_DURATIONS = [
    "Moins de 30 min",
    "30 min à 1 h",
    "1 à 2 h",
    "2 à 4 h",
    "Plus de 4 h",
];
const STATUS_OPTIONS = [
    "En attente de pièces",
    "Devis en cours",
    "Devis accepté",
    "Intervention en cours",
    "Réparé",
    "Non réparable",
];
const CHARGEUR_OPTIONS = ["Non", "Oui"];
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
    const [isAddingPhoto, setIsAddingPhoto] = useState(false);
    const [labelPhoto, setLabelPhoto] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [labelPhotoDB, setLabelPhotoDB] = useState(null); // ref cloud DB (stable)
    const [takeLabelPhoto, setTakeLabelPhoto] = useState(false); // ✅ NOUVEAU : option étiquette

    const [alertType, setAlertType] = useState("danger");
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [alertTitle, setAlertTitle] = useState("");

    const showAlert = (title, message) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertVisible(true);
    };

    const [confirmDialog, setConfirmDialog] = useState({
        visible: false,
        title: "",
        message: "",
        onConfirm: null,
    });

    const openConfirm = (title, message, onConfirm) => {
        setConfirmDialog({ visible: true, title, message, onConfirm });
    };

    const closeConfirm = () => {
        setConfirmDialog((prev) => ({ ...prev, visible: false }));
    };

    // === Confirmation avant de quitter avec des modifications non enregistrées ===
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [pendingLeaveAction, setPendingLeaveAction] = useState(null);
    const skipDirtyRef = useRef(true); // true au montage/chargement, pour ignorer l'initialisation des champs

    useEffect(() => {
        if (skipDirtyRef.current) {
            skipDirtyRef.current = false;
            return;
        }
        setHasUnsavedChanges(true);
    }, [
        reference,
        description,
        password,
        serial_number,
        commande,
        remarks,
        chargeur,
        acceptScreenRisk,
        cost,
        paymentStatus,
        partialPayment,
        status,
        devisCost,
        estimateMin,
        estimateMax,
        deviceType,
        brand,
        model,
    ]);

    useEffect(() => {
        const unsubscribe = navigation.addListener("beforeRemove", (e) => {
            if (!hasUnsavedChanges) return;
            e.preventDefault();
            setPendingLeaveAction(() => () => navigation.dispatch(e.data.action));
        });
        return unsubscribe;
    }, [navigation, hasUnsavedChanges]);

    const [clientName, setClientName] = useState("");
    const [clientPhone, setClientPhone] = useState("");
    const [openType, setOpenType] = useState(false);
    const [openBrand, setOpenBrand] = useState(false);
    const [openModel, setOpenModel] = useState(false);
    const [pwdReminderVisible, setPwdReminderVisible] = useState(false);

    // --- AJOUTS D'ÉTATS POUR LA COMMANDE RAPIDE ---
    const [orderModalVisible, setOrderModalVisible] = useState(false);
    const [orderProduct, setOrderProduct] = useState(""); // ex: "BATTERIE"
    const [orderBrand, setOrderBrand] = useState("");
    const [orderModel, setOrderModel] = useState("");
    const [orderUnitPrice, setOrderUnitPrice] = useState("");
    const [orderQty, setOrderQty] = useState("1");
    const [orderDeposit, setOrderDeposit] = useState("");
    const [orderAmount, setOrderAmount] = useState(""); // montant de la dernière commande créée pour cette fiche
    const [orderId, setOrderId] = useState(null); // id de la commande liée, pour le bouton "Voir la commande"
    const [orderDate, setOrderDate] = useState(""); // date de création de la commande liée
    const [orderItems, setOrderItems] = useState([]); // produits déjà ajoutés à la commande en cours de création
const [repairModalVisible, setRepairModalVisible] =
    useState(false);

const [repairCause, setRepairCause] = useState("");
const [repairAction, setRepairAction] = useState("");
const [repairDuration, setRepairDuration] = useState("");
const [repairComment, setRepairComment] = useState("");
const [repairComponents, setRepairComponents] = useState([]); // liste des références de composants utilisés
const [componentInput, setComponentInput] = useState("");
const [componentSuggestions, setComponentSuggestions] = useState([]);
const [componentSuggestionsVisible, setComponentSuggestionsVisible] = useState(false);
// Proposition de réparation
const [repairProposalMade, setRepairProposalMade] =
    useState(false);
const [
    repairProposalExpanded,
    setRepairProposalExpanded,
] = useState(false);
const [repairProposal, setRepairProposal] =
    useState("");

const [repairProposalPrice, setRepairProposalPrice] =
    useState("");

const [repairProposalStatus, setRepairProposalStatus] =
    useState("pending");

const [repairProposalMethod, setRepairProposalMethod] =
    useState("shop");

const [repairProposalComment, setRepairProposalComment] =
    useState("");

const [repairProposalDate, setRepairProposalDate] =
    useState(null);
// Accessoire prêté
const [
    loanedItemEnabled,
    setLoanedItemEnabled,
] = useState(false);
const [
    loanedItemExpanded,
    setLoanedItemExpanded,
] = useState(false);
const [loanedItem, setLoanedItem] =
    useState("");

const [
    loanedItemReturned,
    setLoanedItemReturned,
] = useState(false);

const [
    loanedItemDate,
    setLoanedItemDate,
] = useState(null);

// Information à rappeler lors de la restitution
const [
    restitutionNoteEnabled,
    setRestitutionNoteEnabled,
] = useState(false);
const [
    restitutionNoteExpanded,
    setRestitutionNoteExpanded,
] = useState(false);
const [
    restitutionNote,
    setRestitutionNote,
] = useState("");

const [
    restitutionNoteDone,
    setRestitutionNoteDone,
] = useState(false);

const [
    restitutionNoteDate,
    setRestitutionNoteDate,
] = useState(null);

const [repairCausePickerVisible, setRepairCausePickerVisible] =
    useState(false);

const [repairActionPickerVisible, setRepairActionPickerVisible] =
    useState(false);

const [repairDurationPickerVisible, setRepairDurationPickerVisible] =
    useState(false);

const [statusPickerVisible, setStatusPickerVisible] = useState(false);
const [chargeurPickerVisible, setChargeurPickerVisible] = useState(false);
    // pour détecter la transition de statut
    const prevStatusRef = useRef(status);
    // true si cette sauvegarde vient de faire passer le statut à "Réparé"
    const justRepairedRef = useRef(false);
    const [invoicePromptVisible, setInvoicePromptVisible] = useState(false);
    // statut tel que chargé depuis la base à l'ouverture de la fiche (ne change pas pendant la session)
    const initialStatusRef = useRef(null);
const [repairCausesList, setRepairCausesList] = useState([]);
const [repairActionsList, setRepairActionsList] = useState([]);
const [repairDictionaryLoading, setRepairDictionaryLoading] =
    useState(false);

const [customRepairModalVisible, setCustomRepairModalVisible] =
    useState(false);

const [customRepairType, setCustomRepairType] = useState(null);
const [customRepairValue, setCustomRepairValue] = useState("");
const [repairSuggestions, setRepairSuggestions] = useState([]);
const [repairSuggestionsLoading, setRepairSuggestionsLoading] =
    useState(false);
    const repairBrokenPhotoUrlsForCurrentIntervention = async () => {
        try {
            const { data: inter, error } = await supabase
                .from("interventions")
                .select("id, photos, label_photo")
                .eq("id", interventionId)
                .maybeSingle();

            if (error || !inter) {
                showAlert("Erreur", "Impossible de lire la fiche.");
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
                            {
                                compress: 0.75,
                                format: ImageManipulator.SaveFormat.JPEG,
                            }
                        );
                        src = comp.uri;
                    } catch { /* compression échouée, on garde l'image d'origine */ }

                    const folder = isLabel ? "etiquettes" : "supplementaires";
                    const fileName = `${Date.now()}_${Math.random()
                        .toString(36)
                        .slice(2)}.jpg`;
                    const path = `${folder}/${interventionId}/${fileName}`;
                    const file = {
                        uri: src,
                        name: fileName,
                        type: "image/jpeg",
                    };

                    const { error: upErr } = await supabase.storage
                        .from("images")
                        .upload(path, file, {
                            upsert: true,
                            contentType: "image/jpeg",
                        });
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
                const s =
                    typeof p === "string"
                        ? p
                        : p?.url || p?.path || p?.uri || "";
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
                    const local =
                        extractLocalFromBrokenUrl(newLabel) || newLabel;
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
                showAlert("Info", "Rien à réparer pour cette fiche.");
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
                showAlert("Erreur", "La base n’a pas pu être mise à jour.");
                return;
            }

            setPhotos(newPhotos);
            setLabelPhoto(newLabel);
            setLabelPhotoDB(newLabel);
            setTakeLabelPhoto(!!newLabel);
            showAlert("OK", "Photos réparées (cloud) pour cette fiche.");
        } catch (e) {
            console.error("repairBrokenPhotoUrlsForCurrentIntervention:", e);
            showAlert("Erreur", "Problème pendant la réparation.");
        }
    };

    // Chargement initial : forcer l'ordre Articles → Intervention (pour que les Pickers aient des options)
useEffect(() => {
    (async () => {
        await Promise.all([
            loadArticles(),
            loadRepairDictionary(),
            loadComponentPool(),
        ]);

        await loadIntervention();
    })();
}, []);

    useEffect(() => {
        const fetchClientName = async () => {
            const { data, error } = await supabase
                .from("clients")
                .select("name, phone")
                .eq("id", clientId)
                .single();
            if (!error && data) {
                setClientName(data.name);
                setClientPhone(data.phone || "");
            }
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
                showAlert("Erreur", "Impossible de lire la fiche.");
                return;
            }

            // Utilitaire pour uploader une image locale et renvoyer une URL publique
            const reuploadLocal = async (localUri, isLabel = false) => {
                try {
                    // compress + upload
                    const fileName = `${Date.now()}.jpg`;
                    const folder = isLabel ? "etiquettes" : "supplementaires";
                    const path = `${folder}/${interventionId}/${fileName}`;
                    const file = {
                        uri: localUri,
                        name: fileName,
                        type: "image/jpeg",
                    };
                    const { error: upErr } = await supabase.storage
                        .from("images")
                        .upload(path, file, {
                            upsert: true,
                            contentType: "image/jpeg",
                        });
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
                const s =
                    typeof p === "string"
                        ? p
                        : p?.url || p?.path || p?.uri || "";
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
                showAlert(
                    "Erreur",
                    "Impossible de corriger la fiche en base."
                );
                return;
            }

            // 4) MAJ UI + reload
            setPhotos(fixedPhotos);
            setLabelPhoto(newLabel);
            setLabelPhotoDB(newLabel);
            setTakeLabelPhoto(!!newLabel);
            showAlert("OK", "Les photos locales ont été basculées en cloud.");
        } catch (e) {
            console.error("fixLocalPhotosForCurrentIntervention:", e);
            showAlert("Erreur", "Problème pendant la correction.");
        }
    };
const loadRepairDictionary = async () => {
    setRepairDictionaryLoading(true);

    try {
        const { data, error } = await supabase
            .from("repair_dictionary")
            .select("id, type, name, active")
            .eq("active", true)
            .order("name", { ascending: true });

        if (error) throw error;

        const rows = data || [];

        setRepairCausesList(
            rows
                .filter((row) => row.type === "cause")
                .map((row) => row.name)
        );

        setRepairActionsList(
            rows
                .filter((row) => row.type === "action")
                .map((row) => row.name)
        );
    } catch (error) {
        console.error(
            "❌ Chargement dictionnaire réparations :",
            error
        );

        showAlert(
            "Erreur",
            "Impossible de charger les causes et réparations."
        );
    } finally {
        setRepairDictionaryLoading(false);
    }
};

const componentPoolRef = useRef([]); // pool des références de composants déjà saisies sur d'autres fiches

const loadComponentPool = async () => {
    try {
        const { data, error } = await supabase
            .from("interventions")
            .select("repair_components")
            .not("repair_components", "is", null)
            .order("updatedAt", { ascending: false })
            .limit(500);

        if (error) throw error;

        const seen = new Set();
        const pool = [];

        (data || []).forEach((row) => {
            (Array.isArray(row.repair_components) ? row.repair_components : []).forEach(
                (ref) => {
                    const value = String(ref || "").trim();
                    const key = value.toLowerCase();
                    if (value && !seen.has(key)) {
                        seen.add(key);
                        pool.push(value);
                    }
                }
            );
        });

        componentPoolRef.current = pool;
    } catch (error) {
        console.error("❌ Chargement suggestions composants :", error);
    }
};

const addComponent = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return;

    const alreadyAdded = repairComponents.some(
        (ref) => ref.toLowerCase() === trimmed.toLowerCase()
    );
    if (!alreadyAdded) {
        setRepairComponents((prev) => [...prev, trimmed]);
    }

    setComponentInput("");
    setComponentSuggestions([]);
    setComponentSuggestionsVisible(false);
};

const removeComponent = (index) => {
    setRepairComponents((prev) => prev.filter((_, i) => i !== index));
};

const onComponentInputChange = (text) => {
    setComponentInput(text);

    const query = text.trim().toLowerCase();
    if (!query) {
        setComponentSuggestions([]);
        setComponentSuggestionsVisible(false);
        return;
    }

    const matches = componentPoolRef.current
        .filter(
            (ref) =>
                ref.toLowerCase().includes(query) &&
                !repairComponents.some(
                    (added) => added.toLowerCase() === ref.toLowerCase()
                )
        )
        .slice(0, 8);

    setComponentSuggestions(matches);
    setComponentSuggestionsVisible(matches.length > 0);
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
        skipDirtyRef.current = true; // le chargement initial ne doit pas marquer la fiche comme modifiée
        try {
            const [
                { data: inter, error: errInter },
                { data: client, error: errCli },
            ] = await Promise.all([
                supabase
                    .from("interventions")
                    .select(
                        "article_id, marque_id, modele_id, deviceType, brand, model, reference, description, cost, partialPayment, solderestant, status, commande, createdAt, serial_number, password, chargeur, photos, label_photo, remarks, paymentStatus, accept_screen_risk, devis_cost, is_estimate, estimate_min, estimate_max, estimate_type, estimate_accepted, estimate_accepted_at, no_cost_but_restitution, repair_cause, repair_action, repair_duration, repair_comment, repair_components, repair_proposal_made, repair_proposal, repair_proposal_price, repair_proposal_status, repair_proposal_method, repair_proposal_comment, repair_proposal_date, loaned_item, loaned_item_returned, restitution_note, restitution_note_done, restitution_note_date"
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

            const urlToLocal = async (anyRef, type = "photo", index = 0) => {
                const s = extractRefString(anyRef);
                if (!s) return null;

                const filename =
                    type === "label"
                        ? `etiquette_${interventionId}.jpg`
                        : `photo_${interventionId}_${index + 1}.jpg`;
                const localUri = localBase + filename;

                const exists = await fileExists(localUri);
                if (exists) return localUri;

                if (s.startsWith("http")) return s;

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
            setDevisCost(
                inter.devis_cost != null ? String(inter.devis_cost) : ""
            );
            setSolderestant(
                inter.solderestant != null ? String(inter.solderestant) : ""
            );
            setPartialPayment(
                inter.partialPayment != null ? String(inter.partialPayment) : ""
            );
            setStatus(inter.status || "default");
            initialStatusRef.current = inter.status || "default";
            setSerial_number(inter.serial_number || "");
            setPassword(inter.password || "");
            setPhotos(photosResolved);
            setLabelPhoto(labelResolved);
            setCommande(inter.commande || "");

            // Récupère le montant + l'id de la commande liée (best-effort, via client_id + nom du produit),
            // pour un affichage persistant du montant sans lien direct en base entre commande et intervention.
            if (inter.commande && clientId) {
                try {
                    const { data: matchingOrder } = await supabase
                        .from("orders")
                        .select("id, total, price, quantity, createdat")
                        .eq("client_id", clientId)
                        .ilike("product", inter.commande)
                        .or("deleted.is.null,deleted.eq.false")
                        .order("createdat", { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (matchingOrder) {
                        const amount =
                            matchingOrder.total ??
                            (matchingOrder.price != null && matchingOrder.quantity != null
                                ? matchingOrder.price * matchingOrder.quantity
                                : null);
                        setOrderAmount(amount != null ? String(amount) : "");
                        setOrderId(matchingOrder.id ?? null);
                        setOrderDate(matchingOrder.createdat || "");
                    }
                } catch (e) {
                    console.log("⚠️ Récupération montant commande :", e?.message || e);
                }
            }

            setRemarks(inter.remarks || "");
            setNoCostButRestitution(!!inter.no_cost_but_restitution);
            setPaymentStatus(
                inter.no_cost_but_restitution
                    ? ""
                    : inter.paymentStatus || "non_regle"
            );
            setChargeur(inter.chargeur ? "Oui" : "Non");
            setAcceptScreenRisk(!!inter.accept_screen_risk);
			setRepairCause(inter.repair_cause || "");
			setRepairAction(inter.repair_action || "");
			setRepairDuration(inter.repair_duration || "");
			setRepairComment(inter.repair_comment || "");
			setRepairComponents(
				Array.isArray(inter.repair_components) ? inter.repair_components : []
			);
			setRepairProposalMade(
    !!inter.repair_proposal_made
);
setRepairProposalExpanded(false);
setRepairProposal(
    inter.repair_proposal || ""
);

setRepairProposalPrice(
    inter.repair_proposal_price != null
        ? String(inter.repair_proposal_price)
        : ""
);

setRepairProposalStatus(
    inter.repair_proposal_status || "pending"
);

setRepairProposalMethod(
    inter.repair_proposal_method || "shop"
);

setRepairProposalComment(
    inter.repair_proposal_comment || ""
);

setRepairProposalDate(
    inter.repair_proposal_date || null
);
setLoanedItem(
    inter.loaned_item || ""
);

setLoanedItemReturned(
    !!inter.loaned_item_returned
);

setLoanedItemDate(
    inter.loaned_item_date || null
);

setLoanedItemEnabled(
    !!inter.loaned_item
);
setLoanedItemExpanded(false);
setRestitutionNote(
    inter.restitution_note || ""
);

setRestitutionNoteDone(
    !!inter.restitution_note_done
);

setRestitutionNoteDate(
    inter.restitution_note_date || null
);

setRestitutionNoteEnabled(
    !!inter.restitution_note
);
setRestitutionNoteExpanded(false);
            const dbLabel =
                typeof inter?.label_photo === "string"
                    ? inter.label_photo
                    : inter?.label_photo?.ref || inter?.label_photo?.uri || null;

            setLabelPhotoDB(dbLabel);
            setTakeLabelPhoto(!!dbLabel); // ✅ si une étiquette existe, on affiche le pavé

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
                if (
                    (inter.article_id == null || inter.article_id === "") &&
                    inter.deviceType
                ) {
                    const { data: artRow } = await supabase
                        .from("article")
                        .select("id")
                        .ilike("nom", inter.deviceType)
                        .limit(1)
                        .maybeSingle();
                    if (artRow?.id) inter.article_id = artRow.id;
                }

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
            if (inter.article_id != null) {
                const art = String(inter.article_id);
                setDeviceType(art);
                await loadBrands(art);
            } else {
                setDeviceType("");
                setBrands([]);
            }

            if (inter.marque_id != null) {
                const mar = String(inter.marque_id);
                setBrand(mar);
                await loadModels(mar);
            } else {
                setBrand("");
                setModels([]);
            }

            setModel(inter.modele_id != null ? String(inter.modele_id) : "");
        } catch (e) {
            console.error("❌ Erreur loadIntervention :", e);
        }
    };

useEffect(() => {
    const previousStatus = prevStatusRef.current;

    // Ouvrir le formulaire quand l'utilisateur passe manuellement,
    // depuis n'importe quel statut déjà défini, à "En attente de pièces"
    // ("default" = chargement initial de la fiche, à ignorer).
    if (
        previousStatus !== "default" &&
        previousStatus !== "En attente de pièces" &&
        status === "En attente de pièces"
    ) {
        setOrderProduct("");
        setOrderBrand("");
        setOrderModel("");
        setOrderUnitPrice("");
        setOrderQty("1");
        setOrderDeposit("");
        setOrderItems([]);

        setOrderModalVisible(true);
    }

    if (
        previousStatus !== "Réparé" &&
        status === "Réparé" &&
        !repairCause &&
        !repairAction
    ) {
        setRepairModalVisible(true);
    }

    prevStatusRef.current = status;
}, [status]);

    const toNum = (v, def = 0) => {
        const x = parseFloat(String(v ?? "").replace(",", "."));
        return Number.isFinite(x) ? x : def;
    };

    // Ajoute le produit en cours de saisie à la liste des produits de la commande,
    // pour permettre de commander plusieurs composants en une seule commande.
    const handleAddOrderItem = () => {
        const product = orderProduct?.trim();
        const price = toNum(orderUnitPrice, NaN);

        if (!product) {
            showAlert("Champs manquants", "Le produit est requis.");
            return;
        }
        if (!Number.isFinite(price) || price <= 0) {
            showAlert(
                "Montant invalide",
                "Saisis un prix unitaire valide (> 0)."
            );
            return;
        }

        setOrderItems((prev) => [
            ...prev,
            {
                localId: `${Date.now()}-${Math.random()}`,
                product,
                brand: orderBrand?.trim() || "",
                model: orderModel?.trim() || "",
                price,
                qty: Math.max(1, Math.floor(toNum(orderQty, 1))),
            },
        ]);

        setOrderProduct("");
        setOrderBrand("");
        setOrderModel("");
        setOrderUnitPrice("");
        setOrderQty("1");
    };

    const handleCreateOrderFromStatus = async () => {
        try {
            // Inclut automatiquement le produit en cours de saisie s'il est rempli,
            // en plus de ceux déjà ajoutés à la liste via "+ Ajouter un autre produit".
            const items = [...orderItems];
            const pendingProduct = orderProduct?.trim();
            if (pendingProduct) {
                const pendingPrice = toNum(orderUnitPrice, NaN);
                if (!Number.isFinite(pendingPrice) || pendingPrice <= 0) {
                    showAlert(
                        "Montant invalide",
                        "Saisis un prix unitaire valide (> 0)."
                    );
                    return;
                }
                items.push({
                    localId: "pending",
                    product: pendingProduct,
                    brand: orderBrand?.trim() || "",
                    model: orderModel?.trim() || "",
                    price: pendingPrice,
                    qty: Math.max(1, Math.floor(toNum(orderQty, 1))),
                });
            }

            if (items.length === 0) {
                showAlert("Champs manquants", "Ajoute au moins un produit.");
                return;
            }

            const deposit = Math.max(0, toNum(orderDeposit, 0));

            const itemsWithTotal = items.map((item) => ({
                ...item,
                total: Math.round((item.price * item.qty + Number.EPSILON) * 100) / 100,
            }));
            const total = itemsWithTotal.reduce((sum, item) => sum + item.total, 0);
            const first = itemsWithTotal[0];
            const orderName =
                itemsWithTotal.length === 1
                    ? first.product
                    : `${first.product} + ${itemsWithTotal.length - 1} autre${
                          itemsWithTotal.length > 2 ? "s" : ""
                      }`;

            const nowIso = new Date().toISOString();
            const payload = {
                client_id: clientId,
                order_name: orderName,
                items_count: itemsWithTotal.length,
                product: first.product,
                brand: first.brand,
                model: first.model,
                price: total,
                quantity: 1,
                total,
                deposit,
                received: false,
                paid: false,
                recovered: false,
                deleted: false,
                createdat: nowIso,
            };

const {
    data: createdOrder,
    error: createOrderError,
} = await supabase
    .from("orders")
    .insert([payload])
    .select("id")
    .single();

if (createOrderError) {
    console.error(
        "❌ Insertion order :",
        createOrderError
    );

    showAlert(
        "Erreur",
        "Impossible de créer la commande."
    );

    return;
}

// Création des articles liés à la commande (un par produit)
const lignes = itemsWithTotal.map((item, index) => ({
    order_id: createdOrder.id,
    product: item.product,
    brand: item.brand,
    model: item.model,
    serial: "",
    quantity: item.qty,
    unit_price: item.price,
    include_in_intervention: false,
    ordered: false,
    received: false,
    installed: false,
    position: index + 1,
}));

const { error: createOrderItemError } = await supabase
    .from("order_items")
    .insert(lignes);

if (createOrderItemError) {
    console.error(
        "❌ Création order_items :",
        createOrderItemError
    );

    showAlert(
        "Erreur",
        "La commande a été créée, mais ses produits n’ont pas pu être ajoutés."
    );

    return;
}

// Mise à jour du champ commande dans l'intervention
const {
    data: updatedIntervention,
    error: updateInterventionError,
} = await supabase
    .from("interventions")
    .update({
        commande: orderName,
        updatedAt: new Date().toISOString(),
    })
    .eq("id", interventionId)
    .select("id, commande")
    .single();

if (updateInterventionError) {
    console.error(
        "❌ Mise à jour intervention.commande :",
        updateInterventionError
    );

    showAlert(
        "Erreur",
        "La commande a été créée, mais le produit n’a pas été ajouté dans la fiche d’intervention."
    );

    return;
}

// Mise à jour immédiate du champ affiché
setCommande(
    updatedIntervention?.commande || orderName
);
setOrderAmount(total);
setOrderId(createdOrder.id);
setOrderDate(nowIso);
setOrderItems([]);
setOrderProduct("");
setOrderBrand("");
setOrderModel("");
setOrderUnitPrice("");
setOrderQty("1");
setOrderDeposit("");

setOrderModalVisible(false);

showAlert(
    "✅ Commande",
    `${itemsWithTotal.length} produit${itemsWithTotal.length > 1 ? "s" : ""} enregistré${
        itemsWithTotal.length > 1 ? "s" : ""
    }.`
);
        } catch (e) {
            console.error("❌ handleCreateOrderFromStatus:", e);
            showAlert("Erreur", "Création de la commande impossible.");
        }
    };

    const handleViewOrder = () => {
        if (!orderId) return;
        try {
            navigation.navigate("OrdersPage", {
                clientId,
                clientName: clientName || "",
            });
        } catch (e) {
            console.error("❌ handleViewOrder:", e);
            showAlert("Erreur", "Impossible d'ouvrir les commandes.");
        }
    };

    const deleteLabelPhoto = async (photoRefRaw) => {
        const photoRef = extractRefString(photoRefRaw);

        openConfirm(
            "Supprimer l’étiquette ?",
            "Cette action supprimera l’étiquette du stockage et de la fiche.",
            async () => {
                try {
                    let path = null;
                    if (photoRef && photoRef.startsWith("http")) {
                        path = pathFromSupabaseUrl(photoRef);
                    } else if (photoRef && !photoRef.startsWith("file://")) {
                        path = photoRef;
                    }

                    if (path) {
                        const { error: rmErr } = await supabase.storage
                            .from("images")
                            .remove([path]);
                        if (rmErr)
                            console.error(
                                "Erreur suppression cloud :",
                                rmErr.message
                            );
                    }

                    setLabelPhoto(null);
                    setLabelPhotoDB(null);
                    setTakeLabelPhoto(false);

                    const { error: dbErr } = await supabase
                        .from("interventions")
                        .update({ label_photo: null })
                        .eq("id", interventionId);

                    if (dbErr) {
                        console.error("Erreur MAJ BDD :", dbErr.message);
                        showAlert(
                            "Erreur",
                            "Impossible de mettre à jour la fiche."
                        );
                    }
                } catch (e) {
                    console.error(
                        "Erreur générale suppression étiquette :",
                        e
                    );
                    showAlert("Erreur", "Problème lors de la suppression.");
                }
            }
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

                if (!url) {
                    showAlert("Erreur", "Échec de l'upload de l’étiquette.");
                    return;
                }

                setLabelPhoto(url);
                setLabelPhotoDB(url); // comme ça si on sauvegarde, c’est propre
                setTakeLabelPhoto(true);
            }
        } catch (error) {
            console.error("Erreur capture étiquette :", error);
        }
    };

    const pickAdditionalImage = async () => {
        if (isAddingPhoto) return; // évite un double upload si le bouton est pressé deux fois rapidement
        setIsAddingPhoto(true);
        const toArr = (v) => {
            if (Array.isArray(v)) return v.filter(Boolean);
            if (v == null) return [];
            if (typeof v === "string") {
                const s = v.trim();
                if (!s) return [];
                try {
                    const j = JSON.parse(s);
                    if (Array.isArray(j)) return j.filter(Boolean);
                } catch { /* pas du JSON valide, ignoré */ }
                if (s.includes(","))
                    return s
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean);
                return [s];
            }
            return v ? [v] : [];
        };

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
                showAlert("Erreur", "Upload impossible, photo non ajoutée.");
                return;
            }

            setPhotos((prev) => {
                const base = toArr(prev);
                return [...base, url];
            });

            const { data: row, error: readErr } = await supabase
                .from("interventions")
                .select("photos")
                .eq("id", interventionId)
                .single();

            if (readErr) {
                console.error("Lecture photos BDD :", readErr.message);
                showAlert("Erreur", "Photo ajoutée localement, base non relue.");
                return;
            }

            const prev = toArr(row?.photos);
            const next = [...prev, url].filter(Boolean);

            let { error: dbErr } = await supabase
                .from("interventions")
                .update({ photos: next })
                .eq("id", interventionId);

            if (dbErr) {
                console.warn(
                    "Update JSONB échec, tentative en TEXT :",
                    dbErr.message
                );
                const retry = await supabase
                    .from("interventions")
                    .update({ photos: JSON.stringify(next) })
                    .eq("id", interventionId);
                dbErr = retry.error || null;
            }

            if (dbErr) {
                console.error("MAJ BDD (photos) :", dbErr.message);
                showAlert("Erreur", "Photo ajoutée localement, base non mise à jour.");
            }
        } catch (e) {
            console.error("Erreur capture image :", e);
            showAlert("Erreur", "Impossible d'ajouter la photo.");
        } finally {
            setIsAddingPhoto(false);
        }
    };
	const saveCustomRepairValue = async () => {
    const cleanedValue = customRepairValue
        .trim()
        .replace(/\s+/g, " ");

    if (!cleanedValue) {
        showAlert(
            "Valeur manquante",
            "Saisis un nom avant de valider."
        );
        return;
    }

    if (
        customRepairType !== "cause" &&
        customRepairType !== "action"
    ) {
        return;
    }

    try {
        const currentList =
            customRepairType === "cause"
                ? repairCausesList
                : repairActionsList;

        const alreadyExists = currentList.some(
            (value) =>
                value.localeCompare(cleanedValue, "fr", {
                    sensitivity: "base",
                }) === 0
        );

        if (alreadyExists) {
            showAlert(
                "Valeur existante",
                "Cette valeur existe déjà dans la liste."
            );
            return;
        }

        const { data, error } = await supabase
            .from("repair_dictionary")
            .insert([
                {
                    type: customRepairType,
                    name: cleanedValue,
                    active: true,
                },
            ])
            .select("id, type, name")
            .single();

        if (error) {
            if (error.code === "23505") {
                showAlert(
                    "Valeur existante",
                    "Cette valeur existe déjà dans la liste."
                );
                return;
            }

            throw error;
        }

        if (data.type === "cause") {
            setRepairCause(data.name);
        } else {
            setRepairAction(data.name);
        }

        await loadRepairDictionary();

        setCustomRepairModalVisible(false);
        setCustomRepairValue("");
        setCustomRepairType(null);
    } catch (error) {
        console.error(
            "❌ Ajout dictionnaire réparation :",
            error
        );

        showAlert(
            "Erreur",
            error?.message ||
                "Impossible d’ajouter cette valeur."
        );
    }
};
const loadRepairSuggestions = async (selectedCause) => {
    if (!selectedCause) {
        setRepairSuggestions([]);
        return;
    }

    setRepairSuggestionsLoading(true);

    try {
        const { data, error } = await supabase
            .from("interventions")
            .select(
                "repair_action, brand, deviceType, model, cost, repair_duration"
            )
            .eq("repair_cause", selectedCause)
            .not("repair_action", "is", null)
            .neq("repair_action", "")
            .limit(1000);

        if (error) throw error;

        const rows = data || [];

        if (rows.length === 0) {
            setRepairSuggestions([]);
            return;
        }

        /*
         * On donne plus de poids aux interventions
         * ayant la même marque ou le même type d’appareil.
         */
        const currentBrandName =
            brands.find((item) => item.id === brand)?.nom || "";

        const currentDeviceName =
            articles.find((item) => item.id === deviceType)?.nom || "";

        const actionMap = {};

        rows.forEach((row) => {
            const action = String(row.repair_action || "").trim();

            if (!action) return;

            if (!actionMap[action]) {
                actionMap[action] = {
                    action,
                    count: 0,
                    weightedCount: 0,
                    prices: [],
                    durations: {},
                };
            }

            let weight = 1;

            if (
                currentBrandName &&
                row.brand &&
                currentBrandName.toLowerCase() ===
                    String(row.brand).toLowerCase()
            ) {
                weight += 2;
            }

            if (
                currentDeviceName &&
                row.deviceType &&
                currentDeviceName.toLowerCase() ===
                    String(row.deviceType).toLowerCase()
            ) {
                weight += 1;
            }

            actionMap[action].count += 1;
            actionMap[action].weightedCount += weight;

            const price = Number(row.cost || 0);

            if (Number.isFinite(price) && price > 0) {
                actionMap[action].prices.push(price);
            }

            const duration = String(
                row.repair_duration || ""
            ).trim();

            if (duration) {
                actionMap[action].durations[duration] =
                    (actionMap[action].durations[duration] || 0) + 1;
            }
        });

        const suggestions = Object.values(actionMap)
            .map((entry) => {
                const averagePrice =
                    entry.prices.length > 0
                        ? entry.prices.reduce(
                              (sum, price) => sum + price,
                              0
                          ) / entry.prices.length
                        : null;

                const mostFrequentDuration =
                    Object.entries(entry.durations).sort(
                        (a, b) => b[1] - a[1]
                    )[0]?.[0] || null;

                return {
                    ...entry,
                    averagePrice,
                    mostFrequentDuration,
                };
            })
            .sort((a, b) => {
                if (b.weightedCount !== a.weightedCount) {
                    return b.weightedCount - a.weightedCount;
                }

                return b.count - a.count;
            })
            .slice(0, 5);

        const totalOccurrences = suggestions.reduce(
            (sum, item) => sum + item.count,
            0
        );

        setRepairSuggestions(
            suggestions.map((item) => ({
                ...item,
                percentage:
                    totalOccurrences > 0
                        ? Math.round(
                              (item.count / totalOccurrences) * 100
                          )
                        : 0,
            }))
        );
    } catch (error) {
        console.error(
            "❌ Suggestions réparation :",
            error
        );

        setRepairSuggestions([]);
    } finally {
        setRepairSuggestionsLoading(false);
    }
};
useEffect(() => {
    loadRepairSuggestions(repairCause);
}, [repairCause, brand, deviceType]);
const validateRepairInformation = () => {
    if (!repairCause) {
        showAlert(
            "Cause manquante",
            "Sélectionne la cause principale de la panne."
        );
        return;
    }

    if (!repairAction) {
        showAlert(
            "Réparation manquante",
            "Sélectionne la réparation effectuée."
        );
        return;
    }

    if (!repairDuration) {
        showAlert(
            "Temps manquant",
            "Sélectionne approximativement le temps passé."
        );
        return;
    }

    setRepairModalVisible(false);
};
    const performSaveIntervention = async () => {
        const articleName =
            articles.find((a) => a.id === deviceType)?.nom || null;
        const brandName = brands.find((b) => b.id === brand)?.nom || null;
        const modelName = models.find((m) => m.id === model)?.nom || null;

        const costValue = parseFloat(cost) || 0;
        const partialPaymentValue = parseFloat(partialPayment) || 0;

        const solderestantValue = noCostButRestitution
            ? 0
            : paymentStatus === "reglement_partiel"
            ? Math.max(costValue - partialPaymentValue, 0)
            : paymentStatus === "solde"
            ? 0
            : costValue;

        const isEstimateMode = status === "Devis en cours";

        // Photos supplémentaires : on garde ta logique (upload local -> cloud)
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
        const photosCloudFiltered = photosCloud.filter(Boolean);

        // ✅ Étiquette : optionnelle
        // - si takeLabelPhoto = false => on ne touche pas à la BDD (on garde labelPhotoDB)
        // - si takeLabelPhoto = true  => on applique labelPhoto (ou null si rien)
        let labelCloud = labelPhotoDB || null;
        if (takeLabelPhoto) {
            labelCloud = null;
            if (labelPhoto) {
                const ref = extractRefString(labelPhoto);
                if (isLocalRef(ref)) {
                    labelCloud = await uploadImageToStorage(ref, interventionId, true);
                } else {
                    labelCloud = ref;
                }
            }
        }

        const updatedIntervention = {
            article_id: toDBId(deviceType),
            marque_id: toDBId(brand),
            modele_id: toDBId(model),
            deviceType: articleName,
            brand: brandName,
            model: modelName,
            reference,
            description,
			loaned_item:
    loanedItemEnabled
        ? loanedItem.trim()
        : null,

loaned_item_returned:
    loanedItemEnabled
        ? loanedItemReturned
        : false,

loaned_item_date:
    loanedItemEnabled
        ? loanedItemDate ||
          new Date().toISOString()
        : null,
restitution_note:
    restitutionNoteEnabled
        ? restitutionNote.trim()
        : null,

restitution_note_done:
    restitutionNoteEnabled
        ? restitutionNoteDone
        : false,

restitution_note_date:
    restitutionNoteEnabled
        ? restitutionNoteDate ||
          new Date().toISOString()
        : null,

			repair_proposal_made: repairProposalMade,

repair_proposal: repairProposalMade
    ? repairProposal.trim()
    : null,

repair_proposal_price:
    repairProposalMade &&
    repairProposalPrice.trim()
        ? parseFloat(
              normalizeNumber(
                  repairProposalPrice
              )
          )
        : null,

repair_proposal_status: repairProposalMade
    ? repairProposalStatus
    : null,

repair_proposal_method: repairProposalMade
    ? repairProposalMethod
    : null,

repair_proposal_comment: repairProposalMade
    ? repairProposalComment.trim() || null
    : null,

repair_proposal_date: repairProposalMade
    ? repairProposalDate ||
      new Date().toISOString()
    : null,
            cost: costValue,
            solderestant: solderestantValue || 0,
            partialPayment: partialPaymentValue || null,
            no_cost_but_restitution: noCostButRestitution,
            status,
            password,
            serial_number,
            photos: photosCloudFiltered,
            label_photo: labelCloud,
            commande,
            remarks,
            paymentStatus,
            chargeur: chargeur === "Oui",
            accept_screen_risk: acceptScreenRisk,
            estimate_min: isEstimateMode
                ? parseFloat(normalizeNumber(estimateMin))
                : null,
            estimate_max: isEstimateMode
                ? parseFloat(normalizeNumber(estimateMax))
                : null,
            estimate_type: isEstimateMode ? estimateType : null,
            is_estimate: isEstimateMode,
            estimate_accepted:
                isEstimateMode && estimateType === "PLAFOND" ? true : null,
            estimate_accepted_at:
                isEstimateMode && estimateType === "PLAFOND"
                    ? new Date().toISOString()
                    : null,
			repair_cause: repairCause || null,
			repair_action: repairAction || null,
			repair_duration: repairDuration || null,
			repair_comment: repairComment.trim() || null,
			repair_components: repairComponents,
			// Horodatage du passage réel au statut "Réparé" (ne s'écrase pas sur les sauvegardes suivantes)
			repaired_at:
			    initialStatusRef.current !== "Réparé" && status === "Réparé"
			        ? new Date().toISOString()
			        : undefined,
            updatedAt: new Date().toISOString(),
        };

        justRepairedRef.current =
            initialStatusRef.current !== "Réparé" && status === "Réparé";

        const formattedDevisCost =
            isEstimateMode && devisCost ? parseFloat(devisCost) : null;
        if (isEstimateMode) updatedIntervention.devis_cost = formattedDevisCost;

        try {
            const { data, error } = await supabase
                .from("interventions")
                .update(updatedIntervention)
                .eq("id", interventionId)
                .select();

            if (error || !data || data.length === 0) {
                setAlertType("danger");
                setAlertTitle("Erreur");
                setAlertMessage(error?.message || "Aucune fiche mise à jour.");
                setAlertVisible(true);
                return;
            }

            setPhotos(photosCloudFiltered);
            setLabelPhoto(labelCloud);
            setLabelPhotoDB(labelCloud);
            setTakeLabelPhoto(!!labelCloud);

            setHasUnsavedChanges(false);
            setAlertType("success");
            setAlertTitle("Succès");
            setAlertMessage("Intervention mise à jour avec succès.");
            setAlertVisible(true);
        } catch (err) {
            setAlertType("danger");
            setAlertTitle("Erreur");
            setAlertMessage("Erreur lors de la mise à jour de l'intervention.");
            setAlertVisible(true);
        }
    };

    // ———————————————————————————————————————————
    // Sauvegarde
    // ———————————————————————————————————————————
    const handleSaveIntervention = async () => {
        console.log("▶️ handleSaveIntervention appelé");

        if (!interventionId) {
            setAlertType("danger");
            setAlertTitle("Erreur");
            setAlertMessage("ID d'intervention manquant.");
            setAlertVisible(true);
            return;
        }

        if (selectedImage) setSelectedImage(null);

        const errors = [];
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
            if (isNaN(min) || isNaN(max))
                errors.push("Fourchette de devis (de/à)");
            else if (min < 0 || max < 0)
                errors.push("Fourchette de devis : valeurs positives requises");
            else if (min > max)
                errors.push("Fourchette de devis : 'De' doit être ≤ 'À'");
        }

        // ✅ Étiquette optionnelle : obligatoire SEULEMENT si la case est cochée
        if (takeLabelPhoto && !labelPhoto && !labelPhotoDB) {
            errors.push("Photo d’étiquette");
        }

        if (
            paymentStatus === "reglement_partiel" &&
            (!partialPayment ||
                parseFloat(partialPayment) > parseFloat(cost || 0))
        ) {
            errors.push("Acompte valide");
        }

        if (errors.length > 0) {
            setAlertType("danger");
            setAlertTitle("Erreur");
            setAlertMessage(
                "Champs manquants ou incorrects :\n\n" + errors.join("\n")
            );
            setAlertVisible(true);
            return;
        }

        if (!password) {
            setPwdReminderVisible(true);
            return;
        }

        await performSaveIntervention();
    };

    const deletePhoto = (photoRefRaw) => {
        const photoRef = extractRefString(photoRefRaw);
        openConfirm(
            "Supprimer cette image ?",
            "Cette action supprimera l'image du stockage et de la fiche.",
            async () => {
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
                                if (rmErr)
                                    console.error(
                                        "Suppression cloud :",
                                        rmErr.message
                                    );
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
                                showAlert("Erreur", "Impossible de mettre à jour la base.");
                            }
                        } catch (e) {
                            console.error("Erreur suppression :", e);
                            showAlert("Erreur", "Problème pendant la suppression.");
                        }
            }
        );
    };

  const closeAlert = () => {
    console.log("ℹ️ closeAlert, title=", alertTitle);
    setAlertVisible(false);

    if (alertTitle === "Succès") {
        if (justRepairedRef.current) {
            justRepairedRef.current = false;
            setInvoicePromptVisible(true);
            return;
        }
        navigation.navigate("Home");
    }
};

    useEffect(() => {
        if (status === "Devis accepté" && devisCost && !cost) {
            setCost(devisCost);
        }
    }, [status, devisCost]);

    // ✅ Toggle étiquette : on masque/affiche le pavé, sans casser la BDD
    const toggleTakeLabelPhoto = () => {
        setTakeLabelPhoto((prev) => {
            const next = !prev;
            // Si on décoche : on masque et on enlève juste la sélection "courante"
            // (on garde labelPhotoDB pour ne pas effacer la BDD à la sauvegarde)
            if (!next) {
                setLabelPhoto(labelPhotoDB || null);
            } else {
                // si on recocher, on garde ce qu’on a déjà
            }
            return next;
        });
    };

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
                {/* Ligne des 3 sélecteurs : type / marque / modèle */}
                <View style={styles.pickersRow}>
                    <TouchableOpacity
                        style={styles.pickerBox}
                        onPress={() => setOpenType(true)}
                    >
                        <Text
                            style={{
                                fontSize: 16,
                                color: deviceType ? "#111" : "#666",
                            }}
                        >
                            {deviceType
                                ? articles.find((a) => a.id === deviceType)?.nom ||
                                  "Type"
                                : "Type de produit"}
                        </Text>
                    </TouchableOpacity>

                    <View style={{ width: 8 }} />

                    <TouchableOpacity
                        style={[
                            styles.pickerBox,
                            { opacity: deviceType ? 1 : 0.5 },
                        ]}
                        disabled={!deviceType}
                        onPress={() => setOpenBrand(true)}
                    >
                        <Text
                            style={{
                                fontSize: 16,
                                color: brand ? "#111" : "#666",
                            }}
                        >
                            {brand
                                ? brands.find((b) => b.id === brand)?.nom ||
                                  "Marque"
                                : "Marque"}
                        </Text>
                    </TouchableOpacity>

                    <View style={{ width: 8 }} />

                    <TouchableOpacity
                        style={[styles.pickerBox, { opacity: brand ? 1 : 0.5 }]}
                        disabled={!brand}
                        onPress={() => setOpenModel(true)}
                    >
                        <Text
                            style={{
                                fontSize: 16,
                                color: model ? "#111" : "#666",
                            }}
                        >
                            {model
                                ? models.find((m) => m.id === model)?.nom ||
                                  "Modèle"
                                : "Modèle"}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Référence avec label flottant */}
                <FloatingField label="Référence du produit">
                    <View style={styles.referenceContainer}>
                        <TextInput
                            style={styles.referenceInput}
                            value={reference.toUpperCase()}
                            onFocus={() => {
                                // Efface l'indication "Voir photo..." dès qu'on tape ou scanne un code-barre dans le champ
                                if (reference === REFERENCE_PHOTO_HINT) setReference("");
                            }}
                            onChangeText={(t) => {
                                // Filet de sécurité si la douchette écrit avant que le focus n'ait déclenché l'effacement
                                if (
                                    reference === REFERENCE_PHOTO_HINT &&
                                    t.toUpperCase().startsWith(REFERENCE_PHOTO_HINT.toUpperCase())
                                ) {
                                    setReference(
                                        t.slice(REFERENCE_PHOTO_HINT.length).toUpperCase()
                                    );
                                } else {
                                    setReference(t.toUpperCase());
                                }
                            }}
                            autoCapitalize="characters"
                            placeholder=" "
                            placeholderTextColor="#d1d0d0"
                        />
                    </View>
                </FloatingField>

                {/* ✅ Case à cocher : étiquette optionnelle */}
                <View style={[styles.checkboxContainer, { marginTop: 6, width: "90%", alignSelf: "center" }]}>
                    <TouchableOpacity
                        onPress={toggleTakeLabelPhoto}
                        style={[styles.checkboxRow, { marginLeft: 0 }]}
                        activeOpacity={0.85}
                    >
                        <View style={styles.checkbox}>
                            {takeLabelPhoto && (
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
                        <Text style={[styles.checkboxLabel, { fontStyle: "italic" }]}>
                            Prendre la photo de l’étiquette
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* ✅ Pavé étiquette : masqué par défaut, affiché si case cochée */}
                {takeLabelPhoto && (
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginTop: 10,
                            alignSelf: "center",
                        }}
                    >
                        <TouchableOpacity
                            style={styles.buttonLabel}
                            onPress={pickLabelImage}
                        >
                            <Text style={styles.buttonTextLabel}>
                                Prendre une photo de l'étiquette
                            </Text>
                            <Image
                                source={require("../assets/icons/photo1.png")}
                                style={[styles.iconRight, { tintColor: "#ececec" }]}
                            />
                        </TouchableOpacity>

                        {(labelPhoto || labelPhotoDB) ? (
                            <View style={{ marginLeft: 10, alignItems: "center" }}>
                                {(() => {
                                    const labelToUse = labelPhoto || labelPhotoDB;
                                    const labelRaw = extractRefString(labelPhotoDB ?? labelPhoto);
                                    return (
                                        <TouchableOpacity
                                            onPress={() => setSelectedImage(labelToUse)}
                                            onLongPress={() => deleteLabelPhoto(labelRaw)}
                                            delayLongPress={400}
                                            activeOpacity={0.85}
                                            style={[styles.thumbWrap, styles.labelWrap]}
                                        >
                                            <ResolvedImage
                                                refOrPath={labelToUse}
                                                size={30}
                                                style={styles.labelOutline}
                                            />
                                        </TouchableOpacity>
                                    );
                                })()}
                            </View>
                        ) : null}
                    </View>
                )}

                {/* (Optionnel) si case décochée mais étiquette existante, on laisse un accès discret */}
                {!takeLabelPhoto && (labelPhotoDB || labelPhoto) ? (
                    <View
                        style={{
                            width: "90%",
                            alignSelf: "center",
                            marginTop: 8,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <Text style={{ color: "#333", fontWeight: "600" }}>
                            Étiquette enregistrée
                        </Text>
                        <View style={{ flexDirection: "row", gap: 10 }}>
                            <TouchableOpacity
                                onPress={() => setSelectedImage(labelPhotoDB || labelPhoto)}
                                style={{
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    borderWidth: 1,
                                    borderColor: "#777",
                                    borderRadius: 8,
                                    backgroundColor: "#e7e7e7",
                                }}
                            >
                                <Text style={{ fontWeight: "700", color: "#222" }}>
                                    Voir
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => deleteLabelPhoto(extractRefString(labelPhotoDB || labelPhoto))}
                                style={{
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    borderWidth: 1,
                                    borderColor: "#b71c1c",
                                    borderRadius: 8,
                                    backgroundColor: "#ffebee",
                                }}
                            >
                                <Text style={{ fontWeight: "700", color: "#b71c1c" }}>
                                    Supprimer
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}

                {/* Description avec label flottant */}
                <FloatingField label="Description de la panne">
                    <TextInput
                        style={[styles.input, { height: 40 }]}
                        value={description.toUpperCase()}
                        onChangeText={(t) => setDescription(t.toUpperCase())}
                        multiline
                        autoCapitalize="characters"
                        placeholder=" "
                        placeholderTextColor="#d1d0d0"
                    />
                </FloatingField>
{/* Proposition de réparation */}
<View style={styles.repairProposalBox}>
    <TouchableOpacity
        style={styles.repairProposalHeader}
        activeOpacity={0.8}
onPress={() => {
    if (!repairProposalMade) {
        setRepairProposalMade(true);
        setRepairProposalExpanded(true);
        return;
    }

    setRepairProposalExpanded(
        (previous) => !previous
    );
}}
    >
        <View
            style={[
                styles.repairProposalCheckbox,
                repairProposalMade &&
                    styles.repairProposalCheckboxChecked,
            ]}
        >
            {repairProposalMade && (
                <Text
                    style={
                        styles.repairProposalCheckText
                    }
                >
                    ✓
                </Text>
            )}
        </View>

        <View style={{ flex: 1 }}>
            <Text
                style={styles.repairProposalTitle}
            >
                Estimation à la réception
            </Text>

            <Text
                style={
                    styles.repairProposalSubtitle
                }
            >
                Réparation envisagée et coût
                approximatif
            </Text>
        </View>

        <Text
            style={
                styles.repairProposalChevron
            }
        >
            {repairProposalExpanded ? "▲" : "▼"}
        </Text>
    </TouchableOpacity>

{repairProposalExpanded && (
    <View style={styles.repairProposalContent}>
            <FloatingField label="Réparation envisagée">
                <TextInput
                    style={[
                        styles.input,
                        styles.repairProposalTextInput,
                    ]}
                    value={repairProposal}
                    onChangeText={
                        setRepairProposal
                    }
                    multiline
                    textAlignVertical="top"
                    placeholder="Exemple : remplacement du circuit d’affichage"
                    placeholderTextColor="#7b7b7b"
                />
            </FloatingField>

            <FloatingField label="Coût approximatif (€)">
                <TextInput
                    style={styles.input}
                    value={repairProposalPrice}
                    onChangeText={(value) =>
                        setRepairProposalPrice(
                            normalizeNumber(value)
                        )
                    }
                    keyboardType="numeric"
                    placeholder="Exemple : 120"
                    placeholderTextColor="#7b7b7b"
                />
            </FloatingField>

            <FloatingField label="Accord du client">
                <Picker
                    selectedValue={
                        repairProposalStatus
                    }
                    style={styles.input}
                    onValueChange={
                        setRepairProposalStatus
                    }
                >
                    <Picker.Item
                        label="À confirmer"
                        value="pending"
                    />

                    <Picker.Item
                        label="Accord donné"
                        value="accepted"
                    />

                    <Picker.Item
                        label="Refusée"
                        value="refused"
                    />
                </Picker>
            </FloatingField>

            <FloatingField label="Information donnée">
                <Picker
                    selectedValue={
                        repairProposalMethod
                    }
                    style={styles.input}
                    onValueChange={
                        setRepairProposalMethod
                    }
                >
                    <Picker.Item
                        label="En présence du client"
                        value="shop"
                    />

                    <Picker.Item
                        label="Par téléphone"
                        value="phone"
                    />

                    <Picker.Item
                        label="Par SMS"
                        value="sms"
                    />

                    <Picker.Item
                        label="Par email"
                        value="email"
                    />
                </Picker>
            </FloatingField>

            <FloatingField label="Commentaire">
                <TextInput
                    style={[
                        styles.input,
                        styles.repairProposalCommentInput,
                    ]}
                    value={
                        repairProposalComment
                    }
                    onChangeText={
                        setRepairProposalComment
                    }
                    multiline
                    textAlignVertical="top"
                />
            </FloatingField>

            {!!repairProposalDate && (
                <Text
                    style={
                        styles.repairProposalDateText
                    }
                >
                    Estimation enregistrée le{" "}
                    {new Date(
                        repairProposalDate
                    ).toLocaleString("fr-FR")}
                </Text>
            )}
        </View>
    )}
</View>
                {/* Mot de passe */}
                <FloatingField label="Mot de passe (si applicable)">
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        placeholder=" "
                        placeholderTextColor="#d1d0d0"
                    />
                </FloatingField>
{/* Prêt de matériel */}
<View style={styles.repairProposalBox}>
    <TouchableOpacity
        style={styles.repairProposalHeader}
        activeOpacity={0.8}
onPress={() => {
    if (!loanedItemEnabled) {
        setLoanedItemEnabled(true);
        setLoanedItemExpanded(true);
        return;
    }

    setLoanedItemExpanded(
        (previous) => !previous
    );
}}
    >
        <View
            style={[
                styles.repairProposalCheckbox,
                loanedItemEnabled &&
                    styles.repairProposalCheckboxChecked,
            ]}
        >
            {loanedItemEnabled && (
                <Text
                    style={styles.repairProposalCheckText}
                >
                    ✓
                </Text>
            )}
        </View>

        <View style={{ flex: 1 }}>
            <Text style={styles.repairProposalTitle}>
                Prêt de matériel
            </Text>

            <Text
                style={
                    styles.repairProposalSubtitle
                }
            >
                Chargeur, alimentation,
                adaptateur...
            </Text>
        </View>

        <Text
            style={styles.repairProposalChevron}
        >
            {loanedItemExpanded ? "⌃" : "⌄"}
        </Text>
    </TouchableOpacity>

    {loanedItemExpanded && (
        <View
            style={styles.repairProposalContent}
        >
            <FloatingField label="Matériel prêté">
                <TextInput
                    style={styles.input}
                    value={loanedItem}
                    onChangeText={setLoanedItem}
                    placeholder="Ex : Chargeur Lenovo USB-C 65W"
                    placeholderTextColor="#777"
                />
            </FloatingField>

            <TouchableOpacity
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 12,
                }}
                onPress={() =>
                    setLoanedItemReturned(
                        !loanedItemReturned
                    )
                }
            >
                <View
                    style={[
                        styles.repairProposalCheckbox,
                        loanedItemReturned &&
                            styles.repairProposalCheckboxChecked,
                    ]}
                >
                    {loanedItemReturned && (
                        <Text
                            style={
                                styles.repairProposalCheckText
                            }
                        >
                            ✓
                        </Text>
                    )}
                </View>

                <Text
                    style={{
                        marginLeft: 10,
                        fontSize: 15,
                        color: "#444",
                        fontWeight: "600",
                    }}
                >
                    Matériel restitué
                </Text>
            </TouchableOpacity>
			<TouchableOpacity
    activeOpacity={0.8}
    onPress={() => {
        openConfirm(
            "Supprimer le prêt",
            "Voulez-vous effacer le matériel prêté de cette fiche ?",
            () => {
                setLoanedItemEnabled(false);
                setLoanedItemExpanded(false);
                setLoanedItem("");
                setLoanedItemReturned(false);
                setLoanedItemDate(null);
            }
        );
    }}
    style={{
        alignSelf: "flex-start",
        marginTop: 14,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: "#dc2626",
        borderRadius: 7,
        backgroundColor: "#fff1f2",
    }}
>
    <Text
        style={{
            color: "#b91c1c",
            fontSize: 13,
            fontWeight: "bold",
        }}
    >
        Supprimer ce prêt
    </Text>
</TouchableOpacity>
        </View>
    )}
</View>

{/* Information à rappeler */}
<View style={styles.repairProposalBox}>
    <TouchableOpacity
        style={styles.repairProposalHeader}
        activeOpacity={0.8}
onPress={() => {
    if (!restitutionNoteEnabled) {
        setRestitutionNoteEnabled(true);
        setRestitutionNoteExpanded(true);
        return;
    }

    setRestitutionNoteExpanded(
        (previous) => !previous
    );
}}
    >
        <View
            style={[
                styles.repairProposalCheckbox,
                restitutionNoteEnabled &&
                    styles.repairProposalCheckboxChecked,
            ]}
        >
            {restitutionNoteEnabled && (
                <Text
                    style={styles.repairProposalCheckText}
                >
                    ✓
                </Text>
            )}
        </View>

        <View style={{ flex: 1 }}>
            <Text style={styles.repairProposalTitle}>
                Information à rappeler
            </Text>

            <Text
                style={
                    styles.repairProposalSubtitle
                }
            >
                À signaler au client lors de la restitution
            </Text>
        </View>

        <Text
            style={styles.repairProposalChevron}
        >
{restitutionNoteExpanded
    ? "⌃"
    : "⌄"}
        </Text>
    </TouchableOpacity>

    {restitutionNoteExpanded && (
        <View
            style={styles.repairProposalContent}
        >
            <FloatingField label="Message">
                <TextInput
                    style={[
                        styles.input,
                        styles.repairProposalCommentInput,
                    ]}
                    value={restitutionNote}
                    onChangeText={
                        setRestitutionNote
                    }
                    multiline
                    textAlignVertical="top"
                    placeholder="Ex : Le PC chauffe fortement. Proposer un nettoyage."
                />
            </FloatingField>

            <TouchableOpacity
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 12,
                }}
                onPress={() =>
                    setRestitutionNoteDone(
                        !restitutionNoteDone
                    )
                }
            >
                <View
                    style={[
                        styles.repairProposalCheckbox,
                        restitutionNoteDone &&
                            styles.repairProposalCheckboxChecked,
                    ]}
                >
                    {restitutionNoteDone && (
                        <Text
                            style={
                                styles.repairProposalCheckText
                            }
                        >
                            ✓
                        </Text>
                    )}
                </View>

                <Text
                    style={{
                        marginLeft: 10,
                        fontSize: 15,
                        color: "#444",
                        fontWeight: "600",
                    }}
                >
                    Information donnée au client
                </Text>
            </TouchableOpacity>
			<TouchableOpacity
    activeOpacity={0.8}
    onPress={() => {
        openConfirm(
            "Supprimer le rappel",
            "Voulez-vous effacer cette information de la fiche ?",
            () => {
                setRestitutionNoteEnabled(false);
                setRestitutionNoteExpanded(false);
                setRestitutionNote("");
                setRestitutionNoteDone(false);
                setRestitutionNoteDate(null);
            }
        );
    }}
    style={{
        alignSelf: "flex-start",
        marginTop: 14,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: "#dc2626",
        borderRadius: 7,
        backgroundColor: "#fff1f2",
    }}
>
    <Text
        style={{
            color: "#b91c1c",
            fontSize: 13,
            fontWeight: "bold",
        }}
    >
        Supprimer ce rappel
    </Text>
</TouchableOpacity>
        </View>
    )}
</View>

                {/* Coût (version bloquée en mode devis) */}
                <FloatingField label="Coût de l'intervention (€)">
                    <TextInput
                        style={styles.input}
                        value={cost ? String(cost) : ""}
                        onChangeText={setCost}
                        keyboardType="numeric"
                        editable={status !== "Devis en cours"}
                        placeholder={
                            status === "Devis en cours"
                                ? "Indisponible en mode Devis"
                                : " "
                        }
                        placeholderTextColor="#d1d0d0"
                    />
                </FloatingField>

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
                                J'accepte le démontage de l'écran de mon produit
                                malgré le risque de casse.
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
                        <FloatingField label="Acompte (€)">
                            <TextInput
                                style={styles.input}
                                value={partialPayment ? String(partialPayment) : ""}
                                onChangeText={setPartialPayment}
                                keyboardType="numeric"
                                placeholder=" "
                                placeholderTextColor="#d1d0d0"
                            />
                        </FloatingField>
                        <Text style={styles.interventionText}>
                            Solde restant dû :{" "}
                            {Math.max(
                                (parseFloat(cost) || 0) -
                                    (parseFloat(partialPayment) || 0),
                                0
                            ).toFixed(2)}{" "}
                            €
                        </Text>
                    </>
                )}

                {/* Statut & devis */}
                <View style={styles.rowFlexContainer}>
                    <View style={[styles.fullwidthContainer, { width: "100%" }]}>
                        <View style={{ width: "90%", alignSelf: "center", flexDirection: "row", gap: 8 }}>
                            {/* Statut avec label flottant */}
                            <FloatingField label="Statut" style={{ flex: 1 }}>
                                <TouchableOpacity
                                    style={[styles.repairSelectButton, { width: "100%" }]}
                                    onPress={() => setStatusPickerVisible(true)}
                                >
                                    <Text
                                        style={[
                                            styles.repairSelectText,
                                            status === "default" && styles.repairPlaceholderText,
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {status === "default" ? "Choisir..." : status}
                                    </Text>
                                    <Text style={styles.repairChevron}>›</Text>
                                </TouchableOpacity>
                            </FloatingField>

                            {/* Commande, entre Statut et Chargeur, uniquement si en attente de pièces */}
                            {status === "En attente de pièces" && (
                                <FloatingField label="Commande" style={{ flex: 1.2 }}>
                                    <View style={{ width: "100%", position: "relative" }}>
                                        <TextInput
                                            style={[
                                                styles.input,
                                                { width: "100%", alignSelf: "auto" },
                                                orderAmount !== "" && { paddingRight: 60 },
                                            ]}
                                            value={commande.toUpperCase()}
                                            onChangeText={(t) => setCommande(t.toUpperCase())}
                                            autoCapitalize="characters"
                                            placeholder=" "
                                            placeholderTextColor="#202020"
                                        />
                                        {orderAmount !== "" && (
                                            <Text
                                                pointerEvents="none"
                                                style={{
                                                    position: "absolute",
                                                    right: 8,
                                                    top: 0,
                                                    height: 50,
                                                    lineHeight: 50,
                                                    fontSize: 11,
                                                    fontWeight: "600",
                                                    color: "#202020",
                                                }}
                                            >
                                                ({parseFloat(orderAmount).toFixed(2)}€)
                                            </Text>
                                        )}
                                    </View>
                                </FloatingField>
                            )}

                            {/* Chargeur */}
                            <FloatingField
                                label="Chargeur"
                                style={{ flex: status === "En attente de pièces" ? 0.7 : 1 }}
                            >
                                <TouchableOpacity
                                    style={[styles.repairSelectButton, { width: "100%" }]}
                                    onPress={() => setChargeurPickerVisible(true)}
                                >
                                    <Text style={styles.repairSelectText} numberOfLines={1}>
                                        {chargeur}
                                    </Text>
                                    <Text style={styles.repairChevron}>›</Text>
                                </TouchableOpacity>
                            </FloatingField>
                        </View>

                        {status === "En attente de pièces" && orderId != null && (
                            <>
                                {orderDate !== "" && (
                                    <Text
                                        style={{
                                            width: "90%",
                                            alignSelf: "center",
                                            textAlign: "center",
                                            marginTop: 4,
                                            color: "#666",
                                            fontSize: 12,
                                        }}
                                    >
                                        Commandée le{" "}
                                        {new Date(orderDate).toLocaleDateString("fr-FR")}
                                    </Text>
                                )}
                                <TouchableOpacity
                                    onPress={handleViewOrder}
                                    style={{
                                        width: "90%",
                                        alignSelf: "center",
                                        marginTop: 4,
                                        marginBottom: 12,
                                        backgroundColor: "#191f2f",
                                        paddingVertical: 8,
                                        paddingHorizontal: 12,
                                        borderRadius: 8,
                                        alignItems: "center",
                                    }}
                                >
                                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                                        Voir la commande
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {/* Montant du devis */}
                        {status === "Devis en cours" && (
                            <FloatingField label="Montant du devis (si besoin)">
                                <TextInput
                                    style={styles.input}
                                    placeholder=" "
                                    placeholderTextColor="#000000"
                                    keyboardType="numeric"
                                    value={devisCost}
                                    onChangeText={setDevisCost}
                                />
                            </FloatingField>
                        )}

                        {/* Fourchette de devis */}
                        {status === "Devis en cours" && (
                            <>
                                <FloatingField label="Fourchette de devis (€)">
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
                                </FloatingField>

                                {/* Type de fourchette */}
                                <FloatingField label="Type de fourchette">
                                    <Picker
                                        selectedValue={estimateType}
                                        style={[styles.input, styles.picker]}
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
                                </FloatingField>

                                <Text
                                    style={[
                                        styles.interventionText,
                                        { width: "90%", alignSelf: "center" },
                                    ]}
                                >
                                    Si “plafond” est choisi, le client accepte un montant maximum garanti
                                    (vous facturez ≤ {estimateMax || "…"} €).
                                </Text>
                            </>
                        )}

                        {status !== "Devis en cours" && orderAmount !== "" && (
                            <Text style={styles.interventionText}>
                                Coût total (commande comprise) :{" "}
                                {(
                                    (parseFloat(cost) || 0) +
                                    (parseFloat(orderAmount) || 0)
                                ).toFixed(2)}{" "}
                                €
                            </Text>
                        )}
                    </View>
                </View>

                {/* Remarques */}
                <FloatingField label="Remarques">
                    <TextInput
                        style={[styles.input, { height: 40 }]}
                        value={remarks}
                        onChangeText={setRemarks}
                        placeholder="Ajoutez des remarques ici..."
                        placeholderTextColor="#9f9f9f"
                        multiline
                    />
                </FloatingField>

                {/* Galerie photos supplémentaires */}
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
                            {Array.isArray(photos) &&
                                _uniqPhotosForView(photos, labelPhotoDB ?? labelPhoto).length >
                                    0 && (
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            flexWrap: "wrap",
                                            justifyContent: "center",
                                        }}
                                    >
                                        {_uniqPhotosForView(photos, labelPhotoDB ?? labelPhoto).map(
                                            (refStr, index) => {
                                                return (
                                                    <View
                                                        key={`${_bucketKey(refStr)}-${index}`}
                                                        style={{
                                                            margin: 6,
                                                            alignItems: "center",
                                                        }}
                                                    >
                                                        <Pressable
                                                            onPress={() => setSelectedImage(refStr)}
                                                            onLongPress={() => deletePhoto(refStr)}
                                                            delayLongPress={400}
                                                            style={styles.thumbWrap}
                                                        >
                                                            <ResolvedImage
                                                                refOrPath={refStr}
                                                                size={100}
                                                            />
                                                        </Pressable>
                                                    </View>
                                                );
                                            }
                                        )}
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
                        disabled={isAddingPhoto}
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

                <BackButton onPress={() => navigation.goBack()} style={{ marginTop: 16 }} />
            </ScrollView>

            {/* === MODALES (Type / Marque / Modèle / Alertes / etc.) : inchangées === */}
            {/* ... le reste de ton fichier est identique ... */}

            {/* === MODALE TYPE === */}
            <Modal
                visible={openType}
                transparent
                animationType="fade"
                onRequestClose={() => setOpenType(false)}
            >
                <View style={styles.modalOverlayFull}>
                    <View style={styles.modalPickerBox}>
                        <Text style={styles.modalPickerTitle}>Type de produit</Text>
                        <FlatList
                            data={articles.map((a) => ({ label: a.nom, value: a.id }))}
                            keyExtractor={(it, i) => String(it.value ?? i)}
                            numColumns={4}
                            columnWrapperStyle={{ gap: 8 }}
                            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                            contentContainerStyle={{ gap: 8 }}
                            renderItem={({ item }) => (
                                <Pressable
                                    onPress={() => {
                                        handleDeviceTypeChange(item.value);
                                        setOpenType(false);
                                    }}
                                    style={({ pressed }) => ({
                                        flex: 1 / 4,
                                        paddingVertical: 10,
                                        paddingHorizontal: 8,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderWidth: 1,
                                        borderColor: "#e5e5e5",
                                        backgroundColor: pressed ? "#f2f2f2" : "#fff",
                                        minHeight: 48,
                                    })}
                                >
                                    <Text numberOfLines={2} style={{ fontSize: 14, textAlign: "center" }}>
                                        {item.label}
                                    </Text>
                                </Pressable>
                            )}
                        />
                        <TouchableOpacity
                            onPress={() => setOpenType(false)}
                            style={styles.modalCloseBtn}
                        >
                            <Text style={styles.modalCloseText}>Fermer</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* === MODALE MARQUE === */}
            <Modal
                visible={openBrand}
                transparent
                animationType="fade"
                onRequestClose={() => setOpenBrand(false)}
            >
                <View style={styles.modalOverlayFull}>
                    <View style={styles.modalPickerBox}>
                        <Text style={styles.modalPickerTitle}>Marque du produit</Text>
                        <FlatList
                            data={brands.map((b) => ({ label: b.nom, value: b.id }))}
                            keyExtractor={(it, i) => String(it.value ?? i)}
                            numColumns={4}
                            columnWrapperStyle={{ gap: 8 }}
                            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                            contentContainerStyle={{ gap: 8 }}
                            renderItem={({ item }) => (
                                <Pressable
                                    onPress={() => {
                                        handleBrandChange(item.value);
                                        setOpenBrand(false);
                                    }}
                                    style={({ pressed }) => ({
                                        flex: 1 / 4,
                                        paddingVertical: 10,
                                        paddingHorizontal: 8,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderWidth: 1,
                                        borderColor: "#e5e5e5",
                                        backgroundColor: pressed ? "#f2f2f2" : "#fff",
                                        minHeight: 48,
                                    })}
                                >
                                    <Text numberOfLines={2} style={{ fontSize: 14, textAlign: "center" }}>
                                        {item.label}
                                    </Text>
                                </Pressable>
                            )}
                        />
                        <TouchableOpacity
                            onPress={() => setOpenBrand(false)}
                            style={styles.modalCloseBtn}
                        >
                            <Text style={styles.modalCloseText}>Fermer</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* === MODALE MODÈLE === */}
            <Modal
                visible={openModel}
                transparent
                animationType="fade"
                onRequestClose={() => setOpenModel(false)}
            >
                <View style={styles.modalOverlayFull}>
                    <View style={styles.modalPickerBox}>
                        <Text style={styles.modalPickerTitle}>Modèle du produit</Text>
                        <FlatList
                            data={models.map((m) => ({ label: m.nom, value: m.id }))}
                            keyExtractor={(it, i) => String(it.value ?? i)}
                            numColumns={4}
                            columnWrapperStyle={{ gap: 8 }}
                            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                            contentContainerStyle={{ gap: 8 }}
                            renderItem={({ item }) => (
                                <Pressable
                                    onPress={() => {
                                        handleModelChange(item.value);
                                        setOpenModel(false);
                                    }}
                                    style={({ pressed }) => ({
                                        flex: 1 / 4,
                                        paddingVertical: 10,
                                        paddingHorizontal: 8,
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderWidth: 1,
                                        borderColor: "#e5e5e5",
                                        backgroundColor: pressed ? "#f2f2f2" : "#fff",
                                        minHeight: 48,
                                    })}
                                >
                                    <Text numberOfLines={2} style={{ fontSize: 14, textAlign: "center" }}>
                                        {item.label}
                                    </Text>
                                </Pressable>
                            )}
                        />
                        <TouchableOpacity
                            onPress={() => setOpenModel(false)}
                            style={styles.modalCloseBtn}
                        >
                            <Text style={styles.modalCloseText}>Fermer</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modale info */}
            <CustomAlert
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                onClose={closeAlert}
            />

            {/* Confirmations génériques (suppressions, etc.) */}
            <AlertBox
                visible={confirmDialog.visible}
                title={confirmDialog.title}
                message={confirmDialog.message}
                cancelText="Annuler"
                confirmText="Supprimer"
                onClose={closeConfirm}
                onConfirm={() => {
                    closeConfirm();
                    if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                }}
            />

            <AlertBox
                visible={!!pendingLeaveAction}
                title="Modifications non enregistrées"
                message="Vous allez perdre les informations modifiées sur cette intervention. Voulez-vous vraiment quitter ?"
                cancelText="Annuler"
                confirmText="Quitter"
                onClose={() => setPendingLeaveAction(null)}
                onConfirm={() => {
                    const action = pendingLeaveAction;
                    setHasUnsavedChanges(false);
                    setPendingLeaveAction(null);
                    action?.();
                }}
            />

            {/* Modale rappel mot de passe */}
            <AlertBox
                visible={pwdReminderVisible}
                title="Rappel"
                message="Aucun mot de passe n’a été saisi. Continuer sans renseigner le mot de passe ?"
                cancelText="Annuler"
                confirmText="Continuer"
                onClose={() => setPwdReminderVisible(false)}
                onConfirm={() => {
                    setPwdReminderVisible(false);
                    performSaveIntervention();
                }}
            />

            {/* Modale proposition de facturation (passage au statut Réparé) */}
            <AlertBox
                visible={invoicePromptVisible}
                title="Facturer maintenant ?"
                message="L’intervention est marquée Réparé. Voulez-vous créer la facture pour ce client maintenant ?"
                cancelText="Plus tard"
                confirmText="Facturer"
                onClose={() => {
                    setInvoicePromptVisible(false);
                    navigation.navigate("Home");
                }}
                onConfirm={() => {
                    setInvoicePromptVisible(false);
                    const articleName =
                        articles.find((a) => a.id === deviceType)?.nom || "";
                    const brandName =
                        brands.find((b) => b.id === brand)?.nom || "";
                    const modelName =
                        models.find((m) => m.id === model)?.nom || "";
                    navigation.navigate("BillingPage", {
                        expressData: {
                            name: clientName,
                            phone: clientPhone,
                            client_address: "",
                            description: `${description}\n${articleName} — ${brandName} — ${modelName}`,
                            quantity: "1",
                            price: cost?.toString() || "0",
                            serial: serial_number || "",
                            paymentmethod: "",
                            acompte: partialPayment?.toString() || "",
                            paid: paymentStatus === "solde",
                            intervention_id: interventionId,
                        },
                    });
                }}
            />
            {/* Modale création commande rapide */}
            <Modal
                visible={orderModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setOrderModalVisible(false)}
            >
                <View
                    style={{
                        flex: 1,
                        backgroundColor: "rgba(0,0,0,0.5)",
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    <View
                        style={{
                            width: "92%",
                            maxHeight: "88%",
                            backgroundColor: "#fff",
                            borderRadius: 10,
                            padding: 14,
                        }}
                    >
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text
                            style={{
                                fontSize: 18,
                                fontWeight: "700",
                                textAlign: "center",
                                marginBottom: 10,
                            }}
                        >
                            Créer la commande
                        </Text>

                        <FloatingField label="Produit à commander">
                            <TextInput
                                style={styles.input}
                                value={orderProduct}
                                onChangeText={setOrderProduct}
                                placeholder="Ex: BATTERIE ASUS X512"
                                placeholderTextColor="#777"
                            />
                        </FloatingField>

                        <FloatingField label="Marque">
                            <TextInput
                                style={styles.input}
                                value={orderBrand}
                                onChangeText={setOrderBrand}
                                placeholder="(facultatif)"
                                placeholderTextColor="#777"
                            />
                        </FloatingField>

                        <FloatingField label="Modèle">
                            <TextInput
                                style={styles.input}
                                value={orderModel}
                                onChangeText={setOrderModel}
                                placeholder="(facultatif)"
                                placeholderTextColor="#777"
                            />
                        </FloatingField>

                        <FloatingField label="Prix unitaire (€)">
                            <TextInput
                                style={styles.input}
                                value={orderUnitPrice}
                                onChangeText={setOrderUnitPrice}
                                keyboardType="decimal-pad"
                                placeholder="Ex: 80"
                                placeholderTextColor="#777"
                            />
                        </FloatingField>

                        <FloatingField label="Quantité">
                            <TextInput
                                style={styles.input}
                                value={orderQty}
                                onChangeText={(t) => setOrderQty(t.replace(/[^\d]/g, ""))}
                                keyboardType="number-pad"
                                placeholder="1"
                                placeholderTextColor="#777"
                            />
                        </FloatingField>

                        <TouchableOpacity
                            onPress={handleAddOrderItem}
                            style={{
                                alignSelf: "center",
                                marginBottom: 10,
                                paddingVertical: 8,
                                paddingHorizontal: 14,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: "#0d6efd",
                            }}
                        >
                            <Text style={{ color: "#0d6efd", fontWeight: "700" }}>
                                + Ajouter un autre produit
                            </Text>
                        </TouchableOpacity>

                        {orderItems.length > 0 && (
                            <View
                                style={{
                                    marginBottom: 10,
                                    borderWidth: 1,
                                    borderColor: "#ddd",
                                    borderRadius: 8,
                                    backgroundColor: "#fafafa",
                                    padding: 10,
                                }}
                            >
                                <Text style={{ fontWeight: "700", marginBottom: 6 }}>
                                    Produits ajoutés
                                </Text>
                                {orderItems.map((item) => (
                                    <View
                                        key={item.localId}
                                        style={{
                                            flexDirection: "row",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: 6,
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontWeight: "600" }}>
                                                {item.product}
                                            </Text>
                                            <Text style={{ color: "#666", fontSize: 12 }}>
                                                {item.qty} × {item.price.toFixed(2)} €
                                            </Text>
                                        </View>
                                        <TouchableOpacity
                                            onPress={() =>
                                                setOrderItems((prev) =>
                                                    prev.filter(
                                                        (p) => p.localId !== item.localId
                                                    )
                                                )
                                            }
                                        >
                                            <Text
                                                style={{
                                                    color: "red",
                                                    marginLeft: 10,
                                                    fontWeight: "700",
                                                }}
                                            >
                                                ✕
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        <FloatingField label="Acompte (€)">
                            <TextInput
                                style={styles.input}
                                value={orderDeposit}
                                onChangeText={setOrderDeposit}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor="#777"
                            />
                        </FloatingField>

                        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                            <TouchableOpacity
                                onPress={() => setOrderModalVisible(false)}
                                style={{
                                    flex: 1,
                                    backgroundColor: "#6c757d",
                                    padding: 12,
                                    borderRadius: 8,
                                    alignItems: "center",
                                }}
                            >
                                <Text style={{ color: "#fff", fontWeight: "700" }}>
                                    Annuler
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleCreateOrderFromStatus}
                                style={{
                                    flex: 1,
                                    backgroundColor: "#0d6efd",
                                    padding: 12,
                                    borderRadius: 8,
                                    alignItems: "center",
                                }}
                            >
                                <Text style={{ color: "#fff", fontWeight: "700" }}>
                                    Créer
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                    </View>
                </View>
            </Modal>
			<Modal
    visible={repairModalVisible}
    transparent
    animationType="fade"
    onRequestClose={() => setRepairModalVisible(false)}
>
    <View style={styles.repairModalOverlay}>
        <View style={styles.repairModalBox}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 10 }}
            >
                <Text style={styles.repairModalTitle}>
                    ✅ Réparation terminée
                </Text>

                <Text style={styles.repairModalSubtitle}>
                    Ces informations serviront aux futures estimations.
                </Text>

                <Text style={styles.repairFieldLabel}>
                    Cause principale
                </Text>

                <TouchableOpacity
                    style={styles.repairSelectButton}
                    onPress={() =>
                        setRepairCausePickerVisible(true)
                    }
                >
                    <Text
                        style={[
                            styles.repairSelectText,
                            !repairCause &&
                                styles.repairPlaceholderText,
                        ]}
                    >
                        {repairCause || "Choisir la cause"}
                    </Text>

                    <Text style={styles.repairChevron}>›</Text>
                </TouchableOpacity>

                <Text style={styles.repairFieldLabel}>
                    Réparation effectuée
                </Text>

                <TouchableOpacity
                    style={styles.repairSelectButton}
                    onPress={() =>
                        setRepairActionPickerVisible(true)
                    }
                >
                    <Text
                        style={[
                            styles.repairSelectText,
                            !repairAction &&
                                styles.repairPlaceholderText,
                        ]}
                    >
                        {repairAction ||
                            "Choisir la réparation"}
                    </Text>

                    <Text style={styles.repairChevron}>›</Text>
                </TouchableOpacity>
{repairCause ? (
    <View style={styles.repairSuggestionsBox}>
        <Text style={styles.repairSuggestionsTitle}>
            Suggestions d’après l’historique
        </Text>

        {repairSuggestionsLoading ? (
            <Text style={styles.repairSuggestionsLoading}>
                Analyse des anciennes réparations…
            </Text>
        ) : repairSuggestions.length === 0 ? (
            <Text style={styles.repairSuggestionsEmpty}>
                Aucun historique disponible pour cette cause.
            </Text>
        ) : (
            repairSuggestions.map((suggestion, index) => {
                const selected =
                    repairAction === suggestion.action;

                return (
                    <TouchableOpacity
                        key={`${suggestion.action}-${index}`}
                        style={[
                            styles.repairSuggestionRow,
                            selected &&
                                styles.repairSuggestionRowSelected,
                        ]}
                        onPress={() =>
                            setRepairAction(suggestion.action)
                        }
                    >
                        <View style={{ flex: 1 }}>
                            <Text
                                style={[
                                    styles.repairSuggestionAction,
                                    selected &&
                                        styles.repairSuggestionActionSelected,
                                ]}
                            >
                                {index === 0 ? "⭐ " : ""}
                                {suggestion.action}
                            </Text>

                            <Text
                                style={
                                    styles.repairSuggestionDetails
                                }
                            >
                                {suggestion.count} cas
                                {suggestion.percentage > 0
                                    ? ` · ${suggestion.percentage} %`
                                    : ""}
                                {suggestion.averagePrice
                                    ? ` · Moyenne ${Math.round(
                                          suggestion.averagePrice
                                      )} €`
                                    : ""}
                            </Text>

                            {suggestion.mostFrequentDuration ? (
                                <Text
                                    style={
                                        styles.repairSuggestionDuration
                                    }
                                >
                                    Temps habituel :{" "}
                                    {
                                        suggestion.mostFrequentDuration
                                    }
                                </Text>
                            ) : null}
                        </View>

                        {selected ? (
                            <Text
                                style={
                                    styles.repairSuggestionCheck
                                }
                            >
                                ✓
                            </Text>
                        ) : (
                            <Text
                                style={
                                    styles.repairSuggestionArrow
                                }
                            >
                                ›
                            </Text>
                        )}
                    </TouchableOpacity>
                );
            })
        )}
    </View>
) : null}
                <Text style={styles.repairFieldLabel}>
                    Temps passé
                </Text>

                <TouchableOpacity
                    style={styles.repairSelectButton}
                    onPress={() =>
                        setRepairDurationPickerVisible(true)
                    }
                >
                    <Text
                        style={[
                            styles.repairSelectText,
                            !repairDuration &&
                                styles.repairPlaceholderText,
                        ]}
                    >
                        {repairDuration ||
                            "Choisir une durée"}
                    </Text>

                    <Text style={styles.repairChevron}>›</Text>
                </TouchableOpacity>

                <Text style={styles.repairFieldLabel}>
                    Commentaire facultatif
                </Text>

                <TextInput
                    style={styles.repairCommentInput}
                    value={repairComment}
                    onChangeText={setRepairComment}
                    placeholder="Exemple : BIOS reprogrammé, test OK..."
                    placeholderTextColor="#888"
                    multiline
                    textAlignVertical="top"
                />

                <Text style={styles.repairFieldLabel}>
                    Composants utilisés
                </Text>

                <View style={styles.componentInputRow}>
                    <TextInput
                        style={styles.componentInput}
                        value={componentInput}
                        onChangeText={onComponentInputChange}
                        onSubmitEditing={() => addComponent(componentInput)}
                        placeholder="Ex : SSD Kingston A400 240Go - SA400S37/240G"
                        placeholderTextColor="#888"
                        returnKeyType="done"
                    />
                    <TouchableOpacity
                        style={styles.componentAddButton}
                        onPress={() => addComponent(componentInput)}
                    >
                        <Text style={styles.componentAddButtonText}>+</Text>
                    </TouchableOpacity>
                </View>

                {componentSuggestionsVisible && (
                    <View style={styles.componentSuggestionsBox}>
                        {componentSuggestions.map((suggestion) => (
                            <TouchableOpacity
                                key={suggestion}
                                style={styles.componentSuggestionItem}
                                onPress={() => addComponent(suggestion)}
                            >
                                <Text style={styles.componentSuggestionText}>
                                    {suggestion}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {repairComponents.length > 0 && (
                    <View style={styles.componentChipsRow}>
                        {repairComponents.map((ref, index) => (
                            <View
                                key={`${ref}-${index}`}
                                style={styles.componentChip}
                            >
                                <Text
                                    style={styles.componentChipText}
                                    numberOfLines={1}
                                >
                                    {ref}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => removeComponent(index)}
                                >
                                    <Text style={styles.componentChipRemove}>
                                        ×
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                <View style={styles.repairModalActions}>
                    <TouchableOpacity
                        style={styles.repairCancelButton}
                        onPress={() =>
                            setRepairModalVisible(false)
                        }
                    >
                        <Text style={styles.repairCancelText}>
                            Plus tard
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.repairValidateButton}
                        onPress={validateRepairInformation}
                    >
                        <Text style={styles.repairValidateText}>
                            Valider
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    </View>
</Modal>
<RepairChoiceModal
    visible={repairCausePickerVisible}
    title="Cause principale"
    values={[
        ...repairCausesList,
        "➕ Ajouter une cause",
    ]}
    selectedValue={repairCause}
    onSelect={(value) => {
        setRepairCausePickerVisible(false);

        if (value === "➕ Ajouter une cause") {
            setCustomRepairType("cause");
            setCustomRepairValue("");
            setCustomRepairModalVisible(true);
            return;
        }

        setRepairCause(value);
    }}
    onClose={() =>
        setRepairCausePickerVisible(false)
    }
/>

<RepairChoiceModal
    visible={repairActionPickerVisible}
    title="Réparation effectuée"
    values={[
        ...repairActionsList,
        "➕ Ajouter une réparation",
    ]}
    selectedValue={repairAction}
    onSelect={(value) => {
        setRepairActionPickerVisible(false);

        if (
            value === "➕ Ajouter une réparation"
        ) {
            setCustomRepairType("action");
            setCustomRepairValue("");
            setCustomRepairModalVisible(true);
            return;
        }

        setRepairAction(value);
    }}
    onClose={() =>
        setRepairActionPickerVisible(false)
    }
/>

<RepairChoiceModal
    visible={repairDurationPickerVisible}
    title="Temps passé"
    values={REPAIR_DURATIONS}
    selectedValue={repairDuration}
    onSelect={(value) => {
        setRepairDuration(value);
        setRepairDurationPickerVisible(false);
    }}
    onClose={() =>
        setRepairDurationPickerVisible(false)
    }
/>
<RepairChoiceModal
    visible={statusPickerVisible}
    title="Statut"
    values={STATUS_OPTIONS}
    selectedValue={status}
    onSelect={(itemValue) => {
        setStatusPickerVisible(false);
        setStatus(itemValue);
        if (itemValue === "Devis en cours") setCost("");
        if (itemValue === "Non réparable") {
            setNoCostButRestitution(true);
            setPaymentStatus("");
            setPartialPayment("");
        }
    }}
    onClose={() => setStatusPickerVisible(false)}
/>
<RepairChoiceModal
    visible={chargeurPickerVisible}
    title="Chargeur"
    values={CHARGEUR_OPTIONS}
    selectedValue={chargeur}
    onSelect={(itemValue) => {
        setChargeur(itemValue);
        setChargeurPickerVisible(false);
    }}
    onClose={() => setChargeurPickerVisible(false)}
/>
<Modal
    visible={customRepairModalVisible}
    transparent
    animationType="fade"
    onRequestClose={() =>
        setCustomRepairModalVisible(false)
    }
>
    <TouchableWithoutFeedback
        onPress={() =>
            setCustomRepairModalVisible(false)
        }
    >
        <View style={styles.customRepairOverlay}>
            <TouchableWithoutFeedback>
                <View style={styles.customRepairBox}>
                    <Text style={styles.customRepairTitle}>
                        {customRepairType === "cause"
                            ? "Ajouter une cause"
                            : "Ajouter une réparation"}
                    </Text>

                    <Text style={styles.customRepairHelp}>
                        Cette valeur sera disponible sur tous
                        les appareils connectés à Supabase.
                    </Text>

                    <TextInput
                        style={styles.customRepairInput}
                        value={customRepairValue}
                        onChangeText={setCustomRepairValue}
                        placeholder={
                            customRepairType === "cause"
                                ? "Exemple : Puce réseau"
                                : "Exemple : Remplacement puce réseau"
                        }
                        placeholderTextColor="#888"
                        autoFocus
                    />

                    <View style={styles.customRepairActions}>
                        <TouchableOpacity
                            style={styles.customRepairCancel}
                            onPress={() => {
                                setCustomRepairModalVisible(false);
                                setCustomRepairValue("");
                                setCustomRepairType(null);
                            }}
                        >
                            <Text
                                style={
                                    styles.customRepairCancelText
                                }
                            >
                                Annuler
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.customRepairSave}
                            onPress={saveCustomRepairValue}
                        >
                            <Text
                                style={
                                    styles.customRepairSaveText
                                }
                            >
                                Ajouter
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </View>
    </TouchableWithoutFeedback>
</Modal>
        </KeyboardAvoidingView>
    );
}

// ———————————————————————————————————————————
// Helper d’URI affichable
// ———————————————————————————————————————————
const getDisplayUri = async (refOrPath) => {
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
    raw = stripQuotes(String(raw || ""))
        .trim()
        .replace(/\\+$/g, "");

    if (!raw) return null;

    if (raw.startsWith("file://")) {
        try {
            const info = await FileSystem.getInfoAsync(raw);
            return info.exists && !info.isDirectory ? raw : null;
        } catch {
            return null;
        }
    }

    if (/^https?:\/\//i.test(raw)) return raw;

    const clean = raw.replace(/^\/+/, "");
    const variants = clean.toLowerCase().startsWith("images/")
        ? [clean.slice("images/".length), clean]
        : [clean, "images/" + clean];

    for (const p of variants) {
        try {
            const rel = p.toLowerCase().startsWith("images/")
                ? p.slice("images/".length)
                : p;

            const { data: sdata, error: serr } = await supabase.storage
                .from("images")
                .createSignedUrl(rel, 3600);
            if (!serr && sdata?.signedUrl) return sdata.signedUrl;

            const { data: pub } = supabase.storage
                .from("images")
                .getPublicUrl(rel);
            if (pub?.publicUrl) return pub.publicUrl;
        } catch { /* URL indisponible, ignoré */ }
    }

    return null;
};

// ———————————————————————————————————————————
// Image résolue (local/cloud + badge)
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
        return () => {
            alive = false;
        };
    }, [refOrPath]);

    const isLocal =
        typeof refOrPath === "string" && refOrPath.startsWith("file://");

    if (!uri) return null;

    const Img = (
        <View style={{ position: "relative" }}>
            <Image
                source={{ uri }}
                onLoad={() => setLoaded(true)}
                onError={() => {
                    setLoaded(false);
                    setUri(null);
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

            {loaded && showBadge && (
                <View
                    style={{
                        position: "absolute",
                        bottom: 6,
                        right: 6,
                        paddingHorizontal: 2,
                        paddingVertical: 2,
                        borderRadius: 2,
                        backgroundColor: isLocal
                            ? "rgba(92,184,92,0.95)"
                            : "rgba(217,83,79,0.95)",
                    }}
                >
                    <Text
                        style={{
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: "700",
                        }}
                    >
                        {isLocal ? "Local" : "Cloud"}
                    </Text>
                </View>
            )}
        </View>
    );

    return onPress ? (
        <TouchableOpacity onPress={() => onPress(uri)}>{Img}</TouchableOpacity>
    ) : (
        Img
    );
}

// ———————————————————————————————————————————
// Petit wrapper pour labels flottants
// ———————————————————————————————————————————
function FloatingField({ label, children, style }) {
    return (
        <View style={[styles.fieldWrapper, style]}>
            {children}
            <Text style={styles.floatingLabel}>{label}</Text>
        </View>
    );
}
function RepairChoiceModal({
    visible,
    title,
    values,
    selectedValue,
    onSelect,
    onClose,
}) {
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.repairChoiceOverlay}>
                    <TouchableWithoutFeedback>
                        <View style={styles.repairChoiceBox}>
                            <View style={styles.repairChoiceHeader}>
                                <Text
                                    style={styles.repairChoiceTitle}
                                >
                                    {title}
                                </Text>

                                <TouchableOpacity
                                    onPress={onClose}
                                    style={styles.repairChoiceClose}
                                >
                                    <Text
                                        style={
                                            styles.repairChoiceCloseText
                                        }
                                    >
                                        ✕
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <FlatList
                                data={values}
                                keyExtractor={(item) => item}
                                showsVerticalScrollIndicator={false}
                                renderItem={({ item }) => {
                                    const selected =
                                        selectedValue === item;

                                    return (
                                        <TouchableOpacity
                                            style={[
                                                styles.repairChoiceRow,
                                                selected &&
                                                    styles.repairChoiceRowSelected,
                                            ]}
                                            onPress={() =>
                                                onSelect(item)
                                            }
                                        >
                                            <View
                                                style={[
                                                    styles.repairRadio,
                                                    selected &&
                                                        styles.repairRadioSelected,
                                                ]}
                                            >
                                                {selected && (
                                                    <View
                                                        style={
                                                            styles.repairRadioDot
                                                        }
                                                    />
                                                )}
                                            </View>

                                            <Text
                                                style={[
                                                    styles.repairChoiceText,
                                                    selected &&
                                                        styles.repairChoiceTextSelected,
                                                ]}
                                            >
                                                {item}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
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

    // Wrapper + label flottant
    fieldWrapper: {
        width: "100%",
        alignItems: "center",
        marginTop: 18,
        marginBottom: 8,
        position: "relative",
        overflow: "visible",
    },

    floatingLabel: {
        position: "absolute",
        left: "8%",
        top: -18, // un peu plus haut
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: "#e0e0e0", // même fond que la page
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#999", // contour visible
        fontSize: 12,
        fontWeight: "600",
        color: "#222",
        zIndex: 10, // passe devant le champ
        elevation: 3, // Android
    },
    input: {
        height: 50,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 16,
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
    modalOverlayFull: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.45)",
        justifyContent: "center",
        alignItems: "center",
    },
    modalPickerBox: {
        width: "90%",
        maxHeight: "80%",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: "#585858",
    },
    modalPickerTitle: {
        fontWeight: "bold",
        fontSize: 18,
        marginBottom: 8,
    },
    modalCloseBtn: {
        marginTop: 10,
        alignSelf: "flex-end",
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    modalCloseText: { fontWeight: "600", color: "#007bff" },

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
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 8,
        flexShrink: 1,
    },
    iconRight: { width: 30, height: 30 },
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
        zIndex: 999,
        elevation: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    alertBoxDanger: {
        backgroundColor: "#ffebee",
        borderWidth: 2,
        borderColor: "#d32f2f",
    },

    alertBoxSuccess: {
        backgroundColor: "#e8f5e9",
        borderWidth: 2,
        borderColor: "#2e7d32",
    },

    btnDanger: {
        backgroundColor: "#d32f2f",
        borderRadius: 6,
        paddingVertical: 10,
        paddingHorizontal: 20,
    },

    btnSuccess: {
        backgroundColor: "#2e7d32",
        borderRadius: 6,
        paddingVertical: 10,
        paddingHorizontal: 20,
    },

    rowButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
        width: "100%",
        marginTop: 6,
        gap: 10,
    },

    btnCancel: {
        flex: 1,
        backgroundColor: "#f3f3f3",
        borderColor: "#bbb",
        borderWidth: 1,
        borderRadius: 2,
    },

    btnContinue: {
        flex: 1,
        backgroundColor: "#d32f2f",
        borderColor: "#b71c1c",
        borderWidth: 1,
        borderRadius: 1,
    },
    badgeText: { color: "#fff", fontSize: 6, fontWeight: "700" },
    badgeLocalBg: { backgroundColor: "rgba(92,184,92,0.95)" },
    badgeCloudBg: { backgroundColor: "rgba(217,83,79,0.95)" },
    labelWrap: { borderWidth: 1, borderColor: "green" },
    labelOutline: { borderColor: "green", borderWidth: 1 },
    galleryScroll: {
        width: "100%",
        alignSelf: "center",
    },
    galleryContent: {
        flexGrow: 1,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 10,
    },
    thumbItem: {
        marginHorizontal: 6,
        alignItems: "center",
    },
    pickersRow: { flexDirection: "row", marginBottom: 12 },
    pickerBox: {
        flex: 1,
        height: 52,
        borderWidth: 1,
        borderColor: "#585858",
        borderRadius: 8,
        backgroundColor: "#cacaca",
        paddingHorizontal: 10,
        justifyContent: "center",
    },

    pickerBoxMid: {
        marginHorizontal: 8,
    },
    picker: {
        width: "90%",
        alignSelf: "center",
        paddingVertical: 0,
        color: "#333",
        ...Platform.select({
            android: {
                marginTop: -2,
            },
        }),
    },
	repairModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
},

repairModalBox: {
    width: "100%",
    maxWidth: 650,
    maxHeight: "90%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
},

repairModalTitle: {
    fontSize: 23,
    fontWeight: "bold",
    color: "#1f2937",
    textAlign: "center",
},

repairModalSubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginTop: 5,
    marginBottom: 18,
},

repairFieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
    marginTop: 10,
},

repairSelectButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 13,
},

repairSelectText: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
    fontWeight: "600",
},

repairPlaceholderText: {
    color: "#7b8794",
    fontWeight: "400",
},

repairChevron: {
    fontSize: 27,
    color: "#64748b",
    marginLeft: 10,
},

repairCommentInput: {
    minHeight: 85,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    padding: 12,
    fontSize: 15,
    color: "#111827",
},

componentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
},

componentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
},

componentAddButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
},

componentAddButtonText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 22,
},

componentSuggestionsBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    backgroundColor: "#fff",
    marginTop: 4,
    overflow: "hidden",
},

componentSuggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
},

componentSuggestionText: {
    fontSize: 14,
    color: "#334155",
},

componentChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
},

componentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    maxWidth: "100%",
},

componentChipText: {
    fontSize: 13,
    color: "#1e293b",
    fontWeight: "600",
    maxWidth: 220,
},

componentChipRemove: {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "700",
    paddingHorizontal: 2,
},

repairModalActions: {
    flexDirection: "row",
    marginTop: 20,
    gap: 10,
},

repairCancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#94a3b8",
    alignItems: "center",
},

repairCancelText: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "700",
},

repairValidateButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#047857",
    alignItems: "center",
},

repairValidateText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
},

repairChoiceOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
},

repairChoiceBox: {
    width: "100%",
    maxWidth: 600,
    maxHeight: "82%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 15,
},

repairChoiceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
},

repairChoiceTitle: {
    flex: 1,
    fontSize: 21,
    fontWeight: "bold",
    color: "#1f2937",
},

repairChoiceClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
},

repairChoiceCloseText: {
    fontSize: 17,
    color: "#374151",
    fontWeight: "bold",
},

repairChoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingHorizontal: 8,
},

repairChoiceRowSelected: {
    backgroundColor: "#ecfdf5",
},

repairRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
},

repairRadioSelected: {
    borderColor: "#047857",
},

repairRadioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#047857",
},

repairChoiceText: {
    flex: 1,
    fontSize: 16,
    color: "#374151",
},

repairChoiceTextSelected: {
    color: "#047857",
    fontWeight: "bold",
},
customRepairOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
},

customRepairBox: {
    width: "100%",
    maxWidth: 550,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
},

customRepairTitle: {
    fontSize: 21,
    fontWeight: "bold",
    color: "#1f2937",
},

customRepairHelp: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 5,
    marginBottom: 15,
},

customRepairInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111827",
},

customRepairActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
},

customRepairCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
},

customRepairCancelText: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "700",
},

customRepairSave: {
    flex: 1,
    backgroundColor: "#047857",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
},

customRepairSaveText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
},
repairSuggestionsBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#86efac",
},

repairSuggestionsTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#166534",
    marginBottom: 7,
},

repairSuggestionsLoading: {
    fontSize: 14,
    color: "#475569",
    paddingVertical: 8,
},

repairSuggestionsEmpty: {
    fontSize: 14,
    color: "#64748b",
    paddingVertical: 8,
},

repairSuggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 55,
    paddingVertical: 8,
    paddingHorizontal: 9,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1fae5",
    borderRadius: 8,
    marginBottom: 6,
},

repairSuggestionRowSelected: {
    backgroundColor: "#dcfce7",
    borderColor: "#16a34a",
},

repairSuggestionAction: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2937",
},

repairSuggestionActionSelected: {
    color: "#166534",
},

repairSuggestionDetails: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 3,
},

repairSuggestionDuration: {
    fontSize: 12,
    color: "#047857",
    marginTop: 2,
},

repairSuggestionCheck: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#16a34a",
    marginLeft: 10,
},

repairSuggestionArrow: {
    fontSize: 25,
    color: "#94a3b8",
    marginLeft: 10,
},
repairProposalBox: {
    width: "90%",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#f59e0b",
    borderRadius: 12,
    backgroundColor: "#fff7ed",
    overflow: "hidden",
},

repairProposalHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 10,
},

repairProposalCheckbox: {
    width: 26,
    height: 26,
    marginRight: 11,
    borderWidth: 2,
    borderColor: "#b45309",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
},

repairProposalCheckboxChecked: {
    borderColor: "#047857",
    backgroundColor: "#047857",
},

repairProposalCheckText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "bold",
},

repairProposalTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#9a3412",
},

repairProposalSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: "#7c2d12",
},

repairProposalChevron: {
    marginLeft: 8,
    fontSize: 17,
    fontWeight: "bold",
    color: "#9a3412",
},

repairProposalContent: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#fdba74",
    backgroundColor: "#ffffff",
},

repairProposalTextInput: {
    minHeight: 70,
},

repairProposalCommentInput: {
    minHeight: 65,
},

repairProposalDateText: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
},
});
