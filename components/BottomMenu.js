import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";

export default function BottomMenu({ navigation, filterByStatus, resetFilter }) {
    const getButtonColor = (status) => {
        switch (status) {
            case "En attente de pièces":
                return "#8a68d4"; // Violet plus sombre pour plus de contraste
            case "Devis accepté":
                return "#ffc107"; // Doré plus lumineux
            case "Réparation en cours":
                return "#396ab1"; // Bleu plus foncé
            case "Réparé":
                return "#037903"; // Vert plus sombre
            case "Devis en cours":
                return "#d35400"; // Orange foncé
            case "Non réparable":
                return "#b80000"; // Rouge plus foncé
            case "Réinitialiser":
                return "#ff8c00"; // Orange vif
            case "Restitués":
                return "#198754"; // Vert bouteille
            case "Admin":
                return "#6c757d"; // Gris sombre
            case "Ajouter":
                return "#0d6efd"; // Bleu bouton classique
            default:
                return "#6c757d"; // Gris sombre
        }
    };

    const getTextColor = (status) => {
        return status === "Devis accepté" || status === "Réparé" ? "black" : "white"; // Texte noir pour les boutons clairs
    };

    return (
        <View style={styles.bottomMenuContainer}>
            <View style={styles.filterRow}>
                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("En attente de pièces") }]}
                    onPress={() => filterByStatus("En attente de pièces")}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/shipping.png")} style={styles.icon} />
                        <Text style={[styles.filterText, { color: getTextColor("En attente de pièces") }]}>
                            Commande
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("Devis en cours") }]}
                    onPress={() => filterByStatus("Devis en cours")}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/devisEnCours.png")} style={styles.icon} />
                        <Text style={[styles.filterText, { color: getTextColor("Devis en cours") }]}>Devis</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("Devis accepté") }]}
                    onPress={() => filterByStatus("Devis accepté")}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/devisAccepte.png")} style={styles.icon} />
                        <Text style={[styles.filterText, { color: getTextColor("Devis accepté") }]}>Devis OK</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("Réparation en cours") }]}
                    onPress={() => filterByStatus("Réparation en cours")}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/tools1.png")} style={styles.icon} />
                        <Text style={[styles.filterText, { color: getTextColor("Réparation en cours") }]}>
                            En Réparation
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.filterButton, { backgroundColor: getButtonColor("Réinitialiser") }]}
                    onPress={resetFilter}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/reload.png")} style={styles.icon} />
                        <Text style={[styles.filterText, { color: getTextColor("Réinitialiser") }]}>
                            Réinitialiser
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>

            <View style={styles.separator} />

            <View style={styles.navigationRow}>
                <TouchableOpacity
                    style={[styles.menuButton, { backgroundColor: getButtonColor("Home") }]}
                    onPress={() => navigation.navigate("Home")}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/home.png")} style={styles.icon} />
                        <Text style={[styles.menuText, { color: getTextColor("Home") }]}>Accueil</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.menuButton, { backgroundColor: getButtonColor("Ajouter") }]}
                    onPress={() => navigation.navigate("AddClient")}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/add.png")} style={styles.icon} />
                        <Text style={[styles.menuText, { color: getTextColor("Ajouter") }]}>Ajouter</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.menuButton, { backgroundColor: getButtonColor("Réparé") }]}
                    onPress={() => navigation.navigate("RepairedInterventions")}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/finished.png")} style={styles.icon} />
                        <Text style={[styles.menuText, { color: getTextColor("Réparé") }]}>Réparés</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.menuButton, { backgroundColor: getButtonColor("Restitués") }]}
                    onPress={() => navigation.navigate("RecoveredClients")}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/restitue.png")} style={styles.icon} />
                        <Text style={[styles.menuText, { color: getTextColor("Restitués") }]}>Restitués</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.menuButton, { backgroundColor: getButtonColor("Admin") }]}
                    onPress={() => navigation.navigate("Admin")}
                >
                    <View style={styles.buttonContent}>
                        <Image source={require("../assets/icons/Config.png")} style={styles.icon} />
                        <Text style={[styles.menuText, { color: getTextColor("Admin") }]}>Administration</Text>
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
        backgroundColor: "#2e2e2e",
        paddingVertical: 10,
        paddingBottom: 10,
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
    menuButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
        flex: 1,
        marginHorizontal: 5,
        alignItems: "center",
		elevation: 2,
    },
    filterButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
        flex: 1,
        marginHorizontal: 5,
		elevation: 2,
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
        fontWeight: "bold",
    },
    filterText: {
        fontSize: 14,
        fontWeight: "bold",
    },
    separator: {
        height: 1,
        backgroundColor: "#ccc",
        marginVertical: 10,
    },
});
