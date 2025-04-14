import React, { useEffect, useState, useRef } from "react";
import {
    View,
    Text,
    ScrollView,
    Image,
    TouchableOpacity,
    StyleSheet,
    Clipboard,
    Alert,
    FlatList,
    ActivityIndicator,
    Modal,
    TextInput,
    Pressable,
    Animated,
} from "react-native";
import { supabase } from "../supabaseClient";
import { useNavigation } from "@react-navigation/native";

export default function StoredImagesPage() {
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [rawProgress, setRawProgress] = useState(0);
    const animatedProgress = useRef(new Animated.Value(0)).current;
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedImage, setSelectedImage] = useState(null);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState(null);
    const navigation = useNavigation();
    const imagesPerPage = 12;
	const [countTotal, setCountTotal] = useState(0);
	const [countEtiquette, setCountEtiquette] = useState(0);
	const [countSupp, setCountSupp] = useState(0);
	const [countOld, setCountOld] = useState(0);
	
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
			setCountTotal(0);
			setCountEtiquette(0);
			setCountSupp(0);
			setCountOld(0);
			
            const folders = [
                "etiquettes",
                "intervention_images",
                "supplementaires",
                "old_images", // ajout ici
            ];
            const { data: interventionsData } = await supabase
                .from("interventions")
                .select("id, client_id");
            const { data: clientsData } = await supabase
                .from("clients")
                .select("id, name, ficheNumber");

            let allImages = [];
            let totalFolders = folders.length * interventionsData.length;
            let processedFolders = 0;
            // Gérer les images dans le dossier old_images (pas liées à une intervention spécifique)
            const { data: oldFiles } = await supabase.storage
                .from("images")
                .list("old_images");

				if (oldFiles) {
					oldFiles.forEach((file) => {
						const nameWithoutExt = file.name.split(".")[0];
						const parts = nameWithoutExt.split("_");
						const ficheNumber = parts[0] || "Inconnu";
				
						// Ajoute des espaces dans le nom (MartinDupont => Martin Dupont)
						const rawName = parts[1] || "Inconnu";
						const clientName = rawName.replace(/([a-z])([A-Z])/g, "$1 $2");
				
						allImages.push({
							name: file.name,
							folder: "old_images",
							created_at: file.created_at || new Date(),
							path: `old_images/${file.name}`,
							url: `https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/old_images/${file.name}`,
							type: "old",
							ficheDisplay: `${ficheNumber} - ${clientName}`,
						});
				
						// 🔁 Mise à jour progressive des compteurs
						setCountTotal((prev) => prev + 1);
						setCountOld((prev) => prev + 1);
					});
				}
				
				

            for (const intervention of interventionsData) {
                const interventionId = intervention.id;
                const relatedClient = clientsData.find(
                    (c) => c.id === intervention.client_id
                );

                for (const folder of folders) {
                    const { data: files } = await supabase.storage
                        .from("images")
                        .list(`${folder}/${interventionId}`);

                    if (files) {
                        files.forEach((file) => {
							const imageType =
							  folder === "etiquettes"
								? "etiquette"
								: folder === "intervention_images" || folder === "supplementaires"
								? "supplementaire"
								: "supplementaire";
						  
							allImages.push({
							  name: file.name,
							  folder: interventionId,
							  created_at: file.created_at || file.metadata?.created_at || new Date(),
							  path: `${folder}/${interventionId}/${file.name}`,
							  url: `https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/${folder}/${interventionId}/${file.name}`,
							  type: imageType,
							  ficheDisplay: relatedClient
								? `${relatedClient.name} - ${relatedClient.ficheNumber}`
								: `Fiche : ${interventionId}`,
							});
						  
							setCountTotal((prev) => prev + 1);
							if (imageType === "etiquette") setCountEtiquette((prev) => prev + 1);
							if (imageType === "supplementaire") setCountSupp((prev) => prev + 1);
						  });
						  
                    }

                    processedFolders++;
                    const newValue = processedFolders / totalFolders;
                    setRawProgress(newValue);
                    Animated.timing(animatedProgress, {
                        toValue: newValue,
                        duration: 200,
                        useNativeDriver: false,
                    }).start();
                }
            }

            allImages.sort(
                (a, b) => new Date(b.created_at) - new Date(a.created_at)
            );
            setImages(allImages);
            setLoading(false);
        };

        fetchData();
    }, []);

    const copyToClipboard = (url) => {
        Clipboard.setString(url);
        Alert.alert("Lien copié dans le presse-papier");
    };

    const confirmDeleteImage = (path) => {
        Alert.alert(
            "Confirmer la suppression",
            "Es-tu sûr de vouloir supprimer cette image ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    style: "destructive",
                    onPress: () => deleteImage(path),
                },
            ]
        );
    };

    const deleteImage = async (path) => {
        const { error } = await supabase.storage.from("images").remove([path]);
        if (error) {
            console.error("Erreur suppression :", error);
        } else {
            Alert.alert("Image supprimée");
            setImages((prev) => prev.filter((img) => img.path !== path));
        }
    };

    const filteredImages = images.filter((img) => {
        const matchSearch = img.ficheDisplay
            .toLowerCase()
            .includes(search.toLowerCase());
        const matchType = typeFilter ? img.type === typeFilter : true;
        return matchSearch && matchType;
    });
    const totalCount = images.length;
    const etiquetteCount = images.filter(
        (img) => img.type === "etiquette"
    ).length;
    const supplementaireCount = images.filter(
        (img) => img.type === "supplementaire"
    ).length;

    const indexOfLastImage = currentPage * imagesPerPage;
    const indexOfFirstImage = indexOfLastImage - imagesPerPage;
    const currentImages = filteredImages.slice(
        indexOfFirstImage,
        indexOfLastImage
    );
    const totalPages = Math.ceil(filteredImages.length / imagesPerPage);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>IMAGES STOCKÉES DANS LE CLOUD</Text>

            <View style={styles.filters}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="🔍 Nom ou numéro de fiche"
                    placeholderTextColor="#888"
                    value={search}
                    onChangeText={setSearch}
                />

