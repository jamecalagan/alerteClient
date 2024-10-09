import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { supabase } from '../supabaseClient';

export default function ImageGallery({ route }) {
  const { clientId } = route.params;
  const [photos, setPhotos] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null); // Pour agrandir l'image sélectionnée
  const [labelPhotoIndex, setLabelPhotoIndex] = useState(null); // Indice pour la photo de l'étiquette

  useEffect(() => {
    const loadImages = async () => {
      try {
        // Récupérer les interventions du client
        const { data, error } = await supabase
          .from('interventions')
          .select('photos, label_photo') // Récupérer les photos et l'indicateur de la photo de l'étiquette
          .eq('client_id', clientId);

        if (error) throw error;

        // Récupérer les images des différentes interventions
        const allPhotos = data.reduce((acc, intervention) => {
          return [...acc, ...intervention.photos];
        }, []);

        // Récupérer l'index de la photo de l'étiquette
        const labelIndex = data.find(intervention => intervention.label_photo) ? data.findIndex(intervention => intervention.label_photo) : null;

        setPhotos(allPhotos);
        setLabelPhotoIndex(labelIndex); // Mettre à jour l'indice de la photo de l'étiquette
      } catch (error) {
        console.error('Erreur lors du chargement des photos :', error);
      }
    };

    loadImages();
  }, [clientId]);

  const handleImagePress = (imageUri) => {
    setSelectedImage(imageUri); // Agrandir l'image
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Galerie d'images</Text>

      {/* Affichage des images sous forme de miniatures */}
      {photos.length > 0 ? (
        <ScrollView contentContainerStyle={styles.imageGrid}>
          {photos.map((photo, index) => (
            <TouchableOpacity key={index} onPress={() => handleImagePress(photo)}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${photo}` }} // Affichage en base64
                style={[
                  styles.thumbnail,
                  index === labelPhotoIndex ? styles.labelPhoto : null, // Bordure verte pour l'étiquette
                ]}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.noImagesText}>Aucune image disponible.</Text>
      )}

      {/* Modal pour afficher l'image en plein écran */}
      {selectedImage && (
        <Modal
          visible={true}
          transparent={true}
          onRequestClose={() => setSelectedImage(null)}
        >
          <TouchableOpacity style={styles.modalBackground} onPress={() => setSelectedImage(null)}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${selectedImage}` }}
              style={styles.fullImage}
            />
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  thumbnail: {
    width: 100,
    height: 100,
    margin: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#000',
  },
  labelPhoto: {
    borderColor: 'green', // Bordure verte pour la photo de l'étiquette
  },
  noImagesText: {
    textAlign: 'center',
    fontSize: 18,
    marginTop: 50,
    color: '#888',
  },
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  fullImage: {
    width: '90%',
    height: '90%',
    resizeMode: 'contain',
  },
});
