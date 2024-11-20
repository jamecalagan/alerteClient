import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, ImageBackground, Keyboard } from 'react-native';
import { supabase } from '../supabaseClient';
import RoundedButton from '../components/RoundedButton';
import CustomAlert from '../components/CustomAlert'; // Import du composant CustomAlert
import Icon from 'react-native-vector-icons/Ionicons'; // Importer les icônes

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
        // Vérifier si le client existe déjà
        const { data: existingClient, error: checkError } = await supabase
            .from('clients')
            .select('ficheNumber, id') // Assurez-vous de récupérer l'ID
            .or(`name.eq.${name},phone.eq.${phone}`);

        if (checkError) throw checkError;

        if (existingClient && existingClient.length > 0) {
            const ficheNumber = existingClient[0].ficheNumber;
            setAlertTitle('Client déjà existant');
            setAlertMessage(`Le client existe déjà avec le numéro de fiche N° ${ficheNumber}.`);
            setAlertVisible(true);
            return;
        }

        // Récupérer le numéro de fiche le plus élevé
        const { data: maxFicheData, error: maxFicheError } = await supabase
            .from('clients')
            .select('ficheNumber')
            .order('ficheNumber', { ascending: false })
            .limit(1)
            .single();

        if (maxFicheError) throw maxFicheError;

        // Définir le nouveau numéro de fiche
        const newFicheNumber = maxFicheData ? maxFicheData.ficheNumber + 1 : 6001;

        // Insérer le nouveau client avec le nouveau numéro de fiche
        const { data, error } = await supabase
            .from('clients')
            .insert([{ name, phone, email: email || null, ficheNumber: newFicheNumber, createdAt: new Date().toISOString(), interventions: [] }])
            .select()
            .single();

        if (error) throw error;

        // Réinitialiser les champs après l'ajout du client
        setName('');
        setPhone('');
        setEmail('');
		Keyboard.dismiss()
        // Naviguer vers AddInterventionPage
        setTimeout(() => {
			navigation.navigate('AddIntervention', { clientId: data.id });
		}, 100); // Délai de 100ms

    } catch (error) {
        console.error('Erreur lors de l\'ajout du client', error);
        Alert.alert('Erreur', "Une erreur s'est produite lors de l'ajout du client.");
    }
};


  
  const handleCloseAlert = () => {
    // Fermer l'alerte et ensuite naviguer vers la page Home
    setAlertVisible(false);
	Keyboard.dismiss()
    setTimeout(() => {
		navigation.navigate('AddIntervention', { clientId: data.id });
	}, 100); // Délai de 100ms
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
  {/* Champ Nom du client */}
  <View style={styles.inputContainer}>
    <Icon name="person-outline" size={20} color="#888" style={styles.iconLeft} />
    <TextInput
      style={styles.input}
      placeholder="Nom du client"
      value={name}
      onChangeText={setName}
      autoCapitalize="characters"
      placeholderTextColor="#aaa"
    />
  </View>

  {/* Champ Numéro de téléphone */}
  <View style={styles.inputContainer}>
    <Icon name="call-outline" size={20} color="#888888" style={styles.iconLeft} />
    <TextInput
      style={styles.input}
      placeholder="Numéro de téléphone"
      value={phone}
      onChangeText={setPhone}
      keyboardType="phone-pad"
      placeholderTextColor="#aaa"
    />
  </View>

  {/* Champ Adresse e-mail */}
  <View style={styles.inputContainer}>
    <Icon name="mail-outline" size={20} color="#888" style={styles.iconLeft} />
    <TextInput
      style={styles.input}
      placeholder="Adresse e-mail (optionnel)"
      value={email}
      onChangeText={setEmail}
      keyboardType="email-address"
      placeholderTextColor="#aaa"
    />
  </View>

  {/* Bouton Ajouter */}
  <RoundedButton
    title={loading ? 'En cours...' : 'Enregistrer le client'}
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
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0)',
    borderRadius: 10,
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 10,
    marginBottom: 15,
    height: 40,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  iconLeft: {
marginLeft: 5,
marginRight: 10, // Espacement entre le champ et l'icône
  },
});
