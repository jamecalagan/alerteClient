import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ImageBackground } from 'react-native';
import { supabase } from '../supabaseClient';
import { useFocusEffect } from '@react-navigation/native';  // Import de useFocusEffect

// Import de l'image depuis le dossier assets
const backgroundImage = require('../assets/repared.jpg');

export default function RepairedInterventionsPage({ navigation }) {
  const [repairedInterventions, setRepairedInterventions] = useState([]);

  const loadRepairedInterventions = async () => {
    try {
      const { data, error } = await supabase
        .from('interventions')
        .select(`
          *,
          clients (name, ficheNumber)
        `)
        .eq('status', 'Réparé');

      if (error) throw error;

      setRepairedInterventions(data);
    } catch (error) {
      console.error('Erreur lors du chargement des interventions réparées :', error);
    }
  };

  // Utilisation de useFocusEffect pour recharger les données lorsque la page devient active
  useFocusEffect(
    React.useCallback(() => {
      loadRepairedInterventions();
    }, [])
  );

  return (
    <ImageBackground source={backgroundImage} style={styles.backgroundImage}> 
    
      <View style={styles.overlay}> 
      <Text style={styles.title}>Interventions terminées</Text>
        <FlatList
          data={repairedInterventions}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View
              style={[
                styles.interventionCard,
                item.restitue ? styles.restitueCard : null  // Applique un style grisé si restituée
              ]}
            >
              <Text style={styles.interventionText}>Fiche N° : {item.clients.ficheNumber}</Text>
              <Text style={styles.interventionText}>Client : {item.clients.name}</Text>
              <Text style={styles.interventionText}>Type d'appareil: {item.deviceType}</Text>
              <Text style={styles.interventionText}>Marque: {item.brand}</Text>  
              <Text style={styles.interventionText}>Référence: {item.reference}</Text>
              <Text style={styles.interventionText}>Description du problème: {item.description}</Text>
              <Text style={styles.interventionText}>Chargeur: {item.chargeur ? 'Oui' : 'Non'}</Text>
              <Text style={styles.interventionText}>Coût: {item.cost} €</Text>
              <Text style={styles.interventionText}>Statut: {item.status}</Text>
              <Text style={styles.interventionText}>Commande: {item.commande}</Text>
              <Text style={styles.interventionText}>Date: {new Date(item.createdAt).toLocaleDateString('fr-FR')}</Text>

              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={() => navigation.navigate('EditIntervention', { interventionId: item.id, clientId: item.client_id })}
                >
                  <Text style={styles.buttonText}>Éditer</Text>  
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.restitutionButton}
                  onPress={() => navigation.navigate('SignaturePage', { interventionId: item.id, clientId: item.client_id })}
                >
                  <Text style={styles.buttonText}>Restitution</Text>  
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',  // L'image couvre toute la page
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',  // Voile sombre pour améliorer la lisibilité
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#fff',
  },
  interventionCard: {
    padding: 15,
    marginBottom: 10,
    backgroundColor: 'rgba(168, 204, 181, 0.9)',  // Fiche avec 90% d'opacité pour voir l'image de fond
    borderRadius: 10,
  },
  interventionText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  editButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 50,
    flex: 1,
    marginRight: 10,
  },
  restitutionButton: {
    backgroundColor: '#28A745',
    padding: 10,
    borderRadius: 50,
    flex: 1,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  restitueCard: {
    backgroundColor: '#d3d3d3', // Grise la carte si restituée
  },
});
