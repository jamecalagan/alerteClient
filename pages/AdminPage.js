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
	Image,
} from "react-native";
import { supabase } from "../supabaseClient";
import { Picker } from "@react-native-picker/picker";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import BottomNavigation  from "../components/BottomNavigation";
export default function AdminPage({ navigation, route }) {
    
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
    const itemsPerPage = 6;

    const totalPages = Math.ceil((filteredClients?.length || 0) / itemsPerPage);
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
			// Trier les articles par ordre alphabétique sur la colonne "nom"
			const sortedProducts = data.sort((a, b) => a.nom.localeCompare(b.nom));
			setProductTypes(sortedProducts);  // Appliquer le tri alphabétique
		}
	};
	

	const loadBrands = async (productTypeId) => {
		console.log("Chargement des marques pour le produit ID :", productTypeId);
		if (!productTypeId) {
			console.log("Aucun produit sélectionné.");
			setSelectedBrand(null);  // Réinitialisation du Picker des marques
			return;
		}
		try {
			// Requête pour les marques associées à l'article sélectionné
			const { data: associatedBrands, error: brandError } = await supabase
				.from("marque")
				.select("*")
				.eq("article_id", productTypeId);
	
			if (brandError) throw brandError;
	
			let brandsToDisplay = associatedBrands;
	
			// Si aucune marque associée, charger toutes les marques disponibles
			if (associatedBrands.length === 0) {
				console.log("Aucune marque associée au produit, chargement de toutes les marques disponibles.");
				const { data: allBrands, error: allBrandError } = await supabase.from("marque").select("*");
				if (allBrandError) throw allBrandError;
				brandsToDisplay = allBrands;
			}
	
			// Suppression des doublons par nom de marque
			const uniqueBrands = Array.from(new Map(brandsToDisplay.map(brand => [brand.nom, brand])).values());
	
			// Tri alphabétique des marques
			uniqueBrands.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
	
			console.log("Marques triées sans doublons :", uniqueBrands);
	
			// Mettre à jour l'état des marques dans le Picker
			setBrands(uniqueBrands);
			setSelectedBrand(null);  // Réinitialiser le Picker des marques après le chargement
	
		} catch (error) {
			console.error("Erreur lors du chargement des marques :", error);
			Alert.alert("Erreur", "Impossible de charger les marques.");
		}
	};
	
	
	
	
	
	const loadModels = async (brandId) => {
		console.log("Chargement des modèles pour la marque ID :", brandId);
		if (!brandId) {
			console.log("Aucune marque sélectionnée.");
			setModels([]);  // Réinitialisation des modèles si aucune marque sélectionnée
			return;
		}
		try {
			// Requête pour récupérer les modèles associés à la marque sélectionnée
			const { data: models, error } = await supabase
				.from("modele")
				.select("*")
				.eq("marque_id", brandId);
	
			if (error) throw error;
	
			if (models.length === 0) {
				console.log("Aucun modèle trouvé pour cette marque.");
				setModels([]);
				return;
			}
	
			// Suppression des doublons (par nom)
			const uniqueModels = Array.from(new Map(models.map(model => [model.nom, model])).values());
	
			// Tri alphabétique des modèles
			uniqueModels.sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }));
	
			console.log("Modèles triés sans doublons :", uniqueModels);
	
			setModels(uniqueModels);  // Mettre à jour l'état avec les modèles triés
	
		} catch (error) {
			console.error("Erreur lors du chargement des modèles :", error.message);
			Alert.alert("Erreur", "Impossible de charger les modèles.");
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
			Alert.alert("Erreur", "Sélectionnez un type de produit avant d'ajouter une marque.");
			return;
		}
		if (!newBrand.trim()) {
			Alert.alert("Erreur", "Le nom de la marque ne peut pas être vide.");
			return;
		}
	
		console.log("Ajout de la marque :", newBrand, "pour le produit ID :", selectedProductType);
	
		const { data, error } = await supabase.from("marque").insert([{ nom: newBrand, article_id: selectedProductType }]).select();
	
		if (error) {
			console.error("Erreur lors de l'ajout de la marque :", error);
			Alert.alert("Erreur", "Erreur lors de l'ajout de la marque.");
		} else {
			console.log("Marque ajoutée avec succès :", data[0]);
			setNewBrand("");  // Vide le champ "Nouvelle Marque"
			setSelectedBrandId(null);  // Réinitialiser la sélection de la marque
			Alert.alert("Succès", "Marque ajoutée avec succès.");
			loadBrands(selectedProductType);  // Rafraîchir la liste des marques
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
	useEffect(() => {
		if (selectedProductType) {
			setSelectedBrand(null);  // Réinitialiser la marque
			setModels([]);  // Réinitialiser la liste des modèles
		}
	}, [selectedProductType]);
    const goToNextPage = () => {
        if (currentPage < totalPages) setCurrentPage(currentPage + 1);
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) setCurrentPage(currentPage - 1);
    };
	const resetFields = () => {
		setSelectedProductType(null); // Réinitialise le produit
		setSelectedBrand(null); // Réinitialise la marque
		setModel(""); // Réinitialise le champ modèle
		setNewProductType(""); // Réinitialise le champ d'ajout de produit
		setNewBrand(""); // Réinitialise le champ d'ajout de marque
		console.log("Champs réinitialisés !");
	};
	
	const handlePageChange = (newPage) => {
		if (newPage >= 1 && newPage <= totalPages) {
			setCurrentPage(newPage); // Met à jour la page actuelle
		}
	};
    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.container}>
				<TouchableOpacity
                style={styles.button}
                onPress={() => navigation.navigate("SearchClientsPage")}
            >
                <Image
                    source={require("../assets/icons/search.png")} // Icône de recherche
                    style={styles.iconSearch}
                />
                <Text style={styles.buttonText}>Recherche multi-critères</Text>
            </TouchableOpacity>
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
    onPress={() => {
        setShowAddFields(!showAddFields); // Ouvre ou ferme la section
        resetFields(); // Réinitialise les champs lors de l'ouverture/fermeture
    }}
