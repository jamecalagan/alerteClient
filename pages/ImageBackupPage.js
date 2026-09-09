import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Pressable,
} from "react-native";
import CustomAlert from "../components/CustomAlert";
import AlertBox from "../components/AlertBox";
import BackButton from "../components/BackButton";

// ⭐ Utiliser UNIQUEMENT la version legacy
import * as FileSystem from "expo-file-system/legacy";
// ⭐ Récupérer SAF depuis le même module
const { StorageAccessFramework } = FileSystem;

import { supabase } from "../supabaseClient";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Exécute `worker` sur chaque élément de `items` avec au plus `concurrency`
// tâches en vol simultanément (au lieu d'un traitement séquentiel un par un,
// bien plus lent pour des centaines/milliers de fichiers).
const runWithConcurrency = async (items, worker, concurrency = 8) => {
  let index = 0;
  const runners = new Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (index < items.length) {
        const current = index++;
        await worker(items[current], current);
      }
    });
  await Promise.all(runners);
};

const getFileNameFromSAFUri = (uri) => {
  if (!uri) return "";
  try {
    const decoded = decodeURIComponent(uri);
    const parts = decoded.split(/[/]/);
    return parts[parts.length - 1].split(":").pop();
  } catch {
    return uri;
  }
};

export default function ImageBackupPage() {
  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message || "");
    setAlertVisible(true);
  };
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [folders, setFolders] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageToDelete, setImageToDelete] = useState(null);

  const deleteImage = async (folder, uri) => {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      setFolders((prev) =>
        prev.map((f) =>
          f.folder === folder
            ? { ...f, images: f.images.filter((img) => img.uri !== uri) }
            : f
        )
      );
      if (selectedImage === uri) setSelectedImage(null);
    } catch (e) {
      console.error("Erreur suppression image locale :", e);
      showAlert("Erreur", "Impossible de supprimer cette image.");
    }
  };
  const [lastBackupDate, setLastBackupDate] = useState(null);
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
      const timestamp = await AsyncStorage.getItem("lastImageBackupReminder");
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

      const { data: interventions, error: interventionError } = await supabase
        .from("interventions")
        .select("id, client_id, label_photo, photos, signatureIntervention");
      if (interventionError) throw interventionError;

      const clientsById = new Map(clients.map((c) => [c.id, c]));

      // 1) Construit à plat la liste de tous les fichiers à sauvegarder
      // (au lieu de traiter chaque intervention/photo une par une en
      // séquentiel, ce qui était très lent).
      const foldersNeeded = new Set();
      const tasks = [];

      for (const intervention of interventions) {
        const client = clientsById.get(intervention.client_id);
        if (!client) continue;

        const folderPath = `${FileSystem.documentDirectory}backup/${client.ficheNumber}/`;
        foldersNeeded.add(folderPath);

        if (
          intervention.label_photo &&
          intervention.label_photo.startsWith("https")
        ) {
          tasks.push({
            type: "download",
            remoteUrl: intervention.label_photo,
            localUri: `${folderPath}etiquette_${intervention.id}.jpg`,
          });
        }

        if (Array.isArray(intervention.photos)) {
          intervention.photos.forEach((photoUrl, i) => {
            if (typeof photoUrl === "string" && photoUrl.startsWith("https")) {
              tasks.push({
                type: "download",
                remoteUrl: photoUrl,
                localUri: `${folderPath}photo_${intervention.id}_${i + 1}.jpg`,
              });
            }
          });
        }

        if (intervention.signatureIntervention) {
          const signaturePath = `${folderPath}signature_${intervention.id}.jpg`;
          const signature = intervention.signatureIntervention;
          if (signature.startsWith("data:image")) {
            tasks.push({
              type: "base64",
              data: signature.split(",")[1],
              localUri: signaturePath,
            });
          } else if (signature.startsWith("https")) {
            tasks.push({
              type: "download",
              remoteUrl: signature,
              localUri: signaturePath,
            });
          }
        }
      }

      // 2) Crée tous les dossiers clients nécessaires, en parallèle.
      await runWithConcurrency(
        Array.from(foldersNeeded),
        async (folderPath) => {
          const info = await FileSystem.getInfoAsync(folderPath);
          if (!info.exists) {
            await FileSystem.makeDirectoryAsync(folderPath, {
              intermediates: true,
            });
          }
        },
        8
      );

      // 3) Filtre les fichiers déjà présents localement (vérif en parallèle).
      const missingTasks = [];
      await runWithConcurrency(
        tasks,
        async (task) => {
          const info = await FileSystem.getInfoAsync(task.localUri);
          if (!info.exists) missingTasks.push(task);
        },
        12
      );

      setTotal(missingTasks.length);

      // 4) Télécharge/écrit réellement les fichiers manquants, en parallèle.
      let done = 0;
      await runWithConcurrency(
        missingTasks,
        async (task) => {
          try {
            if (task.type === "download") {
              await FileSystem.downloadAsync(task.remoteUrl, task.localUri);
            } else {
              await FileSystem.writeAsStringAsync(task.localUri, task.data, {
                encoding: FileSystem.EncodingType.Base64,
              });
            }
          } finally {
            done += 1;
            setCount(done);
          }
        },
        8
      );

      showAlert("✅ Sauvegarde terminée");
      await listSavedImages();
      await AsyncStorage.setItem(
        "lastImageBackupReminder",
        Date.now().toString()
      );
      await getLastBackupDate();
    } catch (e) {
      console.error(e);
      showAlert("❌ Erreur pendant la sauvegarde");
    } finally {
      setLoading(false);
    }
  };

  // ⭐ VERSION corrigée : export avec SAF (legacy) de bout en bout
  const exportMissingImagesFlat = async () => {
    setExportCount(0);
    setExportTotal(0);

    try {
      const baseDir = FileSystem.documentDirectory + "backup/";

      // Si aucun backup local, éviter l'exception directe
      const baseInfo = await FileSystem.getInfoAsync(baseDir);
      if (!baseInfo.exists) {
        showAlert(
          "Aucune sauvegarde locale",
          "Aucun dossier 'backup' trouvé. Lance d'abord « Charger manquant »."
        );
        return;
      }

      // Choix du dossier externe via SAF
      const picker =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!picker.granted) {
        showAlert(
          "Permission refusée",
          "Impossible d'accéder au dossier sélectionné."
        );
        return;
      }
      const folderUri = picker.directoryUri;
      console.log("📂 Dossier SAF sélectionné :", folderUri);

      // Lire les fichiers déjà présents dans le dossier SAF
      let existingNames = new Set();
      try {
        const children = await StorageAccessFramework.readDirectoryAsync(
          folderUri
        );
        existingNames = new Set(children.map(getFileNameFromSAFUri));
      } catch (e) {
        console.log("⚠️ Impossible de lire le contenu du dossier SAF :", e);
      }

      // Lister tous les fichiers de backup
      const folderNames = await FileSystem.readDirectoryAsync(baseDir);
      const sortedFolderNames = folderNames.sort();

      const filesToCopy = [];
      for (const folder of sortedFolderNames) {
        const folderPath = `${baseDir}${folder}/`;
        const files = await FileSystem.readDirectoryAsync(folderPath);
        for (const file of files) {
          const targetName = `${folder}_${file}`; // même logique que l'export original
          if (!existingNames.has(targetName)) {
            filesToCopy.push({
              source: `${folderPath}${file}`,
              target: targetName,
            });
          }
        }
      }

      if (filesToCopy.length === 0) {
        showAlert(
          "👍 Rien à exporter",
          "Toutes les images sont déjà présentes dans le dossier cible."
        );
        return;
      }

      setExportTotal(filesToCopy.length);

      // Copie en parallèle (par petits lots, la SAF supportant moins bien une
      // concurrence élevée que le système de fichiers direct) au lieu d'un
      // fichier à la fois avec un délai artificiel de 20ms entre chacun.
      let copied = 0;
      await runWithConcurrency(
        filesToCopy,
        async ({ source, target }) => {
          try {
            // Création du fichier dans le dossier externe
            const fileUri = await StorageAccessFramework.createFileAsync(
              folderUri,
              target,
              "image/jpeg"
            );

            // Lecture du fichier local en Base64
            const base64Data = await FileSystem.readAsStringAsync(source, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // ⭐ Écriture via SAF (nouveau pattern SDK 54)
            await StorageAccessFramework.writeAsStringAsync(
              fileUri,
              base64Data,
              { encoding: FileSystem.EncodingType.Base64 }
            );

            copied++;
            setExportCount(copied);
          } catch (err) {
            console.error("❌ ERREUR export d'un fichier :", err);
          }
        },
        4
      );

      showAlert(
        "Export terminé",
        `${copied} nouvelle(s) image(s) exportée(s) !`
      );
    } catch (error) {
      console.error("❌ ERREUR générale export :", error);
      showAlert(
        "Erreur",
        "Une erreur s'est produite pendant l'export : " +
          (error?.message || String(error))
      );
    }
  };

  const cleanBackupFolder = async () => {
    try {
      const baseDir = FileSystem.documentDirectory + "backup/";
      const folderNames = await FileSystem.readDirectoryAsync(baseDir);
      for (const itemName of folderNames) {
        if (itemName.includes(".")) {
          const fullPath = `${baseDir}${itemName}`;
          await FileSystem.deleteAsync(fullPath, { idempotent: true });
        }
      }
      showAlert("🧹 Nettoyage terminé", "Fichiers mal placés supprimés.");
      await listSavedImages();
    } catch (e) {
      console.error("Erreur nettoyage :", e);
      showAlert("❌ Erreur pendant le nettoyage.");
    }
  };

  const checkWeeklyReminder = async () => {
    try {
      const last = await AsyncStorage.getItem("lastImageBackupReminder");
      const now = Date.now();
      if (!last || now - parseInt(last, 10) > 7 * 24 * 60 * 60 * 1000) {
        showAlert(
          "🕒 Rappel",
          "Pense à sauvegarder les images cette semaine !"
        );
        await getLastBackupDate();
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
      // Scan des dossiers clients en parallèle (par lots) au lieu d'un par un.
      await runWithConcurrency(
        folderNames,
        async (itemName) => {
          const fullPath = `${baseDir}${itemName}`;
          const info = await FileSystem.getInfoAsync(fullPath);
          if (!info.exists || !info.isDirectory) return;
          const fileNames = await FileSystem.readDirectoryAsync(fullPath);
          const images = fileNames.map((file) => ({
            uri: `${fullPath}/${file}`,
            name: file,
          }));
          folderData.push({ folder: itemName, images });
        },
        10
      );
      const sorted = folderData.sort((a, b) => {
        const numA = parseInt(a.folder.replace(/\D/g, ""), 10);
        const numB = parseInt(b.folder.replace(/\D/g, ""), 10);
        return numB - numA;
      });
      setFolders(sorted);
    } catch (e) {
      console.error("Erreur lors du chargement des images :", e);
    }
  };

  useEffect(() => {
    listSavedImages();
    getLastBackupDate();
    checkWeeklyReminder();
  }, []);

  const screenWidth = Dimensions.get("window").width;
  const folderSize = screenWidth / 9 - 10;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const visibleFolders = folders.slice(startIndex, endIndex);
  const totalPages = Math.ceil(folders.length / itemsPerPage);

  const renderButton = (label, onPress, backgroundColor) => (
    <Pressable onPress={onPress} style={[styles.customButton, { backgroundColor }]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, padding: 10 }}>
      <View style={styles.buttonGroup}>
        {renderButton(" Charger manquant", backupImages, "#26a32b")}
        {renderButton(" Exporter manquant", exportMissingImagesFlat, "#296494")}
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
                  backgroundColor: expandedFolders.includes(folder)
                    ? "#a5d6a7"
                    : "#e0e0e0",
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
                    onPress={() => setSelectedImage(image.uri)}
                    onLongPress={() => setImageToDelete({ folder, image })}
                  >
                    <Image source={{ uri: image.uri }} style={styles.thumbnail} />
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
      <View style={styles.pager}>
        <Pressable
          style={[styles.pagerBtn, currentPage <= 1 && styles.pagerBtnDisabled]}
          disabled={currentPage <= 1}
          onPress={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
        >
          <Image
            source={require("../assets/icons/chevrong.png")}
            style={[
              styles.pagerIcon,
              { tintColor: currentPage <= 1 ? "#cbd5e1" : "#4338ca" },
            ]}
          />
        </Pressable>
        <Text style={styles.pagerInfo}>
          Page {currentPage} / {totalPages}
        </Text>
        <Pressable
          style={[
            styles.pagerBtn,
            currentPage >= totalPages && styles.pagerBtnDisabled,
          ]}
          disabled={currentPage >= totalPages}
          onPress={() =>
            setCurrentPage((prev) => Math.min(prev + 1, totalPages))
          }
        >
          <Image
            source={require("../assets/icons/chevrond.png")}
            style={[
              styles.pagerIcon,
              { tintColor: currentPage >= totalPages ? "#cbd5e1" : "#4338ca" },
            ]}
          />
        </Pressable>
      </View>
      {lastBackupDate && (
        <Text
          style={{ textAlign: "center", marginBottom: 20, color: "#666" }}
        >
          📅 Dernière sauvegarde effectuée le : {lastBackupDate}
        </Text>
      )}
      <View style={{ padding: 10 }}>
        <BackButton onPress={() => navigation.goBack()} />
      </View>

      <AlertBox
        visible={!!imageToDelete}
        title="Supprimer cette image ?"
        message="L'image sera supprimée de la sauvegarde locale (le fichier original en ligne n'est pas affecté)."
        cancelText="Annuler"
        confirmText="Supprimer"
        onClose={() => setImageToDelete(null)}
        onConfirm={() => {
          const target = imageToDelete;
          setImageToDelete(null);
          if (target) deleteImage(target.folder, target.image.uri);
        }}
      />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </ScrollView>
  );
}

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
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  pagerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderColor: "#c7d2fe",
  },
  pagerBtnDisabled: {
    backgroundColor: "#f3f4f6",
    borderColor: "#e5e7eb",
  },
  pagerIcon: {
    width: 18,
    height: 18,
  },
  pagerInfo: {
    minWidth: 100,
    textAlign: "center",
    fontWeight: "700",
    color: "#333",
  },
});
