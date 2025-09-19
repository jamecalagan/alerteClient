import React, { useState, useEffect } from "react";
import SmartImage from "../components/SmartImage";
import {
    View,
    Text,
    FlatList,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Image,
    KeyboardAvoidingView,
    Platform,
    Modal,
    Alert,
} from "react-native";
import { supabase } from "../supabaseClient";
import BottomNavigation from "../components/BottomNavigation";
export default function ClientInterventionsPage({ route, navigation }) {
    const { clientId } = route.params;
    const [interventions, setInterventions] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [deviceType, setDeviceType] = useState("default");
   
    useEffect(() => {
        const fetchClient = async () => {
            try {
                const { data: clientData, error } = await supabase
                    .from("clients")
                    .select("id, name, phone, ficheNumber")
                    .eq("id", clientId)
                    .single();

                if (error) throw error;

                setSelectedClient(clientData); 
            } catch (error) {
                console.error("Erreur lors du chargement du client :", error);
            }
        };

        fetchClient();
    }, [clientId]);

   
    useEffect(() => {
        if (selectedClient) {
            const fetchClientInterventions = async () => {
                try {
                    const { data, error } = await supabase
                        .from("interventions")
                        .select("*, photos, label_photo") 
                        .eq("client_id", selectedClient.id)
                        .order("createdAt", { ascending: false });

                    if (error) throw error;

                    setInterventions(data);
                } catch (error) {
                    console.error(
                        "Erreur lors du chargement des interventions :",
                        error
                    );
                }
            };

            fetchClientInterventions();
        }
    }, [selectedClient]);

   
    useEffect(() => {
        const fetchClients = async () => {
            try {
                const { data: clientData, error } = await supabase
                    .from("clients")
                    .select("id, name, phone");

                if (error) throw error;

                setClients(clientData); 
            } catch (error) {
                console.error("Erreur lors du chargement des clients :", error);
            }
        };

        fetchClients();
    }, []);

 
    const filteredClients = clients.filter(
        (client) =>
            client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            client.phone.includes(searchQuery)
    );
    const handleImagePress = (imageUri) => {
        setSelectedImage(imageUri);
    };
    const handleDeleteIntervention = async (interventionId) => {
        try {
            const { error } = await supabase
                .from("interventions")
                .delete()
                .eq("id", interventionId);

            if (error) {
                Alert.alert(
                    "Erreur",
                    "Une erreur est survenue lors de la suppression."
                );
                console.error("Erreur de suppression :", error);
                return;
            }

            Alert.alert(
                "Succès",
                "L'intervention a été supprimée avec succès."
            );
            setInterventions((prevInterventions) =>
                prevInterventions.filter(
                    (intervention) => intervention.id !== interventionId
                )
            );
        } catch (err) {
            Alert.alert("Erreur", "Impossible de supprimer l'intervention.");
            console.error("Erreur :", err);
        }
    };
    const confirmDeleteIntervention = (interventionId) => {
        Alert.alert(
            "Confirmation",
            "Êtes-vous sûr de vouloir supprimer cette intervention ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    onPress: () => handleDeleteIntervention(interventionId),
                },
            ]
        );
    };
    return (
        < KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0} 
        >
            <View style={{ flex: 1 }}>
                <Text style={styles.title}>Interventions du client</Text>

                <TextInput
                    style={styles.searchBar}
                    placeholder="Rechercher par nom ou téléphone"
                    placeholderTextColor="#888787"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />

                {selectedClient && searchQuery === "" && (
                    <View style={{ flex: 1 }}>
                        <Text style={styles.clientInfo}>
                            Client : {selectedClient.name} -{" "}
                            {selectedClient.phone.replace(
                                /(\d{2})(?=\d)/g,
                                "$1 "
                            )}
                        </Text>
                        <FlatList
                            data={interventions}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => (
                                <View style={styles.interventionCard}>
                                    <View style={styles.interventionDetails}>
                                        <Text style={styles.updatedAt}>
                                            Référence :{" "}
                                            {item.reference || "N/A"}
                                        </Text>
                                        <Text style={styles.updatedAt}>
                                            Produit : {item.deviceType || "N/A"}
                                        </Text>
                                        <Text style={styles.updatedAt}>
                                            Marque : {item.brand || "N/A"}
                                        </Text>
                                        <Text style={styles.updatedAt}>
                                            Modèle : {item.model || "N/A"}
                                        </Text>
                                        <Text style={styles.updatedAt}>
                                            Description : {item.description}
                                        </Text>
										<Text style={styles.updatedAt}>
                                            Mot de passe: {item.password}
                                        </Text>
                                        <Text style={styles.updatedAt}>
                                            Statut : {item.status}
                                        </Text>
                                        <Text style={styles.updatedAt}>
                                            Coût : {item.cost} €
                                        </Text>
                                        <Text style={styles.updatedAt}>
                                            Montant restant dû :{" "}
                                            {item.solderestant} €
                                        </Text>
                                        <Text style={styles.updatedAt}>
                                            Date :{" "}
                                            {new Date(
                                                item.createdAt
                                            ).toLocaleDateString("fr-FR")}
                                        </Text>
                                        <Text style={styles.updatedAt}>
                                            Détail de l'intervention:{" "}
                                            {item.detailIntervention}
                                        </Text>

                                        {item.status === "Récupéré" && (
                                            <Text style={styles.updatedAt}>
                                                Date de récupération :{" "}
                                                {item.updatedAt
                                                    ? new Date(
                                                          item.updatedAt
                                                      ).toLocaleDateString(
                                                          "fr-FR"
                                                      )
                                                    : "Non disponible"}
                                            </Text>
                                        )}
                                    </View>
                                    <View style={styles.deleteButtonContainer}>
                                        <TouchableOpacity
                                            style={styles.deleteButton}
                                            onPress={() =>
                                                confirmDeleteIntervention(
                                                    item.id
                                                )
                                            }
                                        >
                                            <Text
                                                style={styles.deleteButtonText}
                                            >
                                                Supprimer
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.labelContainer}>
        {item.label_photo ? (
          <TouchableOpacity onPress={() => handleImagePress(item.label_photo)}>
            <SmartImage
              uri={item.label_photo}
              ficheNumber={selectedClient?.ficheNumber}
              interventionId={item.id}
              type="label"   
              size={80}         
              borderRadius={8}
              borderWidth={2}
              badge
            />
          </TouchableOpacity>
        ) : (
          <Text style={styles.referenceText}>
            {item.reference || "Référence manquante"}
          </Text>
        )}
      </View>

      <View style={styles.photosContainer}>
        {item.photos && item.photos.length > 0 ? (
          item.photos
            .filter((uri) => uri !== item.label_photo)
            .map((uri, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => handleImagePress(uri)}
              >
                <SmartImage
                  uri={uri}
                  ficheNumber={selectedClient?.ficheNumber}
                  interventionId={item.id}
                  index={index}
                  type="photo"
                  size={60}
                  borderRadius={8}
                  borderWidth={1}
                  badge     
                />
              </TouchableOpacity>
            ))
        ) : (
          <Text style={styles.noPhotosText}>Pas d'images disponibles</Text>
        )}
      </View>
    </View>
  )}
