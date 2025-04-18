import React, { useState, useEffect, useRef } from "react";
import {
    View,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Text,
    Image,
    Animated,
    Easing,
} from "react-native";
import { supabase } from "../supabaseClient"; // Import du client Supabase

import AlertBox from "../components/AlertBox"; // Import du composant AlertBox

import * as Print from "expo-print"; // Pour l'impression
export default function EditClientPage({ route, navigation }) {
    const { client } = route.params;
    // États pour gérer les informations du client
    const [name, setName] = useState(client.name || "");
    const [phone, setPhone] = useState(client.phone || "");
    const [email, setEmail] = useState(client.email || ""); // Ajoute l'état pour l'email
    const [etiquetteImprimee, setEtiquetteImprimee] = useState(false);

    const [interventions, setInterventions] = useState(
        client.interventions || []
    );
    const BlinkingIcon = ({ source }) => {
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
                    width: 28,
                    height: 28,
                    tintColor: "#f54242",
                    opacity,
                }}
            />
        );
    };
    // États pour gérer l'affichage de l'alerte
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState("");
    const [alertMessage, setAlertMessage] = useState("");
    const [onConfirmAction, setOnConfirmAction] = useState(null); // Ajout d'une fonction de confirmation

    // Fonction pour afficher l'alerte personnalisée
    const showAlert = (title, message, onConfirm = null) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setOnConfirmAction(() => onConfirm); // Stocke la fonction de confirmation
        setAlertVisible(true);
    };

    useEffect(() => {
        const unsubscribe = navigation.addListener("focus", loadClientData);
        return unsubscribe;
    }, [navigation]);

    const loadClientData = async () => {
        const { data, error } = await supabase
            .from("clients")
            .select(
                `
		*,
		interventions(
		  id,
		  status,
		  password,
		  deviceType,
		  brand,
		  model,
		  chargeur,
		  description,
		  cost,
		  solderestant,
		  createdAt,
		  updatedAt,
		  commande,
		  photos,
		  notifiedBy,
		  accept_screen_risk,
		  paymentStatus,
		  reference,
		  serial_number,
		  partialPayment,
		  devis_cost,
		  remarks,
		  imprimee,
		  print_etiquette
		)
	  `
            )
            .eq("id", client.id);

        if (error) {
            showAlert("Erreur", "Erreur lors du chargement du client");
            return;
        }

        if (data && data.length > 0) {
            const updatedClient = data[0];

            const filteredInterventions = updatedClient.interventions.filter(
                (intervention) => intervention.status !== "Récupéré"
            );

            setName(updatedClient.name);
            setPhone(updatedClient.phone);
            setInterventions(filteredInterventions || []);

            // ✅ Met à jour l’état local pour gérer le clignotement
            const anyNotPrinted = (filteredInterventions || []).some(
                (i) => !i.print_etiquette
            );
            setEtiquetteImprimee(!anyNotPrinted); // false = clignote
        }
    };

    const handleSaveClient = async () => {
        if (!name || !phone) {
            showAlert(
                "Erreur",
                "Le nom et le numéro de téléphone doivent être remplis."
            );
            return;
        }

        try {
            const { error } = await supabase
                .from("clients")
                .update({
                    name,
                    phone,
                    email: email || null,
                    updatedAt: new Date().toISOString(),
                }) // Inclure l'email
                .eq("id", client.id);

            if (error) throw error;

            showAlert("Succès", "Client modifié avec succès.");
            navigation.goBack();
        } catch (error) {
            showAlert("Erreur", "Erreur lors de la modification du client");
        }
    };

    const handleDeleteIntervention = (interventionId) => {
        showAlert(
            "Confirmer la suppression",
            "Êtes-vous sûr de vouloir supprimer cette intervention ?",
            async () => {
                try {
                    const { error } = await supabase
                        .from("interventions")
                        .delete()
                        .eq("id", interventionId);

                    if (error) throw error;

                    loadClientData(); // Recharger les interventions après suppression
                    showAlert("Succès", "Intervention supprimée avec succès.");
                } catch (error) {
                    showAlert(
                        "Erreur",
                        "Erreur lors de la suppression de l'intervention"
                    );
                }
            }
        );
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case "En attente de pièces":
                return { borderColor: "#270381", borderWidth: 4 }; // Violet
            case "Devis accepté":
                return { borderColor: "#FFD700", borderWidth: 4 }; // Jaune
            case "Réparation en cours":
                return { borderColor: "#528fe0", borderWidth: 4 }; // Orange
            case "Réparé":
                return { borderColor: "#98fb98", borderWidth: 4 }; // Vert clair
            case "Non réparable":
                return { borderColor: "#e9967a", borderWidth: 4 }; // Rouge clair
            case "Devis en cours":
                return { borderColor: "#f37209", borderWidth: 4 }; // Orange
            default:
                return { borderColor: "#e0e0e0", borderWidth: 4 }; // Grise par défaut
        }
    };
    function formatWithSpaces(value) {
        const str = value.toString();
        return str.replace(/(\d{2})(?=\d)/g, "$1 ");
    }

    const formattedPhone = formatWithSpaces(phone);
    function formatDateFR(dateString) {
        if (!dateString) return "Date inconnue";
        return new Date(dateString).toLocaleDateString("fr-FR");
    }

    const handlePrint = async () => {
        try {
            for (const intervention of interventions) {
                const htmlContent = `
		  <html>
			<head>
			  <style>
				body {
				  width: 62mm;
				  font-family: Arial, sans-serif;
				  margin: 0;
				  padding: 2px;
				  font-size: 10px;
				  box-sizing: border-box;
				}
				p {
				  margin: 0;
				  line-height: 1.2;
				}
				.label-section {
				  display: flex;
				  justify-content: space-between;
				  margin-bottom: 5px;
				}
				.bold {
				  font-weight: bold;
				}
				.small-text {
				  font-size: 11px;
				}
			  </style>
			</head>
			<body>
			  <div class="label-section">
				<p class="bold">Numéro Client :</p>
				<p>${client.ficheNumber}</p>
			  </div>
			  <div class="label-section">
				<p class="bold">Nom :</p>
				<p>${name}</p>
			  </div>
			  <div class="label-section">
				<p class="bold">Téléphone :</p>
				<p>${formatWithSpaces(phone)}</p>
			  </div>
			  <div class="label-section">
				<p class="bold">Mot de passe :</p>
				<p>${intervention.password || "N/A"}</p>
			  </div>
			  <div class="label-section">
				<p class="bold">Marque :</p>
				<p>${intervention.brand}</p>
			  </div>
			  <div class="label-section">
				<p class="bold">Modèle :</p>
				<p>${intervention.model}</p>
			  </div>
			  <div class="label-section">
				<p class="bold">Description :</p>
				<p>${intervention.description || "N/A"}</p>
			  </div>
			  <div class="label-section">
				<p class="bold">Coût :</p>
				<p>${intervention.cost || "0"} €</p>
			  </div>
			  <div class="label-section">
				<p class="bold">Chargeur :</p>
				<p>${intervention.chargeur ? "Oui" : "Non"}</p>
			  </div>
				<div class="label-section">
				<p class="bold">Date :</p>
				<p>${formatDateFR(intervention?.createdAt)}</p>
				</div>
			</body>
		  </html>
		`;

                await Print.printAsync({ html: htmlContent });

                // ✅ Marque cette intervention comme imprimée (étiquette)
                if (!intervention.print_etiquette) {
                    await supabase
                        .from("interventions")
                        .update({ print_etiquette: true })
                        .eq("id", intervention.id);
                }
            }

            // Recharge les données pour mettre à jour les états
            await loadClientData();
        } catch (error) {
            console.error("Erreur lors de l'impression :", error);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Interventions</Text>
            <TextInput
                style={styles.input}
                value={name}
                onChangeText={(text) => setName(text.toUpperCase())} // Convertit en majuscules à chaque changement
                autoCapitalize="characters" // Force les majuscules lors de la saisie
            />

            <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
            />
            <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                placeholderTextColor="#888787"
                placeholder="Adresse e-mail (optionnel)"
            />

            {interventions.length > 0 ? (
                <FlatList
                    data={interventions}
                    keyExtractor={(item, idx) => idx.toString()}
                    renderItem={({ item, index }) => (
                        <TouchableOpacity
                            style={[
                                styles.interventionCard,
                                getStatusStyle(item.status),
                            ]}
                            onPress={() =>
                                navigation.navigate("EditIntervention", {
                                    clientId: client.id,
                                    interventionId: item.id,
                                })
                            }
                        >
                            <Text style={styles.interventionText}>
                                Intervention N° {index + 1}
                            </Text>
                            <Text style={styles.interventionText}>
                                Type d'appareil: {item.deviceType || "Non renseignée"}
                            </Text>
                            <Text style={styles.interventionText}>
                                Marque: {item.brand || "Non renseignée"}
                            </Text>
                            <Text style={styles.interventionText}>
                                Modèle: {item.model || "Non renseignée"}
                            </Text>
                            {item.serial_number && (
                                <Text style={styles.interventionText}>
                                    Numéro de série: {item.serial_number}
                                </Text>
                            )}
                            <Text style={styles.interventionText}>
                                Référence: {item.reference || "Non renseignée"}
                            </Text>
							<Text style={styles.interventionText}>
							Description de l'intervention : {item.description || "Aucune description"}
							</Text>
                            {item.cost && (
                                <Text style={styles.interventionText}>
                                    Coût total: {item.cost} €
                                </Text>
                            )}
                            <Text style={styles.interventionText}>
                                Etat du règlement: {item.paymentStatus || "Non précisé"}
                            </Text>
                            {item.paymentStatus === "reglement_partiel" &&
                                item.partialPayment && (
                                    <Text style={styles.interventionText}>
                                        Acompte de: {item.partialPayment} €
                                    </Text>
                                )}
                            {item.solderestant && (
                                <Text style={styles.interventionTextReste}>
                                    Montant restant dû: {item.solderestant}€
                                </Text>
                            )}
                            <Text style={styles.interventionText}>
                                Statut: {item.status || "Inconnu"}
                            </Text>
                            <Text style={styles.interventionText}>
                                Montant du devis: {item.devis_cost} €
                            </Text>

                            <Text style={styles.interventionText}>
                                Remarques: {item.remarks || "Aucune"}
                            </Text>

                            {item.accept_screen_risk && (
                                <Text style={styles.acceptText}>
                                    Acceptation du risque de casse écran : Oui
                                </Text>
                            )}
                            {item.password && (
                                <Text style={styles.interventionText}>
                                    Mdp: {item.password}
                                </Text>
                            )}
                            <Text style={styles.interventionText}>
                                Date:{" "}
                                {new Date(item.createdAt).toLocaleDateString(
                                    "fr-FR"
                                )}
                            </Text>
                            <Text style={styles.interventionText}>
                                Chargeur: {item.chargeur ? "Oui" : "Non"}
                            </Text>

                            {item.status === "En attente de pièces" && (
                                <>
                                    <Text style={styles.interventionText}>
                                        Produit en commande: {item.commande || "Non précisé"}
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.commandeRecuButton}
                                        onPress={() => {
                                            // Afficher une alerte de confirmation avant de mettre à jour le statut
                                            showAlert(
                                                "Confirmer la réception de la commande",
                                                'Êtes-vous sûr de vouloir passer le statut à "Réparation en cours" ?',
                                                async () => {
                                                    try {
                                                        const { error } =
                                                            await supabase
                                                                .from(
                                                                    "interventions"
                                                                )
                                                                .update({
                                                                    status: "Réparation en cours",
                                                                })
                                                                .eq(
                                                                    "id",
                                                                    item.id
                                                                );

                                                        if (error) {
                                                            console.error(
                                                                "Erreur lors de la mise à jour du statut",
                                                                error
                                                            );
                                                            return;
                                                        }

                                                        // Met à jour le statut localement pour qu'il change immédiatement dans l'UI
                                                        const updatedInterventions =
                                                            interventions.map(
                                                                (
                                                                    intervention
                                                                ) =>
                                                                    intervention.id ===
                                                                    item.id
                                                                        ? {
                                                                              ...intervention,
                                                                              status: "Réparation en cours",
                                                                          }
                                                                        : intervention
                                                            );
                                                        setInterventions(
                                                            updatedInterventions
                                                        );

                                                        // Afficher une alerte de succès après confirmation
                                                        showAlert(
                                                            "Succès",
                                                            'Statut mis à jour à "Réparation en cours".'
                                                        );
                                                    } catch (error) {
                                                        console.error(
                                                            "Erreur lors de la mise à jour du statut",
                                                            error
                                                        );
                                                    }
                                                }
                                            );
                                        }}
                                    >
                                        <Text
                                            style={
                                                styles.commandeRecuButtonText
                                            }
                                        >
                                            Commande reçue
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            )}
                            <TouchableOpacity
                                style={styles.trashButton}
                                onPress={() =>
                                    handleDeleteIntervention(item.id)
                                }
                            >
                                <Image
                                    source={require("../assets/icons/trash.png")} // Chemin vers votre icône de suppression
                                    style={{
                                        width: 24, // Largeur de l'image
                                        height: 24, // Hauteur de l'image
                                        tintColor: "#ff0000", // Couleur de l'image (noir ici)
                                    }}
                                />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.printButton}
                                onPress={handlePrint}
                            >
                                {!etiquetteImprimee ? (
                                    <BlinkingIcon
                                        source={require("../assets/icons/print.png")}
                                    />
                                ) : (
                                    <Image
                                        source={require("../assets/icons/print.png")}
                                        style={{
                                            width: 28,
                                            height: 28,
                                            tintColor: "#888787",
                                        }}
                                    />
                                )}
                            </TouchableOpacity>
                        </TouchableOpacity>
                    )}
                />
            ) : (
                <Text style={styles.buttonText}>
                    Aucune intervention trouvée.
                </Text>
            )}

            <View style={styles.buttonContainer}>
                <TouchableOpacity
                    style={[styles.iconButton, styles.addButton]}
                    onPress={() =>
                        navigation.navigate("AddIntervention", {
                            clientId: client.id,
                        })
                    }
                >
                    <Image
                        source={require("../assets/icons/plus.png")} // Chemin vers votre image
                        style={{
                            width: 20, // Largeur de l'image
                            height: 20, // Hauteur de l'image
                            tintColor: "#888787", // Couleur de l'image
                            marginRight: 10,
                        }}
                    />
                    <Text style={styles.buttonText}>
                        Ajouter une intervention
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.iconButton, styles.addButton]}
                    onPress={handleSaveClient}
                >
                    <Image
                        source={require("../assets/icons/save.png")} // Chemin vers votre image
                        style={{
                            width: 20, // Largeur de l'image
                            height: 20, // Hauteur de l'image
                            tintColor: "#888787", // Couleur de l'image
                            marginRight: 10,
                        }}
                    />
                    <Text style={styles.buttonText}>Sauvegarder</Text>
                </TouchableOpacity>
            </View>

            <AlertBox
                visible={alertVisible}
                title={alertTitle}
                message={alertMessage}
                confirmText="Confirmer"
                cancelText="Annuler"
                onConfirm={() => {
                    setAlertVisible(false);
                    if (onConfirmAction) onConfirmAction();
                }}
                onClose={() => setAlertVisible(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
        backgroundColor: "#191f2f",
    },
    title: {
        fontSize: 24,
        fontWeight: "medium",
        marginBottom: 20,
        textAlign: "center",
        color: "#888787",
        marginTop: 5,
    },
    input: {
        borderWidth: 1,
        borderColor: "#888787",
        padding: 10,
        marginBottom: 20,
        borderRadius: 2,
        backgroundColor: "#191f2f",
        fontSize: 16,
        color: "#888787",
    },
    interventionCard: {
        padding: 15,
        marginBottom: 10,
        borderRadius: 4,
        backgroundColor: "#191f2f", // Fond blanc
        borderWidth: 1, // Épaisseur de la bordure
    },
    interventionInfo: {
        flex: 1,
    },
    interventionText: {
        fontSize: 16,
        color: "#888787",
        marginBottom: 5, // Ajoute un espacement entre les lignes
    },
    interventionTextReste: {
        fontSize: 16,
        color: "#888787",
        marginBottom: 5, // Ajoute un espacement entre les lignes
    },
    addButton: {
        backgroundColor: "#191f2f",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderWidth: 1,
        borderColor: "#888787",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
    },
    addButtonText: {
        color: "#888787",
        fontSize: 16,
        fontWeight: "medium",
    },
    saveButton: {
        backgroundColor: "#0c0f18",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderWidth: 1,
        borderColor: "#888787",
        alignItems: "center",
        justifyContent: "center",
    },
    saveButtonText: {
        color: "#888787",
        fontSize: 16,
        fontWeight: "medium",
    },
    trashButton: {
        //backgroundColor: '#dc3545',
        width: 40,
        height: 40,
        borderRadius: 2,
        justifyContent: "center",
        alignItems: "center",
        position: "absolute",
        top: 10,
        right: 10,
        borderColor: "#888787", // Couleur de la bordure (noire)
        borderWidth: 1, // Épaisseur de la bordure
    },
    printButton: {
        width: 70,
        height: 70,
        borderWidth: 4,
        borderColor: "#07a252",
        position: "absolute",
        bottom: 20, // En bas de la page
        right: 20, // À droite de la page
        backgroundColor: "#191f2f",
        padding: 15,
        borderRadius: 5, // Rond pour l'icône
        alignItems: "center",
        justifyContent: "center",
    },
    buttonContainer: {
        flexDirection: "row", // Positionne les boutons côte à côte
        justifyContent: "space-between", // Espace entre les boutons
        marginTop: 20,
    },
    iconButton: {
        flexDirection: "row", // Positionne l'icône et le texte côte à côte
        alignItems: "center",
        backgroundColor: "#191f2f",
        borderWidth: 1,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 2,
        borderColor: "#888787",
        justifyContent: "center",
        flex: 1, // Prend 50% de la largeur (car il y a 2 boutons)
        marginHorizontal: 5, // Un petit espace entre les deux boutons
    },
    addButton: {
        backgroundColor: "#0c0f18", // Vert pour le bouton "Ajouter"
    },
    buttonIcon: {
        marginRight: 10, // Espace entre l'icône et le texte
    },
    buttonText: {
        color: "#888787",
        fontSize: 16,
        fontWeight: "medium",
    },
    commandeRecuButton: {
        backgroundColor: "#39466b", // Vert pour indiquer que la commande est reçue
        padding: 10,
        borderRadius: 5,
        marginTop: 10,
    },
    commandeRecuButtonText: {
        color: "#888787",
        fontWeight: "medium",
        textAlign: "center",
    },
    editButton: {
        backgroundColor: "#191f2f", // Bleu pour l'icône d'édition
        padding: 10,
        borderRadius: 2,
        marginRight: 10,
    },
    acceptText: {
        fontSize: 16,
        color: "#ff4500", // Rouge orangé pour attirer l'attention
        fontWeight: "bmedium",
    },
});
