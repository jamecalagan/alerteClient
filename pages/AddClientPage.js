import React, { useState, useEffect } from "react";
import {
    View,
    TextInput,
    StyleSheet,
    ImageBackground,
    Keyboard,
    Alert,
    Image,
	TouchableOpacity,
	Text,
} from "react-native";
import { supabase } from "../supabaseClient";
import RoundedButton from "../components/RoundedButton";
import CustomAlert from "../components/CustomAlert";
import BottomNavigation from "../components/BottomNavigation";

export default function AddClientPage({ navigation, route }) {
    const backgroundImage = require("../assets/listing2.jpg");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertMessage, setAlertMessage] = useState("");
    const [alertTitle, setAlertTitle] = useState("");
    const [focusedField, setFocusedField] = useState(null);

    const validateFields = () => {
        if (!name || !phone) {
            setAlertTitle("Erreur");
            setAlertMessage("Le nom et le numéro de téléphone doivent être remplis.");
            setAlertVisible(true);
            return false;
        }
        return true;
    };

	const handleAddClient = async () => {
		if (!validateFields()) return;
		if (isSubmitting) return;
		setIsSubmitting(true);
		try {
			const { data: existingClients, error: checkError } = await supabase
				.from("clients")
				.select("id, name, phone")
				.eq("name", name)
				.eq("phone", phone);

			if (checkError) {
				Alert.alert("Erreur", "Erreur lors de la vérification des clients existants.");
				setIsSubmitting(false);
				return;
			}

			if (existingClients.length > 0) {
				Alert.alert("Client existant", `Un client avec ce nom et ce numéro de téléphone existe déjà.`);
				setIsSubmitting(false);
				return;
			}

			const { data: maxFicheData, error: maxFicheError } = await supabase
				.from("clients")
				.select("ficheNumber")
				.order("ficheNumber", { ascending: false })
				.limit(1)
				.single();

			if (maxFicheError) {
				Alert.alert("Erreur", "Erreur lors de la récupération du numéro de fiche.");
				setIsSubmitting(false);
				return;
			}

			const newFicheNumber = maxFicheData ? maxFicheData.ficheNumber + 1 : 6001;

			const { data: insertedData, error: insertError } = await supabase
				.from("clients")
				.insert([
					{
						name,
						phone,
						email: email || null,
						ficheNumber: newFicheNumber,
						createdAt: new Date().toISOString(),
					},
				])
				.select()
				.single();

			if (insertError || !insertedData) {
				Alert.alert("Erreur", "Erreur lors de l'insertion du nouveau client.");
				setIsSubmitting(false);
				return;
			}

			setName("");
			setPhone("");
			setEmail("");
			Keyboard.dismiss();
			navigation.navigate("AddIntervention", { clientId: insertedData.id });
		} catch (error) {
			Alert.alert("Erreur", "Une erreur inattendue est survenue.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleAddCommandeClient = async () => {
		if (!validateFields()) return;
		if (isSubmitting) return;
		setIsSubmitting(true);
		try {
			const { data: existingClients, error: checkError } = await supabase
				.from("clients")
				.select("id, name, phone")
				.eq("name", name)
				.eq("phone", phone);

			if (checkError) {
				Alert.alert("Erreur", "Erreur lors de la vérification.");
				setIsSubmitting(false);
				return;
			}

			if (existingClients.length > 0) {
				Alert.alert("Client existant", "Ce client existe déjà.");
				setIsSubmitting(false);
				return;
			}

			const { data: maxFicheData, error: maxFicheError } = await supabase
				.from("clients")
				.select("ficheNumber")
				.order("ficheNumber", { ascending: false })
				.limit(1)
				.single();

			if (maxFicheError) {
				Alert.alert("Erreur", "Erreur lors de la numérotation.");
				setIsSubmitting(false);
				return;
			}

			const newFicheNumber = maxFicheData ? maxFicheData.ficheNumber + 1 : 6001;

			const { data: insertedData, error: insertError } = await supabase
				.from("clients")
				.insert([
					{
						name,
						phone,
						email: email || null,
						ficheNumber: newFicheNumber,
						createdAt: new Date().toISOString(),
					},
				])
				.select()
				.single();

			if (insertError || !insertedData) {
				Alert.alert("Erreur", "Erreur lors de l'insertion.");
				setIsSubmitting(false);
				return;
			}

			setName("");
			setPhone("");
			setEmail("");
			Keyboard.dismiss();
			navigation.navigate("OrdersPage", {
				clientId: insertedData.id,
				clientName: insertedData.name,
				clientPhone: insertedData.phone,
				clientNumber: insertedData.ficheNumber, // 🔥 très important
			});
		} catch (error) {
			Alert.alert("Erreur", "Une erreur inattendue est survenue.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCloseAlert = () => {
		setAlertVisible(false);
		Keyboard.dismiss();
	};

    useEffect(() => {
        const unsubscribe = navigation.addListener("focus", () => {
            if (route.params?.reloadClients) {
                // Logique de rechargement si nécessaire
            }
        });
        return unsubscribe;
    }, [navigation, route.params]);

    return (
        <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={[styles.inputContainer, focusedField === "name" && styles.inputFocused]}>
                        <Image source={require("../assets/icons/person.png")} style={[styles.checkIcon]} />
                        <TextInput
                            style={styles.input}
                            placeholder="Nom du client"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="characters"
                            placeholderTextColor="#888787"
                            onFocus={() => setFocusedField("name")}
                            onBlur={() => setFocusedField(null)}
                        />
                    </View>
                    <View style={[styles.inputContainer, focusedField === "phone" && styles.inputFocused]}>
                        <Image source={require("../assets/icons/call.png")} style={[styles.checkIcon]} />
                        <TextInput
                            style={styles.input}
                            placeholder="Numéro de téléphone"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            placeholderTextColor="#888787"
                            onFocus={() => setFocusedField("phone")}
                            onBlur={() => setFocusedField(null)}
                        />
                    </View>
                    <View style={[styles.inputContainer, focusedField === "email" && styles.inputFocused]}>
                        <Image source={require("../assets/icons/mail.png")} style={[styles.checkIcon]} />
                        <TextInput
                            style={styles.input}
                            placeholder="Adresse e-mail (optionnel)"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            placeholderTextColor="#888787"
                            onFocus={() => setFocusedField("email")}
                            onBlur={() => setFocusedField(null)}
                        />
                    </View>
                    <TouchableOpacity style={styles.button} onPress={handleAddClient} disabled={loading || isSubmitting}>
                        <Text style={styles.buttonText}>{loading ? "En cours..." : "Enregistrer le client"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.button, { marginTop: 10 }]} onPress={handleAddCommandeClient} disabled={loading || isSubmitting}>
                        <Text style={styles.buttonText}>{loading ? "En cours..." : "Créer une commande"}</Text>
                    </TouchableOpacity>
                </View>
                <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={handleCloseAlert} />
            </View>
            <BottomNavigation navigation={navigation} currentRoute={route.name} />
        </ImageBackground>
    );
}

const styles = StyleSheet.create({
    backgroundImage: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    overlay: {
        flex: 1,
        width: "100%",
        justifyContent: "center",
        backgroundColor: "rgba(39, 39, 39, 0.308)",
    },
    container: {
        flex: 1,
        padding: 20,
        justifyContent: "center",
        backgroundColor: "rgba(255, 255, 255, 0)",
        borderRadius: 10,
        width: "100%",
    },
    inputContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 5,
        backgroundColor: "#191f2f",
        paddingHorizontal: 10,
        marginBottom: 15,
        height: 40,
        transition: "all 0.2s ease",
    },
    inputFocused: {
        borderColor: "#007bff",
        backgroundColor: "#29314f",
        height: 50,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: "#888787",
    },
    iconLeft: {
        marginLeft: 5,
        marginRight: 10,
    },
    button: {
        backgroundColor: "#191f2f",
        padding: 10,
        borderRadius: 2,
		borderWidth: 1,
		borderColor: "#888787",
        alignItems: "center",
        justifyContent: "center",
    },
    buttonText: {
        color: "#888787",
        fontSize: 16,
        fontWeight: "medium",
    },
    checkIcon: {
        width: 20,
        height: 20,
        tintColor: "#888787",
        marginRight: 10,
    },
});