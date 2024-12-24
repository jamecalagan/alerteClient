import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ImageBackground } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons'; // Importer les icônes
import CustomAlert from './components/CustomAlert'; // Assure-toi d'importer le composant CustomAlert
import { supabase } from './supabaseClient';
// Import de l'image depuis le dossier assets


export default function LoginPage({ navigation }) {
	const backgroundImage = require('./assets/signInUp.jpg');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

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
        navigation.navigation.reset;
      }
    } catch (error) {
      showAlert('Erreur', 'Un problème est survenu lors de la connexion.');
    }
  };

  return (
    <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
      <View style={styles.overlay}>
        {/* Affichage du logo */}
        <Image source={require('./assets/logo_phone.png')} style={styles.logo} />
        <Text style={styles.title}>Connexion</Text>

        {/* Champ Email avec icône */}
        <View style={styles.inputContainer}>
          <Icon name="mail-outline" size={20} color="#888" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#aaa"
          />
        </View>

        {/* Champ mot de passe avec icône */}
        <View style={styles.inputContainer}>
          <Icon name="lock-closed-outline" size={20} color="#888" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}
            placeholderTextColor="#aaa"
          />
          <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
            <Icon name={passwordVisible ? 'eye-off' : 'eye'} size={24} color="gray" />
          </TouchableOpacity>
        </View>

        {/* Container pour les deux boutons côte à côte */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
            <Icon name="log-in-outline" size={20} color="#202020" style={styles.icon} />
            <Text style={styles.buttonText}>Se connecter</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signUpButton} onPress={() => navigation.navigate('SignUp')}>
            <Icon name="person-add-outline" size={20} color="#202020" style={styles.icon} />
            <Text style={styles.buttonText}>Créer un compte</Text>
          </TouchableOpacity>
        </View>

        {/* Alerte personnalisée */}
        <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={() => setAlertVisible(false)} />

		<Text style={styles.copyright}>-- Alerte Client Copyright 2024 Avenir Informatique --</Text>
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
    backgroundColor: 'rgba(39, 39, 39, 0.863)',
    padding: 60,
  },
  logo: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 50,
	marginTop: 100,
  },
  title: {
    fontSize: 34,
    color: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 80,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6d6c6c',
    borderRadius: 5,
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 10,
    marginBottom: 20,
    height: 40,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  loginButton: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginRight: 10,
    elevation: 5,
  },
  signUpButton: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    elevation: 5,
  },
  buttonText: {
    color: '#202020',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  copyright: {
	fontSize: 18,
    color: '#918f8f',
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 80,
  }
});
