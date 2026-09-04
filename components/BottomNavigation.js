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
    isActive={activeButton === "RepairedInterventionsListPage"}
    onPress={() => handlePress("RepairedInterventionsListPage", "RepairedInterventionsListPage")}
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

const ACCENT = "#0d9488";

const MenuButton = ({ label, icon, isActive, onPress }) => (
    <TouchableOpacity
        style={[
            styles.menuButton,
            { backgroundColor: isActive ? ACCENT : "#20263b" },
        ]}
        onPress={onPress}
    >
        <View style={styles.buttonContent}>
            <Image
                source={icon}
                style={[styles.icon, { tintColor: isActive ? "#ffffff" : ACCENT }]}
            />
            <Text style={[styles.menuText, { color: isActive ? "#ffffff" : "#cbd5e1" }]}>
                {label}
            </Text>
        </View>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    bottomMenuContainer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        paddingVertical: 10,
    },
    navigationRow: {
        flexDirection: "row",
        justifyContent: "space-around",
    },
    menuButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 18,
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
    },
    menuText: {
        fontWeight: "medium",
    },
});
