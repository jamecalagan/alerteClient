import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ImageBackground } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';  // Importer les icônes
import CustomAlert from './components/CustomAlert';  // Assure-toi d'importer le composant CustomAlert
import { supabase } from './supabaseClient';
// Import de l'image depuis le dossier assets
const backgroundImage = require('./assets/signInUp.jpg');

export default function LoginPage({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false); // Contrôle la visibilité du mot de passe
  
  // États pour gérer l'affichage de l'alerte
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  // Fonction pour afficher l'alerte personnalisée
  const showAlert = (title, message) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Erreur', 'Veuillez entrer votre email et mot de passe.');
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        showAlert('Erreur', error.message);
      } else if (data?.session) {
        showAlert('Succès', 'Connexion réussie !');
        navigation.replace('MainTabs');
      }
    } catch (error) {
      showAlert('Erreur', 'Un problème est survenu lors de la connexion.');
    }
  };

  return (
    <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
      <View style={styles.container}>
        {/* Affichage du logo */}
        <Image
          source={require('./assets/logo_phone.png')}
          style={styles.logo}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        
        {/* Champ mot de passe avec icône eye */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}  // Bascule entre masqué/visible
          />
          <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
            <Icon name={passwordVisible ? 'eye-off' : 'eye'} size={24} color="gray" />
          </TouchableOpacity>
        </View>

        {/* Container pour les deux boutons côte à côte */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Icon name="log-in-outline" size={20} color="#fff" style={styles.icon} />
            <Text style={styles.buttonText}>Se connecter</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signUpButton} onPress={() => navigation.navigate('SignUp')}>
            <Icon name="person-add-outline" size={20} color="#fff" style={styles.icon} />
            <Text style={styles.buttonText}>Créer un compte</Text>
          </TouchableOpacity>
        </View>

        {/* Alerte personnalisée */}
        <CustomAlert
          visible={alertVisible}
          title={alertTitle}
          message={alertMessage}
          onClose={() => setAlertVisible(false)}
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
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  input: {
    height: 40,  // Fixe une hauteur pour les champs
    borderWidth: 1,
    borderColor: '#cccccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#e0e0e0',
    color: '#333333',
  },
  inputContainer: {
    flexDirection: 'row',  // Aligne le champ mot de passe et l'icône eye
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 5,
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 10,
    marginBottom: 20,
    height: 40,  // Fixe la hauteur de l'ensemble du container
  },
  passwordInput: {
    flex: 1,  // Le TextInput prend tout l'espace disponible
    padding: 10,
    color: '#333333',
    height: 40,  // Assure une hauteur contrôlée pour le champ mot de passe
  },
  logo: {
    width: 250,
    height: 250,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 50,  // Ajuste l'espacement
  },
  buttonContainer: {
    flexDirection: 'row',  // Les boutons sont alignés en ligne
    justifyContent: 'space-between',
    marginTop: 20,
  },
  loginButton: {
    backgroundColor: '#007BFF',  // Couleur bleue
    flexDirection: 'row',  // Icone et texte côte à côte
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 25,  // Bords arrondis
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,  // Chaque bouton prend 50% de la largeur
    marginRight: 10,  // Espace entre les boutons
  },
  signUpButton: {
    backgroundColor: '#28A745',  // Couleur verte
    flexDirection: 'row',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,  // Espace entre l'icône et le texte
  },
  icon: {
    marginRight: 5,  // Espacement entre l'icône et le texte
  },
});
