import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { supabase } from '../supabaseClient';

export default function ClientInterventionsPage({ route, navigation }) {
  const { clientId } = route.params;
  const [interventions, setInterventions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [deviceType, setDeviceType] = useState('default');
  // Récupérer le client sélectionné au départ
  useEffect(() => {
    const fetchClient = async () => {
      try {
        const { data: clientData, error } = await supabase
          .from('clients')
          .select('id, name, phone')
          .eq('id', clientId)
          .single();

        if (error) throw error;

        setSelectedClient(clientData);  // Stocker le client sélectionné initialement
      } catch (error) {
        console.error('Erreur lors du chargement du client :', error);
      }
    };

    fetchClient();
  }, [clientId]);

  // Récupérer les interventions pour le client sélectionné au départ
  useEffect(() => {
    if (selectedClient) {
		const fetchClientInterventions = async () => {
			try {
			  const { data, error } = await supabase
				.from('interventions')
				.select('*, photos, label_photo')  // Assurez-vous que 'photos' est récupéré
				.eq('client_id', selectedClient.id)
				.order('createdAt', { ascending: false });
		  
			  if (error) throw error;
		  
			  setInterventions(data);  // Stocker les interventions du client sélectionné
			} catch (error) {
			  console.error('Erreur lors du chargement des interventions :', error);
			}
		  };

      fetchClientInterventions();
    }
  }, [selectedClient]);

  // Rechercher d'autres clients si besoin
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const { data: clientData, error } = await supabase
          .from('clients')
          .select('id, name, phone');
        
        if (error) throw error;

        setClients(clientData);  // Stocker tous les clients pour la recherche
      } catch (error) {
        console.error('Erreur lors du chargement des clients :', error);
      }
    };

    fetchClients();
  }, []);

  // Filtrer les clients selon la recherche
  const filteredClients = clients.filter((client) =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.phone.includes(searchQuery)
  );
  const handleImagePress = (imageUri) => {
    setSelectedImage(imageUri);
  };
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100} // Ajuster en fonction de la position désirée
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Interventions du client</Text>

        {/* Champ de recherche */}
        <TextInput
          style={styles.searchBar}
          placeholder="Rechercher par nom ou téléphone"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />

        {/* Afficher uniquement le client sélectionné au départ */}
        {selectedClient && searchQuery === '' && (
          <View style={{ flex: 1 }}>
            <Text style={styles.clientInfo}>Client : {selectedClient.name} - {selectedClient.phone}</Text>
			<FlatList
  data={interventions}
  keyExtractor={(item) => item.id.toString()}
  renderItem={({ item }) => (
    <View style={styles.interventionCard}>
      <View style={styles.interventionDetails}>
        <Text>Référence : {item.reference || 'N/A'}</Text>
        <Text>Produit : {item.deviceType || 'N/A'}</Text>
        <Text>Marque : {item.brand || 'N/A'}</Text>
        <Text>Modèle : {item.model || 'N/A'}</Text>
        <Text>Description : {item.description}</Text>
        <Text>Statut : {item.status}</Text>
        <Text>Coût : {item.cost} €</Text>
        <Text>Date : {new Date(item.createdAt).toLocaleDateString('fr-FR')}</Text>
        <Text>Détail de l'intervention: {item.detailIntervention}</Text>

        {item.status === 'Récupéré' && (
          <Text style={styles.updatedAt}>
            Date de récupération : {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('fr-FR') : 'Non disponible'}
          </Text>
        )}
      </View>

      {/* Image de l'étiquette */}
      <View style={styles.labelContainer}>
        {item.label_photo ? (
          <TouchableOpacity onPress={() => handleImagePress(item.label_photo)}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.label_photo}` }}
              style={styles.labelImage}
            />
          </TouchableOpacity>
        ) : (
          <Text style={styles.referenceText}>{item.reference || 'Référence manquante'}</Text>
        )}
      </View>

      {/* Images associées */}
      <View style={styles.photosContainer}>
        {item.photos && item.photos.length > 0 ? (
          item.photos
            .filter((photoUri) => photoUri !== item.label_photo) // Exclure l'image de l'étiquette
            .map((photoUri, index) => (
              <TouchableOpacity key={index} onPress={() => handleImagePress(photoUri)}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${photoUri}` }}
                  style={styles.photo}
                />
              </TouchableOpacity>
            ))
        ) : (
          <Text style={styles.noPhotosText}>Pas d'images disponibles</Text>
        )}
      </View>
    </View>
  )}
/>

          </View>
        )}

        {/* Liste des clients pour rechercher un autre client */}
        {searchQuery !== '' && (
          <FlatList
            data={filteredClients}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => {
                  setSelectedClient(item);  // Sélectionner un nouveau client
                  setSearchQuery('');  // Réinitialiser le champ de recherche
                }}
                style={styles.clientCard}
              >
                <Text>{item.name} - {item.phone}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
      {selectedImage && (
        <Modal
          transparent={true}
          visible={true}
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
    </KeyboardAvoidingView>
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
  searchBar: {
    height: 40,
    borderColor: '#ddd',
    borderWidth: 1,
    paddingLeft: 8,
    marginBottom: 20,
    borderRadius: 5,
  },
  clientCard: {
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  clientInfo: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  interventionCard: {
    flexDirection: 'row', // Alignement horizontal pour avoir les détails et l'image côte à côte
    justifyContent: 'space-between',
    padding: 15,
    marginBottom: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  recuperedStatusCard: {
    borderColor: 'red', // Bordure rouge pour le statut récupéré
    borderWidth: 2,
  },
  updatedAt: {
    fontWeight: 'bold',  // Texte en gras pour la date de récupération
    marginTop: 10,
  },
  interventionDetails: {
    flex: 3,  // Plus d'espace pour les détails de l'intervention
  },
  labelContainer: {
    flex: 1,  // Espace pour l'image de l'étiquette
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#49f760',
  },
  referenceText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
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
  photosContainer: {
  flexDirection: 'row',
  flexWrap: 'wrap', // Permettre les retours à la ligne pour les images
  gap: 8,
  marginTop: 40,
},
photo: {
  width: 60,
  height: 60,
  margin: 5,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '#ccc',
},
noPhotosText: {
  fontSize: 14,
  fontStyle: 'italic',
  color: '#999',
  marginTop: 10,
},
});
