import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ImageBackground, TextInput, Modal, TouchableWithoutFeedback } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';

const backgroundImage = require('../assets/computer-background.jpg');

export default function RecoveredClientsPage() {
  const [recoveredClients, setRecoveredClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleSignatures, setVisibleSignatures] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);

  const loadRecoveredClients = async () => {
    try {
      const { data, error } = await supabase
        .from('interventions')
        .select(`
          *,
          clients (name, ficheNumber, phone)
        `)
        .eq('status', 'Récupéré')
        .order('updatedAt', { ascending: false });

      if (error) throw error;

      setRecoveredClients(data);
      setFilteredClients(data.slice(0, 3));
    } catch (error) {
      console.error('Erreur lors du chargement des clients récupérés :', error);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadRecoveredClients();
    }, [])
  );

  const toggleSignatureVisibility = (id) => {
    setVisibleSignatures(prevState => ({
      ...prevState,
      [id]: !prevState[id],
    }));
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setFilteredClients(recoveredClients.slice(0, 3));
    } else {
      const filtered = recoveredClients.filter(client => {
        const clientName = client.clients?.name?.toLowerCase() || '';
        const clientPhone = client.clients?.phone ? client.clients.phone.toString() : '';

        return clientName.includes(query.toLowerCase()) || clientPhone.includes(query);
      });
      setFilteredClients(filtered);
    }
  };
  const formatPhoneNumber = (phone) => {
    return phone.replace(/(\d{2})(?=\d)/g, '$1 ');
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
              <Text style={styles.clientInfo}>
				Téléphone: {item.clients.phone.replace(/(\d{2})(?=\d)/g, '$1 ')}
				</Text>
              <Text style={styles.interventionInfo}>Type d'appareil: {item.deviceType}</Text>
              <Text style={styles.interventionInfo}>Marque: {item.brand}</Text>
			  <Text style={styles.interventionInfo}>Modèle: {item.model}</Text>
              <Text style={styles.interventionInfo}>Référence: {item.reference}</Text>
              <Text style={styles.interventionInfo}>Description du problème: {item.description}</Text>
              <Text style={styles.interventionInfo}>Coût: {item.cost} €</Text>
              <Text style={styles.interventionInfo}>Date de récupération: {new Date(item.updatedAt).toLocaleDateString('fr-FR')}</Text>
              <Text style={styles.interventionInfo}>Détail de l'intervention: {item.detailIntervention}</Text>
              {item.receiver_name && (
                <Text style={styles.receiverText}>Récupéré par : {item.receiver_name}</Text>
              )}
              <Text style={styles.interventionInfo}>Remarques: {item.remarks}</Text>
			  <Text style={styles.interventionInfo}>Status du règlement: {item.paymentStatus}</Text>

              {/* Affichage des images d'intervention depuis la table interventions */}
              {item.photos && item.photos.length > 0 && (
                <View style={styles.imageContainer}>
                  {item.photos.map((photo, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => setSelectedImage(`data:image/jpeg;base64,${photo}`)}
                    >
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${photo}` }}
                        style={[
                          styles.imageThumbnail,
                          item.label_photo === photo ? styles.labelImage : null,
                        ]}
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
                  color="#202020"
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
    borderRadius: 5,
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
    backgroundColor: '#f7f7f7',
	borderWidth: 1,
	borderColor: '#929090',
    borderRadius: 5,
	elevation: 5,
  },
  toggleButtonText: {
    color: '#202020',
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
    resizeMode: 'cover',
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
  receiverText: {
    fontSize: 18,
    color: "#571515",
    marginTop: 5,
  },
  labelImage: {
    borderWidth: 2,
    borderColor: 'green',
  },
});
