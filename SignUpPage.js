import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, Alert, Text, TouchableOpacity } from 'react-native';
import { supabase } from './supabaseClient';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function SignUpPage({ navigation }) {
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
        navigation.navigate('Login');  // Rediriger vers la page de connexion après inscription
      }
    } catch (error) {
      console.error('Erreur lors de l\'inscription :', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Créer un compte</Text>
      
      {/* Champ pour l'email */}
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      {/* Champ pour le mot de passe avec l'icône eye */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.passwordInput}  // Nouveau style pour le champ mot de passe
          placeholder="Mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!passwordVisible}  // Afficher ou masquer le mot de passe
        />
        <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
          <Ionicons name={passwordVisible ? 'eye-off' : 'eye'} size={24} color="gray" />
        </TouchableOpacity>
      </View>
      
      <Button title="S'inscrire" onPress={handleSignUp} />
      <Button
        title="Déjà inscrit ? Connectez-vous"
        onPress={() => navigation.navigate('Login')}  // Rediriger vers la page de connexion
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',  // Centre les éléments verticalement
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    height: 40,  // Assure une hauteur fixe pour le champ email
    borderWidth: 1,
    borderColor: '#cccccc',
    padding: 10,
    marginBottom: 20,
    borderRadius: 5,
    backgroundColor: '#e0e0e0',
    color: '#333333',
  },
  inputContainer: {
    flexDirection: 'row',  // Permet d'aligner le TextInput et l'icône eye sur la même ligne
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 5,
    backgroundColor: '#e0e0e0',
    paddingHorizontal: 10,
    marginBottom: 20,
    height: 40,  // Contrôle également la hauteur de l'ensemble
  },
  passwordInput: {
    flex: 1,  // Le TextInput prend l'espace disponible
    padding: 10,
    color: '#333333',
    height: 40,  // Assure une hauteur contrôlée pour le champ mot de passe
  },
});
