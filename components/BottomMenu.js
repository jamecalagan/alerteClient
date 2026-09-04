import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRoute, useIsFocused } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../supabaseClient";
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
    const [ongoingCount, setOngoingCount] = useState(0);

    // Désactiver les autres boutons lorsque l'on revient sur Home
    useEffect(() => {
        if (isFocused && route.name === "Home") {
            setActiveButton(null); // Désactive les autres boutons sauf Accueil
        } else if (isFocused) {
            setActiveButton(route.name); // Active le bouton correspondant à la page
        }
        checkBackupReminder();
    }, [isFocused, route.name]);
useEffect(() => {
  if (!isFocused) return;

  (async () => {
    try {
      // Définition « commandes en cours » :
      // - non supprimées (deleted IS NULL/FALSE)
      // - non récupérées (recovered IS NULL/FALSE)
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        // deleted = false OR NULL
        .or("deleted.is.null,deleted.eq.false")
        // recovered = false OR NULL
        .or("recovered.is.null,recovered.eq.false");

      if (error) throw error;

      setOngoingCount(count ?? 0);
    } catch (e) {
      console.error("Erreur comptage commandes en cours:", e);
      setOngoingCount(0);
    }
  })();
}, [isFocused]);



    const handlePress = (status, action) => {
        if (status !== "Home") {
            setActiveButton(status); // Mettre à jour le bouton actif sauf pour Accueil
        } else {
            setActiveButton(null); // Désactiver les autres boutons en revenant à Home
        }
        action(); // Appeler l'action correspondante (filtrer ou naviguer)
    };

    const ACCENTS = {
        Commande: "#8b5cf6",
        "Devis en cours": "#fb923c",
        ExpressTypeSelectorPage: "#eab308",
        "Intervention en cours": "#3b82f6",
        "Réinitialiser": "#22c55e",
        Home: "#0d9488",
    };
    const NEUTRAL_ACCENT = "#64748b";
    const getAccent = (status) => ACCENTS[status] || NEUTRAL_ACCENT;
    const isActiveStatus = (status) =>
        status === "Home" ? true : activeButton === status;

    // Fond navy quand inactif, pastille pleine de la couleur du bouton quand actif.
    const getButtonColor = (status) =>
        isActiveStatus(status) ? getAccent(status) : "#20263b";

    // Coins arrondis, plat (sans ombre) au lieu des bordures épaisses.
    const getButtonBorder = (status) => ({
        borderRadius: 18,
        elevation: 0,
        shadowOpacity: 0,
    });
    const getIconTint = (status) =>
        isActiveStatus(status)
            ? status === "Home"
                ? "#ffffff"
                : "#000000"
            : getAccent(status);
    const getTextColor = (status) =>
        isActiveStatus(status)
            ? status === "Home"
                ? "#ffffff"
                : "#000000"
            : "#cbd5e1";
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
    <View style={styles.iconWrap}>
      <Image
        source={require("../assets/icons/shipping.png")}
        style={[styles.icon, { tintColor: getIconTint("Commande") }]}
      />
      {ongoingCount > 0 && (
        <View style={styles.greenBadge}>
          <Text style={styles.greenBadgeText}>
            {ongoingCount > 99 ? "99+" : String(ongoingCount)}
          </Text>
        </View>
      )}
    </View>
    <Text style={[styles.filterText, { color: getTextColor("Commande") }]}>Commande</Text>
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
            style={[styles.icon, { tintColor: getIconTint("Devis en cours") }]}
        />
        <Text style={[styles.filterText, { color: getTextColor("Devis en cours") }]}>Devis</Text>
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
            style={[styles.icon, { tintColor: getIconTint("ExpressTypeSelectorPage") }]}
        />
        <Text style={[styles.filterText, { color: getTextColor("ExpressTypeSelectorPage") }]}>Express</Text>
    </View>
