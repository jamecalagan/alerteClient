import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    TextInput,
    Modal,
    ImageBackground,
    ActivityIndicator,
    Image,
	Alert
} from "react-native";
import { supabase } from "../supabaseClient";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import RoundedButton from "../components/RoundedButton";
import * as Animatable from "react-native-animatable";

// Import de l'image depuis le dossier assets
const backgroundImage = require("../assets/listing2.jpg");
export default function HomePage({ navigation, route }) {
    const flatListRef = useRef(null);
    const [clients, setClients] = useState([]);
    const [filteredClients, setFilteredClients] = useState([]);
    const [searchText, setSearchText] = useState("");
    const [sortBy, setSortBy] = useState("createdAt");
    const [orderAsc, setOrderAsc] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [alertVisible, setAlertVisible] = useState(false);
    const [cleanupModalVisible, setCleanupModalVisible] = useState(false);
    const [transportModalVisible, setTransportModalVisible] = useState(false);
    const [selectedCommande, setSelectedCommande] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true); // Loader state
    const [notifyModalVisible, setNotifyModalVisible] = useState(false); // Gérer la visibilité de la modal de notification
    const [selectedInterventionId, setSelectedInterventionId] = useState(null); // Stocker l'ID de l'intervention sélectionnée
    const [repairedNotReturnedCount, setRepairedNotReturnedCount] = useState(0);
    const [expandedClientId, setExpandedClientId] = useState(null);
    const [selectedIntervention, setSelectedIntervention] = useState(null);
    const [activeModal, setActiveModal] = useState(null); // null si aucune modale active
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [modalData, setModalData] = useState({
        title: "",
        message: "",
        onConfirm: null,
    });
    // Ajoutez d'autres états de modale si nécessaire
    const closeAllModals = () => {
        setAlertVisible(false);
        setNotifyModalVisible(false);
        setTransportModalVisible(false);
    };

    const [alertTitle, setAlertTitle] = useState(""); // Titre de l'alerte
    const [alertMessage, setAlertMessage] = useState(""); // Message de l'alerte
    const openModal = (type, title, message, onConfirm = null) => {
        setActiveModal(type);
        setModalData({ title, message, onConfirm });
    };
    const closeModal = () => {
        setActiveModal(null);
    };

    // Fonction pour basculer l'état d'expansion d'une fiche client
    const toggleClientExpansion = (clientId, index) => {
        setExpandedClientId((prevId) =>
            prevId === clientId ? null : clientId
        );
        if (flatListRef.current) {
            flatListRef.current.scrollToIndex({
                index,
                animated: true,
            });
        }
    };
    const itemsPerPage = 4;
    useEffect(() => {
        checkForExpiredInterventions();
    }, []);
    const triggerPhotoCleanupAlert = async (intervention) => {
        try {
            closeAllModals();

            const { photos, label_photo } = intervention;
            if (
                !photos ||
                photos.length === 0 ||
                photos.every((photo) => photo === label_photo)
            ) {
                console.log(
                    `Pas de photos à nettoyer pour l'intervention ${intervention.id}.`
                );
                processInterventionQueue(); // Passe à la fiche suivante
                return;
            }

            const { data: clientData, error } = await supabase
                .from("clients")
                .select("name, ficheNumber")
                .eq("id", intervention.client_id)
                .single();

            if (error) {
                throw new Error(
                    "Impossible de récupérer les informations du client."
                );
            }

            const clientName = clientData.name || "Nom inconnu";
            const clientNumber = clientData.ficheNumber || "Numéro inconnu";

            setAlertTitle("Nettoyage des photos");
            setAlertMessage(
                `Le client ${clientName} (N°${clientNumber}) a dépassé le délai de 10 jours. Voulez-vous supprimer les photos inutiles ?`
            );

            setSelectedIntervention(intervention); // Stocke l'intervention actuelle
            setCleanupModalVisible(true); // Ouvre la modale
        } catch (err) {
            console.error("Erreur lors du déclenchement de l'alerte :", err);
            processInterventionQueue(); // Passe à la fiche suivante en cas d'erreur
        }
    };

    const handlePhotoCleanup = async () => {
        if (!selectedIntervention) {
            console.error("Aucune intervention sélectionnée.");
            return;
        }

        try {
            const { id, photos, label_photo } = selectedIntervention;
            const updatedPhotos = photos.filter(
                (photo) => photo === label_photo
            );

            const { error } = await supabase
                .from("interventions")
                .update({ photos: updatedPhotos })
                .eq("id", id);

            if (error) throw error;

            console.log(
                `Photos inutiles supprimées pour l'intervention ${id}.`
            );
            setCleanupModalVisible(false); // Ferme la modale
            setSelectedIntervention(null); // Réinitialise l'intervention sélectionnée
            processInterventionQueue(); // Passe à la fiche suivante
        } catch (error) {
            console.error("Erreur lors du nettoyage des photos :", error);
        }
    };
    const handleModalClose = () => {
        setCleanupModalVisible(false); // Ferme la modale
        setSelectedIntervention(null); // Réinitialise l'intervention sélectionnée
        processInterventionQueue(); // Passe à la fiche suivante
    };

    const checkForExpiredInterventions = async () => {
        try {
            const now = new Date();
            const eligibleInterventionIds = []; // Stocke les interventions éligibles
            const imagesToDelete = []; // Stocke les images éligibles pour suppression
            const imagesForConfirmation = []; // Images à confirmer avant suppression

            // Récupérer les interventions
            const { data: interventions, error: interventionError } =
                await supabase
                    .from("interventions")
                    .select(
                        "id, updatedAt, photos, label_photo, status, client_id"
                    );

            if (interventionError) {
                throw new Error(
                    "Erreur lors du chargement des interventions : " +
                        interventionError.message
                );
            }

            // Vérifiez les interventions éligibles
            interventions.forEach((intervention) => {
                const { id, updatedAt, photos, label_photo, status } =
                    intervention;

                const diffInDays =
                    (now - new Date(updatedAt)) / (1000 * 60 * 60 * 24);
                if (status === "Récupéré" && diffInDays > 10) {
                    eligibleInterventionIds.push(id);

                    if (photos && photos.length > 0) {
                        const nonLabelPhotos = photos.filter(
                            (photo) => photo !== label_photo
                        );
                        imagesForConfirmation.push(...nonLabelPhotos);
                    }
                }
            });

            // Récupérer les images dans intervention_images
            const { data: oldImages, error: imageError } = await supabase
                .from("intervention_images")
                .select("id, intervention_id, created_at")
                .lt("created_at", new Date(now - 10 * 24 * 60 * 60 * 1000));

            if (imageError) {
                console.error(
                    "Erreur lors de la récupération des images :",
                    imageError
                );
            } else if (oldImages && oldImages.length > 0) {
                imagesForConfirmation.push(
                    ...oldImages.map((image) => image.id)
                );
            }

            // Avertir l'utilisateur si des images sont éligibles
            if (imagesForConfirmation.length > 0) {
                showCleanupAlert(imagesForConfirmation);
            } else {
                console.log("Aucune image éligible pour suppression.");
            }
        } catch (err) {
            console.error(
                "Erreur lors de la vérification des interventions :",
                err
            );
        }
    };
    const showCleanupAlert = (imagesForConfirmation) => {
        Alert.alert(
            "Nettoyage des images",
            `Il y a ${imagesForConfirmation.length} image(s) éligible(s) pour suppression. Voulez-vous continuer ?`,
            [
                {
                    text: "Annuler",
                    onPress: () => console.log("Suppression annulée."),
                    style: "cancel",
                },
                {
                    text: "Confirmer",
                    onPress: () => handleImageDeletion(imagesForConfirmation),
                },
            ],
            { cancelable: false }
        );
    };

    // Fonction pour supprimer les images inutiles
    const handleImageDeletion = async (imagesToDelete) => {
        if (imagesToDelete.length === 0) {
            console.log("Aucune image à supprimer.");
            return;
        }

        try {
            console.log("Suppression des images :", imagesToDelete);

            // Supprimer les images dans intervention_images
            const { error: deleteImageError } = await supabase
                .from("intervention_images")
                .delete()
                .in("id", imagesToDelete);

            if (deleteImageError) {
                console.error(
                    "Erreur lors de la suppression des images :",
                    deleteImageError
                );
            } else {
                console.log(
                    `Images supprimées avec succès : ${imagesToDelete.join(
                        ", "
                    )}.`
                );
            }
        } catch (err) {
            console.error("Erreur lors de la suppression des images :", err);
        }
    };

    const processInterventionQueue = () => {
        if (eligibleInterventions.length === 0) {
            console.log("Toutes les interventions ont été traitées.");
            return; // Aucune intervention restante
        }

        const nextIntervention = eligibleInterventions.shift(); // Récupère et retire la première fiche de la file
        triggerPhotoCleanupAlert(nextIntervention); // Affiche la modale pour cette intervention
    };

    const eligibleInterventions = []; // File d'attente des fiches à traiter
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

            await loadClients(); // Recharger la liste des clients pour afficher l'icône mise à jour

            setNotifyModalVisible(false); // Ferme la modal après la mise à jour
        } catch (error) {
            console.error(
                "Erreur lors de la mise à jour de la notification :",
                error
            );
        }
    };

    const loadRepairedNotReturnedCount = async () => {
        try {
            const { data, error } = await supabase
                .from("interventions")
                .select("*")
                .eq("status", "Réparé")
                .eq("restitue", false); // Filtrer les fiches non restituées

            if (error) throw error;

            setRepairedNotReturnedCount(data.length); // Met à jour le nombre
        } catch (error) {
            console.error(
                "Erreur lors du chargement des fiches réparées non restituées:",
                error
            );
        }
    };
    // Fonction pour naviguer vers la page de visualisation des images
    const goToImageGallery = (clientId) => {
        navigation.navigate("ImageGallery", { clientId });
    };

    const loadClients = async (sortBy = "createdAt", orderAsc = false) => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from("clients")
                .select(
                    `
					*, 
					updatedAt, 
					interventions(
						id, 
						status, 
						deviceType,
						brand,
						model, 
						cost,
						solderestant, 
						createdAt, 
						"updatedAt", 
						commande, 
						photos, 
						notifiedBy,
						accept_screen_risk
					)
				`
                )
                .order(sortBy, { ascending: orderAsc });

            if (error) throw error;

            if (data) {
                // Renommer les champs updatedAt pour les clients et les interventions
                const updatedData = data.map((client) => ({
                    ...client,
                    totalInterventions: client.interventions.length,
                    clientUpdatedAt: client.updatedAt, // Renommage manuel pour le champ client
                    interventions: client.interventions.map((intervention) => ({
                        ...intervention,
                        interventionUpdatedAt: intervention.updatedAt, // Renommage manuel pour chaque intervention
                    })),
                }));

                // Filtrer et trier les clients selon les interventions en cours
                const clientsWithOngoingInterventions = updatedData
                    .filter((client) =>
                        client.interventions?.some(
                            (intervention) =>
                                intervention.status !== "Réparé" &&
                                intervention.status !== "Récupéré"
                        )
                    )
                    .map((client) => {
                        client.interventions = client.interventions
                            .filter(
                                (intervention) =>
                                    intervention.status !== "Réparé" &&
                                    intervention.status !== "Récupéré"
                            )
                            .sort(
                                (a, b) =>
                                    new Date(b.createdAt) -
                                    new Date(a.createdAt)
                            );
                        client.latestIntervention = client.interventions[0];
                        return client;
                    });

                // Tri des clients en fonction de sortBy et de orderAsc
                const sortedClients = clientsWithOngoingInterventions.sort(
                    (a, b) => {
                        const dateA = new Date(a[sortBy]);
                        const dateB = new Date(b[sortBy]);
                        return orderAsc ? dateA - dateB : dateB - dateA;
                    }
                );

                setClients(sortedClients);
                setFilteredClients(sortedClients);
            }
        } catch (error) {
            console.error("Erreur lors du chargement des clients:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDetails = (deviceType, marque, model) => {
        setSelectedDevice({
            deviceType,
            brand: marque || "Inconnu", // Valeur par défaut si la marque est vide
            model: model || "Inconnu", // Valeur par défaut si le modèle est vide
        });
        setIsModalVisible(true);
    };

    useEffect(() => {
        loadRepairedNotReturnedCount(); // Charger le nombre de fiches réparées non restituées
    }, []);

    /*     // Charger les données lors du premier rendu
    useEffect(() => {
        setIsLoading(true); // Démarre le loader
        loadClients("createdAt", false); // Tri par date de création en ordre décroissant
    }, []); */

    // Pagination
    const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
    const currentClients = filteredClients.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePageChange = (newPage) => {
        setIsLoading(true); // Démarre le loader lorsque l'utilisateur change de page
        setTimeout(() => {
            setCurrentPage(newPage); // Change la page après un délai simulé
            setIsLoading(false); // Arrête le loader
        }, 0); // Délai pour s'assurer que le loader reste visible pendant un moment
    };

    const goToNextPage = () => {
        if (currentPage < totalPages) {
            handlePageChange(currentPage + 1);
        }
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) {
            handlePageChange(currentPage - 1);
        }
    };
    useFocusEffect(
        React.useCallback(() => {
            // Si un rechargement est demandé depuis une autre page
            if (route.params?.reloadClients) {
                setSortBy("createdAt"); // Tri par date
                setOrderAsc(false); // Tri décroissant
                loadClients(); // Charger les clients triés
            } else {
                // Charger les clients selon les critères actuels
                loadClients(sortBy, orderAsc);
            }

            // Charger le compte des réparés non restitués
            loadRepairedNotReturnedCount();
        }, [route.params?.reloadClients, sortBy, orderAsc])
    );

    const openNotifyModal = () => {
        setAlertVisible(false); // Ferme la modale de nettoyage
        setTransportModalVisible(false);
        setModalVisible(false);
        setNotifyModalVisible(true); // Affiche la modale de notification
    };

    const confirmDeleteClient = (clientId) => {
        setSelectedClientId(clientId);
        setModalVisible(true);
    };
    const handleDeleteClient = async () => {
        try {
            const { data: interventions, error: interventionsError } =
                await supabase
                    .from("interventions")
                    .select("*")
                    .eq("client_id", selectedClientId);

            if (interventionsError) throw interventionsError;

            if (interventions && interventions.length > 0) {
                setAlertVisible(true);
                return;
            }

            const { error } = await supabase
                .from("clients")
                .delete()
                .eq("id", selectedClientId);

            if (error) throw error;

            loadClients();
            setModalVisible(false);
        } catch (error) {
            console.error("Erreur lors de la suppression du client :", error);
        }
    };
    const formatDateTime = (dateString) => {
        try {
            // Convertir la date ISO en heure locale avec le fuseau "Europe/Paris"
            return new Date(dateString).toLocaleString("fr-FR", {
                timeZone: "Europe/Paris", // Force le fuseau horaire
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false, // Format 24 heures
            });
        } catch (error) {
            console.error("Erreur de formatage de la date :", error);
            return "Date invalide";
        }
    };

    const filterClients = async (text) => {
        setSearchText(text);

        if (text.trim() === "") {
            setFilteredClients(clients); // Réinitialise la liste si aucun texte n'est entré
        } else {
            try {
                setIsLoading(true); // Active le loader pendant la recherche

                // Vérification de l'entrée comme nombre entier pour ficheNumber uniquement
                const isNumber = /^\d+$/.test(text.trim()); // Vérifie si le texte est composé uniquement de chiffres

                // Construction de la requête selon la nature de l'entrée
                const { data, error } = await supabase
                    .from("clients")
                    .select(
                        `*, interventions(id, status, deviceType, cost, createdAt, "updatedAt", commande, photos, notifiedBy)`
                    )
                    .or(
                        isNumber
                            ? `ficheNumber.eq.${parseInt(
                                  text,
                                  10
                              )}, phone.ilike.%${text}%`
                            : `name.ilike.%${text}%`
                    );

                if (error) {
                    console.error("Erreur lors de la recherche :", error);
                    return;
                }

                // Appliquer un filtrage local sur les résultats récupérés
                const filteredData = data.map((client) => {
                    const relevantInterventions = client.interventions?.filter(
                        (intervention) =>
                            intervention.status !== "Réparé" &&
                            intervention.status !== "Récupéré"
                    );

                    if (relevantInterventions.length > 0) {
                        client.latestIntervention =
                            relevantInterventions[
                                relevantInterventions.length - 1
                            ];
                        client.latestIntervention.photos =
                            client.latestIntervention.photos || [];
                    } else {
                        client.latestIntervention = null;
                    }

                    return client;
                });

                setFilteredClients(filteredData); // Met à jour la liste des clients filtrés
            } catch (error) {
                console.error(
                    "Erreur lors de la recherche des clients:",
                    error
                );
            } finally {
                setIsLoading(false); // Désactive le loader
            }
        }
    };
    const getIconSource = (status) => {
        switch (status) {
            case "En attente de pièces":
                return require("../assets/icons/shipping.png"); // Image pour "En attente de pièces"
            case "Devis accepté":
                return require("../assets/icons/devisAccepte.png"); // Image pour "Devis accepté"
            case "Réparation en cours":
                return require("../assets/icons/tools1.png"); // Image pour "Réparation en cours"
            case "Réparé":
                return require("../assets/icons/ok.png"); // Image pour "Réparé"
            case "Devis en cours":
                return require("../assets/icons/devisEnCours.png"); // Image pour "Devis en cours"
            default:
                return require("../assets/icons/point-dinterrogation.png"); // Image par défaut
        }
    };
    const getIconColor = (status) => {
        switch (status) {
            case "En attente de pièces":
                return "#b396f8"; // Violet
            case "Devis accepté":
                return "#FFD700"; // Doré
            case "Réparation en cours":
                return "#528fe0"; // Bleu
            case "Réparé":
                return "#006400"; // Vert
            case "Devis en cours":
                return "#f37209"; // Orange
            default:
                return "#555"; // Gris par défaut
        }
    };
    const getStatusStyle = (status) => {
        switch (status) {
            case "En attente de pièces":
                return { borderColor: "#b396f8", borderWidth: 2 };
            case "Devis accepté":
                return { borderColor: "#FFD700", borderWidth: 2 };
            case "Réparation en cours":
                return { borderColor: "#528fe0", borderWidth: 2 };
            case "Réparé":
                return { borderColor: "#98fb98", borderWidth: 2 };
            case "Devis en cours":
                return { borderColor: "#f37209", borderWidth: 2 };
            default:
                return { borderColor: "#e0e0e0", borderWidth: 2 };
        }
    };
    const getDeviceIcon = (deviceType) => {
        switch (deviceType) {
            case "PC portable":
                return (
                    <Image
                        source={require("../assets/icons/portable.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "PC Fixe":
                return (
                    <Image
                        source={require("../assets/icons/ordinateur (1).png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "PC tout en un":
                return (
                    <Image
                        source={require("../assets/icons/allInone.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "Tablette":
                return (
                    <Image
                        source={require("../assets/icons/tablette.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "Smartphone":
                return (
                    <Image
                        source={require("../assets/icons/ordinateur.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "Console":
                return (
                    <Image
                        source={require("../assets/icons/console-de-jeu.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "Disque dur":
                return (
                    <Image
                        source={require("../assets/icons/disque-dur.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "Carte SD":
                return (
                    <Image
                        source={require("../assets/icons/carte-memoire.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "Cle usb":
                return (
                    <Image
                        source={require("../assets/icons/cle-usb.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "Casque audio":
                return (
                    <Image
                        source={require("../assets/icons/playaudio.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "Retro-projecteur":
                return (
                    <Image
                        source={require("../assets/icons/Projector.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            case "Clavier":
                return (
                    <Image
                        source={require("../assets/icons/keyboard.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
            default:
                return (
                    <Image
                        source={require("../assets/icons/point-dinterrogation.png")}
                        style={{ width: 40, height: 40 }}
                    />
                );
        }
    };

    const filterByStatus = (status) => {
        const filtered = clients.filter((client) =>
            client.interventions.some(
                (intervention) => intervention.status === status
            )
        );
        setFilteredClients(filtered);
    };
    const resetFilter = () => {
        setFilteredClients(clients);
    };

    // Légende des statuts
    const Legend = () => (
        <View style={styles.legendContainer}>
            <TouchableOpacity
                onPress={() => filterByStatus("En attente de pièces")}
            >
                <View style={styles.legendItem}>
                    <Image
                        source={require("../assets/icons/shipping.png")} // Chemin vers votre icône
                        style={{ width: 24, height: 24, tintColor: "#5e54eb" }}
                    />
                    <Text style={styles.legendText}>En attente de pièces</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => filterByStatus("Devis accepté")}>
                <View style={styles.legendItem}>
                    <Image
                        source={require("../assets/icons/devisAccepte.png")} // Chemin vers votre icône
                        style={{ width: 20, height: 20, tintColor: "#dbbb04" }}
                    />
                    <Text style={styles.legendText}>Devis accepté</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity
                onPress={() => filterByStatus("Réparation en cours")}
            >
                <View style={styles.legendItem}>
                    <Image
                        source={require("../assets/icons/tools.png")} // Chemin vers votre icône
                        style={{ width: 20, height: 20, tintColor: "#528fe0" }}
                    />
                    <Text style={styles.legendText}>Réparation en cours</Text>
                </View>
            </TouchableOpacity>

            {/* Bouton pour naviguer vers la page RepairedInterventionPage */}
            <TouchableOpacity
                onPress={() => navigation.navigate("RepairedInterventions")}
            >
                <View style={styles.legendItem}>
                    <Image
                        source={require("../assets/icons/ok.png")} // Chemin vers votre icône
                        style={{ width: 20, height: 20, tintColor: "#98fb98" }}
                    />
                    <Text style={styles.legendText}>Réparé</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => filterByStatus("Devis en cours")}>
                <View style={styles.legendItem}>
                    <Image
                        source={require("../assets/icons/devisEnCours.png")} // Chemin vers votre icône
                        style={{ width: 20, height: 20, tintColor: "#f37209" }}
                    />
                    <Text style={styles.legendText}>devis en cours</Text>
                </View>
            </TouchableOpacity>
            {/* Bouton Reset */}
            <TouchableOpacity onPress={resetFilter} style={styles.resetButton}>
                <Image
                    source={require("../assets/icons/reload.png")} // Chemin vers votre icône
                    style={{ width: 20, height: 20, tintColor: "#FF6347" }}
                />
            </TouchableOpacity>
        </View>
    );

    const formatPhoneNumber = (phoneNumber) => {
        if (!phoneNumber) return "";

        return phoneNumber.replace(/(\d{2})(?=\d)/g, "$1 "); // Ajoute un espace après chaque deux chiffres
    };
    return (
        <ImageBackground
            source={backgroundImage}
            style={styles.backgroundImage}
        >
            <View style={styles.overlay}>
                <View style={styles.headerContainer}>
                    <Text style={styles.title}>Fiches clients</Text>
                    {repairedNotReturnedCount > 0 && (
                        <View style={styles.repairedCountContainer}>
                            <TouchableOpacity
                                onPress={() =>
                                    navigation.navigate(
                                        "RepairedInterventionsPage"
                                    )
                                }
                                style={styles.repairedCountButton}
                            >
                                <Image
                                    source={require("../assets/icons/warning.png")} // Chemin vers votre icône
                                    style={{
                                        width: 20,
                                        height: 20,
                                        tintColor: "#fffc47",
                                    }}
                                />
                                <Text style={styles.repairedCountText}>
                                    Produits réparés en attente de restitution :{" "}
                                    {repairedNotReturnedCount}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <Text style={styles.pageNumberText}>
                        Page {currentPage} / {totalPages}
                    </Text>
                </View>
                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Rechercher par nom, téléphone, ou statut"
                        placeholderTextColor="#999"
                        value={searchText}
                        onChangeText={filterClients}
                    />
                    <Image
                        source={require("../assets/icons/search.png")} // Chemin vers votre image
                        style={[
                            styles.searchIcon,
                            { width: 24, height: 24, tintColor: "#999" },
                        ]} // Ajoutez la propriété tintColor pour la couleur
                    />
                </View>

                <View style={styles.buttonContainer}>
                    <View style={styles.buttonWrapper}>
                        <RoundedButton
                            title={
                                <View style={styles.buttonContent}>
                                    <Image
                                        source={require("../assets/icons/calendar.png")} // Remplacez par le chemin de votre image
                                        style={{
                                            width: 20,
                                            height: 20,
                                            tintColor: "black",
                                        }} // Styles de l'image
                                    />
                                    <Text style={styles.buttonTextTrier}>
                                        Trier par{" "}
                                        {sortBy === "createdAt"
                                            ? "date de modification"
                                            : "date de création"}
                                    </Text>
                                </View>
                            }
                            onPress={() =>
                                setSortBy(
                                    sortBy === "createdAt"
                                        ? "updatedAt"
                                        : "createdAt"
                                )
                            }
                        />
                    </View>
                    <View style={styles.buttonWrapper}>
                        <RoundedButton
                            title={
                                <View style={styles.buttonContent}>
                                    <Image
                                        source={require("../assets/icons/filter.png")} // Remplacez par le chemin de votre image
                                        style={{
                                            width: 20,
                                            height: 20,
                                            tintColor: "black",
                                        }} // Styles de l'image
                                    />

                                    <Text style={styles.buttonTextTrier}>
                                        Ordre{" "}
                                        {orderAsc ? "Ascendant" : "Descendant"}
                                    </Text>
                                </View>
                            }
                            onPress={() => setOrderAsc(!orderAsc)}
                        />
                    </View>
                </View>
                {isLoading ? (
                    <View style={styles.loaderContainer}>
                        <ActivityIndicator size={90} color="#e5e8eb" />
                    </View>
                ) : currentClients.length === 0 ? (
                    <Text style={styles.noClientsText}>
                        Aucun client trouvé
                    </Text>
                ) : (
                    <>
                        <FlatList
                            initialNumToRender={10}
                            maxToRenderPerBatch={5}
                            windowSize={5}
                            data={currentClients}
                            keyExtractor={(item) => item.id.toString()}
                            getItemLayout={(data, index) => ({
                                length: 130, // Hauteur de chaque fiche
                                offset: 130 * index,
                                index,
                            })}
                            renderItem={({ item, index }) => {
                                <TouchableOpacity
                                    onPress={() =>
                                        toggleClientExpansion(item.id, index)
                                    }
                                >
                                    {/* Contenu de la fiche */}
                                </TouchableOpacity>;
                                const isEven = index % 2 === 0;
                                const backgroundColor = isEven
                                    ? "#f9f9f9"
                                    : "#e0e0e0";
                                const isExpanded = expandedClientId === item.id;

                                const ongoingInterventions =
                                    item.interventions?.filter(
                                        (intervention) =>
                                            intervention.status !== "Réparé" &&
                                            intervention.status !== "Récupéré"
                                    ) || [];
                                const totalInterventionsEnCours =
                                    ongoingInterventions.length;
                                const totalInterventions = item.interventions
                                    ? item.interventions.length
                                    : 0;
                                const latestIntervention =
                                    item.latestIntervention;
                                const status = latestIntervention
                                    ? latestIntervention.status
                                    : "Aucun statut";
                                const totalImages =
                                    latestIntervention?.photos?.length || 0;
                                const commande = latestIntervention?.commande;

                                return (
                                    // <View style={[styles.clientCard, { backgroundColor:backgroundColor }]}>
                                    <Animatable.View
                                        animation="fadeInUp" // Animation au choix
                                        duration={600}
                                        delay={index * 100} // Délai basé sur l'index pour un effet progressif
                                    >
                                        <View
                                            style={[
                                                styles.clientCard,
                                                getStatusStyle(status),
                                            ]}
                                        >
                                            <View style={styles.statusContent}>
                                                <View style={styles.iconCircle}>
                                                    <Image
                                                        source={getIconSource(
                                                            status
                                                        )}
                                                        style={{
                                                            width: 20,
                                                            height: 20,
                                                            tintColor:
                                                                getIconColor(
                                                                    status
                                                                ), // Ajoute la couleur définie
                                                        }}
                                                    />
                                                </View>
                                                <Text style={styles.statusText}>
                                                    {item.latestIntervention
                                                        ?.status ||
                                                        "Aucun statut"}
                                                </Text>
                                            </View>
                                            {/* Informations de base du client */}
                                            <TouchableOpacity
                                                onPress={() =>
                                                    toggleClientExpansion(
                                                        item.id
                                                    )
                                                }
                                                style={styles.clientInfo}
                                            >
                                                <Text
                                                    style={styles.ficheNumber}
                                                >
                                                    Numéro de client N°{" "}
                                                    {item.ficheNumber}
                                                </Text>
                                                <Text style={styles.clientText}>
                                                    Nom :{" "}
                                                    {item.name.toUpperCase()}
                                                </Text>
                                                <View
                                                    style={
                                                        styles.phoneContainer
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.clientText
                                                        }
                                                    >
                                                        Téléphone :{" "}
                                                    </Text>
                                                    <Text
                                                        style={
                                                            styles.phoneNumber
                                                        }
                                                    >
                                                        {formatPhoneNumber(
                                                            item.phone
                                                        )}
                                                    </Text>
                                                </View>
                                                {latestIntervention?.accept_screen_risk && (
                                                    <Text
                                                        style={
                                                            styles.acceptRiskText
                                                        }
                                                    >
                                                        Le client a accepté le
                                                        risque de casse. Oui
                                                    </Text>
                                                )}
                                                <Text style={styles.clientText}>
                                                    Date de création :{" "}
                                                    {formatDateTime(
                                                        item.createdAt
                                                    )}
                                                </Text>
                                                {item.updatedAt && (
                                                    <Text
                                                        style={
                                                            styles.clientText
                                                        }
                                                    >
                                                        Infos client modifiées
                                                        le :{" "}
                                                        {formatDateTime(
                                                            item.updatedAt
                                                        )}
                                                    </Text>
                                                )}
                                                {item.interventions?.[0]
                                                    ?.interventionUpdatedAt && (
                                                    <Text
                                                        style={
                                                            styles.clientText
                                                        }
                                                    >
                                                        Intervention mise à jour
                                                        le :{" "}
                                                        {formatDateTime(
                                                            item
                                                                .interventions[0]
                                                                .interventionUpdatedAt
                                                        )}
                                                    </Text>
                                                )}
                                            </TouchableOpacity>

                                            {/* Section des icônes principales à droite */}
                                            <View
                                                style={styles.topRightButtons}
                                            >
                                                <View
                                                    style={{
                                                        flexDirection: "row",
                                                    }}
                                                >
                                                    {/* Icône de commande avec contour, affichée à gauche de l'icône d'édition si applicable */}
                                                    {status ===
                                                        "En attente de pièces" &&
                                                        commande && (
                                                            <TouchableOpacity
                                                                style={[
                                                                    styles.iconButton,
                                                                    styles.editButton,
                                                                ]}
                                                                onPress={() => {
                                                                    setSelectedCommande(
                                                                        commande
                                                                    );
                                                                    setTransportModalVisible(
                                                                        true
                                                                    );
                                                                }}
                                                            >
                                                                <Image
                                                                    source={require("../assets/icons/shipping.png")} // Chemin vers votre icône poubelle
                                                                    style={{
                                                                        width: 28,
                                                                        height: 28,
                                                                        tintColor:
                                                                            "#5906f3", // Couleur de l'icône (ici noir)
                                                                    }}
                                                                />
                                                            </TouchableOpacity>
                                                        )}

                                                    <TouchableOpacity
                                                        style={[
                                                            styles.iconButton,
                                                            styles.editButton,
                                                        ]}
                                                        onPress={() =>
                                                            navigation.navigate(
                                                                "EditClient",
                                                                { client: item }
                                                            )
                                                        }
                                                    >
                                                        <Image
                                                            source={require("../assets/icons/edit.png")} // Chemin vers votre icône poubelle
                                                            style={{
                                                                width: 28,
                                                                height: 28,
                                                                tintColor:
                                                                    "#000", // Couleur de l'icône (ici noir)
                                                            }}
                                                        />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.iconButton,
                                                            styles.printButton,
                                                        ]}
                                                        onPress={() =>
                                                            navigation.navigate(
                                                                "ClientPreviewPage",
                                                                {
                                                                    clientId:
                                                                        item.id,
                                                                }
                                                            )
                                                        }
                                                    >
                                                        <Image
                                                            source={require("../assets/icons/print.png")} // Chemin vers votre icône poubelle
                                                            style={{
                                                                width: 28,
                                                                height: 28,
                                                                tintColor:
                                                                    "#000", // Couleur de l'icône (ici noir)
                                                            }}
                                                        />
                                                    </TouchableOpacity>
                                                    {totalImages > 0 && (
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.iconButton,
                                                                styles.photoButton,
                                                            ]}
                                                            onPress={() =>
                                                                goToImageGallery(
                                                                    item.id
                                                                )
                                                            }
                                                        >
                                                            <Image
                                                                source={require("../assets/icons/image.png")} // Chemin vers votre icône poubelle
                                                                style={{
                                                                    width: 28,
                                                                    height: 28,
                                                                    tintColor:
                                                                        "#000", // Couleur de l'icône (ici noir)
                                                                }}
                                                            />
                                                        </TouchableOpacity>
                                                    )}
                                                    <TouchableOpacity
                                                        style={[
                                                            styles.iconButton,
                                                            styles.trashButton,
                                                        ]}
                                                        onPress={() =>
                                                            confirmDeleteClient(
                                                                item.id
                                                            )
                                                        }
                                                    >
                                                        <Image
                                                            source={require("../assets/icons/trash.png")} // Chemin vers votre icône poubelle
                                                            style={{
                                                                width: 28,
                                                                height: 28,
                                                                tintColor:
                                                                    "#000", // Couleur de l'icône (ici noir)
                                                            }}
                                                        />
                                                    </TouchableOpacity>
                                                    {/* Section additionnelle pour les icônes de notification et tools sous les icônes principales */}
                                                </View>
                                                <View
                                                    style={
                                                        styles.additionalIconsContainer
                                                    }
                                                >
                                                    <View
                                                        style={{
                                                            flexDirection:
                                                                "row",
                                                            justifyContent:
                                                                "flex-end",
                                                        }}
                                                    >
                                                        {/* Icône de notification pour SMS ou appel */}
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.iconButton,
                                                                styles.notificationIconContainer,
                                                            ]}
                                                            onPress={() => {
                                                                setSelectedInterventionId(
                                                                    latestIntervention.id
                                                                );
                                                                setNotifyModalVisible(
                                                                    true
                                                                );
                                                            }}
                                                        >
                                                            {latestIntervention?.notifiedBy ===
                                                            "SMS" ? (
                                                                <Image
                                                                    source={require("../assets/icons/sms.png")} // Chemin vers votre icône poubelle
                                                                    style={{
                                                                        width: 28,
                                                                        height: 28,
                                                                        tintColor:
                                                                            "#000", // Couleur de l'icône (ici noir)
                                                                    }}
                                                                />
                                                            ) : latestIntervention?.notifiedBy ===
                                                              "Téléphone" ? (
                                                                <Image
                                                                    source={require("../assets/icons/call.png")} // Chemin vers votre icône poubelle
                                                                    style={{
                                                                        width: 28,
                                                                        height: 28,
                                                                        tintColor:
                                                                            "#000", // Couleur de l'icône (ici noir)
                                                                    }}
                                                                />
                                                            ) : (
                                                                <Image
                                                                    source={require("../assets/icons/notifications_off.png")} // Chemin vers votre icône poubelle
                                                                    style={{
                                                                        width: 28,
                                                                        height: 28,
                                                                        tintColor:
                                                                            "#000", // Couleur de l'icône (ici noir)
                                                                    }}
                                                                />
                                                            )}
                                                        </TouchableOpacity>

                                                        {/* Icône pour le nombre d'interventions avec contour, placée à droite de l'icône de notification */}
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.iconButton,
                                                                styles.interventionContainer,
                                                            ]}
                                                            onPress={() =>
                                                                navigation.navigate(
                                                                    "ClientInterventionsPage",
                                                                    {
                                                                        clientId:
                                                                            item.id,
                                                                    }
                                                                )
                                                            }
                                                        >
                                                            <Image
                                                                source={require("../assets/icons/tools.png")} // Chemin vers votre icône poubelle
                                                                style={{
                                                                    width: 28,
                                                                    height: 28,
                                                                    tintColor:
                                                                        "#000", // Couleur de l'icône (ici noir)
                                                                }}
                                                            />
                                                            <Text
                                                                style={
                                                                    styles.interventionsCount
                                                                }
                                                            >
                                                                {" "}
                                                                {
                                                                    item.totalInterventions
                                                                }
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            </View>

                                            {/* Détails supplémentaires visibles uniquement si la fiche est déployée */}
                                            {isExpanded && (
                                                <View
                                                    style={
                                                        styles.expandedContent
                                                    }
                                                >
                                                    {status ===
                                                        "En attente de pièces" &&
                                                        commande && (
                                                            <Text
                                                                style={
                                                                    styles.commandeText
                                                                }
                                                            >
                                                                En commande :{" "}
                                                                {commande}
                                                            </Text>
                                                        )}
                                                    <Text
                                                        style={
                                                            styles.clientText
                                                        }
                                                    >
                                                        Montant :{" "}
                                                        {latestIntervention?.cost?.toLocaleString(
                                                            "fr-FR",
                                                            {
                                                                minimumFractionDigits: 2,
                                                            }
                                                        )}{" "}
                                                        €
                                                    </Text>
                                                    {/* Ajout du solde restant dû */}
                                                    {latestIntervention?.solderestant !==
                                                        undefined &&
                                                        latestIntervention?.solderestant >
                                                            0 && (
                                                            <Text
                                                                style={
                                                                    styles.clientTextSoldeRestant
                                                                }
                                                            >
                                                                Solde restant dû
                                                                :{" "}
                                                                {latestIntervention.solderestant.toLocaleString(
                                                                    "fr-FR",
                                                                    {
                                                                        minimumFractionDigits: 2,
                                                                    }
                                                                )}{" "}
                                                                €
                                                            </Text>
                                                        )}
                                                    <Text
                                                        style={
                                                            styles.clientText
                                                        }
                                                    >
                                                        Nombre d'images :{" "}
                                                        {totalImages}
                                                    </Text>
                                                    <Text
                                                        style={
                                                            styles.clientText
                                                        }
                                                    >
                                                        Interventions en cours :{" "}
                                                        {
                                                            totalInterventionsEnCours
                                                        }
                                                    </Text>
                                                    {item.interventions &&
                                                        item.interventions
                                                            .length > 0 && (
                                                            <View
                                                                style={[
                                                                    styles.deviceIconContainer,
                                                                    {
                                                                        flexDirection:
                                                                            "row",
                                                                    },
                                                                ]}
                                                            >
                                                                {item.interventions
                                                                    .filter(
                                                                        (
                                                                            intervention
                                                                        ) =>
                                                                            intervention.status !==
                                                                                "Réparé" &&
                                                                            intervention.status !==
                                                                                "Récupéré"
                                                                    ) // Filtrer uniquement les interventions en cours
                                                                    .map(
                                                                        (
                                                                            intervention,
                                                                            index
                                                                        ) => (
                                                                            <View
                                                                                key={
                                                                                    index
                                                                                }
                                                                                style={{
                                                                                    marginLeft: 5,
                                                                                }}
                                                                            >
                                                                                <TouchableOpacity
                                                                                    onPress={() =>
                                                                                        fetchDetails(
                                                                                            intervention.deviceType, // Type d'appareil
                                                                                            intervention.brand, // Nom de la marque
                                                                                            intervention.model // Nom du modèle
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    {getDeviceIcon(
                                                                                        intervention.deviceType
                                                                                    )}
                                                                                </TouchableOpacity>
                                                                            </View>
                                                                        )
                                                                    )}
                                                            </View>
                                                        )}
                                                </View>
                                            )}
                                        </View>
                                    </Animatable.View>
                                );
                            }}
                            showsVerticalScrollIndicator={false}
                        />

                        <View style={styles.paginationContainer}>
                            <TouchableOpacity
                                onPress={goToPreviousPage}
                                disabled={currentPage === 1}
                            >
                                <Image
                                    source={require("../assets/icons/chevrong.png")} // Chemin vers l'image personnalisée
                                    style={{
                                        width: 32, // Largeur de l'image
                                        height: 32, // Hauteur de l'image
                                        tintColor:
                                            currentPage === 1
                                                ? "#202020"
                                                : "#ffffff", // Couleur dynamique
                                    }}
                                />
                            </TouchableOpacity>
                            <Text style={styles.paginationText}>
                                Page {currentPage} sur {totalPages}
                            </Text>
                            <TouchableOpacity
                                onPress={goToNextPage}
                                disabled={currentPage === totalPages}
                            >
                                <Image
                                    source={require("../assets/icons/chevrond.png")} // Chemin vers l'image personnalisée
                                    style={{
                                        width: 32, // Largeur de l'image
                                        height: 32, // Hauteur de l'image
                                        tintColor:
                                            currentPage === 1
                                                ? "#ffffff"
                                                : "#202020", // Couleur dynamique
                                    }}
                                />
                            </TouchableOpacity>
                        </View>
                    </>
                )}
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
                                    <Text style={styles.buttonText}>SMS</Text>
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
                                    <Text style={styles.buttonText}>
                                        Téléphone
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.button}
                                    onPress={() => setNotifyModalVisible(false)}
                                >
                                    <Text style={styles.buttonText}>
                                        Annuler
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                <Modal
                    transparent={true}
                    visible={transportModalVisible}
                    animationType="fade"
                    onRequestClose={() => setTransportModalVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.alertBox}>
                            <Text style={styles.alertTitle}>
                                Commande en cours
                            </Text>
                            {selectedCommande ? (
                                <>
                                    <Text
                                        style={[
                                            styles.alertMessage,
                                            {
                                                fontWeight: "bold",
                                                fontSize: 25,
                                            },
                                        ]}
                                    >
                                        {selectedCommande}
                                    </Text>
                                </>
                            ) : (
                                <Text style={styles.alertMessage}>
                                    Aucune commande en cours
                                </Text>
                            )}
                            <TouchableOpacity
                                style={styles.button}
                                onPress={() => setTransportModalVisible(false)}
                            >
                                <Text style={styles.buttonText}>Fermer</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
                <Modal
                    visible={isModalVisible}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setIsModalVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.alertBox}>
                            <Text style={styles.alertTitle}>
                                Détails du matériel
                            </Text>
                            {selectedDevice && (
                                <>
                                    <Text style={styles.modalText}>
                                        Type : {selectedDevice.deviceType}
                                    </Text>
                                    <Text style={styles.modalText}>
                                        Marque : {selectedDevice.brand}
                                    </Text>
                                    <Text style={styles.modalText}>
                                        Modèle : {selectedDevice.model}
                                    </Text>
                                </>
                            )}
                            <TouchableOpacity
                                style={styles.button}
                                onPress={() => setIsModalVisible(false)}
                            >
                                <Text style={styles.buttonText}>Fermer</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                <Modal
                    transparent={true}
                    visible={modalVisible}
                    animationType="fade"
                    onRequestClose={() => setModalVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.alertBox}>
                            <Text style={styles.alertTitle}>
                                Confirmer la suppression
                            </Text>
                            <Text style={styles.alertMessage}>
                                Êtes-vous sûr de vouloir supprimer cette fiche
                                client ?
                            </Text>
                            <View style={styles.alertButtons}>
                                <TouchableOpacity
                                    style={styles.button}
                                    onPress={() => setModalVisible(false)}
                                >
                                    <Text style={styles.buttonText}>
                                        Annuler
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.button}
                                    onPress={handleDeleteClient}
                                >
                                    <Text style={styles.buttonText}>
                                        Supprimer
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
                <Modal
                    transparent={true}
                    visible={alertVisible}
                    animationType="fade"
                    onRequestClose={() => setAlertVisible(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.alertBox}>
                            <Text style={styles.alertTitle}>
                                Suppression impossible
                            </Text>
                            <Text style={styles.alertMessage}>
                                Ce client ne peut pas être supprimé car il a des
                                interventions associées.
                            </Text>
                            <TouchableOpacity
                                style={styles.button}
                                onPress={() => setAlertVisible(false)}
                            >
                                <Text style={styles.buttonText}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
                {cleanupModalVisible && (
                    <Modal
                        transparent={true}
                        visible={cleanupModalVisible}
                        animationType="fade"
                        onRequestClose={() => setCleanupModalVisible(false)}
                    >
                        <View style={styles.modalOverlay}>
                            <View style={styles.alertBox}>
                                <Text style={styles.alertTitle}>
                                    {alertTitle}
                                </Text>
                                <Text style={styles.alertMessage}>
                                    {alertMessage}
                                </Text>
                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={styles.modalButton}
                                        onPress={handlePhotoCleanup}
                                    >
                                        <Text style={styles.modalButtonText}>
                                            Nettoyer
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.modalButton}
                                        onPress={() =>
                                            setCleanupModalVisible(false)
                                        }
                                    >
                                        <Text style={styles.modalButtonText}>
                                            Annuler
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                )}
            </View>
            <View style={styles.legendWrapper}>
                <Legend />
            </View>
        </ImageBackground>
    );
}
const styles = StyleSheet.create({
    searchContainer: {
        position: "relative", // Pour permettre le positionnement absolu de l'icône
        borderRadius: 8,
    },
    searchIcon: {
        marginTop: 10,
        position: "absolute",
        right: 10, // Positionné à droite à 10px du bord
        zIndex: 1, // Place l'icône au-dessus du TextInput
    },
    repairedCountContainer: {
        padding: 10,
        backgroundColor: "#202020",
        borderRadius: 5,
        marginTop: 10,
    },
    repairedCountButton: {
        flexDirection: "row", // Pour aligner l'icône et le texte horizontalement
        alignItems: "center", // Pour centrer le texte à l'intérieur du bouton
    },
    repairedCountText: {
        color: "#ffee04",
        fontWeight: "bold",
        textAlign: "center",
        fontSize: 16,
        marginLeft: 8,
    },
    searchInput: {
        paddingRight: 50, // Ajoute un espace à droite pour l'icône
        height: "100%", // Prend toute la hauteur du conteneur
        color: "#333333",
        fontSize: 20,
        paddingLeft: 10, // Un petit padding à gauche pour l'esthétique
    },

    backgroundImage: {
        flex: 1,
        resizeMode: "cover", // L'image couvre toute la page
    },
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.459)", // Voile sombre pour améliorer la lisibilité
        padding: 20,
    },
    headerContainer: {
        flexDirection: "row",
        justifyContent: "space-between", // Aligner le titre à gauche et la page à droite
        alignItems: "center",
        marginBottom: 20, // Vous pouvez ajuster la marge en fonction de l'espace que vous souhaitez
    },
    pageNumberText: {
        fontSize: 20,
        color: "#fff", // Assurez-vous que la couleur correspond à votre thème
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
        color: "#fff",
    },
    searchInput: {
        borderWidth: 1,
        borderColor: "#cccccc",
        padding: 10,
        marginBottom: 20,
        borderRadius: 8,
        backgroundColor: "#e0e0e0",
        color: "#333333",
        fontSize: 16,
    },
    clientCard: {
        borderWidth: 1,
        borderColor: "#ddd",
        padding: 10,
        marginVertical: 5,
        borderRadius: 5,
        backgroundColor: "#e0e0e0",
    },
    clientInfo: {
        flex: 1,
        paddingRight: 10,
    },
    ficheNumber: {
        fontSize: 18,
        fontWeight: "bold",
    },
    clientText: {
        fontSize: 16,
    },
    clientTextSoldeRestant: {
        fontSize: 18,
        color: "#920404", // Rouge orangé pour attirer l'attention
        fontWeight: "bold",
    },
    expandedContent: {
        paddingTop: 10,
        backgroundColor: "#e0e0e0",
        marginTop: 10,
        width: "100%",
    },
    progressBarContainer: {
        height: 3,
        width: "100%",
        backgroundColor: "#e0e0e0", // Couleur de fond de la barre (pour le reste non rempli)
        borderRadius: 5,
        marginTop: 10,
        marginBottom: 10,
    },
    deviceIconContainer: {
        position: "absolute",
        bottom: 10,
        right: 10,
    },
    clientInfo: {
        flex: 1,
    },
    ficheNumber: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#000",
        marginBottom: 5,
    },
    phoneContainer: {
        flexDirection: "row",
        alignItems: "center",
    },
    phoneNumber: {
        fontSize: 22,
        fontWeight: "bold",
        color: "#000",
    },
    newIconContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    clientText: {
        fontSize: 16,
        color: "#000",
    },
    statusText: {
        fontSize: 20,
        fontStyle: "normal",
        fontWeight: "bold",
        marginBottom: 10,
        color: "#802d07",
    },
    commandeText: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#ff4500", // Couleur pour rendre le texte de la commande plus visible
    },
    stateText: {
        fontSize: 18,
        marginBottom: 5,
        color: "#4c09f6",
    },
    topRightButtons: {
        position: "absolute",
        top: 10,
        right: 10,
        gap: 10,
    },
    photoButton: {
        padding: 10,
        borderRadius: 5,
        borderColor: "#000",
        borderWidth: 2,
        marginRight: 10,
    },
    editButton: {
        //backgroundColor: '#17a2b8',  // Bleu pour l'icône d'édition
        padding: 10,
        borderRadius: 5,
        marginRight: 10,
        borderColor: "#000", // Couleur de la bordure (noire)
        borderWidth: 2, // Épaisseur de la bordure
    },
    printButton: {
        //backgroundColor: '#28a745',  // Vert pour l'icône d'impression
        padding: 10,
        borderRadius: 5,
        marginRight: 10,
        borderColor: "#000", // Couleur de la bordure (noire)
        borderWidth: 2, // Épaisseur de la bordure
    },
    trashButton: {
        //backgroundColor: '#dc3545',  // Rouge pour l'icône de poubelle
        padding: 10,
        borderRadius: 5,
        borderColor: "#000", // Couleur de la bordure (noire)
        borderWidth: 2, // Épaisseur de la bordure
    },
    transportButton: {
        padding: 10,
        borderRadius: 5,
        marginRight: 10,
        borderColor: "#000", // Couleur de la bordure (noire)
        borderWidth: 2, // Épaisseur de la bordure
    },
    rightSection: {
        flexDirection: "column",
        alignItems: "flex-end",
    },
    totalInterventionsText: {
        fontSize: 16,
        fontWeight: "light",
        fontStyle: "italic",
        color: "#5e5e5e",
    },
    commandeText: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#8a20f3",
    },
    sortButtonContainer: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginBottom: 25,
        marginTop: 10,
    },
    noClientsText: {
        textAlign: "center",
        fontSize: 18,
        marginTop: 20,
        color: "#fff",
    },
    paginationContainer: {
        paddingBottom: 40,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 20,
    },
    paginationText: {
        fontSize: 16,
        marginHorizontal: 10,
        color: "#fff",
    },
    disabledPaginationText: {
        fontSize: 16,
        marginHorizontal: 10,
        color: "#ccc",
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
    alertButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    modalButtonRow: {
        flexDirection: "row", // Aligne les boutons en ligne
        justifyContent: "space-between", // Ajoute de l'espace entre les boutons
        marginTop: 20, // Espace au-dessus des boutons
    },
    button: {
        backgroundColor: "#007BFF",
        padding: 10,
        borderRadius: 10,
        marginHorizontal: 5, // Espace entre les boutons
        minWidth: 80, // Largeur minimale pour chaque bouton
        alignItems: "center", // Centre le texte à l'intérieur du bouton
    },
    buttonText: {
        color: "#fff",
        fontWeight: "bold",
    },
    legendWrapper: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingVertical: 10,
        // borderTopWidth: 1,
    },
    legendContainer: {
        marginTop: 20,
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
    },
    legendItem: {
        flexDirection: "row",
        alignItems: "center",
    },
    legendColor: {
        width: 15,
        height: 15,
        borderRadius: 7.5,
        marginRight: 10,
    },
    legendText: {
        fontSize: 14,
        color: "#fff",
        marginLeft: 3,
    },
    interventionContainer: {
        flexDirection: "row", // Aligne l'icône et le texte côte à côte
        alignItems: "center", // Centre verticalement
        padding: 10, // Padding pour l'icône
        borderWidth: 2, // Bordure de 2px
        borderRadius: 5, // Bords arrondis
        borderColor: "#000", // Couleur de la bordure en noir
        backgroundColor: "#fff", // Fond blanc
    },
    interventionContainerRight: {
        marginTop: 70, // Espacement du haut
    },
    interventionBox: {
        flexDirection: "row", // Aligner l'icône et le texte en ligne
        alignItems: "center", // Centrer verticalement
        padding: 10, // Ajouter du padding à l'intérieur du rectangle
        borderWidth: 2, // Épaisseur de la bordure
        borderRadius: 10, // Bordures arrondies pour correspondre au style des autres icônes
        borderColor: "#000", // Couleur de la bordure (vous pouvez l'adapter à vos besoins)
        backgroundColor: "#fff", // Couleur de fond (adaptez-la si nécessaire)
        shadowColor: "#000", // Ombre (si cela correspond au style des autres icônes)
        shadowOpacity: 0.2, // Légère opacité pour l'ombre
        shadowOffset: { width: 2, height: 2 },
    },
    interventionsCount: {
        fontSize: 16,
        fontWeight: "bold",
        marginLeft: 5, // Espace entre l'icône et le texte
        color: "#000", // Couleur du texte
    },
    progressBarContainer: {
        height: 3,
        width: "100%",
        backgroundColor: "#e0e0e0", // Couleur de fond de la barre (pour le reste non rempli)
        borderRadius: 5,
        marginTop: 10,
        marginBottom: 10,
    },
    progressBar: {
        height: "100%",
        borderRadius: 5, // Bordures arrondies pour correspondre au style général
    },
    interventionsEnCoursContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 10,
    },
    interventionCountCircle: {
        width: 30, // Taille du cercle
        height: 30, // Taille du cercle
        borderRadius: 15, // Forme circulaire
        backgroundColor: "#32CD32", // Vert
        justifyContent: "center", // Centre verticalement
        alignItems: "center", // Centre horizontalement
        marginLeft: 10, // Espace entre le texte et le cercle
    },
    interventionCountText: {
        color: "#fff", // Texte blanc
        fontWeight: "bold", // Texte en gras
        fontSize: 16, // Taille du texte
    },
    totalInterventions: {
        color: "#fff", // Texte blanc
        fontWeight: "bold", // Texte en gras
        fontSize: 16, // Taille du texte
    },
    loaderContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    iconRowContainer: {
        flexDirection: "row", // Aligne les icônes horizontalement
        alignItems: "center", // Centre verticalement les icônes
    },
    notificationIconContainer: {
        padding: 10, // Padding pour l'icône
        borderRadius: 5, // Bords arrondis
        borderWidth: 2, // Bordure de 2px
        borderColor: "#000", // Couleur de la bordure en noir
        marginRight: 10, // Espace à droite de l'icône pour séparer les icônes
        backgroundColor: "#fff", // Fond blanc
    },
    interventionIconContainer: {
        flexDirection: "row", // Aligne l'icône et le texte côte à côte
        alignItems: "center", // Centre verticalement
        padding: 10, // Padding pour l'icône
        borderWidth: 2, // Bordure de 2px
        borderRadius: 5, // Bords arrondis
        borderColor: "#000", // Couleur de la bordure en noir
        backgroundColor: "#fff", // Fond blanc
    },

    icon: {
        marginRight: 5,
    },
    sortButtonContainer: {
        flexDirection: "row", // Aligne les boutons côte à côte
        justifyContent: "space-between", // Espace entre les boutons
        paddingHorizontal: 10, // Espacement de chaque côté du conteneur
    },
    buttonWrapper: {
        width: "48%",
        paddingVertical: 20, // Chaque bouton occupe 45% de la largeur
    },
    repairedCountButton: {
        flexDirection: "row", // Pour aligner l'icône et le texte horizontalement
        alignItems: "center", // Pour centrer verticalement l'icône et le texte
        // Autres styles selon vos besoins
    },
    buttonContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    buttonContent: {
        flexDirection: "row",
        alignItems: "center",
    },
    buttonTextTrier: {
        marginLeft: 8,
        fontSize: 16, // Taille du texte du nombre d'interventions
        color: "#202020",
    },
    modalButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
        width: "100%",
    },
    modalButton: {
        backgroundColor: "#ddd",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 5,
        marginHorizontal: 10,
        alignItems: "center",
    },
    modalButtonText: {
        color: "#000",
        fontWeight: "bold",
    },
    acceptRiskText: {
        fontSize: 16,
        color: "red",
    },
    modalContent: {
        width: "50%",
        backgroundColor: "#fff",
        padding: 20,
        borderRadius: 10,
        alignItems: "center",
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 15,
    },
    modalText: {
        fontSize: 16,
        marginBottom: 10,
    },
    paginationContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
    },
    paginationText: {
        fontSize: 20,
        color: "#fff",
    },

    statusContent: {
        flexDirection: "row", // Aligne l'icône et le texte côte à côte
        alignItems: "center", // Centrage vertical
        marginBottom: 10,
    },

    statusText: {
        color: "#202020", // Couleur du texte
        fontWeight: "bold",
        fontSize: 20,
    },
    iconCircle: {
        width: 32, // Diamètre du cercle
        height: 32, // Diamètre du cercle
        borderRadius: 5, // Moitié de la largeur/hauteur pour faire un cercle
        backgroundColor: "#2e2d2d", // Couleur de fond gris
        justifyContent: "center", // Centrage de l'icône à l'intérieur du cercle
        alignItems: "center", // Centrage de l'icône à l'intérieur du cercle
        marginRight: 8, // Espace entre le cercle et le texte
    },
});
