import React, { useEffect, useRef } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Linking,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

const ExpressTypeSelectorPage = () => {
    const navigation = useNavigation();

    const goToExpress = (type) => {
        navigation.navigate("ExpressClientPage", { type });
    };
    const animationValues = useRef(
        Array(11)
            .fill()
            .map(() => new Animated.Value(0))
    ).current;
    const topButtonAnimations = useRef(
        Array(5)
            .fill()
            .map(() => new Animated.Value(0))
    ).current;

    useEffect(() => {
        const topAnimations = topButtonAnimations.map((anim, index) =>
            Animated.spring(anim, {
                toValue: 1,
                delay: index * 80,
                friction: 6,
                tension: 100,
                useNativeDriver: true,
            })
        );

        Animated.stagger(80, topAnimations).start();
    }, []);

    useEffect(() => {
        const animations = animationValues.map((anim, index) =>
            Animated.spring(anim, {
                toValue: 1,
                delay: index * 40,
                friction: 6,
                tension: 100,
                useNativeDriver: true,
            })
        );

        Animated.stagger(40, animations).start();
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Choisir un type de fiche express</Text>

            <View style={styles.creationRow}>
                {["logiciel", "reparation", "video", "devis", "pc"].map(
                    (type, index) => {
                        const isQuote = type === "devis" || type === "pc";
                        const buttonProps = {
                            logiciel: {
                                icon: "🖥",
                                label: "Dépannage",
                                color: "#405f80",
                            },
                            reparation: {
                                icon: "🛠",
                                label: "Réparation",
                                color: "#28a745",
                            },
                            video: {
                                icon: "🎬",
                                label: "Vidéo",
                                color: "#ffc107",
                            },
                            devis: {
                                icon: "🧾",
                                label: "Devis",
                                color: "#351f32",
                            },
                            pc: {
                                icon: "🖥️",
                                label: "Devis PC",
                                color: "#1b2a41",
                            },
                        }[type];

                        return (
                            <Animated.View
                                key={type}
                                style={{
                                    opacity: topButtonAnimations[index],
                                    transform: [
                                        {
                                            translateX: topButtonAnimations[
                                                index
                                            ].interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [-30, 0],
                                            }),
                                        },
                                    ],
                                }}
                            >
                                <TouchableOpacity
                                    style={[
                                        styles.squareButton,
                                        { backgroundColor: buttonProps.color },
                                    ]}
                                    onPress={() =>
                                        isQuote
                                            ? navigation.navigate(
                                                  "QuoteEditPage",
                                                  type === "pc"
                                                      ? { preset: "pc" }
                                                      : undefined
                                              )
                                            : navigation.navigate(
                                                  "ExpressClientPage",
                                                  { type }
                                              )
                                    }
                                >
                                    <Text style={styles.buttonIcon}>
                                        {buttonProps.icon}
                                    </Text>
                                    <Text style={styles.buttonLabel}>
                                        {buttonProps.label}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        );
                    }
                )}
            </View>

            <View style={styles.separator} />

            <View style={styles.gridContainer}>
                {animationValues.map((anim, index) => {
                    const buttonConfigs = [
                        {
                            bg: "#555",
                            text: "Voir toutes les commandes",
                            route: "AllOrdersPage",
                            optionText: true,
                        },
                        {
                            bg: "#09a4ca",
                            text: "Liste des devis",
                            route: "QuoteListPage",
                            optionText: true,
                        },

                        {
                            bg: "#3a8f56",
                            text: "Créer une facture",
                            route: "BillingPage",
                        },
                        {
                            bg: "#3f48be",
                            text: "Liste des Factures",
                            route: "BillingListPage",
                        },

                        {
                            bg: "#690759",
                            text: "Créer une affiche",
                            route: "ProductFormScreen",
                        },
                        {
                            bg: "#34568B",
                            text: "Liste des affiches",
                            route: "FlyerList",
                        },

                        {
                            bg: "#f3ae54",
                            text: "Voir les fiches enregistrées",
                            route: "ExpressListPage",
                        },

                        {
                            bg: "#f84903",
                            text: "Créer une étiquette client",
                            route: "QuickLabelPrintPage",
                        },
                        {
                            bg: "#129b00",
                            text: "Liste des clients Notifiés",
                            route: "ClientNotificationsPage",
                        },

                        {
                            bg: "#2b8a3e",
                            text: "Messagerie SMS",
                            action: () => Linking.openURL("sms:"), // 👈 au lieu de "route"
                        },
						                        {
                            bg: "#7f0883",
                            text: "Liste des Fiches de Contrôle",
                            route: "CheckupListPage",
                        },
                    ];

                    const { bg, text, route, optionText, action } =
                        buttonConfigs[index];

                    return (
                        <Animated.View
                            key={index}
                            style={[
                                styles.gridItem,
                                {
                                    opacity: anim,
                                    transform: [
                                        {
                                            translateY: anim.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [20, 0],
                                            }),
                                        },
                                    ],
                                },
                            ]}
                        >
                            <TouchableOpacity
                                style={[
                                    styles.optionButton,
                                    styles.shadowBox,
                                    { backgroundColor: bg },
                                ]}
                                onPress={() => {
                                    if (action) action();
                                    else navigation.navigate(route);
                                }}
                            >
                                <Text
                                    style={
                                        optionText
                                            ? styles.optionText
                                            : styles.buttonText
                                    }
                                >
                                    {text}
                                </Text>
                            </TouchableOpacity>
                        </Animated.View>
                    );
                })}
            </View>

            <View style={{ alignItems: "center", marginTop: 16 }}>
                <TouchableOpacity
                    style={[
                        styles.optionButton,
                        styles.shadowBox,
                        { backgroundColor: "#a7a7a7", width: "60%" }, // Largeur fixe pour centrage
                    ]}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.buttonText}>⬅ Retour</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};
