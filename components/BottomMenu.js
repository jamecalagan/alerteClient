import React from "react";
import { View, Text, TouchableOpacity, Image, StyleSheet, Alert } from "react-native";

export default function BottomMenu({ navigation, filterByStatus, resetFilter }) {
    const getIconColor = (status) => {
        switch (status) {
            case "En attente de pièces":
                return "#b396f8"; // Violet
            case "Devis accepté":
                return "#FFD700"; // Doré
            case "Réparation en cours":
                return "#528fe0"; // Bleu
            case "Réparé":
                return "#037903"; // Vert
            case "Devis en cours":
                return "#f37209"; // Orange
			case "Non réparable":
				return "#ff0000"; // Orange
				case "Réinitialiser":
					return "#ff9100"; // Orange
				case "Restitués":
					return "#2eee37"; // Orange
				case "Admin":
					return "#a0a3a0"; // Orange
					case "Ajouter":
						return "#22a0f3"; // Orange	
            default:
                return "#555"; // Gris par défaut
        }
    };

    return (
        <View style={styles.bottomMenuContainer}>
                    
					<View style={styles.filterRow}>
                <TouchableOpacity
                    style={styles.filterItem}
                    onPress={() => filterByStatus("En attente de pièces")}
                >
                    <Image
                        source={require("../assets/icons/shipping.png")}
                        style={[
                            styles.icon,
                            { tintColor: getIconColor("En attente de pièces") },
                        ]}
                    />
                    <Text style={styles.filterText}>Commande</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.filterItem}
                    onPress={() => filterByStatus("Devis en cours")}
                >
                    <Image
                        source={require("../assets/icons/devisEnCours.png")}
                        style={[
                            styles.icon,
                            { tintColor: getIconColor("Devis en cours") },
                        ]}
                    />
                    <Text style={styles.filterText}>Devis</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.filterItem}
                    onPress={() => filterByStatus("Devis accepté")}
                >
                    <Image
                        source={require("../assets/icons/devisAccepte.png")}
                        style={[
                            styles.icon,
                            { tintColor: getIconColor("Devis accepté") },
                        ]}
                    />
                    <Text style={styles.filterText}>Devis OK</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.filterItem}
                    onPress={() => filterByStatus("Réparation en cours")}
                >
                    <Image
                        source={require("../assets/icons/tools1.png")}
                        style={[
                            styles.icon,
                            { tintColor: getIconColor("Réparation en cours") },
                        ]}
                    />
                    <Text style={styles.filterText}>En réparation</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.filterItem}
                    onPress={() => filterByStatus("Non réparable")}
                >
                    <Image
                        source={require("../assets/icons/no.png")}
						style={[
                            styles.icon,
                            { tintColor: getIconColor("Non réparable") },
                        ]}
                    />
                    <Text style={styles.filterText}>Non réparable</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.filterItem}
                    onPress={resetFilter}
                >
                    <Image
                        source={require("../assets/icons/reload.png")}
                        style={[
                            styles.icon,
                            { tintColor: getIconColor("Réinitialiser") },
                        ]}
                    />
                    <Text style={styles.filterText}>Réinitialiser</Text>
                </TouchableOpacity>
            </View>
			<View style={styles.separator} />
			
            <View style={styles.navigationRow}>
                <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => navigation.navigate("Home")}
                >
                    <Image
                        source={require("../assets/icons/home.png")}
                        style={styles.icon}
                    />
                    <Text style={styles.menuText}>Accueil</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => navigation.navigate("AddClient")}
                >
                    <Image
                        source={require("../assets/icons/add.png")}
						style={[
                            styles.icon,
                            { tintColor: getIconColor("Ajouter") },
                        ]}
                    />
                    <Text style={styles.menuText}>Ajouter</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => navigation.navigate("RepairedInterventions")}
                >
                    <Image
                        source={require("../assets/icons/finished.png")}
						style={[
                            styles.icon,
                            { tintColor: getIconColor("Réparé") },
                        ]}
                    />
                    <Text style={styles.menuText}>Réparés</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => navigation.navigate("RecoveredClients")}
                >
                    <Image
                        source={require("../assets/icons/restitue.png")}
						style={[
                            styles.icon,
                            { tintColor: getIconColor("Restitués") },
                        ]}
                    />
                    <Text style={styles.menuText}>Restitués</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => navigation.navigate("Admin")}
                >
                    <Image
                        source={require("../assets/icons/Config.png")}
						style={[
                            styles.icon,
                            { tintColor: getIconColor("Admin") },
                        ]}
                    />
                    <Text style={styles.menuText}>Admin</Text>
                </TouchableOpacity>

				<TouchableOpacity
                    style={styles.menuItem}
                    onPress={() =>
                        Alert.alert(
                            "Confirmation",
                            "Êtes-vous sûr de vouloir vous déconnecter ?",
                            [
                                { text: "Annuler", style: "cancel" },
                                {
                                    text: "Déconnexion",
                                    onPress: async () => {
                                        await handleLogout();
                                    },
                                    style: "destructive",
                                },
                            ]
                        )
                    }
                >
                    <Image
                        source={require("../assets/icons/disconnects.png")}
                        style={[
                            styles.icon,
                            { tintColor: "red" }, // Toujours rouge pour déconnexion
                        ]}
                    />
                    <Text style={styles.menuText}>Déconnexion</Text>
                </TouchableOpacity>
            </View>
			

        </View>
    );
}

const styles = StyleSheet.create({
    bottomMenuContainer: {
        position: "absolute",
        bottom: 0,
        width: "100%",
        backgroundColor: "#1f3750",
        paddingVertical: 10,
		paddingBottom: 10,
		borderRadius: 5,
    },
    navigationRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginBottom: 10,
    },
    filterRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginTop: 10,
    },
    menuItem: {
        alignItems: "center",
    },
    filterItem: {
        alignItems: "center",
    },
    icon: {
        width: 30,
        height: 30,
        tintColor: "white", // Couleur par défaut
    },
    menuText: {
        color: "white",
        fontSize: 12,
        marginTop: 5,
    },
    filterText: {
        color: "white",
        fontSize: 12,
        marginTop: 5,
    },
	separator: {
    height: 1,
    backgroundColor: '#ccc', // Couleur de la ligne
    marginVertical: 10, // Espacement autour de la ligne
},
});
