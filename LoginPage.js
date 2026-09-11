import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons'; // Importer les icônes
import CustomAlert from './components/CustomAlert'; // Assure-toi d'importer le composant CustomAlert
import { supabase } from './supabaseClient';

export default function LoginPage({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

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
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.overlay} keyboardShouldPersistTaps="handled">

        <Image source={require('./assets/logo_phone.png')} style={styles.logo} />
        <Text style={styles.title}>Connexion</Text>

        <View style={styles.card}>
          <View style={[styles.inputContainer, focusedField === 'email' && styles.inputFocused]}>
            <Icon name="mail-outline" size={20} color="#6366f1" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor="#94a3b8"
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          <View style={[styles.inputContainer, focusedField === 'password' && styles.inputFocused]}>
            <Icon name="lock-closed-outline" size={20} color="#6366f1" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Mot de passe"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              placeholderTextColor="#94a3b8"
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
            />
            <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
              <Icon name={passwordVisible ? 'eye-off' : 'eye'} size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} activeOpacity={0.85}>
            <Icon name="log-in-outline" size={20} color="#ffffff" style={styles.icon} />
            <Text style={styles.loginButtonText}>Se connecter</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signUpButton} onPress={() => navigation.navigate('SignUp')} activeOpacity={0.85}>
            <Icon name="person-add-outline" size={20} color="#4f46e5" style={styles.icon} />
            <Text style={styles.signUpButtonText}>Créer un compte</Text>
          </TouchableOpacity>
        </View>

        <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={() => setAlertVisible(false)} />

        <Text style={styles.copyright}>-- Alerte Client Copyright 2024 Avenir Informatique --</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef2ff',
  },
  overlay: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 40,
  },
  logo: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    color: '#0f172a',
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#312e81',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#c7d2fe',
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    marginBottom: 14,
    height: 50,
  },
  inputFocused: {
    borderColor: '#4f46e5',
    backgroundColor: '#ffffff',
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#0f172a',
  },
  loginButton: {
    backgroundColor: '#4f46e5',
    flexDirection: 'row',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 10,
  },
  signUpButton: {
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  signUpButtonText: {
    color: '#4f46e5',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 10,
  },
  copyright: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 24,
  }
});
