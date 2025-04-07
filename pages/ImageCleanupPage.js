import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    ScrollView,
    Alert,
} from "react-native";
import { supabase } from "../supabaseClient";

const ImageCleanupPage = () => {
    const [clients, setClients] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const clientsPerPage = 6;

    useEffect(() => {
        fetchImages();
    }, []);

    const fetchImages = async () => {
        const dateLimite = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

        // Récupération des interventions avec photos base64 à supprimer
        const { data: interventions, error } = await supabase
            .from("interventions")
            .select("id, client_id, photos, deviceType, brand, model")
            .eq("status", "Récupéré")
            .lte("updatedAt", dateLimite);

        if (error) {
            console.error("Erreur récupération interventions:", error);
            return;
        }

        const filtered = interventions.filter((intervention) => {
            const photos = intervention.photos;
            return photos && Array.isArray(photos) && photos.length > 0;
        });

        const clientIds = [...new Set(filtered.map((i) => i.client_id))];
        const { data: clientsData } = await supabase
            .from("clients")
            .select("id, name")
            .in("id", clientIds);

        const combined = filtered.map((intervention) => {
            const client = clientsData.find((c) => c.id === intervention.client_id);
            return {
                ...intervention,
                clientName: client?.name || "",
            };
        });

        setClients(combined);
    };

    const deleteImage = async (clientId, imageIndex) => {
        const client = clients.find((c) => c.id === clientId);
        if (!client) return;

        Alert.alert("Confirmation", "Supprimer cette image ?", [
            {
                text: "Annuler",
                style: "cancel",
            },
            {
                text: "Supprimer",
                style: "destructive",
                onPress: async () => {
                    const updatedPhotos = [...client.photos];
                    updatedPhotos.splice(imageIndex, 1);

                    const { error } = await supabase
                        .from("interventions")
                        .update({ photos: updatedPhotos })
                        .eq("id", client.id);

                    if (!error) {
                        fetchImages();
                    } else {
                        console.error("Erreur suppression image:", error);
                    }
                },
            },
        ]);
    };

    const indexOfLastClient = currentPage * clientsPerPage;
    const indexOfFirstClient = indexOfLastClient - clientsPerPage;
    const currentClients = clients.slice(indexOfFirstClient, indexOfLastClient);
    const totalPages = Math.ceil(clients.length / clientsPerPage);

    return (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
            {currentClients.map((client) => (
                <View key={client.id} style={{ marginBottom: 30 }}>
                    <Text style={{ fontWeight: "bold", marginBottom: 4 }}>
                        {client.clientName} — {client.deviceType} {client.brand} {client.model}
                    </Text>
                    <ScrollView horizontal>
                        {Array.isArray(client.photos) && client.photos.map((photo, index) => (
                            <TouchableOpacity
                                key={index}
                                onPress={() => deleteImage(client.id, index)}
                                style={{ marginRight: 10 }}
                            >
                                <Image
                                    source={{ uri: `data:image/jpeg;base64,${photo}` }}
                                    style={{ width: 100, height: 100, borderRadius: 4 }}
                                />
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            ))}

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 20 }}>
                <TouchableOpacity
                    disabled={currentPage === 1}
                    onPress={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    style={{ padding: 10, backgroundColor: "#ccc", borderRadius: 5 }}
                >
                    <Text>⬅️ Précédent</Text>
                </TouchableOpacity>
                <Text style={{ alignSelf: "center", padding: 10 }}>
                    Page {currentPage} / {totalPages}
                </Text>
                <TouchableOpacity
                    disabled={currentPage === totalPages}
                    onPress={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    style={{ padding: 10, backgroundColor: "#ccc", borderRadius: 5 }}
                >
                    <Text>Suivant ➡️</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

export default ImageCleanupPage;