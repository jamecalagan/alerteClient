import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Image, Button, Alert, StyleSheet, TouchableOpacity
} from 'react-native';
import { supabase } from '../supabaseClient';

export default function ImageCleanupPage() {
  const [interventions, setInterventions] = useState([]);
  const [extraImages, setExtraImages] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [archivedImages, setArchivedImages] = useState([]);
  const [storageImages, setStorageImages] = useState([]);
  const [selectedStorageImages, setSelectedStorageImages] = useState([]);
const [bulkDeleting, setBulkDeleting] = useState(false);
  const [eligibleInterventionsList, setEligibleInterventionsList] =
  useState([]);
const getImageUrl = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  const cleaned = value.trim();

  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  const storagePath = cleaned.startsWith("images/")
    ? cleaned.slice(7)
    : cleaned;

  const { data } = supabase.storage
    .from("images")
    .getPublicUrl(storagePath);


  return data?.publicUrl || "";
};

const toggleStorageImageSelection = (imageId) => {
  setSelectedStorageImages((current) => {
    if (current.includes(imageId)) {
      return current.filter((id) => id !== imageId);
    }

    return [...current, imageId];
  });
};

const selectAllStorageImages = () => {
  if (
    storageImages.length > 0 &&
    selectedStorageImages.length === storageImages.length
  ) {
    setSelectedStorageImages([]);
    return;
  }

  setSelectedStorageImages(
    storageImages.map((image) => image.id)
  );
};

const isAllStorageSelected =
  storageImages.length > 0 &&
  selectedStorageImages.length === storageImages.length;

useEffect(() => {
  const fetchData = async () => {
    setLoading(true);

    try {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      // 1. Interventions récupérées
      const { data: interventionData, error: intvError } =
        await supabase
          .from("interventions")
          .select('id, "updatedAt", photos, status, client_id')
          .eq("status", "Récupéré");

      if (intvError) throw intvError;

      // Toutes les interventions éligibles, même si photos est vide
      const eligibleInterventions = (interventionData || []).filter(
        (intervention) => {
          if (!intervention.updatedAt) return false;

          const restitutionDate = new Date(intervention.updatedAt);

          return (
            !Number.isNaN(restitutionDate.getTime()) &&
            restitutionDate < tenDaysAgo
          );
        }
      );

      const eligibleIds = new Set(
        eligibleInterventions.map((intervention) =>
          String(intervention.id)
        )
      );

      // 2. Clients
      const { data: clientsData, error: clientsError } =
        await supabase
          .from("clients")
          .select("id, name, ficheNumber");

      if (clientsError) throw clientsError;

      // 3. Photos encore enregistrées dans interventions.photos
      const interventionsWithPhotos = eligibleInterventions
        .filter(
          (intervention) =>
            Array.isArray(intervention.photos) &&
            intervention.photos.filter(Boolean).length > 0
        )
        .map((intervention) => ({
          ...intervention,
          photos: intervention.photos
            .filter(Boolean)
            .map((photo) => ({
              original: photo,
              url: getImageUrl(photo),
            }))
            .filter((photo) => photo.url),
        }));

      // 4. Ancienne table intervention_images
      let extraToClean = [];

      if (eligibleIds.size > 0) {
        const { data: extraImageData, error: extraImageError } =
          await supabase
            .from("intervention_images")
            .select(
              "id, intervention_id, image_data, created_at"
            )
            .in("intervention_id", [...eligibleIds]);

        if (extraImageError) throw extraImageError;

        extraToClean = (extraImageData || [])
          .filter(
            (image) =>
              typeof image.image_data === "string" &&
              image.image_data.trim().length > 0
          )
          .map((image) => ({
            ...image,
            original: image.image_data,
            image_url: getImageUrl(image.image_data),
          }))
          .filter((image) => image.image_url);
      }

      // 5. Dossiers Storage supplementaires/<interventionId>
      const { data: folders, error: foldersError } =
        await supabase.storage
          .from("images")
          .list("supplementaires", {
            limit: 1000,
            offset: 0,
          });

      if (foldersError) throw foldersError;

      const eligibleFolders = (folders || []).filter(
        (folder) =>
          folder?.name &&
          eligibleIds.has(String(folder.name))
      );

      const storageGroups = await Promise.all(
        eligibleFolders.map(async (folder) => {
          const interventionId = String(folder.name);
          const folderPath =
            `supplementaires/${interventionId}`;

          const { data: files, error: filesError } =
            await supabase.storage
              .from("images")
              .list(folderPath, {
                limit: 100,
                offset: 0,
                sortBy: {
                  column: "created_at",
                  order: "desc",
                },
              });

          if (filesError) {
            console.error(
              `❌ Lecture ${folderPath} :`,
              filesError
            );

            return [];
          }

          return (files || [])
            .filter(
              (file) =>
                file?.name &&
                file.name !== ".emptyFolderPlaceholder"
            )
            .map((file) => {
              const storagePath =
                `${folderPath}/${file.name}`;

              const { data: publicData } =
                supabase.storage
                  .from("images")
                  .getPublicUrl(storagePath);

              return {
                id: storagePath,
                intervention_id: interventionId,
                storage_path: storagePath,
                image_url:
                  publicData?.publicUrl || "",
              };
            })
            .filter((image) => image.image_url);
        })
      );

      const foundStorageImages = storageGroups.flat();

      setClients(clientsData || []);
	  setEligibleInterventionsList(eligibleInterventions);
      setInterventions(interventionsWithPhotos);
      setExtraImages(extraToClean);
      setStorageImages(foundStorageImages);

      console.log("🧹 Page nettoyage :", {
        interventionsPhotos:
          interventionsWithPhotos.length,
        extraImages: extraToClean.length,
        storageImages: foundStorageImages.length,
      });
    } catch (error) {
      console.error(
        "❌ Chargement nettoyage images :",
        error
      );

      setInterventions([]);
      setExtraImages([]);
      setStorageImages([]);
    } finally {
      setLoading(false);
    }
  };

  fetchData();
}, []);

