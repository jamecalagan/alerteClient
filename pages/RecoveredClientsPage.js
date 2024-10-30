import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ImageBackground, TextInput, Modal, TouchableWithoutFeedback } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';  
import { useFocusEffect } from '@react-navigation/native';  

const backgroundImage = require('../assets/computer-background.jpg');

export default function RecoveredClientsPage() {
  const [recoveredClients, setRecoveredClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]); // Pour stocker les résultats filtrés
  const [searchQuery, setSearchQuery] = useState('');  // État pour la recherche
  const [visibleSignatures, setVisibleSignatures] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);

  const loadRecoveredClients = async () => {
    try {
      const { data: interventionsData, error } = await supabase
        .from('interventions')
        .select(`
          *,
          clients (name, ficheNumber)
        `)
        .eq('status', 'Récupéré')
        .order('updatedAt', { ascending: false }); // Récupérer toutes les fiches triées par date

      if (error) throw error;

      // Récupérer les images associées aux interventions
      const { data: imagesData, error: imagesError } = await supabase
        .from('intervention_images')
        .select('*');

      if (imagesError) throw imagesError;

      // Associer les images aux interventions
      const interventionsWithImages = interventionsData.map(intervention => {
        const images = imagesData.filter(image => image.intervention_id === intervention.id);
        return { ...intervention, intervention_images: images };
      });

      // Mettre à jour l'état avec toutes les fiches récupérées
      setRecoveredClients(interventionsWithImages);
      // Afficher les trois dernières fiches par défaut
      setFilteredClients(interventionsWithImages.slice(0, 3));
    } catch (error) {
      console.error('Erreur lors du chargement des clients récupérés :', error);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadRecoveredClients(); // Charger les données chaque fois que la page est mise au point
    }, [])
  );

  const toggleSignatureVisibility = (id) => {
    setVisibleSignatures((prevState) => ({
      ...prevState,
      [id]: !prevState[id],
    }));
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      // Si la recherche est vide, afficher les trois dernières fiches par défaut
      setFilteredClients(recoveredClients.slice(0, 3));
    } else {
      // Filtrer les résultats en fonction de la recherche
      const filtered = recoveredClients.filter((client) => {
        const clientName = client.clients?.name?.toLowerCase() || '';
        const clientPhone = client.clients?.phone ? client.clients.phone.toString() : ''; // Vérifier si défini

        return clientName.includes(query.toLowerCase()) || clientPhone.includes(query);
      });
      setFilteredClients(filtered);
    }
  };

  return (
    <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
      <View style={styles.overlay}>
        <Text style={styles.title}>Clients ayant récupéré le matériel</Text>

        <TextInput
          style={styles.searchBar}
          placeholder="Rechercher par nom ou téléphone"
          placeholderTextColor="#ccc"
          value={searchQuery}
          onChangeText={handleSearch}
        />

        <FlatList
          data={filteredClients}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.clientInfo}>Numéro de Client N°: {item.clients.ficheNumber}</Text>
              <Text style={styles.clientInfo}>Nom: {item.clients.name}</Text>
              <Text style={styles.clientInfo}>Téléphone: {item.clients.phone}</Text>
              <Text style={styles.interventionInfo}>Type d'appareil: {item.deviceType}</Text>
              <Text style={styles.interventionInfo}>Marque: {item.brand}</Text>
              <Text style={styles.interventionInfo}>Référence: {item.reference}</Text>
              <Text style={styles.interventionInfo}>Description du problème: {item.description}</Text>
              <Text style={styles.interventionInfo}>Coût: {item.cost} €</Text>
              <Text style={styles.interventionInfo}>Date de récupération: {new Date(item.updatedAt).toLocaleDateString('fr-FR')}</Text>
              <Text style={styles.interventionInfo}>Détail de l'intervention: {item.detailIntervention}</Text>
			  {item.receiver_name && (
              <Text style={styles.receiverText}>Récupéré par : {item.receiver_name}</Text>
            )}
			  <Text style={styles.interventionInfo}>Remarques: {item.guarantee}</Text>
      
              {item.intervention_images && item.intervention_images.length > 0 && (
                <View style={styles.imageContainer}>
                  {item.intervention_images.map((image, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => setSelectedImage(`data:image/jpeg;base64,${image.image_data}`)}
                    >
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${image.image_data}` }}
                        style={styles.imageThumbnail}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.toggleButton}
                onPress={() => toggleSignatureVisibility(item.id)}
              >
                <Icon
                  name={visibleSignatures[item.id] ? 'eye-slash' : 'eye'}
                  size={20}
                  color="#fff"
                  style={styles.icon}
                />
                <Text style={styles.toggleButtonText}>
                  {visibleSignatures[item.id] ? 'Masquer la signature' : 'Afficher la signature'}
                </Text>
              </TouchableOpacity>

              {visibleSignatures[item.id] && item.signature ? (
                <Image
                  source={{ uri: item.signature }}
                  style={styles.signatureImage}
                />
              ) : null}
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      </View>
      <Modal
        visible={selectedImage !== null}
        transparent={true}
        onRequestClose={() => setSelectedImage(null)}
      >
        <TouchableWithoutFeedback onPress={() => setSelectedImage(null)}>
          <View style={styles.modalBackground}>
            <Image
              source={{ uri: selectedImage }}
              style={styles.fullImage}
            />
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ImageBackground>
  );
}
const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#fff',
  },
  searchBar: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 20,
    marginBottom: 20,
    fontSize: 16,
    color: '#000',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
    elevation: 2,
  },
  clientInfo: {
    fontSize: 16,
    marginBottom: 5,
  },
  interventionInfo: {
    fontSize: 14,
    marginBottom: 5,
    color: '#555',
  },
  toggleButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
    backgroundColor: '#464545',
    borderRadius: 5,
  },
  toggleButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 10,
  },
  icon: {
    marginRight: 10,
  },
  signatureImage: {
    width: '70%',
    height: 300,
    marginTop: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  imageContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
imageThumbnail: {
  width: 80,
  height: 80,
  margin: 5,
  borderRadius: 5,
  resizeMode: 'cover', // S'assurer que l'image couvre la zone de la miniature
},
modalBackground: {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(0, 0, 0, 0.8)', // Fond sombre
},
fullImage: {
  width: '90%',
  height: '90%',
  resizeMode: 'contain', // Pour que l'image s'adapte à l'écran
},
receiverText: {
    fontSize: 18,
    color: "#571515",
    marginTop: 5,
  },
});

 