<View style={styles.filterRow}>
    <TouchableOpacity
        style={[
            styles.filterButtonSmall,
            typeFilter === null && styles.activeFilter,
        ]}
        onPress={() => setTypeFilter(null)}
    >
        <Text style={styles.filterButtonText}>Toutes</Text>
        <Text style={styles.countText}>{countTotal}</Text>
    </TouchableOpacity>

    <TouchableOpacity
        style={[
            styles.filterButtonSmall,
            typeFilter === "etiquette" && styles.activeFilter,
        ]}
        onPress={() => setTypeFilter("etiquette")}
    >
        <Text style={styles.filterButtonText}>Étiquettes</Text>
        <Text style={styles.countText}>{countEtiquette}</Text>
    </TouchableOpacity>

    <TouchableOpacity
        style={[
            styles.filterButtonSmall,
            typeFilter === "supplementaire" && styles.activeFilter,
        ]}
        onPress={() => setTypeFilter("supplementaire")}
    >
        <Text style={styles.filterButtonText}>Supplémentaires</Text>
        <Text style={styles.countText}>{countSupp}</Text>
    </TouchableOpacity>
	<TouchableOpacity
    style={[
        styles.filterButtonSmall,
        typeFilter === "old" && styles.activeFilter,
    ]}
    onPress={() => setTypeFilter("old")}
>
    <Text style={styles.filterButtonText}>Old</Text>
    <Text style={styles.countText}>{countOld}</Text>
</TouchableOpacity>

