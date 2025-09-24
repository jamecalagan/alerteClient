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
import { MaterialIcons } from "@expo/vector-icons";
import Icon from "react-native-vector-icons/FontAwesome";
import * as ImageManipulator from "expo-image-manipulator";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
const normalizeNumber = (v) => {
    if (v === null || v === undefined) return "";
    return String(v).replace(",", ".").trim();
};
const uploadImageToStorage = async (uri, interventionId, isLabel = false) => {
    const folder = isLabel ? "etiquettes" : "supplementaires";
    const fileName = `${Date.now()}.jpg`;

    const filePath = `${folder}/${interventionId}/${fileName}`;
    console.log("🧾 Chemin d'upload :", filePath);

    const file = {
        uri,
        name: fileName,
        type: "image/jpeg",
    };

    const { error } = await supabase.storage
        .from("images") // ← juste le nom du bucket
        .upload(filePath, file, {
            upsert: true,
            contentType: "image/jpeg",
        });

    if (error) {
        console.error("❌ Erreur upload Supabase:", error.message);
        return null;
    }

    const { data } = supabase.storage.from("images").getPublicUrl(filePath);
    return data.publicUrl;
};

export default function AddInterventionPage({ route, navigation }) {
    const { clientId } = route.params || {};
    const [reference, setReference] = useState("");
    const [brand, setBrand] = useState("");
    const [serial_number, setSerial_number] = useState("");
    const [description, setDescription] = useState("");
    const [cost, setCost] = useState("");
    const [devisCost, setDevisCost] = useState(""); // Ajout du champ devisCost
    const [estimateMin, setEstimateMin] = useState("");
    const [estimateMax, setEstimateMax] = useState("");
    const [estimateType, setEstimateType] = useState("PLAFOND"); // PLAFOND | INDICATIF
    const [paymentStatus, setPaymentStatus] = useState("non_regle");
    const [status, setStatus] = useState("default");
    const [deviceType, setDeviceType] = useState("default");
    const [password, setPassword] = useState("");
    const [commande, setCommande] = useState("");
    const [chargeur, setChargeur] = useState("Non");
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [alertTitle, setAlertTitle] = useState("");
    const [photos, setPhotos] = useState([]);
    const [selectedImage, setSelectedImage] = useState(null);
    const [isPhotoTaken, setIsPhotoTaken] = useState(false);
    const [labelPhoto, setLabelPhoto] = useState(null);
    const [model, setModel] = useState("");
    const [customBrand, setCustomBrand] = useState("");
    const [customModel, setCustomModel] = useState("");
    const [customDeviceType, setCustomDeviceType] = useState("");
    const [products, setProducts] = useState([]);
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    const [remarks, setRemarks] = useState(""); // État pour les remarques
    const [acceptScreenRisk, setAcceptScreenRisk] = useState(false);
    const [clientName, setClientName] = useState("");
    const [showDeviceTypes, setShowDeviceTypes] = useState(true);
    const [showBrands, setShowBrands] = useState(true);
    const [showModels, setShowModels] = useState(true);

    const [partialPayment, setPartialPayment] = useState(""); // Montant de l'acompte
    useEffect(() => {
        loadProducts();
    }, []);
    useEffect(() => {
        const fetchClientName = async () => {
            const { data, error } = await supabase
                .from("clients") // Assurez-vous que la table s'appelle 'clients'
                .select("name") // Ajustez 'name' au nom réel de la colonne pour le nom du client
                .eq("id", clientId)
                .single();

            if (error) {
                console.error(
                    "Erreur lors de la récupération du nom du client:",
                    error
                );
            } else {
                setClientName(data.name);
            }
        };

        if (clientId) {
            fetchClientName();
        }
    }, [clientId]);
    const loadProducts = async () => {
        const { data, error } = await supabase.from("article").select("*");
        if (error) {
            console.error(
                "Erreur lors du chargement des produits:",
                error.message
            );
        } else {
            setProducts(data);
        }
    };

    const loadBrands = async (articleId) => {
        const { data, error } = await supabase
            .from("marque")
            .select("*")
            .eq("article_id", articleId);
        if (error) {
            console.error("Erreur lors du chargement des marques :", error);
        } else {
            setBrands(data);
        }
    };

    const loadModels = async (brandId) => {
        const { data, error } = await supabase
            .from("modele")
            .select("*")
            .eq("marque_id", brandId);
        if (error) {
            console.error("Erreur lors du chargement des modèles :", error);
        } else {
            setModels(data);
        }
    };

    const pickLabelImage = async () => {
        try {
            let result = await ImagePicker.launchCameraAsync({
                mediaTypes: ["images"], // Sélectionne uniquement les images
                allowsEditing: true,
                quality: 0.5, // Compression initiale
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const imageUri = result.assets[0].uri;

                // Compression et redimensionnement
                const compressedImage = await ImageManipulator.manipulateAsync(
                    imageUri,
                    [{ resize: { width: 800 } }],
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                );

                const compressedUri = compressedImage.uri;

                // On enregistre l'URI directement au lieu du base64
                setPhotos([...photos, compressedUri]);
                setIsPhotoTaken(true);
                setLabelPhoto(compressedUri);

                if (!reference) {
                    setReference("Voir photo pour référence produit");
                }

                console.log(
                    "✅ Image d'étiquette enregistrée (URI) :",
                    compressedUri
                );
            } else {
                console.log("Aucune image capturée ou opération annulée.");
            }
        } catch (error) {
            console.error("Erreur lors de la capture d'image :", error);
        }
    };

    const pickAdditionalImage = async () => {
        try {
            let result = await ImagePicker.launchCameraAsync({
                mediaTypes: ["images"],
                allowsEditing: true,
                quality: 0.5,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const imageUri = result.assets[0].uri;

                // Compression et redimensionnement
                const compressedImage = await ImageManipulator.manipulateAsync(
                    imageUri,
                    [{ resize: { width: 800 } }],
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                );

                const compressedUri = compressedImage.uri;
                setPhotos([...photos, compressedUri]);

                console.log(
                    "✅ Image supplémentaire ajoutée (URI) :",
                    compressedUri
                );
            } else {
                console.log("Aucune image capturée ou opération annulée.");
            }
        } catch (error) {
            console.error("Erreur lors de la capture d'image :", error);
        }
    };

    const handleDeviceTypeChange = async (value) => {
        setDeviceType(value);
        setCustomDeviceType("");
        setShowDeviceTypes(false); // on referme la liste
        const selectedProduct = products.find((p) => p.nom === value);
        if (selectedProduct) await loadBrands(selectedProduct.id);
        setShowBrands(true); // on ouvre la liste suivante
    };

    const [selectedBrandName, setSelectedBrandName] = useState(""); // Nouvel état pour stocker le nom

    const handleBrandChange = async (value) => {
        setBrand(value);
        setCustomBrand("");
        setShowBrands(false); // on referme la liste
        const selectedBrand = brands.find((b) => b.id === value);
        if (selectedBrand) await loadModels(selectedBrand.id);
        setShowModels(true); // on ouvre la suivante
    };

    const addArticleIfNeeded = async () => {
        console.log("📥 addArticleIfNeeded appelée");

        if (deviceType === "Autre" && customDeviceType) {
            console.log("🆕 Article à insérer :", customDeviceType);

            const { data, error } = await supabase
                .from("article")
                .insert([{ nom: customDeviceType }])
                .select();

            if (error) {
                console.error("❌ Erreur Supabase article :", error.message);
                return null;
            }

            if (data && data[0]) {
                console.log("✅ Article inséré :", data[0]);
                return data[0].id;
            }
        }

        const existing = products.find((product) => product.nom === deviceType);
        console.log("📦 Article existant trouvé :", existing);
        return existing?.id || null;
    };

// addBrandIfNeeded
const addBrandIfNeeded = async (articleId) => {
  if (brand === "Autre" && customBrand) {
    const { data, error } = await supabase
      .from("marque")
      .insert([{ nom: customBrand.trim(), article_id: articleId }])
      .select();

    if (error) {
      console.error("Erreur lors de l'ajout de la marque :", error);
      Alert.alert("Erreur", "Impossible d'ajouter la nouvelle marque.");
      return null;
    }
    if (data && data[0]) {
      setBrands((prev) => [...prev, data[0]]); // ✅ correct spread
      return data[0].id;
    }
  }
  return brands.find((b) => b.id === brand)?.id || null;
};

// addModelIfNeeded
const addModelIfNeeded = async (brandId, articleId) => {
  if (model === "Autre" && customModel) {
    const { data, error } = await supabase
      .from("modele")
      .insert([{
        nom: customModel.trim(),
        marque_id: brandId,
        article_id: articleId,
      }])
      .select();

    if (error) {
      console.error("Erreur lors de l'ajout du modèle :", error);
      Alert.alert("Erreur", "Impossible d'ajouter le nouveau modèle.");
      return null;
    }
    if (data && data[0]) {
      setModels((prev) => [...prev, data[0]]); // ✅ correct spread
      return data[0].id;
    }
  }
  return models.find((m) => m.id === model)?.id || null;
};

    const handlePaymentStatusChange = (status) => {
        setPaymentStatus(status);
    };

    const handleSaveIntervention = async () => {
        const errors = [];

        if (!reference) errors.push("Référence");
        if (!brand || brand === "default") errors.push("Marque");
        if (!model || model === "default") errors.push("Modèle");
        if (!description) errors.push("Description");
        if (deviceType === "default") errors.push("Type de produit");
        if (status === "default") errors.push("Statut");

        if (status !== "Devis en cours" && !cost) {
            errors.push("Coût de la réparation");
        }

        // Validation de la fourchette si "Devis en cours"
        if (status === "Devis en cours") {
            const min = parseFloat(normalizeNumber(estimateMin));
            const max = parseFloat(normalizeNumber(estimateMax));
            if (isNaN(min) || isNaN(max)) {
                errors.push("Fourchette de devis (de/à)");
            } else if (min < 0 || max < 0) {
                errors.push("Fourchette de devis : valeurs positives requises");
            } else if (min > max) {
                errors.push("Fourchette de devis : 'De' doit être ≤ 'À'");
            }
        }

        if (!labelPhoto) {
            errors.push("Photo d’étiquette");
        }

        if (
            paymentStatus === "reglement_partiel" &&
            (!partialPayment || parseFloat(partialPayment) > parseFloat(cost))
        ) {
            errors.push("Acompte valide");
        }

        if (errors.length > 0) {
            const errorMsg = "Champs manquants ou incorrects :\n\n" + errors.join("\n");
            Alert.alert("Erreur", errorMsg);
            return;
        }

        // 🔹 Gestion du montant du devis (champ existant, conservé)
        const formattedDevisCost =
            status === "Devis en cours" && devisCost
                ? parseFloat(devisCost)
                : null; // null si vide

        // Conversion sécurisée
        const costValue = cost ? parseFloat(cost) : 0;
        const partialPaymentValue = partialPayment ? parseFloat(partialPayment) : 0;

        // Solde restant dû
        let solderestant = costValue - partialPaymentValue;
        if (isNaN(solderestant) || solderestant < 0) solderestant = 0;

        // … (créations liées aux listes marque/modèle si besoin — inchangé) …

        const uploadedPhotoUrls = photos; // suppose que tu gères déjà l’upload
        const labelPhotoUrl = labelPhoto; // idem
        const interventionId = undefined; // si tu génères un UUID ailleurs, garde ta logique
            const articleId = await addArticleIfNeeded();       // crée l'article si "Autre"
            const brandId   = await addBrandIfNeeded(articleId); // crée la marque si "Autre"
            const modelId   = await addModelIfNeeded(brandId, articleId); // crée le modèle si "Autre"

            if (!articleId) {
            Alert.alert("Erreur", "Type de produit introuvable. Veuillez réessayer.");
            return;
            }
            if (!brandId) {
            Alert.alert("Erreur", "Marque introuvable. Veuillez réessayer.");
            return;
            }

        const interventionData = {
            reference,
            brand: customBrand || brands.find((b) => b.id === brand)?.nom,
            model: customModel || models.find((m) => m.id === model)?.nom,
            serial_number,
            description,
            cost: costValue,
            solderestant,
            status,
            // --- Devis / fourchette ---
            estimate_min: (status === "Devis en cours") ? parseFloat(normalizeNumber(estimateMin)) : null,
            estimate_max: (status === "Devis en cours") ? parseFloat(normalizeNumber(estimateMax)) : null,
            estimate_type: (status === "Devis en cours") ? estimateType : null,
            is_estimate: status === "Devis en cours",
            estimate_accepted: (status === "Devis en cours" && estimateType === "PLAFOND") ? true : null,
            estimate_accepted_at: (status === "Devis en cours" && estimateType === "PLAFOND") ? new Date().toISOString() : null,
            deviceType: customDeviceType || deviceType,
              brand:      customBrand      || (brands.find(b => b.id === brand)?.nom || null),
             model:      customModel      || (models.find(m => m.id === model)?.nom || null),
            password,
            commande,
            chargeur: chargeur === "Oui",
            client_id: clientId,
            photos: uploadedPhotoUrls,
            label_photo: labelPhotoUrl,
            id: interventionId,
            article_id: articleId,
            marque_id: brandId,
            modele_id: modelId,
            remarks,
            paymentStatus,
            partialPayment: partialPayment ? parseFloat(partialPayment) : null,
            accept_screen_risk: acceptScreenRisk,
            createdAt: new Date().toISOString(),
        };

        // `devis_cost` (compat) si "Devis en cours"
        if (status === "Devis en cours") {
            interventionData.devis_cost = formattedDevisCost;
        }

        try {
            const { error } = await supabase.from("interventions").insert(interventionData);
            if (error) {
                console.error("❌ Erreur d'insertion intervention :", error.message);
                setAlertTitle("Erreur");
                setAlertMessage("Une erreur est survenue lors de l'enregistrement.");
                setAlertVisible(true);
                return;
            }
            setAlertTitle("Succès");
            setAlertMessage("Intervention enregistrée avec succès.");
            setAlertVisible(true);
        } catch (e) {
            console.error("❌ Exception insertion :", e);
            setAlertTitle("Erreur");
            setAlertMessage("Impossible d'enregistrer l'intervention.");
            setAlertVisible(true);
        }
    };

    const closeAlert = () => {
        setAlertVisible(false);
        if (alertTitle === "Succès") navigation.navigate("Home");
    };


    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
        >
            {clientName && (
                <Text style={styles.clientName}>{`Client: ${clientName}`}</Text>
            )}
            <ScrollView
                contentContainerStyle={{
                    paddingBottom: 20,
                    flexGrow: 1,
                }}
            >
                <View>
                    <Text style={styles.label}>Type de produit</Text>
                    {showDeviceTypes ? (
                        <View style={styles.buttonGroup}>
                            {products
                                .sort((a, b) => a.nom.localeCompare(b.nom)) // <== Ajouté ici
                                .map((p) => (
                                    <TouchableOpacity
                                        key={p.id}
                                        style={[
                                            styles.selectionButton,
                                            deviceType === p.nom &&
                                                styles.selectedButton,
                                        ]}
                                        onPress={() =>
                                            handleDeviceTypeChange(p.nom)
                                        }
                                    >
                                        <Text style={styles.selectionText}>
                                            {p.nom}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            <TouchableOpacity
                                style={[
                                    styles.selectionButton,
                                    deviceType === "Autre" &&
                                        styles.selectedButton,
                                ]}
                                onPress={() => handleDeviceTypeChange("Autre")}
                            >
                                <Text style={styles.selectionText}>Autre</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.selectedInfo}>
                                Produit : {deviceType}
                            </Text>
                            {deviceType === "Autre" && (
                                <TextInput
                                    style={styles.input}
                                    placeholder="Entrez le type de produit"
                                    value={customDeviceType}
                                    onChangeText={setCustomDeviceType}
                                />
                            )}
                            <View style={styles.reopenContainer}>
                                <TouchableOpacity
                                    style={styles.reopenButton}
                                    onPress={() => setShowDeviceTypes(true)}
                                >
                                    <Text style={styles.reopenButtonText}>
                                        Modifier le produit
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}

                    <Text style={styles.label}>Marque</Text>
                    {showBrands ? (
                        <View style={styles.buttonGroup}>
                            {brands
                                .sort((a, b) => a.nom.localeCompare(b.nom)) // <== Ajouté ici
                                .map((b) => (
                                    <TouchableOpacity
                                        key={b.id}
                                        style={[
                                            styles.selectionButton,
                                            brand === b.id &&
                                                styles.selectedButton,
                                        ]}
                                        onPress={() => handleBrandChange(b.id)}
                                    >
                                        <Text style={styles.selectionText}>
                                            {b.nom}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            <TouchableOpacity
                                style={[
                                    styles.selectionButton,
                                    brand === "Autre" && styles.selectedButton,
                                ]}
                                onPress={() => handleBrandChange("Autre")}
                            >
                                <Text style={styles.selectionText}>Autre</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.selectedInfo}>
                                Marque :{" "}
                                {customBrand ||
                                    brands.find((b) => b.id === brand)?.nom}
                            </Text>
                            {brand === "Autre" && (
                                <TextInput
                                    style={styles.input}
                                    placeholder="Entrez la marque"
                                    value={customBrand}
                                    onChangeText={setCustomBrand}
                                />
                            )}
                            <TouchableOpacity
                                style={styles.reopenButton}
                                onPress={() => setShowBrands(true)}
                            >
                                <Text style={styles.reopenButtonText}>
                                    Modifier la marque
                                </Text>
                            </TouchableOpacity>
                        </>
                    )}

                    <Text style={styles.label}>Modèle</Text>
                    {showModels ? (
                        <View style={styles.buttonGroup}>
                            {models
                                .sort((a, b) => a.nom.localeCompare(b.nom)) // <== Ajouté ici
                                .map((m) => (
                                    <TouchableOpacity
                                        key={m.id}
                                        style={[
                                            styles.selectionButton,
                                            model === m.id &&
                                                styles.selectedButton,
                                        ]}
                                        onPress={() => {
                                            setModel(m.id);
                                            setShowModels(false);
                                        }}
                                    >
                                        <Text style={styles.selectionText}>
                                            {m.nom}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            <TouchableOpacity
                                style={[
                                    styles.selectionButton,
                                    model === "Autre" && styles.selectedButton,
                                ]}
                                onPress={() => setModel("Autre")}
                            >
                                <Text style={styles.selectionText}>Autre</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.selectedInfo}>
                                Modèle :{" "}
                                {customModel ||
                                    models.find((m) => m.id === model)?.nom}
                            </Text>
                            {model === "Autre" && (
                                <TextInput
                                    style={styles.input}
                                    placeholder="Entrez le modèle"
                                    value={customModel}
                                    onChangeText={setCustomModel}
                                />
                            )}
                            <TouchableOpacity
                                style={styles.reopenButton}
                                onPress={() => setShowBrands(true)}
                            >
                                <Text style={styles.reopenButtonText}>
                                    Modifier le modèle
                                </Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                {model === "Autre" && (
                    <TextInput
                        style={styles.input}
                        placeholder="Entrez le modèle"
                        value={customModel}
                        onChangeText={setCustomModel}
                    />
                )}
                <View
                    style={{
                        height: 2,
                        backgroundColor: "#cacaca",
                        marginVertical: 8,
                    }}
                />
                <View style={styles.referenceContainer}>
                    <TextInput
                        style={styles.referenceInput}
                        value={reference.toUpperCase()}
                        onChangeText={(text) =>
                            setReference(text.toUpperCase())
                        }
                        autoCapitalize="characters"
                        placeholderTextColor="#242424"
                        placeholder="Référence du produit / Numéro de série / photo étiquette"
                    />

                    {isPhotoTaken && (
                        <MaterialIcons
                            name="check-circle"
                            size={24}
                            color="green"
                            style={styles.checkIcon}
                        />
                    )}
                </View>

                <TouchableOpacity
                    style={styles.button}
                    onPress={pickLabelImage}
                >
                    <Icon
                        name="camera"
                        size={20}
                        color="#dddcdc"
                        style={styles.buttonIcon}
                    />
                    <Text style={styles.buttonText}>
                        Prendre une photo de l'étiquette
                    </Text>
                </TouchableOpacity>

                <Text style={styles.label}>Description de la panne</Text>
                <TextInput
                    style={styles.input}
                    value={description.toUpperCase()}
                    onChangeText={(text) => setDescription(text.toUpperCase())}
                    multiline
                    autoCapitalize="characters"
                />

                <Text style={styles.label}>Mot de passe (si applicable)</Text>
                <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                />

                <Text style={styles.label}>Coût de la réparation (€)</Text>
                <TextInput
                    style={styles.input}
                    value={cost ? cost.toString() : ""}
                    onChangeText={setCost}
                    keyboardType="numeric"
                    placeholderTextColor="#191f2f"
                    editable={status !== "Devis en cours"} // Désactiver si "Devis en cours" est sélectionné
                    placeholder={
                        status === "Devis en cours"
                            ? "Indisponible en mode Devis"
                            : "Entrez le coût"
                    }
                />

                <View>
                    <View>
                        {/* Ligne distincte pour l'acceptation */}
                        <View
                            style={[
                                styles.checkboxContainer,
                                { marginBottom: 20 },
                            ]}
                        >
                            <TouchableOpacity
                                onPress={() =>
                                    setAcceptScreenRisk((prev) => !prev)
                                }
                                style={styles.checkboxRow}
                            >
                                <View style={styles.checkbox}>
                                    {acceptScreenRisk && (
                                        <Image
                                            source={require("../assets/icons/checked.png")}
                                            style={{
                                                width: 20,
                                                height: 20,
                                                tintColor: "#007bff", // 🔵 bleu pour acceptScreenRisk
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

                        {/* Groupe pour les autres cases */}
                        <View style={styles.checkboxContainer}>
                            <TouchableOpacity
                                onPress={() => {
                                    setPaymentStatus("non_regle");
                                    setPartialPayment("");
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
                                                tintColor: "#fc0707", // 🔴 rouge
                                            }}
                                            resizeMode="contain"
                                        />
                                    )}
                                </View>
                                <Text style={styles.checkboxLabel}>
                                    Non réglé
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() =>
                                    setPaymentStatus("reglement_partiel")
                                }
                                style={styles.checkboxRow}
                            >
                                <View style={styles.checkbox}>
                                    {paymentStatus === "reglement_partiel" && (
                                        <Image
                                            source={require("../assets/icons/checked.png")}
                                            style={{
                                                width: 20,
                                                height: 20,
                                                tintColor: "#e4a907", // 🟠 orange
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
                                onPress={() => setPaymentStatus("solde")}
                                style={styles.checkboxRow}
                            >
                                <View style={styles.checkbox}>
                                    {paymentStatus === "solde" && (
                                        <Image
                                            source={require("../assets/icons/checked.png")}
                                            style={{
                                                width: 20,
                                                height: 20,
                                                tintColor: "#4CAF50", // 🟢 vert
                                            }}
                                            resizeMode="contain"
                                        />
                                    )}
                                </View>
                                <Text style={styles.checkboxLabel}>Soldé</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {paymentStatus === "reglement_partiel" && (
                        <View>
                            <Text style={styles.label}>
                                Montant de l'acompte (€)
                            </Text>
                            <TextInput
                                style={styles.input}
                                value={partialPayment}
                                onChangeText={(value) => {
                                    if (parseFloat(value) > parseFloat(cost)) {
                                        Alert.alert(
                                            "Erreur",
                                            "L'acompte ne peut pas dépasser le montant total."
                                        );
                                    } else {
                                        setPartialPayment(value);
                                    }
                                }}
                                keyboardType="numeric"
                                placeholder="Entrez le montant de l'acompte"
                            />
                            <Text style={styles.label}>
                                Solde restant :{" "}
                                {cost && partialPayment
                                    ? (cost - partialPayment).toFixed(2)
                                    : cost}{" "}
                                €
                            </Text>
                        </View>
                    )}
                </View>
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
                            if (itemValue === "Devis en cours") {
                                setCost("");
                            }
                        }}
                    >
                        <Picker.Item label="Sélectionnez un statut..." value="default" />
                        <Picker.Item label="En attente de pièces" value="En attente de pièces" />
                        <Picker.Item label="Devis en cours" value="Devis en cours" />
                        <Picker.Item label="Devis accepté" value="Devis accepté" />
                        <Picker.Item label="Réparation en cours" value="Réparation en cours" />
                        <Picker.Item label="Réparé" value="Réparé" />
                        <Picker.Item label="Non réparable" value="Non réparable" />
                    </Picker>

                    {status === "Devis en cours" && (
                        <TextInput
                            style={styles.input}
                            placeholder="Montant du devis (€)"
                            placeholderTextColor="#202020"
                            keyboardType="numeric"
                            value={devisCost}
                            onChangeText={(text) => setDevisCost(text)}
                        />
                    )}

                    {/* 👉 NOUVEAU : fourchette + type quand Devis en cours */}
                    {status === "Devis en cours" && (
                        <>
                            <Text style={styles.label}>Fourchette de devis (€)</Text>
                            <View style={{ flexDirection: "row", gap: 10 }}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    placeholder="De ..."
                                    placeholderTextColor="#202020"
                                    keyboardType="numeric"
                                    value={estimateMin}
                                    onChangeText={(t) => setEstimateMin(normalizeNumber(t))}
                                />
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    placeholder="À ..."
                                    placeholderTextColor="#202020"
                                    keyboardType="numeric"
                                    value={estimateMax}
                                    onChangeText={(t) => setEstimateMax(normalizeNumber(t))}
                                />
                            </View>
                            <Text style={styles.label}>Type de fourchette</Text>
                            <Picker
                                selectedValue={estimateType}
                                style={styles.input}
                                onValueChange={(val) => setEstimateType(val)}
                            >
                                <Picker.Item label="Fourchette plafonnée (acceptée d’office)" value="PLAFOND" />
                                <Picker.Item label="Fourchette indicative (à confirmer)" value="INDICATIF" />
                            </Picker>
                            <Text style={styles.interventionText}>
                                Si “plafond” est choisi, le client accepte un maximum garanti (vous facturez ≤ {estimateMax || "…"} €).
                            </Text>
                        </>
                    )}

                    {status !== "Devis en cours" && (
                        <View style={styles.halfWidthContainer}>
                            <Text style={styles.label}>Coût de la réparation (€)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Coût total (€)"
                                placeholderTextColor="#202020"
                                keyboardType="numeric"
                                value={cost}
                                onChangeText={(text) => setCost(text)}
                            />
                        </View>
                    )}
                </View>
                    </View>
                    {status === "En attente de pièces" && (
                        <View style={styles.halfWidthContainer}>
                            <Text style={styles.label}>Commande</Text>
                            <TextInput
                                style={styles.input}
                                value={commande.toUpperCase()}
                                onChangeText={(text) =>
                                    setCommande(text.toUpperCase())
                                }
                                autoCapitalize="characters"
                            />
                        </View>
                    )}
               
                <Text style={styles.label}>Remarques</Text>
                <TextInput
                    style={styles.input}
                    value={remarks}
                    onChangeText={setRemarks}
                    placeholderTextColor="#191f2f"
                    placeholder="Ajoutez des remarques ici..."
                    multiline
                />

                <Text style={styles.label}>Chargeur</Text>
                <Picker
                    selectedValue={chargeur}
                    style={styles.input}
                    onValueChange={(itemValue) => setChargeur(itemValue)}
                >
                    <Picker.Item label="Non" value="Non" />
                    <Picker.Item label="Oui" value="Oui" />
                </Picker>

                {photos.length > 0 && (
                    <View
                        style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            justifyContent: "center",
                            marginTop: 20,
                        }}
                    >
                        {photos.map((photo, index) => (
                            <TouchableWithoutFeedback
                                key={index}
                                onPress={() => setSelectedImage(photo)}
                            >
                                <Image
                                    source={{ uri: photo }}
                                    style={[
                                        {
                                            width: 100,
                                            height: 100,
                                            margin: 5,
                                            borderRadius: 10,
                                        },
                                        photo === labelPhoto && {
                                            borderWidth: 2,
                                            borderColor: "#43ec86",
                                        }, // Applique le contour vert uniquement pour la photo d'étiquette
                                    ]}
                                />
                            </TouchableWithoutFeedback>
                        ))}
                    </View>
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

                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[styles.iconButton, styles.button]}
                        onPress={pickAdditionalImage}
                    >
                        <Icon
                            name="camera"
                            size={20}
                            color="#888787"
                            style={styles.buttonIcon}
                        />
                        <Text style={styles.buttonText}>
                            Prendre une autre photo
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.iconButton, styles.saveButton]}
                        onPress={handleSaveIntervention}
                    >
                        <Icon
                            name="save"
                            size={20}
                            color="#e6e6e6"
                            style={styles.buttonIcon}
                        />
                        <Text style={styles.buttonText}>
                            Sauvegarder l'intervention
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

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
                                source={{
                                    uri: `data:image/jpeg;base64,${selectedImage}`,
                                }}
                                style={styles.fullImage}
                            />
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>
            )}

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
                        <TouchableOpacity
                            style={styles.modalButton}
                            onPress={closeAlert}
                        >
                            <Text style={styles.modalButtonText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#e0e0e0",
        paddingHorizontal: 20,
    },
    clientName: {
        fontSize: 20,
        fontWeight: "medium",
        textAlign: "center",
        marginVertical: 10,
        color: "#242424",
    },

    input: {
        padding: 10,
        marginBottom: 20,
        borderRadius: 10,
        backgroundColor: "#cacaca",
        width: "90%",
        alignSelf: "center",
        fontSize: 16,
        fontWeight: "medium",
        color: "#191f2f",
        height: 50,
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
        justifyContent: "space-between", // Pour espacer les éléments
        width: "95%", // Assurez-vous que cela ne dépasse pas de l'écran
        alignSelf: "center",
    },
    // Chaque champ prendra 50% de la largeur
    halfWidthContainer: {
        flex: 1, // Chaque élément prend 50% de l'espace disponible
    },
    referenceContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        alignSelf: "center",
    },
    referenceInput: {
        padding: 10,
        borderRadius: 10,
        backgroundColor: "#cacaca",
        width: "90%",
        fontSize: 16,
        fontWeight: "medium",
        marginBottom: 5,
        color: "#888787",
    },
    checkIcon: {
        marginLeft: 10,
    },
    thumbnail: {
        width: 100,
        height: 100,
        margin: 5,
        borderRadius: 10,
    },
    labelPhoto: {
        borderWidth: 3,
        borderColor: "green",
    },
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
    buttonText: {
        color: "#fff",
        fontWeight: "medium",
    },
    saveButton: {
        backgroundColor: "#04852b",
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
    saveButtonText: {
        color: "#888787",
        fontSize: 16,
        fontWeight: "mediums",
    },
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
        backgroundColor: "rgba(0, 0, 0, 0.8)", // Fond transparent
    },
    fullImage: {
        width: "90%",
        height: "90%",
        resizeMode: "contain", // Adapter l'image à la taille de l'écran
    },
    fullwidthContainer: {
        flex: 1,
        width: "48%",
    },
    rowFlexContainer: {
        flexDirection: "row",
        width: "100%",
    },
    buttonContainer: {
        flexDirection: "row", // Positionne les boutons côte à côte
        justifyContent: "space-between", // Espace entre les boutons
        width: "100%",
        paddingHorizontal: 40,
        gap: 10,
    },
    buttonIcon: {
        marginRight: 10, // Espace entre l'icône et le texte
    },
    iconButton: {
        flexDirection: "row", // Positionne l'icône et le texte côte à côte
        alignItems: "center",
        backgroundColor: "#888787",
        borderWidth: 1,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 2,
        justifyContent: "center",
        flex: 1, // Prend 50% de la largeur (car il y a 2 boutons)
        marginHorizontal: 5, // Un petit espace entre les deux boutons
    },
    addButtonText: {
        color: "#888787",
        fontSize: 16,
        fontWeight: "bold",
    },
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
    modalButtonText: {
        color: "#202020",
        fontSize: 16,
        fontWeight: "bold",
    },
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
    checkboxContainer: {
        flexDirection: "row",
        marginVertical: 10,
    },
    checkboxRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 5,
        marginRight: 10,
        marginLeft: 40,
    },
    checkboxContainer: {
        flexDirection: "row",
        marginVertical: 10,
    },
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
    checkboxIndicator: {
        width: 12,
        height: 12,
        backgroundColor: "191f2f", // Couleur de l'indicateur
    },
    checkboxLabel: {
        color: "#242424",
        fontSize: 16,
        fontWeight: "medium",
    },
    checkboxCheckedBlue: {
        borderColor: "blue",
        backgroundColor: "blue",
    },
    checkboxCheckedBlue: {
        borderColor: "blue",
        backgroundColor: "blue",
    },
    interventionText: {
        fontSize: 16,
        color: "#ff4500", // Rouge orangé pour attirer l'attention
        fontWeight: "medium",
        marginBottom: 15,
        width: "90%",
        alignSelf: "center",
    },
    buttonGroup: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        marginBottom: 20,
        gap: 10,
    },

    selectionButton: {
        borderWidth: 1,
        borderColor: "#888787",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 4,
        backgroundColor: "#191f2f",
        margin: 5,
        width: 150,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        alignSelf: "center",
    },

    selectedButton: {
        borderRadius: 4,
        borderWidth: 2,
        borderColor: "#30af0a",
    },

    selectionText: {
        color: "#ffffff",
        fontWeight: "bold",
        fontSize: 14,
    },
    selectedInfo: {
        fontSize: 18,
        color: "#2c3e50",
        fontStyle: "italic",
        textAlign: "center",
        marginBottom: 10,
    },

    reopenButton: {
        alignItems: "center",
        marginBottom: 20,
    },
    reopenText: {
        color: "#007bff",
        fontSize: 14,
        textDecorationLine: "underline",
    },
    reopenButton: {
        backgroundColor: "#007bff",
        padding: 10,
        borderRadius: 4,
        marginBottom: 15,
    },
    reopenButtonText: {
        color: "#fff",
        fontWeight: "bold",
        textAlign: "center",
    },
});
