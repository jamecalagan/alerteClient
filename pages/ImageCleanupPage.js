import React, { useState, useEffect } from "react";
import { View, Text, FlatList, Image, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../supabaseClient";

const ImageCleanupPage = () => {
    const [interventionImagesGrouped, setInterventionImagesGrouped] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const loadInterventionImagesAndPhotos = async () => {
        setIsLoading(true);
        try {
            const dateLimite = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
            console.log("Date limite pour filtrer :", dateLimite);

            // Charger les interventions avec les informations nécessaires
            const { data: interventions, error: interventionError } = await supabase
                .from("interventions")
                .select('id, client_id, "updatedAt", photos, label_photo, deviceType, brand, model')
                .eq("status", "Récupéré")
                .lte('"updatedAt"', dateLimite)
                .not("photos", "eq", "[]"); // Exclure les interventions sans photos

            if (interventionError || !interventions) {
                console.error("Erreur lors du chargement des interventions :", interventionError);
                return;
            }

            // Charger les noms des clients
            const clientIds = interventions.map((intervention) => intervention.client_id);
            const { data: clients, error: clientError } = await supabase
                .from("clients")
                .select("id, name")
                .in("id", clientIds);

            if (clientError) {
                console.error("Erreur lors du chargement des clients :", clientError);
                return;
            }

            const clientMap = clients.reduce((map, client) => {
                map[client.id] = client.name || "Inconnu";
                return map;
            }, {});

            const groupedImages = interventions.map((intervention) => {
                let photosArray = [];

                if (Array.isArray(intervention.photos) && intervention.photos.length > 0) {
                    // Exclure la photo qui correspond à "label_photo"
                    photosArray = intervention.photos.filter(
                        (photo) => photo !== intervention.label_photo
                    );
                }

                return {
                    interventionId: intervention.id,
                    clientName: clientMap[intervention.client_id],
                    updatedAt: intervention.updatedAt,
                    photos: photosArray.map((photo, index) => ({
                        id: `${intervention.id}_photo_${index}`,
                        base64: photo,
                    })),
                    deviceType: intervention.deviceType || "Type inconnu",
                    brand: intervention.brand || "Marque inconnue",
                    model: intervention.model || "Modèle inconnu",
                };
            });

            console.log("Groupement des images :", groupedImages);

            setInterventionImagesGrouped(groupedImages.filter((group) => group.photos.length > 0));
        } catch (err) {
            console.error("Erreur inattendue :", err);
        } finally {
            setIsLoading(false);
        }
    };

    // Fonction pour supprimer une photo dans la colonne "photos"
    const deletePhoto = async (interventionId, photoBase64) => {
        Alert.alert(
            "Confirmation",
            "Voulez-vous vraiment supprimer cette photo ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    onPress: async () => {
                        try {
                            const { data: intervention, error } = await supabase
                                .from("interventions")
                                .select("photos")
                                .eq("id", interventionId)
                                .single();

                            if (error || !intervention) {
                                console.error("Erreur lors de la récupération des photos :", error);
                                Alert.alert("Erreur", "Impossible de récupérer les photos.");
                                return;
                            }

                            const updatedPhotos = intervention.photos.filter((photo) => photo !== photoBase64);

                            const { error: updateError } = await supabase
                                .from("interventions")
                                .update({ photos: updatedPhotos })
                                .eq("id", interventionId);

                            if (updateError) {
                                console.error("Erreur lors de la mise à jour :", updateError);
                                Alert.alert("Erreur", "Impossible de supprimer la photo.");
                            } else {
                                Alert.alert("Succès", "Photo supprimée avec succès !");
                                setInterventionImagesGrouped((prev) =>
                                    prev.map((group) =>
                                        group.interventionId === interventionId
                                            ? {
                                                  ...group,
                                                  photos: group.photos.filter((p) => p.base64 !== photoBase64),
                                              }
                                            : group
                                    )
                                );
                            }
                        } catch (err) {
                            console.error("Erreur inattendue lors de la suppression :", err);
                        }
                    },
                },
            ]
        );
    };

    useEffect(() => {
        loadInterventionImagesAndPhotos();
    }, []);

    return (
        <View style={{ flex: 1, padding: 20 }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>Photos des interventions récupérées</Text>
            {isLoading ? (
                <ActivityIndicator size="large" color="blue" />
            ) : interventionImagesGrouped.length === 0 ? (
                <Text>Aucune photo à supprimer.</Text>
            ) : (
				<FlatList
    data={interventionImagesGrouped}
    keyExtractor={(item) => item.interventionId.toString()}
    renderItem={({ item }) => (
        <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 5 }}>
                Type : {item.deviceType} - Marque : {item.brand} - Modèle : {item.model}
            </Text>
            <Text style={{ fontSize: 14, marginBottom: 10, color: "gray" }}>
                Client : {item.clientName}
            </Text>
            <Text style={{ fontSize: 14, marginBottom: 10, color: "gray" }}>
                Date de restitution :{" "}
                {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("fr-FR") : "Date inconnue"}
            </Text>

            <FlatList
                data={item.photos}
                horizontal
                keyExtractor={(photo) => photo.id}
                renderItem={({ item: photo }) => (
                    <View style={{ marginRight: 10 }}>
                        {photo.base64 ? (
                            <Image
                                source={{ uri: `data:image/png;base64,${photo.base64}` }}
                                style={{
                                    width: 100,
                                    height: 100,
                                    borderWidth: 2,
                                    borderColor: "red",
                                    borderRadius: 5,
                                }}
                            />
                        ) : (
                            <Text style={{ color: "gray" }}>Image non disponible</Text>
                        )}
                        <TouchableOpacity
                            onPress={() => deletePhoto(item.interventionId, photo.base64)}
                            style={{
                                padding: 5,
                                backgroundColor: "red",
                                borderRadius: 3,
                                marginTop: 5,
                            }}
                        >
                            <Text style={{ color: "white", textAlign: "center" }}>Supprimer</Text>
                        </TouchableOpacity>
                    </View>
                )}
            />

            {/* Ligne de séparation */}
            <View
                style={{
                    borderBottomWidth: 1,
                    borderBottomColor: "#ccc",
                    marginVertical: 15, // Espace autour de la séparation
                }}
            />
        </View>
    )}
/>

            )}
        </View>
    );
};

export default ImageCleanupPage;
