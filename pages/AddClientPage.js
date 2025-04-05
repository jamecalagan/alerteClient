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
import CustomAlert from "../components/CustomAlert"; // Import du composant CustomAlert
import BottomNavigation from "../components/BottomNavigation";

export default function AddClientPage({ navigation, route }) {
    // Import de l'image depuis le dossier assets
    const backgroundImage = require("../assets/listing2.jpg");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState(""); // Ajout de l'email
    const [loading, setLoading] = useState(false); // Gestion de l'état de chargement

    const [alertVisible, setAlertVisible] = useState(false); // État pour gérer la visibilité de CustomAlert
    const [alertMessage, setAlertMessage] = useState(""); // Message de CustomAlert
    const [alertTitle, setAlertTitle] = useState(""); // Titre de CustomAlert

    const validateFields = () => {
        if (!name || !phone) {
            setAlertTitle("Erreur");
            setAlertMessage(
                "Le nom et le numéro de téléphone doivent être remplis."
            );
            setAlertVisible(true);
            return false;
        }
        return true;
    };

	const handleAddClient = async () => {
		if (!validateFields()) return;
	
		try {
			// 🔹 Vérifier si un client avec le même NOM et le même TÉLÉPHONE existe
			const { data: existingClients, error: checkError } = await supabase
				.from("clients")
				.select("id, name, phone") // 🔥 Sélectionner uniquement ce dont on a besoin
				.eq("name", name)
				.eq("phone", phone);
	
			console.log("👀 Clients existants trouvés :", existingClients);
	
			if (checkError) {
				console.error("❌ Erreur lors de la vérification des clients :", checkError.message);
				Alert.alert("Erreur", "Erreur lors de la vérification des clients existants.");
				return;
			}
	
			if (existingClients.length > 0) {
				// ✅ Uniquement si le NOM et le TÉLÉPHONE existent ensemble
				Alert.alert(
					"Client existant",
					`Un client avec ce nom et ce numéro de téléphone existe déjà.`
				);
				return;
			}
	
			// 🔹 Récupérer le dernier numéro de fiche
			const { data: maxFicheData, error: maxFicheError } = await supabase
				.from("clients")
				.select("ficheNumber")
				.order("ficheNumber", { ascending: false })
				.limit(1)
				.single();
	
			if (maxFicheError) {
				console.error("❌ Erreur lors de la récupération du numéro de fiche :", maxFicheError.message);
				Alert.alert("Erreur", "Erreur lors de la récupération du numéro de fiche.");
				return;
			}
	
			const newFicheNumber = maxFicheData ? maxFicheData.ficheNumber + 1 : 6001;
	
			// 🔹 Insérer un nouveau client
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
	
			if (insertError) {
				console.error("❌ Erreur lors de l'insertion du client :", insertError.message);
				Alert.alert("Erreur", "Erreur lors de l'insertion du nouveau client.");
				return;
			}
	
			if (!insertedData) {
				console.error("❌ Erreur : Aucune donnée insérée.");
				Alert.alert("Erreur", "Aucune donnée reçue après l'insertion.");
				return;
			}
	
			// 🔹 Réinitialiser les champs et naviguer vers AddIntervention
			setName("");
			setPhone("");
			setEmail("");
			Keyboard.dismiss();
			navigation.navigate("AddIntervention", {
				clientId: insertedData.id,
			});
	
		} catch (error) {
			console.error("❌ Erreur inattendue :", error.message);
			Alert.alert("Erreur", "Une erreur inattendue est survenue.");
		}
	};
	
	const handleAddCommandeClient = async () => {
		if (!validateFields()) return;
	
		try {
			const { data: existingClients, error: checkError } = await supabase
				.from("clients")
				.select("id, name, phone")
				.eq("name", name)
				.eq("phone", phone);
	
			if (checkError) {
				Alert.alert("Erreur", "Erreur lors de la vérification.");
				return;
			}
	
			if (existingClients.length > 0) {
				Alert.alert("Client existant", "Ce client existe déjà.");
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
				return;
			}
	
			setName("");
			setPhone("");
			setEmail("");
			Keyboard.dismiss();
	
			// Redirection vers la page de commande au lieu d'intervention
			navigation.navigate("OrdersPage", {
				clientId: insertedData.id,
			});
	
		} catch (error) {
			console.error("Erreur inattendue :", error.message);
			Alert.alert("Erreur", "Une erreur inattendue est survenue.");
		}
	};
	

    const handleCloseAlert = () => {
        // Fermer l'alerte et ensuite naviguer vers la page Home
        setAlertVisible(false);
        Keyboard.dismiss();
        setTimeout(() => {
            navigation.navigate("AddIntervention", { clientId: data.id });
        }, 100); // Délai de 100ms
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
        <ImageBackground
            source={backgroundImage}
            style={styles.backgroundImage}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                 
                    <View style={styles.inputContainer}>
                        <Image
                            source={require("../assets/icons/person.png")} // Chemin vers votre image
                            style={[
                                styles.checkIcon,
                                {
                                    width: 20,
                                    height: 20,
                                    tintColor: "#888787",
                                    marginRight: 10,
                                },
                            ]} // Personnalisation de l'image
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Nom du client"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="characters"
                            placeholderTextColor="#888787"
                        />
                    </View>

                 
                    <View style={styles.inputContainer}>
                        <Image
                            source={require("../assets/icons/call.png")} // Chemin vers votre image
                            style={[
                                styles.checkIcon,
                                {
                                    width: 20,
                                    height: 20,
                                    tintColor: "#888787",
                                    marginRight: 10,
                                },
                            ]} // Personnalisation de l'image
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Numéro de téléphone"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            placeholderTextColor="#888787"
                        />
                    </View>

                 
                    <View style={styles.inputContainer}>
                        <Image
                            source={require("../assets/icons/mail.png")} // Chemin vers votre image
                            style={[
                                styles.checkIcon,
                                {
                                    width: 20,
                                    height: 20,
                                    tintColor: "#888787",
                                    marginRight: 10,
                                },
                            ]} // Personnalisation de l'image
                        />
                        <TextInput
                            style={styles.input}
                            placeholder="Adresse e-mail (optionnel)"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            placeholderTextColor="#888787"
                        />
                    </View>
					
                
					<TouchableOpacity 
    style={styles.button} 
    onPress={handleAddClient} 
    disabled={loading}
>
    <Text style={styles.buttonText}>
        {loading ? "En cours..." : "Enregistrer le client"}
    </Text>
</TouchableOpacity>
<TouchableOpacity 
    style={[styles.button, { marginTop: 10 }]} 
    onPress={handleAddCommandeClient} 
    disabled={loading}
>
    <Text style={styles.buttonText}>
        {loading ? "En cours..." : "Créer une commande"}
    </Text>
</TouchableOpacity>

                </View>
				


                <CustomAlert
                    visible={alertVisible}
                    title={alertTitle}
                    message={alertMessage}
                    onClose={handleCloseAlert} // Utilise handleCloseAlert pour naviguer après fermeture
                />
            </View>
			<BottomNavigation  navigation={navigation} currentRoute={route.name} />
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
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: "#888787",
    },
    iconLeft: {
        marginLeft: 5,
        marginRight: 10, // Espacement entre le champ et l'icône
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
    }
});
