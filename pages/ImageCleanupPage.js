import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Image, Button, StyleSheet, TouchableOpacity
} from 'react-native';
import { supabase } from '../supabaseClient';
import { useNavigation } from '@react-navigation/native';
import AlertBox from '../components/AlertBox';
import CustomAlert from '../components/CustomAlert';
import BackButton from '../components/BackButton';

export default function ImageCleanupPage() {
  const navigation = useNavigation();
  const [interventions, setInterventions] = useState([]);
  const [extraImages, setExtraImages] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [archivedImages, setArchivedImages] = useState([]);
  const [storageImages, setStorageImages] = useState([]);
  const [selectedStorageImages, setSelectedStorageImages] = useState([]);
const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    visible: false,
    title: '',
    message: '',
    confirmText: 'Oui, supprimer',
    onConfirm: null,
  });
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const openConfirm = (title, message, onConfirm, confirmText = 'Oui, supprimer') => {
    setConfirmDialog({ visible: true, title, message, confirmText, onConfirm });
  };

  const closeConfirm = () => {
    setConfirmDialog((prev) => ({ ...prev, visible: false }));
  };

  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message || '');
    setAlertVisible(true);
  };
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

const getAllSelectableImageIds = () => {
  const interventionPhotoIds = interventions.flatMap(
    (intervention) =>
      (intervention.photos || []).map(
        (_, index) =>
          `intervention:${intervention.id}:${index}`
      )
  );

  const extraImageIds = extraImages.map(
    (image) => `extra:${image.id}`
  );

  return [
    ...interventionPhotoIds,
    ...extraImageIds,
  ];
};

const selectAllStorageImages = () => {
  const allImageIds = getAllSelectableImageIds();

  if (
    allImageIds.length > 0 &&
    selectedStorageImages.length === allImageIds.length
  ) {
    setSelectedStorageImages([]);
    return;
  }

  setSelectedStorageImages(allImageIds);
};

const allSelectableImageIds = getAllSelectableImageIds();

