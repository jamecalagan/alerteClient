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
import { LayoutAnimation, Platform, UIManager } from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AddClientPage({ navigation, route }) {
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
<View style={styles.screen}>
    <View style={styles.container}>
        <Text style={styles.title}>Ajouter un client</Text>

        {/* Champs */}
        <View style={[styles.inputContainer, focusedField === "name" && styles.inputFocused]}>
            <Image source={require("../assets/icons/person.png")} style={styles.checkIcon} />
            <TextInput
                style={styles.input}
                placeholder="Nom du client"
                value={name}
                onChangeText={setName}
                autoCapitalize="characters"
                placeholderTextColor="#888787"
                onFocus={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setFocusedField("name");
                }}
                onBlur={() => setFocusedField(null)}
            />
        </View>

        <View style={[styles.inputContainer, focusedField === "phone" && styles.inputFocused]}>
            <Image source={require("../assets/icons/call.png")} style={styles.checkIcon} />
            <TextInput
                style={styles.input}
                placeholder="Numéro de téléphone"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholderTextColor="#888787"
                onFocus={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setFocusedField("phone");
                }}
                onBlur={() => setFocusedField(null)}
            />
        </View>

        <View style={[styles.inputContainer, focusedField === "email" && styles.inputFocused]}>
            <Image source={require("../assets/icons/mail.png")} style={styles.checkIcon} />
            <TextInput
                style={styles.input}
                placeholder="Adresse e-mail (optionnel)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                placeholderTextColor="#888787"
                onFocus={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setFocusedField("email");
                }}
                onBlur={() => setFocusedField(null)}
            />
        </View>

        {/* Boutons */}
        <TouchableOpacity style={styles.button} onPress={handleAddClient} disabled={loading || isSubmitting}>
            <Text style={styles.buttonText}>{loading ? "En cours..." : "Enregistrer le client"}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleAddCommandeClient} disabled={loading || isSubmitting}>
            <Text style={styles.buttonText}>{loading ? "En cours..." : "Créer une commande"}</Text>
        </TouchableOpacity>

        <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={handleCloseAlert} />
    </View>

    <BottomNavigation navigation={navigation} currentRoute={route.name} />
</View>

    );
}

const styles = StyleSheet.create({
	title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#383838",
    textAlign: "center",
    marginBottom: 30,
    textTransform: "uppercase",
    letterSpacing: 1,
},
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
screen: {
    flex: 1,
    backgroundColor: "#e0e0e0", // fond sombre propre
},
container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
},
inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#585858",
    borderRadius: 8,
    backgroundColor: "#cacaca",
    paddingHorizontal: 10,
    marginBottom: 15,
    height: 45,
},
inputFocused: {
    borderColor: "#242424",
    backgroundColor: "#ffffff",
    height: 60,
},
input: {
    flex: 1,
    fontSize: 18,
    color: "#242424",
    paddingVertical: 8,
},

    iconLeft: {
        marginLeft: 5,
        marginRight: 10,
    },
button: {
    backgroundColor: "#0c0f18",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#242424",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
    marginVertical: 5,
},
buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 0.5,
},

    checkIcon: {
        width: 20,
        height: 20,
        tintColor: "#888787",
        marginRight: 10,
    },
});