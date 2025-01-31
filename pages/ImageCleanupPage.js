import React, { useState, useEffect } from "react";
import { View, Text, FlatList, Image, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../supabaseClient";

const ImageCleanupPage = () => {
    const [interventionImagesGrouped, setInterventionImagesGrouped] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]); // État pour stocker les images sélectionnées
    const [isLoading, setIsLoading] = useState(false);

    const loadInterventionImagesAndPhotos = async () => {
        setIsLoading(true);
        try {
            const dateLimite = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

            // Charger les interventions de la table "interventions"
            const { data: interventions, error: interventionError } = await supabase
                .from("interventions")
                .select('id, client_id, "updatedAt", photos, label_photo, deviceType, brand, model')
                .eq("status", "Récupéré")
                .lte("updatedAt", dateLimite)
                .not("photos", "eq", "[]"); // Exclure les interventions sans photos

            if (interventionError || !interventions) {
                console.error("Erreur lors du chargement des interventions :", interventionError);
                return;
            }

            // Charger les images de la table "intervention_images"
            const { data: imagesData, error: imagesError } = await supabase
                .from("intervention_images")
                .select("*")
                .in(
                    "intervention_id",
                    interventions.map((intervention) => intervention.id)
                )
                .lte("created_at", dateLimite);

            if (imagesError) {
                console.error("Erreur lors du chargement des images :", imagesError);
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

                const additionalImages = imagesData.filter(
                    (image) => image.intervention_id === intervention.id && !image.is_label
                );

                return {
                    interventionId: intervention.id,
                    clientName: clientMap[intervention.client_id],
                    updatedAt: intervention.updatedAt,
                    photos: [
                        ...photosArray.map((photo, index) => ({
                            id: `${intervention.id}_photo_${index}`,
                            base64: photo,
                        })),
                        ...additionalImages.map((image) => ({
                            id: image.id,
                            file_path: image.file_path,
                        })),
                    ],
                    deviceType: intervention.deviceType || "Type inconnu",
                    brand: intervention.brand || "Marque inconnue",
                    model: intervention.model || "Modèle inconnu",
                };
            });

            setInterventionImagesGrouped(groupedImages.filter((group) => group.photos.length > 0));
        } catch (err) {
            console.error("Erreur inattendue :", err);
        } finally {
            setIsLoading(false);
        }
    };

    // Fonction pour sélectionner/désélectionner une image
    const toggleImageSelection = (imageId) => {
        setSelectedImages((prevSelected) =>
            prevSelected.includes(imageId)
                ? prevSelected.filter((id) => id !== imageId) // Retire si déjà sélectionnée
                : [...prevSelected, imageId] // Ajoute si pas encore sélectionnée
        );
    };

    // Fonction pour supprimer les images sélectionnées
    const deleteSelectedImages = async () => {
        if (selectedImages.length === 0) {
            Alert.alert("Aucune sélection", "Veuillez sélectionner au moins une image à supprimer.");
            return;
        }

        Alert.alert(
            "Confirmation",
            `Voulez-vous vraiment supprimer ${selectedImages.length} images ?`,
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    onPress: async () => {
                        try {
                            // Supprimer les images sélectionnées de la base de données
                            const { error } = await supabase
                                .from("intervention_images")
                                .delete()
                                .in("id", selectedImages);

                            if (error) {
                                console.error("Erreur lors de la suppression des images :", error);
                                Alert.alert("Erreur", "Impossible de supprimer certaines images.");
                                return;
                            }

                            // Mettre à jour l'affichage après suppression
                            setInterventionImagesGrouped((prevData) =>
                                prevData.map((group) => ({
                                    ...group,
                                    photos: group.photos.filter((photo) => !selectedImages.includes(photo.id)),
                                }))
                            );

                            // Réinitialiser la sélection
                            setSelectedImages([]);
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
            <Text style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
                Photos des interventions récupérées (plus de 10 jours)
            </Text>
            {isLoading ? (
                <ActivityIndicator size="large" color="blue" />
            ) : interventionImagesGrouped.length === 0 ? (
                <Text>Aucune photo à supprimer.</Text>
            ) : (
                <>
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

                                <FlatList
                                    data={item.photos}
                                    horizontal
                                    keyExtractor={(photo) => photo.id.toString()}
                                    renderItem={({ item: photo }) => (
                                        <TouchableOpacity onPress={() => toggleImageSelection(photo.id)}>
                                            <View style={{ position: "relative", marginRight: 10 }}>
                                                <Image
                                                    source={{
                                                        uri: photo.base64
                                                            ? `data:image/jpeg;base64,${photo.base64}`
                                                            : photo.file_path,
                                                    }}
                                                    style={{
                                                        width: 100,
                                                        height: 100,
                                                        borderWidth: selectedImages.includes(photo.id) ? 3 : 1,
                                                        borderColor: selectedImages.includes(photo.id) ? "green" : "red",
                                                        borderRadius: 5,
                                                    }}
                                                />
                                                {selectedImages.includes(photo.id) && (
                                                    <View
                                                        style={{
                                                            position: "absolute",
                                                            top: 5,
                                                            right: 5,
                                                            backgroundColor: "green",
                                                            padding: 5,
                                                            borderRadius: 50,
                                                        }}
                                                    >
                                                        <Text style={{ color: "white", fontWeight: "bold" }}>✔</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    )}
                                />
                            </View>
                        )}
                    />
                    <TouchableOpacity
                        onPress={deleteSelectedImages}
                        style={{
                            padding: 10,
                            backgroundColor: "red",
                            borderRadius: 5,
                            marginVertical: 10,
                            alignItems: "center",
                        }}
                    >
                        <Text style={{ color: "white", fontWeight: "bold" }}>Supprimer les images sélectionnées</Text>
                    </TouchableOpacity>
                </>
            )}
        </View>
    );
};

export default ImageCleanupPage;
