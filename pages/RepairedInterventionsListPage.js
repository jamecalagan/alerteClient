import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ImageBackground,
    Animated,
    Easing,
    Image,
} from "react-native";
import { supabase } from "../supabaseClient";
import BottomNavigation from "../components/BottomNavigation";
import * as Animatable from "react-native-animatable";
const backgroundImage = require("../assets/listing2.jpg");
const formatPhoneNumber = (phoneNumber) => {
	if (!phoneNumber) return "";

	return phoneNumber.replace(/(\d{2})(?=\d)/g, "$1 "); // Ajoute un espace après chaque deux chiffres
};
export default function RepairedInterventionsListPage({ navigation }) {
    const [repairedInterventions, setRepairedInterventions] = useState([]);

    useEffect(() => {
        loadRepairedInterventions();
    }, []);

    const loadRepairedInterventions = async () => {
        try {
            const { data, error } = await supabase
                .from("interventions")
                .select(
                    "id, status,notifiedBy, deviceType, brand, model, clients (name, ficheNumber, phone)"
                )
                .in("status", ["Réparé", "Non réparable"]);

            if (error) throw error;
            setRepairedInterventions(data);
        } catch (error) {
            console.error(
                "Erreur lors du chargement des interventions réparées :",
                error
            );
        }
    };
    const BlinkingIcon = ({ source, tintColor }) => {
        const opacity = useRef(new Animated.Value(1)).current;

        useEffect(() => {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(opacity, {
                        toValue: 0,
                        duration: 500,
                        useNativeDriver: true,
                        easing: Easing.linear,
                    }),
                    Animated.timing(opacity, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: true,
                        easing: Easing.linear,
                    }),
                ])
            );
            loop.start();
            return () => loop.stop();
        }, []);

        return (
            <Animated.Image
                source={source}
                style={{
                    width: 30,
                    height: 30,
                    tintColor,
                    opacity,
                    marginLeft: "auto",
                }}
            />
        );
    };
    return (
			<View style={styles.container}>
                <Text style={styles.title}>
                    Liste des Interventions Réparées
                </Text>
                <FlatList
                    data={repairedInterventions}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item, index }) => (
                        <Animatable.View
                            animation="zoomIn"
                            duration={400}
                            delay={index * 150}
                        >
                            <TouchableOpacity
                                style={[
                                    styles.interventionItem,
                                    item.status === "Non réparable"
                                        ? { borderWidth: 2, borderColor: "red" }
                                        : {}, // Ajout du contour rouge
                                ]}
                                onPress={() =>
                                    navigation.navigate(
                                        "RepairedInterventionsPage",
                                        {
                                            selectedInterventionId: item.id, // Envoie l'ID de l'intervention sélectionnée
                                        }
                                    )
                                }
                            >
                                <Text style={styles.itemText}>
                                    Fiche N°: {item.clients.ficheNumber}
                                </Text>
                                <Text style={styles.itemText}>
                                    Client: {item.clients.name}
                                </Text>
								<Text style={styles.itemText}>
									Téléphone: {formatPhoneNumber(item.clients.phone)}
                                </Text>
                                <Text style={styles.itemText}>
                                    Produit: {item.deviceType} - {item.brand}
                                </Text>
                                <View
                                    style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        marginTop: 8,
                                    }}
                                >
                                    <Text style={styles.itemText}>
                                        Notification :
                                    </Text>

                                    {item.notifiedBy === "SMS" && (
                                        <Image
                                            source={require("../assets/icons/sms.png")}
                                            style={{
                                                width: 30,
                                                height: 30,
                                                tintColor: "#045e04",
                                                marginLeft: "auto",
                                            }}
                                        />
                                    )}
                                    {item.notifiedBy === "Téléphone" && (
                                        <Image
                                            source={require("../assets/icons/call.png")}
                                            style={{
                                                width: 20,
                                                height: 20,
                                                tintColor: "#3c92f5",
                                                marginLeft: "auto",
                                            }}
                                        />
                                    )}
                                    {!item.notifiedBy && (
                                        <BlinkingIcon
                                            source={require("../assets/icons/notifications_off.png")}
                                            tintColor="#fa0404"
                                        />
                                    )}
                                </View>
                            </TouchableOpacity>
                        </Animatable.View>
                    )}
                />
            

            <BottomNavigation
                navigation={navigation}
                currentRoute="RepairedInterventionsListPage"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: "#e0e0e0",
    },
    title: {
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        color: "#242424",
        marginBottom: 20,
    },
    interventionItem: {
        padding: 15,
        marginBottom: 10,
        backgroundColor: "#f0f0f0",
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#888787",
		elevation: 2,
    },
    itemText: {
        fontSize: 16,
        color: "#242424",
    },
});
