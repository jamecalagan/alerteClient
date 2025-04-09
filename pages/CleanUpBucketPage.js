import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Button, Alert, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';
import * as FileSystem from 'expo-file-system';

export default function CleanUpBucketPage() {
  const [filesToDelete, setFilesToDelete] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);

  const BAD_PREFIXES = ['images/etiquettes/', 'images/supplementaires/'];
  const GOOD_PREFIXES = ['etiquettes/', 'supplementaires/'];

  useEffect(() => {
    const fetchFiles = async () => {
      setLoading(true);
      const allBadFiles = [];

      for (const prefix of BAD_PREFIXES) {
        const { data: subData, error: subError } = await supabase.storage.from('images').list(prefix, { limit: 1000, recursive: true });

        if (subError) {
          console.error(`Erreur sous-dossier ${prefix} :`, subError.message);
        } else {
          const paths = subData.map((file) => `${prefix}${file.name}`);
          allBadFiles.push(...paths);
        }
      }

      setFilesToDelete(allBadFiles);
      setLoading(false);
    };

    fetchFiles();
  }, []);

  const deleteBadFiles = async () => {
    if (filesToDelete.length === 0) return;

    Alert.alert(
      'Confirmer la suppression',
      `Supprimer définitivement ${filesToDelete.length} fichiers ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            const { error } = await supabase.storage.from('images').remove(filesToDelete);

            if (error) {
              Alert.alert('Erreur', error.message);
            } else {
              Alert.alert('Succès', `${filesToDelete.length} fichiers supprimés.`);
              setFilesToDelete([]);
            }
            setLoading(false);
          },
        },
      ]
    );
  };

  const compareAndFix = async () => {
    setLoading(true);
    const transferred = [];
    const removed = [];

    const goodFiles = new Set();

    for (const prefix of GOOD_PREFIXES) {
      const { data, error } = await supabase.storage.from('images').list(prefix, { limit: 1000, recursive: true });
      if (!error && data) {
        data.forEach((file) => goodFiles.add(`${prefix}${file.name}`));
      }
    }

    for (const badPath of filesToDelete) {
      const correctedPath = badPath.replace('images/', '');

      if (goodFiles.has(correctedPath)) {
        // Doublon → supprimer
        const { error } = await supabase.storage.from('images').remove([badPath]);
        if (!error) removed.push(badPath);
      } else {
        // Transférer : download, upload, puis delete
        const { data: fileData, error: downloadError } = await supabase.storage.from('images').download(badPath);

        if (!downloadError && fileData) {
          const base64 = await FileSystem.readAsStringAsync(fileData.uri, { encoding: FileSystem.EncodingType.Base64 });
          const fileUri = FileSystem.cacheDirectory + correctedPath.split('/').pop();
          await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

          const uploadRes = await supabase.storage.from('images').upload(correctedPath, {
            uri: fileUri,
            name: correctedPath.split('/').pop(),
            type: 'image/jpeg',
          }, { upsert: true, contentType: 'image/jpeg' });

          if (!uploadRes.error) {
            await supabase.storage.from('images').remove([badPath]);
            transferred.push(correctedPath);
          }
        }
      }
    }

    setSummary({ removed: removed.length, transferred: transferred.length });
    setFilesToDelete([]);
    setLoading(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Nettoyage du bucket Supabase</Text>

      {loading && <Text>Chargement...</Text>}

      {summary && (
        <View style={{ marginBottom: 10 }}>
          <Text>✔️ {summary.removed} doublons supprimés</Text>
          <Text>📤 {summary.transferred} fichiers déplacés correctement</Text>
        </View>
      )}

      {!loading && filesToDelete.length === 0 && (
        <Text style={{ color: 'green' }}>Aucun fichier à supprimer ✨</Text>
      )}

      {!loading && filesToDelete.length > 0 && (
        <>
          <Text style={styles.subtitle}>
            Fichiers incorrectement placés ({filesToDelete.length}) :
          </Text>
          {filesToDelete.map((path, idx) => (
            <Text key={idx} style={styles.path}>{path}</Text>
          ))}
          <Button title="Supprimer les fichiers" onPress={deleteBadFiles} color="red" />
          <View style={{ marginVertical: 8 }} />
          <Button title="🔁 Comparer & Corriger automatiquement" onPress={compareAndFix} color="#4e8cff" />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    marginTop: 10,
    fontWeight: '600',
    marginBottom: 6,
  },
  path: {
    fontSize: 12,
    marginBottom: 2,
    color: '#555',
  },
});