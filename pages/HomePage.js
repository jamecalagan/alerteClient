import React, { useState, useEffect } from "react";
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
} from "react-native";
import { supabase } from "../supabaseClient";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import FontAwesome5 from "react-native-vector-icons/FontAwesome5";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import RoundedButton from "../components/RoundedButton";
import Ionicons from "react-native-vector-icons/Ionicons";

// Import de l'image depuis le dossier assets
const backgroundImage = require("../assets/listing.jpg");
export default function HomePage({ navigation, route }) {
    const [clients, setClients] = useState([]);
    const [filteredClients, setFilteredClients] = useState([]);
    const [searchText, setSearchText] = useState("");
    const [sortBy, setSortBy] = useState("createdAt");
    const [orderAsc, setOrderAsc] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedClientId, setSelectedClientId] = useState(null);
    const [alertVisible, setAlertVisible] = useState(false);
    const [transportModalVisible, setTransportModalVisible] = useState(false);
    const [selectedCommande, setSelectedCommande] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true); // Loader state
    const [notifyModalVisible, setNotifyModalVisible] = useState(false); // Gérer la visibilité de la modal de notification
    const [selectedInterventionId, setSelectedInterventionId] = useState(null); // Stocker l'ID de l'intervention sélectionnée
    const [repairedNotReturnedCount, setRepairedNotReturnedCount] = useState(0);

    const itemsPerPage = 3;

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

    const handleLogout = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error("Erreur lors de la déconnexion :", error);
                return;
            }
            navigation.replace("Login");
        } catch (error) {
            console.error("Erreur lors de la déconnexion :", error);
        }
    };
    const loadClients = async () => {
        setIsLoading(true); // Démarre le loader au début du chargement des clients
        try {
            const { data, error } = await supabase
                .from("clients")
                .select(
                    "*, interventions(id, status, deviceType, cost, createdAt, updatedAt, commande, photos, notifiedBy)"
                );

            if (error) throw error;

            if (data) {
                // Filtrer les clients avec des interventions en cours
                const filteredData = data
                    .map((client) => {
                        const ongoingInterventions =
                            client.interventions?.filter(
                                (intervention) =>
                                    intervention.status !== "Réparé" &&
                                    intervention.status !== "Récupéré"
                            );

                        // Si le client a des interventions en cours, on les garde
                        if (ongoingInterventions.length > 0) {
                            client.latestIntervention =
                                ongoingInterventions[
                                    ongoingInterventions.length - 1
                                ];
                            client.latestIntervention.photos =
                                client.latestIntervention.photos || [];
                            return client;
                        } else {
                            // On ne garde pas les clients sans interventions en cours
                            return null;
                        }
                    })
                    .filter((client) => client !== null); // Retirer les clients sans interventions en cours

                // Tri par date de la dernière intervention en cours
                let sortedClients = filteredData.sort((a, b) => {
                    const dateA = new Date(a.latestIntervention.createdAt);
                    const dateB = new Date(b.latestIntervention.createdAt);
                    return orderAsc ? dateA - dateB : dateB - dateA;
                });

                setClients(sortedClients);
                setFilteredClients(sortedClients);
            }
        } catch (error) {
            console.error("Erreur lors du chargement des clients:", error);
        } finally {
            setIsLoading(false); // Arrête le loader
        }
    };

    useEffect(() => {
        loadRepairedNotReturnedCount(); // Charger le nombre de fiches réparées non restituées
    }, []);

    // Charger les données lors du premier rendu
    useEffect(() => {
        setIsLoading(true); // Démarre le loader
        loadClients();
    }, []);

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
            if (route.params?.reloadClients) {
                setSortBy("createdAt"); // Tri par date de création
                setOrderAsc(false); // Tri décroissant pour afficher les plus récents en premier
                loadClients(); // Recharger la liste des clients
            }
        }, [route.params?.reloadClients])
    );
    // Utilisez useFocusEffect pour recharger les données à chaque fois que la page Home est affichée
    useFocusEffect(
        React.useCallback(() => {
            loadRepairedNotReturnedCount();
        }, [])
    );
    useFocusEffect(
        React.useCallback(() => {
            loadClients();
        }, [sortBy, orderAsc])
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
        const date = new Date(dateString);
        const offsetHours = 2;
        date.setHours(date.getHours() + offsetHours);
        return date.toLocaleString("fr-FR", {
            day: "numeric",
            month: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            timeZone: "Europe/Paris",
        });
    };
    const filterClients = async (text) => {
        setSearchText(text);

        if (text.trim() === "") {
            setFilteredClients(clients); // Réinitialise la liste si aucun texte n'est entré
        } else {
            try {
                setIsLoading(true); // Active le loader pendant la recherche

                // Contrôle pour savoir si l'entrée est un nombre (pour téléphone ou numéro de fiche)
                const isNumber = !isNaN(text);

                // Requête pour rechercher dans la base de données selon si l'entrée est un texte ou un nombre
                const { data, error } = await supabase
                    .from("clients")
                    .select(
                        "*, interventions(id, status, deviceType, cost, createdAt, updatedAt, commande, photos, notifiedBy)"
                    )
                    .or(
                        isNumber
                            ? `ficheNumber.eq.${text}, phone.ilike.%${text}%` // Recherche par numéro de fiche ou téléphone si c'est un nombre
                            : `name.ilike.%${text}%` // Recherche par nom si c'est un texte
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

    const getStatusStyle = (status) => {
        switch (status) {
            case "En attente de pièces":
                return { borderColor: "#270381", borderWidth: 2 };
            case "Devis accepté":
                return { borderColor: "#FFD700", borderWidth: 2 };
            case "Réparation en cours":
                return { borderColor: "#528fe0", borderWidth: 2 };
            case "Réparé":
                return { borderColor: "#98fb98", borderWidth: 2 };
            case "Non réparable":
                return { borderColor: "#e9967a", borderWidth: 2 };
            default:
                return { borderColor: "#e0e0e0", borderWidth: 2 };
        }
    };
    const getDeviceIcon = (deviceType) => {
        switch (deviceType) {
            case "PC portable":
                return <FontAwesome5 name="laptop" size={30} color="#000" />;
            case "PC Fixe":
                return <FontAwesome5 name="desktop" size={30} color="#000" />;
            case "Tablette":
                return (
                    <FontAwesome5 name="tablet-alt" size={30} color="#000" />
                );
            case "Smartphone":
                return <FontAwesome5 name="mobile" size={30} color="#000" />;
            case "Console":
                return <FontAwesome5 name="gamepad" size={30} color="#000" />;
            case "Disque dur":
                return <FontAwesome5 name="hdd" size={30} color="#000" />;
            case "Carte SD":
                return <FontAwesome5 name="sd-card" size={30} color="#000" />;
            case "Cle usb":
                return (
                    <MaterialCommunityIcons
                        name="usb-flash-drive"
                        size={30}
                        color="#000"
                    />
                );
            default:
                return <FontAwesome5 name="question" size={30} color="#000" />;
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
                    <Ionicons name="cube" size={24} color="#270381" />
                    <Text style={styles.legendText}>En attente de pièces</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => filterByStatus("Devis accepté")}>
                <View style={styles.legendItem}>
                    <Ionicons name="document-text" size={24} color="#FFD700" />
                    <Text style={styles.legendText}>Devis accepté</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity
                onPress={() => filterByStatus("Réparation en cours")}
            >
                <View style={styles.legendItem}>
                    <Ionicons name="construct" size={24} color="#528fe0" />
                    <Text style={styles.legendText}>Réparation en cours</Text>
                </View>
            </TouchableOpacity>

      {/* Bouton pour naviguer vers la page RepairedInterventionPage */}
      <TouchableOpacity onPress={() => navigation.navigate("RepairedInterventionsPage")}>
        <View style={styles.legendItem}>
          <Ionicons name="checkmark-circle" size={24} color="#98fb98" />
          <Text style={styles.legendText}>Réparé</Text>
        </View>
      </TouchableOpacity>

            <TouchableOpacity onPress={() => filterByStatus("Non réparable")}>
                <View style={styles.legendItem}>
                    <Ionicons name="close-circle" size={24} color="#e9967a" />
                    <Text style={styles.legendText}>Non réparable</Text>
                </View>
            </TouchableOpacity>
            {/* Bouton Reset */}
            <TouchableOpacity onPress={resetFilter} style={styles.resetButton}>
                <Ionicons name="refresh-circle" size={30} color="#FF6347" />
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
                    <Ionicons
                        name="search"
                        size={24}
                        color="#999"
                        style={styles.searchIcon}
                    />
                </View>

                <View style={styles.sortButtonContainer}>
                    <RoundedButton
                        title={`Trier par ${
                            sortBy === "createdAt"
                                ? "date de modification"
                                : "date de création"
                        }`}
                        onPress={() =>
                            setSortBy(
                                sortBy === "createdAt"
                                    ? "updatedAt"
                                    : "createdAt"
                            )
                        }
                    />
                    <RoundedButton
                        title={`Ordre ${orderAsc ? "Ascendant" : "Descendant"}`}
                        onPress={() => setOrderAsc(!orderAsc)}
                    />
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
                            data={currentClients}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item, index }) => {
                                const isEven = index % 2 === 0; // Condition pour les éléments pairs
                                const backgroundColor = isEven
                                    ? "#f9f9f9"
                                    : "#e0e0e0"; // Couleurs alternées
                                const ongoingInterventions =
                                    item.interventions?.filter(
                                        (intervention) =>
                                            intervention.status !== "Réparé" &&
                                            intervention.status !== "Récupéré"
                                    ) || [];
                                const totalInterventionsEnCours =
                                    ongoingInterventions.length;
                                const noInterventions =
                                    !item.interventions ||
                                    item.interventions.length === 0;
                                const allRepairedOrRecovered =
                                    item.interventions.every(
                                        (intervention) =>
                                            intervention.status === "Réparé" ||
                                            intervention.status === "Récupéré"
                                    );
                                const totalInterventions = item.interventions
                                    ? item.interventions.length
                                    : 0; // Compte le nombre total d'interventions
                                const latestIntervention =
                                    item.latestIntervention;
                                const status = latestIntervention
                                    ? latestIntervention.status
                                    : "Aucun statut";
                                const deviceType =
                                    latestIntervention?.deviceType; // Récupère le type d'appareil
                                const commande = latestIntervention?.commande; // Récupérer le nom de la commande

                                // Calculer le nombre de photos pour la dernière intervention
                                const totalImages =
                                    latestIntervention?.photos?.length || 0;
                                // *** Si le client n'a pas d'interventions en cours, afficher seulement les informations basiques ***
                                if (!latestIntervention) {
                                    return (
                                        <TouchableOpacity
                                            style={[
                                                styles.clientCard,
                                                { backgroundColor },
                                            ]} // Applique la couleur en fonction de l'index
                                            onPress={() =>
                                                navigation.navigate(
                                                    "AddIntervention",
                                                    {
                                                        clientId: item.id,
                                                    }
                                                )
                                            } // Vous pouvez modifier la navigation ici si nécessaire
                                        >
                                            <View style={styles.clientInfo}>
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
                                                        Dernière modification :{" "}
                                                        {formatDateTime(
                                                            item.updatedAt
                                                        )}
                                                    </Text>
                                                )}
                                                {/* Affichage du nombre total d'interventions passées, s'il y en a */}
                                                {totalInterventions > 0 && (
                                                    <Text
                                                        style={
                                                            styles.totalInterventionsText
                                                        }
                                                    >
                                                        Interventions passées :{" "}
                                                        {totalInterventions}
                                                    </Text>
                                                )}
                                                <View
                                                    style={styles.rightSection}
                                                ></View>
                                            </View>
                                            <View
                                                style={styles.topRightButtons}
                                            >
                                                <TouchableOpacity
                                                    style={styles.trashButton}
                                                    onPress={() =>
                                                        confirmDeleteClient(
                                                            item.id
                                                        )
                                                    }
                                                >
                                                    <Ionicons
                                                        name="trash"
                                                        size={20}
                                                        color="#000"
                                                    />
                                                </TouchableOpacity>
                                            </View>
                                            <TouchableOpacity
                                                style={
                                                    styles.interventionContainerRight
                                                } // Style pour encadrer l'icône et le nombre d'interventions
                                                onPress={() =>
                                                    navigation.navigate(
                                                        "ClientInterventionsPage",
                                                        {
                                                            clientId: item.id,
                                                        }
                                                    )
                                                }
                                            >
                                                <View
                                                    style={
                                                        styles.interventionBox
                                                    }
                                                >
                                                    <FontAwesome5
                                                        name="tools"
                                                        size={20}
                                                        color="#000"
                                                    />
                                                    <Text
                                                        style={
                                                            styles.interventionsCount
                                                        }
                                                    >
                                                        {" "}
                                                        {totalInterventions}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        </TouchableOpacity>
                                    );
                                }
                                const getProgressStatus = (status) => {
                                    switch (status) {
                                        case "En attente de pièces":
                                            return {
                                                percentage: 25,
                                                color: "#270381",
                                            }; // Orange pour "En attente de pièces"
                                        case "Devis accepté":
                                            return {
                                                percentage: 50,
                                                color: "#FFD700",
                                            }; // Jaune pour "Devis accepté"
                                        case "Réparation en cours":
                                            return {
                                                percentage: 75,
                                                color: "#1E90FF",
                                            }; // Bleu pour "Réparation en cours"
                                        case "Réparé":
                                            return {
                                                percentage: 100,
                                                color: "#32CD32",
                                            }; // Vert pour "Réparé"
                                        case "Non réparable":
                                            return {
                                                percentage: 0,
                                                color: "#ff0000",
                                            }; // Rouge pour "Non réparable"
                                        default:
                                            return {
                                                percentage: 0,
                                                color: "#e0e0e0",
                                            }; // Gris pour le statut par défaut
                                    }
                                };

                                // *** Si le client a une intervention en cours, afficher les informations complètes ***
                                return (
                                    <View
                                        style={[
                                            styles.clientCard,
                                            getStatusStyle(status),
                                        ]}
                                    >
                                        <TouchableOpacity
                                            style={styles.clientInfo}
                                            onPress={() =>
                                                navigation.navigate(
                                                    "EditClient",
                                                    { client: item }
                                                )
                                            }
                                        >
                                            <Text style={styles.ficheNumber}>
                                                Numéro de client N°{" "}
                                                {item.ficheNumber}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Nom : {item.name.toUpperCase()}
                                            </Text>
                                            <View style={styles.phoneContainer}>
                                                <Text style={styles.clientText}>
                                                    Téléphone :{" "}
                                                </Text>
                                                <Text
                                                    style={styles.phoneNumber}
                                                >
                                                    {formatPhoneNumber(
                                                        item.phone
                                                    )}
                                                </Text>
                                            </View>
                                            <Text style={styles.clientText}>
                                                Date de création :{" "}
                                                {formatDateTime(item.createdAt)}
                                            </Text>
                                            {item.updatedAt && (
                                                <Text style={styles.clientText}>
                                                    Dernière modification :{" "}
                                                    {formatDateTime(
                                                        item.updatedAt
                                                    )}
                                                </Text>
                                            )}
                                            <Text style={styles.statusText}>
                                                Statut : {status}
                                            </Text>

                                            {/* Barre de progression pour le statut actuel */}
                                            <View
                                                style={
                                                    styles.progressBarContainer
                                                }
                                            >
                                                <View
                                                    style={[
                                                        styles.progressBar,
                                                        {
                                                            width: `${
                                                                getProgressStatus(
                                                                    status
                                                                ).percentage
                                                            }%`,
                                                            backgroundColor:
                                                                getProgressStatus(
                                                                    status
                                                                ).color,
                                                        },
                                                    ]}
                                                />
                                            </View>

                                            {status ===
                                                "En attente de pièces" &&
                                                commande && (
                                                    <Text
                                                        style={
                                                            styles.commandeText
                                                        }
                                                    >
                                                        En commande : {commande}
                                                    </Text>
                                                )}
                                            <Text style={styles.clientText}>
                                                Montant :{" "}
                                                {latestIntervention?.cost?.toLocaleString(
                                                    "fr-FR",
                                                    {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    }
                                                )}{" "}
                                                €
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Nombre d'images : {totalImages}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Interventions en cours :{" "}
                                                {totalInterventionsEnCours}
                                            </Text>
                                        </TouchableOpacity>

                                        {item.interventions &&
                                            item.interventions.length > 0 && (
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
                                                            (intervention) =>
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
                                                                    key={index}
                                                                    style={{
                                                                        marginLeft: 5,
                                                                    }}
                                                                >
                                                                    {getDeviceIcon(
                                                                        intervention.deviceType
                                                                    )}
                                                                </View>
                                                            )
                                                        )}
                                                </View>
                                            )}
                                        <View style={styles.rightSection}>
                                            <TouchableOpacity
                                                style={
                                                    styles.interventionContainer
                                                } // Style pour encadrer l'icône et le nombre d'interventions
                                                onPress={() =>
                                                    navigation.navigate(
                                                        "ClientInterventionsPage",
                                                        {
                                                            clientId: item.id,
                                                        }
                                                    )
                                                }
                                            >
                                                <View
                                                    style={
                                                        styles.iconRowContainer
                                                    }
                                                >
                                                    <TouchableOpacity
                                                        style={
                                                            styles.notificationIconContainer
                                                        } // Ajoute un style similaire aux autres icônes
                                                        onPress={() => {
                                                            setSelectedInterventionId(
                                                                latestIntervention.id
                                                            ); // Capturer l'ID de l'intervention sélectionnée
                                                            setNotifyModalVisible(
                                                                true
                                                            ); // Ouvrir la modal
                                                        }}
                                                    >
                                                        {latestIntervention?.notifiedBy ===
                                                        "SMS" ? (
                                                            <Ionicons
                                                                name="chatbubbles-outline"
                                                                size={24}
                                                                color="green" // Icône verte si le client a été averti par SMS
                                                            />
                                                        ) : latestIntervention?.notifiedBy ===
                                                          "Téléphone" ? (
                                                            <Ionicons
                                                                name="call-outline"
                                                                size={24}
                                                                color="blue" // Icône bleue si le client a été averti par téléphone
                                                            />
                                                        ) : (
                                                            <Ionicons
                                                                name="notifications-off-outline"
                                                                size={24}
                                                                color="gray" // Icône grise si le client n'a pas encore été averti
                                                            />
                                                        )}
                                                    </TouchableOpacity>

                                                    <View
                                                        style={
                                                            styles.interventionBox
                                                        }
                                                    >
                                                        <FontAwesome5
                                                            name="tools"
                                                            size={20}
                                                            color="#000"
                                                        />
                                                        <Text
                                                            style={
                                                                styles.interventionsCount
                                                            }
                                                        >
                                                            {" "}
                                                            {totalInterventions}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={styles.topRightButtons}>
                                            {status ===
                                                "En attente de pièces" &&
                                                commande && (
                                                    <TouchableOpacity
                                                        style={
                                                            styles.transportButton
                                                        }
                                                        onPress={() => {
                                                            setSelectedCommande(
                                                                commande
                                                            );
                                                            setTransportModalVisible(
                                                                true
                                                            );
                                                        }}
                                                    >
                                                        <FontAwesome5
                                                            name="shipping-fast"
                                                            size={20}
                                                            color="#000000"
                                                        />
                                                    </TouchableOpacity>
                                                )}
                                            <TouchableOpacity
                                                style={styles.editButton}
                                                onPress={() =>
                                                    navigation.navigate(
                                                        "EditClient",
                                                        { client: item }
                                                    )
                                                }
                                            >
                                                <Ionicons
                                                    name="create-outline"
                                                    size={20}
                                                    color="#000"
                                                />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.printButton}
                                                onPress={() =>
                                                    navigation.navigate(
                                                        "ClientPreviewPage",
                                                        {
                                                            clientId: item.id,
                                                        }
                                                    )
                                                }
                                            >
                                                <Ionicons
                                                    name="print"
                                                    size={20}
                                                    color="#000000"
                                                />
                                            </TouchableOpacity>
                                            {totalImages > 0 && (
                                                <TouchableOpacity
                                                    style={styles.photoButton}
                                                    onPress={() =>
                                                        goToImageGallery(
                                                            item.id
                                                        )
                                                    }
                                                >
                                                    <FontAwesome5
                                                        name="image"
                                                        size={20}
                                                        color="#000000"
                                                    />
                                                </TouchableOpacity>
                                            )}
                                            <TouchableOpacity
                                                style={styles.trashButton}
                                                onPress={() =>
                                                    confirmDeleteClient(item.id)
                                                }
                                            >
                                                <Ionicons
                                                    name="trash"
                                                    size={20}
                                                    color="#000"
                                                />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            }}
                            showsVerticalScrollIndicator={false}
                        />
                        <View style={styles.paginationContainer}>
                            <TouchableOpacity
                                onPress={goToPreviousPage}
                                disabled={currentPage === 1}
                            >
                                <Text
                                    style={
                                        currentPage === 1
                                            ? styles.disabledPaginationText
                                            : styles.paginationText
                                    }
                                >
                                    Précédent
                                </Text>
                            </TouchableOpacity>
                            <Text style={styles.paginationText}>
                                Page {currentPage} sur {totalPages}
                            </Text>
                            <TouchableOpacity
                                onPress={goToNextPage}
                                disabled={currentPage === totalPages}
                            >
                                <Text
                                    style={
                                        currentPage === totalPages
                                            ? styles.disabledPaginationText
                                            : styles.paginationText
                                    }
                                >
                                    Suivant
                                </Text>
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
        backgroundColor: "#f8d7da",
        borderRadius: 50,
        marginTop: 10,
    },
    repairedCountButton: {
        alignItems: "center", // Pour centrer le texte à l'intérieur du bouton
    },
    repairedCountText: {
        color: "#721c24",
        fontWeight: "bold",
        textAlign: "center",
        fontSize: 16,
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
        backgroundColor: "rgba(0, 0, 0, 0.6)", // Voile sombre pour améliorer la lisibilité
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
        padding: 15,
        marginBottom: 10,
        borderRadius: 15,
        borderWidth: 2,
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        position: "relative",
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
        borderRadius: 5,
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
        fontSize: 18,
        fontStyle: "italic",
        fontWeight: "bold",
        color: "#801919",
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
        flexDirection: "row",
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
    },
    interventionContainer: {
        marginTop: 10, // Espacement du haut
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
    interventionsCount: {
        fontSize: 16, // Taille du texte du nombre d'interventions
        marginLeft: 5, // Espace entre l'icône et le texte
        color: "#000", // Couleur du texte
    },
    icon: {
        marginRight: 5,
    },
});
