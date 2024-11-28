import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    Alert,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    Button,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    TouchableWithoutFeedback,
} from "react-native";
import { supabase } from "../supabaseClient";
import { Picker } from "@react-native-picker/picker";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

export default function AdminPage() {
    const navigation = useNavigation();
    const [productType, setProductType] = useState("");
    const [brand, setBrand] = useState("");
    const [model, setModel] = useState("");
    const [selectedProductType, setSelectedProductType] = useState(null);
    const [selectedBrand, setSelectedBrand] = useState(null);
    const [productTypes, setProductTypes] = useState([]);
    const [brands, setBrands] = useState([]);
    const [models, setModels] = useState([]);
    /* const [clients, setClients] = useState([]); */
    const [newProductType, setNewProductType] = useState(""); // Nouveau champ pour un type de produit
    const [newBrand, setNewBrand] = useState(""); // Nouveau champ pour une marque
    const [showAddFields, setShowAddFields] = useState(false);
    const [showPending, setShowPending] = useState(false);
    const [showOnAir, setShowOnAir] = useState(false);
    const [showInProgress, setShowInProgress] = useState(false);
    const [showRepaired, setShowRepaired] = useState(false);
    const [showRecovered, setShowRecovered] = useState(false);
    const [showEstimate, setShowEstimate] = useState(false);
    const [showNot, setShowNot] = useState(false);
    const [searchText, setSearchText] = useState(""); // Texte de recherche
    const [filteredClients, setFilteredClients] = useState([]); // Clients filtrés
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 7;

    const totalPages = Math.ceil((filteredClients || []).length / itemsPerPage);
    const currentData = (filteredClients || []).slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );
    const [showStatusPickers, setShowStatusPickers] = useState(false); // Par défaut, les Pickers sont masqués

    const [clients, setClients] = useState({
        all: [],
        pending: [],
        onAir: [],
        estimate: [],
        not: [],
        inProgress: [],
        repaired: [],
        recovered: [],
    });

    useEffect(() => {
        loadProductTypes();
        loadClients();
    }, []);

    const loadProductTypes = async () => {
        const { data, error } = await supabase.from("article").select("*");
        if (error) {
            console.log("Erreur chargement produits:", error.message);
            Alert.alert("Erreur", "Erreur lors du chargement des produits.");
        } else {
            setProductTypes(data);
        }
    };

    const loadBrands = async (productTypeId) => {
        const { data, error } = await supabase
            .from("marque")
            .select("*")
            .eq("article_id", productTypeId);

        if (error) {
            console.log("Erreur chargement marques:", error.message);
            Alert.alert("Erreur", "Erreur lors du chargement des marques.");
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
            console.log("Erreur chargement modèles:", error.message);
            Alert.alert("Erreur", "Erreur lors du chargement des modèles.");
        } else {
            setModels(data);
        }
    };

    const loadClients = async () => {
        try {
            const { data, error } = await supabase.from("clients").select(`
					*,
					interventions (
						id,
						status
					)
				`);

            if (error) throw error;

            if (data) {
                const pendingClients = data.filter((client) =>
                    client.interventions.some(
                        (intervention) =>
                            intervention.status === "En attente de pièces"
                    )
                );
                const onAirClients = data.filter((client) =>
                    client.interventions.some(
                        (intervention) =>
                            intervention.status === "Devis en cours"
                    )
                );
                const estimateClients = data.filter((client) =>
                    client.interventions.some(
                        (intervention) =>
                            intervention.status === "Devis accepté"
                    )
                );
                const notClients = data.filter((client) =>
                    client.interventions.some(
                        (intervention) =>
                            intervention.status === "Non réparable"
                    )
                );
                const inProgressClients = data.filter((client) =>
                    client.interventions.some(
                        (intervention) =>
                            intervention.status === "Réparation en cours"
                    )
                );
                const repairedClients = data.filter((client) =>
                    client.interventions.some(
                        (intervention) => intervention.status === "Réparé"
                    )
                );
                const recoveredClients = data.filter((client) =>
                    client.interventions.some(
                        (intervention) => intervention.status === "Récupéré"
                    )
                );

                // Mettre à jour les états
                setClients({
                    all: data, // Tous les clients sans distinction
                    pending: pendingClients,
                    onAir: onAirClients,
                    estimate: estimateClients,
                    not: notClients,
                    inProgress: inProgressClients,
                    repaired: repairedClients,
                    recovered: recoveredClients,
                });

                // Initialiser la recherche avec toutes les données combinées
                setFilteredClients(data);
            }
        } catch (error) {
            console.error("Erreur lors du chargement des clients :", error);
            Alert.alert(
                "Erreur",
                "Une erreur est survenue lors du chargement des clients."
            );
        }
    };
    useEffect(() => {
        if (searchText.trim() === "") {
            setFilteredClients(clients.all); // Réinitialise avec tous les clients
        } else {
            const lowercasedSearch = searchText.toLowerCase();
            const filtered = clients.all.filter(
                (client) =>
                    client.name.toLowerCase().includes(lowercasedSearch) ||
                    client.phone.includes(lowercasedSearch)
            );
            setFilteredClients(filtered);
        }
    }, [searchText, clients]);

    const addProductType = async () => {
        if (!newProductType.trim()) {
            Alert.alert("Erreur", "Le nom du produit ne peut pas être vide.");
            return;
        }

        try {
            const { data, error } = await supabase
                .from("article")
                .insert([{ nom: newProductType }])
                .select();

            if (error) throw error;

            setProductTypes([...productTypes, data[0]]);
            setNewProductType("");
            Alert.alert("Succès", "Produit ajouté avec succès.");
        } catch (error) {
            console.error("Erreur lors de l'ajout du produit :", error);
            Alert.alert("Erreur", "Erreur lors de l'ajout du produit.");
        }
    };

    const addBrand = async () => {
        if (!selectedProductType) {
            Alert.alert(
                "Erreur",
                "Sélectionnez un type de produit avant d'ajouter une marque."
            );
            return;
        }
        if (!newBrand.trim()) {
            Alert.alert("Erreur", "Le nom de la marque ne peut pas être vide.");
            return;
        }

        try {
            const { data, error } = await supabase
                .from("marque")
                .insert([{ nom: newBrand, article_id: selectedProductType }])
                .select();

            if (error) throw error;

            setBrands([...brands, data[0]]);
            setNewBrand("");
            Alert.alert("Succès", "Marque ajoutée avec succès.");
        } catch (error) {
            console.error("Erreur lors de l'ajout de la marque :", error);
            Alert.alert("Erreur", "Erreur lors de l'ajout de la marque.");
        }
    };

    const addModel = async () => {
        if (!selectedProductType) {
            Alert.alert(
                "Erreur",
                "Sélectionnez un type de produit avant d'ajouter un modèle."
            );
            return;
        }
        if (!selectedBrand) {
            Alert.alert(
                "Erreur",
                "Sélectionnez une marque avant d'ajouter un modèle."
            );
            return;
        }
        if (!model.trim()) {
            Alert.alert("Erreur", "Le nom du modèle ne peut pas être vide.");
            return;
        }

        try {
            const { data, error } = await supabase
                .from("modele")
                .insert([
                    {
                        nom: model,
                        marque_id: selectedBrand,
                        article_id: selectedProductType,
                    },
                ])
                .select();

            if (error) throw error;

            setModel("");
            Alert.alert("Succès", "Modèle ajouté avec succès.");
        } catch (error) {
            console.error("Erreur lors de l'ajout du modèle :", error);
            Alert.alert("Erreur", "Erreur lors de l'ajout du modèle.");
        }
    };

    const goToNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    };
    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.container}>
                    <TouchableOpacity
                        style={styles.navigateButton}
                        onPress={() => navigation.navigate("ArticlesPage")}
                    >
                        <MaterialIcons
                            name="list"
                            size={24}
                            color="#fff"
                            style={styles.icon}
                        />
                        <Text style={styles.buttonTextGestion}>
                            Gérer Produits, Marques et Modèles
                        </Text>
                    </TouchableOpacity>
                    {/* Bouton pour afficher/masquer les champs d'ajout */}
                    <TouchableOpacity
                        style={styles.toggleButtonCreer}
                        onPress={() => setShowAddFields(!showAddFields)}
                    >
                        <Text style={styles.buttonText}>
                            {showAddFields
                                ? "Fermer la création de produit"
                                : "Créer un produit"}
                        </Text>
                        <MaterialIcons
                            name={
                                showAddFields
                                    ? "keyboard-arrow-up"
                                    : "keyboard-arrow-down"
                            }
                            size={24}
                            color="#ebeaea"
                        />
                    </TouchableOpacity>

                    {/* Section d'ajout de produit, marque, modèle */}
                    {showAddFields && (
                        <>
                            {/* Sélection ou ajout d'un produit */}
                            <Text style={styles.sectionTitle}>
                                Sélectionner ou ajouter un produit
                            </Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={selectedProductType}
                                    onValueChange={(value) => {
                                        setSelectedProductType(value);
                                        loadBrands(value);
                                    }}
                                    style={styles.picker}
                                >
                                    <Picker.Item
                                        label="Sélectionnez un produit"
                                        value={null}
                                    />
                                    {productTypes.map((type) => (
                                        <Picker.Item
                                            key={type.id}
                                            label={type.nom}
                                            value={type.id}
                                        />
                                    ))}
                                </Picker>
                            </View>
                            <TextInput
                                value={newProductType}
                                onChangeText={setNewProductType}
                                placeholder="Ajouter un nouveau produit"
                                style={styles.input}
                            />
                            <TouchableOpacity
                                style={styles.addButton}
                                onPress={addProductType}
                            >
                                <Text style={styles.buttonText}>
                                    Ajouter Produit
                                </Text>
                            </TouchableOpacity>

                            {/* Sélection ou ajout d'une marque */}
                            <Text style={styles.sectionTitle}>
                                Sélectionner ou ajouter une marque
                            </Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={selectedBrand}
                                    onValueChange={setSelectedBrand}
                                    style={styles.picker}
                                >
                                    <Picker.Item
                                        label="Sélectionnez une marque"
                                        value={null}
                                    />
                                    {brands.map((brand) => (
                                        <Picker.Item
                                            key={brand.id}
                                            label={brand.nom}
                                            value={brand.id}
                                        />
                                    ))}
                                </Picker>
                            </View>
                            <TextInput
                                value={newBrand}
                                onChangeText={setNewBrand}
                                placeholder="Ajouter une nouvelle marque"
                                style={styles.input}
                            />
                            <TouchableOpacity
                                style={styles.addButton}
                                onPress={addBrand}
                            >
                                <Text style={styles.buttonText}>
                                    Ajouter Marque
                                </Text>
                            </TouchableOpacity>

                            {/* Ajout d'un modèle */}
                            <Text style={styles.sectionTitle}>
                                Ajouter un modèle
                            </Text>
                            <TextInput
                                value={model}
                                onChangeText={setModel}
                                placeholder="Nom du modèle"
                                style={styles.input}
                            />
                            <TouchableOpacity
                                style={styles.addButton}
                                onPress={addModel}
                            >
                                <Text style={styles.buttonText}>
                                    Ajouter Modèle
                                </Text>
                            </TouchableOpacity>
                        </>
                    )}

                    <TouchableOpacity
                        style={styles.toggleButton}
                        onPress={() => setShowStatusPickers(!showStatusPickers)}
                    >
                        <Text style={styles.buttonText}>
                            {showStatusPickers
                                ? "Masquer les filtres par statut"
                                : "Afficher les filtres par statut"}
                        </Text>
                        <MaterialIcons
                            name={
                                showStatusPickers
                                    ? "expand-less"
                                    : "expand-more"
                            }
                            size={24}
                            color="#ebeaea"
                        />
                    </TouchableOpacity>

                    {showStatusPickers && (
                        <View>
                            {/* Picker pour "En attente de pièces" */}
                            <TouchableOpacity
                                style={styles.toggleButton}
                                onPress={() => setShowPending(!showPending)}
                            >
                                <Text style={styles.buttonText}>
                                    En attente de pièces
                                </Text>
                                <MaterialIcons
                                    name={
                                        showPending
                                            ? "expand-less"
                                            : "expand-more"
                                    }
                                    size={24}
                                    color="#ebeaea"
                                />
                            </TouchableOpacity>
                            {showPending && (
                                <FlatList
                                    data={clients.pending}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item, index }) => (
                                        <View
                                            style={[
                                                styles.clientItem,
                                                {
                                                    backgroundColor:
                                                        index % 2 === 0
                                                            ? "#f9f9f9"
                                                            : "#ffffff",
                                                },
                                            ]}
                                        >
                                            <Text style={styles.clientText}>
                                                N° client : {item.ficheNumber}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Nom : {item.name}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Téléphone : {item.phone}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Statut : En attente de pièces
                                            </Text>
                                        </View>
                                    )}
                                />
                            )}
                            {/* Toggle pour les clients "devis accepter" */}
                            <TouchableOpacity
                                style={styles.toggleButton}
                                onPress={() => setShowOnAir(!showOnAir)}
                            >
                                <Text style={styles.buttonText}>
                                    Devis en cours
                                </Text>
                                <MaterialIcons
                                    name={
                                        showOnAir
                                            ? "expand-less"
                                            : "expand-more"
                                    }
                                    size={24}
                                    color="#ebeaea"
                                />
                            </TouchableOpacity>
                            {showOnAir && (
                                <FlatList
                                    data={clients.onAir}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item, index }) => (
                                        <View
                                            style={[
                                                styles.clientItem,
                                                {
                                                    backgroundColor:
                                                        index % 2 === 0
                                                            ? "#f9f9f9"
                                                            : "#ffffff",
                                                },
                                            ]}
                                        >
                                            <Text style={styles.clientText}>
                                                N° client : {item.ficheNumber}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Nom : {item.name}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Téléphone : {item.phone}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Statut : Devis en cours
                                            </Text>
                                        </View>
                                    )}
                                />
                            )}
                            {/* Toggle pour les clients "devis accepter" */}
                            <TouchableOpacity
                                style={styles.toggleButton}
                                onPress={() => setShowEstimate(!showEstimate)}
                            >
                                <Text style={styles.buttonText}>
                                    Devis accepté
                                </Text>
                                <MaterialIcons
                                    name={
                                        showEstimate
                                            ? "expand-less"
                                            : "expand-more"
                                    }
                                    size={24}
                                    color="#ebeaea"
                                />
                            </TouchableOpacity>
                            {showEstimate && (
                                <FlatList
                                    data={clients.estimate}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item, index }) => (
                                        <View
                                            style={[
                                                styles.clientItem,
                                                {
                                                    backgroundColor:
                                                        index % 2 === 0
                                                            ? "#f9f9f9"
                                                            : "#ffffff",
                                                },
                                            ]}
                                        >
                                            <Text style={styles.clientText}>
                                                N° client : {item.ficheNumber}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Nom : {item.name}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Téléphone : {item.phone}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Statut : Devis accepté
                                            </Text>
                                        </View>
                                    )}
                                />
                            )}

                            {/* Toggle pour les clients "Réparation en cours" */}
                            <TouchableOpacity
                                style={styles.toggleButton}
                                onPress={() =>
                                    setShowInProgress(!showInProgress)
                                }
                            >
                                <Text style={styles.buttonText}>
                                    Réparation en cours
                                </Text>
                                <MaterialIcons
                                    name={
                                        showInProgress
                                            ? "expand-less"
                                            : "expand-more"
                                    }
                                    size={24}
                                    color="#ebeaea"
                                />
                            </TouchableOpacity>
                            {showInProgress && (
                                <FlatList
                                    data={clients.inProgress}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item, index }) => (
                                        <View
                                            style={[
                                                styles.clientItem,
                                                {
                                                    backgroundColor:
                                                        index % 2 === 0
                                                            ? "#f9f9f9"
                                                            : "#ffffff",
                                                },
                                            ]}
                                        >
                                            <Text style={styles.clientText}>
                                                N° client : {item.ficheNumber}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Nom : {item.name}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Téléphone : {item.phone}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Statut : Réparation en cours
                                            </Text>
                                        </View>
                                    )}
                                />
                            )}

                            {/* Toggle pour les clients "Réparé" */}
                            <TouchableOpacity
                                style={styles.toggleButton}
                                onPress={() => setShowRepaired(!showRepaired)}
                            >
                                <Text style={styles.buttonText}>Réparé</Text>
                                <MaterialIcons
                                    name={
                                        showRepaired
                                            ? "expand-less"
                                            : "expand-more"
                                    }
                                    size={24}
                                    color="#ebeaea"
                                />
                            </TouchableOpacity>
                            {showRepaired && (
                                <FlatList
                                    data={clients.repaired}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item, index }) => (
                                        <View
                                            style={[
                                                styles.clientItem,
                                                {
                                                    backgroundColor:
                                                        index % 2 === 0
                                                            ? "#f9f9f9"
                                                            : "#ffffff",
                                                },
                                            ]}
                                        >
                                            <Text style={styles.clientText}>
                                                N° client : {item.ficheNumber}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Nom : {item.name}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Téléphone : {item.phone}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Statut : Réparé
                                            </Text>
                                        </View>
                                    )}
                                />
                            )}

                            {/* Toggle pour les clients "Récupéré" */}
                            <TouchableOpacity
                                style={styles.toggleButton}
                                onPress={() => setShowRecovered(!showRecovered)}
                            >
                                <Text style={styles.buttonText}>Récupéré</Text>
                                <MaterialIcons
                                    name={
                                        showRecovered
                                            ? "expand-less"
                                            : "expand-more"
                                    }
                                    size={24}
                                    color="#ebeaea"
                                />
                            </TouchableOpacity>
                            {showRecovered && (
                                <FlatList
                                    data={clients.recovered}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item, index }) => (
                                        <View
                                            style={[
                                                styles.clientItem,
                                                {
                                                    backgroundColor:
                                                        index % 2 === 0
                                                            ? "#f9f9f9"
                                                            : "#ffffff",
                                                },
                                            ]}
                                        >
                                            <Text style={styles.clientText}>
                                                N° client : {item.ficheNumber}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Nom : {item.name}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Téléphone : {item.phone}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Statut : Récupéré
                                            </Text>
                                        </View>
                                    )}
                                />
                            )}
                            {/* Toggle pour les clients "non réparable" */}
                            <TouchableOpacity
                                style={styles.toggleButton}
                                onPress={() => setShowNot(!showNot)}
                            >
                                <Text style={styles.buttonText}>
                                    Non réparable
                                </Text>
                                <MaterialIcons
                                    name={
                                        showNot ? "expand-less" : "expand-more"
                                    }
                                    size={24}
                                    color="#ebeaea"
                                />
                            </TouchableOpacity>
                            {showRecovered && (
                                <FlatList
                                    data={clients.not}
                                    keyExtractor={(item) => item.id.toString()}
                                    renderItem={({ item, index }) => (
                                        <View
                                            style={[
                                                styles.clientItem,
                                                {
                                                    backgroundColor:
                                                        index % 2 === 0
                                                            ? "#f9f9f9"
                                                            : "#ffffff",
                                                },
                                            ]}
                                        >
                                            <Text style={styles.clientText}>
                                                N° client : {item.ficheNumber}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Nom : {item.name}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Téléphone : {item.phone}
                                            </Text>
                                            <Text style={styles.clientText}>
                                                Statut : Récupéré
                                            </Text>
                                        </View>
                                    )}
                                />
                            )}
                        </View>
                    )}
                    <Text style={styles.sectionTitle}>
                        Recherche dans la liste complète des clients
                    </Text>
                    <View style={styles.searchContainer}>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="RECHERCHER PAR NOM OU TÉLÉPHONE"
                            value={searchText}
                            autoCapitalize="characters"
                            onChangeText={(text) =>
                                setSearchText(text.toUpperCase())
                            }
                        />
                        <MaterialIcons
                            name="search"
                            size={24}
                            color="#888"
                            style={styles.searchIcon}
                        />
                    </View>

					<Text style={styles.sectionTitle}>Liste complète des clients</Text>

