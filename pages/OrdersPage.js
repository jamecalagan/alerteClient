import React, { useEffect, useState, useRef } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    TextInput,
    Alert,
    StyleSheet,
    Image,
    Modal,
    Pressable,
    ActivityIndicator,
    Linking,
    SafeAreaView,
    StatusBar,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import { supabase } from "../supabaseClient";

// === Réglages bucket/chemin ===
const ORDER_PHOTOS_BUCKET = "images"; // bucket existant
const ORDER_PHOTOS_FOLDER = "orders"; // sous-dossier pour les commandes

export default function OrdersPage({ route, navigation, order }) {
    const { clientId, clientName, clientPhone, clientNumber } =
        route?.params || {};

    const [orders, setOrders] = useState([]);
    const [expandedOrders, setExpandedOrders] = useState([]);
    const [uploadingOrderId, setUploadingOrderId] = useState(null);
    const [showForm, setShowForm] = useState(false); // formulaire création commande masqué par défaut

    const [imageModalVisible, setImageModalVisible] = useState(false);
    const [imageModalUrl, setImageModalUrl] = useState(null);

    const [newOrder, setNewOrder] = useState({
        product: "",
        brand: "",
        model: "",
        serial: "",
        price: "",
        quantity: "1",
        deposit: "",
        paid: false,
        client_id: null,
        include_in_intervention: false, // 🆕
    });

    // 🆕 Édition d'une commande existante
    const [editingIds, setEditingIds] = useState([]); // ids en édition
    const [editMap, setEditMap] = useState({}); // { [id]: { ...champs... } }

    // 🔎 pour scroller sur une commande créée (focusId)
    const listRef = useRef(null);

    const isEditing = (id) => editingIds.includes(id);

    const startEdit = (item) => {
        setEditMap((m) => ({
            ...m,
            [item.id]: {
                product: item.product ?? "",
                brand: item.brand ?? "",
                model: item.model ?? "",
                serial: item.serial ?? "",
                price: `${item.price ?? ""}`,
                quantity: `${item.quantity ?? 1}`,
                deposit: `${item.deposit ?? ""}`,
                include_in_intervention:
                    item.include_in_intervention === true ||
                    item.include_in_intervention === "true" ||
                    item.include_in_intervention === 1,
            },
        }));
        setEditingIds((ids) =>
            ids.includes(item.id) ? ids : [...ids, item.id]
        );
    };

    const cancelEdit = (id) => {
        setEditMap((m) => {
            const c = { ...m };
            delete c[id];
            return c;
        });
        setEditingIds((ids) => ids.filter((x) => x !== id));
    };

    const updateEditField = (id, field, value) => {
        setEditMap((m) => ({
            ...m,
            [id]: { ...m[id], [field]: value },
        }));
    };

    const changeQty = (id, delta) => {
        const current = parseInt(editMap[id]?.quantity || "1", 10) || 1;
        const next = Math.max(1, current + delta);
        updateEditField(id, "quantity", String(next));
    };

    const saveEdit = async (id) => {
        try {
            const v = editMap[id] || {};
            const included = !!v.include_in_intervention;

            const price = included
                ? 0
                : parseFloat(String(v.price || "0").replace(",", ".")) || 0;

            const qty = included
                ? 1
                : Math.max(1, parseInt(String(v.quantity || "1"), 10) || 1);

            const deposit =
                parseFloat(String(v.deposit || "0").replace(",", ".")) || 0;

            const total = included ? 0 : price * qty;

            if (!v.product) {
                Alert.alert(
                    "Champs manquants",
                    "Renseignez au minimum le produit."
                );
                return;
            }
            if (!included && price <= 0) {
                Alert.alert(
                    "Prix requis",
                    "Veuillez saisir un prix unitaire valide ou cochez “inclus dans l’intervention”."
                );
                return;
            }

            const { error } = await supabase
                .from("orders")
                .update({
                    product: v.product,
                    brand: v.brand || "",
                    model: v.model || "",
                    serial: v.serial || "",
                    price,
                    quantity: qty,
                    total,
                    deposit,
                    include_in_intervention: included, // 🆕
                })
                .eq("id", id);
            if (error) throw error;

            cancelEdit(id);
            await loadOrders();
            Alert.alert("Modifications enregistrées");
        } catch (e) {
            console.error("❌ Save edit:", e);
            Alert.alert("Erreur", "Impossible d'enregistrer la modification.");
        }
    };

    useEffect(() => {
        if (clientId) setNewOrder((p) => ({ ...p, client_id: clientId }));
    }, [clientId]);

    useEffect(() => {
        loadOrders();
    }, [clientId]);

    useEffect(() => {
        const unsub = navigation.addListener("focus", () => {
            loadOrders();
        });
        return unsub;
    }, [navigation, clientId]);

    useEffect(() => {
        if (route.params?.refreshAt) {
            loadOrders();
        }
    }, [route.params?.refreshAt]);

    const toBool = (v) => v === true || v === "true" || v === 1;

    // 🔁 Charge commandes
    const loadOrders = async () => {
        try {
            const focusId = route.params?.focusId
                ? String(route.params.focusId)
                : null;

            if (clientId) {
                const { data, error } = await supabase
                    .from("orders")
                    .select("*, billing(id)")
                    .eq("client_id", clientId)
                    .order("createdat", { ascending: false });
                if (error) throw error;
                const rows = (data || []).map((o) => {
                    const qty = Number.isFinite(o.quantity)
                        ? o.quantity
                        : parseInt(o.quantity ?? 1, 10) || 1;
                    const unit =
                        typeof o.price === "number"
                            ? o.price
                            : parseFloat(
                                  (o.price ?? "0").toString().replace(",", ".")
                              ) || 0;
                    const total =
                        typeof o.total === "number" && !isNaN(o.total)
                            ? o.total
                            : unit * qty;
                    return {
                        ...o,
                        quantity: qty,
                        total,
                        include_in_intervention: toBool(
                            o.include_in_intervention
                        ),
                        notified: toBool(o.notified),
                        received: toBool(o.received),
                        paid: toBool(o.paid),
                        ordered: toBool(o.ordered),
                        recovered: toBool(o.recovered),
                        saved: toBool(o.saved),
                    };
                });
                setOrders(rows);
                return;
            }

            if (focusId) {
                const { data, error } = await supabase
                    .from("orders")
                    .select("*, billing(id)")
                    .eq("id", focusId)
                    .limit(1)
                    .maybeSingle();
                if (error) throw error;

                if (data) {
                    const qty = Number.isFinite(data.quantity)
                        ? data.quantity
                        : parseInt(data.quantity ?? 1, 10) || 1;
                    const unit =
                        typeof data.price === "number"
                            ? data.price
                            : parseFloat(
                                  (data.price ?? "0")
                                      .toString()
                                      .replace(",", ".")
                              ) || 0;
                    const total =
                        typeof data.total === "number" && !isNaN(data.total)
                            ? data.total
                            : unit * qty;

                    setOrders([
                        {
                            ...data,
                            quantity: qty,
                            total,
                            include_in_intervention: toBool(
                                data.include_in_intervention
                            ),
                            notified: toBool(data.notified),
                            received: toBool(data.received),
                            paid: toBool(data.paid),
                            ordered: toBool(data.ordered),
                            recovered: toBool(data.recovered),
                            saved: toBool(data.saved),
                        },
                    ]);

                    if (!clientName || !clientPhone) {
                        const { data: cli } = await supabase
                            .from("clients")
                            .select("name, phone, ficheNumber")
                            .eq("id", data.client_id)
                            .maybeSingle();
                        if (cli) {
                            navigation.setParams({
                                clientId: data.client_id,
                                clientName: cli.name ?? "",
                                clientPhone: cli.phone ?? "",
                                clientNumber: cli.ficheNumber ?? null,
                            });
                        }
                    }
                } else {
                    setOrders([]);
                }
                return;
            }

            setOrders([]);
        } catch (e) {
            console.error("loadOrders error:", e);
            Alert.alert("Erreur", "Impossible de charger les commandes.");
            setOrders([]);
        }
    };

    const handleCreateOrder = async () => {
        try {
            const included = !!newOrder.include_in_intervention;

            if (!newOrder.product) {
                alert("Veuillez renseigner le produit.");
                return;
            }
            if (!included && !newOrder.price) {
                alert(
                    "Veuillez saisir un prix ou cochez “Coût inclus dans l’intervention”."
                );
                return;
            }

            const priceToSend = included
                ? 0
                : parseFloat((newOrder.price || "0").replace(",", ".")) || 0;

            const qtyToSend = included
                ? 1
                : Math.max(1, parseInt(newOrder.quantity || "1", 10) || 1);

            const depositToSend =
                parseFloat((newOrder.deposit || "0").replace(",", ".")) || 0;

            const totalToSend = included ? 0 : priceToSend * qtyToSend;

            const payload = {
                product: newOrder.product,
                brand: newOrder.brand || "",
                model: newOrder.model || "",
                serial: newOrder.serial || "",
                price: priceToSend,
                quantity: qtyToSend,
                total: totalToSend,
                deposit: depositToSend,
                paid: false,
                client_id: clientId || null,
                include_in_intervention: included,
            };

            const { error } = await supabase.from("orders").insert([payload]);
            if (error) throw error;

            setNewOrder({
                product: "",
                brand: "",
                model: "",
                serial: "",
                price: "",
                quantity: "1",
                deposit: "",
                paid: false,
                client_id: clientId || null,
                include_in_intervention: false,
            });
            loadOrders();
        } catch (e) {
            console.error("❌ Ajout commande:", e);
        }
    };

    const handleDeleteOrder = async (ord) => {
        if (!ord.paid && !ord.saved) {
            Alert.alert(
                "Suppression impossible",
                "Impossible de supprimer une commande ni payée ni sauvegardée."
            );
            return;
        }
        Alert.alert("Confirmation", "Supprimer cette commande ?", [
            { text: "Annuler", style: "cancel" },
            {
                text: "Supprimer",
                style: "destructive",
                onPress: async () => {
                    try {
                        const { error } = await supabase
                            .from("orders")
                            .delete()
                            .eq("id", ord.id);
                        if (error) throw error;
                        loadOrders();
                    } catch (e) {
                        console.error("❌ Suppression:", e);
                    }
                },
            },
        ]);
    };

    const handleMarkAsPaid = (ord) => {
        const isIncluded = !!ord.include_in_intervention;
        const total = isIncluded
            ? 0
            : ord.total ?? (ord.price || 0) * (ord.quantity || 1);
        const remaining = Math.max(0, total - (ord.deposit || 0));

        Alert.alert(
            "Paiement complet",
            `Confirmez-vous le paiement de ${remaining.toFixed(2)} € ?`,
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Confirmer",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("orders")
                                .update({ paid: true })
                                .eq("id", ord.id);
                            if (error) throw error;
                            loadOrders();
                        } catch (e) {
                            console.error("❌ Paiement:", e);
                        }
                    },
                },
            ]
        );
    };

    const handleSaveOrder = async (ord) => {
        if (!ord.paid || !ord.recovered) {
            Alert.alert(
                "Erreur",
                "Marquez d'abord payée et récupérée avant de sauvegarder."
            );
            return;
        }
        Alert.alert(
            "Sauvegarder",
            "Confirmez-vous la sauvegarde définitive ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Confirmer",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("orders")
                                .update({
                                    saved: true,
                                    paid_at: new Date().toISOString(),
                                })
                                .eq("id", ord.id);
                            if (error) throw error;
                            loadOrders();
                        } catch (e) {
                            console.error("❌ Sauvegarde:", e);
                        }
                    },
                },
            ]
        );
    };

    const handleMarkAsRecovered = async (ord) => {
        Alert.alert(
            "Commande récupérée",
            "Confirmez-vous la récupération par le client ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Confirmer",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("orders")
                                .update({ recovered: true })
                                .eq("id", ord.id);
                            if (error) throw error;
                            loadOrders();
                        } catch (e) {
                            console.error("❌ Récupération:", e);
                        }
                    },
                },
            ]
        );
    };

    const handleMarkAsOrdered = async (ord) => {
        Alert.alert(
            "Commande passée",
            "Confirmez-vous la commande fournisseur ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Confirmer",
                    onPress: async () => {
                        try {
                            const { error } = await supabase
                                .from("orders")
                                .update({ ordered: true })
                                .eq("id", ord.id);
                            if (error) throw error;
                            loadOrders();
                        } catch (e) {
                            console.error("❌ Commande passée:", e);
                        }
                    },
                },
            ]
        );
    };

    const handleMarkAsReceived = async (ord) => {
        Alert.alert("Commande reçue", "Confirmez-vous la réception ?", [
            { text: "Annuler", style: "cancel" },
            {
                text: "Confirmer",
                onPress: async () => {
                    try {
                        const { error } = await supabase
                            .from("orders")
                            .update({ received: true })
                            .eq("id", ord.id);
                        if (error) throw error;
                        loadOrders();
                    } catch (e) {
                        console.error("❌ Réception:", e);
                    }
                },
            },
        ]);
    };

    const notifyOrderBySMS = async (ord) => {
        if (!clientPhone) {
            Alert.alert("Erreur", "Numéro de téléphone manquant.");
            return;
        }
        const message = `Bonjour, votre commande ${ord.product} est prête. Merci et à bientôt.\n\nAVENIR INFORMATIQUE`;
        const encoded = encodeURIComponent(message);
        try {
            const { error } = await supabase
                .from("orders")
                .update({ notified: true })
                .eq("id", ord.id);
            if (error) throw error;
            Linking.openURL(`sms:${clientPhone}?body=${encoded}`);
            Alert.alert("Notification envoyée");
            loadOrders();
        } catch (e) {
            console.error("Erreur notification :", e);
            Alert.alert("Erreur", "Impossible d’enregistrer la notification.");
        }
    };

    // ====== PHOTOS (multi) ======
    const ensureCameraPermission = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
            Alert.alert(
                "Permission requise",
                "Autorisez l'accès à la caméra pour prendre des photos."
            );
            return false;
        }
        return true;
    };

    const getPublicUrlFromPath = (path) => {
        if (!path) return null;
        if (/^https?:\/\//i.test(path)) return path;
        const { data } = supabase.storage
            .from(ORDER_PHOTOS_BUCKET)
            .getPublicUrl(path);
        return data?.publicUrl || null;
    };

    const candidateMulti = ["order_photos", "photos", "images"];
    const candidateSingle = [
        "order_photo",
        "photo_url",
        "photo",
        "image_url",
        "image",
        "picture",
    ];

    const readPhotoPathsFromRow = (row) => {
        for (const col of candidateMulti) {
            if (
                Object.prototype.hasOwnProperty.call(row || {}, col) &&
                row[col] != null
            ) {
                const v = row[col];
                if (Array.isArray(v)) return v.filter(Boolean);
                if (typeof v === "string") {
                    try {
                        const arr = JSON.parse(v);
                        if (Array.isArray(arr)) return arr.filter(Boolean);
                    } catch (_) {}
                    if (v.includes(","))
                        return v
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                    return v ? [v] : [];
                }
            }
        }
        for (const col of candidateSingle) {
            if (
                Object.prototype.hasOwnProperty.call(row || {}, col) &&
                row[col]
            ) {
                return [row[col]];
            }
        }
        return [];
    };

    const writePhotoPathsToRow = async (orderId, paths) => {
        for (const col of candidateMulti) {
            try {
                const { error } = await supabase
                    .from("orders")
                    .update({ [col]: paths })
                    .eq("id", orderId);
                if (!error) return true;
            } catch (_) {}
        }
        for (const col of candidateSingle) {
            try {
                const last = paths[paths.length - 1] || null;
                const { error } = await supabase
                    .from("orders")
                    .update({ [col]: last })
                    .eq("id", orderId);
                if (!error) return true;
            } catch (_) {}
        }
        Alert.alert(
            "Colonne photos introuvable",
            "Ajoutez une colonne JSON/ARRAY (ex. order_photos jsonb) pour stocker plusieurs chemins."
        );
        return false;
    };

    const takeAndUploadOrderPhoto = async (ord) => {
        try {
            const ok = await ensureCameraPermission();
            if (!ok) return;

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.7,
                base64: false,
                allowsEditing: false,
                exif: false,
            });
            if (result.canceled) return;
            const asset = result.assets?.[0];
            if (!asset?.uri) return;

            setUploadingOrderId(ord.id);

            const extGuess = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
            const filePath = `${ORDER_PHOTOS_FOLDER}/${clientId || "client"}/${
                ord.id
            }-${Date.now()}.${extGuess}`;
            const file = {
                uri: asset.uri,
                name: filePath.split("/").pop(),
                type: asset.mimeType || `image/${extGuess}`,
            };

            const { error: upErr } = await supabase.storage
                .from(ORDER_PHOTOS_BUCKET)
                .upload(filePath, file, {
                    cacheControl: "3600",
                    upsert: true,
                    contentType: file.type,
                });
            if (upErr) throw upErr;

            const current = readPhotoPathsFromRow(ord);
            const next = [...current, filePath];
            const okWrite = await writePhotoPathsToRow(ord.id, next);
            if (!okWrite) return;

            Alert.alert(
                "Photo enregistrée",
                "La photo a été ajoutée à la commande."
            );
            await loadOrders();
        } catch (e) {
            console.error("📷❌ Upload photo:", e);
            Alert.alert("Erreur", "Impossible d'envoyer la photo.");
        } finally {
            setUploadingOrderId(null);
        }
    };

    const deleteOnePhoto = async (ord, imgPath) => {
        const paths = readPhotoPathsFromRow(ord);
        const next = paths.filter((p) => p !== imgPath);
        const ok = await writePhotoPathsToRow(ord.id, next);
        if (!ok) return;
        try {
            await supabase.storage.from(ORDER_PHOTOS_BUCKET).remove([imgPath]);
        } catch (_) {}
        await loadOrders();
    };

    const toggleExpand = (id) => {
        setExpandedOrders((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    };

    const openImageModal = (url) => {
        setImageModalUrl(url);
        setImageModalVisible(true);
    };

    const fmtMoney = (v) => {
        const n = Number(String(v ?? "0").replace(",", "."));
        const safe = Number.isFinite(n) ? n : 0;
        return safe.toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    };

    const TableHeader = () => (
        <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colProduit]}>Produit</Text>
            <Text style={[styles.th, styles.colQty]}>Qté</Text>
            <Text style={[styles.th, styles.colUnit]}>PU</Text>
            <Text style={[styles.th, styles.colTotal]}>Total</Text>
            <Text style={[styles.th, styles.colDeposit]}>Acompte</Text>
            <Text style={[styles.th, styles.colRemaining]}>Reste</Text>
            <Text style={[styles.th, styles.colPaid]}>Payé</Text>
        </View>
    );

    const renderKV = (label, value, strong = false) => (
        <View style={styles.kvRow}>
            <Text style={styles.kvLabel}>{label}</Text>
            <Text style={[styles.kvValue, strong && styles.kvStrong]}>
                {value}
            </Text>
        </View>
    );

    const tinyStatus = (item) => {
        const out = [];
        if (item.ordered) out.push("Passée");
        if (item.received) out.push("Reçue");
        if (item.recovered) out.push("Récupérée");
        if (item.saved) out.push("Sauvegardée");
        return out.join(" • ");
    };

    return (
		  <SafeAreaView style={styles.safeArea}>
    <StatusBar barStyle="dark-content" backgroundColor="#e6e6e6" />

        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.header}>
                    {clientName
                        ? `Commandes pour : ${clientName}`
                        : `Commandes`}
                </Text>

                <View style={styles.headerActions}>
                    <Text style={styles.headerDivider}>|</Text>
                    <TouchableOpacity
                        onPress={() => setShowForm((prev) => !prev)}
                    >
                        <Text style={styles.headerActionText}>
                            {showForm ? "Fermer" : "Nouvelle commande"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Formulaire rapide */}
            {showForm && (
                <View style={styles.formContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Produit"
                        placeholderTextColor="#000"
                        value={newOrder.product}
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, product: t })
                        }
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Marque"
                        placeholderTextColor="#000"
                        value={newOrder.brand}
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, brand: t })
                        }
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Modèle"
                        placeholderTextColor="#000"
                        value={newOrder.model}
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, model: t })
                        }
                    />

                    <TouchableOpacity
                        style={styles.checkboxRow}
                        onPress={() =>
                            setNewOrder((o) => ({
                                ...o,
                                include_in_intervention:
                                    !o.include_in_intervention,
                            }))
                        }
                    >
                        <View
                            style={[
                                styles.checkbox,
                                newOrder.include_in_intervention &&
                                    styles.checkboxChecked,
                            ]}
                        >
                            {newOrder.include_in_intervention && (
                                <Text style={styles.checkboxMark}>✓</Text>
                            )}
                        </View>
                        <Text style={styles.checkboxLabel}>
                            Coût inclus dans l’intervention
                        </Text>
                    </TouchableOpacity>

                    <TextInput
                        style={[
                            styles.input,
                            newOrder.include_in_intervention &&
                                styles.inputDisabled,
                        ]}
                        placeholder="Prix unitaire (€)"
                        placeholderTextColor="#000"
                        keyboardType="numeric"
                        value={
                            newOrder.include_in_intervention
                                ? ""
                                : newOrder.price
                        }
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, price: t })
                        }
                        editable={!newOrder.include_in_intervention}
                    />

                    <View style={styles.qtyRow}>
                        <TouchableOpacity
                            style={[
                                styles.qtyButton,
                                newOrder.include_in_intervention &&
                                    styles.buttonDisabled,
                            ]}
                            onPress={() => {
                                if (newOrder.include_in_intervention) return;
                                const n = Math.max(
                                    1,
                                    (parseInt(newOrder.quantity || "1", 10) ||
                                        1) - 1
                                );
                                setNewOrder({
                                    ...newOrder,
                                    quantity: String(n),
                                });
                            }}
                            disabled={newOrder.include_in_intervention}
                        >
                            <Text style={styles.qtyButtonText}>−</Text>
                        </TouchableOpacity>

                        <TextInput
                            style={[
                                styles.input,
                                { flex: 1, marginBottom: 0 },
                                newOrder.include_in_intervention &&
                                    styles.inputDisabled,
                            ]}
                            placeholder="Quantité"
                            placeholderTextColor="#000"
                            keyboardType="numeric"
                            inputMode="numeric"
                            value={
                                newOrder.include_in_intervention
                                    ? ""
                                    : newOrder.quantity
                            }
                            onChangeText={(t) => {
                                const clean = (t ?? "").replace(/[^0-9]/g, "");
                                setNewOrder({ ...newOrder, quantity: clean });
                            }}
                            editable={!newOrder.include_in_intervention}
                        />

                        <TouchableOpacity
                            style={[
                                styles.qtyButton,
                                newOrder.include_in_intervention &&
                                    styles.buttonDisabled,
                            ]}
                            onPress={() => {
                                if (newOrder.include_in_intervention) return;
                                const n = Math.max(
                                    1,
                                    (parseInt(newOrder.quantity || "1", 10) ||
                                        1) + 1
                                );
                                setNewOrder({
                                    ...newOrder,
                                    quantity: String(n),
                                });
                            }}
                            disabled={newOrder.include_in_intervention}
                        >
                            <Text style={styles.qtyButtonText}>+</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={styles.formHint}>
                        Total provisoire :{" "}
                        {(() => {
                            if (newOrder.include_in_intervention) return "0,00";
                            const u =
                                parseFloat(
                                    (newOrder.price || "0").replace(",", ".")
                                ) || 0;
                            const q = Math.max(
                                1,
                                parseInt(newOrder.quantity || "1", 10) || 1
                            );
                            return fmtMoney(u * q);
                        })()}{" "}
                        €
                    </Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Acompte (€)"
                        placeholderTextColor="#000"
                        keyboardType="numeric"
                        value={newOrder.deposit}
                        onChangeText={(t) =>
                            setNewOrder({ ...newOrder, deposit: t })
                        }
                    />

                    <View style={{ alignItems: "center" }}>
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={handleCreateOrder}
                        >
                            <Text style={styles.addButtonText}>
                                Ajouter une commande
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* ✅ Header tableau hors FlatList (plus stable) */}
            {orders.length > 0 && <TableHeader />}

            <FlatList
                ref={listRef}
                data={orders}
                extraData={{
                    expandedOrders,
                    editingIds,
                    editMap,
                    uploadingOrderId,
                }}
                keyExtractor={(item) => item.id.toString()}
                ListEmptyComponent={
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>Aucune commande</Text>
                    </View>
                }
                contentContainerStyle={{ paddingBottom: 50 }}
                renderItem={({ item, index }) => {
                    const isExpanded = expandedOrders.includes(item.id);
                    const paths = readPhotoPathsFromRow(item);
                    const urls = paths
                        .map(getPublicUrlFromPath)
                        .filter(Boolean);

                    const qty = item.quantity || 1;
                    const unit = item.price || 0;
                    const total = item.total ?? unit * qty;
                    const isIncluded = !!item.include_in_intervention;

                    const remaining = isIncluded
                        ? 0
                        : Math.max(0, total - (item.deposit || 0));

                    const editing = isEditing(item.id);
                    const editVals = editMap[item.id] || {};

                    const rowBg =
                        index % 2 === 0 ? styles.rowEven : styles.rowOdd;

                    return (
                        <View style={styles.orderCard}>
                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => toggleExpand(item.id)}
                            >
                                <View style={[styles.tableRow, rowBg]}>
                                    <View style={styles.colProduit}>
                                        <Text
                                            style={styles.rowTitle}
                                            numberOfLines={1}
                                        >
                                            {item.product || "-"}
                                        </Text>
                                        <Text
                                            style={styles.rowSub}
                                            numberOfLines={1}
                                        >
                                            {[item.brand, item.model]
                                                .filter(Boolean)
                                                .join(" ") || " "}
                                        </Text>
                                        {!!tinyStatus(item) && (
                                            <Text
                                                style={styles.rowStatus}
                                                numberOfLines={1}
                                            >
                                                {tinyStatus(item)}
                                            </Text>
                                        )}
                                    </View>

                                    <Text
                                        style={[styles.rowText, styles.colQty]}
                                    >
                                        {isIncluded ? "—" : qty}
                                    </Text>
                                    <Text
                                        style={[styles.rowText, styles.colUnit]}
                                    >
                                        {isIncluded
                                            ? "—"
                                            : `${fmtMoney(unit)} €`}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.rowText,
                                            styles.colTotal,
                                        ]}
                                    >
                                        {isIncluded
                                            ? "Inclus"
                                            : `${fmtMoney(total)} €`}
                                    </Text>
                                    <Text
                                        style={[
                                            styles.rowText,
                                            styles.colDeposit,
                                        ]}
                                    >
                                        {fmtMoney(item.deposit)} €
                                    </Text>
                                    <Text
                                        style={[
                                            styles.rowText,
                                            styles.colRemaining,
                                            item.paid
                                                ? styles.greenText
                                                : styles.redText,
                                        ]}
                                    >
                                        {isIncluded
                                            ? "0,00 €"
                                            : `${fmtMoney(remaining)} €`}
                                    </Text>
                                    <Text
                                        style={[styles.rowText, styles.colPaid]}
                                    >
                                        {item.paid ? "Oui" : "Non"}
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            {(!item.saved || isExpanded) && (
                                <View style={styles.expandArea}>
                                    {!editing ? (
                                        <>
                                            <View style={styles.kvBlock}>
                                                {renderKV(
                                                    "Produit",
                                                    item.product || "-"
                                                )}
                                                {renderKV(
                                                    "Marque",
                                                    item.brand || "-"
                                                )}
                                                {renderKV(
                                                    "Modèle",
                                                    item.model || "-"
                                                )}
                                                {renderKV(
                                                    "N° de série",
                                                    item.serial || "-"
                                                )}
                                                {renderKV(
                                                    "Prix unitaire",
                                                    isIncluded
                                                        ? "—"
                                                        : `${fmtMoney(unit)} €`
                                                )}
                                                {renderKV(
                                                    "Quantité",
                                                    isIncluded
                                                        ? "—"
                                                        : String(qty)
                                                )}
                                                {renderKV(
                                                    "Total",
                                                    isIncluded
                                                        ? "0,00 € (inclus)"
                                                        : `${fmtMoney(
                                                              total
                                                          )} €`,
                                                    true
                                                )}
                                                {renderKV(
                                                    "Acompte",
                                                    `${fmtMoney(
                                                        item.deposit
                                                    )} €`
                                                )}
                                                {renderKV(
                                                    "Montant restant dû",
                                                    isIncluded
                                                        ? "0,00 € (inclus)"
                                                        : `${fmtMoney(
                                                              remaining
                                                          )} €`,
                                                    true
                                                )}

                                                {item.paid_at &&
                                                    renderKV(
                                                        "Payée le",
                                                        new Date(
                                                            item.paid_at
                                                        ).toLocaleDateString()
                                                    )}

                                                {renderKV(
                                                    "Créée le",
                                                    new Date(
                                                        item.createdat ||
                                                            item.created_at ||
                                                            Date.now()
                                                    ).toLocaleDateString()
                                                )}

                                                {renderKV(
                                                    "Commande passée",
                                                    item.ordered ? "Oui" : "Non"
                                                )}
                                                {renderKV(
                                                    "Commande reçue",
                                                    item.received
                                                        ? "Oui"
                                                        : "Non"
                                                )}
                                                {renderKV(
                                                    "Récupérée client",
                                                    item.recovered
                                                        ? "Oui"
                                                        : "Non"
                                                )}
                                                {renderKV(
                                                    "Notifiée",
                                                    item.notified
                                                        ? "Oui"
                                                        : "Non"
                                                )}
                                                {renderKV(
                                                    "Sauvegardée",
                                                    item.saved ? "Oui" : "Non"
                                                )}
                                            </View>

                                            {!item.saved && (
                                                <TouchableOpacity
                                                    style={styles.editButton}
                                                    onPress={() =>
                                                        startEdit(item)
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.editButtonText
                                                        }
                                                    >
                                                        Modifier
                                                    </Text>
                                                </TouchableOpacity>
                                            )}
                                        </>
                                    ) : (
                                        <View style={styles.editBlock}>
                                            <TextInput
                                                style={styles.input}
                                                placeholder="Produit"
                                                placeholderTextColor="#000"
                                                value={editVals.product}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "product",
                                                        t
                                                    )
                                                }
                                            />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="Marque"
                                                placeholderTextColor="#000"
                                                value={editVals.brand}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "brand",
                                                        t
                                                    )
                                                }
                                            />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="Modèle"
                                                placeholderTextColor="#000"
                                                value={editVals.model}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "model",
                                                        t
                                                    )
                                                }
                                            />
                                            <TextInput
                                                style={styles.input}
                                                placeholder="N° de série"
                                                placeholderTextColor="#000"
                                                value={editVals.serial}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "serial",
                                                        t
                                                    )
                                                }
                                            />

                                            <TouchableOpacity
                                                style={styles.checkboxRow}
                                                onPress={() =>
                                                    updateEditField(
                                                        item.id,
                                                        "include_in_intervention",
                                                        !editVals.include_in_intervention
                                                    )
                                                }
                                            >
                                                <View
                                                    style={[
                                                        styles.checkbox,
                                                        editVals.include_in_intervention &&
                                                            styles.checkboxChecked,
                                                    ]}
                                                >
                                                    {editVals.include_in_intervention && (
                                                        <Text
                                                            style={
                                                                styles.checkboxMark
                                                            }
                                                        >
                                                            ✓
                                                        </Text>
                                                    )}
                                                </View>
                                                <Text
                                                    style={styles.checkboxLabel}
                                                >
                                                    Coût inclus dans
                                                    l’intervention
                                                </Text>
                                            </TouchableOpacity>

                                            <TextInput
                                                style={[
                                                    styles.input,
                                                    editVals.include_in_intervention &&
                                                        styles.inputDisabled,
                                                ]}
                                                placeholder="Prix unitaire (€)"
                                                placeholderTextColor="#000"
                                                keyboardType="numeric"
                                                inputMode="decimal"
                                                value={
                                                    editVals.include_in_intervention
                                                        ? ""
                                                        : editVals.price
                                                }
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "price",
                                                        t.replace(
                                                            /[^0-9.,]/g,
                                                            ""
                                                        )
                                                    )
                                                }
                                                editable={
                                                    !editVals.include_in_intervention
                                                }
                                            />

                                            <View style={styles.qtyRow}>
                                                <TouchableOpacity
                                                    style={[
                                                        styles.qtyButton,
                                                        editVals.include_in_intervention &&
                                                            styles.buttonDisabled,
                                                    ]}
                                                    onPress={() =>
                                                        changeQty(item.id, -1)
                                                    }
                                                    disabled={
                                                        editVals.include_in_intervention
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.qtyButtonText
                                                        }
                                                    >
                                                        −
                                                    </Text>
                                                </TouchableOpacity>
                                                <TextInput
                                                    style={[
                                                        styles.input,
                                                        {
                                                            flex: 1,
                                                            marginBottom: 0,
                                                        },
                                                        editVals.include_in_intervention &&
                                                            styles.inputDisabled,
                                                    ]}
                                                    placeholder="Quantité"
                                                    placeholderTextColor="#000"
                                                    keyboardType="numeric"
                                                    inputMode="numeric"
                                                    value={
                                                        editVals.include_in_intervention
                                                            ? ""
                                                            : editVals.quantity
                                                    }
                                                    onChangeText={(t) =>
                                                        updateEditField(
                                                            item.id,
                                                            "quantity",
                                                            (t ?? "").replace(
                                                                /[^0-9]/g,
                                                                ""
                                                            )
                                                        )
                                                    }
                                                    editable={
                                                        !editVals.include_in_intervention
                                                    }
                                                />
                                                <TouchableOpacity
                                                    style={[
                                                        styles.qtyButton,
                                                        editVals.include_in_intervention &&
                                                            styles.buttonDisabled,
                                                    ]}
                                                    onPress={() =>
                                                        changeQty(item.id, +1)
                                                    }
                                                    disabled={
                                                        editVals.include_in_intervention
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.qtyButtonText
                                                        }
                                                    >
                                                        +
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>

                                            <TextInput
                                                style={styles.input}
                                                placeholder="Acompte (€)"
                                                placeholderTextColor="#000"
                                                keyboardType="numeric"
                                                inputMode="decimal"
                                                value={editVals.deposit}
                                                onChangeText={(t) =>
                                                    updateEditField(
                                                        item.id,
                                                        "deposit",
                                                        t.replace(
                                                            /[^0-9.,]/g,
                                                            ""
                                                        )
                                                    )
                                                }
                                            />

                                            <View
                                                style={{
                                                    flexDirection: "row",
                                                    justifyContent:
                                                        "space-between",
                                                }}
                                            >
                                                <TouchableOpacity
                                                    style={
                                                        styles.saveEditButton
                                                    }
                                                    onPress={() =>
                                                        saveEdit(item.id)
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.saveEditText
                                                        }
                                                    >
                                                        Enregistrer
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={
                                                        styles.cancelEditButton
                                                    }
                                                    onPress={() =>
                                                        cancelEdit(item.id)
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.cancelEditText
                                                        }
                                                    >
                                                        Annuler
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}

                                    {urls.length > 0 && (
                                        <View style={styles.thumbGrid}>
                                            {urls.map((u, idx) => (
                                                <Pressable
                                                    key={idx}
                                                    onPress={() =>
                                                        openImageModal(u)
                                                    }
                                                    onLongPress={() =>
                                                        Alert.alert(
                                                            "Supprimer la photo",
                                                            "Voulez-vous supprimer cette photo ?",
                                                            [
                                                                {
                                                                    text: "Annuler",
                                                                    style: "cancel",
                                                                },
                                                                {
                                                                    text: "Supprimer",
                                                                    style: "destructive",
                                                                    onPress:
                                                                        () =>
                                                                            deleteOnePhoto(
                                                                                item,
                                                                                paths[
                                                                                    idx
                                                                                ]
                                                                            ),
                                                                },
                                                            ]
                                                        )
                                                    }
                                                >
                                                    <Image
                                                        source={{ uri: u }}
                                                        style={styles.thumb}
                                                    />
                                                </Pressable>
                                            ))}
                                        </View>
                                    )}

                                    <View style={styles.actionsRow}>
                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                uploadingOrderId ===
                                                    item.id && { opacity: 0.6 },
                                            ]}
                                            onPress={() =>
                                                takeAndUploadOrderPhoto(item)
                                            }
                                            disabled={
                                                uploadingOrderId === item.id
                                            }
                                        >
                                            {uploadingOrderId === item.id ? (
                                                <ActivityIndicator />
                                            ) : (
                                                <Text
                                                    style={
                                                        styles.squareButtonText
                                                    }
                                                >
                                                    Ajouter photo
                                                </Text>
                                            )}
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.squareButton}
                                            onPress={() => {
                                                navigation.navigate(
                                                    "CommandePreviewPage",
                                                    {
                                                        order: {
                                                            id: item.id,
                                                            client: {
                                                                id: clientId,
                                                                name: clientName,
                                                                ficheNumber:
                                                                    clientNumber,
                                                            },
                                                            deviceType:
                                                                item.product,
                                                            brand: item.brand,
                                                            model: item.model,
                                                            quantity:
                                                                item.quantity,
                                                            price: isIncluded
                                                                ? 0
                                                                : item.price,
                                                            total: isIncluded
                                                                ? 0
                                                                : item.total,
                                                            acompte:
                                                                item.deposit,
                                                            signatureclient:
                                                                item.signatureclient,
                                                            printed:
                                                                item.printed,
                                                        },
                                                    }
                                                );
                                            }}
                                        >
                                            <Text
                                                style={styles.squareButtonText}
                                            >
                                                Imprimer
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.ordered &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            onPress={() =>
                                                !item.ordered &&
                                                handleMarkAsOrdered(item)
                                            }
                                            disabled={item.ordered}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.ordered &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.ordered
                                                    ? "Commande passée"
                                                    : "Marquer passée"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.received &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            onPress={() =>
                                                !item.received &&
                                                handleMarkAsReceived(item)
                                            }
                                            disabled={item.received}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.received &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.received
                                                    ? "Commande reçue"
                                                    : "Marquer reçue"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.paid &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            onPress={() =>
                                                !item.paid &&
                                                handleMarkAsPaid(item)
                                            }
                                            disabled={item.paid}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.paid &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.paid
                                                    ? "Payée"
                                                    : "Marquer payée"}
                                            </Text>
                                        </TouchableOpacity>

                                        {(item.billing?.length ?? 0) === 0 ? (
                                            <TouchableOpacity
                                                style={[
                                                    styles.squareButton,
                                                    isIncluded &&
                                                        styles.squareButtonDisabled,
                                                ]}
                                                onPress={() =>
                                                    !isIncluded &&
                                                    navigation.navigate(
                                                        "BillingPage",
                                                        {
                                                            expressData: {
                                                                order_id:
                                                                    item.id,
                                                                clientname:
                                                                    clientName,
                                                                clientphone:
                                                                    clientPhone,
                                                                product:
                                                                    item.product,
                                                                brand: item.brand,
                                                                model: item.model,
                                                                price: String(
                                                                    item.total ??
                                                                        (item.price ||
                                                                            0) *
                                                                            (item.quantity ||
                                                                                1)
                                                                ),
                                                                quantity:
                                                                    String(
                                                                        item.quantity ||
                                                                            1
                                                                    ),
                                                                description: `${item.product} ${item.brand} ${item.model}`,
                                                                acompte:
                                                                    item.deposit?.toString() ||
                                                                    "0",
                                                                paymentmethod:
                                                                    item.paymentmethod ||
                                                                    "",
                                                                serial:
                                                                    item.serial ||
                                                                    "",
                                                                paid:
                                                                    item.paid ||
                                                                    false,
                                                            },
                                                        }
                                                    )
                                                }
                                                disabled={isIncluded}
                                            >
                                                <Text
                                                    style={[
                                                        styles.squareButtonText,
                                                        isIncluded &&
                                                            styles.squareButtonTextDisabled,
                                                    ]}
                                                >
                                                    {isIncluded
                                                        ? "Inclus (pas de facture)"
                                                        : "Créer facture"}
                                                </Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <View
                                                style={
                                                    styles.squareButtonDisabled
                                                }
                                            >
                                                <Text
                                                    style={
                                                        styles.squareButtonText
                                                    }
                                                >
                                                    Facture créée
                                                </Text>
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.recovered &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            onPress={() =>
                                                !item.recovered &&
                                                handleMarkAsRecovered(item)
                                            }
                                            disabled={item.recovered}
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.recovered &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.recovered
                                                    ? "Récupérée"
                                                    : "Marquer récupérée"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                item.saved &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            disabled={item.saved}
                                            onPress={() =>
                                                handleSaveOrder(item)
                                            }
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    item.saved &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.saved
                                                    ? "Sauvegardée"
                                                    : "Sauvegarder"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.squareButton,
                                                (!item.received ||
                                                    item.notified) &&
                                                    styles.squareButtonDisabled,
                                            ]}
                                            disabled={
                                                !item.received || item.notified
                                            }
                                            onPress={() =>
                                                notifyOrderBySMS(item)
                                            }
                                        >
                                            <Text
                                                style={[
                                                    styles.squareButtonText,
                                                    (!item.received ||
                                                        item.notified) &&
                                                        styles.squareButtonTextDisabled,
                                                ]}
                                            >
                                                {item.notified
                                                    ? "Notifiée"
                                                    : "Notifier"}
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.squareButton}
                                            onPress={() =>
                                                handleDeleteOrder(item)
                                            }
                                        >
                                            <Text
                                                style={styles.squareButtonText}
                                            >
                                                Supprimer
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.squareButton}
                                            onPress={() => navigation.goBack()}
                                        >
                                            <Text
                                                style={styles.squareButtonText}
                                            >
                                                Retour
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {item.saved && !isExpanded && (
                                <TouchableOpacity
                                    style={styles.openRowButton}
                                    onPress={() => toggleExpand(item.id)}
                                >
                                    <Text style={styles.openRowButtonText}>
                                        Ouvrir
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                }}
            />

            {/* Modal zoom image plein écran */}
            <Modal
                visible={imageModalVisible}
                animationType="fade"
                transparent={false}
                presentationStyle="fullScreen"
                statusBarTranslucent={true}
                onRequestClose={() => setImageModalVisible(false)}
            >
                <Pressable
                    style={styles.fullscreenContainer}
                    onPress={() => setImageModalVisible(false)}
                >
                    {imageModalUrl && (
                        <Image
                            source={{ uri: imageModalUrl }}
                            style={styles.fullscreenImage}
                            resizeMode="contain"
                        />
                    )}
                    <View style={styles.fullscreenClose}>
                        <Text style={styles.fullscreenCloseText}>Fermer</Text>
                    </View>
                </Pressable>
            </Modal>
        </View>
		</SafeAreaView>
    );
}

