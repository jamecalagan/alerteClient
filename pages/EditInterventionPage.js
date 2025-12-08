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
    Alert,
    Pressable,
    FlatList,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "../supabaseClient";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from 'expo-file-system/legacy';

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
        typeof current === "string"
            ? current
            : current?.ref || current?.uri || "";
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
    const [alertType, setAlertType] = useState("danger");
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [alertTitle, setAlertTitle] = useState("");
    const [clientName, setClientName] = useState("");
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

    // pour détecter la transition de statut
    const prevStatusRef = useRef(status);

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
                            {
                                compress: 0.75,
                                format: ImageManipulator.SaveFormat.JPEG,
                            }
                        );
                        src = comp.uri;
                    } catch {}

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
                Alert.alert(
                    "Erreur",
                    "Impossible de corriger la fiche en base."
                );
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
                        "article_id, marque_id, modele_id, deviceType, brand, model, reference, description, cost, partialPayment, solderestant, status, commande, createdAt, serial_number, password, chargeur, photos, label_photo, remarks, paymentStatus, accept_screen_risk, devis_cost, is_estimate, estimate_min, estimate_max, estimate_type, estimate_accepted, estimate_accepted_at, no_cost_but_restitution"
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
            setSerial_number(inter.serial_number || "");
            setPassword(inter.password || "");
            setPhotos(photosResolved);
            setLabelPhoto(labelResolved);
            setCommande(inter.commande || "");
            setRemarks(inter.remarks || "");
            setNoCostButRestitution(!!inter.no_cost_but_restitution);
            setPaymentStatus(
                inter.no_cost_but_restitution ? "" : inter.paymentStatus || "non_regle"
            );
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

    useEffect(() => {
        const prev = prevStatusRef.current;
        if (prev === "Intervention en cours" && status === "En attente de pièces") {
            const defProd =
                reference?.trim()
                    ? reference.trim()
                    : (deviceType ? deviceType.toUpperCase() + " " : "") +
                      (brand ? String(brand).toUpperCase() + " " : "") +
                      (model ? String(model).toUpperCase() : "");

            setOrderProduct(defProd || "PIÈCE À COMMANDER");
            setOrderBrand(brand || "");
            setOrderModel(model || "");
            setOrderUnitPrice("");
            setOrderQty("1");
            setOrderDeposit("");

            setOrderModalVisible(true);
        }
        prevStatusRef.current = status;
    }, [status]);

    const toNum = (v, def = 0) => {
        const x = parseFloat(String(v ?? "").replace(",", "."));
        return Number.isFinite(x) ? x : def;
    };

    const handleCreateOrderFromStatus = async () => {
        try {
            const product = orderProduct?.trim();
            const brandStr = orderBrand?.trim() || null;
            const modelStr = orderModel?.trim() || null;
            const price = toNum(orderUnitPrice, NaN);
            const qty = Math.max(1, Math.floor(toNum(orderQty, 1)));
            const deposit = Math.max(0, toNum(orderDeposit, 0));

            if (!product) {
                Alert.alert("Champs manquants", "Le produit est requis.");
                return;
            }
            if (!Number.isFinite(price) || price <= 0) {
                Alert.alert(
                    "Montant invalide",
                    "Saisis un prix unitaire valide (> 0)."
                );
                return;
            }

            const total =
                Math.round((price * qty + Number.EPSILON) * 100) / 100;

            const payload = {
                client_id: clientId,
                product,
                brand: brandStr,
                model: modelStr,
                price,
                quantity: qty,
                total,
                deposit,
                received: false,
                paid: false,
                recovered: false,
                deleted: false,
                createdat: new Date().toISOString(),
            };

            const { data, error } = await supabase
                .from("orders")
                .insert([payload])
                .select("id")
                .single();

            if (error) {
                console.error("❌ Insertion order:", error);
                Alert.alert("Erreur", "Impossible de créer la commande.");
                return;
            }

            setOrderModalVisible(false);
            Alert.alert("✅ Commande", "Commande créée avec succès.");
        } catch (e) {
            console.error("❌ handleCreateOrderFromStatus:", e);
            Alert.alert("Erreur", "Création de la commande impossible.");
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
                            let path = null;
                            if (photoRef && photoRef.startsWith("http")) {
                                path = pathFromSupabaseUrl(photoRef);
                            } else if (
                                photoRef &&
                                !photoRef.startsWith("file://")
                            ) {
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

                            const { error: dbErr } = await supabase
                                .from("interventions")
                                .update({ label_photo: null })
                                .eq("id", interventionId);

                            if (dbErr) {
                                console.error(
                                    "Erreur MAJ BDD :",
                                    dbErr.message
                                );
                                Alert.alert(
                                    "Erreur",
                                    "Impossible de mettre à jour la fiche."
                                );
                            }
                        } catch (e) {
                            console.error(
                                "Erreur générale suppression étiquette :",
                                e
                            );
                            Alert.alert(
                                "Erreur",
                                "Problème lors de la suppression."
                            );
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

                if (!url) {
                    Alert.alert(
                        "Erreur",
                        "Échec de l'upload de l’étiquette."
                    );
                    return;
                }

                setLabelPhoto(url);
                setLabelPhotoDB(url);
            }
        } catch (error) {
            console.error("Erreur capture étiquette :", error);
        }
    };

    const pickAdditionalImage = async () => {
        const toArr = (v) => {
            if (Array.isArray(v)) return v.filter(Boolean);
            if (v == null) return [];
            if (typeof v === "string") {
                const s = v.trim();
                if (!s) return [];
                try {
                    const j = JSON.parse(s);
                    if (Array.isArray(j)) return j.filter(Boolean);
                } catch {}
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
                Alert.alert("Erreur", "Upload impossible, photo non ajoutée.");
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
                Alert.alert(
                    "Erreur",
                    "Photo ajoutée localement, base non relue."
                );
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

        const photosCloud = [];
        for (const p of Array.isArray(photos) ? photos : []) {
            const ref = extractRefString(p);
            if (!ref) continue;
            if (isLocalRef(ref)) {
                const url = await uploadImageToStorage(
                    ref,
                    interventionId,
                    false
                );
                if (url) photosCloud.push(url);
            } else {
                photosCloud.push(ref);
            }
        }
        const photosCloudFiltered = photosCloud.filter(Boolean);

        let labelCloud = null;
        if (labelPhoto) {
            const ref = extractRefString(labelPhoto);
            if (isLocalRef(ref)) {
                labelCloud = await uploadImageToStorage(
                    ref,
                    interventionId,
                    true
                );
            } else {
                labelCloud = ref;
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
            updatedAt: new Date().toISOString(),
        };

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
            if (isNaN(min) || isNaN(max))
                errors.push("Fourchette de devis (de/à)");
            else if (min < 0 || max < 0)
                errors.push("Fourchette de devis : valeurs positives requises");
            else if (min > max)
                errors.push("Fourchette de devis : 'De' doit être ≤ 'À'");
        }

        if (!labelPhoto) errors.push("Photo d’étiquette");

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
                            } else if (
                                photoRef &&
                                photoRef.startsWith("file://")
                            ) {
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
                                Alert.alert(
                                    "Erreur",
                                    "Impossible de mettre à jour la base."
                                );
                            }
                        } catch (e) {
                            console.error("Erreur suppression :", e);
                            Alert.alert(
                                "Erreur",
                                "Problème pendant la suppression."
                            );
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
                                ? articles.find((a) => a.id === deviceType)
                                      ?.nom || "Type"
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
                            onChangeText={(t) => setReference(t.toUpperCase())}
                            autoCapitalize="characters"
                            placeholder=" "
                            placeholderTextColor="#d1d0d0"
                        />
                    </View>
                </FloatingField>

                {/* Médias */}
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
                    {labelPhoto ? (
                        <View
                            style={{
                                marginLeft: 10,
                                alignItems: "center",
                            }}
                        >
                            {(() => {
                                const labelRaw = extractRefString(
                                    labelPhotoDB ?? labelPhoto
                                );
                                return (
                                    <TouchableOpacity
                                        onPress={() =>
                                            setSelectedImage(labelPhoto)
                                        }
                                        onLongPress={() =>
                                            deleteLabelPhoto(labelRaw)
                                        }
                                        delayLongPress={400}
                                        activeOpacity={0.85}
                                        style={[
                                            styles.thumbWrap,
                                            styles.labelWrap,
                                        ]}
                                    >
                                        <ResolvedImage
                                            refOrPath={labelPhoto}
                                            size={30}
                                            style={styles.labelOutline}
                                        />
                                    </TouchableOpacity>
                                );
                            })()}
                        </View>
                    ) : null}
                </View>

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

                {/* Coût (version bloquée en mode devis) */}
                <FloatingField label="Coût de la réparation (€)">
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
                    <View
                        style={[styles.checkboxContainer, { marginBottom: 20 }]}
                    >
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
                                J'accepte le démontage de l'écran de mon
                                produit malgré le risque de casse.
                            </Text>
                        </TouchableOpacity>
                    </View>

                    <View
                        className="checkboxes"
                        style={styles.checkboxContainer}
                    >
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
                            <Text style={styles.checkboxLabel}>
                                Règlement partiel
                            </Text>
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
                            <Text style={styles.checkboxLabel}>
                                rien à payer
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Acompte */}
                {paymentStatus === "reglement_partiel" && (
                    <>
                        <FloatingField label="Acompte (€)">
                            <TextInput
                                style={styles.input}
                                value={
                                    partialPayment ? String(partialPayment) : ""
                                }
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
                <View
                    style={[
                        styles.rowFlexContainer,
                        status === "En attente de pièces" && {
                            paddingHorizontal: 20,
                        },
                    ]}
                >
                    <View style={styles.fullwidthContainer}>
                        {/* Statut avec label flottant */}
                        <FloatingField label="Statut">
                            <Picker
                                selectedValue={status}
                                style={[styles.input, styles.picker]}
                                onValueChange={(itemValue) => {
                                    setStatus(itemValue);
                                    if (itemValue === "Devis en cours")
                                        setCost("");
                                    if (itemValue === "Non réparable") {
                                        setNoCostButRestitution(true);
                                        setPaymentStatus("");
                                        setPartialPayment("");
                                    }
                                }}
                            >
                                <Picker.Item
                                    label="Sélectionnez un statut..."
                                    value="default"
                                />
                                <Picker.Item
                                    label="En attente de pièces"
                                    value="En attente de pièces"
                                />
                                <Picker.Item
                                    label="Devis en cours"
                                    value="Devis en cours"
                                />
                                <Picker.Item
                                    label="Devis accepté"
                                    value="Devis accepté"
                                />
                                <Picker.Item
                                    label="Intervention en cours"
                                    value="Intervention en cours"
                                />
                                <Picker.Item
                                    label="Réparé"
                                    value="Réparé"
                                />
                                <Picker.Item
                                    label="Non réparable"
                                    value="Non réparable"
                                />
                            </Picker>
                        </FloatingField>

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
                                            style={[
                                                styles.input,
                                                { flex: 1, marginBottom: 0 },
                                            ]}
                                            placeholder="De ..."
                                            placeholderTextColor="#202020"
                                            keyboardType="numeric"
                                            value={estimateMin}
                                            onChangeText={(t) =>
                                                setEstimateMin(
                                                    normalizeNumber(t)
                                                )
                                            }
                                        />
                                        <TextInput
                                            style={[
                                                styles.input,
                                                { flex: 1, marginBottom: 0 },
                                            ]}
                                            placeholder="À ..."
                                            placeholderTextColor="#202020"
                                            keyboardType="numeric"
                                            value={estimateMax}
                                            onChangeText={(t) =>
                                                setEstimateMax(
                                                    normalizeNumber(t)
                                                )
                                            }
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
                                        {
                                            width: "90%",
                                            alignSelf: "center",
                                        },
                                    ]}
                                >
                                    Si “plafond” est choisi, le client accepte
                                    un montant maximum garanti (vous facturez ≤{" "}
                                    {estimateMax || "…"} €).
                                </Text>
                            </>
                        )}

                        {status !== "Devis en cours" && (
                            <FloatingField label="Coût de la réparation (€)">
                                <TextInput
                                    style={styles.input}
                                    value={cost}
                                    onChangeText={setCost}
                                    keyboardType="numeric"
                                    placeholder="Coût total (€)"
                                    placeholderTextColor="#202020"
                                />
                            </FloatingField>
                        )}
                    </View>

                    {/* Champ commande si en attente de pièces */}
                    {status === "En attente de pièces" && (
                        <View style={styles.halfWidthContainer}>
                            <FloatingField label="Commande">
                                <TextInput
                                    style={styles.input}
                                    value={commande.toUpperCase()}
                                    onChangeText={(t) =>
                                        setCommande(t.toUpperCase())
                                    }
                                    autoCapitalize="characters"
                                    placeholder=" "
                                    placeholderTextColor="#202020"
                                />
                            </FloatingField>
                        </View>
                    )}
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

                {/* Chargeur */}
                <FloatingField label="Chargeur">
                    <Picker
                        selectedValue={chargeur}
                        style={[styles.input, styles.picker]}
                        onValueChange={setChargeur}
                    >
                        <Picker.Item label="Non" value="Non" />
                        <Picker.Item label="Oui" value="Oui" />
                    </Picker>
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
                                _uniqPhotosForView(
                                    photos,
                                    labelPhotoDB ?? labelPhoto
                                ).length > 0 && (
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            flexWrap: "wrap",
                                            justifyContent: "center",
                                        }}
                                    >
                                        {_uniqPhotosForView(
                                            photos,
                                            labelPhotoDB ?? labelPhoto
                                        ).map((refStr, index) => {
                                            return (
                                                <View
                                                    key={`${_bucketKey(
                                                        refStr
                                                    )}-${index}`}
                                                    style={{
                                                        margin: 6,
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <Pressable
                                                        onPress={() =>
                                                            setSelectedImage(
                                                                refStr
                                                            )
                                                        }
                                                        onLongPress={() =>
                                                            deletePhoto(refStr)
                                                        }
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
                        <TouchableWithoutFeedback
                            onPress={() => setSelectedImage(null)}
                        >
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
                        <Text style={styles.buttonText}>
                            Prendre une autre photo
                        </Text>
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
                        <Text style={styles.buttonText}>
                            Sauvegarder l'intervention
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* === MODALE TYPE === */}
            <Modal
                visible={openType}
                transparent
                animationType="fade"
                onRequestClose={() => setOpenType(false)}
            >
                <View style={styles.modalOverlayFull}>
                    <View style={styles.modalPickerBox}>
                        <Text style={styles.modalPickerTitle}>
                            Type de produit
                        </Text>
                        <FlatList
                            data={articles.map((a) => ({
                                label: a.nom,
                                value: a.id,
                            }))}
                            keyExtractor={(it, i) => String(it.value ?? i)}
                            numColumns={4}
                            columnWrapperStyle={{ gap: 8 }}
                            ItemSeparatorComponent={() => (
                                <View style={{ height: 8 }} />
                            )}
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
                                        backgroundColor: pressed
                                            ? "#f2f2f2"
                                            : "#fff",
                                        minHeight: 48,
                                    })}
                                >
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            fontSize: 14,
                                            textAlign: "center",
                                        }}
                                    >
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
                        <Text style={styles.modalPickerTitle}>
                            Marque du produit
                        </Text>
                        <FlatList
                            data={brands.map((b) => ({
                                label: b.nom,
                                value: b.id,
                            }))}
                            keyExtractor={(it, i) => String(it.value ?? i)}
                            numColumns={4}
                            columnWrapperStyle={{ gap: 8 }}
                            ItemSeparatorComponent={() => (
                                <View style={{ height: 8 }} />
                            )}
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
                                        backgroundColor: pressed
                                            ? "#f2f2f2"
                                            : "#fff",
                                        minHeight: 48,
                                    })}
                                >
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            fontSize: 14,
                                            textAlign: "center",
                                        }}
                                    >
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
                        <Text style={styles.modalPickerTitle}>
                            Modèle du produit
                        </Text>
                        <FlatList
                            data={models.map((m) => ({
                                label: m.nom,
                                value: m.id,
                            }))}
                            keyExtractor={(it, i) => String(it.value ?? i)}
                            numColumns={4}
                            columnWrapperStyle={{ gap: 8 }}
                            ItemSeparatorComponent={() => (
                                <View style={{ height: 8 }} />
                            )}
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
                                        backgroundColor: pressed
                                            ? "#f2f2f2"
                                            : "#fff",
                                        minHeight: 48,
                                    })}
                                >
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            fontSize: 14,
                                            textAlign: "center",
                                        }}
                                    >
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
            <Modal
                transparent
                visible={alertVisible}
                animationType="fade"
                onRequestClose={closeAlert}
            >
                <View style={styles.modalOverlay}>
                    <View
                        style={[
                            styles.alertBox,
                            alertType === "success"
                                ? styles.alertBoxSuccess
                                : styles.alertBoxDanger,
                        ]}
                    >
                        <Text style={styles.alertTitle}>{alertTitle}</Text>
                        <Text style={styles.alertMessage}>{alertMessage}</Text>
                        <TouchableOpacity
                            style={styles.modalButton}
                            onPress={closeAlert}
                        >
                            <Text style={styles.modalButtonText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Modale rappel mot de passe */}
            <Modal
                transparent
                visible={pwdReminderVisible}
                animationType="fade"
                onRequestClose={() => setPwdReminderVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.alertBox, styles.alertBoxDanger]}>
                        <Text style={styles.alertTitle}>Rappel</Text>
                        <Text style={styles.alertMessage}>
                            Aucun mot de passe n’a été saisi. Continuer sans
                            renseigner le mot de passe ?
                        </Text>

                        <View style={styles.rowButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.btnCancel]}
                                onPress={() => setPwdReminderVisible(false)}
                            >
                                <Text style={styles.modalButtonText}>
                                    Annuler
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.modalButton, styles.btnContinue]}
                                onPress={() => {
                                    setPwdReminderVisible(false);
                                    performSaveIntervention();
                                }}
                            >
                                <Text
                                    style={[
                                        styles.modalButtonText,
                                        { color: "#fff" },
                                    ]}
                                >
                                    Continuer
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

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
                            backgroundColor: "#fff",
                            borderRadius: 10,
                            padding: 14,
                        }}
                    >
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
                                onChangeText={(t) =>
                                    setOrderQty(t.replace(/[^\d]/g, ""))
                                }
                                keyboardType="number-pad"
                                placeholder="1"
                                placeholderTextColor="#777"
                            />
                        </FloatingField>

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

                        <View
                            style={{
                                flexDirection: "row",
                                gap: 10,
                                marginTop: 8,
                            }}
                        >
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
                                <Text
                                    style={{
                                        color: "#fff",
                                        fontWeight: "700",
                                    }}
                                >
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
                                <Text
                                    style={{
                                        color: "#fff",
                                        fontWeight: "700",
                                    }}
                                >
                                    Créer
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
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
        } catch {}
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
                        backgroundColor: loaded
                            ? "transparent"
                            : "transparent",
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
    top: -18,                 // un peu plus haut
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#e0e0e0", // même fond que la page
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#999",      // contour visible
    fontSize: 12,
    fontWeight: "600",
    color: "#222",
    zIndex: 10,               // passe devant le champ
    elevation: 3,             // Android
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
});
