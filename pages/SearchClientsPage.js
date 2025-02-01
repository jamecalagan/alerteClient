import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    FlatList,
    StyleSheet,
    ScrollView,
    Alert,
    Image,
    ActivityIndicator,
} from "react-native";
import { supabase } from "../supabaseClient";
import { Picker } from "@react-native-picker/picker";

let debounceTimeout = null;
const ITEMS_PER_PAGE = 2; // Nombre de fiches par page

const SearchClientsPage = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [clients, setClients] = useState([]);
    const [paginatedClients, setPaginatedClients] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [selectedStatus, setSelectedStatus] = useState(null);
    const [statusOptions, setStatusOptions] = useState([]);
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const [selectedDeviceType, setSelectedDeviceType] = useState("");
    const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
    const [loading, setLoading] = useState(false);
    const [deviceTypes, setDeviceTypes] = useState([]);
    // 🔄 Charger les types d'appareils depuis la base de données
    useEffect(() => {
        const fetchDeviceTypes = async () => {
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select("deviceType")
                    .neq("deviceType", null);

                if (error) {
                    console.error(
                        "❌ Erreur lors du chargement des types d'appareils :",
                        error
                    );
                    Alert.alert(
                        "Erreur",
                        "Impossible de charger les types d'appareils."
                    );
                    return;
                }

                const uniqueDeviceTypes = [
                    ...new Set(data.map((item) => item.deviceType)),
                ].sort();
                setDeviceTypes(uniqueDeviceTypes);
            } catch (error) {
                console.error("❌ Erreur inattendue :", error);
            }
        };

        fetchDeviceTypes();
    }, []);

    useEffect(() => {
        const fetchStatuses = async () => {
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select("status")
                    .neq("status", null)
                    .neq("status", "");

                if (error) {
                    console.error(
                        "Erreur lors du chargement des statuts :",
                        error
                    );
                    return;
                }

                const uniqueStatuses = Array.from(
                    new Set(data.map((item) => item.status))
                );
                setStatusOptions(uniqueStatuses);
            } catch (error) {
                console.error("Erreur inattendue :", error);
            }
        };

        fetchStatuses();
    }, []);

    useEffect(() => {
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }

        debounceTimeout = setTimeout(() => {
            if (!selectedStatus && searchTerm.trim()) {
                searchClients();
            }
        }, 500);

        return () => clearTimeout(debounceTimeout);
    }, [searchTerm]);

    useEffect(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        setPaginatedClients(clients.slice(startIndex, endIndex));
        setTotalPages(Math.ceil(clients.length / ITEMS_PER_PAGE));
    }, [clients, currentPage]);

    const searchClients = async () => {
        if (!searchTerm.trim() && !selectedStatus) {
            setClients([]);
            return;
        }

        try {
            let query = supabase
                .from("clients")
                .select(
                    `*, interventions!inner(id, status, description, "deviceType", brand, model, cost, paymentStatus, solderestant, createdAt, updatedAt, commande, label_photo)`
                )
                .order("name", { ascending: true });

            if (searchTerm.trim()) {
                const isNumber = /^\d+$/.test(searchTerm);
                query = isNumber
                    ? query.or(
                          `ficheNumber.eq.${searchTerm},phone.ilike.%${searchTerm}%`
                      )
                    : query.or(`name.ilike.%${searchTerm}%`);
            }

            const { data, error } = await query;

            if (error) {
                console.error("Erreur lors de la recherche :", error);
                Alert.alert("Erreur", "Impossible de récupérer les résultats.");
            } else {
                setClients(data || []);
                setCurrentPage(1);
            }
        } catch (error) {
            console.error("Erreur inattendue :", error);
        }
    };

    const searchByStatus = async (status) => {
        if (!status) {
            setClients([]);
            return;
        }

        try {
            const { data, error } = await supabase
                .from("clients")
                .select(
                    `*, interventions!inner(id, status, description, "deviceType", brand, model, cost, paymentStatus, solderestant, createdAt, updatedAt, commande, label_photo)`
                )
                .eq("interventions.status", status)
                .order("name", { ascending: true });

            if (error) {
                console.error(
                    "Erreur lors de la recherche par statut :",
                    error
                );
                Alert.alert("Erreur", "Impossible de récupérer les résultats.");
            } else {
                setClients(data || []);
                setCurrentPage(1);
            }
        } catch (error) {
            console.error("Erreur inattendue :", error);
        }
    };

    const resetFilters = () => {
        setSearchTerm(""); // Réinitialiser le champ de recherche texte
        setSelectedStatus(null); // Réinitialiser le statut sélectionné
        setSelectedDeviceType(""); // Réinitialiser le Picker des produits
        setClients([]); // Vider les résultats
        setCurrentPage(1); // Réinitialiser la pagination
    };

    const goToNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage((prevPage) => prevPage + 1);
        }
    };

    const goToPreviousPage = () => {
        if (currentPage > 1) {
            setCurrentPage((prevPage) => prevPage - 1);
        }
    };
    // 🔍 Recherche par `deviceType`
    const searchByDeviceType = async (deviceType) => {
        if (!deviceType) {
            setClients([]);
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("clients")
                .select(
                    `
				*,
				interventions!inner(id, deviceType, status, description, brand, model, cost, paymentStatus, solderestant, createdAt, updatedAt, commande, label_photo)
			`
                )
                .eq("interventions.deviceType", deviceType)
                .order("name", { ascending: true });

            if (error) {
                console.error(
                    "❌ Erreur lors de la recherche par produit :",
                    error
                );
                Alert.alert("Erreur", "Impossible de récupérer les résultats.");
            } else {
                setClients(data || []);
                setCurrentPage(1);
            }
        } catch (error) {
            console.error("❌ Erreur inattendue :", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Recherche clients/interventions</Text>

            <TextInput
                style={styles.input}
                placeholder="Rechercher par nom, téléphone ou numéro de fiche..."
                value={searchTerm}
                onChangeText={(text) => {
                    setSelectedStatus(null);
                    setSearchTerm(text);
                }}
            />

            <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowStatusDropdown((prev) => !prev)}
            >
                <Text style={styles.dropdownButtonText}>
                    {selectedStatus || "-- Sélectionner un statut --"}
                </Text>
            </TouchableOpacity>

            {showStatusDropdown && (
                <ScrollView style={styles.dropdown}>
                    {statusOptions.map((status, index) => (
                        <TouchableOpacity
                            key={index}
                            style={styles.dropdownItemStatus}
                            onPress={() => {
                                setSearchTerm("");
                                setSelectedStatus(status);
                                setShowStatusDropdown(false);
                                searchByStatus(status);
                            }}
                        >
                            <Text style={styles.dropdownItemText}>
                                {status}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

          
                <Text style={styles.title}>
                    Rechercher par type d'appareil :
                </Text>

                <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => setShowDeviceDropdown((prev) => !prev)}
                >
                    <Text style={styles.dropdownButtonText}>
                        {selectedDeviceType ||
                            "-- Sélectionner un type d'appareil --"}
                    </Text>
                </TouchableOpacity>


                {showDeviceDropdown && (
                    <ScrollView
                        contentContainerStyle={styles.dropdownContainer}
                    >
                        <View style={styles.dropdownGrid}>
                            {deviceTypes.map((type, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.dropdownItem}
                                    onPress={() => {
                                        setSelectedDeviceType(type);
                                        setShowDeviceDropdown(false);
                                        searchByDeviceType(type);
                                    }}
                                >
                                    <Text style={styles.dropdownItemText}>
                                        {type}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                )}
            
            <FlatList
                data={paginatedClients}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.clientCard}>
                        <View style={styles.row}>
                            <View style={styles.clientDetails}>
                                <Text style={styles.clientText}>
                                    Nom : {item.name}
                                </Text>
                                <Text style={styles.clientText}>
                                    Téléphone : {item.phone}
                                </Text>
                                <Text style={styles.clientText}>
                                    N° de fiche : {item.ficheNumber}
                                </Text>
                            </View>
                            {item.interventions?.[0]?.label_photo && (
                                <Image
                                    source={{
                                        uri: `data:image/png;base64,${item.interventions[0].label_photo}`,
                                    }}
                                    style={styles.labelPhoto}
                                />
                            )}
                        </View>

                        {item.interventions?.map((intervention, index) => (
                            <View key={index} style={styles.interventionCard}>
                                <Text style={styles.interventionTitle}>
                                    Intervention {index + 1}
                                </Text>
                                <Text style={styles.interventionText}>
                                    Statut :{" "}
                                    {intervention.status || "Non renseigné"}
                                </Text>
                                <Text>
                                    Commande :{" "}
                                    {intervention.commande || "Non renseigné"}
                                </Text>
                                <Text>
                                    Description :{" "}
                                    {intervention.description || "N/A"}
                                </Text>
                                <Text>
                                    Appareil :{" "}
                                    {intervention.deviceType || "N/A"} -{" "}
                                    {intervention.brand || "N/A"}{" "}
                                    {intervention.model || "N/A"}
                                </Text>
                                <Text>
                                    Coût :{" "}
                                    {intervention.cost
                                        ? `${intervention.cost.toFixed(2)} €`
                                        : "Non spécifié"}
                                </Text>
                                <Text>
                                    Paiement :{" "}
                                    {intervention.paymentStatus ||
                                        "Non précisé"}
                                </Text>
                                <Text>
                                    Solde restant dû :{" "}
                                    {intervention.solderestant
                                        ? `${intervention.solderestant.toFixed(
                                              2
                                          )} €`
                                        : "0,00 €"}
                                </Text>
                                <Text>
                                    Créée le :{" "}
                                    {intervention.createdAt
                                        ? new Date(
                                              intervention.createdAt
                                          ).toLocaleDateString("fr-FR")
                                        : "Date inconnue"}
                                </Text>
                                <Text>
                                    Dernière mise à jour :{" "}
                                    {intervention.updatedAt
                                        ? new Date(
                                              intervention.updatedAt
                                          ).toLocaleDateString("fr-FR")
                                        : "Non mise à jour"}
                                </Text>
                                <Text style={styles.clientText}>
                                    Date de récupération :{" "}
                                    {intervention.updatedAt
                                        ? new Date(
                                              intervention.updatedAt
                                          ).toLocaleDateString("fr-FR")
                                        : "Non renseignée"}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}
            />
            <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
                <Text style={styles.resetButtonText}>
                    Réinitialiser les filtres
                </Text>
            </TouchableOpacity>
            {clients.length > ITEMS_PER_PAGE && (
                <View style={styles.paginationContainer}>
                    <TouchableOpacity
                        style={[
                            styles.pageButton,
                            currentPage === 1 && styles.disabledButton,
                        ]}
                        onPress={goToPreviousPage}
                        disabled={currentPage === 1}
                    >
                        <Text style={styles.pageButtonText}>Précédent</Text>
                    </TouchableOpacity>
                    <Text style={styles.pageText}>
                        Page {currentPage} sur {totalPages}
                    </Text>
                    <TouchableOpacity
                        style={[
                            styles.pageButton,
                            currentPage === totalPages && styles.disabledButton,
                        ]}
                        onPress={goToNextPage}
                        disabled={currentPage === totalPages}
                    >
                        <Text style={styles.pageButtonText}>Suivant</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: "#f5f5f5",
    },
    title: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 10,
    },
    input: {
        borderWidth: 1,
        borderColor: "#ccc",
        backgroundColor: "#fff",
        padding: 10,
        borderRadius: 5,
        marginBottom: 10,
    },
    resetButton: {
        backgroundColor: "#dc3545",
        padding: 10,
        borderRadius: 5,
        alignItems: "center",
        marginBottom: 20,
    },
    resetButtonText: {
        color: "#fff",
        fontSize: 14,
    },
    dropdownButton: {
        backgroundColor: "#fff",
        padding: 10,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 5,
        marginBottom: 10,
    },
    dropdownButtonText: {
        fontSize: 16,
        color: "#333",
    },
    dropdown: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 5,
        maxHeight: 250,
        marginTop: 10,
    },
    dropdownItem: {
        width: "48%", // Deux colonnes
        padding: 10,
        backgroundColor: "#f0f0f0",
        borderRadius: 5,
        marginBottom: 8,
        alignItems: "center",
    },
	dropdownItemStatus: {
        width: "100%", // Deux colonnes
        padding: 10,
        backgroundColor: "#f0f0f0",
        borderRadius: 5,
        marginBottom: 8,
        alignItems: "center",
    },
    dropdownItemText: {
        fontSize: 16,
        color: "#333",
    },
    dropdownContainer: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 5,
        padding: 10,
        maxHeight: 700,
    },
    dropdownGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
    },
    clientCard: {
        backgroundColor: "#fff",
        padding: 10,
        borderRadius: 5,
        marginBottom: 10,
        elevation: 2,
    },
    clientDetails: {
        flex: 1,
    },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    labelPhoto: {
        width: 80,
        height: 80,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#ccc",
    },
    interventionCard: {
        backgroundColor: "#f0f0f0",
        padding: 10,
        marginTop: 10,
        borderRadius: 5,
    },
    interventionTitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 5,
    },
    interventionText: {
        fontSize: 14,
    },
    paginationContainer: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 10,
    },
    pageButton: {
        backgroundColor: "#007bff",
        padding: 10,
        borderRadius: 5,
    },
    disabledButton: {
        backgroundColor: "#ccc",
    },
    pageButtonText: {
        color: "#fff",
        fontSize: 14,
    },
    pageText: {
        fontSize: 16,
        fontWeight: "bold",
    },
    item: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: "#ddd",
    },
    name: {
        fontSize: 16,
        fontWeight: "bold",
    },
    phone: {
        fontSize: 14,
        color: "gray",
    },
    noResult: {
        textAlign: "center",
        marginTop: 20,
        fontSize: 16,
        color: "gray",
    },
});

export default SearchClientsPage;
