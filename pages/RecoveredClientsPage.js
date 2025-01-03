import React, { useState, useRef } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    Image,
    StyleSheet,
    ImageBackground,
    TextInput,
    Modal,
    TouchableWithoutFeedback,
} from "react-native";
import { supabase } from "../supabaseClient";
import Icon from "react-native-vector-icons/FontAwesome";
import { useFocusEffect } from "@react-navigation/native";
import * as Animatable from "react-native-animatable";



export default function RecoveredClientsPage() {
	const backgroundImage = require("../assets/listing2.jpg");
    const flatListRef = useRef(null); // Référence pour la FlatList
    const [recoveredClients, setRecoveredClients] = useState([]);
    const [filteredClients, setFilteredClients] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [visibleSignatures, setVisibleSignatures] = useState({});
    const [selectedImage, setSelectedImage] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 6;
    const [expandedCards, setExpandedCards] = useState({});
    const loadRecoveredClients = async () => {
        try {
            // Récupérez les interventions
            const { data: interventions, error: interventionsError } =
                await supabase
                    .from("interventions")
                    .select(
                        `
					*,
					clients (name, ficheNumber, phone)
				`
                    )
                    .eq("status", "Récupéré")
                    .order("updatedAt", { ascending: false });

            if (interventionsError) throw interventionsError;

            // Récupérez les images depuis la table intervention_image
            const { data: images, error: imagesError } = await supabase
                .from("intervention_images")
                .select("intervention_id, image_data");

            if (imagesError) throw imagesError;

            // Associez les images aux interventions
            const combinedData = interventions.map((intervention) => ({
                ...intervention,
                intervention_images: images
                    .filter((img) => img.intervention_id === intervention.id)
                    .map((img) => img.image_data), // Prenez uniquement les données d'image
            }));

            setRecoveredClients(combinedData);
            setFilteredClients(combinedData);
        } catch (error) {
            console.error(
                "Erreur lors du chargement des clients récupérés :",
                error
            );
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadRecoveredClients();
        }, [])
    );

    const toggleSignatureVisibility = (id) => {
        setVisibleSignatures((prevState) => ({
            ...prevState,
            [id]: !prevState[id],
        }));
    };

    const handleSearch = (query) => {
        setSearchQuery(query);

        if (query.trim() === "") {
            setFilteredClients(recoveredClients);
        } else {
            const filtered = recoveredClients.filter((client) => {
                const clientName = client.clients?.name?.toLowerCase() || "";
                const clientPhone = client.clients?.phone
                    ? client.clients.phone.toString()
                    : "";

                return (
                    clientName.includes(query.toLowerCase()) ||
                    clientPhone.includes(query)
                );
            });

            setFilteredClients(filtered);
            setCurrentPage(1); // Reset to first page on search
        }
    };

    const getPaginatedClients = () => {
        const data = filteredClients;
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        return data.slice(startIndex, endIndex);
    };

    const totalPages = Math.ceil(filteredClients.length / pageSize);

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
        }
    };

    const handlePreviousPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
        }
    };
    const scrollToCard = (index) => {
        if (flatListRef.current && typeof index === "number") {
            flatListRef.current.scrollToIndex({
                index,
                animated: true,
            });
        } else {
            console.error(
                "scrollToCard : index invalide ou FlatList non disponible"
            );
        }
    };
    const getDeviceIcon = (deviceType) => {
        switch (deviceType) {
            case "PC portable":
                return require("../assets/icons/portable.png");
			case "MacBook":
				return require("../assets/icons/macbook_air.png");
				case "iMac":
					return require("../assets/icons/iMac.png");
            case "PC Fixe":
                return require("../assets/icons/ordinateur (1).png");
            case "PC tout en un":
                return require("../assets/icons/allInone.png");
            case "Tablette":
                return require("../assets/icons/tablette.png");
            case "Smartphone":
                return require("../assets/icons/smartphone.png");
            case "Console":
                return require("../assets/icons/console-de-jeu.png");
            case "Disque dur":
                return require("../assets/icons/disk.png");
				case "Disque dur externe":
					return require("../assets/icons/disque-dur.png");
            case "Carte SD":
                return require("../assets/icons/carte-memoire.png");
            case "Cle usb":
                return require("../assets/icons/cle-usb.png");
            case "Casque audio":
                return require("../assets/icons/playaudio.png");
            case "Retro-projecteur":
                return require("../assets/icons/Projector.png");
            case "Clavier":
                return require("../assets/icons/keyboard.png");
            default:
                return require("../assets/icons/point-dinterrogation.png");
        }
    };

    const handleScrollError = (info) => {
        console.warn("Scroll error:", info);
    };
    const toggleCardExpansion = (id, index) => {
        if (typeof index !== "number") {
            console.error(`Index non valide : ${index}`);
            return;
        }

        // Met à jour l'état pour ouvrir ou fermer la carte
        setExpandedCards((prevState) => ({
            ...prevState,
            [id]: !prevState[id],
        }));

        // Si la carte est ouverte, défilez vers elle
        if (!expandedCards[id]) {
            scrollToCard(index);
        }
    };
    // Basculer l'état d'affichage des détails
    const toggleDetails = (id) => {
        setExpandedCards((prev) => ({
            ...prev,
            [id]: !prev[id], // Change l'état d'expansion de la fiche sélectionnée
        }));
    };
    return (
        <ImageBackground
            source={backgroundImage}
            style={styles.backgroundImage}
        >
            <View style={styles.overlay}>
                <Text style={styles.title}>
                    Clients ayant récupéré le matériel
                </Text>

                <TextInput
                    style={styles.searchBar}
                    placeholder="Rechercher par nom ou téléphone"
                    placeholderTextColor="#ccc"
                    value={searchQuery}
                    onChangeText={handleSearch}
                />

                <FlatList
                    ref={flatListRef}
                    onScrollToIndexFailed={(info) => {
                        console.warn("Échec du défilement :", info);
                        // Faites défiler jusqu'à l'élément de manière approximative si nécessaire
                        if (flatListRef.current) {
                            flatListRef.current.scrollToOffset({
                                offset: info.averageItemLength * info.index,
                                animated: true,
                            });
                        }
                    }}
                    data={getPaginatedClients()}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item, index }) => (
						<Animatable.View
            animation="zoomIn" // Type d'animation
            duration={400} // Durée en millisecondes
            delay={index * 150} // Délai basé sur l'index pour un effet "une après l'autre"
            style={[
                styles.card,
                index % 2 === 0 ? styles.cardEven : styles.cardOdd,
            ]}
        >
                        <View
                            style={[
                                styles.card,
                                index % 2 === 0
                                    ? styles.cardEven
                                    : styles.cardOdd, // Couleur alternée
                            ]}
                        >
						                <View style={styles.iconContainer}>
                    <Image
                        source={getDeviceIcon(item.deviceType)}
                        style={styles.deviceIcon}
                    />
                </View>
                            {/* Informations principales */}
                            <TouchableOpacity
                                onPress={() =>
                                    toggleCardExpansion(item.id, index)
                                }
                            >
                                <Text style={styles.clientInfo}>
                                    Numéro de Client N°:{" "}
                                    {item.clients.ficheNumber}
                                </Text>
                                <Text style={styles.clientInfo}>
                                    Nom: {item.clients.name}
                                </Text>
                                <Text style={styles.clientInfo}>
                                    Téléphone:{" "}
                                    {item.clients.phone.replace(
                                        /(\d{2})(?=\d)/g,
                                        "$1 "
                                    )}
                                </Text>
                            </TouchableOpacity>

                            {/* Affichage conditionnel des détails */}
                            {expandedCards[item.id] && (
                                <>
                                    <Text style={styles.interventionInfo}>
                                        Type d'appareil: {item.deviceType}
                                    </Text>
                                    <Text style={styles.interventionInfo}>
                                        Marque: {item.brand}
                                    </Text>
                                    <Text style={styles.interventionInfo}>
                                        Modèle: {item.model}
                                    </Text>
                                    <Text style={styles.interventionInfo}>
                                        Référence: {item.reference}
                                    </Text>
                                    <Text style={styles.interventionInfo}>
                                        Description du problème:{" "}
                                        {item.description}
                                    </Text>
                                    <Text style={styles.interventionInfo}>
                                        Coût: {item.cost} €
                                    </Text>
                                    <Text style={styles.interventionInfo}>
                                        Date de récupération:{" "}
                                        {new Date(
                                            item.updatedAt
                                        ).toLocaleDateString("fr-FR")}
                                    </Text>
                                    <Text style={styles.interventionInfo}>
                                        Détail de l'intervention:{" "}
                                        {item.detailIntervention}
                                    </Text>
                                    {item.receiver_name && (
                                        <Text style={styles.receiverText}>
                                            Récupéré par : {item.receiver_name}
                                        </Text>
                                    )}
                                    <Text style={styles.interventionInfo}>
                                        Remarques: {item.remarks}
                                    </Text>
                                    <Text style={styles.interventionInfo}>
                                        Statut du règlement:{" "}
                                        {item.paymentStatus}
                                    </Text>

                                    {/* Images */}
                                    <View style={styles.imageContainer}>
                                        {item.photos &&
                                            item.photos.map(
                                                (photo, photoIndex) => (
                                                    <TouchableOpacity
                                                        key={`photo-${photoIndex}`}
                                                        onPress={() =>
                                                            setSelectedImage(
                                                                `data:image/jpeg;base64,${photo}`
                                                            )
                                                        }
                                                    >
                                                        <Image
                                                            source={{
                                                                uri: `data:image/jpeg;base64,${photo}`,
                                                            }}
                                                            style={[
                                                                styles.imageThumbnail,
                                                                item.label_photo ===
                                                                photo
                                                                    ? styles.labelImage
                                                                    : null,
                                                            ]}
                                                        />
                                                    </TouchableOpacity>
                                                )
                                            )}

                                        {item.intervention_images &&
                                            item.intervention_images.map(
                                                (image, imageIndex) => (
                                                    <TouchableOpacity
                                                        key={`intervention-image-${imageIndex}`}
                                                        onPress={() =>
                                                            setSelectedImage(
                                                                `data:image/jpeg;base64,${image}`
                                                            )
                                                        }
                                                    >
                                                        <Image
                                                            source={{
                                                                uri: `data:image/jpeg;base64,${image}`,
                                                            }}
                                                            style={[
                                                                styles.imageThumbnail,
                                                                styles.newImageThumbnail,
                                                            ]}
                                                        />
                                                    </TouchableOpacity>
                                                )
                                            )}
											<TouchableOpacity
                style={styles.toggleButton}
                onPress={() => toggleSignatureVisibility(item.id)}
              >
                <Icon
                  name={visibleSignatures[item.id] ? 'eye-slash' : 'eye'}
                  size={20}
                  color="#202020"
                  style={styles.icon}
                />
                <Text style={styles.toggleButtonText}>
                  {visibleSignatures[item.id] ? 'Masquer la signature' : 'Afficher la signature'}
                </Text>
              </TouchableOpacity>

              {visibleSignatures[item.id] && item.signature ? (
                <Image
                  source={{ uri: item.signature }}
                  style={styles.signatureImage}
                />
              ) : null}
                                    </View>
                                </>
                            )}
							
                        </View>
						</Animatable.View>
                    )}
                />

                <View style={styles.paginationContainer}>
                    <TouchableOpacity
                        style={[
                            styles.paginationButton,
                            currentPage === 1 && styles.disabledButton,
                        ]}
                        onPress={handlePreviousPage}
                        disabled={currentPage === 1}
                    >
                        <Text style={styles.paginationButtonText}>
                            Précédent
                        </Text>
                    </TouchableOpacity>
                    <Text style={styles.paginationInfo}>
                        Page {currentPage} sur {totalPages}
                    </Text>
                    <TouchableOpacity
                        style={[
                            styles.paginationButton,
                            currentPage === totalPages && styles.disabledButton,
                        ]}
                        onPress={handleNextPage}
                        disabled={currentPage === totalPages}
                    >
                        <Text style={styles.paginationButtonText}>Suivant</Text>
                    </TouchableOpacity>
                </View>
            </View>
			
            <Modal
                visible={selectedImage !== null}
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
        backgroundColor: "rgba(39, 39, 39, 0.8)",
        padding: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
        color: "#fff",
    },
    searchBar: {
        backgroundColor: "#fff",
        padding: 10,
        borderRadius: 5,
        marginBottom: 20,
        fontSize: 16,
        color: "#000",
    },
    card: {
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        padding: 15,
        marginBottom: 10,
        borderRadius: 10,
        elevation: 2,
    },
    iconContainer: {
        marginLeft: 10, // Ajoute un espace entre les infos et l'image
        justifyContent: "center", // Centre verticalement l'image
        alignItems: "center",
    },
    deviceIcon: {
		position: "absolute",
		top:15,
        width: 40,
        height: 40,
        resizeMode: "contain",
    },
    row: {
        flexDirection: "row", // Disposition en ligne
        justifyContent: "space-between", // Espace entre les sections
        alignItems: "center", // Centrage vertical
        width: "100%", // Assure que la ligne prend tout l'espace disponible
    },

    iconContainer: {
        justifyContent: "center", // Centre verticalement
        alignItems: "flex-end", // Aligne l'icône à droite
        flex: 0, // Ne prend pas d'espace supplémentaire
        marginLeft: 10, // Espacement entre les informations et l'icône
    },
    cardEven: {
        backgroundColor: "rgba(236, 235, 235, 1)", // Gris clair pour les fiches paires
    },
    cardOdd: {
        backgroundColor: "rgba(255, 255, 255, 1)", // Blanc pour les fiches impaires
    },
    clientInfo: {
        fontSize: 16,
        marginBottom: 5,
    },
    interventionInfo: {
        fontSize: 14,
        marginBottom: 5,
        color: "#555",
    },
    toggleButton: {
		width: "100%",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 10,
        padding: 10,
        backgroundColor: "#f7f7f7",
        borderWidth: 1,
        borderColor: "#929090",
        borderRadius: 5,
        elevation: 5,
    },
    toggleButtonText: {
        color: "#202020",
        fontWeight: "bold",
        marginLeft: 10,
    },
    icon: {
        marginRight: 10,
    },
    signatureImage: {
        width: "95%",
        height: 300,
        marginTop: 10,
        marginLeft: 20,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#ddd",
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
        resizeMode: "cover",
    },
    newImageThumbnail: {
        borderWidth: 2, // Ajoute une bordure
        borderColor: "blue", // Bordure bleue pour les nouvelles images
    },
    modalBackground: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
    },
    fullImage: {
        width: "90%",
        height: "90%",
        resizeMode: "contain",
    },
    receiverText: {
        fontSize: 18,
        color: "#571515",
        marginTop: 5,
    },
    labelImage: {
        borderWidth: 2,
        borderColor: "green",
    },
    paginationContainer: {
        flexDirection: "row",
        justifyContent: "space-evenly", // Espace équitablement les boutons et le texte
        alignItems: "center",

        paddingHorizontal: 5, // Ajoute de l'espace sur les côtés
    },
    paginationButton: {
        backgroundColor: "#445a75",
        paddingVertical: 5, // Ajoute de l'espace en haut et en bas
        paddingHorizontal: 30, // Ajoute de l'espace sur les côtés
        borderRadius: 5,
        marginBottom: 2,
    },
    disabledButton: {
        backgroundColor: "#ccc",
    },
    paginationButtonText: {
        color: "#fff",
        fontWeight: "bold",
    },
    paginationInfo: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#fff",
    },
    expandedCard: {
        borderWidth: 2,
        borderColor: "#007bff",
        padding: 10,
        marginBottom: 10,
        borderRadius: 10,
    },
    collapsedCard: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        marginBottom: 10,
        borderRadius: 10,
    },
});
