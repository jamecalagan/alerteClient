import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, ImageBackground } from 'react-native';
import { supabase } from '../supabaseClient';
import RoundedButton from '../components/RoundedButton';
import CustomAlert from '../components/CustomAlert'; // Import du composant CustomAlert

// Import de l'image depuis le dossier assets
const backgroundImage = require('../assets/inscriptions.jpg');

export default function AddClientPage({ navigation, route }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(''); // Ajout de l'email
  const [loading, setLoading] = useState(false); // Gestion de l'état de chargement

  const [alertVisible, setAlertVisible] = useState(false); // État pour gérer la visibilité de CustomAlert
  const [alertMessage, setAlertMessage] = useState(''); // Message de CustomAlert
  const [alertTitle, setAlertTitle] = useState(''); // Titre de CustomAlert

  const validateFields = () => {
    if (!name || !phone) {
      setAlertTitle('Erreur');
      setAlertMessage('Le nom et le numéro de téléphone doivent être remplis.');
      setAlertVisible(true);
      return false;
    }
    return true;
  };

  const handleAddClient = async () => {
    if (!validateFields()) return;
  
    try {
      const { data: existingClient, error: checkError } = await supabase
        .from('clients')
        .select('ficheNumber')
        .or(`name.eq.${name},phone.eq.${phone}`);
  
      if (checkError) throw checkError;
  
      if (existingClient && existingClient.length > 0) {
        const ficheNumber = existingClient[0].ficheNumber;
        setAlertTitle('Client déjà existant');
        setAlertMessage(`Le client existe déjà avec le numéro de fiche N° ${ficheNumber}.`);
        setAlertVisible(true);
        return;
      }
  
      const { error } = await supabase
        .from('clients')
        .insert([{ name, phone, email: email || null, createdAt: new Date().toISOString(), interventions: [] }]);
  
      if (error) throw error;
  
      setAlertTitle('Succès');
      setAlertMessage('Client ajouté avec succès.');
      setAlertVisible(true);
  
      // Réinitialiser les champs après l'ajout du client
      setName('');
      setPhone('');
      setEmail('');
  
      // Rediriger seulement après la fermeture de la modale
    } catch (error) {
      console.error('Erreur lors de l\'ajout du client', error);
    }
  };
  
  const handleCloseAlert = () => {
    // Fermer l'alerte et ensuite naviguer vers la page Home
    setAlertVisible(false);
    navigation.navigate('Home', { reloadClients: true });
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
            disabled={loading}
          />
        </View>

        <CustomAlert
  visible={alertVisible}
  title={alertTitle}
  message={alertMessage}
  onClose={handleCloseAlert} // Utilise handleCloseAlert pour naviguer après fermeture
/>

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