</View>

            </View>

            {loading && (
                <View>
                    <Text style={{ textAlign: "center", marginTop: 8 }}>
                        Chargement en cours... {(rawProgress * 100).toFixed(0)}%
                    </Text>
                    <View style={styles.progressBarContainer}>
                        <Animated.View
                            style={[
                                styles.progressBar,
                                {
                                    width: animatedProgress.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ["0%", "100%"],
                                    }),
                                },
                            ]}
                        />
                    </View>
                </View>
            )}
            <FlatList
                contentContainerStyle={{ paddingBottom: 100 }}
                data={currentImages}
                keyExtractor={(item) => item.path}
                numColumns={4}
                renderItem={({ item }) => (
                    <View style={styles.imageWrapper}>
                        <View
                            style={[
                                styles.imageBlock,
                                item.type === "etiquette" && {
                                    borderColor: "#49fa03",
                                    borderWidth: 2,
                                },
                            ]}
                        >
                            <TouchableOpacity
                                onPress={() => setSelectedImage(item.url)}
                            >
                                <Image
                                    source={{ uri: item.url }}
                                    style={styles.thumbnail}
                                />
                            </TouchableOpacity>
                            <Text style={styles.ficheText}>
                                {item.ficheDisplay}
                            </Text>
                            <Text style={styles.dateText}>
                                🕓{" "}
                                {new Date(item.created_at).toLocaleDateString()}
                            </Text>
                            <View style={styles.imageActions}>
                                <Pressable
                                    style={styles.actionButton}
                                    onPress={() => setSelectedImage(item.url)}
                                >
                                    <Text style={styles.actionText}>Zoom</Text>
                                </Pressable>
                                <Pressable
                                    style={[
                                        styles.actionButton,
                                        { backgroundColor: "#d9534f" },
                                    ]}
                                    onPress={() =>
                                        confirmDeleteImage(item.path)
                                    }
                                >
                                    <Text style={styles.actionText}>
                                        Supprimer
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    </View>
                )}
            />

            <Modal
                visible={!!selectedImage}
                transparent
                onRequestClose={() => setSelectedImage(null)}
            >
                <View style={styles.modalOverlay}>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => setSelectedImage(null)}
                    >
                        <Text style={{ fontSize: 30, color: "white" }}>✖</Text>
                    </TouchableOpacity>
                    {selectedImage && (
                        <Image
                            source={{ uri: selectedImage }}
                            style={styles.fullscreenImage}
                            resizeMode="contain"
                        />
                    )}
                </View>
            </Modal>

            {!loading && (
                <View style={styles.bottomBar}>
                    <View style={styles.pagination}>
                        <TouchableOpacity
                            onPress={() =>
                                setCurrentPage((prev) => Math.max(prev - 1, 1))
                            }
                            disabled={currentPage === 1}
                        >
                            <Text style={styles.pageButton}>⬅️</Text>
                        </TouchableOpacity>

                        <Text style={styles.pageNumber}>
                            Page {currentPage} sur {totalPages}
                        </Text>

                        <TouchableOpacity
                            onPress={() =>
                                setCurrentPage((prev) =>
                                    indexOfLastImage < filteredImages.length
                                        ? prev + 1
                                        : prev
                                )
                            }
                            disabled={indexOfLastImage >= filteredImages.length}
                        >
                            <Text style={styles.pageButton}>➡️</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={styles.bottomBackButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.bottomBackButtonText}>
                            ⬅ Retour à l'accueil
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { padding: 12, backgroundColor: "#fff", flex: 1 },
    title: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 12,
        textAlign: "center",
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: "#eeeeee",
        borderRadius: 3,
        marginHorizontal: 20,
        marginTop: 8,
        overflow: "hidden",
    },
    progressBar: {
        height: "100%",
        backgroundColor: "#31a005",
    },
    imageWrapper: { width: "25%", padding: 6 },
    imageBlock: {
        alignItems: "center",
        backgroundColor: "#f4f4f4",
        padding: 6,
        borderRadius: 6,
        borderColor: "#ccc",
        borderWidth: 1,
    },
    thumbnail: {
        width: "100%",
        aspectRatio: 1,
        marginBottom: 4,
        borderRadius: 4,
    },
    ficheText: {
        fontSize: 12,
        marginBottom: 2,
        fontWeight: "bold",
        textAlign: "center",
    },
    dateText: { fontSize: 11, color: "#666", marginBottom: 4 },
    imageActions: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 8,
        marginTop: 6,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 6,
        backgroundColor: "#007bff",
        borderRadius: 6,
        alignItems: "center",
    },
    actionText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 13,
    },
    pagination: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 20,
        gap: 20,
    },
    pageButton: { fontSize: 18 },
    pageNumber: { fontSize: 16, fontWeight: "bold" },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.9)",
        justifyContent: "center",
        alignItems: "center",
    },
    fullscreenImage: { width: "90%", height: "90%" },
    closeButton: { position: "absolute", top: 30, right: 20, zIndex: 2 },
    searchInput: {
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        padding: 8,
        marginBottom: 12,
        color: "#000",
        backgroundColor: "#f0f0f0",
    },
    filters: { marginBottom: 12 },
    filterButtons: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        marginTop: 12,
    },
    filterButtonFull: {
        flexBasis: "32%",
        backgroundColor: "#f0f0f0",
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: "center",
        marginBottom: 8,
    },
    filterButtonText: {
        fontWeight: "600",
        color: "#000000",
    },
    activeFilter: {
        backgroundColor: "#88ca98",
        fontWeight: "800",
        color: "#ffffff",
    },
    backButton: { marginBottom: 10 },
    backButtonText: { color: "#007bff", fontSize: 16 },
    countText: {
        fontSize: 12,
        fontWeight: "bold",
        color: "#555",
        marginTop: 4,
    },
    pageNumber: {
        fontSize: 16,
        fontWeight: "bold",
        color: "#444",
    },
    bottomBar: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#fff",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderTopWidth: 1,
        borderColor: "#ccc",
        alignItems: "center",
        justifyContent: "center",
    },
    bottomBackButton: {
        backgroundColor: "#007bff",
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 6,
    },
    bottomBackButtonText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "bold",
    },
	filterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
},
filterButtonSmall: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    minWidth: 70,
},
});
