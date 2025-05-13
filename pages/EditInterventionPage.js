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
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
export default function EditInterventionPage({ route, navigation }) {
    const { clientId } = route.params || {};
    const { interventionId } = route.params;
    const [reference, setReference] = useState("");
    const [brand, setBrand] = useState("");
    const [customBrand, setCustomBrand] = useState("");
    const [description, setDescription] = useState("");
    const [cost, setCost] = useState("");
    const [paymentStatus, setPaymentStatus] = useState("non_regle");
    const [status, setStatus] = useState("default");
    const [devisCost, setDevisCost] = useState(""); // Ajout du champ devis

    const [deviceType, setDeviceType] = useState("default");
    const [customDeviceType, setCustomDeviceType] = useState("");
    const [password, setPassword] = useState("");
    const [commande, setCommande] = useState("");
    const [chargeur, setChargeur] = useState("Non");
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [alertTitle, setAlertTitle] = useState("");
    const [photos, setPhotos] = useState([]);
    const [labelPhoto, setLabelPhoto] = useState(null); // Pour la photo de l'étiquette
    const [selectedImage, setSelectedImage] = useState(null); // Pour afficher l'image sélectionnée en plein écran
    const [serial_number, setSerial_number] = useState(""); // Pour stocker le numéro de série
    const [customModel, setCustomModel] = useState("");
    const [model, setModel] = useState("");
    const [articles, setArticles] = useState([]);
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    const [remarks, setRemarks] = useState(""); // État pour les remarques
    const [acceptScreenRisk, setAcceptScreenRisk] = useState(false);
    const [clientName, setClientName] = useState("");
    const [partialPayment, setPartialPayment] = useState("");
    const [solderestant, setSolderestant] = useState("");
    useEffect(() => {
        loadIntervention();
        loadArticles(); // Charger les articles au démarrage
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
    // Charger les données de l'intervention en cours
    const loadIntervention = async () => {
        const { data, error } = await supabase
            .from("interventions")
            .select(
                "article_id, marque_id, modele_id, reference, description, cost, partialPayment, solderestant, status, commande, createdAt, serial_number, password, chargeur, photos, label_photo, remarks, paymentStatus, accept_screen_risk, devis_cost "
            )
            .eq("id", interventionId)
            .single();

        if (error) {
            console.error(
                "Erreur lors du chargement de l'intervention :",
                error
            );
        } else {
            setDeviceType(data.article_id); // ID de l'article
            setBrand(data.marque_id); // ID de la marque
            setModel(data.modele_id); // ID du modèle
            setReference(data.reference);
            setDescription(data.description);
            setCost(data.cost);
            setDevisCost(data.devis_cost ? data.devis_cost.toString() : "");
            setSolderestant(data.solderestant || 0);
            setPartialPayment(data.partialPayment); // Charge l'acompte
            setStatus(data.status);
            setSerial_number(data.serial_number);
            setPassword(data.password);
            setPhotos(data.photos);
            setLabelPhoto(data.label_photo); // Charge la photo d'étiquette
            setCommande(data.commande || "");
            setRemarks(data.remarks || ""); // Charge les remarques
            setPaymentStatus(data.paymentStatus || "");
            setChargeur(data.chargeur ? "Oui" : "Non");
            setAcceptScreenRisk(data.accept_screen_risk || false);
            if (data.article_id) loadBrands(data.article_id);
            if (data.marque_id) loadModels(data.marque_id);
        }
    };

    const uploadImageToStorage = async (
        fileUri,
        interventionId,
        isLabel = false
    ) => {
        try {
            const folder = isLabel ? "etiquettes" : "supplementaires";
            const fileName = `${Date.now()}.jpg`;
            const filePath = `${folder}/${interventionId}/${fileName}`;

            const file = {
                uri: fileUri,
                name: fileName,
                type: "image/jpeg",
            };

            const { error } = await supabase.storage
                .from("images")
                .upload(filePath, file, {
                    upsert: true,
                    contentType: "image/jpeg",
                });

            if (error) {
                console.error("❌ Erreur upload Supabase:", error.message);
                return null;
            }

            const { data } = supabase.storage
                .from("images")
                .getPublicUrl(filePath);

            return data.publicUrl;
        } catch (error) {
            console.error("❌ Erreur dans uploadImageToStorage :", error);
            return null;
        }
    };

    const deletePhoto = (photoUrlToDelete) => {
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
                            const fullPath = photoUrlToDelete.split(
                                "/storage/v1/object/public/"
                            )[1];
                            const path = fullPath.startsWith("images/")
                                ? fullPath.slice(7)
                                : fullPath;

                            console.log("✅ Chemin à supprimer :", path);

                            const { error } = await supabase.storage
                                .from("images")
                                .remove([path]);

                            if (error) {
                                console.error(
                                    "❌ Erreur Supabase lors de la suppression :",
                                    error.message
                                );
                                return;
                            }

                            const updatedPhotos = photos.filter(
                                (photo) => photo !== photoUrlToDelete
                            );
                            setPhotos(updatedPhotos);

                            const { error: updateError } = await supabase
                                .from("interventions")
                                .update({ photos: updatedPhotos })
                                .eq("id", interventionId);

                            if (updateError) {
                                console.error(
                                    "❌ Erreur mise à jour BDD :",
                                    updateError.message
                                );
                            } else {
                                console.log(
                                    "✅ Image supprimée et BDD mise à jour."
                                );
                            }
                        } catch (e) {
                            console.error(
                                "❌ Erreur générale lors de la suppression :",
                                e
                            );
                        }
                    },
                },
            ]
        );
    };
    // Charger la liste des articles
    const loadArticles = async () => {
        const { data, error } = await supabase
            .from("article")
            .select("id, nom");
        if (error) {
            console.error("Erreur lors du chargement des articles :", error);
        } else {
            setArticles(data);
        }
    };

    // Charger les marques en fonction de l'article sélectionné
    const loadBrands = async (selectedArticleId) => {
        const { data, error } = await supabase
            .from("marque")
            .select("id, nom")
            .eq("article_id", selectedArticleId);

        if (error) {
            console.error("Erreur lors du chargement des marques :", error);
        } else {
            setBrands(data);
        }
    };

    // Charger les modèles en fonction de la marque sélectionnée
    const loadModels = async (selectedBrandId) => {
        const { data, error } = await supabase
            .from("modele")
            .select("id, nom")
            .eq("marque_id", selectedBrandId);

        if (error) {
            console.error("Erreur lors du chargement des modèles :", error);
        } else {
            setModels(data);
        }
    };

    const handleDeviceTypeChange = (value) => {
        setDeviceType(value);
        setBrand("");
        setModel("");
        loadBrands(value); // Charger les marques pour l'article sélectionné
    };

    const handleBrandChange = (value) => {
        setBrand(value);
        setModel("");
        loadModels(value); // Charger les modèles pour la marque sélectionnée
    };

    const handleModelChange = (value) => {
        setModel(value);
    };
    // Fonction pour prendre la photo de l'étiquette
    const pickLabelImage = async () => {
        try {
            let result = await ImagePicker.launchCameraAsync({
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

                if (url) {
                    setLabelPhoto(url);
                }
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

                if (url) {
                    setPhotos((prev) => [...prev, url]);
                }
            } else {
                console.log("Aucune image capturée ou opération annulée.");
            }
        } catch (error) {
            console.error("Erreur lors de la capture d'image :", error);
        }
    };

    const handleSaveIntervention = async () => {
        const formattedDevisCost =
            status === "Devis en cours" && devisCost
                ? parseFloat(devisCost)
                : null;
        // Vérifie le coût seulement si le statut n'est pas "Devis en cours"
        if (status !== "Devis en cours" && !cost) {
            Alert.alert(
                "Erreur",
                "Veuillez indiquer le coût de la réparation."
            );
            return;
        }
        // Validation de l'acompte
        if (
            paymentStatus === "reglement_partiel" &&
            (!partialPayment || parseFloat(partialPayment) > parseFloat(cost))
        ) {
            Alert.alert(
                "Erreur",
                "Veuillez indiquer un acompte valide qui ne dépasse pas le montant total."
            );
            return;
        }
        // Calcul du solde restant
        const solderestant =
            paymentStatus === "reglement_partiel"
                ? parseFloat(costValue) - parseFloat(partialPayment || 0)
                : paymentStatus === "solde"
                ? 0
                : parseFloat(costValue);
        const selectedArticle = articles.find(
            (article) => article.id === deviceType
        );
        const selectedBrand = brands.find((b) => b.id === brand);
        const selectedModel = models.find((m) => m.id === model);

        const costValue = parseFloat(cost) || 0;
        const partialPaymentValue = parseFloat(partialPayment) || 0;

        const solderestantValue =
            paymentStatus === "reglement_partiel"
                ? Math.max(costValue - partialPaymentValue, 0)
                : paymentStatus === "solde"
                ? 0
                : costValue;

        console.log(
            "🔄 Mise à jour - Coût:",
            costValue,
            "Acompte:",
            partialPaymentValue,
            "Solde restant:",
            solderestantValue
        );

        const updatedIntervention = {
            deviceType: selectedArticle ? selectedArticle.nom : deviceType,
            article_id: deviceType,
            brand: selectedBrand ? selectedBrand.nom : brand,
            marque_id: brand,
            model: selectedModel ? selectedModel.nom : model,
            modele_id: model,
            reference,
            description,
            cost: costValue,
            solderestant: solderestantValue || 0,
            partialPayment: partialPaymentValue || null,
            status,
            password,
            serial_number,
            photos: photos,
            commande,
            remarks,
            paymentStatus,
            chargeur: chargeur === "Oui",
            accept_screen_risk: acceptScreenRisk,
            label_photo: labelPhoto,
            updatedAt: new Date().toISOString(),
        };

        if (status === "Devis en cours") {
            updatedIntervention.devis_cost = formattedDevisCost;
        }
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
            console.error(
                "Erreur lors de la mise à jour de l'intervention :",
                error
            );
        }
    };

    const closeAlert = () => {
        setAlertVisible(false);
        if (alertTitle === "Succès") {
            navigation.goBack();
        }
    };

    const handleImagePress = (imageUri) => {
        setSelectedImage(imageUri);
    };
    useEffect(() => {
        if (status === "Devis accepté" && devisCost && !cost) {
            console.log(
                "🔄 Transfert du montant du devis vers coût de réparation"
            );
            setCost(devisCost);
        }
    }, [status, devisCost]);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
            keyboardVerticalOffset={0}
        >
            {clientName && (
                <Text style={styles.clientName}>{`Client: ${clientName}`}</Text>
            )}
            <ScrollView>
                <Text style={styles.label}>Type de produit</Text>
                <Picker
                    selectedValue={deviceType}
                    style={styles.input}
                    onValueChange={handleDeviceTypeChange}
                >
                    <Picker.Item
                        label="Sélectionnez un type de produit..."
                        value=""
                    />
                    {articles.map((article) => (
                        <Picker.Item
                            key={article.id}
                            label={article.nom}
                            value={article.id}
                        />
                    ))}
                </Picker>
                {deviceType === "Autre" && (
                    <TextInput
                        style={styles.autreInput}
                        placeholder="Entrez le type de produit"
                        value={customDeviceType}
                        onChangeText={setCustomDeviceType}
                    />
                )}

                <View style={styles.rowContainer}>
                    <View style={styles.halfWidthContainer}>
                        <Text style={styles.label}>Marque du produit</Text>
                        <Picker
                            selectedValue={brand}
                            style={styles.input}
                            onValueChange={handleBrandChange}
                        >
                            <Picker.Item
                                label="Sélectionnez une marque..."
                                value=""
                            />
                            {brands.map((brandOption) => (
                                <Picker.Item
                                    key={brandOption.id}
                                    label={brandOption.nom}
                                    value={brandOption.id}
                                />
                            ))}
                        </Picker>
                        {brand === "Autre" && (
                            <TextInput
                                style={styles.autreInput}
                                placeholder="Entrez la marque"
                                value={customBrand}
                                onChangeText={setCustomBrand}
                            />
                        )}
                    </View>

                    <View style={styles.halfWidthContainer}>
                        <Text style={styles.label}>Modèle du produit</Text>
                        {models.length > 0 ? (
                            <Picker
                                selectedValue={model}
                                style={styles.input}
                                onValueChange={handleModelChange}
                            >
                                <Picker.Item
                                    label="Sélectionnez un modèle..."
                                    value=""
                                />
                                {models.map((modelOption) => (
                                    <Picker.Item
                                        key={modelOption.id}
                                        label={modelOption.nom}
                                        value={modelOption.id}
                                    />
                                ))}
                            </Picker>
                        ) : (
                            <TextInput
                                style={styles.input}
                                placeholder="Entrez le modèle"
                                value={model}
                                onChangeText={(text) =>
                                    setModel(text.toUpperCase())
                                }
                            />
                        )}
                        {model === "Autre" && (
                            <TextInput
                                style={styles.autreInput}
                                placeholder="Entrez le modèle"
                                value={customModel}
                                onChangeText={setCustomModel}
                            />
                        )}
                    </View>
                </View>

                <View style={styles.referenceContainer}>
                    <TextInput
                        style={styles.referenceInput}
                        value={reference.toUpperCase()} // Afficher en majuscules
                        onChangeText={(text) =>
                            setReference(text.toUpperCase())
                        } // Forcer la saisie en majuscules
                        autoCapitalize="characters" // Forcer la saisie en majuscules
                        placeholderTextColor="#d1d0d0"
                        placeholder="Référence du produit"
                    />
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10,  alignSelf: "center" }}>
					<TouchableOpacity style={styles.buttonLabel} onPress={pickLabelImage}>
						<Text style={styles.buttonTextLabel}>
							Prendre une photo de l'étiquette
						</Text>
						<Image
							source={require("../assets/icons/photo1.png")}
							style={[styles.iconRight, { tintColor: "#ececec" }]}
						/>
					</TouchableOpacity>

					<TouchableOpacity onPress={() => setSelectedImage(labelPhoto)}>
						<Image
							source={{ uri: labelPhoto }}
							style={{
								width: 60,
								height: 60,
								borderWidth: 2,
								borderColor: "green",
								marginLeft: 10,
								borderRadius: 5,
							}}
						/>
					</TouchableOpacity>
				</View>


                <Text style={styles.label}>Description de la panne</Text>
                <TextInput
                    style={styles.input}
                    value={description.toUpperCase()} // Afficher en majuscules
                    onChangeText={(text) => setDescription(text.toUpperCase())} // Forcer la saisie en majuscules
                    multiline
                    autoCapitalize="characters" // Forcer la saisie en majuscules
                />

                <Text style={styles.label}>Mot de passe (si applicable)</Text>
                <TextInput
                    style={styles.input}
                    value={password} // Pas de transformation en majuscules
                    onChangeText={setPassword} // Pas de forçage en majuscules
                />

                <Text style={styles.label}>Coût de la réparation (€)</Text>
                <TextInput
                    style={styles.input}
                    value={cost ? cost.toString() : ""}
                    onChangeText={setCost}
                    keyboardType="numeric"
                    editable={status !== "Devis en cours"} // Désactiver si "Devis en cours" est sélectionné
                    placeholder={
                        status === "Devis en cours"
                            ? "Indisponible en mode Devis"
                            : "Entrez le coût"
                    }
                />

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
                                            tintColor: "#007bff", // 🔵 bleu pour acceptScreenRisk
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
                            <Text style={styles.checkboxLabel}>Non réglé</Text>
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
                    <>
                        <Text style={styles.label}>Acompte (€)</Text>
                        <TextInput
                            style={styles.input}
                            value={
                                partialPayment ? partialPayment.toString() : ""
                            }
                            onChangeText={setPartialPayment}
                            keyboardType="numeric"
                            placeholder="Entrez l'acompte"
                        />
                        <Text style={styles.interventionText}>
                            Solde restant dû : {solderestant.toFixed(2)} €
                        </Text>
                    </>
                )}

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
                                    setCost(""); // Efface le coût si "Devis en cours" est sélectionné
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
                                label="Réparation en cours"
                                value="Réparation en cours"
                            />
                            <Picker.Item label="Réparé" value="Réparé" />
                            <Picker.Item
                                label="Non réparable"
                                value="Non réparable"
                            />
                        </Picker>
                        <Text style={styles.label}>
                            Montant du devis (si besoin)
                        </Text>
                        {status === "Devis en cours" && (
                            <TextInput
                                style={styles.input}
                                placeholder="Montant du devis (€)"
                                placeholderTextColor="#000000"
                                keyboardType="numeric"
                                value={devisCost}
                                onChangeText={(text) => setDevisCost(text)}
                            />
                        )}
                    </View>
                    {status === "En attente de pièces" && (
                        <View style={styles.halfWidthContainer}>
                            <Text style={styles.label}>Commande</Text>
                            <TextInput
                                style={styles.input}
                                value={commande.toUpperCase()} // Afficher en majuscules
                                onChangeText={(text) =>
                                    setCommande(text.toUpperCase())
                                } // Forcer la saisie en majuscules
                                autoCapitalize="characters" // Forcer la saisie en majuscules
                            />
                        </View>
                    )}
                </View>
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
                    onValueChange={(itemValue) => setChargeur(itemValue)}
                >
                    <Picker.Item label="Non" value="Non" />
                    <Picker.Item label="Oui" value="Oui" />
                </Picker>

                {/* Affichage des images capturées */}
                {photos.length > 0 && (
                    <View
                        style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            justifyContent: "center",
                        }}
                    >
                        {photos.map((photo, index) => (
                            <View key={index}>
                                <TouchableOpacity
                                    onPress={() => setSelectedImage(photo)}
                                >
                                    <Image
                                        source={{ uri: photo }}
                                        style={{
                                            width: 100,
                                            height: 100,
                                            margin: 5,
                                            borderRadius: 10,
                                            borderColor: "#aaaaaa",
                                            borderWidth: 2,
                                        }}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={{
                                        position: "absolute",
                                        top: 5,
                                        right: 5,
                                    }}
                                    onPress={() => deletePhoto(photo)}
                                >
                                    <Text
                                        style={{
                                            color: "red",
                                            fontWeight: "bold",
                                        }}
                                    >
                                        X
                                    </Text>
                                </TouchableOpacity>
                            </View>
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
                        <Image
                            source={require("../assets/icons/photo1.png")} // Chemin vers votre image
                            style={[
                                styles.checkIcon,
                                {
                                    width: 22,
                                    height: 22,
                                    tintColor: "#888787",
                                    marginRight: 10,
                                },
                            ]} // Personnalisation de l'image
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
                            source={require("../assets/icons/save.png")} // Chemin vers votre image
                            style={[
                                styles.checkIcon,
                                {
                                    width: 20,
                                    height: 20,
                                    tintColor: "#888787",
                                    marginRight: 10,
                                },
                            ]} // Personnalisation de l'image
                        />
                        <Text style={styles.buttonText}>
                            Sauvegarder l'intervention
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

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
		height: 50, 
        borderWidth: 1,
        borderColor: "#585858",
        padding: 10,
        marginBottom: 20,
        borderRadius: 5,
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
        justifyContent: "space-between",
        width: "90%",
        alignSelf: "center",
    },
    referenceInput: {
        borderWidth: 1,
        borderColor: "#888787",
        padding: 10,
        borderRadius: 2,
        backgroundColor: "#cacaca",
        width: "100%",
        fontSize: 16,
        fontWeight: "medium",
        marginBottom: 5,
        color: "#242424",
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
        borderWidth: 1,
        borderRadius: 5,
        borderColor: "#444444",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        alignSelf: "center",
        marginTop: 20,
        marginBottom: 20,
        elevation: 2,
    },
    buttonText: {
        color: "#cfcdcd",
        fontWeight: "medium",
    },
    saveButton: {
        backgroundColor: "#0c0f18",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderWidth: 1,
        borderRadius: 5,
        borderColor: "#444444",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        alignSelf: "center",
        marginTop: 20,
        marginBottom: 20,
        elevation: 2,
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
    interventionText: {
        fontSize: 16,
        color: "#ff4500", // Rouge orangé pour attirer l'attention
        fontWeight: "medium",
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
    flexShrink: 1, // évite que le bouton déborde
},
iconRight: {
    width: 41,
    height: 41,
},
buttonTextLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
    marginRight: 8,
},
});
