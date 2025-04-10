import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { supabase } from '../supabaseClient';
import { useNavigation } from '@react-navigation/native';

export default function StoredImagesPage() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);
  const navigation = useNavigation();
  const imagesPerPage = 12;
  const [clients, setClients] = useState([]);
  const [interventions, setInterventions] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const folders = ['intervention_images', 'etiquettes'];
      let allImages = [];

      const { data: interventionsData } = await supabase.from('interventions').select('id, client_id');
      const { data: clientsData } = await supabase.from('clients').select('id, name, ficheNumber');

      setInterventions(interventionsData || []);
      setClients(clientsData || []);

      for (const folder of folders) {
        const { data, error } = await supabase.storage.from('images').list(folder, {
          limit: 1000,
        });

        if (error) continue;

        for (const item of data) {
          const { data: files } = await supabase.storage
            .from('images')
            .list(`${folder}/${item.name}`);

          if (files) {
            files.forEach((file) => {
              const relatedIntervention = interventionsData.find((i) => i.id === item.name);
              const relatedClient = clientsData.find((c) => c.id === relatedIntervention?.client_id);

              allImages.push({
                name: file.name,
                folder: item.name,
                created_at: file.created_at || file.metadata?.created_at || new Date(),
                path: `${folder}/${item.name}/${file.name}`,
                url: `https://fncgffajwabqrnhumgzd.supabase.co/storage/v1/object/public/images/${folder}/${item.name}/${file.name}`,
                type: folder === 'etiquettes' ? 'etiquette' : 'supplementaire',
                ficheDisplay: relatedClient
                  ? `${relatedClient.name} - ${relatedClient.ficheNumber}`
                  : `Fiche : ${item.name}`,
              });
            });
          }
        }
      }

      allImages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setImages(allImages);
      setLoading(false);
    };

    fetchData();
  }, []);

  const copyToClipboard = (url) => {
    Clipboard.setString(url);
    Alert.alert('Lien copié dans le presse-papier');
  };

  const confirmDeleteImage = (path) => {
    Alert.alert(
      'Confirmer la suppression',
      'Es-tu sûr de vouloir supprimer cette image ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteImage(path) },
      ]
    );
  };

  const deleteImage = async (path) => {
    const { error } = await supabase.storage.from('images').remove([path]);
    if (error) {
      console.error('Erreur suppression :', error);
    } else {
      Alert.alert('Image supprimée');
      setImages((prev) => prev.filter((img) => img.path !== path));
    }
  };

  const filteredImages = images.filter((img) => {
    const matchSearch = img.ficheDisplay.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter ? img.type === typeFilter : true;
    return matchSearch && matchType;
  });

  const indexOfLastImage = currentPage * imagesPerPage;
  const indexOfFirstImage = indexOfLastImage - imagesPerPage;
  const currentImages = filteredImages.slice(indexOfFirstImage, indexOfLastImage);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>⬅️ Retour</Text>
      </TouchableOpacity>

      <Text style={styles.title}>📁 Images stockées dans le cloud</Text>

      <View style={styles.filters}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Nom ou numéro de fiche"
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
        />

        <View style={styles.filterButtons}>
          <TouchableOpacity
            style={[styles.filterButton, typeFilter === null && styles.activeFilter]}
            onPress={() => setTypeFilter(null)}
          >
            <Text>Toutes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, typeFilter === 'etiquette' && styles.activeFilter]}
            onPress={() => setTypeFilter('etiquette')}
          >
            <Text>Étiquettes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, typeFilter === 'supplementaire' && styles.activeFilter]}
            onPress={() => setTypeFilter('supplementaire')}
          >
            <Text>Supplémentaires</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="blue" />
      ) : (
        <FlatList
          data={currentImages}
          keyExtractor={(item) => item.path}
          numColumns={4}
		  renderItem={({ item }) => (
  <View style={styles.imageWrapper}>
    <View
      style={[
        styles.imageBlock,
        item.type === 'etiquette' && { borderColor: '#3cff00', borderWidth: 2 },
      ]}
    >
      <TouchableOpacity onPress={() => setSelectedImage(item.url)}>
        <Image source={{ uri: item.url }} style={styles.thumbnail} />
      </TouchableOpacity>
      <Text style={styles.ficheText}>{item.ficheDisplay}</Text>
      <Text style={styles.dateText}>🕓 {new Date(item.created_at).toLocaleDateString()}</Text>
      <View style={styles.imageActions}>
        <Pressable style={styles.actionButton} onPress={() => setSelectedImage(item.url)}>
          <Text style={styles.actionText}>Zoomer</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, { backgroundColor: '#d9534f' }]}
          onPress={() => confirmDeleteImage(item.path)}
        >
          <Text style={styles.actionText}>Supprimer</Text>
        </Pressable>
      </View>
    </View>
  </View>
)}
        />
      )}

      <Modal visible={!!selectedImage} transparent onRequestClose={() => setSelectedImage(null)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedImage(null)}>
            <Text style={{ fontSize: 30, color: 'white' }}>✖</Text>
          </TouchableOpacity>
          {selectedImage && (
            <Image source={{ uri: selectedImage }} style={styles.fullscreenImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

      {!loading && (
        <View style={styles.pagination}>
          <TouchableOpacity
            onPress={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            <Text style={styles.pageButton}>⬅️</Text>
          </TouchableOpacity>

          <Text style={styles.pageNumber}>Page {currentPage}</Text>

          <TouchableOpacity
            onPress={() =>
              setCurrentPage((prev) =>
                indexOfLastImage < filteredImages.length ? prev + 1 : prev
              )
            }
            disabled={indexOfLastImage >= filteredImages.length}
          >
            <Text style={styles.pageButton}>➡️</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, backgroundColor: '#fff', flex: 1 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  imageWrapper: { width: '25%', padding: 6 },
  imageBlock: {
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    padding: 6,
    borderRadius: 6,
    borderColor: '#ccc',
    borderWidth: 1,
  },
  thumbnail: { width: '100%', aspectRatio: 1, marginBottom: 4, borderRadius: 4 },
  ficheText: { fontSize: 12, marginBottom: 2, fontWeight: 'bold', textAlign: 'center' },
  dateText: { fontSize: 11, color: '#666', marginBottom: 4 },
imageActions: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 6,
},
actionButton: {
  flex: 1,
  paddingVertical: 6,
  backgroundColor: '#007bff',
  borderRadius: 6,
  alignItems: 'center',
},
actionText: {
  color: '#fff',
  fontWeight: 'bold',
  fontSize: 13,
},
  link: { fontSize: 18, color: 'blue' },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 20,
  },
  pageButton: { fontSize: 18 },
  pageNumber: { fontSize: 16, fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: { width: '90%', height: '90%' },
  closeButton: { position: 'absolute', top: 30, right: 20, zIndex: 2 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
    color: '#000',
    backgroundColor: '#f0f0f0',
  },
  filters: { marginBottom: 12 },
  filterButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  activeFilter: { backgroundColor: '#d0ee26' },
  backButton: { marginBottom: 10 },
  backButtonText: { color: '#007bff', fontSize: 16 },
});