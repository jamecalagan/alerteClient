import React, { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";

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
	const navigation = useNavigation();
    const [clients, setClients] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedImages, setSelectedImages] = useState([]);
    const clientsPerPage = 6;

    useEffect(() => {
        fetchImages();
    }, []);

    const fetchImages = async () => {
        const dateLimite = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

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
            return (
                photos &&
                Array.isArray(photos) &&
                photos.filter((p) => typeof p === "string" && p !== "base64testphoto").length > 0
            );
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
                clientId: client?.id || null,
            };
        });

        setClients(combined);
    };

    const toggleImageSelection = (interventionId, index) => {
        const key = `${interventionId}-${index}`;
        setSelectedImages((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

    const deleteSelectedImages = async () => {
        if (selectedImages.length === 0) return;

        const updates = {};

        selectedImages.forEach((key) => {
            const parts = key.split("-");
            const interventionId = parts.slice(0, 5).join("-");
            const index = parseInt(parts.slice(5).join("-"));
            if (!updates[interventionId]) updates[interventionId] = [];
            updates[interventionId].push(index);
        });

        let successCount = 0;

        for (const interventionId in updates) {
            const intervention = clients.find((c) => c.id === interventionId);
            if (!intervention) {
                console.warn("Intervention non trouvée pour l'id:", interventionId);
                continue;
            }

            const newPhotos = intervention.photos.filter(
                (_, i) => !updates[interventionId].includes(i)
            );

            const { error } = await supabase
                .from("interventions")
                .update({ photos: newPhotos })
                .eq("id", intervention.id);

            if (error) {
                console.error("❌ Erreur Supabase :", error);
                Alert.alert("Erreur", "Suppression échouée : " + error.message);
            } else {
                successCount++;
            }
        }

        if (successCount > 0) {
            Alert.alert("Succès", `${successCount} intervention(s) mise(s) à jour.`);
        }

        setSelectedImages([]);
        fetchImages();
    };

    async function base64ToUpload(base64, interventionId, index) {
        const filePath = `interventions/${interventionId}_${index}.jpg`;

        // Convertir base64 en Uint8Array (fichier binaire)
        const binary = atob(base64);
        const byteArray = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            byteArray[i] = binary.charCodeAt(i);
        }

        // Upload vers Supabase
        const { error } = await supabase.storage
            .from("images")
            .upload(filePath, byteArray, {
                contentType: "image/jpeg",
                upsert: true,
            });

        return { error, filePath };
    }

    const uploadSelectedImages = async () => {
        if (selectedImages.length === 0) {
            console.log("Aucune image sélectionnée.");
            return;
        }

        console.log("Début du transfert pour :", selectedImages);

        const uploads = {};

        selectedImages.forEach((key) => {
            const parts = key.split("-");
            const interventionId = parts.slice(0, 5).join("-");
            const index = parseInt(parts.slice(5).join("-"));
            if (!uploads[interventionId]) uploads[interventionId] = [];
            uploads[interventionId].push(index);
        });

        for (const interventionId in uploads) {
            const intervention = clients.find((c) => c.id === interventionId);
            if (!intervention) {
                console.warn("❌ Intervention introuvable :", interventionId);
                continue;
            }

            const photos = intervention.photos;

            for (const index of uploads[interventionId]) {
                try {
                    const base64 = photos[index];
                    console.log("🔍 Base64 récupéré :", base64?.slice(0, 30), "...");

                    if (!base64) {
                        console.warn("⚠️ Aucune image base64 trouvée pour index :", index);
                        continue;
                    }

                    const { error, filePath } = await base64ToUpload(base64, interventionId, index);

                    if (error) {
                        console.error("❌ Erreur d'upload :", error);
                        Alert.alert("Erreur", error.message);
                        return;
                    }

                    console.log("✅ Image transférée :", filePath);

                    // 🔁 Supprimer la version base64 de l'intervention après transfert
                    const updatedPhotos = photos.filter((_, i) => i !== index);
                    const { error: updateError } = await supabase
                        .from("interventions")
                        .update({ photos: updatedPhotos })
                        .eq("id", interventionId);

                    if (updateError) {
                        console.error("❌ Erreur suppression base64 après upload :", updateError);
                    } else {
                        console.log("🧹 Base64 supprimée de la fiche :", interventionId);
                    }

                } catch (err) {
                    console.error("❌ Exception durant le transfert :", err);
                    Alert.alert("Erreur inattendue", err.message);
                }
            }
        }

        Alert.alert("Succès", "Image(s) transférée(s) dans Supabase Storage.");
    };

    const indexOfLastClient = currentPage * clientsPerPage;
    const indexOfFirstClient = indexOfLastClient - clientsPerPage;
    const currentClients = clients.slice(indexOfFirstClient, indexOfLastClient);
    const totalPages = Math.ceil(clients.length / clientsPerPage);

    return (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
		            <TouchableOpacity
                onPress={() => navigation.navigate("StoredImages")}
                style={{ backgroundColor: "#ddd", padding: 10, marginBottom: 16, borderRadius: 6 }}
            >
                <Text style={{ textAlign: "center", fontWeight: "bold" }}>
                    📂 Voir les images déjà transférées
                </Text>
            </TouchableOpacity>
            {currentClients.map((intervention) => (
                <View key={intervention.id} style={{ marginBottom: 30 }}>
                    <Text style={{ fontWeight: "bold", marginBottom: 4 }}>
                        {intervention.clientName} — {intervention.deviceType} {intervention.brand} {intervention.model}
                    </Text>
                    <ScrollView horizontal>
                        {Array.isArray(intervention.photos) &&
                            intervention.photos
                                .filter((photo) => photo && photo !== "base64testphoto")
                                .map((photo, index) => {
                                    const key = `${intervention.id}-${index}`;
                                    const isSelected = selectedImages.includes(key);
                                    return (
                                        <TouchableOpacity
                                            key={index}
                                            onPress={() => toggleImageSelection(intervention.id, index)}
                                            style={{
                                                marginRight: 10,
                                                borderWidth: isSelected ? 2 : 0,
                                                borderColor: isSelected ? "red" : "transparent",
                                            }}
                                        >
                                            <Image
                                                source={{ uri: `data:image/jpeg;base64,${photo}` }}
                                                style={{ width: 100, height: 100, borderRadius: 4 }}
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                    </ScrollView>
                </View>
            ))}

            {selectedImages.length > 0 && (
                <>
                    <TouchableOpacity
                        onPress={uploadSelectedImages}
                        style={{ backgroundColor: "#4a90e2", padding: 10, marginBottom: 10, borderRadius: 6 }}
                    >
                        <Text style={{ color: "#fff", fontWeight: "bold", textAlign: "center" }}>
                            Transférer vers la BDD (cloud)
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={deleteSelectedImages}
                        style={{ backgroundColor: "#ff4444", padding: 10, marginBottom: 20, borderRadius: 6 }}
                    >
                        <Text style={{ color: "#fff", fontWeight: "bold", textAlign: "center" }}>
                            Supprimer {selectedImages.length} image(s) sélectionnée(s)
                        </Text>
                    </TouchableOpacity>
                </>
            )}

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
