import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Image,
    ImageBackground,
    Modal,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
    ScrollView,
} from "react-native";
import { supabase } from "../supabaseClient";
import { useFocusEffect } from "@react-navigation/native";
import CustomAlert from "../components/CustomAlert";
import Ionicons from "react-native-vector-icons/Ionicons";

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import BottomNavigation from "../components/BottomNavigation";
import * as ImageManipulator from "expo-image-manipulator";
import * as Animatable from "react-native-animatable";
const backgroundImage = require("../assets/listing2.jpg");
ScrollView.defaultProps = { showsVerticalScrollIndicator: false };
FlatList.defaultProps = { showsVerticalScrollIndicator: false };
export default function RepairedInterventionsPage({ navigation, route }) {
    const repairedInterventionsRef = useRef(null); // Créez une référence
    const [repairedInterventions, setRepairedInterventions] = useState([]);
    const [editingDetail, setEditingDetail] = useState({});
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [isSaved, setIsSaved] = useState({});
    const [notifyModalVisible, setNotifyModalVisible] = useState(false);
    const [selectedInterventionId, setSelectedInterventionId] = useState(null);
    const [photoAlertVisible, setPhotoAlertVisible] = useState(false);
	const [noPhotoRequired, setNoPhotoRequired] = useState({});

    const [pinnedInterventionId, setPinnedInterventionId] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [expandedCards, setExpandedCards] = useState({});
    const [repairedTotal, setRepairedTotal] = useState(0); // Montant total des interventions "Réparé"
    const [currentPage, setCurrentPage] = useState(1); // Page actuelle
    const itemsPerPage = 4; // Nombre d'éléments par page
    const sortedInterventions = repairedInterventions.sort((a, b) => {
        if (a.id === pinnedInterventionId) return -1; // La fiche épinglée est toujours en haut
        if (b.id === pinnedInterventionId) return 1;
        return 0; // Conserve l'ordre des autres fiches
    });
    const getPaginatedData = () => {
        if (!repairedInterventions || repairedInterventions.length === 0) {
            return []; // Retourne un tableau vide si aucune donnée
        }
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return repairedInterventions.slice(startIndex, endIndex);
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage); // Met à jour la page actuelle
        }
    };

    // Calculer le nombre total de pages
    const totalPages = Math.ceil(repairedInterventions.length / itemsPerPage);
    const loadRepairedInterventions = async () => {
        try {
            const { data, error } = await supabase
                .from("interventions")
                .select(
                    `
					*,
					clients (phone, name, ficheNumber)
					`
                )
                .in("status", ["Réparé", "Non réparable"]); // Inclure les deux statuts

            if (error) throw error;

            const { data: imagesData, error: imagesError } = await supabase
                .from("intervention_images")
                .select("*");

            if (imagesError) throw imagesError;

            const interventionsWithImages = data.map((intervention) => {
                const images = imagesData.filter(
                    (image) => image.intervention_id === intervention.id
                );
                return { ...intervention, intervention_images: images };
            });

            // Calcul du montant total des interventions "Réparé"
            const total = interventionsWithImages.reduce(
                (sum, intervention) => sum + (intervention.cost || 0),
                0
            );
            setRepairedTotal(total); // Met à jour le montant total

            setRepairedInterventions(interventionsWithImages);

            const savedStatus = {};
            interventionsWithImages.forEach((intervention) => {
                savedStatus[intervention.id] =
                    intervention.detailIntervention &&
                    intervention.detailIntervention.trim() !== "";
            });
            setIsSaved(savedStatus);
        } catch (error) {
            console.error(
                "Erreur lors du chargement des interventions réparées :",
                error
            );
        }
    };

    const deleteImage = async (imageId, interventionId) => {
        try {
            const { error } = await supabase
                .from("intervention_images")
                .delete()
                .eq("id", imageId);

            if (error) throw error;

            // Recharge les images après suppression
            await loadRepairedInterventions();

            setAlertMessage("Image supprimée avec succès.");
            setAlertVisible(true);
        } catch (error) {
            console.error("Erreur lors de la suppression de l'image :", error);
            setAlertMessage("Erreur lors de la suppression de l'image.");
            setAlertVisible(true);
        }
    };

    const saveDetailIntervention = async (id) => {
        const detail = editingDetail[id];
        if (!detail || detail.trim() === "") {
            setAlertMessage('Le champ "Détails de l\'intervention" est vide.');
            setAlertVisible(true);
            return;
        }
        try {
            const { error } = await supabase
                .from("interventions")
                .update({ detailIntervention: detail })
                .eq("id", id);

            if (error) throw error;

            setAlertMessage("Détails sauvegardés avec succès.");
            setAlertVisible(true);
            setIsSaved((prevState) => ({ ...prevState, [id]: true }));

            // Recharger les interventions et maintenir la fiche épinglée
            await loadRepairedInterventions();
        } catch (error) {
            console.error("Erreur lors de la sauvegarde des détails :", error);
        }
    };

    const updateClientNotification = async (selectedInterventionId, method) => {
        try {
            const { error } = await supabase
                .from("interventions")
                .update({ notifiedBy: method })
                .eq("id", selectedInterventionId);

            if (error) {
                console.error(
                    "Erreur lors de la mise à jour de la notification :",
                    error
                );
                return;
            }

            await loadRepairedInterventions();
            setNotifyModalVisible(false);
        } catch (error) {
            console.error(
                "Erreur lors de la mise à jour de la notification :",
                error
            );
        }
    };

    const takePhoto = async (interventionId) => {
        try {
            const { status } =
                await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
                alert(
                    "Nous avons besoin de votre permission pour accéder à la caméra."
                );
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.7, // Qualité initiale
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const imageUri = result.assets[0].uri;

                // Compression de l'image
                const compressedImage = await ImageManipulator.manipulateAsync(
                    imageUri,
                    [{ resize: { width: 800 } }], // Redimensionne à une largeur maximale de 800px
                    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG } // Compression à 70% en JPEG
                );

                const base64Image = await convertImageToBase64(
                    compressedImage.uri
                );

                if (base64Image) {
                    await saveImage(interventionId, base64Image);
                    await loadRepairedInterventions(); // Recharge les données après l'envoi
                }
            } else {
                alert(
                    "La photo n'a pas été prise correctement ou l'opération a été annulée."
                );
            }
        } catch (error) {
            console.error("Erreur lors de la prise de photo :", error);
        }
    };

    const convertImageToBase64 = async (uri) => {
        try {
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: FileSystem.EncodingType.Base64,
            });
            return base64;
        } catch (error) {
            console.error(
                "Erreur lors de la conversion de l'image en base64 :",
                error
            );
            return null;
        }
    };

    const saveImage = async (interventionId, base64Image) => {
        try {
            const { error } = await supabase
                .from("intervention_images")
                .insert([
                    {
                        intervention_id: interventionId,
                        image_data: base64Image,
                    },
                ]);

            if (error) throw error;

            setAlertMessage("Photo sauvegardée avec succès.");
            setAlertVisible(true);
        } catch (error) {
            console.error("Erreur lors de la sauvegarde de l'image :", error);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadRepairedInterventions();
        }, [])
    );

    const closeAlert = () => {
        setAlertVisible(false);
    };
	const handleRestitution = (intervention) => {
		if (
			!intervention.intervention_images ||
			intervention.intervention_images.length === 0
		) {
			if (!noPhotoRequired[intervention.id]) {
				setPhotoAlertVisible(true); // Affiche l'alerte si aucune photo n'est trouvée
				return;
			}
		}
		navigation.navigate("SignaturePage", {
			interventionId: intervention.id,
			clientId: intervention.client_id,
		});
	};
	
    const moveToTop = (interventionId) => {
        setPinnedInterventionId(interventionId); // Met à jour l'ID de la fiche épinglée

        // Utilisez scrollToIndex pour repositionner l'affichage sur la première fiche
        setTimeout(() => {
            repairedInterventionsRef.current?.scrollToIndex({
                index: 0, // Index de la première fiche
                animated: true, // Ajoute une animation pour le défilement
            });
        }, 0); // Timeout court pour s'assurer que l'état est mis à jour avant l'appel
    };
    const openImageModal = (imageUri, imageId, interventionId) => {
        setSelectedImage({ uri: imageUri, id: imageId, interventionId });
        setIsModalVisible(true);
    };

    const closeImageModal = () => {
        setSelectedImage(null);
        setIsModalVisible(false);
    };
    setTimeout(() => {
        if (repairedInterventions.length > 0) {
            repairedInterventionsRef.current?.scrollToIndex({
                index: 0,
                animated: true,
            });
        }
    }, 0);
    // Basculer l'état d'affichage des détails
    const toggleDetails = (id) => {
        setExpandedCards((prev) => ({
            ...prev,
            [id]: !prev[id], // Change l'état d'expansion de la fiche sélectionnée
        }));
    };
    const flatListRef = useRef(null);
    return (

            <ImageBackground
                source={backgroundImage}
                style={styles.backgroundImage}
            >
                <View style={styles.overlay}>
                    <Text style={styles.title}>Interventions terminées</Text>
                    <View style={styles.totalContainer}>
                        <Text style={styles.totalText}>
                            Montant total des interventions Réparées :{" "}
                            {repairedTotal.toFixed(2)} €
                        </Text>
                    </View>
                    <FlatList
                        ref={flatListRef}
                        data={getPaginatedData()} // Interventions paginées
                        keyExtractor={(item) => item.id.toString()}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled" // Empêche le clavier de se fermer
                        contentContainerStyle={{ paddingBottom: 100 }} // Espace sous la liste
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.interventionCard} // Style pour la carte
                                onPress={() => toggleDetails(item.id)} // Action au clic sur la fiche
                            >
                                <View
                                    style={[
                                        styles.interventionCard,
                                        item.status === "Non réparable"
                                            ? {
                                                  backgroundColor: "#dbd9d9", // Couleur de fond pour "Non réparable"
                                                  borderWidth: 2, // Épaisseur de la bordure
                                                  borderColor: "red", // Couleur rouge pour la bordure
                                              }
                                            : {},
                                    ]}
                                >
                                    <TouchableOpacity
                                        style={styles.moveToTopButton}
                                        onPress={() => moveToTop(item.id)}
                                    >
                                        <Image
                                            source={require("../assets/icons/chevron.png")} // Chemin vers votre image de flèche
                                            style={{
                                                width: 40, // Largeur de l'image
                                                height: 40, // Hauteur de l'image
                                                tintColor: "#191f2f", // Applique la couleur bleue
                                            }}
                                        />
                                    </TouchableOpacity>
                                    <View
                                        style={
                                            styles.notificationAndToolsContainer
                                        }
                                    >
                                        <TouchableOpacity
                                            style={styles.iconStyle}
                                            onPress={() => {
                                                setSelectedInterventionId(
                                                    item.id
                                                );
                                                setNotifyModalVisible(true);
                                            }}
                                        >
                                            <Image
                                                source={
                                                    item?.notifiedBy === "SMS"
                                                        ? require("../assets/icons/sms.png")
                                                        : item?.notifiedBy ===
                                                          "Téléphone"
                                                        ? require("../assets/icons/call.png")
                                                        : require("../assets/icons/notifications_off.png")
                                                }
                                                style={{
                                                    width: 40, // Largeur de l'image
                                                    height: 40, // Hauteur de l'image
                                                    tintColor: item?.notifiedBy
                                                        ? "#00ff37"
                                                        : "gray", // Applique la couleur dynamique
                                                }}
                                            />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={styles.iconStyle}
                                            onPress={() => takePhoto(item.id)}
                                        >
                                            <Image
                                                source={
                                                    item?.intervention_images
                                                        ?.length > 0
                                                        ? require("../assets/icons/photo_ok.png") // Icône pour photo prise
                                                        : require("../assets/icons/photo.png") // Icône par défaut
                                                }
                                                style={{
                                                    width: 40, // Largeur de l'image
                                                    height: 40, // Hauteur de l'image
                                                    tintColor:
                                                        item
                                                            ?.intervention_images
                                                            ?.length > 0
                                                            ? "#5d9cfa"
                                                            : "black", // Bleu si photo présente, sinon noir
                                                }}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.infoContainer}>
                                        <Text
                                            style={styles.interventionTextBold}
                                        >
                                            Fiche N° :{" "}
                                            {item.clients.ficheNumber}
                                        </Text>
                                        <Text
                                            style={styles.interventionTextBold}
                                        >
                                            Client : {item.clients.name}
                                        </Text>
                                        <Text
                                            style={styles.interventionTextBold}
                                        >
                                            Tel :{" "}
                                            {item.clients.phone
                                                ? item.clients.phone.replace(
                                                      /(\d{2})(?=\d)/g,
                                                      "$1 "
                                                  )
                                                : "Téléphone non disponible"}
                                        </Text>

                                        <Text style={styles.interventionText}>
                                            Type d'appareil: {item.deviceType}
                                        </Text>
                                        <Text style={styles.interventionText}>
                                            Marque: {item.brand}
                                        </Text>
                                        {/* <TouchableOpacity
                                        style={styles.toggleButton}
                                        onPress={() => toggleDetails(item.id)}
                                    >
                                        <Text style={styles.toggleButtonText}>
                                            {expandedCards[item.id]
                                                ? "Masquer les détails"
                                                : "Afficher les détails"}
                                        </Text>
                                        <Ionicons
                                            name={
                                                expandedCards[item.id]
                                                    ? "chevron-up"
                                                    : "chevron-down"
                                            }
                                            size={20}
                                            color="#817f7f"
                                        />
                                    </TouchableOpacity> */}

                                        {/* Détails masqués ou affichés avec animation */}
                                        {expandedCards[item.id] && (
                                            <Animatable.View
                                                animation="slideInDown" // Animation pour afficher les détails
                                                duration={500} // Durée de l'animation
                                                style={styles.cardDetails}
                                            >
                                                <Text
                                                    style={
                                                        styles.interventionText
                                                    }
                                                >
                                                    Modèle: {item.model}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.interventionText
                                                    }
                                                >
                                                    Numéro de série:{" "}
                                                    {item.serial_number}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.interventionText
                                                    }
                                                >
                                                    Référence: {item.reference}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.interventionText
                                                    }
                                                >
                                                    Description du problème:{" "}
                                                    {item.description}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.interventionText
                                                    }
                                                >
                                                    Chargeur:{" "}
                                                    {item.chargeur
                                                        ? "Oui"
                                                        : "Non"}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.interventionTextBold
                                                    }
                                                >
                                                    Coût: {item.cost} €
                                                </Text>

                                                <Text
                                                    style={[
                                                        styles.interventionText,
                                                        item.paymentStatus ===
                                                        "solde"
                                                            ? styles.interventionTextSolde
                                                            : styles.interventionTextNon,
                                                    ]}
                                                >
                                                    Etat du règlement:{" "}
                                                    {item.paymentStatus}
                                                </Text>
                                                {item.paymentStatus ===
                                                    "reglement_partiel" &&
                                                    item.partialPayment && (
                                                        <Text
                                                            style={
                                                                styles.interventionText
                                                            }
                                                        >
                                                            Acompte de:{" "}
                                                            {
                                                                item.partialPayment
                                                            }{" "}
                                                            €
                                                        </Text>
                                                    )}
                                                <Text
                                                    style={
                                                        styles.interventionTextReste
                                                    }
                                                >
                                                    Montant restant dû:{" "}
                                                    {item.solderestant}€
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.interventionText
                                                    }
                                                >
                                                    Statut: {item.status}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.interventionText
                                                    }
                                                >
                                                    Commande: {item.commande}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.interventionText
                                                    }
                                                >
                                                    Date:{" "}
                                                    {new Date(
                                                        item.createdAt
                                                    ).toLocaleDateString(
                                                        "fr-FR"
                                                    )}
                                                </Text>

												<TextInput
													style={styles.detailInput}
													placeholderTextColor="#888787"
													placeholder="Entrez les détails ici..."
													onFocus={() => {
														setTimeout(() => {
															const globalIndex = repairedInterventions.findIndex(
																(i) => i.id === item.id
															);
															const localIndex =
																globalIndex - (currentPage - 1) * itemsPerPage;

															if (localIndex >= 0 && localIndex < itemsPerPage) {
																flatListRef.current.scrollToIndex({
																	index: localIndex,
																	animated: true,
																});
															} else {
																console.warn("Index invalide sur cette page :", localIndex);
															}
														}, 100); // Petit délai pour garantir le bon affichage
													}}
													value={editingDetail[item.id] || ""}
													onChangeText={(text) =>
														setEditingDetail({
															...editingDetail,
															[item.id]: text,
														})
													}
												/>

												<View style={styles.buttonContainer}>
													<TouchableOpacity
														style={[
															styles.saveButton,
															{
																borderWidth: 1, // Ajout d'une bordure
																borderColor:
																	editingDetail[item.id] &&
																	editingDetail[item.id].trim() !== ""
																		? "#28a745" // Vert si du texte est présent
																		: "#888787", // Gris sinon
																borderRadius: 2, // Coins arrondis pour un meilleur rendu
																padding: 10, // Ajout d'un padding pour un meilleur affichage
															},
														]}
														onPress={() => saveDetailIntervention(item.id)}
													>
														<Image
															source={require("../assets/icons/save.png")} // Chemin vers l'image "save"
															style={[
																styles.buttonIcon,
																{
																	width: 20,
																	height: 20,
																	tintColor: "#888787",
																},
															]}
														/>

														<Text style={styles.buttonText}>Sauvegarder les détails</Text>
													</TouchableOpacity>

                                                    <TouchableOpacity
                                                        style={[
                                                            styles.restitutionButton,
                                                            !isSaved[item.id] ||
                                                            (!editingDetail[
                                                                item.id
                                                            ] &&
                                                                !item.detailIntervention) ||
                                                            item.paymentStatus ===
                                                                "non_regle" // Désactiver si le paiement n'est pas réglé
                                                                ? styles.disabledButton
                                                                : null,
                                                        ]}
                                                        onPress={() =>
                                                            handleRestitution(
                                                                item
                                                            )
                                                        }
                                                        disabled={
                                                            !isSaved[item.id] ||
                                                            (!editingDetail[
                                                                item.id
                                                            ] &&
                                                                !item.detailIntervention) ||
                                                            item.paymentStatus ===
                                                                "non_regle" // Désactiver si le paiement n'est pas réglé
                                                        }
                                                    >
                                                        <Image
                                                            source={require("../assets/icons/ok.png")} // Chemin vers l'image "save"
                                                            style={[
                                                                styles.buttonIcon, // Styles existants
                                                                {
                                                                    width: 20, // Largeur de l'image
                                                                    height: 20, // Hauteur de l'image
                                                                    tintColor:
                                                                        "#888787", // Couleur de l'image (noir foncé ici)
                                                                },
                                                            ]}
                                                        />

                                                        <Text
                                                            style={
                                                                styles.buttonText
                                                            }
                                                        >
                                                            Restitution
                                                        </Text>
                                                    </TouchableOpacity>

                                                    <TouchableOpacity
                                                        style={
                                                            styles.editButton
                                                        }
                                                        onPress={() =>
                                                            navigation.navigate(
                                                                "EditIntervention",
                                                                {
                                                                    interventionId:
                                                                        item.id,
                                                                    clientId:
                                                                        item.client_id,
                                                                }
                                                            )
                                                        }
                                                    >
                                                        <Image
                                                            source={require("../assets/icons/edit.png")} // Chemin vers l'image "save"
                                                            style={[
                                                                styles.buttonIcon, // Styles existants
                                                                {
                                                                    width: 20, // Largeur de l'image
                                                                    height: 20, // Hauteur de l'image
                                                                    tintColor:
                                                                        "#888787", // Couleur de l'image (noir foncé ici)
                                                                },
                                                            ]}
                                                        />

                                                        <Text
                                                            style={
                                                                styles.buttonText
                                                            }
                                                        >
                                                            Éditer la fiche
                                                        </Text>
                                                    </TouchableOpacity>
                                                </View>

                                                {item.intervention_images &&
                                                    item.intervention_images
                                                        .length > 0 && (
                                                        <View
                                                            style={
                                                                styles.imageContainer
                                                            }
                                                        >
                                                            {item.intervention_images.map(
                                                                (
                                                                    image,
                                                                    index
                                                                ) => (
                                                                    <View
                                                                        key={
                                                                            index
                                                                        }
                                                                        style={
                                                                            styles.imageWrapper
                                                                        }
                                                                    >
                                                                        <TouchableOpacity
                                                                            onPress={() =>
                                                                                openImageModal(
                                                                                    `data:image/jpeg;base64,${image.image_data}`,
                                                                                    image.id,
                                                                                    item.id
                                                                                )
                                                                            }
                                                                        >
                                                                            <Image
                                                                                source={{
                                                                                    uri: `data:image/jpeg;base64,${image.image_data}`,
                                                                                }}
                                                                                style={
                                                                                    styles.imageThumbnail
                                                                                }
                                                                            />
                                                                        </TouchableOpacity>
                                                                        <TouchableOpacity
                                                                            style={
                                                                                styles.deleteIcon
                                                                            }
                                                                            onPress={() =>
                                                                                deleteImage(
                                                                                    image.id,
                                                                                    item.id
                                                                                )
                                                                            }
                                                                        >
                                                                            <Image
                                                                                source={require("../assets/icons/trash.png")} // Chemin vers l'image de corbeille
                                                                                style={{
                                                                                    width: 20, // Largeur de l'image
                                                                                    height: 20, // Hauteur de l'image
                                                                                    tintColor:
                                                                                        "red", // Applique la couleur rouge
                                                                                }}
                                                                            />
                                                                        </TouchableOpacity>
                                                                    </View>
                                                                )
                                                            )}
                                                        </View>
                                                    )}
                                            </Animatable.View>
                                        )}
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                    />

                    <View style={styles.paginationContainer}>
                        {/* Bouton pour aller à la page précédente */}
                        <TouchableOpacity
                            onPress={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            style={styles.chevronButton}
                        >
                            <Image
                                source={require("../assets/icons/chevrong.png")} // Icône pour chevron gauche
                                style={[
                                    styles.chevronIcon,
                                    {
                                        tintColor:
                                            currentPage === 1
                                                ? "gray"
                                                : "white",
                                    },
                                ]}
                            />
                        </TouchableOpacity>

                        {/* Numéro de page au centre */}
                        <Text style={styles.paginationText}>
                            Page {currentPage} sur {totalPages}
                        </Text>

                        {/* Bouton pour aller à la page suivante */}
                        <TouchableOpacity
                            onPress={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            style={styles.chevronButton}
                        >
                            <Image
                                source={require("../assets/icons/chevrond.png")} // Icône pour chevron droit
                                style={[
                                    styles.chevronIcon,
                                    {
                                        tintColor:
                                            currentPage === totalPages
                                                ? "gray"
                                                : "white",
                                    },
                                ]}
                            />
                        </TouchableOpacity>
                    </View>
                </View>
                <BottomNavigation
                    navigation={navigation}
                    currentRoute={route.name}
                />
                <Modal
                    visible={isModalVisible}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={closeImageModal}
                >
                    <View style={styles.modalOverlay}>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={closeImageModal}
                        >
                            <Ionicons
                                name="close-circle"
                                size={40}
                                color="white"
                            />
                        </TouchableOpacity>
                        {selectedImage && (
                            <>
                                <Image
                                    source={{ uri: selectedImage.uri }}
                                    style={styles.fullscreenImage}
                                />
                                <TouchableOpacity
                                    style={styles.deleteButton}
                                    onPress={() => {
                                        deleteImage(
                                            selectedImage.id,
                                            selectedImage.interventionId
                                        );
                                        closeImageModal();
                                    }}
                                >
                                    <Ionicons
                                        name="trash"
                                        size={30}
                                        color="white"
                                    />
                                    <Text style={styles.deleteButtonText}>
                                        Supprimer
                                    </Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </Modal>

				<Modal
    transparent={true}
    visible={photoAlertVisible}
    animationType="fade"
    onRequestClose={() => setPhotoAlertVisible(false)}
>
    <View style={styles.modalOverlay}>
        <View style={styles.alertBox}>
            <Text style={styles.alertTitle}>Aucune photo prise</Text>
            <Text style={styles.alertMessage}>
                Veuillez prendre une photo avant de procéder à la restitution.
            </Text>
            <TouchableOpacity
                style={styles.button}
                onPress={() => setPhotoAlertVisible(false)}
            >
                <Text style={styles.buttonTextSms}>OK</Text>
            </TouchableOpacity>

      
			<TouchableOpacity
    style={[styles.button, { backgroundColor: "gray", marginTop: 10 }]}
    onPress={() => {
        setNoPhotoRequired((prev) => ({
            ...prev,
            [selectedInterventionId]: true, // Marque l'intervention comme "Pas de photo nécessaire"
        }));
        setPhotoAlertVisible(false); // Ferme la modale
        
        // Redirection immédiate vers SignaturePage
        const intervention = repairedInterventions.find(
            (item) => item.id === selectedInterventionId
        );

        if (intervention) {
            navigation.navigate("SignaturePage", {
                interventionId: intervention.id,
                clientId: intervention.client_id,
            });
        }
    }}
>
    <Text style={styles.buttonTextSms}>Pas de photo nécessaire</Text>
</TouchableOpacity>

        </View>
    </View>
</Modal>

                <Modal
                    transparent={true}
                    visible={notifyModalVisible}
                    animationType="fade"
                    onRequestClose={() => setNotifyModalVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.alertBox}>
                            <Text style={styles.alertTitle}>
                                Notifier le client
                            </Text>
                            <View style={styles.modalButtonRow}>
                                <TouchableOpacity
                                    style={styles.button}
                                    onPress={() =>
                                        updateClientNotification(
                                            selectedInterventionId,
                                            "SMS"
                                        )
                                    }
                                >
                                    <Text style={styles.buttonTextSms}>
                                        SMS
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.button}
                                    onPress={() =>
                                        updateClientNotification(
                                            selectedInterventionId,
                                            "Téléphone"
                                        )
                                    }
                                >
                                    <Text style={styles.buttonTextSms}>
                                        Téléphone
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.button}
                                    onPress={() => setNotifyModalVisible(false)}
                                >
                                    <Text style={styles.buttonTextSms}>
                                        Annuler
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {alertVisible && (
                    <CustomAlert
                        title="Alerte"
                        message={alertMessage}
                        onClose={closeAlert}
                    />
                )}
            </ImageBackground>
       
    );
}