const isAllStorageSelected =
  allSelectableImageIds.length > 0 &&
  selectedStorageImages.length ===
    allSelectableImageIds.length;

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
      .select("*");

  if (extraImageError) {
    console.error(
      "❌ Chargement intervention_images :",
      extraImageError
    );
    throw extraImageError;
  }

  extraToClean = (extraImageData || [])
    // Filtrage local : évite une requête .in(...) trop longue
    .filter((image) =>
      eligibleIds.has(String(image.intervention_id))
    )
    // Ne jamais proposer les étiquettes
    .filter((image) => image.is_label !== true)
    .map((image) => {
      const imageValue =
        image.image_data ||
        image.file_path ||
        image.image_url ||
        "";

      return {
        ...image,
        original: imageValue,
        image_url: getImageUrl(imageValue),
      };
    })
    .filter(
      (image) =>
        typeof image.original === "string" &&
        image.original.trim().length > 0 &&
        image.image_url
    );
}
const foundStorageImages = [];

      setClients(clientsData || []);
	  setEligibleInterventionsList(eligibleInterventions);
      setInterventions(interventionsWithPhotos);
      setExtraImages(extraToClean);
      setStorageImages(foundStorageImages);

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
  showAlert("Refusé", "Ceci est une étiquette — non supprimée.");
  return;
}

    openConfirm(
      "Confirmation de suppression",
      "Souhaites-tu vraiment archiver puis supprimer cette image ?",
      async () => {
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

        showAlert("Image supprimée.");
        setArchivedImages((prev) => [...prev, imageUrl]);
      }
    );
  };

  const deleteImageFromExtraTable = (imageUrl, interventionId, clientLabel, imageId) => {
    const isEtiquettePath = (url) =>
  /\/storage\/v1\/object\/(?:public|sign)\/images\/etiquettes\//i.test(url) ||
  /^images\/etiquettes\//i.test(url);

if (isEtiquettePath(imageUrl)) {
  showAlert("Refusé", "Ceci est une étiquette — non supprimée.");
  return;
}

    openConfirm(
      "Confirmation",
      "Souhaites-tu archiver puis supprimer cette image ?",
      async () => {
        const copySuccess =
  await copyImageToOldImages(
    imageUrl,
    clientLabel,
    interventionId
  );
        if (!copySuccess) {
          showAlert("Erreur", "L’image n’a pas pu être copiée, suppression annulée.");
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
          showAlert("Erreur", "La suppression dans le bucket a échoué.");
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

        showAlert("✅ Image supprimée avec succès.");
        setExtraImages(prev => prev.filter(img => img.id !== imageId));
      }
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
  openConfirm(
    "Confirmation",
    "Souhaites-tu archiver puis supprimer cette image ?",
    async () => {
      try {
        const copySuccess =
          await copyImageToOldImages(
            image.storage_path,
            clientLabel
          );

        if (!copySuccess) {
          showAlert(
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

        showAlert(
          "Image supprimée",
          "L’image a été archivée puis supprimée."
        );
      } catch (error) {
        console.error(
          "❌ Suppression image Storage :",
          error
        );

        showAlert(
          "Erreur",
          "Impossible de supprimer cette image."
        );
      }
    }
  );
};
const deleteSelectedStorageImages = () => {
  if (selectedStorageImages.length === 0) {
    showAlert(
      "Aucune image sélectionnée",
      "Sélectionne au moins une image."
    );
    return;
  }

  openConfirm(
    "Supprimer les images sélectionnées",
    `Tu vas archiver puis supprimer ${
      selectedStorageImages.length
    } image${
      selectedStorageImages.length > 1 ? "s" : ""
    }.\n\nSouhaites-tu continuer ?`,
    async () => {
          setBulkDeleting(true);

          const deletedSelectionIds = [];
          const failedSelectionIds = [];

          try {
            for (const selectionId of selectedStorageImages) {
              try {
                /*
                 * Photo provenant de interventions.photos
                 * Format :
                 * intervention:<interventionId>:<index>
                 */
                if (selectionId.startsWith("intervention:")) {
                  const withoutPrefix = selectionId.slice(
                    "intervention:".length
                  );

                  const separatorPosition =
                    withoutPrefix.lastIndexOf(":");

                  const interventionId =
                    withoutPrefix.slice(
                      0,
                      separatorPosition
                    );

                  const photoIndex = Number(
                    withoutPrefix.slice(
                      separatorPosition + 1
                    )
                  );

                  const intervention =
                    interventions.find(
                      (item) =>
                        String(item.id) ===
                        String(interventionId)
                    );

                  const photo =
                    intervention?.photos?.[photoIndex];

                  if (!intervention || !photo?.original) {
                    failedSelectionIds.push(selectionId);
                    continue;
                  }

                  const client = clients.find(
                    (item) =>
                      String(item.id) ===
                      String(intervention.client_id)
                  );

                  const clientLabel = client
                    ? `${client.ficheNumber}_${client.name}`
                    : `intervention_${interventionId}`;

                  // 1. Archivage dans old_images
                  const copySuccess =
                    await copyImageToOldImages(
                      photo.original,
                      clientLabel,
                      interventionId
                    );

                  if (!copySuccess) {
                    failedSelectionIds.push(selectionId);
                    continue;
                  }

                  // 2. Suppression dans le Storage
                  const storagePath =
                    bucketKey(photo.original);

                  if (storagePath) {
                    const { error: removeError } =
                      await supabase.storage
                        .from("images")
                        .remove([storagePath]);

                    if (removeError) {
                      console.error(
                        "❌ Suppression Storage :",
                        storagePath,
                        removeError
                      );

                      failedSelectionIds.push(
                        selectionId
                      );
                      continue;
                    }
                  }

                  // 3. Relecture de la liste actuelle
                  const {
                    data: interventionData,
                    error: readError,
                  } = await supabase
                    .from("interventions")
                    .select("photos")
                    .eq("id", interventionId)
                    .single();

                  if (readError) {
                    console.error(
                      "❌ Lecture photos intervention :",
                      readError
                    );

                    failedSelectionIds.push(
                      selectionId
                    );
                    continue;
                  }

                  const updatedPhotos = (
                    interventionData?.photos || []
                  ).filter(
                    (savedPhoto) =>
                      !sameImage(
                        savedPhoto,
                        photo.original
                      )
                  );

                  const { error: updateError } =
                    await supabase
                      .from("interventions")
                      .update({
                        photos: updatedPhotos,
                      })
                      .eq("id", interventionId);

                  if (updateError) {
                    console.error(
                      "❌ Mise à jour intervention :",
                      updateError
                    );

                    failedSelectionIds.push(
                      selectionId
                    );
                    continue;
                  }

                  deletedSelectionIds.push(selectionId);
                  continue;
                }

                /*
                 * Photo provenant de intervention_images
                 * Format :
                 * extra:<imageId>
                 */
                if (selectionId.startsWith("extra:")) {
                  const imageId = selectionId.slice(
                    "extra:".length
                  );

                  const extraImage = extraImages.find(
                    (item) =>
                      String(item.id) ===
                      String(imageId)
                  );

                  if (!extraImage?.original) {
                    failedSelectionIds.push(selectionId);
                    continue;
                  }

                  const intervention =
                    eligibleInterventionsList.find(
                      (item) =>
                        String(item.id) ===
                        String(
                          extraImage.intervention_id
                        )
                    );

                  const client = clients.find(
                    (item) =>
                      String(item.id) ===
                      String(intervention?.client_id)
                  );

                  const clientLabel = client
                    ? `${client.ficheNumber}_${client.name}`
                    : `intervention_${extraImage.intervention_id}`;

                  // 1. Archivage dans old_images
                  const copySuccess =
                    await copyImageToOldImages(
                      extraImage.original,
                      clientLabel,
                      extraImage.intervention_id
                    );

                  if (!copySuccess) {
                    failedSelectionIds.push(selectionId);
                    continue;
                  }

                  // 2. Suppression dans le Storage
                  const storagePath =
                    bucketKey(extraImage.original);

                  if (storagePath) {
                    const { error: removeError } =
                      await supabase.storage
                        .from("images")
                        .remove([storagePath]);

                    if (removeError) {
                      console.error(
                        "❌ Suppression Storage :",
                        storagePath,
                        removeError
                      );

                      failedSelectionIds.push(
                        selectionId
                      );
                      continue;
                    }
                  }

                  // 3. Suppression de la ligne SQL
                  const { error: deleteError } =
                    await supabase
                      .from("intervention_images")
                      .delete()
                      .eq("id", extraImage.id);

                  if (deleteError) {
                    console.error(
                      "❌ Suppression intervention_images :",
                      deleteError
                    );

                    failedSelectionIds.push(
                      selectionId
                    );
                    continue;
                  }

                  deletedSelectionIds.push(selectionId);
                  continue;
                }

                failedSelectionIds.push(selectionId);
              } catch (imageError) {
                console.error(
                  "❌ Erreur suppression image :",
                  selectionId,
                  imageError
                );

                failedSelectionIds.push(selectionId);
              }
            }

            /*
             * Mise à jour immédiate de l’affichage
             */
            setInterventions((current) =>
              current
                .map((intervention) => ({
                  ...intervention,

                  photos: (
                    intervention.photos || []
                  ).filter((photo, index) => {
                    const selectionId =
                      `intervention:${intervention.id}:${index}`;

                    return !deletedSelectionIds.includes(
                      selectionId
                    );
                  }),
                }))
                .filter(
                  (intervention) =>
                    intervention.photos.length > 0
                )
            );

            setExtraImages((current) =>
              current.filter(
                (image) =>
                  !deletedSelectionIds.includes(
                    `extra:${image.id}`
                  )
              )
            );

            // Ne conserver cochées que les images en échec
            setSelectedStorageImages(
              failedSelectionIds
            );

            if (failedSelectionIds.length === 0) {
              showAlert(
                "Nettoyage terminé",
                `${deletedSelectionIds.length} image${
                  deletedSelectionIds.length > 1
                    ? "s ont été archivées puis supprimées."
                    : " a été archivée puis supprimée."
                }`
              );
            } else {
              showAlert(
                "Nettoyage partiel",
                `${deletedSelectionIds.length} image(s) supprimée(s).\n` +
                  `${failedSelectionIds.length} image(s) non supprimée(s).`
              );
            }
          } catch (error) {
            console.error(
              "❌ Suppression groupée :",
              error
            );

            showAlert(
              "Erreur",
              "La suppression groupée a rencontré une erreur."
            );
          } finally {
            setBulkDeleting(false);
          }
    },
    `Supprimer ${selectedStorageImages.length}`
  );
};
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🧼 Nettoyage des images anciennes</Text>
<View style={styles.bulkActions}>
  <TouchableOpacity
    style={styles.selectAllButton}
    onPress={selectAllStorageImages}
    disabled={bulkDeleting}
  >
    <Text style={styles.selectAllButtonText}>
{isAllStorageSelected
    ? "Tout désélectionner"
    : `Tout sélectionner (${allSelectableImageIds.length})`}
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
      {interventions.map((intervention) => {
        const relatedClient = clients.find(c => c.id === intervention.client_id);
        const clientLabel = relatedClient
          ? `${relatedClient.ficheNumber}_${relatedClient.name}`
          : `${intervention.id}`;

        return (
          <View key={intervention.id} style={styles.card}>
            <Text style={styles.idText}>Intervention : {intervention.id}</Text>
            <View style={styles.imageRow}>
{(intervention.photos || []).map((photo, idx) => {
  const imageId =
    `intervention:${intervention.id}:${idx}`;

  const isSelected =
    selectedStorageImages.includes(imageId);

  return (
    <View
      key={imageId}
      style={[
        styles.imageBlock,
        isSelected && styles.selectedImageBlock,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() =>
          toggleStorageImageSelection(imageId)
        }
      >
        <View
          style={[
            styles.selectionCircle,
            isSelected &&
              styles.selectionCircleActive,
          ]}
        >
          {isSelected && (
            <Text style={styles.selectionCheck}>
              ✓
            </Text>
          )}
        </View>

        <Image
          source={{ uri: photo.url }}
          style={styles.imageThumbnail}
        />
      </TouchableOpacity>

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
        disabled={archivedImages.includes(
          photo.original
        )}
      />
    </View>
  );
})}
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
              const imageId = `extra:${img.id}`;

const isSelected =
  selectedStorageImages.includes(imageId);
              return (
<View
  key={imageId}
  style={[
    styles.imageBlock,
    isSelected && styles.selectedImageBlock,
  ]}
>
  <TouchableOpacity
    activeOpacity={0.8}
    onPress={() =>
      toggleStorageImageSelection(imageId)
    }
  >
    <View
      style={[
        styles.selectionCircle,
        isSelected &&
          styles.selectionCircleActive,
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
  </TouchableOpacity>
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
	  {allSelectableImageIds.length > 0 && (
  <View style={{ marginTop: 30 }}>
    <Text style={styles.title}>
      📁 Photos supplémentaires anciennes
    </Text>

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

      <AlertBox
        visible={confirmDialog.visible}
        title={confirmDialog.title}
        message={confirmDialog.message}
        cancelText="Annuler"
        confirmText={confirmDialog.confirmText || "Oui, supprimer"}
        onClose={closeConfirm}
        onConfirm={() => {
          closeConfirm();
          if (confirmDialog.onConfirm) confirmDialog.onConfirm();
        }}
      />

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />

      <BackButton onPress={() => navigation.goBack()} style={{ marginTop: 16 }} />
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