{currentData.length > 0 ? (
<FlatList
    data={currentData || []} // Utilise un tableau vide par défaut pour éviter les erreurs
    keyExtractor={(item) => item.id?.toString()} // Vérifie que l'ID existe
    renderItem={({ item, index }) => (
        <TouchableOpacity
            onPress={() => {
                console.log("Navigating to ClientInterventionsPage", item.id); // Debug
                if (item?.id) {
                    navigation.navigate("ClientInterventionsPage", { clientId: item.id });
                } else {
                    console.warn("ID du client introuvable :", item);
                }
            }}
            style={[
                styles.clientItem,
                { backgroundColor: index % 2 === 0 ? "#e7e6e6" : "#ffffff" },
            ]}
        >
            <Text style={styles.clientText}>
                N° client : {item?.ficheNumber || "Non disponible"}
            </Text>
            <Text style={styles.clientText}>
                Nom : {item?.name || "Non disponible"}
            </Text>
            <Text style={styles.clientText}>
                Téléphone :{" "}
                {item?.phone
                    ? item.phone.replace(/(\d{2})(?=\d)/g, "$1 ")
                    : "Non disponible"}
            </Text>
        </TouchableOpacity>
    )}
/>
) : (
	<Text style={styles.noDataText}>
		Aucun client à afficher.
	</Text>
)}

