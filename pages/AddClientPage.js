import React, { useState, useEffect } from 'react';
import { View, TextInput, StyleSheet, ImageBackground, Keyboard, Alert, Image } from 'react-native';
import { supabase } from '../supabaseClient';
import RoundedButton from '../components/RoundedButton';
import CustomAlert from '../components/CustomAlert'; // Import du composant CustomAlert




export default function AddClientPage({ navigation, route }) {
	// Import de l'image depuis le dossier assets
const backgroundImage = require('../assets/listing2.jpg');
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
        // Vérification si un client existe déjà
        const { data: existingClients, error: checkError } = await supabase
            .from('clients')
            .select('*')
            .or(`name.eq.${name},phone.eq.${phone}`);

        if (checkError) {
            console.error('Erreur lors de la vérification des clients :', checkError.message);
            Alert.alert('Erreur', "Erreur lors de la vérification des clients existants.");
            return;
        }

        if (existingClients && existingClients.length > 0) {
            // Si le client existe déjà, afficher un message et rester sur la page
            Alert.alert(
                'Client existant',
                `Un client avec ce nom ou numéro de téléphone existe déjà.`
            );
            return;
        }

        // Récupérer le numéro de fiche le plus élevé
        const { data: maxFicheData, error: maxFicheError } = await supabase
            .from('clients')
            .select('ficheNumber')
            .order('ficheNumber', { ascending: false })
            .limit(1)
            .single();

        if (maxFicheError) {
            console.error('Erreur lors de la récupération du numéro de fiche :', maxFicheError.message);
            Alert.alert('Erreur', "Erreur lors de la récupération du numéro de fiche.");
            return;
        }

        const newFicheNumber = maxFicheData ? maxFicheData.ficheNumber + 1 : 6001;

        // Insérer un nouveau client
        const { data: insertedData, error: insertError } = await supabase
            .from('clients')
            .insert([{ 
                name, 
                phone, 
                email: email || null, 
                ficheNumber: newFicheNumber, 
                createdAt: new Date().toISOString() 
            }])
            .select()
            .single();

        if (insertError) {
            console.error('Erreur lors de l\'insertion du client :', insertError.message);
            Alert.alert('Erreur', "Erreur lors de l'insertion du nouveau client.");
            return;
        }

        if (!insertedData) {
            console.error('Erreur : Aucune donnée insérée.');
            Alert.alert('Erreur', "Aucune donnée reçue après l'insertion.");
            return;
        }

        // Réinitialiser les champs et naviguer
        setName('');
        setPhone('');
        setEmail('');
        Keyboard.dismiss();
        navigation.navigate('AddIntervention', { clientId: insertedData.id });

    } catch (error) {
        console.error('Erreur inattendue :', error.message);
        Alert.alert('Erreur', "Une erreur inattendue est survenue.");
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
  <Image
    source={require('../assets/icons/person.png')} // Chemin vers votre image
    style={[styles.checkIcon, { width: 20, height: 20, tintColor: "#010253", marginRight: 10, }]} // Personnalisation de l'image
/>
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
  <Image
    source={require('../assets/icons/call.png')} // Chemin vers votre image
    style={[styles.checkIcon, { width: 20, height: 20, tintColor: "#010253", marginRight: 10, }]} // Personnalisation de l'image
/>
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
  <Image
    source={require('../assets/icons/mail.png')} // Chemin vers votre image
    style={[styles.checkIcon, { width: 20, height: 20, tintColor: "#010253", marginRight: 10, }]} // Personnalisation de l'image
/>
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
    backgroundColor: 'rgba(39, 39, 39, 0.308)',
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
