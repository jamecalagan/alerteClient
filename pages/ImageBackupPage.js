import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    Alert,
    ActivityIndicator,
    ScrollView,
    Image,
    StyleSheet,
    TouchableOpacity,
    Dimensions,
    Pressable,
} from "react-native";
import * as FileSystem from "expo-file-system";
import { supabase } from "../supabaseClient";
import { StorageAccessFramework } from "expo-file-system";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ImageBackupPage = () => {
    const [loading, setLoading] = useState(false);
    const [count, setCount] = useState(0);
    const [total, setTotal] = useState(0);
    const [folders, setFolders] = useState([]);
    const [expandedFolders, setExpandedFolders] = useState([]);
    const [selectedImage, setSelectedImage] = useState(null);
    const [lastBackupDate, setLastBackupDate] = useState(null);
	const [pendingExport, setPendingExport] = useState(false);
    const [exportCount, setExportCount] = useState(0);
    const [exportTotal, setExportTotal] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 64;
    const navigation = useNavigation();
    const toggleFolder = (folder) => {
        setExpandedFolders((prev) => (prev.includes(folder) ? [] : [folder]));
    };
    const getLastBackupDate = async () => {
        try {
            const timestamp = await AsyncStorage.getItem(
                "lastImageBackupReminder"
            );
            if (timestamp) {
                const date = new Date(parseInt(timestamp, 10));
                const formatted =
                    date.toLocaleDateString("fr-FR") +
                    " à " +
                    date.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                    });
                setLastBackupDate(formatted);
            }
        } catch (e) {
            console.error("Erreur récupération date sauvegarde :", e);
        }
    };

    const backupImages = async () => {
        try {
            setLoading(true);
            setCount(0);
            setTotal(0);

            const { data: clients, error: clientError } = await supabase
                .from("clients")
                .select("id, ficheNumber");
            if (clientError) throw clientError;

            const { data: interventions, error: interventionError } =
                await supabase
                    .from("interventions")
                    .select(
                        "id, client_id, label_photo, photos, signatureIntervention"
                    );
            if (interventionError) throw interventionError;

            let totalImages = 0;
            interventions.forEach((intervention) => {
                if (
                    intervention.label_photo &&
                    intervention.label_photo.startsWith("https")
                )
                    totalImages += 1;
                if (intervention.photos && Array.isArray(intervention.photos)) {
                    totalImages += intervention.photos.filter(
                        (p) => typeof p === "string" && p.startsWith("https")
                    ).length;
                }
                if (intervention.signatureIntervention) totalImages += 1;
            });
            setTotal(totalImages);

            for (const intervention of interventions) {
                const client = clients.find(
                    (c) => c.id === intervention.client_id
                );
                if (!client) continue;

                const folderPath = `${FileSystem.documentDirectory}backup/${client.ficheNumber}/`;
                const folderInfo = await FileSystem.getInfoAsync(folderPath);
                if (!folderInfo.exists)
                    await FileSystem.makeDirectoryAsync(folderPath, {
                        intermediates: true,
                    });

                if (
                    intervention.label_photo &&
                    intervention.label_photo.startsWith("https")
                ) {
                    const labelUri = `${folderPath}etiquette_${intervention.id}.jpg`;
                    await FileSystem.downloadAsync(
                        intervention.label_photo,
                        labelUri
                    );
                    setCount((prev) => prev + 1);
                }

                if (intervention.photos && Array.isArray(intervention.photos)) {
                    for (let i = 0; i < intervention.photos.length; i++) {
                        const photoUrl = intervention.photos[i];
                        if (photoUrl && photoUrl.startsWith("https")) {
                            const photoUri = `${folderPath}photo_${
                                intervention.id
                            }_${i + 1}.jpg`;
                            await FileSystem.downloadAsync(photoUrl, photoUri);
                            setCount((prev) => prev + 1);
                        }
                    }
                }

                // 🔏 Sauvegarde de la signature si présente
                if (intervention.signatureIntervention) {
                    const signature = intervention.signatureIntervention;
                    const signaturePath = `${folderPath}signature_${intervention.id}.jpg`;

                    if (signature.startsWith("data:image")) {
                        const base64Data = signature.split(",")[1];
                        await FileSystem.writeAsStringAsync(
                            signaturePath,
                            base64Data,
                            { encoding: FileSystem.EncodingType.Base64 }
                        );
                        setCount((prev) => prev + 1);
                    } else if (signature.startsWith("https")) {
                        await FileSystem.downloadAsync(
                            signature,
                            signaturePath
                        );
                        setCount((prev) => prev + 1);
                    }
                }
            }

            Alert.alert("✅ Sauvegarde terminée");
            await listSavedImages();
        } catch (e) {
            console.error(e);
            Alert.alert("❌ Erreur pendant la sauvegarde");
        } finally {
            setLoading(false);
        }
    };

    const exportAllImagesFlat = async (shouldClearBeforeExport = false) => {
		setExportCount(0);
		setExportTotal(0);
	  
		try {
		  const baseDir = FileSystem.documentDirectory + "backup/";
		  const exportTemp = FileSystem.documentDirectory + "export-temp/";
	  
		  const info = await FileSystem.getInfoAsync(exportTemp);
		  if (info.exists) {
			await FileSystem.deleteAsync(exportTemp, { idempotent: true });
		  }
		  await FileSystem.makeDirectoryAsync(exportTemp, { intermediates: true });
	  
		  const folders = await FileSystem.readDirectoryAsync(baseDir);
		  const sortedFolderNames = folders.sort();
	  
		  let copied = 0;
		  let total = 0;
	  
		  for (const folder of sortedFolderNames) {
			const folderPath = `${baseDir}${folder}/`;
			const files = await FileSystem.readDirectoryAsync(folderPath);
			total += files.length;
		  }
	  
		  setExportTotal(total);
	  
		  const folderPicker = await StorageAccessFramework.requestDirectoryPermissionsAsync();
		  if (!folderPicker.granted) {
			Alert.alert("Permission refusée", "Impossible d'accéder au dossier sélectionné.");
			return;
		  }
	  
		  const folderUri = folderPicker.directoryUri;
		  console.log("📂 Dossier SAF sélectionné :", folderUri);
	  
		  // ✅ Suppression des fichiers SAF si demandé
		  if (shouldClearBeforeExport) {
			console.log("🧹 Suppression activée, tentative de lecture du dossier...");
			try {
			  const children = await StorageAccessFramework.readDirectoryAsync(folderUri);
			  console.log("📄 Fichiers trouvés :", children.length);
			  for (const fileUri of children) {
				try {
				  await StorageAccessFramework.deleteAsync(fileUri);
				  console.log("🗑️ Supprimé :", fileUri);
				} catch (error) {
				  console.log("❌ Échec suppression :", fileUri, error);
				}
			  }
			  console.log("✅ Dossier vidé !");
			} catch (err) {
			  console.log("⚠️ Impossible de lire le dossier :", err);
			  Alert.alert(
				"Attention",
				"Impossible de vider le dossier sélectionné. Les anciennes images peuvent être dupliquées."
			  );
			}
		  }
		  
	  
		  // ▶️ Export
		  for (const itemName of sortedFolderNames) {
			const folderPath = `${baseDir}${itemName}/`;
			const folderInfo = await FileSystem.getInfoAsync(folderPath);
			if (!folderInfo.exists) continue;
	  
			const files = await FileSystem.readDirectoryAsync(folderPath);
	  
			for (const file of files) {
			  const sourcePath = `${folderPath}${file}`;
			  const fileInfo = await FileSystem.getInfoAsync(sourcePath);
			  if (!fileInfo.exists) continue;
	  
			  const targetFileName = `${itemName}_${file}`;
	  
			  try {
				const fileUri = await StorageAccessFramework.createFileAsync(
				  folderUri,
				  targetFileName,
				  "image/jpeg"
				);
	  
				const base64Data = await FileSystem.readAsStringAsync(sourcePath, {
				  encoding: FileSystem.EncodingType.Base64,
				});
	  
				await FileSystem.writeAsStringAsync(fileUri, base64Data, {
				  encoding: FileSystem.EncodingType.Base64,
				});
	  
				copied++;
				setExportCount(copied);
				await new Promise((resolve) => setTimeout(resolve, 20));
			  } catch (error) {
				console.error("❌ ERREUR lors de l'export :", error);
				Alert.alert("Erreur d'export", `Impossible de sauvegarder ${file}`);
			  }
			}
		  }
	  
		  Alert.alert("Export terminé", "Toutes les images ont été exportées avec succès !");
		} catch (error) {
		  console.error("❌ ERREUR générale :", error);
		  Alert.alert("Erreur", "Une erreur s'est produite pendant l'export.");
		}
	  };
	  

    const cleanBackupFolder = async () => {
        try {
            const baseDir = FileSystem.documentDirectory + "backup/";
            const folderNames = await FileSystem.readDirectoryAsync(baseDir);

            for (const itemName of folderNames) {
                if (itemName.includes(".")) {
                    const fullPath = `${baseDir}${itemName}`;
                    try {
                        await FileSystem.deleteAsync(fullPath, {
                            idempotent: true,
                        });
                        console.log(`🧹 Supprimé : ${itemName}`);
                    } catch (err) {
                        console.warn(
                            `❌ Impossible de supprimer : ${itemName}`,
                            err
                        );
                    }
                }
            }

            Alert.alert(
                "🧹 Nettoyage terminé",
                "Fichiers mal placés supprimés."
            );
            await listSavedImages();
        } catch (e) {
            console.error("Erreur nettoyage :", e);
            Alert.alert("❌ Erreur pendant le nettoyage.");
        }
    };
	const askBeforeExport = () => {
		Alert.alert(
		  "Vider le dossier ?",
		  "Souhaitez-vous vider le dossier sélectionné avant l'exportation ?",
		  [
			{
			  text: "Non",
			  onPress: () => exportAllImagesFlat(false),
			  style: "cancel",
			},
			{
			  text: "Oui",
			  onPress: () => exportAllImagesFlat(true),
			},
		  ]
		);
	  };
    const deleteImage = async (imageUri) => {
        try {
            await FileSystem.deleteAsync(imageUri, { idempotent: true });
            Alert.alert("🗑️ Image supprimée");
            await listSavedImages();
        } catch (e) {
            console.error("Erreur suppression :", e);
        }
    };
    const checkWeeklyReminder = async () => {
        try {
            const last = await AsyncStorage.getItem("lastImageBackupReminder");
            const now = new Date().getTime();

            if (!last || now - parseInt(last, 10) > 7 * 24 * 60 * 60 * 1000) {
                Alert.alert(
                    "🕒 Rappel",
                    "Pense à sauvegarder les images cette semaine !"
                );
                await AsyncStorage.setItem(
                    "lastImageBackupReminder",
                    Date.now().toString()
                );
                await getLastBackupDate(); // pour actualiser après sauvegarde
            }
        } catch (e) {
            console.error("Erreur rappel hebdo :", e);
        }
    };

    const listSavedImages = async () => {
        try {
            const baseDir = FileSystem.documentDirectory + "backup/";
            const dirInfo = await FileSystem.getInfoAsync(baseDir);
            if (!dirInfo.exists) {
                setFolders([]);
                return;
            }

            const folderNames = await FileSystem.readDirectoryAsync(baseDir);
            const folderData = [];

            for (const itemName of folderNames) {
                const fullPath = `${baseDir}${itemName}`;
                const info = await FileSystem.getInfoAsync(fullPath);
                if (!info.exists || !info.isDirectory) continue;

                const fileNames = await FileSystem.readDirectoryAsync(fullPath);

                const images = fileNames.map((file) => ({
                    uri: `${fullPath}/${file}`,
                    name: file,
                }));

                folderData.push({ folder: itemName, images });
            }

            const sorted = folderData.sort((a, b) => {
                const numA = parseInt(a.folder.replace(/\D/g, ""), 10);
                const numB = parseInt(b.folder.replace(/\D/g, ""), 10);
                return numB - numA; // tri décroissant
            });

            setFolders(sorted);
        } catch (e) {
            console.error("Erreur lors du chargement des images :", e);
        }
    };

    useEffect(() => {
        listSavedImages();
        getLastBackupDate();
        checkWeeklyReminder(); // 👈 ajoute cette ligne
    }, []);

    const screenWidth = Dimensions.get("window").width;
    const folderSize = screenWidth / 9 - 10; // 9 colonnes

    const renderButton = (label, onPress, backgroundColor) => (
        <Pressable
            onPress={onPress}
            style={[styles.customButton, { backgroundColor }]}
        >
            <Text style={styles.buttonText}>{label}</Text>
        </Pressable>
    );
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const visibleFolders = folders.slice(startIndex, endIndex);
    const totalPages = Math.ceil(folders.length / itemsPerPage);
	
    return (
        <ScrollView style={{ flex: 1, padding: 10 }}>
            <View style={styles.buttonGroup}>
                {renderButton(" Charger tout", backupImages, "#26a32b")}
                {renderButton(" Exporter tout", askBeforeExport, "#296494")}



                {renderButton(" Nettoyer", cleanBackupFolder, "#fc0000")}
            </View>
            {exportTotal > 0 && (
                <Text style={{ textAlign: "center", marginBottom: 10 }}>
                    Exportation : {exportCount} / {exportTotal}
                </Text>
            )}
            {loading && (
                <View style={{ alignItems: "center", marginVertical: 15 }}>
                    <ActivityIndicator size="large" color="blue" />
                    <Text style={{ marginTop: 10 }}>
                        Images sauvegardées : {count} / {total}
                    </Text>
                </View>
            )}

            <View style={styles.grid}>
                {visibleFolders.map(({ folder, images }) => (
                    <View key={folder} style={{ marginBottom: 20 }}>
                        <TouchableOpacity
                            onPress={() => toggleFolder(folder)}
                            style={[
                                styles.folderBox,
                                {
                                    width: folderSize,
                                    height: folderSize,
                                    backgroundColor: expandedFolders.includes(
                                        folder
                                    )
                                        ? "#a5d6a7"
                                        : "#e0e0e0", // vert si sélectionné
                                },
                            ]}
                        >
                            <Text style={styles.folderText}>{folder}</Text>
                        </TouchableOpacity>

                        {expandedFolders.includes(folder) && (
                            <View style={styles.imageGrid}>
                                {images.map((image) => (
                                    <TouchableOpacity
                                        key={image.uri}
                                        onPress={() =>
                                            setSelectedImage(image.uri)
                                        }
                                        onLongPress={() =>
                                            deleteImage(image.uri)
                                        }
                                    >
                                        <Image
                                            source={{ uri: image.uri }}
                                            style={styles.thumbnail}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                ))}
            </View>
            {selectedImage && (
                <View style={styles.fullscreenContainer}>
                    <TouchableOpacity
                        style={styles.closeButton}
                        onPress={() => setSelectedImage(null)}
                    >
                        <Text style={styles.closeText}>✖</Text>
                    </TouchableOpacity>
                    <Image
                        source={{ uri: selectedImage }}
                        style={styles.fullscreenImage}
                        resizeMode="contain"
                    />
                </View>
            )}
            <View style={styles.pagination}>
                <Pressable
                    onPress={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    style={styles.pageButton}
                    disabled={currentPage === 1}
                >
                    <Text style={styles.pageText}>⬅ Précédent</Text>
                </Pressable>

                <Text style={styles.pageNumber}>
                    Page {currentPage} / {totalPages}
                </Text>

                <Pressable
                    onPress={() =>
                        setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    style={styles.pageButton}
                    disabled={currentPage === totalPages}
                >
                    <Text style={styles.pageText}>Suivant ➡</Text>
                </Pressable>
            </View>
            {lastBackupDate && (
                <Text
                    style={{
                        textAlign: "center",
                        marginBottom: 20,
                        color: "#666",
                    }}
                >
                    📅 Dernière sauvegarde effectuée le : {lastBackupDate}
                </Text>
            )}
            <View style={{ padding: 10 }}>
                <Pressable
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                >
                    <Text style={styles.backButtonText}>⬅ Retour</Text>
                </Pressable>
            </View>


        </ScrollView>
		
    );
};

const styles = StyleSheet.create({
    buttonGroup: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
        marginBottom: 20,
        marginTop: 50,
        gap: 10,
    },
    customButton: {
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 10,
        margin: 5,
        minWidth: 120,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    buttonText: {
        color: "white",
        fontWeight: "bold",
        fontSize: 14,
    },
    folderBox: {
        backgroundColor: "#e0e0e0",
        margin: 4,
        borderRadius: 8,
        justifyContent: "center",
        alignItems: "center",
    },
    folderText: {
        textAlign: "center",
        fontWeight: "bold",
        fontSize: 12,
        padding: 4,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "center",
    },
    imageGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        marginTop: 10,
        gap: 6,
    },
    thumbnail: {
        width: 100,
        height: 100,
        margin: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#ccc",
    },
    fullscreenContainer: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(214, 214, 214, 0.9)",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10,
    },
    fullscreenImage: {
        width: "90%",
        height: "80%",
        borderRadius: 10,
    },
    closeButton: {
        position: "absolute",
        top: 30,
        right: 20,
        zIndex: 11,
        backgroundColor: "#fff",
        padding: 10,
        borderRadius: 20,
    },
    closeText: {
        fontSize: 18,
        fontWeight: "bold",
    },
    backButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: "#ccc",
        alignSelf: "center",
        borderRadius: 8,
        marginBottom: 10,
    },
    backButtonText: {
        fontWeight: "bold",
        fontSize: 14,
    },
    pagination: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 10,
        marginTop: 10,
    },
    pageButton: {
        padding: 10,
        backgroundColor: "#ddd",
        borderRadius: 8,
    },
    pageText: {
        fontWeight: "bold",
    },
    pageNumber: {
        fontSize: 14,
        fontWeight: "bold",
    },
});

export default ImageBackupPage;
