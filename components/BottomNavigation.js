import React, { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";

export default function BottomMenu() {
    const navigation = useNavigation();
    const route = useRoute();
    const [activeButton, setActiveButton] = useState("Home"); // Par défaut sur "Home"

    // Synchronisation de l'état actif lors du focus sur la page
    useFocusEffect(
        useCallback(() => {
            setActiveButton(route.name);
        }, [route.name])
    );

    const handlePress = (status, routeName) => {
        navigation.navigate(routeName);
    };

    return (
        <View style={styles.bottomMenuContainer}>
            <View style={styles.navigationRow}>
                <MenuButton
                    label="Accueil"
                    icon={require("../assets/icons/home.png")}
                    isActive={activeButton === "Home"}
                    onPress={() => handlePress("Home", "Home")}
                />
                <MenuButton
                    label="Ajouter"
                    icon={require("../assets/icons/add.png")}
                    isActive={activeButton === "AddClient"}
                    onPress={() => handlePress("AddClient", "AddClient")}
                />
                <MenuButton
                    label="Réparés"
                    icon={require("../assets/icons/finished.png")}
                    isActive={activeButton === "RepairedInterventions"}
                    onPress={() => handlePress("RepairedInterventions", "RepairedInterventions")}
                />
                <MenuButton
                    label="Restitués"
                    icon={require("../assets/icons/restitue.png")}
                    isActive={activeButton === "RecoveredClients"}
                    onPress={() => handlePress("RecoveredClients", "RecoveredClients")}
                />
                <MenuButton
                    label="Admin"
                    icon={require("../assets/icons/Config.png")}
                    isActive={activeButton === "Admin"}
                    onPress={() => handlePress("Admin", "Admin")}
                />
            </View>
        </View>
    );
}

const MenuButton = ({ label, icon, isActive, onPress }) => (
    <TouchableOpacity
        style={[
            styles.menuButton,
            { backgroundColor: isActive ? "#191f2f" : "#191f2f",
				borderWidth: 3, // Épaisseur de la bordure
				borderColor: isActive ? "#1da4f1" : "#444c5c",}
        ]}
        onPress={onPress}
    >
        <View style={styles.buttonContent}>
            <Image source={icon} style={styles.icon} />
            <Text style={styles.menuText}>{label}</Text>
        </View>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    bottomMenuContainer: {
        position: "absolute",
        bottom: 0,
        width: "100%",
        paddingVertical: 10,
    },
    navigationRow: {
        flexDirection: "row",
        justifyContent: "space-around",
    },
    menuButton: {
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
		borderWidth: 1,
		borderColor: "#5b6788",
        alignItems: "center",
        flex: 1,
        marginHorizontal: 5,
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
        color: "#fff",
        fontWeight: "medium",
    },
});