>
    <Text style={styles.buttonText}>
        {showAddFields ? "Fermer la création de produit" : "Créer un produit"}
    </Text>
    <MaterialIcons
        name={showAddFields ? "keyboard-arrow-up" : "keyboard-arrow-down"}
        size={24}
        color="#ebeaea"
    />
</TouchableOpacity>


					{showAddFields && (
    <>
        {/* Sélection ou ajout d'un produit */}
        <Text style={styles.sectionTitle}>Sélectionner ou ajouter un produit</Text>
        <View style={styles.pickerContainer}>
            <Picker
                selectedValue={selectedProductType}
                onValueChange={(value) => {
                    console.log("Produit sélectionné :", value);
                    setSelectedProductType(value);
                    setSelectedBrand(null); // Réinitialise la marque
                    setModel(""); // Réinitialise le modèle
                    if (value) {
                        loadBrands(value); // Charger les marques associées
                    } else {
                        setBrands([]); // Vider la liste si aucun produit sélectionné
                    }
                }}
                style={styles.picker}
            >
                <Picker.Item label="Sélectionnez un produit" value={null} />
                {productTypes.map((type) => (
                    <Picker.Item key={type.id} label={type.nom} value={type.id} />
                ))}
            </Picker>
        </View>

        <TextInput
            value={newProductType}
            onChangeText={setNewProductType}
            placeholder="Ajouter un nouveau produit"
            style={styles.input}
        />
        <TouchableOpacity style={styles.addButton} onPress={addProductType}>
            <Text style={styles.buttonText}>Ajouter Produit</Text>
        </TouchableOpacity>

        {/* Sélection ou ajout d'une marque */}
        <Text style={styles.sectionTitle}>Sélectionner ou ajouter une marque</Text>
        <View style={styles.pickerContainer}>
            <Picker
                selectedValue={selectedBrand}
                onValueChange={(value) => {
                    console.log("Marque sélectionnée :", value);
                    setSelectedBrand(value);
                    setModel(""); // Réinitialise le modèle
                }}
                style={styles.picker}
                enabled={!!selectedProductType}
            >
                <Picker.Item label="Sélectionnez une marque" value={null} />
                {brands.map((brand) => (
                    <Picker.Item key={brand.id} label={brand.nom} value={brand.id} />
                ))}
            </Picker>
        </View>

        <TextInput
            value={newBrand}
            onChangeText={setNewBrand}
            placeholder="Ajouter une nouvelle marque"
            style={styles.input}
        />
        <TouchableOpacity style={styles.addButton} onPress={addBrand}>
            <Text style={styles.buttonText}>Ajouter Marque</Text>
        </TouchableOpacity>

        {/* Ajout d'un modèle */}
        <Text style={styles.sectionTitle}>Ajouter un modèle</Text>
        <TextInput
            value={model}
            onChangeText={setModel}
            placeholder="Nom du modèle"
            style={styles.input}
        />
        <TouchableOpacity style={styles.addButton} onPress={addModel}>
            <Text style={styles.buttonText}>Ajouter Modèle</Text>
        </TouchableOpacity>
    </>
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
<View style={styles.BottomNavigation}>
<BottomNavigation  navigation={navigation} currentRoute={route.name} />
</View>
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
                { tintColor: currentPage === 1 ? "gray" : "black" },
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
                { tintColor: currentPage === totalPages ? "gray" : "black" },
            ]}
        />
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
	title: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
    },
    addButton: {
        backgroundColor: "#3c5068",
        paddingVertical: 12,
        borderRadius: 5,
        alignItems: "center",
        marginVertical: 10,
        elevation: 2,
    },
	button: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#007bff",
        padding: 15,
        borderRadius: 10,
        marginBottom: 20,
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
	iconSearch: {
        width: 24,
        height: 24,
        marginRight: 10,
        tintColor: "blue",
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
        justifyContent: "center",
        alignItems: "center",
        marginVertical: 10, // Ajuste l'espacement vertical
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
        color: "black",
        fontSize: 20, // Ajuste la taille du texte
    },

});
