import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image } from 'react-native';
import LoginPage from '../LoginPage'; // Importation de la page de connexion

export default function SplashScreenWithLogin() {
  const [showSplash, setShowSplash] = useState(true); // État pour afficher/masquer la SplashScreen
  const fadeAnim = useRef(new Animated.Value(1)).current; // Animation de fondu

  useEffect(() => {
    const timeout = setTimeout(() => {
      // Animation pour faire disparaître la splash screen
      Animated.timing(fadeAnim, {
        toValue: 0, // Opacité 0 = invisible
        duration: 500, // Durée de l'animation
        useNativeDriver: true, 
      }).start(() => setShowSplash(false)); // Masquer la SplashScreen après l'animation
    }, 3000); // Attente de 3 secondes

    return () => clearTimeout(timeout); // Nettoyage du timeout au démontage
  }, []);

  return (
    <View style={styles.container}>
      {/* Affichage conditionnel : SplashScreen ou LoginPage */}
      {showSplash ? (
        <Animated.View style={[styles.splashScreen, { opacity: fadeAnim }]}>
          <Image source={require('../assets/logo_phone.png')} style={styles.image} />
          <Text style={styles.splashText}>Alerte Client</Text>
        </Animated.View>
      ) : (
        <LoginPage /> // Affiche la page de connexion après la SplashScreen
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  splashScreen: {
    ...StyleSheet.absoluteFillObject, // Couvre tout l'écran
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007BFF',
  },
  image: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  splashText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
});
