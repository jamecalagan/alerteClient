import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Button,
  Alert,
  StyleSheet,
} from 'react-native';
import { supabase } from '../supabaseClient';

export default function ImageCleanupPage() {
  const [interventions, setInterventions] = useState([]);
  const [extraImages, setExtraImages] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [archivedImages, setArchivedImages] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const { data: interventionData, error: interventionError } = await supabase
        .from('interventions')
        .select('id, "updatedAt", photos, status, client_id');

      const { data: clientsData, error: clientError } = await supabase
        .from('clients')
        .select('id, name, ficheNumber');

      const { data: extraImageData, error: extraImageError } = await supabase
        .from('intervention_images')
        .select('id, intervention_id, image_data, created_at');

      if (interventionError || extraImageError || clientError) {
        console.error('Erreur récupération :', interventionError || extraImageError || clientError);
        return;
      }

      setClients(clientsData);

      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const filtered = interventionData.filter((item) => {
        const updated = new Date(item.updatedAt || item["updatedAt"]);
        return (
          item.status === 'Récupéré' &&
          updated < tenDaysAgo &&
          Array.isArray(item.photos) &&
          item.photos.some((p) => typeof p === 'string' && p.startsWith('http'))
        );
      });
      setInterventions(filtered);

      const extraToClean = extraImageData.filter(
        (img) =>
          img.image_data.startsWith('http') &&
          new Date(img.created_at) < tenDaysAgo
      );
      setExtraImages(extraToClean);
      setLoading(false);
    };

    fetchData();
  }, []);

  const copyImageToOldImages = async (photoUrl, clientInfo = "") => {
    const originalPath = photoUrl.replace(
      'https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/',
      ''
    );
    const fileName = originalPath.split('/').pop();
    const safeClientInfo = clientInfo.replace(/[^a-zA-Z0-9_-]/g, "_");
    const destinationFileName = `${safeClientInfo}_${fileName}`;
    const destinationPath = `old_images/${destinationFileName}`;

    const { data, error } = await supabase.storage
      .from('images')
      .copy(originalPath, destinationPath);

    if (error) {
      if (error.message.includes("The resource already exists")) {
        return true;
      }
      console.error('Erreur lors de la copie de l’image :', error);
      return false;
    }
    return true;
  };

  const deleteFromSupabase = (photoUrl, interventionId, clientInfo) => {
    Alert.alert(
      "Confirmation de suppression",
      "Souhaites-tu vraiment archiver puis supprimer cette image ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Oui, supprimer",
          style: "destructive",
          onPress: async () => {
            const copySuccess = await copyImageToOldImages(photoUrl, clientInfo);
            if (!copySuccess) {
              Alert.alert("Erreur", "L’image n’a pas pu être copiée, suppression annulée.");
              return;
            }

            const pathToDelete = photoUrl.replace(
              'https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/',
              ''
            );

            const { error: storageError } = await supabase.storage
              .from('images')
              .remove([pathToDelete]);

            if (storageError) {
              console.error('Erreur suppression du bucket :', storageError);
              return;
            }

            const { data, error: updateError } = await supabase
              .from('interventions')
              .select('photos')
              .eq('id', interventionId)
              .single();

            if (updateError) {
              console.error('Erreur lecture photos :', updateError);
              return;
            }

            const newPhotos = data.photos.filter((p) => p !== photoUrl);

            await supabase
              .from('interventions')
              .update({ photos: newPhotos })
              .eq('id', interventionId);

            Alert.alert("Image supprimée.");

            setInterventions((prev) =>
              prev.map((i) =>
                i.id === interventionId
                  ? { ...i, photos: i.photos.filter((p) => p !== photoUrl) }
                  : i
              )
            );

            setArchivedImages((prev) => [...prev, photoUrl]);
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
              {intervention.photos.map((photoUrl, idx) => (
                <View key={idx} style={styles.imageBlock}>
                  <Image source={{ uri: photoUrl }} style={styles.imageThumbnail} />
                  <Text style={{ fontSize: 12, fontStyle: 'italic', textAlign: 'center' }}>
                    {relatedClient
                      ? `${relatedClient.ficheNumber} - ${relatedClient.name}`
                      : "Client inconnu"}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button
                      title="Archiver"
                      color="#007bff"
                      onPress={() => {
                        Alert.alert(
                          "Confirmation",
                          "Souhaites-tu archiver cette image ?",
                          [
                            { text: "Annuler", style: "cancel" },
                            {
                              text: "Oui",
                              onPress: async () => {
                                const success = await copyImageToOldImages(photoUrl, clientLabel);
                                if (success) {
                                  setArchivedImages((prev) => [...prev, photoUrl]);
                                  Alert.alert("Succès", "L’image a été archivée avec succès.");
                                } else {
                                  Alert.alert("Erreur", "L’archivage a échoué.");
                                }
                              },
                            },
                          ]
                        );
                      }}
                      disabled={archivedImages.includes(photoUrl)}
                    />
                    <Button
                      title="Supprimer"
                      color="red"
                      onPress={() => deleteFromSupabase(photoUrl, intervention.id, clientLabel)}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
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
});