const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "center",
        padding: 20,
        backgroundColor: "#fff",
    },
    title: {
        fontSize: 22,
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: 30,
    },
    button: {
        backgroundColor: "#296494",
        paddingVertical: 15,
        borderRadius: 10,
        marginBottom: 10,
    },
    secondaryButtonFiche: {
        backgroundColor: "#f3ae54",
        paddingVertical: 15,
        borderRadius: 10,
        marginBottom: 10,
    },
    secondaryButtonFact: {
        backgroundColor: "#3a8f56",
        paddingVertical: 15,
        borderRadius: 10,
        marginBottom: 10,
    },
    buttonText: {
        color: "#fff",
        fontWeight: "medium",
        fontSize: 18,
    },
    buttonTextFiche: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },
    creationGroup: {
        marginBottom: 20,
    },

    separator: {
        height: 2,
        backgroundColor: "#ccc",
        marginVertical: 20,
        borderRadius: 5,
    },

    otherGroup: {
        alignItems: "center",
        gap: 15,
        marginBottom: 10,
    },

    secondaryButton: {
        backgroundColor: "#555",
        padding: 12,
        borderRadius: 10,
    },
    creationRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 20,
    },

    squareButton: {
        width: 90, // largeur carrée
        height: 90,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    buttonIcon: {
        fontSize: 26,
        marginBottom: 5,
    },

    buttonLabel: {
        fontSize: 12,
        fontWeight: "bold",
        color: "white",
        textAlign: "center",
    },
    longButton: {
        width: 310, // la somme de (90 * 3 + 2 gaps de 20px) = 310px !
        paddingVertical: 16,
        borderRadius: 50,
        alignItems: "center",
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        backgroundColor: "#363636",
    },
    optionButton: {
        width: 310,
        paddingVertical: 15,
        backgroundColor: "#3e4c69",
        borderRadius: 50,
        alignItems: "center",
        marginTop: 20,
    },
    optionText: {
        fontSize: 18,
        color: "#ffffff",
    },
    shadowBox: {
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    returnButton: {
        backgroundColor: "#a7a7a7",
        padding: 12,
        borderRadius: 8,
        alignItems: "center",
        margin: 16,
    },
gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 20,
    alignSelf: "center", // 👈 assure le centrage global
    width: "100%",       // 👈 ou fixe à une valeur en px si tu veux 2 colonnes fixes
},

    gridItem: {
        width: "45%", // ✅ Deux colonnes avec un peu d'espace
        marginBottom: 8,
		marginTop: 8,
		marginHorizontal: 5, // Pour l'espacement horizontal
		alignItems: "center",
    },
});

export default ExpressTypeSelectorPage;
