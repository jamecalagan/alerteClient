import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, Alert, ImageBackground } from 'react-native';
import { supabase } from '../supabaseClient';
import RoundedButton from '../components/RoundedButton';

// Import de l'image depuis le dossier assets
const backgroundImage = require('../assets/inscriptions.jpg');

export default function AddClientPage({ navigation, route }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(''); // Ajout de l'email
  const [loading, setLoading] = useState(false); // Gestion de l'état de chargement

  const validateFields = () => {
    if (!name || !phone) {
      Alert.alert('Erreur', 'Le nom et le numéro de téléphone doivent être remplis.');
      return false;
    }
    return true;
  };

  // Fonction pour vérifier si un client existe déjà dans la base de données
  const checkIfClientExists = async (phone) => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('phone', phone); // Vérifier si le client avec ce numéro de téléphone existe

      if (error) throw error;

      return data.length > 0; // Retourne true si le client existe déjà
    } catch (error) {
      console.error('Erreur lors de la vérification du client', error);
      return false; // Si une erreur survient, on considère que le client n'existe pas
    }
  };

  const handleAddClient = async () => {
    if (!validateFields()) return;
  
    try {
      // Vérifier si un client avec le même nom ou numéro de téléphone existe déjà
      const { data: existingClient, error: checkError } = await supabase
        .from('clients')
        .select('ficheNumber') // Sélectionne uniquement le numéro de fiche si le client existe
        .or(`name.eq.${name},phone.eq.${phone}`);
  
      if (checkError) throw checkError;
  
      // Si le client existe, afficher son numéro de fiche
      if (existingClient && existingClient.length > 0) {
        const ficheNumber = existingClient[0].ficheNumber;
        Alert.alert(
          'Client déjà existant',
          `Le client existe déjà avec le numéro de fiche N° ${ficheNumber}.`,
          [{ text: 'OK' }]
        );
        return;
      }
  
      // Si le client n'existe pas, ajouter le nouveau client
      const { error } = await supabase
        .from('clients')
        .insert([{ name, phone, email: email || null, createdAt: new Date().toISOString(), interventions: [] }]);
  
      if (error) throw error;
  
      Alert.alert('Succès', 'Client ajouté avec succès.');
  
      // Réinitialiser les champs après succès
      setName('');
      setPhone('');
      setEmail(''); // Réinitialiser le champ e-mail aussi
  
      navigation.navigate('Home', { reloadClients: true });
    } catch (error) {
      console.error('Erreur lors de l\'ajout du client', error);
    }
  };
  
  

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (route.params?.reloadClients) {
        // Logique de rechargement si nécessaire
      }
    });
    return unsubscribe;
  }, [navigation, route.params]);

  return (
    <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TextInput
            style={styles.input}
            placeholder="Nom du client"
            value={name}
            onChangeText={setName}
            autoCapitalize="characters"
          />
          <TextInput
            style={styles.input}
            placeholder="Numéro de téléphone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.input}
            placeholder="Adresse e-mail (optionnel)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />

          <RoundedButton
            title={loading ? 'En cours...' : 'Ajouter le client'}
            onPress={handleAddClient}
            disabled={loading} // Désactiver le bouton pendant le chargement
          />
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 10,
    width: '100%',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cccccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#e0e0e0',
    color: '#333333',
  },
});
