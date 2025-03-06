import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ImageBackground
} from "react-native";
import { supabase } from "../supabaseClient";
import BottomNavigation from "../components/BottomNavigation";

const backgroundImage = require("../assets/listing2.jpg");

export default function RepairedInterventionsListPage({ navigation }) {
    const [repairedInterventions, setRepairedInterventions] = useState([]);

    useEffect(() => {
        loadRepairedInterventions();
    }, []);

    const loadRepairedInterventions = async () => {
        try {
            const { data, error } = await supabase
                .from("interventions")
                .select("id, status, deviceType, brand, model, clients (name, ficheNumber)")
                .in("status", ["Réparé", "Non réparable"]);

            if (error) throw error;
            setRepairedInterventions(data);
        } catch (error) {
            console.error("Erreur lors du chargement des interventions réparées :", error);
        }
    };

    return (
        <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
            <View style={styles.overlay}>
                <Text style={styles.title}>Liste des Interventions Réparées</Text>
                <FlatList
                    data={repairedInterventions}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item }) => (
<TouchableOpacity
    style={[
        styles.interventionItem,
        item.status === "Non réparable" ? { borderWidth: 2, borderColor: "red" } : {}, // Ajout du contour rouge
    ]}
    onPress={() =>
        navigation.navigate("RepairedInterventionsPage", {
            selectedInterventionId: item.id, // Envoie l'ID de l'intervention sélectionnée
        })
    }
>
    <Text style={styles.itemText}>Fiche N°: {item.clients.ficheNumber}</Text>
    <Text style={styles.itemText}>Client: {item.clients.name}</Text>
    <Text style={styles.itemText}>Produit: {item.deviceType} - {item.brand}</Text>
</TouchableOpacity>

                    )}
                />
            </View>
            <BottomNavigation navigation={navigation} currentRoute="RepairedInterventionsListPage" />
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    backgroundImage: {
        flex: 1,
        resizeMode: "cover",
    },
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        padding: 10,
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        color: "white",
        marginBottom: 20,
    },
    interventionItem: {
        padding: 15,
        marginBottom: 10,
        backgroundColor: "#191f2f",
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#888787",
    },
    itemText: {
        fontSize: 16,
        color: "#b6b4b4",
    },
});