const copyImageToOldImages = async (
  photoUrl,
  clientInfo = "",
  interventionId = ""
) => {
  try {
    const key = bucketKey(photoUrl);

    if (!key) {
      console.error("❌ Chemin image invalide :", photoUrl);
      return false;
    }

    const fileName = key.split("/").pop();

    if (!fileName) {
      console.error("❌ Nom de fichier introuvable :", key);
      return false;
    }

    const safeClientInfo = String(clientInfo || "client")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    const safeInterventionId = String(
      interventionId || "sans_intervention"
    ).replace(/[^a-zA-Z0-9_-]/g, "_");

    const destinationPath =
      `old_images/${safeClientInfo}_${safeInterventionId}_${fileName}`;

    const { error } = await supabase.storage
      .from("images")
      .copy(key, destinationPath);

    if (!error) {
      return true;
    }

    const errorMessage = String(
      error?.message || error || ""
    ).toLowerCase();

    const alreadyExists =
      errorMessage.includes("already exists") ||
      errorMessage.includes("resource already exists") ||
      error?.statusCode === 409 ||
      error?.status === 409;

    if (alreadyExists) {
      console.log(
        "ℹ️ Image déjà archivée :",
        destinationPath
      );

      // L’archive existe déjà : on autorise la suppression de l’original.
      return true;
    }

    console.error(
      "❌ Erreur copie Supabase :",
      error,
      {
        source: key,
        destination: destinationPath,
      }
    );

    return false;
  } catch (error) {
    console.error(
      "❌ Erreur archivage image :",
      error
    );

    return false;
  }
};


  const deleteImage = (imageUrl, interventionId, clientInfo, imageId = null) => {
    const isEtiquettePath = (url) =>
  /\/storage\/v1\/object\/(?:public|sign)\/images\/etiquettes\//i.test(url) ||
  /^images\/etiquettes\//i.test(url);

if (isEtiquettePath(imageUrl)) {
  Alert.alert("Refusé", "Ceci est une étiquette — non supprimée.");
  return;
}

    Alert.alert(
      "Confirmation de suppression",
      "Souhaites-tu vraiment archiver puis supprimer cette image ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Oui, supprimer",
          style: "destructive",
          onPress: async () => {
            const success = await copyImageToOldImages(imageUrl, clientInfo);
            if (!success) return;

            const pathToDelete = imageUrl.replace(
              'https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/',
              ''
            );

            await supabase.storage.from('images').remove([pathToDelete]);

            if (imageId) {
              await supabase.from('intervention_images').delete().eq('id', imageId);
              setExtraImages(prev => prev.filter(i => i.id !== imageId));
            } else {
              const { data } = await supabase
                .from('interventions')
                .select('photos')
                .eq('id', interventionId)
                .single();

              const newPhotos = (data?.photos || []).filter((p) => !sameImage(p, imageUrl));

              await supabase.from('interventions').update({ photos: newPhotos }).eq('id', interventionId);
              setInterventions((prev) =>
                prev.map((i) =>
                  i.id === interventionId ? { ...i, photos: newPhotos } : i
                )
              );
            }

            Alert.alert("Image supprimée.");
            setArchivedImages((prev) => [...prev, imageUrl]);
          },
        },
      ]
    );
  };

  const deleteImageFromExtraTable = (imageUrl, interventionId, clientLabel, imageId) => {
    const isEtiquettePath = (url) =>
  /\/storage\/v1\/object\/(?:public|sign)\/images\/etiquettes\//i.test(url) ||
  /^images\/etiquettes\//i.test(url);

if (isEtiquettePath(imageUrl)) {
  Alert.alert("Refusé", "Ceci est une étiquette — non supprimée.");
  return;
}

    Alert.alert(
      "Confirmation",
      "Souhaites-tu archiver puis supprimer cette image ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Oui, supprimer",
          style: "destructive",
          onPress: async () => {
            const copySuccess =
  await copyImageToOldImages(
    image.storage_path,
    clientLabel,
    image.intervention_id
  );
            if (!copySuccess) {
              Alert.alert("Erreur", "L’image n’a pas pu être copiée, suppression annulée.");
              return;
            }

            const pathToDelete = imageUrl.replace(
              'https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/',
              ''
            );

            const { error: storageError } = await supabase.storage
              .from('images')
              .remove([pathToDelete]);

            if (storageError) {
              console.error('Erreur suppression du bucket :', storageError);
              Alert.alert("Erreur", "La suppression dans le bucket a échoué.");
              return;
            }

            const { error: deleteError } = await supabase
              .from('intervention_images')
              .delete()
              .eq('id', imageId);

            if (deleteError) {
              console.error('Erreur suppression intervention_images :', deleteError);
              return;
            }

            Alert.alert("✅ Image supprimée avec succès.");
            setExtraImages(prev => prev.filter(img => img.id !== imageId));
          },
        },
      ]
    );
  };
