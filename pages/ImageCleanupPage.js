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

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // ✅ Alias 'updated_at' -> 'updatedAt' pour unifier l'accès en JS
        const { data: interventionData, error: intvError } = await supabase
          .from('interventions')
          .select('id, "updatedAt", photos, status, client_id');

        if (intvError) {
          console.error('❌ Erreur interventions :', intvError);
        }

        const { data: clientsData, error: clientsError } = await supabase
          .from('clients')
          .select('id, name, ficheNumber');

        if (clientsError) {
          console.error('❌ Erreur clients :', clientsError);
        }

        const { data: extraImageData, error: extraImageError } = await supabase
          .from('intervention_images')
          .select('id, intervention_id, image_data, created_at');

        if (extraImageError) {
          console.error("❌ Erreur récupération images :", extraImageError);
        } else {
          console.log("🖼️ Images dans intervention_images :", extraImageData);
        }

        setClients(clientsData || []);

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        // ✅ Filtre : statut "Récupéré", +10 jours, et photos http(s)
        const filtered = (interventionData || []).filter((item) => {
          const updated = item.updatedAt ? new Date(item.updatedAt) : null;
          return (
            item.status === 'Récupéré' &&
            updated && updated < tenDaysAgo &&
            Array.isArray(item.photos) &&
            item.photos.some((p) => typeof p === 'string' && p.startsWith('http'))
          );
        });

        setInterventions(filtered);

        // ✅ Images supplémentaires à nettoyer (>10 jours)
        const extraToClean = (extraImageData || []).filter(
          (img) =>
            img.image_data &&
            typeof img.image_data === "string" &&
            img.image_data.startsWith("http") &&
            new Date(img.created_at) < tenDaysAgo
        );
        setExtraImages(extraToClean);
      } catch (e) {
        console.error('❌ fetchData error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

const copyImageToOldImages = async (photoUrl, clientInfo = "") => {
  const key = bucketKey(photoUrl);
  if (!key) return false;

  const fileName = key.split("/").pop();
  const safeClientInfo = (clientInfo || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const destinationPath = `old_images/${safeClientInfo}_${fileName}`;

  const folderPath = key.split("/").slice(0, -1).join("/");
  const fileNameOnly = key.split("/").pop();

  const { data: files, error: listError } = await supabase.storage.from("images").list(folderPath);
  if (listError || !files?.some(f => f.name === fileNameOnly)) {
    console.error("❌ Fichier introuvable dans le bucket !");
    return "not_found";
  }

  const { error } = await supabase.storage.from("images").copy(key, destinationPath);
  if (error) {
    console.error("❌ Erreur copie Supabase :", error);
    return false;
  }
  return true;
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
            const copySuccess = await copyImageToOldImages(imageUrl, clientLabel);
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
              {(intervention.photos || []).map((photoUrl, idx) => (
                <View key={idx} style={styles.imageBlock}>
                  <Image source={{ uri: photoUrl }} style={styles.imageThumbnail} />
                  <Text style={styles.imageText}>
                    {relatedClient
                      ? `${relatedClient.ficheNumber} - ${relatedClient.name}`
                      : "Client inconnu"}
                  </Text>
                  <Button
                    title="Supprimer"
                    color="red"
                    onPress={() => deleteImage(photoUrl, intervention.id, clientLabel)}
                    disabled={archivedImages.includes(photoUrl)}
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
                  <Image source={{ uri: img.image_data }} style={styles.imageThumbnail} />
                  <Text style={styles.imageText}>{label}</Text>
                  <Button
                    title="Supprimer"
                    color="red"
                    onPress={() => deleteImage(img.image_data, img.intervention_id, label, img.id)}
                  />
                </View>
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
});
