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
                        {/* -------------------- Barre de boutons actions -------------------- */}
                        <View style={styles.row}>
                            {/* Recherche multi-critères */}
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => navigation.navigate("SearchClientsPage")}
                            >
                                <Image
                                    source={require("../assets/icons/search.png")}
                                    style={styles.iconSearch}
                                />
                                <Text style={styles.buttonText}>Recherche multi-critères</Text>
                            </TouchableOpacity>

                            {/* Gestion produits, marques, modèles */}
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => navigation.navigate("ArticlesPage")}
                            >
                                <Image
                                    source={require("../assets/icons/list.png")}
                                    style={styles.iconSearch}
                                />
                                <Text style={styles.buttonText}>Gérer Produits, Marques et Modèles</Text>
                            </TouchableOpacity>

                            {/* Ajouter un produit */}
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => navigation.navigate("AddProductPage")}
                            >
                                <Image
                                    source={require("../assets/icons/add_product.png")}
                                    style={styles.iconSearch}
                                />
                                <Text style={styles.buttonText}>Ajouter un produit</Text>
                            </TouchableOpacity>

                            {/* ➕ Nouveau bouton Barème des réparations */}
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => navigation.navigate("RepairPrices")}
                            >
                                <Image
                                    source={require("../assets/icons/tools.png")}
                                    style={styles.iconSearch}
                                />
                                <Text style={styles.buttonText}>Barème réparations</Text>
                            </TouchableOpacity>
                        </View>

                        {/* -------------------- Recherche + Liste clients -------------------- */}
                        <Text style={styles.sectionTitle}>
                            Recherche dans la liste complète des clients
                        </Text>
                        <View style={styles.searchContainer}>
                            <TextInput
                                style={styles.searchInput}
                                placeholder="RECHERCHER PAR NOM OU TÉLÉPHONE"
                                placeholderTextColor="#575757"
                                value={searchText}
                                autoCapitalize="characters"
                                onChangeText={(text) => setSearchText(text.toUpperCase())}
                            />
                            <MaterialIcons
                                name="search"
                                size={24}
                                color="#888787"
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
                                                navigation.navigate("ClientInterventionsPage", {
                                                    clientId: item.id,
                                                });
                                            }
                                        }}
                                        style={[
                                            styles.clientItem,
                                            {
                                                backgroundColor: index % 2 === 0 ? "#d3d3d3" : "#b1b1b1",
                                            },
                                        ]}
                                    >
                                        <Text style={styles.clientText}>
                                            Fiche client N°: {item?.ficheNumber || "Non disponible"}
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

                        {/* -------------------- Boutons actions bas de page -------------------- */}
                        <TouchableOpacity
                            onPress={() => navigation.navigate("ImageBackup")}
                            style={styles.backupButton}
                        >
                            <Text style={{ color: "#fffdfd", fontWeight: "bold" }}>
                                SAUVEGARDER LES IMAGES
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.webSearchButton}
                            onPress={() => navigation.navigate("ProductViewer")}
                        >
                            <Text style={{ color: "#fff", textAlign: "center" }}>
                                🔍 Recherche de produit sur le web
                            </Text>
                        </TouchableOpacity>

                        {/* Pagination */}
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

                            <Text style={styles.paginationText}>
                                Page {currentPage} sur {totalPages}
                            </Text>

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

                {/* Bottom navigation */}
                <BottomNavigation navigation={navigation} currentRoute={route.name} />
            </View>
        </KeyboardAvoidingView>
    );
}

// -------------------- Styles --------------------
const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
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
    iconSearch: {
        width: 24,
        height: 24,
        tintColor: "#fff",
        marginBottom: 8,
    },
    buttonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 12,
        textAlign: "center",
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#242424",
        marginVertical: 10,
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 10,
        paddingHorizontal: 10,
        marginBottom: 15,
        backgroundColor: "#cacaca",
    },
    searchInput: {
        flex: 1,
        height: 40,
        fontSize: 16,
        color: "#242424",
        paddingHorizontal: 10,
    },
    searchIcon: {
        marginLeft: 10,
    },
    clientItem: {
        padding: 15,
        backgroundColor: "#f0f0f0",
        marginVertical: 5,
        borderRadius: 5,
    },
    clientText: {
        fontSize: 16,
        color: "#242424",
    },
    noDataText: {
        textAlign: "center",
        color: "#888888",
        marginTop: 20,
    },
    backupButton: {
        backgroundColor: "#2b8103",
        padding: 12,
        marginVertical: 10,
        borderRadius: 8,
        alignItems: "center",
    },
    webSearchButton: {
        backgroundColor: "#007bff",
        padding: 10,
        borderRadius: 8,
        marginTop: 20,
    },
    paginationContainer: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginVertical: 10,
        marginBottom: 70,
    },
    chevronButton: {
        padding: 5,
    },
    chevronIcon: {
        width: 22,
        height: 22,
    },
    paginationText: {
        marginHorizontal: 10,
        color: "#242424",
        fontSize: 20,
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
