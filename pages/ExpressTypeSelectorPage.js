import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";

const ExpressTypeSelectorPage = () => {
    const navigation = useNavigation();

    const goToExpress = (type) => {
        navigation.navigate("ExpressClientPage", { type });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Choisir un type de fiche express</Text>

            <View style={styles.creationRow}>
                <TouchableOpacity
                    style={[
                        styles.squareButton,
                        { backgroundColor: "#007bff" },
                    ]}
                    onPress={() => goToExpress("logiciel")}
                >
                    <Text style={styles.buttonIcon}>🖥</Text>
                    <Text style={styles.buttonLabel}>Dépannage</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.squareButton,
                        { backgroundColor: "#28a745" },
                    ]}
                    onPress={() => goToExpress("reparation")}
                >
                    <Text style={styles.buttonIcon}>🛠</Text>
                    <Text style={styles.buttonLabel}>Réparation</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.squareButton,
                        { backgroundColor: "#ffc107" },
                    ]}
                    onPress={() => goToExpress("video")}
                >
                    <Text style={styles.buttonIcon}>🎬</Text>
                    <Text style={styles.buttonLabel}>Vidéo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.squareButton,
                        { backgroundColor: "#351f32" },
                    ]}
                    onPress={() => navigation.navigate("QuoteEditPage")}
                >
                    <Text style={styles.buttonIcon}>🧾</Text>
                    <Text style={styles.buttonLabel}>Devis</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.squareButton,
                        { backgroundColor: "#1b2a41" },
                    ]}
                    onPress={() =>
                        navigation.navigate("QuoteEditPage", { preset: "pc" })
                    }
                >
                    <Text style={styles.buttonIcon}>🖥️</Text>
                    <Text style={styles.buttonLabel}>Devis PC</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.separator} />

            <View style={styles.otherGroup}>
                <TouchableOpacity
                    style={[styles.longButton, styles.shadowBox, { backgroundColor: "#f3ae54" }]}
                    onPress={() => navigation.navigate("ExpressListPage")}
                >
                    <Text style={styles.buttonTextFiche}>
                        Voir les fiches enregistrées
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.longButton, styles.shadowBox, { backgroundColor: "#3a8f56" }]}
                    onPress={() => navigation.navigate("BillingPage")}
                >
                    <Text style={styles.buttonText}>Créer une facture</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#3f48be" }]}
                    onPress={() => navigation.navigate("BillingListPage")}
                >
                    <Text style={styles.buttonText}>Liste des Factures</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.optionButton, styles.shadowBox, { backgroundColor: "#555" }]}
                    onPress={() => navigation.navigate("AllOrdersPage")}
                >
                    <Text style={styles.optionText}>
                        Voir toutes les commandes
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.optionButton, styles.shadowBox,
                        { backgroundColor: "#09a4ca" },
                    ]}
                    onPress={() => navigation.navigate("QuoteListPage")}
                >
                    <Text style={styles.optionText}>Liste des devis</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.optionButton, styles.shadowBox,
                        { backgroundColor: "#690759", },
                    ]}
                    onPress={() => {
                        navigation.navigate("ProductFormScreen");
                    }}
                >
                    <Text style={styles.buttonText}>Créer une affiche</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.optionButton, styles.shadowBox,
                        { backgroundColor: "#34568B" },
                    ]}
                    onPress={() => navigation.navigate("FlyerList")}
                >
                    <Text style={styles.buttonText}>Liste des affiches</Text>
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
