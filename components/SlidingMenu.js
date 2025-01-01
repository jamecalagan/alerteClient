import React from "react";
import {
  Animated,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  StyleSheet,
  View,
} from "react-native";

export default function SlidingMenu({
  slideAnim,
  toggleMenu,
  navigation,
  filterByStatus,
  resetFilter,
  handleLogout,
}) {
  const getIconColor = (status) => {
    // Exemple de logique pour colorer les icônes en fonction du statut
    switch (status) {
      case "En attente de pièces":
        return "orange";
      case "Devis accepté":
        return "green";
      case "Réparation en cours":
        return "blue";
      case "Devis en cours":
        return "purple";
      default:
        return "gray";
    }
  };

  return (
   					<Animated.View
	   style={[
		   styles.drawer,
		   { transform: [{ translateX: slideAnim }] },
	   ]}
   >
	   <Text style={styles.drawerTitle}>Menu</Text>
   
	   {/* Liens de navigation */}
	   <Text style={styles.sectionTitle}>Navigation</Text>
   
	   {/* Accueil */}
	   <TouchableOpacity
		   style={styles.drawerItem}
		   onPress={() => {
			   toggleMenu(); // Ferme le menu
			   navigation.navigate("Home"); // Navigue vers l'écran "Accueil"
		   }}
	   >
		   <Image
			   source={require("../assets/icons/home.png")} // Icône pour "Accueil"
			   style={[
				   styles.drawerItemIcon,
				   {
					   tintColor: navigation.getState().index === 0 ? "blue" : "gray", // Couleur dynamique des icônes
				   },
			   ]}
		   />
		   <Text style={styles.drawerItemText}>ACCUEIL</Text>
	   </TouchableOpacity>
   
	   {/* Ajouter Client */}
	   <TouchableOpacity
		   style={styles.drawerItem}
		   onPress={() => {
			   toggleMenu();
			   navigation.navigate("AddClient"); // Navigue vers "Ajouter Client"
		   }}
	   >
		   <Image
			   source={require("../assets/icons/add.png")} // Icône pour "Ajouter Client"
			   style={[
				   styles.drawerItemIcon,
				   {
					   tintColor: navigation.getState().index === 1 ? "blue" : "gray", // Couleur dynamique des icônes
				   },
			   ]}
		   />
		   <Text style={styles.drawerItemText}>AJOUTER CLIENT</Text>
	   </TouchableOpacity>
   
	   {/* Réparé */}
	   <TouchableOpacity
		   style={styles.drawerItem}
		   onPress={() => {
			   toggleMenu();
			   navigation.navigate("RepairedInterventions"); // Navigue vers "Réparé"
		   }}
	   >
		   <Image
			   source={require("../assets/icons/tools1.png")} // Icône pour "Réparé"
			   style={[
				   styles.drawerItemIcon,
				   {
					   tintColor: navigation.getState().index === 2 ? "blue" : "gray", // Couleur dynamique des icônes
				   },
			   ]}
		   />
		   <Text style={styles.drawerItemText}>RÉPARÉS</Text>
	   </TouchableOpacity>
	   {/* Réparé */}
	   <TouchableOpacity
		   style={styles.drawerItem}
		   onPress={() => {
			   toggleMenu();
			   navigation.navigate("RecoveredClients"); // Navigue vers "Réparé"
		   }}
	   >
		   <Image
			   source={require("../assets/icons/ok.png")} // Icône pour "Réparé"
			   style={[
				   styles.drawerItemIcon,
				   {
					   tintColor: navigation.getState().index === 2 ? "blue" : "gray", // Couleur dynamique des icônes
				   },
			   ]}
		   />
		   <Text style={styles.drawerItemText}>RESTITUÉS</Text>
	   </TouchableOpacity>
	   {/* Administration */}
	   <TouchableOpacity
		   style={styles.drawerItem}
		   onPress={() => {
			   toggleMenu();
			   navigation.navigate("Admin"); // Navigue vers "Administration"
		   }}
	   >
		   <Image
			   source={require("../assets/icons/Config.png")} // Icône pour "Administration"
			   style={[
				   styles.drawerItemIcon,
				   {
					   tintColor: navigation.getState().index === 3 ? "blue" : "gray", // Couleur dynamique des icônes
				   },
			   ]}
		   />
		   <Text style={styles.drawerItemText}>ADMINISTRATION</Text>
	   </TouchableOpacity>
   
	   {/* Déconnexion */}
	   <TouchableOpacity
		   style={styles.drawerItem}
		   onPress={() => {
			   Alert.alert(
				   "Confirmation",
				   "Êtes-vous sûr de vouloir vous déconnecter ?",
				   [
					   { text: "Annuler", style: "cancel" },
					   {
						   text: "Déconnexion",
						   onPress: async () => {
							   toggleMenu();
							   await handleLogout();
						   },
						   style: "destructive",
					   },
				   ],
				   { cancelable: true }
			   );
		   }}
	   >
		   <Image
			   source={require("../assets/icons/disconnects.png")} // Icône pour déconnexion
			   style={[
				   styles.drawerItemIcon,
				   { tintColor: "red" }, // Toujours rouge pour la déconnexion
			   ]}
		   />
		   <Text style={styles.drawerItemText}>DÉCONNEXION</Text>
	   </TouchableOpacity>
   
						   {/* Filtres ou actions spécifiques */}
						   <Text style={styles.sectionTitle}>Filtres</Text>
						   <TouchableOpacity
							   style={styles.drawerItem}
							   onPress={() => {
								   toggleMenu(); // Ferme le menu
								   filterByStatus("En attente de pièces");
							   }}
						   >
							   <Image
								   source={require("../assets/icons/shipping.png")} // Icône pour "En attente de pièces"
								   style={[
									   styles.drawerItemIcon,
									   {
										   tintColor: getIconColor(
											   "En attente de pièces"
										   ),
									   }, // Applique la couleur en fonction du statut
								   ]}
							   />
							   <Text style={styles.drawerItemText}>
								   EN ATTENTE DE PIECE
							   </Text>
						   </TouchableOpacity>
   
						   <TouchableOpacity
							   style={styles.drawerItem}
							   onPress={() => {
								   toggleMenu(); // Ferme le menu
								   filterByStatus("Devis accepté");
							   }}
						   >
							   <Image
								   source={require("../assets/icons/devisAccepte.png")} // Icône pour "Devis accepté"
								   style={[
									   styles.drawerItemIcon,
									   {
										   tintColor:
											   getIconColor("Devis accepté"),
									   }, // Applique la couleur en fonction du statut
								   ]}
							   />
							   <Text style={styles.drawerItemText}>
								   DEVIS ACCEPTÉ
							   </Text>
						   </TouchableOpacity>
   
						   <TouchableOpacity
							   style={styles.drawerItem}
							   onPress={() => {
								   toggleMenu(); // Ferme le menu
								   filterByStatus("Réparation en cours");
							   }}
						   >
							   <Image
								   source={require("../assets/icons/tools1.png")} // Icône pour "Réparation en cours"
								   style={[
									   styles.drawerItemIcon,
									   {
										   tintColor: getIconColor(
											   "Réparation en cours"
										   ),
									   }, // Applique la couleur en fonction du statut
								   ]}
							   />
							   <Text style={styles.drawerItemText}>
								   RÉPARATION EN COURS
							   </Text>
						   </TouchableOpacity>
   
						   <TouchableOpacity
							   style={styles.drawerItem}
							   onPress={() => {
								   toggleMenu(); // Ferme le menu
								   filterByStatus("Devis en cours");
							   }}
						   >
							   <Image
								   source={require("../assets/icons/devisEnCours.png")} // Icône pour "Devis en cours"
								   style={[
									   styles.drawerItemIcon,
									   {
										   tintColor:
											   getIconColor("Devis en cours"),
									   }, // Applique la couleur en fonction du statut
								   ]}
							   />
							   <Text style={styles.drawerItemText}>
								   DEVIS EN COURS
							   </Text>
						   </TouchableOpacity>
   
						   <TouchableOpacity
							   style={styles.drawerItem}
							   onPress={() => {
								   toggleMenu(); // Ferme le menu
								   resetFilter(); // Réinitialise les filtres
							   }}
						   >
							   <Image
								   source={require("../assets/icons/reload.png")} // Icône pour "Réinitialiser"
								   style={[
									   styles.drawerItemIcon,
									   {
										   tintColor:
											   getIconColor("Réinitialiser"),
									   }, // Applique la couleur en fonction du statut
								   ]}
							   />
							   <Text style={styles.drawerItemText}>
								   RÉINITIALISER
							   </Text>
						   </TouchableOpacity>
					   </Animated.View>
  );
}

const styles = StyleSheet.create({
    drawer: {
        position: "absolute",
        left: 0, // Positionne le menu à gauche
        top: 0,
        bottom: 0,
        width: 250,
        backgroundColor: "#1c2335",
        padding: 20,
        shadowColor: "#000", // Couleur de l'ombre
        shadowOffset: { width: 5, height: 0 }, // Ombre vers la droite
        shadowOpacity: 0.2, // Opacité de l'ombre
        shadowRadius: 5, // Diffusion de l'ombre
        elevation: 5, // Élévation pour Android
        zIndex: 9,
    },

    drawerTitle: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 20,
        color: "#f1f1f1",
    },
    drawerItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#ddd",
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "bold",
        marginVertical: 10,
        color: "#f1f1f1",
    },
    drawerItemIcon: {
        width: 24,
        height: 24,
        marginRight: 10, // Espacement entre l'icône et le texte
    },
    drawerItemText: {
        fontSize: 16,
        color: "#f1f1f1",
    },
	menuIcon: {
	width: 30,
	height: 30,
	tintColor: "#fff", // Supprimez si vos images ont déjà une couleur
},
});