{/* Pagination Controls */}
<View style={styles.paginationContainer}>
	<TouchableOpacity
		onPress={goToPreviousPage}
		disabled={currentPage === 1}
		style={styles.paginationButton}
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
		style={styles.paginationButton}
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
</View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: "#fff",
    },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        padding: 10,
        marginVertical: 10,
        borderRadius: 5,
    },
    picker: {
        marginVertical: 2,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 5,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "bold",
        marginVertical: 10,
    },
    addButton: {
        backgroundColor: "#3c5068",
        paddingVertical: 12,
        borderRadius: 5,
        alignItems: "center",
        marginVertical: 10,
        elevation: 2,
    },
    buttonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
    },
    toggleButton: {
        flexDirection: "row",
        backgroundColor: "#445a75",
        paddingVertical: 12,
        borderWidth: 1,
        borderRadius: 5,
        borderColor: "#202020",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 5,
        elevation: 5,
    },
    toggleButtonCreer: {
        flexDirection: "row",
        backgroundColor: "#3c5068",
        paddingVertical: 12,
        borderWidth: 1,
        borderRadius: 5,
        borderColor: "#000",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 15,
        elevation: 5,
    },
    clientItem: {
        padding: 15,
        borderColor: "#8398f7",
        backgroundColor: "#f9f9f9",
        marginVertical: 5,
        borderRadius: 5,
        borderWidth: 1,
        elevation: 5,
    },
    clientText: {
        fontSize: 16,
    },
    navigateButton: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        backgroundColor: "#1f3750",
        padding: 15,
        borderRadius: 5,
        marginBottom: 20,
        borderColor: "#000",
    },
    icon: {
        marginRight: 10,
    },
    pickerContainer: {
        backgroundColor: "#f1efef",
        borderRadius: 5,
        padding: 5,
        marginVertical: 10,

        // Ombre pour iOS
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,

        // Ombre pour Android
        elevation: 2,
    },
    buttonTextGestion: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 5,
        paddingHorizontal: 10,
        marginBottom: 15,
        backgroundColor: "#fff",
    },
    searchInput: {
        flex: 1, // Occupe tout l'espace restant
        height: 40,
        fontSize: 16,
        color: "#333",
        paddingHorizontal: 10,
    },
    searchIcon: {
        marginLeft: 10, // Espacement entre le champ et l'icône
    },
    pickerButton: {
        padding: 10,
        borderWidth: 1,
        borderRadius: 5,
        backgroundColor: "#f5974a",
        marginBottom: 10,
        alignItems: "center",
        justifyContent: "center",
    },
	noDataText: { textAlign: "center", color: "#888", marginTop: 20 },
    paginationContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 10,
    },
    paginationButton: {
        padding: 10,
        backgroundColor: "#445a75",
        borderRadius: 5,
    },
    paginationText: { color: "#fff", fontSize: 16 },
    disabledPaginationText: { color: "#ccc", fontSize: 16 },
});
