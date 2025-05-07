import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRoute, useIsFocused } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
export default function BottomMenu({
    navigation,
    filterByStatus,
    resetFilter,
    onFilterCommande,
}) {
    const route = useRoute();
    const isFocused = useIsFocused();
    const [activeButton, setActiveButton] = useState(null); // État pour le bouton actif
    const [showBackupAlert, setShowBackupAlert] = useState(false);

    // Désactiver les autres boutons lorsque l'on revient sur Home
    useEffect(() => {
        if (isFocused && route.name === "Home") {
            setActiveButton(null); // Désactive les autres boutons sauf Accueil
        } else if (isFocused) {
            setActiveButton(route.name); // Active le bouton correspondant à la page
        }
        checkBackupReminder();
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
            return "#191f2f"; // "Accueil" est toujours actif
        }
        return activeButton === status ? "#191f2f" : "#191f2f"; // Les autres boutons changent seulement sur leur page
    };
    const getButtonBorder = (status) => {
        return {
            borderLeftWidth: 2, // Épaisseur de la bordure gauche
            borderBottomColor: activeButton === status ? "#2e9af1" : "#7c7b7b", // Bordure blanche en bas si actif
            borderBottomWidth: activeButton === status ? 3 : 1, // Épaisseur de la bordure inférieure
            borderRadius: 2, // Arrondi pour un meilleur design
        };
    };
    const checkBackupReminder = async () => {
        try {
            const last = await AsyncStorage.getItem("lastImageBackupReminder");
            const now = new Date().getTime();
            if (!last || now - parseInt(last, 10) > 7 * 24 * 60 * 60 * 1000) {
                setShowBackupAlert(true);
            } else {
                setShowBackupAlert(false);
            }
        } catch (e) {
            console.error("Erreur rappel sauvegarde dans BottomMenu", e);
        }
    };

    return (
        <View style={styles.bottomMenuContainer}>
            <View style={styles.filterRow}>
                <TouchableOpacity
                    style={[
                        styles.filterButtonShipping,
                        { backgroundColor: getButtonColor("Commande") },
                        getButtonBorder("Commande"),
                    ]}
                    onPress={() => handlePress("Commande", onFilterCommande)}
                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/shipping.png")}
                            style={styles.icon}
                        />
                        <Text style={styles.filterText}>Commande</Text>
                    </View>
                </TouchableOpacity>

				<TouchableOpacity
    style={[
        styles.filterButtonDevis,
        { backgroundColor: getButtonColor("Devis en cours") },
        getButtonBorder("Devis en cours"),
    ]}
    onPress={() => navigation.navigate("QuoteEditPage")}
>
    <View style={styles.buttonContent}>
        <Image
            source={require("../assets/icons/devisEnCours.png")}
            style={styles.icon}
        />
        <Text style={styles.filterText}>Devis</Text>
    </View>
</TouchableOpacity>

				<TouchableOpacity
    style={[
        styles.filterButtonDevisOk,
        { backgroundColor: getButtonColor("ExpressTypeSelectorPage") },
        getButtonBorder("ExpressTypeSelectorPage"),
    ]}
    onPress={() =>
        handlePress("ExpressTypeSelectorPage", () =>
            navigation.navigate("ExpressTypeSelectorPage")
        )
    }
>
    <View style={styles.buttonContent}>
        <Image
            source={require("../assets/icons/flash.png")} // à adapter selon ton icône
            style={styles.icon}
        />
        <Text style={styles.filterText}>Express</Text>
    </View>
</TouchableOpacity>


                <TouchableOpacity
                    style={[
                        styles.filterButtonRepair,
                        {
                            backgroundColor: getButtonColor(
                                "Réparation en cours"
                            ),
                        },
                        getButtonBorder("Réparation en cours"),
                    ]}
                    onPress={() =>
                        handlePress("Réparation en cours", () =>
                            filterByStatus("Réparation en cours")
                        )
                    }
                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/tools1.png")}
                            style={styles.icon}
                        />
                        <Text style={styles.filterText}>En Réparation</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButtonInit,
                        { backgroundColor: getButtonColor("Réinitialiser") },
                        getButtonBorder("Réinitialiser"),
                    ]}
                    onPress={() => handlePress("Réinitialiser", resetFilter)}
                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/reload.png")}
                            style={styles.icon}
                        />
                        <Text style={styles.filterText}>Réinitialiser</Text>
                    </View>
                </TouchableOpacity>
            </View>

            <View style={styles.separator} />

            <View style={styles.navigationRow}>
                <TouchableOpacity
                    style={[
                        styles.filterButtonHome,
                        { backgroundColor: getButtonColor("Home") },
                    ]}
					onPress={() =>
  handlePress("Home", () =>
    navigation.navigate("MainTabs", { screen: "HomePage" }) // ← adapte le nom ici
  )
}

                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/home.png")}
                            style={styles.icon}
                        />
                        <Text style={styles.menuText}>Accueil</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        { backgroundColor: getButtonColor("AddClient") },
                    ]}
                    onPress={() =>
                        handlePress("AddClient", () =>
                            navigation.navigate("AddClient")
                        )
                    }
                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/add.png")}
                            style={styles.icon}
                        />
                        <Text style={styles.menuText}>Ajouter</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        {
                            backgroundColor: getButtonColor(
                                "RepairedInterventionsListPage"
                            ),
                        },
                    ]}
                    onPress={() =>
                        handlePress("RepairedInterventionsListPage", () =>
                            navigation.navigate("RepairedInterventionsListPage")
                        )
                    }
                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/finished.png")}
                            style={styles.icon}
                        />
                        <Text style={styles.menuText}>Réparés</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        { backgroundColor: getButtonColor("RecoveredClients") },
                    ]}
                    onPress={() =>
                        handlePress("RecoveredClients", () =>
                            navigation.navigate("RecoveredClients")
                        )
                    }
                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/restitue.png")}
                            style={styles.icon}
                        />
                        <Text style={styles.menuText}>Restitués</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        { backgroundColor: getButtonColor("Admin") },
                    ]}
                    onPress={() =>
                        handlePress("Admin", () => navigation.navigate("Admin"))
                    }
                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/Config.png")}
                            style={styles.icon}
                        />
                        <Text style={styles.menuText}>Admin</Text>
                        {showBackupAlert && <View style={styles.redDot} />}
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
        borderWidth: 3,
        borderColor: "#5b6788",
        flex: 1,
        marginHorizontal: 5,
        elevation: 2,
        backgroundColor: "#191f2f",
    },
    filterButtonHome: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderWidth: 3,
        borderColor: "#1da4f1",
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
        tintColor: "#919090",
    },
    menuText: {
        fontSize: 14,
        fontWeight: "medium",
        color: "#e9e9e9",
    },
    filterText: {
        fontSize: 14,
        fontWeight: "medium",
        color: "#e9e9e9",
    },
    separator: {
        height: 1,
        backgroundColor: "#ccc",
        marginVertical: 10,
    },
    redDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: "red",
        position: "absolute",
        top: 0,
        right: 0,
    },
});
