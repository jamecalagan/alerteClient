import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    FlatList,
    StyleSheet,
    ActivityIndicator,
    TouchableOpacity,
} from "react-native";
import { supabase } from "../supabaseClient";

export default function OngoingAmountsPage({ navigation }) {
    const [interventions, setInterventions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [totalCost, setTotalCost] = useState(0);

    // Charger les interventions avec des sommes dues
    const loadInterventions = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from("interventions")
                .select('*, clients(name, ficheNumber)')
                .neq("status", "Récupéré")
                .neq("status", "Non réparable")
                .gt("solderestant", 0); // Filtrer uniquement les interventions avec des montants restants

            if (error) throw error;

            setInterventions(data);
            const total = data.reduce((sum, intervention) => sum + (intervention.solderestant || 0), 0);
            setTotalCost(total.toFixed(2));
        } catch (error) {
            console.error("Erreur lors du chargement des interventions :", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadInterventions();
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Détail des sommes dues</Text>
            {isLoading ? (
                <ActivityIndicator size="large" color="#007BFF" />
            ) : interventions.length === 0 ? (
                <Text style={styles.noInterventionsText}>
                    Aucune somme due pour les interventions en cours.
                </Text>
            ) : (
                <>
                    <FlatList
                        data={interventions}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <View style={styles.card}>
							    <Text style={styles.clientText}>
                                    Nom : {item.clients.name || "Inconnu"}
                                </Text>
                                <Text style={styles.clientText}>
                                    Appareil : {item.deviceType || "Inconnu"}
                                </Text>
                                <Text style={styles.clientText}>
                                    Statut : {item.status}
                                </Text>
                                <Text style={styles.clientText}>
                                    Montant dû :{" "}
                                    {item.solderestant.toLocaleString("fr-FR", {
                                        style: "currency",
                                        currency: "EUR",
                                    })}
                                </Text>
                                <Text style={styles.clientText}>
                                    Dernière mise à jour :{" "}
                                    {new Date(item.updatedAt).toLocaleString(
                                        "fr-FR"
                                    )}
                                </Text>
                            </View>
                        )}
                    />
                    <View style={styles.totalContainer}>
                        <Text style={styles.totalText}>
                            Montant total dû : {totalCost} €
                        </Text>
                    </View>
                </>
            )}

            <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.backButtonText}>Retour</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: "#191f2f",
    },
    header: {
        fontSize: 24,
        fontWeight: "medium",
        marginBottom: 20,
		color: "#888787",
        textAlign: "center",
    },
    card: {
        backgroundColor: "#191f2f",
        padding: 15,
        marginBottom: 10,
		borderRadius: 2,
		borderWidth: 1,
		borderColor: "#888787",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    clientText: {
        fontSize: 16,
		color: "#888787",
        marginBottom: 5,
    },
    totalContainer: {
        marginTop: 20,
        padding: 15,
        backgroundColor: "#191f2f",
        borderRadius: 2,
		borderWidth: 1,
		borderColor: "#888787",
    },
    totalText: {
        fontSize: 20,
        fontWeight: "medium",
        color: "#888787",
        textAlign: "center",
    },
    noInterventionsText: {
        fontSize: 18,
        color: "#888787",
        textAlign: "center",
        marginTop: 50,
    },
    backButton: {
        marginTop: 20,
        padding: 15,
        backgroundColor: "#0c0f18",
		borderRadius: 2,
		borderWidth: 1,
		borderColor: "#888787",
        alignItems: "center",
    },
    backButtonText: {
        color: "#888787",
        fontWeight: "medium",
        fontSize: 16,
    },
});
