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
import BottomNavigation from "../components/BottomNavigation";

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
             <View style={{ flex: 1, backgroundColor: "#e0e0e0" }}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.container}>
<View style={styles.row}>
    <TouchableOpacity
        style={[styles.actionButton]}
        onPress={() => navigation.navigate("SearchClientsPage")}
    >
        <Image
            source={require("../assets/icons/search.png")}
            style={styles.iconSearch}
        />
        <Text style={styles.buttonText}>Recherche multi-critères</Text>
    </TouchableOpacity>

    <TouchableOpacity
        style={[styles.actionButton]}
        onPress={() => navigation.navigate("ArticlesPage")}
    >
        <Image
            source={require("../assets/icons/list.png")}
            style={styles.iconSearch}
        />
        <Text style={styles.buttonText}>Gérer Produits, Marques et Modèles</Text>
    </TouchableOpacity>

    <TouchableOpacity
        style={[styles.actionButton]}
        onPress={() => navigation.navigate("AddProductPage")}
    >
        <Image
            source={require("../assets/icons/add_product.png")}
            style={styles.iconSearch}
        />
        <Text style={styles.buttonText}> Ajouter un produit</Text>
    </TouchableOpacity>
</View>

                        <Text style={styles.sectionTitle}>
                            Recherche dans la liste complète des clients
                        </Text>
                        <View style={styles.searchContainer}>
                            <TextInput
                                style={styles.searchInput}
                                placeholder="RECHERCHER PAR NOM OU TÉLÉPHONE"
                                placeholderTextColor="#575757" // Change la couleur du placeholder ici
                                value={searchText}
                                autoCapitalize="characters"
                                onChangeText={(text) =>
                                    setSearchText(text.toUpperCase())
                                }
                            />
                            <MaterialIcons
                                name="search"
                                size={24}
                                color="#888787"
                                style={styles.searchIcon}
                            />
                        </View>

                        <Text style={styles.sectionTitle}>
                            Liste complète des clients
                        </Text>
                        {currentData.length > 0 ? (
                            <FlatList
                                data={currentData || []}
                                keyExtractor={(item) => item.id?.toString()}
                                renderItem={({ item, index }) => (
                                    <TouchableOpacity
                                        onPress={() => {
                                            if (item?.id) {
                                                navigation.navigate(
                                                    "ClientInterventionsPage",
                                                    { clientId: item.id }
                                                );
                                            }
                                        }}
                                        style={[
                                            styles.clientItem,
                                            {
                                                backgroundColor:
                                                    index % 2 === 0
                                                        ? "#d3d3d3"
                                                        : "#b1b1b1",
                                            },
                                        ]}
                                    >
                                        <Text style={styles.clientText}>
                                            Fiche client N°:{" "}
                                            {item?.ficheNumber ||
                                                "Non disponible"}
                                        </Text>
                                        <Text style={styles.clientText}>
                                            Nom :{" "}
                                            {item?.name || "Non disponible"}
                                        </Text>
                                        <Text style={styles.clientText}>
                                            Téléphone :{" "}
                                            {item?.phone
                                                ? item.phone.replace(
                                                      /(\d{2})(?=\d)/g,
                                                      "$1 "
                                                  )
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
                        <TouchableOpacity
                            onPress={() => navigation.navigate("ImageBackup")}
                            style={{
                                backgroundColor: "#24435c",
                                padding: 12,
                                marginVertical: 10,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: "#888787",
                                alignItems: "center",
                            }}
                        >
                            <Text
                                style={{ color: "#888787", fontWeight: "bold" }}
                            >
                                SAUVEGARDER LES IMAGES
                            </Text>
                        </TouchableOpacity>
						<TouchableOpacity
  style={{ backgroundColor: "#007bff", padding: 10, borderRadius: 8, marginTop: 20 }}
  onPress={() => navigation.navigate("ProductViewer")}
>
  <Text style={{ color: "#fff", textAlign: "center" }}>🔍 Recherche de produit sur le web</Text>
</TouchableOpacity>
                        <View style={styles.paginationContainer}>
                            <TouchableOpacity
                                onPress={() =>
                                    handlePageChange(currentPage - 1)
                                }
                                disabled={currentPage === 1}
                                style={styles.chevronButton}
                            >
                                <Image
                                    source={require("../assets/icons/chevrong.png")}
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

                            <Text style={styles.paginationText}>
                                Page {currentPage} sur {totalPages}
                            </Text>

                            <TouchableOpacity
                                onPress={() =>
                                    handlePageChange(currentPage + 1)
                                }
                                disabled={currentPage === totalPages}
                                style={styles.chevronButton}
                            >
                                <Image
                                    source={require("../assets/icons/chevrond.png")}
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
                </TouchableWithoutFeedback>
                <View>
                    <BottomNavigation
                        navigation={navigation}
                        currentRoute={route.name}
                    />
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },

    input: {
        borderWidth: 1,
        borderColor: "#888787",
        padding: 10,
        marginVertical: 10,
        borderRadius: 5,
		elevation: 2,
    },
    picker: {
        marginVertical: 2,
        borderWidth: 1,
        borderColor: "#888787",
        borderRadius: 5,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#242424",
        marginVertical: 10,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#888787",
        marginBottom: 20,
        textAlign: "center",
    },
    addButton: {
        backgroundColor: "#cacaca",
        paddingVertical: 12,
        borderRadius: 5,
        alignItems: "center",
        marginVertical: 10,
        elevation: 2,
    },
    button: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#cacaca",
        padding: 15,
        borderWidth: 1,
        borderRadius: 5,
        borderColor: "#242424",
        marginBottom: 20,
		elevation: 5,
    },
buttonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
    textAlign: "center",
},
    toggleButton: {
        flexDirection: "row",
        backgroundColor: "#191f2f",
        paddingVertical: 12,
        borderWidth: 1,
        borderRadius: 5,
        borderColor: "#888787",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 5,
        elevation: 5,
    },
    toggleButtonCreer: {
        flexDirection: "row",
        backgroundColor: "#191f2f",
        paddingVertical: 12,
        borderWidth: 1,
        borderRadius: 5,
        borderColor: "#888787",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 15,
        elevation: 5,
    },
    clientItem: {
        padding: 15,
        borderColor: "#888787",
        backgroundColor: "#f0f0f0",
        marginVertical: 5,
        borderRadius: 5,
        borderWidth: 1,
        elevation: 5,
    },
    clientText: {
        fontSize: 16,
        color: "#242424",
    },
    navigateButton: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        backgroundColor: "#191f2f",
        padding: 15,
        borderRadius: 5,
        marginBottom: 20,
        borderColor: "#888787",
		elevation: 5,
    },
    icon: {
        marginRight: 10,
    },
iconSearch: {
    width: 24,
    height: 24,
    tintColor: "#fff",
    marginBottom: 8,
},
    pickerContainer: {
        backgroundColor: "#cacaca",
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
        color: "#888787",
        fontSize: 16,
        fontWeight: "medium",
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#888787",
        borderRadius: 5,
        paddingHorizontal: 10,
        marginBottom: 15,
        backgroundColor: "#cacaca",
        fontSize: 16,
        color: "#242424",
    },
    searchInput: {
        flex: 1, // Occupe tout l'espace restant
        height: 40,
        fontSize: 16,
        color: "#242424",
        paddingHorizontal: 10,
    },
    searchIcon: {
        marginLeft: 10, // Espacement entre le champ et l'icône
    },
    pickerButton: {
        padding: 10,
        borderWidth: 1,
        borderRadius: 5,
        backgroundColor: "#cacaca",
        marginBottom: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    noDataText: { textAlign: "center", color: "#888888", marginTop: 20 },
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
        color: "#242424",
        fontSize: 20, // Ajuste la taille du texte
    },
	row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 15,
},

actionButton: {
    flex: 1,
    backgroundColor: "#191f2f",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 5,
    height: 100,
},
});
