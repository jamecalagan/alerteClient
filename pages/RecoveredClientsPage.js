import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ImageBackground, TextInput } from 'react-native';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';  
import { useFocusEffect } from '@react-navigation/native';  

const backgroundImage = require('../assets/computer-background.jpg');

export default function RecoveredClientsPage() {
  const [recoveredClients, setRecoveredClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]); // Pour stocker les résultats filtrés
  const [searchQuery, setSearchQuery] = useState('');  // État pour la recherche
  const [visibleSignatures, setVisibleSignatures] = useState({});

  const loadRecoveredClients = async () => {
    try {
      const { data, error } = await supabase
        .from('interventions')
        .select(`
          *,
          clients (name, phone, ficheNumber)
        `)
        .eq('status', 'Récupéré'); // Filtre pour les interventions récupérées

      if (error) throw error;

      setRecoveredClients(data);
      setFilteredClients(data);  // Initialement, tous les clients sont affichés
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
    setVisibleSignatures((prevState) => ({
      ...prevState,
      [id]: !prevState[id],
    }));
  };

  // Fonction pour filtrer les clients en fonction de la recherche
  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setFilteredClients(recoveredClients); // Si le champ de recherche est vide, on affiche tous les clients
    } else {
      const filtered = recoveredClients.filter((client) =>
        client.clients.name.toLowerCase().includes(query.toLowerCase()) ||
        client.clients.phone.includes(query)
      );
      setFilteredClients(filtered);
    }
  };

  return (
    <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
      <View style={styles.overlay}>
        <Text style={styles.title}>Clients ayant récupéré le matériel</Text>

        {/* Champ de recherche */}
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
    backgroundColor: '#007BFF',
    borderRadius: 50,
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
});

 