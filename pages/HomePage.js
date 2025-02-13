import React, { useState, useEffect, useRef, useCallback  } from "react";
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
    Alert,
    Animated,
    TouchableWithoutFeedback,
    StatusBar,
} from "react-native";
import { supabase } from "../supabaseClient";
import { useFocusEffect, CommonActions } from "@react-navigation/native";
import RoundedButton from "../components/RoundedButton";
import * as Animatable from "react-native-animatable";
import BottomMenu from "../components/BottomMenu";
// Import de l'image depuis le dossier assets
export default function HomePage({ navigation, route }) {
    const backgroundImage = require("../assets/listing2.jpg");
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
    const [hasImagesToDelete, setHasImagesToDelete] = useState(false);
    const [notifyModalVisible, setNotifyModalVisible] = useState(false); // Gérer la visibilité de la modal de notification
    const [selectedInterventionId, setSelectedInterventionId] = useState(null); // Stocker l'ID de l'intervention sélectionnée
    const [repairedNotReturnedCount, setRepairedNotReturnedCount] = useState(0);
    const [NotRepairedNotReturnedCount, setNotRepairedNotReturnedCount] =
        useState(0);
    const hasPendingOrder =
        Array.isArray(orders) &&
        orders.some(
            (order) => order.client_id === String(item.id) && !order.paid
        );

    const [expandedClientId, setExpandedClientId] = useState(null);
    const [activeModal, setActiveModal] = useState(null); // null si aucune modale active
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [processLogs, setProcessLogs] = useState([]); // État pour stocker les messages de log
    const slideAnim = useRef(new Animated.Value(-250)).current; // Position initiale hors écran
    const [menuVisible, setMenuVisible] = useState(false);
    const [showClients, setShowClients] = useState(true); // Par défaut, les fiches sont masquées
    const [allInterventions, setAllInterventions] = useState([]);
    const [modalData, setModalData] = useState({
        title: "",
        message: "",
        onConfirm: null,
    });
    const [paginatedClients, setPaginatedClients] = useState([]);
    const itemsPerPage = 3;
    const checkImagesToDelete = async () => {
        setIsLoading(true);
        try {
            const dateLimite = new Date(
                Date.now() - 10 * 24 * 60 * 60 * 1000
            ).toISOString();

            // Récupération des interventions
            const { data: interventions, error: interventionError } =
                await supabase
                    .from("interventions")
                    .select("id, photos")
                    .eq("status", "Récupéré")
                    .lte('"updatedAt"', dateLimite)
                    .not("photos", "eq", "[]");

            if (interventionError) throw interventionError;

            const interventionIds = interventions.map(
                (intervention) => intervention.id
            );

            // Compter les images dans intervention_images
            const { count: countImages, error: imagesError } = await supabase
                .from("intervention_images")
                .select("id", { count: "exact" })
                .in("intervention_id", interventionIds);

            if (imagesError) throw imagesError;

            // Compter les photos valides dans interventions
            let countPhotos = 0;
            interventions.forEach((intervention) => {
                try {
                    const photos = intervention.photos;
                    if (photos && typeof photos === "string") {
                        // Vérification si la valeur est un tableau JSON
                        if (photos.startsWith("[") && photos.endsWith("]")) {
                            const photosArray = JSON.parse(photos);
                            if (Array.isArray(photosArray)) {
                                countPhotos += photosArray.length;
                            }
                        } else {
                            console.warn(
                                `La valeur de photos pour l'intervention ${intervention.id} n'est pas un tableau JSON.`
                            );
                        }
                    }
                } catch (err) {
                    console.error(
                        `Erreur de parsing JSON pour l'intervention ${intervention.id}:`,
                        err
                    );
                }
            });

            setHasImagesToDelete(
                (countImages || 0) > 0 || (countPhotos || 0) > 0
            );
        } catch (error) {
            console.error("Erreur lors de la vérification des images :", error);
        } finally {
            setIsLoading(false);
        }
    };
    useEffect(() => {
        loadOrders(); // 🔄 Recharge la liste des commandes dès qu'il y a un changement
    }, [orders]);
    useEffect(() => {
        checkImagesToDelete();
    }, []);
    const handleLoadRecoveredInterventions = async () => {
        try {
            const { data: interventions, error } = await supabase
                .from("interventions")
                .select("id, photos, updatedAt, status")
                .eq("status", "Récupéré");

            if (error) {
                console.error(
                    "Erreur lors de la récupération des interventions récupérées :",
                    error
                );
                return [];
            }

            // Récupérer les interventions avec photos plus anciennes que 10 jours
            const filteredInterventions = interventions.filter(
                (intervention) => {
                    const dateRestitution = new Date(intervention.updatedAt);
                    const now = new Date();
                    const diffInDays =
                        (now - dateRestitution) / (1000 * 60 * 60 * 24);
                    return diffInDays >= 10 && intervention.photos.length > 0;
                }
            );

            return filteredInterventions;
        } catch (error) {
            console.error(
                "Erreur lors du chargement des interventions récupérées :",
                error
            );
            return [];
        }
    };
    const calculateTotalOngoingCost = (clients) => {
        // Extraire toutes les interventions des clients
        const allInterventions = clients.flatMap((client) =>
            client.interventions.filter((intervention) =>
                [
                    "Réparé",
                    "Réparation en cours",
                    "En attente de pièces",
                ].includes(intervention.status)
            )
        );

        // Calculer la somme totale
        const totalCost = allInterventions.reduce(
            (sum, intervention) => sum + (intervention.solderestant || 0),
            0
        );

        return totalCost.toFixed(2); // Retourne un format en 2 décimales
    };

    const [totalCost, setTotalCost] = useState(0);
    useEffect(() => {
        if (clients.length > 0) {
            const total = calculateTotalOngoingCost(clients);
            setTotalCost(total); // Met à jour le montant total
        }
    }, [clients]);

    useEffect(() => {
        // Calculer les fiches à afficher pour la page courante
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;

        // Appliquer la pagination uniquement sur les fiches actuellement visibles
        const clientsToDisplay = filteredClients.slice(startIndex, endIndex);

        setPaginatedClients(clientsToDisplay);
    }, [filteredClients, currentPage]);

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
    const logMessage = (message) => {
        setProcessLogs((prevLogs) => [...prevLogs, message]); // Ajouter un message à l'état
    };

    const processInterventionQueue = () => {
        if (eligibleInterventions.length === 0) {
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

    const loadNotRepairedNotReturnedCount = async () => {
        try {
            const { data, error } = await supabase
                .from("interventions")
                .select("*")
                .eq("status", "Non réparable")
                .eq("restitue", false); // Filtrer les fiches non restituées

            if (error) throw error;

            setNotRepairedNotReturnedCount(data.length); // Met à jour le nombre
        } catch (error) {
            console.error(
                "Erreur lors du chargement des fiches non réparables non restituées:",
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
			// 🔹 Récupérer les clients avec leurs interventions
			const { data: clientsData, error: clientsError } = await supabase
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
				.order("createdAt", { ascending: false });
	
			if (clientsError) throw clientsError;
	
			// 🔹 Récupérer les commandes pour connaître les clients qui ont une commande
			const { data: ordersData, error: ordersError } = await supabase
				.from("orders")
				.select("client_id");
	
			if (ordersError) throw ordersError;
	
			console.log("📦 Commandes récupérées :", ordersData);
	
			if (clientsData) {
				const updatedData = clientsData.map((client) => {
					// 🔹 Filtrer les interventions qui ne sont pas "Réparé", "Récupéré", "Non réparable"
					const ongoingInterventions =
						client.interventions?.filter(
							(intervention) =>
								intervention.status !== "Réparé" &&
								intervention.status !== "Récupéré" &&
								intervention.status !== "Non réparable"
						) || [];
	
					const totalAmountOngoing = ongoingInterventions.reduce(
						(total, intervention) =>
							total + (intervention.solderestant || 0),
						0
					);
	
					return {
						...client,
						totalInterventions: client.interventions.length,
						clientUpdatedAt: client.updatedAt,
						interventions: client.interventions.map((intervention) => ({
							...intervention,
							interventionUpdatedAt: intervention.updatedAt,
						})),
						totalAmountOngoing,
					};
				});
	
				// 🔹 Vérifier quels clients ont une commande
				const clientsWithOrders = ordersData.map((order) => order.client_id);
	
				// 🔹 Inclure les clients ayant une intervention en cours OU une commande
				const clientsToShow = updatedData
					.filter((client) =>
						client.interventions.some(
							(intervention) =>
								intervention.status !== "Réparé" &&
								intervention.status !== "Récupéré" &&
								intervention.status !== "Non réparable"
						) || clientsWithOrders.includes(client.id) // ✅ Inclure les clients avec une commande
					)
					.map((client) => {
						// ✅ Garder toutes les infos de la fiche intactes
						client.interventions = client.interventions
							.filter(
								(intervention) =>
									intervention.status !== "Réparé" &&
									intervention.status !== "Récupéré" &&
									intervention.status !== "Non réparable"
							)
							.sort(
								(a, b) =>
									new Date(b.createdAt) - new Date(a.createdAt)
							);
						client.latestIntervention = client.interventions[0];
						return client;
					});
	
				const sortedClients = clientsToShow.sort((a, b) => {
					const dateA = new Date(a[sortBy]);
					const dateB = new Date(b[sortBy]);
					return orderAsc ? dateA - dateB : dateB - dateA;
				});
	
				console.log("👥 Clients affichés après filtrage :", sortedClients);
				setClients(sortedClients);
				setFilteredClients(sortedClients);
			}
		} catch (error) {
			console.error("❌ Erreur lors du chargement des clients:", error);
		} finally {
			setIsLoading(false);
		}
	};
	
    const loadOrders = async () => {
        try {
            const { data, error } = await supabase
                .from("orders")
                .select("id, client_id, paid");
            if (error) throw error;
            setOrders(data);
        } catch (error) {
            console.error("Erreur lors du chargement des commandes:", error);
        }
    };

    const loadOngoingInterventions = async () => {
        try {
            const { data, error } = await supabase
                .from("interventions")
                .select("*")
                .in("status", [
                    "Réparé",
                    "En attente de pièces",
                    "Réparation en cours",
                    "Devis en cours",
                ]);

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error(
                "Erreur lors de la récupération des interventions :",
                error
            );
            return [];
        }
    };
    useEffect(() => {
        const fetchAllInterventions = async () => {
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select("*")
                    .in("status", [
                        "Réparé",
                        "En attente de pièces",
                        "Réparation en cours",
                        "Devis en cours",
                    ]);

                if (error) throw error;

                setAllInterventions(data); // Stocker toutes les interventions
                const total = data.reduce(
                    (sum, intervention) =>
                        sum + (intervention.solderestant || 0),
                    0
                );

                setTotalCost(total.toFixed(2)); // Mettre à jour le montant total affiché
            } catch (error) {
                console.error(
                    "Erreur lors de la récupération des interventions :",
                    error
                );
            }
        };

        fetchAllInterventions(); // Appeler la fonction au chargement de la page
    }, []); // Ne dépend que du chargement initial

    const fetchDetails = (deviceType, marque, model) => {
        setSelectedDevice({
            deviceType,
            brand: marque || "Inconnu", // Valeur par défaut si la marque est vide
            model: model || "Inconnu", // Valeur par défaut si le modèle est vide
        });
        setIsModalVisible(true);
    };

    useEffect(() => {
        loadRepairedNotReturnedCount();
        loadNotRepairedNotReturnedCount(); // Charger le nombre de fiches réparées non restituées
    }, []);

    // Pagination
    const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
    const currentClients = filteredClients.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const goToPreviousPage = () => {
        if (currentPage > 1) {
            setCurrentPage((prevPage) => prevPage - 1);
        }
    };

    const goToNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage((prevPage) => prevPage + 1);
        }
    };
    useFocusEffect(
        React.useCallback(() => {
            // Toujours charger les clients triés par date décroissante
            setSortBy("createdAt");
            setOrderAsc(false);
            loadClients(); // Charge la liste des clients triée
			loadOrders(); // ✅ Ajout du rechargement des commandes
            // Charger les statistiques des réparés non restitués
            loadRepairedNotReturnedCount();
            loadNotRepairedNotReturnedCount();
        }, [])
    );

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
	useEffect(() => {
		console.log("🔄 Mise à jour de l'affichage des commandes !");
		setOrders([...orders]); // 🔄 Force la mise à jour de l'état React
	}, [orders]);
    const filterClients = async (text) => {
        setSearchText(text);
		await loadOrders();
		console.log("🔄 Commandes rechargées après recherche !");
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
                            intervention.status !== "Récupéré" &&
                            intervention.status !== "Non réparable"
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
				console.log("👥 Clients affichés après recherche :", filteredData);

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
            case "Non réparable":
                return require("../assets/icons/no.png"); // Image pour "Non réparable"
            default:
                return require("../assets/icons/point-dinterrogation.png"); // Image par défaut
        }
    };
    const HorizontalSeparator = () => {
        return <View style={styles.separator} />;
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
            case "Non réparable":
                return "#ff0000"; // Orange
            default:
                return "#555"; // Gris par défaut
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case "En attente de pièces":
                return { borderLeftColor: "#b396f8", borderLeftWidth: 3 };
            case "Devis accepté":
                return { borderLeftColor: "#FFD700", borderLeftWidth: 3 };
            case "Réparation en cours":
                return { borderLeftColor: "#528fe0", borderLeftWidth: 3 };
            case "Réparé":
                return { borderLeftColor: "#98fb98", borderLeftWidth: 3 };
            case "Devis en cours":
                return { borderLeftColor: "#f37209", borderLeftWidth: 3 };
            case "Non réparable":
                return { borderLeftColor: "#ff0000", borderLeftWidth: 3 };
            default:
                return { borderLeftColor: "#e0e0e0", borderLeftWidth: 3 };
        }
    };
    const deviceIcons = {
        "PC portable": require("../assets/icons/portable.png"),
        MacBook: require("../assets/icons/macbook_air.png"),
        iMac: require("../assets/icons/iMac.png"),
        "PC Fixe": require("../assets/icons/ordinateur (1).png"),
        "PC tout en un": require("../assets/icons/allInone.png"),
        Tablette: require("../assets/icons/tablette.png"),
        Smartphone: require("../assets/icons/smartphone.png"),
        Console: require("../assets/icons/console-de-jeu.png"),
        "Disque dur": require("../assets/icons/disk.png"),
        "Disque dur externe": require("../assets/icons/disque-dur.png"),
        "Carte SD": require("../assets/icons/carte-memoire.png"),
        "Cle usb": require("../assets/icons/cle-usb.png"),
        "Casque audio": require("../assets/icons/playaudio.png"),
        "Video-projecteur": require("../assets/icons/Projector.png"),
        Clavier: require("../assets/icons/keyboard.png"),
        Ecran: require("../assets/icons/screen.png"),
        iPAD: require("../assets/icons/iPad.png"),
        Imprimante: require("../assets/icons/printer.png"),
        Joystick: require("../assets/icons/joystick.png"),
        Processeur: require("../assets/icons/cpu.png"),
        Batterie: require("../assets/icons/battery.png"),
        Commande: require("../assets/icons/shipping_box.png"),
        default: require("../assets/icons/point-dinterrogation.png"),
    };

    // Fonction pour récupérer l'icône en fonction du type d'appareil
    const getDeviceIcon = (deviceType) => {
        if (!deviceType)
            return (
                <Image
                    source={deviceIcons.default}
                    style={{ width: 40, height: 40, tintColor: "#888787" }}
                />
            );

        const lowerCaseName = deviceType.toLowerCase(); // Convertir en minuscule pour éviter les problèmes de casse

        // Vérification pour MacBook
        if (lowerCaseName.includes("macbook")) {
            return (
                <Image
                    source={deviceIcons.MacBook}
                    style={{ width: 40, height: 40, tintColor: "#888787" }}
                />
            );
        }

        // Vérification pour iMac
        if (lowerCaseName.includes("imac")) {
            return (
                <Image
                    source={deviceIcons.iMac}
                    style={{ width: 40, height: 40, tintColor: "#888787" }}
                />
            );
        }

        // Retourner l'icône correspondante ou l'icône par défaut
        const iconSource = deviceIcons[deviceType] || deviceIcons.default;
        return (
            <Image
                source={iconSource}
                style={{ width: 40, height: 40, tintColor: "#888787" }}
            />
        );
    };

    const filterByStatus = (status) => {
        if (!showClients) {
            // Si les fiches sont masquées, afficher uniquement celles correspondant au statut
            const filtered = clients.filter((client) =>
                client.interventions.some(
                    (intervention) => intervention.status === status
                )
            );
            setFilteredClients(filtered);
            setShowClients(true); // Afficher les fiches filtrées
        } else {
            // Si les fiches sont déjà visibles, appliquer le filtre normalement
            const filtered = clients.filter((client) =>
                client.interventions.some(
                    (intervention) => intervention.status === status
                )
            );
            setFilteredClients(filtered);
        }
    };

    const resetFilter = () => {
        setFilteredClients(clients);
    };

    const formatPhoneNumber = (phoneNumber) => {
        if (!phoneNumber) return "";

        return phoneNumber.replace(/(\d{2})(?=\d)/g, "$1 "); // Ajoute un espace après chaque deux chiffres
    };
    const toggleMenu = () => {
        Animated.timing(slideAnim, {
            toValue: menuVisible ? -250 : 0, // Slide vers l'intérieur ou l'extérieur
            duration: 300,
            useNativeDriver: true,
        }).start();
        setMenuVisible(!menuVisible);
    };
    const closeMenu = () => {
        if (menuVisible) {
            toggleMenu(); // Ferme le menu si ouvert
        }
    };
    const handleLogout = async () => {
        try {
            const { error } = await supabase.auth.signOut(); // Déconnecte l'utilisateur
            if (error) {
                console.error("Erreur lors de la déconnexion :", error);
                Alert.alert(
                    "Erreur",
                    "Impossible de se déconnecter. Veuillez réessayer."
                );
            } else {
                navigation.dispatch(
                    CommonActions.reset({
                        index: 0,
                        routes: [{ name: "Login" }], // Assurez-vous que "Login" est bien défini dans AuthStack
                    })
                );
            }
        } catch (err) {
            console.error("Erreur inattendue lors de la déconnexion :", err);
            Alert.alert("Erreur", "Une erreur inattendue est survenue.");
        }
    };
    const DateDisplay = () => {
        const [currentDate, setCurrentDate] = useState("");

        useEffect(() => {
            const now = new Date();
            const formattedDate = now.toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
            });

            setCurrentDate(formattedDate);
        }, []);

        return (
            <View style={styles.dateContainer}>
                <Image
                    source={require("../assets/icons/calendar.png")}
                    style={styles.icon}
                />
                <Text style={styles.dateText}>{currentDate}</Text>
            </View>
        );
    };
    const TimeDisplay = () => {
        const [currentTime, setCurrentTime] = useState("");

        useEffect(() => {
            // Met à jour l'heure chaque seconde
            const interval = setInterval(() => {
                const now = new Date();
                const formattedTime = now.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                });
                setCurrentTime(formattedTime);
            }, 1000);

            return () => clearInterval(interval); // Nettoie l'intervalle à la destruction du composant
        }, []);

        return (
            <View style={styles.timeContainer}>
                <Image
                    source={require("../assets/icons/clock.png")} // Icône d'horloge
                    style={styles.icon}
                />
                <Text style={styles.timeText}>{currentTime}</Text>
            </View>
        );
    };
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const { data, error } = await supabase
                    .from("orders")
                    .select("id, client_id, paid");

                if (error) throw error;

                console.log("📦 Commandes récupérées :", data);
                setOrders(data);
            } catch (error) {
                console.error(
                    "❌ Erreur lors du chargement des commandes :",
                    error
                );
            }
        };

        fetchOrders();
    }, []);
	const getOrderColor = (clientId) => {
		const clientOrders = orders.filter(order => order.client_id === clientId);
	
		if (clientOrders.length === 0) {
			return "#888787"; // Pas de commande
		}
	
		const allPaid = clientOrders.every(order => order.paid); // ✅ Vérifie si toutes les commandes sont payées
	
		return allPaid ? "#00ff00" : "#ffa32c"; // 🟢 Vert si toutes les commandes sont payées, sinon 🟠 Orange
	};
	

    return (
        <ImageBackground
            source={backgroundImage}
            style={styles.backgroundImage}
        >
            <View style={styles.overlay}>
                <TouchableWithoutFeedback onPress={closeMenu}>
                    <View style={styles.container}>
                        <TouchableOpacity
                            style={styles.menuButton}
                            onPress={toggleMenu}
                        >
                            <Image
                                source={require("../assets/icons/menu.png")} // Remplacez par votre image PNG
                                style={styles.menuIcon}
                            />
                        </TouchableOpacity>
                        <Animated.View
                            style={[
                                styles.drawer,
                                { transform: [{ translateX: slideAnim }] },
                            ]}
                        >
                            <Text style={styles.drawerTitle}>Menu</Text>

                            <Text style={styles.sectionTitle}>Navigation</Text>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu(); // Ferme le menu
                                    navigation.navigate("Home"); // Navigue vers l'écran "Accueil"
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/home.png")} // Icône pour "Accueil"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor:
                                                navigation.getState().index ===
                                                0
                                                    ? "blue"
                                                    : "gray", // Couleur dynamique des icônes
                                        },
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    ACCUEIL
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu();
                                    navigation.navigate("AddClient"); // Navigue vers "Ajouter Client"
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/add.png")} // Icône pour "Ajouter Client"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor:
                                                navigation.getState().index ===
                                                1
                                                    ? "blue"
                                                    : "gray", // Couleur dynamique des icônes
                                        },
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    AJOUTER CLIENT
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu();
                                    navigation.navigate(
                                        "RepairedInterventions"
                                    ); // Navigue vers "Réparé"
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/tools1.png")} // Icône pour "Réparé"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor:
                                                navigation.getState().index ===
                                                2
                                                    ? "blue"
                                                    : "gray", // Couleur dynamique des icônes
                                        },
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    RÉPARÉS
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu();
                                    navigation.navigate("RecoveredClients"); // Navigue vers "Réparé"
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/ok.png")} // Icône pour "Réparé"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor:
                                                navigation.getState().index ===
                                                2
                                                    ? "blue"
                                                    : "gray", // Couleur dynamique des icônes
                                        },
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    RESTITUÉS
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu();
                                    navigation.navigate("Admin"); // Navigue vers "Administration"
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/Config.png")} // Icône pour "Administration"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor:
                                                navigation.getState().index ===
                                                3
                                                    ? "blue"
                                                    : "gray", // Couleur dynamique des icônes
                                        },
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    ADMINISTRATION
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    Alert.alert(
                                        "Confirmation",
                                        "Êtes-vous sûr de vouloir vous déconnecter ?",
                                        [
                                            {
                                                text: "Annuler",
                                                style: "cancel",
                                            },
                                            {
                                                text: "Déconnexion",
                                                onPress: async () => {
                                                    try {
                                                        await handleLogout(); // Déconnexion
                                                        toggleMenu(); // Ferme le menu uniquement après déconnexion réussie
                                                    } catch (error) {
                                                        console.error(
                                                            "Erreur de déconnexion :",
                                                            error
                                                        );
                                                    }
                                                },
                                                style: "destructive",
                                            },
                                        ],
                                        { cancelable: true }
                                    );
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/disconnects.png")}
                                    style={[
                                        styles.drawerItemIcon,
                                        { tintColor: "red" },
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    DÉCONNEXION
                                </Text>
                            </TouchableOpacity>

                            <Text style={styles.sectionTitle}>Filtres</Text>
                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu(); // Ferme le menu
                                    filterByStatus("En attente de pièces");
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/shipping.png")} // Icône pour "En attente de pièces"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor: getIconColor(
                                                "En attente de pièces"
                                            ),
                                        }, // Applique la couleur en fonction du statut
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    EN ATTENTE DE PIECE
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu(); // Ferme le menu
                                    filterByStatus("Devis accepté");
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/devisAccepte.png")} // Icône pour "Devis accepté"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor:
                                                getIconColor("Devis accepté"),
                                        }, // Applique la couleur en fonction du statut
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    DEVIS ACCEPTÉ
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu(); // Ferme le menu
                                    filterByStatus("Réparation en cours");
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/tools1.png")} // Icône pour "Réparation en cours"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor: getIconColor(
                                                "Réparation en cours"
                                            ),
                                        }, // Applique la couleur en fonction du statut
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    RÉPARATION EN COURS
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu(); // Ferme le menu
                                    filterByStatus("Devis en cours");
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/devisEnCours.png")} // Icône pour "Devis en cours"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor:
                                                getIconColor("Devis en cours"),
                                        }, // Applique la couleur en fonction du statut
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    DEVIS EN COURS
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu(); // Ferme le menu
                                    filterByStatus("Non réparable");
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/no.png")} // Icône pour "Réparation en cours"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor:
                                                getIconColor("Non réparable"),
                                        }, // Applique la couleur en fonction du statut
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    NON REPARABLE
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.drawerItem}
                                onPress={() => {
                                    toggleMenu(); // Ferme le menu
                                    resetFilter(); // Réinitialise les filtres
                                }}
                            >
                                <Image
                                    source={require("../assets/icons/reload.png")} // Icône pour "Réinitialiser"
                                    style={[
                                        styles.drawerItemIcon,
                                        {
                                            tintColor:
                                                getIconColor("Réinitialiser"),
                                        }, // Applique la couleur en fonction du statut
                                    ]}
                                />
                                <Text style={styles.drawerItemText}>
                                    RÉINITIALISER
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>
                        <View style={styles.overlay}>
                            <View style={styles.headerContainer}>
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
                                                    marginBottom: 10, // Espacement sous l'icône
                                                }}
                                            />
                                            <View
                                                style={{
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                }}
                                            >
                                                <Text
                                                    style={
                                                        styles.repairedCountText
                                                    }
                                                >
                                                    Produits réparés en attente
                                                    de restitution :{" "}
                                                    {repairedNotReturnedCount}
                                                </Text>
                                                <Text
                                                    style={
                                                        styles.repairedCountText
                                                    }
                                                >
                                                    Produits non réparables :{" "}
                                                    {
                                                        NotRepairedNotReturnedCount
                                                    }
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {isLoading ? (
                                    <ActivityIndicator
                                        size="large"
                                        color="blue"
                                    />
                                ) : hasImagesToDelete ? (
                                    <View>
                                        <TouchableOpacity
                                            onPress={() =>
                                                navigation.navigate(
                                                    "ImageCleanup"
                                                )
                                            }
                                            style={{
                                                marginRight: 40,
                                                marginTop: 15,
                                                padding: 10,
                                                borderRadius: 2,
                                                borderWidth: 1,
                                                borderColor: "#888787",
                                            }}
                                        >
                                            <Text style={{ color: "white" }}>
                                                Nettoyer les images
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <View style={styles.images_numberText}>
                                        <Text
                                            style={{
                                                color: "white",
                                                marginTop: 18,
                                                marginRight: 40,
                                                padding: 10,
                                                borderRadius: 2,
                                                borderWidth: 1,
                                                borderColor: "#888787",
                                                backgroundColor: "#191f2f",
                                            }}
                                        >
                                            Aucune image à supprimer.
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() =>
                                                navigation.navigate(
                                                    "OngoingAmountsPage",
                                                    {
                                                        interventions:
                                                            allInterventions,
                                                    }
                                                )
                                            }
                                        >
                                            <Text style={styles.totalText}>
                                                En cours : {totalCost} €
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
                                    placeholderTextColor="#888787"
                                    value={searchText}
                                    onChangeText={filterClients}
                                />
                                <Image
                                    source={require("../assets/icons/search.png")} // Chemin vers votre image
                                    style={[
                                        styles.searchIcon,
                                        {
                                            width: 24,
                                            height: 24,
                                            tintColor: "#999",
                                        },
                                    ]} // Ajoutez la propriété tintColor pour la couleur
                                />
                            </View>

                            <View style={styles.buttonContainer}>
                                <TouchableOpacity
                                    style={styles.toggleButton}
                                    onPress={() => setShowClients(!showClients)}
                                >
                                    <Image
                                        source={
                                            showClients
                                                ? require("../assets/icons/eye-slash.png") // Icône pour "masquer"
                                                : require("../assets/icons/eye.png") // Icône pour "afficher"
                                        }
                                        style={styles.iconStyle}
                                    />
                                    <Text style={styles.toggleText}>
                                        {showClients
                                            ? "Masquer les fiches"
                                            : "Afficher les fiches"}
                                    </Text>
                                </TouchableOpacity>

                                <View>
                                    <DateDisplay />
                                </View>

                                <View>
                                    <TimeDisplay />
                                </View>
                            </View>
                            {isLoading ? (
                                <View style={styles.loaderContainer}>
                                    <ActivityIndicator
                                        size={90}
                                        color="#e5e8eb"
                                    />
                                </View>
                            ) : currentClients.length === 0 ? (
                                <Text style={styles.noClientsText}>
                                    Aucun client trouvé
                                </Text>
                            ) : (
                                <>
                                    {showClients && (
                                        <FlatList
                                            initialNumToRender={10}
                                            maxToRenderPerBatch={5}
                                            showsVerticalScrollIndicator={false}
                                            scrollEnabled={true}
                                            windowSize={5}
                                            data={paginatedClients}
                                            keyExtractor={(item) =>
                                                item.id.toString()
                                            }
                                            getItemLayout={(data, index) => ({
                                                length: 180, // Hauteur de chaque fiche
                                                offset: 180 * index,
                                                index,
                                            })}
                                            renderItem={({ item, index }) => {
                                                <TouchableOpacity
                                                    onPress={() =>
                                                        toggleClientExpansion(
                                                            item.id,
                                                            index
                                                        )
                                                    }
                                                ></TouchableOpacity>;
                                                const isEven = index % 2 === 0;
                                                const backgroundColor = isEven
                                                    ? "#f9f9f9"
                                                    : "#e0e0e0";
                                                const isExpanded =
                                                    expandedClientId ===
                                                    item.id;

                                                const ongoingInterventions =
                                                    item.interventions?.filter(
                                                        (intervention) =>
                                                            intervention.status !==
                                                                "Réparé" &&
                                                            intervention.status !==
                                                                "Récupéré"
                                                    ) || [];
                                                const totalInterventionsEnCours =
                                                    ongoingInterventions.length;
                                                const totalInterventions =
                                                    item.interventions
                                                        ? item.interventions
                                                              .length
                                                        : 0;
                                                const latestIntervention =
                                                    item.latestIntervention;
                                                const status =
                                                    latestIntervention
                                                        ? latestIntervention.status
                                                        : "Aucun statut";
                                                const totalImages =
                                                    latestIntervention?.photos
                                                        ?.length || 0;
                                                const commande =
                                                    latestIntervention?.commande;

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
                                                                getStatusStyle(
                                                                    status
                                                                ),
                                                            ]}
                                                        >
                                                            <View
                                                                style={
                                                                    styles.statusContent
                                                                }
                                                            >
                                                                <View
                                                                    style={
                                                                        styles.iconCircle
                                                                    }
                                                                >
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
                                                                <Text
                                                                    style={
                                                                        styles.statusText
                                                                    }
                                                                >
                                                                    {item
                                                                        .latestIntervention
                                                                        ?.status ||
                                                                        "Aucun statut"}
                                                                </Text>
                                                            </View>

                                                            <TouchableOpacity
                                                                onPress={() =>
                                                                    toggleClientExpansion(
                                                                        item.id
                                                                    )
                                                                }
                                                                style={
                                                                    styles.clientInfo
                                                                }
                                                            >
                                                                <Text
                                                                    style={
                                                                        styles.ficheNumber
                                                                    }
                                                                >
                                                                    Fiche client
                                                                    N°{" "}
                                                                    {
                                                                        item.ficheNumber
                                                                    }
                                                                </Text>
                                                                <Text
                                                                    style={
                                                                        styles.clientText
                                                                    }
                                                                >
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
                                                                        Téléphone
                                                                        :{" "}
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
                                                                <Text
                                                                    style={
                                                                        styles.clientText
                                                                    }
                                                                >
                                                                    Montant
                                                                    total des
                                                                    interventions
                                                                    en cours :{" "}
                                                                    {item.totalAmountOngoing
                                                                        ? item.totalAmountOngoing.toLocaleString(
                                                                              "fr-FR",
                                                                              {
                                                                                  style: "currency",
                                                                                  currency:
                                                                                      "EUR",
                                                                              }
                                                                          )
                                                                        : "0,00 €"}
                                                                </Text>
                                                                <View>
                                                                    <HorizontalSeparator />
                                                                </View>
                                                                {latestIntervention?.accept_screen_risk && (
                                                                    <Text
                                                                        style={
                                                                            styles.acceptRiskText
                                                                        }
                                                                    >
                                                                        Le
                                                                        client a
                                                                        accepté
                                                                        le
                                                                        risque
                                                                        de
                                                                        casse.
                                                                        Oui
                                                                    </Text>
                                                                )}
                                                                <Text
                                                                    style={
                                                                        styles.clientText
                                                                    }
                                                                >
                                                                    Date de
                                                                    création :{" "}
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
                                                                        Infos
                                                                        client
                                                                        modifiées
                                                                        le :{" "}
                                                                        {formatDateTime(
                                                                            item.updatedAt
                                                                        )}
                                                                    </Text>
                                                                )}
                                                                {item
                                                                    .interventions?.[0]
                                                                    ?.interventionUpdatedAt && (
                                                                    <Text
                                                                        style={
                                                                            styles.clientText
                                                                        }
                                                                    >
                                                                        Intervention
                                                                        mise à
                                                                        jour le
                                                                        :{" "}
                                                                        {formatDateTime(
                                                                            item
                                                                                .interventions[0]
                                                                                .interventionUpdatedAt
                                                                        )}
                                                                    </Text>
                                                                )}
                                                            </TouchableOpacity>

                                                            <View
                                                                style={
                                                                    styles.topRightButtons
                                                                }
                                                            >
                                                                <View
                                                                    style={{
                                                                        flexDirection:
                                                                            "row",
                                                                    }}
                                                                >
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
                                                                                            "#a073f3", // Couleur de l'icône (ici noir)
                                                                                    }}
                                                                                />
                                                                            </TouchableOpacity>
                                                                        )}
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
                                                                                        "#00fd00",
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
                                                                                        "#3c92f5",
                                                                                }}
                                                                            />
                                                                        ) : (
                                                                            <Image
                                                                                source={require("../assets/icons/notifications_off.png")} // Chemin vers votre icône poubelle
                                                                                style={{
                                                                                    width: 28,
                                                                                    height: 28,
                                                                                    tintColor:
                                                                                        "#888787", // Couleur de l'icône (ici noir)
                                                                                }}
                                                                            />
                                                                        )}
                                                                    </TouchableOpacity>

                                                                    <TouchableOpacity
                                                                        style={[
                                                                            styles.iconButton,
                                                                            styles.editButton,
                                                                        ]}
                                                                        onPress={() =>
                                                                            navigation.navigate(
                                                                                "EditClient",
                                                                                {
                                                                                    client: item,
                                                                                }
                                                                            )
                                                                        }
                                                                    >
                                                                        <Image
                                                                            source={require("../assets/icons/edit.png")} // Chemin vers votre icône poubelle
                                                                            style={{
                                                                                width: 28,
                                                                                height: 28,
                                                                                tintColor:
                                                                                    "#888787", // Couleur de l'icône (ici noir)
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
                                                                                "SelectInterventionPage",
                                                                                {
                                                                                    clientId:
                                                                                        item.id,
                                                                                }
                                                                            )
                                                                        }
                                                                    >
                                                                        <Image
                                                                            source={require("../assets/icons/print.png")}
                                                                            style={{
                                                                                width: 28,
                                                                                height: 28,
                                                                                tintColor:
                                                                                    "#888787",
                                                                            }}
                                                                        />
                                                                    </TouchableOpacity>

                                                                    {totalImages >
                                                                        0 && (
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
                                                                                        "#888787", // Couleur de l'icône (ici noir)
                                                                                }}
                                                                            />
                                                                        </TouchableOpacity>
                                                                    )}
                                                                    <View
                                                                        style={{
                                                                            flexDirection:
                                                                                "row",
                                                                            justifyContent:
                                                                                "flex-end",
                                                                        }}
                                                                    >
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
                                                                                        "#888787", // Couleur de l'icône (ici noir)
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
																	<TouchableOpacity
																			style={{
																				
																				padding: 10,
																				alignItems: "center",
																				borderRadius: 2,
																				borderWidth: getOrderColor(item.id) !== "#888787" ? 2 : 1, // ✅ Bordure de 2px si l'icône est verte ou orange
																				borderColor: getOrderColor(item.id) !== "#888787" ? getOrderColor(item.id) : "#888787", // ✅ La couleur de la bordure suit l'icône
																			}}
																				onPress={() =>
																					navigation.navigate("OrdersPage", {
																						clientId: item.id,
																						clientName: item.name,
																						clientPhone: item.phone,
																						clientNumber: item.ficheNumber,
																					})
																				}
																			>
																				<Image
																					source={require("../assets/icons/order.png")}
																					style={{
																						width: 28,
																						height: 28,
																						tintColor: "#888787",
																					}}
																				/>
																			</TouchableOpacity>
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
                                                                                    "red", // Couleur de l'icône (ici noir)
                                                                            }}
                                                                        />
                                                                    </TouchableOpacity>
                                                                </View>
                                                                <View
                                                                    style={
                                                                        styles.additionalIconsContainer
                                                                    }
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
																				<View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>

																			
																			<View
																				style={{
																					borderWidth: 1,
																					borderColor: "#888787",
																					paddingTop: 5,
																					width: 50,
																					height: 50,
																					borderRadius: 2,
																					alignItems: "center",
																				}}
																			>
																				<TouchableOpacity
																					onPress={() =>
																						fetchDetails(
																							intervention.deviceType, 
																							intervention.brand, 
																							intervention.model
																						)
																					}
																				>
																					{getDeviceIcon(intervention.deviceType)}
																				</TouchableOpacity>
																			</View>
																		</View>

                                                                            )
                                                                        )}
                                                                    {item.interventions &&
                                                                        item
                                                                            .interventions
                                                                            .length >
                                                                            0 && (
                                                                            <View
                                                                                style={[
                                                                                    styles.deviceIconContainer,
                                                                                    {
                                                                                        flexDirection:
                                                                                            "row",
                                                                                    },
                                                                                ]}
                                                                            ></View>
                                                                        )}
                                                                </View>
                                                            </View>

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
                                                                                En
                                                                                commande
                                                                                :{" "}
                                                                                {
                                                                                    commande
                                                                                }
                                                                            </Text>
                                                                        )}
                                                                    <Text
                                                                        style={
                                                                            styles.clientText
                                                                        }
                                                                    >
                                                                        Montant
                                                                        :{" "}
                                                                        {latestIntervention?.cost?.toLocaleString(
                                                                            "fr-FR",
                                                                            {
                                                                                minimumFractionDigits: 2,
                                                                            }
                                                                        )}{" "}
                                                                        €
                                                                    </Text>

                                                                    {latestIntervention?.solderestant !==
                                                                        undefined &&
                                                                        latestIntervention?.solderestant >
                                                                            0 && (
                                                                            <Text
                                                                                style={
                                                                                    styles.clientTextSoldeRestant
                                                                                }
                                                                            >
                                                                                Solde
                                                                                restant
                                                                                dû
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
                                                                        Nombre
                                                                        d'images
                                                                        :{" "}
                                                                        {
                                                                            totalImages
                                                                        }
                                                                    </Text>
                                                                    <Text
                                                                        style={
                                                                            styles.clientText
                                                                        }
                                                                    >
                                                                        Interventions
                                                                        en cours
                                                                        :{" "}
                                                                        {
                                                                            totalInterventionsEnCours
                                                                        }
                                                                    </Text>
                                                                    {item.interventions &&
                                                                        item
                                                                            .interventions
                                                                            .length >
                                                                            0 && (
                                                                            <View
                                                                                style={[
                                                                                    styles.deviceIconContainer,
                                                                                    {
                                                                                        flexDirection:
                                                                                            "row",
                                                                                    },
                                                                                ]}
                                                                            ></View>
                                                                        )}
                                                                </View>
                                                            )}
                                                        </View>
                                                    </Animatable.View>
                                                );
                                            }}
                                            contentContainerStyle={{
                                                paddingBottom: 20,
                                            }} // Ajoute un espace en bas
                                        />
                                    )}
                                </>
                            )}
                            <Modal
                                transparent={true}
                                visible={notifyModalVisible}
                                animationType="fade"
                                onRequestClose={() =>
                                    setNotifyModalVisible(false)
                                }
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
                                                <Text style={styles.buttonText}>
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
                                                <Text style={styles.buttonText}>
                                                    Téléphone
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.button}
                                                onPress={() =>
                                                    setNotifyModalVisible(false)
                                                }
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
                                onRequestClose={() =>
                                    setTransportModalVisible(false)
                                }
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
                                            onPress={() =>
                                                setTransportModalVisible(false)
                                            }
                                        >
                                            <Text style={styles.buttonText}>
                                                Fermer
                                            </Text>
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
                                                    Type :{" "}
                                                    {selectedDevice.deviceType}
                                                </Text>
                                                <Text style={styles.modalText}>
                                                    Marque :{" "}
                                                    {selectedDevice.brand}
                                                </Text>
                                                <Text style={styles.modalText}>
                                                    Modèle :{" "}
                                                    {selectedDevice.model}
                                                </Text>
                                            </>
                                        )}
                                        <TouchableOpacity
                                            style={styles.button}
                                            onPress={() =>
                                                setIsModalVisible(false)
                                            }
                                        >
                                            <Text style={styles.buttonText}>
                                                Fermer
                                            </Text>
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
                                            Êtes-vous sûr de vouloir supprimer
                                            cette fiche client ?
                                        </Text>
                                        <View style={styles.alertButtons}>
                                            <TouchableOpacity
                                                style={styles.button}
                                                onPress={() =>
                                                    setModalVisible(false)
                                                }
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
                                            Ce client ne peut pas être supprimé
                                            car il a des interventions
                                            associées.
                                        </Text>
                                        <TouchableOpacity
                                            style={styles.button}
                                            onPress={() =>
                                                setAlertVisible(false)
                                            }
                                        >
                                            <Text style={styles.buttonText}>
                                                OK
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </Modal>
                            {cleanupModalVisible && (
                                <Modal
                                    transparent={true}
                                    visible={cleanupModalVisible}
                                    animationType="fade"
                                    onRequestClose={() =>
                                        setCleanupModalVisible(false)
                                    }
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
                                                    <Text
                                                        style={
                                                            styles.modalButtonText
                                                        }
                                                    >
                                                        Nettoyer
                                                    </Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.modalButton}
                                                    onPress={() =>
                                                        setCleanupModalVisible(
                                                            false
                                                        )
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.modalButtonText
                                                        }
                                                    >
                                                        Annuler
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                </Modal>
                            )}
                        </View>
                        ;
                    </View>
                </TouchableWithoutFeedback>
                <View style={styles.paginationContainer}>
                    <TouchableOpacity
                        onPress={goToPreviousPage}
                        disabled={currentPage === 1}
                    >
                        <Image
                            source={require("../assets/icons/chevrong.png")}
                            style={{
                                width: 25,
                                height: 25,
                                tintColor: currentPage === 1 ? "gray" : "white", // Grise si première page
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
                            source={require("../assets/icons/chevrond.png")}
                            style={{
                                width: 25,
                                height: 25,
                                tintColor:
                                    currentPage === totalPages
                                        ? "gray"
                                        : "white", // Grise si dernière page
                            }}
                        />
                    </TouchableOpacity>
                </View>
                <BottomMenu
                    navigation={navigation}
                    filterByStatus={filterByStatus}
                    resetFilter={resetFilter}
                />
            </View>
        </ImageBackground>
    );
}
const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        width: "100%",
        justifyContent: "center",
        backgroundColor: "rgba(39, 39, 39, 0.308)",
    },
    container: {
        flex: 1,
    },
    toggleButton: {
        flexDirection: "row",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 10,
        backgroundColor: "#191f2f",
        borderWidth: 1,
        borderRadius: 2,
        borderColor: "#888787",
        marginBottom: 10,
    },
    toggleText: {
        marginLeft: 10,
        fontSize: 16,
        color: "#888787",
        fontWeight: "medium",
    },
    iconStyle: {
        width: 24, // Taille de l'icône
        height: 24, // Taille de l'icône
        marginRight: 10, // Espace entre l'icône et le texte
        tintColor: "#7583a8", // Supprimez si vos images ont déjà une couleur
    },
    menuButton: {
        padding: 15,
        justifyContent: "center",
        alignItems: "center",
        position: "absolute", // Position absolue pour le placer en haut à droite
        top: 4, // Distance depuis le haut
        right: 56, // Distance depuis la droite (remplacez `left`)
        zIndex: 10, // S'assure que le bouton est au-dessus du contenu
        borderRadius: 2, // Bords arrondis pour un style plus moderne
    },
    menuIcon: {
        width: 40,
        height: 40,
        tintColor: "#7583a8", // Supprimez si vos images ont déjà une couleur
    },
    drawer: {
        position: "absolute",
        left: 0, // Positionne le menu à gauche
        top: 0,
        bottom: 0,
        width: 250,
        backgroundColor: "#202020",
        padding: 20,
        shadowColor: "#000", // Couleur de l'ombre
        shadowOffset: { width: 5, height: 0 }, // Ombre vers la droite
        shadowOpacity: 0.2, // Opacité de l'ombre
        shadowRadius: 5, // Diffusion de l'ombre
        elevation: 5, // Élévation pour Android
        zIndex: 9,
    },

    drawerTitle: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        color: "#f1f1f1",
    },
    drawerItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#ddd",
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginVertical: 10,
        color: "#f1f1f1",
    },
    drawerItemIcon: {
        width: 24,
        height: 24,
        marginRight: 10, // Espacement entre l'icône et le texte
    },
    drawerItemText: {
        fontSize: 16,
        color: "#f1f1f1",
    },
    content: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    contentText: {
        fontSize: 20,
        fontWeight: "bold",
    },
    searchContainer: {
        position: "relative", // Pour permettre le positionnement absolu de l'icône
        borderColor: "#888787",
    },
    searchIcon: {
        marginTop: 10,
        position: "absolute",
        right: 10, // Positionné à droite à 10px du bord
        zIndex: 1, // Place l'icône au-dessus du TextInput
    },
    repairedCountContainer: {
        padding: 10,
        backgroundColor: "#191f2f",
        borderRadius: 2,
        borderWidth: 1,
        borderColor: "#888787",
        marginTop: 15,
    },
    repairedCountButton: {
        flexDirection: "row", // Pour aligner l'icône et le texte horizontalement
        alignItems: "center", // Pour centrer le texte à l'intérieur du bouton
    },
    repairedCountText: {
        color: "#f5f5f5",
        fontWeight: "medium",
        textAlign: "center",
        fontSize: 16,
        marginLeft: 8,
        marginVertical: 5,
    },

    backgroundImage: {
        flex: 1,
        resizeMode: "cover", // L'image couvre toute la page
    },
    overlay: {
        flex: 1,
        backgroundColor: "rgba(7, 7, 7, 0)",
    },

    headerContainer: {
        flexDirection: "row",
        justifyContent: "space-between", // Aligner le titre à gauche et la page à droite
        alignItems: "center",
        marginBottom: 10, // Vous pouvez ajuster la marge en fonction de l'espace que vous souhaitez
    },
    pageNumberText: {
        marginRight: 20,
        marginTop: 80,
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
        borderColor: "#888787",
        padding: 10,
        marginBottom: 20,
        borderRadius: 2,
        backgroundColor: "#191f2f",
        color: "#b6b4b4",
        fontSize: 16,
    },
    clientCard: {
        padding: 10,
        marginVertical: 5,
        borderWidth: 1,
        borderTopColor: "#888787",
        borderRightColor: "#888787",
        borderBottomColor: "#888787",
        backgroundColor: "#191f2f",
        borderRadius: 2,
    },
    clientInfo: {
        flex: 1,
        paddingRight: 10,
    },
    ficheNumber: {
        fontSize: 18,
        fontWeight: "bold",
    },
    clientTextSoldeRestant: {
        fontSize: 20,
        color: "#acacac", // Rouge orangé pour attirer l'attention
        fontWeight: "medium",
    },
    expandedContent: {
        paddingTop: 10,
        backgroundColor: "#191f2f",
        marginTop: 10,
        width: "100%",
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
        fontWeight: "medium",
        color: "#adabab",
        marginBottom: 5,
    },
    phoneContainer: {
        flexDirection: "row",
        alignItems: "center",
    },
    phoneNumber: {
        fontSize: 22,
        fontWeight: "bold",
        color: "#adabab",
    },
    newIconContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    clientText: {
        fontSize: 16,
        color: "#adabab",
    },
    statusText: {
        fontSize: 20,
        fontStyle: "normal",
        fontWeight: "bold",
        marginBottom: 10,
        color: "#802d07",
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
        borderRadius: 2,
        borderColor: "#888787",
        borderWidth: 1,
        marginRight: 10,
    },
    editButton: {
        //backgroundColor: '#17a2b8',  // Bleu pour l'icône d'édition
        padding: 10,
        borderRadius: 2,
        marginRight: 10,
        borderColor: "#888787", // Couleur de la bordure (noire)
        borderWidth: 1, // Épaisseur de la bordure
    },
    printButton: {
        //backgroundColor: '#28a745',  // Vert pour l'icône d'impression
        padding: 10,
        borderRadius: 2,
        marginRight: 10,
        borderColor: "#888787", // Couleur de la bordure (noire)
        borderWidth: 1, // Épaisseur de la bordure
    },
    trashButton: {
        //backgroundColor: '#dc3545',  // Rouge pour l'icône de poubelle
        padding: 10,
        borderRadius: 2,
        borderColor: "#888787", // Couleur de la bordure (noire)
        borderWidth: 1, // Épaisseur de la bordure
    },
    transportButton: {
        padding: 10,
        borderRadius: 2,
        marginRight: 10,
        borderColor: "#888787", // Couleur de la bordure (noire)
        borderWidth: 1, // Épaisseur de la bordure
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
        color: "#ffffff",
    },
    noClientsText: {
        textAlign: "center",
        fontSize: 18,
        marginTop: 20,
        color: "#fff",
    },
    paginationContainer: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",

        marginBottom: 150,
    },
    paginationText: {
        fontSize: 18,
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
        borderRadius: 2,
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
        borderRadius: 2,
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
        borderRadius: 2,
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
        borderWidth: 1, // Bordure de 2px
        borderRadius: 2, // Bords arrondis
        borderColor: "#888787", // Couleur de la bordure en noir
        marginRight: 8,
    },
    interventionContainerRight: {
        marginTop: 70, // Espacement du haut
    },
    additionalIconsContainer: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: 10,
    },
    interventionBox: {
        flexDirection: "row", // Aligner l'icône et le texte en ligne
        alignItems: "center", // Centrer verticalement
        padding: 10, // Ajouter du padding à l'intérieur du rectangle
        borderWidth: 1, // Épaisseur de la bordure
        borderRadius: 2, // Bordures arrondies pour correspondre au style des autres icônes
        borderColor: "#888787", // Couleur de la bordure (vous pouvez l'adapter à vos besoins)
        backgroundColor: "#888787", // Couleur de fond (adaptez-la si nécessaire)
        shadowColor: "#000", // Ombre (si cela correspond au style des autres icônes)
        shadowOpacity: 0.2, // Légère opacité pour l'ombre
        shadowOffset: { width: 2, height: 2 },
    },
    interventionsCount: {
        fontSize: 16,
        fontWeight: "medium",
        marginLeft: 5, // Espace entre l'icône et le texte
        color: "#888787", // Couleur du texte
    },
    interventionsEnCoursContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 10,
    },
    interventionCountCircle: {
        width: 30, // Taille du cercle
        height: 30, // Taille du cercle
        borderRadius: 2, // Forme circulaire
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
        borderRadius: 2, // Bords arrondis
        borderWidth: 1, // Bordure de 2px
        borderColor: "#888787", // Couleur de la bordure en noir
        marginRight: 10, // Espace à droite de l'icône pour séparer les icônes
        /*  backgroundColor: "#fff", // Fond blanc */
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
        flex: 1,
        width: "38%",
    },
    repairedCountButton: {
        flexDirection: "row", // Pour aligner l'icône et le texte horizontalement
        alignItems: "center", // Pour centrer verticalement l'icône et le texte
        // Autres styles selon vos besoins
    },
    buttonContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 10,
    },
    buttonContent: {
        flexDirection: "row",
        alignItems: "center",
    },
    buttonTextTrier: {
        marginLeft: 8,
        fontSize: 16, // Taille du texte du nombre d'interventions
        color: "#888787",
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
        borderRadius: 5,
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

    statusContent: {
        flexDirection: "row", // Aligne l'icône et le texte côte à côte
        alignItems: "center", // Centrage vertical
        marginBottom: 10,
    },

    statusText: {
        color: "#888787", // Couleur du texte
        fontWeight: "bold",
        fontSize: 20,
    },
    iconCircle: {
        width: 32, // Diamètre du cercle
        height: 32, // Diamètre du cercle
        borderWidth: 1, // Épaisseur de la bordure
        borderRadius: 2, // Moitié de la largeur/hauteur pour faire un cercle
        borderColor: "#888787", // Couleur de fond gris
        justifyContent: "center", // Centrage de l'icône à l'intérieur du cercle
        alignItems: "center", // Centrage de l'icône à l'intérieur du cercle
        marginRight: 8, // Espace entre le cercle et le texte
    },
    separator: {
        height: 1, // Épaisseur de la barre
        backgroundColor: "#888787", // Couleur de la barre
        marginVertical: 8, // Espacement vertical optionnel
    },
    totalText: {
        color: "white",
        marginTop: 11,
        marginRight: 40,
        padding: 8,
        backgroundColor: "#191f2f",
        borderRadius: 2,
        borderWidth: 1,
        borderColor: "#888787",
    },
    images_numberText: {
        marginLeft: 40,
    },
    dateContainer: {
        flexDirection: "row", // Alignement horizontal
        alignItems: "center",
        borderWidth: 1, // Bordure visible
        borderColor: "#888787", // Couleur du contour
        borderRadius: 2, // Coins arrondis
        paddingVertical: 11, // Espacement intérieur haut/bas
        paddingHorizontal: 50, // Espacement intérieur gauche/droite
        backgroundColor: "#191f2f", // Fond blanc pour le contraste
        alignSelf: "center", // Centrage du bloc
    },
    icon: {
        width: 20,
        height: 20,
        tintColor: "#888787", // Couleur de l'icône
        marginRight: 8, // Espacement entre l'icône et le texte
    },
    dateText: {
        fontSize: 16,
        fontWeight: "medium",
        color: "#888787", // Texte en vert
    },
    timeContainer: {
        flexDirection: "row", // Alignement horizontal
        alignItems: "center",
        borderWidth: 1, // Bordure visible
        borderColor: "#888787", // Couleur du contour
        borderRadius: 2, // Coins arrondis
        paddingVertical: 8, // Espacement intérieur haut/bas
        paddingHorizontal: 80, // Espacement intérieur gauche/droite
        backgroundColor: "#191f2f", // Fond blanc
        alignSelf: "center", // Centrage horizontal
    },
    timeText: {
        fontSize: 20,
        fontWeight: "medium",
        color: "#888787", // Couleur orange pour l'heure
    },
    orderButton: {
        borderWidth: 1,
        borderColor: "#888787",
        width: 50,
        height: 50,
        borderRadius: 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "white",
        marginLeft: 5,
    },
    orderIcon: {
        width: 30,
        height: 30,
        tintColor: "orange",
    },
    orderButton: {
        borderWidth: 1,
        borderColor: "#888787",
        width: 50,
        height: 50,
        borderRadius: 2,
        alignItems: "center",
        justifyContent: "center",
        marginLeft: 5,
    },
    orderIcon: {
        width: 30,
        height: 30,
    },
});