const styles = StyleSheet.create({
    backgroundImage: {
        flex: 1,
        resizeMode: "cover",
    },
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.199)",
        padding: 5,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
        color: "#888787",
    },
    interventionCard: {
        padding: 15,
        marginBottom: 10,
        backgroundColor: "#191f2f",
        borderRadius: 2,
		borderWidth: 1,
		borderColor: "#888787",
    },
    notificationAndToolsContainer: {
        zIndex: 1,
        position: "absolute",
        top: 20,
        right: 100,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 15,
    },
    iconStyle: {
        padding: 10,
        borderWidth: 1,
        borderRadius: 2,
        borderColor: "#888787",
        backgroundColor: "#191f2f",
        marginHorizontal: 5,
    },
    infoContainer: {
        marginTop: 10,
    },
    interventionText: {
        fontSize: 18,
        color: "#888787",
        marginBottom: 5,
    },
    interventionTextBold: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#888787",
        marginBottom: 5,
    },
    interventionTextNon: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#888787",
        marginBottom: 5,
    },
    interventionTextReste: {
        fontSize: 20,
        color: "#888787",
        marginBottom: 5, // Ajoute un espacement entre les lignes
    },
    detailInput: {
        borderColor: "#888787",
        borderWidth: 1,
        padding: 10,
        borderRadius: 2,
        backgroundColor: "#191f2f",
        marginBottom: 10,
        color: "#b6b4b4",
        fontSize: 16,
    },
    buttonContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 10,
    },
    saveButton: {
        backgroundColor: "#191f2f",
        padding: 5,
        alignItems: "center",
        borderRadius: 2,
		borderWidth: 1,
		borderColor: "#888787",
        flexDirection: "row",
        marginRight: 5,
        elevation: 5,
        width: "33%",
    },
    restitutionButton: {
        flexDirection: "row", // Aligne l'icône et le texte horizontalement
        alignItems: "center", // Centre l'icône et le texte verticalement
        padding: 10,
        backgroundColor: "#191f2f", // Couleur d'arrière-plan de l'exemple
        borderRadius: 2,
		borderWidth: 1,
		borderColor: "#00fd00",
        elevation: 5,
        width: "33%",
    },
    editButton: {
        flexDirection: "row", // Aligne l'icône et le texte horizontalement
        alignItems: "center", // Centre l'icône et le texte verticalement
        padding: 10,
        backgroundColor: "#191f2f", // Couleur d'arrière-plan de l'exemple
		borderWidth: 1,
		borderColor: "#888787",
        borderRadius: 2,
        width: "33%",
        elevation: 5,
    },
    buttonText: {
        color: "#888787",
        textAlign: "center",
        fontWeight: "medium",
    },
    buttonTextSms: {
        color: "#191f2f",
        textAlign: "center",
        fontWeight: "bold",
    },
    buttonIcon: {
        marginRight: 10, // Espace entre l'icône et le texte
    },
    imageContainer: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: 10,
    },
    imageThumbnail: {
        width: 80,
        height: 80,
        margin: 5,
        borderRadius: 2,
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
        color: "#333333",
    },
    modalButtonRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 20,
    },
    button: {
        backgroundColor: "#007BFF",
        padding: 10,
        borderRadius: 2,
        marginHorizontal: 10,
    },
    disabledButton: {
        backgroundColor: "#191f2f",
		borderWidth: 1,
		borderColor: "#ff1f1f",
		borderRadius: 2,
    },
    alertMessage: {
        fontSize: 16,
        color: "#333333",
        marginBottom: 10,
        textAlign: "center",
    },
    moveToTopButton: {
        position: "absolute",
        top: 20,
        right: 10,
        zIndex: 1,
        backgroundColor: "#888787",
        borderRadius: 2,
        elevation: 5,
    },
    interventionTextSolde: {
        fontSize: 20,
        fontWeight: "bold",
        color: "#888787",
        marginBottom: 5,
    },
    fullscreenImage: {
        width: "90%",
        height: "80%",
        resizeMode: "contain",
    },
    closeButton: {
        position: "absolute",
        top: 30,
        right: 30,
        zIndex: 1,
    },
    deleteButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "red",
        padding: 10,
        borderRadius: 2,
        marginTop: 20,
    },
    deleteButtonText: {
        color: "white",
        fontWeight: "bold",
        marginLeft: 10,
    },
    imageWrapper: {
        position: "relative",
        margin: 5,
    },
    deleteIcon: {
        position: "absolute",
        top: 5,
        right: 5,
        backgroundColor: "white",
        borderRadius: 2,
        padding: 5,
        elevation: 5,
    },
    toggleButton: {
        position: "absolute",
        top: 95,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-end", // Positionner le bouton à droite
        backgroundColor: "#ffffff", // Couleur du bouton
        paddingVertical: 8,
        paddingHorizontal: 40, // Réduire la largeur du bouton
        borderRadius: 2,
        marginTop: 10,

        borderWidth: 3,
        borderColor: "#c1c4c2",
    },
    toggleButtonText: {
        color: "#929292",
        fontSize: 14, // Texte légèrement plus petit
        fontWeight: "bold",
        marginRight: 5, // Espacement entre le texte et l'icône
    },
    ficheContainer: {
        backgroundColor: "#f9f9f9",
        padding: 10,
        marginVertical: 5,
        borderRadius: 2,
        elevation: 2, // Ajoute une ombre pour Android
    },
    itemTitle: {
        fontSize: 16,
        fontWeight: "bold",
    },
    itemSubtitle: {
        fontSize: 14,
        color: "#555555",
    },
    totalContainer: {
        backgroundColor: "#191f2f",
        padding: 10,
        marginBottom: 10,
		borderWidth: 1,
		borderColor: "#888787",
		borderRadius: 2,
    },
    totalText: {
        fontSize: 18,
        fontWeight: "medium",
        textAlign: "center",
        color: "#999898",
    },
    paginationContainer: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginVertical: 60, // Ajuste l'espacement vertical
    },
    chevronButton: {
        padding: 5, // Réduit l'espace cliquable autour des chevrons
    },
    chevronIcon: {
        width: 22, // Réduit la largeur du chevron
        height: 22, // Réduit la hauteur du chevron
    },
    paginationText: {
        marginHorizontal: 10, // Espace entre le texte et les chevrons
        color: "white",
        fontSize: 20, // Ajuste la taille du texte
    },
    pageButton: {
        padding: 10,
        margin: 5,
        borderRadius: 2,
        backgroundColor: "#ddd",
    },
    activePageButton: {
        backgroundColor: "#007BFF",
    },
    pageButtonText: {
        fontWeight: "bold",
        color: "#333",
    },
    activePageButtonText: {
        color: "#fff",
    },
});