const styles = StyleSheet.create({
	safeArea: {
  flex: 1,
  backgroundColor: "#e6e6e6",
  paddingTop: StatusBar.currentHeight || 0, // évite que le haut passe sous la barre Android
},

    container: { flex: 1, padding: 12, backgroundColor: "#e6e6e6" },
    header: {
        fontSize: 16,
        fontWeight: "800",
        color: "#1f2937",
        marginBottom: 8,
    },

    formContainer: { marginBottom: 12 },
    input: {
        borderWidth: 1,
        borderColor: "#b6b6b6",
        padding: 10,
        marginBottom: 10,
        borderRadius: 8,
        backgroundColor: "#f7f7f7",
        width: "92%",
        alignSelf: "center",
        color: "#111",
    },
    inputDisabled: { opacity: 0.5 },

    qtyRow: {
        flexDirection: "row",
        alignItems: "center",
        width: "92%",
        alignSelf: "center",
        marginBottom: 8,
    },
    qtyButton: {
        width: 44,
        height: 44,
        backgroundColor: "#111827",
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        marginHorizontal: 4,
    },
    qtyButtonText: { color: "#fff", fontSize: 18, fontWeight: "900" },
    buttonDisabled: { backgroundColor: "#9ca3af" },

    formHint: {
        width: "92%",
        alignSelf: "center",
        fontSize: 12,
        color: "#374151",
        marginBottom: 6,
        fontWeight: "700",
    },

    addButton: {
        width: "70%",
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: "center",
        backgroundColor: "#111827",
    },
    addButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },

    checkboxRow: {
        width: "92%",
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: "#111827",
        backgroundColor: "#f7f7f7",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 10,
    },
    checkboxChecked: { backgroundColor: "#111827" },
    checkboxMark: { color: "#fff", fontWeight: "900" },
    checkboxLabel: { color: "#111", fontSize: 14, fontWeight: "700" },

    tableHeader: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#111827",
        paddingVertical: 8,
        paddingHorizontal: 6,
        borderRadius: 8,
        marginBottom: 6,
    },
    th: {
        color: "#fff",
        fontWeight: "900",
        fontSize: 11,
        textTransform: "uppercase",
    },

    orderCard: {
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#c5c5c5",
        marginBottom: 8,
        overflow: "hidden",
        backgroundColor: "#f2f2f2",
    },
    tableRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 6,
    },
    rowEven: { backgroundColor: "#f5f5f5" },
    rowOdd: { backgroundColor: "#ededed" },

    colProduit: { flex: 3.2, paddingRight: 6 },
    colQty: { flex: 0.7, textAlign: "center" },
    colUnit: { flex: 1.1, textAlign: "right" },
    colTotal: { flex: 1.2, textAlign: "right" },
    colDeposit: { flex: 1.2, textAlign: "right" },
    colRemaining: { flex: 1.2, textAlign: "right" },
    colPaid: { flex: 0.8, textAlign: "center" },

    rowTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
    rowSub: { fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 2 },
    rowStatus: {
        fontSize: 11,
        fontWeight: "700",
        color: "#6b7280",
        marginTop: 2,
    },
    rowText: { fontSize: 12, fontWeight: "900", color: "#111" },

    greenText: { color: "#0a7a2e" },
    redText: { color: "#b91c1c" },

    expandArea: {
        backgroundColor: "#ffffff",
        padding: 10,
        borderTopWidth: 1,
        borderTopColor: "#d9d9d9",
    },
    kvBlock: {
        backgroundColor: "#fff",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        padding: 8,
        marginBottom: 10,
    },
    kvRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    kvLabel: { fontSize: 13, color: "#374151", fontWeight: "800" },
    kvValue: { fontSize: 13, color: "#111", fontWeight: "800" },
    kvStrong: { fontWeight: "900" },

    editButton: {
        alignSelf: "flex-end",
        backgroundColor: "#111827",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 6,
    },
    editButtonText: { color: "#fff", fontWeight: "900" },
    editBlock: { marginTop: 6 },

    saveEditButton: {
        backgroundColor: "#111827",
        paddingVertical: 9,
        borderRadius: 8,
        flex: 1,
        marginRight: 6,
        alignItems: "center",
    },
    cancelEditButton: {
        backgroundColor: "#9ca3af",
        paddingVertical: 9,
        borderRadius: 8,
        flex: 1,
        marginLeft: 6,
        alignItems: "center",
    },
    saveEditText: { color: "#fff", fontWeight: "900" },
    cancelEditText: { color: "#fff", fontWeight: "900" },

    thumbGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
    thumb: {
        width: 90,
        height: 90,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#d1d1d1",
        marginRight: 8,
        marginBottom: 8,
    },

    actionsRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        marginTop: 6,
    },
    squareButton: {
        width: "30%",
        paddingVertical: 10,
        backgroundColor: "#111827",
        borderRadius: 8,
        marginVertical: 6,
        alignItems: "center",
        justifyContent: "center",
    },
    squareButtonText: {
        color: "#fff",
        fontWeight: "900",
        textAlign: "center",
        fontSize: 12,
    },
    squareButtonDisabled: {
        width: "30%",
        backgroundColor: "#d1d5db",
        borderRadius: 8,
        marginVertical: 6,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
    },
    squareButtonTextDisabled: { color: "#6b7280" },

    openRowButton: {
        alignSelf: "flex-end",
        marginRight: 10,
        marginBottom: 10,
        backgroundColor: "#111827",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 6,
    },
    openRowButtonText: { color: "#fff", fontWeight: "900", fontSize: 12 },

    emptyBox: { padding: 20, alignItems: "center" },
    emptyText: { color: "#374151", fontWeight: "800" },

    fullscreenContainer: {
        flex: 1,
        backgroundColor: "#000",
        justifyContent: "center",
        alignItems: "center",
    },
    fullscreenImage: { width: "100%", height: "100%" },
    fullscreenClose: {
        position: "absolute",
        top: 24,
        right: 16,
        backgroundColor: "rgba(0,0,0,0.65)",
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    fullscreenCloseText: { color: "#fff", fontWeight: "900", fontSize: 12 },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
    },
    headerActions: {
        flexDirection: "row",
        alignItems: "center",
    },
    headerDivider: {
        marginHorizontal: 6,
        color: "#4b5563",
        fontWeight: "900",
        fontSize: 14,
    },
    headerActionText: {
        color: "#111827",
        fontWeight: "900",
        fontSize: 13,
    },
	
});
