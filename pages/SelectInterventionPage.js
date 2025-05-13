import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { supabase } from "../supabaseClient";

const SelectInterventionPage = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { clientId } = route.params;

    const [interventions, setInterventions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInterventions = async () => {
            try {
                const { data, error } = await supabase
                    .from("interventions")
                    .select("id, deviceType, brand, model, createdAt, solderestant")
                    .eq("client_id", clientId);

                if (error) throw error;

                setInterventions(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))); // Trier par date
            } catch (err) {
                Alert.alert("Erreur", "Impossible de charger les interventions.");
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchInterventions();
    }, [clientId]);

    if (loading) {
        return <Text>Chargement des interventions...</Text>;
    }

    if (interventions.length === 0) {
        return <Text>Aucune intervention disponible pour ce client.</Text>;
    }

    const handleSelect = (interventionId) => {
        navigation.navigate("ClientPreviewPage", { clientId, interventionId });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Sélectionnez une intervention</Text>
            <FlatList
                data={interventions}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.item}
                        onPress={() => handleSelect(item.id)}
                    >
                        <Text style={styles.itemText}>
                            {item.deviceType} - {item.brand} {item.model}
                        </Text>
                        <Text style={styles.itemDate}>
                            Créée le : {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                        </Text>
                    </TouchableOpacity>
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: "#e0e0e0",
    },
    title: {
        fontSize: 20,
        fontWeight: "medium",
		color: "#242424",
        marginBottom: 10,
    },
    item: {
        padding: 15,
        backgroundColor: "#cacaca",
        borderRadius: 8,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "#888787",
    },
    itemText: {
        fontSize: 16,
		color: "#242424",
        fontWeight: "medium",
    },
    itemDate: {
        fontSize: 14,
        color: "#242424",
    },
});

export default SelectInterventionPage;
