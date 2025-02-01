import React, { useState } from 'react';
import { View, TextInput, StyleSheet, Alert, Text, TouchableOpacity, ImageBackground, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons'; // Import des icônes
import { supabase } from './supabaseClient';


export default function SignUpPage({ navigation }) {
	const backgroundImage = require('./assets/listing2.jpg');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false); // Contrôle de la visibilité du mot de passe

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Veuillez entrer votre email et mot de passe.');
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        Alert.alert('Erreur', error.message);
      } else {
        Alert.alert('Succès', 'Inscription réussie ! Un email de confirmation vous a été envoyé.');
        navigation.navigate('Login'); // Rediriger vers la page de connexion après inscription
      }
    } catch (error) {
      console.error('Erreur lors de l\'inscription :', error);
    }
  };

  return (
    <ImageBackground source={backgroundImage} style={styles.backgroundImage}>
      <View style={styles.overlay}>
       
        <Image source={require('./assets/logo_phone.png')} style={styles.logo} />
        <Text style={styles.title}>Créer un compte</Text>

     
        <View style={styles.inputContainer}>
		<Image
    source={require('./assets/icons/mail.png')} // Chemin vers votre image
    style={[styles.checkIcon, { width: 22, height: 22, tintColor: "#010253", marginRight: 10, }]} // Personnalisation de l'image
/>
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
            <Icon name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#888" />
          </TouchableOpacity>
        </View>

        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.loginButton} onPress={handleSignUp}>
            <Icon name="person-add-outline" size={20} color="#202020" style={styles.icon} />
            <Text style={styles.buttonText}>S'inscrire</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signUpButton} onPress={() => navigation.navigate('Login')}>
            <Icon name="log-in-outline" size={20} color="#202020" style={styles.icon} />
            <Text style={styles.buttonText}>Déjà inscrit ? Connectez-vous</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    resizeMode: 'cover', // L'image couvre toute la page
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(39, 39, 39, 0.863)', // Voile sombre pour améliorer la lisibilité
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
    flexDirection: 'row', // Aligne les icônes et les champs sur la même ligne
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 5,
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 10,
    marginBottom: 20,
    height: 40,
  },
  icon: {
    marginRight: 10, // Espace entre l'icône et le champ texte
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333333',
  },
  buttonContainer: {
    flexDirection: 'row', // Les boutons sont alignés en ligne
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
});
