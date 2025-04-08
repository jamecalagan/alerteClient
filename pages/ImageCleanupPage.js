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
            };
        });

        setClients(combined);
    };

    const toggleImageSelection = (clientId, index) => {
        const key = `${clientId}-${index}`;
        setSelectedImages((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
        );
    };

	const deleteSelectedImages = async () => {
		if (selectedImages.length === 0) return;
	
		const updates = {};
	
		selectedImages.forEach((key) => {
			const parts = key.split("-");
			const interventionId = parts.slice(0, 5).join("-"); // UUID = 5 segments
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
					{Array.isArray(client.photos) &&
						client.photos
  .filter((photo) => photo && photo !== "base64testphoto")
  .map((photo, index) => {


                            const key = `${client.id}-${index}`;
                            const isSelected = selectedImages.includes(key);
                            return (
                                <TouchableOpacity
                                    key={index}
                                    onPress={() => toggleImageSelection(client.id, index)}
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
                <TouchableOpacity
                    onPress={deleteSelectedImages}
                    style={{ backgroundColor: "#ff4444", padding: 10, marginBottom: 20, borderRadius: 6 }}
                >
                    <Text style={{ color: "#fff", fontWeight: "bold", textAlign: "center" }}>
                        Supprimer {selectedImages.length} image(s) sélectionnée(s)
                    </Text>
                </TouchableOpacity>
            )}

{/*             <TouchableOpacity
                onPress={async () => {
                    const testId = clients[0]?.id;
                    const testPhotos = ["base64testimage"];

                    const { data, error } = await supabase
                        .from("interventions")
                        .update({ photos: testPhotos })
                        .eq("id", testId);

                    if (error) {
                        console.error("🔥 ERREUR TEST MISE À JOUR :", error);
                        Alert.alert("❌ Erreur", JSON.stringify(error.message));
                    } else {
                        Alert.alert("✅ Succès", "Mise à jour test réussie !");
                    }
                }}
                style={{ backgroundColor: "green", padding: 10, marginBottom: 20, borderRadius: 6 }}
            >
                <Text style={{ color: "#fff", fontWeight: "bold", textAlign: "center" }}>
                    Tester mise à jour manuelle d'une photo
                </Text>
            </TouchableOpacity> */}

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