</TouchableOpacity>


                <TouchableOpacity
                    style={[
                        styles.filterButtonRepair,
                        {
                            backgroundColor: getButtonColor(
                                "Intervention en cours"
                            ),
                        },
                        getButtonBorder("Intervention en cours"),
                    ]}
                    onPress={() =>
                        handlePress("Intervention en cours", () =>
                            filterByStatus("Intervention en cours")
                        )
                    }
                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/tools1.png")}
                            style={[styles.icon, { tintColor: getIconTint("Intervention en cours") }]}
                        />
                        <Text style={[styles.filterText, { color: getTextColor("Intervention en cours") }]}>En Réparation</Text>
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
                            style={[styles.icon, { tintColor: getIconTint("Réinitialiser") }]}
                        />
                        <Text style={[styles.filterText, { color: getTextColor("Réinitialiser") }]}>Réinitialiser</Text>
                    </View>
                </TouchableOpacity>
            </View>

            <View style={styles.separator} />

            <View style={styles.navigationRow}>
                <TouchableOpacity
                    style={[
                        styles.filterButtonHome,
                        { backgroundColor: getButtonColor("Home") },
                        getButtonBorder("Home"),
                    ]}
onPress={() =>
  handlePress("Home", () => {
    if (route.name === "Home") {
      // Déjà sur la Home : remet l’affichage initial
      resetFilter?.();
      return;
    }

    // Depuis une autre page : retour à la Home
    navigation.navigate("Home");
  })
}

                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/home.png")}
                            style={[styles.icon, { tintColor: getIconTint("Home") }]}
                        />
                        <Text style={[styles.menuText, { color: getTextColor("Home") }]}>Accueil</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        { backgroundColor: getButtonColor("AddClient") },
                        getButtonBorder("AddClient"),
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
                            style={[styles.icon, { tintColor: getIconTint("AddClient") }]}
                        />
                        <Text style={[styles.menuText, { color: getTextColor("AddClient") }]}>Ajouter</Text>
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
                        getButtonBorder("RepairedInterventionsListPage"),
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
                            style={[styles.icon, { tintColor: getIconTint("RepairedInterventionsListPage") }]}
                        />
                        <Text style={[styles.menuText, { color: getTextColor("RepairedInterventionsListPage") }]}>Réparés</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        { backgroundColor: getButtonColor("RecoveredClients") },
                        getButtonBorder("RecoveredClients"),
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
                            style={[styles.icon, { tintColor: getIconTint("RecoveredClients") }]}
                        />
                        <Text style={[styles.menuText, { color: getTextColor("RecoveredClients") }]}>Restitués</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.filterButton,
                        { backgroundColor: getButtonColor("Admin") },
                        getButtonBorder("Admin"),
                    ]}
                    onPress={() =>
                        handlePress("Admin", () => navigation.navigate("Admin"))
                    }
                >
                    <View style={styles.buttonContent}>
                        <Image
                            source={require("../assets/icons/Config.png")}
                            style={[styles.icon, { tintColor: getIconTint("Admin") }]}
                        />
                        <Text style={[styles.menuText, { color: getTextColor("Admin") }]}>Admin</Text>
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
        bottom: 14,
        left: 15,
        right: 15,
        paddingVertical: 10,
        paddingBottom: 2,
        borderRadius: 5,
    },
    navigationRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginBottom: 2,
    },
    filterRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginTop: 10,
    },
    filterButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        flex: 1,
        marginHorizontal: 5,
        backgroundColor: "#191f2f",
    },
    filterButtonHome: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        flex: 1,
        marginHorizontal: 5,
        backgroundColor: "#191f2f",
    },
    filterButtonShipping: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        flex: 1,
        marginHorizontal: 5,
        backgroundColor: "#191f2f",
    },
    filterButtonDevis: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        flex: 1,
        marginHorizontal: 5,
        backgroundColor: "#191f2f",
    },
    filterButtonDevisOk: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        flex: 1,
        marginHorizontal: 5,
        backgroundColor: "#191f2f",
    },
    filterButtonRepair: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        flex: 1,
        marginHorizontal: 5,
        backgroundColor: "#191f2f",
    },
    filterButtonInit: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        flex: 1,
        marginHorizontal: 5,
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
        backgroundColor: "#334155",
        opacity: 0.4,
        marginVertical: 4,
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
iconWrap: {
  position: "relative",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 8,
},
greenBadge: {
  position: "absolute",
  top: -5,
  right: 0,
  minWidth: 30,
  height: 30,
  paddingHorizontal: 4,
  borderRadius: 10,
  backgroundColor: "#0c7a3a",
  borderWidth: 1,
  borderColor: "#ffffff",
  alignItems: "center",
  justifyContent: "center",
},
greenBadgeText: {
  color: "#ffffff",
  fontSize: 11,
  fontWeight: "bold",
},


});
