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
                    "id, status,notifiedBy, deviceType, brand, model, clients (name, ficheNumber)"
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
        <ImageBackground
            source={backgroundImage}
            style={styles.backgroundImage}
        >
            <View style={styles.overlay}>
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
                                                tintColor: "#00fd00",
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
            </View>

            <BottomNavigation
                navigation={navigation}
                currentRoute="RepairedInterventionsListPage"
            />
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