const bucketKey = (s) => {
  if (!s) return "";
  s = String(s).trim();
  const q = s.indexOf("?");
  if (q > -1) s = s.slice(0, q);
  const m = s.match(/\/storage\/v1\/object\/(?:public|sign)\/images\/(.+)$/i);
  if (m && m[1]) return m[1];
  if (s.toLowerCase().startsWith("images/")) return s.slice(7);
  return s;
};

const sameImage = (a, b) => bucketKey(a) && bucketKey(a) === bucketKey(b);
const deleteStorageImage = (
  image,
  clientLabel
) => {
  Alert.alert(
    "Confirmation",
    "Souhaites-tu archiver puis supprimer cette image ?",
    [
      {
        text: "Annuler",
        style: "cancel",
      },
      {
        text: "Oui, supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            const copySuccess =
              await copyImageToOldImages(
                image.storage_path,
                clientLabel
              );

            if (!copySuccess) {
              Alert.alert(
                "Erreur",
                "La copie de sauvegarde a échoué. L’image n’a pas été supprimée."
              );
              return;
            }

            const { error: removeError } =
              await supabase.storage
                .from("images")
                .remove([image.storage_path]);

            if (removeError) {
              throw removeError;
            }

            setStorageImages((current) =>
              current.filter(
                (item) => item.id !== image.id
              )
            );

            setArchivedImages((current) => [
              ...current,
              image.image_url,
            ]);

            Alert.alert(
              "Image supprimée",
              "L’image a été archivée puis supprimée."
            );
          } catch (error) {
            console.error(
              "❌ Suppression image Storage :",
              error
            );

            Alert.alert(
              "Erreur",
              "Impossible de supprimer cette image."
            );
          }
        },
      },
    ]
  );
};
const deleteSelectedStorageImages = () => {
  const selectedImages = storageImages.filter((image) =>
    selectedStorageImages.includes(image.id)
  );

  if (selectedImages.length === 0) {
    Alert.alert(
      "Aucune image sélectionnée",
      "Sélectionne au moins une image."
    );
    return;
  }

  Alert.alert(
    "Supprimer les images sélectionnées",
    `Tu vas archiver puis supprimer ${selectedImages.length} image${
      selectedImages.length > 1 ? "s" : ""
    }.\n\nSouhaites-tu continuer ?`,
    [
      {
        text: "Annuler",
        style: "cancel",
      },
      {
        text: `Supprimer ${selectedImages.length}`,
        style: "destructive",
        onPress: async () => {
          setBulkDeleting(true);

          try {
            const successfullyDeletedIds = [];
            const failedImages = [];

            for (const image of selectedImages) {
              try {
                const intervention =
                  eligibleInterventionsList.find(
                    (item) =>
                      String(item.id) ===
                      String(image.intervention_id)
                  );

                const client = clients.find(
                  (item) =>
                    String(item.id) ===
                    String(intervention?.client_id)
                );

                const clientLabel = client
                  ? `${client.ficheNumber}_${client.name}`
                  : `intervention_${image.intervention_id}`;

                // Sauvegarde dans old_images avant suppression
                const copyResult =
  await copyImageToOldImages(
    image.storage_path,
    clientLabel,
    image.intervention_id
  );

                if (copyResult !== true) {
                  failedImages.push(image);
                  continue;
                }

                const { error: removeError } =
                  await supabase.storage
                    .from("images")
                    .remove([image.storage_path]);

                if (removeError) {
                  console.error(
                    "❌ Suppression Storage :",
                    image.storage_path,
                    removeError
                  );

                  failedImages.push(image);
                  continue;
                }

                successfullyDeletedIds.push(image.id);
              } catch (imageError) {
                console.error(
                  "❌ Erreur image :",
                  image.storage_path,
                  imageError
                );

                failedImages.push(image);
              }
            }

            setStorageImages((current) =>
              current.filter(
                (image) =>
                  !successfullyDeletedIds.includes(image.id)
              )
            );

            setSelectedStorageImages((current) =>
              current.filter(
                (id) =>
                  !successfullyDeletedIds.includes(id)
              )
            );

            if (failedImages.length === 0) {
              Alert.alert(
                "Nettoyage terminé",
                `${successfullyDeletedIds.length} image${
                  successfullyDeletedIds.length > 1
                    ? "s ont été archivées puis supprimées."
                    : " a été archivée puis supprimée."
                }`
              );
            } else {
              Alert.alert(
                "Nettoyage partiel",
                `${successfullyDeletedIds.length} image(s) supprimée(s).\n${failedImages.length} image(s) n’ont pas pu être supprimée(s).`
              );
            }
          } catch (error) {
            console.error(
              "❌ Suppression groupée :",
              error
            );

            Alert.alert(
              "Erreur",
              "La suppression groupée a rencontré une erreur."
            );
          } finally {
            setBulkDeleting(false);
          }
        },
      },
    ]
  );
};
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🧼 Nettoyage des images anciennes</Text>

      {interventions.map((intervention) => {
        const relatedClient = clients.find(c => c.id === intervention.client_id);
        const clientLabel = relatedClient
          ? `${relatedClient.ficheNumber}_${relatedClient.name}`
          : `${intervention.id}`;

        return (
          <View key={intervention.id} style={styles.card}>
            <Text style={styles.idText}>Intervention : {intervention.id}</Text>
            <View style={styles.imageRow}>
              {(intervention.photos || []).map((photo, idx) => (
                <View key={idx} style={styles.imageBlock}>
                  <Image
  source={{ uri: photo.url }}
  style={styles.imageThumbnail}
/>
                  <Text style={styles.imageText}>
                    {relatedClient
                      ? `${relatedClient.ficheNumber} - ${relatedClient.name}`
                      : "Client inconnu"}
                  </Text>
                  <Button
                    title="Supprimer"
                    color="red"
                    onPress={() =>
  deleteImage(
    photo.original,
    intervention.id,
    clientLabel
  )
}
                    disabled={archivedImages.includes(photo.original)}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}

      {extraImages.length > 0 && (
        <View style={{ marginTop: 30 }}>
          <Text style={styles.title}>📁 Images Supplémentaires</Text>
          <View style={styles.imageRow}>
            {extraImages.map((img) => {
              const intv = interventions.find(i => i.id === img.intervention_id);
              const client = clients.find(c => c.id === intv?.client_id);
              const label = client ? `${client.ficheNumber}_${client.name}` : "inconnu";
              return (
                <View key={img.id} style={styles.imageBlock}>
                  <Image
  source={{ uri: img.image_url }}
  style={styles.imageThumbnail}
/>
                  <Text style={styles.imageText}>{label}</Text>
                  <Button
                    title="Supprimer"
                    color="red"
                    onPress={() =>
  deleteImage(
    img.original,
    img.intervention_id,
    label,
    img.id
  )
}
                  />
                </View>
              );
            })}
          </View>
        </View>
      )}
	  {storageImages.length > 0 && (
  <View style={{ marginTop: 30 }}>
    <Text style={styles.title}>
      📁 Photos supplémentaires anciennes
    </Text>
<View style={styles.bulkActions}>
  <TouchableOpacity
    style={styles.selectAllButton}
    onPress={selectAllStorageImages}
    disabled={bulkDeleting}
  >
    <Text style={styles.selectAllButtonText}>
      {isAllStorageSelected
        ? "Tout désélectionner"
        : `Tout sélectionner (${storageImages.length})`}
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[
      styles.deleteSelectedButton,
      selectedStorageImages.length === 0 &&
        styles.disabledButton,
    ]}
    onPress={deleteSelectedStorageImages}
    disabled={
      selectedStorageImages.length === 0 ||
      bulkDeleting
    }
  >
    <Text style={styles.deleteSelectedButtonText}>
      {bulkDeleting
        ? "Suppression en cours…"
        : `Supprimer la sélection (${selectedStorageImages.length})`}
    </Text>
  </TouchableOpacity>
</View>
    <View style={styles.imageRow}>
      {storageImages.map((img) => {
        const intervention =
  eligibleInterventionsList.find(
          (item) =>
            String(item.id) ===
            String(img.intervention_id)
        );
const isSelected =
  selectedStorageImages.includes(img.id);
        const client = clients.find(
          (item) =>
            String(item.id) ===
            String(intervention?.client_id)
        );

        const clientLabel = client
          ? `${client.ficheNumber}_${client.name}`
          : `intervention_${img.intervention_id}`;

        return (
<TouchableOpacity
  key={img.id}
  activeOpacity={0.8}
  onPress={() =>
    toggleStorageImageSelection(img.id)
  }
  style={[
    styles.imageBlock,
    isSelected && styles.selectedImageBlock,
  ]}
>
  <View
    style={[
      styles.selectionCircle,
      isSelected && styles.selectionCircleActive,
    ]}
  >
    {isSelected && (
      <Text style={styles.selectionCheck}>
        ✓
      </Text>
    )}
  </View>
            <Image
              source={{ uri: img.image_url }}
              style={styles.imageThumbnail}
            />

            <Text style={styles.imageText}>
              {client
                ? `${client.ficheNumber} - ${client.name}`
                : `Intervention ${img.intervention_id}`}
            </Text>

            <Button
              title="Supprimer"
              color="red"
              disabled={archivedImages.includes(
                img.image_url
              )}
              onPress={() =>
                deleteStorageImage(
                  img,
                  clientLabel
                )
              }
            />
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#e9e9e9',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  card: {
    marginBottom: 24,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  idText: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
  },
  imageBlock: {
    alignItems: 'center',
    marginRight: 12,
    marginBottom: 12,
  },
  imageThumbnail: {
    width: 100,
    height: 100,
    marginBottom: 8,
    borderRadius: 4,
  },
  imageText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 4,
  },
  bulkActions: {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 18,
},

selectAllButton: {
  backgroundColor: "#2c3e50",
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 8,
},

selectAllButtonText: {
  color: "#ffffff",
  fontWeight: "bold",
},

deleteSelectedButton: {
  backgroundColor: "#c00000",
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 8,
},

deleteSelectedButtonText: {
  color: "#ffffff",
  fontWeight: "bold",
},

disabledButton: {
  opacity: 0.4,
},

selectedImageBlock: {
  backgroundColor: "#ffe5e5",
  borderWidth: 2,
  borderColor: "#c00000",
  borderRadius: 8,
  padding: 6,
},

selectionCircle: {
  width: 26,
  height: 26,
  borderRadius: 13,
  borderWidth: 2,
  borderColor: "#777777",
  backgroundColor: "#ffffff",
  justifyContent: "center",
  alignItems: "center",
  marginBottom: 6,
},

selectionCircleActive: {
  backgroundColor: "#c00000",
  borderColor: "#c00000",
},

selectionCheck: {
  color: "#ffffff",
  fontSize: 17,
  fontWeight: "bold",
},
});
