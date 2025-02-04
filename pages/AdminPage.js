import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    Alert,
    FlatList,
    StyleSheet,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Keyboard,
    TouchableWithoutFeedback,
	Image,
	ImageBackground,
} from "react-native";
import { supabase } from "../supabaseClient";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import BottomNavigation  from "../components/BottomNavigation";

export default function AdminPage({ navigation, route }) {
    const [searchText, setSearchText] = useState("");
    const [filteredClients, setFilteredClients] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 6;
    const totalPages = Math.ceil((filteredClients?.length || 0) / itemsPerPage);
    const currentData = (filteredClients || []).slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );
	const backgroundImage = require("../assets/listing2.jpg");
    const [clients, setClients] = useState({
        all: [],
    });

    useEffect(() => {
        loadClients();
    }, []);

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
                setClients({ all: data });
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
            setFilteredClients(clients.all);
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

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
					<ImageBackground
						source={backgroundImage}
						style={styles.backgroundImage}
					>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.container}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => navigation.navigate("SearchClientsPage")}
                    >
                        <Image
                            source={require("../assets/icons/search.png")}
                            style={styles.iconSearch}
                        />
                        <Text style={styles.buttonText}>Recherche multi-critères</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.navigateButton}
                        onPress={() => navigation.navigate("ArticlesPage")}
                    >
                        <Image
                            source={require("../assets/icons/list.png")}
                            style={styles.iconSearch}
                        />
                        <Text style={styles.buttonTextGestion}>
                            Gérer Produits, Marques et Modèles
                        </Text>
                    </TouchableOpacity>
					<TouchableOpacity 
    style={styles.navigateButton}
    onPress={() => navigation.navigate("AddProductPage")}>
                        <Image
                            source={require("../assets/icons/add_product.png")}
                            style={styles.iconSearch}
                        />
    <Text style={styles.buttonText}>Ajouter un produit</Text>
</TouchableOpacity>
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
                            data={currentData || []}
                            keyExtractor={(item) => item.id?.toString()}
                            renderItem={({ item, index }) => (
                                <TouchableOpacity
                                    onPress={() => {
                                        if (item?.id) {
                                            navigation.navigate("ClientInterventionsPage", { clientId: item.id });
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
                                        Téléphone : {item?.phone ? item.phone.replace(/(\d{2})(?=\d)/g, "$1 ") : "Non disponible"}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        />
                    ) : (
                        <Text style={styles.noDataText}>Aucun client à afficher.</Text>
                    )}

                    <View style={styles.paginationContainer}>
                        <TouchableOpacity
                            onPress={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            style={styles.chevronButton}
                        >
                            <Image
                                source={require("../assets/icons/chevrong.png")}
                                style={[styles.chevronIcon, { tintColor: currentPage === 1 ? "gray" : "white" }]}
                            />
                        </TouchableOpacity>

                        <Text style={styles.paginationText}>Page {currentPage} sur {totalPages}</Text>

                        <TouchableOpacity
                            onPress={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            style={styles.chevronButton}
                        >
                            <Image
                                source={require("../assets/icons/chevrond.png")}
                                style={[styles.chevronIcon, { tintColor: currentPage === totalPages ? "gray" : "white" }]}
                            />
                        </TouchableOpacity>
                    </View>


                </View>
				
            </TouchableWithoutFeedback>
			<View>
                        <BottomNavigation navigation={navigation} currentRoute={route.name} />
                    </View>
					</ImageBackground>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
	backgroundImage: {
        flex: 1,
        resizeMode: "cover",
    },
    overlay: {
        flex: 1,
        backgroundColor: "rgba(255, 255, 255, 0)",
        padding: 20,
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
		color: "#fff",
        marginVertical: 10,
    },
	title: {
        fontSize: 24,
        fontWeight: "bold",
		color: "#fff",
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
        tintColor: "white",
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
		marginBottom: 70,
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

});
