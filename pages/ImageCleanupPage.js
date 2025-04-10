import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Button,
  Alert,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { supabase } from '../supabaseClient';
import * as FileSystem from 'expo-file-system';

export default function ImageCleanupPage() {
  const [interventions, setInterventions] = useState([]);
  const [extraImages, setExtraImages] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      const { data: interventionData, error: interventionError } = await supabase
        .from('interventions')
        .select('id, updatedAt, photos, status');

      const { data: extraImageData, error: extraImageError } = await supabase
        .from('intervention_images')
        .select('id, intervention_id, image_data, created_at');

      if (interventionError || extraImageError) {
        console.error('Erreur récupération :', interventionError || extraImageError);
        return;
      }

      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

      const filtered = interventionData.filter((item) => {
        const updated = new Date(item.updatedAt);
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
    };

    fetchData();
  }, []);

  const deleteFromSupabase = async (photoUrl, interventionId) => {
    try {
      const pathToDelete = photoUrl.replace(
        'https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/',
        ''
      );

      const { error: storageError } = await supabase.storage.from('images').remove([pathToDelete]);
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

      Alert.alert('Image supprimée.');
      setInterventions((prev) =>
        prev.map((i) =>
          i.id === interventionId
            ? { ...i, photos: i.photos.filter((p) => p !== photoUrl) }
            : i
        )
      );
    } catch (err) {
      console.error('Erreur suppression complète :', err);
    }
  };

  const deleteExtraImage = async (image) => {
    try {
      const pathToDelete = image.image_data.replace(
        'https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/',
        ''
      );

      const { error: storageError } = await supabase.storage.from('images').remove([pathToDelete]);
      if (storageError) {
        console.error('Erreur suppression BUCKET image extra :', storageError);
        return;
      }

      const { error: deleteError } = await supabase
        .from('intervention_images')
        .delete()
        .eq('id', image.id);

      if (deleteError) {
        console.error('Erreur suppression BDD image extra :', deleteError);
        return;
      }

      Alert.alert('Image extra supprimée');
      setExtraImages((prev) => prev.filter((img) => img.id !== image.id));
    } catch (err) {
      console.error('Erreur suppression image extra :', err);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🧼 Nettoyage des images anciennes</Text>

      {interventions.length === 0 && extraImages.length === 0 && (
        <Text>Aucune image à nettoyer.</Text>
      )}

      {interventions.map((intervention) => (
        <View key={intervention.id} style={styles.card}>
          <Text style={styles.idText}>Intervention : {intervention.id}</Text>
          {intervention.photos.map((photoUrl, idx) => (
            <View key={idx} style={styles.imageBlock}>
              <Image source={{ uri: photoUrl }} style={styles.imageThumbnail} />
              <Button
                title="Supprimer"
                color="red"
                onPress={() => deleteFromSupabase(photoUrl, intervention.id)}
              />
            </View>
          ))}
        </View>
      ))}

      {extraImages.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Images supplémentaires anciennes</Text>
          {extraImages.map((img) => (
            <View key={img.id} style={styles.imageBlock}>
              <Image source={{ uri: img.image_data }} style={styles.imageThumbnail} />
              <Button
                title="Supprimer"
                color="red"
                onPress={() => deleteExtraImage(img)}
              />
            </View>
          ))}
        </View>
      )}
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
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
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
  imageBlock: {
    marginBottom: 10,
    alignItems: 'center',
  },
  imageThumbnail: {
    width: 100,
    height: 100,
    marginBottom: 8,
    borderRadius: 4,
  },
});