/>
                    </View>
                )}

                {searchQuery !== "" && (
                    <FlatList
                        data={filteredClients}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => {
                                    setSelectedClient(item); // Sélectionner un nouveau client
                                    setSearchQuery("");
                                }}
                                style={styles.clientCard}
                            >
                                <Text style={styles.updatedAt}>
                                    {item.name} - {item.phone}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />
                )}
					  <BottomNavigation  navigation={navigation} currentRoute={route.name} />
            </View>
            {selectedImage && (
                <Modal
                    transparent={true}
                    visible={true}
                    onRequestClose={() => setSelectedImage(null)}
                >
                    <TouchableOpacity
                        style={styles.modalBackground}
                        onPress={() => setSelectedImage(null)}
                    >
<Image
  source={{ uri: selectedImage }}
  style={styles.fullImage}
/>

                    </TouchableOpacity>
                </Modal>
            )}
        </KeyboardAvoidingView>
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
        color: "#242424",
        fontWeight: "bold",
        marginBottom: 20,
        textAlign: "center",
    },
    searchBar: {
		backgroundColor: "#c7c5c5",
        height: 40,
        borderColor: "#777676",
        borderWidth: 1,
        borderWidth: 1,
        paddingLeft: 8,
        marginBottom: 20,
        borderRadius: 20,
        fontSize: 16,
        color: "#242424",
    },
    clientCard: {
        padding: 10,
        marginBottom: 10,
        backgroundColor: "#cacaca",
        borderRadius: 5,
        borderWidth: 1,
        borderColor: "#888787",
        fontSize: 16,
        color: "#242424",
    },
    clientInfo: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#242424",
        marginBottom: 10,
    },
    interventionCard: {
        flexDirection: "row", // Alignement horizontal pour avoir les détails et l'image côte à côte
        justifyContent: "space-between",
        padding: 15,
        marginBottom: 10,
        backgroundColor: "#cacaca",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#888787",
    },
    recuperedStatusCard: {
        borderColor: "red", // Bordure rouge pour le statut récupéré
        borderWidth: 2,
    },
    updatedAt: {
        fontWeight: "medium", // Texte en gras pour la date de récupération
        color: "#242424",
    },
    interventionDetails: {
        flex: 3, // Plus d'espace pour les détails de l'intervention
    },
    labelContainer: {
        flex: 1, // Espace pour l'image de l'étiquette
        alignItems: "center",
        justifyContent: "center",
    },
    labelImage: {
        width: 80,
        height: 80,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: "#49f760",
    },
    referenceText: {
        fontSize: 14,
        fontWeight: "bold",
        color: "#242424",
        textAlign: "center",
    },
    modalBackground: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#191f2f",
    },
    fullImage: {
        width: "90%",
        height: "90%",
        resizeMode: "contain",
    },
    photosContainer: {
        flexDirection: "row",
        flexWrap: "wrap", // Permettre les retours à la ligne pour les images
        gap: 8,
        marginTop: 40,
    },
    photo: {
        width: 60,
        height: 60,
        margin: 5,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#888787",
    },
    noPhotosText: {
        fontSize: 14,
        fontStyle: "italic",
        color: "#888787",
        marginTop: 10,
    },
    deleteButtonContainer: {
        flexDirection: "row",
        justifyContent: "flex-end", // Positionne le bouton à droite
        alignItems: "flex-end", // Aligne le bouton en bas
        marginTop: 10,
    },
    deleteButton: {
        backgroundColor: "#fd0000", // Rouge pour suppression
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#888787",
    },
    deleteButtonText: {
        color: "#ffffff",
        fontWeight: "bold",
        fontSize: 14,
    },
});
