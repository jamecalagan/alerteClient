import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, Modal, ScrollView, StyleSheet, navigation } from 'react-native';
import { supabase } from '../supabaseClient';
import AlertBox from '../components/AlertBox';
import BottomNavigation from "../components/BottomNavigation";
export default function ImageGallery({ route }) {
  const { clientId } = route.params;
  const [interventions, setInterventions] = useState([]); // Stocker les interventions avec leurs photos
  const [selectedImage, setSelectedImage] = useState(null); // Pour agrandir l'image sélectionnée
  const [alertVisible, setAlertVisible] = useState(false); // Contrôle de la visibilité de l'alerte
  const [imageToDelete, setImageToDelete] = useState(null); // Image sélectionnée pour la suppression

  useEffect(() => {
    const loadImages = async () => {
      try {
        // Récupérer les interventions du client avec les photos
        const { data, error } = await supabase
          .from('interventions')
          .select('id, photos, label_photo') // Récupérer aussi l'ID des interventions
          .eq('client_id', clientId);
  
        if (error) throw error;
  
       
  
        setInterventions(data); // Stocker les interventions et leurs photos
      } catch (error) {
        console.error('Erreur lors du chargement des photos :', error);
      }
    };
  
    loadImages();
  }, [clientId]);
  

  const handleImagePress = (imageUri) => {
    setSelectedImage(imageUri); // Agrandir l'image
  };

  const handleDeleteRequest = (photo, interventionIndex, photoIndex) => {
    const interventionToDelete = interventions[interventionIndex]; // Récupérer l'intervention à partir de l'index
    const interventionId = interventionToDelete.id; // Utiliser l'ID de l'intervention au lieu de l'index
  
  
  
    setImageToDelete({ photo, interventionId, photoIndex });
    setAlertVisible(true); // Affiche l'alerte
  };
  
  
  

  const handleConfirmDelete = async () => {
    const { photo, interventionId, photoIndex } = imageToDelete;
    try {
     
  
      // Récupérer l'intervention à partir de l'ID
      const interventionToUpdate = interventions.find(intervention => intervention.id === interventionId);
  
      if (!interventionToUpdate) {
        throw new Error('Intervention introuvable');
      }
  
      // Supprimer l'image sélectionnée de la liste des photos
      const updatedPhotos = interventionToUpdate.photos.filter((_, i) => i !== photoIndex);
  
      // Mettre à jour les photos dans la base de données
      const { data, error } = await supabase
        .from('interventions')
        .update({ photos: updatedPhotos }) // Mettre à jour les photos sans celle supprimée
        .eq('id', interventionId); // Utiliser l'ID de l'intervention
  
      if (error) throw error;
  
      // Mettre à jour l'état local après suppression
      setInterventions(interventions.map(intervention => 
        intervention.id === interventionId 
        ? { ...intervention, photos: updatedPhotos }
        : intervention
      ));
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'image :', error.message);
    } finally {
      setAlertVisible(false); // Ferme l'alerte après la suppression
    }
  };
  
  
  

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Galerie d'images</Text>

   
      {interventions.length > 0 ? (
        <ScrollView>
          {interventions.map((intervention, index) => {
            // Séparer les photos en plaçant la photo de l'étiquette en premier
            let photos = intervention.photos || [];
            const labelPhoto = intervention.label_photo;
            
            if (labelPhoto) {
              photos = photos.filter(photo => photo !== labelPhoto); // Supprimer l'étiquette des autres photos
              photos.unshift(labelPhoto); // Ajouter l'étiquette au début du tableau
            }

            return (
              <View key={index} style={styles.interventionSection}>
               
                <Text style={styles.interventionTitle}>Intervention N° {index + 1}</Text>
                <View style={styles.imageRow}>
                  {photos && photos.length > 0 ? (
                    photos.map((photo, photoIndex) => (
                      <View key={photoIndex} style={styles.imageContainer}>
                        <TouchableOpacity onPress={() => handleImagePress(photo)}>
                          <Image
                            source={{ uri: photo }}

                            style={[
                              styles.thumbnail,
                              photo === labelPhoto ? styles.labelPhoto : null, // Bordure verte pour la photo de l'étiquette
                            ]}
                          />
                        </TouchableOpacity>
                       
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => handleDeleteRequest(photo, index, photoIndex)}
                        >
                          <Text style={styles.deleteButtonText}>Supprimer</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noImagesText}>Aucune image pour cette intervention.</Text>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.noImagesText}>Aucune image disponible.</Text>
      )}


      {selectedImage && (
        <Modal
          visible={true}
          transparent={true}
          onRequestClose={() => setSelectedImage(null)}
        >
          <TouchableOpacity style={styles.modalBackground} onPress={() => setSelectedImage(null)}>
            <Image
              source={{ uri: selectedImage }}
              style={styles.fullImage}
            />
          </TouchableOpacity>
        </Modal>
      )}

   
      <AlertBox
        visible={alertVisible}
        title="Confirmer la suppression"
        message="Êtes-vous sûr de vouloir supprimer cette image ?"
        confirmText="Supprimer"
        cancelText="Annuler"
        onConfirm={handleConfirmDelete}
        onClose={() => setAlertVisible(false)}
      />
	  <BottomNavigation  navigation={navigation} currentRoute={route.name} />
    </View>
	
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
	marginTop: 20,
	padding: 20,	
	width: "100%",
	justifyContent: "center",
    backgroundColor: '#e9e9e9',
  },
  title: {
    fontSize: 24,
    fontWeight: 'medium',
	color: "#242424",
    marginBottom: 20,
    textAlign: 'center',
  },
  interventionSection: {
    marginBottom: 20,
  },
  interventionTitle: {
    fontSize: 18,
    fontWeight: 'medium',
	color: "#242424",
    marginBottom: 10,
  },
  imageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  imageContainer: {
    margin: 10,
    alignItems: 'center',
  },
  thumbnail: {
    width: 100,
    height: 100,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#000',
  },
  labelPhoto: {
    borderColor: 'green', // Bordure verte pour la photo de l'étiquette
  },
  deleteButton: {
    marginTop: 5,
    padding: 5,
    backgroundColor: 'red',
    borderRadius: 5,
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: 'bold',
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
