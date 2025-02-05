import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRoute, useIsFocused } from "@react-navigation/native";

export default function BottomMenu({ navigation, filterByStatus, resetFilter }) {
    const route = useRoute();
    const isFocused = useIsFocused();
    const [activeButton, setActiveButton] = useState(null); // État pour le bouton actif

    // Désactiver les autres boutons lorsque l'on revient sur Home
    useEffect(() => {
        if (isFocused && route.name === "Home") {
            setActiveButton(null); // Désactive les autres boutons sauf Accueil
        } else if (isFocused) {
            setActiveButton(route.name); // Active le bouton correspondant à la page
        }
    }, [isFocused, route.name]);

    const handlePress = (status, action) => {
        if (status !== "Home") {
            setActiveButton(status); // Mettre à jour le bouton actif sauf pour Accueil
        } else {
            setActiveButton(null); // Désactiver les autres boutons en revenant à Home
        }
        action(); // Appeler l'action correspondante (filtrer ou naviguer)
    };

    const getButtonColor = (status) => {
        if (status === "Home") {
            return "#5b6788"; // "Accueil" est toujours actif
        }
        return activeButton === status ? "#5b6788" : "#191f2f"; // Les autres boutons changent seulement sur leur page
    };

    return (
        <View style={styles.bottomMenuContainer}>
            <View style={styles.filterRow}>
                <TouchableOpacity
                    style={[styles.filterButtonShipping, { backgroundColor: getButtonColor("En attente de pièces") }]}
                    onPress={() => handlePress("En attente de pièces", () => filterByStatus("En attente de pièces"))}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/shipping.png")} style={styles.icon} />
                        <Text style={styles.filterText}>Commande</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButtonDevis, { backgroundColor: getButtonColor("Devis en cours") }]}
                    onPress={() => handlePress("Devis en cours", () => filterByStatus("Devis en cours"))}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/devisEnCours.png")} style={styles.icon} />
                        <Text style={styles.filterText}>Devis</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButtonDevisOk, { backgroundColor: getButtonColor("Devis accepté") }]}
                    onPress={() => handlePress("Devis accepté", () => filterByStatus("Devis accepté"))}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/devisAccepte.png")} style={styles.icon} />
                        <Text style={styles.filterText}>Devis OK</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButtonRepair, { backgroundColor: getButtonColor("Réparation en cours") }]}
                    onPress={() => handlePress("Réparation en cours", () => filterByStatus("Réparation en cours"))}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/tools1.png")} style={styles.icon} />
                        <Text style={styles.filterText}>En Réparation</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButtonInit, { backgroundColor: getButtonColor("Réinitialiser") }]}
                    onPress={() => handlePress("Réinitialiser", resetFilter)}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/reload.png")} style={styles.icon} />
                        <Text style={styles.filterText}>Réinitialiser</Text>
                    </View>
                </TouchableOpacity>
            </View>

            <View style={styles.separator} />

            <View style={styles.navigationRow}>
                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("Home") }]}
                    onPress={() => handlePress("Home", () => navigation.navigate("Home"))}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/home.png")} style={styles.icon} />
                        <Text style={styles.menuText}>Accueil</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("AddClient") }]}
                    onPress={() => handlePress("AddClient", () => navigation.navigate("AddClient"))}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/add.png")} style={styles.icon} />
                        <Text style={styles.menuText}>Ajouter</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("RepairedInterventions") }]}
                    onPress={() => handlePress("RepairedInterventions", () => navigation.navigate("RepairedInterventions"))}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/finished.png")} style={styles.icon} />
                        <Text style={styles.menuText}>Réparés</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("RecoveredClients") }]}
                    onPress={() => handlePress("RecoveredClients", () => navigation.navigate("RecoveredClients"))}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/restitue.png")} style={styles.icon} />
                        <Text style={styles.menuText}>Restitués</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("Admin") }]}
                    onPress={() => handlePress("Admin", () => navigation.navigate("Admin"))}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/Config.png")} style={styles.icon} />
                        <Text style={styles.menuText}>Admin</Text>
                    </View>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    bottomMenuContainer: {
        position: "absolute",
        bottom: 0,
        width: "100%",
        paddingVertical: 10,
        paddingBottom: 2,
        borderRadius: 5,
    },
    navigationRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginBottom: 10,
    },
    filterRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginTop: 10,
    },
    filterButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderWidth: 1,
        borderColor: "#5b6788",
        flex: 1,
        marginHorizontal: 5,
        elevation: 2,
        backgroundColor: "#191f2f",
    },
	filterButtonShipping: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderWidth: 1,
        borderLeftColor: "#b396f8",
		borderBottomColor: "#5b6788",
		borderRightColor: "#5b6788",
		borderTopColor: "#5b6788",
        flex: 1,
        marginHorizontal: 5,
        elevation: 2,
        backgroundColor: "#191f2f",
    },
	filterButtonDevis: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderWidth: 1,
        borderLeftColor: "#f37209",
		borderBottomColor: "#5b6788",
		borderRightColor: "#5b6788",
		borderTopColor: "#5b6788",
        flex: 1,
        marginHorizontal: 5,
        elevation: 2,
        backgroundColor: "#191f2f",
    },
	filterButtonDevisOk: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderWidth: 1,
        borderLeftColor: "#FFD700",
		borderBottomColor: "#5b6788",
		borderRightColor: "#5b6788",
		borderTopColor: "#5b6788",
        flex: 1,
        marginHorizontal: 5,
        elevation: 2,
        backgroundColor: "#191f2f",
    },	
	filterButtonRepair: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderWidth: 1,
        borderLeftColor: "#0471ff",
		borderBottomColor: "#5b6788",
		borderRightColor: "#5b6788",
		borderTopColor: "#5b6788",
        flex: 1,
        marginHorizontal: 5,
        elevation: 2,
        backgroundColor: "#191f2f",
    },
	filterButtonInit: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderWidth: 1,
        borderLeftColor: "#00ff22",
		borderBottomColor: "#5b6788",
		borderRightColor: "#5b6788",
		borderTopColor: "#5b6788",
        flex: 1,
        marginHorizontal: 5,
        elevation: 2,
        backgroundColor: "#191f2f",
    },
    buttonContent: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    icon: {
        width: 20,
        height: 20,
        marginRight: 8,
        tintColor: "white",
    },
    menuText: {
        fontSize: 14,
        fontWeight: "medium",
        color: "white",
    },
    filterText: {
        fontSize: 14,
        fontWeight: "medium",
        color: "white",
    },
    separator: {
        height: 1,
        backgroundColor: "#ccc",
        marginVertical: 10,
    },
});
