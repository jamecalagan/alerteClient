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

import * as ImageManipulator from "expo-image-manipulator";
import * as Animatable from "react-native-animatable";
const backgroundImage = require("../assets/listing2.jpg");
ScrollView.defaultProps = { showsVerticalScrollIndicator: false };
FlatList.defaultProps = { showsVerticalScrollIndicator: false };
export default function RepairedInterventionsPage({ navigation }) {
    const repairedInterventionsRef = useRef(null); // Créez une référence
    const [repairedInterventions, setRepairedInterventions] = useState([]);
    const [editingDetail, setEditingDetail] = useState({});
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [isSaved, setIsSaved] = useState({});
    const [notifyModalVisible, setNotifyModalVisible] = useState(false);
    const [selectedInterventionId, setSelectedInterventionId] = useState(null);
    const [photoAlertVisible, setPhotoAlertVisible] = useState(false);
    const [pinnedInterventionId, setPinnedInterventionId] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [expandedCards, setExpandedCards] = useState({});
    const sortedInterventions = repairedInterventions.sort((a, b) => {
        if (a.id === pinnedInterventionId) return -1; // La fiche épinglée est toujours en haut
        if (b.id === pinnedInterventionId) return 1;
        return 0; // Conserve l'ordre des autres fiches
    });

	const loadRepairedInterventions = async () => {
		try {
		  // Charger les interventions avec le statut "Réparé" ou "Non réparable"
		  const { data, error } = await supabase
			.from('interventions')
			.select(`
			  *,
			  clients (phone, name, ficheNumber)
			`)
			.in('status', ['Réparé', 'Non réparable']); // Inclure les deux statuts
	  
		  if (error) throw error;
	  
		  const { data: imagesData, error: imagesError } = await supabase
			.from('intervention_images')
			.select('*');
	  
		  if (imagesError) throw imagesError;
	  
		  const interventionsWithImages = data.map((intervention) => {
			const images = imagesData.filter((image) => image.intervention_id === intervention.id);
			return { ...intervention, intervention_images: images };
		  });
	  
		  setRepairedInterventions(interventionsWithImages);
	  
		  const savedStatus = {};
		  interventionsWithImages.forEach((intervention) => {
			savedStatus[intervention.id] =
			  intervention.detailIntervention && intervention.detailIntervention.trim() !== '';
		  });
		  setIsSaved(savedStatus);
		} catch (error) {
		  console.error('Erreur lors du chargement des interventions réparées :', error);
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
            setPhotoAlertVisible(true); // Affiche l'alerte si aucune photo n'est trouvée
        } else {
            navigation.navigate("SignaturePage", {
                interventionId: intervention.id,
                clientId: intervention.client_id,
            });
        }
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
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
        >
            <ImageBackground
                source={backgroundImage}
                style={styles.backgroundImage}
            >
                <View style={styles.overlay}>
                    <Text style={styles.title}>Interventions terminées</Text>
                    <FlatList
					
                        ref={flatListRef}
                        data={repairedInterventions}
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
      item.status === 'Non réparable' ? { backgroundColor: '#f8d7da' } : {},
    ]}
  >
                                <View
                                    style={styles.notificationAndToolsContainer}
                                >
                                    <TouchableOpacity
                                        style={styles.iconStyle}
                                        onPress={() => {
                                            setSelectedInterventionId(item.id);
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
                                                    ? "green"
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
                                                    item?.intervention_images
                                                        ?.length > 0
                                                        ? "blue"
                                                        : "black", // Bleu si photo présente, sinon noir
                                            }}
                                        />
                                    </TouchableOpacity>
                                </View>
                                <TouchableOpacity
                                    style={styles.moveToTopButton}
                                    onPress={() => moveToTop(item.id)}
                                >
                                    <Image
                                        source={require("../assets/icons/chevron.png")} // Chemin vers votre image de flèche
                                        style={{
                                            width: 40, // Largeur de l'image
                                            height: 40, // Hauteur de l'image
                                            tintColor: "#757575", // Applique la couleur bleue
                                        }}
                                    />
                                </TouchableOpacity>
                                <View style={styles.infoContainer}>
                                    <Text style={styles.interventionTextBold}>
                                        Fiche N° : {item.clients.ficheNumber}
                                    </Text>
                                    <Text style={styles.interventionTextBold}>
                                        Client : {item.clients.name}
                                    </Text>
									<Text style={styles.interventionTextBold}>
										Tel :{" "}
										{item.clients.phone
											? item.clients.phone.replace(/(\d{2})(?=\d)/g, "$1 ")
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
                                                style={styles.interventionText}
                                            >
                                                Modèle: {item.model}
                                            </Text>
                                            <Text
                                                style={styles.interventionText}
                                            >
                                                Numéro de série:{" "}
                                                {item.serial_number}
                                            </Text>
                                            <Text
                                                style={styles.interventionText}
                                            >
                                                Référence: {item.reference}
                                            </Text>
                                            <Text
                                                style={styles.interventionText}
                                            >
                                                Description du problème:{" "}
                                                {item.description}
                                            </Text>
                                            <Text
                                                style={styles.interventionText}
                                            >
                                                Chargeur:{" "}
                                                {item.chargeur ? "Oui" : "Non"}
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
                                                        {item.partialPayment} €
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
                                                style={styles.interventionText}
                                            >
                                                Statut: {item.status}
                                            </Text>
                                            <Text
                                                style={styles.interventionText}
                                            >
                                                Commande: {item.commande}
                                            </Text>
                                            <Text
                                                style={styles.interventionText}
                                            >
                                                Date:{" "}
                                                {new Date(
                                                    item.createdAt
                                                ).toLocaleDateString("fr-FR")}
                                            </Text>

                                            <TextInput
                                                style={styles.detailInput}
                                                placeholder="Entrez les détails ici..."
                                                onFocus={() => {
                                                    setTimeout(() => {
                                                        flatListRef.current.scrollToIndex(
                                                            {
                                                                index: repairedInterventions.findIndex(
                                                                    (i) =>
                                                                        i.id ===
                                                                        item.id
                                                                ),
                                                                animated: true,
                                                            }
                                                        );
                                                    }, 100); // Petit délai pour garantir le bon affichage
                                                }}
                                                value={
                                                    editingDetail[item.id] || ""
                                                }
                                                onChangeText={(text) =>
                                                    setEditingDetail({
                                                        ...editingDetail,
                                                        [item.id]: text,
                                                    })
                                                }
                                            />

                                            <View
                                                style={styles.buttonContainer}
                                            >
                                                <TouchableOpacity
                                                    style={styles.saveButton}
                                                    onPress={() =>
                                                        saveDetailIntervention(
                                                            item.id
                                                        )
                                                    }
                                                >
                                                    <Image
                                                        source={require("../assets/icons/save.png")} // Chemin vers l'image "save"
                                                        style={[
                                                            styles.buttonIcon, // Styles existants
                                                            {
                                                                width: 20, // Largeur de l'image
                                                                height: 20, // Hauteur de l'image
                                                                tintColor:
                                                                    "#202020", // Couleur de l'image (noir foncé ici)
                                                            },
                                                        ]}
                                                    />

                                                    <Text
                                                        style={
                                                            styles.buttonText
                                                        }
                                                    >
                                                        Sauvegarder les détails
                                                    </Text>
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
                                                        handleRestitution(item)
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
                                                                    "#202020", // Couleur de l'image (noir foncé ici)
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
                                                    style={styles.editButton}
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
                                                                    "#202020", // Couleur de l'image (noir foncé ici)
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
                                                            (image, index) => (
                                                                <View
                                                                    key={index}
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
						ListFooterComponent={<View style={{ height: 100 }} />}
                    />
					
                </View>

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
                            <Text style={styles.alertTitle}>
                                Aucune photo prise
                            </Text>
                            <Text style={styles.alertMessage}>
                                Veuillez prendre une photo avant de procéder à
                                la restitution.
                            </Text>
                            <TouchableOpacity
                                style={styles.button}
                                onPress={() => setPhotoAlertVisible(false)}
                            >
                                <Text style={styles.buttonTextSms}>OK</Text>
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
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    backgroundImage: {
        flex: 1,
        resizeMode: "cover",
    },
    overlay: {
        flex: 1,
        backgroundColor: "rgba(255, 255, 255, 0)",
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
        color: "#fff",
    },
    interventionCard: {
        padding: 15,
        marginBottom: 10,
        backgroundColor: "#ffffff",
        borderRadius: 10,
    },
    notificationAndToolsContainer: {
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
        borderWidth: 2,
        borderRadius: 5,
        borderColor: "#000",
        backgroundColor: "#fff",
        marginHorizontal: 5,
    },
    infoContainer: {
        marginTop: 10,
    },
    interventionText: {
        fontSize: 18,
        color: "#333",
        marginBottom: 5,
    },
    interventionTextBold: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#333",
        marginBottom: 5,
    },
    interventionTextNon: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#f50202",
        marginBottom: 5,
    },
    interventionTextReste: {
        fontSize: 20,
        color: "#dd0606",
        marginBottom: 5, // Ajoute un espacement entre les lignes
    },
    detailInput: {
        borderColor: "gray",
        borderWidth: 1,
        padding: 10,
        borderRadius: 5,
        backgroundColor: "#fff",
        marginBottom: 10,
        fontWeight: "bold",
    },
    buttonContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 10,
    },
    saveButton: {
        backgroundColor: "#acf5bb",
        padding: 5,
        alignItems: "center",
        borderRadius: 5,
        flexDirection: "row",
        marginRight: 5,
        elevation: 5,
        width: "33%",
    },
    restitutionButton: {
        flexDirection: "row", // Aligne l'icône et le texte horizontalement
        alignItems: "center", // Centre l'icône et le texte verticalement
        padding: 10,
        backgroundColor: "#f0f0f0", // Couleur d'arrière-plan de l'exemple
        borderRadius: 5,
        elevation: 5,
        width: "33%",
    },
    editButton: {
        flexDirection: "row", // Aligne l'icône et le texte horizontalement
        alignItems: "center", // Centre l'icône et le texte verticalement
        padding: 10,
        backgroundColor: "#f0f0f0", // Couleur d'arrière-plan de l'exemple
        borderRadius: 5,
        width: "33%",
        elevation: 5,
    },
    buttonText: {
        color: "#202020",
        textAlign: "center",
        fontWeight: "bold",
    },
    buttonTextSms: {
        color: "#fff",
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
        borderRadius: 5,
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
        borderRadius: 5,
        marginHorizontal: 10,
    },
    disabledButton: {
        backgroundColor: "#ccc",
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
        backgroundColor: "white",
        borderRadius: 5,
        elevation: 5,
    },
    interventionTextSolde: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#056109",
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
        borderRadius: 5,
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
        borderRadius: 5,
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
        borderRadius: 5,
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
        borderRadius: 8,
        elevation: 2, // Ajoute une ombre pour Android
    },
    itemTitle: {
        fontSize: 16,
        fontWeight: "bold",
    },
    itemSubtitle: {
        fontSize: 14,
        color: "#555",
    },
});
