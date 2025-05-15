import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { useNavigation } from "@react-navigation/native";

const ExpressTypeSelectorPage = () => {
    const navigation = useNavigation();

    const goToExpress = (type) => {
        navigation.navigate("ExpressClientPage", { type });
    };
const animationValues = useRef(
    Array(8)
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
        delay: index * 120,
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
        delay: index * 150,
        friction: 6,
        tension: 100,
        useNativeDriver: true,
    })
);

    Animated.stagger(100, animations).start();
}, []);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Choisir un type de fiche express</Text>

            <View style={styles.creationRow}>
    {["logiciel", "reparation", "video", "devis", "pc"].map((type, index) => {
        const isQuote = type === "devis" || type === "pc";
        const buttonProps = {
            logiciel: {
                icon: "🖥",
                label: "Dépannage",
                color: "#007bff",
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
                            translateX: topButtonAnimations[index].interpolate({
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
                            ? navigation.navigate("QuoteEditPage", type === "pc" ? { preset: "pc" } : undefined)
                            : navigation.navigate("ExpressClientPage", { type })
                    }
                >
                    <Text style={styles.buttonIcon}>{buttonProps.icon}</Text>
                    <Text style={styles.buttonLabel}>{buttonProps.label}</Text>
                </TouchableOpacity>
            </Animated.View>
        );
    })}
</View>


            <View style={styles.separator} />

            <View style={styles.otherGroup}>
    <Animated.View style={{
        opacity: animationValues[0],
        transform: [{ translateY: animationValues[0].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
    }}>
        <TouchableOpacity
            style={[styles.longButton, styles.shadowBox, { backgroundColor: "#f3ae54" }]}
            onPress={() => navigation.navigate("ExpressListPage")}
        >
            <Text style={styles.buttonTextFiche}>Voir les fiches enregistrées</Text>
        </TouchableOpacity>
    </Animated.View>

    <Animated.View style={{
        opacity: animationValues[1],
        transform: [{ translateY: animationValues[1].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
    }}>
        <TouchableOpacity
            style={[styles.longButton, styles.shadowBox, { backgroundColor: "#3a8f56" }]}
            onPress={() => navigation.navigate("BillingPage")}
        >
            <Text style={styles.buttonText}>Créer une facture</Text>
        </TouchableOpacity>
    </Animated.View>

    <Animated.View style={{
        opacity: animationValues[2],
        transform: [{ translateY: animationValues[2].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
    }}>
        <TouchableOpacity
            style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#3f48be" }]}
            onPress={() => navigation.navigate("BillingListPage")}
        >
            <Text style={styles.buttonText}>Liste des Factures</Text>
        </TouchableOpacity>
    </Animated.View>

    <Animated.View style={{
        opacity: animationValues[3],
        transform: [{ translateY: animationValues[3].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
    }}>
        <TouchableOpacity
            style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#555" }]}
            onPress={() => navigation.navigate("AllOrdersPage")}
        >
            <Text style={styles.optionText}>Voir toutes les commandes</Text>
        </TouchableOpacity>
    </Animated.View>

    <Animated.View style={{
        opacity: animationValues[4],
        transform: [{ translateY: animationValues[4].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
    }}>
        <TouchableOpacity
            style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#09a4ca" }]}
            onPress={() => navigation.navigate("QuoteListPage")}
        >
            <Text style={styles.optionText}>Liste des devis</Text>
        </TouchableOpacity>
    </Animated.View>

    <Animated.View style={{
        opacity: animationValues[5],
        transform: [{ translateY: animationValues[5].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
    }}>
        <TouchableOpacity
            style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#690759" }]}
            onPress={() => navigation.navigate("ProductFormScreen")}
        >
            <Text style={styles.buttonText}>Créer une affiche</Text>
        </TouchableOpacity>
    </Animated.View>

    <Animated.View style={{
        opacity: animationValues[6],
        transform: [{ translateY: animationValues[6].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
    }}>
        <TouchableOpacity
            style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#34568B" }]}
            onPress={() => navigation.navigate("FlyerList")}
        >
            <Text style={styles.buttonText}>Liste des affiches</Text>
        </TouchableOpacity>
		</Animated.View>
		    <Animated.View style={{
        opacity: animationValues[7],
        transform: [{ translateY: animationValues[7].interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
    }}>
		<TouchableOpacity
			style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#129b00" }]}
			onPress={() => navigation.navigate("ClientNotificationsPage")}
>
  <Text style={styles.buttonText}>Liste des clients Notifiés</Text>
</TouchableOpacity>
    </Animated.View>
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
});

export default ExpressTypeSelectorPage;
